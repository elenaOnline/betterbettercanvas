import { vi } from 'vitest';
export function event() {
  const listeners = new Set<(...args: any[]) => any>();
  return { listeners, addListener: vi.fn((f: (...args: any[]) => any) => listeners.add(f)), removeListener: vi.fn((f: (...args: any[]) => any) => listeners.delete(f)), emit: (...args: any[]) => [...listeners].map(f => f(...args)) };
}
export function chromeMock() {
  const changed = event();
  const area = (name: string) => {
    const data: Record<string, unknown> = {};
    return { data,
      get: vi.fn(async (keys?: string | string[] | null) => Object.fromEntries((keys == null ? Object.keys(data) : typeof keys === 'string' ? [keys] : keys).filter(k => k in data).map(k => [k, data[k]]))),
      set: vi.fn(async (values: Record<string, unknown>) => {
        const changes = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { oldValue: data[k], newValue: v }]));
        Object.assign(data, values); changed.emit(changes, name);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const changes = Object.fromEntries((typeof keys === 'string' ? [keys] : keys).map(k => [k, { oldValue: data[k] }]));
        for (const k of Object.keys(changes)) delete data[k]; changed.emit(changes, name);
      }),
    };
  };
  const permissions = new Set<string>();
  const scripts = new Map<string, chrome.scripting.RegisteredContentScript>();
  const runtime = { id: 'test', getURL: (p: string) => `chrome-extension://test/${p}`, getManifest: () => ({ version: '0.1.0' }), onMessage: event(), onInstalled: event(), sendMessage: vi.fn() };
  const api = {
    runtime,
    storage: { local: area('local'), sync: area('sync'), session: area('session'), onChanged: changed },
    permissions: {
      contains: vi.fn(async (p: { origins: string[] }) => p.origins.every(o => permissions.has(o))),
      request: vi.fn(async (p: { origins: string[] }) => { p.origins.forEach(o => permissions.add(o)); return true; }),
      remove: vi.fn(async (p: { origins: string[] }) => { p.origins.forEach(o => permissions.delete(o)); return true; }),
      onRemoved: event(),
      onAdded: event(),
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => [...scripts.values()]),
      registerContentScripts: vi.fn(async (items: chrome.scripting.RegisteredContentScript[]) => { items.forEach(s => scripts.set(s.id, s)); }),
      updateContentScripts: vi.fn(async (items: chrome.scripting.RegisteredContentScript[]) => { items.forEach(s => scripts.set(s.id, s)); }),
      unregisterContentScripts: vi.fn(async (filter: { ids: string[] }) => { filter.ids.forEach(id => scripts.delete(id)); }),
      executeScript: vi.fn(async () => []), insertCSS: vi.fn(async () => {}), removeCSS: vi.fn(async () => {}),
    },
    tabs: { query: vi.fn(async (): Promise<chrome.tabs.Tab[]> => []), create: vi.fn(async () => ({})), reload: vi.fn(async () => {}) },
  };
  vi.stubGlobal('chrome', api);
  return { api, permissions, scripts };
}
