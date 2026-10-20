---
name: b2c-theme
description: Write a theme or a full "rice" for b²c (betterbettercanvas), the Canvas LMS browser extension, as a .b2c-theme.json or .b2c-rice.json file, then check it and render it on a mock Canvas before handing it over. Use when asked to make, port, remix or fix a b²c theme, colour scheme, palette or rice, or to turn another theme (base16, Catppuccin, pywal, a VS Code or terminal theme, a screenshot) into one.
---

# Writing a b²c theme

b²c restyles Canvas from a small file of **tokens**: colour roles, shape, type, density, layout. It maps those
tokens onto every Canvas page itself, before first paint, so a theme never needs a selector and survives Canvas
updates. Your job is to choose good values, prove they work, and show what they look like.

**The bar:** the theme looks intentional on every page, passes `b2c check` with no errors, adds nothing to page
weight, and you have looked at the render yourself before saying it's done.

## The loop

1. **Start from the closest preset.** Copy one from `design/spec/themes/` (about 20 of them: Catppuccin, Nord,
   Rosé Pine, Tokyo Night, Solarized, Everforest, Dracula, and b²c's own Dark/Gray/Black/Warm). Don't start from
   a blank file.
2. **Edit only what the theme is about.** Every field is optional, and a theme overrides only what it names. A
   colour scheme is a `palette` and nothing else. Leave out type, shape, layout and views unless asked.
3. **Check:** `agentkit/bin/b2c check my.b2c-theme.json`. Fix every `error`. Read every `warn`.
4. **Render:** `agentkit/bin/b2c render my.b2c-theme.json --scheme both`. **Open the contact sheet and look at
   it.** Numbers are a floor, not the verdict. Things only your eyes catch: a nav bar that vanishes into the page,
   course cards that clash, links that read as body text, three surfaces that look like one.
5. Repeat 2–4 until both pass. Then hand over the file, the check output, and the contact sheet path.

## The file

```jsonc
{
  "$b2c": "theme", "v": 1,
  "name": "Harbor Night",                     // required; what the Studio shows
  "author": "optional: the person it's for, or the palette's author; not b²c",
  "source": "optional: URL of the palette you ported",
  "palette": {
    "dark":  { /* 14 roles, below */ },       // fills the Dark theme slot
    "light": { /* 14 roles */ }               // fills the Light slot; give one or both
  },
  "cards":   { "colors": { "list": ["#…", "#…"] } },   // optional course colours, applied in card order
  "type":    { "family": "Inter", "scale": 1.0 },       // rice
  "shape":   { "corner": 2, "border": 1 },              // rice: corner 0–12 px, border 0/1/2
  "density": "comfortable",                             // rice: compact | comfortable | roomy
  "layout":  { "width": "standard", "panel": "right", "sections": ["todo", "notes", "gpa"] },
  "views":   { "todo": "list" }                         // list | ring | week | courses
}
```

The full field list is in `design/spec/rice.md` ("Theme file v1"). Never invent fields: unknown ones are kept,
but they do nothing and `check` warns.

### The 14 palette roles

| Role | Paints | Rule of thumb |
|---|---|---|
| `bg` | the page, behind everything | the palette's base |
| `surface` | cards, panels, sidebar boxes, table rows, modals | one step from `bg` |
| `surfaceRaised` | menus, popovers, hover, selected rows, table headers | one more step |
| `border` | dividers, input borders, card outlines | visible on all three surfaces |
| `text` | body and headings | 7:1 on all three surfaces |
| `textSecondary` | metadata, timestamps, descriptions | 4.5:1 |
| `textTertiary` | placeholders, disabled, hints | 4.5:1 (yes, still) |
| `link` | links, focus rings, selection tint | the palette's blue; 4.5:1 |
| `accent` | filled buttons and switches, **with a white label** | deep enough for white text at 4.5:1 |
| `nav` | Canvas's global nav bar (left rail) | usually the darkest colour |
| `navText` | nav icons and labels | 4.5:1 on `nav` |
| `success`, `warning`, `danger` | statuses (optional) | the palette's green, yellow, red |

- **One idea.** The palette should read as one scheme, with one temperature and one accent family. Don't pick
  14 colours separately.
- **Elevation is lightness.** In a dark theme `bg` < `surface` < `surfaceRaised`, in small, even steps of about
  0.03–0.05 OKLCH L. In a light theme `surface` is the lightest (cards are paper on the page) and
  `surfaceRaised` is slightly darker. `border` is one quiet step
  above `surfaceRaised`, roughly 1.5–3:1 against `bg`. Never make it a loud line.
- **Text roles are one hue family, tinted toward the theme.** `textSecondary` and `textTertiary` are tints of
  `text` that step down in lightness. They aren't new colours. Tint all three toward the theme's **identity hue**
  (its nav, accent or base: not just "a bit cool"), at OKLCH chroma about .015–.03, so they belong to it.
  Pure neutral grey on a coloured theme looks pasted on.
- **Links must read as links:** at least ΔEok 0.10 from `text`, with chroma ≥ 0.05. A pale, greyed link that
  passes contrast still reads as body text.
- **Saturation lives in `link`, `accent` and course colours,** never in surfaces. `success`, `warning` and
  `danger` are the palette's own green, yellow and red, lifted for the scheme.
- `link`, `accent` and `nav` may be `"school"`: the school's own brand colour, adjusted to pass. Keep `"school"`
  when the theme is "this palette, still my school". Use real colours when the theme has its own identity.
- **Course colours: a riced theme must ship them.** If the theme has its own `link`/`accent`, give
  `cards.colors.list` 6–8 colours drawn from its own palette. Otherwise Canvas's saturated defaults clash
  with it. Spread them around the hue wheel at similar lightness, at least ΔEok 0.045 apart pairwise, and each
  must carry a white title at 3:1. For a neon brief, use neon-adjacent hues, darkened until white text passes.
- **A big saturated nav reads as chrome only when it's dark:** keep a saturated `nav` at OKLCH L ≤ .35.
- **Name and credit:** give it a plain proper name. If it's derived from a published palette, put the source URL
  in `source`.
- **Porting a palette** (base16, Catppuccin, pywal): map by meaning, not by slot number. Base → `bg`, the next
  official steps → surfaces, foreground → `text`, comment → `textTertiary`, blue → `link`. When a value misses a
  floor, change its **OKLCH lightness only** (keep hue and chroma) in small steps until it passes. Record each
  change in the file's `source` note or your hand-over. That's how the bundled presets were made: see the
  "Adjustments" table in `design/spec/themes/README.md`.

## What "not bloated, not broken" means here

**Tokens, never selectors.** Everything a token can do, do with the token. b²c owns the mapping from roles to
Canvas's thousands of rules, including InstUI's hashed classes, the calendar, the rich-content editor and the
document viewer. A selector you write covers one page today and breaks on the next Canvas deploy (every 3 weeks).

**A theme file is small.** Under 4 KB without `css`. If yours isn't, it's doing too much.

**`css` is the escape hatch, and only in a full rice** (`.b2c-rice.json`, shared person to person, never in a
public gallery). If you must use it:
- only for what no token covers, and say in your hand-over what and why. The cap is 32 KB, but a
  good rice needs far less: `check` calls anything over 8 KB large, because every rule runs on every page;
- every rule must still work if Canvas renames a class. Prefer `[data-testid=…]`, ARIA roles and ids over
  classes, never `.css-<hash>` classes;
- no remote anything: no `@import`, no `url(https://…)`, no web fonts or hotlinked images. `data:` URIs and
  b²c's bundled fonts only. `check` lists what b²c would strip;
- nothing expensive: no `*` with transitions or filters, no `:has()` over the whole page, no animations on Canvas
  content, no `backdrop-filter` on large areas;
- never hide Canvas content or controls that b²c already has a setting for. Use the setting.

**When you can't do what was asked, offer the b²c way instead of a hack:**
- "hide the Recent Feedback box" → b²c's setting **Dashboard → Hide Recent Feedback** (also: Hide logo, card
  settings);
