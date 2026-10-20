# betterbettercanvas (b²c)

**Canvas, but better, and yours.** b²c is a browser extension for **Canvas
LMS**. It brings back the feature set students loved in the open-source era of
Better Canvas, rebuilt to be fast, light, private, and riced: a dark mode
that's in place before the first paint, due lists on course cards, a to-do
panel with several views, GPA, grade goals, themes you can share, and more.

- **Any Canvas school:** works on `*.instructure.com` out of the box. Schools
  on their own domain are a one-click "Turn on".
- **Private:** nothing leaves your device. No accounts, no analytics, no
  servers. See [PRIVACY.md](PRIVACY.md).
- **Light:** feature code loads only on pages where it runs, and every ship is
  held to byte, time and request budgets ([dev/budgets.json](dev/budgets.json)).

## Install (from source)

```bash
cd dev
npm ci
node scripts/ship.mjs        # typecheck, unit + e2e tests, then build release/b2c
```

Then in a Chromium browser: `chrome://extensions` → Developer mode → **Load
unpacked** → choose `dev/release/b2c`.

## Develop

- Architecture: [dev/ARCHITECTURE.md](dev/ARCHITECTURE.md), v2 primitives:
  [dev/V2.md](dev/V2.md), commands: [dev/README.md](dev/README.md).
- Tests run headless against a local **mock Canvas**
  ([dev/mock-canvas/](dev/mock-canvas/)). Its page markup is rebuilt from
  canvas-lms, so you never need a real Canvas login to develop.
- Design specs: [design/spec/](design/spec/).

## Licence

[AGPL-3.0-or-later](LICENSE). Third-party notices (fonts, themes, canvas-lms)
are in [NOTICE.md](NOTICE.md).

---

b²c is an independent project. It is not affiliated with, endorsed by, or
sponsored by Instructure, Inc. (Canvas, Canvas LMS) or by the makers of Better
Canvas or BetterCampus. Those names and marks belong to their owners and are
used here only to describe compatibility.
