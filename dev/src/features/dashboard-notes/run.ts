// dashboard-notes runtime: loaded lazily (chunks/dashboard-notes.js) on the dashboard.
import type { Ctx } from '../../core/ctx.ts';
import type { Instance } from '../../core/feature.ts';
import type { Values } from '../../core/settings/schema.ts';
import { widgetHost } from '../../core/dom.ts';
import { mountInSidePanel } from '../../core/side-panel.ts';
import { openSettings } from '../../core/settings-link.ts';
import { META, pullSync, pushSync } from './sync.ts';
import type feature from './index.ts';

type S = Values<typeof feature.settings>;

const SAVE_MS = 500;
const LINE = 20;
const MAX_LINES = 12;

const STYLE = `
:host { all: initial; display: block; font-family: var(--b2c-font-canvas, inherit); color: var(--b2c-w-text, #2d3b45); font-size: 14px; line-height: ${LINE}px; }
* { box-sizing: border-box; }
.head { display: flex; align-items: center; gap: 6px; min-height: 32px; }
.head button { all: unset; display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; cursor: pointer; border-radius: var(--b2c-radius-sm, 2px); padding: 4px 2px; }
.head button:focus-visible { outline: 2px solid var(--b2c-w-link, #0374b5); outline-offset: 1px; }
h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.preview { color: var(--b2c-w-text-secondary, #6b7780); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.gear { all: unset; flex: none; width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--b2c-radius-sm, 2px);
  color: var(--b2c-w-text-secondary, #6b7780); cursor: pointer; font-size: 15px; line-height: 1; }
.gear:hover { background: var(--b2c-w-hover, rgba(45,59,69,.06)); color: var(--b2c-w-text, #2d3b45); }
.gear:focus-visible { outline: 2px solid var(--b2c-w-link, #0374b5); outline-offset: 1px; }
.chev { margin-left: auto; width: 16px; height: 16px; transition: transform var(--b2c-dur-base, 180ms); flex: none; }
:host([data-collapsed]) .chev { transform: rotate(-90deg); }
:host([data-collapsed]) .body { display: none; }
textarea { display: block; width: 100%; resize: none; overflow-y: hidden; font: inherit; color: inherit; line-height: ${LINE}px;
  padding: 8px; border: 1px solid var(--b2c-w-border, #c7cdd1); border-radius: var(--b2c-radius-md, 2px); background: var(--b2c-w-bg, #fff); min-height: ${LINE * 3 + 18}px; }
textarea::placeholder { color: var(--b2c-w-text-secondary, #6b7780); }
textarea:focus-visible { outline: 2px solid var(--b2c-w-link, #0374b5); outline-offset: 0; border-color: transparent; }
.foot { min-height: 18px; margin-top: 2px; font-size: 12px; line-height: 18px; color: var(--b2c-w-text-secondary, #6b7780); }
.foot button { font: inherit; background: none; border: 0; padding: 0 2px; color: var(--b2c-w-link, #0374b5); cursor: pointer; }
.foot.err { color: var(--b2c-w-danger, #e0061f); }
@media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
`;
const CHEVRON = '<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';

