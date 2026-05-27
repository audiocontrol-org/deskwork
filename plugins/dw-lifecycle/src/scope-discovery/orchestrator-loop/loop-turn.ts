/**
 * plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/loop-turn.ts
 *
 * Phase 11 Task 6 — The autonomous per-turn audit/judge stack.
 *
 * `runOrchestratorTurn` is the entry point the implement-skill's
 * orchestrator-agent invokes once per task boundary. It composes the
 * Phase-11 Tasks 2-11 libraries into a deterministic per-turn cycle:
 *
 *   1. Read audit-log updates since the prior watermark (Task 7).
 *   2. Detect wrong-decisions; emit reversal proposals (Task 8).
 *   3. Run internal LLM-judge pass on recent work (Task 7).
 *   4. Cluster recent findings into architectural summaries (Task 3).
 *   5. Apply controller decision for the NEXT turn (Task 5).
 *   6. Pass codebase-state metrics through (Task 4).
 *   7. Fire external auditor (Task 7); receive artifact path.
 *   8. Build escalation visibility surface (Task 9).
 *   9. Advance + emit the new loop state (caller persists).
 *
 * The function is composition over the dependent libraries; no new
 * business logic. Every sub-call has its own tests in the package
 * suite; this module's end-to-end test (`loop-turn.test.ts`) verifies
 * the composition wiring.
 *
 * # I/O surface
 *
 * - READ: audit-log markdown, loop-state JSON, controller-state JSON,
 *   trust-calibration JSON, llm-config YAML, controller-config YAML.
 * - WRITE: audit-request artifact (when auditor fires), controller-
 *   state JSON (when caller persists), loop-state JSON (caller).
 *
 * The function DOES persist controller state on its own (the controller
 * is the most-frequently-updated component; co-locating its persist
 * with this loop keeps the cross-turn invariants intact). Loop-state
 * persistence is the caller's responsibility — the orchestrator-agent
 * inspects `TurnReport.nextLoopState` and writes via `persistLoopState`
 * after committing whatever in-process actions the report justified.
 */

import { parseAuditLogFile } from '../util/audit-log-parser.js';
import {
  loadAuditWatermark,
  persistAuditWatermark,
} from '../llm/audit-log-reader.js';
import { fireExternalAudit } from '../llm/auditor.js';
import { runInternalJudge } from '../llm/judge.js';
import { loadLlmConfig } from '../llm/config.js';
import {
  buildReversalProposals,
} from '../recovery/reverse-disposition.js';
import {
  detectWrongDecisions,
  filterByWatermark,
} from '../recovery/detect-wrong-decisions.js';
import { mediate } from '../mediation/mediation.js';
import {
  loadControllerState,
  persistControllerState,
} from '../controller/controller-state.js';
import { runController } from '../controller/controller.js';
import { loadControllerConfig } from '../controller/controller-config.js';
import {
  buildEscalationVisibility,
} from '../escalation/escalation-visibility.js';
import type {
  ControllerHistoryEntry,
  MetricsSnapshot,
  RecentAuditEntry,
} from '../controller/controller-types.js';
import type { CodebaseStateMetrics } from '../discovery-agents/codebase-state-metrics-types.js';
import type {
  AuditLogEntry,
  JudgeResult,
} from '../llm/types.js';
import type {
  ParsedAuditEntry,
  ParsedAuditLog,
} from '../util/audit-log-parser.js';
import type {
  LoopState,
  OrchestratorLoopOptions,
  TurnHistoryEntry,
  TurnInput,
  TurnReport,
} from './loop-types.js';
import {
  advanceLoopState,
  generateTurnId,
  loadLoopState,
} from './loop-state.js';

/**
 * Project a Phase 11 Task 4 `CodebaseStateMetrics` block into the
 * scalar `MetricsSnapshot` the controller consumes. The controller's
 * shape is intentionally narrower than the full metrics block (per
 * `controller-types.ts` JSDoc — the controller projects to compact
 * scalars so history entries stay small).
 *
 * Field mapping (left → right):
 *
 *   classification_completeness.ratio → classification_completeness
 *   average(coverage_per_blessed_pattern.ratio) → average_coverage
 *   sum(violation_density_per_cursed_pattern.total_hits) → violation_density
 *   average(surface_uniformity.variance) → average_surface_variance
 *   catalog_stability.edits_per_commit_avg → catalog_edit_rate
 *   discovered_candidate_rate.pending_entries_total → pending_count
 *   disposition_latency.median_latency_ms → median_disposition_latency_ms
 *
 * When the source array is empty the projection yields 0 (the
 * "no signal" case is documented on the controller side).
 */
