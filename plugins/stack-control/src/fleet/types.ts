// specs/036-fleet-control-plane — T013 (impl), pairs with T012's RED test.
//
// Identity + envelope TYPES per data-model.md § Identity (line ~8-22) and
// § Event → Envelope (line ~43-58). Field types are described structurally
// in data-model.md, not as TypeScript source — this file is that landing.
//
// SCOPE (per the task pairing): types + the minimal identity-mint helpers
// the RED test asserts version-shape against. Envelope CONSTRUCTION and
// VALIDATION (deriving sequences, computing monotonicOffsetMs, enforcing
// the "eventId is never an ordering key" rule) is T014/T015's job
// (src/fleet/event.ts) — deliberately not built here.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI).

import { randomUUID } from 'node:crypto';
import { uuidv7 } from 'uuidv7';

/**
 * Mint a fresh `installationId`. **UUIDv4** deliberately (data-model.md
 * § Identity) — an installation id is never sorted, and a time-ordered id
 * would leak installation mint time for no benefit. Minted once per
 * installation, re-minted on clone/copy; storage lifetime is the
 * machine-local durable store's concern (src/machine-state/*), not this
 * function's.
 */
export function mintInstallationId(): string {
  return randomUUID();
}

/**
 * Mint a fresh **UUIDv7** identity value. Shared generator for every
 * UUIDv7 identity data-model.md § Identity lists: `invocationId`, `runId`,
 * `eventId`, `commandId`. UUIDv7 is time-ordered by construction, but per
 * data-model.md "`eventId` is identity, NEVER an ordering key" — callers
 * MUST NOT rely on the time-ordering for domain sequencing; that is
 * `invocationSequence`'s job (envelope field below).
 */
export function mintUuidV7(): string {
  return uuidv7();
}

/** Event envelope `type` values recognized at this layer (extended by
 * event.ts as domain event types are added; the envelope shape itself is
 * type-agnostic per data-model.md § Event). */
export type EventType = string;

/**
 * The three envelope-level classifications data-model.md § Event → Envelope
 * defines. Classification decides delivery cost (FR-015) — it is a
 * property of the envelope, never derived from `type`.
 */
export type EventClassification = 'live-only' | 'aggregated' | 'durable';

/**
 * Event envelope (data-model.md § Event → Envelope). One of the three
 * separable parts of an Event (FR-044); the other two (Snapshot, Domain
 * events) are separate structures, not fields of this type.
 *
 * Field-by-field provenance (data-model.md table):
 * - `eventId`            UUIDv7 — globally unique; dedupe key.
 * - `installationId`     UUIDv4.
 * - `invocationId`       UUIDv7.
 * - `runId`               UUIDv7 | null — null for non-run invocations.
 * - `installationSequence` transport diagnostics ONLY (FR-041) — never
 *   domain ordering.
 * - `invocationSequence`   the sequence with domain meaning (FR-040).
 * - `schemaVersion`        integer.
 * - `type`                 event type.
 * - `wallClock`            ISO-8601 — describes; never orders (PT-013).
 * - `monotonicOffsetMs`    computed at source.
 * - `classification`       decides cost, not `type` (FR-015).
 */
export interface EventEnvelope {
  readonly eventId: string;
  readonly installationId: string;
  readonly invocationId: string;
  readonly runId: string | null;
  readonly installationSequence: number;
  readonly invocationSequence: number;
  readonly schemaVersion: number;
  readonly type: EventType;
  readonly wallClock: string;
  readonly monotonicOffsetMs: number;
  readonly classification: EventClassification;
}
