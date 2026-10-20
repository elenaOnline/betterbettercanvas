# mock-canvas

A local imitation of **canvas.example.edu** (Canvas LMS as Example University runs it) for b²c's automated
tests and for Design's prototypes. Nobody can test against real Canvas: only the owner's browser is signed
in, and we don't touch it. Every b²c feature test runs against this mock, so fidelity to production
DOM matters more than breadth.

- Zero npm dependencies at runtime: `node:https` + plain modules, Node 24.
- Serves the **real** the pilot school brand CSS, Canvas' current `common` bundle and fonts (captured from public URLs),
  plus page bundles compiled from canvas-lms source.
- Pages ship the server HTML Canvas ships, then **render their React/Backbone parts late** (after
  `mock_delay`, default 250 ms) from the mock's `/api/v1`, so extensions face DOM that arrives late.
- Routes on path only and answers for **any hostname**, so the extension manifest stays the
  production one.

## Quick start

```sh
dev/mock-canvas/make-cert.sh                 # once: self-signed cert for canvas.example.edu into .certs/ (gitignored)
node dev/mock-canvas/server.mjs              # https://127.0.0.1:8443, answers as canvas.example.edu
node dev/mock-canvas/server.mjs --port 8443 --http-port 8080   # also plain HTTP
```

Point a **headless** Chromium at it (house rule: never a visible window, always a throwaway profile):

```sh
chrome-headless-shell --user-data-dir="$(mktemp -d)" \
  --host-resolver-rules="MAP canvas.example.edu 127.0.0.1:8443" --ignore-certificate-errors \
  https://canvas.example.edu/
```

Any other host works too (`MAP *.instructure.com 127.0.0.1:8443`): absolute links in pages and API
JSON are rewritten to the requesting origin.

From Node, use `tools/browser.mjs`, which does all of that with the Playwright-cached
chrome-headless-shell and deletes the profile afterwards:

```js
import {launch, startMock, mockCookies} from './dev/mock-canvas/tools/browser.mjs'
const mock = await startMock()                       // in-process server on a free port
const {ctx, close} = await launch({port: mock.port, hosts: ['canvas.example.edu']})
await ctx.addCookies(mockCookies({scenario: 'heavy', delay: 0, view: 'widget', tab: 'courses'}))
const page = await ctx.newPage(); await page.goto('https://canvas.example.edu/')
// ... await close(); await mock.close()
```

`launch()` needs `playwright-core` in `.tools/` (gitignored): `cd dev/mock-canvas/.tools && npm i playwright-core@1.56.1`.
To load an extension, pass `extraArgs: ['--disable-extensions-except=<dir>', '--load-extension=<dir>']`
(chrome-headless-shell cannot load extensions; set `MOCK_CHROMIUM` to the Playwright `chromium-*/…/Chromium` binary
and keep `headless: true`, which uses the new headless mode).

## Control: cookies and endpoints

All per-request, so parallel tests don't interfere. Set them on the mock's host.

| Cookie | Values | Default | Effect |
|---|---|---|---|
| `mock_scenario` | `default` `empty` `heavy` `nicknames` `grading` | `default` | which data set |
| `mock_now` | any ISO 8601 instant | `MOCK_NOW` env, else `2026-10-21T10:00:00-07:00` (Wed) | "now"; every date is derived from it |
| `mock_delay` | ms, `0` allowed | `250` | delay before late (client-rendered) DOM appears; applied per stage |
| `mock_dashboard_view` | `cards` `planner` `activity` `widget` | `MOCK_DASHBOARD_VIEW` env, else `cards` | classic Card/List/Recent-activity views, or the new widget dashboard |
| `mock_dashboard_tab` | `courses` `dashboard` | `ENV.PREFERENCES.learner_dashboard_tab_selection` (`courses`) | widget dashboard tab |
| `mock_legacy_todo` | `1` | off | dashboard sidebar renders the legacy server To Do + Coming Up (teacher/legacy path) instead of the planner ToDoSidebar |
| `_csrf_token` | set by the server on every page | | writes must send it back as `X-CSRF-Token` |

Shortcuts: `GET /__mock/set?scenario=heavy&now=…&delay=0&view=planner&next=/` sets cookies and
redirects; `POST /__mock/reset` drops all in-memory state; `GET /__mock/info` shows scenario, now, course ids.

