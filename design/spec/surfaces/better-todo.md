# better-todo: the To do section of the side panel

*Design, draft 1, 2026-10-19. The frame is in `_dashboard.md` §5. Behaviour
reference is `research/features.md` D11 and D12. Targets are from
`study/comparables.md` §3.*

**Acceptance:**
- At least 10 items are visible in the panel without scrolling at 1440×900.
- Completing an item is optimistic and undoable.
- The list never says it's empty when a fetch failed.
- It's fully operable by keyboard: J/K, X, Z, Return.

## Structure
```
To do · 7                                   [Done]  [+]
OVERDUE · 1
▌☐ Reading response 3          WR 323   Overdue 2d
TODAY
▌☐ Problem set 6               MATH 152  11:59 PM
TOMORROW
▌☐ Quiz 4                      CHEM 101   11:59 PM
THIS WEEK
▌☐ Lab report draft            CHEM 101   Fri 5:00 PM
LATER
▌☐ Midterm project             HST 201  Oct 30
                                            Show 3 more
ANNOUNCEMENTS · 2
  ● Office hours moved         MATH 152  2h ago
  ● Exam 1 room change         CHEM 101   Yesterday
```
- **Grouped by day**: Overdue, Today, Tomorrow, This week, Later. An empty group
  isn't drawn. A group label is 11/700, uppercase, tracking .04em, in tertiary.
- **Row**, 36 px tall, one line:
  - the course colour as a 2 px left marker `▌`
  - checkbox
  - title (a link, ellipsis)
  - course short code in a secondary chip
  - due, right-aligned, tabular figures. Within a day group only the time
    shows, because the group already says the day.
- **Due soon** (within 24 h): the time is bold, and under 3 h it reads "in 2h 10m".
- **Overdue** rows: the due text is danger-coloured and reads "Overdue 2d". The
  marker stays the course colour, because overdue is said once, in words.
- **Item types:** assignment, quiz, discussion, plus her own local items (no
  type icon; a "Personal" chip instead of a course when there's no course).
  Type is in the accessible name, not drawn.
- **Number shown** is the setting (default 8). "Show N more" then adds 8 per
  click. It doesn't paginate the whole list.
- **Announcements** sit below in their own group, newest first, with an unread
  dot. Clicking one opens it. Read state is Canvas's own.

**Rows are two lines by default (A, decided):** title on line 1, `course · due`
on line 2, 44 px tall, as in Canvas's own To Do. At 288 px a one-line row
truncated every title. 8 items plus 2 announcements fit at 1440×900.

**Section header:** `To do · 7`, then `[To do | Done]`, `+`, and **⚙** (the
surface gear → Settings → To-do). The same ⚙ sits on the Notes and GPA
headers.

**Row ⋯** appears on hover or focus over the due text (it doesn't take row
width). The due is still in the preview and the accessible name.

## Actions
| Action | Mouse | Keyboard (focus in the list) |
|---|---|---|
| Move between rows | n/a | J / K or ↓ / ↑ |
| Open item | click the title | Return |
| Mark done | checkbox | X |
| Undo last | the toast's Undo | Z or ⌘Z |
| Row menu | ⋯ on hover/focus | . (period) |
| Add personal item | + | N |
| Show done | Done toggle | D |

- **Mark done:** same as `card-assignments`: optimistic, the 6 s Undo toast,
  and the planner write when sync is on. The ticked row stays crossed off in
  place for the session. On the next load it moves into a collapsed **"Done
  today · 3"** group at the foot of the list. A tick in the panel
  also ticks the card row, because there's one state.
- **Row menu ⋯:**
  - **Remove from list.** This dismisses the item in Canvas's planner when sync
    is on, and is local otherwise. Undoable.
  - **Label…**: a free-text tag shown as a chip after the title, local only.
  - **Open in new tab.**
- **Done view:** the header's "Done" toggle swaps the list to items done,
  submitted or removed in the last 14 days, newest first. Each has "Mark not
  done" / "Restore". The toggle is a segmented `To do | Done`, so it's never
  ambiguous which list is showing (bc flipped the header text, which hid the
  state).
- **+ (Add):** an inline form opens at the top of the list with Title, Course
  (menu, with "Personal" first), Due date, and Time (default 11:59 PM). Return
  adds it, Esc cancels. Personal items are local to b²c, sync across devices with
  settings, and disappear 14 days after they're done.

## Hover preview (`hover-preview`)
- After the pointer rests on a title for 350 ms (`--b2c-hover-delay`), a
  popover opens to the left of the panel. It's 360 px wide and at most 320 px
  tall, and shows:
  - title, course, due, and points
  - Canvas's submission state in Canvas's words (Submitted, Missing, Late,
    Graded 18/20)
  - the description as **sanitized rich text**, which keeps lists, bold, links
    and math images (bc stripped everything)
  - a bottom fade if it's truncated, and "Open" at the foot
- It closes immediately when the pointer leaves both the row and the popover.
  Keyboard: focus the row and press Space to toggle the preview.
- The preview is fetched on first hover and cached. A spinner shows only if the
  fetch takes more than 150 ms.

## Honest states
| State | What shows |
|---|---|
| Loading cold | 6 skeleton rows at the final row height |
| Nothing due (fetch succeeded) | "Nothing due in the next 4 weeks." plus "Show done" |
| Fetch failed | Cached list plus a header line: "⚠ Couldn't refresh · Retry". Never the empty state |
| Partial | Same as failed, listing which courses failed |

## Placement
- This is the first section of the side panel (`_dashboard.md` §5).
- On a narrow window the panel stacks above the grid and To do collapses to
  "To do · 7 (1 overdue)". One click expands it.
