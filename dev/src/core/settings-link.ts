// Deep links into the settings page (settings.md "Deep links"): the ⚙ in each
// panel section header, the card menu's "Dashboard settings…", the Goal box.
// Content scripts can't open extension pages themselves; the SW does it,
// reusing an open settings tab when there is one.

export const OPEN_SETTINGS = 'b2c:open-settings';

/** Open (or focus) options.html at `#<target>` (a feature id or section id). */
export function openSettings(target: string): void {
  try {
    void chrome.runtime.sendMessage({ type: OPEN_SETTINGS, target }).catch(() => {});
  } catch {
    /* orphaned content script: nothing to do */
  }
}
