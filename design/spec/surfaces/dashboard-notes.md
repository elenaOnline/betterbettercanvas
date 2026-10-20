# dashboard-notes: Notes section of the side panel

*Design, draft 1, 2026-10-19. The frame is `_dashboard.md` §5. Behaviour
reference is `research/features.md` D9.*

**Acceptance:** typing is never lost (it's saved 500 ms after the last
keystroke and on blur), and it syncs across her devices.

- A plain-text area that grows with its content up to 12 lines, then scrolls
  inside. Placeholder: "Notes".
- The body is 14 px Canvas face. There's no formatting toolbar in v1, but
  Markdown-ish lists render as typed (it's plain text).
- Save state is quiet: a "Saved" line in tertiary at the foot, for 1.5 s after
  each save. "Couldn't save · Retry" stays until it succeeds.
- Notes go to `chrome.storage.local` (no 8 KB cap) and are mirrored to sync in
  chunks for cross-device use. Dev's call on mechanism.
- The section collapses to its header with a first-line preview: "Notes · Office
  hrs moved to Thu…".
