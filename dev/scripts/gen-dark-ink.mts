// Pre-paint ink rules for authored colours in user content (the RCE's default
// text colours and common HTML colours), computed with palette/color.ts inkFor:
// saturated → same hue at OKLCH L 0.72, in gamut (dark schemes only); greys →
// text-secondary; near-black → text. The runtime pass (run.ts) handles every
// other colour. Writes the block between the markers in palette/style.css.
//   node scripts/gen-dark-ink.mts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inkFor, parseColor } from '../src/features/palette/color.ts';

const COLS = '#bfedd2 #fbeeb8 #f8cac6 #eccafa #c2e0f4 #2dc26b #f1c40f #e03e2d #b96ad9 #3598db #169179 #e67e23 #ba372a #843fa1 #236fa1 #ecf0f1 #ced4d9 #95a5a6 #7e8c8d #34495e #ff0000 #0000ff #008000 #800080 #800000 #000080 #008080 #ff6600 #993300 #333399 #003366 #808080 #666666 #999999'.split(' ');
export const BEGIN = '/* BEGIN gen-dark-ink (scripts/gen-dark-ink.mts; do not edit by hand) */';
export const END = '/* END gen-dark-ink */';

export function inkBlock(): string {
  const byValue = new Map<string, { lift: boolean; sels: string[] }>();
  for (const c of COLS) {
    const rgb = parseColor(c)!;
    const ink = inkFor(rgb);
    if (ink.kind === 'keep') continue;
    const val = ink.kind === 'text' ? 'var(--b2c-dm-text)' : ink.kind === 'muted' ? 'var(--b2c-dm-text-secondary)' : ink.css;
    const sels = [`color: ${c}`, `color:${c}`, `color: rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`].map(f => `[style*="${f}" i]`);
    const e = byValue.get(val) ?? { lift: ink.kind === 'lift', sels: [] };
    e.sels.push(...sels);
    byValue.set(val, e);
  }
  // Authored text on an authored background keeps its pair.
  const NOT = ':not([style*="background" i], [style*="background" i] *, [bgcolor] *)';
  const rules = (lift: boolean) =>
    [...byValue].filter(([, e]) => e.lift === lift).map(([val, e]) => `  & :is(${e.sels.join(',')})${NOT} { color: ${val} !important; }`).join('\n');
  return [
    BEGIN,
    'html[data-b2c-theme="on"] :is(.user_content, .show-content) {',
    rules(false),
    '}',
    'html[data-b2c-theme="on"][data-b2c-scheme="dark"] :is(.user_content, .show-content) {',
    rules(true),
    '}',
    END,
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/features/palette/style.css');
  const css = fs.readFileSync(file, 'utf8');
  const a = css.indexOf(BEGIN), b = css.indexOf(END);
  const next = a >= 0 && b > a ? css.slice(0, a) + inkBlock() + css.slice(b + END.length) : css.trimEnd() + '\n\n' + inkBlock() + '\n';
  fs.writeFileSync(file, next);
  console.error(`ink block: ${Buffer.byteLength(inkBlock())} B → ${path.relative(process.cwd(), file)}`);
}
