// b²c Studio: where b²c is customised (design/spec/surfaces/studio.md). Ported
// from Design's prototype (design/v2/studio/studio.js) onto the real engine:
// - the model S is read from settings and every edit writes the keys that
//   changed (bridge.ts), so open Canvas tabs follow live; each edit is one
//   Undo step (H);
// - themes, sharing and import use the core theme API (src/core/theme/);
// - the stage (stage.ts) is a faithful-by-construction preview of tokens, not
//   a render of Canvas.
// The DOM is string templates plus event delegation, as in the prototype:
// it keeps a drag on the stage to one style write per frame (Design's input-
// to-present budget is 50 ms). Features mode is Preact (features.tsx).
import { effect } from '@preact/signals';
import { h, render } from 'preact';
import { encodeShare, importText, PRESETS, type Theme } from '../../core/theme/index.ts';
import { KEYS } from '../../core/theme/map.ts';
import { makeColorRequest } from '../../features/card-colors/palettes.ts';
import { presetRoles } from '../../features/palette/palettes.ts';
import { SECTIONS } from '../shared/layout.ts';
import { SCALE_OPTIONS } from '../shared/gpa-scale.ts';
import { RING_THUMB } from './ring.ts';
import { deepLinkRow } from '../shared/model.ts';
import { apply, schema, values } from '../shared/state.ts';
import { FeaturesPanel, present, ALL_ROWS } from '../options/features.tsx';
import {
  applyRice, exportRice, FKEYS, fromSettings, metaOf, META_KEY, riceSnap, savedFrom, savedTo, toPatch, toRice,
  type Look, type Meta, type Rice, type State,
} from './bridge.ts';
import { COURSES, CC_DEFAULT, NOW, SAMPLE_IMG, course, due, fmtDue, SAMPLE_SCALE } from './data.ts';
import {
  CANVAS_LIGHT, DENSITY, FAMILIES, I, ROLES, ROLE_GROUPS, ROLE_NAME, ROLE_SHORT, SCHOOLABLE, SECTION_NAME, VIEW_LABEL,
  apca, esc, gpa, miniHtml, onColor, ramp, resolvePal, stageHtml, wcag, type Role, type StageRice,
} from './stage.ts';
import { SCHOOL } from './data.ts';

