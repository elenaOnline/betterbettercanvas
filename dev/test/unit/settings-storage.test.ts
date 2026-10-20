import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chromeMock } from './support/chrome.ts';
import { bool, int, json, oneOf, str, time } from '../../src/core/settings/schema.ts';
import { createStore } from '../../src/core/settings/store.ts';
import { changeWithUndo, exportSettings, featureKeys, importBetterCanvas, importSettings, validateSettings } from '../../src/features/settings-storage/model.ts';

const schema = {
  'dark-mode.enabled': bool(false), 'palette.useDark': oneOf(['never', 'always', 'system', 'schedule'], 'system'),
  'palette.dark': oneOf(['dark', 'gray', 'black', 'warm', 'contrast', 'custom'], 'dark'), 'palette.darkRoles': json({}),
  'palette.start': time('20:00'), 'palette.end': time('08:00'),
  'card-assignments.count': int(4, { min: 1, max: 8 }),
  'card-overlay.overlay': bool(true), 'dashboard-notes.text': str('', { area: 'local' }),
  'notes.records': json<unknown[]>([], { check: Array.isArray }),
};
beforeEach(() => chromeMock());
afterEach(() => vi.unstubAllGlobals());

describe('settings backup', () => {
  it('round trips all schema settings, including defaults and local JSON', async () => {
    const store = createStore(schema);
    await store.set({ 'dark-mode.enabled': true, 'dashboard-notes.text': 'Notes: α 😀', 'notes.records': [{ id: 3, text: 'Hi' }] });
    const before = await store.load();
    const backup = exportSettings(before, schema);
    await store.reset();
    const plan = importSettings(backup, schema);
    expect(plan.unknown).toEqual([]); expect(plan.invalid).toEqual([]);
    await store.set(plan.values);
    expect(await store.load()).toEqual(before);
  });
  it('reports unknown and invalid keys without writing coerced defaults', () => {
    const plan = validateSettings({ mystery: true, 'dark-mode.enabled': 'true', 'card-assignments.count': 99, 'notes.records': {}, 'palette.start': '25:00', 'dashboard-notes.text': 'ok' }, schema);
    expect(plan.unknown).toEqual(['mystery']); expect(plan.invalid).toHaveLength(4);
    expect(plan.values).toEqual({ 'dashboard-notes.text': 'ok' });
  });
  it.each(['[]', '{}', '{"format":"b2c-settings","version":2,"settings":{}}', 'null', 'bad'])('rejects invalid/versioned files: %s', value => expect(() => importSettings(value, schema)).toThrow());
  it('reports prototype-shaped unknown keys safely', () => {
    const plan = importSettings('{"format":"b2c-settings","version":1,"settings":{"__proto__":{"x":1},"constructor":1}}', schema);
    expect(plan.unknown).toEqual(['__proto__', 'constructor']); expect(Object.keys(plan.values)).toEqual([]);
  });
  it('resets a single feature and undo restores only its settings', async () => {
    const store = createStore(schema);
    await store.set({ 'dark-mode.enabled': true, 'dashboard-notes.text': 'keep' });
    const undo = await changeWithUndo(store, { feature: 'dark-mode' }, () => 100);
    expect((await store.load())['dark-mode.enabled']).toBe(false);
    await store.set({ 'dashboard-notes.text': 'new' });
    expect(await undo()).toBe(true); expect(await undo()).toBe(false);
    expect((await store.load())['dark-mode.enabled']).toBe(true);
    expect((await store.load())['dashboard-notes.text']).toBe('new');
    expect(featureKeys(schema, 'dark')).toEqual([]);
  });
  it('restores both areas when an import fails after one area has saved', async () => {
    const mock = chromeMock(); const store = createStore(schema);
    await store.set({ 'dark-mode.enabled': false, 'dashboard-notes.text': 'before' });
    mock.api.storage.local.set.mockRejectedValueOnce(new Error('quota'));
    await expect(changeWithUndo(store, { values: { 'dark-mode.enabled': true, 'dashboard-notes.text': 'after' } })).rejects.toThrow(/restored/);
    expect((await store.load())['dark-mode.enabled']).toBe(false);
    expect((await store.load())['dashboard-notes.text']).toBe('before');
  });
  it('expires undo at ten seconds and resets all declared settings', async () => {
    const store = createStore(schema); let now = 0;
    await store.set({ 'dark-mode.enabled': true, 'dashboard-notes.text': 'clear' });
    const undo = await changeWithUndo(store, {}, () => now);
    now = 10_000; expect(await undo()).toBe(false);
    expect((await store.load())['dashboard-notes.text']).toBe('');
  });
});

