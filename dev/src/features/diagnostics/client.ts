import { errorEvent, type Phase } from './model.ts';

/** Main's catch sites call this with ctx.page.kind and ctx.now().getTime(). */
export function reportError(feature: string, error: unknown, page: string, phase: Phase, time: number): void {
  try {
    void chrome.runtime.sendMessage({ type: 'b2c:diagnostics:record', event: errorEvent(feature, error, page, phase, time) }).catch(() => {});
  } catch { /* An orphaned content script must still be able to stop. */ }
}
