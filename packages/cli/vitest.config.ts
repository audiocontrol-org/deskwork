import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const coreSrc = fileURLToPath(new URL('../core/src', import.meta.url));

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // CLI integration tests spawn subprocesses; 5s default is tight on
    // slower CI runners (one full lifecycle test took 29s in release.yml).
    testTimeout: 60_000,
    alias: {
      // Phase 29 — resolve `@/` imports inside @deskwork/core source
      // (which the cli's vitest run pulls in directly when using the
      // Phase 29 doctor migrate gate).
      '@/': `${coreSrc}/`,
    },
  },
});
