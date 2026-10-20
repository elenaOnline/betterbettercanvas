import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeMock } from './support/chrome.ts';
import { runMigrations } from '../../src/core/settings/migrate.ts';

afterEach(() => vi.unstubAllGlobals());

describe('settings migrations', () => {
  it('runs pending migrations once, in order, moving keys across areas', async () => {
    const mock = chromeMock();
    vi.stubGlobal('fetch', async () => ({ json: async () => ({ settings: { 'new.big': { area: 'local' }, 'new.small': { area: 'sync' } } }) }));
    await chrome.storage.sync.set({ 'old.a': 1, 'old.b': 'x' });
    const m1 = { id: 'm1', run: (s: Record<string, unknown>) => ({ set: { 'new.small': s['old.a'], 'new.big': { b: s['old.b'] } }, remove: ['old.a', 'old.b'] }) };
    const m2 = { id: 'm2', run: (s: Record<string, unknown>) => ({ set: { 'new.small': (s['new.small'] as number) + 1 }, remove: [] }) };
    expect(await runMigrations([m1, m2])).toEqual(['m1', 'm2']);
    expect(mock.api.storage.sync.data).toEqual({ 'new.small': 2 });
    expect(mock.api.storage.local.data['new.big']).toEqual({ b: 'x' });
    expect(await runMigrations([m1, m2])).toEqual([]); // idempotent
  });
});