void DENSITY;
type Scheme = 'light' | 'dark';
type Sel = { part: string; cid?: string; idx?: number; tab?: string; focus?: string };

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T | null;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const normHex = (v: unknown) => { let x = String(v ?? '').trim(); if (!x.startsWith('#')) x = '#' + x; if (/^#[0-9a-f]{3}$/i.test(x)) x = '#' + [...x.slice(1)].map(c => c + c).join(''); return /^#[0-9a-f]{6}$/i.test(x) ? x.toLowerCase() : null; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Bundled themes (core PRESETS) in the Studio's shape ──
const BUNDLED: Rice[] = PRESETS.map(p => ({ ...toRice(p.theme, p.id), id: p.id, bundled: true }));
const themeById = (id: string) => BUNDLED.find(t => t.id === id) ?? S.saved.find(t => t.id === id);
const DARK_DEFAULT = presetRoles('dark');

// ── State, history ──
let S: State;
const UI = {
  sel: null as Sel | null, role: null as Role | null, hover: null as Sel | null, mode: 'look' as 'look' | 'features', featSec: null as string | null,
  stageTab: 'dashboard', sheet: null as any, menu: null as string | null, query: '', results: [] as SearchHit[], resIdx: 0,
  preview: null as null | { name: string; scheme: Scheme; rice: StageRice; withCss: boolean; values: Record<string, unknown> },
  offer: null as null | { name: string; colors: string[] }, saving: false, revert: null as null | { name: string; snap: string },
  hoverPart: null as string | null, flashRow: null as string | null, nativeDark: false, drag: null as any, ordDrag: null as any, chain: null as Sel[] | null, tabs: 0,
};
const H: { past: { s: string; label: string }[]; future: { s: string; label: string }[] } = { past: [], future: [] };
let coKey: string | null = null, coT = 0;
const NOTES = 'Ask about the Lab 3 template in Thursday’s office hours.\nMidterm 1 covers chapters 3 and 4.';

// Writes: S → settings (the keys that changed), plus the Studio's own record.
let writing = 0, persistQueued = false;
async function persist() {
  const patch = toPatch(S, values.value);
  const saved = savedTo(S.saved, S);
  if (Object.hasOwn(values.value, 'themes.saved') && JSON.stringify(values.value['themes.saved']) !== JSON.stringify(saved)) patch['themes.saved'] = saved;
  saveMeta();
  if (!Object.keys(patch).length) return;
  writing++;
  try { await apply(patch); } finally { writing--; }
}
function persistSoon() {
  if (persistQueued) return;
  persistQueued = true;
  requestAnimationFrame(() => { persistQueued = false; void persist(); });
}
let metaTimer: ReturnType<typeof setTimeout> | undefined;
function saveMeta() { clearTimeout(metaTimer); metaTimer = setTimeout(() => void chrome.storage.local.set({ [META_KEY]: metaOf(S) }).catch(() => {}), 150); }

function commit(label: string, fn: () => void, opts: { key?: string; light?: boolean; toast?: string } = {}) {
  const before = JSON.stringify(S);
  fn();
  if (JSON.stringify(S) === before) { if (!opts.light) renderAll(); return; }
  const now = Date.now();
  if (!(opts.key && opts.key === coKey && now - coT < 900)) { H.past.push({ s: before, label }); if (H.past.length > 300) H.past.shift(); }
  coKey = opts.key ?? null; coT = now; H.future = [];
  if (opts.light) { renderLive(); persistSoon(); } else { renderAll(); void persist(); }
  if (opts.toast) toast(opts.toast, true);
}
function pushHistory(before: string, label: string) { if (before !== JSON.stringify(S)) { H.past.push({ s: before, label }); H.future = []; coKey = null; } }
function undo() {
  const e = H.past.pop(); if (!e) { say('Nothing to undo'); return; }
  H.future.push({ s: JSON.stringify(S), label: e.label }); S = JSON.parse(e.s); coKey = null; endPreview();
  renderAll(); void persist(); toast('Undid: ' + e.label, false); say('Undid ' + e.label);
}
function redo() {
  const e = H.future.pop(); if (!e) { say('Nothing to redo'); return; }
  H.past.push({ s: JSON.stringify(S), label: e.label }); S = JSON.parse(e.s); coKey = null;
  renderAll(); void persist(); toast('Redid: ' + e.label, false); say('Redid ' + e.label);
}

// Key paths: p.<role> → the slot being edited; l.* → the shared look; f.* → features; cc.<id> → course colours.
function editPal(): Record<string, string> {
  if (S.editing === 'light') { if (!S.pal.light) S.pal.light = { ...CANVAS_LIGHT } as never; return S.pal.light as never; }
  return S.pal.dark as never;
}
function getK(k: string, src: any = S): any {
  const [root, ...path] = k.split('.') as [string, ...string[]];
  if (root === 'p') { const p = src.pal[S.editing] ?? (S.editing === 'light' ? CANVAS_LIGHT : {}); return p[path[0]!] || (path[0] === 'success' || path[0] === 'warning' || path[0] === 'danger' ? resolvePal(p, S.editing)[path[0] as Role] : p[path[0]!]); }
  let o: any = root === 'l' ? src.look : root === 'f' ? src.f : root === 'cc' ? src.cc : src[root];
  for (const p of path) o = o == null ? undefined : o[p];
  return o;
}
function setK(k: string, v: unknown) {
  const [root, ...path] = k.split('.') as [string, ...string[]];
  if (root === 'p') { editPal()[path[0]!] = v as string; return; }
  if (!path.length) { (S as any)[root] = v; return; }
  let o: any = root === 'l' ? S.look : root === 'f' ? S.f : root === 'cc' ? S.cc : (S as any)[root];
  for (const p of path.slice(0, -1)) o = o[p];
  o[path[path.length - 1]!] = v;
}
const FDEF_BASE: Record<string, unknown> = {};
function baseVal(k: string): unknown {
  const [root] = k.split('.');
  if (root === 'f') return FDEF_BASE[k.slice(2)];
  if (root === 'cc') return CC_DEFAULT[k.split('.')[1]!];
  const b = JSON.parse(S.base.snap);
  return getK(k, { pal: b.pal, look: b.look });
}
const changed = (k: string) => JSON.stringify(getK(k)) !== JSON.stringify(baseVal(k));
const isEdited = () => riceSnap(S) !== S.base.snap;
const currentName = () => (isEdited() ? (S.base.name === 'b²c defaults' ? 'My theme' : S.base.name + ' (remix)') : S.base.name);
const slotPal = (sc: Scheme) => resolvePal(S.pal[sc] ?? (sc === 'light' ? CANVAS_LIGHT : DARK_DEFAULT), sc);
function inSchedule() { const n = new Date(), m = n.getHours() * 60 + n.getMinutes(), t = (x: string) => { const [a, b] = x.split(':').map(Number); return (a ?? 0) * 60 + (b ?? 0); }; const a = t(S.sched.from), b = t(S.sched.to); return a <= b ? m >= a && m < b : m >= a || m < b; }
const sysDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const slotInUse = (): Scheme => (S.useDark === 'always' ? 'dark' : S.useDark === 'never' ? 'light' : S.useDark === 'system' ? (sysDark() ? 'dark' : 'light') : inSchedule() ? 'dark' : 'light');
const ccList = () => COURSES.map(c => S.cc[c.id]!);

function applyTheme(id: string) {
  const t = themeById(id); if (!t) return;
  const where = Object.keys(t.palette).map(s => (s === 'light' ? 'Light' : 'Dark')).join(' and ') || 'your';
  commit(`Apply ${t.name}`, () => applyRice(S, t), { toast: `Applied ${t.name} to the ${where} theme` });
  const cur = ccList().map(c => c.toLowerCase());
  UI.offer = t.colors?.length && JSON.stringify(t.colors.slice(0, COURSES.length).map(c => c.toLowerCase())) !== JSON.stringify(cur) ? { name: t.name, colors: t.colors } : null;
  renderStagebar();
}
/** Course colours are Canvas's own: written to her real cards (in card order) through card-colors. */
function applyCourseColors(colors: string[], name: string) {
  commit(`Course colours from ${name}`, () => COURSES.forEach((c, i) => (S.cc[c.id] = colors[i % colors.length]!)), { toast: `Course colours from ${name}: applied to your courses in Canvas, in card order` });
  const req = colors.length === 1 ? makeColorRequest({ mode: 'single', color: colors[0]! }) : { id: makeColorRequest({ mode: 'revert' }).id, mode: 'list', colors: [...colors] };
  void apply({ [KEYS.colorRequest]: req });
  UI.offer = null; renderStagebar();
}

// ── Stage ──
function stageRice(): StageRice { return UI.preview ? UI.preview.rice : { pal: S.pal, look: S.look, cc: S.cc }; }
function stageScheme(): Scheme { return UI.preview ? UI.preview.scheme : S.editing; }
let SCALE = 1;
function renderStage() {
  // A selected section whose feature is off still shows (marked Off), so its inspector has something to stand beside.
  const force = UI.sel && UI.mode === 'look' ? [UI.sel.part] : [];
  $('#frame')!.innerHTML = stageHtml({ R: stageRice(), sc: stageScheme(), f: S.f, tab: UI.stageTab, notesText: NOTES, force }, DARK_DEFAULT);
  applyCss();
}
function applyCss() {
  const css = UI.preview ? (UI.preview.withCss ? UI.preview.rice.look.css : '') : S.f.cssOn ? S.look.css : '';
  $('#theme-css')!.textContent = css && css.trim() ? `@scope (#frame) {\n${css}\n}` : '';
}
function layoutStage() {
  const vp = $('#vp')!, gutter = UI.mode === 'look' ? 304 + 28 : 0;
  SCALE = clamp((vp.clientWidth - 32 - gutter) / 1366, 0.3, 1);
  const fw = $('#frame-wrap')!; fw.style.transform = `scale(${SCALE})`;
  const hh = $('#frame')!.offsetHeight;
  $('#ov')!.style.height = 16 + hh * SCALE + 24 + 'px';
}
function relRect(el: Element) { const vp = $('#vp')!, r = el.getBoundingClientRect(), v = vp.getBoundingClientRect(); return { x: r.left - v.left + vp.scrollLeft, y: r.top - v.top + vp.scrollTop, w: r.width, h: r.height }; }
const PARTS: Record<string, string> = { page: 'Page', nav: 'Navigation bar', text: 'Heading text', link: 'Link', grid: 'Course cards', card: 'Course card', panel: 'Side panel', todo: 'To do', notes: 'Notes', gpa: 'GPA', cnav: 'Course navigation', content: 'Page content', box: 'Sidebar box', accent: 'Primary button', table: 'Grades table', goal: 'Grade goal' };
function partOf(el: HTMLElement): Sel { const p = el.dataset.part!, o: Sel = { part: p }; if (el.dataset.cid) o.cid = el.dataset.cid; const same = $$(`#frame [data-part="${p}"]`); if (same.length > 1 && !o.cid) o.idx = same.indexOf(el); return o; }
function elFor(sel: Sel | null): HTMLElement | null { if (!sel) return null; const list = $$(`#frame [data-part="${sel.part}"]${sel.cid ? `[data-cid="${sel.cid}"]` : ''}`); return list[sel.idx ?? 0] ?? list[0] ?? null; }
const partLabel = (sel: Sel) => PARTS[sel.part] + (sel.cid ? ' · ' + course(sel.cid).short : '');
const sameSel = (a: Sel | null, b: Sel | null) => !!a && !!b && a.part === b.part && a.cid === b.cid && (a.idx ?? 0) === (b.idx ?? 0);

function renderOverlay({ keepInspector = false } = {}) {
  const ov = $('#ov')!, vp = $('#vp')!;
  ov.querySelectorAll('.o-hover,.o-sel,.o-conn,.h,.h-lbl').forEach(n => n.remove());
  let insp = $('#insp');
  if (!insp) { insp = document.createElement('div'); insp.id = 'insp'; insp.className = 'insp'; insp.setAttribute('role', 'dialog'); ov.appendChild(insp); }
  if (UI.mode !== 'look') insp.hidden = true;
  const box = (sel: Sel, cls: string) => { const el = elFor(sel); if (!el) return null; const r = relRect(el); const d = document.createElement('div'); d.className = cls; Object.assign(d.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); d.innerHTML = `<span class="o-tag">${esc(partLabel(sel))}</span>`; ov.appendChild(d); return r; };
  if (UI.hover && !sameSel(UI.hover, UI.sel)) box(UI.hover, 'o-hover');
  if (UI.hoverPart) $$(`#frame [data-part="${UI.hoverPart}"]`).slice(0, 4).forEach(el => box(partOf(el), 'o-hover'));
  const r = UI.sel && !UI.preview && UI.mode === 'look' ? box(UI.sel, 'o-sel') : null;
  if (UI.mode !== 'look') return;
  insp.hidden = false;
  if (!keepInspector) { insp.innerHTML = inspectorHtml(); insp.classList.toggle('idle', !UI.sel); insp.setAttribute('aria-label', UI.sel ? partLabel(UI.sel) + ' inspector' : 'Inspector'); }
  const gx = 16 + 1366 * SCALE + 14, ih = insp.offsetHeight, top0 = vp.scrollTop + 8, bot = vp.scrollTop + vp.clientHeight - 8;
  const top = r ? clamp(r.y, top0, Math.max(top0, bot - ih)) : top0;
  Object.assign(insp.style, { left: gx + 'px', top: top + 'px' });
  const body = $('.i-body', insp); if (body) body.style.maxHeight = vp.clientHeight - 80 + 'px';
  if (r && r.x + r.w < gx - 4) {
    const cy = clamp(top + 18, r.y + 6, r.y + r.h - 6), c = document.createElement('div');
    c.className = 'o-conn'; Object.assign(c.style, { left: r.x + r.w + 2 + 'px', top: cy + 'px', width: gx - r.x - r.w - 2 + 'px' }); ov.appendChild(c);
  }
  if (r && (UI.sel!.part === 'card' || UI.sel!.part === 'grid') && !UI.role) handles(UI.sel!.part === 'card' ? elFor(UI.sel) : $('#frame .b2c-card'));
}
const HANDLES: Record<string, { k: string; min: number; max: number; label: string; unit: string }> = {
  width: { k: 'l.cards.width', min: 220, max: 360, label: 'Card width', unit: 'px' },
  gap: { k: 'l.cards.gap', min: 8, max: 48, label: 'Gap between cards', unit: 'px' },
  corner: { k: 'l.shape.corner', min: 0, max: 12, label: 'Corner radius', unit: 'px' },
};
function handles(card: HTMLElement | null) {
  if (!card) return;
  const ov = $('#ov')!, r = relRect(card), cardsEl = $$('#frame .b2c-card'), cards = cardsEl.map(relRect), i = cardsEl.indexOf(card);
  const mk = (hn: string, cls: string, st: Record<string, string>) => { const d = document.createElement('div'), HH = HANDLES[hn]!, v = getK(HH.k); d.className = 'h ' + cls; d.dataset.h = hn; d.tabIndex = 0;
    d.setAttribute('role', 'slider'); d.setAttribute('aria-label', HH.label + ' (drag, or use arrow keys; Shift for 10)'); d.setAttribute('aria-valuemin', String(HH.min)); d.setAttribute('aria-valuemax', String(HH.max)); d.setAttribute('aria-valuenow', String(v)); d.setAttribute('aria-valuetext', v + ' pixels');
    Object.assign(d.style, st); ov.appendChild(d); return d; };
  const lbl = (t: string, x: number, y: number, cls = '') => { const d = document.createElement('div'); d.className = 'h-lbl ' + cls; d.textContent = t; Object.assign(d.style, { left: x + 'px', top: y + 'px' }); ov.appendChild(d); };
  mk('width', 'h-w', { left: r.x + r.w - 6 + 'px', top: r.y + r.h * 0.62 + 'px', height: '40px' });
  lbl('W ' + getK('l.cards.width') + ' px', r.x + r.w / 2 - 30, r.y + r.h + 5);
  const cpx = Math.max(10, getK('l.shape.corner') * SCALE);
  mk('corner', 'h-c', { left: r.x + r.w - cpx - 10 + 'px', top: r.y + r.h - cpx - 10 + 'px' });
  lbl('r ' + getK('l.shape.corner'), r.x + r.w - cpx - 40, r.y + r.h - cpx - 12);
  let nb = cards[i + 1] && Math.abs(cards[i + 1]!.y - r.y) < 4 ? cards[i + 1]! : null, sign = 1;
  if (!nb && cards[i - 1] && Math.abs(cards[i - 1]!.y - r.y) < 4) { nb = cards[i - 1]!; sign = -1; }
  if (nb) {
    const x0 = sign > 0 ? r.x + r.w : nb.x + nb.w, x1 = sign > 0 ? nb.x : r.x, w = Math.max(8, x1 - x0);
    const g = mk('gap', 'h-g', { left: x0 + (x1 - x0) / 2 - w / 2 + 'px', width: w + 'px', top: r.y + r.h * 0.12 + 'px', height: r.h * 0.4 + 'px' }); g.dataset.sign = String(sign);
    lbl('gap ' + getK('l.cards.gap'), x0 + (x1 - x0) / 2 - 22, r.y + r.h * 0.12 - 20, 'g');
  }
}

// ── Inspector ──
let uid = 0;
const J = (v: unknown) => esc(JSON.stringify(v));
function resetBtn(k: string, label: string) { const b = baseVal(k); return `<button class="reset ${changed(k) ? 'on' : ''}" data-act="reset" data-k="${k}" aria-label="Reset ${esc(label)}" title="Reset to ${esc(typeof b === 'string' ? b : JSON.stringify(b))}">↺</button>`; }
function rRange(label: string, k: string, min: number, max: number, step: number, unit: string) {
  const v = step < 1 ? Number(getK(k)).toFixed(2) : getK(k), id = 'ir' + ++uid;
  return `<div class="i-row" data-row="${k}"><span class="lb" id="${id}">${label}</span><span class="c"><span class="x-range"><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-k="${k}" data-ctl="range" aria-labelledby="${id}" aria-valuetext="${v} ${unit}"><input class="x-input x-num" value="${v}" data-k="${k}" data-ctl="num" aria-label="${label} value" inputmode="decimal"></span><span class="x-unit">${unit}</span></span>${resetBtn(k, label)}</div>`;
}
function rSeg(label: string, k: string, opts: [unknown, string][], { dis = false } = {}) {
  const v = getK(k), id = 'ir' + ++uid, stack = opts.map(o => o[1]).join('').length > 19;
  return `<div class="i-row ${stack ? 'stack' : ''}" data-row="${k}"><span class="lb" id="${id}">${label}</span><span class="c"><span class="x-seg" role="radiogroup" aria-labelledby="${id}" ${dis ? 'aria-disabled="true" style="opacity:.45;pointer-events:none"' : ''}>${opts.map(([ov, l]) => `<button role="radio" aria-checked="${JSON.stringify(v) === JSON.stringify(ov)}" data-act="set" data-k="${k}" data-v="${J(ov)}">${l}</button>`).join('')}</span></span>${resetBtn(k, label)}</div>`;
}
function rStep(label: string, k: string, min: number, max: number, { tag = '', dis = false } = {}) {
  const v = getK(k), id = 'ir' + ++uid;
  return `<div class="i-row" data-row="${k}" ${dis ? 'style="opacity:.45;pointer-events:none"' : ''}><span class="lb" id="${id}">${label}</span><span class="c"><span class="x-stepper"><button data-act="step" data-k="${k}" data-v="-1" data-min="${min}" data-max="${max}" aria-label="Fewer">−</button><input value="${v}" data-k="${k}" data-ctl="int" data-min="${min}" data-max="${max}" aria-labelledby="${id}" inputmode="numeric"><button data-act="step" data-k="${k}" data-v="1" data-min="${min}" data-max="${max}" aria-label="More">+</button></span>${tag}</span>${resetBtn(k, label)}</div>`;
}
function rSw(label: string, k: string, tag = '') {
  const id = 'ir' + ++uid;
  return `<div class="i-row" data-row="${k}"><span class="lb" id="${id}" style="width:auto;flex:1;color:var(--b2c-ui-text)">${label} ${tag}</span><button class="x-switch" role="switch" aria-checked="${!!getK(k)}" aria-labelledby="${id}" data-act="toggle" data-k="${k}"></button>${resetBtn(k, label)}</div>`;
}
const featTag = '<span class="tagp" style="font-size:10px;border:1px solid var(--line);padding:0 4px;color:var(--b2c-ui-text-secondary)">Feature</span>';
const sec = (k: string, body: string, tag = '') => `<div class="i-sec"><div class="k">${k}${tag ? `<span class="tagp">${tag}</span>` : ''}</div>${body}</div>`;
const FLOOR: Partial<Record<Role, [number, number]>> = { text: [7, 75], textSecondary: [4.5, 60], textTertiary: [4.5, 45], link: [4.5, 60], navText: [4.5, 60] };
function pairs(role: Role, p: Record<Role, string>): [string, string, string, [number, number] | null][] {
  const T: Role[] = ['text', 'textSecondary', 'textTertiary', 'link'], B: Role[] = ['bg', 'surface', 'surfaceRaised'];
  if (T.includes(role)) return B.map(b => [p[role], p[b], 'on ' + ROLE_SHORT[b], FLOOR[role] ?? null]);
  if (B.includes(role)) return T.map(t => [p[t], p[role], ROLE_SHORT[t] + ' on it', FLOOR[t] ?? null]);
  if (role === 'nav' || role === 'navText') return [[p.navText, p.nav, 'Nav text on nav', FLOOR.navText!]];
  if (role === 'accent') return [[onColor(p.accent), p.accent, 'Button label on it', [4.5, 60]]];
  if (role === 'border') return [[p.border, p.surface, 'Against Surface', null], [p.border, p.bg, 'Against Page', null]];
  return [[p[role], p.surface, 'On Surface', null], [p[role], p.bg, 'On Page', null]];
}
const failsFloor = (role: Role, p: Record<Role, string>) => pairs(role, p).some(([f, b, , fl]) => fl && (wcag(f, b) < fl[0] || apca(f, b) < fl[1]));
function contrastHtml(role: Role, p: Record<Role, string>) {
  const rows = pairs(role, p).map(([f, b, l, fl]) => {
    const w = wcag(f, b), lc = apca(f, b), okW = !fl || w >= fl[0], okL = !fl || lc >= fl[1];
    const g = w >= 7 ? 'AAA' : w >= 4.5 ? 'AA' : w >= 3 ? 'Large only' : 'Fails';
    return `<tr><td class="sp"><span class="spec" style="color:${f};background:${b}">Aa</span></td><td>${l}</td><td class="num ${fl ? (okW ? 'ok' : 'bad') : ''}">${w.toFixed(1)}:1 ${g}</td><td class="num ${fl ? (okL ? 'ok' : 'bad') : ''}">Lc ${lc}</td></tr>`;
  }).join('');
  const fl = pairs(role, p).find(x => x[3]);
  return `<table class="contrast">${rows}</table><div class="i-note">${fl ? `Floor: ${fl[3]![0]}:1 and Lc ${fl[3]![1]}. Under it, b²c warns and never blocks or fixes anything.` : 'Information only: no floor applies to this role.'} The rendered stage is the final check.</div>`;
}
function wellsHtml(roles: Role[], p: Record<Role, string>) {
  return `<div class="wells">${roles.map(r => { const raw = getK('p.' + r); return `<button class="well" data-act="role" data-v="${r}" title="${ROLE_NAME[r]}: ${raw === 'school' ? 'school colour' : raw}"><i class="${raw === 'school' ? 'school' : ''}" style="background:${p[r]}"></i><span class="${failsFloor(r, p) ? 'w' : ''}">${ROLE_SHORT[r]}${failsFloor(r, p) ? ' ⚠' : ''}</span></button>`; }).join('')}</div>`;
}
function rolePicker(role: Role) {
  const sc = S.editing, p = slotPal(sc), raw = getK('p.' + role), hex = p[role];
  const theme = [...new Set(ROLES.map(r => p[r]).concat(ccList()))].slice(0, 18);
  const sw = (c: string, cls = 'swatch') => `<button class="${cls}" role="radio" aria-checked="${raw === c}" aria-label="${c}" title="${c}" data-act="set" data-k="p.${role}" data-v="${J(c)}" style="background:${c}"></button>`;
  const school = SCHOOLABLE.includes(role) ? `<button class="x-btn" data-act="set" data-k="p.${role}" data-v="${J('school')}" aria-pressed="${raw === 'school'}" title="Follow the school's brand colour on each Canvas">${raw === 'school' ? '✓ ' : ''}School colour</button>` : '';
  const hasEye = 'EyeDropper' in window;
  const eye = `<button class="x-btn x-ibtn" data-act="eyedrop" data-v="${role}" title="${hasEye ? 'Pick a colour from the screen' : 'This browser has no eyedropper'}" aria-label="Eyedropper" ${hasEye ? '' : 'disabled'}>⌖</button>`;
  return sec(ROLE_NAME[role] + ` · ${sc === 'light' ? 'Light' : 'Dark'} theme`, `<div class="rp-top"><span class="rp-big" style="background:${hex}"></span><input class="x-input mono" data-k="p.${role}" data-ctl="hex" value="${raw === 'school' ? 'school' : hex}" aria-label="${ROLE_NAME[role]} hex value" spellcheck="false">${eye}${resetBtn('p.' + role, ROLE_NAME[role])}</div>${school ? `<div style="margin-top:6px">${school} <span class="i-note">${raw === 'school' ? 'Worked out from each school’s Canvas colours' : ''}</span></div>` : ''}`)
    + sec('This theme’s colours', `<div class="swatches" role="radiogroup" aria-label="Theme colours">${theme.map(c => sw(c)).join('')}</div>`)
    + sec('Lighter · darker (same hue)', `<div class="ramp" role="radiogroup" aria-label="Lightness steps">${ramp(hex).map(c => sw(c)).join('')}</div>`)
    + sec('Contrast', contrastHtml(role, p));
}
const VIEW_SVG: Record<string, string> = {
  list: '<svg viewBox="0 0 60 38"><g fill="currentColor" opacity=".55"><rect x="4" y="5" width="2" height="7"/><rect x="9" y="6" width="34" height="2.4"/><rect x="9" y="10" width="18" height="1.6" opacity=".6"/><rect x="4" y="16" width="2" height="7"/><rect x="9" y="17" width="40" height="2.4"/><rect x="9" y="21" width="16" height="1.6" opacity=".6"/><rect x="4" y="27" width="2" height="7"/><rect x="9" y="28" width="30" height="2.4"/><rect x="9" y="32" width="20" height="1.6" opacity=".6"/></g></svg>',
  ring: RING_THUMB,
  week: '<svg viewBox="0 0 60 38"><g fill="none" stroke="currentColor" stroke-opacity=".35">' + [0, 1, 2, 3, 4, 5, 6].map(i => `<rect x="${3 + i * 8}" y="5" width="7" height="22"/>`).join('') + '</g><g fill="currentColor" opacity=".7"><rect x="4" y="10" width="5" height="2.5"/><rect x="12" y="10" width="5" height="2.5"/><rect x="12" y="14" width="5" height="2.5"/><rect x="28" y="10" width="5" height="2.5"/><rect x="36" y="10" width="5" height="2.5"/></g><rect x="3" y="30" width="34" height="2" fill="currentColor" opacity=".4"/></svg>',
  courses: '<svg viewBox="0 0 60 38"><g fill="currentColor"><rect x="4" y="4" width="4" height="4" opacity=".8"/><rect x="11" y="5" width="16" height="2.4" opacity=".6"/><rect x="11" y="10" width="34" height="1.8" opacity=".35"/><rect x="11" y="14" width="28" height="1.8" opacity=".35"/><rect x="4" y="20" width="4" height="4" opacity=".8"/><rect x="11" y="21" width="16" height="2.4" opacity=".6"/><rect x="11" y="26" width="30" height="1.8" opacity=".35"/><rect x="11" y="30" width="24" height="1.8" opacity=".35"/></g></svg>',
};
function orderHtml() {
  const secs = S.look.layout.sections, on: Record<string, unknown> = { todo: S.f.todo, notes: S.f.notes, gpa: S.f.gpa };
  return `<div class="order" role="list" aria-label="Section order">${secs.map((id, i) => `<div class="ord ${UI.ordDrag && UI.ordDrag.id === id ? 'lift' : ''}" role="listitem" data-ord="${id}"><button class="grip" data-act="ordkey" data-v="${id}" aria-label="Move ${SECTION_NAME[id]}, position ${i + 1} of ${secs.length}. Drag, or press Up and Down." title="Drag to reorder">⠿</button><span class="nm">${SECTION_NAME[id]}</span><span class="st">${on[id] ? 'Shown' : 'Off'}</span></div>`).join('')}</div>${resetBtn('l.layout.sections', 'Section order').replace('class="reset', 'style="margin-top:2px" class="reset')}`;
}
const sideOrderSecs = () => sec('Side panel', rSeg('Side', 'l.layout.panel', [['right', 'Right'], ['left', 'Left'], ['hidden', 'Hidden']]) + '<div class="i-note" style="margin-top:4px">Section order</div>' + orderHtml(), 'Layout');
function cardInspector() {
  const L = S.look, p = slotPal(S.editing);
  let hh = sec('Size', '<div class="i-note">Drag the handles on the card, or focus one and use the arrow keys (Shift for 10).</div>'
    + rRange('Width', 'l.cards.width', 220, 360, 1, 'px') + rRange('Gap', 'l.cards.gap', 8, 48, 1, 'px') + rRange('Corner', 'l.shape.corner', 0, 12, 1, 'px')
    + '<div class="i-note">Corner is one dial for every b²c shape: cards, chips, buttons and panels.</div>' + rSeg('Border', 'l.shape.border', [[0, 'None'], [1, '1 px'], [2, '2 px']]), 'Layout · Shape');
  hh += sec('Face', rSeg('Face', 'l.cards.style', [['flat', 'Solid'], ['gradient', 'Gradient'], ['image', 'Image']]) + (L.cards.style === 'image' ? rSw('Colour over images', 'l.cards.overlay') : '') + rSeg('Height', 'l.cards.height', [['standard', 'Standard'], ['condensed', 'Condensed']]), 'Layout');
  hh += sec('Due list', rSeg('Show', 'l.views.cards', [['rows', 'Rows'], ['next', 'Next only'], ['count', 'Count']]) + rStep('Rows', 'f.nShown', 1, 8, { tag: featTag, dis: L.views.cards !== 'rows' || !S.f.cardAssign }), 'Views');
  const pals = BUNDLED.filter(t => t.colors?.length).slice(0, 7);
  hh += sec('Course colours', `<div class="i-note">Applies to your courses in Canvas, in your card order. Undo puts yours back. To colour one course, use its card’s ⋮ menu in Canvas.</div>${pals.map(t => `<button class="fam" data-act="ccpal" data-v="${t.id}" style="width:100%"><span class="cpal">${t.colors!.slice(0, 6).map(c => `<i style="background:${c}"></i>`).join('')}</span><span class="n" style="margin-left:auto">${esc(t.name)}</span></button>`).join('')}`, 'Personal');
  hh += sec('Card colours', wellsHtml(['surface', 'border', 'text', 'textSecondary'], p), 'Palette');
  return { body: hh, foot: '<button class="x-link" data-act="feat" data-v="dashboard">Dashboard settings ›</button>' };
}
function inspectorHtml(): string {
  uid = 0;
  if (!UI.sel) return idleHtml();
  const sel = UI.sel, p = slotPal(S.editing);
  const chain = UI.chain ?? [sel];
  const crumbs = chain.map((c, i) => (i === chain.length - 1 && !UI.role ? `<b>${esc(partLabel(c))}</b>` : `<button data-act="crumb" data-v="${i}">${esc(PARTS[c.part])}</button><span>›</span>`)).join('') + (UI.role ? `<b>${ROLE_NAME[UI.role]}</b>` : '');
  let out = { body: '', foot: '' };
  const DENS: [string, string][] = [['compact', 'Compact'], ['comfortable', 'Comfortable'], ['roomy', 'Roomy']];
  if (UI.role) out.body = rolePicker(UI.role);
  else switch (sel.part) {
    case 'card': case 'grid': out = cardInspector(); break;
    case 'page': out.body = sec(`Palette · ${S.editing === 'light' ? 'Light' : 'Dark'} theme (${esc(S.from[S.editing])})`, ROLE_GROUPS.map(([g, rs]) => `<div class="well-grp">${g}</div>${wellsHtml(rs, p)}`).join('') + '<div class="i-note" style="margin-top:8px">Click a colour to change it. ⚠ marks a role under its contrast floor.</div>', 'Palette')
      + sec('Page', rSeg('Width', 'l.layout.width', [['standard', 'Standard'], ['wide', 'Wide'], ['full', 'Full']]), 'Layout'); break;
    case 'nav': out.body = sec('Navigation bar', wellsHtml(['nav', 'navText'], p) + rSeg('Colour', 'f.navStyle', [['school', 'School'], ['theme', 'Theme']]), 'Palette')
      + sec('Logo', rSw('Hide institution logo', 'f.hideLogo', featTag)); break;
    case 'text': case 'content':
      out.body = sec('Font', `<div class="fams" role="radiogroup" aria-label="Font family">${FAMILIES.map(([n, stack, d]) => `<button class="fam" role="radio" aria-checked="${S.look.type.family === n}" data-act="set" data-k="l.type.family" data-v="${J(n)}"><span class="s" style="font-family:${esc(stack)}">${n === 'Canvas default' ? 'Lato' : n}</span><span class="n">${d}</span></button>`).join('')}</div><div class="i-note">No font is downloaded: these ship with b²c. ${resetBtn('l.type.family', 'Font').replace('class="reset', 'style="vertical-align:middle" class="reset')}</div>`, 'Type')
        + sec('Size and density', rRange('Size', 'l.type.scale', 0.9, 1.15, 0.01, '×') + rSeg('Density', 'l.density', DENS), 'Type')
        + sec('Text colours', wellsHtml(['text', 'textSecondary', 'textTertiary', 'link'], p), 'Palette'); break;
    case 'link': UI.role = 'link'; return inspectorHtml();
    case 'accent': UI.role = 'accent'; return inspectorHtml();
    case 'box': out.body = sec('Box colours', wellsHtml(['surface', 'border', 'success', 'warning'], p), 'Palette') + sec('Shape', rRange('Corner', 'l.shape.corner', 0, 12, 1, 'px') + rSeg('Border', 'l.shape.border', [[0, 'None'], [1, '1 px'], [2, '2 px']]), 'Shape'); break;
    case 'cnav': out.body = sec('Course navigation', wellsHtml(['link', 'text', 'surfaceRaised', 'border'], p), 'Palette'); break;
    case 'table': out.body = sec('Table colours', wellsHtml(['surface', 'border', 'text', 'textSecondary', 'danger', 'warning', 'link'], p), 'Palette') + sec('Rows', rSeg('Density', 'l.density', DENS), 'Type'); break;
    case 'panel': out.body = sideOrderSecs(); break;
    case 'todo':
      out.body = sec('View', `<div class="views" role="radiogroup" aria-label="To-do view">${Object.keys(VIEW_LABEL).map(v => `<button class="vthumb" role="radio" aria-checked="${S.look.views.todo === v}" data-act="set" data-k="l.views.todo" data-v="${J(v)}">${VIEW_SVG[v]}${VIEW_LABEL[v]}</button>`).join('')}</div><div class="i-note">${resetBtn('l.views.todo', 'To-do view').replace('class="reset', 'style="vertical-align:middle" class="reset')} Stand-ins for the views; the to-do list draws them for real.</div>`, 'Views')
        + sec('List', rStep('Number shown', 'f.todoN', 3, 20, { tag: featTag }) + rSw('Use course colours', 'f.todoColors', featTag) + rSw('Show announcements', 'f.todoAnn', featTag))
        + sideOrderSecs();
      out.foot = '<button class="x-link" data-act="feat" data-v="todo">To-do settings ›</button>'; break;
    case 'notes': out.body = sec('Notes', rSw('Show Notes', 'f.notes', featTag) + '<div class="i-note">What you write is personal and never goes in a theme.</div>') + sideOrderSecs(); out.foot = '<button class="x-link" data-act="feat" data-v="dashboard">Dashboard settings ›</button>'; break;
    case 'gpa': { const g = gpa(S.f);
      out.body = sec('GPA', rSw('Show GPA', 'f.gpa', featTag) + `<div class="i-row"><span class="lb">Scale</span><span class="c"><select class="x-select" data-k="f.gpaScale" data-ctl="select" aria-label="Grade scale" style="flex:1">${SCALE_OPTIONS(S.f.gpaScale === 'custom').map(([v, l]) => `<option value="${v}" ${S.f.gpaScale === v ? 'selected' : ''}>${l}</option>`).join('')}</select></span>${resetBtn('f.gpaScale', 'Scale')}</div>`
        + rSeg('Rounding', 'f.rounding', [['auto', 'Automatic'], ['truncate', 'Truncate'], ['round', 'Round']]) + `<div class="i-note">${g.raw.toFixed(4)} → <b>${g.shown}</b> (${g.mode === 'truncate' ? 'truncated' : 'rounded'})</div>`) + sideOrderSecs();
      out.foot = '<button class="x-link" data-act="feat" data-v="grades">Grades settings ›</button>'; break; }
    case 'goal': out.body = sec('Grade goal', rSw('Grade goals', 'f.goals', featTag) + '<div class="i-note">The goal box is hypothetical and dashed so it never reads as Canvas’s total. Set a goal per course from its Grades page or a card’s ⋮ menu.</div>'); out.foot = '<button class="x-link" data-act="feat" data-v="grades">Grades settings ›</button>'; break;
  }
  return `<div class="i-h"><div class="i-crumbs">${crumbs}</div>${UI.role && !['link', 'accent'].includes(sel.part) ? '<button class="x-btn quiet x-ibtn" data-act="roleback" aria-label="Back" title="Back">‹</button>' : ''}<button class="x-btn quiet x-ibtn" data-act="desel" aria-label="Close inspector" title="Close (Esc)">×</button></div><div class="i-body">${out.body}</div>${out.foot ? `<div class="i-foot">${out.foot}<span class="muted">Applies live</span></div>` : ''}`;
}
function idleHtml() {
  const p = slotPal(S.editing), L = S.look;
  return `<div class="idle-body"><h3>${S.editing === 'light' ? 'Light' : 'Dark'} theme · ${esc(S.from[S.editing])}</h3><div class="strip">${ROLES.map(r => `<i style="background:${p[r]}" title="${ROLE_NAME[r]}"></i>`).join('')}</div>
    Click anything on the page to edit it: the background, a card, the text, a link, the to-do list. Its controls open here, beside it.
    <ul><li>Shape: corner ${L.shape.corner} px, border ${L.shape.border} px</li><li>Type: ${esc(L.type.family)}, ${Math.round(L.type.scale * 100)}%, ${L.density}</li><li>Cards: ${L.cards.width} px, gap ${L.cards.gap}, ${({ flat: 'solid', gradient: 'gradient', image: 'image' } as Record<string, string>)[L.cards.style]}</li><li>To do: ${VIEW_LABEL[L.views.todo]}, panel ${L.layout.panel}</li></ul></div>`;
}
function syncInspector() {
  $$<HTMLInputElement>('#insp [data-k]').forEach(el => {
    if (el === document.activeElement) return;
    const v = getK(el.dataset.k!);
    const c = el.dataset.ctl;
    if (c === 'range' || c === 'num' || c === 'int') {
      const step = Number(el.closest('.i-row')?.querySelector<HTMLInputElement>('input[type=range]')?.step ?? 1);
      el.value = c === 'num' && step < 1 ? Number(v).toFixed(2) : String(v);
      if (c === 'range') el.setAttribute('aria-valuetext', String(v));
    }
  });
  $$('#insp .reset[data-k]').forEach(b => b.classList.toggle('on', changed(b.dataset.k!)));
}

// ── Theme bar, rail, stage bar, tabs line ──
const themeScheme = (t: Rice): Scheme => ('dark' in t.palette ? 'dark' : 'light');
function chipHtml(t: Rice) {
  const sc = themeScheme(t), keys = Object.keys(t.palette) as Scheme[], on = keys.length && keys.every(s => S.from[s] === t.name);
  const where = keys.map(s => (s === 'light' ? 'Light' : 'Dark')).join(' and ') || 'your';
  return `<button class="chip ${UI.preview && UI.preview.name === t.name ? 'preview' : ''}" data-act="theme" data-v="${esc(t.id)}" aria-pressed="${!!on}" title="Apply ${esc(t.name)} to the ${where} theme"><span class="mini">${miniHtml(t.palette[sc], sc, t.colors?.length && t.colors.length >= 4 ? t.colors : ccList())}</span><span class="nm">${esc(t.name)}${on ? '<span class="in" aria-label="in use">●</span>' : ''}</span></button>`;
}
function renderTop() {
  const light = BUNDLED.filter(t => themeScheme(t) === 'light'), dark = BUNDLED.filter(t => themeScheme(t) === 'dark');
  const g = (lbl: string, list: Rice[]) => (list.length ? `<div class="g-group" role="group" aria-label="${lbl} themes"><span class="lbl">${lbl}</span><div class="g-chips">${list.map(chipHtml).join('')}</div></div>` : '');
  const slot = (sc: Scheme) => `<button class="slot" data-act="slot" data-v="${sc}" aria-pressed="${S.editing === sc && !UI.preview}" title="Edit the ${sc === 'light' ? 'Light' : 'Dark'} theme on the stage"><span class="mini">${miniHtml(S.pal[sc], sc, ccList())}</span><span class="t"><span class="k">${sc === 'light' ? 'Light' : 'Dark'} theme</span><span class="v">${esc(S.from[sc])}</span><span class="e">${slotInUse() === sc ? 'In use now' : '&nbsp;'}</span></span></button>`;
  const ud: [string, string][] = [['never', 'Never'], ['always', 'Always'], ['system', 'Match system'], ['schedule', 'Scheduled']];
  $('#top')!.innerHTML = `<div class="tb-row1"><div class="tb-brand"><span class="tb-mark">b²c</span>Studio</div><div class="tb-status" id="tb-status">${statusHtml()}</div>
    <div class="tb-search"><span class="mag">⌕</span><input id="search" class="x-input" type="search" placeholder="Search the Studio" aria-label="Search everything in the Studio" autocomplete="off" value="${esc(UI.query)}" role="combobox" aria-expanded="${!!UI.query}" aria-controls="results"><kbd>/</kbd>${UI.query ? resultsHtml() : ''}</div>
    <button class="x-btn quiet x-ibtn" data-act="undo" title="Undo (⌘Z)" aria-label="Undo the last change" ${H.past.length ? '' : 'disabled'}>↶</button><button class="x-btn quiet x-ibtn" data-act="redo" title="Redo (⇧⌘Z)" aria-label="Redo the last change" ${H.future.length ? '' : 'disabled'}>↷</button>
    <button class="x-btn" data-act="import">Import…</button><button class="x-btn" data-act="sharemenu" aria-haspopup="menu" aria-expanded="${UI.menu === 'share'}">Share ▾</button></div>
    <div class="tb-row2"><div class="gallery" aria-label="Themes">${g('Light', light)}${g('Dark', dark)}${g('My themes', S.saved)}</div>
    <div class="slots">${slot('light')}${slot('dark')}<div class="usedark"><span class="k" id="ud-l">Use dark theme</span><div class="x-seg" role="radiogroup" aria-labelledby="ud-l">${ud.map(([v, l]) => `<button role="radio" aria-checked="${S.useDark === v}" data-act="set" data-k="useDark" data-v='"${v}"'>${l}</button>`).join('')}</div>
    ${S.useDark === 'schedule' ? `<span class="sched">From <input class="x-input" type="time" data-k="sched.from" data-ctl="time" value="${S.sched.from}" aria-label="Dark from"> to <input class="x-input" type="time" data-k="sched.to" data-ctl="time" value="${S.sched.to}" aria-label="Dark until"></span>` : `<span class="sched">${S.useDark === 'system' ? `This computer is in ${sysDark() ? 'dark' : 'light'} appearance now` : S.useDark === 'always' ? 'Canvas always uses the Dark theme' : 'Canvas always uses the Light theme'}</span>`}</div></div></div>`;
}
function statusHtml() {
  if (UI.saving) return `<form class="tb-save" data-form="save"><label for="savename" class="slotname">Save as new theme</label><input id="savename" class="x-input" value="${esc(currentName())}" aria-label="Theme name"><button class="x-btn primary" type="submit">Save</button><button class="x-btn quiet" type="button" data-act="savecancel">Cancel</button></form>`;
  let hh = `<span class="slotname">${S.editing === 'light' ? 'Light' : 'Dark'} theme on stage</span><span class="muted">·</span>`;
  if (isEdited()) hh += `<span class="dot"></span><span class="edited">${S.base.name === 'b²c defaults' ? 'Edited' : 'Edited from ' + esc(S.base.name)}</span><span class="muted">·</span><button class="x-link" data-act="saveas">Save as new theme…</button><button class="x-link" data-act="revert" style="color:var(--b2c-ui-text-secondary)">Revert</button>`;
  else hh += `<span class="edited">${esc(S.base.name)}</span>`;
  if (UI.revert) hh += `<span class="muted">·</span><span class="edited">Imported “${esc(UI.revert.name)}”</span><button class="x-link" data-act="revertimport">Revert import</button>`;
  return hh;
}
function renderTopStatus() { const el = $('#tb-status'); if (el && !UI.saving) el.innerHTML = statusHtml(); }
const RI: Record<string, string> = {
  palette: '<svg viewBox="0 0 14 14"><rect x="1" y="1" width="5" height="5" fill="currentColor"/><rect x="8" y="1" width="5" height="5" fill="currentColor" opacity=".6"/><rect x="1" y="8" width="5" height="5" fill="currentColor" opacity=".35"/><rect x="8" y="8" width="5" height="5" fill="none" stroke="currentColor"/></svg>',
  shape: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1.5 12.5V6a4.5 4.5 0 0 1 4.5-4.5h6.5"/></svg>',
  type: '<svg viewBox="0 0 14 14" fill="currentColor"><path d="M2 2h10v2.5h-1.2V3.3H7.7v8.4h1.6V13H4.7v-1.3h1.6V3.3H3.2v1.2H2z"/></svg>',
  layout: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="1.5" width="8" height="11"/><path d="M11 1.5h2v11h-2M1 6h8"/></svg>',
  views: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M1.5 3h11M1.5 7h11M1.5 11h7"/></svg>',
  feat: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 4h10M2 10h10"/><rect x="3.5" y="2.5" width="3" height="3" fill="var(--b2c-ui-panel)"/><rect x="7.5" y="8.5" width="3" height="3" fill="var(--b2c-ui-panel)"/></svg>',
};
const LOOK: [string, string, Sel][] = [['palette', 'Palette', { part: 'page' }], ['shape', 'Shape', { part: 'card', cid: 'bio', focus: 'l.shape.corner' }], ['type', 'Type', { part: 'text' }], ['layout', 'Layout', { part: 'grid', focus: 'l.cards.width' }], ['views', 'Views', { part: 'todo' }]];
const FEAT_SECS: [string, string][] = [...SECTIONS.map(s => [s.id, s.title] as [string, string]), ['popup', 'Toolbar popup']];
function railCurrent(id: string) {
  if (UI.mode !== 'look' || !UI.sel) return false;
  const p = UI.sel.part;
  return id === 'palette' ? p === 'page' || p === 'nav' || p === 'link' || p === 'accent' || !!UI.role
    : id === 'type' ? (p === 'text' || p === 'content') && !UI.role
    : id === 'layout' ? (p === 'grid' || p === 'panel' || p === 'card') && !UI.role
    : id === 'views' ? p === 'todo' && !UI.role : false;
}
function renderRail() {
  $('#rail')!.innerHTML = `<div class="r-h">Look</div>${LOOK.map(([id, l]) => `<button class="r-it" data-act="look" data-v="${id}" aria-current="${railCurrent(id)}"><span class="ic">${RI[id]}</span>${l}</button>`).join('')}
    <div class="r-h">Features</div>${FEAT_SECS.map(([id, l]) => `<button class="r-it" data-act="feat" data-v="${id}" aria-current="${UI.mode === 'features' && UI.featSec === id}"><span class="ic">${RI.feat}</span>${l}</button>`).join('')}
    <div class="r-foot">Every change applies at once, in the stage and your open Canvas tabs. <kbd>⌘Z</kbd> undoes.</div>`;
}
function renderStagebar() {
  const sc = stageScheme(), p = UI.preview ? resolvePal(UI.preview.rice.pal[sc], sc) : slotPal(sc);
  const tabs: [string, string][] = [['dashboard', 'Dashboard'], ['course', 'Course page'], ['grades', 'Grades']];
  const offer = UI.offer ? `<span class="showing" style="border:1px solid var(--line);padding:2px 4px 2px 8px">${esc(UI.offer.name)} has course colours <span class="cpal">${UI.offer.colors.slice(0, COURSES.length).map(c => `<i style="background:${c}"></i>`).join('')}</span><button class="x-btn primary" style="height:22px" data-act="offeryes">Apply to my courses</button><button class="x-btn quiet" style="height:22px" data-act="offerno">Not now</button></span>` : '';
  $('#stagebar')!.innerHTML = `<div class="x-seg" role="tablist" aria-label="Page on the stage">${tabs.map(([v, l]) => `<button role="tab" aria-selected="${UI.stageTab === v}" aria-checked="${UI.stageTab === v}" data-act="tab" data-v="${v}">${l}</button>`).join('')}</div>
    <span class="showing ${UI.offer && UI.mode === 'features' ? 'sr-only' : ''}"><span class="sw-dot" style="background:${p.bg}"></span><span class="sw-dot" style="background:${p.surface}"></span><span class="sw-dot" style="background:${p.text}"></span>${UI.preview ? 'Previewing “' + esc(UI.preview.name) + '”' : (sc === 'light' ? 'Light' : 'Dark') + ' theme · ' + esc(S.from[sc])}</span>${offer}
    ${offer ? '' : `<span class="hint">${UI.mode === 'features' ? 'Hover a setting to see what it changes' : 'Click anything on the page to edit it · Esc deselects'}</span>`}`;
}
function renderTabsline() {
  const el = $('#tabsline')!, use = slotInUse(), lbl = ({ never: 'Never', always: 'Always', system: 'Match system', schedule: 'Scheduled' } as Record<string, string>)[S.useDark];
  const n = UI.tabs, tabs = `${n} open Canvas tab${n === 1 ? '' : 's'}`;
  el.classList.toggle('preview', !!UI.preview);
  el.innerHTML = UI.preview
    ? `<span class="live"></span>Previewing “${esc(UI.preview.name)}” here and in your ${tabs}. Nothing changes until you Apply.`
    : `<span class="live"></span>Live in ${tabs}. They show the <b>${use === 'light' ? 'Light' : 'Dark'} theme</b> now (Use dark theme: ${lbl}).${S.editing !== use ? ` You’re editing the ${S.editing === 'light' ? 'Light' : 'Dark'} theme; it shows there when ${S.editing === 'dark' ? 'dark is in use' : 'dark isn’t in use'}.` : ''}${UI.nativeDark ? ` <span class="native-dark">Canvas’s own dark mode is on for the new dashboard. Turn it off there to use a light theme on it.</span>` : ''}`;
}
/** How many open tabs b²c runs in (they answer b2c:ping). */
async function countTabs() {
  const tabs = await chrome.tabs.query({}).catch(() => [] as chrome.tabs.Tab[]);
  const live = await Promise.all(tabs.map(t => (t.id === undefined ? null : chrome.tabs.sendMessage(t.id, { type: 'b2c:ping' }).catch(() => null))));
  UI.tabs = live.filter(Boolean).length;
  // Canvas's own widget-dashboard dark mode holds a b²c light theme off there (palette run.ts).
  const replies = await Promise.all(tabs.map((t, i) => (t.id === undefined || !live[i] ? null : chrome.tabs.sendMessage(t.id, { type: 'b2c:dark:original', op: 'query' }).catch(() => null))));
  UI.nativeDark = replies.some(r => (r as { nativeDark?: boolean } | null)?.nativeDark === true);
  renderTabsline();
}

// ── Features mode (Preact panel) ──
function pvCard() {
  const c = course('bio'), f = S.f, col = S.cc.bio;
  const items = [{ t: 'Field notes 4', d: due(10, 19), pts: 50 }, { t: 'Pre-lab quiz 3', d: due(10, 21, 9, 0), pts: 5 }, { t: 'Lab 3 report', d: due(10, 22, 17, 0), pts: 100 }, { t: 'Reading quiz 6', d: due(10, 26, 9, 0), pts: 10 }].slice(0, Number(f.nShown));
  const ck = { dates: String(f.dates), clock: String(f.clock) };
  return `<div class="pv-box"><span class="lbl">Preview</span><div class="pv-card"><div class="h" style="background:${col}">${f.cardGrades ? `<span class="chipx" style="${f.gradeHover ? 'opacity:.35' : ''}">${c.pct}% A−</span>` : ''}</div>${f.cardAssign ? items.map(it => `<div class="rw"><span>${esc(it.t)}</span>${f.gradeImpact ? `<span class="gi">−${(it.pts / 30).toFixed(1)}/+${(it.pts / 90).toFixed(1)}</span>` : ''}<span>${fmtDue(it.d, ck)}</span></div>`).join('') : '<div class="rw"><span style="color:#6b7780">No due list</span></div>'}</div></div>`;
}
const pvDates = () => { const ck = { dates: String(S.f.dates), clock: String(S.f.clock) }; return `<div class="pv-box"><span class="lbl">Preview</span><span>Source analysis 2 · <b>${fmtDue(due(10, 20), ck)}</b></span><span>Lab 3 report · <b>${fmtDue(due(10, 22, 17, 0), ck)}</b></span><span>Midterm 1 · <b>${fmtDue(due(10, 29, 10, 0), ck)}</b></span></div>`; };
const PREVIEWS: Record<string, () => string> = {
  'card-assignments': pvCard,
  dates: pvDates,
  'gpa-rounding': () => { const g = gpa(S.f); return `<div class="pv-box"><span class="lbl">Preview</span>${g.raw.toFixed(4)} → <b>${g.shown}</b> <span class="muted">${S.f.rounding === 'auto' ? 'Automatic: your school’s rule where b²c knows it, else rounds' : ''}</span></div>`; },
  quiz: () => `<div class="pv-box"><span class="lbl">On a quiz</span>${S.f.quiz === 'untouched' ? 'Canvas exactly as Canvas made it: no theme, no b²c features.' : 'Theme colours apply; nothing else runs.'}</div>`,
  'dark-images': () => `<div class="pv-box"><span class="lbl">Preview</span><img src="${SAMPLE_IMG.bio}" alt="" style="width:90px;height:40px;object-fit:cover;${S.f.dimImages ? 'filter:brightness(.85)' : ''}"></div>`,
  'hide-logo': () => `<div class="pv-box"><span class="lbl">Preview</span><span class="pv-nav" style="color:#fff">${S.f.hideLogo ? '' : `<span style="width:26px;height:26px;display:block">${I.logo}</span>`}</span></div>`,
  'tab-icons': () => `<div class="pv-box"><span class="lbl">Preview</span><span class="pv-fav"><i style="background:${S.f.tabIcons ? S.cc.hist : '#394b58'}"></i>Source analysis 2</span><span class="pv-fav"><i style="background:${S.f.tabIcons ? S.cc.bio : '#394b58'}"></i>Field notes 4</span></div>`,
};
function popupMock() {
  const use = slotInUse(), ud: [string, string][] = [['never', 'Never'], ['always', 'Always'], ['system', 'Match system'], ['schedule', 'Scheduled']];
  const slot = (sc: Scheme) => `<button class="pslot ${use === sc ? 'now' : ''}" data-act="slot" data-v="${sc}"><span class="mini">${miniHtml(S.pal[sc], sc, ccList())}</span><span class="t"><span>${sc === 'light' ? 'Light' : 'Dark'}${use === sc ? ' · in use' : ''}</span><span>${esc(S.from[sc])}</span></span></button>`;
  return `<div style="padding:12px"><div class="i-note" style="margin-bottom:8px">The toolbar popup stays the remote control for the page you're on. It's live here: try Use dark theme.</div>
  <div class="popmock" role="group" aria-label="Toolbar popup mock"><div class="ph"><span class="tb-mark">b²c</span>b²c<span class="host">Dashboard</span></div>
  <div><div class="k">Use dark theme</div><div class="x-seg" role="radiogroup" aria-label="Use dark theme" style="width:100%">${ud.map(([v, l]) => `<button role="radio" aria-checked="${S.useDark === v}" data-act="set" data-k="useDark" data-v='"${v}"'>${l}</button>`).join('')}</div></div>
  <div class="slotrow">${slot('light')}${slot('dark')}</div>
  <div style="font-size:12px;color:var(--b2c-ui-text-secondary)">On this page</div>
  ${([['f.cardAssign', 'Assignments on cards'], ['f.cardGrades', 'Grades on cards'], ['f.todo', 'Improved to-do list'], ['f.gpa', 'GPA calculator']] as const).map(([k, l]) => `<div class="prow" style="border:0;padding:0;min-height:26px"><span>${l}</span><button class="x-switch" role="switch" aria-checked="${!!getK(k)}" aria-label="${l}" data-act="toggle" data-k="${k}"></button></div>`).join('')}</div></div>`;
}
const featureHooks = {
  go: (t: string) => { goDeep(t); },
  share: () => { UI.menu = 'share'; renderSheet(); },
  importTheme: () => openImport(),
  preview: (id: string) => PREVIEWS[id]?.() ?? null,
};
function renderFeatures() {
  const el = $('#features')!;
  el.hidden = UI.mode !== 'features';
  render(h(FeaturesPanel, { hooks: featureHooks, extra: { popup: popupMock }, flash: UI.flashRow }), el);
}
function openFeatures(secId: string | null, rowId?: string) {
  UI.mode = 'features'; UI.featSec = secId; UI.hover = null; renderAll();
  const el = $('#features')!;
  requestAnimationFrame(() => {
    const target = rowId ? $(`#features [data-row="${rowId}"]`) : secId ? $('#fs-' + secId) : null;
    if (target) { el.style.scrollBehavior = 'auto'; el.scrollTop = target.offsetTop - 10; el.style.scrollBehavior = ''; }
    if (rowId && target) {
      UI.flashRow = rowId; renderFeatures();
      setTimeout(() => { if (UI.flashRow === rowId) { UI.flashRow = null; renderFeatures(); } }, 1500);
      target.querySelector<HTMLElement>('button:not(.reset),input,select,textarea')?.focus({ preventScroll: true });
    }
  });
}

// ── Sheets: Share (two levels), Import; toast ──
function fileName(rice: boolean) { return currentName().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + (rice ? '.b2c-rice.json' : '.b2c-theme.json'); }
const exportFor = (rice: boolean, colors: boolean): Theme => exportRice(S, currentName(), { css: rice, colors });
function renderSheet() {
  const L = $('#sheet-layer')!; $('#menu')?.remove();
  if (UI.menu === 'share') {
    const css = S.look.css.trim(), n = css ? css.split('\n').filter(x => x.trim()).length : 0;
    const d = document.createElement('div'); d.id = 'menu'; d.className = 'menu'; d.setAttribute('role', 'menu');
    d.innerHTML = `<div class="mi"><button role="menuitem" class="mi-main" data-act="share" data-v="theme"><b>Copy theme</b><span>Colours, shape, type, layout and views. No CSS. Safe to post anywhere.</span></button><button role="menuitem" class="x-btn" data-act="savefile" data-v="theme">Save file</button></div>
      <div class="mi"><button role="menuitem" class="mi-main" data-act="share" data-v="rice"><b>Copy full rice (includes CSS)</b><span>${n ? `The theme plus your custom CSS (${n} lines). For people you know.` : 'The theme plus your custom CSS. You have none yet, so it equals the theme.'}</span></button><button role="menuitem" class="x-btn" data-act="savefile" data-v="rice">Save file</button></div>`;
    document.body.appendChild(d); d.querySelector<HTMLElement>('button')?.focus();
  }
  const sh = UI.sheet;
  if (!sh) { L.innerHTML = ''; return; }
  if (sh.kind === 'share') {
    const css = S.look.css.trim(), n = css ? css.split('\n').filter(x => x.trim()).length : 0, rice = sh.level === 'rice';
    L.innerHTML = `<div class="sheet" role="dialog" aria-modal="false" aria-labelledby="sh-h"><div class="s-h" id="sh-h">${rice ? 'Share full rice' : 'Share theme'} · ${esc(currentName())}<button class="x-btn quiet x-ibtn" data-act="sheetclose" aria-label="Close">×</button></div>
      <div class="s-b"><div class="inc"><span>Light palette${S.pal.light ? '' : ' (Canvas: omitted)'}</span><span>Dark palette</span><span>Shape</span><span>Type</span><span>Cards</span><span>Layout</span><span>Views</span><span class="${sh.colors ? '' : 'no'}">Course colours</span><span class="${rice && n ? '' : 'no'}">Custom CSS${rice && n ? ` (${n} lines)` : ''}</span></div>
      ${rice ? '<div class="flag">This includes your custom CSS. CSS can change how Canvas looks and behaves, so send a full rice only to people you know. A public gallery never accepts one.</div>' : '<div class="i-note">Never included: course names and images, notes, goals, credits, to-do marks, sites, or anything else personal.</div>'}
      <label style="display:flex;gap:6px;align-items:center;font-size:12.5px"><input type="checkbox" data-act="sharecolors" ${sh.colors ? 'checked' : ''}> Include my course colours as the theme’s course palette</label>
      <textarea id="share-str" readonly aria-label="Share string" spellcheck="false">${esc(sh.str || 'Encoding…')}</textarea>
      <div class="i-note">${sh.str ? sh.str.length + ' characters' : ''} · <code>${rice ? 'b2c-rice:' : 'b2c-theme:'}</code> + base64url(deflate-raw(JSON)). Paste it into Import, or add it to a link after <code>#</code>.</div>${sh.copied ? '<div class="okmsg" role="status">Copied to the clipboard.</div>' : ''}</div>
      <div class="s-f"><span class="l">Or as a file: ${esc(fileName(rice))}</span><button class="x-btn" data-act="savefile" data-v="${sh.level}">Save file</button><button class="x-btn primary" data-act="copy">Copy</button></div></div>`;
  } else if (sh.kind === 'import') {
    const P = sh.parsed as ImportView | null;
    let detail = '';
    if (P) {
      const t = P.rice, sc: Scheme = 'dark' in t.palette ? 'dark' : 'light';
      const slots = Object.keys(t.palette).map(s => (s === 'light' ? 'Light' : 'Dark'));
      const changes = [slots.length ? slots.join(' and ') + ' palette' : null, ...Object.keys(t.look).map(k => ({ shape: 'Shape', type: 'Type', density: 'Density', cards: 'Cards', layout: 'Layout', views: 'Views' } as Record<string, string>)[k]), t.colors ? 'Course colours' : null].filter(Boolean);
      const fails = (Object.entries(t.palette) as [Scheme, Record<Role, string> | null][]).flatMap(([s, p]) => (p ? ROLES.filter(r => failsFloor(r, resolvePal(p, s))).map(r => ROLE_SHORT[r] + (slots.length > 1 ? ` (${s})` : '')) : []));
      const lines = t.css ? t.css.split('\n').filter(x => x.trim()).length : 0;
      detail = `<div class="imp-sum"><span class="mini">${miniHtml(t.palette[sc], sc, t.colors?.length ? t.colors : ccList())}</span><div><b>${esc(t.name)}</b> <span class="muted">${P.kind === 'rice' ? 'full rice' : P.kind === 'theme' ? 'theme' : 'from ' + esc(P.kind)}</span><div class="i-note">Changes: ${changes.join(' · ') || 'nothing b²c recognises'}. Everything else stays yours.</div></div></div>
        <div class="i-note">${fails.length ? `<span style="color:var(--b2c-ui-danger)">⚠ ${fails.length} role${fails.length > 1 ? 's' : ''} under the contrast floor: ${fails.join(', ')}.</span> Allowed: b²c warns, never blocks.` : 'Contrast: every text role meets its floor.'}</div>
        ${t.css ? `<div class="flag"><div><b>Includes custom CSS (${lines} lines)</b> · <button class="x-link" data-act="viewcss">${sh.showCss ? 'Hide CSS' : 'View CSS'}</button></div>${P.removed ? `<div>Removed ${P.removed} remote reference${P.removed > 1 ? 's' : ''} (remote url() or @import). Only data: URIs and bundled fonts are kept.</div>` : '<div>Nothing needed removing.</div>'}${sh.showCss ? `<pre>${esc(t.css)}</pre>` : ''}<div class="muted">The preview ${UI.preview && UI.preview.withCss ? 'includes' : 'leaves out'} the CSS. <button class="x-link" data-act="previewcss">${UI.preview && UI.preview.withCss ? 'Preview without it' : 'Preview with it'}</button></div><div class="muted">Replaces your custom CSS when you Apply.</div></div>` : ''}
        ${t.colors ? `<label style="display:flex;gap:6px;align-items:center;font-size:12.5px"><input type="checkbox" data-act="impcolors" ${sh.useColors ? 'checked' : ''}> Also apply its course colours <span class="cpal">${t.colors.slice(0, 4).map(c => `<i style="background:${c}"></i>`).join('')}</span> (written to Canvas)</label>` : ''}
        ${P.notes.length ? `<div class="i-note">${P.notes.map(esc).join(' ')}</div>` : ''}
        <div class="okmsg">Previewing on the stage and in your open Canvas tabs.</div>`;
    }
    L.innerHTML = `<div class="sheet" role="dialog" aria-modal="false" aria-labelledby="im-h"><div class="s-h" id="im-h">Import a theme<button class="x-btn quiet x-ibtn" data-act="importcancel" aria-label="Close">×</button></div>
      <div class="s-b"><textarea id="imp-text" aria-label="Theme string or file contents" placeholder="Paste a b2c-theme: or b2c-rice: string, or a theme file (b²c, Better Canvas, base16, Catppuccin, pywal)" spellcheck="false">${esc(sh.text || '')}</textarea>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><label class="x-btn" style="cursor:pointer">Choose file…<input type="file" id="imp-file" accept=".json,.yaml,.yml,application/json" hidden></label></div>
      ${sh.err ? `<div class="err" role="alert">${esc(sh.err)}</div>` : ''}${detail}</div>
      <div class="s-f"><button class="x-btn" data-act="importcancel">Cancel</button>${P && P.rice.css ? '<button class="x-btn" data-act="importapply" data-v="nocss">Apply without CSS</button>' : ''}<button class="x-btn primary" data-act="importapply" data-v="all" ${P ? '' : 'disabled'}>Apply</button></div></div>`;
  }
}
async function openShare(level: 'theme' | 'rice') {
  UI.menu = null; UI.sheet = { kind: 'share', level, str: '', colors: UI.sheet?.kind === 'share' ? UI.sheet.colors : true, copied: false };
  renderSheet(); await refreshShare(); await copyShare();
}
async function refreshShare() { const sh = UI.sheet; sh.str = await encodeShare(exportFor(sh.level === 'rice', sh.colors), sh.level); renderSheet(); }
async function copyShare() {
  const sh = UI.sheet; if (!sh?.str) return;
  try { await navigator.clipboard.writeText(sh.str); } catch { const t = $<HTMLTextAreaElement>('#share-str'); t?.focus(); t?.select(); }
  sh.copied = true; renderSheet(); say('Copied');
}
function saveFile(level: string) {
  const obj = exportFor(level === 'rice', true), a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2) + '\n'], { type: 'application/json' })); a.download = fileName(level === 'rice');
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  UI.menu = null; renderSheet(); toast('Saved ' + a.download, false);
}

