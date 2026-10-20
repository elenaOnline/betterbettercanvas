// Keeps an injected widget host attached while Canvas re-renders around it.
// `tryAttach(settled)` places the host if it isn't connected (settled = the
// parser has finished, so fallbacks are safe). Returns a disposer.
export function keepAttached(host: HTMLElement, tryAttach: (settled: boolean) => void): () => void {
  const run = () => {
    if (!host.isConnected) tryAttach(document.readyState !== 'loading');
  };
  const mo = new MutationObserver(run);
  mo.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', run);
  run();
  return () => {
    mo.disconnect();
    document.removeEventListener('DOMContentLoaded', run);
    host.remove();
  };
}
