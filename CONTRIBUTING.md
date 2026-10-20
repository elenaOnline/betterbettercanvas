# Contributing

Thanks for helping make Canvas better. A few rules keep b²c fast, private
and safe to develop.

## Develop against the mock, never a real account

- All tests run headless against the **mock Canvas** in `dev/mock-canvas/`.
  You never need a Canvas login, and you must not point tests at a real school
  or a real account.
- Browsers started by tests are **headless** with a **throwaway profile**
  (`test/e2e/fixtures.ts` does this). Don't drive your daily browser from
  scripts.
- Never fetch item pages (a single assignment, page, discussion or Grades
  page) in the background. Canvas marks them read or viewed. Use list
  endpoints only (see `ctx.data` in `dev/src/core/canvas/data.ts`).

## Shape of a feature

- `dev/src/features/<id>/index.ts` is the definition (settings, pages,
  pre-paint mirror). `run.ts` is the runtime, loaded lazily where the
  feature runs. Read `dev/ARCHITECTURE.md` first.
- Page CSS is gated by `html[data-b2c-…]` attributes and is in place before
  first paint. Square corners come from tokens (`--b2c-corner`).
- Budgets in `dev/budgets.json` (bytes, start time, requests) are enforced by
  `node scripts/ship.mjs`. Lower a number when you beat it.

## Hand-feel is part of done

Nothing flashes, shifts or waits on the network when a cache could answer.
Compare your change with the best existing equivalent before you call it
finished.

## Licence

By contributing you agree your work is licensed AGPL-3.0-or-later.
