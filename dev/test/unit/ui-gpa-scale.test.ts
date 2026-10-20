// ui lane: GPA scale presets write scale and Honors/AP weights together.
import { describe, expect, it } from 'vitest';
import { SCALE_PRESETS } from '../../src/features/gpa-calculator/gpa.ts';
import { scalePreset, scalePresetPatch, SCALE_KEY, WEIGHTS_KEY } from '../../src/ui/shared/gpa-scale.ts';

describe.skipIf(!SCALE_PRESETS['high-school'])('GPA scale presets', () => {
  it('High school writes its scale and weights in one patch', () => {
    const p = scalePresetPatch('high-school', null, true);
    expect(p[WEIGHTS_KEY]).toEqual({ honors: 0.5, ap: 1 });
    expect(p[SCALE_KEY]).toEqual(SCALE_PRESETS['high-school']!.scale);
  });
  it('a college preset clears the weights; Automatic stores null', () => {
    expect(scalePresetPatch('thirds', null, true)[WEIGHTS_KEY]).toBeNull();
    expect(scalePresetPatch('auto', null, true)).toEqual({ [SCALE_KEY]: null, [WEIGHTS_KEY]: null });
    expect(scalePresetPatch('thirds', null, false)).not.toHaveProperty(WEIGHTS_KEY);
  });
  it('weights tell apart two presets with the same letters', () => {
    const t = SCALE_PRESETS['high-school']!.scale;
    expect(scalePreset(t, { honors: 0.5, ap: 1 })).toBe('high-school');
    expect(scalePreset(t, null)).toBe('whole');
    expect(scalePreset(null, null)).toBe('auto');
    expect(scalePreset([{ letter: 'A', points: 9, min: 1 }], null)).toBe('custom');
  });
});
