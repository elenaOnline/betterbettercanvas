// v1 → v2 for type: custom-font.{enabled,family,localFamily} and
// shape.density become type.{family,localFamily,density}. Pure; run once by
// the service worker (core/settings/migrations.ts '2026-10-20-type').
import type { Flat } from '../../core/settings/store.ts';
import { fonts } from './fonts.ts';

export function migrateType(old: Flat): { set: Flat; remove: string[] } {
  const remove = Object.keys(old).filter(k => k.startsWith('custom-font.') || k === 'shape.density');
  if (!remove.length) return { set: {}, remove: [] };
  const set: Flat = {};
  const enabled = old['custom-font.enabled'];
  const family = old['custom-font.family'];
  if (enabled !== undefined || family !== undefined) {
    // v1 had a switch and a menu; v2 has the menu, where 'Canvas default' is off.
    set['type.family'] = enabled === true && typeof family === 'string' && (fonts as readonly string[]).includes(family) ? family : 'Canvas default';
  }
  if (typeof old['custom-font.localFamily'] === 'string') set['type.localFamily'] = old['custom-font.localFamily'];
  if (typeof old['custom-font.scale'] === 'number') set['type.scale'] = old['custom-font.scale'];
  if (typeof old['shape.density'] === 'string') set['type.density'] = old['shape.density'];
  return { set, remove };
}
