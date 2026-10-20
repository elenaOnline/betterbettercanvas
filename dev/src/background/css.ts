// Split stylesheets (css/<id>.css, lane css-split). content.css (core) stays
// in the manifest; each feature's sheet is a registered, CSS-only content
// script, present only while the feature can apply. Canvas tabs (main.js)
// report which sheets their settings want (Mirror.need) and ask for any they
// lack to be inserted live; this keeps the registrations in step.
//
// Where: every frame of the exact school hosts b²c has run on (main.js
// reported from them), and of granted custom domains. Nothing else, so a New
// Quizzes host (quiz-lti / quiz-api), top frame or iframe, never gets a sheet,
// not even an inert one (registered scripts have no exclude_globs, so this is
// how quiz-safe holds). Cost: a school's very first load is plain Canvas until
// main.js has the sheets inserted; from then on they're pre-paint.
import { BUILT_IN_MATCHES, isBuiltInHost, isQuizHost } from '../core/hosts.ts';
import { SITE_KEY } from '../features/sites/model.ts';
import { registeredCanvasMatches } from '../features/sites/sw.ts';
import { CSS_MSG } from '../core/sheets.ts';

const KEY = 'b2c:css';
const PREFIX = 'b2c-css-';
/** Schools remembered for frame matching (most recent last). */
const MAX_ORIGINS = 8;

interface State {
  /** Sheets the settings want; null = all (fresh install or update, until a tab reports). */
  want: string[] | null;
  /** Instructure-hosted schools b²c has run on (never a quiz host). */
  origins: string[];
}

export interface CssMessage {
  type: typeof CSS_MSG;
  /** Sheets the current settings want anywhere (registrations). */
  want?: string[];
  /** Sheets to insert into the sender's frame now (main.js, or boot.js in a same-origin frame). */
  insert?: string[];
}

type Script = chrome.scripting.RegisteredContentScript;

/**
 * The registrations for `want` (in build order, so the cascade stays as it
 * was): every frame of known schools and granted custom domains (`sites`:
 * match patterns). A quiz host is never matched, whatever was stored. Pure.
 */
export function planSheets(sheets: readonly string[], want: readonly string[] | null, origins: readonly string[], sites: readonly string[]): Script[] {
  const matches = [...origins.map(o => `${o}/*`), ...sites].filter(p => !isQuizHost(p.slice(0, -2)));
  if (!matches.length) return [];
  return sheets
    .filter(id => !want || want.includes(id))
    .map(id => ({ id: PREFIX + id, matches, excludeMatches: [], css: [`css/${id}.css`], runAt: 'document_start', allFrames: true, matchOriginAsFallback: true, persistAcrossSessions: true }));
}

const shape = (s: Script) => JSON.stringify([s.matches, s.excludeMatches ?? [], s.css, !!s.allFrames, !!s.matchOriginAsFallback]);

async function load(): Promise<State> {
  const s = (await chrome.storage.local.get(KEY))[KEY] as Partial<State> | undefined;
  return { want: Array.isArray(s?.want) ? s.want : null, origins: Array.isArray(s?.origins) ? s.origins : [] };
}

export function installSheets(sheets: readonly string[], onError: (e: unknown) => void) {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = (work: () => Promise<unknown>) => (queue = queue.then(work).catch(onError));

  const reconcile = async () => {
    const s = await load();
    // Granted custom domains (features/sites keeps them), after the built-in pattern.
    const sites = (await registeredCanvasMatches()).filter(p => !(BUILT_IN_MATCHES as readonly string[]).includes(p));
    const want = planSheets(sheets, s.want, s.origins, sites);
    const have = (await chrome.scripting.getRegisteredContentScripts()).filter(x => x.id.startsWith(PREFIX));
    const byId = new Map(have.map(x => [x.id, x]));
    const drop = have.filter(x => !want.some(w => w.id === x.id)).map(x => x.id);
    const changed = want.filter(w => byId.has(w.id) && shape(w) !== shape(byId.get(w.id)!));
    const added = want.filter(w => !byId.has(w.id));
    // Add before narrowing, so a page loading meanwhile never misses a sheet
    // (at worst it gets one twice, which is harmless).
    if (added.length) await chrome.scripting.registerContentScripts(added);
    if (changed.length) await chrome.scripting.updateContentScripts(changed);
    if (drop.length) await chrome.scripting.unregisterContentScripts({ ids: drop });
  };

  // Every Canvas page load reports (main.js): store what changed, and check the
  // registrations each time, so lost ones heal by the next load.
  const report = async (origin: string, want: string[]) => {
    const s = await load();
    let dirty = false;
    if (JSON.stringify(want) !== JSON.stringify(s.want)) (s.want = want), (dirty = true);
    // Invariant: never a quiz host, even if one reports (main.js can't run
    // there: the manifest excludes it).
    if (isBuiltInHost(new URL(origin).hostname) && !isQuizHost(origin) && s.origins.at(-1) !== origin) {
      s.origins = [...s.origins.filter(o => o !== origin), origin].slice(-MAX_ORIGINS);
      dirty = true;
    }
    if (dirty) await chrome.storage.local.set({ [KEY]: s });
    await reconcile();
  };

  chrome.runtime.onMessage.addListener((msg: CssMessage, sender, reply) => {
    if (msg?.type !== CSS_MSG || sender.id !== chrome.runtime.id || sender.tab?.id === undefined) return false;
    const ids = (x: unknown) => (Array.isArray(x) ? sheets.filter(id => x.includes(id)) : []);
    // Top frames report what the settings want (and their school); the
    // registrations follow in the background. The page waits only on the insert.
    if (msg.want && sender.frameId === 0 && sender.origin) serial(() => report(sender.origin!, ids(msg.want)));
    const insert = ids(msg.insert);
    if (!insert.length) return reply(true), false;
    chrome.scripting
      .insertCSS({ target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] }, files: insert.map(id => `css/${id}.css`) })
      .then(() => reply(true), () => reply(false));
    return true;
  });

  // Update (or reinstall with schools known): every sheet on the known schools
  // at once, until a Canvas tab reports what its settings want (feature ids
  // may have changed). A fresh install knows no school: nothing until a report.
  const updated = () =>
    serial(async () => {
      await chrome.storage.local.set({ [KEY]: { ...(await load()), want: null } });
      await reconcile();
    });
  chrome.runtime.onInstalled.addListener(d => {
    if (d.reason === 'install' || d.reason === 'update') updated();
  });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && SITE_KEY in c) serial(reconcile);
  });
  chrome.permissions.onAdded.addListener(() => serial(reconcile));
  chrome.permissions.onRemoved.addListener(() => serial(reconcile));
  // Every start: registrations can be lost (cleared, or an older build's).
  serial(reconcile);
  /** Test hooks: wait for queued registration work; act as an update would. */
  return { settled: () => queue, updated: () => (updated(), queue) };
}
