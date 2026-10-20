# agentkit: b²c for agents

b²c is built to be used by agents as well as people. This folder is everything an agent, or a script an agent
writes, needs to work with Canvas through b²c, without breaking anything:

- **Read Canvas safely.** Canvas marks things read just because a page was opened, and it hides its data behind
  late-rendered pages with hashed class names. b²c gives an agent the page as JSON, and the skill teaches the
  read-only ways in.
- **Write themes and rices that don't bloat or break.** b²c is themed with a small file of tokens. The skill
  teaches the format and the taste, and two commands check a theme and render it on a mock Canvas.

The bar for everything here: an agent that has never seen b²c gets it right on the first try. Every skill was
tested that way, with fresh agents of different sizes given only the skill.

| Path | What |
|---|---|
| [`CONTRACT.md`](CONTRACT.md) | What b²c promises agents: `data-b2c-agent`, `window.b2cAgent.describe()`, element anchors, action markers, theme hooks |
| [`skills/canvas/`](skills/canvas/SKILL.md) | Skill: read Canvas without changing anything (calendar feed, REST GET-only, a signed-in tab, b²c's `describe()`). `canvasread.py` is a stdlib-only reader with tests |
| [`skills/theme/`](skills/theme/SKILL.md) | Skill: write a b²c theme or rice, check it, see it, hand it over |
| [`bin/b2c`](bin/README.md) | `b2c check <theme>` (about 0.2 s) and `b2c render <theme>` (about 4 s: 7 mock Canvas pages and one contact sheet) |
| `tools/canvas-session.mjs` | `openCanvas()`: a headless Canvas tab with b²c on the mock, for trying scripts before they touch a real account |
| `tests/` | `contract.test.mjs` checks the contract from outside (b²c's release gate) |

Everything runs on the mock Canvas in `dev/mock-canvas/`: headless, a throwaway browser profile, no account,
nothing sent anywhere. Set up once with `cd dev && npm install && npx playwright install chromium`.
