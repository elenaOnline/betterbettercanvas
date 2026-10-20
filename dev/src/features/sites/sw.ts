import { BUILT_IN_MATCHES, canvasOrigin, isBuiltIn, SCRIPT_IDS, SITE_KEY, siteScripts } from './model.ts';

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
}

async function savedSites(): Promise<string[]> {
  const raw = (await chrome.storage.local.get(SITE_KEY))[SITE_KEY];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.flatMap(v => {
    try { const o = canvasOrigin(typeof v === 'string' ? v : ''); return isBuiltIn(o) ? [] : [o]; }
    catch { return []; }
  }))];
}

async function permitted(origins: string[]): Promise<string[]> {
  const allowed = await Promise.all(origins.map(o => chrome.permissions.contains({ origins: [`${o}/*`] })));
  return origins.filter((_, i) => allowed[i]);
}

async function register(origins: string[]) {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: SCRIPT_IDS });
  const scripts = siteScripts(origins);
  if (!scripts.length) {
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map(s => s.id) });
    return;
  }
  const ids = new Set(existing.map(s => s.id));
  const update = scripts.filter(s => ids.has(s.id));
  const add = scripts.filter(s => !ids.has(s.id));
  if (update.length) await chrome.scripting.updateContentScripts(update);
  if (add.length) await chrome.scripting.registerContentScripts(add);
}

/** Include these in the SW's update/reload re-injection query. */
export async function registeredCanvasMatches(): Promise<string[]> {
  return [...BUILT_IN_MATCHES, ...(await permitted(await savedSites())).map(o => o + '/*')];
}

export async function reconcileSites(): Promise<string[]> {
  const origins = await permitted(await savedSites());
  await register(origins);
  await chrome.storage.local.set({ [SITE_KEY]: origins });
  return origins;
}

async function activateSite(origin: string) {
  const tabs = await chrome.tabs.query({ url: [origin + '/*'] });
  for (const tab of tabs) {
    if (tab.id === undefined || tab.discarded) continue;
    try {
      const target = { tabId: tab.id };
      await chrome.scripting.insertCSS({ target, files: ['content.css'] });
      await chrome.scripting.executeScript({ target, files: ['env-main.js'], world: 'MAIN' });
      await chrome.scripting.executeScript({ target, files: ['boot.js', 'main.js'] });
    } catch { /* Navigating tabs get the persistent declaration on load. */ }
  }
}

async function teardownSite(origin: string) {
  const tabs = await chrome.tabs.query({ url: [origin + '/*'] });
  for (const tab of tabs) {
    if (tab.id === undefined || tab.discarded) continue;
    // Best effort for navigated/error tabs. Core's teardown stops feature DOM,
    // subscriptions and timers; remove the pre-paint state as well.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
        document.dispatchEvent(new CustomEvent('b2c:teardown'));
        localStorage.removeItem('b2c:mirror');
        const root = document.documentElement;
        for (const attr of [...root.attributes]) if (attr.name.startsWith('data-b2c-')) root.removeAttribute(attr.name);
        for (const name of [...root.style]) if (name.startsWith('--b2c-')) root.style.removeProperty(name);
      } });
      await chrome.scripting.removeCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    } catch { /* Navigation has already removed the old document. */ }
  }
}

export async function changeSite(action: 'add' | 'remove', input: string): Promise<string[]> {
  const origin = canvasOrigin(input);
  if (isBuiltIn(origin)) throw new Error('Instructure-hosted Canvas (*.instructure.com) is included by default.');
  const before = await permitted(await savedSites());
  if (action === 'add' && !await chrome.permissions.contains({ origins: [origin + '/*'] })) {
    throw new Error('Site permission was not granted.');
  }
  const after = action === 'add' ? [...new Set([...before, origin])] : before.filter(o => o !== origin);
  try {
    await register(after);
    if (action === 'remove') {
      await teardownSite(origin);
      await chrome.permissions.remove({ origins: [origin + '/*'] });
      if (await chrome.permissions.contains({ origins: [origin + '/*'] })) throw new Error('The browser could not remove site access.');
    }
    await chrome.storage.local.set({ [SITE_KEY]: after });
    if (action === 'add') await activateSite(origin);
    return after;
  } catch (error) {
    await register(await permitted(before));
    if (action === 'add' && !before.includes(origin)) await chrome.permissions.remove({ origins: [origin + '/*'] });
    throw error;
  }
}

const OFFER_KEY = 'b2c:sites:offer';

/**
 * The popup's "Turn on b²c for <origin>": on macOS the action popup can close
 * while Chrome's permission prompt is up, so code after `await request()` may
 * never run. The popup first records the offer here; when the grant arrives
 * (permissions.onAdded) the SW finishes the job: add the site, reload the tab.
 */
async function finishOffer(granted: chrome.permissions.Permissions) {
  const offer = (await chrome.storage.session.get(OFFER_KEY))[OFFER_KEY] as { origin: string; tabId: number; at: number } | undefined;
  if (!offer || Date.now() - offer.at > 5 * 60_000) return;
  if (!granted.origins?.some(o => o === offer.origin + '/*')) return;
  await chrome.storage.session.remove(OFFER_KEY);
  await serial(() => changeSite('add', offer.origin)).catch(() => {}); // "already included" is fine
  await chrome.tabs.reload(offer.tabId).catch(() => {});
}

/** Called once, at SW module scope. Request permission in the UI click handler. */
export function installSites(onError: (error: unknown) => void = () => {}): () => void {
  const offerListener = (msg: { type?: string; origin?: string; tabId?: number }, sender: chrome.runtime.MessageSender) => {
    if (msg?.type !== 'b2c:sites:offer' || sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
    try {
      const origin = canvasOrigin(msg.origin ?? '');
      if (typeof msg.tabId === 'number') void chrome.storage.session.set({ [OFFER_KEY]: { origin, tabId: msg.tabId, at: Date.now() } });
    } catch (e) {
      onError(e);
    }
    return false;
  };
  const onAdded = (p: chrome.permissions.Permissions) => void finishOffer(p).catch(onError);
  chrome.runtime.onMessage.addListener(offerListener);
  chrome.permissions.onAdded.addListener(onAdded);

  const listener = (msg: { type?: string; origin?: string }, sender: chrome.runtime.MessageSender, reply: (r: unknown) => void) => {
    if (!msg?.type?.startsWith('b2c:sites:')) return false;
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
    const action = msg.type.slice('b2c:sites:'.length);
    if (!['list', 'add', 'remove'].includes(action)) return false;
    void serial(() => action === 'list' ? reconcileSites() : changeSite(action as 'add' | 'remove', msg.origin ?? ''))
      .then(origins => reply({ origins }), error => {
        onError(error);
        reply({ error: 'Could not update Canvas sites. Check site access and try again.' });
      });
    return true;
  };
  const reconcile = () => { void serial(reconcileSites).catch(onError); };
  chrome.runtime.onMessage.addListener(listener);
  chrome.permissions.onRemoved.addListener(reconcile);
  reconcile();
  return () => {
    chrome.runtime.onMessage.removeListener(listener);
    chrome.runtime.onMessage.removeListener(offerListener);
    chrome.permissions.onAdded.removeListener(onAdded);
    chrome.permissions.onRemoved.removeListener(reconcile);
  };
}
