// ui lane: pure logic behind the popup and settings page.
import { describe, expect, it } from 'vitest';
import { bool, int, json, oneOf, str, time } from '../../src/core/settings/schema.ts';
import { apca, readout, wcag } from '../../src/ui/shared/contrast.ts';
import type { RowDef, SectionDef } from '../../src/ui/shared/layout.ts';
import {
  darkInEffect, darkMode, darkPatch, deepLinkRow, filter, normaliseOrigin, sectionForPage, keysOf, presetPatch, resetPatch, rowDesc, rowEnabled, rowIsDefault,
  rowOptions, rowPatch, rowPresent, rowValue, view,
} from '../../src/ui/shared/model.ts';

const spec = { 'palette.useDark': oneOf(['never', 'always', 'system', 'schedule'], 'system'), 'palette.start': time('20:00'), 'palette.end': time('08:00') };

describe('dark mode: Off · On · Match system · Scheduled over palette.useDark', () => {
  it('reads and writes the v2 key, speaking the UI words', () => {
    expect(darkMode({ 'palette.useDark': 'system' }, spec)).toBe('system');
    expect(darkMode({ 'palette.useDark': 'never' }, spec)).toBe('off');
    expect(darkMode({ 'palette.useDark': 'always' }, spec)).toBe('on');
    expect(darkPatch('off', spec)).toEqual({ 'palette.useDark': 'never' });
    expect(darkPatch('on', spec)).toEqual({ 'palette.useDark': 'always' });
    expect(darkPatch('on', spec, { 'palette.useDark': 'always' })).toEqual({});
  });
  it('view() lets row conditions read the logical value', () => {
    expect(view({ 'palette.useDark': 'never' }, spec)['palette.useDark']).toBe('off');
  });
  it('knows whether dark is painting, across midnight', () => {
    const v = { 'palette.start': '20:00', 'palette.end': '08:00' };
    expect(darkInEffect('schedule', v, new Date(2026, 9, 21, 23, 0), false)).toBe(true);
    expect(darkInEffect('schedule', v, new Date(2026, 9, 21, 7, 59), false)).toBe(true);
    expect(darkInEffect('schedule', v, new Date(2026, 9, 21, 8, 0), false)).toBe(false);
    expect(darkInEffect('system', v, new Date(), true)).toBe(true);
    expect(darkInEffect('off', v, new Date(), true)).toBe(false);
  });
});

describe('rows', () => {
  const schema = {
    'a.enabled': bool(true), 'a.count': int(4, { min: 1, max: 8 }), 'a.mode': oneOf(['x', 'y', 'z'], 'x'),
    'type.family': oneOf(['Canvas default', 'Inter'], 'Canvas default'),
    'custom-css.enabled': bool(false), 'custom-css.css': str(''), 'b.data': json({}),
  };
  const count: RowDef = { id: 'count', key: 'a.count', label: 'Number shown', control: 'stepper', depth: 1, when: [{ key: 'a.enabled' }] };
  it('nested rows are enabled only while their feature is on', () => {
    expect(rowEnabled(count, { 'a.enabled': true })).toBe(true);
    expect(rowEnabled(count, { 'a.enabled': false })).toBe(false);
    expect(rowEnabled({ ...count, when: [{ key: 'a.mode', is: 'y' }] }, { 'a.mode': 'x' })).toBe(false);
    expect(rowEnabled({ ...count, when: [{ key: 'a.mode', not: 'x' }] }, { 'a.mode': 'z' })).toBe(true);
  });
  it('font is one menu: type.family, Canvas default is off', () => {
    const font: RowDef = { id: 'font', key: 'type.family', label: 'Font', control: 'font' };
    expect(rowValue(font, { 'type.family': 'Canvas default' }, schema)).toBe('Canvas default');
    expect(rowValue(font, {}, schema)).toBe('Canvas default');
    expect(rowPatch(font, 'Inter', schema)).toEqual({ 'type.family': 'Inter' });
    expect(rowPatch(font, 'Canvas default', schema)).toEqual({ 'type.family': 'Canvas default' });
  });
  it('custom CSS turns itself on when there is CSS, off when emptied', () => {
    const css: RowDef = { id: 'css', key: 'custom-css.css', keys: ['custom-css.enabled'], label: 'Custom CSS', control: 'code' };
    expect(rowPatch(css, 'a{}', schema)).toEqual({ 'custom-css.css': 'a{}', 'custom-css.enabled': true });
    expect(rowPatch(css, '  ', schema)).toEqual({ 'custom-css.css': '  ', 'custom-css.enabled': false });
  });
  it('shared settings mirror into other keys, translated', () => {
    const s = { ...schema, 'b.clock': oneOf(['auto', '12h', '24h'], 'auto') };
    const clock: RowDef = { id: 'clock', key: 'a.mode', also: [{ key: 'b.clock', map: { x: 'auto', y: '12h' } }, { key: 'missing.key' }], label: 'T', control: 'segmented' };
    expect(rowPatch(clock, 'y', s)).toEqual({ 'a.mode': 'y', 'b.clock': '12h' });
  });
  it('defaults, reset and descriptions', () => {
    expect(rowIsDefault(count, { 'a.count': 4 }, schema)).toBe(true);
    expect(rowIsDefault(count, { 'a.count': 6 }, schema)).toBe(false);
    expect(resetPatch(keysOf(count, schema), schema)).toEqual({ 'a.count': 4 });
    const d: RowDef = { id: 'd', key: 'a.enabled', label: 'D', control: 'switch', desc: 'base', descBy: { true: 'on!' } };
    expect(rowDesc(d, { 'a.enabled': true })).toBe('on!');
    expect(rowDesc(d, { 'a.enabled': false })).toBe('base');
  });
  it('options follow the schema: unknown values dropped, unlabelled values added', () => {
    const r: RowDef = { id: 'm', key: 'a.mode', label: 'M', control: 'segmented', options: [['x', 'Ex'], ['q', 'Gone']] };
    expect(rowOptions(r, schema)).toEqual([['x', 'Ex'], ['y', 'Y'], ['z', 'Z']]);
  });
  it('rows whose keys this build lacks are not rendered', () => {
    expect(rowPresent(count, schema)).toBe(true);
    expect(rowPresent({ ...count, key: 'nope.count' }, schema)).toBe(false);
    expect(rowPresent({ id: 'p', label: 'Sites', control: 'platform', mount: 'sites' }, schema)).toBe(true);
  });
  it('a preset writes the dark slot, and (seeding Custom) its roles', () => {
    const s = { 'palette.dark': oneOf(['dark', 'custom'], 'dark'), 'palette.darkRoles': json(null) };
    expect(presetPatch('dark', undefined, s)).toEqual({ 'palette.dark': 'dark' });
    expect(presetPatch('custom', { bg: '#18212d', link: 'school' }, s)).toEqual({ 'palette.dark': 'custom', 'palette.darkRoles': { bg: '#18212d', link: 'school' } });
  });
});

