// specs/036-fleet-control-plane — T081 (impl), Phase 6 (US4 — trust what the
// fleet says), pairs with T081's RED test at tests/fleet/delivery-semantics.test.ts.
//
// Delivery semantics per data-model.md § Delivery semantics (~173) and FR-043:
//
//   - transmission:       at-least-once
//   - ingestion:           idempotent
//   - registry application: effectively-once
//
// "Never exactly-once. Durable storage may transiently contain duplicate
// attempts unless object naming makes duplication impossible — which,
// here, it does."
//
// This module exists to state the three-layer contract in a single, typed,
// importable place — never re-derived or restated ad hoc in prose comments
// scattered across registry.ts / ingest.ts / pipeline.ts. The contract is
// a plane-wide invariant: transmission is the sidecar's job, ingestion is
// the plane HTTP boundary's job, registry application is registry.ts's job.
// No single one of those three modules owns the combined statement, so this
// contract lives in a dedicated `src/fleet/` module (alongside other
// cross-cutting contract modules like `command.ts`, `status.ts`, `sequence.ts`).
//
// Each field's TYPE is a single string-literal type (not a union that
// happens to exclude 'exactly-once' today), so 'exactly-once' cannot be
// assigned to any of the three fields WITHOUT a type error — the absence
// is enforced at the type level, not just checked by a runtime string compare.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI).

/** Transmission: the sidecar's delivery guarantee to the plane. */
export type TransmissionSemantics = 'at-least-once';

/** Ingestion: the plane's deduplication guarantee at the HTTP boundary. */
export type IngestionSemantics = 'idempotent';

/**
 * Registry application: the plane's atomicity guarantee when applying events
 * to the canonical registry. Object naming makes duplication impossible.
 */
export type RegistryApplicationSemantics = 'effectively-once';

/**
 * The three-layer delivery contract, carried together as an immutable
 * declaration. Each field independently states its semantic guarantee;
 * no guarantee can be escalated to exactly-once without changing the contract.
 */
export interface DeliverySemantics {
  readonly transmission: TransmissionSemantics;
  readonly ingestion: IngestionSemantics;
  readonly registryApplication: RegistryApplicationSemantics;
}

/** The declared delivery semantics across all three layers. */
export const DELIVERY_SEMANTICS: DeliverySemantics = {
  transmission: 'at-least-once',
  ingestion: 'idempotent',
  registryApplication: 'effectively-once',
} as const satisfies DeliverySemantics;
