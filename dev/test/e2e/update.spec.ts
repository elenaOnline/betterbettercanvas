// Release update detection: a release build is loaded from a folder; we swap a
// newer build into the same path and expect the toolbar badge and the popup's
// "Reload b²c" offer. (Silent self-reload can't be proven headlessly: Chromium
// unloads CLI-loaded extensions on runtime.reload. It's verified on the owner's
// real install during her hands-on pass; see dev/NOTES.md.)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { test, expect } from './fixtures.ts';
import { quietChrome } from '../../scripts/quiet-chrome.mjs';

const DEV = path.resolve(import.meta.dirname, '../..');

test('a shipped build is detected and offered in the popup', async ({ canvas }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2c-rel-'));
  const live = path.join(dir, 'b2c');
  execFileSync(process.execPath, ['build.mjs', '--release', '--out', live], { cwd: DEV });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'b2c-e2e-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, ignoreHTTPSErrors: true, executablePath: quietChrome(),
    args: ['--headless=new', `--disable-extensions-except=${live}`, `--load-extension=${live}`,
      `--host-resolver-rules=MAP b2c-mock-school.instructure.com:443 127.0.0.1:${canvas.port}`, '--ignore-certificate-errors'],
  });
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
    const id = new URL(sw.url()).host;
    // Ship: write a different build id into the live folder (what the swap does).
    fs.writeFileSync(path.join(live, 'build-id.txt'), '9.9.9+shipped\n');
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.getByText('A new build of b²c is ready (9.9.9+shipped)')).toBeVisible();
    expect(await sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('↑');
  } finally {
    await ctx.close();
    fs.rmSync(profile, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
