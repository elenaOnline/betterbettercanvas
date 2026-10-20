// Entry for a world: "MAIN", run_at: document_start content script (see
// instui.ts). Installs only when the pre-paint mirror can turn a theme or the
// Canvas corner token on here, so with both off b²c touches nothing in the
// page's world beyond one event listener. When the mirror is missing or stale
// (a first visit, or a theme switched on in an open tab), the palette runtime
// fires LATE_EVENT and the patch installs then, rewriting the rules already
// inserted. Never on quiz-taking routes: b²c must not touch assessments.
import { QUIZ_TAKING } from '../../core/canvas/page.ts';
import { install, installLate, LATE_EVENT } from './instui.ts';

const GATES = ['data-b2c-theme', 'data-b2c-shape'];

export function enginePossible(raw: string | null): boolean {
  if (!raw) return false;
  const m = JSON.parse(raw) as { attrs?: Record<string, string>; cond?: { attr: string }[] };
  return !!m && (GATES.some(g => m.attrs?.[g] !== undefined) || !!m.cond?.some(c => GATES.includes(c.attr)));
}
/** v1 name. */
export const darkPossible = enginePossible;

try {
  if (!QUIZ_TAKING.test(location.pathname)) {
    if (enginePossible(localStorage.getItem('b2c:mirror'))) install();
    else document.addEventListener(LATE_EVENT, () => { try { installLate(); } catch { /* never break Canvas */ } }, { once: true });
  }
} catch {
  /* never break Canvas */
}
