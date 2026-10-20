# card-assignments: "Due" list on each course card

*Design, draft 1, 2026-10-19. The frame is in `_dashboard.md` §4. Behaviour
reference is `research/features.md` D1.*

**Acceptance:**
- Each card lists its next N items. Rows never shift the card (fixed height).
- Ticking an item flips its checkbox in the same frame and settles in 280 ms.
- Undo is available for 6 s.
- With "Sync with Canvas planner" on, the tick shows as done in Canvas's
  planner and apps after reload.

## Data
One planner call for all courses (`/api/v1/planner/items`, start = now − 14 d,
end = now + 28 d, paginated by `Link`), shared with `better-todo` and grouped by
course. Types: assignment, quiz, discussion_topic, each filterable in settings.
Local custom to-do items (from `better-todo` "+ Add") with a course merge in by
date.

## Which items, in what order
1. **Overdue:** due date passed, not submitted, not marked done, and the
   "Include overdue" setting is on. Oldest first.
2. **Upcoming:** due date ahead, not marked done (and not submitted, unless
   "Show completed" is on). Soonest first.
3. Then up to N rows (setting 1–8, default 4).

If more items qualify than fit, the due header shows the total ("Due · 7"), and
the last row is "+3 more" (a link to the course's assignments page).

## Row
```
[☐] Problem set 6 ··············· Tomorrow 11:59 PM   −4.2 / +1.8
```
- **Checkbox** (16 px, 32 px hit area). Ticking marks it done. See "Done"
  below.
- **Title:** a link to the item. 1 line, ellipsis, full title in a tooltip.
  The type icon is omitted on cards for density; the screen-reader label
  includes the type ("Quiz: Quiz 4").
- **Due**, right-aligned, tabular figures. Relative when within 7 days:
  "Today 5:00 PM", "Tomorrow 11:59 PM", "Fri 11:59 PM". Further out, the
  absolute date: "Oct 28". The full date and time is in the tooltip. 12 or 24
  hour follows the setting.
- **Due soon** (within 24 h, not submitted): the due text is bold and in `--b2c-w-text`, and under 3 h it reads "Due in 2h 10m". There's no colour; overdue keeps the only colour.
- **Overdue:** the due text reads "Overdue 2d" in `--b2c-w-danger`. That's the
  item's one danger channel (colour budget, `rice.md`): no marker, and nothing
  else on the card is red.
- **Submitted** (when shown): title in secondary text with a ✓ "Submitted" chip
  instead of the date. It's Canvas's state, so it reads in Canvas's word.
- **Grade impact** (`grade-impact`, opt-in): `−4.2 / +1.8` after the date in
  tertiary text, tabular figures, sign always shown. Meaning: percentage points
  the course's current score would move with 0 or with full marks. The tooltip
  reads: "If you score 0: 87.4% (−4.2). Full marks: 93.5% (+1.8). Based on your
  current score, with ungraded work excluded and Canvas's group weights." It
  isn't shown when the course has no current score, hides totals, or the item
  is worth 0 points.

## Done
- A tick is optimistic. The box fills in the same frame and the title goes
  through-struck in secondary. **The row stays, crossed off,** until the next
  page load (bc's behaviour, and the rewarding part: she sees what she got
  done). On the next load done items drop out and the next ones move up.
  Under reduced motion it changes instantly.
- An **Undo toast** appears at the bottom-left of the viewport for 6 s:
  - with sync on: "Marked done in Canvas · Undo"
  - with sync off: "Marked done · Undo"

  ⌘Z / Ctrl+Z also undoes the last tick while focus is on the dashboard.
- With sync on, b²c writes the planner override (`marked_complete: true`,
  `dismissed` sent explicitly). If the write fails, the row returns and the toast
  says "Couldn't save to Canvas · Retry".
- The first time ever that she ticks with sync on, the toast adds a second line:
  "Change this in Settings → To-do". It's shown once.

## Settings (labels in `settings.md` → Dashboard)
Show assignments on cards · Number shown · Include overdue · Show completed ·
Types · Show grade impact.

## Accessibility
- The checkbox label is "Mark Problem set 6 done".
- A tick announces "Problem set 6 marked done. Undo available." through a
  polite live region.