- "use <font> from Google Fonts" → a font from b²c's bundled list, or `"System"`. If the font is installed on
  their computer, they can choose it in **Appearance → Font → "A font on this computer…"**;
- "exactly this colour" when it fails contrast → keep its hue and move only its lightness, then say so with
  both values.

**Shape and type are for rices.** Corners are 0–12 px. Small (0–4) reads as crisp; b²c's own default is square.
Use a font from b²c's bundled list or `"System"`. A theme can't load a font from the web.

**Never in a theme:** course names, nicknames, ids, per-course images, notes, grades, to-do marks, sites,
or when to switch dark mode on. Those belong to the person, and b²c drops them.

## Checking and rendering

```bash
agentkit/bin/b2c check my.b2c-theme.json            # ~0.2 s; errors exit 1; one line per finding, with the field and a fix
agentkit/bin/b2c render my.b2c-theme.json           # ~4 s; 7 Canvas pages + contact.png; prints the paths
agentkit/bin/b2c render my.b2c-theme.json --scheme both --pages dashboard,assignments,calendar --out ./shots
```

`check` gives a concrete fix for every contrast error (`→ use #…`, lightness only), so apply it rather than
guessing. A `warn` that a field "can't apply yet" means this b²c ignores it today. Keep it only if it's wanted.

`render` runs headless on b²c's mock Canvas (no account, no window, nothing sent anywhere). The pages are
dashboard, course home, modules, assignments list, an assignment, grades and calendar. **Open `contact.png`
and look at all of it**: it has your swatches, a "not rendered yet" list, and every page. The dashboard
flatters every theme. Grades tables, the calendar and the assignment page are where weak `surface` steps,
a loud `border` or unreadable text show. If something on a page looks wrong and it isn't your values,
say so in the hand-over; don't patch it with CSS.

## Handing over

Give the person:
1. the file (`<name>.b2c-theme.json`, or `.b2c-rice.json` if it has `css`),
2. the last `check` output (all errors fixed, warnings explained),
3. the contact sheet path, and one sentence on what the theme is for,
4. every value you adjusted from a ported palette, as `role: original → adjusted`.

5. which slot it fills. A theme with only `palette.dark` shows when their **Use dark theme** setting says
   so (Never · Always · Match system · Scheduled); with only `palette.light`, the reverse. That setting is
   theirs, not the theme's, so tell them to set it if they want the theme all the time.

They import it in b²c's Studio (Import → paste or file), which shows a preview and Undo.
