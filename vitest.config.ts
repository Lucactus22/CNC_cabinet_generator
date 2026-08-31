import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // Same alias the web app's own build uses: point at core's source so a
      // test of the app does not need core built first.
      '@cabgen/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
    },
  },
});
