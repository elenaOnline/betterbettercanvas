// The popup: a remote control for *this page* (design/spec/settings.md
// §Popup). Dark mode and its style, "Show original on this page", up to 4
// "On this page" switches for the page kind, the pause switch, the update
// offer, what b²c is doing on this tab, and "All settings…" opening at this
// page's section. It never scrolls.
//
// The active tab is one of:
//   canvas  b²c runs there (its content script answers b2c:health)
//   offer   b²c isn't running, but the page is Canvas: offer to turn it on
//   other   not Canvas, or the browser won't let b²c look
// `?tab=<id>` targets a specific tab (tests and review).
import { render } from 'preact';
import { signal } from '@preact/signals';
import type { ProbeReport } from '../../core/probe.ts';
import { StyleChips } from '../shared/chips.tsx';
import { Segmented, Switch, TimeRange } from '../shared/controls.tsx';
import { POPUP_ON_PAGE, THEME_ROWS } from '../shared/layout.ts';
import { darkInEffect, darkMode, darkPatch, rowOptions, rowPresent, sectionForPage, type DarkMode } from '../shared/model.ts';
import { apply, builtSchema, initSettings, loaded, schema, values } from '../shared/state.ts';

type TabState =
  | { kind: 'loading' }
  | { kind: 'canvas'; tabId: number; host: string; health: ProbeReport }
  | { kind: 'offer'; tabId: number; origin: string; host: string }
  | { kind: 'other'; host: string };

const tab = signal<TabState>({ kind: 'loading' });
const original = signal<{ original: boolean; dark: boolean; nativeDark?: boolean } | null>(null);
const update = signal<string | null>(null);
const offer = signal<'idle' | 'working' | 'done' | 'denied' | 'failed'>('idle');
const copied = signal(false);
/** The one-time line on the first open ("never again"). */
const firstNote = signal(false);
const NOTE_KEY = 'b2c:popup-note-seen';

async function loadNote() {
  try {
    if ((await chrome.storage.local.get(NOTE_KEY))[NOTE_KEY] !== true) firstNote.value = true;
  } catch { /* storage unavailable: skip the note */ }
}

const EXT_NAMES: Record<string, string> = { bettercampus: 'BetterCampus', bettercanvas: 'Better Canvas' };

function openSettings() {
  const t = tab.value;
  const target = sectionForPage(t.kind === 'canvas' ? t.health.page : null);
  void chrome.runtime.sendMessage({ type: 'b2c:open-settings', target }).catch(() => chrome.runtime.openOptionsPage());
  window.close();
}

const row = (id: string) => THEME_ROWS.find(r => r.id === id)!;
const DARK = row('dark-mode'), STYLE = row('dark-style');

async function loadUpdate() {
  const fresh = (await chrome.runtime.sendMessage({ type: 'b2c:check-update' }).catch(() => null)) as string | null;
  const r = await chrome.storage.session.get('b2c:update-ready').catch(() => ({} as Record<string, unknown>));
  update.value = fresh ?? (r['b2c:update-ready'] as string | undefined) ?? null;
}

/** Runs in the page (MAIN world) via activeTab: is this Canvas? */
function detectCanvas(): { canvas: boolean; origin: string } {
  const env = (window as unknown as { ENV?: Record<string, unknown> }).ENV;
  const byEnv = !!env && typeof env === 'object' && ('DOMAIN_ROOT_ACCOUNT_ID' in env || 'current_user_id' in env || 'ACCOUNT_ID' in env);
  const byDom = !!document.querySelector('.ic-app, #application.ic-app, .ic-app-header, link[href*="instructure"]');
  return { canvas: byEnv || byDom, origin: location.origin };
}

async function loadTab() {
  const param = new URLSearchParams(location.search).get('tab');
  const t = param ? await chrome.tabs.get(Number(param)).catch(() => undefined) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const host = (() => { try { return t?.url ? new URL(t.url).host : ''; } catch { return ''; } })();
  if (t?.id === undefined) return void (tab.value = { kind: 'other', host });
  const health = (await chrome.tabs.sendMessage(t.id, { type: 'b2c:health' }).catch(() => null)) as ProbeReport | null;
  if (health) {
    tab.value = { kind: 'canvas', tabId: t.id, host, health };
    // The first-open line shows once, on the first Canvas tab it can show on.
    void chrome.storage.local.set({ [NOTE_KEY]: true }).catch(() => {});
    original.value = (await chrome.tabs.sendMessage(t.id, { type: 'b2c:dark:original', op: 'query' }).catch(() => null)) ?? null;
    return;
  }
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: t.id }, world: 'MAIN', func: detectCanvas });
    const res = r?.result as { canvas: boolean; origin: string } | undefined;
    if (res?.canvas && res.origin.startsWith('https://')) return void (tab.value = { kind: 'offer', tabId: t.id, origin: res.origin, host: new URL(res.origin).host });
  } catch { /* No access: chrome:// pages, the store, or no activeTab grant. */ }
  tab.value = { kind: 'other', host };
}

