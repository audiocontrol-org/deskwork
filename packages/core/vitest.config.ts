import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const srcRoot = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    alias: {
      '@/': `${srcRoot}/`,
    },
  },
});
