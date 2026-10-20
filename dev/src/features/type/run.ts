// type runtime: loaded lazily (chunks/type.js) on any Canvas page; declares the bundled fonts.
import type { Ctx } from '../../core/ctx.ts';
import type { Instance } from '../../core/feature.ts';
import type { Values } from '../../core/settings/schema.ts';
import { fontSheet } from './fonts.ts';
import type feature from './index.ts';

type S = Values<typeof feature.settings>;


export function start(ctx: Ctx, s: S): Instance<S> | void {
  if (s.family === 'Canvas default') return; // nothing to declare; restarted when it changes
  // Chrome blocks static extension IDs for use_dynamic_url resources. getURL
  // resolves the current session's dynamic host; keep this sheet local-only.
  // Adopt the sheet main.js declared at document_start (index.ts), else make one.
  const style = document.querySelector<HTMLStyleElement>('style[data-b2c-bundled-fonts]') ?? fontSheet();
  const off = ctx.dom.each('head', head => { head.appendChild(style); });
  return { stop() { off(); style.remove(); } };
}
