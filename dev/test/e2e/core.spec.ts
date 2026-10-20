import { test, expect, CANVAS } from './fixtures.ts';

test('extension loads and boots on an Instructure-hosted Canvas', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  await expect(page.locator('html')).toHaveAttribute('data-b2c-env', /current_user_id/);
});

test('dark mode toggles live, without reload', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-dark', 'on');
  await setSettings({ 'palette.useDark': 'always' });
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(24, 33, 45)'); // Design's "Dark" preset bg #18212d
  await setSettings({ 'palette.useDark': 'never' });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-dark', 'on');
});

test('pre-paint: dark mode is in place before the first paint after navigation', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await setSettings({ 'palette.useDark': 'always', 'palette.dark': 'custom', 'palette.darkRoles': { bg: '#102030' } });
  await page.goto(CANVAS + '/');  // first load writes the mirror
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');

  // Prove the dark attribute and palette were in place before first paint:
  // an init script records when (if ever) the attribute appeared, and we
  // compare that with the browser's own first-paint timestamp.
  await page.addInitScript(() => {
    const w = window as unknown as { __b2c: { attrAt: number | null; bodyAtAttr: boolean | null } };
    // Runs before <html> exists, so watch the document itself.
    const on = () => document.documentElement?.getAttribute('data-b2c-dark') === 'on';
    w.__b2c = { attrAt: on() ? 0 : null, bodyAtAttr: on() ? !!document.body : null };
    new MutationObserver(() => {
      if (w.__b2c.attrAt === null && on()) {
        w.__b2c.attrAt = performance.now();
        w.__b2c.bodyAtAttr = !!document.body;
      }
    }).observe(document, { attributes: true, childList: true, subtree: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.goto(CANVAS + '/courses');
  const r = await page.evaluate(async () => {
    const fp = await new Promise<number>(res => {
      new PerformanceObserver(l => {
        const e = l.getEntries().find(x => x.name === 'first-paint');
        if (e) res(e.startTime);
      }).observe({ type: 'paint', buffered: true });
    });
    const w = window as unknown as { __b2c: { attrAt: number | null; bodyAtAttr: boolean | null } };
    return { attrAt: w.__b2c.attrAt, bodyAtAttr: w.__b2c.bodyAtAttr, firstPaint: fp, bg: getComputedStyle(document.documentElement).backgroundColor };
  });
  expect(r.attrAt).not.toBeNull();
  // Synchronous boot sets it before the parser reaches <body>; anything async
  // (chrome.storage) lands later and can lose the race with first paint.
  expect(r.bodyAtAttr).toBe(false);
  expect(r.attrAt!).toBeLessThan(r.firstPaint);
  expect(r.bg).toBe('rgb(16, 32, 48)');
});

test('pause switch returns plain Canvas live', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await setSettings({ 'palette.useDark': 'always' });
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  await setSettings({ 'core.paused': true });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-dark', 'on');
});

test('popup report describes the page structurally, without personal data', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-env', /probe/);
  const report = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://b2c-mock-school.instructure.com/*' });
    return chrome.tabs.sendMessage(tab!.id!, { type: 'b2c:health' });
  });
  expect(report.page).toBe('dashboard');
  expect(report.canvasAnchors.globalNav).toBeGreaterThan(0);
  expect(JSON.stringify(report)).not.toContain('Test Student');
});

test('quiz-safe-mode: by default nothing applies on a quiz-taking page; "colours" keeps only colours', async ({ context, setSettings, sw }) => {
  await setSettings({ 'palette.useDark': 'always' });
  {
    const page = await context.newPage();
    await page.goto(CANVAS + '/courses/101/quizzes/7/take');
    await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-b2c-dark'))).toBeNull();
    await page.close();
  }
  await setSettings({ 'core.quizSafe': 'colours' });
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  await page.goto(CANVAS + '/courses/101/quizzes/7/take');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  await expect(page.locator('html')).toHaveAttribute('data-b2c-dark', 'on');
  const report = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://b2c-mock-school.instructure.com/courses/*' });
    return chrome.tabs.sendMessage(tab!.id!, { type: 'b2c:health' });
  });
  expect(report.page).toBe('quiz-taking');
  expect(report.running).toEqual([]);

  await setSettings({ 'core.quizSafe': 'nothing' });
  await expect(page.locator('html')).not.toHaveAttribute('data-b2c-dark', 'on');
  // …and before first paint on the next load too.
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-b2c-dark'))).toBeNull();
});

