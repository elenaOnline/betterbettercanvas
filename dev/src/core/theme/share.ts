// Share codes: no server. Two kinds, so a token-only paste can never carry CSS:
//   b2c-theme:<base64url(deflate-raw(JSON))>   tokens only (gallery, public sharing)
//   b2c-rice:<base64url(deflate-raw(JSON))>    tokens plus custom CSS (person to person)
// Either may sit in a URL fragment (…#b2c-theme:…). Decoding a theme code
// drops any `css` it carries; decoding a rice code keeps it, and parse()
// sanitises it.

import type { Theme } from './format.ts';

export const THEME_PREFIX = 'b2c-theme:';
export const RICE_PREFIX = 'b2c-rice:';
export type ShareKind = 'theme' | 'rice';
/** Decompressed size cap (a theme is ≤ 4 KB, CSS ≤ 32 KB): stops a deflate bomb early. */
const MAX_JSON = 48 * 1024;

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, cap = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > cap) { await reader.cancel(); throw new Error('too big'); }
    chunks.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/**
 * A share code for a theme. `kind: 'theme'` (the default) never includes CSS;
 * `kind: 'rice'` includes it when the theme has some.
 */
export async function encodeShare(theme: Theme, kind: ShareKind = 'theme'): Promise<string> {
  const { css, ...tokens } = theme;
  const body = kind === 'rice' && css ? { ...tokens, css } : tokens;
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(body)), new CompressionStream('deflate-raw'));
  return (kind === 'rice' ? RICE_PREFIX : THEME_PREFIX) + b64url(packed);
}

export interface Decoded {
  kind: ShareKind;
  /** The JSON object inside (not yet validated: pass it to parse()). */
  data: unknown;
  /** Notes, e.g. CSS that a theme code wasn't allowed to carry. */
  notes: string[];
}

/** Find a share code in pasted text (a bare code, or a link with one in its fragment). */
export function findShare(text: string): { kind: ShareKind; code: string } | null {
  const m = /(b2c-theme|b2c-rice):([A-Za-z0-9_-]+)/.exec(text);
  if (!m) return null;
  return { kind: m[1] === 'b2c-rice' ? 'rice' : 'theme', code: m[2]! };
}

/** Decode a share code. Throws an Error with a plain message when it can't. */
export async function decodeShare(text: string): Promise<Decoded> {
  const found = findShare(text.trim());
  if (!found) throw new Error("That isn't a b²c theme code (they start with b2c-theme: or b2c-rice:).");
  const bytes = unb64url(found.code);
  if (!bytes) throw new Error('That theme code is damaged. Copy it again, all of it.');
  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_JSON));
  } catch (e) {
    throw new Error((e as Error).message === 'too big' ? 'That theme code is too big to be a b²c theme.' : 'That theme code is damaged. Copy it again, all of it.');
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('That theme code is damaged. Copy it again, all of it.');
  }
  const notes: string[] = [];
  if (found.kind === 'theme' && data && typeof data === 'object' && 'css' in data) {
    delete (data as Record<string, unknown>).css;
    notes.push("A theme code can't carry custom CSS, so the CSS in this one was ignored. Ask for a rice code (b2c-rice:) to share CSS.");
  }
  return { kind: found.kind, data, notes };
}
