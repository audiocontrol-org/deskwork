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
import type { RoadmapModel, WorkItem } from '../roadmap/roadmap-model.js';

/** A detected off-rail-merged item: merged (record reachable from base) but status in-flight. */
export interface MergedButInFlight {
  readonly itemId: string;
  /** The commit that wrote the item's impl convergence record (reachable from base). */
  readonly recordCommit: string;
}

/** A status that is no longer in-flight w.r.t. shipping (so never a dangling signal). */
function isPostMergeStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'shipped' || s === 'closed';
}

/**
 * The merged-but-status-in-flight signal for ONE item (FR-012). Returns the item when
 * its impl convergence record's commit is reachable from `origin/main` AND its status is
 * still in-flight; null otherwise (record absent / not committed / not reachable / status
 * already shipped or closed / base undeterminable — the last is fail-open, never a refusal).
 */
export function mergedButInFlight(item: WorkItem, installationRoot: string): MergedButInFlight | null {
  if (isPostMergeStatus(item.status)) return null; // already recorded — not dangling
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
