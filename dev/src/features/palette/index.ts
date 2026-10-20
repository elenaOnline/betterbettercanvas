// palette: the palette engine (v2, design/spec/rice.md). Any theme, light or
// dark, restyles Canvas through one machinery: brand-variable remap and hand
// rules (Design's design/spec/surfaces/palette.css), the generated literal
// layer (literals.gen.css), the InstUI layer (instui-main.ts) and the
// inline-colour pass (run.ts).
//
// ── Setting keys (final, 2026-10-20). The theme-file lane writes these. ──
//   palette.useDark      never | always | system | schedule   "Use dark theme" (default system; personal)
//   palette.start / .end "HH:MM", for schedule                 (20:00 / 08:00; personal)
//   palette.light        canvas | paper | sepia | contrast | custom   Light theme slot (default canvas
//                        = Canvas's own colours: the engine paints nothing while light)
//   palette.dark         dark | gray | black | warm | contrast | custom   Dark theme slot (default dark)
//   palette.lightRoles   json: the 14 roles of a custom light theme, or null
//   palette.darkRoles    json: the 14 roles of a custom dark theme, or null
//                        roles: bg surface surfaceRaised border text textSecondary textTertiary
//                        link accent nav navText success warning danger. link/accent/nav may be
//                        "school"; success/warning/danger may be absent (the scheme's defaults).
//                        Missing roles come from Paper (light) or Dark (dark).
//   palette.navStyle     school | theme   personal: nav in the school's colour or the theme's surface
//   palette.dimImages    bool             personal
//   palette.documents    light | dimmed | dark   DocViewer (canvadocs) pages while dark (personal)
// Theme file → keys: palette.light → light='custom' + lightRoles; palette.dark → dark='custom' +
// darkRoles. A bundled name (e.g. "sepia") may be written to light/dark directly.
// Migration from v1 dark-mode.* keys: migrate.ts.
//
// ── Pre-paint attributes (boot.js, from the mirror) ──
//   data-b2c-theme="on"         the engine is painting (gate for every palette rule)
//   data-b2c-scheme="light|dark" scheme of the theme in effect (color-scheme follows)
//   data-b2c-slot="l|d"         which slot's vars feed --b2c-dm-*
//   data-b2c-dark="on"          v1 alias: a DARK scheme is painting (tokens.css widget vars, older lanes)
//   data-b2c-nav-style="theme", data-b2c-dim-images   (Design's palette.css contract)
// Role vars: --b2c-dm-* for whichever scheme is active (Design's contract). The
// mirror sets both slots (--b2c-pl-d-*, --b2c-pl-l-*) because Match system /
// Scheduled resolve pre-paint by attribute; style.css maps the slot in effect
// onto --b2c-dm-*.
// Runtime (lazy chunk): run.ts.

import { defineFeature } from '../../core/feature.ts';
import type { CondAttr, MirrorPart } from '../../core/feature.ts';
import { bool, json, oneOf, time } from '../../core/settings/schema.ts';
import { DARK_ATTR, SCHEME_ATTR, SLOT_ATTR, THEME_ATTR } from './attrs.ts';
import {
  DARK_PRESETS, LIGHT_PRESETS, ROLES, SCHOOL, SLOT_BASE, aaaFallback, complete, isRoles, lightPresetRoles, polarity, presetRoles, slotVars,
  type DarkPreset, type LightPreset, type Roles,
} from './palettes.ts';

export { MSG, THEME_ATTR, SCHEME_ATTR, SLOT_ATTR } from './attrs.ts';

/** A "school" fallback in the mirror points at the per-scheme derivation in style.css (school.ts's rule). */
const DERIVED_CSS: Record<'light' | 'dark', Partial<Record<keyof Roles, string>>> = {
  dark: { link: 'var(--b2c-school-link)', accent: 'var(--b2c-school-accent)', nav: 'var(--b2c-school-nav)' },
  light: { link: 'var(--b2c-school-link)', accent: 'var(--b2c-school-accent)', nav: 'var(--b2c-school-nav)' },
};

export interface PaletteValues {
  useDark: string; start: string; end: string; light: string; dark: string;
  lightRoles: Partial<Roles> | null; darkRoles: Partial<Roles> | null;
  navStyle: string; dimImages: boolean; documents?: string;
}

