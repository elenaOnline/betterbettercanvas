# _dashboard: the shared frame for every dashboard feature

*Design, draft 2, 2026-10-19. Draft 2 decorates Canvas's own cards instead of drawing a b²c grid; see §1a. Not a feature id. This is the frame that the
`card-*`, `grade-impact`, `better-todo`, `hover-preview`, `dashboard-notes`,
`gpa-calculator` and `grade-goals` specs plug into.*

**Acceptance:**
- On both Canvas dashboards (classic Card View and the new widget dashboard's
  Courses tab), b²c's course grid and side panel appear in their final layout
  on the first frame after Canvas's own frame, from cache when warm.
- Nothing moves when fresh data arrives (CLS = 0 for b²c regions).
- If b²c fails, Canvas's own dashboard shows within 1.5 s. It never goes blank.

## 1. Stance

b²c is a general product: any Canvas, either dashboard (decisions, 2026-10-19).
Canvas now ships two dashboards:

| Canvas view | What b²c does |
|---|---|
| Classic **Card View** (`#DashboardCard_Container`) | **b²c course grid** replaces the card grid. **b²c side panel** replaces `#right-side` content |
| Classic **List View** (planner, `body.dashboard-is-planner`) | Native. Dark mode only |
| Classic **Recent Activity** | Native. Dark mode only |
| Widget dashboard, **Courses** tab | **b²c course grid** replaces the InstUI card grid. **b²c side panel** is added as a right column |
| Widget dashboard, **Dashboard** tab (Course work, grades, announcements, people widgets) | Native. Dark mode only. Its widgets already cover what our panel would add |

Why b²c draws its own regions instead of decorating Canvas's:
- **One coherent design** on both dashboards. the owner wants b²c's own design
  language, not bc's and not a patchwork.
- **Robust.** The widget dashboard is InstUI with hashed classes, so decorating
  its cards would break with each Canvas release. Owning the region needs one
  anchor per region.
- **No layout shift.** b²c knows its card height before data arrives.

**State stays Canvas's.** Card colour (`/users/self/colors`), name (course
nicknames, shown everywhere, per the owner), order (`dashboard_positions`), and
which courses show (favourites, as Canvas does) are all read from and written
to Canvas. So the b²c grid, Canvas's own views, and the Canvas apps always
agree. Only b²c-specific additions live in b²c storage: card images, custom
links, hidden cards, gradient style, notes, local to-do items, and labels.

When **every** grid feature and every panel feature is off, b²c draws nothing
and Canvas's dashboard is untouched.

## 1a. Draft 2: decorate Canvas's cards, own only the panel

Research's live capture (`research/canvas-live.md`) shows that **the new
dashboard's Courses tab still renders classic `.ic-DashboardCard` cards**. So
one set of stable selectors covers both dashboards' card grids. Draft 2
therefore:
- **Decorates Canvas's cards in place** (Dev's lane already builds the due list,
  grade chip and edit menu as standalone render functions). Canvas keeps its own
  card menu for free (Color, Nickname, Move, Unfavorite), and the Nickname is
  exactly the owner's "show everywhere" rename.
- **Reserves space pre-paint:** a gated rule gives `.ic-DashboardCard` a fixed
  `min-height` (from the "Number shown" setting via the mirror), so the due list
  and chip fill reserved space and the card never grows.
- **Owns only the side panel,** which has to be b²c's own mount on the new
  dashboard because it has no `#right-side`.
- **Keeps own-grid (§2–4) as the fallback design** if Canvas ever drops
  `.ic-DashboardCard`. The render functions remount into a b²c grid.

**One card menu (direction A, decided):** b²c's **⋮** takes the place of
Canvas's ⋮, in Canvas's spot, as a **superset** of Canvas's own menu:
- Color, Rename (Canvas nickname), Move (to top/up/down/bottom), Unfavorite:
  Canvas's items, rebuilt on the same APIs
- then Image, Links, Set grade goal…, Hide
- then "Dashboard settings…"

