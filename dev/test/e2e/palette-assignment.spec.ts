// Agent kit finding (render/check, 2026-10-20): on the assignment page (the
// Assignments 2 student view, InstUI-heavy), dark themes left the header text
// dark on dark: the title, the score, the due line, "Details", "Review
// Feedback". Cause: the mock linked InstUI's runtime CSS as a static sheet,
// while production inserts it through emotion's insertRule, which is the path
// the palette's page-world layer rewrites. The mock now emulates production.
// This spec checks every visible text on that page reaches 4.5:1 on what's
// behind it under three dark themes.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, CANVAS } from './fixtures.ts';

const THEMES = path.resolve(import.meta.dirname, '../../../design/spec/themes');
const darkRoles = (id: string) => JSON.parse(fs.readFileSync(path.join(THEMES, `${id}.b2c-theme.json`), 'utf8')).palette.dark as Record<string, string>;

async function lowText(page: Page) {
  return page.evaluate(() => {
    const cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    const rgb = (c: string) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return Array.from(cx.getImageData(0, 0, 1, 1).data); };
    const L = (c: number[]) => { const f = (x: number) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!); };
    const under = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage !== 'none' && e !== document.documentElement) return null;
        const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
        const a = m ? Number(m[1]!.split(',')[3] ?? 1) : 0;
        if (a > 0.5) return cs.backgroundColor;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    const out: { text: string; color: string; on: string; ratio: number }[] = [];
    const main = document.querySelector('#content') ?? document.body;
    for (const el of Array.from(main.querySelectorAll('*'))) {
      const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent!.trim()).join(' ').trim();
      if (!own) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || el.closest('.screenreader-only, [class*="screenReader"]')) continue;
      const bg = under(el);
      if (!bg) continue;
      const [a, b] = [L(rgb(cs.color)), L(rgb(bg))].sort((x, y) => y - x);
      const ratio = (a! + 0.05) / (b! + 0.05);
      if (ratio < 4.5) out.push({ text: own.slice(0, 40), color: cs.color, on: bg, ratio: Math.round(ratio * 100) / 100 });
    }
    return out;
  });
}

for (const id of ['dark', 'nord', 'catppuccin-mocha']) {
  test(`assignment page, ${id}: every header text is readable (InstUI via emotion)`, async ({ context, setSettings }) => {
    await context.addCookies([{ name: 'mock_delay', value: '0', domain: new URL(CANVAS).hostname, path: '/' }]);
    await setSettings({ 'palette.useDark': 'always', 'palette.dark': id === 'dark' ? 'dark' : 'custom', 'palette.darkRoles': id === 'dark' ? null : darkRoles(id) });
    const page = await context.newPage();
    await page.goto(CANVAS + '/__mock/info');
    const info = JSON.parse(await page.locator('body').innerText()) as { courses: { id: string | number }[] };
    const course = String(info.courses[0]!.id);
    const as = await page.evaluate(async c => (await (await fetch(`/api/v1/courses/${c}/assignments?per_page=50`)).json()) as { id: string }[], course);
    const url = `${CANVAS}/courses/${course}/assignments/${as[0]!.id}`;
    await page.goto(url); // writes the mirror
    await page.goto(url); // pre-paint, page-world layer installed
    await page.locator('[data-testid="grade-display"]').first().waitFor();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('data-b2c-scheme', 'dark');
    const low = await lowText(page);
    expect(low, JSON.stringify(low.slice(0, 8), null, 1)).toEqual([]);
  });
}
