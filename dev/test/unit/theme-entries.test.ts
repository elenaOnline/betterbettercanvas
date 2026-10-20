// The theme engine's two outside entries: node.ts (Agent kit `b2c check`) and
// sw.ts (test-build `b2c:themes:apply-file`, for `b2c render`).
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chromeMock } from './support/chrome.ts';
import { schema } from '../../src/core/registry.ts';
import { createStore } from '../../src/core/settings/store.ts';
import { THEME_LIMITS, defaultSettings, planTheme, sanitizeCss } from '../../src/core/theme/node.ts';
import { APPLY_FILE_MSG, applyFileMessage } from '../../src/core/theme/sw.ts';
import { encodeShare, preset } from '../../src/core/theme/index.ts';

const DESIGN = path.join(import.meta.dirname, '../../../design/spec/themes');
const FIX = path.join(import.meta.dirname, 'fixtures/themes');

describe('node entry (b2c check)', () => {
  it('needs no chrome.* and plans against the real defaults', async () => {
    expect(typeof (globalThis as { chrome?: unknown }).chrome).toBe('undefined');
    expect(defaultSettings()['palette.dark']).toBe('dark');
    const r = await planTheme(fs.readFileSync(path.join(DESIGN, 'nord.b2c-theme.json'), 'utf8'));
    expect(r.ok).toBe(true);
    expect(Object.keys(r.plan!.values).sort()).toEqual(['card-colors.request', 'palette.dark', 'palette.darkRoles']);
  });

  it('is not ok when a floor fails or the file has errors, and says why', async () => {
    const cat = await planTheme(fs.readFileSync(path.join(FIX, 'catppuccin-palette.json'), 'utf8'), { flavor: 'mocha' });
    expect(cat.ok).toBe(false);
    expect(cat.contrast.dark!.failing.length).toBeGreaterThan(0);
    const bad = await planTheme('{"$b2c":"theme","v":1,"name":"x","density":"airy"}');
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatch(/density/);
    expect((await planTheme('nope')).plan).toBeNull();
  });

  it('exports the limits and the sanitiser', () => {
    expect(THEME_LIMITS).toMatchObject({ themeBytes: 4096, cssBytes: 32768, version: 1 });
    expect(sanitizeCss('a{background:url(//evil.example/x)}').css).toBe('');
  });
});

describe('sw entry (b2c:themes:apply-file)', () => {
  beforeEach(() => chromeMock());
  afterEach(() => vi.unstubAllGlobals());

  it('imports and applies through the store; CSS only when asked', async () => {
    const store = createStore(schema);
    const text = await encodeShare({ ...preset('nord')!, css: 'a{color:red} b{background:url(https://evil.example/b)}' }, 'rice');
    const r = await applyFileMessage(store, { type: APPLY_FILE_MSG, text });
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('rice');
    expect(r.name).toBe('Nord');
    expect(r.cssRemoved).toHaveLength(1);
    expect((await store.load())['palette.dark']).toBe('custom');
    expect((await store.load())['custom-css.css']).toBe('');
    await applyFileMessage(store, { type: APPLY_FILE_MSG, text, css: true });
    expect((await store.load())['custom-css.css']).toBe('a {\n  color: red;\n}\n');
  });

  it('replies with errors instead of throwing', async () => {
    const r = await applyFileMessage(createStore(schema), { type: APPLY_FILE_MSG, text: 'garbage' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/isn't a theme b²c can read/);
  });
});
