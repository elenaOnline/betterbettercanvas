// Split stylesheets (lane css-split): build, mirror bookkeeping, page-side
// presence, and the service worker's registrations.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chromeMock } from './support/chrome.ts';
import { applyMirror, addSheets, checkSheets, mergeParts, missingSheets, withheld } from '../../src/core/mirror.ts';
import { defineFeature, mirrorOf, withStylesheet } from '../../src/core/feature.ts';
import { bool, oneOf } from '../../src/core/settings/schema.ts';
import { wantedSheets } from '../../src/core/sheets.ts';
import { installSheets, planSheets } from '../../src/background/css.ts';
import { isQuizHost } from '../../src/core/hosts.ts';
// @ts-expect-error build.mjs is plain JS
import { buildCss, lintGating } from '../../build.mjs';

const seen = globalThis as { __b2cSheets?: Set<string> };
afterEach(() => {
  delete seen.__b2cSheets;
  vi.unstubAllGlobals();
  for (const a of Array.from(document.documentElement.attributes)) if (a.name.startsWith('data-b2c-')) document.documentElement.removeAttribute(a.name);
});

describe('build', () => {
  it('keeps core in content.css and gives each feature a gated sheet with a presence marker', () => {
    const { core, sheets } = buildCss(['palette', 'hide-logo', 'diagnostics'], true);
    expect(core).toContain('src/content/base.css');
    expect(core).not.toContain('src/features/');
    expect(Object.keys(sheets).sort()).toEqual(['hide-logo', 'palette']); // diagnostics has no CSS
    expect(sheets.palette).toContain('html[data-b2c]{--b2c-css-palette:1}');
    expect(sheets.palette).toContain('literals.gen.css');
    for (const css of Object.values(sheets) as string[]) expect(lintGating(css, 't')).toEqual([]);
  });
  it('can still build the single sheet (B2C_CSS_SPLIT=0)', () => {
    const { core, sheets } = buildCss(['hide-logo'], false);
    expect(sheets).toEqual({});
    expect(core).toContain('src/features/hide-logo/style.css');
  });
});

describe('mirror: which sheets the state needs', () => {
  const styled = withStylesheet(defineFeature({ id: 'look', settings: { mode: oneOf(['off', 'on'], 'off') }, pages: [], mirror: s => (s.mode === 'on' ? { attrs: { 'data-b2c-look': '', 'data-b2c-shared': '' } } : {}) }), 'css/look.css');
  const toggled = withStylesheet(defineFeature({ id: 'tog', settings: { enabled: bool(false) }, pages: [] }), 'css/tog.css');
  const plain = defineFeature({ id: 'side', settings: { enabled: bool(true) }, pages: [], mirror: () => ({ attrs: { 'data-b2c-shared': '' } }) });

  it('needs a sheet exactly while the feature sets an attribute', () => {
    expect(mirrorOf(styled, { 'look.mode': 'off' }).need).toBeUndefined();
    expect(mirrorOf(styled, { 'look.mode': 'on' }).need).toEqual({ look: ['data-b2c-look', 'data-b2c-shared'] });
    expect(mirrorOf(toggled, { 'tog.enabled': false }).need).toBeUndefined();
    expect(mirrorOf(toggled, { 'tog.enabled': true }).need).toEqual({ tog: ['data-b2c-tog'] });
  });
  it('counts conditional attributes (Match system, schedules): the sheet must be there when they flip', () => {
    const cond = withStylesheet(defineFeature({ id: 'night', settings: {}, pages: [], mirror: () => ({ cond: [{ attr: 'data-b2c-night', value: 'on', when: { media: '(prefers-color-scheme: dark)' } }] }) }), 'css/night.css');
    expect(mirrorOf(cond, {}).need).toEqual({ night: ['data-b2c-night'] });
  });
  it('wants sheets from normal and quiz-taking states; shared attributes never depend on one sheet', () => {
    const all = { 'look.mode': 'on', 'tog.enabled': true, 'side.enabled': true };
    const m = mergeParts([styled, toggled, plain].map(f => mirrorOf(f, all)), [mirrorOf(styled, all)]);
    expect(wantedSheets(m)).toEqual(['look', 'tog']);
    expect(m.need).toEqual({ look: ['data-b2c-look'], tog: ['data-b2c-tog'] });
  });
  it('withholds a feature whose sheet is missing, and nothing before anyone has looked', () => {
    const m = mergeParts([mirrorOf(styled, { 'look.mode': 'on' }), mirrorOf(toggled, { 'tog.enabled': true })]);
    expect(missingSheets(m)).toEqual([]);
    applyMirror(m);
    expect(document.documentElement.hasAttribute('data-b2c-look')).toBe(true);
    // Looked, found nothing: everything is missing.
    checkSheets(['look', 'tog']);
    expect(missingSheets(m)).toEqual(['look', 'tog']);
    addSheets(['tog']);
    expect(missingSheets(m)).toEqual(['look']);
    expect([...withheld(m)]).toEqual(['data-b2c-look', 'data-b2c-shared']); // only look sets shared here
    applyMirror(m);
    expect(document.documentElement.hasAttribute('data-b2c-look')).toBe(false);
    expect(document.documentElement.hasAttribute('data-b2c-tog')).toBe(true);
    addSheets(['look']);
    applyMirror(m);
    expect(document.documentElement.hasAttribute('data-b2c-look')).toBe(true);
  });
});

