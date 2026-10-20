// Notes live in chrome.storage.local (no size cap) and are mirrored to
// chrome.storage.sync in chunks so they follow her across devices.
// sync limits: 8 KB per item, ~100 KB total, shared with every setting, so
// notes get at most MAX_SYNC_CHARS and chunks small enough for any UTF-8.

export const META = 'b2c:notes';
export const CHUNK = (i: number) => `b2c:notes:${i}`;
export const CHUNK_CHARS = 1800; // ≤ 4 bytes/char UTF-8 → < 8 KB per item
export const MAX_SYNC_CHARS = 48_000;

export interface Meta { at: number; n: number }

export function chunk(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_CHARS) {
    // Don't split a surrogate pair across chunks.
    let end = Math.min(i + CHUNK_CHARS, text.length);
    const code = text.charCodeAt(end - 1);
    if (end < text.length && code >= 0xd800 && code <= 0xdbff) end--;
    out.push(text.slice(i, end));
    i = end - CHUNK_CHARS;
  }
  return out;
}

/** Write notes to sync. Returns false when they're too long to sync. */
export async function pushSync(text: string, at: number): Promise<boolean> {
  if (text.length > MAX_SYNC_CHARS) return false;
  const parts = chunk(text);
  const old = ((await chrome.storage.sync.get(META))[META] as Meta | undefined)?.n ?? 0;
  const items: Record<string, unknown> = { [META]: { at, n: parts.length } satisfies Meta };
  parts.forEach((p, i) => (items[CHUNK(i)] = p));
  await chrome.storage.sync.set(items);
  const stale = Array.from({ length: Math.max(0, old - parts.length) }, (_, i) => CHUNK(parts.length + i));
  if (stale.length) await chrome.storage.sync.remove(stale);
  return true;
}

export async function pullSync(): Promise<{ text: string; at: number } | null> {
  const meta = (await chrome.storage.sync.get(META))[META] as Meta | undefined;
  if (!meta || typeof meta.n !== 'number') return null;
  const keys = Array.from({ length: meta.n }, (_, i) => CHUNK(i));
  const got = keys.length ? await chrome.storage.sync.get(keys) : {};
  if (keys.some(k => typeof got[k] !== 'string')) return null; // mid-write from another device
  return { text: keys.map(k => got[k] as string).join(''), at: meta.at };
}
