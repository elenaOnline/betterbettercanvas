// v1 → v2 settings migration for the palette engine (run once by the service
// worker's migrations). Pure: takes the stored flat settings, returns the keys
// to write and the keys to remove.
import type { Flat } from '../../core/settings/store.ts';
import { DARK_PRESETS, ROLE_KEYS } from './palettes.ts';

const V1_ROLES = ['bg', 'surface', 'surfaceRaised', 'border', 'text', 'textSecondary', 'textTertiary', 'link', 'nav', 'navText', 'accent'];

export function migrateV1(old: Flat): { set: Flat; remove: string[] } {
  const v1 = Object.keys(old).filter(k => k.startsWith('dark-mode.'));
  if (!v1.length) return { set: {}, remove: [] };
  const set: Flat = {};
  const g = (k: string) => old[`dark-mode.${k}`];
  const mode = g('mode');
  if (typeof mode === 'string') set['palette.useDark'] = ({ off: 'never', on: 'always', system: 'system', schedule: 'schedule' } as Record<string, string>)[mode] ?? 'system';
  for (const k of ['start', 'end', 'navStyle', 'dimImages']) if (g(k) !== undefined) set[`palette.${k}`] = g(k);
  const preset = g('preset');
  if (typeof preset === 'string' && (DARK_PRESETS as readonly string[]).includes(preset)) set['palette.dark'] = preset;
  else if (preset === 'custom') {
    const roles: Record<string, string> = {};
    for (const k of V1_ROLES) {
      const v = g(k);
      if (typeof v !== 'string') continue;
      roles[k] = v === '' && ['link', 'nav', 'accent'].includes(k) ? 'school' : v;
    }
    set['palette.dark'] = 'custom';
    set['palette.darkRoles'] = Object.fromEntries(Object.entries(roles).filter(([k]) => (ROLE_KEYS as readonly string[]).includes(k)));
  }
  // v1.5 (lane WIP, never shipped): light / lightCustom
  const light = g('light');
  if (typeof light === 'string') set['palette.light'] = light;
  if (g('lightCustom') && typeof g('lightCustom') === 'object') set['palette.lightRoles'] = g('lightCustom');
  return { set, remove: v1 };
}
