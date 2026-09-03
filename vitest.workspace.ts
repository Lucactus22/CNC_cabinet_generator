import { defineWorkspace } from 'vitest/config';

/**
 * Two runs, because the app's own tests need two different environments.
 *
 * Everything in `packages/core`, and the app tests that only exercise plain
 * functions, run under Node: they are faster there and a DOM would prove
 * nothing about them. The component tests render React, so they need jsdom
 * and the shims in `apps/web/test/setup/dom.ts`.
 *
 * Both extend `vitest.config.ts`, so the `@cabgen/core` alias and `css: true`
 * — which `contrast.test.ts` depends on for anything to check at all — are
 * stated once.
 */
export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'logic',
      include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'components',
      include: ['apps/*/test/**/*.test.tsx'],
      environment: 'jsdom',
      setupFiles: ['./apps/web/test/setup/dom.ts'],
    },
  },
]);