export function projectMetricsSnapshot(
  metrics: CodebaseStateMetrics,
): MetricsSnapshot {
  const coverages = metrics.coverage_per_blessed_pattern;
  const averageCoverage =
    coverages.length === 0
      ? 0
      : coverages.reduce((sum, c) => sum + c.ratio, 0) / coverages.length;
  const violations = metrics.violation_density_per_cursed_pattern;
  const violationDensity = violations.reduce(
    (sum, v) => sum + v.total_hits,
    0,
  );
  const surfaces = metrics.surface_uniformity;
  const averageSurfaceVariance =
    surfaces.length === 0
      ? 0
      : surfaces.reduce((sum, s) => sum + s.variance, 0) / surfaces.length;
  return {
    classification_completeness:
      metrics.classification_completeness.ratio,
    average_coverage: averageCoverage,
    violation_density: violationDensity,
    average_surface_variance: averageSurfaceVariance,
    catalog_edit_rate: metrics.catalog_stability.edits_per_commit_avg,
    pending_count: metrics.discovered_candidate_rate.pending_entries_total,
    median_disposition_latency_ms:
      metrics.disposition_latency.median_latency_ms,
  };
}

/**
 * Project an audit-log-reader entry into the controller's
 * `RecentAuditEntry` shape. The controller's signal computation
 * counts entries whose `context` matches `^audit-finding-` as
 * auditor-driven, so we surface the same field name.
 *
 * The audit-log entry has no `context` field of its own; it does
 * carry a `provenance` string ("external-auditor (claude-opus-4)").
 * The controller treats both the provenance + the context as
 * auditor-correction signals; we forward both so the controller's
 * own filtering applies uniformly.
 */
function projectAuditEntryForController(
  entry: AuditLogEntry,
): RecentAuditEntry {
  return {
    findingId: entry.findingId,
    provenance: entry.provenance,
    // The controller treats `context` as the canonical signal field;
    // for entries that lack an explicit `context:` line we project
    // the Finding-ID into the audit-finding-<id> shape so the
    // controller's regex match (`^audit-finding-`) still fires when
    // the orchestrator's own catalog edits cite the finding back.
    context: `audit-finding-${entry.findingId}`,
  };
}

/**
 * Convert the reader's `AuditLogEntry[]` to the recovery library's
 * `ParsedAuditLog` shape. The two surfaces converged on different
 * type names during Phase 11's development; this projection keeps
 * the loop wiring honest without forcing a refactor of either
 * library.
 */
function toParsedAuditLog(
  entries: ReadonlyArray<AuditLogEntry>,
  sourcePath: string,
): ParsedAuditLog {
  const parsedEntries: ParsedAuditEntry[] = entries.map((e, idx) => ({
    findingId: e.findingId,
    status: e.status,
    severity: e.severity,
    surface: e.surface,
    heading: e.heading,
    affects: e.affects ?? [],
    provenance: e.provenance,
    lineNumber: idx + 1,
    body: e.body,
  }));
  return { sourcePath, entries: parsedEntries };
}

/**
 * Read the audit-log + watermark; return new entries + the new
 * watermark. Pure-ish (it reads two files); no side effects on disk
 * yet. The caller persists watermark via `persistAuditWatermark`
 * after committing whatever in-process actions the audit drove.
 *
 * Per `audit-log-reader.ts`'s API, the reader compares each entry's
 * Finding-ID against the watermark; entries strictly greater than the
 * watermark surface as new.
 */
