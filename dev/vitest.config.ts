import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Match esbuild's `.css → text` loader for content scripts (widget styles):
  // rewrite `import x from './w.css'` to Vite's `?raw` text import.
  plugins: [
    {
      name: 'b2c-css-text',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (!source.endsWith('.css') || !importer || importer.endsWith('.css')) return null;
        const r = await this.resolve(source, importer, { skipSelf: true });
        return r ? `${r.id}?raw` : null;
      },
    },
  ],
  // css: true, or Vitest blanks every .css module (raw imports included).
  test: { include: ['test/unit/**/*.test.ts'], environment: 'happy-dom', css: true },
});
