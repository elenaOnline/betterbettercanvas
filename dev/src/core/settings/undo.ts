// Settings changes with Undo (import, reset, theme apply). Core, so features
// and core/theme can use it without importing a feature module.
import type { Flat, Store } from './store.ts';

function featureKeys(schema: Record<string, unknown>, feature?: string): string[] {
  return Object.keys(schema).filter(key => feature === undefined || key.startsWith(feature + '.'));
}

/**
 * Storage a feature keeps outside the schema that must follow its settings on
 * reset (else it resurrects them): dashboard-notes' cross-device mirror in
 * chrome.storage.sync (b2c:notes, b2c:notes:0..n).
 */
export const SATELLITES: Record<string, RegExp> = {
  'dashboard-notes': /^b2c:notes(?::\d+)?$/,
};

async function satelliteSnapshot(feature?: string): Promise<Flat> {
  const patterns = Object.entries(SATELLITES).filter(([id]) => feature === undefined || id === feature).map(([, re]) => re);
  if (!patterns.length) return {};
  const all = await chrome.storage.sync.get(null);
  return Object.fromEntries(Object.entries(all).filter(([k]) => patterns.some(re => re.test(k))));
}

/** Reset/import goes through Store, so Canvas receives normal live updates.
 * Undo restores only touched keys and expires after ten seconds. */
export async function changeWithUndo(store: Store, operation: { values: Flat } | { feature?: string }, now: () => number = Date.now) {
  const keys = 'values' in operation ? Object.keys(operation.values) : featureKeys(store.schema, operation.feature);
  const before = await store.load();
  const snapshot = Object.fromEntries(keys.map(key => [key, before[key]]));
  // A reset also clears the feature's out-of-schema storage (restored by Undo).
  const satellites = 'values' in operation ? {} : await satelliteSnapshot(operation.feature);
  if (Object.keys(satellites).length) await chrome.storage.sync.remove(Object.keys(satellites));
  // Settle both storage areas before offering undo or rolling back. A failure
  // in local storage must not leave the sync half of an import applied.
  const byArea = (area: 'local' | 'sync') => keys.filter(key => store.schema[key]?.area === area);
  const results = await Promise.allSettled((['local', 'sync'] as const).map(area => {
    const selected = byArea(area);
    if ('values' in operation) return store.set(Object.fromEntries(selected.map(key => [key, operation.values[key]])));
    return store.reset(selected);
  }));
  if (results.some(result => result.status === 'rejected')) {
    await store.set(snapshot);
    throw new Error('Settings could not be saved; previous settings restored.');
  }
  const expires = now() + 10_000;
  let used = false;
  return async () => {
    if (used || now() >= expires) return false;
    await store.set(snapshot);
    if (Object.keys(satellites).length) await chrome.storage.sync.set(satellites);
    used = true;
    return true;
  };
}