describe('search', () => {
  const sections: SectionDef[] = [
    { id: 'look', title: 'Appearance', rows: [
      { id: 'dark', key: 'k', label: 'Dark mode', control: 'switch' },
      { id: 'colors', label: 'Customize colors', control: 'disclosure', depth: 1 },
      { id: 'wells', in: 'colors', label: 'Colors', control: 'color-wells', depth: 1, keywords: 'tertiary' },
      { id: 'logo', key: 'k2', label: 'Hide institution logo', control: 'switch' },
    ] },
    { id: 'dash', title: 'Dashboard', rows: [
      { id: 'cards', key: 'k3', label: 'Show assignments on cards', control: 'switch' },
      { id: 'overdue', key: 'k4', label: 'Include overdue', control: 'switch', depth: 1 },
    ] },
  ];
  const f = (q: string) => filter(sections, q, () => '', () => true);
  it('empty query shows everything', () => expect(f('').shown.size).toBe(6));
  it('a nested match keeps its feature row', () => {
    const r = f('overdue');
    expect([...r.shown].sort()).toEqual(['cards', 'overdue']);
    expect([...r.sections]).toEqual(['dash']);
  });
  it('a match in a collapsed disclosure opens it', () => {
    const r = f('tertiary');
    expect(r.forcedOpen.has('colors')).toBe(true);
    expect(r.shown.has('wells') && r.shown.has('colors') && r.shown.has('dark')).toBe(true);
  });
  it('a section title match shows the whole section', () => expect(f('dashboard').shown.size).toBe(2));
  it('no match', () => expect(f('zzz').sections.size).toBe(0));
});

describe('contrast readouts', () => {
  it('matches known WCAG and APCA values', () => {
    expect(wcag('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(Math.abs(apca('#000000', '#ffffff'))).toBeCloseTo(106, 0);
    expect(Math.abs(apca('#ffffff', '#000000'))).toBeCloseTo(108, 0);
  });
  it('reports the worst surface and warns below the floor', () => {
    const ok = readout('text', { bg: '#18212d', surface: '#212b37', 'surface-raised': '#2b3541', text: '#e8edf4' })!;
    expect(ok.low).toBe('');
    expect(ok.text).toMatch(/^\d+\.\d:1 · Lc \d+$/);
    const low = readout('text', { bg: '#18212d', surface: '#212b37', 'surface-raised': '#2b3541', text: '#5a6470' })!;
    expect(low.low).toBe('Below AA');
  });
  it('school-derived link uses the school colour; non-text roles have no readout', () => {
    expect(readout('link', { bg: '#18212d', surface: '#212b37', 'surface-raised': '#2b3541', link: '' })).not.toBeNull();
    expect(readout('bg', { bg: '#000000' })).toBeNull();
  });
});

describe('flow A helpers', () => {
  it('normalises whatever is pasted to an https origin', () => {
    expect(normaliseOrigin('canvas.b2c-mock.test')).toBe('https://canvas.b2c-mock.test');
    expect(normaliseOrigin(' https://canvas.example.edu/courses/12?x=1#y ')).toBe('https://canvas.example.edu');
    expect(normaliseOrigin('http://canvas.b2c-mock.test/')).toBe('https://canvas.b2c-mock.test');
    expect(() => normaliseOrigin('')).toThrow(/Type your school/);
    expect(() => normaliseOrigin('localhost')).toThrow(/doesn’t look like/);
  });
  it('All settings… opens at the page’s section', () => {
    expect(sectionForPage('dashboard')).toBe('dashboard');
    expect(sectionForPage('course-grades')).toBe('grades');
    expect(sectionForPage('modules')).toBe('appearance');
    expect(sectionForPage(null)).toBe('appearance');
  });
  it('a deep link finds a row by row id, feature switch, or any key of the feature', () => {
    const rows: RowDef[] = [
      { id: 'gpa', key: 'gpa-calculator.enabled', label: 'GPA', control: 'switch' },
      { id: 'gpa-scale', key: 'gpa-calculator.scale', label: 'Scale', control: 'scale' },
      { id: 'card-layout', label: 'Layout', control: 'sliders', options: [['card-customization.cardWidth', 'W']] },
    ];
    expect(deepLinkRow('gpa-calculator', rows)?.id).toBe('gpa');
    expect(deepLinkRow('gpa-scale', rows)?.id).toBe('gpa-scale');
    expect(deepLinkRow('card-customization', rows)?.id).toBe('card-layout');
    expect(deepLinkRow('nope', rows)).toBeNull();
  });
});
