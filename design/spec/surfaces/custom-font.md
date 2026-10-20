# custom-font

**Acceptance:** the chosen font applies before first paint, with no third-party request.

- Menu: **Canvas default** (Lato), **System** (the OS UI font), plus 4 bundled faces chosen for reading: Inter, Atkinson Hyperlegible, Source Serif 4, and JetBrains Mono. The woff2 files are in `design/spec/fonts/` (OFL).
- Each menu item is rendered in its own face.
- Applied as `--b2c-font` on `:root` plus one rule on `body` and InstUI's root. It's never `* { font-family: … !important }` (bc did that, and it broke icon fonts).
- **Yields to the dyslexia font:** if Canvas's OpenDyslexic variant is loaded (`html:has(link[href*="dyslexic"])`), b²c's font setting doesn't apply, and the settings row says so.
- No Google Fonts field in v1. (Store distribution and privacy rule out third-party requests.)
