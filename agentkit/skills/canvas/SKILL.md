---
name: canvas-read
description: Read Canvas LMS (any school's Canvas: courses, assignments, due dates, modules, files, announcements) from a script or an agent without changing anything: through the private calendar feed, the REST API with GET only, a signed-in browser tab, or b²c's agent contract. Use when asked to find what's due, watch for new homework, list a course's assignments or files, or otherwise scrape or automate Canvas.
---

# Reading Canvas without breaking anything

Canvas is hard to scrape. It sits behind school sign-in (often SSO plus 2-factor), its pages render late in
React with hashed class names, and **some pages change things just by being looked at**: they mark grades,
announcements and messages as read, or tick a module's "must view" step. The person you're working for then
loses their "new" dots and their instructor's view counts change. So the rules are:

1. **Read data, not pages.** Use the feed or the REST API's list endpoints. Don't open item pages to learn about
   them.
2. **Never sign in for anyone, never ask for a password, never store one.** If you need access, ask for one of
   the things below and give the exact click-path.
3. **GET only.** Never submit, post, mark, dismiss, rename, recolour or reorder anything unless the person asked
   for exactly that action.

`canvasread.py` in this folder (Python 3.9+, standard library only) does the reading and enforces rules 1 and 3:
it refuses non-GET requests and any endpoint off a read-safe allowlist **before** anything goes over the network.

## Pick your way in

| You have | Use | Gets you |
|---|---|---|
| Nothing yet, and the job runs unattended | ask for the **calendar feed link** (below) | dated assignments and events, 30 days back to a year ahead. No login ever |
| The feed link | `canvasread.py feed` / `parse_feed()` | title, course code, due time, description (when unlocked), file links in it, change stamp |
| An access token the person made themselves | `canvasread.py rest` / `Canvas(...)` | the full read API: posting dates, points, submission state, files, modules |
| A browser tab that's already signed in, which you drive | `fetch()` the REST API from the page (below) | the same as a token, with the person's session, while the tab is open |
| b²c installed in that browser | `window.b2cAgent.describe()` (below) | the page, courses and due items as JSON, from b²c's cache, with no requests |

### Getting the feed link (give the person these steps)

> In Canvas, open **Calendar** in the left navigation bar. At the bottom of the right-hand sidebar, click
> **Calendar Feed**. Copy the link in the box that opens, paste it into a file only you can read (for example
> `canvas_feed.url`, then `chmod 600 canvas_feed.url`), and tell me the file's path.

The link is a secret: anyone who has it can read that calendar. Keep it out of git, logs and messages, and pass
`fetch_feed()` the **file's path** so your code never prints it.

### Tokens

A personal access token (Account → Settings → Approved Integrations → **+ New Access Token**) can do anything the
person's account can, including submitting and messaging, until it expires. Schools often cap its lifetime. Only
the person makes one, and only if they decide to. Keep it in the OS keychain or a `chmod 600` file outside any
repo, and send it only through `Canvas(...)`, which refuses writes. Some schools turn tokens off; treat 401/403 as
"not available here".

## Recipes

```bash
python3 canvasread.py feed ./canvas_feed.url --course 4821              # one course, soonest first
python3 canvasread.py feed ./canvas_feed.url --kind assignment --json   # everything, as JSON
python3 canvasread.py rest https://canvas.example.edu --token-file ~/.config/canvas/token planner
python3 canvasread.py rest https://canvas.example.edu --token-file ~/.config/canvas/token assignments 4821
```

```python
import canvasread as cr
items = cr.for_course(cr.parse_feed(cr.fetch_feed("canvas_feed.url")), 4821)
new = [i for i in items if i["kind"] == "assignment" and i["id"] not in seen]
changed = [i for i in items if i["id"] in seen and i["updated"] != seen[i["id"]]["updated"]]
for i in new:
    print(i["title"], i["due_date"], i["url"], [l["href"] for l in i["links"] if l["file_id"]])
```

- **Watching for new homework:** store each item's `id` and `updated` (the feed's DTSTAMP, Canvas's
  `updated_at`). New id = new assignment; same id, new `updated` = it changed. Diff `due` and `description` to say
  what changed. An empty feed is a hiccup, not "everything was deleted".
- **When was it posted?** The feed doesn't say. With a token: `Canvas(...).assignments(cid)` → `created_at`, or
  `unlock_at` for "visible from". Without one, use the time you first saw it, and say so.
- **Handouts:** the feed only has them as links inside the description, and only while the assignment is
  unlocked. `item["links"]` marks Canvas file links with `file_id`. With a token, `assignment_files()` returns their
  names, sizes and types. **Don't download them yourself**: a download counts as a view. Give the person the link.
- **No description?** `locked_or_no_description: True` usually means the assignment is still locked for them
  (future unlock date or module prerequisites). Canvas leaves the text out until it unlocks.

### From a signed-in browser tab

If you drive a browser where the person is already signed in (Claude in Chrome, Playwright on their profile), call
the API from the page instead of reading the page. GET requests ride on the session, and no token is needed:

