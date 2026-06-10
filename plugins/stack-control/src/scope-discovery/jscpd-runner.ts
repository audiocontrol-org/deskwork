// plugins/stack-control/src/scope-discovery/jscpd-runner.ts
//
// Owns the subprocess invocation of `jscpd` and the parse of its JSON report
// into stable CloneGroup records. Ported from dw-lifecycle; GENERALIZED (010
// T007): instead of assuming a repo-root `.jscpd.json` + `process.cwd()`, the
// runner is parameterized by an explicit scan `root` + `ignore` list, so a
// per-codebase scan (resolved via codebase-boundary.ts) never reaches outside
// its installation. jscpd is driven entirely by CLI flags — no config file in
// the scanned tree is required.
//
// Engine boundary contract:
//   runJscpd(opts)              → side effects only; writes the JSON report, returns its path
//   parseJscpdReport(txt)       → pure; returns CloneGroup[]  (verbatim from dw-lifecycle)
//   detectClonesViaJscpd(opts)  → run + parse convenience used by the detector + tests
//
// jscpd reports each clone as a PAIR (firstFile + secondFile). When the same
// fragment appears in 3+ files, jscpd emits multiple overlapping pairs
// (A↔B, A↔C, B↔C). We collapse those into a single group because the
// operator-facing question is "which sites need refactoring," and three files
// sharing the same fragment is one site, not three.

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type CloneGroup, makeCloneGroup, sha1HexOfText } from './clones-yaml.js';
import { isEnoent, isPlainObject } from './util/typeguards.js';

/** jscpd writes `<output>/jscpd-report.json`. */
const JSCPD_REPORT_FILE = 'jscpd-report.json';

/** Canonical scan defaults (mirrors the repo `.jscpd.json`). */
const FORMATS = 'typescript,tsx';
const MIN_TOKENS = '50';
const BASE_IGNORE: readonly string[] = [
  '**/*.test.ts',
  '**/dist/**',
  '**/node_modules/**',
  '**/.runtime-cache/**',
  '**/coverage/**',
  '**/.specify/**',
];

/**
 * Invoke jscpd over `root`, writing a JSON report to a fresh temp dir; return
 * the report path. `ignore` entries (absolute paths to excluded child subtrees,
 * or globs) are merged with the canonical ignore list and converted to globs
 * relative to `root`. We use the subprocess approach (not jscpd's programmatic
 * API) so "what the gate sees" matches "what the dev would type at the shell".
 * jscpd exits non-zero when the duplication threshold trips; that is DATA, not
 * an error — only a kill-signal (code null) or a missing report is a real error.
 */