test('settings changes are serialized: a feature never starts twice', async ({ context, sw }) => {
  test.skip(!process.env.B2C_TEST_FEATURES, 'needs a build with B2C_TEST_FEATURES=1');
  const page = await context.newPage();
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
  // Writes touching both storage areas fire onChanged twice, back to back,
  // while test-probe's slow start() is in flight.
  await sw.evaluate(async () => {
    await Promise.all([chrome.storage.sync.set({ 'test-probe.enabled': true, 'test-probe.n': 1 }), chrome.storage.local.set({ 'test-probe.big': 'x' })]);
    await Promise.all([chrome.storage.sync.set({ 'test-probe.n': 2 }), chrome.storage.local.set({ 'test-probe.big': 'y' })]);
  });
  await expect(page.locator('html')).toHaveAttribute('data-test-live', '1');
  await page.waitForTimeout(400);
  await expect(page.locator('html')).toHaveAttribute('data-test-live', '1');
  await expect(page.locator('html')).toHaveAttribute('data-test-starts', '1');
  await sw.evaluate(() => chrome.storage.sync.set({ 'test-probe.enabled': false }));
  await expect(page.locator('html')).toHaveAttribute('data-test-live', '0');
});

test('a replacement instance arriving mid-start leaves exactly one live set of features', async ({ context, sw, setSettings }) => {
  test.skip(!process.env.B2C_TEST_FEATURES, 'needs a build with B2C_TEST_FEATURES=1');
  await setSettings({ 'test-probe.enabled': true });
  const page = await context.newPage();
  await page.goto(CANVAS + '/', { waitUntil: 'commit' });
  // While the first instance's slow start() is in flight, inject a second one
  // (what the SW's re-inject does after an update).
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://*/*' });
    await chrome.scripting.executeScript({ target: { tabId: tab!.id! }, files: ['boot.js', 'main.js'] });
  });
  await page.waitForTimeout(600);
  await expect(page.locator('html')).toHaveAttribute('data-test-live', '1');
});

test('deep link: open-settings opens options at #<feature>, and reuses that tab', async ({ context, sw }) => {
  const popup = await context.newPage();
  await popup.goto(new URL('popup.html', sw.url()).href);
  const optionsTabs = () => context.pages().filter(p => p.url().includes('/options.html'));
  await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'b2c:open-settings', target: 'better-todo' }));
  await expect.poll(() => optionsTabs().map(p => p.url()).some(u => u.endsWith('#better-todo'))).toBe(true);
  const count = optionsTabs().length;
  await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'b2c:open-settings', target: 'gpa-calculator' }));
  await expect.poll(() => optionsTabs().map(p => p.url()).some(u => u.endsWith('#gpa-calculator'))).toBe(true);
  expect(optionsTabs().length).toBe(count); // reused, not a new tab
});

test('toolbar: a declarative rule marks Canvas tabs b²c cannot reach (grey + dot)', async ({ sw }) => {
  const rules = await sw.evaluate(async () => {
    for (let i = 0; i < 20; i++) {
      const r = await new Promise<chrome.events.Rule[]>(res => chrome.declarativeContent.onPageChanged.getRules(res));
      if (r.length) return r.map(x => ({ conditions: x.conditions.length, actions: x.actions.length }));
      await new Promise(res => setTimeout(res, 100));
    }
    return [];
  });
  expect(rules).toEqual([{ conditions: 2, actions: 1 }]);
});

test('quiz-safe: nothing of b²c loads on New Quizzes hosts (quiz-lti / quiz-api), top frame or iframe', async ({ context, setSettings }) => {
  await setSettings({ 'palette.useDark': 'always' });
  const page = await context.newPage();
  await page.goto('https://b2c-mock-school.quiz-lti-b2c-mock-school-prod.instructure.com/');
  await page.waitForTimeout(400);
  const top = await page.evaluate(() => ({
    attrs: Array.from(document.documentElement.attributes).map(a => a.name).filter(n => n.startsWith('data-b2c')),
    sheets: Array.from(document.styleSheets).filter(s => !s.href && /data-b2c/.test(Array.from(s.cssRules).map(r => r.cssText).join(''))).length,
  }));
  expect(top).toEqual({ attrs: [], sheets: 0 });
  // Sanity: a normal Instructure host still gets b²c.
  await page.goto(CANVAS + '/');
  await expect(page.locator('html')).toHaveAttribute('data-b2c-instance', /.+/);
});
