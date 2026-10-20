# b²c architecture

Dev lead, 2026-10-19. This is the living design of the extension. If the code
and this file disagree, fix whichever one is wrong.

## Goals that shape everything

1. **Nothing flashes.** Every visual setting (dark mode, palette, condensed
   cards, hidden elements, fonts) is in place before Canvas's first paint, on
   every navigation, even under 6× CPU throttle.
2. **Live settings.** Toggling a setting in the popup changes open Canvas tabs
   right away, with no reload.
3. **Instant data.** Anything that needs `/api/v1` renders from cache straight
   away, then revalidates (stale-while-revalidate). No spinners on warm loads.
4. **Cheap on Canvas.** Small content scripts, one shared MutationObserver,
   no polling, and no work on pages a feature doesn't apply to.
5. **Robust to Canvas drift.** Features declare their DOM anchors. A health
   view shows which anchors were found on the current page, so production
   drift the mock can't catch is visible during the owner's hands-on pass.

bc's behaviour is the reference. Its implementation (async CSS injection that
flashes, polling, global unscoped CSS, `https://*/*` match) is not.

## Runtime pieces

```
                 ┌─────────────── canvas.example.edu tab ────────────────┐
 manifest CSS ──►│ content.css  (core: tokens, side panel)            │
 registered CSS ►│ css/<id>.css (one per feature, only while it can   │
 (browser-       │              apply; every rule gated by            │
  injected,      │              html[data-b2c-*] attributes)          │
  pre-paint)     │ boot.js   document_start, sync, ~2 KB:              │
                 │   localStorage['b2c:mirror'] → html attrs + --vars  │
                 │ main.js   document_start, async:                    │
                 │   chrome.storage → settings → features → DOM        │
                 │   rewrites the mirror when settings change          │
                 └──────────────▲──────────────────────────────────────┘
                                │ chrome.storage (sync: settings,
                                │                 local: big values + API cache)
         popup / options ───────┤
         (Preact, from schema)  │
                                │
         service worker ────────┘  defaults + migrations, reminders (alarms),
                                   re-inject after update, release auto-reload
```

### Pre-paint: the mirror

`chrome.storage` is async, so it can't be relied on before first paint.
`main.js` therefore keeps a **mirror** in the Canvas origin's `localStorage`
(`b2c:mirror`, JSON). It holds only what has to apply before paint:

- `attrs`: `data-b2c-*` attributes to set on `<html>` (for example
  `data-b2c-dark="on|auto|off"`, `data-b2c-condensed-cards`), and
- `vars`: resolved custom properties (the palette, the font family), and
- `schedule`: the scheduled dark-mode window. boot works out on/off from the
  clock synchronously, so it needs no alarms.

`boot.js` reads the mirror synchronously and applies it to
`document.documentElement`. It runs before the body has parsed. The CSS is
injected by the browser before first paint and every rule is gated by those
attributes, so every CSS-only feature is pre-paint by construction.
`chrome.storage` stays the source of truth. The mirror can go stale only when
settings change while no Canvas tab is open, and `main.js` corrects it within a
few milliseconds on the next load.

**Split stylesheets (css-split, 2026-10-20).** `content.css` (manifest) holds
only core: Design's tokens and core UI such as the side panel. Each feature's
CSS is its own `css/<id>.css`, a CSS-only content script the service worker
registers (`src/background/css.ts`) only while the feature can apply: its
mirror part sets any attribute, now or conditionally (so the palette is
registered whenever a dark scheme can apply, including Match system).
Registered CSS is injected exactly like manifest CSS. Every Canvas page load
reports what its settings want, and the registrations follow (a lost one heals
by the next load). Sheets register on **exact school hosts b²c has run on**
(every frame there) and granted custom domains, never on
`https://*.instructure.com/*`. A school's very first load therefore gets core
`content.css` only and heals live; an update with schools known registers
every sheet on them at once. A page that lacks a sheet it needs (a feature switched on live, a lost registration) asks the service
worker to insert it (`src/core/sheets.ts`; same-origin frames ask from
boot.js), and until it's in, that feature's attributes stay off: plain Canvas,
never half-styled. Each sheet sets `--b2c-css-<id>` on `<html>` so a page can
tell which it carries (`checkSheets`, read once before the first frame).
`B2C_CSS_SPLIT=0` builds the old single sheet.

**Quiz-safe mode: nothing at all on assessments.** On Classic Quizzes'
quiz-taking route (`/courses/:id/quizzes/:id/take`) the mirror's quiz subset
applies: nothing by default, colours only with `core.quizSafe = colours`; no
feature code runs there. New Quizzes runs on its own hosts (quiz-lti /
quiz-api / `*.quiz.*instructure.com`), top-level or framed, and gets nothing
of b²c, not even an inert stylesheet or an attribute: the manifest's content
scripts exclude those hosts (`QUIZ_FRAME_GLOBS` in build.mjs), and feature
sheets register only on school hosts that main.js has reported from, which by
the same exclusion can never be a quiz host. The service worker also refuses
to record one (`isQuizHost` in `src/core/hosts.ts`, kept in step with the
globs), even if one reports.

### Features

Each feature lives in `src/features/<id>/`. `<id>` is the shared feature id:
Research's parity map, Design's `design/spec/surfaces/<id>.md`, and this
folder all use it.

```ts
export default defineFeature({
  id: 'card-assignments',
  settings: {                       // → schema; keys become 'card-assignments.count'
    enabled: bool(true),
    count:   int(4, { min: 1, max: 10 }),
  },
  pages: ['dashboard'],             // page kinds where start() runs
  mirror: s => ({ attrs: {...}, vars: {...} }),   // optional: pre-paint state
  anchors: { cards: '.ic-DashboardCard' },        // for the health view
  start(ctx, s) { ...; return { update(s) {...}, stop() {...} } },
});
```

