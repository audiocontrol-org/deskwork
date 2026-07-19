/**
 * specs/036-fleet-control-plane — T136 (impl), pairs with T135's RED test.
 *
 * EVENT classification (FR-015/016) — the storage-economy seam.
 *
 * Every event the sidecar emits classifies as exactly one of:
 *   - `live-only`  — never durably stored (heartbeats belong here). Updates
 *                    the live registry, then is gone.
 *   - `aggregated` — rolled into a summary. The rollup machinery itself is
 *                    NOT built until volume justifies it (spec.md § Assumptions
 *                    line ~377) — but the SEAM exists from the start.
 *   - `durable`    — its own immutable object in the store.
 *
 * **Classification, not emission, decides cost** (FR-015). This is the whole
 * point: an operator whose shell completions or automation loop hammers
 * stackctl at high frequency mints ZERO durable objects from that stream,
 * because those events classify as `aggregated` / `live-only`, never
 * `durable`. Without this seam, "every invocation telemeters" silently
 * becomes "every event becomes a cloud object", and cost scales with emission
 * RATE — the exact failure this file prevents.
 *
 * THE SEAM (FR-016 — adding rollup later changes no contract): the
 * classification DECISION (event type → class, `classifyEvent`) is kept
 * strictly separate from the DISPOSITION (class → cost, `CLASS_STORAGE_POLICY`).
 * A future rollup implementation gives the `aggregated` class a real
 * summarizer — it changes how the policy is CONSUMED, never `classifyEvent`'s
 * result nor the policy's shape. Because the two tables are independent, the
 * rollup machinery lands with zero contract change.
 *
 * WORD-COLLISION WARNING (the /speckit-analyze finding that added this task):
 * `src/fleet/sequence.ts` (T019/T020) has "gap classification" (lost /
 * in-flight / never-sent) — a COMPLETELY UNRELATED concept. This file is EVENT
 * classification. It does not import from, or relate to, sequence.ts.
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI).
 */

import type { EventClassification, EventType } from './types.js';

/**
 * What each classification COSTS — the disposition half of the seam. This
 * table is consulted to decide what happens to an event AFTER it is
 * classified; it is never consulted to DECIDE the classification.
 *
 * - `mintsDurableObject` — does an event of this class become its own
 *   immutable object in the store? Only `durable` does. This flag IS the
 *   storage cost: the object count a stream produces is the count of its
 *   durable events, independent of how many non-durable events it emits.
 * - `feedsRollup` — is an event of this class destined for the (future)
 *   summary rollup? `aggregated` is. When the rollup machinery is built it
 *   reads this flag; adding it changes nothing here (FR-016).
 */
export interface ClassStoragePolicy {
  readonly mintsDurableObject: boolean;
  readonly feedsRollup: boolean;
}

/**
 * The disposition table — keyed exhaustively by the three classes. `Record`
 * (not a partial map) so a new `EventClassification` value would be a compile
 * error here until its cost is declared: the storage economy stays total.
 */
export const CLASS_STORAGE_POLICY: Readonly<
  Record<EventClassification, ClassStoragePolicy>
> = {
  'live-only': { mintsDurableObject: false, feedsRollup: false },
  aggregated: { mintsDurableObject: false, feedsRollup: true },
  durable: { mintsDurableObject: true, feedsRollup: false },
};

