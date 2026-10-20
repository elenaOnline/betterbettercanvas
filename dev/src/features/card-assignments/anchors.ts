// Classic dashboard card anchors, in one place for every card-* feature and
// dashboard-notes. When b²c targets the widget dashboard (or owns its own
// grid), this module is what changes; the widgets themselves are remountable.
//
// ── Hook for other features (e.g. grade-impact) ─────────────────────────────
// card-assignments renders each due row inside its own shadow root, but every
// row also has a LIGHT-DOM element, so other features find it with
// `ctx.dom.each(ITEM_SLOT_SELECTOR, el => …)` and never reach into the shadow:
//
//   <b2c-card-due data-b2c-course="123">            (shadow host, in the card)
//     <span slot="b2c-impact-0"
//           data-b2c-plannable="assignment:456"     (plannable_type:plannable_id)
//           data-b2c-course="123"></span>           ← append your inline element here
//     …
//   </b2c-card-due>
//
// The span is projected into the row, after the due text, through
// `<slot name="b2c-impact-N">`. It is reused for as long as its item stays on
// the card (re-renders keep it and its children), and removed when the item
// leaves (done, filtered, or the card re-renders from Canvas). Keep what you
// append small and inline: the row is one 28 px line, and the span gets
// `white-space: nowrap`. Style it inside your own element (a shadow host of
// your own is best); the card's shadow CSS doesn't reach it.

export const ITEM_SLOT_SELECTOR = 'b2c-card-due > span[data-b2c-plannable]';

// Both Canvas dashboards render cards as
//   .ic-DashboardCard__box > .ic-DashboardCard__box__container > .ic-DashboardCard
// (classic Card View inside #DashboardCard_Container; the new dashboard's
// Courses tab inside div#courses[role=tabpanel], with no #DashboardCard_Container).
// Never anchor on #DashboardCard_Container.
export const SEL = {
  box: '.ic-DashboardCard__box',
  boxContainer: '.ic-DashboardCard__box__container',
  /**
   * A course card (selector list: class, or the new dashboard's test id, so
   * either survives drift). Placeholders match too but have no link; use
   * cardCourseId() to skip them. Don't append pseudo-classes to this list;
   * use cardSelectorFor() for per-course selectors.
   */
  card: '.ic-DashboardCard, [data-testid=draggable-card]',
  link: 'a.ic-DashboardCard__link',
  header: '.ic-DashboardCard__header',
  hero: '.ic-DashboardCard__header_hero',
  image: '.ic-DashboardCard__header_image',
  title: '.ic-DashboardCard__header-title, [data-testid=dashboard-card-title]',
  subtitle: '.ic-DashboardCard__header-subtitle',
  term: '.ic-DashboardCard__header-term',
  buttonBg: '.ic-DashboardCard__header-button-bg',
  actions: '.ic-DashboardCard__action-container',
  action: 'a.ic-DashboardCard__action',
  /** Classic only. On her page #right-side may hold an extension's panel, not Canvas's. */
  rightSideWrapper: '#right-side-wrapper',
} as const;

/** Anchors for the popup's health view. */
export const CARD_ANCHORS = { cardBox: SEL.boxContainer, card: SEL.card, cardLink: SEL.link };

/** Course id of a card element, or null for placeholders / unknown cards. */
export function cardCourseId(card: Element): string | null {
  const a = card.querySelector<HTMLAnchorElement>(SEL.link);
  const href = a?.getAttribute('href') ?? '';
  // Some instances shorten ids with "~" (shard~id); keep the whole token.
  const m = href.match(/\/courses\/([\w~]+)/);
  return m?.[1] ?? null;
}

/** CSS selector for one course's card (relies on :has, Chromium 105+). */
export function cardSelectorFor(courseId: string): string {
  // Inside a quoted attribute value only " and \ need escaping.
  const id = courseId.replace(/["\\]/g, c => '\\' + c);
  // The leading slash keeps "/courses/12" from matching "/courses/112".
  return SEL.card
    .split(',')
    .map(c => `${c.trim()}:has(${SEL.link}[href$="/courses/${id}"])`)
    .join(', ');
}

/** All real cards currently in the page, with their course ids. */
export function currentCards(doc: ParentNode = document): { el: HTMLElement; courseId: string }[] {
  const out: { el: HTMLElement; courseId: string }[] = [];
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(SEL.card))) {
    const courseId = cardCourseId(el);
    if (courseId) out.push({ el, courseId });
  }
  return out;
}

/** Canvas renders a card's colour on these elements; card-colors repaints them.
 *  Not the title: under the colour budget (rice.md) the hero is the card's one
 *  course-colour channel, and the palette makes titles text-coloured. */
export function paintCard(card: Element, hex: string): void {
  card.querySelector<HTMLElement>(SEL.hero)?.style.setProperty('background-color', hex);
  card.querySelector<HTMLElement>(SEL.buttonBg)?.style.setProperty('background-color', hex);
}

/** The colour Canvas painted on a card (hero background), as #rrggbb. */
export function cardColor(card: Element): string | null {
  const hero = card.querySelector<HTMLElement>(SEL.hero);
  const c = hero?.style.backgroundColor;
  return c ? toHex(c) : null;
}

export function toHex(css: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(css)) return css.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(css)) return ('#' + [...css.slice(1)].map(c => c + c).join('')).toLowerCase();
  const m = css.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!m) return null;
  return '#' + [m[1], m[2], m[3]].map(x => Number(x).toString(16).padStart(2, '0')).join('');
}
