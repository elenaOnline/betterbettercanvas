// tab-icons runtime: loaded lazily (chunks/tab-icons.js) where the feature runs.
import type { Ctx } from '../../core/ctx.ts';
import { anchors, courseColor, iconData } from './index.ts';

export function start(ctx: Ctx) {
    const id = ctx.page.courseId;
    if (!id) return;
    let stopped = false;
    let href: string | null = null;
    let currentColor: string | null = null;
    const icons = new Set<HTMLLinkElement>();
    const restorers = new Map<HTMLLinkElement, () => void>();
    const owned = document.createElement('link');
    owned.rel = 'icon';
    owned.dataset.b2cTabIcon = '';
    const apply = (link: HTMLLinkElement) => {
      if (!href) return;
      link.href = href;
      link.type = 'image/svg+xml';
      link.setAttribute('sizes', '16x16');
    };
    const offIcons = ctx.dom.each(anchors.icon, el => {
      if (el === owned) return;
      const link = el as HTMLLinkElement;
      const original = ['href', 'type', 'sizes'].map(k => [k, link.getAttribute(k)] as const);
      const restore = () => {
        for (const [k, value] of original) {
          if (value === null) link.removeAttribute(k);
          else link.setAttribute(k, value);
        }
      };
      icons.add(link);
      restorers.set(link, restore);
      apply(link);
      return () => {
        icons.delete(link);
        restorers.delete(link);
        restore();
      };
    });
    const offHead = ctx.dom.each(anchors.head, head => {
      if (href) { apply(owned); head.appendChild(owned); }
    });
    const recolor = (colors: Record<string, string>) => {
      if (stopped) return;
      const color = courseColor(colors, id);
      if (color === currentColor) return;
      currentColor = color;
      if (!color) {
        // Fresh data may remove a course colour. Restarting the registrations
        // would lose the originals, so restore through the retained snapshots.
        href = null;
        owned.remove();
        for (const restore of restorers.values()) restore();
        return;
      }
      href = iconData(color);
      for (const link of icons) apply(link);
      if (href && document.head) { apply(owned); document.head.appendChild(owned); }
    };
    void ctx.data.colors(recolor).catch(() => { /* Keep the cached icon or Canvas's original on failure. */ });
    // Follow colour changes made in other tabs (card-colors, revalidation).
    const offWatch = ctx.data.watchColors(recolor);
    return {
      stop() { stopped = true; offWatch(); offHead(); offIcons(); owned.remove(); },
    };
  }
