# Privacy

b²c runs entirely in your browser.

- **No data leaves your device.** b²c has no server, no account, no
  analytics and no telemetry. It talks only to your school's Canvas, as you,
  using Canvas's own pages and API, the same requests Canvas makes itself.
- **What it stores, locally:** your b²c settings (synced through your
  browser's own sync if you use it), small caches of Canvas data so pages render
  instantly, and an optional error log you can view, copy and clear in
  Settings › About. The error log never includes page content or personal data.
- **Permissions:** `*.instructure.com` to run on Canvas, `storage`,
  `scripting` and `alarms` for settings and updates, `activeTab` to recognise
  a Canvas tab when you click the toolbar button, and `declarativeContent` to
  grey the icon on Canvas sites b²c can't reach. Other school domains are added
  only when you click **Turn on** and approve the browser's prompt.
- **Writes to Canvas** happen only when you act: ticking an item done (with
  planner sync on), renaming, recolouring or reordering a course card, adding a
  personal to-do. Each one is your own Canvas action, shown and undoable.
- **Detectability:** a web page can tell that b²c is installed by probing one
  of its script files. No data is exposed that way.
- **Shared themes:** imported themes are tokens only. Imported custom CSS has
  every remote URL, `@import` and remote font removed before you preview it.
