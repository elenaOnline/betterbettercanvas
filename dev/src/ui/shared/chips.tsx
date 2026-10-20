// Dark-mode style chips: a 64×40 Canvas page painted in each preset. Shared
// by the popup and the settings page; kept small (the popup bundles it).
import { PRESETS, presetRoles, ROLES, type Preset } from '../../features/palette/palettes.ts';
import { SCHOOL, isSchool } from './contrast.ts';
import { RadioGroup } from './controls.tsx';
import { PRESET_KEY, ROLES_KEY, presetPatch, roleKeys } from './model.ts';
import { apply, schema, values } from './state.ts';

export const isPreset = (p: string): p is Preset => (PRESETS as readonly string[]).includes(p);
/** A preset's colours by role name (bg, surface, text, link, nav…), '' = school. */
export const presetColors = (p: Preset): Record<string, string> =>
  Object.fromEntries(Object.entries(presetRoles(p)).map(([k, v]) => [ROLES[k as keyof typeof ROLES], v]));

export interface ChipIds { labelledBy?: string; disabled?: boolean }

function chipVars(p: Record<string, string>) {
  const c = { ...p };
  for (const [r, x] of Object.entries(SCHOOL)) if (isSchool(c[r])) c[r] = x;
  return Object.fromEntries(['bg', 'surface', 'text', 'link', 'nav'].map(r => [`--c-${r}`, c[r]])) as Record<string, string>;
}
export function currentRoles(): Record<string, string> {
  const v = values.value;
  const p = String(v[PRESET_KEY] ?? 'custom');
  // Roles are only read while the preset is Custom; otherwise show the preset's.
  if (isPreset(p)) return presetColors(p);
  const stored = { ...presetRoles('dark'), ...((v[ROLES_KEY] as Record<string, string> | null) ?? {}) } as Record<string, string>;
  return Object.fromEntries(roleKeys(schema).map(r => [r.role, String(stored[r.field] ?? '')]));
}
export function StyleChips(ids: ChipIds) {
  const s = schema[PRESET_KEY];
  if (s?.kind !== 'enum') return null;
  const cur = String(values.value[PRESET_KEY]);
  const opts = s.values.filter(p => isPreset(p) || (p === 'custom' && cur === 'custom')).map(p => [p, p[0]!.toUpperCase() + p.slice(1)] as const);
  return <RadioGroup class="chips" {...ids} value={cur} options={opts}
    onChange={p => void apply(presetPatch(p, isPreset(p) ? presetRoles(p) : undefined, schema))}
    render={(p, label) => <>
      <span class="mini" aria-hidden="true" style={chipVars(isPreset(p) ? presetColors(p) : currentRoles())}><span class="card"><i /><i /></span></span>
      <span class="name">{label}</span>
    </>} />;
}

