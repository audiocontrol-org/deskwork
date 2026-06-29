// 033 T012/T020 — tier resolution (data-model TierResolution / TierError).
//
// The pure pre-dispatch resolution core: map a task's declared tier to a concrete
// model (or a named error), consulting ONLY the declared label + the configured tier
// map + the accepted-model capability set — NEVER a model vendor/identity (Principle
// III). Every failure mode is a NAMED, COLLECTED error (no silent fallback to a
// session default — Principle V / FR-004/005/008); the collect-all `resolveTasks`
// gathers every error so the operator sees the complete set before any dispatch (FR-006).

import type { TierMap } from '../config/types.js';
import { ACCEPTED_MODELS_LABEL } from './accepted-models.js';
import type { TieredTask } from './tasks-tier-parser.js';

/** A task resolved to its explicit dispatch model. */
export interface ResolvedModel {
  readonly ok: true;
  readonly model: string;
}

/** A named tier-resolution failure (data-model TierError). */
export interface TierError {
  readonly ok: false;
  readonly category: 'no-tier' | 'no-map' | 'unknown-tier' | 'not-accepted';
  readonly id: string;
  readonly message: string;
}

export type TierOutcome = ResolvedModel | TierError;

/** One fully-resolved task in a TierResolution. */
export interface ResolvedTask {
  readonly id: string;
  readonly tierLabel: string;
  readonly model: string;
}

export interface ResolveTasksResult {
  readonly resolved: readonly ResolvedTask[];
  readonly errors: readonly TierError[];
}

/**
 * Resolve one task's declared tier to a model, or a named error. Check order matches
 * the data-model TierError table: no-tier → no-map → unknown-tier → not-accepted.
 * `accepted` is the dispatch-surface capability set (D4) — the not-accepted branch is
 * a defensive double-check (config-load already rejects out-of-range map values).
 */
export function resolveTier(
  id: string,
  tierLabel: string | undefined,
  tierMap: TierMap | undefined,
  accepted: ReadonlySet<string>,
): TierOutcome {
  if (tierLabel === undefined) {
    return { ok: false, category: 'no-tier', id, message: `task ${id} has no model tier declared` };
  }
  if (tierMap === undefined) {
    return {
      ok: false,
      category: 'no-map',
      id,
      message: `no tier_map configured; cannot resolve tier '${tierLabel}' for task ${id}`,
    };
  }
  if (!Object.prototype.hasOwnProperty.call(tierMap, tierLabel)) {
    return { ok: false, category: 'unknown-tier', id, message: `task ${id} declares unknown tier ${tierLabel}` };
  }
  const model = tierMap[tierLabel];
  if (model === undefined || !accepted.has(model)) {
    return {
      ok: false,
      category: 'not-accepted',
      id,
      message: `tier_map[${tierLabel}] = '${model ?? ''}' is not an accepted model (${ACCEPTED_MODELS_LABEL})`,
    };
  }
  return { ok: true, model };
}

/**
 * Collect-all resolution over every task (FR-006): resolve each; gather every error.
 * When ANY error exists the caller emits NO partial resolution (the verb's job) — this
 * function simply returns both lists so the caller decides. Already-done tasks still
 * resolve (their tier/model informs the ledger/resume; FR-010/011).
 */
export function resolveTasks(
  tasks: readonly TieredTask[],
  tierMap: TierMap | undefined,
  accepted: ReadonlySet<string>,
): ResolveTasksResult {
  const resolved: ResolvedTask[] = [];
  const errors: TierError[] = [];
  for (const t of tasks) {
    const outcome = resolveTier(t.id, t.tierLabel, tierMap, accepted);
    if (outcome.ok) {
      // tierLabel is defined here (resolveTier returns ok only when it was present).
      resolved.push({ id: t.id, tierLabel: t.tierLabel ?? '', model: outcome.model });
    } else {
      errors.push(outcome);
    }
  }
  return { resolved, errors };
}
