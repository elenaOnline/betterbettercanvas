// b2c render <file>: the theme on Dev's mock Canvas, headless, one PNG per page
// and scheme, plus one contact sheet (contact.png) to judge the theme at a glance.
//
// House rules: headless only (Dev's launcher, playwright headless + --headless=new),
// a throwaway profile deleted afterwards, the mock in-process, no network
// beyond 127.0.0.1. Only the browser this script launched is closed.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEV } from './theme-adapter.mjs';
import { chromiumPath } from './chromium.mjs';
import { ensureTestBuild } from './devbuild.mjs';
import { checkFile } from './check.mjs';

const HOST = 'b2c-mock-school.instructure.com'; // matches the shipped manifest (no runtime grant needed)
const ALL_PAGES = ['dashboard', 'course', 'modules', 'assignments', 'assignment', 'grades', 'calendar'];
const VIEW = { width: 1440, height: 900 };
const BUDGET = (() => { try { return JSON.parse(fs.readFileSync(path.join(DEV, 'budgets.json'), 'utf8')).time; } catch { return null; } })();

function opts(args) {
  const o = { file: null, pages: ALL_PAGES, scheme: null, out: null, ext: null, perf: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i], v = () => args[++i];
    if (a === '--pages') o.pages = v().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--scheme') o.scheme = v();
    else if (a === '--out') o.out = path.resolve(v());
    else if (a === '--ext') o.ext = path.resolve(v());
    else if (a === '--perf') o.perf = true;
    else if (!a.startsWith('--')) o.file = a;
    else throw new Error(`unknown option ${a}`);
  }
  if (!o.file) throw new Error('usage: b2c render <file> [--pages a,b] [--scheme light|dark|both] [--out DIR] [--ext DIR]');
  const bad = o.pages.filter(p => !ALL_PAGES.includes(p));
  if (bad.length) throw new Error(`unknown page(s) ${bad.join(', ')}; pages are ${ALL_PAGES.join(', ')}`);
  if (o.scheme && !['light', 'dark', 'both'].includes(o.scheme)) throw new Error('--scheme is light, dark or both');
  return o;
}


const get = (port, p) => new Promise((ok, no) => {
  https.get({ host: '127.0.0.1', port, path: p, rejectUnauthorized: false, headers: { host: HOST, cookie: 'mock_scenario=default', accept: 'application/json' } }, res => {
    let b = ''; res.on('data', d => (b += d)); res.on('end', () => { try { ok(JSON.parse(b)); } catch (e) { no(e); } });
  }).on('error', no);
});

async function pickIds(port) {
  const info = await get(port, '/__mock/info');
  const course = info.courses.find(c => c.assignments > 0) ?? info.courses[0];
  const list = await get(port, `/api/v1/courses/${course.id}/assignments?per_page=50`);
  const a = list.find(x => x.due_at) ?? list[0];
  return { course: String(course.id), assignment: String(a?.id ?? '') };
}

