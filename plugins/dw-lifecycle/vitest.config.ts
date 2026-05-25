import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    globals: false,
    // Route clone-detector tests to a single-fork pool to eliminate
    // jscpd subprocess contention under parallel-load (#297). All other
    // tests continue to run in the default thread pool for speed.
    poolMatchGlobs: [['**/clone-detector.*.test.ts', 'forks']],
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
