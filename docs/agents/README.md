# b²c for agents

Canvas is hard for agents. Its pages render late, its class names are hashed, it hides data behind school
sign-in, and it **changes state when you look**: opening a Grades page clears "new grade" dots, and opening an
announcement marks it read. b²c treats agents as first-class users.

## On a Canvas page with b²c

```js
document.documentElement.dataset.b2cAgent        // "1": b²c's agent contract v1 is here
const d = await window.b2cAgent.describe();       // the page, courses and due items, as JSON
if (d.error) throw new Error(d.error);
d.due.filter(x => x.state === 'missing');         // states: excused, missing, graded, late, submitted, done, overdue, past, upcoming
```

- `describe()` answers from b²c's own cache and makes **no requests**. Nothing is marked read.
- Each item carries `marksRead`, which says whether opening its link would change something in Canvas.
- Elements carry `data-b2c-id` ("assignment:123"), `data-b2c-due` and `data-b2c-state`.
- Controls that change things carry `data-b2c-action`. Don't click those unless asked.
- The full contract: [`agentkit/CONTRACT.md`](../../agentkit/CONTRACT.md).

## Without a browser

The [Canvas skill](../../agentkit/skills/canvas/SKILL.md) covers the read-only ways in: the calendar feed (no
login) and the REST API with GET only. `canvasread.py` is one stdlib-only Python file that refuses anything
off a read-safe list before a request is sent.

## Themes and rices

The [theme skill](../../agentkit/skills/theme/SKILL.md) teaches the theme file (tokens, not selectors), the
contrast floors, and the taste. Then:

```bash
agentkit/bin/b2c check my.b2c-theme.json     # errors and warnings, each with the field and a fix
agentkit/bin/b2c render my.b2c-theme.json    # 7 mock Canvas pages and one contact sheet to look at
```

## Practise on the mock

`agentkit/tools/canvas-session.mjs` opens a headless Canvas tab with b²c on the mock:
`const { page, origin, close } = await openCanvas()`. Try your script there before it touches a real account.

## How it's tested

Every skill was tried cold, by fresh agents of different sizes given only the skill, and scored against an answer
key written beforehand. The trials included trap requests ("hide that box with CSS", "open the announcement").
The contract is checked from outside on every release by `agentkit/tests/contract.test.mjs`.
