/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/codebase-state-metrics-gather.ts
 *
 * Input-gatherer for the pure metrics computation.
 *
 * Separates I/O (file reads, git log, scan-run directory walks) from
 * pure math (codebase-state-metrics.ts). The synthesis pass calls
 * `gatherMetricsInput()` to assemble a `ComputeInput`, then invokes
 * `computeCodebaseStateMetrics()` on the result.
 *
 * # Sources read
 *
 *   - `.dw-lifecycle/scope-discovery/anti-patterns.yaml`
 *   - `.dw-lifecycle/scope-discovery/adopter-manifests.yaml`
 *   - `.dw-lifecycle/scope-discovery/clones.yaml`
 *   - `.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml` (override)
 *   - git history via `git log --name-only -N -- <catalog-files>`
 *
 * # Pattern findings consumed
 *
 * The synthesis pass already has the pattern-matrix findings. We pluck
 * the coverage + negative-space + outlier handler metrics from them so
 * the gatherer doesn't re-execute pattern matching.
 *
 * # Failure modes
 *
 * Catalog files are READ if present and SKIPPED if absent (a project
 * may use only a subset of the catalogs). YAML parse errors throw —
 * the synthesis pass should fail loud rather than silently zeroing a
 * metric.
 *
 * Git invocation failures (no git binary, not a git repo, command
 * errored) set `gitAvailable: false`. The catalog-stability metric
 * reports zeros + a `git_available: false` flag in that case.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseRegistry as parseAntiPatternsRegistry } from '../anti-patterns-registry.js';
import { parseRegistry as parseAdopterManifestsRegistry } from '../adopter-manifests-registry.js';
import { parseClonesYamlStrict } from '../clones-yaml.parse.js';
import { loadOverridePatterns } from './pattern-handlers/loader.js';
import type { PatternCatalogEntry } from './pattern-handlers/types.js';
import type {
  AstGrepMatrixFindings,
  PatternFinding,
} from './types.js';
import type {
  CatalogEntryObservation,
  CatalogEntrySnapshot,
  CommitEdit,
  ComputeInput,
  DirectorySampleStats,
  DispositionTransitionObservation,
  OutlierObservation,
  ScanRunObservation,
} from './codebase-state-metrics.js';
import { DEFAULT_CATALOG_STABILITY_LOOKBACK } from './codebase-state-metrics.js';

const CONFIG_DIR = '.dw-lifecycle/scope-discovery';

const CATALOG_FILES = [
  'anti-patterns.yaml',
  'adopter-manifests.yaml',
  'clones.yaml',
  'pattern-matrix-patterns.yaml',
] as const;

export interface GatherMetricsInputArgs {
  readonly repoRoot: string;
  readonly patternMatrixFindings?: AstGrepMatrixFindings;
  readonly lookbackCommits?: number;
  /** When true, skip the git invocation entirely. Defaults to false. */
  readonly noGitHistory?: boolean;
  /** Timestamp the metrics will use. Defaults to new Date(). */
  readonly generatedAt?: string;
}

