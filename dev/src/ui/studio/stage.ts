// The Studio's stage: a scaled sample Canvas page with b²c on it (Dashboard ·
// Course page · Grades), ported from Design's prototype.
//
// The stage is a faithful-by-construction preview of TOKENS, not a render of
// Canvas: Canvas-shaped markup painted only from custom properties (--p-<role>,
// --b2c-corner-stage, --bw, --font, --ts, --den, --card-*). Those values come from the
// same sources the open tabs use: the palette slots and presets for roles, and
// the core theme table (MAP) for every Look value. content.css isn't applied
// here: it restyles Canvas's own compiled CSS, which the extension doesn't
// ship, so it would have nothing to remap on a mock.
import { ANN, COURSES, GRADED_441, ITEMS, MO, NOW, PERSONA, SAMPLE_IMG, SCHOOL, WD, course, dayDiff, due, fmtDue, fmtTime, letter, type Clock, type Item } from './data.ts';
import { dueInfo } from '../../features/card-assignments/logic.ts';
import { ringSvg } from './ring.ts';
import type { Look, State } from './bridge.ts';
import type { Roles } from '../../features/palette/palettes.ts';

export const ROLES = ['bg', 'surface', 'surfaceRaised', 'border', 'text', 'textSecondary', 'textTertiary', 'link', 'accent', 'nav', 'navText', 'success', 'warning', 'danger'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_NAME: Record<Role, string> = { bg: 'Page background', surface: 'Surface', surfaceRaised: 'Raised surface', border: 'Border', text: 'Text', textSecondary: 'Secondary text', textTertiary: 'Tertiary text', link: 'Links', accent: 'Accent', nav: 'Navigation bar', navText: 'Navigation text', success: 'Success', warning: 'Warning', danger: 'Danger' };
export const ROLE_SHORT: Record<Role, string> = { bg: 'Page', surface: 'Surface', surfaceRaised: 'Raised', border: 'Border', text: 'Text', textSecondary: 'Secondary', textTertiary: 'Tertiary', link: 'Link', accent: 'Accent', nav: 'Nav', navText: 'Nav text', success: 'Success', warning: 'Warning', danger: 'Danger' };
export const ROLE_GROUPS: [string, Role[]][] = [['Surfaces', ['bg', 'surface', 'surfaceRaised', 'border']], ['Text', ['text', 'textSecondary', 'textTertiary', 'link']], ['Brand', ['accent', 'nav', 'navText']], ['Status', ['success', 'warning', 'danger']]];
export const SCHOOLABLE: Role[] = ['link', 'accent', 'nav'];
export const CANVAS_LIGHT: Record<Role, string> = { bg: '#ffffff', surface: '#ffffff', surfaceRaised: '#f5f5f5', border: '#c7cdd1', text: '#2d3b45', textSecondary: '#6b7780', textTertiary: '#6b7780', link: 'school', accent: 'school', nav: 'school', navText: '#ffffff', success: '#03893d', warning: '#cf4a00', danger: '#e0061f' };
const STATUS_DEFAULT = { light: { success: '#03893d', warning: '#cf4a00', danger: '#e0061f' }, dark: { success: '#6fcf97', warning: '#ffb37a', danger: '#ff8a80' } } as const;
export const FAMILIES: [string, string, string][] = [
  ['Canvas default', '"LatoStage", "Lato Extended", Lato, "Helvetica Neue", Helvetica, Arial, sans-serif', 'Lato, Canvas’s own'],
  ['System', '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif', 'This computer’s'],
  ['Inter', '"Inter", system-ui, sans-serif', 'Bundled'],
  ['Atkinson Hyperlegible', '"Atkinson Hyperlegible", Verdana, sans-serif', 'Bundled, for legibility'],
  ['Source Serif 4', '"Source Serif 4", Georgia, serif', 'Bundled'],
  ['JetBrains Mono', '"JetBrains Mono", ui-monospace, monospace', 'Bundled'],
];
export const DENSITY: Record<string, number> = { compact: 0.86, comfortable: 1, roomy: 1.16 };
const PAGE_W: Record<string, string> = { standard: '1240px', wide: '1300px', full: 'none' }; // illustrative on a 1366 px stage
export const VIEW_LABEL: Record<string, string> = { list: 'List', ring: 'Progress ring', week: 'Week', courses: 'By course' };
export const SECTION_NAME: Record<string, string> = { todo: 'To do', notes: 'Notes', gpa: 'GPA' };

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

// ── Colour: contrast (WCAG 2 + APCA), OKLCH ramps ──
const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const; };
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (h: string) => { const [r, g, b] = rgb(h).map(lin) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const wcag = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export function apca(txt: string, bg: string): number {
  const Y = (h: string) => { const [r, g, b] = rgb(h).map(c => (c / 255) ** 2.4) as [number, number, number]; const v = 0.2126729 * r + 0.7151522 * g + 0.072175 * b; return v < 0.022 ? v + (0.022 - v) ** 1.414 : v; };
  const yt = Y(txt), yb = Y(bg);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  const s = yb > yt ? (yb ** 0.56 - yt ** 0.57) * 1.14 : (yb ** 0.65 - yt ** 0.62) * 1.14;
  return Math.round(Math.abs(s) < 0.1 ? 0 : Math.abs(s - Math.sign(s) * 0.027) * 100);
}
function toOklch(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(lin) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}
function fromOklch(L: number, C: number, H: number): string {
  const A = C * Math.cos(H), B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const f = (c: number) => Math.round(Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)) * 255).toString(16).padStart(2, '0');
  return '#' + f(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) + f(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) + f(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
}
export const ramp = (hex: string) => { const [, C, H] = toOklch(hex); return [0.22, 0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.78, 0.86, 0.93].map(L => fromOklch(L, Math.min(C, 0.16), H)); };
export const onColor = (hex: string) => (wcag('#ffffff', hex) >= wcag('#14181c', hex) ? '#ffffff' : '#14181c');

