/**
 * Entry → lane → pipeline template resolution (Phase 4 Task 4.1).
 *
 * Verb code receives an entry sidecar; the template that governs the
 * entry's stage transitions is two hops away: `entry.lane` → lane
 * config → `lane.pipelineTemplate` → pipeline template. This helper
 * composes the two loader calls so verb code reads as
 * `const template = resolveEntryTemplate(entry, projectRoot)` without
 * having to plumb the intermediate lane object through every call.
 *
 * Migration-window default:
 *
 *   When `entry.lane` is undefined (legacy sidecars pre-doctor
 *   migration), the helper defaults to the `editorial` pipeline
 *   template — Phase 3's schema kept `lane` optional precisely so
 *   legacy sidecars continue to parse and existing editorial verbs
 *   continue to work. The doctor's lane-migration step back-fills
 *   `lane: "default"` on every legacy entry; once the migration runs
 *   project-wide, this default branch becomes unreachable. A later
 *   phase tightens the schema's `lane` to required and removes the
 *   default branch entirely (the doctor enforces presence then).
 *
 *   The migration-window default is the editorial PIPELINE TEMPLATE
 *   directly, NOT a synthetic "default" lane — bypassing the lane
 *   layer avoids requiring `.deskwork/lanes/default.json` to exist on
 *   disk before migration runs (which would be a chicken-and-egg
 *   problem for the doctor invocation that creates it).
 */

import {
  loadPipelineTemplate,
  type PipelineTemplate,
} from '../pipelines/index.ts';
import { loadLaneConfig } from './loader.ts';
import type { Entry } from '../schema/entry.ts';

/**
 * Resolve the pipeline template that governs an entry's lifecycle.
 *
 * Migration-window behavior: when `entry.lane` is undefined, defaults
 * to the `editorial` template. Phase 8 enforces `lane` presence on
 * every sidecar at the doctor layer (workplan: Phase 8 § "Doctor —
 * enforce lane presence post-migration"); once that lands, this
 * function tightens to throw on missing-lane. The migration-window
 * default is the only thing that keeps pre-migration entries (and the
 * sidecar-free test fixtures used by `calendar/render`) resolving
 * cleanly today.
 *
 * @param entry - The entry sidecar.
 * @param projectRoot - Absolute path to the project root.
 * @returns The resolved pipeline template. The schema is `.strict()`,
 *   so the inferred type lists exactly the declared keys; consumers
 *   read named fields directly.
 * @throws When `entry.lane` is set but the lane config or its bound
 *   template fail to resolve. Bubbles the loader's error message so
 *   the operator sees the offending lane / template id and the file
 *   path involved.
 */
export function resolveEntryTemplate(
  entry: Entry,
  projectRoot: string,
): PipelineTemplate {
  if (entry.lane === undefined) {
    // Migration-window default — Phase 8 doctor-enforcement removes
    // this branch. See `docs/1.0/001-IN-PROGRESS/graphical-entries/
    // workplan.md` Phase 8 for the enforcement step.
    return loadPipelineTemplate('editorial', projectRoot);
  }
  const lane = loadLaneConfig(entry.lane, projectRoot);
  return loadPipelineTemplate(lane.pipelineTemplate, projectRoot);
}

/**
 * Back-compat alias of `resolveEntryTemplate`. Pre-AUDIT-20260530-08
 * this returned a distinct `StrictPipelineTemplate` type; the alias
 * has been deleted (it was a no-op `Pick<>` over the same keys). This
 * function is preserved as a named helper for callers that prefer the
 * "strict" verb-routing-side framing in their call site, but the
 * return type is `PipelineTemplate` — the same value either way.
 */
export function resolveEntryStrictTemplate(
  entry: Entry,
  projectRoot: string,
): PipelineTemplate {
  return resolveEntryTemplate(entry, projectRoot);
}
