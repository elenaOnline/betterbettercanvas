// GPA scale presets for the settings rows and the Studio: which preset a stored
// scale (and Honors/AP weights) is, and the keys a preset writes. A preset
// with weights (High school 4.0) writes `scale` and `weights` together, so it
// is one change and one Undo step.
import { hostDefaults, SCALE_PRESETS, type ScaleRow } from '../../features/gpa-calculator/gpa.ts';

export const SCALE_KEY = 'gpa-calculator.scale';
export const WEIGHTS_KEY = 'gpa-calculator.weights';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 'auto' (the school's), a SCALE_PRESETS id, or 'custom'. */
export function scalePreset(scale: ScaleRow[] | null | undefined, weights: unknown): string {
  if (!scale) return 'auto';
  const w = weights ?? null;
  const hit = Object.entries(SCALE_PRESETS).find(([, p]) => same(p.scale, scale) && same(p.weights ?? null, w));
  return hit ? hit[0] : 'custom';
}

/** The setting values a preset choice writes (`hasWeights`: the build has the weights key). */
export function scalePresetPatch(name: string, current: ScaleRow[] | null, hasWeights: boolean): Record<string, unknown> {
  const p = SCALE_PRESETS[name];
  const scale = name === 'auto' ? null : p ? structuredClone(p.scale) : structuredClone(current ?? hostDefaults('').scale);
  const out: Record<string, unknown> = { [SCALE_KEY]: scale };
  if (hasWeights && name !== 'custom') out[WEIGHTS_KEY] = p?.weights ? { ...p.weights } : null;
  return out;
}

export const SCALE_OPTIONS = (custom: boolean): [string, string][] => [
  ['auto', 'Automatic: your school’s scale'],
  ...Object.entries(SCALE_PRESETS).map(([k, p]) => [k, p.label] as [string, string]),
  ...(custom ? [['custom', 'Your own table'] as [string, string]] : []),
];
