import { afterEach, describe, expect, it } from 'vitest';
import { cardGradient, courseKey, rgb } from '../../src/features/gradient-cards/index.ts';
import { start } from '../../src/features/gradient-cards/run.ts';
import { createDom } from '../../src/core/dom.ts';
import type { Ctx } from '../../src/core/ctx.ts';

afterEach(() => { document.body.innerHTML = ''; });
const flush = () => new Promise(r => setTimeout(r, 0));
describe('gradient cards', () => {
  it.each(['#abc', '#aabbcc', 'rgb(170, 187, 204)', 'rgba(170, 187, 204, 0.5)'])('reads %s', color => {
    expect(rgb(color)).toEqual([170, 187, 204]);
  });
  it.each(['transparent', 'rgba(0, 0, 0, 0)', '#ab', 'rgb(999, 0, 0)', 'var(--x)'])('ignores %s', color => {
    expect(cardGradient(color, '1')).toBeNull();
  });
  it('keeps OKLCH endpoints finite for grey, black, white and primary hues', () => {
    for (const color of ['#000', '#fff', '#888', '#f00', '#0f0', '#00f']) {
      expect(cardGradient(color, '1')).toMatch(/^linear-gradient\(115deg, rgb\(/);
      expect(cardGradient(color, '1')).not.toMatch(/NaN|Infinity/);
    }
  });
  it('uses course identity through reordering', () => {
    document.body.innerHTML = '<div class="ic-DashboardCard"><a href="/courses/42/grades"></a><div class="ic-DashboardCard__header_hero"></div></div><div class="ic-DashboardCard"></div>';
    const hero = document.querySelector('.ic-DashboardCard__header_hero')!;
    const before = cardGradient('#2468ac', courseKey(hero));
    document.body.appendChild(hero.parentElement!);
    expect(courseKey(hero)).toBe('42');
    expect(cardGradient('#2468ac', courseKey(hero))).toBe(before);
    expect(cardGradient('#2468ac', '42')).toContain('oklch(from rgb(36, 104, 172) l c calc(h + 50))');
  });
  it('decorates new cards and restores inline styles byte for byte', async () => {
    const dom = createDom();
    const instance = start({ dom } as Ctx);
    document.body.innerHTML = '<div class="ic-DashboardCard"><a href="/courses/42"></a><div class="ic-DashboardCard__header_hero" style="background-color: #2468ac; background-image: url(old.png) !important; opacity: .5"></div></div>';
    const hero = document.querySelector<HTMLElement>('.ic-DashboardCard__header_hero')!;
    const original = hero.getAttribute('style');
    await flush();
    expect(hero.style.getPropertyValue('--b2c-card-gradient')).toContain('linear-gradient');
    instance.stop();
    expect(hero.getAttribute('style')).toBe(original);
    dom.stopAll();
  });
  it('tracks Canvas recolours and preserves them when disabled', async () => {
    document.body.innerHTML = '<div class="ic-DashboardCard__header_hero" style="background-color: rgb(255, 0, 0)"></div>';
    const hero = document.querySelector<HTMLElement>('.ic-DashboardCard__header_hero')!;
    const dom = createDom();
    const instance = start({ dom } as Ctx);
    const before = hero.style.getPropertyValue('--b2c-card-gradient');
    hero.style.backgroundColor = 'rgb(0, 0, 255)';
    await flush();
    expect(hero.style.getPropertyValue('--b2c-card-gradient')).not.toBe(before);
    instance.stop();
    expect(hero.style.getPropertyValue('--b2c-card-gradient')).toBe('');
    expect(hero.style.backgroundColor).toBe('rgb(0, 0, 255)');
    dom.stopAll();
  });
});
