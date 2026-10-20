// The env-main wrapper must be the Agent kit's text, verbatim (CONTRACT.md §2).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const DEV = path.resolve(import.meta.dirname, '../..');
const KIT = path.join(DEV, '../agentkit/tests/describe-wrapper.js');
const OURS = path.join(DEV, 'src/core/agent/wrapper.js');

describe('agent wrapper', () => {
  // agentkit/ lives beside dev/ in the project, not in every checkout.
  it.skipIf(!fs.existsSync(KIT))('is verbatim agentkit/tests/describe-wrapper.js', () => {
    const ours = fs.readFileSync(OURS, 'utf8');
    const body = ours.split('// --- BEGIN agentkit wrapper ---\n')[1]!.split('// --- END agentkit wrapper ---')[0]!;
    expect(body).toBe(fs.readFileSync(KIT, 'utf8'));
  });

  it('matches concurrent answers by id', async () => {
    vi.resetModules();
    delete (window as { b2cAgent?: unknown }).b2cAgent;
    const { installB2cAgent } = await import('../../src/core/agent/wrapper.js');
    installB2cAgent();
    installB2cAgent(); // idempotent
    const seen: { id: string; from?: string }[] = [];
    const h = (e: Event) => seen.push(JSON.parse((e as CustomEvent<string>).detail));
    document.addEventListener('b2c:describe', h);
    const agent = (window as unknown as { b2cAgent: { describe(r?: object): Promise<{ id: string; echo: string | null }> } }).b2cAgent;
    const a = agent.describe({ from: '2026-10-01' });
    const b = agent.describe({ id: 'mine' });
    document.removeEventListener('b2c:describe', h);
    expect(seen[1]!.id).toBe('mine');
    for (const r of [...seen].reverse()) {
      document.dispatchEvent(new CustomEvent('b2c:described', { detail: JSON.stringify({ $b2c: 'describe', v: 1, id: r.id, echo: r.from ?? null }) }));
    }
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.echo).toBe('2026-10-01');
    expect(rb).toMatchObject({ id: 'mine', echo: null });
  });
});
