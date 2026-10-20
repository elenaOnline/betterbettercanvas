// custom-css runtime: loaded lazily (chunks/custom-css.js) on any Canvas page.
import type { Ctx } from '../../core/ctx.ts';
import type { Values } from '../../core/settings/schema.ts';
import { scopedCss } from './model.ts';
import type { Instance } from '../../core/feature.ts';
import type feature from './index.ts';

type S = Values<typeof feature.settings>;
export function start(ctx: Ctx, s: S): Instance<S> {
  // Adopt the pre-paint sheet when boot made one.
  const style = document.querySelector<HTMLStyleElement>('style[data-b2c-custom-css]') ?? document.createElement('style');
  style.dataset.b2cCustomCss = '';
  style.textContent = scopedCss(s.css);
  const off = ctx.dom.each('head', head => { head.appendChild(style); });
  return {
    update(next) { style.textContent = scopedCss(next.css); },
    stop() { off(); style.remove(); },
  };
}
