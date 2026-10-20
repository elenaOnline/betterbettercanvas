// Settings store over chrome.storage. One storage item per setting key, in the
// area the schema names. Reads fill defaults and coerce bad values.

import { coerce, type Setting } from './schema.ts';

export type Flat = Record<string, unknown>;

export function createStore(schema: Record<string, Setting>) {
  const keys = Object.keys(schema);
  const byArea = (area: 'sync' | 'local') => keys.filter(k => schema[k]!.area === area);

  const normalize = (raw: Flat): Flat => {
    const out: Flat = {};
    for (const k of keys) out[k] = coerce(schema[k]!, raw[k]);
    return out;
  };

  return {
    schema,

    async load(): Promise<Flat> {
      const [s, l] = await Promise.all([
        chrome.storage.sync.get(byArea('sync')),
        chrome.storage.local.get(byArea('local')),
      ]);
      return normalize({ ...s, ...l });
    },

    async set(values: Flat): Promise<void> {
      const sync: Flat = {}, local: Flat = {};
      for (const [k, v] of Object.entries(values)) {
        const s = schema[k];
        if (!s) throw new Error(`unknown setting ${k}`);
        (s.area === 'sync' ? sync : local)[k] = coerce(s, v);
      }
      await Promise.all([
        Object.keys(sync).length ? chrome.storage.sync.set(sync) : null,
        Object.keys(local).length ? chrome.storage.local.set(local) : null,
      ]);
    },

    async reset(keysToReset: string[] = keys): Promise<void> {
      await Promise.all([
        chrome.storage.sync.remove(keysToReset.filter(k => schema[k]?.area === 'sync')),
        chrome.storage.local.remove(keysToReset.filter(k => schema[k]?.area === 'local')),
      ]);
    },

    /** Calls back with the full normalized settings and the keys that changed. */
    subscribe(cb: (all: Flat, changed: string[]) => void): () => void {
      const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area !== 'sync' && area !== 'local') return;
        const changed = Object.keys(changes).filter(k => schema[k]?.area === area);
        if (changed.length) void this.load().then(all => cb(all, changed));
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    },
  };
}

export type Store = ReturnType<typeof createStore>;
