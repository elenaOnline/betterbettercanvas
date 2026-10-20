// Pure logic behind the popup and settings page: how a layout row reads and
// writes schema keys, when it's visible, enabled or at its default, and how
// search filters rows. No DOM, no chrome.*; unit-tested.
import type { Setting } from '../../core/settings/schema.ts';
import { DARK_ROLES, type Cond, type OptValue, type RowDef, type SectionDef } from './layout.ts';

export type Schema = Readonly<Record<string, Setting>>;
export type Flat = Readonly<Record<string, unknown>>;
export type DarkMode = 'off' | 'on' | 'system' | 'schedule';

const eq = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

// ── "Use dark theme" (palette.useDark: never · always · system · schedule).
// The UI speaks Off · On · Match system · Scheduled; aliases cover v1 values.
export const MODE_KEY = 'palette.useDark';
export const PRESET_KEY = 'palette.dark';
export const ROLES_KEY = 'palette.darkRoles';
const DARK_ALIASES: Record<DarkMode, readonly string[]> = {
  off: ['never', 'off'],
  on: ['always', 'on'],
  system: ['system', 'device'],
  schedule: ['schedule', 'scheduled'],
};

function modeValues(schema: Schema): readonly string[] {
  const s = schema[MODE_KEY];
  return s?.kind === 'enum' ? s.values : [];
}

export function darkMode(values: Flat, schema: Schema): DarkMode {
  void schema;
  const v = values[MODE_KEY];
  for (const [k, aliases] of Object.entries(DARK_ALIASES)) if (aliases.includes(v as string)) return k as DarkMode;
  return 'off';
}

export function darkPatch(mode: DarkMode, schema: Schema, values: Flat = {}): Record<string, unknown> {
  const v = DARK_ALIASES[mode].find(a => modeValues(schema).includes(a));
  if (v === undefined || values[MODE_KEY] === v) return {};
  return { [MODE_KEY]: v };
}

