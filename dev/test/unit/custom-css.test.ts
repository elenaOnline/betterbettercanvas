import { expect, it } from 'vitest';
import feature from '../../src/features/custom-css/index.ts';
import { start } from '../../src/features/custom-css/run.ts';
import { createDom } from '../../src/core/dom.ts';
import type { Ctx } from '../../src/core/ctx.ts';

it('keeps arbitrary CSS as text, updates in place and tears down', async () => {
  expect(feature.settings.css.area).toBe('local');
  expect(feature.settings.css.multiline).toBe(true);
  const dom = createDom();
  const original = document.createElement('style');
  original.textContent = 'body { color: black }';
  document.head.append(original);
  const instance = start({ dom } as Ctx, { enabled: true, css: 'body { color: red }' });
  const style = document.querySelector('[data-b2c-custom-css]')!;
  expect(document.head.lastElementChild).toBe(style);
  instance.update!({ enabled: true, css: '/* </style><script> */\nbody { color: blue }' });
  expect(style.textContent).toContain('color: blue');
  expect(document.querySelector('script')).toBeNull();
  expect(document.querySelectorAll('[data-b2c-custom-css]')).toHaveLength(1);
  instance.stop();
  expect(style.isConnected).toBe(false);
  expect(original.isConnected).toBe(true);
  dom.stopAll();
  original.remove();
});

import { cssError, scopedCss, scopedSelector } from '../../src/features/custom-css/model.ts';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { CustomCssEditor } from '../../src/features/custom-css/ui.tsx';

it('gates selectors without changing :root/html selector meaning', () => {
  expect(scopedCss(':root { --x: red } body { color: var(--x) }')).toContain(':scope { --x: red; ');
  expect(scopedSelector('html body, :root.dark, .html, [data-x="html :root"]')).toBe(':scope body, :scope.dark, .html, [data-x="html :root"]');
});
it('finds CSSOM rule errors and structural line numbers', () => {
  expect(cssError('body { color: red }\n@media (min-width: 1px) { body { color: blue } }')).toBeNull();
  expect(cssError('/* } */ body { content: "}" }')).toBeNull();
  expect(cssError('@font-face { font-family: Local; src: url(local.woff2); }')).toBeNull();
  expect(cssError('body {}\n}')).toMatchObject({ line: 2 });
  expect(cssError('body {}\nspan {')).toMatchObject({ line: 2 });
  expect(cssError('not a rule')).toMatchObject({ line: 1 });
  expect(cssError('body {\n  color red;\n}')).toMatchObject({ line: 2 });
  expect(cssError('@media (min-width: 1px) {\nbody { color red; }\n}')).toMatchObject({ line: 2 });
});
it('edits without saving each keystroke, commits on blur and Command-S, and keeps invalid drafts local', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const commits: string[] = [];
  await act(() => render(h(CustomCssEditor, { value: '', onCommit: css => commits.push(css) }), host));
  const field = host.querySelector('textarea')!;
  expect(field.getAttribute('rows')).toBe('8');
  expect(host.textContent).toContain('Advanced. Applies to every Canvas page.');
  await act(() => { field.value = 'body { color: red }'; field.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(commits).toEqual([]);
  await act(() => { field.dispatchEvent(new FocusEvent('blur', { bubbles: true })); });
  expect(commits).toEqual(['body { color: red }']);
  await act(() => { field.value = 'body { color: blue }'; field.dispatchEvent(new Event('input', { bubbles: true })); });
  const save = new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true });
  await act(() => { field.dispatchEvent(save); });
  expect(save.defaultPrevented).toBe(true);
  expect(commits.at(-1)).toBe('body { color: blue }');
  await act(() => { field.value = '\nbody {'; field.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(() => { field.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true })); });
  expect(commits).toHaveLength(2);
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(host.querySelector('[role="status"]')!.textContent).toContain('Line 2:');
  render(null, host); host.remove();
});
