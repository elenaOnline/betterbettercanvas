// The Studio's two round drawings: the to-do Progress ring stand-in on the
// stage and its view thumbnail. The ring is b²c's one round element (decided
// 2026-10-20: it draws its data), so it lives here, apart from everything
// square (test/unit/core-square.test.ts lists this file as the exception).

/** The ring view's thumbnail in the To do inspector. */
export const RING_THUMB = '<svg viewBox="0 0 60 38"><circle cx="20" cy="19" r="13" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="5"/><circle cx="20" cy="19" r="13" fill="none" stroke="currentColor" stroke-opacity=".7" stroke-width="5" pathLength="100" stroke-dasharray="62 38" transform="rotate(-90 20 19)"/><g fill="currentColor" opacity=".5"><rect x="40" y="9" width="14" height="2.4"/><rect x="40" y="15" width="10" height="2.4"/><rect x="40" y="21" width="12" height="2.4"/></g></svg>';

/** The ring on the stage: a track and one arc per course (share of `n` items). */
export function ringSvg(arcs: readonly { color: string; count: number }[], n: number, label: [string, string]): string {
  let off = 0;
  const segs = arcs.map(({ color, count }) => {
    const len = (count / n) * 100;
    const s = `<circle cx="56" cy="56" r="46" fill="none" stroke="${color}" stroke-width="12" pathLength="100" stroke-dasharray="${Math.max(0, len - 1.2)} ${100 - len + 1.2}" stroke-dashoffset="${-off}" transform="rotate(-90 56 56)"/>`;
    off += len;
    return s;
  }).join('');
  return `<svg viewBox="0 0 112 112"><circle cx="56" cy="56" r="46" fill="none" stroke="var(--hair)" stroke-width="12"/>${segs}
      <text x="56" y="56" text-anchor="middle" font-size="26" font-weight="700" fill="var(--p-text)" font-family="inherit">${label[0]}</text><text x="56" y="72" text-anchor="middle" font-size="9.5" fill="var(--p-textSecondary)" font-family="inherit">${label[1]}</text></svg>`;
}
