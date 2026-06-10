/**
 * plugins/stack-control/src/scope-discovery/check-adopters.ts
 *
 * Adopter-manifest gate (workplan T6.2). Walks
 * `.stack-control/scope-discovery/adopter-manifests.yaml` and, for each manifest
 * entry, finds files matching the entry's `expected_adopters_glob` and
 * reports any that do NOT import the canonical `from` path (and are not
 * listed as exceptions).
 *
 * Pair with the anti-pattern registry (T6.1): anti-patterns detect
 * LEGACY shapes that should be REPLACED; adopter manifests detect
 * FILES that should be USING a canonical primitive but aren't.
 *
 * Engine: glob-to-regex + pure-regex import-string match. The escape-
 * regex helper is needed because `@/` and `/` are regex meta. Matches
 * both `import ... from '<path>'` and `import('<path>')`, with single OR
 * double quotes accepted.
 *
 * Adopter wiring: invoked as the `check-adopters` subcommand on the
 * `stackctl` CLI. Adopters who want a pre-commit gate run the subcommand
 * from a hook that fires on staged .ts/.tsx changes.
 *
 * Per-codebase (010 / US4): with no `--registry`/`--root` override the
 * registry + scan root resolve against the nearest-enclosing
 * stack-control installation (009's walk-up), so the gate scans the
 * codebase it is run inside — never the whole repo, never a stale
 * `.dw-lifecycle` path. Overrides still win, resolved relative to the
 * installation root.
 *
 * Usage:
 *   stackctl check-adopters [--root <path>] [--registry <path>]
 *                               [--quiet] [--json]
 *
 * Exit codes:
 *   0 = empty registry, no holdouts, OR holdouts present without --gate-mode
 *       (informational default — see --gate-mode for hook-friendly behavior).
 *   1 = holdouts present AND --gate-mode is set.
 *   2 = infra error.
 */

import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadRegistry,
  type AdopterManifestEntry,
  type TrackedHoldout,
} from './adopter-manifests-registry.js';
import { filterActiveEntries } from './util/catalog-status.js';
import {
  type ManifestResult,
  type ScanResult,
  reportJson,
  reportText,
} from './adopter-manifests-report.js';
import { listFilesMatching, toPosix } from './util/glob.js';
import { errorMessage } from './util/typeguards.js';
import { resolveCheckScope } from './check-scope.js';

const DEFAULT_REGISTRY_NAME = 'adopter-manifests.yaml';
const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set(['.ts', '.tsx']);

/** Default per-segment directory names to skip during the tree walk. */
const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.git',
]);

export interface CliOptions {
  /** `--registry` override (relative to installation root); null = per-codebase default. */
  readonly registryOverride: string | null;
  /** `--root` override (scan boundary + root verbatim); null = the installation root. */
  readonly rootOverride: string | null;
  readonly quiet: boolean;
  readonly json: boolean;
  /**
   * Pre-commit-hook-friendly mode. When set, the scanner exits with
   * code 1 on any holdouts (failing the commit). Default behavior
   * (informational mode) prints holdouts but exits 0 so operators
   * can run the scanner ad-hoc without their session being terminated.
   */
  readonly gateMode: boolean;
}

/** Resolved per-codebase scope passed into `scan`. */
export interface ScanInput {
  /** Absolute registry path. */
  readonly registryPath: string;
  /** Absolute scan root. */
  readonly scanRoot: string;
}

// Re-export shared types so the validator can import everything from
// this module without depending on the report-helper split.
export type { ManifestResult, ScanResult } from './adopter-manifests-report.js';

// ---------------------------------------------------------------------------
// CLI surface
// ---------------------------------------------------------------------------

export function parseCli(argv: readonly string[]): CliOptions {
  let registryOverride: string | null = null;
  let rootOverride: string | null = null;
  let quiet = false;
  let json = false;
  let gateMode = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--registry': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--registry requires a path argument');
        registryOverride = next;
        i += 1;
        break;
      }
      case '--root': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--root requires a path argument');
        rootOverride = next;
        i += 1;
        break;
      }
      case '--quiet':
        quiet = true;
        break;
      case '--json':
        json = true;
        break;
      case '--gate-mode':
        gateMode = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        throw new Error('unreachable');
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { registryOverride, rootOverride, quiet, json, gateMode };
}

