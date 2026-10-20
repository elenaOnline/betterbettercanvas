import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chromeMock } from './support/chrome.ts';
import { installFirstRun } from '../../src/features/first-run/sw.ts';
let mock: ReturnType<typeof chromeMock>;
beforeEach(() => { mock = chromeMock(); });
afterEach(() => vi.unstubAllGlobals());

describe('first run', () => {
  it('opens options once on install, at Start here, including across worker restarts', async () => {
    const stop = installFirstRun();
    mock.api.runtime.onInstalled.emit({ reason: 'install' });
    mock.api.runtime.onInstalled.emit({ reason: 'install' });
    await vi.waitFor(() => expect(mock.api.storage.local.set).toHaveBeenCalled());
    expect(mock.api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: 'chrome-extension://test/options.html#start-here' });
    stop(); const stop2 = installFirstRun();
    mock.api.runtime.onInstalled.emit({ reason: 'install' });
    await vi.waitFor(() => expect(mock.api.storage.local.get).toHaveBeenCalledTimes(2));
    expect(mock.api.tabs.create).toHaveBeenCalledTimes(1); stop2();
  });
  it('does not open on worker startup, update, browser update or shared module update', () => {
    const stop = installFirstRun();
    for (const reason of ['update', 'chrome_update', 'shared_module_update']) mock.api.runtime.onInstalled.emit({ reason });
    expect(mock.api.tabs.create).not.toHaveBeenCalled(); stop();
  });
  it('reports failed opening without setting the opened marker', async () => {
    mock.api.tabs.create.mockRejectedValueOnce(new Error('failed')); const error = vi.fn();
    const stop = installFirstRun(error); mock.api.runtime.onInstalled.emit({ reason: 'install' });
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1)); expect(mock.api.storage.local.set).not.toHaveBeenCalled(); stop();
  });
});
