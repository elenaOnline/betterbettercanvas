import { expect, it } from 'vitest';
import { h, render } from 'preact';
import { CardHeight } from '../../src/features/condensed-cards/ui.tsx';
import { CardStyle } from '../../src/features/gradient-cards/ui.tsx';
import { CardOverlay } from '../../src/features/card-overlay/ui.tsx';
import overlay from '../../src/features/card-overlay/index.ts';
import { mirrorOf } from '../../src/core/feature.ts';

it.each([[CardHeight, 'Card height', 'Condensed'], [CardStyle, 'Card style', 'Gradient']] as const)('renders the specified native segments for %s', (Component, label, alternative) => {
  const host = document.createElement('div'); let chosen = false;
  render(h(Component, { value: true, onChange: value => { chosen = value; } }), host);
  expect(host.querySelector('legend')!.textContent).toBe(label);
  expect(host.textContent).toContain('Standard'); expect(host.textContent).toContain(alternative);
  const radios = host.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  expect(radios).toHaveLength(2); expect(radios[1]!.checked).toBe(true);
  radios[1]!.dispatchEvent(new Event('change', { bubbles: true })); expect(chosen).toBe(true);
  render(null, host);
});
it('uses positive overlay semantics, default on, independent of Canvas preference', () => {
  expect(overlay.settings.overlay.default).toBe(true);
  expect(mirrorOf(overlay, { 'card-overlay.overlay': false }).attrs).toEqual({ 'data-b2c-card-overlay': 'off' });
  expect(mirrorOf(overlay, { 'card-overlay.overlay': true }).attrs).toEqual({ 'data-b2c-card-overlay': 'on' });
  const host = document.createElement('div');
  render(h(CardOverlay, { value: true, onChange() {} }), host);
  expect(host.textContent).toContain('Color overlay on images');
  expect(host.querySelector<HTMLInputElement>('[role="switch"]')!.checked).toBe(true);
  render(null, host);
});