async function readAuditUpdate(
  input: TurnInput,
  loopState: LoopState,
  options: OrchestratorLoopOptions,
): Promise<{
  readonly entries: ReadonlyArray<AuditLogEntry>;
  readonly priorWatermark: string;
  readonly newWatermark: string;
  readonly parsedAuditLog: ParsedAuditLog;
}> {
  // Use the loop-state watermark when the audit-log-reader's own
  // watermark file is absent (first-run). The loop-state watermark
  // is the cross-turn coordinator; the reader's watermark file is
  // owned by the reader. We prefer the loop-state version because
  // the loop is the source of truth for "what was the last turn's
  // observation point".
  const readerWatermark = await loadAuditWatermark(input.repoRoot);
  const priorWatermark =
    loopState.lastAuditWatermark.length > 0
      ? loopState.lastAuditWatermark
      : readerWatermark;

  // Allow tests to inject a parsed audit log directly without
  // reading the on-disk file. The override path skips fs entirely.
  let parsed: ParsedAuditLog;
  if (options.parsedAuditLogOverride !== undefined) {
    parsed = options.parsedAuditLogOverride;
  } else {
    parsed = await parseAuditLogFile(input.auditLogPath);
  }

  // Project the parsed log to the reader's `AuditLogEntry` shape so
  // the rest of the orchestrator (judge, controller, audit-log
  // surfacing) sees a uniform type. Filter to entries strictly
  // greater than the prior watermark.
  const newEntries: AuditLogEntry[] = [];
  let newWatermark = priorWatermark;
  for (const e of parsed.entries) {
    if (e.findingId > priorWatermark) {
      newEntries.push({
        findingId: e.findingId,
        status: e.status,
        severity: e.severity,
        surface: e.surface,
        heading: e.heading,
        affects: e.affects,
        provenance: e.provenance,
        body: e.body,
      });
      if (e.findingId > newWatermark) newWatermark = e.findingId;
    }
  }
  return {
    entries: newEntries,
    priorWatermark,
    newWatermark,
    parsedAuditLog: parsed,
  };
}

/**
 * Build a one-sentence summary of the turn. Used as
 * `TurnReport.summary`; the orchestrator-agent can include it in
 * its per-task report without re-deriving from the structured
 * fields.
 */
function buildSummary(report: {
  readonly newAuditEntries: number;
  readonly wrongDecisions: number;
  readonly mediationClusters: number;
  readonly judgeRan: boolean;
  readonly auditorFired: boolean;
  readonly escalations: number;
}): string {
  const parts: string[] = [
    `${report.newAuditEntries} new audit entr${report.newAuditEntries === 1 ? 'y' : 'ies'}`,
    `${report.wrongDecisions} wrong-decision${report.wrongDecisions === 1 ? '' : 's'}`,
    `${report.mediationClusters} mediation cluster${report.mediationClusters === 1 ? '' : 's'}`,
  ];
  parts.push(report.judgeRan ? 'judge ran' : 'judge skipped');
  parts.push(report.auditorFired ? 'auditor fired' : 'auditor skipped');
  parts.push(
    `${report.escalations} escalation${report.escalations === 1 ? '' : 's'} queued`,
  );
  return parts.join('; ');
}

/**
 * Run one orchestrator turn end-to-end. Composes the Phase 11
 * libraries; produces a structured `TurnReport` + the updated
 * `LoopState`.
 *
 * Persistence semantics:
 *
 *   - Controller state — PERSISTED inside this function. The
 *     controller's history-ring is updated every turn and the
 *     dependent libraries (next turn's drift signal computation)
 *     require the durable record. Hiding the persist behind the
 *     pure-compute `runController` call would force every caller
 *     to re-implement the persist; we do it once here.
 *
 *   - Audit-log watermark — PERSISTED inside this function so the
 *     next turn picks up where we left off. The reader's watermark
 *     file is its own contract; we keep it in sync with the
 *     loop-state.
 *
 *   - Loop state — RETURNED in `TurnReport.nextLoopState`. The
 *     caller persists via `persistLoopState` after committing the
 *     in-process actions justified by the report. Decoupling the
 *     persist lets the caller batch loop-state writes (e.g., only
 *     persist after the orchestrator confirms it'll commit the
 *     proposed catalog edits; otherwise discard and re-run the
 *     turn on the next invocation).
 */
