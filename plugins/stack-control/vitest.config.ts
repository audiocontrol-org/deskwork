import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    globals: false,
    // Front-door verb tests spawn the stackctl dispatcher as a child
    // process against tmp fixture trees; the default 5000ms per-test
    // budget is tight on slower runners. Mirror dw-lifecycle's 30s.
    testTimeout: 30000,
  },
});
