# Settings: labels, grouping, order, controls

*Draft 1, 2026-10-19, from Research's features.md v0. Keys are placeholders
(`?key`) until Dev's `dev/schema.json` exists. Then each `?key` becomes the real
key, and the build checks it.*

## Shape: two doors, one app

The same Preact app has two hosts. The **popup** is a remote control. The
**settings page** is the whole panel. There's no Save button anywhere: every
control applies on change, and the open Canvas tabs update within one frame
where possible.

### Popup (toolbar button), 360 px wide, never scrolls
Top to bottom, at most 8 controls:
1. **Dark mode**: segmented **Off · On · Match system · Scheduled**. Below it, a
   row of **style chips**, each painted in its own palette (bc 5.10's best idea),
   plus a "Custom" chip once she has edited colours.
2. **Show original on this page**: a switch, shown when the active tab is
   Canvas. While dark mode isn't in effect it's dimmed and disabled, with the
   description "Dark mode isn't on right now". It's temporary and lasts for that tab until it
   navigates. It's the escape hatch for a diagram or page that dark mode
   mangles.
3. **On this page:** up to 4 switches for the b²c features that act on the
   page type of the active tab. The popup is about *this page*, never a second
   settings page (Director's input, 2026-10-19).
   - Dashboard: Assignments on cards · Grades on cards · Improved to-do list · GPA calculator
   - A course's Grades page: Grade goals · GPA calculator
   - Any other course page: Color course tab icons
   - Other Canvas pages: nothing (the section isn't drawn)
   - A non-Canvas tab: dark mode controls are disabled, and only "All
     settings…" is live
4. **All settings…** (⌘,) opens the settings page in a tab, scrolled to the
   current section.
`Esc` closes it. Every control is in tab order, with a visible focus ring.

### Deep links into the settings page (the surface gear)
`options.html#<feature-id>` scrolls to that feature's row and highlights it for
1.5 s (a `--b2c-ui-accent` 2 px left bar that fades out). It's used by:
- the ⚙ in each side-panel section header (To do, Notes, GPA)
- the card ⋮ → "Dashboard settings…"
- the popup's "All settings…", which opens at the section for the current
  page: on the dashboard → Dashboard; on a Grades page → Grades; elsewhere →
  Appearance

### First-run block
See `surfaces/first-run.md`. It sits above the section index until a Canvas
host is granted, then collapses to a line in Sites.

### Settings page (`options_page`, also "Extension options")
One scrolling page, so every feature is on one page. That's bc's best quality,
and it keeps it.
- **Left:** a sticky section index (Appearance, Dashboard, To-do, Grades,
  Navigation, Backup, Sites, About). Clicking an entry scrolls to it, and the
  index highlights the section in view.
- **Top:** a search field (`/` or ⌘F) that filters rows in place and highlights
  matches. Section headers stay visible while their rows match.
- **Rows:** label, an optional one-line description under it, and the control on
  the right. A **feature** row's tuning rows are nested directly beneath it (bc's
  tile pattern), indented 24 px and dimmed, not hidden, while the feature is off,
  so turning it on never shifts the page.
- **Reset:** per row (it appears on hover as ↺ when the value isn't the default),
  per section, and Reset all. Each offers a 10 s **Undo** toast instead of a
  confirm dialog.
- Max content width 720 px. It follows system light/dark and uses the system font.

- **Nested rows** are disabled (dimmed, not clickable, still visible) while their
  parent feature is off. That's the native convention, and the layout doesn't
  move.
- **Reset all** sits at the foot of About, as a text button on the panel. The
  ↺ slot on each row is always reserved, so a row never shifts.
- **About:** version, "What's new" (a link to a changelog page, never a popup),
  keyboard shortcuts, and "Pause b²c on all sites" (`core.paused`).

Controls, as used throughout:
- **Switch:** on/off for something that applies right away. It's square (a
  rectangular track and square knob, `--b2c-radius-md`), and the whole row is
  the hit target.
- **Segmented:** 2 to 4 mutually exclusive choices that each fit in one word.
- **Menu:** 5 or more choices, or choices with long labels.
- **Stepper:** a small integer (− value +, typeable, arrow keys).
- **Color well:** a swatch plus a hex field, kept in sync. Clicking the swatch
  opens a picker with presets and an eyedropper.

## 1. Appearance

| Label | Control | Default | Feature id | Notes |
|---|---|---|---|---|
| Dark mode | Segmented: Off · On · Match system · Scheduled | Match system | dark-mode | Scheduled shows **From** / **To** time fields underneath (default 20:00 to 08:00) |
| Style | Menu of presets, each with a 3-color chip preview | Dark | dark-mode | "Custom" appears once a color is edited |
| Colors | 10 color wells in 3 groups: Background (bg, surface, raised, border) · Text (text, secondary, tertiary, link) · Navigation (nav, nav text) | from preset | dark-mode | Under a "Customize" disclosure. Live preview in the open tab. Each text role shows its contrast against the surfaces it's used on ("AA 7.2:1 · Lc 62"), with a quiet warning under the floor. It warns but never blocks, and nothing is fixed automatically |
| Quiz pages | Segmented: Leave untouched · Dark mode only | Leave untouched | quiz-safe-mode | While a quiz is being taken, b²c doesn't run at all by default. "Dark mode only" applies the stylesheet and nothing else |
| Navigation bar | Segmented: School colour · Theme colour | School colour | dark-mode | Under Customize. With School colour, dark mode keeps the school's nav colour |
| Documents in dark mode | Segmented: Light · Dimmed · Dark | Light | dark-mode | PDF and Office previews. Dimmed or Dark asks once for the document-viewer permission |
| Dim images | Switch | off | dark-mode | Photos at 85% brightness in dark mode, full brightness on hover |
| Font | Menu: Canvas default · System · (bundled list) | Canvas default | custom-font | No Google Fonts call. Fonts are bundled woff2 files |
| Hide institution logo | Switch | off | hide-logo | |
| Color course tab icons | Switch | off | tab-icons | Tints a course page's favicon with its card color |
| Custom CSS | Code field (monospace, 8 rows, resizable) | empty | custom-css | Under an "Advanced" disclosure. Applies on blur, not on every keystroke |

## 2. Dashboard

| Label | Control | Default | Feature id | Notes |
|---|---|---|---|---|
| Show assignments on cards | Switch | on | card-assignments | |
| ↳ Number shown | Stepper 1–8 | 4 | card-assignments | |
| ↳ Include overdue | Switch | on | card-assignments | |
| ↳ Show completed | Switch | off | card-assignments | |
| ↳ Types | Checkboxes: Assignments · Quizzes · Discussions | all on | card-assignments | |
| ↳ Show grade impact | Switch | off | grade-impact | Adds "−4.2 / +1.8" (percentage points) after each item: how far the course's current score moves at 0 or at full marks. The tooltip states what it assumes ("Current score, ungraded work excluded; Canvas weighting"). It's hidden when the course has no current score or hides totals |
| Show grade on cards | Switch | on | card-grades | |
| ↳ Only on hover | Switch | off | card-grades | |
| Card colors | Button "Set all…" opens a palette sheet | n/a | card-colors | Per-card color is set on the card itself (Canvas native) |
| Customize cards | Switch "Allow on-card editing", plus a list of hidden cards with Unhide | on | card-customization | Rename, course code, image, hide and 4 quick links are edited on the card itself (see surfaces/card-customization.md) |
| ↳ Card layout | Three sliders (Width, Gap, Corner radius), each with a live value and ↺ | Canvas default | card-customization | Drag to reorder cards on the dashboard itself |
| Card style | Segmented: Standard · Gradient | Standard | gradient-cards | |
| Card height | Segmented: Standard · Condensed | Standard | condensed-cards | |
| Color overlay on images | Switch | on | card-overlay | |
| Full width | Switch | off | full-width | |
| Notes | Switch | off | dashboard-notes | |
| Hide Recent Feedback | Switch | off | hide-recent-feedback | |

## 3. To-do

| Label | Control | Default | Feature id | Notes |
|---|---|---|---|---|
| Improved to-do list | Switch | on | better-todo | Replaces the right sidebar's To Do |
| ↳ Number shown | Stepper 3–20 | 8 | better-todo | |
| ↳ Show announcements | Switch | on | better-todo | |
| ↳ Show overdue | Switch | on | better-todo | |
| ↳ Hide completed | Switch | on | better-todo | |
| ↳ Use course colors | Switch | on | better-todo | |
| ↳ Preview on hover | Switch | on | hover-preview | |
| Sync with Canvas planner | Switch | on | better-todo | When on, marking done or removing an item also marks it done or dismissed in Canvas's planner, so it shows in the Canvas apps too. When off, it's b²c only. The description says which, in those words |
| Dates | Segmented: Relative · Absolute | Relative | (shared) | "Due tomorrow at 11:59 PM" vs "Due Oct 21 at 11:59 PM" |
| Time format | Segmented: 12-hour · 24-hour | from system locale | (shared) | |

## 4. Grades

| Label | Control | Default | Feature id | Notes |
|---|---|---|---|---|
| GPA calculator | Switch | off | gpa-calculator | Shows a panel on the dashboard |
| ↳ Grade scale | Menu of presets (see surfaces/gpa-calculator.md) + table editor (letter, minimum %, points) | Suggested per host; for canvas.example.edu: A 4.00 · A− 3.67 · B+ 3.33 · B 3.00 · B− 2.67 · C+ 2.33 · C 2.00 · C− 1.67 · D+ 1.33 · D 1.00 · D− 0.67 · F 0.00 (no A+) | gpa-calculator | Letter → points is the pilot school policy. Percent → letter is only a fallback: b²c uses Canvas's own letter grade for a course when the instructor has set a scheme. GPA is **truncated** to two decimals, as the pilot school does, and the row says so |
| ↳ Courses | One row per course: credits (required), scale (Default or a per-course override), include toggle | credits empty | gpa-calculator | Missing credits show "Credits needed", never a guess |
| ↳ Include previous terms | Switch + "Previous GPA" and "Previous credits" fields | off | gpa-calculator | Labelled "Cumulative GPA" when on, "Term GPA" when off |

**Open:** what-if (`what-if`), class statistics (`class-stats`) and goals
(`grade-goals`, pending the owner) wait on Research's detail. `global-search` (⌘K
across courses) is a v1 stretch. If it lands, it gets a Shortcuts row under About.

## 4b. Navigation

| Label | Control | Default | Feature id | Notes |
|---|---|---|---|---|
| Pins | Switch | off | pins | Week-aware bookmarks. See surfaces/pins.md |
| ↳ Show on the dashboard | Switch | on | pins | |
| ↳ Show under the course menu | Switch | on | pins | |
| ↳ In a course, show | Segmented: This course's pins · All pins | This course's pins | pins | |
| ↳ Show next week's from | Segmented: Thursday · Friday · Never | Thursday | pins | When "this week" pins also preview next week |
| Search (⌘K) | Switch | on | global-search | The shortcut is also listed in About → Keyboard shortcuts |

## 5. Reminders

Shelved for v1 (the owner, 2026-10-19). When it returns: system notifications
from the service worker, opt-in, never pop-ups drawn on other sites.

## 6. Backup (themes)

- **Export look…:** checkboxes (Dark mode colours, Card colours, Card images and
  names, Font, Custom CSS), then **Copy** or **Save file** (JSON with a schema
  version).
- **Import…:** paste or choose a file. It previews in the open Canvas tab
  before **Apply**, and Undo is available afterwards.
- **Export all settings / Import all settings:** a full backup. Round trip:
  export, wipe, import, and the diff is empty.

## 7. Sites

The list of Canvas addresses b²c runs on. canvas.example.edu is first. "Add site…"
requests that host's permission.

## Key map (reconciled with `dev/schema.json`, 2026-10-19)

The label is Design's. The key is Dev's. A ⚠ marks a change Design is asking for.

| Section → label | Key | Control |
|---|---|---|
| Appearance → Dark mode | `dark-mode.mode` ⚠ one enum `off·on·system·schedule`, default `system` (replaces `enabled` + `mode`) | Segmented |
| Appearance → From / To | `dark-mode.start`, `dark-mode.end` | Time |
| Appearance → Style | `dark-mode.preset` ⚠ (pending, dark lane) | Style chips |
| Appearance → Colors | `dark-mode.{bg,surface,surfaceRaised,border,text,textSecondary,textTertiary,link,nav,navText}` ⚠ (dark lane) | Color wells |
| Appearance → Navigation bar | `dark-mode.navStyle` (`school·theme`) | Segmented |
| Appearance → Dim images | `dark-mode.dimImages` | Switch |
| Appearance → Quiz pages | `core.quizSafe`: `nothing` = "Leave untouched", `colours` = "Dark mode only". The default is `nothing` | Segmented |
| Appearance → Font | `custom-font.family` (+ `custom-font.localFamily` when "Installed" → label "A font on this computer…") | Menu |
| Appearance → Hide institution logo | `hide-logo.enabled` | Switch |
| Appearance → Color course tab icons | `tab-icons.enabled` | Switch |
| Appearance → Custom CSS | `custom-css.enabled` + `custom-css.css` | Switch + code field |
| Dashboard → Show assignments on cards | `card-assignments.enabled` | Switch |
| ↳ Number shown | `card-assignments.count` (1–8) | Stepper |
| ↳ Include overdue | `card-assignments.overdue` | Switch |
| ↳ Show completed | `card-assignments.showCompleted` | Switch |
| ↳ Types | `card-assignments.{assignments,quizzes,discussions}` | Checkboxes |
| ↳ Show grade impact | `grade-impact.enabled` | Switch |
| Dashboard → Show grade on cards | `card-grades.enabled`, `card-grades.hoverOnly` (pending) | Switch |
| Dashboard → Card style | `gradient-cards.enabled` (false = Standard, true = Gradient) | Segmented |
| Dashboard → Card height | `condensed-cards.enabled` (Standard / Condensed) | Segmented |
| Dashboard → Color overlay on images | `card-overlay.overlay` | Switch |
| Dashboard → Page width | `full-width.width` (`standard·wide·full`) | Segmented |
| Dashboard → Notes | `dashboard-notes.enabled` (pending) | Switch |
| Dashboard → Hide Recent Feedback | `hide-recent-feedback.enabled` | Switch |
| To-do → Improved to-do list | `better-todo.enabled` | Switch |
| ↳ Number shown | `better-todo.count` (3–20) | Stepper |
| ↳ Show announcements | `better-todo.announcements` | Switch |
| ↳ Show overdue | `better-todo.showOverdue` | Switch |
| ↳ Hide completed | `better-todo.hideCompleted` | Switch |
| ↳ Use course colors | `better-todo.courseColors` | Switch |
| ↳ Preview on hover | `better-todo.hoverPreview` | Switch |
| To-do → Sync with Canvas planner | `core.plannerSync` (shared by cards and to-do) | Switch |
| To-do → Dates | `core.dates` (`relative·absolute`, shared) | Segmented |
| To-do → Time format | `core.clock` (`system·12·24`, shared) | Segmented: System · 12-hour · 24-hour |
| Grades → GPA calculator | `gpa-calculator.enabled` | Switch |
| ↳ Grade scale | `gpa-calculator.scale` (null = preset suggestion) | Preset menu + table |
| ↳ Rounding | `gpa-calculator.rounding` (`auto` = the preset's rule) | Segmented: Automatic · Truncate · Round |
| ↳ Courses | `gpa-calculator.courses` | Rows |
| ↳ Include previous terms | `gpa-calculator.includePrevious`, `.priorGpa`, `.priorCredits` | Switch + 2 numbers |
| ↳ Show GPA above cards | `gpa-calculator.aboveCards` | Switch |
| (not in the UI) | `gpa-calculator.creditWeighted` is always true for college; hide it unless a non-credit preset needs it | n/a |
| Grades → Grade goals | `grade-goals.enabled` | Switch |
| Backup → Saved looks / Undo last import | `themes.saved`, `themes.previous` (data, not controls) | List + Undo |
| Backup → Reset all settings (Dev's ui lane put it here instead of About; accepted) | n/a | Text button + Undo toast |
| Navigation → Pins | `pins.enabled` | Switch |
| ↳ Show on the dashboard | `pins.dashboard` | Switch |
| ↳ Show under the course menu | `pins.courseNav` | Switch |
| ↳ In a course, show | `pins.scope` (`course·all`) | Segmented |
| ↳ Show next week's from | `pins.upcomingFrom` (`thu·fri·never`) | Segmented |
| (data) | `pins.list` | n/a |
| Navigation → Search (⌘K) | `global-search.enabled` | Switch |
| About → Pause b²c on all sites | `core.paused` | Switch |
| About → Install updates automatically | `core.autoUpdate` | Switch |
