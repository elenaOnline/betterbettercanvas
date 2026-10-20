// Runs pending migrations (src/core/settings/migrations.ts) against
// chrome.storage. Called by the SW on install/update; idempotent.
import { MIGRATIONS, type Migration } from './migrations.ts';
import type { Flat } from './store.ts';

const APPLIED_KEY = 'b2c:migrations';

export async function runMigrations(migrations: readonly Migration[] = MIGRATIONS): Promise<string[]> {
  const applied = new Set(((await chrome.storage.local.get(APPLIED_KEY))[APPLIED_KEY] as string[] | undefined) ?? []);
  const pending = migrations.filter(m => !applied.has(m.id));
  if (!pending.length) return [];
  // Areas come from the built schema (the SW doesn't bundle feature code).
  let areas: Record<string, { area: 'sync' | 'local' }> = {};
  try {
    areas = (await (await fetch(chrome.runtime.getURL('schema.json'))).json()).settings;
  } catch {
    /* unit tests / missing schema: default to sync for unknown keys */
  }
  const done: string[] = [];
  for (const m of pending) {
    const [s, l] = await Promise.all([chrome.storage.sync.get(null), chrome.storage.local.get(null)]);
    const stored: Flat = { ...s, ...l };
    const { set, remove } = m.run(stored);
    const sync: Flat = {}, local: Flat = {};
    for (const [k, v] of Object.entries(set)) (areas[k]?.area === 'local' ? local : sync)[k] = v;
    await Promise.all([
      Object.keys(sync).length ? chrome.storage.sync.set(sync) : null,
      Object.keys(local).length ? chrome.storage.local.set(local) : null,
      remove.length ? chrome.storage.sync.remove(remove) : null,
      remove.length ? chrome.storage.local.remove(remove) : null,
    ]);
    applied.add(m.id);
    done.push(m.id);
    await chrome.storage.local.set({ [APPLIED_KEY]: [...applied] });
  }
  return done;
}
