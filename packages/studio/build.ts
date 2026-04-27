#!/usr/bin/env tsx
/**
 * esbuild bundler for @deskwork/studio.
 *
 * Two output sets, both produced by `tsx build.ts`:
 *
 *   1. **Browser-target client modules.** Every TypeScript entry under
 *      `plugins/deskwork-studio/public/src/` becomes a matching
 *      `<name>.js` in `plugins/deskwork-studio/public/dist/`. ESM,
 *      sourcemap'd, served through the studio's `/static/*` mount.
 *      Pages pull in only what they need.
 *
 *   2. **Self-contained Node-target server bundle** at
 *      `plugins/deskwork-studio/bundle/server.mjs`. The plugin shell's
 *      bash wrapper runs this via plain `node` when no workspace-linked
 *      binary is available — both fresh `git clone` and Claude Code
 *      marketplace installs run this file. Inlines every workspace
 *      dependency (Hono, @hono/node-server, @deskwork/core); Node
 *      built-ins remain external.
 *
 * All build outputs land inside the plugin tree so the marketplace
 * install (which only ships `plugins/<name>/`) carries everything the
 * runtime needs — bundle, client modules, CSS, source `public/src/`.
 */

import { build, type BuildOptions, type BuildResult } from 'esbuild';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// Plugin tree houses all build outputs (and the public/ source assets,
// since git mv'd from packages/studio/public/ during the marketplace
// install fix). The plugin payload is the single distribution unit.
const PLUGIN_ROOT = resolve(HERE, '..', '..', 'plugins', 'deskwork-studio');
const SRC_DIR = resolve(PLUGIN_ROOT, 'public', 'src');
const OUT_DIR = resolve(PLUGIN_ROOT, 'public', 'dist');
const SERVER_ENTRY = resolve(HERE, 'src', 'server.ts');
// .mjs (ESM) rather than .cjs because the source uses top-level await
// for the symlinked-bin entrypoint detection. Node infers ESM/CJS from
// the extension; the wrapper invokes `node bundle/server.mjs` either way.
const SERVER_OUT = resolve(PLUGIN_ROOT, 'bundle', 'server.mjs');

interface BundleSummary {
  readonly entry: string;
  readonly outFile: string;
  readonly bytes: number;
}

async function findEntries(dir: string): Promise<readonly string[]> {
  const names = await readdir(dir);
  const entries: string[] = [];
  for (const name of names) {
    if (!name.endsWith('.ts')) continue;
    const full = join(dir, name);
    const info = await stat(full);
    if (info.isFile()) entries.push(full);
  }
  entries.sort();
  return entries;
}

async function bundleOne(entryPoint: string): Promise<BundleSummary> {
  const baseName = entryPoint
    .slice(SRC_DIR.length + 1)
    .replace(/\.ts$/, '.js');
  const outFile = join(OUT_DIR, baseName);
  const opts: BuildOptions = {
    entryPoints: [entryPoint],
    outfile: outFile,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: false,
    sourcemap: 'linked',
    logLevel: 'warning',
  };
  const result: BuildResult = await build(opts);
  if (result.errors.length > 0) {
    throw new Error(
      `esbuild reported ${result.errors.length} errors for ${entryPoint}`,
    );
  }
  const stats = await stat(outFile);
  return { entry: baseName.replace(/\.js$/, '.ts'), outFile, bytes: stats.size };
}

async function bundleServer(): Promise<BundleSummary> {
  await mkdir(dirname(SERVER_OUT), { recursive: true });
  const opts: BuildOptions = {
    entryPoints: [SERVER_ENTRY],
    outfile: SERVER_OUT,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    // Inline every workspace dep so the bundle runs with no
    // node_modules present on the operator's side. Node built-ins
    // remain external by virtue of platform=node.
    packages: 'bundle',
    minify: false,
    // No sourcemap. The bundle is committed to git (fresh clones can
    // run with no `npm install`); sourcemaps would double the noise.
    // Debug against source via the workspace tsx path.
    sourcemap: false,
    logLevel: 'warning',
    // ESM-output-with-CJS-deps shim. Some inlined dependencies (yaml,
    // unified) do `require('process')` and similar dynamic requires
    // that don't translate to native ESM. The createRequire banner
    // gives the bundle a working `require` so those calls succeed.
    // No shebang — wrapper invokes via `node bundle/server.mjs`.
    banner: {
      js: "import { createRequire as __cjsCreateRequire } from 'node:module';\nconst require = __cjsCreateRequire(import.meta.url);",
    },
  };
  const result: BuildResult = await build(opts);
  if (result.errors.length > 0) {
    throw new Error(
      `esbuild reported ${result.errors.length} errors for ${SERVER_ENTRY}`,
    );
  }
  const stats = await stat(SERVER_OUT);
  return { entry: 'server.ts', outFile: SERVER_OUT, bytes: stats.size };
}

async function main(): Promise<void> {
  const entries = await findEntries(SRC_DIR);
  if (entries.length === 0) {
    process.stderr.write(`no .ts entries found in ${SRC_DIR}\n`);
    process.exit(1);
  }
  const summaries: BundleSummary[] = [];
  for (const entry of entries) {
    const summary = await bundleOne(entry);
    summaries.push(summary);
  }
  let total = 0;
  for (const s of summaries) {
    total += s.bytes;
    const kb = (s.bytes / 1024).toFixed(1);
    process.stdout.write(`  ${s.entry.padEnd(40)} -> ${kb} KB\n`);
  }
  const totalKb = (total / 1024).toFixed(1);
  process.stdout.write(
    `bundled ${summaries.length} client entries (${totalKb} KB total) into ${OUT_DIR}\n`,
  );

  process.stdout.write('\n');
  const serverSummary = await bundleServer();
  const serverKb = (serverSummary.bytes / 1024).toFixed(1);
  process.stdout.write(
    `bundled server: server.ts -> ${serverKb} KB at ${SERVER_OUT}\n`,
  );
}

main().catch((err: unknown) => {
  const reason = err instanceof Error ? err.message : String(err);
  process.stderr.write(`build failed: ${reason}\n`);
  process.exit(1);
});
