// The card's one ⋮ menu (flow A, _dashboard.md §1a): in Canvas's ⋮ spot, a
// superset of Canvas's own menu.
//   Color… · Rename… · Image… · Links… · [Set grade goal… and other registered items]
//   Move ⇤ ← → ⇥ · Hide card · Unfavorite
//   Dashboard settings…
// Each item opens an inline panel in the same popover; no modals.

import { widgetHost } from '../../core/dom.ts';
import { actionAttr, setAttrs, type ActionVerb } from '../../core/agent/anchors.ts';
import { AGENT_ATTR } from '../../core/agent/hook.ts';
import { HERO, clampCrop, cropSource, initialCrop, safeImage, safeLink, faviconFor, zoomCrop, type CardCustom, type Crop, type LinkSlot } from './model.ts';

/** Other features add items here (see registerCardMenuItem). */
export interface CardMenuItem {
  id: string;
  label: string;
  /** Sort position among the top group: Color 10, Rename 20, Image 30, Links 40; grade goal ≈ 50. */
  order: number;
  /** Shown only when this returns true (default: always). */
  when?(courseId: string): boolean;
  /** Called after the popover closes; `anchor` is the ⋮ button to position against. */
  run(courseId: string, anchor: HTMLElement): void;
}

const registry = new Map<string, CardMenuItem>();

/** For other features (grade-goals…): add an item to every card's ⋮ menu. Returns an unregister function. */
export function registerCardMenuItem(item: CardMenuItem): () => void {
  registry.set(item.id, item);
  return () => {
    if (registry.get(item.id) === item) registry.delete(item.id);
  };
}

/** Canvas's own course-colour picker set (as in its card menu). */
export const CANVAS_SWATCHES = ['#BD3C14', '#E71F63', '#8F3E97', '#65499D', '#4554A4', '#1770AB', '#0B9BE3', '#06A3B7', '#009688', '#009606', '#D97900', '#E8735F', '#8B7F8E', '#3B73B9', '#596F84', '#2D3B45'];

export type MoveTo = 'start' | 'left' | 'right' | 'end';

export interface MenuActions {
  courseId: string;
  name: string;
  color: string | null;
  custom: CardCustom;
  /** renameVia = 'b2c': Rename sets a b²c-only label instead of the Canvas nickname. */
  renameLocal: boolean;
  /** Position among the visible cards, for disabling Move at the ends. */
  index: number;
  count: number;
  setColor(hex: string): void;
  rename(v: string | undefined): void;
  move(to: MoveTo): void;
  hide(): void;
  unfavorite(): void;
  setImage(v: string | undefined): void;
  /** The course code as Canvas shows it (no b²c override). */
  code: string;
  /** b²c-only course-code label; undefined resets to Canvas's. */
  setCode(v: string | undefined): void;
  setLinks(v: LinkSlot[]): void;
  openSettings(): void;
}

