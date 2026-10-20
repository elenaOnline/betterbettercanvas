// Playwright fixtures: a headless Chromium with the built extension loaded, a
// throwaway profile, and canvas.b2c-mock.test resolved to the mock Canvas.
//
// HOUSE RULE: headless only, throwaway --user-data-dir only. Never the owner's
// Helium or its profiles. B2C_BROWSER=helium uses the Helium *binary* with a
// throwaway profile; it never attaches to her running instance.
import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startCanvas, type CanvasServer } from './canvas-server.ts';

const DEV = path.resolve(import.meta.dirname, '../..');
export const DIST = process.env.B2C_DIST ? path.resolve(process.env.B2C_DIST) : path.join(DEV, 'dist');
/** Default test school: Instructure-hosted, so the manifest matches it. */
export const CANVAS = 'https://b2c-mock-school.instructure.com';
/** A custom-domain school (needs a runtime grant; see sites/custom-domain tests). */
export const CUSTOM_CANVAS = 'https://canvas.b2c-mock.test';

const HELIUM = '/Applications/Helium.app/Contents/MacOS/Helium';

interface Fixtures {
  context: BrowserContext;
  sw: Worker;
  /** Write b²c settings (flat keys) straight into chrome.storage. */
  setSettings(values: Record<string, unknown>): Promise<void>;
}

export const test = base.extend<Fixtures, { canvas: CanvasServer }>({
  canvas: [async ({}, use) => {
    const c = await startCanvas();
    await use(c);
    await c.close();
  }, { scope: 'worker' }],

  context: async ({ canvas }, use) => {
    // Tests in a worker share one mock server: start each from clean state.
    await canvas.reset();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'b2c-e2e-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      executablePath: process.env.B2C_BROWSER === 'helium' ? HELIUM : undefined,
      ignoreHTTPSErrors: true,
      args: [
        '--headless=new',
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        `--host-resolver-rules=MAP *.instructure.com:443 127.0.0.1:${canvas.port},MAP canvas.b2c-mock.test:443 127.0.0.1:${canvas.port}`,
        '--ignore-certificate-errors',
        '--mute-audio',
      ],
    });
    await use(context);
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  },

  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(sw);
  },

  setSettings: async ({ sw }, use) => {
    await use(async values => {
      await sw.evaluate(async v => {
        // Route by area exactly like the store does, using the built schema.
        const schema = (await (await fetch(chrome.runtime.getURL('schema.json'))).json()).settings as Record<string, { area: string }>;
        const sync: Record<string, unknown> = {}, local: Record<string, unknown> = {};
        for (const [k, x] of Object.entries(v)) (schema[k]?.area === 'local' ? local : sync)[k] = x;
        await chrome.storage.sync.set(sync);
        await chrome.storage.local.set(local);
      }, values);
    });
  },
});

export const expect = test.expect;