export async function gatherMetricsInput(
  args: GatherMetricsInputArgs,
): Promise<ComputeInput> {
  const entries: CatalogEntrySnapshot[] = [];
  const observations: CatalogEntryObservation[] = [];
  const lookback = args.lookbackCommits ?? DEFAULT_CATALOG_STABILITY_LOOKBACK;

  // -- Anti-patterns ---------------------------------------------------------
  const antiPatternsPath = resolve(args.repoRoot, CONFIG_DIR, 'anti-patterns.yaml');
  if (existsSync(antiPatternsPath)) {
    const text = readFileSync(antiPatternsPath, 'utf8');
    const parsed = parseAntiPatternsRegistry(text, antiPatternsPath);
    for (const entry of parsed.entries) {
      entries.push({
        entry_id: entry.id,
        catalog: 'anti-patterns',
        status: entry.status,
        provenance: entry.provenance,
        // Anti-patterns are regex-only — no match_glob.
      });
    }
  }

  // -- Adopter manifests -----------------------------------------------------
  const adopterManifestsPath = resolve(args.repoRoot, CONFIG_DIR, 'adopter-manifests.yaml');
  if (existsSync(adopterManifestsPath)) {
    const text = readFileSync(adopterManifestsPath, 'utf8');
    const parsed = parseAdopterManifestsRegistry(text, adopterManifestsPath);
    for (const entry of parsed.entries) {
      const firstGlob = entry.globs[0]?.pattern;
      const snapshot: CatalogEntrySnapshot =
        firstGlob !== undefined
          ? {
              entry_id: entry.id,
              catalog: 'adopter-manifests',
              status: entry.status,
              provenance: entry.provenance,
              match_glob: firstGlob,
            }
          : {
              entry_id: entry.id,
              catalog: 'adopter-manifests',
              status: entry.status,
              provenance: entry.provenance,
            };
      entries.push(snapshot);
    }
  }

  // -- Clones ----------------------------------------------------------------
  const clonesPath = resolve(args.repoRoot, CONFIG_DIR, 'clones.yaml');
  if (existsSync(clonesPath)) {
    const text = readFileSync(clonesPath, 'utf8');
    const parsed = parseClonesYamlStrict(text);
    for (const group of parsed.clones) {
      entries.push({
        entry_id: group.id,
        catalog: 'clones',
        status: group.status,
        provenance: group.provenance,
      });
    }
  }

  // -- Pattern matrix overrides ---------------------------------------------
  const overrides = await loadOverridePatterns(args.repoRoot);
  if (overrides !== null) {
    for (const entry of overrides) {
      const snapshot: CatalogEntrySnapshot =
        'matchGlob' in entry
          ? {
              entry_id: entry.id,
              catalog: 'pattern-matrix',
              status: entry.status,
              provenance: entry.provenance,
              match_glob: entry.matchGlob,
            }
          : {
              entry_id: entry.id,
              catalog: 'pattern-matrix',
              status: entry.status,
              provenance: entry.provenance,
            };
      entries.push(snapshot);
    }
    // Pull observations from the pattern-matrix findings.
    if (args.patternMatrixFindings !== undefined) {
      for (const finding of args.patternMatrixFindings.patterns) {
        observations.push(observationFromPatternFinding(finding, overrides));
      }
    }
  }

  // Outlier observations are sourced from outlier-handler findings in
  // pattern-matrix.
  const outliers: OutlierObservation[] = [];
  if (args.patternMatrixFindings !== undefined && overrides !== null) {
    for (const entry of overrides) {
      if (entry.type !== 'outlier') continue;
      const finding = args.patternMatrixFindings.patterns.find((p) => p.id === entry.id);
      if (finding === undefined) continue;
      const obs = extractOutlierObservation(entry.id, finding);
      if (obs !== null) outliers.push(obs);
    }
  }

  // -- Git history -----------------------------------------------------------
  const noGit = args.noGitHistory === true;
  const gitResult = noGit
    ? { available: false, commits: [] as CommitEdit[] }
    : readGitHistory(args.repoRoot, lookback);

  // -- Scan runs + disposition transitions ----------------------------------
  // These are derived from the provenance.context tags on the entries
  // themselves. Synthesis pass doesn't have a separate scan-run log
  // store yet (the self-correcting controller's controller will manage one); for now
  // we approximate from what we have.
  const scanRuns: ScanRunObservation[] = [];
  const transitions: DispositionTransitionObservation[] = [];

  return {
    entries,
    observations,
    outliers,
    directorySamples: [],
    uncataloguedCandidateCount: 0,
    commitEdits: gitResult.commits,
    gitAvailable: gitResult.available,
    lookbackCommits: lookback,
    scanRuns,
    transitions,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
  };
}

function observationFromPatternFinding(
  finding: PatternFinding,
  overrides: ReadonlyArray<PatternCatalogEntry>,
): CatalogEntryObservation {
  const entry = overrides.find((e) => e.id === finding.id);
  const obs: {
    -readonly [K in keyof CatalogEntryObservation]: CatalogEntryObservation[K];
  } = {
    entry_id: finding.id,
    catalog: 'pattern-matrix',
  };
  if (entry !== undefined && finding.metrics !== undefined) {
    if (entry.type === 'coverage') {
      const numerator = finding.metrics['numerator'];
      const denominator = finding.metrics['denominator'];
      if (typeof numerator === 'number') obs.files_with_primitive = numerator;
      if (typeof denominator === 'number') obs.files_matching_glob = denominator;
    } else if (entry.type === 'negative-space') {
      const matched = finding.metrics['glob_matched_files'];
      const holdouts = finding.metrics['holdouts'];
      if (typeof matched === 'number') {
        obs.files_matching_glob = matched;
        if (typeof holdouts === 'number') {
          obs.files_with_primitive = matched - holdouts;
        }
      }
    }
  }
  // Build hits_by_file from the finding's per-line hits — used for
  // violation density on cursed entries.
  if (finding.hits.length > 0) {
    const byFile = new Map<string, number>();
    for (const hit of finding.hits) {
      byFile.set(hit.file, (byFile.get(hit.file) ?? 0) + 1);
    }
    obs.hits_by_file = byFile;
  }
  return obs;
}

