import { defineConfig } from '@playwright/test';

// Headless only, throwaway profiles only (see test/e2e/fixtures.ts). Never
// points at the owner's Helium profile.
export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});
