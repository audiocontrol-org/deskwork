import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // src/__tests__ holds the front-door verb tests; tests/ holds the
    // spec-governance extension's Vitest suite (tasks.md paths). Both are
    // collected so every RED-first test actually runs (Constitution I).
    include: ['src/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: false,
    // Front-door verb tests spawn the stackctl dispatcher as a child
    // process against tmp fixture trees; the default 5000ms per-test
    // budget is tight on slower runners. Mirror dw-lifecycle's 30s.
    testTimeout: 30000,
  },
});