describe('Better Canvas mapping', () => {
  it('maps legacy toggles, inverts overlay removal, and maps counts and notes', () => {
    const plan = importBetterCanvas(JSON.stringify({
      dark_mode: true, disable_color_overlay: true, num_assignments: 6,
      dashboard_notes_text: 'Saved notes', remlogo: true, dashboard_grades: false,
    }), { ...schema, 'hide-logo.enabled': bool(false), 'card-grades.enabled': bool(true) });
    expect(plan.values).toEqual({
      'palette.useDark': 'always', 'card-overlay.overlay': false, 'card-assignments.count': 6,
      'dashboard-notes.text': 'Saved notes', 'hide-logo.enabled': true, 'card-grades.enabled': false,
    });
    expect(plan.invalid).toEqual([]); expect(plan.unknown).toEqual([]); expect(plan.unsupported).toEqual([]);
  });
  it('enables custom CSS and font only when a nonempty value was imported', () => {
    const fontSchema = {
      'custom-css.css': str(''), 'custom-css.enabled': bool(false),
      'type.family': oneOf(['Canvas default', 'Inter', 'Installed'], 'Canvas default'), 'type.localFamily': str(''),
    };
    const plan = importBetterCanvas('{"custom_styles":"body { color: red; }","custom_font":{"link":"","family":""}}', fontSchema);
    expect(plan.values).toEqual({ 'custom-css.css': 'body { color: red; }', 'custom-css.enabled': true });
    expect(importBetterCanvas('{"custom_font":{"link":"x","family":"\'Inter\', sans-serif"}}', fontSchema).values).toEqual({ 'type.family': 'Inter' });
    const lobster = importBetterCanvas('{"custom_font":{"link":"x","family":"Lobster"}}', fontSchema);
    expect(lobster.values).toEqual({ 'type.family': 'Installed', 'type.localFamily': 'Lobster' });
    expect(lobster.unsupported[0]).toMatch(/Google Fonts/);
  });
  it('maps device/schedule modes deterministically', () => {
    const plan = importBetterCanvas(JSON.stringify({ dark_mode: false, auto_dark: true, device_dark: true, auto_dark_start: '21:30' }), schema);
    expect(plan.values).toMatchObject({ 'palette.useDark': 'system', 'palette.start': '21:30' });
    expect(importBetterCanvas('{"auto_dark":true}', schema).values['palette.useDark']).toBe('schedule');
    expect(importBetterCanvas('{"auto_dark":false,"device_dark":false}', schema).values['palette.useDark']).toBe('never');
    expect(importBetterCanvas('{"dark_mode":true}', schema).values['palette.useDark']).toBe('always');
  });
  it('maps bc dark_preset slots onto a custom preset', () => {
    const plan = importBetterCanvas(JSON.stringify({ dark_preset: { 'background-0': '#161616', 'sidebar-text': '#F5F5F5' } }), schema);
    expect(plan.values).toMatchObject({ 'palette.dark': 'custom', 'palette.darkRoles': { bg: '#161616', navText: '#f5f5f5' } });
  });
  it('reports unavailable, complex, invalid and unknown legacy settings', () => {
    const plan = importBetterCanvas('{"custom_domain":"example.edu","custom_cards":{},"assignments_due":true,"todo_hr24":true,"custom_assignments2":[],"disable_color_overlay":"false","auto_dark":0,"mystery":1}', schema);
    expect(plan.unsupported).toHaveLength(5); expect(plan.invalid).toEqual(['disable_color_overlay', 'auto_dark']); expect(plan.unknown).toEqual(['mystery']);
  });
});

describe('reset clears out-of-schema satellites', () => {
  it('dashboard-notes sync mirror is cleared on reset and restored by Undo', async () => {
    const { chromeMock } = await import('./support/chrome.ts');
    const mock = chromeMock();
    const { createStore } = await import('../../src/core/settings/store.ts');
    const { changeWithUndo } = await import('../../src/features/settings-storage/model.ts');
    const store = createStore({ 'dashboard-notes.text': str('', { area: 'local' }) });
    await chrome.storage.sync.set({ 'b2c:notes': { at: 5, n: 1 }, 'b2c:notes:0': 'old', 'other': 1 });
    const undo = await changeWithUndo(store, { feature: 'dashboard-notes' }, () => 0);
    expect(Object.keys(mock.api.storage.sync.data).sort()).toEqual(['other']);
    expect(await undo()).toBe(true);
    expect(mock.api.storage.sync.data['b2c:notes:0']).toBe('old');
  });
});
