// `stackctl execute-check --spec <dir>` (T017).
//
// Validates that a Spec Kit spec directory is RUNNABLE for native
// /speckit-implement. Read-only; never authors or repairs. Fail-loud
// (FR-008 / Principle V / VR-1): a non-runnable spec NEVER exits 0 and the
// error names the missing artifact — no fabricated "runnable" verdict.
//
// "Runnable" is pinned (A1) to: tasks.md present in the spec dir. spec.md +
// plan.md are assumed already present from the upstream Spec Kit chain; the
// gating artifact is tasks.md (what /speckit-tasks produces).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { enumeratePhases } from '../workflow/phase-enumeration.js';
import { resolvePhaseCheckpointStatuses } from '../govern/phase-checkpoint-status.js';
import { estimateBoundary } from '../govern/phase-boundary-sizing.js';

// Strict arg parsing (AUDIT-20260605-09): the dispatcher contract is "no flag
// silently ignored." Accept ONLY `--spec <value>`; reject a missing value,
// unknown flags, or stray positionals with exit 2 — a typo must not slip
// through as a runnable verdict.
function parseArgs(args: string[]): { spec: string } {
  let spec: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === undefined) continue;
    if (token === '--spec') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write('execute-check: --spec <dir> required\n');
        process.exit(2);
      }
      spec = value;
      i++; // consume the value
      continue;
    }
    process.stderr.write(
      `execute-check: unexpected argument '${token}' (usage: execute-check --spec <dir>)\n`,
    );
    process.exit(2);
  }
  if (spec === undefined) {
    process.stderr.write('execute-check: --spec <dir> required\n');
    process.exit(2);
  }
  return { spec };
}

export async function runExecuteCheck(args: string[]): Promise<void> {
  const { spec } = parseArgs(args);

  const specDir = resolve(spec);
  if (!existsSync(specDir)) {
    process.stderr.write(`execute-check: FATAL — spec dir ${spec} not found\n`);
    process.exit(1);
  }

  // A file masquerading as a spec dir must be diagnosed distinctly
  // (AUDIT-20260605-08) — not misreported as "tasks.md missing."
  if (!statSync(specDir).isDirectory()) {
    process.stderr.write(`execute-check: FATAL — spec path ${spec} is not a directory\n`);
    process.exit(1);
  }

  const tasks = join(specDir, 'tasks.md');
  if (!existsSync(tasks)) {
    process.stderr.write(
      `execute-check: FATAL — ${join(spec, 'tasks.md')} missing; ` +
        `spec not runnable (run /speckit-tasks first)\n`,
    );
    process.exit(1);
  }

  process.stdout.write('runnable\n');
}

// ── Per-phase execute cadence (025 US2 — govern half) ────────────────────────────
//
// These are the non-discretionary post-conditions the `/stack-control:execute` skill
// body runs at each tasks.md phase boundary (contracts/execute-cadence.md). The logic
// lives here in the portable `stackctl` surface (specs/017 Decision 1: stackctl is
// authoritative, the skill bodies are thin cross-vendor adapters). The govern step is
// injected so the cadence is unit-testable without spawning a real barrage.

/** The install-anchored inputs the per-phase cadence reads (FR-006/007/008). */
export interface PhaseBoundaryContext {
  readonly installationRoot: string;
  readonly slug: string;
  readonly tasksPath: string;
  /** The active model-fleet prompt envelope, in bytes (oversized → fail loud). */
  readonly fleetEnvelopeBytes: number;
  /** Prospective bytes-per-governed-path used to size a phase before governing it. */
  readonly averageBytesPerPath: number;
}

/**
 * FR-007 (per-phase ordering): refuse to start `phaseId` until EVERY tasks.md phase
 * before it has a current checkpoint. Throws naming the first non-current prior phase.
 * Mirrors 021's govern-time ordering — closed here so `execute` refuses before it even
 * begins the next phase's work, not only when govern eventually runs.
 */
export function assertPriorPhasesGoverned(ctx: PhaseBoundaryContext, phaseId: string): void {
  const statuses = resolvePhaseCheckpointStatuses(ctx.installationRoot, ctx.slug, ctx.tasksPath);
  const index = statuses.findIndex((s) => s.phaseId === phaseId);
  if (index === -1) {
    throw new Error(
      `execute: phase '${phaseId}' is not a tasks.md phase of feature '${ctx.slug}' ` +
        `(known: ${statuses.map((s) => s.phaseId).join(', ') || 'none'})`,
    );
  }
  for (const prior of statuses.slice(0, index)) {
    if (prior.state !== 'current') {
      throw new Error(
        `execute: refusing to start phase '${phaseId}' — prior phase '${prior.phaseId}' ` +
          `has no current checkpoint (state: ${prior.state}). Govern phase '${prior.phaseId}' first (FR-007).`,
      );
    }
  }
}

/**
 * FR-008 (oversized boundary): a single phase whose prospective payload exceeds the
 * active fleet envelope FAILS LOUD with `boundary-too-large`, pointing at right-sizing
 * (TASK-75). It MUST NOT auto-split the phase and MUST NOT silently scope it down.
 */
export function assertPhaseFitsFleet(ctx: PhaseBoundaryContext, phaseId: string): void {
  const phase = enumeratePhases(readFileSync(ctx.tasksPath, 'utf8')).find((p) => p.phaseId === phaseId);
  if (phase === undefined) {
    throw new Error(`execute: phase '${phaseId}' not found in ${ctx.tasksPath}`);
  }
  const estimate = estimateBoundary(
    phaseId,
    phase.files,
    ctx.averageBytesPerPath,
    ctx.fleetEnvelopeBytes,
  );
  if (!estimate.fitsActiveFleet) {
    throw new Error(
      `execute: FATAL — boundary-too-large: phase '${phaseId}' prospective payload ` +
        `${estimate.estimatedPromptBytes} bytes (${estimate.estimateBasis}) exceeds the active fleet ` +
        `envelope ${ctx.fleetEnvelopeBytes} bytes. Right-size this phase's tasks.md boundary (TASK-75) — ` +
        `execute does NOT auto-split a phase and does NOT silently scope it down.`,
    );
  }
}

/**
 * The ordered per-phase govern post-condition (FR-006): refuse if a prior phase is not
 * current, refuse if this phase is oversized, then run `govern --phase <id>` (injected),
 * then VERIFY the phase's checkpoint is now current. Non-discretionary — the skill body
 * calls this at each boundary; it offers no skip/defer branch (ties US5).
 */
export function governPhaseBoundary(
  ctx: PhaseBoundaryContext,
  phaseId: string,
  runGovern: (phaseId: string) => void,
): void {
  assertPriorPhasesGoverned(ctx, phaseId);
  assertPhaseFitsFleet(ctx, phaseId);
  runGovern(phaseId);
  const after = resolvePhaseCheckpointStatuses(ctx.installationRoot, ctx.slug, ctx.tasksPath).find(
    (s) => s.phaseId === phaseId,
  );
  if (after === undefined || after.state !== 'current') {
    throw new Error(
      `execute: govern --phase ${phaseId} did not leave a current checkpoint ` +
        `(state: ${after?.state ?? 'absent'}); the work is NOT recorded as governed.`,
    );
  }
}
