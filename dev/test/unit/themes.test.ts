import { describe, expect, it } from 'vitest';
import { bool, color, json, oneOf, str } from '../../src/core/settings/schema.ts';
import {
  bundledThemes, deleteTheme, exportTheme, parseTheme, planParts, previousValid, renameTheme, saveTheme, snapshotFor, themeToJson,
} from '../../src/features/themes/model.ts';

const schema = {
  'palette.useDark': oneOf(['never', 'always', 'system', 'schedule'], 'system'),
  'palette.start': str('20:00'),
  'palette.dark': oneOf(['dark', 'gray', 'black', 'warm', 'contrast', 'custom'], 'dark'),
  'palette.light': oneOf(['canvas', 'paper', 'sepia', 'contrast', 'custom'], 'canvas'),
  'palette.darkRoles': json<Record<string, string> | null>(null),
  'gradient-cards.enabled': bool(false),
  'type.family': oneOf(['canvas', 'system', 'atkinson'], 'canvas'),
  'custom-css.css': str('', { area: 'local' }),
  'better-todo.enabled': bool(true),
  'themes.saved': json([]),
};
const all = {
  'palette.useDark': 'always', 'palette.start': '21:00', 'palette.dark': 'custom', 'palette.light': 'canvas', 'palette.darkRoles': { bg: '#102030', link: 'school' },
  'gradient-cards.enabled': true, 'type.family': 'atkinson', 'custom-css.css': 'a{}', 'better-todo.enabled': false, 'themes.saved': [],
};
const now = new Date('2026-10-21T10:00:00-07:00');

describe('themes', () => {
  it('exports only the chosen parts, never the dark-mode switch or schedule', () => {
    const t = exportTheme(all, schema, ['dark', 'font'], { name: ' Night ', now });
    expect(t.name).toBe('Night');
    expect(t.parts.dark).toEqual({ 'palette.dark': 'custom', 'palette.light': 'canvas', 'palette.darkRoles': { bg: '#102030', link: 'school' } });
    expect(t.parts.font).toEqual({ 'type.family': 'atkinson' });
    expect(t.parts.cards).toBeUndefined();
    expect(JSON.stringify(t)).not.toContain('better-todo');
  });
  it('round-trips through JSON', () => {
    const t = exportTheme(all, schema, ['dark', 'cards', 'cardColors', 'font', 'css'], { name: 'All', now, cardColors: { mode: 'palette', palette: 'Ocean' } });
    const plan = parseTheme(themeToJson(t), schema);
    expect(plan.warnings).toEqual([]);
    expect(plan.values).toMatchObject({ 'palette.darkRoles': { bg: '#102030', link: 'school' }, 'gradient-cards.enabled': true, 'custom-css.css': 'a{}' });
    expect(plan.cardColors).toEqual({ mode: 'palette', palette: 'Ocean' });
    expect(planParts(plan)).toEqual(['dark', 'cards', 'cardColors', 'font', 'css']);
  });
  it('rejects non-themes plainly and skips what it cannot use', () => {
    expect(() => parseTheme('nope', schema)).toThrow(/isn't JSON/);
    expect(() => parseTheme('{"a":1}', schema)).toThrow(/isn't a b²c theme/);
    expect(() => parseTheme('{"b2cTheme":9,"parts":{}}', schema)).toThrow(/newer/);
    const plan = parseTheme(JSON.stringify({
      b2cTheme: 1, name: 'x', parts: {
        dark: { 'palette.dark': 'neon', 'palette.useDark': 'always', 'palette.lightRoles': null, 'palette.light': 'sepia' },
        font: { 'better-todo.enabled': true },
        cardColors: { mode: 'single', color: 'blue' },
      },
    }), schema);
    expect(plan.values).toEqual({ 'palette.light': 'sepia' });
    expect(plan.cardColors).toBeNull();
    expect(plan.warnings.join('\n')).toMatch(/palette.useDark: not part of "dark"/);
    expect(plan.warnings.join('\n')).toMatch(/better-todo.enabled: not part of "font"/);
    expect(plan.warnings.join('\n')).toMatch(/palette.lightRoles: not in this version/);
    expect(plan.warnings.join('\n')).toMatch(/palette.dark: invalid/);
    expect(plan.warnings.join('\n')).toMatch(/cardColors/);
  });
  it('saved list operations', () => {
    const t = bundledThemes()[0]!;
    let list = saveTheme([], t, 'a');
    list = saveTheme(list, { ...t, name: 'B' }, 'b');
    list = saveTheme(list, { ...t, name: 'A2' }, 'a');
    expect(list.map(x => x.theme.name)).toEqual(['B', 'A2']);
    list = renameTheme(list, 'b', ' Beta ');
    expect(list[0]!.theme.name).toBe('Beta');
    expect(deleteTheme(list, 'b').map(x => x.id)).toEqual(['a']);
  });
  it('bundled looks are the dark presets', () => {
    const b = bundledThemes();
    expect(b.map(t => t.name)).toEqual(['Dark', 'Gray', 'Black', 'Warm', 'High contrast']);
    expect(parseTheme(themeToJson(b[3]!), schema).values).toEqual({ 'palette.dark': 'warm' });
  });
  it('undo snapshot covers exactly the touched keys, for 24 h', () => {
    const plan = parseTheme(themeToJson(bundledThemes()[1]!), schema);
    const prev = snapshotFor(plan, all, now);
    expect(prev.values).toEqual({ 'palette.dark': 'custom' });
    expect(previousValid(prev, new Date(now.getTime() + 23 * 3600_000))).toBe(true);
    expect(previousValid(prev, new Date(now.getTime() + 25 * 3600_000))).toBe(false);
  });
});
