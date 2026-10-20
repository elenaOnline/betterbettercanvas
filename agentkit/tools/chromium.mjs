// Which Chromium agentkit's tools launch: render, canvas-session and the contract test all use this one.
//
// Dev owns the answer: dev/mock-canvas/tools/browser.mjs exports chromiumPath() ($MOCK_CHROMIUM, else on macOS
// a background-only copy of Chrome for Testing that never shows in the Dock, else Playwright's Chrome).
// Full Chromium is needed because chrome-headless-shell can't load extensions.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DEV } from './theme-adapter.mjs';

export async function chromiumPath() {
  const browser = await import(pathToFileURL(path.join(DEV, 'mock-canvas/tools/browser.mjs')).href);
  if (typeof browser.chromiumPath === 'function') return browser.chromiumPath();
  // Older dev/ without the shared resolver: same order by hand.
  if (process.env.MOCK_CHROMIUM) return process.env.MOCK_CHROMIUM;
  const quiet = path.join(DEV, 'scripts/quiet-chrome.mjs');
  if (fs.existsSync(quiet)) { const q = (await import(pathToFileURL(quiet).href)).quietChrome(); if (q) return q; }
  try { return createRequire(path.join(DEV, 'package.json'))('playwright-core').chromium.executablePath(); } catch {}
  throw new Error('no Playwright Chromium found: run  (cd dev && npx playwright install chromium)  or set MOCK_CHROMIUM');
}