function turnOn(t: Extract<TabState, { kind: 'offer' }>) {
  offer.value = 'working';
  // The SW finishes the job if the permission prompt closes this popup.
  void chrome.runtime.sendMessage({ type: 'b2c:sites:offer', origin: t.origin, tabId: t.tabId }).catch(() => {});
  // Called in the click's own task: Chrome requires the user gesture.
  void chrome.permissions.request({ origins: [`${t.origin}/*`] }).then(async granted => {
    if (!granted) return void (offer.value = 'denied');
    const r = (await chrome.runtime.sendMessage({ type: 'b2c:sites:add', origin: t.origin }).catch(() => null)) as { error?: string } | null;
    if (!r || r.error) return void (offer.value = 'failed');
    await chrome.tabs.reload(t.tabId).catch(() => {});
    offer.value = 'done';
  }, () => (offer.value = 'failed'));
}

async function setOriginal(on: boolean) {
  const t = tab.value;
  if (t.kind !== 'canvas') return;
  original.value = original.value ? { ...original.value, original: on } : null;
  const r = await chrome.tabs.sendMessage(t.tabId, { type: 'b2c:dark:original', op: on ? 'on' : 'off' }).catch(() => null);
  if (r) original.value = r;
}

function SwitchRow({ id, label, desc, checked, disabled, onChange }: { id: string; label: string; desc?: string; checked: boolean; disabled?: boolean; onChange(v: boolean): void }) {
  return (
    <div class={'row switch-row' + (disabled ? ' is-disabled' : '')} data-row={id}
      onClick={e => { if (!disabled && !(e.target as HTMLElement).closest('button')) onChange(!checked); }}>
      <span class="row-text"><span class="row-label" id={`l-${id}`}>{label}</span>{desc && <span class="row-desc" id={`d-${id}`}>{desc}</span>}</span>
      <Switch checked={checked} disabled={disabled} labelledBy={`l-${id}`} describedBy={desc ? `d-${id}` : undefined} onChange={onChange} />
    </div>
  );
}

const PAGE_NAMES: Record<string, string> = {
  dashboard: 'Dashboard', 'course-home': 'Course home', 'course-grades': 'Grades', assignment: 'Assignment', assignments: 'Assignments',
  calendar: 'Calendar', inbox: 'Inbox', modules: 'Modules', 'course-other': 'Course page', other: 'Canvas page',
};

function Status() {
  const t = tab.value;
  if (t.kind === 'loading') return <p class="status-line" aria-hidden="true">&nbsp;</p>;
  if (t.kind === 'other') return <p class="status-line">b²c runs on Canvas pages only.</p>;
  if (t.kind === 'offer') return null;
  const h = t.health;
  const missing = Object.entries(h.featureAnchors)
    .filter(([f]) => h.running.includes(f))
    .flatMap(([f, a]) => Object.entries(a).filter(([, ok]) => !ok).map(([n]) => `${f}: ${n}`));
  const others = (h as ProbeReport & { otherExtensions?: string[] }).otherExtensions ?? [];
  const page = (PAGE_NAMES[h.page] ?? h.page) + (h.dashboard !== 'n/a' ? ` (${h.dashboard})` : '');
  return <>
    <p class="status-line">
      <span>{page} · {h.running.length ? `${h.running.length} feature${h.running.length === 1 ? '' : 's'} running` : 'nothing running'}</span>
      <button class="btn quiet" type="button" title={h.running.join(', ')} onClick={() => {
        void navigator.clipboard.writeText(JSON.stringify(h, null, 2)).then(() => { copied.value = true; setTimeout(() => (copied.value = false), 1500); });
      }}>{copied.value ? 'Copied' : 'Copy report'}</button>
    </p>
    {others.length > 0 && <p class="status-line other-ext">
      <span>{others.map(o => EXT_NAMES[o] ?? o).join(' and ')} {others.length === 1 ? 'is' : 'are'} also changing this page. Turn {others.length === 1 ? 'it' : 'them'} off to see b²c on its own.</span>
      <button class="btn quiet" type="button" onClick={() => void chrome.tabs.create({ url: 'chrome://extensions' })}>Extensions</button>
    </p>}
    {missing.length > 0 && <p class="status-line warn" title={missing.join('\n')}>
      {missing.length} page part{missing.length === 1 ? '' : 's'} not found. The report lists {missing.length === 1 ? 'it' : 'them'}
    </p>}
  </>;
}

