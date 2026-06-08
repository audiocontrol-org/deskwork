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
 * Spec-mode audit lens — the prompt's "What to look for" section for a SPEC.
 * Scopes the audit to spec altitude (promise / decision / contradiction /
 * ambiguity) instead of the code-quality checklist, so spec audits don't
 * litigate implementation in the spec (the non-converging-findings failure
 * mode). The render is mode-agnostic; the lens is data.
 */
export const SPEC_AUDIT_LENS = [
  '**You are auditing a SPECIFICATION — a statement of PROMISES, REQUIREMENTS, and DESIGN DECISIONS — NOT an implementation.** Look for flaws in *what the spec promises and decides*, never in *how it would be built*:',
  '',
  '- **Internal contradictions** — two requirements, a requirement and a success criterion, an acceptance scenario and an FR, or two design decisions that cannot all hold. The highest-value spec finding.',
  '- **Impossible or self-contradictory promises** — a guarantee the spec makes that cannot be true as stated. Flag the *promise* as unachievable; do NOT demand the mechanism that would achieve it.',
  '- **Ambiguity an unattended builder resolves wrongly** — a requirement with two roughly-equally-plausible readings the spec never disambiguates; the wrong one gets built by default.',
  '- **Unmeasurable / untestable promises** — a success criterion or requirement with no way to tell whether it is met.',
  '- **Missing user-facing guarantee or decision** — a behavior the feature\'s stated goals require but the spec never commits to (a missing *promise*, not a missing *mechanism*).',
  '- **Over-specified mechanism (altitude violation)** — the spec dictating *how* something is implemented: algorithms, data-structure or file layouts, write/recovery protocols, parser internals, exhaustive edge-case handling. Flag this as *"move to contracts/tests — too detailed for a spec."*',
  '',
  '**Litmus before you emit any finding:** *is this a flaw in WHAT the spec promises/decides, or in HOW it would be implemented?* WHAT (promise / decision / contradiction / ambiguity) → in scope, flag it. HOW (mechanism / algorithm / protocol / data-layout / edge-case handling) → OUT of scope: the mechanism is pinned by contracts + RED tests at implementation time, not by spec prose, and a coherent promise needs no mechanism to be a good spec.',
  '',
  '**Do NOT flag** "what happens on empty input / concurrent calls / partial failure / operator interrupt mid-operation / maximum input" as missing — those are implementation edge cases the tests pin, UNLESS the spec makes a contradictory or impossible *promise* about them. **Do NOT flag** "the algorithm / format / protocol / data structure is unspecified." If you nonetheless surface a mechanism-level observation, mark it **at most `medium`** and prefix its finding heading with `[mechanism — defer to contracts/tests]`.',
].join('\n');

/**
 * Spec-mode artifact framing — the prompt's "Under audit" lead-in for a SPEC.
 * Tells the auditor to read the folded artifact as promises/decisions, not
 * code, and to anchor findings to section / requirement IDs.
 */
export const SPEC_ARTIFACT_FRAMING =
  'The specification under audit — requirements, success criteria, acceptance scenarios, and design decisions. Read it as a statement of promises and decisions, not code. Anchor each finding to a specific section or requirement ID (e.g. `FR-007`, `SC-003`), or call out a missing promise that should be stated but isn\'t.';

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