/** A palette with every role as hex ("school" from the sample school's brand, '' status from the scheme). */
export function resolvePal(pal: Partial<Roles> | Record<Role, string> | null | undefined, scheme: 'light' | 'dark'): Record<Role, string> {
  const p = { ...(pal ?? CANVAS_LIGHT) } as Record<Role, string>;
  for (const k of ['success', 'warning', 'danger'] as const) if (!p[k]) p[k] = STATUS_DEFAULT[scheme][k];
  for (const k of ['link', 'accent', 'nav'] as const) if (!p[k] || p[k] === 'school') p[k] = SCHOOL[scheme][k];
  return p;
}

// ── Icons (square house style) ──
export const I = {
  account: '<svg viewBox="0 0 26 26"><rect x="1" y="1" width="24" height="24" fill="#b6bcc1" stroke="#fff" stroke-width="1.6"/><rect x="9" y="5.8" width="8" height="8" fill="#fff"/><path d="M5.5 21c1.8-3.4 4.4-5 7.5-5s5.7 1.6 7.5 5" fill="#fff"/></svg>',
  dash: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 18a10 10 0 1 1 20 0"/><path d="M13 18l5-6"/><path d="M3 18h4M19 18h4"/></svg>',
  courses: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="3" width="16" height="20"/><path d="M9 8h8M9 12h8M9 16h5"/></svg>',
  cal: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="5" width="19" height="17"/><path d="M3.5 10h19M8 3v4M18 3v4"/></svg>',
  inbox: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="6" width="19" height="15"/><path d="M3.5 15h6l1.5 2.5h4L16.5 15h6"/></svg>',
  history: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="3.5" width="19" height="19"/><path d="M13 7.5V13l3.5 2.5"/></svg>',
  help: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="3.5" width="19" height="19"/><path d="M10.2 10.4a2.9 2.9 0 1 1 3.8 2.8c-.7.3-1 .8-1 1.5v.9"/></svg>',
  logo: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.4"><path d="M24 6c-5 0-8 3-8 7s3 7 8 7 8-3 8-7-3-7-8-7z"/><path d="M24 28c-5 0-8 3-8 7s3 7 8 7 8-3 8-7-3-7-8-7z"/><path d="M6 24c0-5 3-8 7-8s7 3 7 8-3 8-7 8-7-3-7-8z"/><path d="M28 24c0-5 3-8 7-8s7 3 7 8-3 8-7 8-7-3-7-8z"/></svg>',
  ann: '<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9v4h3l7 4V5L6 9H3z"/><path d="M16 8.5a3.5 3.5 0 0 1 0 5"/></svg>',
  asg: '<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 3h9l3 3v13H5z"/><path d="M8 9h6M8 12h6M8 15h3"/></svg>',
  disc: '<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h11v8H8l-3 3v-3H3z"/><path d="M14 8h5v8h-2v3l-3-3h-4v-2"/></svg>',
  files: '<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 6V18h17V7.5H10L8.5 5.5h-6z"/></svg>',
  gear: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5.8" y="5.8" width="4.4" height="4.4"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>',
};

