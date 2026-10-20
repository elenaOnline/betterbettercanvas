// One toast for the settings page: a message plus Undo for 10 s (paused while
// hovered or focused). Replaces confirm dialogs for resets and removals.
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { apply, snapshot } from './state.ts';

interface ToastState { msg: string; undo: (() => void) | null; n: number }
export const toast = signal<ToastState | null>(null);
let seq = 0;

export function showToast(msg: string, undo: (() => void) | null = null) {
  toast.value = { msg, undo, n: ++seq };
}

/** Apply a patch and offer Undo, which restores the keys it touched. */
export function applyWithUndo(msg: string, patch: Record<string, unknown>) {
  const before = snapshot(Object.keys(patch));
  void apply(patch);
  showToast(msg, () => void apply(before));
}

export const TOAST_MS = 10_000;

export function Toast() {
  const t = toast.value;
  const left = useRef(TOAST_MS), started = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hide = () => { clearTimeout(timer.current); toast.value = null; };
  const run = () => { clearTimeout(timer.current); started.current = Date.now(); timer.current = setTimeout(hide, left.current); };
  const pause = () => { clearTimeout(timer.current); left.current -= Date.now() - started.current; };
  useEffect(() => {
    if (!t) return;
    left.current = TOAST_MS;
    run();
    return () => clearTimeout(timer.current);
  }, [t?.n]);
  return (
    <div class={'toast' + (t ? ' show' : '')} role="status" aria-live="polite"
      onMouseEnter={pause} onMouseLeave={() => t && run()} onFocusIn={pause} onFocusOut={() => t && run()}>
      <span class="toast-msg">{t?.msg ?? ''}</span>
      {t?.undo && <button class="btn quiet" type="button" aria-keyshortcuts="Meta+Z"
        onClick={() => { const u = t.undo; hide(); u?.(); }}>Undo</button>}
    </div>
  );
}

/** ⌘Z / Ctrl+Z outside text fields triggers the toast's Undo. */
export function undoFromKeyboard(): boolean {
  const t = toast.value;
  if (!t?.undo) return false;
  const u = t.undo;
  toast.value = null;
  u();
  return true;
}