function extractOutlierObservation(
  entryId: string,
  finding: PatternFinding,
): OutlierObservation | null {
  // The outlier handler emits aggregated metrics + per-file hits.
  // Re-bucket the hits by directory to produce per-directory outlier
  // counts. The population + mean-distance fields are stored on
  // `finding.metrics` aggregates, not per-directory, so we report
  // approximations from the hits + the aggregate.
  const outliersByDir = new Map<string, number>();
  const populationByDir = new Map<string, number>();
  const meanDistanceByDir = new Map<string, number>();
  for (const hit of finding.hits) {
    const dir = dirOf(hit.file);
    outliersByDir.set(dir, (outliersByDir.get(dir) ?? 0) + 1);
  }
  if (outliersByDir.size === 0) return null;
  // We don't have per-directory population from the outlier finding
  // (the handler emits aggregate counts). Leave the population +
  // mean-distance maps empty; the surface-uniformity metric reads
  // outliers_by_directory directly + tolerates absence of population.
  // The fallback path is `directorySamples` for richer per-dir stats.
  return {
    entry_id: entryId,
    outliers_by_directory: outliersByDir,
    population_by_directory: populationByDir,
    mean_distance_by_directory: meanDistanceByDir,
  };
}

function dirOf(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx < 0 ? '.' : filePath.slice(0, idx);
}

interface GitReadResult {
  readonly available: boolean;
  readonly commits: ReadonlyArray<CommitEdit>;
}

/**
 * Read the most-recent N commits touching catalog files. Failures
 * (no git binary, not a repo) return `{ available: false, commits: [] }`
 * — the catalog-stability metric surfaces the unavailability.
 *
 * Implementation: spawnSync `git log --name-only --format=%H -N` with
 * the catalog files as pathspec. Each commit's `name-only` lines that
 * fall under `CONFIG_DIR` count toward that commit's catalog edits.
 */
function readGitHistory(repoRoot: string, lookback: number): GitReadResult {
  const pathspec = CATALOG_FILES.map((name) => `${CONFIG_DIR}/${name}`);
  const args = [
    'log',
    '--name-only',
    '--format=%H',
    `-${lookback}`,
    '--',
    ...pathspec,
  ];
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error !== undefined || result.status !== 0) {
    return { available: false, commits: [] };
  }
  const text = result.stdout;
  return { available: true, commits: parseGitLogOutput(text) };
}

/**
 * Parse `git log --name-only --format=%H` output. The format is:
 *
 *   <sha>
 *   <changed-file>
 *   <changed-file>
 *   <blank line>
 *   <sha>
 *   <changed-file>
 *   ...
 *
 * SHAs are exactly 40 hex chars; we detect them by length + charset
 * to avoid pulling in a regex per line.
 */
export function parseGitLogOutput(text: string): ReadonlyArray<CommitEdit> {
  const lines = text.split('\n');
  const commits: CommitEdit[] = [];
  let currentSha: string | null = null;
  let currentChanged = 0;
  for (const line of lines) {
    if (isShaLine(line)) {
      if (currentSha !== null) {
        commits.push({ sha: currentSha, catalog_files_changed: currentChanged });
      }
      currentSha = line;
      currentChanged = 0;
      continue;
    }
    if (line.length === 0) continue;
    if (line.startsWith(`${CONFIG_DIR}/`)) {
      currentChanged += 1;
    }
  }
  if (currentSha !== null) {
    commits.push({ sha: currentSha, catalog_files_changed: currentChanged });
  }
  return commits;
}

function isShaLine(line: string): boolean {
  if (line.length !== 40) return false;
  for (let i = 0; i < line.length; i += 1) {
    const code = line.charCodeAt(i);
    const isDigit = code >= 48 && code <= 57;
    const isLowerHex = code >= 97 && code <= 102;
    if (!isDigit && !isLowerHex) return false;
  }
  return true;
}
