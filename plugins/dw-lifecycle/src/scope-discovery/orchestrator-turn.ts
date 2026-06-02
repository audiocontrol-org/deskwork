/**
 * plugins/dw-lifecycle/src/scope-discovery/orchestrator-turn.ts
 *
 * CLI assembler for the orchestrator loop's per-turn audit/judge stack.
 *
 * `/dw-lifecycle:implement` dispatches into dw-lifecycle via Bash; the
 * agent's only path to the orchestrator-loop library is through a CLI
 * subcommand. This module assembles `TurnInput` from on-disk state +
 * existing in-process composers (catalog parsers, codebase-state
 * metrics gatherer, the discovery-agent scope-inventory scanners) and
 * invokes `runOrchestratorTurn`. The resulting `TurnReport` is the
 * unit the agent emits as machine-readable JSON.
 *
 * The function performs five steps:
 *
 *   1. Resolve the audit-log path (auto-detect when omitted).
 *   2. Read every catalog (anti-patterns, adopter-manifests, clones,
 *      pattern-matrix overrides) and project entries into the
 *      `CatalogEntryView` shape the recovery library expects.
 *   3. Compute fresh `CodebaseStateMetrics` via the existing gatherer
 *      + pure-compute pair.
 *   4. Collect `DiscoveryAgentFinding`s by running the same discovery
 *      agents `scope-inventory` runs (in-process; no subprocess).
 *   5. Call `runOrchestratorTurn`, then persist the returned
 *      `nextLoopState`.
 *
 * Persistence the assembler owns:
 *   - Loop state — persisted here after the turn (the library returns
 *     the new state without writing).
 *
 * Persistence the turn library owns:
 *   - Controller state — `runOrchestratorTurn` calls
 *     `persistControllerState` internally.
 *   - Audit watermark — `runOrchestratorTurn` calls
 *     `persistAuditWatermark` internally.
 *
 * # No silent fallbacks
 *
 * Missing catalog files are skipped (a project may use only a subset
 * of the catalogs). Missing audit-log files yield an empty entry
 * list. Missing CLI args throw with exit code 2. Missing judgeInput /
 * auditorInput flags are honored as a no-op for those passes (the
 * loop already supports this via the optional fields on `TurnInput`).
 */

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { computeCodebaseStateMetrics } from './discovery-agents/codebase-state-metrics.js';
import { gatherMetricsInput } from './discovery-agents/codebase-state-metrics-gather.js';
import { buildPatternMatrix } from './discovery-agents/pattern-matrix.js';
import { enumerateUiRoutes } from './discovery-agents/ui-route-enumerator.js';
import { readCloneDetectorOutput } from './discovery-agents/clone-detector-reader.js';
import { huntPrdThemes } from './discovery-agents/prd-themed-pattern-hunter.js';
import { detectRegimeHoldouts } from './discovery-agents/regime-holdout-detector.js';
import { checkAdopterManifests } from './discovery-agents/adopter-manifest-checker.js';
import type {
  DiscoveryAgentFinding,
  DiscoveryAgentInput,
} from './discovery-agents/types.js';
import { parseRegistry as parseAntiPatternsRegistry } from './anti-patterns-registry.js';
import { parseRegistry as parseAdopterManifestsRegistry } from './adopter-manifests-registry.js';
import { parseClonesYamlStrict } from './clones-yaml.parse.js';
import { loadOverridePatterns } from './discovery-agents/pattern-handlers/loader.js';
import { runOrchestratorTurn } from './orchestrator-loop/loop-turn.js';
import { loadLoopState, persistLoopState } from './orchestrator-loop/loop-state.js';
import { loadLoopConfig } from './orchestrator-loop/loop-config.js';
import type {
  LoopState,
  TurnHistoryEntry,
  TurnInput,
  TurnReport,
} from './orchestrator-loop/loop-types.js';
import type { CatalogEntryView } from './recovery/detect-wrong-decisions.js';
import type { DispatchFn } from './dispatch-wrapper.js';
import type { AuditorInput, JudgeInput } from './llm/types.js';
import { errorMessage } from './util/typeguards.js';
import {
  isAuditorInputShape,
  isJudgeInputShape,
  loadJsonInputUnknown,
} from './orchestrator-turn-inputs.js';

const SCOPE_DISCOVERY_DIR = '.dw-lifecycle/scope-discovery';

