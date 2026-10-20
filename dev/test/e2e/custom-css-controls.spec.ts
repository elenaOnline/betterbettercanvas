import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, DIST } from './fixtures.ts';

// This mounts the lane-owned components in an isolated extension page. It
// verifies their browser behavior; options.tsx wiring remains a lead request.
// The harness is written into the extension folder under test (it must be an
// extension page). Always remove it: under ship, that folder is the release.
test.afterEach(() => {
  for (const f of ['look2-harness.html', 'look2-harness.js', 'look2-harness.css']) fs.rmSync(path.join(DIST, f), { force: true });
});
test('custom-css and look controls: font previews, native segments, and blur/Command-S editor behavior', async ({ context, sw }) => {
  const dev = path.resolve(import.meta.dirname, '../..');
  await build({ stdin: { contents: `import { render } from 'preact';
import { useState } from 'preact/hooks';
import { CustomCssEditor } from './src/features/custom-css/ui.tsx';
import { FontSettings } from './src/features/custom-font/ui.tsx';
import type { Font } from './src/features/type/index.ts';
import { PageWidth } from './src/features/full-width/ui.tsx';
import { CardHeight } from './src/features/condensed-cards/ui.tsx';
import { CardStyle } from './src/features/gradient-cards/ui.tsx';
import { CardOverlay } from './src/features/card-overlay/ui.tsx';
function Harness() {
  const [css, setCss] = useState('');
  const [commits, setCommits] = useState<string[]>([]);
  const [family, setFamily] = useState<Font>('Canvas default');
  const [local, setLocal] = useState('');
  const [width, setWidth] = useState<'standard' | 'wide' | 'full'>('standard');
  const [condensed, setCondensed] = useState(false);
  const [gradient, setGradient] = useState(false);
  const [overlay, setOverlay] = useState(true);
  return <main>
    <FontSettings family={family} localFamily={local} dyslexia onChange={(f, l) => { setFamily(f); setLocal(l); }} />
    <PageWidth value={width} onChange={setWidth} />
    <CardHeight value={condensed} onChange={setCondensed} />
    <CardStyle value={gradient} onChange={setGradient} />
    <CardOverlay value={overlay} onChange={setOverlay} />
    <CustomCssEditor value={css} onCommit={value => { setCss(value); setCommits([...commits, value]); }} />
    <button>After editor</button><output id="commits">{JSON.stringify(commits)}</output>
  </main>;
}
render(<Harness />, document.getElementById('app')!);
`, loader: 'tsx', resolveDir: dev }, outfile: path.join(DIST, 'look2-harness.js'), bundle: true, format: 'esm', jsx: 'automatic', jsxImportSource: 'preact', logLevel: 'silent' });
  fs.writeFileSync(path.join(DIST, 'look2-harness.html'), '<!doctype html><html><head><link rel="stylesheet" href="ui.css"></head><body><div id="app"></div><script type="module" src="look2-harness.js"></script></body></html>');
  const page = await context.newPage();
  await page.goto(await sw.evaluate(() => chrome.runtime.getURL('look2-harness.html')));
  const fonts = page.getByLabel('Font', { exact: true });
  await expect(fonts.locator('option')).toHaveCount(7);
  await expect(page.getByText('Canvas’s dyslexia font is active.', { exact: false })).toBeVisible();
  for (const family of ['Inter', 'Atkinson Hyperlegible', 'Source Serif 4', 'JetBrains Mono']) {
    await fonts.selectOption(family);
    const option = fonts.getByRole('option', { name: family, exact: true });
    await expect(option).toHaveCSS('font-family', new RegExp(family));
    expect(await page.evaluate(async face => (await document.fonts.load(`16px "${face}"`)).length, family)).toBeGreaterThan(0);
  }
  await fonts.selectOption('Installed');
  await expect(page.getByLabel('Installed font name')).toBeVisible();
  await page.getByLabel('Installed font name').fill('Courier New');
  const wide = page.getByRole('radio', { name: 'Wide', exact: true });
  await wide.check(); await wide.focus(); await wide.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Full', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Condensed', exact: true }).check();
  await page.getByRole('radio', { name: 'Gradient', exact: true }).check();
  const overlay = page.getByRole('switch', { name: 'Color overlay on images' });
  await expect(overlay).toBeChecked(); await overlay.uncheck(); await expect(overlay).not.toBeChecked();
  await page.getByText('Advanced', { exact: true }).click();
  const editor = page.getByLabel('Custom CSS', { exact: true });
  await expect(editor).toHaveAttribute('rows', '8');
  await expect(editor).toHaveCSS('font-family', /monospace/);
  await expect(editor).toHaveCSS('resize', 'vertical');
  await editor.fill('body { color: red }');
  await expect(page.locator('#commits')).toHaveText('[]');
  await editor.press('Meta+s');
  await expect(page.locator('#commits')).toHaveText('["body { color: red }"]');
  await editor.fill('body { color: blue }');
  await page.getByRole('button', { name: 'After editor' }).focus();
  await expect(page.locator('#commits')).toHaveText('["body { color: red }","body { color: blue }"]');
  await editor.fill('body {\ncolor red;\n}'); await editor.press('Meta+s');
  await expect(page.locator('#b2c-custom-css-error')).toContainText('Line 2:');
  await expect(editor).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#commits')).toHaveText('["body { color: red }","body { color: blue }"]');
});
