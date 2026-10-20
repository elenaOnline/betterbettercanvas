// All features plus global settings → one flat schema.
import { features } from '../features/index.gen.ts';
import type { AnyFeature } from './feature.ts';
import { settingKey } from './feature.ts';
import { bool, oneOf, type Setting } from './settings/schema.ts';
import { sharedSettings } from './settings/shared.ts';

/** Settings that belong to no single feature. */
export const globalSettings = {
  /** Master switch: plain Canvas, for side-by-side comparison. */
  'core.paused': bool(false),
  /** Release builds reload themselves when a new build is shipped. */
  'core.autoUpdate': bool(false),
  /** quiz-safe-mode: on quiz-taking pages apply only colours, or nothing. */
  // Default "nothing" (Design, Research): a district banned bc over broken
  // quizzes, so the safe default wins; "colours" keeps dark mode on quizzes.
  'core.quizSafe': oneOf(['colours', 'nothing'], 'nothing'),
  /** Agent contract (agentkit/CONTRACT.md §1–§3): data-b2c-agent, describe, anchors. Settings › Advanced. */
  'core.agentContract': bool(true),
  ...sharedSettings,
} satisfies Record<string, Setting>;

/** Feature ids that would collide with reserved `data-b2c-*` attributes. */
const RESERVED_IDS = new Set(['agent', 'id', 'course-id', 'due', 'state', 'marks-read', 'action', 'region', 'instance', 'env', 'sheet', 'side', 'theme', 'scheme', 'slot', 'dark']);

export const allFeatures: readonly AnyFeature[] = features;

export function buildSchema(fs: readonly AnyFeature[] = allFeatures): Record<string, Setting> {
  const schema: Record<string, Setting> = { ...globalSettings };
  const ids = new Set<string>();
  for (const f of fs) {
    if (!/^[a-z][a-z0-9-]*$/.test(f.id)) throw new Error(`bad feature id "${f.id}"`);
    if (ids.has(f.id)) throw new Error(`duplicate feature id "${f.id}"`);
    // data-b2c-<id> gates must never collide with the agent contract's element
    // attributes (agentkit/CONTRACT.md) or core's infrastructure attributes.
    if (RESERVED_IDS.has(f.id)) throw new Error(`feature id "${f.id}" is reserved`);
    ids.add(f.id);
    for (const [k, s] of Object.entries(f.settings)) {
      if (s.kind === 'shared') {
        if (!(s.key in globalSettings)) throw new Error(`${f.id}.${k} refers to unknown shared setting ${s.key}`);
        continue;
      }
      schema[settingKey(f.id, k)] = s;
    }
  }
  return schema;
}

export const schema = buildSchema();
