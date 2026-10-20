# Rice: b²c's customisation primitives and the shareable theme

*Design lead, v2 draft 2, 2026-10-20 (theme format agreed with Dev's `dev/V2.md` proposal). North star: every student's Canvas can look like their own carefully customised ("riced") Linux desktop, while staying fast and lightweight. The rule (Director, agreed): build the rice from a **small set of
primitives**, never from more toggles. Each primitive is one concept with a
direct-manipulation control in the Studio (`surfaces/studio.md`).*

## The five primitives

| Primitive | What it is | Who it's for | In a shared theme? |
|---|---|---|---|
| **Palette** | 14 colour roles (below) for one scheme, light or dark | Theme | yes |
| **Shape** | `corner` (0–12 px) and `border` weight (0, 1, 2 px). Elevation is lightness in dark and shadow in light | Theme | yes |
| **Type** | `family` (bundled list, system, or installed) and `scale` (0.9–1.15). **Density** (compact · comfortable · roomy) sets row heights and paddings on b²c *and* Canvas surfaces | Theme | yes |
| **Layout** | Page width; card width, gap and height; card face (solid · gradient · image-with-overlay); panel side (right · left · hidden); the order of panel sections | Theme | yes, except per-course things |
| **Views** | How a list is shown: the to-do list (list · ring · week · by course), the card due list (rows · next-only · count) | Person | yes (as a suggestion) |
| *(later)* **Pins** | Saved places that can follow the week | Person | no |

Everything already in v1 maps onto these. Dark mode presets are palettes.
`condensed-cards`, `gradient-cards`, `card-overlay`, `full-width` and the card
sliders are layout. `custom-font` is type. **No new toggles are added in v2;**
new ideas must be a value of a primitive.

**Personal, never in a shared theme:** course nicknames, per-course colours and
images (course ids are personal), notes, goals, credits, to-do marks, sites.
A theme can carry a **course colour palette** (an ordered list of colours) that
is applied to her courses in her card order, with Undo, never silently.

## Palette roles (14)
`bg, surface, surfaceRaised, border, text, textSecondary, textTertiary, link,
accent, nav, navText, success, warning, danger`

- `link`, `accent` and `nav` may be the string `"school"`, meaning derived from
  the school's brand at runtime (dark-mode.md §4). The quiet presets (Canvas,
  Dark, Gray, Black, Warm) use "school", so a school still looks like itself.
  **Riced themes** (Nord, Catppuccin…) set their own link, accent and nav,
  because that identity is the point of choosing them. The Studio offers "School
  colour" on those three roles in any theme.
- **Light themes are themes too.** The v1 literal-map mechanism (layers a–d)
  paints any palette, not only a dark one. The "Canvas" theme is the identity:
  it applies nothing.
- Contrast floors (`check_palettes.py`) apply to every bundled theme. Imported
  themes are checked and warned about, never blocked.

## Two theme slots replace "dark mode on/off"
- **Light theme** (default: Canvas, i.e. untouched)
- **Dark theme** (default: Dark, the v1 slate)
- **Use dark theme:** Never · Always · Match system · Scheduled (default: Match
  system)

These are standard words, the same model as the OS. Anyone who never touches
themes gets exactly v1. The popup keeps the segmented control and shows the two
slots as chips.

## Theme file v1: the "dotfile" (agreed format: Design + Dev, 2026-10-20)
```jsonc
{
  "$b2c": "theme", "v": 1,
  "name": "Nord", "author": "optional", "source": "optional URL",
  "palette": {                       // one or both schemes
    "light": { "bg": "#…", "surface": "#…", "surfaceRaised": "#…", "border": "#…",
               "text": "#…", "textSecondary": "#…", "textTertiary": "#…",
               "link": "school" | "#…", "accent": "school" | "#…",
               "nav": "school" | "#…", "navText": "#…",
               "success": "#…", "warning": "#…", "danger": "#…" },   // last three optional
    "dark":  { … }
  },
  "type":    { "family": "Inter" | "System" | "Canvas default" | …, "scale": 1.0 },
  "shape":   { "corner": 2, "border": 1 },          // corner px → --b2c-corner (b²c + Canvas)
  "density": "compact" | "comfortable" | "roomy",
  "cards":   { "style": "flat" | "gradient" | "image", "height": "standard" | "condensed",
               "overlay": true, "width": 262, "gap": 24,
               "colors": { "list": ["#…", "…"] } | { "gradient": ["#…", "#…"] } },
  "layout":  { "width": "standard" | "wide" | "full", "panel": "right" | "left" | "hidden",
               "sections": ["todo", "notes", "gpa"] },
  "views":   { "todo": "list" | "ring" | "week" | "courses", "cards": "rows" | "next" | "count" },
  "css":     "only in a full rice share (b2c-rice:); never in a theme share"
}
```
- **Every field is optional, and a theme overrides only what it names.** A
  palette-only theme just recolours.
- **Palette slots:** `palette.light` fills the Light theme slot and
  `palette.dark` fills the Dark slot. A theme with both is a complete day/night
  rice. When to switch ("Use dark theme: …") is **personal** and never in a
  theme.
