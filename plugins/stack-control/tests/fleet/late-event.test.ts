/**
 * specs/036-fleet-control-plane — T093 (RED), pairs with T097 impl
 * (`src/plane/archive/writer.ts`) + T098 impl (`src/plane/archive/derived.ts`).
 *
 * data-model.md § Storage layout invariants (line ~149-152):
 *   "Published event objects are never mutated (FR-066). A late event
 *    lands as a new object and triggers a new derived-artifact revision —
 *    it never rewrites a stored object."
 * data-model.md § Derived artifact (line ~154-156):
 *   "Plane-computed, cached, revisioned view over finalized run data.
 *    Revision lives in the key."
 *
 * This is the ARCHIVE-side counterpart to Phase 6's ingest `late` outcome
 * (`tests/fleet/ingest.test.ts` case (e): "a late event (arriving after a
 * run looks final) is handed to the durable-store seam, not discarded").
 * Phase 6 proves ingest hands the straggler off instead of dropping it;
 * this test proves what the ARCHIVE does with it once it arrives: write a
 * genuinely NEW object at a NEW key, and produce a NEW derived revision —
 * WITHOUT ever re-PUTting (mutating) an object already published for this
 * run.
 *
 * Scenario modeled:
 *   1. A normal run archives two events (sequence 1, 2).
 *   2. The run "finalizes" — a derived summary artifact is computed and
 *      written at revision 1.
 *   3. A genuinely later event (sequence 3) arrives AFTER that
 *      finalization — the late-event case.
 *   4. The late event is archived (a NEW object, sequence 3's own key —
 *      never overwriting sequence 1 or 2's keys).
 *   5. Because the late event invalidates the already-published summary,
 *      a NEW derived revision (2) is computed and written at a NEW key —
 *      never overwriting revision 1's key.
 *
 * Assertions use an injected RECORDING fake `ObjectStorePort` (real
 * fixture, no mocks, no network) that counts `putObject` calls PER KEY —
 * the concrete, falsifiable form of "zero already-published objects
 * mutated": every key must show a put-count of exactly 1, for the whole
 * scenario, including after the late event lands.
 *
 * RED: `src/plane/archive/writer.ts` and `src/plane/archive/derived.ts` do
 * not exist yet — the VALUE imports below fail at module-load
 * (module-not-found), the correct failing-first signal, never a typo.
 *
 * Relative `.js` imports (node16 module resolution, no `@/` alias). No
 * `any`, no `as`, no `@ts-ignore`.
 */

import { describe, expect, it } from 'vitest';
import type { ObjectMetadata, ObjectStorePort, PutObjectInput } from '../../src/storage/port.js';
import { archiveEvent, eventObjectKey } from '../../src/plane/archive/writer.js';
import { derivedObjectKey, writeDerivedRevision } from '../../src/plane/archive/derived.js';

/**
 * In-memory RECORDING fake of `ObjectStorePort`. Legitimate TEST code
 * (never a production fallback, project no-fallback rule) — its job is to
 * make "zero already-published objects mutated" a falsifiable count rather
 * than a narrative claim: `putCounts.get(key)` must never exceed 1 for any
 * key this scenario touches.
 */
class RecordingObjectStore implements ObjectStorePort {
  private readonly objects = new Map<string, Uint8Array>();
  readonly putCounts = new Map<string, number>();

  async putObject(input: PutObjectInput): Promise<void> {
    this.putCounts.set(input.key, (this.putCounts.get(input.key) ?? 0) + 1);
    this.objects.set(input.key, input.body);
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key) ?? null;
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    const body = this.objects.get(key);
    if (body === undefined) {
      return null;
    }
    return { key, size: body.byteLength };
  }

  async listObjects(prefix: string): Promise<readonly ObjectMetadata[]> {
    const results: ObjectMetadata[] = [];
    for (const [key, body] of this.objects) {
      if (key.startsWith(prefix)) {
        results.push({ key, size: body.byteLength });
      }
    }
    return results;
  }
}

const encoder = new TextEncoder();

describe('late event archival (T093, data-model § invariants, SC-010/FR-066)', () => {
  it('a late event lands as a NEW object + triggers a NEW derived revision — never mutating an already-published key', async () => {
    const store = new RecordingObjectStore();
    const installationId = 'installation-1';
    const runId = 'run-late';

    // 1. Normal run: two events archive cleanly.
    const eventOne = await archiveEvent(
      { store },
      { installationId, runId, invocationSequence: 1, body: encoder.encode(JSON.stringify({ eventId: 'e1' })) },
    );
    const eventTwo = await archiveEvent(
      { store },
      { installationId, runId, invocationSequence: 2, body: encoder.encode(JSON.stringify({ eventId: 'e2' })) },
    );
    expect(eventOne.key).toBe(eventObjectKey({ installationId, runId, invocationSequence: 1 }));
    expect(eventTwo.key).toBe(eventObjectKey({ installationId, runId, invocationSequence: 2 }));

    // 2. Finalization: derived summary revision 1 is computed + written.
    const revisionOne = await writeDerivedRevision(
      { store },
      { installationId, runId, revision: 1, body: encoder.encode(JSON.stringify({ eventCount: 2 })) },
    );
    expect(revisionOne.key).toBe(derivedObjectKey({ installationId, runId, revision: 1 }));

    // Baseline: every key published so far has been PUT exactly once.
    expect(store.putCounts.get(eventOne.key)).toBe(1);
    expect(store.putCounts.get(eventTwo.key)).toBe(1);
    expect(store.putCounts.get(revisionOne.key)).toBe(1);

    // 3-4. A late straggler (sequence 3) arrives AFTER finalization and is
    // archived — a genuinely NEW object at a NEW key.
    const lateEvent = await archiveEvent(
      { store },
      { installationId, runId, invocationSequence: 3, body: encoder.encode(JSON.stringify({ eventId: 'e3' })) },
    );

    expect(lateEvent.key).toBe(eventObjectKey({ installationId, runId, invocationSequence: 3 }));
    expect(lateEvent.key).not.toBe(eventOne.key);
    expect(lateEvent.key).not.toBe(eventTwo.key);

    // 5. The late event forces a NEW derived revision (2) — never
    // overwriting revision 1's key.
    const revisionTwo = await writeDerivedRevision(
      { store },
      { installationId, runId, revision: 2, body: encoder.encode(JSON.stringify({ eventCount: 3 })) },
    );

    expect(revisionTwo.key).toBe(derivedObjectKey({ installationId, runId, revision: 2 }));
    expect(revisionTwo.key).not.toBe(revisionOne.key);

    // ZERO already-published objects were mutated: every key this
    // scenario ever touched — including after the late event and its
    // derived revision — was PUT exactly once, never twice.
    expect(store.putCounts.get(eventOne.key)).toBe(1);
    expect(store.putCounts.get(eventTwo.key)).toBe(1);
    expect(store.putCounts.get(lateEvent.key)).toBe(1);
    expect(store.putCounts.get(revisionOne.key)).toBe(1);
    expect(store.putCounts.get(revisionTwo.key)).toBe(1);

    // Exactly 5 distinct keys were ever written — no key reused, no key
    // skipped.
    expect(store.putCounts.size).toBe(5);
  });
});