const STYLE = `
:host { all: initial; position: absolute; z-index: 10001; font-family: var(--b2c-font-canvas, inherit); }
.p { box-sizing: border-box; width: 260px; padding: 6px; border-radius: var(--b2c-radius-lg, 3px); background: var(--b2c-w-bg, #fff); color: var(--b2c-w-text, #2d3b45);
  border: 1px solid var(--b2c-w-border, #c7cdd1); box-shadow: 0 6px 20px rgba(0,0,0,.18); font-size: 14px; line-height: 20px; }
* { box-sizing: border-box; }
button.item { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; font: inherit; color: inherit; background: none; border: 0;
  border-radius: var(--b2c-radius-sm, 2px); padding: 6px 10px; cursor: pointer; }
button.item:hover:not(:disabled), button.item:focus-visible { background: var(--b2c-w-hover, rgba(45,59,69,.06)); outline: none; }
button.item.danger { color: var(--b2c-w-danger, #e0061f); }
button:disabled { opacity: .45; cursor: default; }
.sw { width: 14px; height: 14px; border-radius: var(--b2c-radius-sm, 2px); flex: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }
.moverow { display: flex; align-items: center; gap: 2px; padding: 2px 4px 2px 10px; }
.moverow .lbl { flex: 1; font-size: 14px; color: inherit; }
.moverow button { width: 32px; height: 28px; display: grid; place-items: center; font: inherit; font-size: 15px; color: inherit; background: none; border: 0;
  border-radius: var(--b2c-radius-sm, 2px); cursor: pointer; }
.moverow button:hover:not(:disabled), .moverow button:focus-visible { background: var(--b2c-w-hover, rgba(45,59,69,.06)); outline: none; }
hr { border: 0; border-top: 1px solid var(--b2c-w-border, #c7cdd1); margin: 4px 0; }
.foot { padding: 4px 10px 2px; font-size: 12px; line-height: 16px; color: var(--b2c-w-text-secondary, #6b7780); }
.panel { padding: 4px 6px; display: grid; gap: 8px; }
.h { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.back { font: inherit; background: none; border: 0; padding: 2px 6px; border-radius: var(--b2c-radius-sm, 2px); cursor: pointer; color: var(--b2c-w-link, #0374b5); }
input[type=text], input[type=url], select { width: 100%; font: inherit; font-size: 13px; padding: 4px 6px; border: 1px solid var(--b2c-w-border, #c7cdd1);
  border-radius: var(--b2c-radius-md, 2px); background: var(--b2c-w-bg, #fff); color: inherit; }
input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid var(--b2c-w-link, #0374b5); outline-offset: 1px; }
.row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.btn { font: inherit; font-size: 13px; padding: 4px 10px; border-radius: var(--b2c-radius-md, 2px); border: 1px solid var(--b2c-w-border, #c7cdd1);
  background: var(--b2c-w-surface, #f5f5f5); color: inherit; cursor: pointer; }
.btn.primary { background: var(--b2c-w-link, #0374b5); border-color: transparent; color: #fff; }
.thumb { height: 72px; border-radius: var(--b2c-radius-sm, 2px); background: var(--b2c-w-surface, #f5f5f5) center/cover no-repeat; border: 1px solid var(--b2c-w-border, #c7cdd1); }
.err { color: var(--b2c-w-danger, #e0061f); font-size: 12px; min-height: 16px; }
.slot { display: grid; grid-template-columns: 22px 1fr; gap: 4px 6px; align-items: center; }
.slot img { width: 16px; height: 16px; }
.slot input { grid-column: 2; }
.lbl2 { font-size: 12px; color: var(--b2c-w-text-secondary, #6b7780); }
.crop { position: relative; width: 236px; height: ${Math.round(236 * HERO.h / HERO.w)}px; overflow: hidden; border-radius: var(--b2c-radius-sm, 2px);
  background: var(--b2c-w-surface, #f5f5f5); cursor: grab; touch-action: none; outline-offset: 2px; }
.crop:active { cursor: grabbing; }
.crop:focus-visible { outline: 2px solid var(--b2c-w-link, #0374b5); }
.crop img { position: absolute; left: 0; top: 0; transform-origin: 0 0; user-select: none; pointer-events: none; max-width: none; }
input[type=range] { width: 100%; accent-color: var(--b2c-w-link, #0374b5); }
.field { display: grid; gap: 4px; }
.field .row { flex-wrap: nowrap; }
.swatches { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; }
.swatches button { aspect-ratio: 1; border: 0; border-radius: var(--b2c-radius-sm, 2px); cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }
.swatches button[aria-checked=true] { outline: 2px solid var(--b2c-w-text, #2d3b45); outline-offset: 1px; }
`;

let open: CardMenu | null = null;

/** §3: mark a control that changes state, while the agent contract is on. */
function act(el: HTMLElement, verb: ActionVerb): HTMLElement {
  if (document.documentElement.hasAttribute(AGENT_ATTR)) setAttrs(el, actionAttr(verb));
  return el;
}

/** Close whichever card menu is open. */
export function closeCardMenu(): void {
  open?.close();
}

export class CardMenu {
  private host: HTMLElement;
  private root: ShadowRoot;
  private panel: HTMLElement;
  private offDoc: () => void;

