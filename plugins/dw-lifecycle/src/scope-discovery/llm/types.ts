/**
 * plugins/dw-lifecycle/src/scope-discovery/llm/types.ts
 *
 * Shared types for the multi-source LLM ensemble (the LLM judge + external auditor).
 *
 * Three independent surfaces:
 *
 *   1. Internal LLM-judge — runs in-band, every turn, inside
 *      `/dw-lifecycle:implement`. Reads recent work + catalog state +
 *      open candidates; emits per-decision confidence + proposed
 *      dispositions. Goes through `wrap()` so the dispatch grammar +
 *      forbidden-deferral phrases + refactor-marker prelude all apply
 *      to the judge's reasoning trail.
 *
 *   2. External LLM auditor — fire-and-forget per turn; emits an
 *      audit-request artifact under `.dw-lifecycle/scope-discovery/
 *      pending-audits/`; an operator-owned process (separate Claude
 *      instance, Anthropic API call, etc.) picks it up + writes
 *      AUDIT-<date>-<NN> entries back to the feature's audit-log.
 *
 *   3. Audit-log reader — reads new audit-log entries since a durable
 *      watermark; surfaces them at the start of each orchestrator turn
 *      so the orchestrator can react to auditor findings without the
 *      operator having to deliver them by hand.
 *
 * The three pieces are independent (per the LLM judge + external auditor PRD: "Judge-
 * vs-auditor independence — different model/prompt scaffolds; auditor
 * cannot self-grade the judge's work") so each can be tested + iterated
 * separately.
 *
 * # No casts, no any
 *
 * Confidence scores are typed as `number` with documented range
 * [0.0, 1.0]; the parser rejects out-of-range values loudly rather than
 * clamping (clamping would silently hide model-misbehavior; the v1
 * Task 5 controller wants to SEE the violations to learn from them).
 */

import type { CatalogStatus } from '../util/catalog-status.js';

/**
 * Recent-work summary handed to the judge each turn. The orchestrator
 * is responsible for assembling this — typically last-commit SHA +
 * one-line message, last sub-agent dispatch's `Searched/Included/
 * Excluded` block, and any catalog edits since the previous turn.
 *
 * The shape is intentionally minimal — the judge's prompt template
 * renders the fields into a markdown brief. Extensions go in
 * `extraContext` so callers can attach project-specific signal without
 * an interface bump.
 */
export interface RecentWorkSummary {
  /** Short commit SHA + subject of the most recent commit. */
  readonly lastCommit?: {
    readonly sha: string;
    readonly subject: string;
  };
  /** Last sub-agent dispatch's parsed Searched/Included/Excluded block. */
  readonly lastDispatch?: {
    readonly agentType: string;
    readonly searched: string;
    readonly includedCount: number;
    readonly excludedCount: number;
  };
  /** Last catalog edit (file + entry id + status delta). */
  readonly lastCatalogEdit?: {
    readonly registryPath: string;
    readonly entryId: string;
    readonly previousStatus: CatalogStatus | null;
    readonly nextStatus: CatalogStatus;
  };
  /** Free-form orchestrator-supplied extras (workplan section, etc.). */
  readonly extraContext?: ReadonlyArray<string>;
}

/**
 * Open candidate the judge inspects. The orchestrator collects these
 * from `pending`-status catalog entries + recent unmatched-shape
 * cluster surfacings + any auditor-correction follow-ups.
 */
export interface OpenCandidate {
  /** Stable id (catalog entry id or synthesis cluster id). */
  readonly id: string;
  /** Registry path the candidate came from (when known). */
  readonly registryPath?: string;
  /** One-line description (mirrors the catalog entry's `description`). */
  readonly description: string;
  /** Current status (typically `pending` for un-triaged candidates). */
  readonly currentStatus: CatalogStatus;
  /** Evidence — file paths, line refs, anything the judge can cite. */
  readonly evidence: ReadonlyArray<string>;
}

/**
 * Catalog-state summary passed to the judge. Counts let the judge
 * reason about catalog health (lots of pending → triage backlog;
 * lots of withdrawn → trust calibration shifted).
 */
export interface CatalogStateSummary {
  /** Per-status counts across the operator-curated registries. */
  readonly statusCounts: Readonly<Record<CatalogStatus, number>>;
  /** Total entries across registries (sum of statusCounts). */
  readonly totalEntries: number;
  /** Per-registry path → entry count (so the judge sees the spread). */
  readonly perRegistry?: Readonly<Record<string, number>>;
}

/**
 * Input to `runInternalJudge`. The orchestrator assembles each field
 * in-process before invoking the judge.
 */
