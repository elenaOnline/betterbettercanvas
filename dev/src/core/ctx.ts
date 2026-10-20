import { createApi, type Api } from './canvas/api.ts';
import { createData, type Data } from './canvas/data.ts';
import { detectPage, type Page } from './canvas/page.ts';
import { createDom, type Dom } from './dom.ts';
import { createCommands, type Commands } from './commands.ts';
import type { Store, Flat } from './settings/store.ts';

/** The subset of Canvas's window.ENV that env-main.js copies across worlds. */
export interface CanvasEnv {
  current_user_id: string | null;
  current_user?: { id: string; display_name?: string; avatar_image_url?: string };
  TIMEZONE?: string;
  LOCALE?: string;
  context_asset_string?: string;
  DOMAIN_ROOT_ACCOUNT_ID?: string;
  /** Grades page only; null when the course uses no letter scheme. Validate before use. */
  course_active_grading_scheme?: unknown;
}

export const ENV_ATTR = 'data-b2c-env';

/** Everything a feature gets. */
export interface Ctx {
  page: Page;
  dom: Dom;
  api: Api;
  /** Shared, cached Canvas data (courses, planner, colours, …). */
  data: Data;
  /** ⌘K commands and result sources (one registry per page, shared by all features). */
  commands: Commands;
  /** Canvas ENV (read from the page world). Resolves null if unavailable. */
  env(): Promise<CanvasEnv | null>;
  /** Write settings (e.g. a feature persisting its own notes). */
  set(values: Flat): Promise<void>;
  /** Current time; tests can pin it with the `b2c_now` localStorage key. */
  now(): Date;
}

function readEnvAttr(): CanvasEnv | null {
  const raw = document.documentElement.getAttribute(ENV_ATTR);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CanvasEnv;
  } catch {
    return null;
  }
}

export function createCtx(store: Store): Ctx {
  const dom = createDom();
  let envP: Promise<CanvasEnv | null> | null = null;

  const env = () =>
    (envP ??= new Promise(resolve => {
      const now = readEnvAttr();
      if (now) return resolve(now);
      const mo = new MutationObserver(() => {
        const e = readEnvAttr();
        if (e) {
          mo.disconnect();
          resolve(e);
        }
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: [ENV_ATTR] });
      // ENV is set in <head>; if it never shows, we're not on a Canvas page.
      const give = () => {
        mo.disconnect();
        resolve(readEnvAttr());
      };
      if (document.readyState === 'complete') setTimeout(give, 500);
      else addEventListener('load', () => setTimeout(give, 500), { once: true });
    }));

  const pinned = (() => {
    try {
      return localStorage.getItem('b2c_now');
    } catch {
      return null;
    }
  })();
  const offset = pinned ? Date.parse(pinned) - Date.now() : 0;
  const now = () => new Date(Date.now() + (Number.isFinite(offset) ? offset : 0));

  const api = createApi({ userId: async () => (await env())?.current_user_id ?? null, now: () => now().getTime() });
  return {
    page: detectPage(location.pathname),
    dom,
    api,
    data: createData(api),
    commands: createCommands(),
    env,
    set: v => store.set(v),
    now,
  };
}
