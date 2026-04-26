#!/usr/bin/env tsx
/**
 * esbuild bundler for @deskwork/studio browser-target client modules.
 *
 * Bundles every TypeScript entry under `public/src/` into a matching
 * `<name>.js` file in `public/dist/`. Each entry gets its own bundle so
 * page templates can pull in only what they need.
 *
 * Usage:  tsx build.ts
 */

import { build, type BuildOptions, type BuildResult } from 'esbuild';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(HERE, 'public', 'src');
const OUT_DIR = resolve(HERE, 'public', 'dist');

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

/**
 * Module specifiers we deliberately leave unresolved at bundle time.
 *
 * The upstream client code dynamically imports a markdown render helper
 * via a relative path (`../../scripts/lib/editorial-review/render.js`)
 * that doesn't exist in this monorepo yet — the page-wiring phase will
 * either port that module or substitute a fetch-based equivalent. Until
 * then we treat the path as external so the bundle still emits.
 */
const EXTERNAL_PATHS: readonly string[] = [
  '../../scripts/lib/editorial-review/render.js',
];

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
    external: [...EXTERNAL_PATHS],
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
    `bundled ${summaries.length} entries (${totalKb} KB total) into ${OUT_DIR}\n`,
  );
}

main().catch((err: unknown) => {
  const reason = err instanceof Error ? err.message : String(err);
  process.stderr.write(`build failed: ${reason}\n`);
  process.exit(1);
});