/** The Dark theme slot's roles. */
export function darkSlot(s: Pick<PaletteValues, 'dark' | 'darkRoles'>): Roles {
  if ((DARK_PRESETS as readonly string[]).includes(s.dark)) return presetRoles(s.dark as DarkPreset);
  return complete(s.darkRoles, SLOT_BASE.dark.roles());
}

/** The Light theme slot's roles, or null for Canvas (the identity: nothing applies). */
export function lightSlot(s: Pick<PaletteValues, 'light' | 'lightRoles'>): Roles | null {
  if ((LIGHT_PRESETS as readonly string[]).includes(s.light)) return lightPresetRoles(s.light as LightPreset);
  if (s.light !== 'custom') return null;
  return complete(s.lightRoles, SLOT_BASE.light.roles());
}

export function paletteMirror(s: PaletteValues): MirrorPart {
  const d = darkSlot(s);
  const l = lightSlot(s);
  const on = (slot: 'l' | 'd', r: Roles): Record<string, string> => {
    const scheme = polarity(r);
    // v1 alias: "a dark scheme is painting" (tokens.css widget vars, older lanes).
    return { [THEME_ATTR]: 'on', [SCHEME_ATTR]: scheme, [SLOT_ATTR]: slot, ...(scheme === 'dark' ? { [DARK_ATTR]: 'on' } : {}) };
  };
  const darkOn = on('d', d);
  if (s.useDark === 'never' && !l) return {};

  const attrs: Record<string, string> = {};
  if (s.navStyle === 'theme') attrs['data-b2c-nav-style'] = 'theme';
  if (s.dimImages) attrs['data-b2c-dim-images'] = '';
  // High Contrast fallbacks (aaaFallback), as --b2c-pl-<slot>-hc-*; a
  // "school" fallback is written as the CSS that derives it for that scheme.
  const hc = (slot: 'l' | 'd', r: Roles) => {
    const scheme = polarity(r);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(aaaFallback(r, scheme)) as [keyof Roles, string][]) {
      if (!v) continue;
      out[`--b2c-pl-${slot}-hc-${ROLES[k]}`] = v === SCHOOL ? DERIVED_CSS[scheme][k] ?? '' : v;
    }
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
  };
  const vars = { ...slotVars('d', d), ...hc('d', d), ...(l ? { ...slotVars('l', l), ...hc('l', l) } : {}) };
  const cond: CondAttr[] = [];
  if (s.useDark === 'always') Object.assign(attrs, darkOn);
  else {
    if (l) Object.assign(attrs, on('l', l)); // the Light slot while dark isn't in effect
    const when = s.useDark === 'system' ? { media: '(prefers-color-scheme: dark)' } : s.useDark === 'schedule' ? { start: s.start, end: s.end } : null;
    if (when) for (const [attr, value] of Object.entries(darkOn)) cond.push({ attr, value, when });
  }
  return { attrs, vars, cond };
}

export default defineFeature({
  id: 'palette',
  settings: {
    useDark: oneOf(['never', 'always', 'system', 'schedule'], 'system'),
    start: time('20:00'),
    end: time('08:00'),
    light: oneOf(['canvas', ...LIGHT_PRESETS, 'custom'], 'canvas'),
    dark: oneOf([...DARK_PRESETS, 'custom'], 'dark'),
    lightRoles: json<Partial<Roles> | null>(null, { check: isRoles, area: 'sync' }),
    darkRoles: json<Partial<Roles> | null>(null, { check: isRoles, area: 'sync' }),
    navStyle: oneOf(['school', 'theme'], 'school'),
    dimImages: bool(false),
    documents: oneOf(['light', 'dimmed', 'dark'], 'light'),
  },
  pages: 'all',
  // Colours only: allowed on quiz-taking pages unless core.quizSafe = 'nothing'.
  quizSafe: true,
  anchors: {
    body: 'body',
    globalNav: '#header, .ic-app-header',
    userContent: '.user_content, .show-content',
    rceFrame: 'iframe.tox-edit-area__iframe, iframe[id$="_ifr"]',
    rceToolbar: '.tox .tox-toolbar, .tox .tox-toolbar__primary',
  },
  mirror: s => paletteMirror(s as PaletteValues),
});
