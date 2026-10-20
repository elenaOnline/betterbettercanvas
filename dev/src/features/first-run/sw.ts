const FIRST_RUN_KEY = 'b2c:first-run-opened';

/** Hook only the install event, never worker startup or an extension update. */
export function installFirstRun(onError: (error: unknown) => void = () => {}) {
  let opening = false;
  const listener = (details: chrome.runtime.InstalledDetails) => {
    if (details.reason !== 'install' || opening) return;
    opening = true;
    void (async () => {
      try {
        if ((await chrome.storage.local.get(FIRST_RUN_KEY))[FIRST_RUN_KEY] === true) return;
        await chrome.tabs.create({ url: chrome.runtime.getURL('options.html#start-here') });
        await chrome.storage.local.set({ [FIRST_RUN_KEY]: true });
      } catch (error) { onError(error); }
      finally { opening = false; }
    })();
  };
  chrome.runtime.onInstalled.addListener(listener);
  return () => chrome.runtime.onInstalled.removeListener(listener);
}
