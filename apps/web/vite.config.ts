import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // Served from a project page on GitHub Pages, so assets need a relative base.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      // Point at core's source: one less build step, and edits hot-reload.
      '@cabgen/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
