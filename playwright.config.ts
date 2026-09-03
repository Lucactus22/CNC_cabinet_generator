import { defineConfig, devices } from '@playwright/test';

/**
 * The end-to-end half of R-24.
 *
 * Kept out of `npm test` on purpose. Vitest runs in nine seconds and is what
 * anyone editing the geometry runs on every save; this builds the app, serves
 * it and drives a browser, and is what stops the *interface* numbers rotting.
 * `npm run test:e2e` runs it; CI runs both.
 *
 * Against `vite preview` on the production build rather than the dev server,
 * because that is how every figure in docs/UX.md was measured and the journey
 * specs assert those figures. A dev build differs in the ways that matter to
 * them: no minification, an extra client script in the page, and different
 * timing on the worker the whole interface waits for.
 */
export default defineConfig({
  testDir: './apps/web/e2e',
  // The journeys count interactions and measure the window; two of them
  // running at once would fight over one preview server's `localStorage` only
  // if they shared a browser context, which they do not — but a viewport
  // measurement taken while another worker is building is noise nobody needs.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // After the device, not before it: `Desktop Chrome` carries its own
        // 1280 × 720 and would otherwise win, which costs the model four
        // points of the window and fails an assertion about the design.
        // 1440 × 900 is the size every figure in docs/UX.md was taken at.
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command:
      'npm run build -w @cabgen/web && npm run preview -w @cabgen/web -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    // Never reused, not even locally. A `vite preview` left running from an
    // earlier session serves the `dist` it was started with, so the suite
    // would pass against bytes that are no longer in the tree — which is the
    // silently-wrong-output failure this repo exists to avoid, in its own
    // test harness. Found by mutating a component, watching the walk stay
    // green, and discovering it had never seen the change. The rebuild costs
    // about six seconds.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
