import { diagnostic, errorEvent, LOG_KEY, LOG_LIMIT, readRing, type ErrorEvent, type Phase } from './model.ts';

/** One SW writer serializes appends and clears, preventing lost updates. */
export function installDiagnostics(features: readonly string[], now: () => number = Date.now) {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T,>(work: () => Promise<T>): Promise<T> => {
    const result = queue.then(work); queue = result.catch(() => {}); return result;
  };
  const read = async () => readRing((await chrome.storage.local.get(LOG_KEY))[LOG_KEY], features);
  const append = (event: unknown) => serial(async () => {
    const entry = diagnostic(event, features);
    if (!entry) return false;
    await chrome.storage.local.set({ [LOG_KEY]: [...await read(), entry].slice(-LOG_LIMIT) });
    return true;
  });
  const listener = (msg: { type?: string; event?: ErrorEvent }, sender: chrome.runtime.MessageSender, reply: (r: unknown) => void) => {
    if (!msg?.type?.startsWith('b2c:diagnostics:') || sender.id !== chrome.runtime.id) return false;
    const options = sender.url?.startsWith(chrome.runtime.getURL(''));
    let work: Promise<unknown>;
    if (msg.type === 'b2c:diagnostics:record') work = append(msg.event);
    else if (options && msg.type === 'b2c:diagnostics:list') work = serial(read);
    else if (options && msg.type === 'b2c:diagnostics:clear') work = serial(() => chrome.storage.local.remove(LOG_KEY));
    else return false;
    void work.then(result => reply({ ok: true, result }), () => reply({ ok: false }));
    return true;
  };
  chrome.runtime.onMessage.addListener(listener);
  return {
    /** Call from explicit SW catch sites. Raw exceptions never enter storage. */
    record(feature: string, error: unknown, phase: Phase = 'worker') {
      return append(errorEvent(feature, error, 'service-worker', phase, now()));
    },
    stop() { chrome.runtime.onMessage.removeListener(listener); },
  };
}