```js
const get = p => fetch('/api/v1/' + p, { headers: { Accept: 'application/json+canvas-string-ids' } }).then(r => r.json());
await get('planner/items?start_date=2026-10-19&end_date=2026-11-02&per_page=100');
await get('courses?enrollment_state=active&include[]=term&per_page=100');
```

Use only the endpoints in the table below, follow the `Link` header for more pages, run one request at a time,
and **never navigate the tab to a page in the "changes state" list**. Open your own tab, close only that tab, and
don't touch controls that save preferences (dashboard tabs, view switches, filters).

### With b²c installed

b²c (betterbettercanvas) has a contract for agents (`agentkit/CONTRACT.md`). Check for it first:

```js
document.documentElement.dataset.b2cAgent       // "1" → contract v1 is available on this page
const d = await window.b2cAgent.describe();      // { page, courses, due, onPage, readSafety, ... }
```

`describe()` answers from b²c's cache and makes no requests. **Check `d.error` first**: on a failure the
answer carries an `error` message, not data. `d.due` has every item in a window with its state
(`upcoming`, `overdue`, `missing`, `submitted`, `graded`, `done`, `past`, …). Each one carries `marksRead`, which tells you whether
opening its `url` would mark something read. On the page, `[data-b2c-id="assignment:123"]` finds an item's row,
`[data-b2c-marks-read]` flags links to avoid, and **anything with `data-b2c-action` changes state**, so don't
click it unless asked. If the attribute is missing, b²c isn't there: use the recipes above.

b²c's own rows (card due lists, to-do) live inside **open shadow roots**, so `document.querySelector` won't find
them. Each `d.onPage[]` entry gives a `selector` plus the `shadowHost` element to search in; or walk the shadow
roots:

```js
const deep = (sel, root = document) => root.querySelector(sel)
  ?? [...root.querySelectorAll('*')].map(e => e.shadowRoot && deep(sel, e.shadowRoot)).find(Boolean) ?? null;
deep('[data-b2c-id="assignment:123"]');
```

Accessibility-tree tools (Claude in Chrome `find` / `read_page`) see into shadow roots already. Each b²c row is
named like "Assignment: Problem Set 1, MATH 201, due Sat 24 Oct 11:59 pm".

**Practising without a real account:** in the b²c repo, `agentkit/tools/canvas-session.mjs` opens a headless
Canvas tab on the mock with b²c loaded: `const { page, origin, close } = await openCanvas();`. Use it to try a
script before it ever touches a real account.

## Read-safe and not

**Safe (GET, lists):** `users/self` (+`/colors`, `/course_nicknames`), `courses`, `dashboard/dashboard_cards`,
`planner/items` (**always pass `start_date` and `end_date`**), `courses/:id/modules` (`include[]=items`) and
`modules/:mid/items`, `courses/:id/assignment_groups`, `courses/:id/assignments` (`include[]=submission` for
state and score), `courses/:id/pages` (titles only), `courses/:id/files`, `files/:id` (metadata only),
`courses/:id/discussion_topics` (the list), `announcements?context_codes[]=course_:id`.

**Changes state; don't, unless asked for exactly that:**
- opening a course's **Grades** page (it marks new grades seen; read scores from `assignments?include[]=submission`);
- opening an announcement, a discussion topic, or an inbox conversation, or any `…/read`, `read_all` or
  `mark_read` endpoint;
- opening a module item page (it can satisfy "must view" requirements);
- downloading or previewing a file (it counts as a view);
- `planner/overrides` (marks done or dismissed), course colours, nicknames, dashboard positions, and any
  POST/PUT/DELETE;
- dashboard tab switches, "switch to old dashboard", widget filters, and Customize → Save (all saved as
  preferences).

`canvasread.check_read_safe(method, path)` gives the same answer in code, with the reason.

## Pitfalls that bite every scraper

- **Dates:** the feed's times are UTC. An assignment due 11:59 pm local is the *next* calendar day in UTC. Use
  `due` (ISO 8601 with the local offset) or `due_date` (the local date), never the first 8 characters of DTSTART.
- **Course ids:** match them exactly. A substring test lets `course_1178` match `course_117896`. Use `for_course()`.
- **The `[…]` in feed titles is the course *code*,** not its name. `course_code` has it split off.
- **The feed's URL is a calendar link,** not the assignment page. `item["url"]` is rebuilt as
  `https://<host>/courses/<cid>/assignments/<aid>` from the feed's own host. Don't hard-code a school's host.
- **The feed's window** is 30 days back to 366 days ahead, dated items only. An undated assignment is never in it.
- **REST ids** are strings when you send `Accept: application/json+canvas-string-ids` (canvasread does). Lists
  paginate through the `Link` header. Treat its URLs as opaque.
- **Rate limits:** keep to one request at a time and slow down as `X-Rate-Limit-Remaining` falls.
- **Per-section due dates** show up as override events (`override: True`). They belong to the same assignment
  `id`.
- **Scores:** a missing `score` isn't a zero. It's not graded, or not posted yet. "Submitted" doesn't mean
  graded either. An all-day item (`all_day: True`) has no deadline time, so don't report it as midnight.
