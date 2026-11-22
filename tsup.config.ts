import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'es2020',
  platform: 'browser',
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'particle-flux'],
});
