# spec/: what Dev builds from

*Agreed with Dev on 2026-10-19.*

**Namespace:** each surface is named by its **feature id** (lowercase-kebab). That
id is shared by Research's parity map, these specs, and `dev/src/features/<id>/`.
It's the main contract between the three teams.

| File | What | Owners |
|---|---|---|
| `tokens.css` | Every b²c design value as `--b2c-*` custom properties, with light and dark sets. Plain custom properties only: **no `@import`, no `url()` to external fonts**. If a font is needed, Design supplies the woff2 and Dev bundles it. | Design. Dev imports it verbatim, and nothing is hard-coded. |
| `surfaces/<feature-id>.md` | The Canvas DOM it targets, what changes, all states (loading, empty, error, stale), interactions and timing, and acceptance checks. Opens with a one-line **Acceptance**. | Design |
| `surfaces/<feature-id>.html` | Static prototype on `tokens.css`, built on Dev's fixtures in `dev/mock-canvas/fixtures/pages/*.html`. One copy of the DOM; fixture errors go to Dev. | Design. Ports almost one to one to Preact. |
| `settings.md` | Labels, grouping, order, control type | Design. Keys and types live in Dev's `dev/src/core/settings/schema.ts`, emitted to `dev/schema.json`. A key in settings.md that's missing from the schema fails the build. |

## How Dev builds, which shapes how Design writes
- **Popup/options:** Preact + signals, rendered from the schema plus settings.md.
- **Injected widgets** (card assignments, to-do, notes, GPA): **open shadow DOM**.
  Write their CSS as if it owns its own root. Tokens come in through custom
  properties, and font and colour are inherited.
- **Restyling Canvas's own elements** (dark mode, card tweaks, hiding things):
  global CSS, every selector scoped under `html.b2c` / `[data-b2c-*]`.
- **All page CSS is one static `content.css`**, injected by the manifest before
  first paint. **Every rule is gated by an attribute on `<html>`**, and the build
  fails on an ungated selector. `boot.js` sets the attributes and custom
  properties synchronously from the localStorage mirror, before `<body>`
  exists.
- **Dark mode gate:** `html[data-b2c-dark="on"]`. Boot resolves Match system and
  Scheduled into that one attribute, so the sheet has **no
  `@media (prefers-color-scheme)`**. A preset is just a set of values for the
  `--b2c-dm-*` variables.
- **Who writes what for dark mode:** Design writes
  `surfaces/dark-mode.css` (brand-variable remap + hand rules, i.e. layers (a)
  and (d) of `surfaces/dark-mode.md` §5). Dev builds the generated literal-map
  layer (b) and the InstUI layer (c) from the map in §6.