Canvas's native ⋮ is hidden only on cards b²c has decorated
(`[data-b2c-card]`). If b²c fails, Canvas's own menu is still there. There's
no second button on the card. (This replaces the "✎ Customize" idea in draft 2.)

## If own-grid is ever used: what it must keep (Dev's question)
Canvas card parity:
- whole-hero link
- course colour and image with overlay
- nickname, course code and term
- the tab links row with unread badges and Canvas's hidden-tab rules
- the ⋮ menu: Color picker (Canvas palette + hex), Nickname, Move to top/up/down/bottom, Unfavorite
- the "All courses" link
- keyboard and screen-reader parity

Pre-paint: hide the native grid **only when a localStorage grid snapshot
exists**, and paint from it synchronously. On a cold load with no snapshot, the
native grid shows and b²c doesn't take over until the next load. There's never
a hidden-then-fallback window.

## 2. Mount and pre-paint (own-grid fallback design)

- A gated rule (`html[data-b2c-grid]`) sets the native grid region to
  `visibility: hidden` with its space kept. The b²c grid mounts beside it and
  paints from the stale-while-revalidate cache on the first frame. Once the
  b²c grid is mounted, the native grid is set to `display: none`.
- **Fallback:** if the b²c grid hasn't mounted within 1500 ms, the attribute is
  removed and the native grid shows. The health view records it.
- **Cold cache** (first ever load): the grid renders its final geometry with
  skeleton rows (§4.4), sized from the course count in Canvas's own skeleton or
  from `ENV`. Data fills in without moving anything.
- Canvas re-renders its own container (cards render three times: skeleton,
  cached, fresh). The b²c grid lives in its own shadow-root host as a
  **sibling**, so React never discards it. Dev decides the exact mount point.

## 3. Layout

```
┌ Canvas header / tabs (native) ───────────────────────────────┬──────────────┐
│ ┌ card ┐ ┌ card ┐ ┌ card ┐                                    │ side panel   │
│ │      │ │      │ │      │      b²c course grid              │  To do       │
│ └──────┘ └──────┘ └──────┘                                    │  Notes       │
│ ┌ card ┐ ┌ card ┐                                             │  GPA         │
└──────────────────────────────────────────────────────────────┴──────────────┘
```

- **Grid:** CSS grid,
  `repeat(auto-fill, minmax(var(--b2c-card-w, 262px), 1fr))`, gap
  `var(--b2c-card-gap, 24px)`. Card width, gap and corner radius are the
  `card-customization` layout sliders. The defaults match Canvas's card
  geometry, so turning b²c on doesn't feel like a different site.
- **Side panel:** 288 px, Canvas's own `#right-side` width, with 24 px left
  padding. At widths under the panel breakpoint (Canvas's: 992 px with the
  course nav collapsed, 1140 px open), the panel stacks **above** the grid as a
  full-width strip, with each section collapsed to its header and a count.
  Canvas puts its sidebar below. Ours goes above because the to-do list is the
  most time-sensitive thing on the page.
- **Full width** (`full-width`) lifts the 1366 px max width. Cards then flow into
  more columns, and the panel stays 288 px.

## 4. The b²c course card

```
┌──────────────────────────────┐
│ [88.4% A−]              [⋯]  │  hero: course colour, or image + overlay. 120 px (condensed: 64 px)
│                              │
├──────────────────────────────┤
│ Calculus II     │  name (nickname) in text colour: the hero is the course-colour channel
│ MTH-252-001 · Fall 2026      │  code · term, secondary
│ 📣¹  ✎  💬  📁  [WA] [GD]     │  Canvas tab links with unread badges, then up to 4 custom links
├──────────────────────────────┤
│ Due · 3                      │
│ ☐ Problem set 6   Tomorrow 11:59 PM │
│ ☐ Quiz 4          Fri 11:59 PM      │
│ ☐ Reading resp.   Overdue 2d        │  overdue is the only loud thing on a card
└──────────────────────────────┘
```
(The emoji above stand in for Canvas's own line icons.)

### 4.1 Regions
- **Hero:** the whole hero is a link to the course home. **Grade chip**
  (`card-grades`) at top-left, **⋯ menu** (`card-customization`) at top-right.
  The menu shows on hover/focus of the card (opacity only, 120 ms) and always
  on touch.
- **Title block:** a link to the course home. The name is clamped to 2 lines,
  and the full name is in the `title` attribute.
- **Links row:** Canvas's own tab links (Announcements, Assignments,
  Discussions, Files) with unread badges, as Canvas shows them, then the
  custom links (favicon 16 px). Each is a 32 × 32 hit target.
