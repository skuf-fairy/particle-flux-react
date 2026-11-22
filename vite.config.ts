import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  base: './',
  // Linked packages are skipped by default, but this local dependency is CommonJS.
  optimizeDeps: { include: ['particle-flux'] },
  build: { outDir: '../demo-dist', emptyOutDir: true },
});