/**
 * Arguments to `runOrchestratorTurnCli`. Mirrors the CLI flag set in
 * `subcommands/orchestrator-turn.ts`; tests construct this directly
 * to exercise the assembler without going through process.argv.
 */
export interface OrchestratorTurnCliArgs {
  readonly repoRoot: string;
  readonly featureSlug: string;
  readonly auditLogPath?: string;
  readonly skipJudge?: boolean;
  readonly skipAuditor?: boolean;
  readonly judgeInputPath?: string;
  readonly auditorInputPath?: string;
  readonly runtimeDirOverride?: string;
  readonly now?: string;
  /**
   * When true, skip the "feature directory must exist" pre-flight check
   * (TF-005). Intended for test fixtures and adopter projects that
   * don't use the standard `docs/<v>/001-IN-PROGRESS/<slug>/` layout.
   */
  readonly allowMissingFeature?: boolean;
  /**
   * When true, force the `NOTE: only N/6 catalog files present (...)`
   * decoration even when the catalog count hasn't changed since the
   * prior turn (Phase 14 Task 1; AUDIT-20260529-12). Default false —
   * the NOTE is suppressed on steady-state turns to keep the per-turn
   * summary signal-dense. The WARNING (count === 0) is NOT subject to
   * gating; it always fires.
   */
  readonly verbose?: boolean;
}

/**
 * Result returned by `runOrchestratorTurnCli`. `exitCode` is the
 * value the subcommand shim passes to `process.exit`. `report` is
 * present on success (exitCode 0); absent on infra/usage failure.
 * `errorText` carries a one-line error description when the result
 * isn't success; the shim writes it to stderr.
 */
export interface OrchestratorTurnCliResult {
  readonly exitCode: 0 | 1 | 2;
  readonly report?: TurnReport;
  readonly errorText?: string;
}

/**
 * No-op dispatcher used when `judgeInput` is omitted (the loop never
 * calls the dispatcher in that path). Documented to throw with a
 * clear message — the project's "no fallbacks" rule prefers explicit
 * failure over silent surprise. If the loop ever calls this, the
 * test or live invocation is mis-configured.
 */
function makeNoOpDispatcher(): DispatchFn {
  return async () => {
    throw new Error(
      'orchestrator-turn: dispatchFn was invoked but no judgeInput was supplied; ' +
        'either pass --judge-input <path> or omit the judge pass entirely',
    );
  };
}

/**
 * Resolve the audit-log path for `featureSlug`. The CLI default walks
 * the versioned docs tree (`docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md`)
 * and returns the first match. If no audit-log file is found, we
 * return the canonical 1.0 path so the loop reads "no entries" — the
 * loop tolerates missing files.
 */
function resolveAuditLogPath(args: {
  readonly repoRoot: string;
  readonly featureSlug: string;
  readonly override?: string;
}): string {
  if (args.override !== undefined && args.override.length > 0) {
    return args.override;
  }
  // Walk versioned doc directories — `docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md`.
  // The current convention is `1.0`; older feature trees lived under
  // `0.x.0` directories. Probe each, return the first hit.
  const candidates = [
    `docs/1.0/001-IN-PROGRESS/${args.featureSlug}/audit-log.md`,
    `docs/0.22.0/001-IN-PROGRESS/${args.featureSlug}/audit-log.md`,
    `docs/0.20.0/001-IN-PROGRESS/${args.featureSlug}/audit-log.md`,
    `docs/0.19.0/001-IN-PROGRESS/${args.featureSlug}/audit-log.md`,
    `docs/0.16.0/001-IN-PROGRESS/${args.featureSlug}/audit-log.md`,
  ];
  for (const rel of candidates) {
    const absPath = resolve(args.repoRoot, rel);
    if (existsSync(absPath)) return absPath;
  }
  // Fallback to the canonical 1.0 path; the audit-log parser returns
  // an empty entry set when the file is absent.
  return resolve(
    args.repoRoot,
    'docs',
    '1.0',
    '001-IN-PROGRESS',
    args.featureSlug,
    'audit-log.md',
  );
}

/**
 * Read every catalog registry under `<repoRoot>/.dw-lifecycle/scope-discovery/`
 * and project each parsed entry into a `CatalogEntryView`. Catalogs
 * that don't exist contribute zero entries; YAML parse errors throw
 * (we don't paper over malformed catalogs).
 */
