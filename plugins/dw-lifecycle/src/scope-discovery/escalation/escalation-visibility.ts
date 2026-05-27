/**
 * plugins/dw-lifecycle/src/scope-discovery/escalation/escalation-visibility.ts
 *
 * Phase 11 Task 9 — Visibility surface for the orchestrator's per-turn
 * report.
 *
 * The orchestrator's per-turn report (built by Phase 11 Task 6 wiring)
 * includes:
 *
 *   (a) actions taken silently (count + brief summary),
 *   (b) escalations queued (with quick-link to the pending-decision artifact),
 *   (c) controller adjustments made.
 *
 * This module owns (b). The shape `EscalationVisibility` is the
 * structured signal the orchestrator embeds in its report; the
 * renderer `renderEscalationVisibility` produces a markdown block
 * the operator can scan.
 *
 * No I/O: the visibility module takes the already-read pending list
 * (from `readPendingEscalations`) + the absolute pending dir so it
 * can emit quick-links the operator can click in their editor.
 */

import { resolve } from 'node:path';
import { loadLlmConfig } from '../llm/config.js';
import {
  PENDING_ESCALATIONS_SUBDIR,
  type EscalationRequest,
} from './escalation-types.js';
import { readPendingEscalations } from './escalation-queue.js';

/**
 * One line of the visibility surface — the operator sees the
 * escalation's id, a quick description, a relative path quick-link,
 * and the queued-at timestamp.
 */
export interface EscalationVisibilityRow {
  readonly id: string;
  readonly queuedAt: string;
  readonly actionProposed: string;
  readonly question: string;
  /** Path the operator can open. Absolute when `useAbsolutePaths` is set; repo-relative by default. */
  readonly quickLink: string;
}

/**
 * Structured visibility surface — the count + the rows. The
 * orchestrator's per-turn report embeds this verbatim.
 */
export interface EscalationVisibility {
  readonly count: number;
  readonly rows: ReadonlyArray<EscalationVisibilityRow>;
}

export interface BuildVisibilityOptions {
  /** Repo root the pending-escalations dir resolves against. */
  readonly repoRoot: string;
  /**
   * Override the orchestrator-runtime dir (repo-relative). When
   * omitted the library loads `llm-judge.yaml` via `loadLlmConfig`.
   */
  readonly runtimeDirOverride?: string;
  /**
   * Emit absolute quick-link paths. Default: false (repo-relative
   * paths the operator's editor can resolve against the workspace
   * root).
   */
  readonly useAbsolutePaths?: boolean;
  /**
   * Override the pre-read pending list. When supplied, the function
   * does NOT re-read from disk — useful for callers that have
   * already loaded the list and want to format it.
   */
  readonly pendingOverride?: ReadonlyArray<EscalationRequest>;
}

/**
 * Build the visibility structure. When `pendingOverride` is supplied
 * the function does NOT read from disk; otherwise it dispatches
 * `readPendingEscalations` and shapes the result.
 */
export async function buildEscalationVisibility(
  options: BuildVisibilityOptions,
): Promise<EscalationVisibility> {
  const pending =
    options.pendingOverride ??
    (await readPendingEscalations({
      repoRoot: options.repoRoot,
      runtimeDirOverride: options.runtimeDirOverride,
    }));
  const runtimeDir = await resolveRuntimeDirRepoRelative(
    options.repoRoot,
    options.runtimeDirOverride,
  );
  const rows: EscalationVisibilityRow[] = pending.map((req) =>
    rowFor(req, runtimeDir, options),
  );
  return { count: rows.length, rows };
}

async function resolveRuntimeDirRepoRelative(
  repoRoot: string,
  override: string | undefined,
): Promise<string> {
  if (override !== undefined) return override;
  const llmConfig = await loadLlmConfig(repoRoot);
  return llmConfig.orchestratorRuntimeDir;
}

function rowFor(
  req: EscalationRequest,
  runtimeDirRepoRelative: string,
  options: BuildVisibilityOptions,
): EscalationVisibilityRow {
  const relPath = [
    runtimeDirRepoRelative,
    PENDING_ESCALATIONS_SUBDIR,
    `${req.id}.json`,
  ].join('/');
  const quickLink =
    options.useAbsolutePaths === true
      ? resolve(options.repoRoot, relPath)
      : relPath;
  return {
    id: req.id,
    queuedAt: req.queuedAt,
    actionProposed: req.actionProposed,
    question: req.question,
    quickLink,
  };
}

/**
 * Render a visibility surface as a markdown block suitable for the
 * orchestrator's per-turn report.
 *
 * When `count === 0` returns a single-line "no escalations queued"
 * acknowledgment. The orchestrator's report still surfaces this
 * (rather than suppressing the block entirely) so the operator can
 * confirm the queue is empty.
 *
 * Pure: no I/O, deterministic for the input.
 */
export function renderEscalationVisibility(
  visibility: EscalationVisibility,
): string {
  if (visibility.count === 0) {
    return [
      '### Escalations queued',
      '',
      '_None._',
    ].join('\n');
  }
  const lines: string[] = [
    `### Escalations queued (${visibility.count})`,
    '',
  ];
  for (const row of visibility.rows) {
    lines.push(
      `- \`${row.id}\` — ${row.actionProposed} (${row.quickLink})`,
    );
    lines.push(`  Question: ${row.question}`);
    lines.push(`  Queued at: ${row.queuedAt}`);
  }
  return lines.join('\n');
}