interface ImportView { rice: Rice; kind: string; removed: number; notes: string[] }
/** Paint (or stop painting) a preview in every open Canvas tab, without saving it. */
async function previewTabs(v: Record<string, unknown> | null) {
  const tabs = await chrome.tabs.query({}).catch(() => [] as chrome.tabs.Tab[]);
  await Promise.all(tabs.map(t => (t.id === undefined ? null : chrome.tabs.sendMessage(t.id, { type: 'b2c:themes:preview', values: v }).catch(() => null))));
}
function endPreview() { if (UI.preview) { UI.preview = null; void previewTabs(null); } }
let impTimer: ReturnType<typeof setTimeout> | undefined, impSeq = 0;
async function parseImport(text: string) {
  const sh = UI.sheet; const seq = ++impSeq;
  sh.text = text; sh.err = null; sh.parsed = null; endPreview();
  if (text.trim()) {
    const r = await importText(text);
    if (seq !== impSeq) return;
    if (!r.theme) sh.err = r.errors[0] ?? 'That couldn’t be read.';
    else {
      const rice = toRice(r.theme);
      const notes = [...r.notes, ...r.errors];
      if (r.unknown.length) notes.push(`Kept ${r.unknown.length} field${r.unknown.length > 1 ? 's' : ''} b²c doesn’t use yet: ${r.unknown.join(', ')}.`);
      const P: ImportView = { rice, kind: r.kind, removed: r.cssRemoved.length, notes };
      sh.parsed = P; sh.useColors ??= !!rice.colors;
      const tmp: State = clone(S);
      applyRice(tmp, rice, { css: true });
      if (rice.colors && sh.useColors) COURSES.forEach((c, i) => (tmp.cc[c.id] = rice.colors![i % rice.colors!.length]!));
      const sc: Scheme = Object.keys(rice.palette).length ? ('dark' in rice.palette ? 'dark' : 'light') : S.editing;
      const vals = toPatch(tmp, values.value);
      UI.preview = { name: rice.name, scheme: sc, rice: { pal: tmp.pal, look: tmp.look, cc: tmp.cc }, withCss: true, values: vals };
      void previewTabs({ ...values.value, ...vals });
    }
  }
  renderAll();
  const ta = $<HTMLTextAreaElement>('#imp-text'); if (ta && document.activeElement !== ta && sh.fromTyping) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}
