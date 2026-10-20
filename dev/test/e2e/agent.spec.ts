// Agent contract §1–§3 (agentkit/CONTRACT.md) on the mock. Headless, throwaway
// profile (fixtures.ts). Agent kit tests the same contract from outside.
import type { Page, Request } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const NOW = '2026-10-21T10:00:00-07:00';
const COURSE = '118200';

async function open(page: Page, path = '/') {
  await page.addInitScript(n => localStorage.setItem('b2c_now', n), NOW);
  await page.goto(CANVAS + path);
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
}

/** Canvas's own elements only (Playwright locators pierce b²c's shadow roots, whose rows carry anchors always). */
const lightCount = (page: Page, sel: string) => page.evaluate(s => document.querySelectorAll(s).length, sel);

/** Settle: let features finish their own requests so we only see describe's. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
}

type Described = Record<string, any>;

/** window.b2cAgent.describe, timed in the page. */
const describeCall = (page: Page, req: Record<string, unknown> = {}) =>
  page.evaluate(async r => {
    const t0 = performance.now();
    const d = await (window as any).b2cAgent.describe(r);
    return { d: d as Record<string, any>, ms: performance.now() - t0 };
  }, req);

/** The raw event pair, without the wrapper; resolves null if nothing answers in `wait` ms. */
const rawDescribe = (page: Page, wait = 600) =>
  page.evaluate(
    w =>
      new Promise<unknown>(ok => {
        const id = 'raw-' + Math.random();
        const t = setTimeout(() => ok(null), w);
        document.addEventListener('b2c:described', e => {
          const d = JSON.parse((e as CustomEvent<string>).detail);
          if (d.id === id) (clearTimeout(t), ok(d));
        });
        document.dispatchEvent(new CustomEvent('b2c:describe', { detail: JSON.stringify({ v: 1, id }) }));
      }),
    wait,
  );

/** Canvas requests the page makes while `fn` runs (content-script fetches included). */
async function requestsDuring<T>(page: Page, fn: () => Promise<T>) {
  const reqs: Request[] = [];
  const on = (r: Request) => {
    if (r.url().startsWith(CANVAS)) reqs.push(r);
  };
  page.on('request', on);
  try {
    const out = await fn();
    await page.waitForTimeout(150);
    return { out, reqs: reqs.map(r => ({ method: r.method(), path: new URL(r.url()).pathname + new URL(r.url()).search })) };
  } finally {
    page.off('request', on);
  }
}

// ── JSON schema for the §2 response, written from the contract ──────────────
const ISO = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?[+-]\\d{2}:\\d{2}$';
const ABS = '^https://';
const TYPEID = '^[a-z_]+:[^:\\s]+$';
const STATES = ['excused', 'graded', 'submitted', 'done', 'missing', 'late', 'overdue', 'past', 'upcoming'];
const S = {
  type: 'object',
  required: ['$b2c', 'v', 'id', 'build', 'at', 'origin', 'timeZone', 'userId', 'page', 'courses', 'due', 'onPage', 'fresh', 'readSafety'],
  properties: {
    $b2c: { enum: ['describe'] },
    v: { enum: [1] },
    id: { type: 'string' },
    build: { type: 'string' },
    at: { type: 'string', pattern: ISO },
    origin: { type: 'string', pattern: ABS },
    timeZone: { type: 'string' },
    userId: { type: ['string', 'null'] },
    page: {
      type: 'object',
      required: ['kind', 'courseId', 'itemId', 'title', 'url', 'marksRead'],
      properties: {
        kind: { type: 'string' }, courseId: { type: ['string', 'null'] }, itemId: { type: ['string', 'null'], pattern: TYPEID },
        title: { type: 'string' }, url: { type: 'string', pattern: ABS }, marksRead: { type: 'boolean' },
      },
    },
    courses: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'nickname', 'code', 'term', 'color', 'url', 'favorite'],
        properties: {
          id: { type: 'string', pattern: '^course:\\d' }, name: { type: 'string' }, nickname: { type: ['string', 'null'] },
          code: { type: ['string', 'null'] }, term: { type: ['string', 'null'] }, color: { type: ['string', 'null'], pattern: '^#' },
          url: { type: 'string', pattern: ABS }, favorite: { type: ['boolean', 'null'] },
        },
      },
    },
    due: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'courseId', 'title', 'type', 'due', 'posted', 'points', 'state', 'doneInB2c', 'url', 'marksRead'],
        properties: {
          id: { type: 'string', pattern: TYPEID }, courseId: { type: ['string', 'null'], pattern: '^course:' }, title: { type: 'string' },
          type: { type: 'string' }, due: { type: ['string', 'null'], pattern: ISO }, posted: { type: ['string', 'null'], pattern: ISO },
          points: { type: ['number', 'null'] }, state: { enum: STATES }, doneInB2c: { type: 'boolean' },
          url: { type: ['string', 'null'], pattern: ABS }, marksRead: { type: 'boolean' },
        },
      },
    },
    onPage: {
      type: 'array',
      items: { type: 'object', required: ['id', 'selector', 'shadowHost'], properties: { id: { type: 'string' }, selector: { type: 'string' }, shadowHost: { type: ['string', 'null'] } } },
    },
    fresh: { type: 'object', required: ['courses', 'due'], properties: { courses: { type: ['string', 'null'], pattern: ISO }, due: { type: ['string', 'null'], pattern: ISO } } },
    readSafety: {
      type: 'object',
      required: ['marksReadPaths', 'readSafeApi'],
      properties: { marksReadPaths: { type: 'array', items: { type: 'string' } }, readSafeApi: { type: 'array', items: { type: 'string', pattern: '^GET /api/v1/' } } },
    },
  },
};

