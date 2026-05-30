/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-aware-gate.ts
 *
 * Phase 15 Task 1 — workplan-aware implement-loop gate.
 *
 * Replaces Phase 13 Task 2's strict "refuse on any `Status: open`
 * audit-log finding" with a coverage check: the gate allows when
 * (a) zero open findings exist, OR (b) the next N unchecked workplan
 * tasks at positions `[0..N-1]` are exactly the fix-finding tasks for
 * the open finding IDs.
 *
 * Per operator directive 2026-05-29: *"Audit findings are failures of
 * the previous implementation that shouldn't be treated like
 * exceptions — they are guardrails to point the implementation team
 * back to the happy path."* The gate's role is to enforce that the
 * findings are scoped as the NEXT work, not to block the loop while
 * findings are unscoped. The Phase 13 "no `--ignore-open-findings`
 * flag in v1" rigidity stance carries forward — the workplan-aware
 * semantic IS the cure.
 *
 * Three refusal modes, each with an actionable cure path the CLI
 * renders into the refusal message:
 *
 *   - `non-fix-task-before-fix-tasks` — a task at position `<N` is not
 *     tagged `(fix-finding-AUDIT-<id>)`. Cure: reorder the workplan so
 *     fix-tasks come first.
 *   - `coverage-mismatch` with non-empty `missingIds` — open findings
 *     aren't scoped in positions `[0..N-1]`. Cure: run
 *     `promote-findings --apply`.
 *   - `coverage-mismatch` with non-empty `extraIds` — scoped fix-tasks
 *     for finding IDs that aren't currently open. Cure: flip the
 *     audit-log entries' status or remove the stale scoped tasks.
 *
 * The algorithm refuses if EITHER the non-fix or the coverage check
 * fails; non-fix is checked first because reordering the workplan
 * subsumes the coverage shape.
 *
 * Path resolution mirrors the Phase 14 review fix (AUDIT-20260529-17):
 * directory walk under `docs/` looking for any
 * `docs/<v>/001-IN-PROGRESS/<slug>/` so the gate works against features
 * under any version dir, not just `1.0`.
 */

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { walkOpenFindings } from './audit-log-walker.js';
import {
  findUncheckedTasksInOrder,
  type UncheckedTask,
} from './tdd-enforcement.js';
import type { OpenFinding } from './types.js';

const CANONICAL_AUDIT_ID_RE = /\bAUDIT-\d{8}-\d+/;

/**
 * Strip any trailing cross-model annotation from a Finding-ID value
 * (e.g. `AUDIT-20260530-01 (claude-01 + codex-03; cross-model)` →
 * `AUDIT-20260530-01`) so the gate's coverage comparison matches the
 * canonical-only marker the workplan task renderer emits. Falls back
 * to the input verbatim if no canonical pattern is present.
 */
function canonicalAuditId(findingId: string): string {
  const m = CANONICAL_AUDIT_ID_RE.exec(findingId);
  return m !== null ? m[0] : findingId;
}

export type WorkplanAwareGateResult =
  | {
      readonly allowed: true;
      readonly reason: 'no-open-findings' | 'open-findings-scoped-as-next';
    }
  | {
      readonly allowed: false;
      readonly reason: 'non-fix-task-before-fix-tasks';
      readonly offendingTask: string;
      readonly offendingPosition: number;
      readonly openFindings: readonly OpenFinding[];
    }
  | {
      readonly allowed: false;
      readonly reason: 'coverage-mismatch';
      readonly missingIds: readonly string[];
      readonly extraIds: readonly string[];
      readonly openFindings: readonly OpenFinding[];
    };

export interface CheckWorkplanAwareGateArgs {
  readonly featureSlug: string;
  readonly repoRoot: string;
}

export class FeatureRootNotFoundError extends Error {
  readonly featureSlug: string;
  readonly searched: readonly string[];
  constructor(featureSlug: string, searched: readonly string[]) {
    super(
      `workplan-aware-gate: feature '${featureSlug}' not found under docs/<v>/001-IN-PROGRESS/. Checked versions: ${searched.join(', ')}`,
    );
    this.name = 'FeatureRootNotFoundError';
    this.featureSlug = featureSlug;
    this.searched = searched;
  }
}

