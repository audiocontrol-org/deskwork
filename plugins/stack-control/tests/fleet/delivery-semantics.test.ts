// specs/036-fleet-control-plane — T081 (RED), Phase 6 (US4 — trust what the
// fleet says), pairs with a new `src/fleet/delivery.ts` impl.
//
// CONTRACT UNDER TEST (data-model.md § Delivery semantics, FR-043):
//
//   - transmission:       at-least-once
//   - ingestion:           idempotent
//   - registry application: effectively-once
//
//   "Never exactly-once. Durable storage may transiently contain duplicate
//   attempts unless object naming makes duplication impossible — which,
//   here, it does."
//
// This is a PINNING test: it exists so the three-layer contract is a typed,
// importable, single source of truth (never re-derived or restated ad hoc
// in prose comments scattered across registry.ts / ingest.ts / pipeline.ts,
// which currently each restate it independently), and so "exactly-once" is
// asserted ABSENT, not just "not mentioned".
//
// SEAM CHOSEN: a new, narrow module — `src/fleet/delivery.ts` — rather than
// hanging this off `src/sidecar/pipeline.ts` (T086). Reasoning: the delivery
// semantics are a plane-wide contract (transmission is the sidecar's job,
// ingestion is the plane HTTP boundary's job, registry application is
// registry.ts's job) — no single one of those three modules owns the
// combined statement, and pipeline.ts (sidecar-only) is the wrong owner for
// a claim that also describes ingest.ts and registry.ts. A dedicated
// `src/fleet/delivery.ts` (alongside the other cross-cutting `src/fleet/*`
// contract modules — `command.ts`, `status.ts`, `sequence.ts`) is the
// existing convention for "a typed contract statement multiple layers
// import/cite" (T081's Note on T135-T139 groups it as a Phase 6 doc/pin task).
//
// WHY THIS IS RED AT MODULE LOAD (not a typo): `src/fleet/delivery.ts` does
// not exist yet. This test imports `DELIVERY_SEMANTICS` (a VALUE) from that
// module, so the import itself fails module-not-found until the module lands.
//
// EXPECTED SURFACE THIS TEST ASSUMES OF `src/fleet/delivery.ts` (new, T081):
//
//   export type TransmissionSemantics = 'at-least-once';
//   export type IngestionSemantics = 'idempotent';
//   export type RegistryApplicationSemantics = 'effectively-once';
//
//   export interface DeliverySemantics {
//     readonly transmission: TransmissionSemantics;
//     readonly ingestion: IngestionSemantics;
//     readonly registryApplication: RegistryApplicationSemantics;
//   }
//
//   export const DELIVERY_SEMANTICS: DeliverySemantics;
//
// Because each field's TYPE is a single string-literal type (not a union
// that happens to exclude 'exactly-once' today), 'exactly-once' cannot be
// assigned to any of the three fields WITHOUT a type error — the absence is
// enforced at the type level, not just checked by a runtime string compare.
// This test still asserts the runtime values directly (belt-and-suspenders,
// and the only way a `.test.ts` run under esbuild-stripped types can
// observe the claim at all).
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias).

import { describe, expect, it } from 'vitest';
import { DELIVERY_SEMANTICS } from '../../src/fleet/delivery.js';

describe('delivery semantics are documented and pinned (T081, FR-043)', () => {
  it('transmission is at-least-once', () => {
    expect(DELIVERY_SEMANTICS.transmission).toBe('at-least-once');
  });

  it('ingestion is idempotent', () => {
    expect(DELIVERY_SEMANTICS.ingestion).toBe('idempotent');
  });

  it('registry application is effectively-once', () => {
    expect(DELIVERY_SEMANTICS.registryApplication).toBe('effectively-once');
  });

  it('never claims exactly-once, at any layer', () => {
    const values = Object.values(DELIVERY_SEMANTICS);
    expect(values).not.toContain('exactly-once');
    expect(values).toEqual(['at-least-once', 'idempotent', 'effectively-once']);
  });

  it('exposes exactly the three named layers — no additional or missing axis', () => {
    expect(Object.keys(DELIVERY_SEMANTICS).sort()).toEqual(
      ['ingestion', 'registryApplication', 'transmission'].sort(),
    );
  });
});
