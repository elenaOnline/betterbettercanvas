// Service worker: re-injection after updates, and release auto-reload.
import { installDiagnostics } from '../features/diagnostics/sw.ts';
import { installFirstRun } from '../features/first-run/sw.ts';
import { installSites, registeredCanvasMatches } from '../features/sites/sw.ts';
import { OPEN_SETTINGS } from '../core/settings-link.ts';
import { runMigrations } from '../core/settings/migrate.ts';

// Feature ids come from the build (not the registry): the SW must stay tiny
// and never bundle feature code.
const diagnostics = installDiagnostics(__B2C_FEATURE_IDS__);
const record = (feature: string) => (error: unknown) => void diagnostics.record(feature, error).catch(() => {});
installSites(record('sites'));
installFirstRun(record('first-run'));

const CONTENT_JS = ['boot.js', 'main.js'];

/** After an update or reload, open Canvas tabs hold an orphaned instance.
 *  Inject the new one; main.js tells the old one to tear itself down. */
async function reinject() {
  const tabs = await chrome.tabs.query({ url: await registeredCanvasMatches() });
  await Promise.all(
    tabs.map(async t => {
      if (t.id === undefined || t.discarded) return;
      // A live instance of *this* runtime answers; orphans can't. Never inject
      // a second copy next to a live one (e.g. a tab that loaded during install).
      const alive = await chrome.tabs.sendMessage(t.id, { type: 'b2c:ping' }).catch(() => null);
      if (alive) return;
      const target = { tabId: t.id };
      try {
        await chrome.scripting.insertCSS({ target, files: ['content.css'] });
        await chrome.scripting.executeScript({ target, files: ['env-main.js'], world: 'MAIN' });
        await chrome.scripting.executeScript({ target, files: CONTENT_JS });
      } catch {
        /* tab not scriptable (error page, still loading); it'll load fresh */
      }
    }),
  );
}

// Test hook (dev/test builds only, never release): re-run migrations as an
// update would. Headless Chromium can't re-fire onInstalled or survive
// runtime.reload for a CLI-loaded extension.
if (!__B2C_RELEASE__) {
  (globalThis as { __b2cMigrate?: () => Promise<string[]> }).__b2cMigrate = async () => {
    await chrome.storage.local.remove('b2c:migrations');
    const done = await runMigrations();
    await reinject();
    return done;
  };
}

chrome.runtime.onInstalled.addListener(d => {
  if (d.reason !== 'update' && d.reason !== 'install') return;
  // Migrate stored settings first, so re-injected tabs read the new keys.
  void runMigrations()
    .catch(record('core'))
    .finally(() => void reinject());
});

// Release builds: the owner's Helium loads release/b2c unpacked. When `npm run
// ship` swaps in a new build, build-id.txt on disk changes. We then badge the
// toolbar icon and the popup offers "Reload b²c". Silent self-reload is the
// `core.autoUpdate` setting, off until confirmed on her real install (headless
// Chromium unloads CLI-loaded extensions on runtime.reload, so it can't be
// proven in e2e).
const ALARM = 'b2c:release-check';
export const UPDATE_KEY = 'b2c:update-ready';

async function checkRelease(): Promise<string | null> {
  try {
    const res = await fetch(chrome.runtime.getURL('build-id.txt'), { cache: 'no-store' });
    const id = (await res.text()).trim();
    if (!id || id === __B2C_BUILD_ID__) return null;
    const { 'core.autoUpdate': auto } = await chrome.storage.sync.get('core.autoUpdate');
    if (auto === true) chrome.runtime.reload();
    await chrome.storage.session.set({ [UPDATE_KEY]: id });
    await chrome.action.setBadgeText({ text: '↑' });
    await chrome.action.setBadgeBackgroundColor({ color: '#2b4c7e' });
    return id;
  } catch (e) {
    record('core')(e);
    return null; /* mid-swap; next tick */
  }
}

if (__B2C_RELEASE__) {
  void chrome.alarms.get(ALARM).then(a => {
    if (!a) void chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  });
  chrome.alarms.onAlarm.addListener(a => {
    if (a.name === ALARM) void checkRelease();
  });
}

chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, reply) => {
  if (msg?.type === 'b2c:check-update') {
    void checkRelease().then(reply);
    return true;
  }
  if (msg?.type === 'b2c:reload') chrome.runtime.reload();
  return false;
});

// ── Deep links into settings (options.html#<feature-id>) ─────────────────────
async function openSettingsAt(target: string) {
  const hash = /^[a-z0-9-]+$/.test(target) ? `#${target}` : '';
  const base = chrome.runtime.getURL('options.html');
  const [tab] = await chrome.tabs.query({ url: `${base}*` });
  if (tab?.id !== undefined) {
    await chrome.tabs.update(tab.id, { url: base + hash, active: true });
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  } else {
    await chrome.tabs.create({ url: base + hash });
  }
}
chrome.runtime.onMessage.addListener((msg: { type?: string; target?: string }) => {
  if (msg?.type === OPEN_SETTINGS) void openSettingsAt(String(msg.target ?? '')).catch(record('core'));
  return false;
});

// ── Toolbar state (first-run.md, sites.md "Not allowed") ─────────────────────
// A Canvas tab b²c can't reach yet shows a grey icon with a dot. Detection is
// declarative (no host access, no browsing data): Chrome matches Canvas's own
// app shell. Tabs where b²c does run report in and get the normal icon back.
const CANVAS_SHELL = ['#application.ic-app', '.ic-app-header'];

async function installToolbarRules() {
  if (!chrome.declarativeContent) return;
  const icon = async (size: number) => {
    const res = await fetch(chrome.runtime.getURL(`icons/off-${size}.png`));
    const bmp = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(size, size);
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    return g.getImageData(0, 0, size, size);
  };
  const imageData = { 16: await icon(16), 32: await icon(32) } as unknown as ImageData;
  await new Promise<void>(r => chrome.declarativeContent.onPageChanged.removeRules(undefined, () => r()));
  chrome.declarativeContent.onPageChanged.addRules([
    {
      conditions: CANVAS_SHELL.map(sel => new chrome.declarativeContent.PageStateMatcher({ pageUrl: { schemes: ['https'] }, css: [sel] })),
      actions: [new chrome.declarativeContent.SetIcon({ imageData })],
    },
  ]);
}
chrome.runtime.onInstalled.addListener(() => void installToolbarRules().catch(record('core')));

chrome.runtime.onMessage.addListener((msg: { type?: string }, sender) => {
  if (msg?.type === 'b2c:running' && sender.tab?.id !== undefined) {
    void chrome.action.setIcon({ tabId: sender.tab.id, path: { 16: 'icons/16.png', 32: 'icons/32.png' } }).catch(() => {});
  }
  return false;
});

// Agent kit `b2c render` (agentkit/): apply a theme file exactly as Import →
// Apply would. Test builds only (B2C_TEST_FEATURES); never in a release.
if (__B2C_TEST__) {
  // Dynamic import inside a build-time-false branch: release builds drop it.
  chrome.runtime.onMessage.addListener((m: { type?: string }, _s, reply) => {
    if (m?.type !== 'b2c:themes:apply-file') return false;
    void Promise.all([import('../core/theme/sw.ts'), import('../core/settings/store.ts')])
      .then(async ([{ applyFileMessage }, { createStore }]) => {
        const schema = (await (await fetch(chrome.runtime.getURL('schema.json'))).json()).settings;
        return applyFileMessage(createStore(schema), m as never);
      })
      .then(reply, e => reply({ ok: false, errors: [String(e)] }));
    return true;
  });
}