/** Minimal JSON-schema check (type, enum, pattern, required, properties, items). Returns errors. */
function validate(schema: any, v: unknown, at = '$'): string[] {
  const errs: string[] = [];
  const typeOf = (x: unknown) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);
  if (schema.enum && !schema.enum.includes(v)) errs.push(`${at}: ${JSON.stringify(v)} not in ${schema.enum}`);
  if (schema.type) {
    const ok = [schema.type].flat();
    if (!ok.includes(typeOf(v))) return [...errs, `${at}: ${typeOf(v)} is not ${ok}`];
  }
  if (schema.pattern && typeof v === 'string' && !new RegExp(schema.pattern).test(v)) errs.push(`${at}: "${v}" !~ ${schema.pattern}`);
  if (schema.required) for (const k of schema.required) if (!(k in (v as object))) errs.push(`${at}.${k}: missing`);
  if (schema.properties && v && typeof v === 'object') {
    for (const [k, s] of Object.entries(schema.properties)) if (k in (v as object)) errs.push(...validate(s, (v as any)[k], `${at}.${k}`));
  }
  if (schema.items && Array.isArray(v)) v.forEach((x, i) => errs.push(...validate(schema.items, x, `${at}[${i}]`)));
  return errs;
}

const MARK_READ = /mark_read|bulk_mark_read|read_all|\/read(\?|$)|\/conversations\/\d/;

test.beforeEach(async ({ context }) => {
  const p = await context.newPage();
  await p.request.post(CANVAS + '/__mock/reset');
  await p.close();
});

test('§1 detection: on by default, off live and after reload, on again live; absent while paused', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await open(page);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-b2c-agent', '1');
  expect(await page.evaluate(() => typeof (window as any).b2cAgent?.describe)).toBe('function');
  expect(await rawDescribe(page, 3000)).toMatchObject({ $b2c: 'describe', v: 1 });

  await setSettings({ 'core.agentContract': false });
  await expect(html).not.toHaveAttribute('data-b2c-agent', /.*/);
  expect(await rawDescribe(page)).toBeNull(); // nobody answers once it's off
  await page.reload();
  await expect(html).toHaveAttribute('data-b2c-instance', /.+/);
  await expect(html).not.toHaveAttribute('data-b2c-agent', /.*/);
  expect(await page.evaluate(() => 'b2cAgent' in window)).toBe(false);

  // On again, live: the attribute returns, env-main installs the wrapper, describe answers.
  await setSettings({ 'core.agentContract': true });
  await expect(html).toHaveAttribute('data-b2c-agent', '1');
  await expect.poll(() => page.evaluate(() => 'b2cAgent' in window)).toBe(true);
  expect((await describeCall(page)).d.$b2c).toBe('describe');

  await setSettings({ 'core.paused': true });
  await expect(html).not.toHaveAttribute('data-b2c-agent', /.*/);
  expect(await rawDescribe(page)).toBeNull();
});

