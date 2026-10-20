// Test-only feature (built in only with B2C_TEST_FEATURES=1). Counts live
// instances on <html> and starts slowly, to expose core lifecycle races.
import { defineFeature } from '../../../src/core/feature.ts';
import { bool, int } from '../../../src/core/settings/schema.ts';

const root = () => document.documentElement;
const bump = (attr: string, d: number) => root().setAttribute(attr, String(Number(root().getAttribute(attr) ?? 0) + d));

export default defineFeature({
  id: 'test-probe',
  settings: { enabled: bool(false), n: int(0), big: { kind: 'str', default: '', area: 'local' } },
  pages: 'all',
  async start() {
    await new Promise(r => setTimeout(r, 80));
    bump('data-test-starts', 1);
    bump('data-test-live', 1);
    return { update() {}, stop: () => bump('data-test-live', -1) };
  },
});