function applyImport(withCss: boolean) {
  const P = UI.sheet.parsed as ImportView, t = P.rice, useColors = UI.sheet.useColors;
  const before = JSON.stringify(S);
  endPreview();
  commit(`Import ${t.name}`, () => {
    applyRice(S, t, { css: withCss });
    if (!withCss && t.css) S.base.snap = riceSnap(S);
    if (t.colors && useColors) COURSES.forEach((c, i) => (S.cc[c.id] = t.colors![i % t.colors!.length]!));
    if (!S.saved.some(x => x.name === t.name)) S.saved.push({ ...clone(t), id: 'my-' + Date.now().toString(36), css: withCss ? t.css : null });
  });
  if (t.colors && useColors) applyCourseColors(t.colors, t.name);
  UI.revert = { name: t.name, snap: before }; UI.sheet = null; UI.offer = null;
  renderAll(); toast(`Imported ${t.name}${t.css && !withCss ? ' without its CSS' : ''}`, true, 'Revert');
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(text: string, withUndo: boolean, undoLabel = 'Undo') {
  const t = $('#toast')!; clearTimeout(toastTimer);
  t.innerHTML = `<span>${esc(text)}</span>${withUndo ? `<button data-act="${undoLabel === 'Revert' ? 'revertimport' : 'undo'}">${undoLabel}</button>` : ''}`;
  toastTimer = setTimeout(() => (t.innerHTML = ''), withUndo ? 10000 : 2600);
}
function say(t: string) { const l = $('#live')!; l.textContent = ''; setTimeout(() => (l.textContent = t), 30); }

// ── Selection, deep links, search ──
function chainFor(sel: Sel): Sel[] {
  const el = elFor(sel); if (!el) return [sel];
  const out: Sel[] = []; let n: HTMLElement | null = el;
  while (n && n.id !== 'frame') { if (n.dataset?.part) out.unshift(partOf(n)); n = n.parentElement; }
  return out;
}
function select(sel: Sel, o: { role?: Role; flash?: boolean; focus?: string } = {}) {
  if (sel.tab) UI.stageTab = sel.tab;
  UI.mode = 'look'; UI.hover = null; UI.hoverPart = null;
  UI.sel = { part: sel.part }; if (sel.cid) UI.sel.cid = sel.cid; if (sel.idx) UI.sel.idx = sel.idx;
  UI.role = sel.part === 'link' ? 'link' : sel.part === 'accent' ? 'accent' : o.role ?? null;
  renderAll();
  const el = elFor(UI.sel), vp = $('#vp')!;
  if (el) { const r = relRect(el); if (r.y < vp.scrollTop || r.y + 40 > vp.scrollTop + vp.clientHeight) { vp.scrollTop = Math.max(0, r.y - 40); renderOverlay(); } }
  if (o.flash) $('.o-sel')?.animate?.([{ outlineWidth: '6px' }, { outlineWidth: '2px' }], { duration: reduced() ? 0 : 700 });
  if (o.focus) { const c = $(`#insp [data-k="${o.focus}"]:not(.reset)`); if (c) { c.focus(); if (!reduced()) c.closest('.i-row')?.animate?.([{ background: 'color-mix(in srgb, var(--b2c-ui-accent) 18%, transparent)' }, { background: 'transparent' }], { duration: 1500 }); } }
  else { const hh = $('#insp')!; hh.tabIndex = -1; hh.focus({ preventScroll: true }); }
}
/** Deep links (studio.md): parts on the stage, feature ids that have a part, feature rows, or a share code. */
const DEEP: Record<string, Sel> = {
  todo: { part: 'todo' }, notes: { part: 'notes' }, gpa: { part: 'gpa' }, dashboard: { part: 'card', cid: 'bio' }, cards: { part: 'card', cid: 'bio' }, card: { part: 'card', cid: 'bio' },
  nav: { part: 'nav' }, palette: { part: 'page' }, page: { part: 'page' }, type: { part: 'text', focus: 'l.type.family' }, text: { part: 'text' }, shape: { part: 'card', cid: 'bio', focus: 'l.shape.corner' },
  layout: { part: 'grid', focus: 'l.cards.width' }, views: { part: 'todo' }, panel: { part: 'panel' }, goal: { tab: 'grades', part: 'goal' }, grades: { tab: 'grades', part: 'table' },
  course: { tab: 'course', part: 'content' }, links: { tab: 'course', part: 'link' }, accent: { tab: 'course', part: 'accent' },
  'better-todo': { part: 'todo' }, 'gpa-calculator': { part: 'gpa' }, 'grade-goals': { tab: 'grades', part: 'goal' }, 'dashboard-notes': { part: 'notes' },
  'card-customization': { part: 'card', cid: 'bio', focus: 'l.cards.width' },
  shape_corner: { part: 'card', cid: 'bio', focus: 'l.shape.corner' }, 'full-width': { part: 'page', focus: 'l.layout.width' },
  'gradient-cards': { part: 'card', cid: 'bio', focus: 'l.cards.style' }, 'condensed-cards': { part: 'card', cid: 'bio', focus: 'l.cards.height' },
};
function goDeep(key: string): boolean {
  key = decodeURIComponent(key || '').replace(/^#/, '');
  if (!key) return false;
  if (/^b2c-(theme|rice):/.test(key)) { openImport(key); return true; }
  // Theme rows (⌘K "Settings: Use dark theme" etc.) land on the theme bar.
  if (key === 'dark-mode' || key === 'dark-schedule') { UI.mode = 'look'; renderAll(); $<HTMLElement>('[data-k="useDark"][aria-checked="true"]')?.focus(); return true; }
  if (key === 'light-theme' || key === 'dark-style') { UI.mode = 'look'; setSlot(key === 'light-theme' ? 'light' : 'dark'); $<HTMLElement>(`.slot[data-v="${key === 'light-theme' ? 'light' : 'dark'}"]`)?.focus(); return true; }
  if (key === 'start-here') { openFeatures(null); requestAnimationFrame(() => { const s = $('#start-here'); s?.scrollIntoView({ block: 'start' }); s?.focus({ preventScroll: true }); }); return true; }
  const d = DEEP[key];
  if (d) { UI.stageTab = d.tab ?? 'dashboard'; select(d, { flash: true, focus: d.focus }); return true; }
  const exact = ALL_ROWS.find(r => r.id === key && present(r));
  if (exact) { openFeatures(SECTIONS.find(x => x.rows.includes(exact))!.id, exact.id); return true; }
  if (FEAT_SECS.some(([s]) => s === key)) { openFeatures(key); return true; }
  const r = deepLinkRow(key, ALL_ROWS.filter(present));
  if (r) { const s = SECTIONS.find(x => x.rows.includes(r))!; openFeatures(s.id, r.id); return true; }
  return false;
}
interface SearchHit { label: string; where: string; kw: string; go: () => void; score?: number }
function lookIndex(): SearchHit[] {
  const card = (label: string, k: string, kw: string): SearchHit => ({ label, where: 'Look › Course card', kw, go: () => select({ part: 'card', cid: 'bio' }, { focus: k }) });
  const L: SearchHit[] = [
    card('Card width', 'l.cards.width', 'size layout wide narrow'), card('Gap between cards', 'l.cards.gap', 'spacing layout'),
    { label: 'Corner radius', where: 'Look › Shape', kw: 'round square shape corners', go: () => select({ part: 'card', cid: 'bio' }, { focus: 'l.shape.corner' }) },
    { label: 'Border weight', where: 'Look › Shape', kw: 'outline lines', go: () => select({ part: 'card', cid: 'bio' }, { focus: 'l.shape.border' }) },
    card('Card face: solid, gradient or image', 'l.cards.style', 'gradient image photo overlay style'), card('Card height', 'l.cards.height', 'condensed compact short'),
    card('Due list on cards: rows, next only, count', 'l.views.cards', 'views assignments'),
    { label: 'Font', where: 'Look › Type', kw: 'typeface family inter mono serif lato atkinson', go: () => select({ part: 'text' }, { focus: 'l.type.family' }) },
    { label: 'Text size', where: 'Look › Type', kw: 'scale bigger smaller zoom', go: () => select({ part: 'text' }, { focus: 'l.type.scale' }) },
    { label: 'Density', where: 'Look › Type', kw: 'compact roomy spacing', go: () => select({ part: 'text' }, { focus: 'l.density' }) },
    { label: 'Page width', where: 'Look › Layout', kw: 'full width wide', go: () => select({ part: 'page' }, { focus: 'l.layout.width' }) },
    { label: 'To-do view: list, progress ring, week, by course', where: 'Look › Views', kw: 'ring wheel week course', go: () => select({ part: 'todo' }, { focus: 'l.views.todo' }) },
    { label: 'Side panel: right, left or hidden', where: 'Look › Layout', kw: 'sidebar left right hidden', go: () => select({ part: 'panel' }, { focus: 'l.layout.panel' }) },
    { label: 'Section order', where: 'Look › Layout', kw: 'reorder move notes gpa', go: () => select({ part: 'panel' }) },
    ...ROLES.map(r => ({ label: ROLE_NAME[r], where: 'Look › Palette', kw: 'colour color ' + r, go: () => select({ part: 'page' }, { role: r }) })),
    { label: 'Light theme', where: 'Theme bar', kw: 'day slot', go: () => setSlot('light') },
    { label: 'Dark theme', where: 'Theme bar', kw: 'night dark mode slot', go: () => setSlot('dark') },
    { label: 'Use dark theme: Never, Always, Match system, Scheduled', where: 'Theme bar', kw: 'dark mode schedule night system auto', go: () => $<HTMLElement>('[data-k="useDark"][aria-checked="true"]')?.focus() },
    { label: 'Share theme or full rice', where: 'Theme bar', kw: 'export copy string file rice css', go: () => { UI.menu = 'share'; renderSheet(); } },
    { label: 'Import a theme', where: 'Theme bar', kw: 'paste load file rice base16 catppuccin pywal better canvas', go: () => openImport() },
    { label: 'Save as new theme', where: 'Theme bar', kw: 'remix name save', go: () => { UI.saving = true; renderTop(); $<HTMLInputElement>('#savename')?.select(); } },
  ];
  const F: SearchHit[] = [];
  for (const s of SECTIONS) for (const r of s.rows.filter(present)) F.push({ label: r.label, where: 'Features › ' + s.title, kw: `${r.desc ?? ''} ${Object.values(r.descBy ?? {}).join(' ')} ${r.keywords ?? ''} ${r.key ?? ''}`, go: () => openFeatures(s.id, r.id) });
  F.push({ label: 'Toolbar popup', where: 'Features', kw: 'popup remote toolbar button', go: () => openFeatures('popup') });
  return L.concat(F);
}
function searchRun(q: string): SearchHit[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: SearchHit[] = [];
  for (const e of lookIndex()) {
    const hay = (e.label + ' ' + e.where + ' ' + e.kw).toLowerCase();
    if (!words.every(w => hay.includes(w))) continue;
    out.push({ ...e, score: e.label.toLowerCase().startsWith(words[0]!) ? 0 : e.label.toLowerCase().includes(words[0]!) ? 1 : 2 });
  }
  return out.sort((a, b) => a.score! - b.score!).slice(0, 12);
}
function resultsHtml() {
  UI.results = searchRun(UI.query);
  const re = new RegExp('(' + UI.query.trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
  return `<div class="tb-results" id="results" role="listbox" aria-label="Results">${UI.results.map((r, i) => `<button role="option" aria-selected="${i === UI.resIdx}" data-act="result" data-v="${i}"><span>${esc(r.label).replace(re, '<mark>$1</mark>')}</span><span class="where">${esc(r.where)}</span></button>`).join('') || '<div class="none">Nothing matches. Try another word, like “corner”, “dark” or “planner”.</div>'}</div>`;
}
function updateResults() { const bx = $('.tb-search')!; $('#results')?.remove(); if (UI.query) bx.insertAdjacentHTML('beforeend', resultsHtml()); $('#search')!.setAttribute('aria-expanded', String(!!UI.query)); }
function runResult(i: number) { const r = UI.results[i]; if (!r) return; UI.query = ''; UI.resIdx = 0; $<HTMLInputElement>('#search')!.value = ''; updateResults(); r.go(); }
function setSlot(sc: Scheme) { S.editing = sc; endPreview(); saveMeta(); renderAll(); say((sc === 'light' ? 'Light' : 'Dark') + ' theme on the stage'); }
function openImport(text?: string) { UI.menu = null; UI.sheet = { kind: 'import', text: text ?? '', parsed: null }; renderAll(); if (text) void parseImport(text); setTimeout(() => $<HTMLElement>('#imp-text')?.focus(), 0); }

// ── Render ──
function fkey(el: Element | null): string | null { if (!el || el === document.body) return null; if (el.id) return '#' + el.id; const a = ['data-act', 'data-k', 'data-v', 'data-h', 'data-ctl', 'data-ord'].map(n => el.getAttribute(n) ?? '').join('|'); return a.replace(/\|/g, '') ? a : null; }
function restoreFocus(k: string | null) { if (!k) return; if (k.startsWith('#')) { document.getElementById(k.slice(1))?.focus({ preventScroll: true }); return; } $$('[data-act],[data-k],[data-h],[data-ord]').find(n => fkey(n) === k && n.offsetParent !== null)?.focus({ preventScroll: true }); }
function renderAll() {
  const inFeatures = !!document.activeElement?.closest('#features');
  const fk = inFeatures ? null : fkey(document.activeElement);
  document.body.classList.toggle('mode-features', UI.mode === 'features');
  if (UI.sel && !UI.preview) { renderStage(); if (!elFor(UI.sel)) { UI.sel = null; UI.role = null; } }
  renderTop(); renderRail(); renderStagebar(); renderStage(); renderFeatures(); layoutStage();
  UI.chain = UI.sel ? chainFor(UI.sel) : null;
  renderOverlay(); renderTabsline(); renderSheet();
  restoreFocus(fk);
}
function renderLive() {
  const fk = fkey(document.activeElement);
  renderStage(); layoutStage(); renderOverlay({ keepInspector: true }); syncInspector(); renderTopStatus();
  const hh = document.activeElement; if ((!hh || hh === document.body) && fk) restoreFocus(fk);
}

// ── Events ──
const LABEL = (k: string): string => ({ 'l.cards.width': 'Card width', 'l.cards.gap': 'Gap', 'l.shape.corner': 'Corner', 'l.shape.border': 'Border', 'l.cards.style': 'Card face', 'l.cards.height': 'Card height', 'l.cards.overlay': 'Colour over images', 'l.views.cards': 'Due list view', 'l.views.todo': 'To-do view', 'l.type.family': 'Font', 'l.type.scale': 'Text size', 'l.density': 'Density', 'l.layout.width': 'Page width', 'l.layout.panel': 'Panel side', 'l.layout.sections': 'Section order', useDark: 'Use dark theme', 'l.css': 'Custom CSS' } as Record<string, string>)[k] ?? (k.startsWith('p.') ? ROLE_NAME[k.slice(2) as Role] : k.replace(/^[fl]\./, ''));
const fmtV = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
function setVal(k: string, v: unknown, opts: { key?: string; light?: boolean } = {}) { commit(`${LABEL(k)} → ${fmtV(v)}`, () => setK(k, v), opts); }

function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  const a = target.closest<HTMLElement>('[data-act]');
  if (!a && target.closest('#features')) return; // Preact rows handle themselves
  if (UI.menu && !target.closest('#menu') && !(a && a.dataset.act === 'sharemenu')) { UI.menu = null; renderSheet(); }
  if (!a) {
    const fr = target.closest('#frame');
    if (fr) { e.preventDefault(); if (UI.preview) return; const el = target.closest<HTMLElement>('[data-part]'); if (el) select(partOf(el)); }
    else if (UI.query && !target.closest('.tb-search')) { UI.query = ''; updateResults(); }
    return;
  }
  const act = a.dataset.act!, k = a.dataset.k!, v = a.dataset.v!;
  switch (act) {
    case 'set': setVal(k, JSON.parse(v)); if (k === 'useDark') say('Use dark theme: ' + a.textContent); break;
    case 'toggle': setVal(k, !getK(k)); break;
    case 'step': { const n = clamp(Number(getK(k)) + Number(v), Number(a.dataset.min), Number(a.dataset.max)); setVal(k, n, { key: k }); break; }
    case 'reset': commit(`Reset ${LABEL(k)}`, () => setK(k, clone(baseVal(k)))); say(LABEL(k) + ' reset'); break;
    case 'role': UI.role = v as Role; renderOverlay(); renderRail(); $<HTMLElement>('#insp [data-ctl=hex]')?.focus(); break;
    case 'roleback': UI.role = null; renderOverlay(); renderRail(); break;
    case 'desel': UI.sel = null; UI.role = null; renderAll(); break;
    case 'crumb': select(UI.chain![Number(v)]!); break;
    case 'theme': applyTheme(v); break;
    case 'slot': setSlot(v as Scheme); break;
    case 'tab': UI.stageTab = v; renderAll(); break;
    case 'look': { const it = LOOK.find(x => x[0] === v)!; select(it[2], { focus: it[2].focus, flash: true }); break; }
    case 'feat': openFeatures(v); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'sharemenu': UI.menu = UI.menu === 'share' ? null : 'share'; renderSheet(); renderTop(); break;
    case 'share': void openShare(v as 'theme' | 'rice'); break;
    case 'savefile': saveFile(v); break;
    case 'copy': void copyShare(); break;
    case 'sharecolors': UI.sheet.colors = (a as HTMLInputElement).checked; void refreshShare(); break;
    case 'sheetclose': UI.sheet = null; renderSheet(); break;
    case 'import': openImport(); break;
    case 'viewcss': UI.sheet.showCss = !UI.sheet.showCss; renderSheet(); break;
    case 'previewcss': if (UI.preview) { UI.preview.withCss = !UI.preview.withCss; renderStage(); renderSheet(); } break;
    case 'impcolors': UI.sheet.useColors = (a as HTMLInputElement).checked; void parseImport(UI.sheet.text); break;
    case 'importcancel': UI.sheet = null; endPreview(); renderAll(); say('Import cancelled; nothing changed'); break;
    case 'importapply': applyImport(v === 'all'); break;
    case 'revertimport': if (UI.revert) { const b = JSON.parse(UI.revert.snap) as State, n = UI.revert.name; commit(`Revert import of ${n}`, () => { Object.assign(S, b); }); UI.revert = null; renderAll(); toast(`Reverted ${n}`, true); } break;
    case 'saveas': UI.saving = true; renderTop(); { const i = $<HTMLInputElement>('#savename'); i?.focus(); i?.select(); } break;
    case 'savecancel': UI.saving = false; renderTop(); break;
    case 'revert': { const b = JSON.parse(S.base.snap); commit(`Revert to ${S.base.name}`, () => { S.pal = b.pal; S.look = b.look; }); break; }
    case 'offeryes': applyCourseColors(UI.offer!.colors, UI.offer!.name); break;
    case 'offerno': UI.offer = null; renderStagebar(); break;
    case 'ccpal': { const t = themeById(v)!; applyCourseColors(t.colors!, t.name); break; }
    case 'eyedrop': void (async () => { try { const r = await new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper().open(); setVal('p.' + v, r.sRGBHex.toLowerCase()); } catch { /* cancelled */ } })(); break;
    case 'result': runResult(Number(v)); break;
  }
}
function onSubmit(e: SubmitEvent) {
  const f = e.target as HTMLFormElement;
  if (f.dataset.form !== 'save') return;
  e.preventDefault();
  const name = ($<HTMLInputElement>('#savename')!.value || 'My theme').trim().slice(0, 60);
  commit(`Save as ${name}`, () => {
    const id = 'my-' + Date.now().toString(36);
    S.saved.push({ id, name, palette: clone({ light: S.pal.light, dark: S.pal.dark }), look: clone(S.look), colors: ccList(), css: S.look.css || null });
    S.from[S.editing] = name; S.base = { name, snap: riceSnap(S) };
  }, { toast: `Saved ${name} to My themes` });
  UI.saving = false; renderTop();
}
function onInput(e: Event) {
  const t = e.target as HTMLInputElement;
  if (t.id === 'search') { UI.query = t.value; UI.resIdx = 0; updateResults(); return; }
  if (t.id === 'imp-text') { UI.sheet.fromTyping = true; clearTimeout(impTimer); impTimer = setTimeout(() => void parseImport(t.value), 250); return; }
  if (t.dataset.ctl === 'range') {
    markInput(e.timeStamp);
    const v = Number(t.value); setVal(t.dataset.k!, v, { key: t.dataset.k, light: true });
    const n = t.parentElement!.querySelector<HTMLInputElement>('.x-num'); if (n) n.value = Number(t.step) < 1 ? v.toFixed(2) : String(v);
    t.setAttribute('aria-valuetext', String(v));
  }
}
function onChange(e: Event) {
  const t = e.target as HTMLInputElement, k = t.dataset.k, c = t.dataset.ctl;
  if (t.id === 'imp-file' && t.files?.[0]) { void t.files[0].text().then(x => { $<HTMLTextAreaElement>('#imp-text')!.value = x; void parseImport(x); }); return; }
  if (!k) return;
  if (c === 'range') { renderAll(); return; }
  if (c === 'num') { const r = t.parentElement!.querySelector<HTMLInputElement>('input[type=range]')!; setVal(k, clamp(Number(t.value) || 0, Number(r.min), Number(r.max))); return; }
  if (c === 'int') { setVal(k, clamp(Math.round(Number(t.value) || 0), Number(t.dataset.min), Number(t.dataset.max))); return; }
  if (c === 'hex') { const raw = t.value.trim().toLowerCase(); const v = raw === 'school' && SCHOOLABLE.includes(k.slice(2) as Role) ? 'school' : normHex(raw); if (!v) { say('That isn’t a colour. Use 6 hex digits, like #2e3440.'); t.setAttribute('aria-invalid', 'true'); return; } setVal(k, v); return; }
  if (c === 'time' || c === 'select') { setVal(k, t.value); return; }
}
function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement, typing = t.matches?.('input:not([type=range]):not([type=checkbox]), textarea, select') ?? false;
  if (t.closest?.('#features .settings') && e.key !== 'Escape') return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z' && !(typing && t.id !== 'search')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
  if (t.id === 'search') {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); UI.resIdx = clamp(UI.resIdx + (e.key === 'ArrowDown' ? 1 : -1), 0, Math.max(0, UI.results.length - 1)); updateResults(); return; }
    if (e.key === 'Enter') { e.preventDefault(); runResult(UI.resIdx); return; }
  }
  if (t.classList.contains('h')) {
    const HH = HANDLES[t.dataset.h!]!; let d = ({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 } as Record<string, number>)[e.key];
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); markInput(e.timeStamp); setVal(HH.k, e.key === 'Home' ? HH.min : HH.max, { key: 'h:' + t.dataset.h, light: true }); return; }
    if (d) { e.preventDefault(); markInput(e.timeStamp); if (t.dataset.h === 'gap' && t.dataset.sign === '-1' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) d = -d; setVal(HH.k, clamp(getK(HH.k) + d * (e.shiftKey ? 10 : 1), HH.min, HH.max), { key: 'h:' + t.dataset.h, light: true }); say(HH.label + ' ' + getK(HH.k)); return; }
  }
  if (t.classList.contains('grip') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault(); const id = t.dataset.v!, a = [...S.look.layout.sections], i = a.indexOf(id), j = clamp(i + (e.key === 'ArrowUp' ? -1 : 1), 0, a.length - 1);
    if (i !== j) { a.splice(i, 1); a.splice(j, 0, id); setVal('l.layout.sections', a); say(`${SECTION_NAME[id]} moved to position ${j + 1} of ${a.length}`); }
    return;
  }
  if (e.key === '/' && !typing) { e.preventDefault(); $<HTMLElement>('#search')!.focus(); return; }
  if (e.key === 'Escape') {
    if (UI.menu) { UI.menu = null; renderSheet(); $<HTMLElement>('[data-act="sharemenu"]')?.focus(); }
    else if (UI.sheet) { if (UI.sheet.kind === 'import') { UI.sheet = null; endPreview(); renderAll(); } else { UI.sheet = null; renderSheet(); } }
    else if (UI.query) { UI.query = ''; $<HTMLInputElement>('#search')!.value = ''; updateResults(); }
    else if (UI.saving) { UI.saving = false; renderTop(); }
    else if (UI.role && !['link', 'accent'].includes(UI.sel?.part ?? '')) { UI.role = null; renderOverlay(); }
    else if (UI.sel) { UI.sel = null; UI.role = null; renderAll(); }
    else if (UI.mode === 'features') { UI.mode = 'look'; renderAll(); }
  }
}
let hoverRaf = 0;
function onMove(e: MouseEvent) {
  const t = e.target as HTMLElement;
  const fr = t.closest?.('#frame');
  const ph = t.closest?.<HTMLElement>('#features [data-ph]');
  const nh = fr && !UI.preview ? (t.closest<HTMLElement>('[data-part]') ? partOf(t.closest<HTMLElement>('[data-part]')!) : null) : null;
  const nph = ph ? ph.dataset.ph! : null;
  if (JSON.stringify(nh) === JSON.stringify(UI.hover) && nph === UI.hoverPart) return;
  UI.hover = nh; UI.hoverPart = nph; cancelAnimationFrame(hoverRaf); hoverRaf = requestAnimationFrame(() => renderOverlay({ keepInspector: true }));
}
function onDown(e: PointerEvent) {
  const t = e.target as HTMLElement;
  const hd = t.closest<HTMLElement>('.h');
  if (hd) {
    e.preventDefault(); hd.focus();
    const HH = HANDLES[hd.dataset.h!]!;
    UI.drag = { h: hd.dataset.h, x: e.clientX, y: e.clientY, v0: getK(HH.k), before: JSON.stringify(S), sign: Number(hd.dataset.sign ?? 1) };
    document.body.classList.add('dragging'); return;
  }
  const g = t.closest<HTMLElement>('.grip');
  if (g) { e.preventDefault(); g.focus(); UI.ordDrag = { id: g.dataset.v, before: JSON.stringify(S), y: e.clientY }; renderOverlay(); }
}
function onPointerMove(e: PointerEvent) {
  if (UI.drag) {
    const d = UI.drag, HH = HANDLES[d.h]!, dx = (e.clientX - d.x) / SCALE, dy = (e.clientY - d.y) / SCALE;
    let v = d.h === 'width' ? d.v0 + dx : d.h === 'gap' ? d.v0 + dx * d.sign : d.v0 - (dx + dy) / 3;
    v = clamp(Math.round(v), HH.min, HH.max);
    if (v !== getK(HH.k)) {
      markInput(e.timeStamp);
      setK(HH.k, v); renderLive(); persistSoon();
      $<HTMLElement>(`.h[data-h="${d.h}"]`)?.focus({ preventScroll: true });
    }
  }
  if (UI.ordDrag) {
    const rows = $$('#insp .ord'), a = [...S.look.layout.sections], i = a.indexOf(UI.ordDrag.id);
    let j = rows.findIndex(r => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; }); if (j < 0) j = rows.length - 1;
    j = clamp(j, 0, a.length - 1);
    if (j !== i) { a.splice(i, 1); a.splice(j, 0, UI.ordDrag.id); S.look.layout.sections = a; renderStage(); layoutStage(); renderOverlay(); }
  }
}
function onUp() {
  if (UI.drag) { const d = UI.drag; UI.drag = null; document.body.classList.remove('dragging'); pushHistory(d.before, `${HANDLES[d.h]!.label} → ${getK(HANDLES[d.h]!.k)}`); renderAll(); void persist(); $<HTMLElement>(`.h[data-h="${d.h}"]`)?.focus({ preventScroll: true }); }
  if (UI.ordDrag) { const d = UI.ordDrag; UI.ordDrag = null; pushHistory(d.before, 'Section order'); renderAll(); void persist(); }
}

