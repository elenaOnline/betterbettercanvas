import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chromeMock } from './support/chrome.ts';
import { diagnostic, errorEvent, LOG_KEY, readRing, reportText } from '../../src/features/diagnostics/model.ts';
import { installDiagnostics } from '../../src/features/diagnostics/sw.ts';
let mock: ReturnType<typeof chromeMock>;
beforeEach(() => { mock = chromeMock(); });
afterEach(() => vi.unstubAllGlobals());

describe('private diagnostics', () => {
  it('keeps fixed messages and excludes exception content, stack, URL and custom names', () => {
    const e = new TypeError('Student Alice at https://canvas.b2c-mock.test/courses/123');
    const row = diagnostic(errorEvent('cards', e, 'dashboard', 'start', 100), ['cards']);
    expect(row).toEqual({ feature: 'cards', message: 'start failed (TypeError).', page: 'dashboard', time: 100 });
    expect(reportText([row!], '0.1.0')).not.toMatch(/Alice|https|stack|123/);
    expect(diagnostic(errorEvent('cards', { name: 'Alice' }, 'dashboard', 'start', 100), ['cards'])?.message).toBe('start failed (Error).');
  });
  it('rejects arbitrary feature/page/phase fields and malformed times', () => {
    const event = errorEvent('cards', null, 'dashboard', 'start', 1);
    for (const update of [{ feature: 'student-name' }, { page: '/courses/123' }, { phase: 'Alice' }, { time: NaN }, { time: -1 }, { time: 9e15 }]) expect(diagnostic({ ...event, ...update }, ['cards'])).toBeNull();
    expect(errorEvent('core', { get name() { throw new Error(); } }, 'other', 'init', 1).name).toBe('Error');
  });
  it('revalidates existing storage records before display/copy', () => {
    const row = diagnostic(errorEvent('core', new Error(), 'other', 'init', 1), [])!;
    expect(readRing([row, { ...row, message: 'personal content' }, null, { ...row, feature: 'Alice' }], [])).toEqual([row]);
  });
  it('serializes concurrent worker errors, retains the newest 50 and survives worker recreation', async () => {
    let time = 0;
    const logger = installDiagnostics([], () => ++time);
    await Promise.all(Array.from({ length: 60 }, () => logger.record('core', new TypeError('private'))));
    expect(readRing(mock.api.storage.local.data[LOG_KEY], [])).toHaveLength(50);
    expect(readRing(mock.api.storage.local.data[LOG_KEY], [])[0]?.time).toBe(11);
    logger.stop();
    const next = installDiagnostics([], () => 61); await next.record('core', new Error());
    expect(readRing(mock.api.storage.local.data[LOG_KEY], []).at(-1)?.time).toBe(61); next.stop();
  });
  it('queues clear after earlier appends, and allows subsequent appends', async () => {
    const logger = installDiagnostics([], () => 42);
    const pending = logger.record('core', new Error());
    const reply = vi.fn();
    mock.api.runtime.onMessage.emit({ type: 'b2c:diagnostics:clear' }, { id: 'test', url: 'chrome-extension://test/options.html' }, reply);
    await pending; await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ ok: true, result: undefined }));
    expect(mock.api.storage.local.data[LOG_KEY]).toBeUndefined();
    await logger.record('core', new Error()); expect(readRing(mock.api.storage.local.data[LOG_KEY], [])).toHaveLength(1); logger.stop();
  });
  it('accepts sanitized content reports but only options can list or clear them', async () => {
    const logger = installDiagnostics(['cards']); const reply = vi.fn();
    const sender = { id: 'test', url: 'https://canvas.b2c-mock.test/' };
    mock.api.runtime.onMessage.emit({ type: 'b2c:diagnostics:record', event: errorEvent('cards', new Error(), 'dashboard', 'stop', 1) }, sender, reply);
    await vi.waitFor(() => expect(reply).toHaveBeenCalled()); reply.mockClear();
    mock.api.runtime.onMessage.emit({ type: 'b2c:diagnostics:clear' }, sender, reply);
    expect(reply).not.toHaveBeenCalled(); expect(readRing(mock.api.storage.local.data[LOG_KEY], ['cards'])).toHaveLength(1); logger.stop();
  });
});
