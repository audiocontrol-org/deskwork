/**
 * lane show — return a fully-resolved lane config (including the
 * archived state) for the operator-supplied id. Thin convenience
 * around `loadLaneConfig`.
 *
 * Phase 6 Task 6.1 (graphical-entries). `loadLaneConfig` already
 * filters nothing — it returns the on-disk lane including the
 * `archivedAt` field when present. This wrapper exists so the CLI
 * handler has a single, named entry point to consume rather than
 * routing through the loader directly. Keeping the operations module
 * the single import surface for `lane.ts` keeps the CLI thin and
 * makes future lifecycle-side-effects (e.g. emitting a `lane-view`
 * journal event for audit) easy to add without re-plumbing the CLI.
 */

import { loadLaneConfig } from '../loader.ts';
import type { LaneConfig } from '../types.ts';

export function showLane(projectRoot: string, id: string): LaneConfig {
  return loadLaneConfig(id, projectRoot);
}
