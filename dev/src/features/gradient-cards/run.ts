// gradient-cards runtime: loaded lazily (chunks/gradient-cards.js) on the dashboard.
import type { Ctx } from '../../core/ctx.ts';
import type { Instance } from '../../core/feature.ts';
import type { Values } from '../../core/settings/schema.ts';
import { anchors, cardGradient, courseKey } from './model.ts';
import type feature from './index.ts';

type S = Values<typeof feature.settings>;

export function start(ctx: Ctx): Instance<S> {
  const byCourse = new Map<string, { color: string; gradient: string | null }>();
  const off = ctx.dom.each(anchors.hero, el => {
    const hero = el as HTMLElement;
    const originalStyle = hero.getAttribute('style');
    const originalImage = hero.style.getPropertyValue('--b2c-card-gradient');
    const originalPriority = hero.style.getPropertyPriority('--b2c-card-gradient');
    let lastStyle: string | null = originalStyle;
    let externallyChanged = false;
    const paint = () => {
      if (hero.getAttribute('style') !== lastStyle) externallyChanged = true;
      const key = courseKey(hero);
      const color = getComputedStyle(hero).backgroundColor;
      let entry = key ? byCourse.get(key) : undefined;
      if (!entry || entry.color !== color) {
        entry = { color, gradient: cardGradient(color, key) };
        if (key) byCourse.set(key, entry);
      }
      const gradient = entry.gradient;
      if (gradient) {
        if (hero.style.getPropertyValue('--b2c-card-gradient') !== gradient) hero.style.setProperty('--b2c-card-gradient', gradient);
      } else if (hero.style.getPropertyValue('--b2c-card-gradient') !== originalImage) {
        if (originalImage) hero.style.setProperty('--b2c-card-gradient', originalImage, originalPriority);
        else hero.style.removeProperty('--b2c-card-gradient');
      }
      lastStyle = hero.getAttribute('style');
    };
    paint();
    const observer = new MutationObserver(paint);
    observer.observe(hero, { attributes: true, attributeFilter: ['style', 'class'] });
    return () => {
      observer.disconnect();
      if (!externallyChanged && hero.getAttribute('style') === lastStyle) {
        if (originalStyle === null) hero.removeAttribute('style');
        else hero.setAttribute('style', originalStyle);
      } else if (originalImage) hero.style.setProperty('--b2c-card-gradient', originalImage, originalPriority);
      else hero.style.removeProperty('--b2c-card-gradient');
    };
  });
  return { stop() { off(); byCourse.clear(); } };
}