function printHelp(): void {
  process.stdout.write(
    [
      'stackctl check-adopters [options]',
      '',
      'Options:',
      '  --registry <path>  Override registry path (default: <installation>/.stack-control/scope-discovery/adopter-manifests.yaml)',
      '  --root <path>      Override scan root (default: the enclosing stack-control installation)',
      '  --quiet            Print summary only when zero real holdouts; if real holdouts exist, full report still prints (operator needs to act)',
      '  --json             Emit findings as JSON',
      '  --gate-mode        Pre-commit-hook-friendly: exit 1 on holdouts.',
      '                     Default (without --gate-mode) is informational:',
      '                     holdouts are printed but the process exits 0.',
      '  --help, -h         Show this help',
      '',
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// Import detection
// ---------------------------------------------------------------------------

/**
 * Build a regex that detects an import of ANY of `canonicalPaths`. Matches:
 *   import ... from '<path>'
 *   import ... from "<path>"
 *   import('<path>')
 *   import("<path>")
 *   export ... from '<path>'  (re-export, counts as adoption)
 *   require('<path>')         (CommonJS interop, counts as adoption)
 *
 * Each path is escaped before insertion; regex meta (slashes, `@`,
 * etc.) are matched literally. Multiple paths are OR-combined in a
 * single inner alternation so a consumer importing the primitive via
 * ANY listed path counts as an adopter (AUDIT-08 — cross-module
 * primitive promotion).
 *
 * Throws when `canonicalPaths` is empty — the parser already enforces
 * non-emptiness, so this is a load-bearing invariant violation
 * (not a fallback path).
 */
export function buildImportRegex(canonicalPaths: readonly string[]): RegExp {
  if (canonicalPaths.length === 0) {
    throw new Error('buildImportRegex: canonicalPaths must be non-empty');
  }
  const pathAlt = canonicalPaths.map(escapeRegex).join('|');
  // Order matters: the union below covers static imports, re-exports,
  // dynamic imports, and CJS requires. Multi-line flag so the regex
  // matches imports anywhere in the file. The inner alternation
  // `(?:p1|p2|...)` matches any one of the canonical paths inside the
  // quoted import specifier.
  const pattern =
    `(?:` +
    `(?:import|export)\\s+(?:[^'"]*\\sfrom\\s+)?['"](?:${pathAlt})['"]` +
    `|` +
    `import\\s*\\(\\s*['"](?:${pathAlt})['"]\\s*\\)` +
    `|` +
    `require\\s*\\(\\s*['"](?:${pathAlt})['"]\\s*\\)` +
    `)`;
  return new RegExp(pattern, 'm');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Top-level scan
// ---------------------------------------------------------------------------

export async function scan(input: ScanInput): Promise<ScanResult> {
  const registry = await loadRegistry(input.registryPath);
  // filter to actively-enforced entries only.
  // Entries with `status: pending | ignore | tracked-holdout | withdrawn`
  // are skipped at the registry level so the scanner does not produce
  // findings for them. Pre-Loop registries without explicit status
  // default to `blessed`, preserving the pre-Loop surface.
  const activeEntries = filterActiveEntries(registry.entries);
  if (activeEntries.length === 0) {
    return { manifests: [], entriesScanned: 0, filesVisited: 0 };
  }
  const rootAbs = resolve(input.scanRoot);
  const visited = new Set<string>();
  const manifests: ManifestResult[] = [];
  for (const entry of activeEntries) {
    const result = await scanEntry(entry, rootAbs, visited);
    manifests.push(result);
  }
  return {
    manifests,
    entriesScanned: activeEntries.length,
    filesVisited: visited.size,
  };
}

async function scanEntry(
  entry: AdopterManifestEntry,
  rootAbs: string,
  visited: Set<string>,
): Promise<ManifestResult> {
  const regexes = entry.globs.map((g) => g.regex);
  const matched = await listFilesMatching(rootAbs, regexes, SKIP_DIRS, SCANNED_EXTENSIONS);
  const importRe = buildImportRegex(entry.from);
  const expectedFiles: string[] = [];
  const actualAdopters: string[] = [];
  const exemptedFiles: string[] = [];
  const holdouts: string[] = [];
  const trackedHoldoutFiles: TrackedHoldout[] = [];
  // Partition expected files into three buckets BEFORE checking imports:
  // (a) `exceptionSet` — permanent opt-outs (never findings, never tracked);
  // (b) `trackedHoldoutByPath` — deferred-but-known holdouts (never findings,
  //     surfaced in their own report section);
  // (c) everything else — regular candidates whose import status determines
  //     adopter vs. finding.
  const exceptionSet = new Set(entry.exceptions.map((e) => e.path));
  const trackedHoldoutByPath = new Map<string, TrackedHoldout>(
    entry.trackedHoldouts.map((th) => [th.path, th]),
  );
  for (const abs of matched) {
    visited.add(abs);
    const rel = toPosix(toRepoRel(abs, rootAbs));
    expectedFiles.push(rel);
    if (exceptionSet.has(rel)) {
      exemptedFiles.push(rel);
      continue;
    }
    const tracked = trackedHoldoutByPath.get(rel);
    if (tracked !== undefined) {
      trackedHoldoutFiles.push(tracked);
      continue;
    }
    const content = await readFileSafe(abs);
    if (importRe.test(content)) {
      actualAdopters.push(rel);
    } else {
      holdouts.push(rel);
    }
  }
  expectedFiles.sort();
  actualAdopters.sort();
  exemptedFiles.sort();
  holdouts.sort();
  trackedHoldoutFiles.sort((a, b) => a.path.localeCompare(b.path));
  return {
    entry,
    expectedFiles,
    actualAdopters,
    exemptedFiles,
    trackedHoldoutFiles,
    holdouts,
  };
}

function toRepoRel(abs: string, rootAbs: string): string {
  if (abs === rootAbs) return '';
  if (abs.startsWith(rootAbs + '/')) return abs.substring(rootAbs.length + 1);
  return abs;
}

async function readFileSafe(path: string): Promise<string> {
  try {
    const fileStat = await stat(path);
    if (fileStat.size === 0) return '';
    return await readFile(path, 'utf8');
  } catch (err) {
    throw new Error(`adopter-manifests: failed to read ${path}: ${errorMessage(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function main(
  argv: readonly string[],
  cwd: string = process.cwd(),
): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`adopter-manifests: ${errorMessage(err)}\n`);
    return 2;
  }
  let result: ScanResult;
  try {
    const scope = resolveCheckScope({
      startDir: cwd,
      defaultRegistryName: DEFAULT_REGISTRY_NAME,
      registryOverride: opts.registryOverride,
      rootOverride: opts.rootOverride,
    });
    // Config-activated (FR-019 / SC-008): an ABSENT default registry is a
    // clean no-op — the adopter simply hasn't opted in. (An explicit
    // `--registry` to a missing path still fails loud below.)
    if (!scope.registryExists && scope.registryIsDefault) {
      result = { manifests: [], entriesScanned: 0, filesVisited: 0 };
    } else {
      result = await scan({ registryPath: scope.registryPath, scanRoot: scope.scanRoot });
    }
  } catch (err) {
    process.stderr.write(`adopter-manifests: ${errorMessage(err)}\n`);
    return 2;
  }
  const out = opts.json ? reportJson(result) : reportText(result, { quiet: opts.quiet });
  if (out.length > 0) process.stdout.write(out);
  const totalHoldouts = result.manifests.reduce((n, m) => n + m.holdouts.length, 0);
  if (totalHoldouts === 0) return 0;
  // Default informational mode → exit 0 with report; --gate-mode →
  // exit 1 to fail a pre-commit hook on holdouts.
  return opts.gateMode ? 1 : 0;
}

function isCliEntryPoint(): boolean {
  if (typeof process === 'undefined' || process.argv.length < 2) return false;
  const invoked = process.argv[1];
  if (invoked === undefined) return false;
  return invoked === fileURLToPath(import.meta.url);
}

if (isCliEntryPoint()) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(`adopter-manifests: fatal: ${errorMessage(err)}\n`);
      process.exit(2);
    },
  );
}
