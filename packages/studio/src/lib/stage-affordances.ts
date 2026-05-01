/**
 * Stage-affordance helper for the entry-centric review surface.
 *
 * The eight-stage entry model (pipeline-redesign Task 34) groups stages
 * into three behavior shapes for the review UI:
 *
 *   - Pipeline-mutable (Ideas .. Final): the document is being worked on;
 *     the review surface offers save/iterate/approve/reject + a
 *     historical-stage dropdown so the operator can navigate prior
 *     scrapbook docs (idea, plan, outline) for the same entry.
 *
 *   - Published: terminal; the artifact is locked. The surface is
 *     view-only with a "fork" placeholder for the eventual revise-as-new
 *     branch — distinct from re-opening, which is intentionally not a
 *     supported transition for Published.
 *
 *   - Blocked / Cancelled: off-pipeline. The artifact is paused; the
 *     only useful affordance is an "induct-to" stage picker that pulls
 *     the entry back into the linear pipeline at the operator's chosen
 *     stage.
 *
 * The helper is pure (no I/O, no side-effects) so it's safe to call from
 * route handlers, page renderers, and tests.
 */

import type { Entry } from '@deskwork/core/schema/entry';

export interface Affordances {
  mutable: boolean;
  controls: string[];
}

export function getAffordances(entry: Entry): Affordances {
  if (entry.currentStage === 'Published') {
    return { mutable: false, controls: ['view-only', 'fork-placeholder'] };
  }
  if (entry.currentStage === 'Blocked' || entry.currentStage === 'Cancelled') {
    return { mutable: false, controls: ['induct-to'] };
  }
  return {
    mutable: true,
    controls: ['save', 'iterate', 'approve', 'reject', 'historical-stage-dropdown'],
  };
}
