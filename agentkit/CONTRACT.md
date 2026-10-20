# The b²c agent contract

*Agent kit lead, draft 1, 2026-10-20; §1–§3 and §5 agreed with Dev the same day. Agent kit owns the contract and tests it from outside; Dev
implements it. Changes go through Agent kit. Status per section: **draft** (proposed, not agreed),
**agreed** (Dev said yes), **built**, **verified** (passes `agentkit/tests/`).*

What b²c promises to agents and agent-written code that read Canvas through it. Nothing outside this
file is promised: every other `data-b2c-*` name, class, element and message is internal and may change
in any build.

Who it's for:
- an agent **driving a browser** with b²c installed (Claude in Chrome on the person's own browser profile; any Playwright
  script on a signed-in profile), and
- an agent **writing a theme or rice** that needs to check and see it before handing it over (§5).

Unattended scripts with no browser can't use §1–§4: they never get past the login. Their options are in
`skills/canvas/` (the calendar feed, a personal access token). A local read-only bridge from b²c to such
scripts has been considered, but isn't built.

## Ground rules (all sections)

1. **Read-only by default.** Nothing in §1–§3 changes state in Canvas or in b²c: no writes, no
   page views of item pages, no mark-read endpoints. Only read-safe list endpoints
   (`research/canvas-read-safety.md` "Safe").
2. **Costs nothing until asked.** No contract work on a normal page load beyond one attribute set
   pre-paint. Everything else runs when an agent asks (§2), so `dev/budgets.json` is untouched.
3. **Versioned.** `v` is the major version. Within a version, fields are only added; agents must ignore
   fields they don't know. A rename or removal is `v: 2`, and b²c then serves both for one release.
4. **Ids are strings**, as `type:id` where an item is meant: `assignment:9001`. Types are Canvas's
   `plannable_type` values plus `course`, `module`, `module_item` and `file`.
5. **Times are ISO 8601 with the offset** of the user's Canvas time zone (`2026-10-24T23:59:00-07:00`),
   never a bare date. A missing time is `null`, not `""`.
6. **URLs are absolute** and on the page's origin, so the contract works on any Canvas school.

## §1 Detection (verified 2026-10-20)

`<html data-b2c-agent="1">` is present on every Canvas page where b²c runs and the contract is on. The
value is the contract's major version. It is set pre-paint from the mirror, like the feature gates.

- Absent: b²c isn't installed, isn't allowed on this host, is paused, or the user turned the contract off
  (setting `core.agentContract`, default **on**, under Settings › Advanced).
- Never present on quiz-taking routes (`quiz-safe-mode`): b²c does nothing there.

## §2 Describe: the page as JSON (verified 2026-10-20)

The one call an agent needs. From the page's own JavaScript world (Claude in Chrome's `javascript_tool`,
Playwright's `page.evaluate`):

```js
const d = await window.b2cAgent?.describe();          // undefined → no b²c here
```

`window.b2cAgent` is defined by b²c's page-world script (`env-main.js`), only where `data-b2c-agent` is set.
It's a wrapper over a DOM event pair, and this is its exact text (Dev uses it verbatim):

```js
if (!('b2cAgent' in window)) { let n = 0; Object.defineProperty(window, 'b2cAgent', { value: Object.freeze({ v: 1,
  describe: (req = {}) => new Promise((ok, no) => {
    const id = req.id != null ? String(req.id) : 'b2c-' + Date.now().toString(36) + '-' + n++;
    const done = () => { clearTimeout(t); document.removeEventListener('b2c:described', h); };
    const t = setTimeout(() => { done(); no(new Error('b2c: no answer')); }, 2000);
    const h = e => { let d; try { d = JSON.parse(e.detail); } catch (x) { return; } if (d && d.id === id) { done(); ok(d); } };
    document.addEventListener('b2c:described', h);
    document.dispatchEvent(new CustomEvent('b2c:describe', { detail: JSON.stringify({ ...req, v: 1, id }) }));
  }) }) }); }
```

Without the wrapper (tests do this), send `b2c:describe` with a JSON-string `detail` carrying your own `id`,
and take the `b2c:described` whose parsed `id` matches. **Every answer echoes the request's `id`**, and the
wrapper always sends one, so concurrent callers never take each other's answers.

