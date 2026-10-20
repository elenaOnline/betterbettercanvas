// Pure helpers for gradient-cards (the runtime is run.ts; the definition is index.ts).

export const anchors = {
  cards: '.ic-DashboardCard',
  hero: '.ic-DashboardCard__header_hero',
  courseLink: 'a[href*="/courses/"]',
};

export function courseKey(hero: Element): string {
  const card = hero.closest(anchors.cards);
  const href = card?.querySelector(anchors.courseLink)?.getAttribute('href') ?? '';
  return href.match(/\/courses\/([^/?#]+)/)?.[1] ?? card?.getAttribute('data-course-id') ?? card?.id ?? '';
}

/** DOM computed colours are rgb/rgba; hex is useful for tests and callers. */
export function rgb(value: string): [number, number, number] | null {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map(x => x + x).join('') : hex;
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null;
  const channels = m.slice(1, 4).map(Number);
  return channels.every(n => n >= 0 && n <= 255) ? channels as [number, number, number] : null;
}

export function cardGradient(value: string, key: string): string | null {
  const channels = rgb(value);
  if (!channels) return null;
  // Identity is read from the card, never its position. The same course colour
  // always has the same +50-degree OKLCH endpoint, including after reorder.
  void key;
  const color = `rgb(${channels.join(', ')})`;
  return `linear-gradient(115deg, ${color}, oklch(from ${color} l c calc(h + 50)))`;
}
