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
 * Concurrency safety (Issue #77):
 *   1. Per-entry directory lock (`<outFile>.lock/`) serializes
 *      concurrent rebuilds across processes. mkdir is atomic on POSIX;
 *      the loser polls until the holder finishes (or the lock is
 *      deemed stale) and then re-checks the cache so it can skip the
 *      rebuild entirely if the holder produced a valid output.
 *   2. Atomic writes: esbuild writes to `<outFile>.tmp.<pid>.<rand>`
 *      and we `rename()` to `<outFile>` once the build succeeds. The
 *      sidecar metafile follows the same `tmp + rename` pattern. A
 *      kill mid-build leaves either the prior valid output OR no
 *      output — never a half-written file.
 *   3. Self-healing metafile reads: a missing/malformed sidecar is
 *      treated the same as "no metafile" — rebuild the entry. This
 *      prevents a corrupt sidecar from wedging boot.
 *
 * Failures throw with descriptive messages (per project rules — no
 * silent fallbacks). The caller logs a status line.
 */

import { build, type BuildOptions, type BuildResult, type Metafile } from 'esbuild';
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
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

const LOCK_WAIT_MS = 30_000;
const LOCK_POLL_INITIAL_MS = 50;
const LOCK_POLL_MAX_MS = 500;
const LOCK_STALE_MS = 60_000;

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
      const result = await rebuildEntryWithLock(decision, srcDir, outDir);
      totalBytes += result.bytes;
      if (result.didBuild) entriesBuilt += 1;
      else entriesCached += 1;
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
  if (importPaths === null) {
    // Stale or corrupt sidecar — rebuild this entry to self-heal.
    // eslint-disable-next-line no-console
    console.warn(
      `deskwork-studio: stale or corrupt metafile at ${metaPath} — rebuild`,
    );
    return { entryPath, outFile, baseName, rebuild: true };
  }
  for (const imp of importPaths) {
    const impMtime = await safeMtime(imp);
    if (impMtime === null) continue; // file removed; rebuild will fail loudly if relevant
    if (impMtime > cachedMtime) {
      return { entryPath, outFile, baseName, rebuild: true };
    }
  }

  return { entryPath, outFile, baseName, rebuild: false };
}

interface RebuildResult {
  readonly bytes: number;
  /** True if we actually invoked esbuild; false if another process did the build while we held the lock. */
  readonly didBuild: boolean;
}

async function rebuildEntryWithLock(
  decision: EntryDecision,
  srcDir: string,
  outDir: string,
): Promise<RebuildResult> {
  const lockPath = `${decision.outFile}.lock`;
  const acquired = await acquireLock(lockPath);
  if (!acquired.acquired) {
    // Lock-wait timed out without us getting it. Re-check the cache:
    // even if we never held the lock, the holder's output may now be
    // valid (and our caller's `decideEntry` was a stale snapshot).
    const recheck = await decideEntry(decision.entryPath, srcDir, outDir);
    if (!recheck.rebuild) {
      const cachedStat = await stat(decision.outFile);
      return { bytes: cachedStat.size, didBuild: false };
    }
    throw new Error(
      `deskwork-studio: timed out waiting for build lock at ${lockPath}; remove it manually if stale`,
    );
  }
  try {
    // We hold the lock. Re-decide under the lock — another process may
    // have finished its build while we waited. If the cache is now
    // valid, skip the rebuild and report bytes from the cached file.
    const recheck = await decideEntry(decision.entryPath, srcDir, outDir);
    if (!recheck.rebuild) {
      const cachedStat = await stat(decision.outFile);
      return { bytes: cachedStat.size, didBuild: false };
    }
    const bytes = await rebuildEntry(decision);
    return { bytes, didBuild: true };
  } finally {
    await releaseLock(lockPath);
  }
}

interface LockAcquisition {
  readonly acquired: boolean;
}

