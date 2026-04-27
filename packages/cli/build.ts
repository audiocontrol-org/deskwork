#!/usr/bin/env tsx
/**
 * esbuild bundler for @deskwork/cli — produces a self-contained ESM
 * bundle the plugin's bash wrapper can run via plain `node` without any
 * `npm install` step or workspace symlink chain.
 *
 * Output is written into the plugin tree (`plugins/deskwork/bundle/cli.mjs`)
 * rather than alongside the source package, so the marketplace install
 * payload — which only ships `plugins/<name>/` — contains the runnable
 * bundle. A fresh `git clone` and a marketplace install run the same file.
 *
 * Usage:  npm run build  (or `tsx build.ts` directly)
 */

import { build, type BuildOptions, type BuildResult } from 'esbuild';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(HERE, 'src', 'cli.ts');
// Bundle lives inside the plugin payload so the marketplace install
// (which copies plugins/<name>/ only) finds it next to bin/deskwork.
const PLUGIN_ROOT = resolve(HERE, '..', '..', 'plugins', 'deskwork');
const OUT = resolve(PLUGIN_ROOT, 'bundle', 'cli.mjs');

async function main(): Promise<void> {
  await mkdir(dirname(OUT), { recursive: true });
  const opts: BuildOptions = {
    entryPoints: [ENTRY],
    outfile: OUT,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    // Inline EVERY workspace dependency. Nothing left external — the
    // bundle must run with no node_modules at all on the operator's
    // side. Node built-ins remain external by virtue of platform=node.
    packages: 'bundle',
    minify: false,
    // No sourcemap. The bundle is committed to git (so fresh clones can
    // run with no `npm install`). Sourcemaps would double the diff
    // surface for noise — debugging happens against source via the
    // workspace tsx path, not the bundle.
    sourcemap: false,
    logLevel: 'warning',
    // Re-run dynamic-import paths through the bundle. Not strictly
    // needed for the CLI today but cheap to keep on.
    splitting: false,
    // ESM-output-with-CJS-deps shim. Some inlined dependencies (yaml,
    // unified) do `require('process')` and similar dynamic requires
    // that don't translate to native ESM. The createRequire banner
    // gives the bundle a working `require` so those calls succeed.
    // No shebang — wrapper invokes via `node bundle/cli.mjs`.
    banner: {
      js: "import { createRequire as __cjsCreateRequire } from 'node:module';\nconst require = __cjsCreateRequire(import.meta.url);",
    },
  };
  const result: BuildResult = await build(opts);
  if (result.errors.length > 0) {
    throw new Error(
      `esbuild reported ${result.errors.length} errors for ${ENTRY}`,
    );
  }
  const info = await stat(OUT);
  const kb = (info.size / 1024).toFixed(1);
  process.stdout.write(`  cli.ts -> ${kb} KB at ${OUT}\n`);
}

await main();
