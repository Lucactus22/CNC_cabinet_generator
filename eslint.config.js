import path from 'node:path';
import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.tsbuildinfo', '**/coverage/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  prettierConfig,

  {
    settings: {
      'import-x/resolver': {
        typescript: true,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // A constant or helper is often re-exported by the sibling module that
      // uses it most (e.g. geom/path.ts re-exports EPS from geom/types.ts, so
      // path.ts's own users do not need a second import), and a barrel then
      // `export *`s both. That is the same binding reaching the barrel twice,
      // not a real conflict, but this rule's static check cannot tell the
      // difference and flags it as an ambiguous duplicate anyway.
      'import-x/export': 'off',
    },
  },

  // packages/core has no runtime dependencies and no I/O: it must stay
  // reusable from a CLI or a different front end, and the pipeline has to
  // stay synchronous. An accidental import from apps/, or of an npm package
  // nobody declared, breaks that quietly — catch both at lint time.
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './packages/core/src',
              from: './apps',
              message:
                'packages/core must not depend on apps/ — it has to stay reusable on its own.',
            },
          ],
        },
      ],
      'import-x/no-extraneous-dependencies': [
        'error',
        { packageDir: [path.join(rootDir, 'packages/core'), rootDir] },
      ],
      'import-x/no-nodejs-modules': 'error',
    },
  },

  // The web app is the only place with side effects: browser globals and JSX.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
  },

  {
    files: ['**/*.test.ts', '**/vite.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    // typescript-eslint and eslint-plugin-import-x both recommend importing
    // their default export under a local name, which is exactly what trips
    // this rule pair when linting this file with their own recommended rules.
    files: ['eslint.config.js'],
    languageOptions: { globals: globals.node },
    rules: {
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
    },
  },
);