/** What the stage paints: the rice being edited, or an import being previewed. */
export interface StageRice { pal: State['pal']; look: Look; cc: Record<string, string> }
export interface StageCtx { R: StageRice; sc: 'light' | 'dark'; f: Record<string, unknown>; tab: string; notesText: string; force?: readonly string[] }

const clock = (f: Record<string, unknown>): Clock => ({ dates: String(f.dates ?? 'relative'), clock: String(f.clock ?? 'system') });
/** A card's due text, from card-assignments' own formatter so the stage can't drift from the cards
 *  ("Overdue 3d" in danger; everything else tonal). */
function cardDue(d: Date, f: Record<string, unknown>) {
  const c = String(f.clock ?? 'system');
  return dueInfo(d, NOW, { mode: f.dates === 'absolute' ? 'absolute' : 'relative', clock: c === '12' || c === '24' ? c : 'system', order: (['md', 'dm'].includes(String(f.dateOrder)) ? f.dateOrder : 'auto') as 'auto' | 'md' | 'dm', locale: 'en-US' });
}
const cardDueHtml = (d: Date, f: Record<string, unknown>) => { const x = cardDue(d, f); return `<span class="d${x.overdue ? ' danger' : ''}">${esc(x.text)}</span>`; };

export function stageVars(R: StageRice, sc: 'light' | 'dark', darkDefault: Partial<Roles>): string {
  const p = resolvePal(R.pal[sc] ?? (sc === 'light' ? CANVAS_LIGHT : darkDefault), sc), L = R.look;
  const fam = FAMILIES.find(f => f[0] === L.type.family) ?? FAMILIES[0]!;
  return ROLES.map(r => `--p-${r}:${p[r]}`).join(';') + `;--p-onAccent:${onColor(p.accent)};--b2c-corner-stage:${L.shape.corner}px;--b2c-corner-stage-small:${Math.min(L.shape.corner, 3)}px;--bw:${L.shape.border}px;--ts:${L.type.scale};--den:${DENSITY[L.density] ?? 1};--card-w:${L.cards.width}px;--card-gap:${L.cards.gap}px;--page-max:${PAGE_W[L.layout.width] ?? 'none'};--font:${fam[1]}`;
}

const courseText = (c: string, sc: string) => (sc === 'dark' ? `oklch(from ${c} max(l, 0.74) c h)` : c);
function todoItems(f: Record<string, unknown>) { return ITEMS.filter(it => f.todoOverdue || it.due >= NOW).sort((a, b) => +a.due - +b.due); }
function cardItems(cid: string, f: Record<string, unknown>) {
  const types: Record<string, unknown> = { assignment: f.tAssign, quiz: f.tQuiz, discussion: f.tDisc };
  return ITEMS.filter(it => it.cid === cid && types[it.type] && (it.due >= NOW || f.inclOverdue)).sort((a, b) => +a.due - +b.due);
}
function groupOf(it: Item) { if (it.due < NOW) return 'Overdue'; const d = dayDiff(it.due, NOW); if (d === 0) return 'Today'; if (d === 1) return 'Tomorrow'; return d <= 7 - NOW.getDay() ? 'This week' : 'Later'; }

export function gpa(f: Record<string, unknown>) {
  const inc = COURSES.filter(c => c.pct != null && c.credits);
  const cr = inc.reduce((a, c) => a + c.credits!, 0), qp = inc.reduce((a, c) => a + letter(c.pct!)[2] * c.credits!, 0);
  const raw = cr ? qp / cr : 0;
  const mode = f.rounding === 'truncate' ? 'truncate' : 'round'; // Automatic: no school rule ships, so it rounds
  return { raw, shown: !cr ? '—' : mode === 'truncate' ? (Math.floor(raw * 100 + 1e-9) / 100).toFixed(2) : raw.toFixed(2), cr, mode };
}