test('§1 quiz-taking routes: no attribute, no wrapper, no answer', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await open(page); // writes the mirror with the attribute on
  await expect(page.locator('html')).toHaveAttribute('data-b2c-agent', '1');
  const { d } = await describeCall(page, { refresh: true, from: '2026-09-01', to: '2026-12-31' });
  const quiz = (d.due as { id: string; courseId: string }[]).find(x => x.id.startsWith('quiz:'));
  expect(quiz).toBeTruthy();
  const take = `${CANVAS}/courses/${quiz!.courseId.split(':')[1]}/quizzes/${quiz!.id.split(':')[1]}/take`;
  for (const quizSafe of ['nothing', 'colours']) {
    await setSettings({ 'core.quizSafe': quizSafe });
    await page.goto(take);
    await page.waitForTimeout(500);
    await expect(page.locator('html')).not.toHaveAttribute('data-b2c-agent', /.*/);
    expect(await page.evaluate(() => 'b2cAgent' in window)).toBe(false);
    expect(await rawDescribe(page)).toBeNull();
  }
});

test('§2 warm describe: no network, ≤ 50 ms, valid shape, also in <head>, ids echoed', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  await settle(page);
  // Cold: fill the caches the read-safe way.
  const first = await describeCall(page, { refresh: true });
  expect(first.d.courses.length).toBeGreaterThan(2);
  expect(first.d.due.length).toBeGreaterThan(2);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-b2c-agent', '1');
  await settle(page);
  const { out, reqs } = await requestsDuring(page, async () => [await describeCall(page), await describeCall(page, { id: 'second' })]);
  const [a, b] = out;
  console.log(`describe warm: first ${a!.ms.toFixed(1)} ms (incl. chunk load), second ${b!.ms.toFixed(1)} ms; ${a!.d.courses.length} courses, ${a!.d.due.length} due`);
  expect(reqs, 'refresh: false must not touch the network').toEqual([]);
  expect(a!.ms).toBeLessThanOrEqual(50);
  expect(b!.ms).toBeLessThanOrEqual(50);
  expect(b!.d.id).toBe('second');
  expect(a!.d.id).toMatch(/^b2c-/);

  const d = a!.d as Described;
  expect(validate(S, d)).toEqual([]);
  expect(d.origin).toBe(CANVAS);
  expect(d.timeZone).toBe('America/Los_Angeles');
  expect(d.at).toMatch(/^2026-10-21T10:0\d:\d\d-07:00$/); // b2c_now pins the start; the clock runs
  expect(d.page).toMatchObject({ kind: 'dashboard', url: CANVAS + '/', marksRead: false });
  // Oldest first, inside the default window (7 back, 14 ahead).
  const times = d.due.map((x: any) => x.due ?? x.posted).filter(Boolean).map((s: string) => Date.parse(s));
  expect(times).toEqual([...times].sort((x, y) => x - y));
  for (const t of times) {
    expect(t).toBeGreaterThanOrEqual(Date.parse(NOW) - 7 * 864e5 - 1);
    expect(t).toBeLessThan(Date.parse(NOW) + 14 * 864e5 + 1);
  }
  expect(new Set(d.due.map((x: any) => x.state)).size).toBeGreaterThan(2);
  expect(d.due.some((x: any) => x.marksRead)).toBe(true); // unread announcements / discussion topics
  for (const x of d.due) if (x.url) expect(new URL(x.url).pathname, x.id).not.toMatch(/^\/api\//);
  const ev = d.due.find((x: any) => x.type === 'calendar_event');
  if (ev) expect(ev.url).toMatch(/\/calendar\?event_id=\d+&include_contexts=(course|user)_\d+$/);
  // No bodies, ever.
  expect(JSON.stringify(d)).not.toMatch(/"(description|message|body|details)"/);

  // DOM copy, identical to the last answer.
  const script = await page.evaluate(() => document.querySelector('head > script#b2c-describe[type="application/json"]')?.textContent);
  expect(JSON.parse(script!)).toEqual(b!.d);

  // Missing beats graded: the mock's zero-for-missing items (Lab Report 3, Peer Review 2).
  const wide = (await describeCall(page, { refresh: true, from: '2026-08-01', to: '2026-12-31' })).d;
  const zeros = wide.due.filter((x: any) => /^(Lab Report 3|Peer Review 2)$/.test(x.title));
  expect(zeros.length).toBeGreaterThan(0);
  for (const z of zeros) expect(z.state, z.title).toBe('missing');

  // Concurrent callers each get their own answer.
  const both = await page.evaluate(() => Promise.all([(window as any).b2cAgent.describe({ id: 'x', from: '2026-10-01', to: '2026-10-05' }), (window as any).b2cAgent.describe({ id: 'y' })]));
  expect(both.map(r => r.id)).toEqual(['x', 'y']);
  expect(both[0].due.length).not.toBe(both[1].due.length);
});

