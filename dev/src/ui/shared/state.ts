// Settings state for the popup and the settings page: one signal holding the
// flat, normalized settings, kept in sync with chrome.storage both ways.
//
// The schema is passed in: the settings page uses the full registry; the
// popup reads the built schema.json, so it doesn't bundle every feature's
// code and opens fast.
import { signal } from '@preact/signals';
import type { Setting } from '../../core/settings/schema.ts';
import { createStore, type Flat, type Store } from '../../core/settings/store.ts';

export type Schema = Record<string, Setting>;
// Live bindings: set once by initSettings, before anything renders.
export let schema: Schema = {};
export let store: Store = createStore({});
export const values = signal<Flat>({});
export const loaded = signal(false);

export async function initSettings(s: Schema | Promise<Schema>) {
  schema = await s;
  store = createStore(schema);
  store.subscribe(all => (values.value = all));
  values.value = await store.load();
  loaded.value = true;
}

/** The built schema.json (keys, kinds, defaults, ranges; no validators). */
export async function builtSchema(): Promise<Schema> {
  return (await (await fetch(chrome.runtime.getURL('schema.json'))).json()).settings as Schema;
}

/** Apply a patch now (optimistically) and store it. Open Canvas tabs follow
 *  through chrome.storage.onChanged. */
export function apply(patch: Record<string, unknown>): Promise<void> {
  const known = Object.fromEntries(Object.entries(patch).filter(([k]) => schema[k]));
  if (!Object.keys(known).length) return Promise.resolve();
  values.value = { ...values.value, ...known };
  return store.set(known);
}

/** Current values of the patch's keys, for Undo. */
export function snapshot(keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter(k => schema[k]).map(k => [k, structuredClone(values.value[k])]));
}