export function stageHtml(c: StageCtx, darkDefault: Partial<Roles>): string {
  const page = c.tab === 'dashboard' ? dashboardHtml(c) : c.tab === 'course' ? courseHtml(c) : gradesHtml(c);
  return `<div class="cv" data-part="page" data-scheme="${c.sc}" data-border="${c.R.look.shape.border}" style="${esc(stageVars(c.R, c.sc, darkDefault))}">${navHtml(c)}<main class="cv-main">${page}</main></div>`;
}
function navHtml(c: StageCtx) {
  const items: [string, string, string, number?][] = [['account', 'Account', I.account], ['dashboard', 'Dashboard', I.dash], ['courses', 'Courses', I.courses], ['calendar', 'Calendar', I.cal], ['inbox', 'Inbox', I.inbox, 1], ['history', 'History', I.history], ['help', 'Help', I.help, 10]];
  const act = c.tab === 'dashboard' ? 'dashboard' : 'courses';
  return `<nav class="cv-nav" data-part="nav"><div class="cv-logo">${c.f.hideLogo ? '' : I.logo}</div>${items.map(([id, l, ic, b]) => `<div class="cv-nav-item ${id === act ? 'active' : ''}">${ic}${b ? `<span class="badge">${b}</span>` : ''}<span>${l}</span></div>`).join('')}</nav>`;
}
function dashboardHtml(c: StageCtx) {
  const side = c.R.look.layout.panel;
  const panel = side === 'hidden' ? '' : panelHtml(c);
  return `<div class="cv-dash">
    <div class="cv-dash-head"><h1 class="cv-h1" data-part="text">Hello, ${PERSONA}!</h1><span class="cv-btn">Switch to old dashboard view</span><span class="cv-btn outline">☷ Customize dashboard</span></div>
    <div class="cv-tabsbar"><span class="cv-tabbtn">Dashboard</span><span class="cv-tabbtn on">Courses</span></div>
    <div class="cv-cols ${side === 'left' ? 'left' : ''}"><div class="cv-gridwrap" data-part="grid"><div class="b2c-grid">${COURSES.map(x => cardHtml(x.id, c)).join('')}</div></div>${panel}</div></div>`;
}
function cardHtml(id: string, c: StageCtx) {
  const crs = course(id), L = c.R.look, col = c.R.cc[id]!, f = c.f, ck = clock(f);
  const chip = f.cardGrades ? (crs.pct == null ? '<span class="b2c-chip none">No grade</span>' : `<span class="b2c-chip">${crs.pct}% ${letter(crs.pct)[0]}</span>`) : '';
  let face = '';
  if (L.cards.style === 'image' && SAMPLE_IMG[id]) face = `<img src="${SAMPLE_IMG[id]}" alt="" style="${f.dimImages && c.sc === 'dark' ? 'filter:brightness(.85)' : ''}">${L.cards.overlay ? '<span class="wash" style="opacity:.62"></span>' : ''}`;
  const items = cardItems(id, f), N = Number(f.nShown), view = L.views.cards;
  let due = '';
  if (f.cardAssign) {
    let body = '';
    if (view === 'next') {
      const it = items[0]; body = it ? `<div class="b2c-next ${it.due < NOW ? 'overdue' : ''}"><div class="t">${esc(it.title)}</div><div class="d${it.due < NOW ? ' danger' : ''}">${esc(cardDue(it.due, f).text)}</div></div>` : '<div class="b2c-next"><div class="d">Nothing due soon</div></div>';
    } else if (view === 'count') {
      const od = items.filter(i => i.due < NOW).length, wk = items.filter(i => i.due >= NOW && dayDiff(i.due, NOW) < 7).length;
      body = `<div class="b2c-count"><span class="${od ? 'od' : ''}"><b>${od}</b> overdue</span><span><b>${wk}</b> this week</span><span><b>${items.length}</b> total</span></div>`;
    } else {
      const shown = items.slice(0, N);
      body = shown.map(it => { const od = it.due < NOW; const gi = f.gradeImpact && crs.pct != null ? `<span class="gi">−${(it.pts / 30).toFixed(1)} / +${(it.pts / 90).toFixed(1)}</span>` : '';
        return `<div class="b2c-row ${od ? 'overdue' : ''}"><span class="b2c-check"></span><span class="t">${esc(it.title)}</span>${cardDueHtml(it.due, f)}${gi}</div>`; }).join('')
        + `<div style="height:calc(${Math.max(0, N - shown.length)} * 29px * var(--den))"></div><div class="b2c-more">${items.length > N ? `<a>+${items.length - N} more</a>` : ''}</div>`;
    }
    due = `<div class="b2c-due"><div class="b2c-due-h">Due · ${items.length}</div>${body}</div>`;
  }
  return `<article class="b2c-card ${L.cards.height === 'condensed' ? 'condensed' : ''}" data-part="card" data-cid="${id}" style="--c:${col};--ct:${courseText(col, c.sc)}">
    <div class="hero ${L.cards.style === 'gradient' ? 'grad' : ''}">${face}${chip}</div>
    <div class="body"><div class="title">${esc(crs.name)}</div><div class="code">${esc(crs.code)}</div></div>
    <div class="links"><span>${I.ann}${crs.unread.ann ? `<span class="badge">${crs.unread.ann}</span>` : ''}</span><span>${I.asg}</span><span>${I.disc}${crs.unread.disc ? `<span class="badge">${crs.unread.disc}</span>` : ''}</span><span>${I.files}</span></div>${due}</article>`;
}
function panelHtml(c: StageCtx) {
  const shown = (id: string, on: unknown) => !!on || !!c.force?.includes(id);
  const off = (html: string, on: unknown) => (on ? html : html.replace('class="b2c-sec', 'data-off="Off" class="b2c-sec is-off'));
  const secs = c.R.look.layout.sections.map(id => (id === 'todo' ? (shown('todo', c.f.todo) ? off(todoHtml(c), c.f.todo) : '') : id === 'notes' ? (shown('notes', c.f.notes) ? off(notesHtml(c), c.f.notes) : '') : shown('gpa', c.f.gpa) ? off(gpaHtml(c), c.f.gpa) : '')).join('');
  return `<aside class="b2c-panel" data-part="panel">${secs || '<div class="b2c-group">Side panel is empty</div>'}</aside>`;
}
const secHead = (title: string, extra = '') => `<div class="b2c-sec-h"><h2>${title}</h2>${extra}<span class="b2c-gear" title="Settings">${I.gear}</span></div>`;
function todoHtml(c: StageCtx) {
  const f = c.f, ck = clock(f), L = todoItems(f), view = c.R.look.views.todo, mk = (cid: string) => (f.todoColors ? c.R.cc[cid]! : 'var(--p-textTertiary)');
  const N = Number(f.todoN);
  let body = '';
  if (view === 'ring') {
    const wk = L.filter(i => dayDiff(i.due, NOW) < 7), by = COURSES.map(x => [x, wk.filter(i => i.cid === x.id).length] as const).filter(x => x[1]);
    const n = wk.length;
    const nx = L.find(i => i.due >= NOW);
    body = `<div class="tv-ring">${ringSvg(by.map(([x, k]) => ({ color: mk(x.id), count: k })), n, [String(n), 'due in 7 days'])}
      <div class="legend">${by.map(([x, k]) => `<span><i style="background:${mk(x.id)}"></i>${x.short} · ${k}</span>`).join('')}</div></div>
      ${nx ? `<div class="tv-next">Next: <span class="t">${esc(nx.title)}</span> · ${fmtDue(nx.due, ck)}</div>` : ''}`;
  } else if (view === 'week') {
    const od = L.filter(i => i.due < NOW);
    const days = Array.from({ length: 7 }, (_, k) => new Date(2026, 9, 19 + k));
    body = (od.length ? `<div class="b2c-group danger">Overdue · ${od.length}</div>` : '') + `<div class="tv-week">${days.map((d, k) => `<div class="day ${k === 0 ? 'today' : ''}"><div class="dn">${WD[d.getDay()]}<b>${d.getDate()}</b></div>${L.filter(i => i.due >= NOW && dayDiff(i.due, d) === 0).map(i => `<i style="--mk:${mk(i.cid)}" title="${esc(i.title)}"></i>`).join('')}</div>`).join('')}</div>`
      + L.filter(i => i.due >= NOW).slice(0, 3).map(it => `<div class="tv-next"><span class="t">${esc(it.title)}</span> · ${fmtDue(it.due, ck)}</div>`).join('');
  } else if (view === 'courses') {
    let left = N;
    body = COURSES.map(x => { const xs = L.filter(i => i.cid === x.id); const shown = xs.slice(0, Math.max(0, Math.min(3, left))); left -= shown.length; if (!shown.length) return '';
      return `<div class="tv-course" style="--mk:${mk(x.id)}"><h3><i></i>${x.short} <span>· ${xs.length}</span></h3>${shown.map(it => `<div class="r ${it.due < NOW ? 'od' : ''}"><span>${esc(it.title)}</span><span>${fmtDue(it.due, ck)}</span></div>`).join('')}</div>`; }).join('');
  } else {
    let lastG: string | null = null;
    L.slice(0, N).forEach(it => {
      const g = groupOf(it); if (g !== lastG) { body += `<div class="b2c-group ${g === 'Overdue' ? 'danger' : ''}">${g}</div>`; lastG = g; }
      const od = it.due < NOW, dt = od ? cardDue(it.due, f).text : g === 'Today' || g === 'Tomorrow' ? fmtTime(it.due, ck) : fmtDue(it.due, ck);
      body += `<div class="b2c-trow" style="--mk:${mk(it.cid)}"><span class="b2c-check"></span><span class="tt"><span class="t">${esc(it.title)}</span><span class="m"><span>${course(it.cid).short}</span><span class="d ${od ? 'danger' : ''}">${dt}</span></span></span></div>`;
    });
    if (L.length > N) body += `<a class="b2c-showmore">Show ${Math.min(8, L.length - N)} more</a>`;
  }
  if (f.todoAnn && view === 'list') body += `<div class="b2c-group">Announcements · ${ANN.length}</div>` + ANN.map(a => `<div class="b2c-trow" style="--mk:transparent"><span class="tt"><span class="t">${esc(a.title)}</span><span class="m"><span>${course(a.cid).short}</span><span class="d">${a.when}</span></span></span></div>`).join('');
  return `<section class="b2c-sec" data-part="todo">${secHead(`To do <span class="n">· ${L.length}</span>`)}${body}</section>`;
}
const notesHtml = (c: StageCtx) => `<section class="b2c-sec b2c-notes" data-part="notes">${secHead('Notes')}<div class="area">${esc(c.notesText)}</div></section>`;
function gpaHtml(c: StageCtx) {
  const g = gpa(c.f);
  return `<section class="b2c-sec b2c-gpa" data-part="gpa">${secHead('GPA')}<div class="fig"><span class="k">Term GPA (projected)</span><span class="v">${g.shown}</span></div>
    <div class="status">From ${g.cr} credits · <a>${course('hist').short} needs credits</a> · ${course('math').short} has no grade yet</div></section>`;
}
const CNAV = ['Home', 'Syllabus', 'Modules', 'Discussions', 'Assignments', 'Grades', 'Zoom', 'People'];
function courseHtml(c: StageCtx) {
  const crs = course('hist'), ck = clock(c.f);
  return `<div class="cv-crumbs"><span class="burger">☰</span><a data-part="link">${crs.code}</a><span class="sep">›</span><a data-part="link">Assignments</a><span class="sep">›</span><span>Source analysis 2</span></div>
  <div class="cv-course"><nav class="cv-cnav" data-part="cnav"><div class="term">Fall 2026</div>${CNAV.map(n => `<a class="${n === 'Assignments' ? 'active' : ''}">${n}</a>`).join('')}</nav>
  <div class="cv-ccontent"><article class="cv-article" data-part="content">
    <h1 class="cv-asg-title">Source analysis 2</h1>
    <div class="cv-meta"><span><b>Due</b> ${fmtDue(due(10, 20), ck)}</span><span><b>Points</b> 20</span><span><b>Submitting</b> a file upload</span><span><b>File types</b> pdf</span></div>
    <div class="cv-rich">
      <p>Choose <b>one primary source</b> from this week's reader and write 600–800 words on who made it, for whom, and why. The <a data-part="link">reading guide for Week 4</a> has the questions we practised in section.</p>
      <div class="callout"><b>Collaboration.</b> You may discuss sources with classmates, but write your analysis alone and name who you worked with.</div>
      <h3>What to cover</h3>
      <ol><li>Context: when and where the source was made, and what was happening.</li>
        <li>Audience and purpose: who it was for, and what it wanted them to do or believe.</li>
        <li>Reliability: what it can and can't tell us, with one example.</li></ol>
      <table><tr><th>Part</th><th>Points</th><th>Graded on</th></tr><tr><td>1</td><td>6</td><td>Accuracy, then clarity</td></tr><tr><td>2</td><td>8</td><td>Use of the source</td></tr><tr><td>3</td><td>6</td><td>Completeness of the argument</td></tr></table>
      <p>Cite the reader by page; the <a data-part="link">citation guide</a> is on the Files page.</p>
    </div></article>
    <aside class="cv-aside"><div class="cv-box" data-part="box"><h4>Submission</h4><div class="row"><span>Status</span><span class="warn">Not submitted</span></div><div class="row"><span>Attempts</span><span>Unlimited</span></div><div style="margin-top:10px"><span class="cv-btn primary" data-part="accent">Start Assignment</span></div></div>
    <div class="cv-box" data-part="box"><h4>Last week</h4><div class="row"><span>Reading response 4</span><span class="ok">Graded 19/20</span></div><div class="row"><span>Quiz 2</span><span class="ok">Graded 17/20</span></div></div></aside>
  </div></div>`;
}
function gradesHtml(c: StageCtx) {
  const crs = course('hist');
  const rows = GRADED_441.map(([t, s, p, d]) => `<tr><td><a data-part="link">${t}</a><div class="st">Assignment</div></td><td>${d}</td><td class="num">${s}</td><td class="num">${p}</td></tr>`).join('')
    + '<tr><td><a data-part="link">Reading response 4</a><div class="st miss">Missing</div></td><td>Oct 16</td><td class="num">–</td><td class="num">10</td></tr>'
    + ITEMS.filter(i => i.cid === 'hist' && i.due >= NOW).slice(0, 4).map(i => `<tr><td><a data-part="link">${esc(i.title)}</a><div class="st">${i.type[0]!.toUpperCase() + i.type.slice(1)}</div></td><td>${MO[i.due.getMonth()]} ${i.due.getDate()}</td><td class="num">–</td><td class="num">${i.pts}</td></tr>`).join('');
  const goal = c.f.goals || c.force?.includes('goal') ? '<div class="b2c-goal" data-part="goal"><div class="gh">Goal <span class="sel">B+ (87%) ⌄</span></div><div>You need an average of <b>86.6%</b> on the remaining <b>175 points</b>.</div><div class="bar"><i style="width:98%"></i></div><div class="how">Hypothetical. Canvas’s total is unchanged.</div></div>' : '';
  return `<div class="cv-crumbs"><span class="burger">☰</span><a data-part="link">${crs.code}</a><span class="sep">›</span><span>Grades</span></div>
  <div class="cv-course"><nav class="cv-cnav" data-part="cnav"><div class="term">Fall 2026</div>${CNAV.map(n => `<a class="${n === 'Grades' ? 'active' : ''}">${n}</a>`).join('')}</nav>
  <div class="cv-ccontent"><div style="flex:1;min-width:0"><h1 class="cv-asg-title" data-part="text" style="font-size:calc(28px * var(--ts));margin-bottom:16px">Grades for ${PERSONA}</h1>
  <div class="cv-grades"><table class="cv-gtable" data-part="table"><tr><th>Name</th><th>Due</th><th style="text-align:right">Score</th><th style="text-align:right">Out of</th></tr>${rows}</table>
  <div class="cv-gside">${goal}<div class="cv-total">Total: ${crs.pct}% (${letter(crs.pct!)[0]})</div><span class="cv-btn small">Show All Details</span><p style="font-size:calc(12.5px * var(--ts));color:var(--p-textSecondary)">Canvas’s own total and what-if scores, untouched.</p></div></div></div></div></div>`;
}

/** The tiny Canvas inside a theme chip or slot. */
export function miniHtml(pal: Partial<Roles> | null | undefined, sc: 'light' | 'dark', colors: readonly string[]): string {
  const p = resolvePal(pal ?? (sc === 'light' ? CANVAS_LIGHT : null), sc), cc = colors;
  const card = (i: number) => `<div class="m-card" style="left:${14 + i * 22}px;background:${p.surface};box-shadow:${sc === 'light' ? '0 0 0 .5px ' + p.border + ',0 1px 1px rgba(0,0,0,.15)' : '0 0 0 1px ' + p.border}"><i style="background:${cc[i]}"></i><b style="background:${p.text}"></b><b style="background:${p.textSecondary};width:55%"></b></div>`;
  return `<div style="position:absolute;inset:0;background:${p.bg}"></div><div class="m-nav" style="background:${p.nav}"></div><div class="m-h" style="background:${p.text}"></div>${card(0)}${card(1)}<div class="m-panel"><b style="background:${p.text}"></b><b style="background:${cc[2]}"></b><b style="background:${p.textSecondary}"></b><b style="background:${cc[3]}"></b><b style="background:${p.link}"></b></div>`;
}

export { fmtDue, NOW, due };
