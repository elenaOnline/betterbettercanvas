import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chromeMock } from './support/chrome.ts';
import { canvasOrigin, SITE_KEY, siteScripts } from '../../src/features/sites/model.ts';
import { changeSite, installSites, reconcileSites, registeredCanvasMatches } from '../../src/features/sites/sw.ts';

let mock: ReturnType<typeof chromeMock>;
beforeEach(() => { mock = chromeMock(); });
afterEach(() => vi.unstubAllGlobals());

describe('Canvas sites', () => {
  it('canonicalizes an exact HTTPS origin', () => expect(canvasOrigin(' https://SCHOOL.instructure.com/ ')).toBe('https://school.instructure.com'));
  it.each(['http://example.edu', 'https://user:pass@example.edu', 'https://*.edu', 'https://example.edu/path', 'https://example.edu/?token=x', 'https://example.edu/#x', 'https://example.edu:8888', 'example.edu'])('rejects %s', value => expect(() => canvasOrigin(value)).toThrow());
  it('uses manifest-equivalent files, timing and persistent worlds', () => {
    const scripts = siteScripts(['https://school.instructure.com', 'https://example.edu', 'https://example.edu']);
    // Same files, timing, worlds and frames as the manifest's content_scripts.
    expect(scripts).toHaveLength(4);
    const by = (js: string) => scripts.find(x => x.js?.includes(js));
    expect(by('boot.js')).toMatchObject({ matches: ['https://example.edu/*'], css: ['content.css'], runAt: 'document_start', allFrames: true, matchOriginAsFallback: true, persistAcrossSessions: true, world: 'ISOLATED' });
    expect(by('main.js')).toMatchObject({ runAt: 'document_start', persistAcrossSessions: true, world: 'ISOLATED' });
    expect(by('main.js')?.allFrames).toBeFalsy();
    expect(by('env-main.js')).toMatchObject({ runAt: 'document_end', persistAcrossSessions: true, world: 'MAIN' });
    expect(by('dark-instui.js')).toMatchObject({ runAt: 'document_start', world: 'MAIN' });
  });
  it('never registers without permission or removes the default site', async () => {
    await expect(changeSite('add', 'https://example.edu')).rejects.toThrow(/permission/);
    await expect(changeSite('remove', 'https://b2c-mock-school.instructure.com')).rejects.toThrow(/default/);
    expect(mock.scripts.size).toBe(0);
  });
  it('adds idempotently, activates existing tabs, includes custom sites in reinjection, then removes access', async () => {
    mock.permissions.add('https://example.edu/*');
    mock.api.tabs.query.mockResolvedValue([{ id: 7 }] as chrome.tabs.Tab[]);
    await changeSite('add', 'https://example.edu');
    await changeSite('add', 'https://example.edu');
    expect(mock.scripts.size).toBe(4);
    expect(mock.api.scripting.insertCSS).toHaveBeenCalled();
    expect(await registeredCanvasMatches()).toEqual(['https://*.instructure.com/*', 'https://example.edu/*']);
    await changeSite('remove', 'https://example.edu');
    expect(mock.permissions.size).toBe(0);
    expect(mock.scripts.size).toBe(0);
    expect(mock.api.scripting.removeCSS).toHaveBeenCalled();
    expect(mock.api.storage.local.data[SITE_KEY]).toEqual([]);
  });
  it('restores registrations from saved sites after a worker restart and drops revoked origins', async () => {
    mock.api.storage.local.data[SITE_KEY] = ['https://example.edu', 'https://revoked.example.edu', 'garbage'];
    mock.permissions.add('https://example.edu/*');
    expect(await reconcileSites()).toEqual(['https://example.edu']);
    expect(mock.scripts.size).toBe(4);
    mock.permissions.clear(); await reconcileSites();
    expect(mock.scripts.size).toBe(0);
  });
  it('rolls registrations back on failed storage writes', async () => {
    mock.permissions.add('https://example.edu/*');
    mock.api.storage.local.set.mockRejectedValueOnce(new Error());
    await expect(changeSite('add', 'https://example.edu')).rejects.toThrow();
    expect(mock.scripts.size).toBe(0);
  });
  it('rejects site messages from Canvas content scripts', async () => {
    const stop = installSites();
    const reply = vi.fn();
    mock.api.runtime.onMessage.emit({ type: 'b2c:sites:add', origin: 'https://example.edu' }, { id: 'test', url: 'https://canvas.b2c-mock.test/' }, reply);
    await vi.waitFor(() => expect(mock.api.storage.local.set).toHaveBeenCalled());
    expect(reply).not.toHaveBeenCalled(); stop();
    expect(mock.api.runtime.onMessage.listeners.size).toBe(0);
  });
});

describe('popup offer handoff', () => {
  it('finishes "Turn on" in the SW when the grant arrives after the popup closed', async () => {
    const { chromeMock } = await import('./support/chrome.ts');
    const mock = chromeMock();
    const { installSites } = await import('../../src/features/sites/sw.ts');
    installSites();
    const popup = { id: 'test', url: 'chrome-extension://test/popup.html' };
    mock.api.runtime.onMessage.emit({ type: 'b2c:sites:offer', origin: 'https://canvas.example.edu', tabId: 7 }, popup, () => {});
    await new Promise(r => setTimeout(r, 0));
    mock.permissions.add('https://canvas.example.edu/*');
    mock.api.permissions.onAdded.emit({ origins: ['https://canvas.example.edu/*'] });
    await vi.waitFor(() => expect(mock.api.tabs.reload).toHaveBeenCalledWith(7));
    expect([...mock.scripts.values()][0]?.matches).toEqual(['https://canvas.example.edu/*']);
  });
});
