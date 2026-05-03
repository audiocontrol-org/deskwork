import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal Vite config for the studio's client-side TS modules.
// In dev: serves modules from public/src/ via Vite middleware mounted in
// Hono (see src/server.ts where DESKWORK_DEV=1 branches to Vite).
// In prod: this config is unused — the in-process esbuild step in
// build-client-assets.ts handles bundling.

export default defineConfig({
  root: resolve(__dirname, 'public/src'),
  publicDir: false,
  appType: 'custom',
  build: {
    outDir: resolve(__dirname, '.runtime-cache/dist-vite'),
    emptyOutDir: true,
  },
});