export interface JudgeInput {
  /** The feature slug the judge is reasoning about. */
  readonly featureSlug: string;
  /** Recent-work summary (commit + dispatch + catalog-edit). */
  readonly recentWork: RecentWorkSummary;
  /** Open candidates the judge should triage. */
  readonly openCandidates: ReadonlyArray<OpenCandidate>;
  /** Catalog-state summary for context. */
  readonly catalogState: CatalogStateSummary;
  /** Optional per-call model override (defaults from config YAML). */
  readonly modelOverride?: string;
}

/**
 * One disposition proposal the judge produced. The judge ranks these
 * by confidence; the orchestrator/controller decides the threshold for
 * auto-disposition vs escalation.
 */
export interface JudgeDispositionProposal {
  /** Candidate id this proposal addresses. */
  readonly candidateId: string;
  /** Proposed status transition (blessed | cursed | ignore | ...). */
  readonly proposedStatus: CatalogStatus;
  /** Confidence in [0.0, 1.0]. */
  readonly confidence: number;
  /** One-paragraph reasoning the operator can audit. */
  readonly reasoning: string;
}

/**
 * Result of `runInternalJudge`. Wraps proposals + the model + the
 * `wrap()`-parsed dispatch return so callers can drill into the
 * judge's `Searched/Included/Excluded` block if needed.
 */
export interface JudgeResult {
  /** Model identifier the judge used (resolved from config + override). */
  readonly model: string;
  /** Ranked proposals (highest-confidence first). */
  readonly proposals: ReadonlyArray<JudgeDispositionProposal>;
  /** The judge's free-form narrative (for the audit-log evidence link). */
  readonly narrative: string;
}

/**
 * Input to `fireExternalAudit`. Fire-and-forget: the auditor is not
 * synchronous; the orchestrator emits an audit-request artifact and
 * reads results next turn via the audit-log reader.
 */
export interface AuditorInput {
  /** Feature slug under audit. */
  readonly featureSlug: string;
  /** Recent-work summary (same shape as the judge's). */
  readonly recentWork: RecentWorkSummary;
  /** What the judge proposed this turn (so the auditor can dispute). */
  readonly judgeProposals: ReadonlyArray<JudgeDispositionProposal>;
  /** Catalog-state summary. */
  readonly catalogState: CatalogStateSummary;
  /** Optional per-call model override (defaults from config YAML). */
  readonly modelOverride?: string;
}

/**
 * Audit-log entry shape returned by the reader. Mirrors the markdown
 * audit-log convention (AUDIT-<date>-<NN> entries with `Finding-ID`,
 * `Status`, `Severity`, `Surface`).
 *
 * the LLM judge + external auditor extension: an `Affects:` field links the entry to
 * specific catalog entries (Task 10 carries the bidirectional shape
 * proper; this type carries the field so the reader surfaces it).
 *
 * `Provenance:` is also a the LLM judge + external auditor addition — names the LLM
 * auditor (or operator) that produced the entry so the orchestrator
 * can distinguish auditor-driven findings from operator-authored ones.
 */
export interface AuditLogEntry {
  /** Finding-ID — e.g. `AUDIT-20260526-03`. */
  readonly findingId: string;
  /** Status string from the entry (e.g. `open`, `fixed-<sha>`). */
  readonly status: string;
  /** Severity (`blocking | high | medium | low | informational`). */
  readonly severity?: string;
  /** Surface — the affected file/path/section as a free-form string. */
  readonly surface?: string;
  /** Human-readable heading (the `### ...` line). */
  readonly heading: string;
  /** Catalog entries this finding affects (parsed `Affects:` field). */
  readonly affects?: ReadonlyArray<string>;
  /** Provenance — who/what produced the entry. */
  readonly provenance?: string;
  /** Raw markdown body of the entry (best-effort capture). */
  readonly body: string;
}

/**
 * Result of `readAuditLogUpdates`.
 */
export interface AuditLogReadResult {
  /** Entries discovered since the watermark. */
  readonly entries: ReadonlyArray<AuditLogEntry>;
  /** The new watermark caller should persist for next turn. */
  readonly watermark: string;
}

/**
 * Configuration shape loaded from
 * `.dw-lifecycle/scope-discovery/llm-judge.yaml`. Both `judge` and
 * `auditor` sections are required when the YAML exists; defaults are
 * supplied by `loadLlmConfig` when the file is absent.
 */
export interface LlmConfig {
  readonly judge: {
    readonly model: string;
    readonly agentType: string;
    readonly confidenceFloor: number;
  };
  readonly auditor: {
    readonly model: string;
    readonly pendingAuditsDir: string;
  };
  readonly orchestratorRuntimeDir: string;
}