async function findFeatureRoot(
  docsRoot: string,
  featureSlug: string,
): Promise<{ root: string | undefined; versionsChecked: readonly string[] }> {
  if (!existsSync(docsRoot)) {
    return { root: undefined, versionsChecked: [] };
  }
  let topEntries: ReadonlyArray<string>;
  try {
    topEntries = await readdir(docsRoot);
  } catch {
    return { root: undefined, versionsChecked: [] };
  }
  const versionsChecked: string[] = [];
  for (const version of topEntries) {
    const inProgress = join(docsRoot, version, '001-IN-PROGRESS');
    if (!existsSync(inProgress)) continue;
    versionsChecked.push(version);
    const featureDir = join(inProgress, featureSlug);
    if (existsSync(featureDir)) return { root: featureDir, versionsChecked };
  }
  return { root: undefined, versionsChecked };
}

export async function checkWorkplanAwareGate(
  args: CheckWorkplanAwareGateArgs,
): Promise<WorkplanAwareGateResult> {
  const docsRoot = join(args.repoRoot, 'docs');
  const { root: featureRoot, versionsChecked } = await findFeatureRoot(
    docsRoot,
    args.featureSlug,
  );
  if (featureRoot === undefined) {
    throw new FeatureRootNotFoundError(
      args.featureSlug,
      versionsChecked.length > 0 ? versionsChecked : ['<no version dirs found>'],
    );
  }

  const auditLogPath = join(featureRoot, 'audit-log.md');
  const findings = await walkOpenFindings({
    auditLogPath,
    featureSlug: args.featureSlug,
  });

  if (findings.length === 0) {
    return { allowed: true, reason: 'no-open-findings' };
  }

  const n = findings.length;
  const workplanPath = join(featureRoot, 'workplan.md');
  let workplanText = '';
  if (existsSync(workplanPath)) {
    const { readFile } = await import('node:fs/promises');
    workplanText = await readFile(workplanPath, 'utf8');
  }
  const unchecked = findUncheckedTasksInOrder(workplanText, n);

  // Per AUDIT-20260530-07: the walker's findingId carries the full
  // Finding-ID value including any cross-model suffix (e.g.
  // "AUDIT-20260530-01 (claude-01 + codex-03; cross-model)"), while
  // the workplan marker now stores only the canonical AUDIT-ID. Compare
  // on the canonical form so the two sides match.
  const openIds = new Set(findings.map((f) => canonicalAuditId(f.findingId)));

  // Coverage-check first when unchecked count is less than n — the
  // operator can't have scoped all N findings at all, so "missing" is
  // the more actionable signal than "non-fix at position k".
  if (unchecked.length < n) {
    const { missingIds, extraIds } = computeCoverage(unchecked, openIds);
    return {
      allowed: false,
      reason: 'coverage-mismatch',
      missingIds,
      extraIds,
      openFindings: findings,
    };
  }

  // Non-fix-task-before-fix-tasks check on positions [0..N-1].
  for (let i = 0; i < n; i += 1) {
    const task = unchecked[i];
    if (task === undefined) continue;
    if (task.findingId === null) {
      return {
        allowed: false,
        reason: 'non-fix-task-before-fix-tasks',
        offendingTask: task.heading,
        offendingPosition: i,
        openFindings: findings,
      };
    }
  }

  // Coverage check: scoped IDs at [0..N-1] vs open IDs.
  const { missingIds, extraIds } = computeCoverage(unchecked.slice(0, n), openIds);
  if (missingIds.length > 0 || extraIds.length > 0) {
    return {
      allowed: false,
      reason: 'coverage-mismatch',
      missingIds,
      extraIds,
      openFindings: findings,
    };
  }

  return { allowed: true, reason: 'open-findings-scoped-as-next' };
}

function computeCoverage(
  unchecked: ReadonlyArray<UncheckedTask>,
  openIds: ReadonlySet<string>,
): { missingIds: string[]; extraIds: string[] } {
  const scopedIds = new Set<string>();
  for (const task of unchecked) {
    if (task.findingId !== null) scopedIds.add(task.findingId);
  }
  const missingIds = [...openIds].filter((id) => !scopedIds.has(id)).sort();
  const extraIds = [...scopedIds].filter((id) => !openIds.has(id)).sort();
  return { missingIds, extraIds };
}
