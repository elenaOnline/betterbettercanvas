# dark-mode

*Design, draft 1, 2026-10-19. Evidence: `study/canvas-rendering.md` §1.5, §5, §6, §9;
`study/bc-current.md` §1; `study/bc-history.md` (dark mode by era);
`study/comparables.md` §1.*

**Acceptance:** with dark mode on, no frame of any Canvas page shows a light
background where a dark one belongs. This holds on hard reload, new tab and
in-app navigation, under 6× CPU throttle. Every specimen page (§9) has no
half-light region. Toggling in the popup changes open tabs within one frame, with
no reload. Teacher-authored content stays readable without losing its meaning.

## 1. What it is

Canvas has no dark mode for the web app (study §1.5). b²c's dark mode should read
as **"Canvas, dark"**, as if Instructure had shipped it, rather than as a foreign
skin. Concretely:
- Surfaces use a slate palette close to Instructure's own unreleased dark
  dashboard (#1B2330 / #1F2D3D / #253443), tuned until it passes our contrast
  floors.
- **The school stays the school.** the pilot school's nav green and the pilot school's link hue carry
  through into dark (§4), and course colours stay as the course's identity.
- It's never a filter invert, and never a heuristic DOM walk (bc's "fixer" is
  dropped).

## 2. Settings (labels in `settings.md` → Appearance)

| Key (proposed) | Control | Values | Default |
|---|---|---|---|
| `dark-mode.mode` | Segmented | Off · On · Match system · Scheduled | Match system |
| `dark-mode.start` / `.end` | Time fields, shown under Scheduled | | 20:00 / 08:00 |
| `dark-mode.preset` | Style chips | Dark · Gray · Black · Warm · Custom | Dark |
| `dark-mode.<role>` × 10 | Color wells under "Customize" | see §3 | from preset |
| `dark-mode.nav` | Segmented | School colour · Theme colour | School colour |
| `dark-mode.images` | Switch "Dim images" | | off |
| (per tab) | Popup switch "Show original on this page" | | off |

- **Match system** and **Scheduled** switch live at the boundary. Neither
  reloads, and neither polls (`matchMedia` change events, plus one `setTimeout`
  to the next boundary).
- Choosing a preset rewrites the 10 roles. Editing any role sets the preset to
  Custom.
- **Show original on this page:** a temporary per-tab off (sessionStorage),
  cleared when the tab navigates to another Canvas page. It's the escape hatch
  for a page dark mode gets wrong. It lives in the popup, and also as a
  keyboard shortcut if Dev adds one.

## 3. Roles and presets

Ten roles. The values are in `palettes.json` and checked by `check_palettes.py`
(WCAG and APCA floors per role, against the pilot school's and Canvas's default branding). A
rendered check comes next.

| Role | Used for | Dark | Gray | Black | Warm |
|---|---|---|---|---|---|
| `bg` | page, behind everything | #18212d | #1e1e1e | #000000 | #251f19 |
| `surface` | cards, panels, sidebar boxes, table rows, modals | #212b37 | #282828 | #101010 | #2f2923 |
| `surface-raised` | menus, popovers, hover, selected, inputs' trays, headers of tables | #2b3541 | #313131 | #1c1c1c | #39332c |
| `border` | dividers, input borders, card outlines | #444e5b | #4a4a4a | #353535 | #524c45 |
| `text` | body and headings | #e8edf4 | #ededed | #e8e8e8 | #f3e9df |
| `text-secondary` | metadata, timestamps, descriptions | #bec3c9 | #c2c2c2 | #bebebe | #cac1b6 |
| `text-tertiary` | placeholders, disabled, hints | #a2a7ac | #a6a6a6 | #9e9e9e | #aea49a |
| `link` | links, focus rings, selection tint | school | school | school | school |
| `nav` | global nav | school | school | school | school |
| `nav-text` | global nav icons and labels | #ffffff | #ffffff | #ffffff | #ffffff |

**Elevation is lightness, not shadow.** bg < surface < surface-raised. Canvas's
shadows are muted to `0 0 0 1px var(border)` on cards and `0 4px 16px
rgba(0,0,0,.5)` on popovers.

## 4. Derived colours (static CSS, relative colour syntax, Chromium ≥ 119)

"School" values come from Canvas's brand variables at runtime. No script is
involved, and they're correct for any institution:

