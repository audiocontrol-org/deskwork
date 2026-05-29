/**
 * plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/loop-types.ts
 *
 * Type contracts for the autonomous per-turn audit/
 * judge stack inside `/dw-lifecycle:implement`.
 *
 * The orchestrator loop is PURE COMPOSITION of the libraries shipped
 * in the orchestrator loop Tasks 2–11:
 *
 *   - Task 7: `llm/audit-log-reader.ts` (audit-log read since watermark)
 *   - Task 8: `recovery/*.ts` (detect + reverse + calibrate + classify)
 *   - Task 7: `llm/judge.ts` (internal LLM-judge pass)
 *   - Task 3: `mediation/mediation.ts` (cluster + propose catalog edits)
 *   - Task 5: `controller/controller.ts` (cadence/intensity adjustment)
 *   - Task 4: `discovery-agents/codebase-state-metrics.ts` (metrics
 *     computation; we project a `MetricsSnapshot` for the controller)
 *   - Task 7: `llm/auditor.ts` (external auditor fire-and-forget)
 *   - Task 9: `escalation/escalation-visibility.ts` (queued summary)
 *
 * No new business logic. The orchestrator-agent reading the implement
 * SKILL.md invokes `runOrchestratorTurn`; the function wires the
 * pieces above into a deterministic per-turn cycle and emits a
 * structured `TurnReport`.
 *
 * # No casts, no any
 *
 * Every field is required on its parent unless explicitly marked
 * optional via `?`. Optional fields carry documented null/undefined
 * semantics in their JSDoc.
 */

import type { DispatchFn } from '../dispatch-wrapper.js';
import type { CatalogEntryView } from '../recovery/detect-wrong-decisions.js';
import type {
  CatalogEditProposal,
  WrongDecisionEvent,
} from '../recovery/recovery-types.js';
import type { ControllerDecision } from '../controller/controller-types.js';
import type { JudgeResult } from '../llm/types.js';
import type { ParsedAuditLog } from '../util/audit-log-parser.js';
import type { JudgeInput } from '../llm/types.js';
import type { AuditorInput } from '../llm/types.js';
import type { DiscoveryAgentFinding } from '../discovery-agents/types.js';
import type { CodebaseStateMetrics } from '../discovery-agents/codebase-state-metrics-types.js';
import type { EscalationVisibility } from '../escalation/escalation-visibility.js';
import type {
  ArchitecturalSummary,
  Candidate,
} from '../mediation/mediation-types.js';

/**
 * Per-turn input the orchestrator-agent assembles before invoking
 * `runOrchestratorTurn`. Every field corresponds to one of the
 * the orchestrator loop library inputs; the function does NOT touch disk to
 * gather them (except for the durable loop-state + audit-log read,
 * which are by-design I/O concerns of the loop itself).
 *
 *   - `repoRoot` — repo absolute path; resolves runtime + config paths.
 *   - `featureSlug` — the feature the turn is targeting; threads into
 *     the judge + auditor inputs.
 *   - `auditLogPath` — absolute path to the feature's `audit-log.md`.
 *     When absent on disk (fresh feature), the reader returns no
 *     entries; the turn still proceeds.
 *   - `dispatchFn` — orchestrator's dispatch callback; routed through
 *     `wrap()` by the judge.
 *   - `currentMetrics` — fresh `CodebaseStateMetrics` from the orchestrator loop
 *     Task 4. The function projects to `MetricsSnapshot` for the
 *     controller.
 *   - `findings` — recent `DiscoveryAgentFinding`s (typically since
 *     the prior turn). Fed into mediation for clustering + edit
 *     proposal.
 *   - `catalogEntries` — view over every catalog entry under recovery
 *     consideration. Drives wrong-decision detection.
 *   - `judgeInput` — fully-assembled judge brief. Optional — when
 *     omitted the turn skips the judge pass (e.g., the controller's
 *     prior decision had frequency < some threshold and the agent
 *     elected to skip).
 *   - `auditorInput` — fully-assembled auditor brief. Optional under
 *     the same skip-conditions.
 *   - `now` — ISO-8601 timestamp; threaded into every sub-call so a
 *     single turn reports one consistent moment.
 */
export interface TurnInput {
  readonly repoRoot: string;
  readonly featureSlug: string;
  readonly auditLogPath: string;
  readonly dispatchFn: DispatchFn;
  readonly currentMetrics: CodebaseStateMetrics;
  readonly findings: ReadonlyArray<DiscoveryAgentFinding>;
  readonly catalogEntries: ReadonlyArray<CatalogEntryView>;
  readonly judgeInput?: JudgeInput;
  readonly auditorInput?: AuditorInput;
  readonly now: string;
}

/**
 * Snapshot of the durable orchestrator-loop state persisted at
 * `<runtimeDir>/loop-state.json`. Carries the audit-log watermark
 * + last-turn-id + accumulated turn-history so the loop is resumable
 * across `/dw-lifecycle:implement` invocations.
 *
 *   - `version` — schema version (currently 1).
 *   - `lastAuditWatermark` — string id of the highest-numbered
 *     audit-log Finding-ID seen on prior turns. Empty on first run.
 *   - `lastTurnId` — id of the most recent turn (empty on first run).
 *   - `turnHistory` — bounded ring buffer of turn metadata; the
 *     loop keeps just enough to display in per-turn reports + drive
 *     controller history-window operations. Newest-first.
 *   - `persistedAt` — ISO-8601 timestamp the state was last written.
 *
 * The controller's own history persists separately in
 * `controller-state.json` (per the self-correcting controller); the loop does NOT
 * duplicate it. `turnHistory` records turn-level metadata only.
 */
