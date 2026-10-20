# card-customization, card-colors, gradient-cards, condensed-cards, card-overlay

*Design, draft 1, 2026-10-19. The frame is `_dashboard.md` §4. Behaviour
reference is `research/features.md` D3–D7. These features all change the b²c
card, so they share one spec.*

**Acceptance:**
- Every card change is made on the card or in one settings row, applies
  instantly, and is undoable.
- Changes Canvas also stores (colour, nickname, order) appear in Canvas's own
  views after reload.

## On the card: `card-customization`
**Decided (A):** one **⋮** menu in Canvas's spot, a superset of Canvas's own
(`_dashboard.md` §1a). It has the table below, plus Unfavorite and "Dashboard
settings…" at the foot.

The menu (a 240 px popover, `surface-raised` in dark) has these items, each
opening an inline panel inside the same popover. There are no modals.

| Item | Panel | Writes |
|---|---|---|
| Color | 12 swatches (Canvas's own course palette) + "Custom" hex field + eyedropper | Canvas colour (`PUT /users/self/colors/course_<id>`) |
| Rename | Two fields: **Name** (Canvas nickname, shown everywhere) and **Course code** (a b²c-only label on the card; Canvas has no API for it). Each has "Reset" | Canvas nickname · b²c |
| Image | "Canvas image" · "No image" · "Upload…" (a local file, then a crop to the hero's aspect with drag-to-position and zoom; stored downscaled to 2× hero size in `chrome.storage.local`) · "Image URL" with a live thumbnail | b²c |
| Links | 4 slots: Default / None / Custom URL (favicon preview) | b²c |
| Set grade goal… | see `grade-goals.md` | b²c |
| Hide card | (immediate; Undo toast) | b²c |
| Move left / Move right | (immediate) | Canvas `dashboard_positions` |

The footer line reads "Color, name and order are saved to your Canvas account."

**Drag to reorder:** press on the hero and drag. A 2 px `link` insertion bar
shows the drop point, and the other cards move to make room (180 ms). On drop,
the order is written to Canvas. Esc cancels the drag.

## Set all colours (`card-colors`, settings → Dashboard → "Set all…")
A sheet inside the settings page, not a popup.
- **Palettes:** a grid of named palettes, each shown as a strip of its colours
  (bc's best idea, kept). The names are plain ("Blues", "Pastels",
  "Rainbow"…). bc had 23, and v1 ships about 12. Choosing one **previews on
  the open Canvas tab**. "Apply" writes to Canvas.
- **One colour:** a picker. **Gradient:** two pickers, spread across the cards in
  their current order.
- **Before Apply**, the sheet says: "This changes your course colours in Canvas,
  including the Canvas app." Afterwards: "Applied · Undo (restores previous
  colours for 24 h)".
- Writes are queued and shown as progress ("Saving 3 of 6…"). The DOM updates
  immediately.

## Look options (settings → Dashboard)
- **Card style:** Standard · Gradient (`gradient-cards`). Gradient =
  `linear-gradient(115deg, course, oklch(from course l c calc(h + 50)))`, keyed
  by course id (bc keyed by position, which broke on reorder).
- **Card height:** Standard · Condensed (`condensed-cards`). Condensed means a
  64 px hero, one title line, and the term hidden.
- **Color overlay on images** (`card-overlay`): on means Canvas's 60% course
  colour wash over an image hero; off means the image as is. This is b²c's own
  setting, separate from Canvas's account-level "Color overlay" preference.
- **Card layout** sliders (under Customize cards): Width 220–360 px (default
  262), Gap 8–40 px (default 24), Corner radius 0–16 px (default `--b2c-corner`, 2 px). Each shows
  its live value and ↺, and previews in the open tab while dragging.
- **Hidden cards:** a list with Unhide, in settings and at the end of the grid as
  "Hidden cards (2)".
