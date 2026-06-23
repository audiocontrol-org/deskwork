// 031 US1 — the transitive close cascade engine (contracts/close-cascade.md,
// data-model.md § CascadePlan). PURE plan builder + an apply step over the typed
// BacklogBackend. The engine never prints (formatting is a separate render
// helper); the closer touches ONLY recorded `closes:`/`ref:` ids — never inferred
// (FR-005, 023 FR-003). The `roadmap close-related --cascade` and the (later)
// `advance --to closed` surfaces both drive this one engine.

import { childrenOf, isTerminal } from './graph.js';
import type { RoadmapModel, WorkItem } from './roadmap-model.js';
import { BACKLOG_DONE_STATUS, BacklogError, type BacklogBackend } from '../backlog/backend.js';

/** A terminal node in the subtree whose recorded ids will close. */
export interface NodeClosure {
  readonly id: string;
  /** The node's terminal roadmap status (shipped/cancelled/retired/closed). */
  readonly status: string;
  /** The recorded ids this node resolves (closes: ∪ ref:, deduped). */
  readonly closes: readonly string[];
  /** Provenance reason recorded on each close, reflecting the node's status. */
  readonly reason: string;
}

/** A non-terminal child skipped-and-reported (FR-007a) — id + its status. */
export interface SkippedChild {
  readonly id: string;
  readonly status: string;
}

/** The in-memory dry-run artifact + apply input (data-model.md § CascadePlan). */
export interface CascadePlan {
  /** The node the cascade starts from. */
  readonly root: string;
  /** Terminal nodes in the subtree whose ids will close. */
  readonly nodes: readonly NodeClosure[];
  /** Non-terminal children skipped, surfaced for transparency (FR-007a). */
  readonly skipped: readonly SkippedChild[];
  /** The deduped union of recorded ids across `nodes`. */
  readonly closeIds: readonly string[];
  /** Recorded ids already `Done` (reported, no-op on apply; FR-004). */
  readonly alreadyClosed: readonly string[];
  /** Recorded ids the backlog does not know (fail-loud; FR-006). */
  readonly unknownIds: readonly string[];
}

/** The recorded resolved set of one node: closes: ∪ ref:, deduped, stable order. */
function recordedIds(item: WorkItem): string[] {
  return [...new Set([...item.closes, ...(item.ref !== null ? [item.ref] : [])])];
}

/**
 * Build the cascade plan PURELY. Walks the ENTIRE `part-of` subtree rooted at
 * `rootId` via `childrenOf`, with a visited-Set so a diamond / multi-parent node
 * is processed EXACTLY ONCE and the walk always terminates (FR-002). Descends
 * into every node's children regardless of the node's own status.
 *
 * Classification (FR-007 / FR-007a):
 *   • terminal node  → a NodeClosure collecting its recorded ids, reason
 *     reflecting its status (uniform terminal handling — shipped/cancelled/
 *     retired/closed all collected);
 *   • non-terminal   → a SkippedChild (ids NOT collected) — but still descended.
 *
 * `closeIds` is the deduped union of all NodeClosure ids; partitioned against
 * `statusById` into `unknownIds` (absent from the backlog) and `alreadyClosed`
 * (status === Done).
 */
export function buildCascadePlan(
  model: RoadmapModel,
  rootId: string,
  statusById: ReadonlyMap<string, string>,
): CascadePlan {
  const root = model.byId.get(rootId);
  if (root === undefined) {
    throw new BacklogError(`transitive-close: no roadmap item '${rootId}'`);
  }

  const nodes: NodeClosure[] = [];
  const skipped: SkippedChild[] = [];
  const visited = new Set<string>();

  const walk = (item: WorkItem): void => {
    if (visited.has(item.identifier)) return; // diamond-safe: process once (FR-002)
    visited.add(item.identifier);

    if (isTerminal(model, item)) {
      nodes.push({
        id: item.identifier,
        status: item.status,
        closes: recordedIds(item),
        reason: `resolved by roadmap item ${rootId} (cascade; member '${item.identifier}' is ${item.status})`,
      });
    } else {
      // Skip-and-report the non-terminal child; its ids are NOT collected
      // (FR-007a) — but the walk still descends into its children below.
      skipped.push({ id: item.identifier, status: item.status });
    }

    for (const child of childrenOf(model, item.identifier)) walk(child);
  };

  walk(root);

  const closeIds = [...new Set(nodes.flatMap((n) => n.closes))];
  const unknownIds = closeIds.filter((id) => !statusById.has(id));
  const alreadyClosed = closeIds.filter((id) => statusById.get(id) === BACKLOG_DONE_STATUS);

  return { root: rootId, nodes, skipped, closeIds, alreadyClosed, unknownIds };
}

/** The per-id reason a close records: the reason of the node that recorded it. */
function reasonFor(plan: CascadePlan, id: string): string {
  const owner = plan.nodes.find((n) => n.closes.includes(id));
  // Every closeId comes from some NodeClosure, so owner is always defined; guard
  // fail-loud rather than fabricate a reason.
  if (owner === undefined) {
    throw new BacklogError(`transitive-close: close id '${id}' has no recording node (internal invariant violated)`);
  }
  return owner.reason;
}

/**
 * Apply the plan: close every `closeId` not already `Done` via `backend.close`,
 * with the recording node's provenance reason. Idempotent — `alreadyClosed` ids
 * are skipped (reported by the caller, not re-errored; FR-004). REFUSES (throws
 * BacklogError) when `unknownIds` is non-empty — no partial close (FR-006). Does
 * NOT change any roadmap status (that is `advance`'s job — out of US1 scope).
 */
export function applyCascade(plan: CascadePlan, backend: BacklogBackend): void {
  if (plan.unknownIds.length > 0) {
    throw new BacklogError(
      `transitive-close: unknown backlog id(s) ${plan.unknownIds.join(', ')} ` +
        `(recorded in the cascade from '${plan.root}' but absent from the backlog) — closing nothing`,
    );
  }
  const alreadyClosed = new Set(plan.alreadyClosed);
  for (const id of plan.closeIds) {
    if (alreadyClosed.has(id)) continue; // idempotent no-op (FR-004)
    backend.close(id, reasonFor(plan, id)); // non-zero → BacklogError, never fabricated success
  }
}