```css
--b2c-dm-link:   oklch(from var(--ic-link-color) 0.80 min(c, 0.11) h);   /* the pilot school #005F85 → #7dc8f3 */
--b2c-dm-accent: oklch(from var(--ic-brand-primary) 0.50 max(c, 0.08) h); /* the pilot school #213921 → #466f46, white text 5.8:1 */
--b2c-dm-nav:    var(--ic-brand-global-nav-bgd);                         /* the pilot school #213921 */
```

- **Nav:** "School colour" keeps the pilot school's dark green nav, which already sits well
  with dark surfaces. "Theme colour" uses `surface`. If a school's nav colour
  fails 4.5:1 with `nav-text`, Dev falls back to `surface`. That needs a JS
  check once per page, so it only matters for non-the pilot school hosts.
- **A user-set link colour wins:** the mirror sets `--b2c-dm-link` only when the
  preset is Custom.
- **Status colours,** lifted for dark and fixed across presets:
  - success #6fcf97, from Canvas `#03893D`
  - danger #ff8a80, from `#E62429` / `#C71F23`
  - warning #ffb37a, from `#F06E26` / `#CF4A00`
  - info = link

  Status *tints* (Canvas's pale bgs #DCEEE4, #FCE4E5, #FCE5D9, #E0EBF5) become
  `color-mix(in oklch, <status> 16%, var(surface))`.
- **Course colours as text** (to-do titles, planner): `oklch(from <course>
  max(l, 0.72) c h)`. **As fills** (card heroes, stripes, chips): unchanged.
  They're identity.
- **Hover** (Canvas #EEF7FF): `color-mix(in oklch, var(link) 10%, var(surface))`.
  **Selected** (#D9EDF9, #E0EBF5): 18%. **Text selection:** 35%.

## 5. Mechanism (recommendation to Dev; Dev owns the how)

Canvas colours come from four sources (study §5–6), and each needs its own layer:

**(a) Brand variables:** about 25% of colour uses. The derived school
colours (§4) are computed **on `<html>`** from Canvas's original values. The
remap of Canvas's variables happens **on `body`**. Remapping on `<html>` would
make `--b2c-dm-link` and `--ic-link-color` a cycle, and both would go invalid.
`body` inherits the already-resolved derived colours. Remapped on
`html[data-b2c-dark="on"] body`: `--ic-brand-font-color-dark` → text,
`--ic-link-color` → link, `--ic-brand-primary` and button bgds → accent, nav vars
→ nav and nav-text. The computed `-lightened-15/-28` tints → text-secondary.

**(b) Compiled SCSS literals: generate, don't hand-write.** the pilot school's live
`common.css` (`dev/mock-canvas/vendor-live/…/common-*.css`, 385 KB) uses about 50
distinct colours, and seven of them account for most uses (`#fff` ×190, `#e8eaec`
×82, `#273540` ×26, `#f2f4f4` ×20, `#6a7883` ×17 …). A build step parses Canvas's
CSS bundles and, for every declaration whose value is in the **literal map** (§6),
emits the same selector, gated, with the role variable. This makes coverage
complete by construction, with no hunting for selectors. Re-run it when Canvas
ships new CSS. The health view can flag bundles seen on the page that the
generator hasn't processed.

**(c) InstUI runtime styles** (emotion, hashed classes, inserted through CSSOM):
a `world: "MAIN"` script at document_start wraps
`CSSStyleSheet.prototype.insertRule` and the emotion `<style>` text. It rewrites
each literal in the map to `var(--b2c-lit-fff, #FFFFFF)`. Those variables are
defined only under `html[data-b2c-dark="on"]`. So when dark mode is off every
rule falls back to its original literal (zero visual change), and toggling
stays live, with no re-scan and no observer loop. If Dev judges a main-world
patch too invasive, the fallback is (b)-style rules on `[class*="-view"]` and
similar, accepting some light islands, which is what Instructure's own dark
dashboard does.

**(d) Hand rules:** the small set of judgement calls in §7: elevation per
surface, nav, user content, images, iframes, skeletons.

There are **no colour transitions** when the theme switches. Animating hundreds
of elements is jank, and an instant flip is what native apps do. While
switching, set `html[data-b2c-switching]` for one frame with `* { transition:
none !important }` to suppress Canvas's own transitions.

## 6. Literal map (Canvas colour → role, by property)

| Canvas literal | as `background*` | as `color` / `fill` | as `border*` / `outline` |
|---|---|---|---|
| #fff, #ffffff, white | bg (surface on the hand-listed cards/panels, §7) | text (it's on a coloured fill; leave if the bg is a course colour or a status) | border |
| #f2f4f4, #f5f5f5, #f9fafa, #f0f0f0, #eee, #f7f7f7 | surface | (n/a) | border |
| #e8eaec, #e5e5e5, #ddd, #d7dade, #c7cdd1, #c1c7cf, #ccc | surface-raised | text-tertiary | border |
| #273540, #2d3b45, #333, #3d454c, #444, #000 | bg (rare; tooltips → surface-raised) | text | border |
| #334451 (oxford, `surfaceDark`) | surface-raised | text | border |
| #3f515e, #4a5b68, #555 | (n/a) | text-secondary | border |
| #586874, #6a7883, #6b7780, #666, #777 | (n/a) | text-secondary | border |
| #8d959f, #9ea6ad, #888, #999, #aaa, #bbb | (n/a) | text-tertiary | border |
| #eef7ff (hover) / #d9edf9, #e0ebf5 (selected) | hover / selected mix (§4) | (n/a) | (n/a) |
| #dceee4 / #fce4e5 / #fce5d9 (status tints) | status tint (§4) | (n/a) | (n/a) |
| #03893d, #027634 / #e62429, #c71f23, #b94a48 / #f06e26, #cf4a00 / #2b7abc, #0e68b3 | status fill, unchanged (white text stays) | lifted status (§4) | lifted status |
| #ff0, #eedc94 (highlight) | `color-mix(in oklch, #ffd54f 28%, var(surface))` | (n/a) | (n/a) |

`rgb()` and `rgba()` forms map the same way. Alpha is preserved: an rgba white
overlay becomes the role with the same alpha. Anything unmapped is left alone and
listed by the generator, so Design can decide it.

## 7. Hand rules (judgement calls)

- **First paint:** `html { background: var(bg); color-scheme: dark }`, so native
  scrollbars, selects, checkboxes and date pickers go dark.
  `.ic-DashboardCard__placeholder-svg` and the other skeleton fills use
  `surface` and `surface-raised`, so the card skeleton pulses dark-on-dark, not
  grey-on-white.
- **Elevation:** these sit on `surface`:
  - `.ic-DashboardCard`, `.ic-DashboardCard__header_content`
  - `#right-side .events_list`, `.ToDoSidebarItem`
  - `.ig-header` and `.ig-row` (modules/assignments)
  - `.ui-dialog`, `.ui-widget-content`
  - InstUI Modal and Popover (role `dialog`)
  - `#grades_summary` rows (alternate rows = surface-raised at 50%)

  Menus, popovers and tooltips sit on `surface-raised`. The page sits on `bg`.
- **Global nav:** `nav` / `nav-text`. The active item's white "pill" becomes
  `color-mix(in oklch, #fff 14%, var(nav))` with `nav-text`, and the badge keeps
  Canvas's colours. The the pilot school logo stays (it's white on green by design).
- **Course nav** (`#section-tabs`): text-secondary. The active item gets text,
  bold, and a 2px `link` left border instead of Canvas's #273540.
- **Dashboard card heroes:** the course colour stays. Canvas's 60% colour
  overlay on images stays (`card-overlay` decides). The title strip below the
  hero is `surface`, and the course name is in `oklch(from course max(l,0.72) c h)`,
  as Canvas does in light.
- **User content** (`.user_content`, `.show-content`, discussion entries, the
  RCE): this is where bc failed (PR #234).
  - Text without an authored colour → `text`.
  - Authored **near-black** inline colours (`[style*="color: rgb(0, 0, 0)"]`,
    `#000`, `#000000`, `rgb(51, 51, 51)`, `#333`, `#2d3b45`, `#273540`) → `text`.
    Authored **saturated** colours (red emphasis and the like) are kept but
    lifted with `oklch(from currentColor max(l, 0.72) c h)` where they're
    authored as text. This needs Dev to verify that relative colour on
    `currentColor` resolves on the element (Chromium does). If it doesn't,
    keep the original.
  - Authored **backgrounds** (`[style*="background"]`, `td[bgcolor]`,
    highlights) keep their colour and get `color: #1b2330` text. Teachers'
    backgrounds are light by assumption, since they were authored on white
    Canvas, so the pair stays readable.
  - Tables: borders → border, `th` → surface-raised.
- **Images:**
  - Photos are untouched.
  - Transparent diagrams in user content (`.user_content img`) get
    `background: #fff; border-radius: 2px` so black-on-transparent line art
    stays visible. On an opaque photo it's invisible.
  - **Equation images** (`img.equation_image`, the RCE math editor's output,
    black glyphs on transparent; for example in maths courses) get
    `filter: invert(1) hue-rotate(180deg) brightness(0.93)`. They read as
    `text`-coloured math inline, not as white boxes. MathJax and MathML are
    text, so they already inherit.
  - "Dim images" (off by default): `img:not(.equation_image), video
    { filter: brightness(.85) }`, with the filter cleared on hover.
- **Iframes:**
  - Same-origin iframes (the RCE editor body, which is the TinyMCE
    `what_gets_loaded_inside_the_tinymce_editor` CSS, and same-origin LTI
    pages) get the same sheet (`all_frames`, `match_about_blank`).
  - Cross-origin iframes (YouTube, Panopto, YuJa, Google Docs) are **left as
    they are**. Their frame and border take `border`.
  - **Document previews** (canvadocs PDF/DOCX; Director's ruling 2026-10-20)
    stay light by default, because a light document reads as paper. Setting
    **Documents in dark mode: Light · Dimmed · Dark**:
    - Dimmed = `filter: brightness(.82) contrast(.96)` on the page canvas
    - Dark = `invert(1) hue-rotate(180deg)` on the page canvas with images
      re-inverted, as in Canvas's equation images

    This needs the optional canvadocs host permission, asked for the first
    time she picks Dimmed or Dark, with Chrome's prompt.
- **Focus rings:** Canvas's focus ring colour comes from brand primary, which
  for the pilot school is dark green and invisible on dark. In dark it becomes `link`, 2 px,
  offset 2 px.
- **Quiz pages** (`quiz-safe-mode`): with the default "Leave untouched",
  b²c registers nothing on quiz-taking URLs, so they're light. With "Dark mode
  only", this sheet applies and nothing else does.
- **High Contrast** (Canvas user flag; Director's ruling 2026-10-20): dark
  stays on under HC, but **never lower in contrast than Canvas's own HC**.
  Detect it statically with `html:has(link[href*="high_contrast"])`. Then:
  - `text-secondary` and `text-tertiary` are promoted to `text`. That's ≥ 10:1
    on every surface in all four presets.
  - `link` is underlined. the pilot school-derived link is ≥ 6.8:1 on raised surfaces, so
    under HC links use `oklch(from link 0.93 min(c, 0.08) h)` in dark and `min(l, 0.36)` in light themes, ≥ 7:1 on every bundled theme (`themes/check_themes.py` HC pass).
  - `border` becomes `text-tertiary`, so control boundaries are ≥ 5.8:1.
  - `accent` (filled buttons) drops to L 0.42, so white text is ≥ 8:1 (the pilot school
    green: #2f5830, 8.2:1).
  - The checker gains an HC pass with AAA floors: text, links and controls
    7:1. Any palette, including imported themes, that can't reach them under
    HC falls back to a preset's values for the failing roles only: **Black**
    for dark schemes, and the light **High contrast** preset for light schemes
    (Black's light-on-dark roles can't work on a light page).
    and the Studio says so: "High Contrast is on: some colours adjusted to
    7:1".
- **Dyslexia font:** dark mode doesn't touch fonts. (Covered in `custom-font`:
  b²c's font setting yields to OpenDyslexic.)
- **Print:** `@media print`, dark mode off.

## 8. Popup and settings presentation

- Style chips are 64×40, painted with that preset's `bg`, with a `surface` card
  shape and a `text` line and a `link` line drawn inside: a tiny Canvas page in
  the preset. The selected chip gets a 2 px `--b2c-ui-accent` ring. They're
  labelled below in `--b2c-text-sm`.
- **Customize** shows the 10 roles grouped as Background (bg, surface,
  surface-raised, border), Text (text, secondary, tertiary, link), and
  Navigation (nav, nav-text). Each is a swatch plus hex.
  - Each text role shows its worst contrast across the surfaces it's used on,
    as "7.4:1 · Lc 63". It turns `--b2c-ui-danger` with "Below AA" when under
    its floor.
  - It warns and never blocks or auto-fixes.
  - Link and nav show "School" with a ↺ when they're still derived.

## 9. Specimens (test pages; Dev's fixtures + rendered check)

Each one passes only if no region is half-light:
1. Dashboard, Card View, with the skeleton, cached and fresh renders, and the
   right sidebar To Do and Recent Feedback
2. Dashboard, List View (Planner)
3. Course home and Modules, with item rows and completion icons
4. Assignment page with user content:
   - an authored red span and an authored yellow highlight
   - a table with bgcolor
   - a transparent PNG diagram
   - an equation image
   - an embedded canvadocs PDF and a YouTube embed
5. Grades (`#grades_summary`, with a what-if row and totals)
6. Discussion with the RCE editor open
7. Inbox, Calendar, Files, Syllabus, **the All Courses list (`/courses`)** (a top complaint in bc reviews), and dropdowns, selects and hover states on each page
8. A quiz-taking page (expect untouched)
9. A Canvas modal, a global-nav tray (Courses), and a date picker

Known-bad cases from Dark Reader's issue tracker: RCE comments (#12354),
Gradebook (#11503), embedded files (#11097/8).

## 9b. Calls the dark lane made past this spec (Design confirmed, 2026-10-19)
1. Near-white authored backgrounds (pasted white wrappers) become transparent.
   Light *tinted* authored backgrounds (highlights, coloured cells) keep their
   colour and get dark text, as in §7.
2. Unmapped near-neutral greys map to a role by lightness.
3. `#1a5a8e` maps to link, and `#e0f7fa` to selected.
4. The school's brand literals are mapped in compiled and InstUI CSS. The nav
   still follows `navStyle`.
5. Authored mid-grey text maps to `text-secondary`, which keeps the author's
   de-emphasis.
To tune next:
- Calendar's mini-month draws a border around every day (noisy on dark). Make
  days borderless, with today as a `link` ring.
- Calendar event chips: a course-colour left edge plus a tinted fill, not a
  full coloured border.

## 9c. Light themes and Canvas's own dark mode (palette engine, 2026-10-20)
- **"School" in a light scheme** means the school's own colours, unlifted:
  link = `--ic-link-color` and accent = `--ic-brand-primary`, because they
  were made for light pages. Nav keeps the school nav. Dark schemes lift them
  as in §4. `themes/check_themes.py` resolves "school" per scheme.
- **Canvas's own widget-dashboard dark mode** (the
  `widget_dashboard_dark_mode` flag; it's off at the pilot school) **with a b²c light
  theme:** b²c doesn't fight Canvas's `!important` style tag. While Canvas's
  native dark is on, b²c leaves the widget dashboard to Canvas: no palette
  rules apply inside it. The Studio shows one line: "Canvas's own dark mode is
  on for the new dashboard. Turn it off there to use a light theme on it." A
  b²c *dark* theme still paints over it as normal.

## 10. Open

- Live-site check of which InstUI surfaces the owner actually hits (widget
  dashboard? `instui_nav`?). This waits on her screenshots or Research's
  read-only pass.
- Whether the pilot school's YuJa Panorama widget draws visible UI that needs covering.
- **First rendered pass done (2026-10-19)** on `specimens/` (dashboard,
  assignment, grades, modules), built with the pilot school's live CSS, the generator
  prototype (543 rules), and `dark-mode.css`. Shots are in
  `specimens/shots/*-dark.png`.
  - **Pass:**
    - surfaces and elevation
    - nav green
    - links (the pilot school-derived #7dc8f3)
    - equation images (inverted, read as text)
    - a transparent diagram on a white plate
    - an authored highlight and authored table cell colours, still readable
    - status pills (Late, Missing, Excused)
    - the grades table
    - forms
  - **Fixed in pass:** Canvas's light text-shadows (embossed headers) are
    removed, and the sidebar school logo is shown as a light monochrome mark.
  - **To tune:**
    - double hairlines between module rows
    - authored saturated red text is readable but loud (lift it with relative
      colour if Dev confirms `currentColor` support)
    - the specimen's "Start Assignment" is a mock class. Check it is
      `--b2c-dm-accent` on the live page.
  - Still unverified: InstUI islands (layer c) and live the pilot school pages. Those wait
    on Dev's build and the owner's hands-on pass.
