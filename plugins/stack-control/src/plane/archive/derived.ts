// specs/036-fleet-control-plane — T098 (impl), pairs with the RED test at
// tests/fleet/late-event.test.ts (T093).
//
// The derived-artifact writer owns the plane-computed, cached, REVISIONED view
// over finalized run data.
//
// data-model.md § Derived artifact (line ~154):
//   "Plane-computed, cached, revisioned view over finalized run data. Revision
//    lives IN the key. The plane's own index holds the current revision — it
//    derived the artifact, so it never needs to discover it."
//
// § Storage layout invariants (line ~149):
//   "A late event lands as a new object and triggers a new derived-artifact
//    REVISION — it never rewrites a stored object." And "NEVER purge — a new
//    revision is a new URL, so staleness is unrepresentable rather than
//    operationally avoided." (SC-010 / FR-066.)
//
// Consequence for this module: the revision is CALLER-SUPPLIED (the plane's
// own index decides the next revision, out of scope here). Writing revision
// N+1 issues a fresh `putObject` at a NEW key and mutates ZERO already-
// published objects — staleness is unrepresentable because the stale revision
// simply keeps its own distinct URL.
//
// Relative `.js` imports (node16 module resolution, no `@/` alias). No `any`,
// no `as`, no `@ts-ignore`. Throws descriptive errors — never a fallback.

import type { ObjectStorePort } from '../../storage/port.js';

/** Reject a revision that is not a positive integer. Revisions start at 1;
 * 0 or a fraction is a caller bug — surface it loudly. */
function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `${label} must be a positive integer (>= 1), received: ${String(value)}`,
    );
  }
}

/** Inputs to `derivedObjectKey`. */
export interface DerivedObjectKeyInput {
  readonly installationId: string;
  readonly runId: string;
  readonly revision: number;
}

/**
 * Deterministic object key for a derived-summary revision.
 *
 * `runs/{installationId}/{runId}/derived/summary-{revision}.json`
 *
 * The revision lives in the key: revision N+1 is a genuinely new URL, so
 * revision N is never overwritten — that is what makes staleness
 * unrepresentable rather than something to guard against.
 */
export function derivedObjectKey(input: DerivedObjectKeyInput): string {
  assertPositiveInteger(input.revision, 'revision');
  return `runs/${input.installationId}/${input.runId}/derived/summary-${input.revision}.json`;
}

/** The object store the derived writer publishes into. */
export interface DerivedWriterDeps {
  readonly store: ObjectStorePort;
}

/** Inputs to `writeDerivedRevision`. `revision` is caller-supplied — the
 * plane's index owns "which revision is next"; this module only writes it. */
export interface WriteDerivedRevisionInput {
  readonly installationId: string;
  readonly runId: string;
  readonly revision: number;
  readonly body: Uint8Array;
}

/**
 * Publish a derived-summary revision at its own revision-keyed URL.
 *
 * A late event ⇒ the plane computes a NEW revision and calls this with that
 * revision number; the result is a fresh `putObject` at a new key. No prior
 * published object (event or earlier derived revision) is touched — the count
 * of PUTs per key stays exactly 1 (asserted by tests/fleet/late-event.test.ts).
 */
export async function writeDerivedRevision(
  deps: DerivedWriterDeps,
  input: WriteDerivedRevisionInput,
): Promise<{ key: string }> {
  const key = derivedObjectKey({
    installationId: input.installationId,
    runId: input.runId,
    revision: input.revision,
  });
  await deps.store.putObject({ key, body: input.body });
  return { key };
}