/** Input-to-present (Design: under 50 ms on the stage): from the input event
 *  to the next animation frame after the stage was written. e2e @perf reads
 *  the `b2c:present` measures. */
let inputAt = -1;
function markInput(at: number) {
  if (inputAt >= 0) return;
  inputAt = at;
  requestAnimationFrame(() => { performance.measure('b2c:present', { start: inputAt, end: performance.now() }); inputAt = -1; });
}

// ── Settings changed elsewhere (popup, another tab, Features rows): follow them ──
function followSettings() {
  effect(() => {
    const v = values.value;
    if (!S || writing || persistQueued || UI.drag || UI.ordDrag) return;
    if (!Object.keys(toPatch(S, v)).length) return;
    const n = fromSettings(v, metaOf(S), S.saved);
    S.pal = n.pal; S.look = n.look; S.f = n.f; S.useDark = n.useDark; S.sched = n.sched;
    if (JSON.stringify(n.pal) !== JSON.stringify(S.pal)) S.from = n.from;
    renderAll();
  });
}

const SKELETON = `<header id="top" aria-label="Themes"></header>
  <div id="body">
    <nav id="rail" aria-label="Studio sections"></nav>
    <section id="features" aria-label="Features" hidden></section>
    <main id="stagecol" aria-label="Stage">
      <div id="stagebar"></div>
      <div id="vp" tabindex="-1"><div id="frame-wrap"><div id="frame"></div></div><div id="ov"></div></div>
      <div id="tabsline"></div>
    </main>
  </div>
  <div id="sheet-layer"></div>
  <div id="toast" role="status" aria-live="polite"></div>
  <div id="live" class="sr-only" aria-live="polite"></div>
  <style id="theme-css"></style>`;

