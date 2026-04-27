import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // CLI integration tests spawn subprocesses; 5s default is tight on
    // slower CI runners (one full lifecycle test took 29s in release.yml).
    testTimeout: 60_000,
  },
});
