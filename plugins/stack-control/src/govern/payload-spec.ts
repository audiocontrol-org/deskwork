/**
 * plugins/stack-control/src/govern/payload-spec.ts
 *
 * Spec-mode payload assembly for `stackctl govern --mode spec`.
 *
 * Ported verbatim-in-behavior from
 * `spec-kit/spec-governance/scripts/bash/govern-spec.sh`. The audit unit is the
 * SPEC artifact (+ the plan when the after_plan checkpoint is active), folded
 * with a soft byte budget.
 *
 * Ported edge-case fixes (each earned by an audit-barrage finding; keep the
 * AUDIT-ids):
 *
 *   - AUDIT-20260607-14: the SPEC is the PRIMARY audit unit — if it cannot be
 *     folded (missing or over budget) the run is FATAL, never silently degraded
 *     to a plan-only audit.
 *   - AUDIT-20260607-15: when a plan path is supplied (the after_plan
 *     checkpoint) the plan is REQUIRED — a typo/stale path must fail loud, not
 *     silently degrade to spec-only.
 *   - AUDIT-20260607-05: checkpoint defaulting — explicit checkpoint wins;
 *     else after_plan when a plan is folded; else after_clarify. Each checkpoint
 *     runs an INDEPENDENT convergence loop downstream.
 */

import { statSync, readFileSync } from 'node:fs';

/** 256 KB soft budget; specs are small so this is a guard, not a hot path. */
const DEFAULT_PAYLOAD_BUDGET = 256 * 1024;

/**
 * Thrown when a REQUIRED artifact cannot be folded (missing or over budget).
 * Fail-loud, never a silent degrade (FR-005 / AUDIT-20260607-14/-15).
 */
export class GovernPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GovernPayloadError';
  }
}

export interface SpecPayloadArgs {
  readonly specPath: string;
  readonly planPath?: string | undefined;
  readonly checkpoint?: string | undefined;
  /** Soft byte budget (override for tests; mirrors GOVERN_PAYLOAD_BUDGET). */
  readonly budgetBytes?: number;
}

export interface SpecPayload {
  readonly diff: string;
  readonly checkpoint: string;
  /** Note describing whether a plan was folded (for the workplan summary). */
  readonly planNote: string;
}

function fileSizeOrThrow(path: string, label: string): number {
  try {
    return statSync(path).size;
  } catch {
    throw new GovernPayloadError(
      `govern: ${label} '${path}' could not be folded into the audit payload (missing). ` +
        (label === 'SPEC'
          ? 'The spec is the primary audit unit; it must exist.'
          : 'after_plan requires the plan (FR-013) — no silent degrade to spec-only.'),
    );
  }
}

/**
 * Fold one artifact into the payload. Returns the appended section. Throws a
 * GovernPayloadError when the artifact is missing or would exceed the budget —
 * the CALLER decides fatality, but both spec and plan are REQUIRED here, so a
 * throw is always fatal (AUDIT-20260607-14/-15).
 */
function foldArtifact(
  path: string,
  label: string,
  runningBytes: number,
  budget: number,
): { section: string; bytes: number } {
  const sz = fileSizeOrThrow(path, label);
  if (runningBytes + sz > budget) {
    throw new GovernPayloadError(
      `govern: ${label} '${path}' (${sz} bytes) would exceed the ${budget}-byte payload budget. ` +
        (label === 'SPEC'
          ? 'The spec is the primary audit unit; split it or raise GOVERN_PAYLOAD_BUDGET (AUDIT-20260607-14).'
          : 'after_plan requires the plan within budget (AUDIT-20260607-15).'),
    );
  }
  const content = readFileSync(path, 'utf8');
  return {
    section: `\n===== ${label}: ${path} =====\n${content}`,
    bytes: sz,
  };
}

export function assembleSpecPayload(args: SpecPayloadArgs): SpecPayload {
  const budget = args.budgetBytes ?? DEFAULT_PAYLOAD_BUDGET;

  // The SPEC is the primary audit unit — fatal if it cannot fold
  // (AUDIT-20260607-14).
  const spec = foldArtifact(args.specPath, 'SPEC', 0, budget);
  let diff = spec.section;
  let bytes = spec.bytes;

  // When a plan path is supplied (after_plan), the plan is REQUIRED
  // (AUDIT-20260607-15) — a missing/over-budget plan is fatal.
  let planNote = '';
  if (args.planPath !== undefined) {
    const plan = foldArtifact(args.planPath, 'PLAN', bytes, budget);
    diff = `${diff}${plan.section}`;
    bytes += plan.bytes;
    planNote = ` + plan ${args.planPath}`;
  }

  if (diff.trim().length === 0) {
    throw new GovernPayloadError(
      `govern: assembled an empty audit payload (spec '${args.specPath}' empty?).`,
    );
  }

  // Checkpoint defaulting (AUDIT-20260607-05): explicit > after_plan-if-plan >
  // after_clarify.
  let checkpoint: string;
  if (args.checkpoint !== undefined && args.checkpoint.length > 0) {
    checkpoint = args.checkpoint;
  } else if (args.planPath !== undefined) {
    checkpoint = 'after_plan';
  } else {
    checkpoint = 'after_clarify';
  }

  return { diff, checkpoint, planNote };
}
