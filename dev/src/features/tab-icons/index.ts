import { defineFeature } from '../../core/feature.ts';
import { bool } from '../../core/settings/schema.ts';

export const anchors = { head: 'head', icon: 'link[rel~="icon"]' };

export function courseColor(colors: Record<string, string>, id: string): string | null {
  const raw = colors[`course_${id}`];
  if (!raw || !/^#?(?:[\da-f]{3}|[\da-f]{6})$/i.test(raw)) return null;
  return raw.startsWith('#') ? raw : `#${raw}`;
}

/** Canvas's radial mark, squared (the owner: square styling, no circles), drawn
 *  locally; no image fetch or remote dependency. */
export function iconData(color: string): string | null {
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) return null;
  const dots = Array.from({ length: 8 }, (_, i) => {
    const angle = i * Math.PI / 4;
    const x = 8 + 5 * Math.cos(angle), y = 8 + 5 * Math.sin(angle);
    return `<rect x="${(x - 1.2).toFixed(3)}" y="${(y - 1.2).toFixed(3)}" width="2.4" height="2.4"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="${color}"/><g fill="white"><rect x="5.75" y="5.75" width="4.5" height="4.5"/>${dots}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Runtime (start) lives in run.ts, loaded only on course pages that use it.
export default defineFeature({
  id: 'tab-icons',
  settings: { enabled: bool(false) },
  // Course pages only: elsewhere there's no course colour, and loading the
  // runtime chunk would be pure cost.
  pages: ['course-home', 'course-grades', 'assignments', 'assignment', 'modules', 'announcements', 'discussions', 'course-other'],
  anchors,
});
