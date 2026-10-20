# todo-views: List · Progress ring · Week · By course

*Design, v2 draft 1, 2026-10-20. One setting, `views.todo` (a Views primitive,
`rice.md`), over **one to-do state**. The reference prototype is
`design/v2/todo-views/index.html`, and its `concept.md` has the detail. All
behaviour in `better-todo.md` still holds (two-line rows, planner sync, Undo,
keyboard, honest states).*

**Acceptance:**
- **Shared state:** a tick in any view is a tick in every view and on the card
  due lists, in one 280 ms beat: the box fills in the course colour, and the
  arc, square or cell fills.
- **Honest ring:** the ring never shows a percentage, and never 0/0.
- **Width:** every view works at 240 px, 288 px, and as a wide strip.
- **Accessibility:** every view is fully keyboard-operable, with text
  equivalents for every graphic.

## The view control
- It sits in a thin bar under the panel header, which itself is unchanged.
- It's a square, icon-segmented radiogroup (arrow keys). The selected segment
  also shows its name; at 240 px it's icons only, with names in tooltips and
  accessible names.
- The right end of the bar holds the view's own control:
  - Ring and By course: a range menu, Today · This week · Next 7 days
  - Week: `‹ This week ›`
- In the Studio the same value is picked from four thumbnail cards
  (`design/v2/todo-views/thumbs/*.svg`).
- **List is the default.** The last view used is remembered.

## Views
1. **List:** better-todo as specced.
2. **Progress ring** (the "wheel", done honestly). **Round, decided by
   the owner (2026-10-20).** It's the one round thing in b²c, because a circle is
   the data here. Everything around it stays square.
   - **Arcs:** one per course. Arc length is that course's share of the
     range's items, and the fill is the share done, so an unfilled arc shows
     which course is behind.
   - **Centre:** "4 of 11 / done this week".
   - **Empty:** "Nothing due this week", inside a hairline circle, with the
     next item due shown below.
   - **Finished:** "Week done · 11 of 11". Nothing else happens.
   - **Legend:** real text (CHEM 101 · 2 of 3). Clicking a legend entry or an
     arc filters the list below to that course.
   - **Overdue:** items from before the range are listed first, but aren't
     counted in the ring.
3. **Week:**
   - **288 px:** a mini week bar sits on top. A LATE column is pinned left (a tonal label; danger appears
     only on the overdue items' due text), then Mon–Sun, with today shaded. Each column stacks one
     square per item, **tonal** (filled `text` = done, outlined `border` =
     open; colour pass 2026-10-20), capped at 4 squares and then a count with a `2/3` count under it. Clicking a column scrolls to
     that day. Below it is the day list, with "2 of 3 done" per day and
     "Nothing due" on empty days.
   - **Wide strip:** 8 real columns, Overdue then Mon–Sun.
4. **By course:**
   - Each course gets a header ("CHEM 101 General Chemistry · 1 of 3 this week ·
     1 overdue"), then a segmented bar with one cell per item that fills when
     ticked, then its items.
   - A course with nothing in range collapses to one line.
   - In the wide strip, courses sit side by side.

## Ticked items
A ticked item stays crossed off in place for the session.
- **On the next load:**
  - **List and Ring:** done items move into a collapsed **"Done today · N"**
    group at the foot.
  - **Week and By course:** each day or course keeps its own done items under
    a collapsed **"2 done"** line inside that group. The view's purpose is
    per-day or per-course progress, so done work stays where it counted.
- Submitted items come from Canvas and can't be unticked.

## "Rewarding" means
The tick, and honest counts. There are no streaks, percentages, confetti,
sounds or nags. Reduced motion makes it instant.

## Accessibility
- The ring SVG is `aria-hidden`. Its text equivalent is the centre text plus
  the legend buttons ("CHEM 101: 2 of 3 done. Show only this course"), inside a
  group named "Progress this week".
- A polite live region announces each tick: "HW4 marked done. 4 of 11 done
  this week. Undo available."
- Squares and cells are `aria-hidden`; their counts are in words.
- Checkbox fills use the course colour clamped to L ≤ 0.55, or ≥ 0.74 in dark.
- Tracks are `color-mix(in oklab, <course> 22%, var(--b2c-w-bg))`. Mixing in
  oklab avoids the purple drift oklch shows on dark navy.
