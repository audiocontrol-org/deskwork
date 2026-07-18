// specs/036-fleet-control-plane — T079 (RED), Phase 6 (US4 — trust what the
// fleet says), pairs with T086's `src/sidecar/pipeline.ts` impl (and, further
// downstream, T084's WAL spool).
//
// CONTRACT UNDER TEST (data-model.md § Delivery semantics, FR-042/FR-043,
// SC-015): transmission is AT-LEAST-ONCE, so the same sidecar-assigned event
// may reach the plane MORE THAN ONCE and OUT OF ORDER. Despite that, the
// live registry must land on the CORRECT final state and must NEVER walk
// derived execution status backward at any intermediate point — no-regress
// (FR-042) is an ordering invariant that has to hold at every delivery, not
// just once all deliveries have landed.
//
// WHY THIS IS RED AT MODULE LOAD (not a typo): `buildRegistry` (src/plane/
// registry.ts) and `ingestEvent` (src/plane/http/ingest.ts) ALREADY implement
// no-regress + effectively-once and are already covered by tests/fleet/
// registry.test.ts + tests/fleet/ingest.test.ts — replaying duplicates/
// reorders through those two alone would already be GREEN today, which is
// not a valid RED for this task. What does NOT exist yet is the sidecar side
// of the story this task is actually pinning: a real duplicate/reorder only
// arises because the SIDECAR PIPELINE (T086, `src/sidecar/pipeline.ts`)
// assigns `eventId` + `invocationSequence` ONCE per logical event and then
// (per FR-049 byte-identity) retransmits the IDENTICAL envelope on retry.
// This test imports `createPipeline` (a VALUE) from that not-yet-created
// module to mint the sidecar-identical envelopes it then delivers duplicated
// and out of order — so the import itself fails module-not-found, which is
// the correct RED for a seam nothing has built yet.
//
// EXPECTED SURFACE THIS TEST ASSUMES OF `src/sidecar/pipeline.ts` (T086):
//
//   export interface RawInvocationEvent {
//     readonly installationId: string;
//     readonly invocationId: string;
//     readonly runId: string | null;
//     readonly type: EventType;
//     readonly classification: EventClassification;
//   }
//
//   export interface SidecarPipeline {
//     // receive -> validate -> normalize+redact -> assign eventId+sequence
//     // -> spool (to the WAL rooted at the dir createPipeline was given).
//     // Transmit is a separate concern (a poller draining the WAL); this
//     // method returns the fully-formed, spooled TelemetryEvent so a test
//     // (or a real transmitter) can hand it to the plane.
//     receive(raw: RawInvocationEvent): Promise<TelemetryEvent>;
//   }
//
//   export function createPipeline(walDir: string): SidecarPipeline;
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). Real fixtures (a real tmp dir for the pipeline's WAL root), no
// mocked filesystem.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EventClassification, EventType } from '../../src/fleet/types.js';
import type { TelemetryEvent } from '../../src/fleet/event.js';
import {
  createIngestState,
  ingestEvent,
  type DurableEventStore,
  type IngestState,
} from '../../src/plane/http/ingest.js';
import { buildRegistry, type ClassifiedEvent, type FleetEntry } from '../../src/plane/registry.js';
// The seam under test — T086, does not exist yet. This import is the RED:
// the whole file fails to load ("Cannot find module") until pipeline.ts
// lands, which is exactly the failure mode this task wants pinned.
import { createPipeline, type RawInvocationEvent, type SidecarPipeline } from '../../src/sidecar/pipeline.js';

/** In-memory fake of the durable-store hand-off seam (legitimate test code,
 * never a production fallback — project no-fallback rule). */
class FakeDurableEventStore implements DurableEventStore {
  readonly stored: TelemetryEvent[] = [];
  async storeLateEvent(event: TelemetryEvent): Promise<void> {
    this.stored.push(event);
  }
}

/** Execution-status monotonic rank for SC-015's "never walks backward" check.
 * Active statuses share rank 1 (started -> running is a legitimate forward
 * move; repeated `run.progress` keeps the same rank, which is NOT a
 * regression); terminal statuses share rank 2 (this scenario never crosses
 * between two different terminal statuses, so a flat terminal tier is
 * sufficient here). */
const STATUS_RANK: Readonly<Record<string, number>> = {
  starting: 0,
  running: 1,
  paused: 1,
  cancelling: 1,
  completed: 2,
  failed: 2,
  cancelled: 2,
};

function raw(
  installationId: string,
  invocationId: string,
  runId: string | null,
  type: EventType,
  classification: EventClassification = 'durable',
): RawInvocationEvent {
  return { installationId, invocationId, runId, type, classification };
}

describe('sidecar pipeline -> plane ingest -> registry: duplicate + reordered delivery (T079, SC-015)', () => {
  let walDir: string;

  afterEach(() => {
    if (walDir !== undefined) {
      rmSync(walDir, { recursive: true, force: true });
    }
  });

  it('lands on the correct final state and never regresses executionStatus mid-stream', async () => {
    walDir = mkdtempSync(join(tmpdir(), 'pipeline-dedupe-reorder-'));
    const pipeline: SidecarPipeline = createPipeline(walDir);

    const installationId = 'installation-dedupe-reorder';
    const invocationId = 'invocation-dedupe-reorder';
    const runId = 'run-dedupe-reorder';

    // Sidecar-side emission order: started -> progress -> progress -> completed.
    // Each call assigns a fresh, monotonic eventId + invocationSequence exactly
    // once — retries of the SAME logical event must re-send these byte-identical
    // (FR-049), which is what createPipeline's caller is expected to do below.
    const started = await pipeline.receive(raw(installationId, invocationId, runId, 'run.started'));
    const progress1 = await pipeline.receive(raw(installationId, invocationId, runId, 'run.progress'));
    const progress2 = await pipeline.receive(raw(installationId, invocationId, runId, 'run.progress'));
    const completed = await pipeline.receive(raw(installationId, invocationId, runId, 'run.completed'));

    // AT-LEAST-ONCE + REORDERED delivery to the plane: the transport is free to
    // duplicate and reorder (data-model.md § Delivery semantics). Delivery order
    // deliberately does NOT match emission order, and `started`/`progress2` are
    // each delivered twice (transport-level retry of the identical envelope).
    const deliveryOrder: TelemetryEvent[] = [
      started,
      completed, // arrives BEFORE progress2/progress1 — genuine reorder
      progress2, // duplicate #1 of progress2 (also out of order vs progress1)
      progress1,
      progress2, // duplicate #2 of progress2
      started, // duplicate of started, arriving last
    ];

    const ingestState: IngestState = createIngestState();
    const deps = { durableStore: new FakeDurableEventStore() };

    const accepted: ClassifiedEvent[] = [];
    const statusHistory: string[] = [];

    for (const event of deliveryOrder) {
      const outcome = await ingestEvent(ingestState, deps, event);
      if (outcome.kind === 'accepted') {
        accepted.push(outcome.event);
      }

      // SC-015: rebuild the registry after EVERY delivery (accepted or not) and
      // assert executionStatus never walks backward, at ANY intermediate point
      // — not just once the whole stream has landed.
      const entry = buildRegistry(accepted).entries().find((candidate): candidate is FleetEntry => candidate.runId === runId);
      if (entry !== undefined) {
        const rank = STATUS_RANK[entry.statusAxes.executionStatus];
        if (rank === undefined) {
          throw new Error(`unranked executionStatus in test: ${entry.statusAxes.executionStatus}`);
        }
        if (statusHistory.length > 0) {
          const previousRank = STATUS_RANK[statusHistory[statusHistory.length - 1]];
          expect(rank).toBeGreaterThanOrEqual(previousRank);
        }
        statusHistory.push(entry.statusAxes.executionStatus);
      }
    }

    // Final state: correct despite duplication + reordering.
    const finalRegistry = buildRegistry(accepted);
    const finalEntry = finalRegistry.entries().find((candidate) => candidate.runId === runId);
    expect(finalEntry).toBeDefined();
    if (finalEntry === undefined) throw new Error('unreachable');

    expect(finalEntry.statusAxes.executionStatus).toBe('completed');
    // No-regress applies to COUNTING too (AUDIT-20260717-04). In THIS delivery
    // order both progress ticks (seq 2 and 3) arrive AFTER `completed` (seq 4)
    // has already advanced the run's high-water mark to 4 — so each is a
    // stale/superseded delivery under the same no-regress contract
    // `ingest.test.ts` case (c) pins. A stale progress event must NEVER
    // increment `progressEventCount` (counting it would reintroduce exactly the
    // over-count no-regress exists to prevent). The correct final count for
    // this reordered delivery is therefore 0, not 2.
    expect(finalEntry.progress.progressEventCount).toBe(0);
    expect(finalEntry.progress.latestInvocationSequence).toBe(completed.envelope.invocationSequence);
    expect(finalEntry.availableActions).toEqual([]); // completed run offers no actions
  });
});