the owner's real account is on the **new widget dashboard, Courses tab** (Research, `research/canvas-live.md` §0).
The mock still defaults to the classic Card View; run with `MOCK_DASHBOARD_VIEW=widget` (or the cookie) to match her.

## Scenarios

State lives in memory per (scenario, now). Writes (colours, nicknames, favourites, positions, planner
notes and overrides, dashboard view, settings) persist until restart or `/__mock/reset`.

| Scenario | What it is |
|---|---|
| `default` | Fall 2026. Five courses: MATH 401 Abstract Algebra I, MATH 301 Intro to Mathematical Analysis I (both weighted), CHEM 101 General Chemistry I (points), CHEM 107 General Chemistry Laboratory I (1-credit lab, no letter grades), WRIT 202 Research and Writing as Inquiry (weighted), plus the **Academic Advising** non-course (default term, no assignments). Past (Spring 2026) and future (Winter 2027) enrolments for `/courses`. Each course has 15 assignments covering graded, late, excused, missing (with and without a late-policy zero), submitted-ungraded, pending-review quiz, overdue unsubmitted, due today, the next 3 days, next week, far future, and no due date; pass/fail and points grading; comments and unread grades; 3 announcements, discussions, 4 modules. Calendar events, 2 planner notes, 5 conversations (2 unread). Card colours are Canvas' default palette in order. |
| `empty` | A student with no enrolments at all. |
| `heavy` | 14 courses (13 + Advising), **303 assignments**; exercises paging (`Link` headers) and performance. |
| `nicknames` | `default` plus nicknames (one with an emoji), custom colours, a course card image, explicit favourites (Advising un-starred) and a custom card order. |
| `grading` | `default` plus: MATH 401 uses a custom scale (A from 93%) and drop-lowest homework; MATH 301 has **grading periods** (two halves, totals for all periods allowed); CHEM 101 has drop-lowest-2 and drop-lowest+highest groups; CHEM 107 becomes weighted; WRIT 202 **hides final grades**. |

Course ids (default): 118200 MATH 401, 118207 MATH 301, 118214 CHEM 101, 118221 CHEM 107, 118228 WRIT 202,
100100 Advising. Assignment ids are `<course>01`…`<course>15`; quiz ids are assignment id + 5000.

## Pages

| Path | Module | Late-rendered parts |
|---|---|---|
| `/` | `pages/dashboard.mjs` + `client/dashboard.js` | header + options menu, cards, `/dashboard-sidebar` → ToDoSidebar, planner, activity |
| `/` (widget) | `pages/dashboard_widget.mjs` + `client/dashboard_widget.js` | whole app in `#content` |
| `/dashboard-sidebar` | `pages/dashboard.mjs#sidebar` | HTML fragment the dashboard XHRs into `#right-side` |
| `/courses` | `pages/courses_index.mjs` | |
| `/courses/:id` | `pages/course_home.mjs` | |
| `/courses/:id/assignments` | `pages/assignments_index.mjs` | |
| `/courses/:id/assignments/:aid` | `pages/assignment_show.mjs` | |
| `/courses/:id/assignments/syllabus` | `pages/syllabus.mjs` | |
| `/courses/:id/grades` | `pages/grades.mjs` + `client/grades.js` | totals, pills; What-If |
| `/courses/:id/modules`, `/announcements`, `/discussion_topics` | `pages/modules.mjs`, `announcements.mjs`, `discussions.mjs` | |
| `/courses/:id/quizzes/:qid`, `/take` | `pages/quiz.mjs` | |
| `/calendar`, `/conversations`, `/profile/settings` | `pages/calendar.mjs`, `conversations.mjs`, `profile_settings.mjs` | |
| `/grades` | `pages/grades.mjs#allGrades` | |
| `/login/canvas` | `pages/login.mjs` | the live capture, with assets made local and scripts removed |

Every page has the global nav (`#header.ic-app-header`, with working Courses / Account / Help /
History **trays** in `body > #nav-tray-portal`), `#wrapper.ic-Layout-wrapper`, `#main`,
`#content-wrapper`, `#content`, `#right-side-wrapper > aside#right-side`, breadcrumbs
(`gems/canvas_crummy` markup, `<ol>`), course pages get `#left-side` with `ul#section-tabs`, and
`window.ENV` / `window.INST` inline in `<head>` as production has them.

