// Palette specimens (design/spec/surfaces/dark-mode.md §9, rice.md): every mock
// page as plain Canvas and under three themes (Dark, Sepia, a custom light
// theme), screenshotted into .scratch/dark/shots/, with an automated audit per
// theme: no opaque neutral region that isn't one of the theme's surfaces (an
// "island" of Canvas's own white or grey), and no text under 3:1 on what's
// behind it. Teacher-authored backgrounds and media are exempt by spec.
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const SHOTS = path.resolve(import.meta.dirname, '../../.scratch/dark/shots');
const PRODUCTION_CSS = fs.existsSync(path.resolve(import.meta.dirname, '../../mock-canvas/vendor-live/dist/brandable_css'));
fs.mkdirSync(SHOTS, { recursive: true });

async function cookies(context: BrowserContext, extra: Record<string, string> = {}) {
  const all = { mock_delay: '0', ...extra };
  await context.addCookies(Object.entries(all).map(([name, value]) => ({ name, value, domain: 'b2c-mock-school.instructure.com', path: '/' })));
}

interface Island { sel: string; bg: string; w: number; h: number }
interface Audit { light: Island[]; darkText: { sel: string; color: string; on: string }[] }

/** Runs in the page. */
function audit(): Audit {
  const cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  const rgba = (c: string) => {
    if (!c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c)) return null;
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000';
    cx.fillStyle = c;
    cx.fillRect(0, 0, 1, 1);
    const [r, g, b] = Array.from(cx.getImageData(0, 0, 1, 1).data);
    const a = Number((c.match(/rgba\([^)]*,\s*([\d.]+)\)/) ?? [])[1] ?? 1);
    return { r: r!, g: g!, b: b!, a };
  };
  const L = (c: { r: number; g: number; b: number }) => {
    const f = (x: number) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const root = getComputedStyle(document.documentElement);
  const surfaces = ['--b2c-dm-bg', '--b2c-dm-surface', '--b2c-dm-surface-raised']
    .map(v => rgba(root.getPropertyValue(v).trim())).filter(Boolean).map(c => L(c!));
  const name = (el: Element) => {
    const parts: string[] = [];
    for (let e: Element | null = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
      parts.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + [...e.classList].slice(0, 2).map(c => '.' + c).join(''));
    }
    return parts.join(' > ');
  };
  const exempt = (el: Element) =>
    !!el.closest('img, video, iframe, canvas, svg, picture, object, embed') ||
    !!el.closest(':is(.user_content, .show-content) :is([style*="background" i], [bgcolor])') ||
    !!el.closest('[class*="screenreader"], .screenreader-only, [class*="ScreenReader"]');
  const effBg = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none' && e !== document.documentElement) return null; // image or gradient: unknown
      const c = rgba(cs.backgroundColor);
      if (c && c.a > 0.5) return c;
    }
    return null;
  };
  const out: Audit = { light: [], darkText: [] };
  for (const el of Array.from(document.querySelectorAll('body, body *'))) {
    if (exempt(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const bg = rgba(cs.backgroundColor);
    const neutral = bg && Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b) < 14;
    if (bg && bg.a > 0.9 && neutral && r.width * r.height >= 600 && surfaces.length && Math.min(...surfaces.map(s => Math.abs(L(bg) - s))) > 0.08) {
      out.light.push({ sel: name(el), bg: cs.backgroundColor, w: Math.round(r.width), h: Math.round(r.height) });
    }
    const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent!.trim());
    if (hasText) {
      const c = rgba(cs.color);
      const under = effBg(el);
      if (c && under && c.a > 0.5) {
        const [hi, lo] = [L(c), L(under)].sort((a, b) => b - a) as [number, number];
        if ((hi + 0.05) / (lo + 0.05) < 3) out.darkText.push({ sel: name(el), color: cs.color, on: `rgb(${under.r}, ${under.g}, ${under.b})` });
      }
    }
  }
  // collapse nested islands: keep the outermost
  out.light = out.light.filter((x, i) => !out.light.some((y, j) => j < i && x.sel.startsWith(y.sel + ' > ')));
  return out;
}

interface Spec { name: string; path: string | ((ids: Ids) => string); cookies?: Record<string, string>; settings?: Record<string, unknown>; untouched?: boolean; untouchedLight?: boolean; ready?: string; open?: (p: Page) => Promise<void> }
interface Ids { course: string; assignment: string; quiz: string }

