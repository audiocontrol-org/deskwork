// 032 US3 (FR-012) — the off-rail merge signal. An item is merged-but-status-in-flight
// when its `impl` govern convergence-record commit is REACHABLE from the default branch
// (origin/main) while its recorded `status:` is still in-flight (∉ {shipped, closed}).
// This is the portable, git-only, per-item signal the backstop compass invariant keys
// on: it needs no gh-API, and it is INDEPENDENT of whether `/stack-control:ship` ran
// (it keys on the record commit's reachability, not a ship-written marker). The on-rail
// ship weld (recording shipped) does NOT call this (FR-013) — only the backstop does.

import { existsSync } from 'node:fs';
import { convergenceRecordPath } from '../govern/convergence-record.js';
import { isReachableFromBase, lastCommitTouching } from '../session/git.js';
import { SIDE_STATES } from './workflow-types.js';
import type { RoadmapModel, WorkItem } from '../roadmap/roadmap-model.js';

/** A detected off-rail-merged item: merged (record reachable from base) but status in-flight. */
export interface MergedButInFlight {
  readonly itemId: string;
  /** The commit that wrote the item's impl convergence record (reachable from base). */
  readonly recordCommit: string;
}

/**
 * Statuses for which the dangling signal NEVER fires (032 AUDIT-20260623-07): the post-merge
 * recorded statuses (`shipped`/`closed`) AND the terminal side-states (`blocked`/`cancelled`/
 * `retired`). A side-state item is not pending-ship and CANNOT be reconciled via `workflow
 * advance` (side-states refuse advance), so flagging it dangling would DEADLOCK the backstop —
 * forward motion blocked with no way to clear it. Only the active pre-ship status (`in-flight`)
 * is a dangling candidate (the single point where a merge can be pending-record).
 */
const NON_DANGLING_STATUSES: ReadonlySet<string> = new Set(['shipped', 'closed', ...SIDE_STATES]);

/** True when `status` can never be a merged-but-status-in-flight (dangling) item. */
function isNonDanglingStatus(status: string): boolean {
  return NON_DANGLING_STATUSES.has(status.toLowerCase());
}

/**
 * The merged-but-status-in-flight signal for ONE item (FR-012). Returns the item when
 * its impl convergence record's commit is reachable from `origin/main` AND its status is
 * still in-flight; null otherwise (record absent / not committed / not reachable / status
 * already shipped or closed / base undeterminable — the last is fail-open, never a refusal).
 */
export function mergedButInFlight(item: WorkItem, installationRoot: string): MergedButInFlight | null {
  if (isNonDanglingStatus(item.status)) return null; // recorded, or a non-reconcilable side-state
  const recordPath = convergenceRecordPath(installationRoot, 'impl', item.identifier);
  if (!existsSync(recordPath)) return null; // no govern record → nothing was merged off-rail
  const recordCommit = lastCommitTouching(installationRoot, recordPath);
  if (recordCommit === null) return null; // record present but never committed → cannot assert merged
  // Base undeterminable → isReachableFromBase returns null → not provably merged → no refusal.
  if (isReachableFromBase(recordCommit, installationRoot) !== true) return null;
  return { itemId: item.identifier, recordCommit };
}

/**
 * The FIRST merged-but-status-in-flight item over the whole roadmap (the backstop's
 * cross-item scan), or null when none dangles. Deterministic: scans in the model's
 * declared item order.
 */
export function firstDanglingMergedItem(model: RoadmapModel, installationRoot: string): MergedButInFlight | null {
  for (const item of model.items) {
    const signal = mergedButInFlight(item, installationRoot);
    if (signal !== null) return signal;
  }
  return null;
}

/** Every merged-but-status-in-flight item over the roadmap (for the non-blocking advisory). */
export function allDanglingMergedItems(model: RoadmapModel, installationRoot: string): readonly MergedButInFlight[] {
  return model.items.map((item) => mergedButInFlight(item, installationRoot)).filter((s): s is MergedButInFlight => s !== null);
}
