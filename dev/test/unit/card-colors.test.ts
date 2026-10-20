import { describe, expect, it } from 'vitest';
import { PALETTES, colorsFor, contrastOnWhite, gradient, isColorRequest, makeColorRequest, normHex } from '../../src/features/card-colors/palettes.ts';

describe('card colors', () => {
  it('b²c palettes keep ≥ 3:1 on white (course names are drawn in them)', () => {
    for (const [name, list] of Object.entries(PALETTES)) {
      if (name === 'Canvas') continue; // Canvas's own presets, as shipped
      for (const c of list) expect(contrastOnWhite(c), `${name} ${c}`).toBeGreaterThanOrEqual(3);
    }
  });
  it('cycles a palette across cards', () => {
    const p = PALETTES.Forest!;
    const out = colorsFor({ id: 'x', mode: 'palette', palette: 'Forest' }, p.length + 2)!;
    expect(out[0]).toBe(p[0]!.toLowerCase());
    expect(out[p.length]).toBe(p[0]!.toLowerCase());
    expect(out[p.length + 1]).toBe(p[1]!.toLowerCase());
  });
  it('single colour, normalised', () => {
    expect(colorsFor({ id: 'x', mode: 'single', color: 'ABC' }, 3)).toEqual(['#aabbcc', '#aabbcc', '#aabbcc']);
    expect(colorsFor({ id: 'x', mode: 'single', color: 'nope' }, 3)).toBeNull();
    expect(normHex('#123456')).toBe('#123456');
  });
  it('gradient hits both ends and steps between them', () => {
    const g = gradient('#ff0000', '#0000ff', 5);
    expect(g).toHaveLength(5);
    expect(g[0]).toBe('#ff0000');
    expect(g[4]).toBe('#0000ff');
    expect(new Set(g).size).toBe(5);
    expect(gradient('#123456', '#654321', 1)).toEqual(['#123456']);
  });
  it('validates requests', () => {
    expect(isColorRequest(null)).toBe(true);
    expect(isColorRequest(makeColorRequest({ mode: 'revert' }))).toBe(true);
    expect(isColorRequest({ id: 1, mode: 'palette' })).toBe(false);
    expect(makeColorRequest({ mode: 'single', color: '#fff' }).id).not.toBe(makeColorRequest({ mode: 'single', color: '#fff' }).id);
  });
});