  constructor(private anchor: HTMLElement, private a: MenuActions, private onClose: () => void) {
    open?.close();
    open = this;
    const w = widgetHost('card-menu', STYLE);
    this.host = w.host;
    this.root = w.root;
    this.panel = document.createElement('div');
    this.panel.className = 'p';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', `Card options for ${a.name}`);
    this.root.appendChild(this.panel);
    document.body.appendChild(this.host);
    this.place();
    this.showRoot();

    const onDown = (e: PointerEvent) => {
      const path = e.composedPath();
      if (!path.includes(this.host) && !path.includes(this.anchor)) this.close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close(true);
      }
    };
    const onResize = () => this.place();
    document.addEventListener('pointerdown', onDown, true);
    this.host.addEventListener('keydown', onKey);
    addEventListener('resize', onResize);
    this.offDoc = () => {
      document.removeEventListener('pointerdown', onDown, true);
      removeEventListener('resize', onResize);
    };
  }

  private place() {
    const r = this.anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, innerWidth - 268));
    this.host.style.left = `${left + scrollX}px`;
    this.host.style.top = `${r.bottom + 4 + scrollY}px`;
  }

  close(returnFocus = false) {
    if (open === this) open = null;
    this.offDoc();
    this.host.remove();
    this.onClose();
    if (returnFocus) this.anchor.focus();
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, kids: (Node | string)[] = []) {
    const e = document.createElement(tag);
    const { class: cls, ...rest } = props as { class?: string };
    if (cls) e.className = cls;
    Object.assign(e, rest);
    e.append(...kids);
    return e;
  }

  private item(label: string | (Node | string)[], run: () => void, opts: { danger?: boolean; disabled?: boolean } = {}) {
    const b = this.el('button', { type: 'button', class: opts.danger ? 'item danger' : 'item', disabled: !!opts.disabled });
    b.append(...(typeof label === 'string' ? [label] : label));
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', run);
    return b;
  }

  private showRoot() {
    const a = this.a;
    const swatch = this.el('span', { class: 'sw' });
    if (a.color) swatch.style.background = a.color;
    const top: { order: number; node: HTMLElement }[] = [
      { order: 10, node: this.item([swatch, 'Color…'], () => this.showColor()) },
      { order: 20, node: this.item('Rename…', () => this.showRename()) },
      { order: 30, node: this.item('Image…', () => this.showImage()) },
      { order: 40, node: this.item('Links…', () => this.showLinks()) },
    ];
    for (const it of registry.values()) {
      if (it.when && !it.when(a.courseId)) continue;
      top.push({
        order: it.order,
        node: this.item(it.label, () => {
          this.close();
          it.run(a.courseId, this.anchor);
        }),
      });
    }
    top.sort((x, y) => x.order - y.order);

    const move = this.el('div', { class: 'moverow' });
    move.setAttribute('role', 'group');
    move.setAttribute('aria-label', 'Move card');
    move.appendChild(this.el('span', { class: 'lbl', textContent: 'Move' }));
    const atStart = a.index <= 0, atEnd = a.index >= a.count - 1;
    for (const [to, glyph, label, disabled] of [
      ['start', '⇤', 'Move to start', atStart],
      ['left', '←', 'Move left', atStart],
      ['right', '→', 'Move right', atEnd],
      ['end', '⇥', 'Move to end', atEnd],
    ] as const) {
      const b = this.el('button', { type: 'button', textContent: glyph, title: label, disabled });
      b.setAttribute('aria-label', label);
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => {
        this.close(true);
        a.move(to);
      });
      act(b, 'move-card');
      move.appendChild(b);
    }

    const menu = this.el('div');
    menu.setAttribute('role', 'menu');
    menu.append(
      ...top.map(i => i.node),
      this.el('hr'),
      move,
      act(this.item('Hide card', () => (this.close(), a.hide())), 'hide-card'),
      act(this.item('Unfavorite', () => (this.close(), a.unfavorite())), 'unfavorite'),
      this.el('hr'),
      this.item('Dashboard settings…', () => (this.close(), a.openSettings())),
    );
    const foot = this.el('div', {
      class: 'foot',
      textContent: a.renameLocal ? 'Color and order are saved to your Canvas account.' : 'Color, name and order are saved to your Canvas account.',
    });
    this.panel.replaceChildren(menu, foot);
    (menu.querySelector('button') as HTMLElement | null)?.focus();
  }

  private header(title: string) {
    const back = this.el('button', { type: 'button', class: 'back', textContent: '‹' });
    back.setAttribute('aria-label', 'Back');
    back.addEventListener('click', () => this.showRoot());
    return this.el('div', { class: 'h' }, [back, title]);
  }

  private showColor() {
    const cur = (this.a.color ?? '').toLowerCase();
    const grid = this.el('div', { class: 'swatches' });
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', 'Card color');
    for (const hex of CANVAS_SWATCHES) {
      const b = this.el('button', { type: 'button' });
      b.style.background = hex;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(hex.toLowerCase() === cur));
      b.setAttribute('aria-label', hex);
      b.addEventListener('click', () => (this.a.setColor(hex), this.close(true)));
      act(b, 'set-color');
      grid.appendChild(b);
    }
    const err = this.el('div', { class: 'err' });
    const input = this.el('input', { type: 'text', value: this.a.color ?? '', placeholder: '#1770AB', maxLength: 7 });
    input.setAttribute('aria-label', 'Custom color (hex)');
    const apply = act(this.el('button', { type: 'button', class: 'btn primary', textContent: 'Apply' }), 'set-color');
    apply.addEventListener('click', () => {
      const v = input.value.trim().replace(/^#?/, '#');
      if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
        err.textContent = 'Enter a hex color like #1770AB';
        return;
      }
      this.a.setColor(v);
      this.close(true);
    });
    input.addEventListener('keydown', e => e.key === 'Enter' && apply.click());
    this.panel.replaceChildren(
      this.el('div', { class: 'panel' }, [
        this.header('Color'),
        grid,
        this.el('div', { class: 'row' }, [input, apply]),
        err,
        this.el('div', { class: 'lbl2', textContent: 'Saved to your Canvas account, so Canvas and its app match.' }),
      ]),
    );
    ((grid.querySelector('[aria-checked=true]') ?? grid.querySelector('button')) as HTMLElement | null)?.focus();
  }

  private showRename() {
    const a = this.a;
    const field = (label: string, value: string, max: number, placeholder: string) => {
      const input = this.el('input', { type: 'text', value, maxLength: max, placeholder });
      input.setAttribute('aria-label', label);
      return input;
    };
    const name = field('Card name', a.renameLocal ? (a.custom.name ?? a.name) : a.name, 59, a.name);
    const code = field('Course code', a.custom.code ?? a.code, 40, a.code);
    const resetName = act(this.el('button', { type: 'button', class: 'btn', textContent: 'Reset' }), a.renameLocal ? 'set-label' : 'set-nickname');
    resetName.setAttribute('aria-label', 'Reset name to the course name');
    const resetCode = act(this.el('button', { type: 'button', class: 'btn', textContent: 'Reset' }), 'set-label');
    resetCode.setAttribute('aria-label', "Reset course code to Canvas's");
    const save = act(this.el('button', { type: 'button', class: 'btn primary', textContent: 'Save' }), a.renameLocal ? 'set-label' : 'set-nickname');
    const initialName = name.value, initialCode = code.value;
    save.addEventListener('click', () => {
      if (name.value.trim() !== initialName) a.rename(name.value.trim() || undefined);
      if (code.value.trim() !== initialCode) {
        const v = code.value.trim();
        a.setCode(v && v !== a.code ? v : undefined);
      }
      this.close(true);
    });
    resetName.addEventListener('click', () => (a.rename(undefined), this.close(true)));
    resetCode.addEventListener('click', () => (a.setCode(undefined), this.close(true)));
    for (const i of [name, code]) i.addEventListener('keydown', e => e.key === 'Enter' && save.click());
    this.panel.replaceChildren(
      this.el('div', { class: 'panel' }, [
        this.header('Rename'),
        this.el('div', { class: 'field' }, [
          this.el('span', { class: 'lbl2', textContent: a.renameLocal ? 'Name (b²c only)' : 'Name (your Canvas nickname, shown everywhere)' }),
          this.el('div', { class: 'row' }, [name, resetName]),
        ]),
        this.el('div', { class: 'field' }, [
          this.el('span', { class: 'lbl2', textContent: 'Course code (on this card, b²c only)' }),
          this.el('div', { class: 'row' }, [code, resetCode]),
        ]),
        save,
      ]),
    );
    name.select();
  }

  /** Crop to the hero's aspect: drag to position, zoom with the slider (or +/−, arrows). */
  private async showCrop(f: File) {
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(f);
    } catch {
      this.showImage("Couldn't read that image");
      return;
    }
    const iw = bmp.width, ih = bmp.height;
    const frame = this.el('div', { class: 'crop', tabIndex: 0 });
    frame.setAttribute('role', 'application');
    frame.setAttribute('aria-label', 'Crop: drag or use arrow keys to position, + and − to zoom');
    const url = URL.createObjectURL(f);
    const img = this.el('img', { src: url, alt: '' });
    frame.appendChild(img);
    const fw = 236, fh = Math.round((236 * HERO.h) / HERO.w);
    let c: Crop = initialCrop(iw, ih, fw, fh);
    const zoom = this.el('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1' });
    zoom.setAttribute('aria-label', 'Zoom');
    const paint = () => {
      const s = Math.max(fw / iw, fh / ih) * c.zoom;
      img.style.width = `${iw}px`;
      img.style.transform = `translate(${c.x}px, ${c.y}px) scale(${s})`;
      zoom.value = String(c.zoom);
    };
    paint();
    zoom.addEventListener('input', () => ((c = zoomCrop(iw, ih, c, Number(zoom.value))), paint()));
    let drag: { px: number; py: number; x: number; y: number } | null = null;
    frame.addEventListener('pointerdown', e => {
      frame.setPointerCapture(e.pointerId);
      drag = { px: e.clientX, py: e.clientY, x: c.x, y: c.y };
    });
    frame.addEventListener('pointermove', e => {
      if (!drag) return;
      c = clampCrop(iw, ih, { ...c, x: drag.x + e.clientX - drag.px, y: drag.y + e.clientY - drag.py });
      paint();
    });
    const end = () => (drag = null);
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
    frame.addEventListener('keydown', e => {
      const step = e.shiftKey ? 24 : 6;
      const mv: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (mv[e.key]) c = clampCrop(iw, ih, { ...c, x: c.x + mv[e.key]![0], y: c.y + mv[e.key]![1] });
      else if (e.key === '+' || e.key === '=') c = zoomCrop(iw, ih, c, c.zoom + 0.1);
      else if (e.key === '-') c = zoomCrop(iw, ih, c, c.zoom - 0.1);
      else return;
      e.preventDefault();
      paint();
    });
    const done = () => {
      URL.revokeObjectURL(url);
      bmp.close();
    };
    const use = this.el('button', { type: 'button', class: 'btn primary', textContent: 'Use image' });
    use.addEventListener('click', () => {
      const { sx, sy, sw, sh } = cropSource(iw, ih, c);
      const out = document.createElement('canvas');
      out.width = HERO.outW;
      out.height = HERO.outH;
      out.getContext('2d')!.drawImage(bmp, sx, sy, sw, sh, 0, 0, HERO.outW, HERO.outH);
      const data = out.toDataURL('image/jpeg', 0.85);
      done();
      this.a.setImage(data);
      this.close(true);
    });
    const cancel = this.el('button', { type: 'button', class: 'btn', textContent: 'Cancel' });
    cancel.addEventListener('click', () => (done(), this.showImage()));
    this.panel.replaceChildren(
      this.el('div', { class: 'panel' }, [this.header('Crop'), frame, zoom, this.el('div', { class: 'row' }, [use, cancel]), this.el('div', { class: 'lbl2', textContent: 'Saved in b²c on this computer.' })]),
    );
    frame.focus();
  }

  private showImage(error = '') {
    const cur = this.a.custom.image;
    const thumb = this.el('div', { class: 'thumb' });
    const err = this.el('div', { class: 'err', textContent: error });
    const url = this.el('input', { type: 'url', placeholder: 'https://…', value: cur && cur !== 'none' && !cur.startsWith('data:') ? cur : '' });
    url.setAttribute('aria-label', 'Image URL');
    const preview = () => {
      const v = safeImage(url.value);
      thumb.style.backgroundImage = v && v !== 'none' ? `url("${v.replace(/"/g, '%22')}")` : '';
    };
    if (cur && cur !== 'none') thumb.style.backgroundImage = `url("${cur.replace(/"/g, '%22')}")`;
    url.addEventListener('input', preview);
    const use = this.el('button', { type: 'button', class: 'btn primary', textContent: 'Use URL' });
    use.addEventListener('click', () => {
      const v = safeImage(url.value);
      if (!v || v === 'none') {
        err.textContent = 'Enter an http(s) image address';
        return;
      }
      this.a.setImage(v);
      this.close(true);
    });
    url.addEventListener('keydown', e => e.key === 'Enter' && use.click());
    const file = this.el('input', { type: 'file', accept: 'image/*' });
    file.hidden = true;
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (f) void this.showCrop(f);
    });
    const upload = this.el('button', { type: 'button', class: 'btn', textContent: 'Upload…' });
    upload.addEventListener('click', () => file.click());
    const canvasImg = this.el('button', { type: 'button', class: 'btn', textContent: 'Canvas image' });
    canvasImg.addEventListener('click', () => (this.a.setImage(undefined), this.close(true)));
    const none = this.el('button', { type: 'button', class: 'btn', textContent: 'No image' });
    none.addEventListener('click', () => (this.a.setImage('none'), this.close(true)));
    this.panel.replaceChildren(
      this.el('div', { class: 'panel' }, [this.header('Image'), thumb, url, this.el('div', { class: 'row' }, [use, upload, file]), this.el('div', { class: 'row' }, [canvasImg, none]), err]),
    );
    url.focus();
  }

  private showLinks() {
    const slots: LinkSlot[] = [0, 1, 2, 3].map(i => this.a.custom.links?.[i] ?? { kind: 'default' });
    const err = this.el('div', { class: 'err' });
    const rows = slots.map((s, i) => {
      const sel = this.el('select');
      sel.setAttribute('aria-label', `Link ${i + 1}`);
      for (const [v, l] of [['default', 'Canvas default'], ['none', 'None'], ['custom', 'Custom URL']] as const) sel.append(new Option(l, v, false, s.kind === v));
      const url = this.el('input', { type: 'url', placeholder: 'https://…', value: s.kind === 'custom' ? s.url : '' });
      url.setAttribute('aria-label', `Link ${i + 1} address`);
      url.hidden = s.kind !== 'custom';
      const icon = this.el('img', { alt: '' });
      const setIcon = () => {
        const f = url.hidden ? null : faviconFor(safeLink(url.value) ?? '');
        icon.style.visibility = f ? 'visible' : 'hidden';
        if (f) icon.src = f;
      };
      setIcon();
      sel.addEventListener('change', () => {
        url.hidden = sel.value !== 'custom';
        setIcon();
        if (!url.hidden) url.focus();
      });
      url.addEventListener('change', setIcon);
      return { sel, url, node: this.el('div', { class: 'slot' }, [icon, sel, url]) };
    });
    const save = this.el('button', { type: 'button', class: 'btn primary', textContent: 'Save links' });
    save.addEventListener('click', () => {
      const out: LinkSlot[] = [];
      for (const r of rows) {
        if (r.sel.value === 'custom') {
          const u = safeLink(r.url.value);
          if (!u) {
            err.textContent = 'Enter an http(s) address for each custom link';
            r.url.focus();
            return;
          }
          out.push({ kind: 'custom', url: u });
        } else out.push({ kind: r.sel.value as 'default' | 'none' });
      }
      this.a.setLinks(out);
      this.close(true);
    });
    this.panel.replaceChildren(
      this.el('div', { class: 'panel' }, [this.header('Links'), this.el('div', { class: 'lbl2', textContent: 'Left to right, in place of Canvas’s tab links' }), ...rows.map(r => r.node), save, err]),
    );
    rows[0]!.sel.focus();
  }
}
