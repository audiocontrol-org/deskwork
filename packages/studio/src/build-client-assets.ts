/**
 * On-startup esbuild for studio client modules.
 *
 * Phase 23e — the studio's HTTP listener calls
 * `buildClientAssets({ pluginRoot })` once during boot, BEFORE accepting
 * requests. The result of the build lands in
 * `<pluginRoot>/.runtime-cache/dist/<name>.js`, mirroring what `build.ts`
 * used to commit into `<pluginRoot>/public/dist/`. The `/static/dist/*`
 * route serves from the runtime cache; URL surface is unchanged.
 *
 * Cache strategy: per-entry mtime check. For each `<name>.ts` under
 * `<pluginRoot>/public/src/`, compare the source's mtime (and every
 * file imported transitively, via esbuild's `metafile`) against the
 * cached `<name>.js`. If the cache is newer than every input, skip the
 * rebuild. Otherwise rebuild that single entry. Warm boots therefore
 * avoid esbuild work entirely once `.runtime-cache/dist/` is populated.
 *
 * Failures throw with descriptive messages (per project rules — no
 * silent fallbacks). The caller logs a status line.
 */

import { build, type BuildOptions, type BuildResult, type Metafile } from 'esbuild';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface BuildClientAssetsOptions {
  /** Absolute path to plugins/deskwork-studio/. */
  readonly pluginRoot: string;
}

export interface BuildSummary {
  /** Number of entries that were re-bundled this run. */
  readonly entriesBuilt: number;
  /** Number of entries served from the existing cache. */
  readonly entriesCached: number;
  /** Total bytes across all output files (built + cached). */
  readonly totalBytes: number;
  /** Absolute output directory (`<pluginRoot>/.runtime-cache/dist/`). */
  readonly outDir: string;
}

interface EntryDecision {
  readonly entryPath: string;
  readonly outFile: string;
  readonly baseName: string;
  readonly rebuild: boolean;
}

const CACHE_DIR_NAME = '.runtime-cache';
const CACHE_OUT_SUBDIR = 'dist';

export async function buildClientAssets(
  opts: BuildClientAssetsOptions,
): Promise<BuildSummary> {
  const srcDir = resolve(opts.pluginRoot, 'public', 'src');
  const outDir = resolve(opts.pluginRoot, CACHE_DIR_NAME, CACHE_OUT_SUBDIR);

  const entries = await findEntries(srcDir);
  if (entries.length === 0) {
    throw new Error(
      `deskwork-studio: no .ts entries found in ${srcDir}; cannot build client assets`,
    );
  }

  await mkdir(outDir, { recursive: true });

  let entriesBuilt = 0;
  let entriesCached = 0;
  let totalBytes = 0;

  for (const entryPath of entries) {
    const decision = await decideEntry(entryPath, srcDir, outDir);
    if (decision.rebuild) {
      const bytes = await rebuildEntry(decision);
      totalBytes += bytes;
      entriesBuilt += 1;
    } else {
      const cachedStat = await stat(decision.outFile);
      totalBytes += cachedStat.size;
      entriesCached += 1;
    }
  }

  return { entriesBuilt, entriesCached, totalBytes, outDir };
}

async function findEntries(dir: string): Promise<readonly string[]> {
  let names: readonly string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `deskwork-studio: cannot read client source dir ${dir}: ${reason}`,
    );
  }
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

async function decideEntry(
  entryPath: string,
  srcDir: string,
  outDir: string,
): Promise<EntryDecision> {
  const baseName = entryPath.slice(srcDir.length + 1).replace(/\.ts$/, '.js');
  const outFile = join(outDir, baseName);

  const cachedMtime = await safeMtime(outFile);
  if (cachedMtime === null) {
    return { entryPath, outFile, baseName, rebuild: true };
  }

  // First-pass cheap check: compare against just the entry's own mtime.
  // If the entry source itself is newer than the cache, rebuild without
  // bothering to walk imports. If not, fall through to the metafile-based
  // transitive check (also handles imported-file edits).
  const entryMtime = await safeMtime(entryPath);
  if (entryMtime === null) {
    throw new Error(
      `deskwork-studio: client entry vanished between readdir and stat: ${entryPath}`,
    );
  }
  if (entryMtime > cachedMtime) {
    return { entryPath, outFile, baseName, rebuild: true };
  }

  // Cache is at least as new as the entry. Check transitive imports via
  // a sidecar metafile written on the previous build.
  const metaPath = `${outFile}.meta.json`;
  const metaMtime = await safeMtime(metaPath);
  if (metaMtime === null) {
    // No metafile — built by an older code path. Rebuild to populate it.
    return { entryPath, outFile, baseName, rebuild: true };
  }

  const importPaths = await readMetafileInputs(metaPath, entryPath);
  for (const imp of importPaths) {
    const impMtime = await safeMtime(imp);
    if (impMtime === null) continue; // file removed; rebuild will fail loudly if relevant
    if (impMtime > cachedMtime) {
      return { entryPath, outFile, baseName, rebuild: true };
    }
  }

  return { entryPath, outFile, baseName, rebuild: false };
}

async function rebuildEntry(decision: EntryDecision): Promise<number> {
  const opts: BuildOptions = {
    entryPoints: [decision.entryPath],
    outfile: decision.outFile,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: false,
    sourcemap: 'linked',
    logLevel: 'warning',
    metafile: true,
  };
  const result: BuildResult = await build(opts);
  if (result.errors.length > 0) {
    throw new Error(
      `deskwork-studio: esbuild reported ${result.errors.length} errors building ${decision.entryPath}`,
    );
  }
  if (!result.metafile) {
    throw new Error(
      `deskwork-studio: esbuild did not return a metafile for ${decision.entryPath}; cache check would be unsound`,
    );
  }
  await writeMetafile(`${decision.outFile}.meta.json`, result.metafile);
  const stats = await stat(decision.outFile);
  return stats.size;
}

async function safeMtime(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.mtimeMs;
  } catch {
    return null;
  }
}

async function writeMetafile(path: string, meta: Metafile): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  const json = JSON.stringify({ inputs: Object.keys(meta.inputs) });
  await writeFile(path, json, 'utf8');
}

interface MetafileSidecar {
  readonly inputs: readonly string[];
}

async function readMetafileInputs(
  metaPath: string,
  entryPath: string,
): Promise<readonly string[]> {
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(metaPath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!isMetafileSidecar(parsed)) {
    throw new Error(
      `deskwork-studio: malformed metafile sidecar at ${metaPath}`,
    );
  }
  // esbuild metafile inputs are project-relative paths from cwd at build
  // time. Resolve them relative to the entry's directory so the mtime
  // checks work whether or not cwd has changed since the build.
  const entryDir = entryPath.slice(0, entryPath.lastIndexOf('/'));
  return parsed.inputs.map((rel) => resolve(entryDir, rel));
}

function isMetafileSidecar(value: unknown): value is MetafileSidecar {
  if (typeof value !== 'object' || value === null) return false;
  if (!('inputs' in value)) return false;
  const inputs: unknown = value.inputs;
  if (!Array.isArray(inputs)) return false;
  for (const item of inputs) {
    if (typeof item !== 'string') return false;
  }
  return true;
}