const urlFor = (page, ids) => ({
  dashboard: '/', course: `/courses/${ids.course}`, modules: `/courses/${ids.course}/modules`,
  assignments: `/courses/${ids.course}/assignments`, assignment: `/courses/${ids.course}/assignments/${ids.assignment}`,
  grades: `/courses/${ids.course}/grades`, calendar: '/calendar',
})[page];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function contactHtml({ theme, file, shots, schemes, notRendered, check, effective, buildId }) {
  const sw = (scheme) => {
    const p = effective[scheme];
    if (!p) return '';
    return `<div class="sw"><b>${scheme}</b>${Object.entries(p).filter(([, v]) => v).map(([k, v]) => `<span><i style="background:${esc(v)}"></i>${esc(k)}<br><code>${esc(v)}</code></span>`).join('')}</div>`;
  };
  const e = check.findings.filter(f => f.level === 'error').length, w = check.findings.length - e;
  return `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;padding:24px;background:#e9e9ec;font:14px/1.35 -apple-system,system-ui,sans-serif;color:#1b1b1f;width:1952px}
  h1{font-size:26px;margin:0 0 4px} .meta{color:#555;margin-bottom:10px} .meta b{color:#1b1b1f}
  .bad{color:#b00020;font-weight:600} .ok{color:#17663a;font-weight:600}
  .sw{display:flex;gap:6px;align-items:flex-start;margin:6px 0;flex-wrap:wrap} .sw>b{width:44px;padding-top:4px}
  .sw span{font-size:11px;width:118px;color:#333} .sw i{display:block;height:20px;border:1px solid #0003;border-radius:3px;margin-bottom:2px}
  .nr{margin:10px 0 14px;padding:8px 12px;background:#fff6d6;border:1px solid #e4cf7a;border-radius:6px}
  .nr ul{margin:4px 0 0 18px;padding:0}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
  figure{margin:0;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 1px 3px #0002}
  figure img{display:block;width:100%;aspect-ratio:1440/900} figcaption{padding:6px 10px;font-weight:600}
  figcaption small{font-weight:400;color:#666;margin-left:6px} .warn{color:#b00020}
  </style>
  <h1>${esc(theme.name)}</h1>
  <div class="meta"><b>${esc(path.basename(file))}</b> · schemes: ${schemes.map(s => esc(s.label)).join(' · ')} · check: <span class="${check.ok ? 'ok' : 'bad'}">${e} error${e === 1 ? '' : 's'}</span>, ${w} warning${w === 1 ? '' : 's'} · build ${esc(buildId)} · mock Canvas, ${VIEW.width}×${VIEW.height}</div>
  ${['light', 'dark'].map(sw).join('')}
  ${notRendered.length ? `<div class="nr"><b>Not rendered yet</b> (in the theme, but this b²c can't show it):<ul>${notRendered.map(n => `<li><code>${esc(n.path)}</code>: ${esc(n.why)}</li>`).join('')}</ul></div>` : ''}
  <div class="grid">${shots.map(s => `<figure><img src="${esc(path.basename(s.png))}"><figcaption>${esc(s.page)} · ${esc(s.scheme)}<small>${s.ms} ms${s.unthemed ? ' · <span class="warn">b²c palette not painting</span>' : ''}</small></figcaption></figure>`).join('')}</div>`;
}

export async function render(args) {
  const t0 = performance.now();
  const lap = () => Math.round(performance.now() - t0);
  let o;
  try { o = opts(args); } catch (e) { console.error(e.message); return 2; }

  // 1. Check (Dev's planTheme via theme-adapter): refuse only what can't be read at all.
  const check = await checkFile(o.file);
  if (!check.theme) {
    console.error(`can't render: ${o.file} isn't a readable b²c theme. Run: b2c check ${o.file}`);
    for (const f of check.findings.filter(f => f.level === 'error')) console.error(`  error  ${f.path}  ${f.what}`);
    return 1;
  }
  const theme = check.theme;
  const text = fs.readFileSync(o.file, 'utf8');
  const notRendered = [];
  const has = { light: !!theme.palette?.light, dark: !!theme.palette?.dark };
  const wanted = o.scheme === 'both' ? ['light', 'dark'] : o.scheme ? [o.scheme] : (has.light || has.dark) ? ['light', 'dark'].filter(s => has[s]) : ['light'];
  const schemes = wanted.map(s => ({ scheme: s, useDark: s === 'dark' ? 'always' : 'never',
    label: has[s] ? s : s === 'light' ? "light (no palette.light: Canvas's own colours)" : "dark (no palette.dark: b²c's default Dark)" }));

  // 2. Extension: --ext DIR, else agentkit/.scratch/b2c-test, rebuilt when dev/ changed.
  let ext;
  if (o.ext) ext = { dir: o.ext };
  else {
    const b = ensureTestBuild();
    if (b.status === 'rebuilt') console.log(`build: dev/ changed, rebuilt the test build ${b.buildId} in ${(b.ms / 1000).toFixed(1)} s → agentkit/.scratch/b2c-test`);
    else if (b.status === 'current') console.log(`build: test build ${b.buildId} is current`);
    else if (b.dir) console.error(`warn  dev/ changed but doesn't build right now (${b.why})\n      using the previous test build ${b.buildId}; it may lag the source`);
    else { console.error(`can't render: dev/ doesn't build (${b.why}) and there's no earlier test build`); return 1; }
    ext = { dir: b.dir };
  }
  if (!fs.existsSync(path.join(ext.dir, 'manifest.json'))) { console.error(`can't render: no extension at ${ext.dir}`); return 1; }
  const buildId = fs.existsSync(path.join(ext.dir, 'build-id.txt')) ? fs.readFileSync(path.join(ext.dir, 'build-id.txt'), 'utf8').trim() : '?';
  const tBuild = lap();

  // 3. Mock + headless browser (Dev's launcher).
  // Default folder: name plus a short hash of the full path, so two files called the same don't overwrite each other.
  const stem = path.basename(o.file).replace(/\.b2c-(theme|rice)\.json$|\.json$/, '');
  const tag = createHash('sha1').update(path.resolve(o.file)).digest('hex').slice(0, 6);
  const out = o.out ?? path.join(os.tmpdir(), 'b2c-render', `${stem}-${tag}`);
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/\.(png|html)$/.test(f) || f === 'render.json') fs.rmSync(path.join(out, f));
  process.env.MOCK_CHROMIUM = await chromiumPath();
  const { launch, startMock, mockCookies } = await import(pathToFileURL(path.join(DEV, 'mock-canvas/tools/browser.mjs')).href);
  const mock = await startMock();
  const { ctx, close } = await launch({ port: mock.port, hosts: [HOST], extraArgs: ['--headless=new', `--disable-extensions-except=${ext.dir}`, `--load-extension=${ext.dir}`] });
  const shots = [];
  let code = 0;
  try {
    await ctx.addCookies(mockCookies({ scenario: 'default', delay: 0, view: 'widget', tab: 'courses', domain: HOST }));
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 10_000 }));
    // The worker can surface before its chrome.* bindings do: wait until it can answer.
    for (let i = 0; i < 100; i++) {
      if (await sw.evaluate(() => typeof chrome?.runtime?.getURL === 'function').catch(() => false)) break;
      await new Promise(r => setTimeout(r, 50));
    }
    const ids = await pickIds(mock.port);
    const setSettings = v => sw.evaluate(async v => {
      const schema = (await (await fetch(chrome.runtime.getURL('schema.json'))).json()).settings;
      const sync = {}, local = {};
      for (const [k, x] of Object.entries(v)) (schema[k]?.area === 'local' ? local : sync)[k] = x;
      await chrome.storage.sync.set(sync);
      await chrome.storage.local.set(local);
    }, v);
    const health = url => sw.evaluate(async url => {
      const t = (await chrome.tabs.query({})).find(t => t.url === url);
      return t ? chrome.tabs.sendMessage(t.id, { type: 'b2c:health' }).catch(() => null) : null;
    }, url);
    // Apply exactly as Import → Apply all does: Dev's test-build hook (dev/src/core/theme/sw.ts),
    // sent from an extension page because a worker's own messages don't reach its listeners.
    const extPage = await ctx.newPage();
    await extPage.goto(sw.url().replace(/sw\.js$/, 'popup.html'));
    const applied = await extPage.evaluate(text => chrome.runtime.sendMessage({ type: 'b2c:themes:apply-file', text, css: true, courseColors: true }).catch(e => ({ ok: false, errors: [String(e)] })), text);
    await extPage.close();
    if (!applied) throw new Error(`this build has no theme apply hook (b2c:themes:apply-file); render needs a test build (B2C_TEST_FEATURES=1)${o.ext ? `, and --ext ${o.ext} isn't one` : ''}`);
    if (!applied.ok) throw new Error(`b²c refused the theme: ${(applied.errors ?? []).join('; ')}`);
    const values = applied.values ?? {};
    for (const n of applied.planNotes ?? []) {
      if (n.kind === 'skipped') notRendered.push({ path: n.path, why: 'this b²c has no setting for it yet' });
      if (n.path === 'cards.style' && theme.cards?.style === 'image') notRendered.push({ path: 'cards.style', why: '"image" cards are personal (the person\'s own images); shown as flat' });
    }
    const tLaunch = lap();

    const wantCards = values['card-colors.request'] ? (theme.cards?.colors?.list ?? []).map(c => String(c).toLowerCase()) : [];
    let shotQueue = Promise.resolve();
    const shoot = async (name, s) => {
      const page = await ctx.newPage();
      await page.setViewportSize(VIEW);
      const p0 = performance.now();
      const res = await page.goto(`https://${HOST}${urlFor(name, ids)}`, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))));
      if (name === 'dashboard' && wantCards.length) {
        // b²c marks the colour request applied when it sends it, not when the cards show it. Wait for the
        // first card's hero to carry one of the theme's colours; reload once; else say so on the sheet.
        const landed = () => page.waitForFunction(list => {
          const el = document.querySelector('.ic-DashboardCard__header_hero');
          if (!el) return false;
          const m = getComputedStyle(el).backgroundColor.match(/\d+/g);
          return !!m && list.includes('#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join(''));
        }, wantCards, { timeout: 3000 }).then(() => true, () => false);
        let ok = await landed();
        if (!ok) { await page.reload({ waitUntil: 'load' }); ok = await landed(); }
        if (!ok && !notRendered.some(n => n.path === 'cards.colors')) notRendered.push({ path: 'cards.colors', why: "the course colours didn't show on the mock dashboard cards in time; the shot shows the mock's defaults" });
      }
      const ms = Math.round(performance.now() - p0);
      const attrs = await page.evaluate(() => Object.fromEntries([...document.documentElement.attributes].filter(a => a.name.startsWith('data-b2c')).map(a => [a.name, a.value])));
      const h = await health(page.url());
      const png = path.join(out, `${name}-${s.scheme}.png`);
      // Pages load in parallel, but screenshots go one at a time: concurrent captures in
      // headless Chromium can composite stale tiles (seen: the page top repeated at the bottom).
      await (shotQueue = shotQueue.then(() => page.screenshot({ path: png, animations: 'disabled', caret: 'hide' })));
      await page.close();
      const startMs = h?.timings ? Math.round(Object.values(h.timings).reduce((a, b) => a + b, 0) * 10) / 10 : null;
      // startMs: pages load concurrently here, so it's indicative only (see --perf for the budget measure).
      shots.push({ page: name, scheme: s.scheme, png, ms, status: res?.status(), unthemed: has[s.scheme] && attrs['data-b2c-theme'] !== 'on', attrs, startMsConcurrent: startMs });
    };

    for (const s of schemes) {
      await setSettings({ 'palette.useDark': s.useDark });
      let rest = o.pages;
      if (s === schemes[0] && values['card-colors.request'] && o.pages.includes('dashboard')) {
        // Course colours are written to (mock) Canvas from the dashboard: let that land first.
        const page = await ctx.newPage();
        await page.goto(`https://${HOST}/`, { waitUntil: 'load' });
        const id = values['card-colors.request'].id;
        // b²c sets card-colors.applied when it *claims* the request, then writes each course colour to
        // Canvas one at a time, and stops if the page closes. So keep this page open until Canvas itself
        // (the mock's /users/self/colors) holds the theme's colours for the cards on the page.
        const list = (theme.cards?.colors?.list ?? []).map(c => String(c).toLowerCase());
        let applied = false;
        for (let i = 0; i < 80 && !applied; i++) {
          const claimed = (await sw.evaluate(() => chrome.storage.local.get('card-colors.applied')))['card-colors.applied'] === id;
          applied = claimed && await page.evaluate(async list => {
            const n = document.querySelectorAll('.ic-DashboardCard').length;
            if (!n) return false;
            const r = await fetch('/api/v1/users/self/colors', { headers: { Accept: 'application/json' } }).then(r => r.json()).catch(() => null);
            const got = Object.values(r?.custom_colors ?? {}).map(c => String(c).toLowerCase()).filter(c => list.includes(c)).length;
            return got >= Math.min(n, list.length);
          }, list).catch(() => false);
          if (!applied) await page.waitForTimeout(100);
        }
        await page.close();
        if (!applied) notRendered.push({ path: 'cards.colors', why: "the course colours weren't saved to the mock's Canvas within 8 s" });
      }
      await Promise.all(rest.map(n => shoot(n, s)));
    }
    shots.sort((a, b) => schemes.findIndex(s => s.scheme === a.scheme) - schemes.findIndex(s => s.scheme === b.scheme) || o.pages.indexOf(a.page) - o.pages.indexOf(b.page));

    // Optional: the budget measure (test/e2e/budgets.spec.ts's warmLoad), with this theme applied.
    let perf = null;
    if (o.perf) {
      await ctx.addCookies(mockCookies({ scenario: 'heavy', domain: HOST }));
      const page = await ctx.newPage();
      await page.goto(`https://${HOST}/`); // cold: fills caches
      await page.waitForTimeout(1500);
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.reload();
      await page.waitForTimeout(2500);
      const h = await health(page.url());
      await page.close();
      const t = h?.timings ?? {};
      perf = { timings: t, total: Math.round(Object.values(t).reduce((a, b) => a + b, 0) * 10) / 10,
        over: Object.entries(t).filter(([, v]) => BUDGET && v > BUDGET.startPerFeature).map(([k, v]) => `${k} ${v} ms`) };
    }

    // 4. Contact sheet: one image to judge the theme by.
    const html = path.join(out, 'contact.html');
    fs.writeFileSync(html, contactHtml({ theme, file: o.file, shots, schemes, notRendered, check, effective: theme.palette ?? {}, buildId }));
    const sheet = await ctx.newPage();
    await sheet.setViewportSize({ width: 2000, height: 400 });
    await sheet.goto(pathToFileURL(html).href, { waitUntil: 'load' });
    // Size the viewport to the whole sheet: a fullPage shot from a short viewport repeats bands
    // in headless Chromium once the sheet is a few viewports tall (seen with --scheme both).
    const h = await sheet.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    await sheet.setViewportSize({ width: 2000, height: Math.min(h, 16000) });
    await sheet.screenshot({ path: path.join(out, 'contact.png') });
    await sheet.close();
    fs.writeFileSync(path.join(out, 'render.json'), JSON.stringify({ file: path.resolve(o.file), buildId, schemes, applied: values, notRendered, shots, perf, ms: { build: tBuild, launch: tLaunch - tBuild, total: lap() } }, null, 2));

    // 5. Report.
    const e = check.findings.filter(f => f.level === 'error').length;
    console.log(`${theme.name}  (${path.basename(o.file)})  check: ${e ? `${e} error(s), run b2c check` : 'ok'}`);
    for (const s of schemes) console.log(`  scheme ${s.label}`);
    for (const n of notRendered) console.log(`  not rendered yet  ${n.path}: ${n.why}`);
    for (const s of shots) {
      const flags = [s.status !== 200 && `HTTP ${s.status}`, s.unthemed && 'b²c palette NOT painting: this page looks un-themed'].filter(Boolean);
      console.log(`  ${s.png}  ${s.ms} ms${flags.length ? '  ! ' + flags.join('; ') : ''}`);
      if (s.status !== 200 || s.unthemed) code = 1;
    }
    console.log(`contact sheet: ${path.join(out, 'contact.png')}  (and contact.html, render.json)`);
    if (perf) console.log(`perf (budgets.json conditions: heavy mock dashboard, warm, 4× CPU): b²c start ${perf.total} ms of ${BUDGET?.startTotal ?? '?'}${perf.over.length ? `; over ${BUDGET?.startPerFeature} ms each: ${perf.over.join(', ')}` : '; every feature within budget'}`);
    console.log(`time: ${(lap() / 1000).toFixed(1)} s total (build ${(tBuild / 1000).toFixed(1)} s, launch ${((tLaunch - tBuild) / 1000).toFixed(1)} s, ${shots.length} shots${perf ? ', perf pass' : ''})`);
  } finally {
    await close();
    await mock.close();
  }
  return code;
}