/** Whether dark mode is painting right now, by the settings alone. */
export function darkInEffect(mode: DarkMode, values: Flat, now: Date, systemDark: boolean): boolean {
  if (mode === 'on') return true;
  if (mode === 'system') return systemDark;
  if (mode !== 'schedule') return false;
  const toMin = (t: unknown) => { const [h, m] = String(t ?? '00:00').split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
  const a = toMin(values['palette.start']), b = toMin(values['palette.end']);
  const m = now.getHours() * 60 + now.getMinutes();
  return a <= b ? m >= a && m < b : m >= a || m < b;
}

/** Settings as rows see them: palette.useDark reads as Off/On/System/Scheduled. */
export function view(values: Flat, schema: Schema): Flat {
  return schema[MODE_KEY] ? { ...values, [MODE_KEY]: darkMode(values, schema) } : values;
}

// ── Dark theme roles (palette.darkRoles, one json of role → value) ──
export function roleKeys(schema: Schema): { role: string; label: string; group: string; key: string; field: string }[] {
  if (!schema[ROLES_KEY]) return [];
  return DARK_ROLES.flatMap(g => g.roles.map(r => ({ role: r.role, label: r.label, group: g.title, key: ROLES_KEY, field: r.field })));
}

/** Choosing a preset writes the preset and (seeding Custom) its role values. */
export function presetPatch(preset: string, roles: Readonly<Record<string, string>> | undefined, schema: Schema): Record<string, unknown> {
  const patch: Record<string, unknown> = { [PRESET_KEY]: preset };
  if (roles && schema[ROLES_KEY]) patch[ROLES_KEY] = { ...roles };
  return patch;
}

/** link, nav and accent may be "school" = derived from the school's brand colours. */
export const canBeSchool = (field: string) => ['link', 'nav', 'accent'].includes(field);

/** Editing one role makes the look Custom (roles: the full set to start from). */
export function rolePatch(field: string, value: string, roles: Readonly<Record<string, string>>, schema: Schema): Record<string, unknown> {
  const p = schema[PRESET_KEY];
  return { [ROLES_KEY]: { ...roles, [field]: value === '' && canBeSchool(field) ? 'school' : value }, ...(p?.kind === 'enum' && p.values.includes('custom') ? { [PRESET_KEY]: 'custom' } : {}) };
}

// ── rows ──
export const FONT_DEFAULT = 'Canvas default';

/** Every key a row reads, limited to keys the schema has. */
export function keysOf(row: RowDef, schema: Schema, rows: readonly RowDef[] = []): string[] {
  let ks: string[];
  if (row.control === 'color-wells') ks = roleKeys(schema).map(r => r.key);
  else if (row.control === 'checks' || row.control === 'sliders') ks = (row.options ?? []).map(([v]) => String(v));
  else if (row.control === 'disclosure') ks = rows.filter(r => r.in === row.id).flatMap(r => keysOf(r, schema, rows));
  else ks = [row.key, ...(row.keys ?? []), ...(row.optional ?? []), ...(row.also ?? []).map(a => a.key)].filter((k): k is string => !!k);
  return [...new Set(ks)].filter(k => schema[k]);
}

/** The value a row's control shows. */
export function rowValue(row: RowDef, values: Flat, schema: Schema): unknown {
  if (row.control === 'dark-mode') return darkMode(values, schema);
  if (row.control === 'font') return values[row.key!] ?? FONT_DEFAULT;
  return row.key ? values[row.key] : undefined;
}

/** What to store when the row's control changes to `value`. */
export function rowPatch(row: RowDef, value: unknown, schema: Schema, values: Flat = {}): Record<string, unknown> {
  if (row.control === 'dark-mode') return darkPatch(value as DarkMode, schema, values);
  if (row.control === 'font') return { [row.key!]: value }; // type.family: 'Canvas default' is off
  if (row.control === 'code') {
    const css = String(value);
    return { [row.key!]: css, ...(schema['custom-css.enabled'] ? { 'custom-css.enabled': css.trim() !== '' } : {}) };
  }
  const patch: Record<string, unknown> = row.key ? { [row.key]: value } : {};
  for (const a of row.also ?? []) {
    if (!schema[a.key]) continue;
    const v = a.map && typeof value !== 'boolean' ? a.map[String(value)] : value;
    if (v !== undefined) patch[a.key] = v;
  }
  return patch;
}

export function condHolds(c: Cond, v: Flat): boolean {
  const x = v[c.key];
  if (c.is !== undefined) return x === c.is;
  if (c.not !== undefined) return x !== c.not;
  return !!x;
}

/** Nested rows are dimmed and disabled, never hidden, while their parent is off. */
export function rowEnabled(row: RowDef, v: Flat): boolean {
  return (row.when ?? []).every(c => condHolds(c, v));
}

/** Rendered at all? Rows whose keys this build lacks (pending features, subset builds) aren't. */
export function rowPresent(row: RowDef, schema: Schema, rows: readonly RowDef[] = []): boolean {
  switch (row.control) {
    case 'platform': case 'version': case 'shortcuts': return true;
    case 'disclosure': return rows.some(r => r.in === row.id && rowPresent(r, schema, rows));
    case 'color-wells': return roleKeys(schema).length > 0;
    case 'checks': case 'sliders': return (row.options ?? []).some(([k]) => !!schema[String(k)]);
    default: return !!(row.key ?? row.keys?.[0]) && !!schema[(row.key ?? row.keys![0])!];
  }
}

export function rowIsDefault(row: RowDef, values: Flat, schema: Schema, rows: readonly RowDef[] = []): boolean {
  if (row.noReset) return true;
  return keysOf(row, schema, rows).every(k => eq(values[k], schema[k]!.default));
}

export function resetPatch(keys: readonly string[], schema: Schema): Record<string, unknown> {
  return Object.fromEntries(keys.filter(k => schema[k]).map(k => [k, structuredClone(schema[k]!.default)]));
}

export function rowDesc(row: RowDef, v: Flat): string {
  if (row.descBy && row.key) {
    const d = row.descBy[String(v[row.key])];
    if (d !== undefined) return d;
  }
  return row.desc ?? '';
}

/** Options for a segmented/select row: the layout's labels, limited to what
 *  the schema allows, plus any schema value the layout hasn't labelled. */
export function rowOptions(row: RowDef, schema: Schema): [OptValue, string][] {
  const s = row.key ? schema[row.key] : undefined;
  const opts = (row.options ?? []).map(([v, l]) => [v, l] as [OptValue, string]);
  if (s?.kind === 'enum' && row.control !== 'dark-mode') {
    const kept = opts.filter(([v]) => s.values.includes(v as string));
    for (const v of s.values) if (!kept.some(([o]) => o === v)) kept.push([v, humanize(v)]);
    return kept;
  }
  return opts;
}

export const humanize = (s: string) => s.replace(/[.-]/g, ' ').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^\w/, c => c.toUpperCase());

