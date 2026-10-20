import { describe, expect, it } from 'vitest';
import { customCss, cssUrl, faviconFor, isCards, safeImage, safeLink, withCard } from '../../src/features/card-customization/model.ts';

describe('card customization model', () => {
  it('accepts only http(s) and raster data: images', () => {
    expect(safeImage('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(safeImage('none')).toBe('none');
    expect(safeImage('data:image/jpeg;base64,AAAA')).toBe('data:image/jpeg;base64,AAAA');
    expect(safeImage('javascript:alert(1)')).toBeNull();
    expect(safeImage('data:text/html;base64,AAAA')).toBeNull();
    expect(safeImage('not a url')).toBeNull();
  });
  it('links: adds https:// to bare hosts, refuses other schemes', () => {
    expect(safeLink('webassign.net')).toBe('https://webassign.net/');
    expect(safeLink('http://x.org/a')).toBe('http://x.org/a');
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('')).toBeNull();
    expect(faviconFor('https://docs.google.com/document/d/1')).toBe('https://docs.google.com/favicon.ico');
  });
  it('escapes URLs so they cannot break out of the declaration', () => {
    expect(cssUrl('https://x/a"b\\c\n')).toBe('url("https://x/a\\"b\\\\c")');
  });
  it('generates per-course rules for hidden cards and images', () => {
    const css = customCss({ '12': { hidden: true }, '7': { image: 'https://ex.com/i.png' }, '9': { image: 'none' }, '5': { image: 'javascript:x' } });
    expect(css).toContain('[href$="/courses/12"]');
    expect(css).toMatch(/courses\/12"\]\)\{display:none!important\}/);
    expect(css).toContain('url("https://ex.com/i.png")');
    expect(css).toContain('background-image:none!important');
    expect(css).not.toContain('javascript');
    expect(customCss({})).toBe('');
  });
  it('withCard drops empty records and default-only links', () => {
    expect(withCard({}, '1', c => ({ ...c, links: [{ kind: 'default' }, { kind: 'default' }] }))).toEqual({});
    const a = withCard({}, '1', c => ({ ...c, hidden: true, label: 'MTH' }));
    expect(a).toEqual({ '1': { hidden: true, label: 'MTH' } });
    expect(withCard(a, '1', c => ({ ...c, hidden: undefined }))).toEqual({});
    expect(isCards({ '1': {} })).toBe(true);
    expect(isCards([])).toBe(false);
  });
});

import { moveId, orderCss, positionsAgree } from '../../src/features/card-customization/model.ts';

describe('card order', () => {
  it('moves ids', () => {
    const o = ['1', '2', '3', '4'];
    expect(moveId(o, '1', 'right')).toEqual(['2', '1', '3', '4']);
    expect(moveId(o, '3', 'start')).toEqual(['3', '1', '2', '4']);
    expect(moveId(o, '2', 'end')).toEqual(['1', '3', '4', '2']);
    expect(moveId(o, '1', 'left')).toBeNull();
    expect(moveId(o, '4', 'end')).toBeNull();
    expect(moveId(o, '9', 'end')).toBeNull();
  });
  it('orders card wrappers by course, unknown cards last, flex only with real cards', () => {
    const css = orderCss(['12', '7']);
    expect(css).toContain('.ic-DashboardCard__box__container:has(a.ic-DashboardCard__link){display:flex;flex-wrap:wrap');
    expect(css).toContain('reading-flow:flex-visual');
    expect(css).toContain('.ic-DashboardCard__box__container>*{order:2}');
    expect(css).toContain('[href$="/courses/12"]){order:0}');
    expect(css).toContain('[href$="/courses/7"]){order:1}');
    expect(orderCss([])).toBe('');
  });
  it('checks Canvas positions agree with an order', () => {
    expect(positionsAgree(['3', '1'], { course_3: 0, course_1: 1, course_9: 2 })).toBe(true);
    expect(positionsAgree(['3', '1'], { course_3: 1, course_1: 0 })).toBe(false);
    expect(positionsAgree(['3', '1'], { course_3: 0 })).toBe(false);
  });
});

import { clampCrop, cropSource, initialCrop, zoomCrop, HERO } from '../../src/features/card-customization/model.ts';
import { dropIndex, withAt } from '../../src/features/card-customization/drag.ts';

describe('image crop', () => {
  const fw = 236, fh = Math.round((236 * HERO.h) / HERO.w);
  it('starts centred, covering the frame', () => {
    const c = initialCrop(1000, 500, fw, fh); // wide image: height fits, sides crop
    const src = cropSource(1000, 500, c);
    expect(src.sh).toBeCloseTo(500, 5);
    expect(src.sx).toBeCloseTo((1000 - src.sw) / 2, 5);
    expect(src.sw / src.sh).toBeCloseTo(fw / fh, 5);
  });
  it('never leaves a gap, whatever the drag', () => {
    const c = clampCrop(1000, 500, { ...initialCrop(1000, 500, fw, fh), x: 500, y: -9999 });
    const src = cropSource(1000, 500, c);
    expect(src.sx).toBeCloseTo(0, 5);
    expect(src.sy + src.sh).toBeCloseTo(500, 5);
  });
  it('zooms about the centre and clamps to 1–4×', () => {
    const c0 = initialCrop(800, 800, fw, fh);
    const c2 = zoomCrop(800, 800, c0, 2);
    const a = cropSource(800, 800, c0), b = cropSource(800, 800, c2);
    expect(b.sw).toBeCloseTo(a.sw / 2, 5);
    expect(b.sx + b.sw / 2).toBeCloseTo(a.sx + a.sw / 2, 5);
    expect(zoomCrop(800, 800, c0, 9).zoom).toBe(4);
    expect(zoomCrop(800, 800, c0, 0.2).zoom).toBe(1);
  });
});

describe('drag drop index', () => {
  // Two rows of three 100×100 cards with 20 px gaps.
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const rects = new Map(ids.map((id, k) => {
    const col = k % 3, row = Math.floor(k / 3);
    const left = col * 120, top = row * 120;
    return [id, { left, top, right: left + 100, bottom: top + 100 }];
  }));
  it('drops before or after the card under the pointer', () => {
    expect(withAt(ids, 'a', dropIndex(ids, 'a', rects, 310, 50))).toEqual(['b', 'c', 'a', 'd', 'e', 'f']); // right half of c
    expect(withAt(ids, 'a', dropIndex(ids, 'a', rects, 260, 50))).toEqual(['b', 'a', 'c', 'd', 'e', 'f']); // left half of c
    expect(withAt(ids, 'f', dropIndex(ids, 'f', rects, 10, 50))).toEqual(['f', 'a', 'b', 'c', 'd', 'e']);
    expect(withAt(ids, 'b', dropIndex(ids, 'b', rects, 150, 170))).toEqual(['a', 'c', 'd', 'b', 'e', 'f']); // left half of e
  });
});
