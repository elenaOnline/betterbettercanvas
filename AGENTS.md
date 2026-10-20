# AGENTS.md

Instructions for AI agents working in this repository. b²c ("betterbettercanvas") is a browser extension that
makes Canvas LMS faster, themeable and easier to use. It's AGPL-3.0-or-later. People read `README.md`; this file
is for you.

## If you're here to use b²c, not change it

- **Read a student's Canvas** (what's due, assignments, files) without marking anything read:
  [`agentkit/skills/canvas/SKILL.md`](agentkit/skills/canvas/SKILL.md).
- **Write a b²c theme or rice:** [`agentkit/skills/theme/SKILL.md`](agentkit/skills/theme/SKILL.md). Check it with
  `agentkit/bin/b2c check <file>` and see it with `agentkit/bin/b2c render <file>`.
- **What b²c promises agents on a Canvas page** (`window.b2cAgent.describe()`, `data-b2c-*` anchors):
  [`agentkit/CONTRACT.md`](agentkit/CONTRACT.md).

## Rules that are never negotiable

1. **Never touch a real Canvas account.** Develop and test against the mock in `dev/mock-canvas/`. Never sign in
   for anyone, never ask for or store a password, and never commit credentials, session cookies, access tokens,
   calendar-feed links, or captures of a real school's pages.
2. **Looking changes state on Canvas.** Opening a Grades page, an announcement, a discussion topic, an inbox
   thread or a module item can mark it read or complete a requirement. Read through list endpoints (GET only).
   Never prefetch item pages, in tests or in the extension.
3. **Never drive anyone's own browser from a script, and never put a window or a sound in front of them.**
   Browsers you start are headless (`--headless=new`) with a throwaway profile. Use
   `dev/test/e2e/fixtures.ts`, `dev/mock-canvas/tools/browser.mjs`, or `agentkit/tools/canvas-session.mjs`.
   On macOS, headless still isn't invisible: the stock "Google Chrome for Testing" app puts an icon in the Dock
   at every launch. Launch the background-only copy from `dev/scripts/quiet-chrome.mjs` (all of the above do),
   and check a new flow with `node dev/scripts/dock-watch.mjs -- <command>`. Kill only processes you started.
4. **Hand-feel is part of done.** Nothing flashes, shifts, or waits on the network when a cache could answer.
   Compare with the best shipping equivalent before you call it finished.

## Building and testing

```bash
cd dev && npm install && npx playwright install chromium   # once
node build.mjs                                               # dev build → dev/dist
npx tsc --noEmit -p . && npx vitest run && npx playwright test
node ../agentkit/tests/contract.test.mjs                     # the agent contract, from outside
```

Read `dev/ARCHITECTURE.md` before changing extension code. In short:
- one gated CSS file in place before first paint (`html[data-b2c-<feature>]`);
- one shared DOM observer, and no polling;
- per-feature runtime chunks loaded only where they run;
- budgets (`dev/budgets.json`) enforced at release. Lower a number when you beat it, and never raise one
  without a reason.

## Not bloating, not breaking

- **New ideas are values of an existing primitive** (palette, shape, type, layout, views), not new toggles.
  See `design/spec/rice.md`.
- **Tokens, never selectors,** for anything visual. b²c owns the mapping onto Canvas, so a Canvas update is
  fixed once. Never target InstUI's hashed `css-*` classes.
- **Squares, not pills.** Corners come from `--b2c-corner`.
- **Nothing leaves the device.** No analytics, no remote code, no new host permissions without a reason.
- **The agent contract is public API.** Don't rename or remove anything in `agentkit/CONTRACT.md`. Add fields,
  and bump `v` only for breaking changes. `agentkit/tests/contract.test.mjs` gates every release. A new
  `data-b2c-action` verb goes into the contract first.