export function start(ctx: Ctx, initial: S): Instance<S> {
  let s = initial;
  let dirty = false; // typed since the last save started
  let saving: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let footTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const { host, root } = widgetHost('dashboard-notes', STYLE);
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'Notes');
  const head = document.createElement('div');
  head.className = 'head';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  const h2 = document.createElement('h2');
  h2.textContent = 'Notes';
  const preview = document.createElement('span');
  preview.className = 'preview';
  toggle.append(h2, preview);
  toggle.insertAdjacentHTML('beforeend', CHEVRON);
  const gear = document.createElement('button');
  gear.type = 'button';
  gear.className = 'gear';
  gear.textContent = '⚙';
  gear.title = 'Settings';
  gear.setAttribute('aria-label', 'Notes settings');
  gear.addEventListener('click', () => openSettings('dashboard-notes'));
  head.append(toggle, gear);
  const body = document.createElement('div');
  body.className = 'body';
  body.id = 'b';
  toggle.setAttribute('aria-controls', 'b');
  const ta = document.createElement('textarea');
  ta.placeholder = 'Notes';
  ta.setAttribute('aria-label', 'Notes');
  ta.spellcheck = true;
  ta.value = s.text;
  const foot = document.createElement('div');
  foot.className = 'foot';
  foot.setAttribute('aria-live', 'polite');
  body.append(ta, foot);
  root.append(head, body);

  const autosize = () => {
    if (!ta.isConnected) return;
    ta.style.height = 'auto';
    const max = LINE * MAX_LINES + 18;
    const h = Math.min(ta.scrollHeight + 2, max);
    ta.style.height = `${h}px`;
    ta.style.overflowY = ta.scrollHeight + 2 > max ? 'auto' : 'hidden';
  };
  const renderCollapsed = () => {
    host.toggleAttribute('data-collapsed', s.collapsed);
    toggle.setAttribute('aria-expanded', String(!s.collapsed));
    const first = ta.value.split('\n').find(l => l.trim())?.trim() ?? '';
    preview.textContent = s.collapsed && first ? `· ${first}` : '';
  };
  renderCollapsed();

  const showFoot = (text: string, opts: { error?: boolean; retry?: boolean; ms?: number } = {}) => {
    if (footTimer) clearTimeout(footTimer);
    foot.replaceChildren(text);
    foot.classList.toggle('err', !!opts.error);
    if (opts.retry) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Retry';
      b.addEventListener('click', () => void save());
      foot.append(' · ', b);
    }
    if (opts.ms) footTimer = setTimeout(() => foot.replaceChildren(), opts.ms);
  };

  async function save(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = null;
    if (saving) await saving.catch(() => {});
    const text = ta.value;
    dirty = false;
    const at = Date.now();
    saving = (async () => {
      await ctx.set({ 'dashboard-notes.text': text, 'dashboard-notes.at': at });
      const synced = await pushSync(text, at).catch(() => false);
      if (stopped) return;
      if (!synced) showFoot('Saved on this computer only (too long to sync)', { ms: 4000 });
      else showFoot('Saved', { ms: 1500 });
    })();
    try {
      await saving;
    } catch {
      dirty = true;
      if (!stopped) showFoot("Couldn't save", { error: true, retry: true });
    } finally {
      saving = null;
    }
  }

  ta.addEventListener('input', () => {
    dirty = true;
    autosize();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void save(), SAVE_MS);
  });
  ta.addEventListener('blur', () => {
    if (dirty) void save();
  });
  toggle.addEventListener('click', () => {
    s = { ...s, collapsed: !s.collapsed };
    renderCollapsed();
    void ctx.set({ 'dashboard-notes.collapsed': s.collapsed });
    if (!s.collapsed) requestAnimationFrame(autosize);
  });
  // Don't lose the last keystrokes when the tab goes away.
  const flush = () => {
    if (dirty) void save();
  };
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', flush);

  const offMount = mountInSidePanel(ctx.dom, host, 20, { onMount: autosize });

  // Another device may have newer notes.
  const adopt = (text: string) => {
    if (dirty || text === ta.value) return;
    const focused = root.activeElement === ta;
    const [a, b] = [ta.selectionStart, ta.selectionEnd];
    ta.value = text;
    if (focused) ta.setSelectionRange(Math.min(a, text.length), Math.min(b, text.length));
    autosize();
    renderCollapsed();
  };
  void pullSync().then(r => {
    if (!r || stopped || r.at <= s.at) return;
    adopt(r.text);
    void ctx.set({ 'dashboard-notes.text': r.text, 'dashboard-notes.at': r.at });
  });
  const onSync = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'sync' || !changes[META]) return;
    void pullSync().then(r => {
      if (r && !stopped && r.at > s.at) {
        adopt(r.text);
        void ctx.set({ 'dashboard-notes.text': r.text, 'dashboard-notes.at': r.at });
      }
    });
  };
  chrome.storage.onChanged.addListener(onSync);

  return {
    update(next) {
      s = next;
      adopt(s.text); // another tab, or the settings page
      renderCollapsed();
    },
    stop() {
      flush();
      stopped = true;
      if (timer) clearTimeout(timer);
      if (footTimer) clearTimeout(footTimer);
      offMount();
      host.remove();
      removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
      try {
        chrome.storage.onChanged.removeListener(onSync);
      } catch {
        /* orphaned */
      }
    },
  };
}