## API (`/api/v1`)

JSON shapes follow canvas-lms' serializers. No `while(1);` prefix. Integer ids, or strings when the
request sends `Accept: application/json+canvas-string-ids`. Lists paginate with `per_page`/`page` and a
`Link` header (`current`, `next`, `prev`, `first`, `last`). Writes need `X-CSRF-Token` equal to the
(URL-decoded) `_csrf_token` cookie, else 422.

- users: `GET /users/self`, `/users/self/profile`, `/users/self/colors`, `GET|PUT /users/self/colors/:asset`
  (`course_<id>`; 3- or 6-digit hex, `#` optional), `GET|PUT /users/self/settings`,
  `GET|PUT /users/self/dashboard_positions`, `GET /users/self/favorites/courses`,
  `POST|DELETE /users/self/favorites/courses/:id`, `GET|DELETE /users/self/course_nicknames`,
  `GET|PUT|DELETE /users/self/course_nicknames/:course_id`
- dashboard: `GET /dashboard/dashboard_cards`
- courses: `GET /courses` (`include[]=total_scores|current_grading_period_scores|term|favorites|concluded|syllabus_body|tabs`,
  `enrollment_state`), `GET /courses/:id`, `/courses/:id/tabs`, `/courses/:id/assignments`
  (`include[]=submission`, `bucket`, `order_by`), `/courses/:id/assignments/:aid`,
  `/courses/:id/assignments/:aid/submissions/self`,
  `/courses/:id/assignment_groups` (`include[]=assignments&include[]=submission`, `grading_period_id`; `group_weight`, `rules.drop_lowest/drop_highest`),
  `/courses/:id/grading_periods`, `/courses/:id/students/submissions`, `/courses/:id/enrollments?user_id=self`,
  `/courses/:id/discussion_topics` (`only_announcements=true`), `/courses/:id/modules`, `/courses/:id/activity_stream/summary`
- planner: `GET /planner/items` (`start_date`, `end_date`, `context_codes[]`, `filter=incomplete_items|complete_items|new_activity`,
  `order`, `per_page` default 50; with no dates, ±2 weeks as Canvas does), `GET|POST /planner/overrides`,
  `GET|PUT|DELETE /planner/overrides/:id` (PUT assigns both `marked_complete` and `dismissed`, as Canvas does),
  `GET|POST /planner_notes`, `GET|PUT|DELETE /planner_notes/:id`
- lists: `GET /users/self/todo`, `DELETE /users/self/todo/assignment_:id/submitting`, `/users/self/todo_item_count`,
  `/users/self/upcoming_events`, `/users/self/missing_submissions` (`include[]=planner_overrides|course`),
  `/users/self/activity_stream`, `/users/self/activity_stream/summary`
- `GET /announcements?context_codes[]=…`, `GET /calendar_events` (`type=event|assignment`, `context_codes[]`, dates)
- `GET /conversations` (`scope`), `/conversations/unread_count`
- page-specific additions live in `api/extra-*.mjs` (auto-loaded).

Non-API: `PUT /dashboard/view` (`dashboard_view=cards|planner|activity`), `GET /dashboard-sidebar`.

## Scripts

| Script | What it does |
|---|---|
| `make-cert.sh` | self-signed cert for `canvas.example.edu` (+ localhost) into `.certs/` |
| `check-selectors.mjs [--write-md] [--all] [--scenario s]` | loads every page variant headlessly, checks every Canvas selector bc 9.9.1 / 5.12.6 uses (`data/bc-selectors.json`), writes `fixtures/selector-report.json`; `--write-md` regenerates the table in `SELECTORS.md`. Exit 1 if a high-priority selector is missing. |
| `export.mjs [--scenario s]` | static, post-render snapshots of every page → `fixtures/pages/<name>.html`, assets copied to `fixtures/assets/` with relative paths. Open `fixtures/pages/index.html` from disk. |
| `screenshots.mjs` | headless screenshots → `screenshots/` |
| `tools/fetch-live.sh` | re-captures the public the pilot school login page, CSS, fonts, images and brand files into `vendor-live/` |
| `tools/vendor-build.mjs` | rebuilds `vendor-built/` from the gitignored canvas-lms clone and tools (see Provenance) |

