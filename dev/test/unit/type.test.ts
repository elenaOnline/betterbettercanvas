import { describe, expect, it } from 'vitest';
import { h, render } from 'preact';
import feature, { fontFamily, fontStack, fonts, selectedStack, bundledFontCss, typeMirror } from '../../src/features/type/index.ts';
import { migrateType } from '../../src/features/type/migrate.ts';
import { mirrorOf } from '../../src/core/feature.ts';
import { MIGRATIONS } from '../../src/core/settings/migrations.ts';
// The old paths still work (re-export shims).
import { FontSettings } from '../../src/features/custom-font/ui.tsx';
import { fonts as shimFonts } from '../../src/features/custom-font/fonts.ts';

const base = { 'type.family': 'Canvas default', 'type.localFamily': '', 'type.scale': 1, 'type.density': 'comfortable' };

describe('type: family, size, density', () => {
  it('normalizes installed names and quotes CSS metacharacters', () => {
    expect(fontFamily('  Noto   Sans 日本語\n')).toBe('Noto Sans 日本語');
    expect(fontStack('A"; color: red; "B')).toContain('"A\\"; color: red; \\"B"');
    expect(fontStack('')).toMatch(/^system-ui,/);
  });
  it('offers only bundled, system, Canvas or explicitly installed families', () => {
    expect(feature.id).toBe('type');
    expect(feature.settings.family.kind).toBe('enum');
    expect(feature.settings.family.default).toBe('Canvas default');
    expect(fonts).toEqual(['Canvas default', 'System', 'Inter', 'Atkinson Hyperlegible', 'Source Serif 4', 'JetBrains Mono', 'Installed']);
    expect(shimFonts).toBe(fonts);
    expect(selectedStack('Canvas default')).toBe('var(--b2c-font-canvas)');
    expect(selectedStack('Installed', 'My Font')).toContain('"My Font"');
  });
  it('Canvas default is the identity: nothing pre-paint, and no network code ever', () => {
    expect(mirrorOf(feature, base)).toEqual({ attrs: {}, vars: {} });
    expect(mirrorOf(feature, { ...base, 'type.family': 'Inter' })).toMatchObject({ attrs: { 'data-b2c-font': '' } });
    expect(mirrorOf(feature, { ...base, 'type.family': 'Inter' }).vars?.['--b2c-font']).toContain('"b2c Inter"');
    expect(bundledFontCss(p => `chrome-extension://dynamic/${p}`)).not.toMatch(/https?:/);
  });
  it('scale and density are tokens', () => {
    expect(typeMirror({ family: 'Canvas default', localFamily: '', scale: 1.1, density: 'compact' })).toEqual({
      attrs: { 'data-b2c-type-scale': '', 'data-b2c-density': 'compact' },
      vars: { '--b2c-type-scale': '1.1', '--b2c-density': '0.5' },
    });
    expect(feature.settings.scale).toMatchObject({ min: 0.9, max: 1.15 });
  });
  it('renders face previews, installed choice, and accessibility precedence status (old import path)', () => {
    const host = document.createElement('div');
    render(h(FontSettings, { family: 'Inter', localFamily: '', dyslexia: true, onChange() {} }), host);
    expect(host.querySelectorAll('option')).toHaveLength(7);
    expect(host.querySelector('[role="status"]')!.textContent).toContain('dyslexia font is active');
    render(null, host);
  });
});

describe('migration 2026-10-20-type', () => {
  it('is registered after the palette migration', () => {
    const ids = MIGRATIONS.map(m => m.id);
    expect(ids.indexOf('2026-10-20-type')).toBeGreaterThan(ids.indexOf('2026-10-20-palette'));
  });
  it('a v1 install with a chosen font, an installed name and compact density', () => {
    const m = migrateType({ 'custom-font.enabled': true, 'custom-font.family': 'Installed', 'custom-font.localFamily': 'Helvetica Neue', 'shape.density': 'compact', 'shape.corner': 4 });
    expect(m.set).toEqual({ 'type.family': 'Installed', 'type.localFamily': 'Helvetica Neue', 'type.density': 'compact' });
    expect(m.remove.sort()).toEqual(['custom-font.enabled', 'custom-font.family', 'custom-font.localFamily', 'shape.density']);
  });
  it('v1 off (switch off, a family still remembered) → Canvas default', () => {
    expect(migrateType({ 'custom-font.enabled': false, 'custom-font.family': 'Inter' }).set).toEqual({ 'type.family': 'Canvas default' });
    expect(migrateType({ 'custom-font.family': 'Inter' }).set).toEqual({ 'type.family': 'Canvas default' });
  });
  it('nothing to do on a fresh v2 install', () => {
    expect(migrateType({ 'type.family': 'Inter', 'shape.corner': 2 })).toEqual({ set: {}, remove: [] });
  });
});
