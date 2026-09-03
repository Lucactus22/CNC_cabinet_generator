import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * What both runs share. Which files run where, and in what environment, is in
 * `vitest.workspace.ts` — the component tests need a DOM and these do not.
 */
export default defineConfig({
  test: {
    // Off by default, which replaces every CSS import with an empty string.
    // `apps/web/test/contrast.test.ts` checks both palettes by reading the
    // real stylesheet (`?raw`), and an empty string would pass every
    // assertion in it by having nothing to check.
    css: true,
  },
  resolve: {
    alias: {
      // Same alias the web app's own build uses: point at core's source so a
      // test of the app does not need core built first.
      '@cabgen/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
    },
  },
});