async function loadCatalogEntries(
  repoRoot: string,
): Promise<ReadonlyArray<CatalogEntryView>> {
  const entries: CatalogEntryView[] = [];
  const apPath = resolve(repoRoot, SCOPE_DISCOVERY_DIR, 'anti-patterns.yaml');
  if (existsSync(apPath)) {
    const text = await readFile(apPath, 'utf8');
    const parsed = parseAntiPatternsRegistry(text, apPath);
    for (const e of parsed.entries) {
      entries.push({
        registryPath: 'anti-patterns.yaml',
        entryId: e.id,
        status: e.status,
        provenance: e.provenance,
      });
    }
  }
  const amPath = resolve(repoRoot, SCOPE_DISCOVERY_DIR, 'adopter-manifests.yaml');
  if (existsSync(amPath)) {
    const text = await readFile(amPath, 'utf8');
    const parsed = parseAdopterManifestsRegistry(text, amPath);
    for (const e of parsed.entries) {
      entries.push({
        registryPath: 'adopter-manifests.yaml',
        entryId: e.id,
        status: e.status,
        provenance: e.provenance,
      });
    }
  }
  const clonesPath = resolve(repoRoot, SCOPE_DISCOVERY_DIR, 'clones.yaml');
  if (existsSync(clonesPath)) {
    const text = await readFile(clonesPath, 'utf8');
    const parsed = parseClonesYamlStrict(text);
    for (const group of parsed.clones) {
      entries.push({
        registryPath: 'clones.yaml',
        entryId: group.id,
        status: group.status,
        provenance: group.provenance,
      });
    }
  }
  const overrides = await loadOverridePatterns(repoRoot);
  if (overrides !== null) {
    for (const e of overrides) {
      const view: CatalogEntryView = {
        registryPath: 'pattern-matrix-patterns.yaml',
        entryId: e.id,
        status: e.status,
        provenance: e.provenance,
        patternType: e.type,
      };
      entries.push(view);
    }
  }
  return entries;
}

/**
 * Run the discovery-agent fan-out the same way `scope-inventory` does,
 * but in-process and tolerant of gate-file absence. The clone-detector
 * reader fails loud when its baseline is missing — we catch that and
 * skip silently here (an orchestrator-turn invocation shouldn't fail
 * because the operator hasn't run `check-clones --refresh-baseline`).
 *
 * The PRD-themed hunter requires a `prdPath`; when the per-feature
 * PRD is absent we skip it as well. Phase 4 config-activated agents
 * fire only when their input files exist (mirrors `scope-inventory`'s
 * `decideActivations` gate).
 */
async function collectFindings(
  repoRoot: string,
  featureSlug: string,
): Promise<ReadonlyArray<DiscoveryAgentFinding>> {
  const prdPath = resolve(
    repoRoot,
    'docs',
    '1.0',
    '001-IN-PROGRESS',
    featureSlug,
    'prd.md',
  );
  const input: DiscoveryAgentInput = {
    featureSlug,
    prdPath,
    repoRoot,
    moduleRoot: 'src',
  };
  const findings: DiscoveryAgentFinding[] = [];
  const haveAntiPatterns = existsSync(
    resolve(repoRoot, SCOPE_DISCOVERY_DIR, 'anti-patterns.yaml'),
  );
  const haveAdopterManifests = existsSync(
    resolve(repoRoot, SCOPE_DISCOVERY_DIR, 'adopter-manifests.yaml'),
  );
  // ui-route-enumerator + pattern-matrix are "always on" per scope-
  // inventory; they tolerate missing inputs by returning zero findings.
  try {
    findings.push(await enumerateUiRoutes(input));
  } catch (err) {
    // Best-effort — the orchestrator-turn should not fail on per-agent
    // errors; the agent emits an empty finding shape in the catch path
    // is impossible because the type lacks a per-agent "skipped" shape.
    // Re-throw to surface the cause (the live run will tell the operator).
    throw new Error(
      `orchestrator-turn: ui-route-enumerator failed: ${errorMessage(err)}`,
    );
  }
  try {
    findings.push(await buildPatternMatrix(input));
  } catch (err) {
    throw new Error(
      `orchestrator-turn: pattern-matrix failed: ${errorMessage(err)}`,
    );
  }
  // Clone detector reader: fails loud when baseline missing. Skip silently.
  try {
    findings.push(await readCloneDetectorOutput(input));
  } catch {
    // Intentional skip — see function docstring.
  }
  // PRD-themed hunter: requires a PRD file.
  if (existsSync(prdPath)) {
    try {
      findings.push(await huntPrdThemes(input));
    } catch (err) {
      throw new Error(
        `orchestrator-turn: prd-themed-pattern-hunter failed: ${errorMessage(err)}`,
      );
    }
  }
  // Regime-holdout-detector: gated on any of three artifact files.
  if (haveAntiPatterns || haveAdopterManifests) {
    try {
      findings.push(await detectRegimeHoldouts(input));
    } catch (err) {
      throw new Error(
        `orchestrator-turn: regime-holdout-detector failed: ${errorMessage(err)}`,
      );
    }
  }
  // Adopter-manifest-checker: gated on adopter-manifests.yaml.
  if (haveAdopterManifests) {
    try {
      findings.push(await checkAdopterManifests(input));
    } catch (err) {
      throw new Error(
        `orchestrator-turn: adopter-manifest-checker failed: ${errorMessage(err)}`,
      );
    }
  }
  return findings;
}

