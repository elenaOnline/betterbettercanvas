// docs.js: runs in every *.instructure.com frame at document_start and exits
// at once unless this is a DocViewer (canvadocs) frame. There it applies
// "Documents in dark mode" (Director ruling, dark-mode.md §7): the Canvas tab's
// palette runtime posts {type:'b2c:docs', mode: light|dimmed|dark}; light is
// untouched, dimmed lowers brightness, dark inverts the page like a PDF
// reader's dark mode (hue kept). Nothing is stored here and nothing is
// requested; the frame only listens to its parent.
import { DOCS_MSG } from './attrs.ts';

export const DOCS_FILTER: Record<string, string> = {
  light: '',
  dimmed: 'brightness(0.82) contrast(1.05)',
  dark: 'invert(0.9) hue-rotate(180deg)',
};

export function docsCss(mode: string): string {
  const f = DOCS_FILTER[mode] ?? '';
  // Images inside the document are inverted back so photos look like photos.
  return f ? `html{filter:${f}!important;background:#fff}${mode === 'dark' ? 'img,video,picture{filter:invert(1) hue-rotate(180deg)}' : ''}` : '';
}

function run() {
  if (!/^canvadocs/.test(location.hostname) || window === top) return;
  let style: HTMLStyleElement | null = null;
  const apply = (mode: string) => {
    const css = docsCss(mode);
    if (!css) return style?.remove(), (style = null);
    style ??= document.createElement('style');
    style.textContent = css;
    if (!style.isConnected) (document.head ?? document.documentElement).appendChild(style);
  };
  addEventListener('message', (e: MessageEvent) => {
    if (e.source !== parent) return;
    const d = e.data as { type?: string; mode?: string } | null;
    if (d?.type === DOCS_MSG && typeof d.mode === 'string') apply(d.mode);
  });
  try {
    parent.postMessage({ type: DOCS_MSG, ask: true }, '*');
  } catch {
    /* detached */
  }
}

try {
  run();
} catch {
  /* never break the viewer */
}
