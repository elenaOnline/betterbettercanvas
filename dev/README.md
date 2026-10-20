# dev/: the b²c extension

How it works: [ARCHITECTURE.md](ARCHITECTURE.md). Current state and next
steps: [NOTES.md](NOTES.md).

## Everyday commands (run in `dev/`)

```bash
npm install                      # once
node build.mjs                   # dev build → dist/
node build.mjs --watch           # rebuild on save
npx tsc --noEmit -p .            # typecheck
npx vitest run                   # unit tests
npx playwright test              # e2e: headless, throwaway profile, mock Canvas
node scripts/ship.mjs            # test + release → release/b2c (the owner's install)
```

**House rules for anyone running tests:** browsers run headless with a
throwaway profile, only through `test/e2e/fixtures.ts`. Never drive the owner's
Helium. Never sign in. See `../CLAUDE.md`.

## Layout

| Path | What |
|---|---|
| `src/content/boot.ts` | document_start, sync: applies the pre-paint mirror |
| `src/content/main.ts` | runs features, live settings, keeps the mirror current |
| `src/content/env-main.ts` | page-world bridge for Canvas's `window.ENV` |
| `src/background/sw.ts` | service worker: re-inject after updates, release check |
| `src/core/` | feature contract, settings schema/store, mirror, DOM observer, Canvas API + data, page detection, health probe |
| `src/features/<id>/` | one folder per feature id (the ids come from `research/features.md` §0) |
| `src/ui/` | popup and options (Preact) |
| `mock-canvas/` | HTTPS mock of canvas.example.edu used by e2e (see its README) |
| `test/unit`, `test/e2e` | vitest, Playwright |
| `briefs/` | briefs handed to build lanes |
| `SHIPPING` | which feature ids go into the owner's install |
| `release/b2c/` | **what the owner's Helium loads.** Written only by `scripts/ship.mjs` |
| `schema.json` | generated settings schema, for Design |

## Adding a feature

1. Create `src/features/<id>/index.ts` with `defineFeature({...})`. Copy the
   shape from `src/features/dark-mode/`.
2. If it restyles Canvas, add `style.css`. Every selector starts with
   `html[data-b2c-<id>]`, and the build refuses ungated CSS.
3. Add `test/e2e/<id>.spec.ts`. It needs to show live on, live off, and
   pre-paint where that applies.
4. When it's reviewed, add the id to `SHIPPING` and run `node scripts/ship.mjs`.

## Shipping to the owner

`node scripts/ship.mjs` typechecks, runs unit and e2e tests against the
release build, and then swaps it into `release/b2c` atomically. The previous
build stays in `release/.b2c.prev`, and swapping the two folders is the
rollback. Her b²c notices the new build within a minute: the toolbar icon
gets a ↑ badge and the popup offers **Reload b²c**. Silent self-reload
(`core.autoUpdate`) stays off until it's confirmed on her real install.
Headless Chromium unloads CLI-loaded extensions on `runtime.reload()`, so it
can't be proven in e2e.

## Version control

The whole project root is under git, in a separate git dir (no `.git` in the
folder):

```bash
export GIT_DIR=~/code/betterbettercanvas.git   # then run git from the project root
git log --oneline
git checkout <rev> -- path/to/file             # restore one file
```

`scripts/ship.mjs` commits at every green ship. Lanes don't run git.