Folders: `data/` scenario generators and state, `api/` REST routes and serializers, `pages/` templates
(`pages/client/` = the late-render scripts), `lib/` time and HTML helpers, `mock-assets/` mock-only
assets (InstUI shim CSS, avatar, card image), `vendor-live/` (committed live captures),
`vendor-built/` (committed, derived from source), `.vendor/` `.tools/` `.certs/` (gitignored).

## Provenance

**canvas-lms source:** sparse shallow clone of `github.com/instructure/canvas-lms` `master` at
**`1c9f0bb8013ed69c4f2efe11fd483025469b7e6c`** (2026-04-30, the newest public commit on 2026-10-19), in
`.vendor/canvas-lms` (gitignored). Production at the pilot school runs a build about six months newer.
InstUI is pinned to what that commit uses: `@instructure/ui-themes` and `ui-icons` **11.6.0**.

**Live, public the pilot school assets** (`vendor-live/`, captured `vendor-live/CAPTURED_AT` = 2026-10-19T22:30Z by
`tools/fetch-live.sh`, unauthenticated):
- `login-canvas.html` (+ `login.headers`, `login-ENV.json`, `brand-variables.json` extracted from it)
- `dist/brandable_css/0e0c27faeac181dbf0ed272302a09aa7/variables-9dec371ad57e3dd0396f0b2eddb63479.{css,js}`: the pilot school brand (primary `#213921`, link `#005F85`); served with its S3 image URLs rewritten to `/mock-assets/school/…` (copies in `school-account/`)
- `dist/brandable_css/new_styles_normal_contrast/bundles/common-701cbe13bb.css` (current common bundle), `login-12e2577bfb.css`, `fonts-eb4a10fb18.css`, high-contrast variables, TinyMCE content CSS
- every font and image those stylesheets reference (`dist/fonts`, `dist/images`)
- `school-account/account-script.js`: the pilot school's account-level custom JS. It only loads **YuJa Panorama** (an accessibility/alt-format tool): it fetches a script URL from `panorama-api.yuja.com` and injects it. Panorama then decorates file links and adds its own UI. **The mock does not run it**: it is third-party, network-dependent and non-deterministic, and it changes nothing b²c anchors on. Tests that care should stub a Panorama-like node.
- Page bundles (dashboard, grades, …) are **not** discoverable without a session: their filenames carry a content hash. The CDN's `brandable_css_bundles_with_deps.json` is public but **stale (2021)**; its checksums are kept as `dist/brandable_css/STALE-2021-bundle-checksums.json` for reference. So page CSS is compiled from source instead (next item). The webpack JS bundles were downloaded and then deleted: the mock never runs Canvas' JS.