`detail` is a JSON **string** both ways (objects don't cross the content-script boundary reliably). The
same JSON is also written to `<script type="application/json" id="b2c-describe">` in `<head>`, so an agent
that can only read the DOM finds it there after asking once.

### Request (all optional)

```jsonc
{ "v": 1,
  "id": "any string",                         // always echoed back; the wrapper makes one if you don't
  "from": "2026-10-13", "to": "2026-11-03",   // due window, dates inclusive (a bare `to` is the whole day);
                                              // default: 7 days back, 14 ahead
  "refresh": false }                            // true: revalidate stale caches with read-safe GETs first
```

`refresh: false` (the default) answers from b²c's cache with **no network at all**. `refresh: true` may run
the read-safe list requests b²c already makes (`courses`, `planner/items`), at most once per 60 s per page.

### Response

```jsonc
{
  "$b2c": "describe", "v": 1, "id": "any string",   // the request's id, always
  "build": "0.1.0+20261020T002826",
  "at": "2026-10-20T10:00:00-07:00",          // when this was assembled
  "origin": "https://canvas.example.edu",
  "timeZone": "America/Los_Angeles",
  "userId": "123456",

  "page": {
    "kind": "assignment",                     // dev/src/core/canvas/page.ts PageKind
    "courseId": "4821", "itemId": "assignment:9001",
    "title": "Problem Set 1",
    "url": "https://canvas.example.edu/courses/4821/assignments/9001",
    "marksRead": false                        // true if *this* view has already marked something read
  },

  "courses": [{
    "id": "course:4821", "name": "MATH 201 Calculus II", "nickname": "Calc" | null,
    "code": "MATH 201", "term": "Fall 2026", "color": "#8a3ffc",
    "url": "https://canvas.example.edu/courses/4821", "favorite": true | null   // null: b²c has no dashboard-cards cache yet
  }],

  "due": [{                                    // planner items in the window, oldest first
    "id": "assignment:9001", "courseId": "course:4821",
    "title": "Problem Set 1", "type": "assignment",
    "due": "2026-10-24T23:59:00-07:00",
    "posted": "2026-10-10T09:12:00-07:00" | null,   // created_at / posted_at when b²c has it
    "points": 10 | null,
    "state": "upcoming",                      // see States
    "doneInB2c": false,                       // ticked in b²c's to-do (may differ from Canvas, see the planner toggle)
    "url": "https://canvas.example.edu/courses/4821/assignments/9001",
    "marksRead": false                        // opening url changes state (see marksRead below)
  }],

  "onPage": [{                                 // things on this page b²c knows by id (§3)
    "id": "assignment:9001", "selector": "[data-b2c-id=\"assignment:9001\"]", "shadowHost": null | "b2c-todo"
  }],

  "fresh": {                                   // the OLDEST cache behind each list: how stale it can be
    "courses": "2026-10-20T09:58:00-07:00", "due": "2026-10-20T09:58:00-07:00" },
  "readSafety": {                              // the live hazard list, so agents don't hard-code it
    "marksReadPaths": ["/courses/*/grades", "/courses/*/announcements/*", "/courses/*/discussion_topics/*",
                       "/conversations*", "/courses/*/modules/items/*"],
    "readSafeApi": ["GET /api/v1/courses", "GET /api/v1/planner/items", "..."]
  }
}
```

### States (`due[].state`)

One value, first match wins:
`excused`, `missing` (Canvas's flag; it wins even when a zero was recorded as a grade, because "missing" is
what the student needs to know), `graded`, `late` (submitted late, not graded yet), `submitted`, `done`
(marked complete in Canvas's planner), `overdue` (past due, submittable, not submitted, not flagged missing),
`past` (past, and nothing to submit:
announcements, events, notes, pages), `upcoming`. Built only from `planner/items` `submissions` and
`planner_override`, never from opening a page. `doneInB2c` is separate: b²c's own tick, which may differ from
Canvas's planner (it's a setting).

### Other field rules (Dev's lane, ruled 2026-10-20)

- `courses[].favorite` is `true | false | null`; `null` means b²c has no dashboard-cards cache yet.
- `url` is `null` for items with no page (planner notes). Otherwise it is always a **page** URL, never an
  `/api/` URL. Canvas's planner gives calendar events an `html_url` of `/api/v1/calendar_events/<id>`, so
  b²c maps those to `/calendar?event_id=<id>&include_contexts=<context_code>`.
- `courseId` is `null` for personal items (your own planner notes and user calendar events).
- **`marksRead` means "opening this changes state in Canvas"**: marks something read, or completes a module
  requirement. It's `true` for an unread announcement, discussion or inbox item, a Grades page with unread
  grades, and any item b²c knows has an incomplete "must view" module requirement. A read announcement is
  `false`. ("Must mark done" needs a click, so viewing never completes it.)
  It's `false` when b²c knows none applies. Assignment pages are on `readSafety.marksReadPaths` as
  `"/courses/*/assignments/* (when a must-view module requirement is open)"`, so a path-only agent is warned.
- **Errors:** if describe fails, the answer is `{ "$b2c": "describe", "v": 1, "id": …, "error": "<message>" }`.
  The wrapper resolves with it (it doesn't reject), so **callers check `d.error` first**.
- **Module items:** the row `<li>` carries `data-b2c-id="module_item:<id>"`, and the inner `.ig-row` carries the
  content's id (`assignment:<id>`, `wiki_page:<id>` …).

### What describe must not do

- Fetch an item page, a Grades page, a topic or a thread, or any endpoint outside "Safe".
- Include bodies (descriptions, messages, comments, grades' feedback). Titles and metadata only: an agent
  that wants a body fetches the read-safe API itself and knows what it's doing.
- Wait more than 50 ms on a warm cache with `refresh: false`.

## §3 Anchors on elements (verified 2026-10-20)

For targeting: "the row for assignment X". Set on b²c's own rendered rows always, and on Canvas's own
elements **only after a describe call** on that page (then kept current by the shared observer until the
page unloads).

| Attribute | On | Value |
|---|---|---|
| `data-b2c-id` | the element that represents the thing (row, card, link) | `type:id` |
| `data-b2c-course-id` | same element | `course:<id>` |
| `data-b2c-due` | same, when it has a due date | ISO 8601 with offset |
| `data-b2c-state` | same, when known | a §2 state |
| `data-b2c-marks-read` | any `<a>` (Canvas's or b²c's) whose navigation marks something read | `true` |
| `data-b2c-action` | any b²c control that **changes state** | a verb from the list below |
| `data-b2c-region` | b²c's regions | `panel`, `todo`, `card-due`, `pins`, `search`, `notes`, `gpa` |

**Action verbs** (2026-10-20). New verbs are added here first, and an agent treats an unknown verb as "writes
to Canvas".

| Writes to Canvas (visible in every Canvas client) | b²c only (this browser's b²c settings) |
|---|---|
| `mark-done`, `mark-undone` (when the planner-sync setting is on; otherwise b²c only) | `set-label`, `clear-label` (b²c-only names: to-do labels, card names and codes) |
| `dismiss`, `restore` (planner items) | `add-item`, `delete-item` (b²c's own to-do items) |
| `set-color`, `set-nickname`, `move-card`, `unfavorite` | `hide-card` |
| | `set-view`, `set-range` (to-do view and range; saved) |
| | `apply-theme` |

Rules:
- Canvas elements covered after describe: dashboard cards (`course:`), card due rows, Assignments list rows,
  Modules item rows (`module_item:` plus the content's id), to-do rows, calendar events where b²c can map them.
- b²c's rows inside shadow roots carry the attributes inside the root, and the shadow host carries
  `data-b2c-region`. Every b²c row has an accessible name with title, course and due ("Problem Set 1, MATH 201,
  due Sat 24 Oct 11:59 pm"), so accessibility-tree agents (Claude in Chrome `find`/`read_page`) get the
  same facts. Format: `"<Type>: <title>, <course code>, due <Ddd D Mon h:mm am/pm>"` plus `", overdue"` or
  `", done"`, e.g. "Assignment: Problem Set 1, MATH 201, due Sat 24 Oct 11:59 pm". These names are always on,
  because they serve screen readers too.
- An agent must never click an element with `data-b2c-action` unless its user asked for exactly that.
  The skill says so; the attribute is how it can tell.
- These names are reserved. Dev's build fails if a feature id or core attribute takes one (guard added
  2026-10-20).

## §4 Navigation helpers (draft, later)

Not in the first cut; listed so the names are reserved.
- `describe({ want: ["search"], q: "syllabus 311" })`: b²c's ⌘K index as results (`id`, `title`, `url`,
  `kind`), read-safe by construction because the index is.
- `describe({ want: ["pins"] })`: pins resolved for this week, with their URLs.

## §5 Theme authoring hooks (built, verified 2026-10-20)

What an agent writing a theme needs from b²c, and what Agent kit builds on top.

### The format

One format, the agreed dotfile in `design/spec/rice.md` ("Theme file v1"): `"$b2c": "theme", "v": 1`,
files `<name>.b2c-theme.json`, full rice `<name>.b2c-rice.json` with `css`. The skill teaches only this.
The presets in `design/spec/themes/` are its worked examples.

### Dev exposes

Agreed 2026-10-20: the core theme lane implements this format in `dev/src/core/theme/`
(`src/features/themes/model.ts` is the old "look" format and is being superseded). Names below are as
proposed; Dev confirms the final export names when the lane lands.

1. **The validator as a Node-importable module**: `dev/dist/agent/theme.mjs` (or another path Dev picks),
   built from the same source the extension imports, exporting
   - `planTheme(json) → { values, cardColors, warnings, errors }` (what Import would write, and why not),
   - `sanitizeCss(css) → { css, removed[] }` (`src/core/theme/sanitize.ts`),
   - `THEME_LIMITS` (`{ themeBytes: 4096, cssBytes: 8192 }`).
   No DOM, no chrome.*: pure functions.
2. **A test-build apply path**: in a build with `B2C_TEST_FEATURES=1`, the service worker accepts
   `{ type: "b2c:themes:apply-file", theme }` and applies it exactly as Import → Apply does (one transaction),
   answering `{ ok, warnings }`. (Or Dev names an existing path that does the same.)
3. **Stability of `dev/mock-canvas/tools/browser.mjs`** (`launch`, `startMock`, `mockCookies`) as a
   consumer API, and the mock's named scenarios and `mock_now`.

### Agent kit builds (in `agentkit/bin/`)

- `b2c check <file>`: format and size (Dev's `planTheme`, `THEME_LIMITS`), CSS sanitising (`sanitizeCss`,
  listing what it would strip), contrast (Design's `check_themes.py` floors: text 4.5:1 and APCA, links,
  nav). Prints one line per finding with the field path and a fix, exit 1 on errors. Warnings don't fail.
- `b2c render <file> [--pages …] [--scheme light|dark|both] [--out dir] [--perf]`: builds b²c's test build
  with `dev/build.mjs --out agentkit/.scratch/b2c-test` (never `dev/dist`) when `dev/` changed, loads it
  headless (`--headless=new`, throwaway profile) on the mock, applies the theme through `b2c:themes:apply-file`,
  and writes PNGs of 7 pages (dashboard Courses tab, course home, Modules, Assignments, an assignment, Grades,
  Calendar) plus `contact.png`. `--perf` adds the budgets.spec measure with the theme applied.
- **Status, 2026-10-20: built and verified** (`agentkit/bin/`). Dev's `theme.mjs` and `apply-file` are live.

## Tests (Agent kit, `agentkit/tests/`)

`node agentkit/tests/contract.test.mjs` (about 15 s; builds the test build into `agentkit/.scratch` if `dev/`
changed; headless, throwaway profile, mock only) and `node agentkit/tests/describe-wrapper.test.mjs`. PASS,
FAIL (exit 1), or PENDING for parts Dev has said are still coming.

It checks:
- §1 detection, and that it's off when the setting is;
- §2 shape, ids, ISO times, states, page URLs (never `/api/`), and zero requests with `refresh: false`;
- the `<script>` copy of the answer, concurrent callers, and the raw event form;
- that describe works on other pages;
- §3 anchor formats, and that every `onPage` selector resolves;
- no mark-read endpoint in the whole run, and no write during any describe.

Canvas's own pages write too (GraphQL, the calendar's colour PUT), so writes are only judged inside describe
windows.

Dev may run it in ship once it's stable; until then Agent kit runs it on each ship and reports drift.