/**
 * Walk `docs/<v>/001-IN-PROGRESS/` directories and return the matched
 * path when a directory for `featureSlug` exists; null otherwise.
 * Implements the TF-005 feature-existence pre-flight.
 */
async function listFeatureDirsByVersion(
  repoRoot: string,
): Promise<ReadonlyArray<{ version: string; slugs: ReadonlyArray<string> }>> {
  const docsDir = resolve(repoRoot, 'docs');
  if (!existsSync(docsDir)) return [];
  const versions: Array<{ version: string; slugs: ReadonlyArray<string> }> = [];
  let topEntries: ReadonlyArray<string>;
  try {
    topEntries = await readdir(docsDir);
  } catch {
    return [];
  }
  for (const version of topEntries) {
    const inProgress = resolve(docsDir, version, '001-IN-PROGRESS');
    if (!existsSync(inProgress)) continue;
    let slugs: ReadonlyArray<string>;
    try {
      slugs = await readdir(inProgress);
    } catch {
      continue;
    }
    versions.push({ version, slugs });
  }
  return versions;
}

async function findFeatureDirectory(
  repoRoot: string,
  featureSlug: string,
): Promise<string | null> {
  const versions = await listFeatureDirsByVersion(repoRoot);
  for (const v of versions) {
    if (v.slugs.includes(featureSlug)) {
      return `docs/${v.version}/001-IN-PROGRESS/${featureSlug}`;
    }
  }
  return null;
}

async function listAvailableFeatureSlugs(
  repoRoot: string,
): Promise<ReadonlyArray<string>> {
  const versions = await listFeatureDirsByVersion(repoRoot);
  const set = new Set<string>();
  for (const v of versions) {
    for (const s of v.slugs) set.add(s);
  }
  return Array.from(set).sort();
}

/**
 * TF-006 — catalog files scope-discovery scans / synthesizes. The
 * presence count distinguishes "happy steady-state" (all files present
 * + zero findings) from "scanned NOTHING because catalog absent."
 */
const CATALOG_FILENAMES: ReadonlyArray<string> = [
  'anti-patterns.yaml',
  'adopter-manifests.yaml',
  'editor-symmetry-matrix.yaml',
  'deprecations.yaml',
  'pattern-matrix-patterns.yaml',
  'clones.yaml',
];

interface CatalogPresence {
  readonly presentCount: number;
  readonly presentNames: ReadonlyArray<string>;
  readonly totalCount: number;
}

function inspectCatalogPresence(repoRoot: string): CatalogPresence {
  const present: string[] = [];
  for (const name of CATALOG_FILENAMES) {
    const abs = resolve(repoRoot, SCOPE_DISCOVERY_DIR, name);
    if (existsSync(abs)) present.push(name);
  }
  return {
    presentCount: present.length,
    presentNames: present,
    totalCount: CATALOG_FILENAMES.length,
  };
}

