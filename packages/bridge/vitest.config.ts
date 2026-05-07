import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': join(__dirname, 'src'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    // Sidecar boot tests spawn child processes; allow generous timeout.
    testTimeout: 60_000,
  },
});
