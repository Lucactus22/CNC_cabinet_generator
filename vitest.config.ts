import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Everything a browser gives `apps/web` that jsdom does not — chiefly a
    // `Worker` that runs the real pipeline in process. Inert under `node`,
    // which is what the core's own tests run in. See the file's own comment.
    setupFiles: ['./apps/web/test/setup/dom.ts'],
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
