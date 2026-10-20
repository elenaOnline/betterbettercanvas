# b2c: check and see a b²c theme before you hand it over

Two commands for an agent writing a theme (`<name>.b2c-theme.json`) or a full rice
(`<name>.b2c-rice.json`, with `css`) in the format of `design/spec/rice.md` ("Theme file v1").

```sh
agentkit/bin/b2c check  my.b2c-theme.json            # about 0.3 s; exit 1 on any error
agentkit/bin/b2c render my.b2c-theme.json            # about 4 s for 7 pages; PNGs plus one contact sheet
```

Then **look at `contact.png`** (one image: name, palette swatches, what isn't rendered yet, and every
page in every scheme). Fix what `check` says, render again, and hand over when both are clean.

Needs Node ≥ 22, Python 3 (for Design's checker), `dev/node_modules` (`cd dev && npm install`) and a
Playwright Chromium (`cd dev && npx playwright install chromium`). Nothing else: it runs on Dev's mock
Canvas (`dev/mock-canvas/`), never on a real school.

## check

```
b2c check <file>... [--json]
```

One line per finding, then a summary:

```
error  palette.dark.text           text: 4.88:1 Lc 38.3 on bg, 4.41:1 Lc 37.0 on surface, … (floor 7:1 and Lc 75)  → use #d2d2e2 (Fix contrast: OKLCH lightness only)
error  cards.colors.list[0]        white course title: 1.12:1 on course colour 1 (floor 3:1)  → use #959b26 (Fix contrast: OKLCH lightness only)
error  shape.corner                should be a whole number from 0 to 12 (b²c would leave it out)  → fix the value to match design/spec/rice.md "Theme file v1"
error  css                         the sanitiser would remove @import loads another stylesheet from the internet: @import url("https://…")  → use only data: URIs and bundled fonts; no remote url() or @import
warn   densty                      unknown field: b²c keeps it but doesn't use it  → did you mean "density"?
warn   palette.dark                under Canvas High Contrast, b²c swaps text → #e8e8e8, textTertiary → #9e9e9e (AAA gate)  → raise contrast of text, textTertiary to keep your colours there
warn   views.todo                  this b²c can't apply it yet, so it does nothing today  → keep it if you want it later; nothing to fix
FAIL  bad-contrast.b2c-theme.json: 9 errors, 3 warnings, 446 B of 4096
      note: "school" roles were checked against a sample school brand (Design's reference); a real school's colours differ.
      checked with: Dev's planTheme (…) + design/spec/themes/check_themes.py
```

- **error** (exit 1): the JSON or a field is invalid (b²c would drop it), the sanitiser would strip part
  of `css`, a size limit is broken, or a contrast floor fails. Floors are Design's: text 7:1 and Lc 75,
  textSecondary 4.5:1 / Lc 60, textTertiary 4.5:1 / Lc 45, link 4.5:1 / Lc 60 on bg, surface and
  surfaceRaised; navText on nav 4.5:1 / Lc 60; white on accent 4.5:1; white on each course colour 3:1.
  The `→ use #…` values come from Dev's `fixTheme` (the Studio's "Fix contrast": lightness only).
- **warn**: unknown fields, a partial palette (b²c fills it from a preset), hex spelling, `css` in a
  `.b2c-theme.json`, the High Contrast fallback, and fields this b²c can't apply yet.
- `"school"` roles (link, accent, nav from the school's brand) are checked against Design's sample school.
- `--json` prints `{file, ok, engine, findings[{level, path, what, fix}], notes}` instead.
- It also reads what b²c's Import reads (share codes, Better Canvas, base16, Catppuccin, pywal) and says
  what it converted.

## render

```
b2c render <file> [--pages dashboard,course,modules,assignments,assignment,grades,calendar]
                  [--scheme light|dark|both] [--out DIR] [--ext DIR] [--perf]
```

- **Schemes:** by default, the ones the theme has a palette for. `--scheme both` also shows the other slot
  (labelled: Canvas's own light, or b²c's default Dark).
- **Pages** (1440×900, mock Canvas, new dashboard on its Courses tab): dashboard,
  course home, Modules, Assignments, one assignment, Grades, Calendar.
- **Out:** `--out DIR`, default `$TMPDIR/b2c-render/<name>-<hash of the file's path>/`, so same-named files don't collide: `<page>-<scheme>.png`, `contact.png`,
  `contact.html` (full-size images) and `render.json` (setting values applied, timings, html attributes).
- **Not rendered yet:** printed and on the sheet. These are fields b²c can't apply (Dev's planner says
  "skipped"), or course colours that never landed. A page where b²c's palette isn't painting is flagged
  `! b²c palette NOT painting` and exits 1.
- **`--perf`:** after the shots, the budget measure from `dev/test/e2e/budgets.spec.ts` (heavy mock,
  warm dashboard, 4× CPU) with the theme applied: feature start ms against `dev/budgets.json`. Adds about 5 s.
- **`--ext DIR`:** load another build. It must be a test build (see below).

How it works: it builds b²c's **test build** into `agentkit/.scratch/b2c-test` (gitignored) when
`dev/` changed since the last one, and prints that it did (`B2C_TEST_FEATURES=1`, every feature; never
`dev/dist` or `dev/release`). It starts the mock in-process and launches headless Chromium through
`dev/mock-canvas/tools/browser.mjs` (`--headless=new`, throwaway profile deleted afterwards). It applies
the theme with Dev's `b2c:themes:apply-file` hook, which is exactly Import → Apply all, CSS included. It
sets "Use dark theme" to Never or Always per scheme, loads the pages in parallel and takes screenshots one
at a time. Then it builds the contact sheet. If Dev's tree doesn't build at that moment (lanes edit it
live), it says so and uses the previous test build. If there isn't one, it stops.

## Where the engine comes from (`tools/theme-adapter.mjs`, the one swap point)

`check` uses Dev's `planTheme` from `agent/theme.mjs`, first match wins:
1. `$B2C_THEME_MODULE`.
2. `agentkit/.scratch/b2c-test/agent/theme.mjs` when it's current.
3. `dev/dist/agent/theme.mjs` when it's newer than `dev/src`.
4. `dev/src/core/theme/node.ts`, bundled on the fly into `tools/.cache/`.
5. The last bundle that built.
6. A small validator written from rice.md, used only if none of those load. Its output is marked
   `[PROVISIONAL]`, with regex-level CSS checks and contrast from Design's checker only.
   `B2C_ENGINE=fallback` forces it.

Design's `design/spec/themes/check_themes.py` runs as a subprocess on full palettes. Its findings are
added only where Dev's report didn't already flag the same field, prefixed `Design:`. On all 17 presets
and the test themes, the two agree on every floor and High Contrast verdict. Design's only extra rule is
"6–8 course colours". It stays because it costs about 50 ms and catches drift between the TS and
Python floors.

## Requirements and limits

- `check` runs Design's contrast checker (`design/spec/themes/check_themes.py`) with `python3`; without
  Python it says so and relies on b²c's own validator, which has the same floors.
- Fields this b²c can't apply yet are listed by `check` as warnings and by `render` as "not rendered yet".
- No absolute paths: the repo root is found from the script's own location (`B2C_DEV=<dir>` points at
  another `dev/`).
