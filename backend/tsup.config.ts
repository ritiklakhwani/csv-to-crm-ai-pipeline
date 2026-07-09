import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // `@groweasy/shared` is a source-only workspace package with no build step, so it must be
  // bundled rather than left as a bare import that Node could not resolve at runtime.
  noExternal: ['@groweasy/shared'],
});
