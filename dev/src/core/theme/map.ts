// Theme fields ↔ setting keys: the one table. A new key is a one-line row.
// Palette slots, course colours and CSS need more than a key per field, so
// plan.ts and export.ts handle those three by name (see the bottom of this
// file for their keys).
//
// A row whose key isn't in the running schema is skipped with a note, so a
// theme naming something this build can't do yet still applies the rest.

import { fonts } from '../../features/type/fonts.ts';
import type { Theme } from './format.ts';

export type Flat = Record<string, unknown>;
/** Export parts (the Studio's checkboxes). */
export const PARTS = ['palette', 'shape', 'type', 'layout', 'views', 'css'] as const;
export type Part = (typeof PARTS)[number];

export interface Row {
  /** Dotted path in the theme file. */
  path: string;
  part: Part;
  /** Setting keys written; the first must exist in the schema for the row to apply. */
  keys: readonly string[];
  /** Theme value → setting values. */
  write(v: unknown): Flat;
  /** Settings → theme value (undefined: leave it out). */
  read(s: Flat): unknown;
}

/** One key, optionally with a value transform each way. */
function row(path: string, part: Part, key: string, to: (v: any) => unknown = v => v, from: (v: any) => unknown = v => v): Row {
  return { path, part, keys: [key], write: v => ({ [key]: to(v) }), read: s => from(s[key]) };
}

const FONT_ENUM: readonly string[] = fonts;

export const MAP: readonly Row[] = [
  {
    path: 'type.family', part: 'type', keys: ['type.family', 'type.localFamily'],
    write: v => {
      const name = String(v);
      if (name === 'Canvas default') return { 'type.family': 'Canvas default' };
      const known = FONT_ENUM.find(f => f.toLowerCase() === name.toLowerCase() && f !== 'Installed');
      return known ? { 'type.family': known } : { 'type.family': 'Installed', 'type.localFamily': name.slice(0, 100) };
    },
    read: s => (s['type.family'] === 'Installed' ? (String(s['type.localFamily'] ?? '').trim() || undefined) : s['type.family']),
  },
  row('type.scale', 'type', 'type.scale'),
  row('density', 'type', 'type.density'),
  row('shape.corner', 'shape', 'shape.corner'),
  row('shape.border', 'shape', 'shape.border', v => String(v), v => (v === undefined ? undefined : Number(v))),
  row('cards.style', 'layout', 'gradient-cards.enabled', v => v === 'gradient', v => (v === undefined ? undefined : v ? 'gradient' : 'flat')),
  row('cards.height', 'layout', 'condensed-cards.enabled', v => v === 'condensed', v => (v === undefined ? undefined : v ? 'condensed' : 'standard')),
  row('cards.overlay', 'layout', 'card-overlay.overlay'),
  row('cards.width', 'layout', 'card-customization.cardWidth'),
  row('cards.gap', 'layout', 'card-customization.cardGap'),
  row('layout.width', 'layout', 'full-width.width'),
  row('layout.panel', 'layout', 'core.panelSide'), // lands with the Studio work
  row('layout.sections', 'layout', 'core.panelSections'), // lands with the Studio work
  row('views.todo', 'views', 'better-todo.view'),
  row('views.cards', 'views', 'card-assignments.view'),
];

/** Keys handled outside the table. */
export const KEYS = {
  light: 'palette.light', lightRoles: 'palette.lightRoles',
  dark: 'palette.dark', darkRoles: 'palette.darkRoles',
  useDark: 'palette.useDark',
  colorRequest: 'card-colors.request', colorApplied: 'card-colors.applied',
  css: 'custom-css.css', cssEnabled: 'custom-css.enabled',
} as const;

export function getPath(t: Theme, path: string): unknown {
  let cur: unknown = t;
  for (const k of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

export function setPath(t: Theme, path: string, v: unknown): void {
  const ks = path.split('.');
  let cur = t as Record<string, unknown>;
  for (const k of ks.slice(0, -1)) {
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[ks[ks.length - 1]!] = v;
}