- CSS for a feature is `src/features/<id>/style.css` (plus generated
  `*.gen.css` layers and Design's surface sheet). The build assembles them into
  the feature's own `css/<id>.css`. Each rule has to be gated by the feature's
  attribute (`html[data-b2c-<id>]`). The build lints for this and fails
  otherwise.
- Injected widgets render into an **open shadow root** and use Design's
  tokens (custom properties cross the shadow boundary). Restyling Canvas's own
  elements goes in gated global CSS.
- `start` must be idempotent and survive Canvas re-rendering (React
  re-hydration of dashboard cards). It uses `ctx.dom.each(selector, fn)`,
  which fires for current and future matches and is backed by one shared
  observer.
- `update` applies new settings live. A feature without `update` gets stopped
  and started again instead.

### Lazy runtimes and budgets (v2)

`main.js` carries core plus every feature's **definition** (settings, pages,
mirror), which is everything pre-paint and live settings need. A feature's
**runtime** (`run.ts` → `start`) is a separate ESM chunk (`chunks/<id>.js`,
web-accessible with dynamic URLs), imported on first start, only on pages
where it runs. Shared runtime code is split out once by esbuild, so singletons
such as the toast stay single across chunks. Starts run concurrently. Budgets
(`budgets.json`) cover bytes per artifact, start ms per feature and b²c's own
API requests, and ship enforces them. v2 primitives: `V2.md`.

### Settings

`src/core/settings/` holds the schema, built from every feature's `settings`
plus a few global ones. Dev owns the keys and types. Design owns the labels,
grouping, order and control type, in `design/spec/settings.md`. The build
writes `dev/schema.json` for Design, and fails if settings.md names a key the
schema doesn't have.

Storage: small values go in `chrome.storage.sync`, one item per key. Large
values (custom CSS, notes, card images, saved themes) go in
`chrome.storage.local`. Each schema entry says which. Migrations are keyed by
schema version and run in the service worker. bc settings import is a later
feature that maps bc keys onto ours.

### Canvas data

`ctx.api` is a same-origin `fetch` from the content script. It carries the
user's cookies, so b²c never holds a token. It provides:

- `Accept: application/json+canvas-string-ids` and `Link`-header pagination,
- CSRF on writes, taken from the `_csrf_token` cookie,
- request de-duplication within a page, and
- **stale-while-revalidate cache** in `chrome.storage.local`, keyed by
  `user id + path` with a TTL for each call. Warm loads render from cache with
  no wait.

`ctx.page` is the page kind, worked out from the path and `window.ENV`:
`dashboard`, `course-home`, `course-grades`, `assignment`, `assignments`,
`calendar`, `inbox`, `modules`, `course-other`, `other`.

### Hosts (any Canvas school; store-ready)

b²c is a general product (the owner, 2026-10-19). The manifest matches
`https://*.instructure.com/*`. A school on its own domain (canvas.example.edu,
canvas.yourschool.edu) is turned on by the user. On that page they click the
b²c icon, and the popup (via `activeTab`) recognises Canvas and offers
**Turn on**. That runs `chrome.permissions.request` for that one origin
(optional host permission), then the `sites` feature registers the same
content scripts for it with `registerContentScripts` (persisted). Options →
Sites does the same by typing the address. b²c never asks for `<all_urls>`,
never sniffs every page, and nothing is school-specific in code. School
variation (scales, disabled features) is data or feature detection.
`web_accessible_resources` (fonts only) uses `https://*/*` with
`use_dynamic_url`, so granted custom domains can load them without a
fingerprintable URL.

Tests: the default test school is `b2c-mock-school.instructure.com`, and
`canvas.b2c-mock.test` stands in for a custom domain (both mapped to the
mock by `--host-resolver-rules`, so nothing leaves the machine). A test build with
`B2C_TEST_GRANT=<origin>` pre-grants a host, standing in for the permission
prompt that headless can't click.

## Build, test, ship

- **Stack:** TypeScript, esbuild (`build.mjs`), Preact + signals for the popup
  and options, vitest + happy-dom for units, Playwright for e2e.
- **dist/** holds dev builds. **release/b2c/** is what the owner's Helium loads
  unpacked. It is only written by `npm run ship`, which builds, runs the full
  test suite, and swaps the folder in atomically.
- **Auto-update:** release builds contain `build-id.txt`. The service worker
  checks it with `chrome.alarms` (every minute), and when it changes calls
  `chrome.runtime.reload()`. After a reload, the service worker re-injects into
  open Canvas tabs, and the old orphaned instance tears itself down on a DOM
  event. the owner installs once and later ships arrive by themselves.
- **Mock Canvas** (`dev/mock-canvas/`): an HTTPS server answering as
  canvas.example.edu through `--host-resolver-rules`, with the DOM rebuilt from
  canvas-lms source and live public the pilot school CSS and brand variables. See its
  README for fidelity and gaps.
- **e2e:** headless Chromium (`--headless=new`) on a throwaway profile, with
  the built extension loaded and the mock mapped onto the real hostname. So the
  manifest under test is identical to the shipped one. `B2C_BROWSER=helium`
  runs the same suite on Helium's binary, still headless with a throwaway
  profile, and never touches the owner's running instance.
- **Hand-feel probes** in e2e: no default-colour frame under 6× throttle
  (CDP screencast), content-script long tasks, CLS from injected widgets, and
  warm-cache time to widget.
- **Real Canvas:** the owner's hands-on pass, helped by the health view in the
  popup ("features active here; anchors found or missing"; *Copy report*).
