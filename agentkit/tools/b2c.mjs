#!/usr/bin/env node
// b2c: tools for agents writing b²c themes. See agentkit/bin/README.md.
//   b2c check <file>...            format, size, css, contrast; exit 1 on any error
//   b2c render <file> [options]    PNGs of the theme on the mock Canvas + one contact sheet
const [cmd, ...args] = process.argv.slice(2);
const USAGE = `usage:
  b2c check <file.b2c-theme.json|.b2c-rice.json>... [--json]
  b2c render <file> [--pages dashboard,course,modules,assignments,assignment,grades,calendar]
                    [--scheme light|dark|both] [--out DIR] [--ext DIR] [--perf]
see agentkit/bin/README.md`;

if (cmd === 'check') {
  const { checkFile, formatCheck } = await import('./check.mjs');
  const files = args.filter(a => !a.startsWith('--'));
  if (!files.length) { console.error(USAGE); process.exit(2); }
  let bad = 0;
  const all = [];
  for (const f of files) {
    const r = await checkFile(f);
    bad += !r.ok;
    if (args.includes('--json')) all.push({ file: r.file, ok: r.ok, engine: r.engine.kind, findings: r.findings, notes: r.notes ?? [] });
    else console.log(formatCheck(r, { color: process.stdout.isTTY }) + (files.length > 1 ? '\n' : ''));
  }
  if (args.includes('--json')) console.log(JSON.stringify(files.length === 1 ? all[0] : all, null, 2));
  process.exit(bad ? 1 : 0);
} else if (cmd === 'render') {
  const { render } = await import('./render.mjs');
  try { process.exit(await render(args)); } catch (e) { console.error(`b2c render: ${e.message}`); process.exit(1); }
} else {
  console.log(USAGE);
  process.exit(cmd && cmd !== 'help' && cmd !== '--help' && cmd !== '-h' ? 2 : 0);
}
