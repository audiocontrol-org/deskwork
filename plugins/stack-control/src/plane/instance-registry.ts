// specs/037-instance-observability — T018 (impl), pairs with
// tests/instance/registry-instances.test.ts (T016) and
// tests/instance/instance-state-shape.test.ts (T017).
//
// Folds a stream of classified events into per-instance InstanceState projections,
// paralleling src/plane/registry.ts (T050). The InstanceRegistry is an in-memory
// materialized projection over the authoritative durable event log; it is
// rehydrated on plane startup and kept in-sync as new events arrive (research.md
// D6: rehydrates from the same in-memory `events` array the run registry replays,
// `runtime.ts:187` — no new durable log here).
//
// The per-instance fold trio (`newInstanceAccumulator` / `applyInstanceEvent` /
// `toInstanceState`) lives in the sibling `instance-accumulator.ts` — split out
// to keep both files under the project's 300-500 line cap (data-model.md
// § InstanceAccumulator). `InstanceState`/`InstanceAccumulator` themselves live
// in `src/fleet/instance/types.ts`; this module re-exports `InstanceState` (and
// `toInstanceState`) as the served import surface consumers (tests, the HTTP
// projection in `plane/http/instance-api.ts`) resolve against.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
// under node16 resolution (no `@/` alias — this plugin has none).

import type { InstanceAccumulator, InstanceId, InstanceState } from '../fleet/instance/types.js';
import {
  applyInstanceEvent,
  newInstanceAccumulator,
  toInstanceState,
} from './instance-accumulator.js';
import type { ClassifiedEvent } from './instance-accumulator.js';

export type { InstanceState };
export type { ClassifiedEvent };
export { toInstanceState };

/**
 * The derived, client-visible instance registry (data-model.md § InstanceState).
 * `instances()` returns one InstanceState per observed `host:path`, in
 * first-seen order; `instance(id)` looks up a single one. Fresh array each
 * `instances()` call (mirrors `registry.ts`'s `FleetRegistry.entries()`).
 */
export interface InstanceRegistry {
  /** Returns all instances in stable (first-seen) order. */
  instances(): readonly InstanceState[];
  /** Returns a single instance by id (host:path), or undefined if not found. */
  instance(id: string): InstanceState | undefined;
}

/**
 * Build an InstanceRegistry by folding a stream of classified events into
 * per-instance InstanceState projections (T018, data-model.md § InstanceAccumulator).
 *
 * Parallels src/plane/registry.ts's buildRegistry. Keyed by `${envelope.host}:
 * ${envelope.path}` (never `runId` — unlike 036's run registry, this view is
 * keyed by MACHINE, and retains `invocation.completed` rather than discarding
 * it, data-model.md § Event types). Effectively-once by `eventId` (deduped
 * HERE, before an event ever reaches the per-instance accumulator — mirrors
 * `registry.ts`'s `seenEventIds`); no-regress by `invocationSequence` (enforced
 * per-field inside `applyInstanceEvent`). Entries preserve first-seen order.
 */
export function buildInstanceRegistry(events: readonly ClassifiedEvent[]): InstanceRegistry {
  const accumulatorsById = new Map<InstanceId, InstanceAccumulator>();
  const orderedAccumulators: InstanceAccumulator[] = [];
  const seenEventIds = new Set<string>();

  for (const event of events) {
    const { envelope } = event;

    // Effectively-once: a re-delivered event (same eventId — the dedupe key,
    // data-model.md § Identity) is applied at most once.
    if (seenEventIds.has(envelope.eventId)) {
      continue;
    }
    seenEventIds.add(envelope.eventId);

    const id: InstanceId = `${envelope.host}:${envelope.path}`;
    let acc = accumulatorsById.get(id);
    if (acc === undefined) {
      acc = newInstanceAccumulator(id, envelope.host, envelope.path);
      accumulatorsById.set(id, acc);
      orderedAccumulators.push(acc);
    }

    applyInstanceEvent(acc, event);
  }

  const built: InstanceState[] = orderedAccumulators.map(toInstanceState);

  return {
    instances(): readonly InstanceState[] {
      return [...built];
    },
    instance(id: string): InstanceState | undefined {
      return built.find((state) => state.id === id);
    },
  };
}
