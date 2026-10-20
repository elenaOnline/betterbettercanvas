// Watches for test browsers that show up in the macOS Dock (house rule 2:
// nothing visible in front of the owner). Samples `lsappinfo list` and records any
// app whose name matches and whose type is "Foreground" (= has a Dock icon).
// Agent apps (LSUIElement) report "UIElement" and background-only apps
// "BackgroundOnly"; both are fine. No-op off macOS.
//
//   const w = dockWatch(); …run tests… ; const hits = w.stop();  // [] when clean
//   node scripts/dock-watch.mjs -- <command…>   runs a command under the watch, exits 1 on a hit
import { execFile, spawn } from 'node:child_process';

const NAME = process.env.DOCK_WATCH_NAME ? new RegExp(process.env.DOCK_WATCH_NAME) : /Chrome for Testing|Chromium|chrome-headless-shell/i; // never her own Helium

function sample() {
  return new Promise(resolve => {
    execFile('/usr/bin/lsappinfo', ['list'], { maxBuffer: 16 << 20 }, (err, out) => {
      if (err) return resolve([]);
      const hits = [];
      // Each app starts with a line like: 12) "Google Chrome for Testing" ASN:0x0-0x…:
      for (const block of out.split(/\n(?=\s*\d+\) ")/)) {
        const name = block.match(/^\s*\d+\) "([^"]+)"/)?.[1];
        const type = block.match(/type="([^"]+)"/)?.[1];
        const pid = block.match(/pid = (\d+)/)?.[1];
        if (name && NAME.test(name) && type === 'Foreground') hits.push({ name, pid, at: new Date().toISOString() });
      }
      resolve(hits);
    });
  });
}

/** Start sampling every `ms`. `ignorePids` excludes apps the user runs themself (e.g. her own browser). */
export function dockWatch({ ms = 100, ignorePids = [] } = {}) {
  if (process.platform !== 'darwin') return { stop: () => [], samples: () => 0 };
  const hits = [];
  let n = 0, live = true;
  const ignore = new Set(ignorePids.map(String));
  (async function loop() {
    while (live) {
      for (const h of await sample()) if (!ignore.has(h.pid)) hits.push(h);
      n++;
      await new Promise(r => setTimeout(r, ms));
    }
  })();
  return { stop: () => ((live = false), hits), samples: () => n };
}

/** PIDs of matching Dock apps already running before the watch starts (the user's own). */
export async function foregroundNow() {
  return (await sample()).map(h => h.pid);
}

if (process.argv.includes('--')) {
  const cmd = process.argv.slice(process.argv.indexOf('--') + 1);
  const w = dockWatch({ ignorePids: await foregroundNow() });
  const child = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit' });
  child.on('exit', code => {
    const hits = w.stop();
    console.log(`dock-watch: ${w.samples()} samples, ${hits.length} Dock appearances${hits.length ? ': ' + JSON.stringify(hits.slice(0, 5)) : ''}`);
    process.exit(hits.length ? 1 : code ?? 1);
  });
}

// Recorder for callers that block their event loop (ship.mjs uses execFileSync):
//   node scripts/dock-watch.mjs --record <file>   samples until SIGTERM, appends hits as JSON lines
if (process.argv.includes('--record')) {
  const fs = await import('node:fs');
  const file = process.argv[process.argv.indexOf('--record') + 1];
  fs.writeFileSync(file, '');
  const w = dockWatch({ ignorePids: await foregroundNow() });
  const done = () => {
    const hits = w.stop();
    for (const h of hits) fs.appendFileSync(file, JSON.stringify(h) + '\n');
    fs.appendFileSync(file, JSON.stringify({ samples: w.samples() }) + '\n');
    process.exit(0);
  };
  process.on('SIGTERM', done);
  process.on('SIGINT', done);
}
