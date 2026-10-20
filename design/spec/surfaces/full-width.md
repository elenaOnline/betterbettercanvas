# full-width

**Acceptance:** the dashboard and course pages use the whole window, and line length in rich content stays readable.

- A **Page width** segmented control (Standard · Wide · Full), instead of a switch (users asked for a control, not on/off). Standard is Canvas's 1366 px, Wide is 1680 px, Full is none, set through `--b2c-page-max` on `.ic-Layout-wrapper` on every Canvas page, as bc did, because she wants it everywhere.
- Only at **Wide** and **Full**, user content (`.user_content`) keeps
  `max-width: 80ch`. At **Standard**, b²c applies no measure, so pages are
  exactly Canvas's width (Research parity gap #4: b²c had been narrower than
  stock without asking), so assignment text doesn't run 2000 px wide. Tables and images inside it may go wider.
