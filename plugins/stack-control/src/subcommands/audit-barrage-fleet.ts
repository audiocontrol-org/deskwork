/**
 * plugins/stack-control/src/subcommands/audit-barrage-fleet.ts
 *
 * Fleet-degradation + floor logic for the audit-barrage verb
 * (specs/014 US1 — fleet loudness + the `--require-models` floor).
 * Extracted verbatim from `audit-barrage.ts` to keep that file under
 * the project's 300–500 line cap; zero behavior change. The public
 * surface (`renderFleetWarnings`, `deriveBarrageExitCode`) is
 * re-exported from `audit-barrage.ts` so existing import paths keep
 * working.
 */

import {
  isModelRunCovering,
  type BarrageRun,
  type ModelRunResult,
} from '../scope-discovery/audit-barrage/types.js';

/**
 * A configured model is ZERO-OUTPUT DEGRADED iff `stdoutBytes === 0` —
 * timeout or not (specs/014 US1, research R1). A model with partial
 * output before a timeout (`stdoutBytes > 0`) is NOT zero-output
 * degraded. "Emitting model" := `stdoutBytes > 0`.
 */
export function zeroOutputModels(run: BarrageRun): ReadonlyArray<ModelRunResult> {
  return run.results.filter((r) => r.stdoutBytes === 0);
}

function emittingCount(run: BarrageRun): number {
  return run.results.filter((r) => r.stdoutBytes > 0).length;
}

function zeroOutputCause(r: ModelRunResult): string {
  if (r.timedOut) {
    return `timed out after ${Math.round(r.durationMs / 1000)}s`;
  }
  if (r.spawnError !== undefined) {
    return `spawn failed: ${r.spawnError}`;
  }
  return `exited ${r.exitCode}`;
}

/**
 * Fleet-floor evaluation (specs/014 US1, research R1). The floor counts
 * EMITTING models (stdoutBytes > 0) against
 * `min(requested, CONFIGURED fleet size)` so a one-model fleet doesn't
 * make strict mode unsatisfiable nonsense — the clamp itself is named
 * to the operator as a configured-fleet shortfall.
 *
 * `configuredFleetSize` is the size of the LOADED CONFIG's model
 * battery, NOT the `--models` / `GOVERN_MODELS` subset actually run
 * (AUDIT-20260611-03): clamping against the subset would let a
 * single-model selection quietly defeat govern's floor 2 — the
 * cross-model agreement floor would become opt-out-able via an env var
 * with no exit-code consequence. The parameter is required so call
 * sites can't silently reuse the subset; `selected` (the models
 * actually run) is carried separately so the shortfall message can
 * name selection — not model health — as the cause.
 */
interface FleetFloorEvaluation {
  readonly requested: number;
  readonly effectiveFloor: number;
  readonly emitting: number;
  readonly fleetSize: number;
  readonly selected: number;
  readonly clamped: boolean;
  readonly satisfied: boolean;
}

function evaluateFleetFloor(
  run: BarrageRun,
  requested: number,
  configuredFleetSize: number,
): FleetFloorEvaluation {
  const effectiveFloor = Math.min(requested, configuredFleetSize);
  const emitting = emittingCount(run);
  return {
    requested,
    effectiveFloor,
    emitting,
    fleetSize: configuredFleetSize,
    selected: run.results.length,
    clamped: requested > configuredFleetSize,
    satisfied: emitting >= effectiveFloor,
  };
}

/**
 * Render the stderr degradation warnings for the run (specs/014 US1 —
 * TASK-29 / gh-447: a partial fleet must be LOUD at the moment of
 * failure, not discoverable only in the run JSON).
 *
 * Lines emitted, in order:
 *   1. One WARNING per zero-output model, naming the model and the
 *      cause (timeout / exit code / spawn failure).
 *   2. The lost-agreement consequence line when any model is
 *      zero-output AND fewer than 2 models emitted — cross-model
 *      agreement is the HIGH-confidence signal the barrage runs for.
 *   3. With a floor requested: a NOTE when the floor was clamped to the
 *      configured fleet size, and the loud shortfall line (expected vs
 *      actual + each non-emitting model) when the floor is unmet. When
 *      the SELECTED model count (the --models / GOVERN_MODELS subset
 *      actually run) is itself below the effective floor, an extra line
 *      names selection as the cause so the operator knows the floor
 *      failed by selection, not a sick model (AUDIT-20260611-03).
 *
 * `configuredFleetSize` is the loaded config's battery size; when
 * absent it falls back to `run.results.length` (back-compat for
 * library callers without subset selection, where the two are equal —
 * the CLI entry always passes the configured size explicitly).
 *
 * A fully-healthy fleet yields [] — no cry-wolf text.
 */
