// ui lane: the Studio's model ↔ settings (src/ui/studio/bridge.ts).
import { describe, expect, it } from 'vitest';
import { schema } from '../../src/core/registry.ts';
import { preset } from '../../src/core/theme/index.ts';
import { applyRice, exportRice, fFrom, fromSettings, riceSnap, savedFrom, savedTo, scaleName, settingsFor, toPatch, toRice, type State } from '../../src/ui/studio/bridge.ts';

const defaults = () => Object.fromEntries(Object.entries(schema).map(([k, s]) => [k, structuredClone(s.default)])) as Record<string, unknown>;
const hasPalette = 'palette.dark' in schema;

describe.skipIf(!hasPalette)('Studio bridge', () => {
  it('reads defaults and writes nothing back (round trip)', () => {
    const settings = defaults();
    const s = fromSettings(settings);
    expect(s.pal.light).toBeNull(); // Canvas: untouched
    expect(s.pal.dark.bg).toBe('#18212d');
    expect(toPatch(s, settings)).toEqual({});
  });
  it('an edit becomes exactly the keys it changes', () => {
    const settings = defaults();
    const s = fromSettings(settings);
    s.look.cards.width = 300;
    s.look.shape.corner = 6;
    s.f.nShown = 6;
    expect(toPatch(s, settings)).toEqual({ 'card-customization.cardWidth': 300, 'shape.corner': 6, 'card-assignments.count': 6 });
  });
  it('a riced dark palette is stored as Custom roles, and reads back the same', () => {
    const settings = defaults();
    const s = fromSettings(settings);
    applyRice(s, toRice(preset('nord')!, 'nord'));
    const patch = toPatch(s, settings);
    expect(patch['palette.dark']).toBe('custom');
    const back = fromSettings({ ...settings, ...patch }, { from: s.from, base: s.base, look: s.look, cc: s.cc, editing: s.editing });
    expect(back.pal.dark).toEqual(s.pal.dark);
    expect(back.from.dark).toBe('Nord');
    expect(toPatch(back, { ...settings, ...patch })).toEqual({});
  });
  it('a bundled preset palette is stored by name', () => {
    const settings = defaults();
    const s = fromSettings(settings);
    applyRice(s, toRice(preset('warm')!, 'warm'));
    expect(toPatch(s, settings)['palette.dark']).toBe('warm');
  });
  it('an image card face (no key) stays the Studio’s and doesn’t flip the gradient key', () => {
    const settings = { ...defaults(), 'gradient-cards.enabled': false };
    const s = fromSettings(settings);
    s.look.cards.style = 'image';
    expect(toPatch(s, settings)).toEqual({});
    const back = fromSettings(settings, { look: s.look });
    expect(back.look.cards.style).toBe('image');
    // …but a gradient set elsewhere wins over the remembered face.
    expect(fromSettings({ ...settings, 'gradient-cards.enabled': true }, { look: s.look }).look.cards.style).toBe('gradient');
  });
  it('quiz pages and the GPA scale translate both ways', () => {
    expect(fFrom({ 'core.quizSafe': 'nothing' }).quiz).toBe('untouched');
    expect(scaleName(null)).toBe('auto');
    const settings = defaults();
    const s = fromSettings(settings);
    s.f.gpaScale = 'tenths';
    s.f.quiz = 'colours';
    const p = toPatch(s, settings);
    expect(p['core.quizSafe']).toBe('colours');
    expect(Array.isArray(p['gpa-calculator.scale'])).toBe(true);
  });
  it('share → import gives the same theme (minus the name)', () => {
    const settings = defaults();
    const s: State = fromSettings(settings);
    applyRice(s, toRice(preset('nord')!, 'nord'));
    s.look.type.family = 'JetBrains Mono';
    s.look.density = 'compact';
    const t1 = exportRice(s, 'Mine', { css: false, colors: true });
    const s2 = fromSettings(settings);
    applyRice(s2, toRice(t1));
    s2.cc = { ...s.cc };
    const t2 = exportRice(s2, 'Mine', { css: false, colors: true });
    expect(t2).toEqual(t1);
    expect(riceSnap(s2)).toBe(riceSnap(s));
  });
  it('My themes round-trip through themes.saved', () => {
    const settings = defaults();
    const s = fromSettings(settings);
    s.saved = [{ id: 'my-1', name: 'Mine', palette: { dark: s.pal.dark }, look: s.look, colors: null, css: null }];
    const back = savedFrom(savedTo(s.saved, s));
    expect(back).toHaveLength(1);
    expect(back[0]!.name).toBe('Mine');
    expect(back[0]!.palette.dark).toEqual(s.pal.dark);
  });
  it('every key the Studio writes is a real setting', () => {
    const settings = defaults();
    for (const k of Object.keys(settingsFor(fromSettings(settings), settings))) expect(schema).toHaveProperty([k]);
  });
});