test('§2 refresh: only read-safe GETs (courses, planner/items), throttled to once per 60 s', async ({ context }) => {
  const page = await context.newPage();
  await open(page, `/courses/${COURSE}/assignments`);
  await settle(page);
  const one = await requestsDuring(page, () => describeCall(page, { refresh: true }));
  console.log('refresh requests:', JSON.stringify(one.reqs));
  for (const r of one.reqs) {
    expect(r.method).toBe('GET');
    expect(r.path).toMatch(/^\/api\/v1\/(courses\?|planner\/items\?)/);
    expect(r.path).not.toMatch(MARK_READ);
  }
  const two = await requestsDuring(page, () => describeCall(page, { refresh: true }));
  expect(two.reqs, 'second refresh within 60 s').toEqual([]);
  expect(two.out.d.$b2c).toBe('describe');
});

test('§3 anchors: absent before describe, present after on cards, assignments and modules; marks-read links flagged; off removes them', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await open(page);
  await settle(page);
  await describeCall(page, { refresh: true }); // fill caches

  // Dashboard cards.
  await page.reload();
  await expect(page.locator('.ic-DashboardCard a.ic-DashboardCard__link').first()).toBeVisible();
  await expect(page.locator('.ic-DashboardCard[data-b2c-id]')).toHaveCount(0);
  expect(await lightCount(page, '[data-b2c-marks-read]')).toBe(0);
  const dash = (await describeCall(page)).d;
  const cards = page.locator('.ic-DashboardCard:has(a.ic-DashboardCard__link)');
  await expect(cards.first()).toHaveAttribute('data-b2c-id', /^course:\d+$/);
  const cardIds = await page.locator('.ic-DashboardCard[data-b2c-id]').evaluateAll(els => els.map(e => e.getAttribute('data-b2c-id')));
  expect(cardIds.length).toBe(await cards.count());
  for (const id of cardIds) expect(dash.onPage.map((o: any) => o.id)).toContain(id);
  expect(dash.onPage.every((o: any) => typeof o.selector === 'string')).toBe(true);

  // Assignments list.
  await page.goto(`${CANVAS}/courses/${COURSE}/assignments`);
  await expect(page.locator('#ag-list .ig-row').first()).toBeVisible();
  await expect(page.locator('#ag-list [data-b2c-id]')).toHaveCount(0);
  const asg = (await describeCall(page, { from: '2026-09-01', to: '2026-12-31' })).d;
  await expect(page.locator('#ag-list .ig-row[data-b2c-id]').first()).toBeVisible();
  const rows = await page.locator('#ag-list .ig-row[data-b2c-id]').evaluateAll(els =>
    els.map(e => ({ id: e.getAttribute('data-b2c-id'), course: e.getAttribute('data-b2c-course-id'), due: e.getAttribute('data-b2c-due'), state: e.getAttribute('data-b2c-state') })),
  );
  expect(rows.length).toBe(await page.locator('#ag-list .ig-row').count());
  for (const r of rows) {
    expect(r.id).toMatch(/^(assignment|quiz|discussion_topic):\d+$/);
    expect(r.course).toBe(`course:${COURSE}`);
    const known = asg.due.find((x: any) => x.id === r.id);
    // Anchors agree with what describe says.
    if (known) expect({ due: r.due, state: r.state }).toEqual({ due: known.due, state: known.state });
  }
  expect(rows.filter(r => r.state).length).toBeGreaterThan(3);
  // The selector describe hands out finds the row.
  const sample = asg.onPage.find((o: any) => /^assignment:/.test(o.id));
  await expect(page.locator(sample.selector).first()).toBeVisible();

  // Modules: <li> = module item, its .ig-row = the content; item links mark read.
  await page.goto(`${CANVAS}/courses/${COURSE}/modules`);
  await expect(page.locator('li.context_module_item').first()).toBeAttached();
  expect(await lightCount(page, '[data-b2c-marks-read]')).toBe(0);
  await describeCall(page);
  await expect(page.locator('li.context_module_item[data-b2c-id^="module_item:"]').first()).toBeAttached();
  expect(await page.locator('li.context_module_item > .ig-row[data-b2c-id^="assignment:"]').count()).toBeGreaterThan(0);
  const links = page.locator('a.item_link[href*="/modules/items/"]');
  expect(await links.count()).toBeGreaterThan(0);
  expect(await page.locator('a.item_link[href*="/modules/items/"]:not([data-b2c-marks-read="true"])').count()).toBe(0);
  // Global nav: Inbox marks threads read only when opened, but /conversations is in the list.
  const flagged = await page.locator('a[data-b2c-marks-read="true"]').evaluateAll(els => els.map(e => new URL((e as HTMLAnchorElement).href).pathname));
  for (const p of flagged) expect(p).toMatch(/^\/(courses\/[^/]+\/(grades|announcements\/|discussion_topics\/|modules\/items\/)|conversations)/);

  // Late-rendered rows are anchored too (shared observer).
  await page.evaluate(() => {
    const li = document.querySelector('li.context_module_item')!.cloneNode(true) as HTMLElement;
    for (const a of Array.from(li.attributes)) if (a.name.startsWith('data-b2c-')) li.removeAttribute(a.name);
    li.querySelectorAll('[data-b2c-id],[data-b2c-marks-read]').forEach(e => { e.removeAttribute('data-b2c-id'); e.removeAttribute('data-b2c-marks-read'); });
    li.id = 'context_module_item_999999';
    document.querySelector('ul.context_module_items')!.appendChild(li);
  });
  await expect(page.locator('#context_module_item_999999')).toHaveAttribute('data-b2c-id', 'module_item:999999');

  // Calendar events (mapped by course + title where unambiguous) and Canvas's To Do sidebar.
  await page.goto(`${CANVAS}/calendar`);
  await expect(page.locator('a.fc-event').first()).toBeAttached();
  await describeCall(page, { from: '2026-09-28', to: '2026-11-08' });
  await expect(page.locator('a.fc-event[data-b2c-id]').first()).toBeAttached();
  const evIds = await page.locator('a.fc-event[data-b2c-id]').evaluateAll(els => els.map(e => e.getAttribute('data-b2c-id')));
  console.log(`calendar: ${evIds.length} of ${await page.locator('a.fc-event').count()} events mapped`);
  await page.goto(CANVAS + '/');
  await expect(page.locator('.ToDoSidebarItem').first()).toBeAttached();
  await describeCall(page);
  await expect(page.locator('.ToDoSidebarItem[data-b2c-id]').first()).toBeAttached();

  // Turning the contract off removes every trace, live.
  await setSettings({ 'core.agentContract': false });
  await expect.poll(() => lightCount(page, '[data-b2c-id],[data-b2c-marks-read],[data-b2c-state],[data-b2c-due],[data-b2c-course-id]')).toBe(0);
  await expect(page.locator('script#b2c-describe')).toHaveCount(0);
});