- **Applying** writes the setting keys in one transaction, with Undo. Exporting
  reads them back, so the Studio, popup and settings page always agree.
  Unknown fields are kept and reported. `v` bumps only on breaking changes.
- `cards.colors` applies to her courses in her current card order: a preview,
  then Apply, then Undo. Course colours are written to Canvas (they're Canvas
  colours), and the sheet says so.
- UI labels for views: List · Progress ring · Week · By course.
- **Two share levels** (the owner, 2026-10-20: custom CSS should be shareable
  between individuals):
  - **Share theme** (the default): tokens only, with no `css`. It's
    gallery-safe, and the string prefix is `b2c-theme:`.
  - **Share full rice:** tokens plus custom CSS, person to person only. The
    prefix is `b2c-rice:`, the file is `<name>.b2c-rice.json`, and the envelope
    is `"$b2c": "rice"`. On Apply, a rice's CSS **replaces** her Custom CSS (one
    rice is one look). The preview says "Replaces your custom CSS (N lines)", and
    Undo restores it. It's never
    accepted by a public gallery. On import the preview says plainly "Includes
    custom CSS (12 lines) · [View CSS]", offering [Apply] or [Apply without
    CSS]. The CSS previews live on the stage and the open tab before Apply, and
    "Revert" sits in the Undo toast and the Studio header for the session.
  - Dev sanitises the CSS: no remote `url()` or `@import`, only `data:` URIs and
    bundled fonts. Anything stripped is listed in the preview ("Removed 2
    remote references").
  - The Share menu in the Studio has two items, "Copy theme" and "Copy full
    rice (includes CSS)", each also available as Save file.
- **Share:** a file (`<name>.b2c-theme.json`) or a string, `b2c-theme:` +
  base64url(deflate-raw(JSON)). Import accepts either, previews, then Apply /
  Cancel, with Undo after. `css` is flagged: "This theme includes custom CSS
  (12 lines). [View] [Apply without CSS] [Apply all]".
- Saved themes live in `chrome.storage.local`. Small ones are mirrored to sync.

### Folded in from Research (`research/next.md` §1, 2026-10-20)
- **Tokens only, never selectors.** b²c owns the Canvas mapping, so a Canvas
  update is fixed once and every theme survives. (`css` stays as the flagged
  escape hatch.) **Roles can only be added, never renamed**, and `v` stays 1.
- **Lineage:** optional `id` (random, set on first save), `rev` (integer,
  bumped on each save) and `from` (`{id, rev, name}` of the theme it was
  remixed from). The Studio shows "Remixed from Nord".
- **Size:** under 4 KB without `css`. A full rice's `css` is capped at 32 KB. A `b2c-theme:` code that carries CSS has it stripped on import, with a note ("Removed custom CSS; theme shares are tokens only").
- **Share as a URL fragment too:** `…#b2c-theme:<code>`. A b²c user who
  opens such a link gets the Import preview. Optional `updateUrl` (a gist or
  raw URL): the Studio checks it **only when she opens the Studio**, never in
  the background and never from Canvas pages, and offers "Update available ·
  Preview".
- **Importers** (Studio → Import, paste or file): b²c strings and files, bc's
  export codes, base16 YAML, Catppuccin JSON, and pywal `colors.json`. Each
  maps to our roles, then shows a **contrast report with "Fix contrast"**
  (OKLCH lightness only, before/after shown). It's never silent: imports that
  fail floors are allowed locally, with a note.
- **Later:** a gallery as a GitHub repo of JSON (CI renders previews and checks
  contrast), and a procedural background (tint, gradient or pattern, no
  hotlinked images) as a future Layout value.

## Colour budget (the owner, 2026-10-20: "too many colors… hill climb a bit aiming towards simplicity")
Colour carries meaning, or it isn't used. On any b²c surface, a hue other
than the theme's tonal roles (bg, surfaces, border, text ×3) may appear only
for:
1. **Course identity:** the course colour.
2. **Overdue or danger:** `danger`, in **one place per item** (the due text).
   Group headers like OVERDUE stay tonal.
3. **The single UI accent** (`link` / `accent`): selection, focus, the
   primary action and links. Never decoration.

Rules that follow:
- **One channel per item:** course colour shows in at most one place per row
  (the 2 px marker *or* a fill, never marker plus chip plus text).
- **Is the course the subject?**
  - Where it isn't (List, Week, card due rows), course colour is only the
    2 px marker, and fills are tonal: Week's squares are `text` (done) and
    `border` (open).
  - Where it is (By course, the ring's arcs and legend, card heroes), it's
    the main channel and nothing else competes.
- **No fills for status:** Canvas's states (Submitted, Late, Missing) are
  text or an outlined tonal chip. `success` and `warning` are used only where
  Canvas itself colours a state.
- **Course chips are tonal** (`surfaceRaised` with `textSecondary`), never
  tinted.
- **Studio chrome** uses one accent for selection, handles and their value
  labels. There's no second highlight colour.
- **Budget check:** a view at rest shows at most *course colours + 1 accent +
  danger*. Anything more is a bug.

## Lightweight budget
Each primitive is CSS custom properties and gated attributes, applied pre-paint
by boot from the mirror, as v1 does. No primitive may add a runtime observer,
a network request, or per-element JS. Views are the exception that renders, and
only inside b²c's own panel.
