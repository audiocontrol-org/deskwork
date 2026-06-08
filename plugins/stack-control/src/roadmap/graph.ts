// Roadmap graph queries (006 US1, R4). Derived views over the typed WorkItem
// graph — never persisted. `ready` is the in-degree-zero frontier under the
// "satisfied iff shipped" rule; `blockedBy` explains why an item is not ready.
// `part-of` is ignored for readiness (non-blocking grouping).

import { DocumentModelError } from '../document-model/types.js';
import type { RoadmapModel, WorkItem } from './roadmap-model.js';

/** The single status that satisfies a `depends-on` edge (R4/FR-003). */
const SATISFYING_STATUS = 'shipped';

/** A non-shipped dependency that blocks an item, with its current status. */
export interface Blocker {
  readonly identifier: string;
  readonly status: string;
}

/** Why an item is not ready (FR-013): unmet deps + an optional deferred marker. */
export interface BlockedReport {
  readonly unmetDependencies: readonly Blocker[];
  readonly deferredUntil: string | null;
}

/** True iff the item's status is one of the grammar's terminal statuses. */
export function isTerminal(model: RoadmapModel, item: WorkItem): boolean {
  return model.doc.grammar.terminalStatuses.includes(item.status);
}

/** The non-shipped `depends-on` targets of an item, each with its status. */
function unmetDependencies(model: RoadmapModel, item: WorkItem): Blocker[] {
  const blockers: Blocker[] = [];
  for (const dep of item.dependsOn) {
    const target = model.byId.get(dep);
    // Referential integrity ran at load, so a depends-on target always resolves;
    // guard fail-loud rather than silently treating a missing dep as satisfied.
    if (target === undefined) {
      throw new DocumentModelError(
        `roadmap item '${item.identifier}' depends-on '${dep}', which is not in the model (referential integrity should have caught this at load)`,
      );
    }
    if (target.status !== SATISFYING_STATUS) {
      blockers.push({ identifier: target.identifier, status: target.status });
    }
  }
  return blockers;
}

/** Why `identifier` is blocked (empty unmet + null deferred ⇒ not blocked). */
export function blockedBy(model: RoadmapModel, identifier: string): BlockedReport {
  const item = model.byId.get(identifier);
  if (item === undefined) {
    throw new DocumentModelError(`roadmap has no item '${identifier}'`);
  }
  return {
    unmetDependencies: unmetDependencies(model, item),
    deferredUntil: item.deferredUntil,
  };
}

/** True iff the item is non-terminal, not deferred, and all deps are shipped. */
export function isReady(model: RoadmapModel, item: WorkItem): boolean {
  if (isTerminal(model, item)) return false;
  if (item.deferredUntil !== null) return false;
  return unmetDependencies(model, item).length === 0;
}

/** The ready frontier: every non-terminal item whose deps are all shipped (FR-012). */
export function ready(model: RoadmapModel): readonly WorkItem[] {
  return model.items.filter((item) => isReady(model, item));
}