function decorateSummaryWithCatalogPresence(
  summary: string,
  presence: CatalogPresence,
  priorPresentCount: number | undefined,
  verbose: boolean,
): string {
  if (presence.presentCount === 0) {
    return (
      'WARNING: no scope-discovery catalog files in ' +
      '.dw-lifecycle/scope-discovery/ — run \`dw-lifecycle install-scope-discovery\` ' +
      `first. ${summary}`
    );
  }
  if (presence.presentCount < presence.totalCount) {
    // Phase 14 Task 1 (AUDIT-20260529-12): suppress the NOTE on a
    // steady-state turn — when the count is unchanged from the prior
    // turn and the operator didn't ask for verbose. `priorPresentCount
    // === undefined` covers first-turn + legacy state files without
    // the field; both treat the NOTE as new signal.
    const countChanged =
      priorPresentCount === undefined ||
      priorPresentCount !== presence.presentCount;
    if (!countChanged && !verbose) {
      return summary;
    }
    const names = presence.presentNames.join(', ');
    return (
      `NOTE: only ${presence.presentCount}/${presence.totalCount} catalog ` +
      `files present (${names}). ${summary}`
    );
  }
  return summary;
}

/**
 * Build a `TurnInput` from disk + run the orchestrator turn.
 *
 * Exit codes:
 *   0 — success (report + nextLoopState persisted).
 *   1 — infra failure (catalog parse / discovery-agent / loop error).
 *   2 — usage error (caller guards on this before invoking; the
 *       function itself returns 1 on infra failure).
 */