describe('service worker: registrations', () => {
  const SHEETS = ['palette', 'shape', 'type'];
  it('plans every frame of known schools and granted sites, and never a quiz host', () => {
    const p = planSheets(SHEETS, ['shape', 'palette'], ['https://b2c-mock-school.instructure.com', 'https://b2c-mock-school.quiz-lti-b2c-mock-prod.instructure.com'], ['https://canvas.example.edu/*']);
    expect(p.map(s => s.id)).toEqual(['b2c-css-palette', 'b2c-css-shape']);
    expect(p[0]).toMatchObject({ matches: ['https://b2c-mock-school.instructure.com/*', 'https://canvas.example.edu/*'], css: ['css/palette.css'], runAt: 'document_start', allFrames: true, matchOriginAsFallback: true });
    // No school known yet (fresh install): nothing anywhere, not even *.instructure.com.
    expect(planSheets(SHEETS, null, [], [])).toEqual([]);
  });

  it.each(['https://b2c-mock-school.quiz-lti-b2c-mock-prod.instructure.com', 'https://b2c-mock-school.quiz-api-b2c-mock-prod.instructure.com', 'https://x.quiz.instructure.com'])('%s is a quiz host', o => expect(isQuizHost(o)).toBe(true));
  it('a school is not a quiz host', () => expect(isQuizHost('https://b2c-mock-school.instructure.com')).toBe(false));

  let mock: ReturnType<typeof chromeMock>;
  beforeEach(() => { mock = chromeMock(); });
  const send = (msg: unknown, sender: Partial<chrome.runtime.MessageSender>) =>
    new Promise(r => mock.api.runtime.onMessage.emit(msg, { id: 'test', tab: { id: 7 } as chrome.tabs.Tab, frameId: 0, ...sender }, r));

  const school = { url: 'https://b2c-mock-school.instructure.com/', origin: 'https://b2c-mock-school.instructure.com' };

  it('registers nothing on a fresh install, then follows reports from schools; inserts live; follows granted sites', async () => {
    const { settled } = installSheets(SHEETS, e => { throw e; });
    mock.api.runtime.onInstalled.emit({ reason: 'install' });
    await settled();
    expect(mock.scripts.size).toBe(0);

    const ok = await send({ type: 'b2c:css', want: ['shape', 'nope'], insert: ['shape', 'nope'] }, school);
    expect(ok).toBe(true);
    expect(mock.api.scripting.insertCSS).toHaveBeenCalledWith({ target: { tabId: 7, frameIds: [0] }, files: ['css/shape.css'] });
    // A same-origin frame (boot.js) asks for itself; it never reports what's wanted.
    expect(await send({ type: 'b2c:css', insert: ['shape'], want: ['type'] }, { frameId: 3, url: 'about:blank', origin: school.origin })).toBe(true);
    expect(mock.api.scripting.insertCSS).toHaveBeenCalledWith({ target: { tabId: 7, frameIds: [3] }, files: ['css/shape.css'] });
    await settled();
    expect([...mock.scripts.keys()]).toEqual(['b2c-css-shape']);
    expect(mock.scripts.get('b2c-css-shape')).toMatchObject({ matches: ['https://b2c-mock-school.instructure.com/*'], allFrames: true });

    // A granted custom domain gets the sheets too; revoking it drops it.
    mock.permissions.add('https://canvas.example.edu/*');
    await mock.api.storage.local.set({ 'b2c:sites': ['https://canvas.example.edu'] });
    await settled();
    expect(mock.scripts.get('b2c-css-shape')!.matches).toEqual(['https://b2c-mock-school.instructure.com/*', 'https://canvas.example.edu/*']);
    mock.permissions.delete('https://canvas.example.edu/*');
    mock.api.permissions.onRemoved.emit({ origins: ['https://canvas.example.edu/*'] });
    await settled();
    expect(mock.scripts.get('b2c-css-shape')!.matches).toEqual(['https://b2c-mock-school.instructure.com/*']);

    // Lost registrations heal on the next report (every Canvas page load sends one).
    mock.scripts.clear();
    await send({ type: 'b2c:css', want: ['shape'] }, school);
    await settled();
    expect([...mock.scripts.keys()]).toEqual(['b2c-css-shape']);

    // An update with a school known: every sheet there at once.
    mock.api.runtime.onInstalled.emit({ reason: 'update' });
    await settled();
    expect([...mock.scripts.keys()].sort()).toEqual(['b2c-css-palette', 'b2c-css-shape', 'b2c-css-type']);
    expect(mock.scripts.get('b2c-css-type')!.matches).toEqual(['https://b2c-mock-school.instructure.com/*']);

    // Paused (nothing wanted): no feature sheet anywhere.
    await send({ type: 'b2c:css', want: [] }, school);
    await settled();
    expect(mock.scripts.size).toBe(0);
  });

  it('replaces an older build\'s registrations (wildcard top frames, .f frames)', async () => {
    mock.scripts.set('b2c-css-shape', { id: 'b2c-css-shape', matches: ['https://*.instructure.com/*'], excludeMatches: ['https://b2c-mock-school.instructure.com/*'], css: ['css/shape.css'], allFrames: false });
    mock.scripts.set('b2c-css-shape.f', { id: 'b2c-css-shape.f', matches: ['https://b2c-mock-school.instructure.com/*'], css: ['css/shape.css'], allFrames: true, matchOriginAsFallback: true });
    await mock.api.storage.local.set({ 'b2c:css': { want: ['shape'], origins: ['https://b2c-mock-school.instructure.com'] } });
    const { settled } = installSheets(SHEETS, e => { throw e; });
    await settled();
    expect([...mock.scripts.keys()]).toEqual(['b2c-css-shape']);
    expect(mock.scripts.get('b2c-css-shape')).toMatchObject({ matches: ['https://b2c-mock-school.instructure.com/*'], allFrames: true });
  });

  it('ignores other extensions, and never remembers a non-Canvas or quiz host, even if one reports', async () => {
    const { settled } = installSheets(SHEETS, e => { throw e; });
    expect(await new Promise(r => { const out = mock.api.runtime.onMessage.emit({ type: 'b2c:css', insert: ['shape'] }, { id: 'other', tab: { id: 1 }, url: 'https://x.instructure.com/' }, r); if (out[0] === false) r('ignored'); })).toBe('ignored');
    await send({ type: 'b2c:css', want: ['shape'] }, { url: 'https://evil.example/', origin: 'https://evil.example' });
    await send({ type: 'b2c:css', want: ['shape'] }, { url: 'https://b2c-mock-school.quiz-lti-b2c-mock-prod.instructure.com/', origin: 'https://b2c-mock-school.quiz-lti-b2c-mock-prod.instructure.com' });
    await settled();
    expect(mock.scripts.size).toBe(0);
    expect((await mock.api.storage.local.get('b2c:css'))['b2c:css']).toMatchObject({ origins: [] });
  });
});
