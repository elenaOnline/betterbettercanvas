import { coerce, type Setting } from '../../core/settings/schema.ts';
import type { Flat, Store } from '../../core/settings/store.ts';

export interface ImportPlan { values: Flat; unknown: string[]; invalid: string[]; unsupported: string[] }
export type Schema = Record<string, Setting>;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const record = (v: unknown): v is Flat => !!v && typeof v === 'object' && !Array.isArray(v);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function parseObject(text: string): Flat {
  if (new Blob([text]).size > MAX_IMPORT_BYTES) throw new Error('The settings file is too large (maximum 10 MB).');
  const raw: unknown = JSON.parse(text);
  if (!record(raw)) throw new Error('Settings must be a JSON object.');
  return raw;
}

export function validateSettings(raw: Flat, schema: Schema): ImportPlan {
  const plan: ImportPlan = { values: {}, unknown: [], invalid: [], unsupported: [] };
  for (const [key, value] of Object.entries(raw)) {
    if (!Object.hasOwn(schema, key)) { plan.unknown.push(key); continue; }
    try {
      if (!equal(value, coerce(schema[key]!, value))) { plan.invalid.push(key); continue; }
      Object.defineProperty(plan.values, key, { value, enumerable: true, configurable: true, writable: true });
    } catch { plan.invalid.push(key); }
  }
  return plan;
}

export function importSettings(text: string, schema: Schema): ImportPlan {
  const raw = parseObject(text);
  if (raw.format !== 'b2c-settings' || raw.version !== 1 || !record(raw.settings)) {
    throw new Error('Choose a b²c settings backup (format b2c-settings, version 1).');
  }
  return validateSettings(raw.settings, schema);
}

export function exportSettings(values: Flat, schema: Schema): string {
  const all = Object.fromEntries(Object.entries(schema).map(([key, setting]) => [key, coerce(setting, values[key])]));
  return JSON.stringify({ format: 'b2c-settings', version: 1, settings: all }, null, 2);
}

/** Behaviour-based mappings from research/features.md §0. Target schemas are
 * checked at import time; absent features are reported, never silently lost. */
export const BC_KEYS: Record<string, { target: string; invert?: boolean; map?: (v: unknown) => unknown }> = {
  auto_dark_start: { target: 'palette.start' }, auto_dark_end: { target: 'palette.end' },
  remlogo: { target: 'hide-logo.enabled' }, tab_icons: { target: 'tab-icons.enabled' },
  assignments_due: { target: 'card-assignments.enabled' }, num_assignments: { target: 'card-assignments.count' },
  card_overdues: { target: 'card-assignments.includeOverdue' },
  dashboard_grades: { target: 'card-grades.enabled' }, grade_hover: { target: 'card-grades.hoverOnly' },
  gradient_cards: { target: 'gradient-cards.enabled' }, condensed_cards: { target: 'condensed-cards.enabled' },
  disable_color_overlay: { target: 'card-overlay.overlay', invert: true },
  full_width: { target: 'full-width.width', map: v => (v === true ? 'full' : 'standard') }, dashboard_notes: { target: 'dashboard-notes.enabled' },
  dashboard_notes_text: { target: 'dashboard-notes.text' }, hide_feedback: { target: 'hide-recent-feedback.enabled' },
  better_todo: { target: 'better-todo.enabled' }, num_todo_items: { target: 'better-todo.count' },
  hide_completed: { target: 'better-todo.hideCompleted' }, todo_hr24: { target: 'better-todo.hour24' },
  todo_overdues: { target: 'better-todo.includeOverdue' }, todo_colors: { target: 'better-todo.courseColors' },
  hover_preview: { target: 'hover-preview.enabled' }, gpa_calc: { target: 'gpa-calculator.enabled' },
  gpa_calc_cumulative: { target: 'gpa-calculator.includePrevious' },
  custom_styles: { target: 'custom-css.css' },
};

// Complex records need a feature-owner adapter; importing them as opaque JSON
// could overwrite the owner's shape or accidentally write back to Canvas.
export const BC_UNSUPPORTED: Record<string, string> = {
  custom_domain: 'Add these addresses under Sites to grant permission.',
  assignment_date_format: 'Date formatting needs a shared settings mapping.',
  relative_dues: 'Date formatting needs a shared settings mapping.',
  assignment_states: 'Item state records need a feature-owner adapter.',
  custom_cards: 'Card records need a feature-owner adapter.', custom_cards_2: 'Card records need a feature-owner adapter.',
  custom_cards_3: 'Card records need a feature-owner adapter.', card_limit: 'Card visibility needs a feature-owner adapter.',
  card_method_dashboard: 'Legacy implementation option.', card_method_date: 'Legacy implementation option.',
  saved_themes: 'Theme records need a feature-owner adapter.', previous_theme: 'Legacy undo snapshot.', previous_colors: 'Legacy undo snapshot.',
  gpa_calc_bounds: 'Grade scale records need a feature-owner adapter.', gpa_calc_prepend: 'Legacy formatting option.',
  gpa_calc_weighted: 'Credit records need a feature-owner adapter.', cumulative_gpa: 'Previous GPA records need a feature-owner adapter.',
  remind: 'Reminders are shelved for v1.', reminders: 'Reminders are shelved for v1.',
  reminder_count: 'Reminders are shelved for v1.', multi_remind: 'Reminders are shelved for v1.',
  dark_mode_fix: 'The legacy dark mode fixer is not carried over.',
  show_updates: 'The legacy update banner is not carried over.', update_msg: 'The legacy update banner is not carried over.',
  errors: 'Legacy diagnostics are not imported.', new_install: 'Installation state is not imported.',
};

