// Square styling (the owner, 2026-10-20): one dial, `--b2c-corner`. No component
// may hard-code a radius, use 50% / 999px, or draw a circle. Design's sheets
// are checked too (they're shipped as-is).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DEV = path.resolve(import.meta.dirname, '../..');
const ROOTS = [path.join(DEV, 'src'), path.join(DEV, '../design/spec/surfaces')];
const files = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]))
    : [];

// A radius must be 0 or come from a token (var(--b2c-radius-*), var(--b2c-corner…)).
const RADIUS = /border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*([^;}"'`]+)/g;
// Token-led values may nest further tokens and literal *fallbacks*
// (var(--b2c-card-radius-set, var(--b2c-card-radius, 2px))).
const okRadius = (v: string) => {
  const t = v.trim().replace(/\s*!important$/, '');
  if (/^(0(px)?|inherit)$/.test(t)) return true;
  return t.split(/\s+(?=var\()/).every(part => /^var\(--b2c-(radius|corner|card-radius)[\w-]*\b/.test(part));
};

// The one exception (todo-views.md): the progress ring, round by default by
// the owner's decision (2026-10-20); a theme can square it with --b2c-ring-corner.
// Only these files may draw arcs/circles; everything else stays square.
const ROUND_OK = [
  /src\/features\/better-todo\/views\/ring\.(ts|tsx|css)$/,
  // The switcher's Ring glyph: icon depicts its data (Design 2026-10-20).
  /src\/features\/better-todo\/views\/ring-icon\.tsx$/,
  // The Studio's ring stand-in and its view thumbnail (same decision).
  /src\/ui\/studio\/ring\.ts$/,
];

describe('square styling', () => {
  const sources = ROOTS.flatMap(files).filter(f => /\.(css|ts|tsx)$/.test(f) && !f.endsWith('.gen.css') && !f.endsWith('.d.ts') && !ROUND_OK.some(re => re.test(f)));
  it('every radius is 0 or a corner token; no 50% / 999px; no circles', () => {
    const bad: string[] = [];
    for (const f of sources) {
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(RADIUS)) if (!okRadius(m[1]!)) bad.push(`${path.relative(DEV, f)}: border-radius: ${m[1]!.trim()}`);
      if (/<circle\b/.test(text)) bad.push(`${path.relative(DEV, f)}: <circle>`);
      if (/\.arc\(/.test(text)) bad.push(`${path.relative(DEV, f)}: canvas arc()`);
    }
    expect(bad).toEqual([]);
  });
});
