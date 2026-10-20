// A background-only copy of Playwright's Chrome for Testing, for macOS.
//
//   node scripts/quiet-chrome.mjs        prints the executable path (builds the copy if needed)
//   import { quietChrome } from '…/quiet-chrome.mjs'
//
// On macOS, even with --headless=new, every launch of the stock "Google Chrome
// for Testing.app" registers a Dock icon, so a test suite flashes icons in and
// out of the Dock. The copy's main app has LSBackgroundOnly = true (it never
// checks in with the Dock or menu bar) and an ad hoc signature. Not LSUIElement:
// Chromium reads LSUIElement to mean "I am a helper process" and then can't find
// its framework ("icudtl.dat not found in bundle"). It lives outside the project, keyed by
// Playwright's browser folder (e.g. chromium-1248), so a Playwright browser
// update builds a fresh copy. Safe to call from parallel workers: the copy is
// built in a private temp dir and renamed into place; a READY marker is written
// last, so a half-built copy is never used.
//
// Other platforms (or no Playwright browser installed): returns undefined, and
// callers fall back to Playwright's default.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const DEV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(os.homedir(), 'Library/Caches/b2c-quiet-chrome');
const PLIST = '/usr/libexec/PlistBuddy';

function stockExecutable() {
  try {
    return createRequire(path.join(DEV, 'package.json'))('playwright-core').chromium.executablePath();
  } catch {
    return undefined;
  }
}

const plistHas = (plist, key) => {
  try { return execFileSync(PLIST, ['-c', `Print :${key}`, plist], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() === 'true'; } catch { return false; }
};
const plistSet = (plist, key) => {
  try { execFileSync(PLIST, ['-c', `Set :${key} true`, plist], { stdio: 'ignore' }); } catch { execFileSync(PLIST, ['-c', `Add :${key} bool true`, plist], { stdio: 'ignore' }); }
};

/** Path to the background-only executable, or undefined (use Playwright's default). */
export function quietChrome() {
  if (process.platform !== 'darwin' || process.env.B2C_QUIET_CHROME === '0') return undefined;
  const exe = stockExecutable();
  if (!exe || !fs.existsSync(exe)) return undefined;
  const app = exe.slice(0, exe.indexOf('.app/') + 4);              // …/Google Chrome for Testing.app
  const rel = path.relative(app, exe);                               // Contents/MacOS/Google Chrome for Testing
  const key = path.relative(path.join(os.homedir(), 'Library/Caches/ms-playwright'), app).split(path.sep)[0] || 'chromium';
  const dir = path.join(CACHE, key);
  const ready = path.join(dir, 'READY');
  const out = path.join(dir, path.basename(app));
  if (fs.existsSync(ready)) return path.join(out, rel);

  const tmp = `${dir}.${process.pid}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const copy = path.join(tmp, path.basename(app));
  execFileSync('/usr/bin/ditto', [app, copy]);
  // Only the main app can get a Dock icon (the helpers are background
  // processes already). Re-sign just that bundle, shallowly, so the framework
  // and helpers keep Google's signatures.
  const plist = path.join(copy, 'Contents/Info.plist');
  if (!plistHas(plist, 'LSBackgroundOnly')) plistSet(plist, 'LSBackgroundOnly');
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', copy], { stdio: 'ignore' });
  fs.writeFileSync(path.join(tmp, 'READY'), `${new Date().toISOString()} from ${app}\n`);
  try {
    fs.mkdirSync(CACHE, { recursive: true });
    fs.renameSync(tmp, dir);
  } catch {
    fs.rmSync(tmp, { recursive: true, force: true });                // another worker won
  }
  return fs.existsSync(ready) ? path.join(out, rel) : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const p = quietChrome();
  console.log(p ?? '(not macOS or no Playwright browser: use the default)');
}
