# Better Canvas selectors vs the mock

Better Canvas works against production Canvas today, so every Canvas selector it uses is evidence of
what production DOM contains. This file lists them and records whether the mock satisfies each.

- **Source list:** `data/bc-selectors.json`, extracted from bc **9.9.1** (installed build,
  `research/reference/bc-installed/9.9.1_0/`, now branded BetterCampus; only its Canvas adapter, not
  Brightspace/Moodle/Blackboard/Classroom/Gradescope) and bc **5.12.6** (`research/reference/bc-repo/`).
  Only selectors that target Canvas' own DOM are kept; where bc mixes its own classes in, the Canvas part
  is kept and the original is in `feature`. Template-literal selectors (`${…}`) are checked as
  prefix/suffix attribute matches.
- **Priority:** `high` = used from bc's JS or a feature stylesheet; `low` = only in bc's dark-theme CSS.
- **The check:** `node dev/mock-canvas/check-selectors.mjs` loads each page variant (see
  `tools/variants.mjs`: classic dashboard in cards/planner/activity/legacy-todo, nicknames, the widget
  dashboard on both tabs, an open global-nav tray, every course page, calendar, inbox with the compose
  modal open, profile, grades, login) headlessly, waits for late rendering, and counts matches for every
  selector tagged with that page (or `any`). `--write-md` regenerates the table below.
- **Statuses:** `ok` (matches on at least one listed variant), `MISSING` (should match, doesn't: a mock
  bug), `expected-absent` (can't match a static untouched page: hover-only tooltips, file preview,
  TinyMCE, build-specific InstUI hash classes, bc's class-form `.section-tabs`), `not-a-selector`.

The generated table follows.