async function acquireLock(lockPath: string): Promise<LockAcquisition> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  let pollMs = LOCK_POLL_INITIAL_MS;
  while (true) {
    try {
      await mkdir(lockPath, { recursive: false });
      return { acquired: true };
    } catch (err) {
      if (!isEexist(err)) throw err;
      // Stale-lock recovery: if the lock dir is older than LOCK_STALE_MS,
      // the holder probably crashed. Reap it and retry.
      const lockMtime = await safeMtime(lockPath);
      if (lockMtime !== null && Date.now() - lockMtime > LOCK_STALE_MS) {
        // eslint-disable-next-line no-console
        console.warn(
          `deskwork-studio: removing stale build lock at ${lockPath} (age=${Math.round((Date.now() - lockMtime) / 1000)}s)`,
        );
        try {
          await rm(lockPath, { recursive: true, force: true });
        } catch {
          // Another process may have just released it; loop back and try mkdir again.
        }
        continue;
      }
      if (Date.now() >= deadline) {
        return { acquired: false };
      }
      await sleep(pollMs);
      pollMs = Math.min(pollMs * 2, LOCK_POLL_MAX_MS);
    }
  }
}

async function releaseLock(lockPath: string): Promise<void> {
  try {
    await rm(lockPath, { recursive: true, force: true });
  } catch {
    // best-effort; nothing actionable here.
  }
}

function isEexist(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if (!('code' in err)) return false;
  const code: unknown = err.code;
  return code === 'EEXIST';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => {
    setTimeout(r, ms);
  });
}

function makeTmpPath(finalPath: string): string {
  const rand = randomBytes(6).toString('hex');
  return `${finalPath}.tmp.${process.pid}.${rand}`;
}

async function rebuildEntry(decision: EntryDecision): Promise<number> {
  const tmpOutFile = makeTmpPath(decision.outFile);
  const opts: BuildOptions = {
    entryPoints: [decision.entryPath],
    outfile: tmpOutFile,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: false,
    sourcemap: 'linked',
    logLevel: 'warning',
    metafile: true,
  };
  let result: BuildResult;
  try {
    result = await build(opts);
  } catch (err) {
    // Best-effort cleanup of any partial tmp output.
    await unlink(tmpOutFile).catch(() => undefined);
    await unlink(`${tmpOutFile}.map`).catch(() => undefined);
    throw err;
  }
  if (result.errors.length > 0) {
    await unlink(tmpOutFile).catch(() => undefined);
    await unlink(`${tmpOutFile}.map`).catch(() => undefined);
    throw new Error(
      `deskwork-studio: esbuild reported ${result.errors.length} errors building ${decision.entryPath}`,
    );
  }
  if (!result.metafile) {
    await unlink(tmpOutFile).catch(() => undefined);
    await unlink(`${tmpOutFile}.map`).catch(() => undefined);
    throw new Error(
      `deskwork-studio: esbuild did not return a metafile for ${decision.entryPath}; cache check would be unsound`,
    );
  }

  // Atomically promote the JS (and sourcemap, if present) to the final path.
  await rename(tmpOutFile, decision.outFile);
  // sourcemap path mirrors esbuild's `linked` behavior: <outfile>.map
  const tmpMap = `${tmpOutFile}.map`;
  const finalMap = `${decision.outFile}.map`;
  if (await exists(tmpMap)) {
    await rename(tmpMap, finalMap);
  }

  await writeMetafileAtomic(`${decision.outFile}.meta.json`, result.metafile);
  const stats = await stat(decision.outFile);
  return stats.size;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function safeMtime(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.mtimeMs;
  } catch {
    return null;
  }
}

async function writeMetafileAtomic(path: string, meta: Metafile): Promise<void> {
  const tmp = makeTmpPath(path);
  const json = JSON.stringify({ inputs: Object.keys(meta.inputs) });
  await writeFile(tmp, json, 'utf8');
  await rename(tmp, path);
}

interface MetafileSidecar {
  readonly inputs: readonly string[];
}

/**
 * Returns the resolved import paths from the sidecar metafile.
 * Returns `null` if the sidecar is missing, unreadable, malformed, or
 * fails JSON.parse — the caller treats `null` as "rebuild this entry."
 * This makes the cache self-healing: a corrupt sidecar (e.g. truncated
 * by a kill mid-write) cannot wedge boot.
 */
async function readMetafileInputs(
  metaPath: string,
  entryPath: string,
): Promise<readonly string[] | null> {
  let raw: string;
  try {
    raw = await readFile(metaPath, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isMetafileSidecar(parsed)) {
    return null;
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