- **Due list** (`card-assignments`): see `card-assignments.md`.

### 4.2 Height is fixed
Card height =
`hero + title block (2 lines reserved) + links row + due header + N × row height`,
where N is the "Number shown" setting. Every card in the grid has the same
height, so rows of cards align, as in Canvas. A card with fewer items shows its
empty rows as space. Empty states (§4.4) sit in the first row. Nothing grows
when data arrives.

### 4.3 On-card editing (⋯ menu)
- **Color…**: swatches (Canvas's palette plus "Custom" hex). It writes the
  Canvas colour and recolours instantly (optimistic).
- **Rename…**: inline edit of the title. Enter saves and writes the Canvas
  nickname, Esc cancels. "Reset to course name" clears it.
- **Image…**: URL field or "Use Canvas image" / "No image".
- **Links…**: 4 slots, each Default / None / Custom URL.
- **Hide card**: there's an Undo toast. Unhide from settings, or from "Hidden
  cards (n)" at the end of the grid.
- **Move**: drag the card by its hero, or use keyboard Move left/right from the
  menu. Writes `dashboard_positions`.

The writes to Canvas (colour, nickname, position) say so in the menu's footer
line: "Saved to your Canvas account."

### 4.4 States
| State | What shows |
|---|---|
| Warm cache | Final content immediately. Revalidates silently. Changed rows update in place with no animation |
| Cold | Skeleton rows: `surface-raised` bars at 60% and 30% width, a slow 1.6 s pulse (none under reduced motion) |
| Nothing due | One row: "Nothing due in the next 2 weeks", secondary |
| No grade | Chip reads "No grade" in secondary on a translucent chip |
| Totals hidden by the course | No chip |
| API error | Last cached data plus a small "⚠ Couldn't refresh" in the due header, with a tooltip giving the time of the last success. Never "Nothing due" when we don't know |
| Course concluded | Card hidden unless favourited, as Canvas does |

### 4.5 Keyboard and screen reader
- The grid is a list of cards (`role=list` and `listitem`). Tab order within a
  card: hero link, grade chip (if it's a link), ⋯, title link, tab links, due
  rows (checkbox, then title link).
- Each card is labelled "MTH-252, Calculus II, 88.4 percent, 3
  due".
- Arrow keys aren't hijacked. Standard Tab only.

## 5. The side panel
Sections in order: **To do** (`better-todo`), **Notes** (`dashboard-notes`),
**GPA** (`gpa-calculator`), and **Recent feedback** (Canvas's own block, kept
unless `hide-recent-feedback`). Each section header has the title, a count where
it makes sense, and a collapse chevron. Collapsed state is remembered. Sections
whose feature is off aren't drawn.

## 6. Visual language for b²c regions (v1: coherent, not final)
the owner: "ux flow matters most for rn … the bones should be good". This
section fixes the bones, and the visual pass comes later.
- Type: Canvas's face (`--b2c-font-canvas`, inherited), with the sizes Canvas
  uses on cards (title 16/600, meta 14/400, rows 14/400, small 12).
- Colour: `--b2c-w-*` tokens only. These are Canvas-light values by default and
  dark-mode roles under dark mode. Course colour is identity (hero fill, the
  2 px row marker in the to-do list) and the only saturated colour besides
  overdue.
- **Shape: square** (the owner). Every radius comes from `--b2c-corner` (2 px): cards, chips, badges, inputs and menus. There are no pills or circles. On decorated cards b²c also squares Canvas's unread badges and the grade chip.
- Elevation: Canvas's card shadow in light; a border in dark.
- Motion: hover reveals 120 ms opacity; completion 280 ms; nothing else moves.
