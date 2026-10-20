// Pure font helpers for custom-font (no side effects, so both the definition
// in main.js and the lazy runtime chunk can import it).

export const fonts = ['Canvas default', 'System', 'Inter', 'Atkinson Hyperlegible', 'Source Serif 4', 'JetBrains Mono', 'Installed'] as const;
export type Font = typeof fonts[number];
export const fontFamily = (value: string) => value.trim().replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').slice(0, 100);
export function fontStack(value: string): string {
  const family = fontFamily(value);
  const fallback = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  return family ? `${JSON.stringify(family)}, ${fallback}` : fallback;
}
export function selectedStack(family: Font, localFamily = ''): string {
  if (family === 'Canvas default') return 'var(--b2c-font-canvas)';
  if (family === 'System') return fontStack('');
  return fontStack(family === 'Installed' ? localFamily : `b2c ${family}`);
}
export const bundledFaces = [
  ['Inter', 'inter', [400, 600, 700]],
  ['Atkinson Hyperlegible', 'atkinson-hyperlegible', [400, 700]],
  ['Source Serif 4', 'source-serif-4', [400, 600, 700]],
  ['JetBrains Mono', 'jetbrains-mono', [400, 600, 700]],
] as const;
export function bundledFontCss(url: (path: string) => string): string {
  return bundledFaces.flatMap(([family, file, weights]) => [
    ...weights.map(weight => [weight, 'normal'] as const), [400, 'italic'] as const,
  ].map(([weight, style]) => `@font-face {font-family: "b2c ${family}";font-style:${style};font-weight:${weight};font-display:swap;src:url("${url(`fonts/${file}-latin-${weight}-${style}.woff2`)}") format("woff2");}`)).join('\n');
}
/** The @font-face sheet for the bundled families (URLs resolve per session). */
export function fontSheet(): HTMLStyleElement {
  const style = document.createElement('style');
  style.dataset.b2cBundledFonts = '';
  style.textContent = bundledFontCss(path => chrome.runtime.getURL(path));
  return style;
}
