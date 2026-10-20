import { describe, expect, it } from 'vitest';
import { CHUNK_CHARS, chunk } from '../../src/features/dashboard-notes/sync.ts';

describe('notes sync chunks', () => {
  it('round-trips and respects the chunk size', () => {
    const text = 'abc\n'.repeat(2000);
    const parts = chunk(text);
    expect(parts.join('')).toBe(text);
    expect(parts.every(p => p.length <= CHUNK_CHARS)).toBe(true);
    expect(chunk('')).toEqual([]);
  });
  it('never splits a surrogate pair', () => {
    const text = 'a'.repeat(CHUNK_CHARS - 1) + '😀' + 'b';
    const parts = chunk(text);
    expect(parts.join('')).toBe(text);
    for (const p of parts) expect(p).not.toMatch(/^[\udc00-\udfff]|[\ud800-\udbff]$/);
    // Each chunk fits a sync item (8 KB) even at 4 bytes per char.
    for (const p of parts) expect(new TextEncoder().encode(JSON.stringify(p)).length).toBeLessThan(8000);
  });
});