const SPECS: Spec[] = [
  { name: 'dashboard-cards', path: '/', cookies: { mock_dashboard_view: 'cards' } },
  { name: 'dashboard-planner', path: '/', cookies: { mock_dashboard_view: 'planner' } },
  { name: 'dashboard-widget-courses', path: '/', cookies: { mock_dashboard_view: 'widget', mock_dashboard_tab: 'courses' }, ready: '.ic-DashboardCard' },
  { name: 'dashboard-widget-dashboard', path: '/', cookies: { mock_dashboard_view: 'widget', mock_dashboard_tab: 'dashboard' } },
  { name: 'dashboard-widget-native-dark', path: '/', cookies: { mock_dashboard_view: 'widget', mock_dashboard_tab: 'dashboard', mock_widget_dark: '2' }, untouchedLight: true },
  { name: 'all-courses', path: '/courses' },
  { name: 'course-home', path: i => `/courses/${i.course}` },
  { name: 'modules', path: i => `/courses/${i.course}/modules` },
  { name: 'assignments', path: i => `/courses/${i.course}/assignments` },
  { name: 'assignment', path: i => `/courses/${i.course}/assignments/${i.assignment}` },
  { name: 'syllabus', path: i => `/courses/${i.course}/assignments/syllabus` },
  { name: 'grades', path: i => `/courses/${i.course}/grades` },
  { name: 'all-grades', path: '/grades' },
  { name: 'announcements', path: i => `/courses/${i.course}/announcements` },
  { name: 'discussions', path: i => `/courses/${i.course}/discussion_topics` },
  { name: 'calendar', path: '/calendar' },
  { name: 'inbox', path: '/conversations' },
  { name: 'profile', path: '/profile/settings' },
  { name: 'quiz-take-default', path: i => `/courses/${i.course}/quizzes/${i.quiz}/take`, untouched: true },
  { name: 'quiz-take-dark-only', path: i => `/courses/${i.course}/quizzes/${i.quiz}/take`, settings: { 'core.quizSafe': 'colours' } },
  {
    name: 'nav-courses-tray',
    path: '/courses',
    open: async p => {
      await p.locator('#global_nav_courses_link').click();
      await p.waitForTimeout(400);
    },
  },
];

async function ids(page: Page): Promise<Ids> {
  await page.goto(CANVAS + '/__mock/info');
  const info = JSON.parse(await page.locator('body').innerText()) as { courses: { id: string | number }[] };
  const course = String(info.courses[0]!.id);
  const as = await page.evaluate(async c => (await (await fetch(`/api/v1/courses/${c}/assignments?per_page=50`)).json()) as { id: string; quiz_id?: string }[], course);
  const quiz = as.find(a => a.quiz_id)?.quiz_id ?? '1';
  return { course, assignment: String(as[0]!.id), quiz: String(quiz) };
}

const LIGHT_CUSTOM = { bg: '#fbf7ee', surface: '#fffdf8', surfaceRaised: '#f2ecdf', border: '#d8cfbd', text: '#2a2420', textSecondary: '#5a4f45', textTertiary: '#6b5f53', link: 'school' };
const THEMES: { name: string; settings: Record<string, unknown>; scheme: 'dark' | 'light' }[] = [
  { name: 'dark', scheme: 'dark', settings: { 'palette.useDark': 'always', 'palette.dark': 'dark' } },
  { name: 'sepia', scheme: 'light', settings: { 'palette.useDark': 'never', 'palette.light': 'sepia' } },
  { name: 'light-custom', scheme: 'light', settings: { 'palette.useDark': 'never', 'palette.light': 'custom', 'palette.lightRoles': LIGHT_CUSTOM } },
];

test.setTimeout(300_000);

for (const t of THEMES) {
  test(`specimens: Canvas and ${t.name}, screenshots and the audit`, async ({ context, setSettings }) => {
    const results: Record<string, Audit> = {};
    await cookies(context);
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    const i = await ids(page);
    for (const s of SPECS) {
      await context.clearCookies();
      await cookies(context, s.cookies);
      const url = CANVAS + (typeof s.path === 'string' ? s.path : s.path(i));
      for (const on of [false, true]) {
        if (!on && t.name !== 'dark') continue; // the Canvas baseline once
        await setSettings({ 'palette.useDark': 'never', 'palette.light': 'canvas', 'core.quizSafe': 'nothing', ...(on ? t.settings : {}), ...s.settings });
        await page.goto(url);
        await page.goto(url); // second load: pre-paint mirror in place
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(250);
        if (s.ready) await page.locator(s.ready).first().waitFor({ timeout: 8000 });
        if (s.open) await s.open(page);
        await page.screenshot({ path: path.join(SHOTS, `${s.name}-${on ? t.name : 'canvas'}.png`), fullPage: true });
        if (!on) continue;
        const attrs = await page.evaluate(() => [document.documentElement.getAttribute('data-b2c-theme'), document.documentElement.getAttribute('data-b2c-scheme')]);
        // Canvas's own widget dark + a b²c light theme: b²c yields there (rice.md).
        if (s.untouched || (s.untouchedLight && t.scheme === 'light')) expect(attrs[0], s.name).toBeNull();
        else {
          expect(attrs, s.name).toEqual(['on', t.scheme]);
          results[s.name] = await page.evaluate(audit);
        }
      }
    }
    fs.writeFileSync(path.join(SHOTS, `audit-${t.name}.json`), JSON.stringify(results, null, 2));
    const summary = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { islands: v.light.length, lowText: v.darkText.length }]));
    console.log(t.name, JSON.stringify(summary));
    // Canvas's own widget dark mode owns its page (dark-mode.md §10).
    const real = Object.entries(results)
      .filter(([k]) => k !== 'dashboard-widget-native-dark')
      .flatMap(([k, v]) => [...v.light.map(x => ({ k, ...x })), ...v.darkText.map(x => ({ k, ...x }))]);
    // The audit holds b²c to production Canvas CSS (mock-canvas/vendor-live,
    // which the palette's literal map is generated from). Without it the mock
    // serves CSS compiled from canvas-lms source, a different Canvas version, so
    // findings there are recorded, not failed.
    if (!PRODUCTION_CSS) {
      if (real.length) test.info().annotations.push({ type: 'source-css findings', description: JSON.stringify(real.slice(0, 12)) });
      return;
    }
    expect(real, JSON.stringify(real.slice(0, 12), null, 1)).toEqual([]);
  });
}
