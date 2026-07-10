import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The tested modules are pure (no DOM), so the fast node environment is enough.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
