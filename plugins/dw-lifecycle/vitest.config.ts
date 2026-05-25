import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    globals: false,
    // The default 5000ms per-test budget is too tight for clone-detector
    // tests that spawn jscpd subprocesses on slower CI runners (#298 CI
    // run #26414402092 hit 5000ms even locally-green). Bump globally to
    // 30s; in-process unit tests still complete in milliseconds.
    testTimeout: 30000,
    // Route clone-detector tests to a single-fork pool to eliminate
    // jscpd subprocess contention under parallel-load (#297). All other
    // tests continue to run in the default thread pool for speed.
    poolMatchGlobs: [['**/clone-detector.*.test.ts', 'forks']],
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
