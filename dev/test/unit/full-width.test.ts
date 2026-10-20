import { expect, it } from 'vitest';
import { h, render } from 'preact';
import feature, { widths } from '../../src/features/full-width/index.ts';
import { PageWidth } from '../../src/features/full-width/ui.tsx';
import { mirrorOf } from '../../src/core/feature.ts';
it('provides one page-width choice with all three specified measures', () => {
  expect(feature.settings.width.default).toBe('standard');
  for (const [width, measure] of Object.entries(widths)) {
    expect(mirrorOf(feature, { 'full-width.width': width })).toEqual({ attrs: { 'data-b2c-full-width': width }, vars: { '--b2c-page-max': measure } });
  }
});
it('renders an accessible native radio segment group', () => {
  const host = document.createElement('div');
  let chosen = '';
  render(h(PageWidth, { value: 'wide', onChange: value => { chosen = value; } }), host);
  expect(host.querySelector('legend')!.textContent).toBe('Page width');
  expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(3);
  expect(host.querySelector<HTMLInputElement>('input[value="wide"]')!.checked).toBe(true);
  host.querySelector<HTMLInputElement>('input[value="full"]')!.dispatchEvent(new Event('change', { bubbles: true }));
  expect(chosen).toBe('full');
  render(null, host);
});
