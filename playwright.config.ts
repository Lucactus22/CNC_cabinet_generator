import { defineConfig, devices } from '@playwright/test';

/**
 * The end-to-end walks, against the production build.
 *
 * Deliberately not the dev server: docs/UX.md's numbers were taken against
 * `vite preview` on a real build, and a walk that asserts those counts has to
 * be driven through the same thing they were measured on. It is also the only
 * way the build itself — the worker bundle above all — is ever exercised by a
 * test.
 */
export default defineConfig({
  testDir: './apps/web/e2e',
  // The journeys assert interaction counts, and a retry that half-repeats a
  // walk would report a count nobody performed.
  retries: 0,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Not 'on-first-retry': these walks assert interaction counts, so retries
    // are off, and a trace keyed on one would never be written at all — the
    // report CI uploads on failure would be empty.
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // The viewport is restated after the device preset, not before it:
      // `devices['Desktop Chrome']` carries its own 1280 x 720, which
      // silently overrode the size every figure in docs/UX.md was measured
      // at. The share-of-window readings were the ones that noticed.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command:
      'npm run build -w @cabgen/web && npm run preview -w @cabgen/web -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
