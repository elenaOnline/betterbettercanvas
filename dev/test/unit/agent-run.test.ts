// The chunk's event handling: errors still answer (contract §2 "Other field rules").
import { describe, expect, it } from 'vitest';
import { chromeMock } from './support/chrome.ts';
import { createAgent, readCaches } from '../../src/core/agent/run.ts';
import { createDom } from '../../src/core/dom.ts';
import type { Ctx } from '../../src/core/ctx.ts';

(globalThis as { __B2C_BUILD_ID__?: string }).__B2C_BUILD_ID__ = 'test';

const answer = (detail: string, ctx: Ctx) =>
  new Promise<Record<string, unknown>>(ok => {
    document.addEventListener('b2c:described', e => ok(JSON.parse((e as CustomEvent<string>).detail)), { once: true });
    void createAgent(ctx).handle(detail, {});
  });

const ctx = (env: () => Promise<unknown>) =>
  ({ env, now: () => new Date('2026-10-21T10:00:00-07:00'), page: { kind: 'dashboard', courseId: null, itemId: null }, dom: createDom(), data: {} } as unknown as Ctx);

describe('agent run', () => {
  it('a failure answers { $b2c, v, id, error } instead of timing out', async () => {
    chromeMock();
    const d = await answer(JSON.stringify({ v: 1, id: 'e1' }), ctx(() => Promise.reject(new Error('boom'))));
    expect(d).toEqual({ $b2c: 'describe', v: 1, id: 'e1', error: 'boom' });
    expect(document.getElementById('b2c-describe')).toBeNull();
  });

  it('echoes the id, answers from cache only, and reads must-view requirements from module caches', async () => {
    const { api } = chromeMock();
    const p = 'b2c:cache:1001:';
    await api.storage.local.set({
      [`${p}/courses/118200/modules?include[]=items&include[]=content_details&per_page=100`]: { t: 1, data: [{ id: 'm', name: 'W1', position: 1, items: [{ id: '9', title: 'A3', type: 'Assignment', content_id: '11820003', completion_requirement: { type: 'must_view', completed: false } }] }] },
      [`${p}/courses/118207/modules/55/items?include[]=content_details&per_page=100`]: { t: 1, data: [{ id: '8', title: 'P', type: 'Page', page_url: 'notes', completion_requirement: { type: 'must_view', completed: false } }] },
      [`${p}/planner/items?start_date=x`]: { t: 1, data: [] },
    });
    const c = await readCaches('1001', { from: 0, to: Date.now() * 2 });
    expect([...c.mustView].sort()).toEqual(['/courses/118200/assignments/11820003', '/courses/118207/pages/notes']);
    const d = await answer(JSON.stringify({ v: 1, id: 'ok' }), ctx(async () => ({ current_user_id: '1001', TIMEZONE: 'America/Los_Angeles' })));
    expect(d).toMatchObject({ $b2c: 'describe', v: 1, id: 'ok', userId: '1001', timeZone: 'America/Los_Angeles', courses: [], due: [] });
    expect(document.getElementById('b2c-describe')?.textContent).toContain('"id":"ok"');
  });
});
