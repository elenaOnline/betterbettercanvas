import { afterEach, describe, expect, it, vi } from 'vitest';
import { courseColor, iconData } from '../../src/features/tab-icons/index.ts';
import { start } from '../../src/features/tab-icons/run.ts';
import { createDom } from '../../src/core/dom.ts';
import type { Ctx } from '../../src/core/ctx.ts';

afterEach(() => { vi.restoreAllMocks(); document.querySelectorAll('link').forEach(x => x.remove()); });

describe('tab icons', () => {
  it('accepts only course-keyed Canvas hex colours', () => {
    expect(courseColor({ course_42: 'abc' }, '42')).toBe('#abc');
    expect(courseColor({ course_42: '#ABCDEF' }, '42')).toBe('#ABCDEF');
    expect(courseColor({ courses_42: '#abcdef' }, '42')).toBeNull();
    expect(courseColor({ course_42: 'url(evil)' }, '42')).toBeNull();
    expect(courseColor({ course_42: '#12345678' }, '42')).toBeNull();
  });
  it('draws a white, squared Canvas mark on a course-coloured 16px square (no circles)', () => {
    const svg = decodeURIComponent(iconData('#abcdef')!);
    expect(svg).toContain('data:image/svg+xml,');
    expect(svg).toContain('width="16" height="16" rx="2" fill="#abcdef"');
    expect(svg).toContain('<g fill="white">');
    expect(svg).not.toContain('<circle');
    expect(svg.match(/<rect/g)).toHaveLength(10); // ground + centre + 8 marks
    expect(iconData('url(evil)')).toBeNull();
  });
  it('does not fetch course colours on other pages', () => {
    const colors = vi.fn();
    expect(start({ page: { courseId: null }, data: { colors } } as unknown as Ctx)).toBeUndefined();
    expect(colors).not.toHaveBeenCalled();
  });
  it('uses cached then fresh colours, restores all icons, and ignores late data after stop', async () => {
    document.head.innerHTML = '<link rel="shortcut icon" href="/old.ico" type="image/x-icon"><link rel="icon" href="other.png" sizes="16x16">';
    const links = [...document.querySelectorAll('link')];
    const originals = links.map(x => x.outerHTML);
    const dom = createDom();
    let callback!: (colors: Record<string, string>, fresh: boolean) => void;
    const colors = vi.fn(cb => { callback = cb; cb({ course_42: '#abc' }, false); return Promise.resolve({}); });
    let watched!: (colors: Record<string, string>) => void;
    const unwatch = vi.fn();
    const watchColors = vi.fn(cb => { watched = cb; return unwatch; });
    const instance = (await start({ page: { courseId: '42' }, dom, data: { colors, watchColors } } as unknown as Ctx))!;
    expect(links.every(x => decodeURIComponent(x.href).includes('#abc'))).toBe(true);
    callback({ course_42: '#def' }, true);
    expect(links.every(x => decodeURIComponent(x.href).includes('#def'))).toBe(true);
    callback({}, true);
    expect(links.map(x => x.outerHTML)).toEqual(originals);
    callback({ course_42: '#123' }, true);
    expect(decodeURIComponent(links[0]!.href)).toContain('#123');
    // A colour change written by another tab arrives through the watch.
    watched({ course_42: '#789' });
    expect(decodeURIComponent(links[0]!.href)).toContain('#789');
    instance.stop();
    expect(unwatch).toHaveBeenCalled();
    expect(links.map(x => x.outerHTML)).toEqual(originals);
    callback({ course_42: '#456' }, true);
    expect(links.map(x => x.outerHTML)).toEqual(originals);
    expect(document.querySelector('[data-b2c-tab-icon]')).toBeNull();
    dom.stopAll();
  });
});
