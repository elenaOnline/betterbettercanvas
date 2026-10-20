# pins: week-aware bookmarks

*Design, draft 1, 2026-10-20. Built by Dev (`src/features/pins/`; shots in
`dev/.scratch/pins/shots/`). This spec sets the look and fixes the details.
Restyle `dock.css` to it. Research's finding stands: most courses aren't
week-named, so **a pin always says which rule resolved it**.*

**Acceptance:**
- One click from the dashboard or a course gets her to "this week's" thing.
- Every pin shows what it points at *now* and why.
- A pin never silently points at the wrong week.
- It costs nothing when it's off.

## The dock (dashboard)
- A row above the course grid, 44 px tall, with **square chips** (`--b2c-radius-sm`,
  1 px `--b2c-w-border`, `--b2c-w-bg`), 8 px gap. Each chip has two lines:
  the name (13/600, `--b2c-w-text`) and **now** (12/400,
  `--b2c-w-text-secondary`), e.g. "Week 4 · Gases", "due today 11:59 PM".
  - Max chip width is 200 px, with ellipsis. The full name and "now" are in the
    tooltip, plus the rule: "Oct 19–25 · by unlock dates".
  - A course pin carries a 2 px left edge in the course colour, the same
    marker as the to-do rows.
  - **Overflow:** chips that don't fit collapse into a final "+3" chip that opens
    a menu. The row never wraps.
  - The **+** chip at the end is "Pin this page" (on a Canvas page) or
    "New pin…" (on the dashboard).
- **Editor:** a popover from the dock's ⋯ or a chip's context menu, as built.
  - Rows: name, now, then ↑ ↓ ✎ ×. Remove has an Undo toast.
  - The form has a live preview line: "**Now:** Week 4 · Gases (by unlock
    dates)", and "**Next week from Thu:** Week 5" when `upcomingFrom` applies.
- **Upcoming:** from the `upcomingFrom` day, a week-aware chip's second line
  reads "Week 4 · next: Week 5". The chip itself still opens this week. Its
  menu has "Open next week's".

## Under the course menu
A small "Pins" label in Canvas's own course-nav style (11/700 uppercase,
tertiary), then this course's pins (or all pins, per `pins.scope`) as
course-nav links with their "now" line under each. "+ Pin" sits at the foot
as a dashed square target (`--b2c-radius-sm`).

## Resolution honesty
| State | What the chip shows |
|---|---|
| Resolved by a rule | "now" plus the rule in the tooltip and editor (by module name, by unlock dates, by due dates, by position) |
| No rule matched | It falls back to **this week's due items for the course**, reading "This week's due items · fallback" in `--b2c-w-text-tertiary`. The editor says "Couldn't find a week in this course's modules; showing this week's due items. Change rule…" |
| Target gone (deleted or unpublished) | Name struck through, with "Not found · Edit". It's never silently removed |
| Plain pin (no week logic) | "added Oct 19" |

## Keyboard and screen readers
The dock is a list of links. Each accessible name reads "Algebra this week:
Week 4, Gases, resolved by unlock dates". The editor rows are keyboard
reorderable (Alt+↑/↓), and "+" is reachable by Tab.

## Themes
Pins use widget tokens only, so they follow every theme and density. Density
roomy makes chips 52 px tall; compact makes them 36 px.