/**
 * The classification catalog — the event-type → class decision, made
 * explicit and extensible. A new event type earns its classification by being
 * added HERE (one place), never by a caller guessing. Every entry traces to a
 * spec anchor; the two entries decided by engineering judgment are named in
 * the block comments below.
 *
 * FIRM (spec-anchored):
 *   - `session.heartbeat` → live-only. FR-023 (session liveness heartbeat);
 *     FR-015 states heartbeats belong to live-only verbatim. FR-024/025: run
 *     liveness never depends on a heartbeat, so a heartbeat is a pure live
 *     signal that need never be stored.
 *   - `invocation.completed` → aggregated. FR-012 (every invocation emits) +
 *     FR-013/014 (short verbs are never fleet entries, yet their timing data
 *     stays retrievable) + quickstart line ~38 ("Hammer short verbs in a loop
 *     → never appear as fleet entries; their timings remain retrievable"). A
 *     short verb's usage/timing rolls into a summary; it never mints an
 *     object. This is the event whose stream the cost invariant is about.
 *   - `run.started` / `run.completed` / `run.failed` / `run.cancelled` →
 *     durable. These lifecycle transitions ARE the immutable historical
 *     record stored at `{bucket}/runs/.../events/{seq}.json`
 *     (data-model.md § Storage layout).
 *
 * JUDGMENT (named, not spec-pinned):
 *   - `run.progress` → aggregated. Progress ticks are high-frequency; the
 *     durable object set is "sparse by design" (research.md line ~80), so the
 *     immutable record is start + terminal + bounded snapshots, and progress
 *     rolls into the derived summary (data-model.md § Derived artifact).
 *     Minting one durable object per progress tick is precisely the cost
 *     failure FR-015 exists to prevent — so progress is aggregated, not
 *     durable. If a later decision needs per-tick durability, it changes this
 *     one entry and nothing else.
 */
const EVENT_CLASSIFICATIONS: ReadonlyMap<EventType, EventClassification> =
  new Map<EventType, EventClassification>([
    // live-only — never durably stored
    ['session.heartbeat', 'live-only'],
    // aggregated — rolled into a summary
    ['invocation.completed', 'aggregated'],
    ['run.progress', 'aggregated'],
    // durable — its own immutable object (the historical record)
    ['session.started', 'durable'],
    ['session.ended', 'durable'],
    ['run.started', 'durable'],
    ['run.completed', 'durable'],
    ['run.failed', 'durable'],
    ['run.cancelled', 'durable'],
    ['phase.entered', 'durable'],
  ]);

/**
 * Is `type` a registered event type? The guard a caller uses to check before
 * classifying, when it wants to branch rather than fail.
 */
export function isKnownEventType(type: EventType): boolean {
  return EVENT_CLASSIFICATIONS.has(type);
}

/** The registered event types, as a fresh array (never the backing map). */
export function knownEventTypes(): EventType[] {
  return [...EVENT_CLASSIFICATIONS.keys()];
}

/**
 * Classify an event by its `type`. The classification is a function of the
 * event TYPE alone — never of emission, rate, or any envelope field.
 *
 * Fails LOUD on an unregistered type (Principle V): an unknown event type is
 * NOT silently defaulted. Defaulting to `durable` would mint objects nobody
 * asked for (a cost bug); defaulting to `live-only` would silently drop
 * history (a data-loss bug). Both directions are wrong, so an unknown type is
 * a hard error naming the offending type and pointing at the catalog.
 */
export function classifyEvent(type: EventType): EventClassification {
  const classification = EVENT_CLASSIFICATIONS.get(type);
  if (classification === undefined) {
    throw new Error(
      `classifyEvent: unknown event type ${JSON.stringify(type)} — every event ` +
        'type must be registered in the classification catalog (src/fleet/' +
        'classification.ts) with an explicit live-only | aggregated | durable ' +
        'classification. Refusing to default: defaulting to durable would mint ' +
        'objects nobody asked for (a cost bug), defaulting to live-only would ' +
        'drop history (a data-loss bug).',
    );
  }
  return classification;
}

/**
 * Does an event of this classification mint its own durable object? Derived
 * purely from the class via `CLASS_STORAGE_POLICY` — the storage cost of an
 * event is a property of its CLASS, not its type, which is what makes
 * "classification decides cost" true by construction. The rollup machinery,
 * when built, will add behavior for the `feedsRollup` classes without
 * touching this function.
 */
export function mintsDurableObject(
  classification: EventClassification,
): boolean {
  return CLASS_STORAGE_POLICY[classification].mintsDurableObject;
}