export interface LoopState {
  readonly version: 1;
  readonly lastAuditWatermark: string;
  readonly lastTurnId: string;
  readonly turnHistory: ReadonlyArray<TurnHistoryEntry>;
  readonly persistedAt: string;
}

/**
 * One entry in the loop's `turnHistory` ring buffer. Carries the
 * turn id + outcome summary; the orchestrator surfaces these in
 * per-turn reports without re-reading audit-log / controller state.
 */
export interface TurnHistoryEntry {
  /** Unique turn id (timestamp + hex suffix, monotonically sortable). */
  readonly turnId: string;
  /** ISO-8601 timestamp the turn completed at. */
  readonly turnAt: string;
  /** Count of new audit-log entries the turn ingested. */
  readonly newAuditEntries: number;
  /** Count of wrong-decision events the turn detected. */
  readonly wrongDecisionEvents: number;
  /** Count of catalog-edit proposals the turn emitted. */
  readonly catalogEditProposals: number;
  /** Count of escalations the turn queued (Task 9 surface). */
  readonly escalationsQueued: number;
  /** Whether the judge pass ran this turn. */
  readonly judgeRan: boolean;
  /** Whether the external auditor was fired this turn. */
  readonly auditorFired: boolean;
}

/**
 * The structured per-turn report the orchestrator surfaces in its
 * implement-skill per-task report. Composed of the outputs from
 * every wired library; the renderer-side prose is a separate concern
 * (the orchestrator-agent reads this and produces operator-facing
 * markdown).
 *
 * Every field is REQUIRED unless explicitly marked optional. Optional
 * fields are absent when the corresponding library was not invoked
 * (e.g., `judgeResult` is undefined when `TurnInput.judgeInput` was
 * omitted).
 */
export interface TurnReport {
  /** Stable turn id (timestamp + hex suffix). */
  readonly turnId: string;
  /** ISO-8601 timestamp the turn ran at. */
  readonly turnAt: string;
  /** Audit-log read summary (new entries + new watermark). */
  readonly auditRead: {
    readonly newEntryCount: number;
    readonly priorWatermark: string;
    readonly newWatermark: string;
  };
  /** Wrong-decisions detected this turn (subset since prior watermark). */
  readonly wrongDecisions: ReadonlyArray<WrongDecisionEvent>;
  /**
   * Reversal proposals the recovery library emitted for the
   * wrong-decisions. Pure proposals — the orchestrator-agent commits
   * the edits.
   */
  readonly reversalProposals: ReadonlyArray<CatalogEditProposal>;
  /**
   * Judge result (when the judge pass ran). The orchestrator
   * inspects `proposals` to decide which to auto-apply vs escalate;
   * the controller's `intensity` value gates that decision.
   */
  readonly judgeResult?: JudgeResult;
  /**
   * Mediation clusters (architectural view) emitted from the
   * recent findings. PHASE 1 output — operator-readable summaries
   * the orchestrator can surface as a discovered_candidates block.
   */
  readonly mediationClusters: ReadonlyArray<Candidate>;
  readonly mediationSummaries: ReadonlyArray<ArchitecturalSummary>;
  /** Controller decision for the NEXT turn (frequency/intensity/threshold). */
  readonly controllerDecision: ControllerDecision;
  /** Audit-request artifact path when the auditor fired (else undefined). */
  readonly auditorArtifactPath?: string;
  /** Escalation visibility surface (queued count + rows). */
  readonly escalationVisibility: EscalationVisibility;
  /** Codebase-state metrics passed through (so callers don't re-compute). */
  readonly metrics: CodebaseStateMetrics;
  /** Updated loop state (caller is responsible for persisting). */
  readonly nextLoopState: LoopState;
  /**
   * Free-form summary string the orchestrator can include verbatim
   * in its per-task report. The renderer is a separate library; this
   * field carries a single-sentence digest the agent can use without
   * computing it itself.
   */
  readonly summary: string;
}

/**
 * Audit-log entry projection narrowed for the controller's recent-
 * entry signal. The loop projects `AuditLogEntry`s into this shape
 * before handing them to `runController` (the controller's
 * `RecentAuditEntry` type is a tighter shape than the full reader
 * output).
 */
export interface OrchestratorLoopOptions {
  /**
   * Override the orchestrator-runtime dir (repo-relative). Default
   * resolves via `loadLlmConfig`.
   */
  readonly runtimeDirOverride?: string;
  /**
   * Override the loaded `LoopState`. Test entry point — production
   * call sites pass `undefined` so the function loads via
   * `loadLoopState`.
   */
  readonly loopStateOverride?: LoopState;
  /**
   * Suppress firing the external auditor. Default `false`. The
   * orchestrator-agent uses this when running in a dry-run mode
   * (e.g., `/dw-lifecycle:implement --no-audit`); production turns
   * fire by default.
   */
  readonly skipAuditorFire?: boolean;
  /**
   * Override the parsed audit-log. Test entry point — production
   * call sites omit this so the loop reads the file via
   * `readAuditLogFile`.
   */
  readonly parsedAuditLogOverride?: ParsedAuditLog;
}

/**
 * Loader-friendly config controlling per-turn behavior tunables. All
 * fields have documented defaults in `loop-config.ts`'s
 * `DEFAULT_LOOP_CONFIG`.
 */
export interface LoopConfig {
  /**
   * Maximum number of `turnHistory` entries persisted in
   * `loop-state.json`. Older entries are dropped from the tail.
   */
  readonly turn_history_retention: number;
  /**
   * Confidence-floor for auto-applying judge proposals. Proposals
   * with confidence BELOW this threshold are surfaced via the
   * escalation visibility surface; ABOVE-or-equal proposals are
   * auto-applied. The controller's `escalationThreshold` may
   * override this on a per-turn basis.
   */
  readonly auto_apply_confidence_floor: number;
}
