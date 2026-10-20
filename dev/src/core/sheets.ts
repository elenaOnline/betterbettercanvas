// Split stylesheets, page side (lane css-split). A feature's sheet
// (css/<id>.css) is a registered content script, so a page normally carries
// every sheet its settings need from document_start. When it doesn't (a
// feature just switched on, or a lost registration), ensureSheets asks the
// service worker to insert the missing ones into this frame, and resolves
// once they're in. Same-origin frames (the RCE editor) do the same for
// themselves from boot.js.
// Until then applyMirror withholds those features' attributes: plain Canvas,
// never half-styled. Service-worker side: src/background/css.ts.
import { addSheets, checkSheets, missingSheets, type Mirror, type MirrorBody } from './mirror.ts';

export const CSS_MSG = 'b2c:css';

/** Sheets a mirror wants anywhere (normal and quiz-taking pages): what to register. */
export const wantedSheets = (m: Mirror): string[] => [...new Set([...Object.keys(m.need ?? {}), ...Object.keys(m.quiz?.need ?? {})])].sort();

/**
 * Make sure this page carries every sheet `body` needs. Also reports `want`
 * (what the settings want anywhere) so the registrations follow. Resolves
 * 'present' (nothing was missing), 'inserted' (some just arrived), or false.
 */
export async function ensureSheets(body: MirrorBody, want?: string[]): Promise<'present' | 'inserted' | false> {
  // Look only for sheets not seen yet: the style read forces a style recalc.
  const seen = (globalThis as { __b2cSheets?: Set<string> }).__b2cSheets;
  const todo = Object.keys(body.need ?? {}).filter(id => !seen?.has(id));
  if (todo.length) checkSheets(todo);
  const insert = missingSheets(body);
  if (!insert.length) {
    // Nothing to wait for: just keep the registrations in step.
    if (want) chrome.runtime.sendMessage({ type: CSS_MSG, want }).catch(() => {});
    return 'present';
  }
  const ok = await chrome.runtime.sendMessage({ type: CSS_MSG, want, insert }).catch(() => false);
  if (ok !== true) return false;
  addSheets(insert);
  return 'inserted';
}