export async function runOrchestratorTurnCli(
  args: OrchestratorTurnCliArgs,
): Promise<OrchestratorTurnCliResult> {
  const repoRoot = resolve(args.repoRoot);
  const now = args.now ?? new Date().toISOString();

  // TF-005 — pre-flight feature existence check. A typo'd
  // `--feature does-not-exist` previously exited 0 with all-zeros;
  // that "success" was indistinguishable from a real green run.
  if (args.allowMissingFeature !== true) {
    const matched = await findFeatureDirectory(repoRoot, args.featureSlug);
    if (matched === null) {
      const available = await listAvailableFeatureSlugs(repoRoot);
      const list = available.length > 0 ? available.join(', ') : '<none found>';
      return {
        exitCode: 2,
        errorText:
          `orchestrator-turn: feature '${args.featureSlug}' not found — ` +
          `expected directory under \`docs/<v>/001-IN-PROGRESS/${args.featureSlug}/\`. ` +
          `Available features: ${list}.`,
      };
    }
  }

  const auditLogPath = resolveAuditLogPath({
    repoRoot,
    featureSlug: args.featureSlug,
    override: args.auditLogPath,
  });

  let catalogEntries: ReadonlyArray<CatalogEntryView>;
  try {
    catalogEntries = await loadCatalogEntries(repoRoot);
  } catch (err) {
    return {
      exitCode: 1,
      errorText: errorMessage(err),
    };
  }

  let findings: ReadonlyArray<DiscoveryAgentFinding>;
  try {
    findings = await collectFindings(repoRoot, args.featureSlug);
  } catch (err) {
    return {
      exitCode: 1,
      errorText: errorMessage(err),
    };
  }

  // Pull the pattern-matrix finding (when present) into the metrics
  // gatherer so the violation-density + coverage metrics have data.
  const patternMatrix = findings.find((f) => f.agent === 'ast-grep-matrix');
  let currentMetrics;
  try {
    const computeInput = await gatherMetricsInput({
      repoRoot,
      patternMatrixFindings:
        patternMatrix !== undefined && patternMatrix.agent === 'ast-grep-matrix'
          ? patternMatrix
          : undefined,
      generatedAt: now,
    });
    currentMetrics = computeCodebaseStateMetrics(computeInput);
  } catch (err) {
    return {
      exitCode: 1,
      errorText: `orchestrator-turn: metrics gather failed: ${errorMessage(err)}`,
    };
  }

  let judgeInput: JudgeInput | undefined;
  if (args.skipJudge !== true && args.judgeInputPath !== undefined) {
    try {
      const raw = await loadJsonInputUnknown(
        args.judgeInputPath,
        '--judge-input',
      );
      if (!isJudgeInputShape(raw)) {
        return {
          exitCode: 1,
          errorText:
            `orchestrator-turn: --judge-input ${args.judgeInputPath} is ` +
            `not a JudgeInput-shaped object (need featureSlug + recentWork + ` +
            `openCandidates + catalogState)`,
        };
      }
      judgeInput = raw;
    } catch (err) {
      return {
        exitCode: 1,
        errorText: errorMessage(err),
      };
    }
  }
  let auditorInput: AuditorInput | undefined;
  if (args.skipAuditor !== true && args.auditorInputPath !== undefined) {
    try {
      const raw = await loadJsonInputUnknown(
        args.auditorInputPath,
        '--auditor-input',
      );
      if (!isAuditorInputShape(raw)) {
        return {
          exitCode: 1,
          errorText:
            `orchestrator-turn: --auditor-input ${args.auditorInputPath} is ` +
            `not an AuditorInput-shaped object (need featureSlug + recentWork ` +
            `+ judgeProposals + catalogState)`,
        };
      }
      auditorInput = raw;
    } catch (err) {
      return {
        exitCode: 1,
        errorText: errorMessage(err),
      };
    }
  }

  const turnInput: TurnInput = {
    repoRoot,
    featureSlug: args.featureSlug,
    auditLogPath,
    dispatchFn: makeNoOpDispatcher(),
    currentMetrics,
    findings,
    catalogEntries,
    ...(judgeInput !== undefined ? { judgeInput } : {}),
    ...(auditorInput !== undefined ? { auditorInput } : {}),
    now,
  };

  let rawReport: TurnReport;
  try {
    rawReport = await runOrchestratorTurn(turnInput, {
      ...(args.runtimeDirOverride !== undefined
        ? { runtimeDirOverride: args.runtimeDirOverride }
        : {}),
      skipAuditorFire: args.skipAuditor === true,
    });
  } catch (err) {
    return {
      exitCode: 1,
      errorText: `orchestrator-turn: turn execution failed: ${errorMessage(err)}`,
    };
  }

  // TF-006 — decorate the summary with catalog-presence so adopters
  // can distinguish "no findings + no catalog" from "happy steady-
  // state with full catalog." All-zeros was previously indistinguishable.
  //
  // Phase 14 Task 1 (AUDIT-20260529-12) — gate the NOTE behind a
  // count-changed check. The prior turn's `catalogPresentCount` lives
  // on `turnHistory[0]` when it exists; absent (first turn or legacy
  // state file) is treated as "different from any current count" so
  // the NOTE surfaces on first observation.
  const catalogPresence = inspectCatalogPresence(repoRoot);
  let priorPresentCount: number | undefined;
  try {
    const priorLoopState = await loadLoopState(
      repoRoot,
      args.featureSlug,
      args.runtimeDirOverride,
    );
    priorPresentCount = priorLoopState.turnHistory[0]?.catalogPresentCount;
  } catch {
    // Loop state read failure is non-fatal for the noise gate — treat as
    // "no prior count," which causes the NOTE to fire (matches the
    // pre-Phase-14 behavior). The library already loaded its own copy
    // when running the turn; any real corruption would have surfaced there.
    priorPresentCount = undefined;
  }
  const decoratedSummary = decorateSummaryWithCatalogPresence(
    rawReport.summary,
    catalogPresence,
    priorPresentCount,
    args.verbose === true,
  );
  // Stamp the current catalog count onto the new history entry so the
  // next turn can compare. The library returned nextLoopState with the
  // new entry at index 0 but without our catalog field; reconstruct.
  const stampedNextLoopState = stampCatalogPresentCount(
    rawReport.nextLoopState,
    catalogPresence.presentCount,
  );
  const report: TurnReport = {
    ...rawReport,
    summary: decoratedSummary,
    nextLoopState: stampedNextLoopState,
  };

  // Persist the new loop state. The library returns the state without
  // writing; the caller (this assembler) owns the write so a future
  // dry-run mode could discard nextLoopState without persisting.
  try {
    const cfg = await loadLoopConfig(repoRoot);
    await persistLoopState(repoRoot, args.featureSlug, report.nextLoopState, {
      ...(args.runtimeDirOverride !== undefined
        ? { runtimeDirOverride: args.runtimeDirOverride }
        : {}),
      retention: cfg.turn_history_retention,
    });
  } catch (err) {
    return {
      exitCode: 1,
      errorText: `orchestrator-turn: loop-state persist failed: ${errorMessage(err)}`,
    };
  }

  return { exitCode: 0, report };
}

function stampCatalogPresentCount(
  state: LoopState,
  count: number,
): LoopState {
  const head = state.turnHistory[0];
  if (head === undefined) return state;
  const stampedHead: TurnHistoryEntry = { ...head, catalogPresentCount: count };
  return {
    ...state,
    turnHistory: [stampedHead, ...state.turnHistory.slice(1)],
  };
}