export function renderFleetWarnings(
  run: BarrageRun,
  requireModels?: number,
  configuredFleetSize?: number,
): ReadonlyArray<string> {
  const lines: string[] = [];
  const degraded = zeroOutputModels(run);
  for (const r of degraded) {
    lines.push(
      `audit-barrage: WARNING — model '${r.name}' produced no output (${zeroOutputCause(r)})`,
    );
  }
  const emitting = emittingCount(run);
  if (degraded.length > 0 && emitting < 2) {
    const noun = emitting === 1 ? 'model' : 'models';
    lines.push(
      `audit-barrage: WARNING — only ${emitting} ${noun} emitted findings this round; cross-model agreement (the HIGH-confidence signal) is unavailable`,
    );
  }
  if (requireModels !== undefined) {
    const floor = evaluateFleetFloor(
      run,
      requireModels,
      configuredFleetSize ?? run.results.length,
    );
    if (floor.clamped) {
      lines.push(
        `audit-barrage: NOTE — --require-models ${floor.requested} exceeds the configured fleet size ${floor.fleetSize}; effective floor is ${floor.effectiveFloor}`,
      );
    }
    if (!floor.satisfied) {
      // Name the cause: selection (the --models / GOVERN_MODELS subset
      // is itself below the effective floor — AUDIT-20260611-03) and/or
      // model health (selected models that emitted nothing). At least
      // one always applies when the floor is unmet.
      const causes: string[] = [];
      if (floor.selected < floor.effectiveFloor) {
        causes.push(
          `only ${floor.selected} of ${floor.fleetSize} configured models were selected via --models/GOVERN_MODELS; the floor counts the configured fleet`,
        );
      }
      const nonEmitting = run.results
        .filter((r) => r.stdoutBytes === 0)
        .map((r) => r.name)
        .join(', ');
      if (nonEmitting.length > 0) {
        causes.push(`non-emitting: ${nonEmitting}`);
      }
      lines.push(
        `audit-barrage: FLOOR SHORTFALL — required ${floor.effectiveFloor} emitting model(s), got ${floor.emitting} (${causes.join('; ')})`,
      );
    }
  }
  return lines;
}

/**
 * Map a BarrageRun's per-model results onto the verb's exit code.
 * Exported for tests; the shim also calls it before exit.
 *
 * Contract (gated on COVERAGE — AUDIT-20260607-42):
 *   - `0` if AT LEAST ONE COVERING family exists (positive-byte stdout,
 *     no spawn failure, AND exit 0).
 *   - `1` (OUTAGE) if zero families cover — every family was a spawn
 *     error, a timeout, a non-zero exit, OR emitted zero bytes.
 *
 * Coverage, not liftability, is the gate. A non-zero-exit family that
 * emitted bytes is still LIFTED for findings (the lift reads each
 * model's `.md` by file presence) whenever the run has coverage from
 * some other family — so its findings are never discarded. But it does
 * NOT itself count as a covering family: for the LLM CLIs this barrage
 * drives, a non-zero exit usually signals a failure (rate-limit, auth
 * expiry, mid-stream drop). Counting a crash-after-banner family as
 * "clean" would let an OUTAGE masquerade as governed-clean in the
 * single-family floor case (FR-005/US3/SC-003) — the exact hole this
 * split closes. Only when EVERY family is non-covering does the run
 * become an OUTAGE (exit 1) → `protocol.ts` fails loud and does NOT
 * auto-lift; the run-dir `.md` artifacts remain for manual triage.
 *
 * Floor (specs/014 US1, additive — FR-002/FR-014): when
 * `requireModels` is supplied, an emitting-model shortfall against the
 * clamped floor is ALSO exit 1. The clamp is against
 * `configuredFleetSize` — the loaded config's battery, NOT the
 * `--models` / `GOVERN_MODELS` subset actually run — so subset
 * selection cannot lower the floor (AUDIT-20260611-03). When the
 * parameter is absent it falls back to `run.results.length`
 * (back-compat for library callers without subset selection, where the
 * two are equal; the CLI entry passes the configured size explicitly).
 * Default (no floor) semantics are byte-identical to the pre-014
 * contract.
 */
export function deriveBarrageExitCode(
  run: BarrageRun,
  requireModels?: number,
  configuredFleetSize?: number,
): 0 | 1 {
  const anyCovering = run.results.some(isModelRunCovering);
  if (!anyCovering) {
    return 1;
  }
  if (
    requireModels !== undefined &&
    !evaluateFleetFloor(
      run,
      requireModels,
      configuredFleetSize ?? run.results.length,
    ).satisfied
  ) {
    return 1;
  }
  return 0;
}
