// Agent contract, the part that lives in main.js (agentkit/CONTRACT.md §1–§3).
// Kept tiny on purpose: a normal page load costs one pre-paint attribute
// (agentMirror) and one event listener. Everything else is in the lazily
// imported chunk (run.ts → chunks/agent.js), loaded on the first describe.

import type { Ctx } from '../ctx.ts';
import type { MirrorPart } from '../feature.ts';
import type { Flat } from '../settings/store.ts';
import type { Agent } from './run.ts';

export const AGENT_ATTR = 'data-b2c-agent';
export const AGENT_SETTING = 'core.agentContract';
export const DESCRIBE = 'b2c:describe';
const CHUNK = 'chunks/agent.js';

/** §1: `data-b2c-agent="1"` pre-paint while the contract is on (quiz routes use the quiz subset, which never has it). */
export const agentMirror = (all: Flat): MirrorPart => (all[AGENT_SETTING] === true ? { attrs: { [AGENT_ATTR]: '1' } } : {});

export function createAgentHook(ctx: Ctx) {
  let on = false;
  let settings: Flat = {};
  let agent: Promise<Agent> | null = null;

  const load = () =>
    (agent ??= import(/* @vite-ignore */ chrome.runtime.getURL(CHUNK)).then((m: typeof import('./run.ts')) => m.createAgent(ctx)));

  const onDescribe = (e: Event) => {
    const detail = (e as CustomEvent<unknown>).detail;
    if (typeof detail !== 'string') return;
    void load()
      .then(a => (on ? a.handle(detail, settings) : undefined))
      .catch(err => console.error('[b2c] agent describe failed', err));
  };

  return {
    /** Arm or disarm for the current settings (called on every settings change). */
    sync(all: Flat) {
      settings = all;
      const want = all['core.paused'] !== true && all[AGENT_SETTING] === true && ctx.page.kind !== 'quiz-taking';
      if (want === on) return;
      on = want;
      if (want) document.addEventListener(DESCRIBE, onDescribe);
      else {
        document.removeEventListener(DESCRIBE, onDescribe);
        void agent?.then(a => a.stop()).catch(() => {});
      }
    },
    stop() {
      on = false;
      document.removeEventListener(DESCRIBE, onDescribe);
      void agent?.then(a => a.stop()).catch(() => {});
    },
  };
}