/** Mount the Studio into `root`. Settings must already be loaded (state.ts). */
export async function startStudio(root: HTMLElement) {
  document.body.classList.add('studio');
  root.innerHTML = SKELETON;
  const meta = (((await chrome.storage.local.get(META_KEY).catch(() => ({}))) as Record<string, unknown>)[META_KEY] ?? {}) as Meta;
  S = fromSettings(values.value, meta, savedFrom(values.value['themes.saved']));
  if (!meta.base) S.base = { name: 'b²c defaults', snap: riceSnap(S) };
  for (const [k, d] of Object.entries(FKEYS)) { const def = schema[d.key]?.default ?? d.def; FDEF_BASE[k] = d.from ? d.from(def) : def; }
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onUp);
  $('#vp')!.addEventListener('scroll', () => { cancelAnimationFrame(hoverRaf); hoverRaf = requestAnimationFrame(() => renderOverlay({ keepInspector: true })); });
  window.addEventListener('resize', () => { layoutStage(); renderOverlay({ keepInspector: true }); });
  window.addEventListener('hashchange', () => void goDeep(location.hash));
  window.addEventListener('focus', () => void countTabs());
  renderAll();
  followSettings();
  void countTabs();
  void document.fonts?.ready.then(() => { layoutStage(); renderOverlay({ keepInspector: true }); });
  if (location.hash) goDeep(location.hash);
}

/** Test hook (read-only use in e2e). */
(window as unknown as { __studio: unknown }).__studio = {
  get S() { return S; },
  exportTheme: (css: boolean, colors: boolean) => exportFor(css, colors),
  encode: (t: Theme, kind: 'theme' | 'rice') => encodeShare(t, kind),
  get H() { return H; },
};
void NOW; void ROLE_GROUPS;