// ── search ──
export interface Filtered { shown: Set<string>; sections: Set<string>; forcedOpen: Set<string> }

/** Rows matching `query` (label, current description, keywords, section title).
 *  A matching nested row keeps its parent rows in view; a match inside a
 *  collapsed disclosure opens it. */
export function filter(sections: readonly SectionDef[], query: string, descOf: (r: RowDef) => string, present: (r: RowDef) => boolean): Filtered {
  const q = query.trim().toLowerCase();
  const shown = new Set<string>(), secs = new Set<string>(), forcedOpen = new Set<string>();
  for (const s of sections) {
    const rows = s.rows.filter(present);
    const secHit = !!q && s.title.toLowerCase().includes(q);
    const match = rows.map(r => !q || secHit || [r.label, descOf(r), r.keywords].filter(Boolean).join(' ').toLowerCase().includes(q));
    rows.forEach((r, i) => {
      if (!match[i] || !r.depth) return;
      for (let j = i - 1; j >= 0; j--) {
        if ((rows[j]!.depth ?? 0) < r.depth && !rows[j]!.in) { match[j] = true; if (!rows[j]!.depth) break; }
      }
    });
    rows.forEach((r, i) => {
      if (!match[i]) return;
      shown.add(r.id);
      if (q && r.in) { forcedOpen.add(r.in); shown.add(r.in); }
    });
    if (rows.some(r => shown.has(r.id))) secs.add(s.id);
  }
  return { shown, sections: secs, forcedOpen };
}

// ── first run: "Where is your school's Canvas?" ──
/** Any URL, or a bare host pasted from the address bar → its https origin. */
export function normaliseOrigin(input: string): string {
  const raw = input.trim().replace(/^[a-z]+:\/\//i, m => m.toLowerCase());
  if (!raw) throw new Error('Type your school’s Canvas address, for example canvas.yourschool.edu.');
  let url: URL;
  try { url = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`); } catch { throw new Error('That doesn’t look like a web address. Try canvas.yourschool.edu.'); }
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || /[*\s]/.test(host)) throw new Error('That doesn’t look like a web address. Try canvas.yourschool.edu.');
  return `https://${host}`;
}

/** Where "All settings…" opens for the active page (settings.md, Deep links). */
export function sectionForPage(page: string | null | undefined): string {
  if (page === 'dashboard') return 'dashboard';
  if (page === 'course-grades') return 'grades';
  return 'appearance';
}

/** Which layout row a deep link (#<feature-id> or #<row-id>) lands on. */
export function deepLinkRow(target: string, rows: readonly RowDef[]): RowDef | null {
  return rows.find(r => r.id === target)
    ?? rows.find(r => r.key === `${target}.enabled`)
    ?? rows.find(r => [r.key, ...(r.keys ?? []), ...(r.options ?? []).map(([v]) => String(v))].some(k => typeof k === 'string' && k.startsWith(`${target}.`)))
    ?? null;
}