test('describe never hits a mark-read endpoint or writes, on any page', async ({ context }) => {
  const page = await context.newPage();
  const all: { method: string; url: string }[] = [];
  page.on('request', r => { if (r.url().startsWith(CANVAS + '/api/')) all.push({ method: r.method(), url: r.url() }); });
  for (const p of ['/', `/courses/${COURSE}`, `/courses/${COURSE}/assignments`, `/courses/${COURSE}/modules`, '/calendar']) {
    await open(page, p);
    await settle(page);
    const before = all.length;
    await describeCall(page, { refresh: true });
    await page.waitForTimeout(150);
    for (const r of all.slice(before)) {
      expect(r.method, r.url).toBe('GET');
      expect(r.url).not.toMatch(MARK_READ);
    }
  }
});

test('§2 warm describe on the heavy mock (303 assignments) at 4x CPU', async ({ context }) => {
  await context.addCookies([{ name: 'mock_scenario', value: 'heavy', url: CANVAS + '/' }]);
  const page = await context.newPage();
  await open(page);
  await settle(page);
  await describeCall(page, { refresh: true });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-b2c-agent', '1');
  await settle(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const { out, reqs } = await requestsDuring(page, async () => [await describeCall(page), await describeCall(page), await describeCall(page, { from: '2026-09-01', to: '2026-12-31' })]);
  console.log(`heavy 4x: first ${out[0]!.ms.toFixed(1)} ms (incl. chunk load), warm ${out[1]!.ms.toFixed(1)} ms, wide window ${out[2]!.ms.toFixed(1)} ms; ${out[1]!.d.courses.length} courses, ${out[1]!.d.due.length} due, ${out[1]!.d.onPage.length} on page`);
  expect(reqs).toEqual([]);
  expect(out[1]!.ms).toBeLessThanOrEqual(50);
});

test('§2/§3 marksRead: an assignment with an open must-view requirement is flagged in due, page and links', async ({ context, sw }) => {
  const page = await context.newPage();
  await open(page, `/courses/${COURSE}/assignments`);
  await settle(page);
  const first = (await describeCall(page, { refresh: true, from: '2026-09-01', to: '2026-12-31' })).d;
  const target = (first.due as { id: string; url: string; marksRead: boolean }[]).find(x => x.id.startsWith('assignment:') && x.url.includes(`/courses/${COURSE}/`));
  expect(target).toBeTruthy();
  expect(target!.marksRead).toBe(false);
  const aid = target!.id.split(':')[1];
  // Seed b²c's modules cache (as search or pins would have) with an open must-view requirement on it.
  await sw.evaluate(async ({ uid, course, aid }) => {
    await chrome.storage.local.set({
      [`b2c:cache:${uid}:/courses/${course}/modules?include[]=items&include[]=content_details&per_page=100`]: {
        t: Date.now(), data: [{ id: '1', name: 'Week 1', position: 1, items: [{ id: '777', title: 'Read me', type: 'Assignment', content_id: aid, completion_requirement: { type: 'must_view', completed: false } }] }],
      },
    });
  }, { uid: first.userId, course: COURSE, aid });
  const { out, reqs } = await requestsDuring(page, () => describeCall(page, { from: '2026-09-01', to: '2026-12-31' }));
  expect(reqs).toEqual([]);
  const d = out.d;
  expect(d.readSafety.marksReadPaths).toContain('/courses/*/assignments/* (when a must-view module requirement is open)');
  expect(d.due.find((x: any) => x.id === target!.id).marksRead).toBe(true);
  await expect(page.locator(`#ag-list a.ig-title[href$="/assignments/${aid}"]`)).toHaveAttribute('data-b2c-marks-read', 'true');
  const others = page.locator(`#ag-list a.ig-title[href*="/assignments/"]:not([href$="/assignments/${aid}"])[data-b2c-marks-read]`);
  await expect(others).toHaveCount(0);
  await page.goto(`${CANVAS}/courses/${COURSE}/assignments/${aid}`);
  const here = (await describeCall(page)).d;
  expect(here.page).toMatchObject({ kind: 'assignment', itemId: target!.id, marksRead: true });
});
