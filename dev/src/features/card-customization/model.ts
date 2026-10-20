// card-customization data model and the CSS it generates. Pure; unit-tested.

import { cardSelectorFor, SEL } from '../card-assignments/anchors.ts';

export type LinkSlot = { kind: 'default' } | { kind: 'none' } | { kind: 'custom'; url: string };

export interface CardCustom {
  /** 'none' removes Canvas's image; otherwise an https URL or a data:image URL. */
  image?: string;
  /** Up to 4 slots, matching Canvas's tab links left to right. */
  links?: LinkSlot[];
  hidden?: boolean;
  /** The card's name when it was hidden (for the "Hidden cards" list). */
  label?: string;
  /** Only with renameVia = 'b2c' (the pending-decision fallback). */
  name?: string;
  /** b²c-only course-code label on the card (Canvas has no API for it). */
  code?: string;
}

export type Cards = Record<string, CardCustom>;

export const isCards = (v: unknown): v is Cards =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every(x => !!x && typeof x === 'object');

/** Allow http(s) URLs and raster data: images only. */
export function safeImage(u: string): string | null {
  const s = u.trim();
  if (s === 'none') return 'none';
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(s)) return s;
  try {
    const url = new URL(s);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function safeLink(u: string): string | null {
  const s = u.trim();
  if (!s) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** A CSS url("…") token that can't break out of its declaration. */
export const cssUrl = (u: string) => `url("${u.replace(/[\\"]/g, c => '\\' + c).replace(/[\n\r\f]/g, '')}")`;

/**
 * Per-course rules: hidden cards and images. Injected by start() as one
 * <style>, which lands long before Canvas renders its cards (they wait on
 * Canvas's own API call), so nothing flashes.
 */
export function customCss(cards: Cards): string {
  const out: string[] = [];
  for (const [id, c] of Object.entries(cards)) {
    const card = cardSelectorFor(id);
    const each = (suffix: string, body: string) =>
      out.push(card.split(', ').map(s => `${s}${suffix}`).join(', ') + `{${body}}`);
    if (c.hidden) each('', 'display:none!important');
    const img = c.image ? safeImage(c.image) : null;
    if (img === 'none') {
      each(` ${SEL.image}`, 'background-image:none!important');
      each(` ${SEL.hero}`, 'opacity:1!important');
    } else if (img) {
      each(` ${SEL.header}`, `background:${cssUrl(img)} center/cover no-repeat`);
      each(` ${SEL.image}`, `background-image:${cssUrl(img)}!important`);
      each(` ${SEL.hero}`, 'opacity:var(--b2c-card-image-overlay,.6)');
    }
  }
  return out.join('\n');
}

/** Favicon for a custom link: the site's own /favicon.ico. */
export function faviconFor(u: string): string | null {
  try {
    return new URL('/favicon.ico', u).href;
  } catch {
    return null;
  }
}

/** Update one card's record, dropping it when nothing is customised. */
export function withCard(cards: Cards, id: string, f: (c: CardCustom) => CardCustom): Cards {
  const next = { ...cards };
  const c = f({ ...(cards[id] ?? {}) });
  for (const k of Object.keys(c) as (keyof CardCustom)[]) if (c[k] === undefined) delete c[k];
  if (c.links && c.links.every(l => l.kind === 'default')) delete c.links;
  if (!c.hidden) delete c.label;
  if (Object.keys(c).length) next[id] = c;
  else delete next[id];
  return next;
}

/**
 * Visual card order without touching Canvas's React-owned DOM: the card
 * container becomes a wrapping flex row (same geometry as Canvas's
 * inline-block flow) and each card's wrapper gets `order`. React may reorder
 * or re-render the nodes however it likes; what she sees stays ours.
 * `reading-flow` keeps Tab order in visual order too (Chromium 137+).
 * Cards not in the list (new ones) go after the known ones, in DOM order.
 */
export function orderCss(ids: readonly string[]): string {
  if (!ids.length) return '';
  const box = `${SEL.boxContainer}:has(${SEL.link})`;
  const out = [
    `${box}{display:flex;flex-wrap:wrap;align-items:flex-start;reading-flow:flex-visual}`,
    `${SEL.boxContainer}>*{order:${ids.length}}`,
  ];
  ids.forEach((id, k) => {
    const q = id.replace(/["\\]/g, c => '\\' + c);
    out.push(`${SEL.boxContainer}>:has(${SEL.link}[href$="/courses/${q}"]){order:${k}}`);
  });
  return out.join('\n');
}

/** Move one id within an order. */
export function moveId(order: readonly string[], id: string, to: 'start' | 'left' | 'right' | 'end'): string[] | null {
  const i = order.indexOf(id);
  if (i < 0) return null;
  const j = to === 'start' ? 0 : to === 'end' ? order.length - 1 : to === 'left' ? i - 1 : i + 1;
  if (j < 0 || j >= order.length || j === i) return null;
  const next = [...order];
  next.splice(i, 1);
  next.splice(j, 0, id);
  return next;
}

/** Does Canvas's saved positions map agree with this order? */
export function positionsAgree(order: readonly string[], positions: Record<string, number | null | undefined>): boolean {
  let last = -Infinity;
  for (const id of order) {
    const p = positions[`course_${id}`];
    if (typeof p !== 'number' || p < last) return false;
    last = p;
  }
  return true;
}

// ── Image crop (card-customization.md: "a crop to the hero's aspect with
//    drag-to-position and zoom; stored downscaled to 2× hero size") ──

/** Canvas's hero is 262 × 146; stored at 2×. */
export const HERO = { w: 262, h: 146, outW: 524, outH: 292 } as const;

export interface Crop {
  /** Frame (viewport) size in CSS px. */
  fw: number;
  fh: number;
  /** Zoom on top of "cover" (1 = just covers the frame). */
  zoom: number;
  /** Image top-left relative to the frame, in frame px (≤ 0). */
  x: number;
  y: number;
}

/** Scale that makes an iw×ih image just cover the frame. */
export const coverScale = (iw: number, ih: number, fw: number, fh: number) => Math.max(fw / iw, fh / ih);

/** Keep the image covering the frame: no gaps at any edge. */
export function clampCrop(iw: number, ih: number, c: Crop): Crop {
  const zoom = Math.min(4, Math.max(1, c.zoom));
  const s = coverScale(iw, ih, c.fw, c.fh) * zoom;
  const dw = iw * s, dh = ih * s;
  return { ...c, zoom, x: Math.min(0, Math.max(c.fw - dw, c.x)), y: Math.min(0, Math.max(c.fh - dh, c.y)) };
}

/** Start centred at zoom 1. */
export function initialCrop(iw: number, ih: number, fw: number, fh: number): Crop {
  const s = coverScale(iw, ih, fw, fh);
  return { fw, fh, zoom: 1, x: (fw - iw * s) / 2, y: (fh - ih * s) / 2 };
}

/** Zoom about the frame centre. */
export function zoomCrop(iw: number, ih: number, c: Crop, zoom: number): Crop {
  const z = Math.min(4, Math.max(1, zoom));
  const k = z / c.zoom;
  const cx = c.fw / 2, cy = c.fh / 2;
  return clampCrop(iw, ih, { ...c, zoom: z, x: cx - (cx - c.x) * k, y: cy - (cy - c.y) * k });
}

/** The source rectangle (image px) the frame shows. */
export function cropSource(iw: number, ih: number, c: Crop): { sx: number; sy: number; sw: number; sh: number } {
  const s = coverScale(iw, ih, c.fw, c.fh) * c.zoom;
  return { sx: -c.x / s, sy: -c.y / s, sw: c.fw / s, sh: c.fh / s };
}