/** sites.md "Not allowed": one card, the browser's own prompt behind it. */
function Allow({ t }: { t: Extract<TabState, { kind: 'offer' }> }) {
  const s = offer.value;
  return (
    <section class="group allow" aria-labelledby="allow-title">
      <div class="pad stack">
        <p id="allow-title" class="label">Allow b²c on {t.host}</p>
        <p class="row-desc">Your settings are safe; b²c just can’t reach this site yet.</p>
        <button class="btn primary" type="button" disabled={s === 'working' || s === 'done'} onClick={() => turnOn(t)}>
          {s === 'done' ? `b²c is on for ${t.host}` : 'Allow'}
        </button>
        {s === 'denied' && <p class="row-desc" role="status">Permission not granted · Try again</p>}
        {s === 'failed' && <p class="row-desc warn" role="status">Couldn’t turn b²c on here. Try again from Settings › Sites.</p>}
        {s === 'idle' && <p class="row-desc">Other sites stay untouched. You can remove it later in Settings › Sites.</p>}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer class="ft">
      <Status />
      <button class="link-row" type="button" onClick={openSettings}>
        <span>All settings…</span><kbd aria-hidden="true">⌘,</kbd>
      </button>
    </footer>
  );
}

function Popup() {
  if (!loaded.value) return null;
  const v = values.value;
  const t = tab.value;
  const paused = !!v['core.paused'];
  const header = (
    <header class="hd">
      <span class="brand">b²c</span>
      <span class="host">{t.kind === 'loading' ? '' : t.kind === 'other' ? 'Not a Canvas page' : t.host}</span>
      {schema['core.paused'] && t.kind !== 'offer' && <span class="pause">
        <span class="pause-label" aria-hidden="true">{paused ? 'Paused' : 'Pause'}</span>
        <Switch checked={paused} label="Pause b²c on all sites" onChange={x => void apply({ 'core.paused': x })} />
      </span>}
    </header>
  );
  if (t.kind === 'offer') return <main class="popup">{header}<Allow t={t} /><Footer /></main>;

  const offCanvas = t.kind !== 'canvas';
  const mode = darkMode(v, schema);
  const darkNow = original.value ? original.value.dark : darkInEffect(mode, v, new Date(), matchMedia('(prefers-color-scheme: dark)').matches);
  const onPage = t.kind === 'canvas' ? (POPUP_ON_PAGE[t.health.page] ?? []).filter(r => rowPresent(r, schema)).slice(0, 4) : [];
  return (
    <main class={'popup' + (paused ? ' is-paused' : '')}>
      {header}
      {firstNote.value && t.kind === 'canvas' && <p class="note">Everything here applies instantly. All settings… has the rest.</p>}
      {paused && <p class="note">b²c is paused on all sites. <button class="btn quiet" type="button" onClick={() => void apply({ 'core.paused': false })}>Resume</button></p>}

      {update.value && (
        <section class="group update">
          <div class="pad stack">
            <p>A new build of b²c is ready ({update.value}).</p>
            <button class="btn primary" type="button" onClick={() => void chrome.runtime.sendMessage({ type: 'b2c:reload' })}>Reload b²c</button>
          </div>
        </section>
      )}

      {rowPresent(DARK, schema) && (
        <section class="group" aria-labelledby="l-dark">
          <div class="pad stack">
            <span class="label" id="l-dark">Dark mode</span>
            <Segmented labelledBy="l-dark" disabled={offCanvas} value={mode} options={rowOptions(DARK, schema) as [DarkMode, string][]} onChange={m => void apply(darkPatch(m, schema, v))} />
            {mode === 'schedule' && <div class="sched" role="group" aria-label="Schedule">
              <TimeRange idBase="sched" disabled={offCanvas} start={String(v['palette.start'])} end={String(v['palette.end'])} onChange={(k, x) => void apply({ [`palette.${k}`]: x })} />
            </div>}
            {rowPresent(STYLE, schema) && <div class="chips-wrap"><span id="l-style" class="vh">Style</span><StyleChips labelledBy="l-style" disabled={offCanvas || mode === 'off'} /></div>}
          </div>
          {t.kind === 'canvas' && original.value?.nativeDark && <p class="status-line native-dark" role="note">Canvas’s own dark mode is on for the new dashboard. Turn it off there to use a light theme on it.</p>}
          {t.kind === 'canvas' && original.value && (
            <SwitchRow id="original" label="Show original on this page" checked={original.value.original} disabled={!darkNow && !original.value.original}
              desc={darkNow || original.value.original ? 'Until this tab goes to another page' : 'Dark mode isn’t on right now'} onChange={x => void setOriginal(x)} />
          )}
        </section>
      )}

      {onPage.length > 0 && (
        <section class="group" aria-labelledby="l-onpage" id="features">
          <span class="label pad" id="l-onpage">On this page</span>
          {onPage.map(r => <SwitchRow key={r.id} id={r.id} label={r.label} checked={!!v[r.key!]} onChange={x => void apply({ [r.key!]: x })} />)}
        </section>
      )}

      <Footer />
    </main>
  );
}

document.body.classList.add('popup-page');
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); openSettings(); }
  if (e.key === 'Escape') window.close();
});
void initSettings(builtSchema());
void loadTab();
void loadUpdate();
void loadNote();
render(<Popup />, document.getElementById('app')!);