export async function runOrchestratorTurn(
  input: TurnInput,
  options: OrchestratorLoopOptions = {},
): Promise<TurnReport> {
  const effectiveLoopState: LoopState =
    options.loopStateOverride !== undefined
      ? options.loopStateOverride
      : await loadLoopState(input.repoRoot, options.runtimeDirOverride);

  // STEP 1 — Read audit-log updates since the prior watermark.
  const audit = await readAuditUpdate(input, effectiveLoopState, options);

  // STEP 2 — Detect wrong-decisions; build reversal proposals.
  const allWrongDecisions = detectWrongDecisions({
    auditLog: audit.parsedAuditLog,
    catalogEntries: input.catalogEntries,
    detectedAt: input.now,
  });
  const newWrongDecisions = filterByWatermark(
    allWrongDecisions,
    audit.priorWatermark,
  );
  const reversalProposals = buildReversalProposals(
    newWrongDecisions,
    input.now,
  );

  // STEP 3 — Internal LLM-judge pass (when caller supplied input).
  let judgeResult: JudgeResult | undefined;
  if (input.judgeInput !== undefined) {
    judgeResult = await runInternalJudge(input.judgeInput, {
      dispatchFn: input.dispatchFn,
      repoRoot: input.repoRoot,
    });
  }

  // STEP 4 — Mediate findings → clusters + architectural summaries.
  const mediation = mediate({ findings: input.findings });

  // STEP 5 — Controller decision for the NEXT turn.
  const controllerConfig = await loadControllerConfig(input.repoRoot);
  const controllerHistory = await loadControllerState(
    input.repoRoot,
    options.runtimeDirOverride,
  );
  const metricsSnapshot = projectMetricsSnapshot(input.currentMetrics);
  const recentAuditEntries: ReadonlyArray<RecentAuditEntry> =
    audit.entries.map(projectAuditEntryForController);
  const controllerDecision = runController({
    currentMetrics: metricsSnapshot,
    history: controllerHistory,
    auditEntries: recentAuditEntries,
    config: controllerConfig,
    decidedAt: input.now,
  });
  // Prepend the new entry; persistControllerState truncates the tail.
  const newControllerEntry: ControllerHistoryEntry = {
    decision: controllerDecision,
    metrics_snapshot: metricsSnapshot,
  };
  await persistControllerState(
    input.repoRoot,
    [newControllerEntry, ...controllerHistory],
    options.runtimeDirOverride,
  );

  // STEP 6 — Fire external auditor (Task 7) unless suppressed.
  let auditorArtifactPath: string | undefined;
  if (
    input.auditorInput !== undefined &&
    options.skipAuditorFire !== true
  ) {
    auditorArtifactPath = await fireExternalAudit(input.auditorInput, {
      repoRoot: input.repoRoot,
    });
  }

  // STEP 7 — Build escalation visibility surface.
  const escalationVisibility = await buildEscalationVisibility({
    repoRoot: input.repoRoot,
    runtimeDirOverride: options.runtimeDirOverride,
  });

  // STEP 8 — Advance loop state + persist watermark.
  await persistAuditWatermark(input.repoRoot, audit.newWatermark);
  const turnId = generateTurnId(new Date(input.now));
  const historyEntry: TurnHistoryEntry = {
    turnId,
    turnAt: input.now,
    newAuditEntries: audit.entries.length,
    wrongDecisionEvents: newWrongDecisions.length,
    catalogEditProposals: reversalProposals.length,
    escalationsQueued: escalationVisibility.count,
    judgeRan: judgeResult !== undefined,
    auditorFired: auditorArtifactPath !== undefined,
  };
  const nextLoopState = advanceLoopState(effectiveLoopState, {
    turnId,
    newWatermark: audit.newWatermark,
    history: historyEntry,
    persistedAt: input.now,
  });

  const summary = buildSummary({
    newAuditEntries: audit.entries.length,
    wrongDecisions: newWrongDecisions.length,
    mediationClusters: mediation.clusters.length,
    judgeRan: judgeResult !== undefined,
    auditorFired: auditorArtifactPath !== undefined,
    escalations: escalationVisibility.count,
  });

  const report: TurnReport = {
    turnId,
    turnAt: input.now,
    auditRead: {
      newEntryCount: audit.entries.length,
      priorWatermark: audit.priorWatermark,
      newWatermark: audit.newWatermark,
    },
    wrongDecisions: newWrongDecisions,
    reversalProposals,
    mediationClusters: mediation.clusters,
    mediationSummaries: mediation.summaries,
    controllerDecision,
    escalationVisibility,
    metrics: input.currentMetrics,
    nextLoopState,
    summary,
    ...(judgeResult !== undefined ? { judgeResult } : {}),
    ...(auditorArtifactPath !== undefined ? { auditorArtifactPath } : {}),
  };
  return report;
}

/**
 * Re-export the loop's helper to load + render a human summary of the
 * current loop state at session-start. The orchestrator-agent's
 * implement skill calls this to surface "where the loop left off"
 * before kicking off the next per-task cycle.
 */
export {
  EMPTY_LOOP_STATE,
  generateTurnId,
  loadLoopState,
  advanceLoopState,
} from './loop-state.js';

/**
 * Re-export the LLM config helper so callers building a `TurnInput`
 * can resolve the orchestrator-runtime dir without importing through
 * the llm module directly. Kept as a convenience; the loop is the
 * orchestrator's natural entry point.
 */
export { loadLlmConfig };