**Compiled from source** (`vendor-built/`, by `tools/vendor-build.mjs`, details in `vendor-built/SOURCE.json`):
- `css/<bundle>.css` from `app/stylesheets/bundles/<bundle>.scss` (dart-sass, variant `new_styles_normal_contrast`, `url()`s mapped to the live hashed files): dashboard_card, dashboard, react_todo_sidebar, grade_summary, course_show, context_modules2, announcements_index, discussions_index, discussions, assignments, new_assignments, assignments_2_student, calendar2, canvas_inbox, all_courses, course_list, profile_edit, syllabus, user_grades, login. Served at `/dist/brandable_css/new_styles_normal_contrast/bundles/<bundle>-mock.css`.
- `css/planner.css`: the planner's runtime CSS, evaluated from `ui/shared/planner/components/*/style.js` with the InstUI 11.6 canvas theme + the pilot school brand variables (production injects these as `<style>` tags; BadgeList's unclosed block is auto-closed as a browser would).
- `icons.json`: InstUI Line/Solid icon paths (rendered as InstUI's `<svg name="Icon…" class="css-…-inlineSVG-svgIcon">`).
- `svg/`: global-nav SVG partials from `app/views/shared/svg/`.

**InstUI runtime CSS** for React-rendered parts is approximated in `mock-assets/instui-shim.css` with
stand-in class names. Production class names are emotion hashes (`css-<hash>-<label>`) that change per
build; don't anchor on them in either place.

### Per page

| Page | Fidelity | canvas-lms files followed | Live assets | Notes / gaps |
|---|---|---|---|---|
| Layout, global nav, crumbs, ENV | high | `app/views/layouts/application.html.erb`, `_head.html.erb`, `shared/_new_nav_header.html.erb`, `gems/canvas_crummy/…/view_methods.rb`, `app/helpers/section_tab_helper.rb`, `ui/features/navigation_header/react/OldSideNav.tsx`, `trays/*Tray.tsx` | common, brand, fonts, live `ENV` keys from the login page | ENV keys copied from live where public (FEATURES, SETTINGS, brand, account ids); user-specific keys from `application_controller.rb`. Global-nav LTI item ("Studio") and Help links are plausible, not observed. Trays are simplified InstUI. |
| Dashboard (classic cards / planner / activity) | high for cards and sidebar, medium for planner and activity | `users/user_dashboard.html.erb`, `shared/_dashboard_card.html.erb`, `ui/shared/dashboard-card/react/DashboardCard.tsx`, `DashboardCardAction.jsx`, `DashboardCardBox.tsx`, `ui/features/dashboard/react/DashboardHeader.jsx`, `users/dashboard_sidebar.html.erb`, `shared/_event_list.html.erb`, `courses/_recent_feedback.html.erb`, `courses/_to_do_list.html.erb`, `ui/shared/planner/components/ToDoSidebar/*`, `PlannerApp`, `Day`, `Grouping`, `PlannerItem` | dashboard_card / dashboard / react_todo_sidebar compiled CSS, planner runtime CSS | Card DOM is line-for-line; the options menu, card ⋮ popover and planner header are simplified InstUI. No drag-and-drop reordering in the UI (the API works). |
| Dashboard (widget) | see `pages/dashboard_widget.mjs` header | `ui/features/widget_dashboard/**`, `users_controller.rb` ENV, Research's live DOM capture (`design/captures/2026-10-19-new-dashboard-dom.md`) | | |
| Grades (course) | high | `gradebooks/grade_summary.html.erb` (legacy table branch), `courses/_sidebar_weighting.html.erb`, `app/presenters/grade_summary_assignment_presenter.rb`, `app/helpers/gradebooks_helper.rb`, `gradebooks_controller.rb` (`group_as_assignment`, `total_as_assignment`), `ui/features/grade_summary/jquery/index.jsx` | grade_summary compiled CSS | Totals computed client-side like production, including What-If, drop rules, weights, "only graded". Status pills, the `GradeSummarySelectMenuGroup` selects and the score-distribution graph are approximations. If the pilot school has the site-admin flag `student_grade_summary_upgrade`, production renders a React table into `#grade-summary-react` instead: Research saw `#grades_summary` live, so the legacy branch is right today. |
| Grades (all courses) | high | `users/grades.html.erb` | user_grades compiled CSS | |
| Login | high | (live capture) | login bundle, brand | scripts removed; form posts nowhere real |
| Other pages | see each module's header comment | | | filled in as the lanes land |

## Known gaps (most important first)

1. **Source is six months older than production** (April vs October 2026). Live captures cover the
   common CSS and brand only; page DOM comes from source, checked against Research's live notes where
   they exist. Re-check anchors on the owner's hands-on pass.
2. **InstUI-rendered DOM is approximate** (hashed class names, wrapper spans, focus/popover behaviour).
   `data-testid`s, ids, roles and Canvas' own stable class names are reproduced; emotion classes are not.
3. Page CSS bundles are compiled by us, not downloaded, so small differences from production CSS are possible.
4. Canvas' JS never runs: anything a test needs from it (menus, trays, What-If, planner check-off) is
   re-implemented in `pages/client/*.js`, and only the behaviour listed above exists.
5. Read-on-view side effects (e.g. `bulk_mark_read` on Grades) are not simulated.
6. YuJa Panorama (the pilot school's account JS) is not run.

## Stable API for other tools

`tools/browser.mjs`'s `launch`, `startMock` and `mockCookies` are a **stable
API**. The Agent kit's `b2c render|check` (agentkit/) consumes them. Change
their signatures only after telling the Dev lead, who coordinates with the
Agent kit.
