# studio: where b²c is customised

*Design, v2 draft 1, 2026-10-20. It replaces the settings page (`options_page`;
the popup stays as A). The reference prototype is
`design/v2/studio/index.html` (60 headless checks), and its `concept.md` has
the full control map. The primitives and theme format are in `rice.md`.
the owner's brief: settings should feel like "touching the components and
styling of the site", not "a grey list of words".*

**Acceptance:**
- Every Look primitive is changed by clicking the thing on a live Canvas
  stage. Every change is live on the stage and in open Canvas tabs, and is one
  Undo step.
- Feature settings that aren't visual stay one click away, with search over
  everything.
- Share then Import round-trips byte-for-byte.
- Input to present: under 50 ms for a slider or handle on the stage, and one
  frame for a swatch.

## Layout
- **Top bar:**
  - title, "<Light|Dark> theme on stage · <theme name>"
  - search (`/`)
  - Undo/Redo
  - Import…, and Share ▾
- **Theme bar:**
  - a gallery of chips, each a tiny Canvas in its theme, grouped Light · Dark ·
    My themes
  - the two slots, **Light theme** and **Dark theme** ("In use now" marks the
    active one)
  - **Use dark theme:** Never · Always · Match system · Scheduled
- **Left rail:**
  - **Look:** Palette · Shape · Type · Layout · Views. Each jumps to the part
    that best shows it.
  - **Features:** Dashboard · To-do · Grades · Pages · Dates and time · Custom
    CSS · Backup · Sites · Toolbar popup · About. Navigation (Pins, Search)
    joins these.
- **Stage:** a live, scaled Canvas with tabs Dashboard · Course page ·
  Grades, painted only from custom properties.
- **Inspector:** in a right gutter, level with the selected part and joined to
  it by a dashed leader line, so it never covers what it changes. The stage
  never rescales when something is selected.
- **Footer line:** "Live in N open Canvas tabs".

## Direct manipulation
- **Hover** outlines and names a part. **Click** selects it and opens its
  inspector. Breadcrumbs walk up the tree, and Esc deselects.
- **Card handles:** the right edge is width, the inner corner square is
  corner (one dial for every b²c shape; the inspector says so), and the hatched
  gap is gap.
  - Each handle is a `role=slider` with a value label. Arrows move it 1,
    Shift 10, and Home/End go to the limits.
  - A drag commits one Undo step on release.
- **The control map** for each part is in the prototype's `concept.md`
  ("Where each control lives"). In short:
  - page background → all 14 roles and page width
  - a role → swatch, hex, eyedropper, "School colour" (link, accent, nav),
    this theme's colours, a same-hue ramp, and a contrast table (WCAG ratio and
    grade, APCA Lc, against the floors; it warns and never blocks)
  - card → layout, shape, face, height, card due view, and this card's colour
    (marked Personal, written to Canvas)
  - text → type and density
  - nav → nav roles and School/Theme
  - To do → view thumbnails, count, side, section order
  - Notes, GPA, Goal → their feature settings
- ↺ appears on any control that differs from the last applied or saved theme
  (feature rows: from b²c's default). Its slot is always reserved.

## Themes, remix, share, import
- **Picking a chip** fills the slot its palette names and overrides only what
  the theme names. Its course colours are **offered**, never applied silently.
- **Remix is implicit:** after any edit the header reads "Edited from Nord ·
  Save as new theme… · Revert".
- **Share ▾** has Copy theme (`b2c-theme:`) and Copy full rice (includes CSS,
  `b2c-rice:`), each with Save file. Encoding: JSON → deflate-raw → base64url.
- **Import** takes a string, a file or a `#b2c-theme:` link and previews on
  the stage. Nothing changes until Apply. The preview shows:
  - what it changes
  - contrast warnings
  - unknown fields, which are kept
  - for a rice: "Includes custom CSS (N lines) · View CSS", the sanitising
    result, and "Replaces your custom CSS"

  The choices are Apply · Apply without CSS · Cancel. "Revert import" stays in
  the header for the session.
- **Importers** (bc codes, base16, Catppuccin, pywal) use the same preview and
  add "Fix contrast" (rice.md).

## Features mode
Clicking a Features entry opens a 452 px column of rows beside a smaller live
stage.
- Hovering a row outlines what it changes on the stage.
- Rows with a visible effect carry a small live preview (mini card, dates, GPA
  rounding, logo, tab icon, dim images, quiz pages).
- The rows, labels and keys are those in `settings.md`.

## Deep links
`options.html#<feature-id>` (and `#todo`, `#gpa`, `#goal`) opens the Studio
with that part **selected on the stage**. Feature-only ids open the Features
row, highlighted for 1.5 s. `#b2c-theme:<code>` opens the Import preview.

## Decided by the owner (2026-10-20, gold star)
- **Keep the small stage.** The miniature reads as a friendly abstraction
  ("i kind of like the smaller version because it feels like im seeing an
  abstraction"). The side-panel Studio is optional at most and not a priority.
- **The ring is round** (`todo-views.md`). The Studio's view thumbnail uses
  the round one.
- **Keep the placeholder presentation.**
- **Fewer colours:** see the colour budget in `rice.md`.

## Build review (Design, 2026-10-20, Dev's v2 Studio)
- Input-to-present: about 8 ms median and 21 ms max (target 50 ms). Pass.
- The per-card colour control was removed from the stage, because the sample
  cards aren't her courses. Accepted. **Later:** the stage shows her real
  courses from cached dashboard data (fictional samples as fallback), and then
  per-card colour returns.
- Fixes asked of Dev:
  - the stage greeting and courses used the owner's real identity; use the
    fictional persona
  - overdue text should read "Overdue 3d"
  - theme chip names were truncated
  - bundle Lato for the stage
- For the owner's hands-on pass: the eyedropper and real clipboard (untestable
  headless).

## Open
- Measure input-to-present on the real build. The eyedropper is untested
  headless.
