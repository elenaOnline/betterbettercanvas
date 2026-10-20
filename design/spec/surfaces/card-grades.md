# card-grades: the grade chip on each course card

*Design, draft 1, 2026-10-19. The frame is in `_dashboard.md` §4.1. Behaviour
reference is `research/features.md` D2.*

**Acceptance:**
- The chip shows exactly what Canvas's grades page shows as the current total,
  with the same number and rounding.
- It renders from cache on the first frame and never shows a placeholder like
  "--%" once any value has been seen.

## What it shows
- Canvas's **current score**, which excludes ungraded work. That's the Canvas
  grades page default, so the two agree: "88.4%".
  - If the course uses grading periods, it's the current period's score.
  - Precision follows Canvas: the value as the API returns it, at most 2
    decimals, trailing zeros trimmed.
- The **letter** follows when the course has a grading scheme
  (`computed_current_grade`): "88.4% A−". The letter is the course's own scheme
  and is never computed by b²c.
- **No grade yet** → "No grade", in secondary.
- **The course hides totals** → no chip at all.

## Look
A chip at the hero's top-left, 8 px inset:
- 24 px tall, `--b2c-radius-sm` (square), 0 8 px padding
- background `rgba(255,255,255,.92)` (dark: `surface` at 92%), text in `--b2c-w-text`
- 13/600, tabular figures

It stays legible on any course colour or image. The chip is a link to the
course's grades page.

## Options
- **Only on hover:** the chip is hidden (opacity 0, space kept) until the card is
  hovered or focused. Then it fades in over 120 ms. This one is for privacy
  when someone is looking over her shoulder.
- With grade goals on, a thin progress tick toward the goal appears under the
  number (see `grade-goals.md`, coming).
