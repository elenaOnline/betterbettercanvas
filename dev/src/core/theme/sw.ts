// Test-build service-worker hook for the Agent kit's `b2c render`: Import →
// Apply a theme file or code in one message, through the real store, so open
// Canvas tabs restyle live. The Dev lead wires it into the SW for test builds
// only:
//
//   chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
//     if (TEST_BUILD && msg?.type === APPLY_FILE_MSG) { void applyFileMessage(store, msg).then(reply); return true; }
//   });
//
// Message: { type: 'b2c:themes:apply-file', text, css?, courseColors?, flavor?, accent? }
//   text  anything the Studio's Import accepts (share code, file contents, …)
//   css   apply the theme's (sanitised) CSS too; default false, like "Apply without CSS"
// Reply:  { ok, kind, name, errors, notes, unknown, cssRemoved, values, planNotes }
//         `values` are the keys written. Undo isn't offered here: a render run
//         starts from a clean profile.

import type { Store } from '../settings/store.ts';
import { apply, importText } from './index.ts';

export const APPLY_FILE_MSG = 'b2c:themes:apply-file';

export interface ApplyFileMessage {
  type: typeof APPLY_FILE_MSG;
  text: string;
  css?: boolean;
  courseColors?: boolean;
  flavor?: string;
  accent?: string;
}

export async function applyFileMessage(store: Store, msg: ApplyFileMessage) {
  const r = await importText(String(msg.text ?? ''), { flavor: msg.flavor, accent: msg.accent });
  const base = { kind: r.kind, name: r.theme?.name ?? null, errors: r.errors, notes: r.notes, unknown: r.unknown, cssRemoved: r.cssRemoved };
  if (!r.theme) return { ok: false, ...base, values: {}, planNotes: [] };
  try {
    const a = await apply(store, r.theme, { css: !!msg.css, courseColors: msg.courseColors });
    return { ok: true, ...base, values: a.plan.values, planNotes: a.plan.notes };
  } catch (e) {
    return { ok: false, ...base, errors: [...r.errors, (e as Error).message], values: {}, planNotes: [] };
  }
}
