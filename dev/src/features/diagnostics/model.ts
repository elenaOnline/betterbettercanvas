export const LOG_KEY = 'b2c:diagnostics';
export const LOG_LIMIT = 50;
export const PHASES = ['start', 'stop', 'update', 'init', 'worker'] as const;
export type Phase = typeof PHASES[number];
export const PAGE_KINDS = ['dashboard', 'courses', 'course-home', 'course-grades', 'assignments', 'assignment', 'modules', 'announcements', 'discussions', 'course-other', 'calendar', 'inbox', 'profile', 'login', 'quiz-taking', 'other', 'service-worker'] as const;
export interface Diagnostic { feature: string; message: string; page: string; time: number }
export interface ErrorEvent { feature: string; phase: Phase; page: string; name: string; time: number }
const ERROR_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'AbortError', 'TimeoutError', 'NetworkError', 'SecurityError', 'QuotaExceededError']);

/** Never keep Error.message/stack: both can contain URLs, names and page text. */
export function errorEvent(feature: string, error: unknown, page: string, phase: Phase, time: number): ErrorEvent {
  let name = 'Error';
  try {
    if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string' && ERROR_NAMES.has(error.name)) name = error.name;
  } catch { /* A throwing getter is still only an Error. */ }
  return { feature, phase, page, name, time };
}

export function diagnostic(event: unknown, features: readonly string[]): Diagnostic | null {
  if (!event || typeof event !== 'object') return null;
  const e = event as Partial<ErrorEvent>;
  if (typeof e.feature !== 'string' || ![...features, 'core', 'sites', 'diagnostics', 'first-run', 'settings-storage'].includes(e.feature) ||
      !PHASES.includes(e.phase as Phase) || !PAGE_KINDS.includes(e.page as typeof PAGE_KINDS[number]) ||
      typeof e.time !== 'number' || !Number.isFinite(e.time) || e.time < 0 || e.time > 8.64e15) return null;
  const name = typeof e.name === 'string' && ERROR_NAMES.has(e.name) ? e.name : 'Error';
  return { feature: e.feature, message: `${e.phase} failed (${name}).`, page: e.page!, time: e.time };
}

export function readRing(raw: unknown, features: readonly string[]): Diagnostic[] {
  if (!Array.isArray(raw)) return [];
  // Reconstruct through the same allowlist, even if local storage is malformed.
  return raw.flatMap(item => {
    if (!item || typeof item !== 'object' || typeof item.message !== 'string') return [];
    const m = /^(start|stop|update|init|worker) failed \(([A-Za-z]+)\)\.$/.exec(item.message);
    if (!m) return [];
    const d = diagnostic({ feature: item.feature, page: item.page, time: item.time, phase: m[1], name: m[2] }, features);
    return d ? [d] : [];
  }).slice(-LOG_LIMIT);
}

export function reportText(rows: readonly Diagnostic[], version: string): string {
  return JSON.stringify({ extension: 'b2c', version, errors: rows }, null, 2);
}
