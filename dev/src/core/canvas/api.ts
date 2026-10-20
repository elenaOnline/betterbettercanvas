// Canvas REST client for content scripts. Same-origin fetch: the user's own
// session cookies authenticate it, so b²c never holds a token.
//
// swr() is the main entry point: it hands back cached data at once (if any),
// then revalidates and hands back fresh data only if it changed.

export interface GetOpts {
  /** Follow Link rel="next" pages and concatenate arrays. Default true. */
  all?: boolean;
  /** Max pages when following. Default 20. */
  maxPages?: number;
}

export interface SwrOpts extends GetOpts {
  /** Cache entries younger than this are not revalidated. Default 60 s. */
  ttlMs?: number;
}

interface CacheEntry<T> { t: number; data: T }

export class ApiError extends Error {
  constructor(readonly status: number, readonly path: string) {
    super(`Canvas API ${status} for ${path}`);
  }
}

const CACHE_PREFIX = 'b2c:cache:';

export function csrfToken(cookie = document.cookie): string | null {
  const m = cookie.match(/(?:^|;\s*)_csrf_token=([^;]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function createApi(opts: { userId: () => Promise<string | null>; origin?: string; now?: () => number }) {
  const origin = opts.origin ?? location.origin;
  const now = opts.now ?? Date.now;
  const inflight = new Map<string, Promise<unknown>>();

  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json+canvas-string-ids, application/json' };
    if (method !== 'GET') {
      const t = csrfToken();
      if (t) headers['X-CSRF-Token'] = t;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
    }
    const url = path.startsWith('http') ? path : `${origin}/api/v1${path}`;
    const res = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new ApiError(res.status, path);
    return res;
  }

  const parse = async (res: Response) => {
    const text = await res.text();
    return JSON.parse(text.replace(/^while\(1\);/, ''));
  };

  async function get<T>(path: string, o: GetOpts = {}): Promise<T> {
    const key = `${path}|${o.all !== false}|${o.maxPages ?? 20}`;
    const hit = inflight.get(key);
    if (hit) return hit as Promise<T>;
    const p = (async () => {
      let res = await request('GET', path);
      let data = await parse(res);
      if (o.all === false || !Array.isArray(data)) return data as T;
      const out: unknown[] = [...data];
      let next = nextLink(res.headers.get('Link'));
      for (let i = 1; next && i < (o.maxPages ?? 20); i++) {
        res = await request('GET', next);
        data = await parse(res);
        if (Array.isArray(data)) out.push(...data);
        next = nextLink(res.headers.get('Link'));
      }
      return out as T;
    })();
    inflight.set(key, p);
    try {
      return await p;
    } finally {
      inflight.delete(key);
    }
  }

  async function cacheKey(path: string) {
    return `${CACHE_PREFIX}${(await opts.userId()) ?? 'anon'}:${path}`;
  }

  /**
   * Stale-while-revalidate. `onData` fires with cached data immediately (if
   * any), then again with fresh data if it differs. Resolves with the final data.
   */
  async function swr<T>(path: string, onData: (data: T, fresh: boolean) => void, o: SwrOpts = {}): Promise<T> {
    const ttl = o.ttlMs ?? 60_000;
    const key = await cacheKey(path);
    const stored = (await chrome.storage.local.get(key))[key] as CacheEntry<T> | undefined;
    if (stored) {
      onData(stored.data, false);
      if (now() - stored.t < ttl) return stored.data;
    }
    const data = await get<T>(path, o);
    const changed = !stored || JSON.stringify(stored.data) !== JSON.stringify(data);
    await chrome.storage.local.set({ [key]: { t: now(), data } satisfies CacheEntry<T> });
    if (changed) onData(data, true);
    return data;
  }

  /**
   * Follow a cached path across tabs: fires whenever any tab writes a fresh
   * response for it (e.g. another tab revalidated colours). Returns unsubscribe.
   */
  function watch<T>(path: string, onData: (data: T) => void): () => void {
    let key: string | null = null;
    void cacheKey(path).then(k => (key = k));
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !key || !(key in changes)) return;
      const v = changes[key]!.newValue as CacheEntry<T> | undefined;
      if (v) onData(v.data);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  /**
   * Rewrite a cached response in place (after a successful write), so the next
   * warm load and every watcher (this tab and others) see the new state.
   */
  async function patchCache<T>(path: string, fn: (data: T) => T): Promise<void> {
    const key = await cacheKey(path);
    const stored = (await chrome.storage.local.get(key))[key] as CacheEntry<T> | undefined;
    if (stored) await chrome.storage.local.set({ [key]: { t: stored.t, data: fn(stored.data) } satisfies CacheEntry<T> });
  }

  const send = async <T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) =>
    parse(await request(method, path, body)) as Promise<T>;

  return {
    get,
    swr,
    watch,
    patchCache,
    post: <T>(path: string, body?: unknown) => send<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => send<T>('PUT', path, body),
    del: <T>(path: string) => send<T>('DELETE', path),
  };
}

export type Api = ReturnType<typeof createApi>;
