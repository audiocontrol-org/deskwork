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
    // Default environment is node. Tests that need jsdom set it per-file
    // via the `@vitest-environment jsdom` comment (see e.g. glossary-tooltip-client.test.ts).
  },
});