/** bc dark_preset slot → b²c palette role (palette.darkRoles keys). */
export const BC_DARK_ROLES: [string, string][] = [
  ['background-0', 'bg'], ['background-1', 'surface'], ['background-2', 'surfaceRaised'], ['borders', 'border'],
  ['text-0', 'text'], ['text-1', 'textSecondary'], ['text-2', 'textTertiary'], ['links', 'link'],
  ['sidebar', 'nav'], ['sidebar-text', 'navText'],
];

export function importBetterCanvas(text: string, schema: Schema): ImportPlan {
  const raw = parseObject(text);
  const values: Flat = {};
  const unsupported: string[] = [], unknown: string[] = [], invalid: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'dark_mode' || key === 'auto_dark' || key === 'device_dark') {
      if (typeof value !== 'boolean') invalid.push(key);
      continue;
    }
    if (key === 'dark_preset' || key === 'custom_font') continue; // handled below
    const mapping = Object.hasOwn(BC_KEYS, key) ? BC_KEYS[key] : undefined;
    if (mapping) {
      if (!Object.hasOwn(schema, mapping.target)) { unsupported.push(`${key}: ${mapping.target} is unavailable in this build.`); continue; }
      if (mapping.invert && typeof value !== 'boolean') { invalid.push(key); continue; }
      values[mapping.target] = mapping.invert ? !value : mapping.map ? mapping.map(value) : value;
      if (key === 'custom_styles' && typeof value === 'string') {
        const enabled = mapping.target.split('.')[0] + '.enabled';
        if (Object.hasOwn(schema, enabled)) values[enabled] = value.trim().length > 0;
      }
    } else if (Object.hasOwn(BC_UNSUPPORTED, key)) unsupported.push(`${key}: ${BC_UNSUPPORTED[key]}`);
    else if (key.startsWith('custom_assignments')) unsupported.push(`${key}: Custom item records need a feature-owner adapter.`);
    else unknown.push(key);
  }
  // bc's three dark switches become the "Use dark theme" rule (rice.md).
  if (['dark_mode', 'auto_dark', 'device_dark'].some(k => typeof raw[k] === 'boolean')) {
    if (Object.hasOwn(schema, 'palette.useDark')) {
      values['palette.useDark'] = raw.device_dark === true ? 'system' : raw.auto_dark === true ? 'schedule' : raw.dark_mode === true ? 'always' : 'never';
    } else unsupported.push('dark_mode/auto_dark/device_dark: palette.useDark is unavailable in this build.');
  }
  // bc's custom_font {link, family} (a Google font). b²c never loads fonts from
  // Google: a bundled match is used as-is, anything else becomes "a font on
  // this computer" with a note.
  if (raw.custom_font && typeof raw.custom_font === 'object' && Object.hasOwn(schema, 'type.family')) {
    const family = String((raw.custom_font as Record<string, unknown>).family ?? '').split(',')[0]!.replace(/['"]/g, '').trim();
    if (family) {
      const bundled = ['Inter', 'Atkinson Hyperlegible', 'Source Serif 4', 'JetBrains Mono'].find(f => f.toLowerCase() === family.toLowerCase());
      values['type.family'] = bundled ?? 'Installed';
      if (!bundled) {
        values['type.localFamily'] = family;
        unsupported.push(`custom_font: "${family}" came from Google Fonts, which b²c doesn't use. It will apply if installed on this computer; otherwise pick one of b²c's fonts.`);
      }
    }
  }
  // bc's dark palette slots → the dark slot as a custom palette (palette.darkRoles).
  if (raw.dark_preset && typeof raw.dark_preset === 'object') {
    const p = raw.dark_preset as Record<string, unknown>;
    const roles = Object.hasOwn(schema, 'palette.darkRoles') ? BC_DARK_ROLES.filter(([slot]) => typeof p[slot] === 'string') : [];
    if (roles.length) {
      values['palette.darkRoles'] = Object.fromEntries(roles.map(([slot, role]) => [role, String(p[slot]).toLowerCase()]));
      if (Object.hasOwn(schema, 'palette.dark')) values['palette.dark'] = 'custom';
    } else unsupported.push('dark_preset: palette colour roles are unavailable in this build.');
  }
  const plan = validateSettings(values, schema);
  return { values: plan.values, unknown: [...unknown, ...plan.unknown], invalid: [...invalid, ...plan.invalid], unsupported };
}

export function featureKeys(schema: Schema, feature?: string): string[] {
  return Object.keys(schema).filter(key => feature === undefined || key.startsWith(feature + '.'));
}

// Moved to core (src/core/settings/undo.ts); re-exported for existing importers.
export { changeWithUndo, SATELLITES } from '../../core/settings/undo.ts';