export async function runJscpd(opts: {
  readonly root: string;
  readonly ignore: readonly string[];
}): Promise<string> {
  const outputDir = await mkdtemp(join(tmpdir(), 'jscpd-out-'));
  const reportAbs = join(outputDir, JSCPD_REPORT_FILE);
  try {
    await rm(reportAbs);
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }

  const ignoreGlobs = [...BASE_IGNORE, ...opts.ignore.map((p) => toIgnoreGlob(opts.root, p))];

  // Resolve and run the LOCALLY-INSTALLED jscpd (pinned ^4) via node — NOT
  // `npx jscpd`, which from a scan cwd outside the repo would fetch a different
  // (newer, flag-incompatible) jscpd from the registry. `--absolute` so report
  // member paths are absolute (stable across cwd); `--gitignore` honors the
  // tree's .gitignore; `--silent` suppresses progress (we read the JSON).
  const jscpdBin = resolveJscpdBin();
  const jscpdArgs = [
    jscpdBin,
    opts.root,
    '--min-tokens',
    MIN_TOKENS,
    '--format',
    FORMATS,
    '--reporters',
    'json',
    '--output',
    outputDir,
    '--ignore',
    ignoreGlobs.join(','),
    '--absolute',
    '--gitignore',
    '--silent',
  ];

  let stderr = '';
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const proc = spawn(process.execPath, jscpdArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout?.on('data', () => {
      /* swallow jscpd progress; we read the JSON report instead */
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', (err) => rejectPromise(err));
    proc.on('exit', (code) => {
      if (code === null) {
        rejectPromise(new Error(`jscpd terminated by signal; stderr:\n${stderr}`));
      } else {
        resolvePromise();
      }
    });
  });

  try {
    await stat(reportAbs);
  } catch (err) {
    if (isEnoent(err)) {
      throw new Error(
        `jscpd ran over ${opts.root} but did not write ${JSCPD_REPORT_FILE}.\n` +
          `stderr from npx:\n${stderr || '(empty)'}`,
      );
    }
    throw err;
  }
  return reportAbs;
}

/** Run jscpd over `root` (excluding `ignore`) and parse the report → CloneGroup[]. */
export async function detectClonesViaJscpd(opts: {
  readonly root: string;
  readonly ignore: readonly string[];
}): Promise<CloneGroup[]> {
  const reportAbs = await runJscpd(opts);
  try {
    const reportText = await readFile(reportAbs, 'utf8');
    return parseJscpdReport(reportText);
  } finally {
    await rm(reportAbs, { force: true }).catch(() => undefined);
  }
}

/**
 * Resolve the locally-installed jscpd JS entry by walking up from this module
 * to the nearest `node_modules/jscpd/bin/jscpd` (mirrors _run-helpers.resolveTsx
 * / bin/stackctl's find-by-walk-up — works whether npm hoisted the dep to the
 * monorepo root or nested it plugin-local). Fail loud (Principle V) if absent —
 * never silently fall back to a registry fetch that could be a different jscpd.
 */
function resolveJscpdBin(): string {
  let cur = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(cur, 'node_modules', 'jscpd', 'bin', 'jscpd');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(
    'jscpd not found: no node_modules/jscpd/bin/jscpd at or above the scope-discovery ' +
      'module. Run `npm install` (jscpd is a declared dependency).',
  );
}

/** An absolute excluded path → a glob jscpd will match; a glob passes through. */
function toIgnoreGlob(root: string, entry: string): string {
  if (entry.includes('*')) return entry;
  const rel = relative(root, entry);
  if (rel === '' || rel.startsWith('..')) return `${entry}/**`;
  return `**/${rel}/**`;
}

interface RawPair {
  readonly members: string[];
  readonly lines: number;
  readonly fragmentSha: string;
}

/**
 * Read jscpd-report.json and convert each `duplicates[]` entry into a
 * CloneGroup, collapsing overlapping pairs (see file header). Each entry's
 * `fragment` (the duplicated source text jscpd normalised) is sha1-hex'd to
 * produce the per-pair token fingerprint that threads into the content-hashed
 * id, keeping clone-group ids stable across unrelated line shifts.
 */
export function parseJscpdReport(reportText: string): CloneGroup[] {
  const parsed: unknown = JSON.parse(reportText);
  if (!isPlainObject(parsed)) {
    throw new Error('jscpd-report.json did not parse to an object');
  }
  const duplicates = parsed['duplicates'];
  if (!Array.isArray(duplicates)) {
    throw new Error('jscpd-report.json missing duplicates[] array');
  }
  const pairs: RawPair[] = [];
  for (const dup of duplicates) {
    if (!isPlainObject(dup)) continue;
    const lines = dup['lines'];
    const fragment = dup['fragment'];
    const a = memberFromFile(dup['firstFile']);
    const b = memberFromFile(dup['secondFile']);
    if (a === null || b === null) continue;
    if (typeof fragment !== 'string' || fragment.length === 0) {
      throw new Error(
        'jscpd-report.json duplicates[] entry missing non-empty `fragment` field; ' +
          'content-hashed ids cannot be derived without it.',
      );
    }
    if (typeof lines !== 'number') {
      throw new Error(
        'jscpd-report.json duplicates[] entry missing numeric `lines` field; ' +
          'cannot build CloneGroup without a line count.',
      );
    }
    pairs.push({
      members: [a, b].sort(),
      lines,
      fragmentSha: sha1HexOfText(fragment),
    });
  }
  return collapsePairsIntoGroups(pairs).map((p) =>
    makeCloneGroup({
      members: p.members,
      lines: p.lines,
      disposition: 'pending',
      reason: null,
      tokenFingerprint: p.fragmentSha,
    }),
  );
}

function memberFromFile(file: unknown): string | null {
  if (!isPlainObject(file)) return null;
  const name = file['name'];
  const start = file['start'];
  const end = file['end'];
  if (typeof name !== 'string') return null;
  if (typeof start !== 'number') return null;
  if (typeof end !== 'number') return null;
  return `${name}:${start}:${end}`;
}

/**
 * Pairs sharing any member AND the same `lines` value merge into one group. We
 * require `lines` parity to avoid collapsing unrelated clones that happen to
 * overlap a hot file. For a 3+-file clone, jscpd's per-pair fragment text can
 * differ slightly (boundary normalisation), so we aggregate the SET of pair-level
 * fragment-shas and hash the sorted set as the group fingerprint — deterministic
 * across runs.
 */
function collapsePairsIntoGroups(pairs: readonly RawPair[]): RawPair[] {
  const groups: { members: Set<string>; lines: number; fragmentShas: Set<string> }[] = [];
  for (const pair of pairs) {
    const candidate = groups.find(
      (g) => g.lines === pair.lines && pair.members.some((m) => g.members.has(m)),
    );
    if (candidate === undefined) {
      groups.push({
        members: new Set(pair.members),
        lines: pair.lines,
        fragmentShas: new Set([pair.fragmentSha]),
      });
    } else {
      for (const m of pair.members) candidate.members.add(m);
      candidate.fragmentShas.add(pair.fragmentSha);
    }
  }
  return groups.map((g) => ({
    members: [...g.members].sort(),
    lines: g.lines,
    fragmentSha: sha1HexOfText([...g.fragmentShas].sort().join('\n')),
  }));
}
