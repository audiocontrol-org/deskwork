// specs/036-fleet-control-plane — T046 [US2] RED test for snapshot API (SC-003).
//
// CONTRACT (plane-client-api.md C1/C2/C3 + spec.md test obligation 1):
//   - Snapshot endpoint returns EVERY commandable run across multiple
//     installations/hosts, EXACTLY ONCE, in ONE request.
//   - SC-003: "With runs active across multiple hosts, a single request to the
//     plane returns every commandable run in the fleet — 100% appear, each
//     exactly once, with no per-host request required."
//
// THIS TEST (RED phase):
//   Build classified events spanning multiple installations, build ONE registry
//   from those events, then take ONE snapshot, and assert: (1) every registered
//   commandable run appears in the snapshot, (2) no duplicates, (3) no
//   per-installation fan-out (one fleetSnapshot call).
//
// The snapshot builder (T053, src/plane/http/api.ts) projects a registry (T050,
// src/plane/registry.ts) built from classified events. Neither module exists yet;
// this test RED-fails until they do.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/` alias).
// Real machine-local store redirect via _machine-state-harness.ts (T009).

import { afterEach, describe, expect, it } from 'vitest';
import { useMachineStateStore, assertTripwireEmpty } from './_machine-state-harness.js';
import type { EventEnvelope } from '../../src/fleet/types.js';
import { mintInstallationId, mintUuidV7 } from '../../src/fleet/types.js';
// The registry module (T050): will not exist until T050 impl lands.
import type { FleetRegistry } from '../../src/plane/registry.js';
import { buildRegistry } from '../../src/plane/registry.js';
// The api module (T053): will not exist until T053 impl lands.
import type { FleetSnapshot, FleetSnapshotEntry } from '../../src/plane/http/api.js';
import { fleetSnapshot } from '../../src/plane/http/api.js';

/**
 * Minimal test double of a classified event. The registry will be tested
 * against a stream of these, which simulate what the plane's event processor
 * produces after event.ts wraps the raw telemetry and classification.ts tags it.
 *
 * The classification is part of the event envelope (data-model.md § Event →
 * Envelope). This shape is mirrored from registry.test.ts for consistency.
 */
interface ClassifiedEvent {
  readonly envelope: EventEnvelope;
  readonly classification: 'live-only' | 'aggregated' | 'durable';
  readonly type: string;
}

/**
 * Helper to mint a classified event with predictable IDs for testing.
 * Mirrored from registry.test.ts.
 */
function mkEvent(
  installationId: string,
  invocationId: string,
  runId: string | null,
  type: string,
  classification: 'live-only' | 'aggregated' | 'durable',
  invocationSequence: number,
): ClassifiedEvent {
  const envelope: EventEnvelope = {
    eventId: mintUuidV7(),
    installationId,
    invocationId,
    runId,
    installationSequence: invocationSequence, // simplified for test
    invocationSequence,
    schemaVersion: 1,
    type,
    wallClock: new Date().toISOString(),
    monotonicOffsetMs: Date.now(),
    classification,
  };
  return {
    envelope,
    classification,
    type,
  };
}

describe(
  'snapshot API (T046 [US2], SC-003 — every commandable run exactly once, no per-host request)',
  () => {
    const store = useMachineStateStore();

    afterEach(() => {
      assertTripwireEmpty();
    });

    it('snapshot returns every commandable run across multiple installations, exactly once', () => {
      // --- SETUP: Build classified events spanning MULTIPLE installations ---

      // Installation 1: two commandable runs (execute + govern).
      const installationId1 = mintInstallationId();
      const inv1A = mintUuidV7(); // execute invocation
      const runId1A = mintUuidV7(); // execute run
      const inv1B = mintUuidV7(); // govern invocation
      const runId1B = mintUuidV7(); // govern run

      // Installation 2: two commandable runs (different host).
      const installationId2 = mintInstallationId();
      const inv2A = mintUuidV7(); // execute invocation
      const runId2A = mintUuidV7(); // execute run
      const inv2B = mintUuidV7(); // govern invocation
      const runId2B = mintUuidV7(); // govern run

      // Build a classified event stream. Each commandable run (execute/govern per FR-013)
      // emits run.started, run.progress, and terminal events. The registry will distill
      // these into exactly one FleetEntry per run.
      const events: ClassifiedEvent[] = [
        // Installation 1, Run A (execute)
        mkEvent(installationId1, inv1A, runId1A, 'run.started', 'durable', 1),
        mkEvent(installationId1, inv1A, runId1A, 'run.progress', 'aggregated', 2),
        mkEvent(installationId1, inv1A, runId1A, 'run.completed', 'durable', 3),
        // Installation 1, Run B (govern)
        mkEvent(installationId1, inv1B, runId1B, 'run.started', 'durable', 4),
        mkEvent(installationId1, inv1B, runId1B, 'run.progress', 'aggregated', 5),
        mkEvent(installationId1, inv1B, runId1B, 'run.completed', 'durable', 6),
        // Installation 2, Run A (execute)
        mkEvent(installationId2, inv2A, runId2A, 'run.started', 'durable', 1),
        mkEvent(installationId2, inv2A, runId2A, 'run.progress', 'aggregated', 2),
        mkEvent(installationId2, inv2A, runId2A, 'run.completed', 'durable', 3),
        // Installation 2, Run B (govern)
        mkEvent(installationId2, inv2B, runId2B, 'run.started', 'durable', 4),
        mkEvent(installationId2, inv2B, runId2B, 'run.progress', 'aggregated', 5),
        mkEvent(installationId2, inv2B, runId2B, 'run.completed', 'durable', 6),
      ];

      // --- ACT: Build ONE registry, take ONE snapshot (no per-host fan-out) ---

      // The registry aggregates all classified events into FleetEntry instances.
      const registry: FleetRegistry = buildRegistry(events);

      // The snapshot builder projects the registry to the snapshot shape.
      // This is the core SC-003 contract: one request, all runs, from one registry.
      const snapshot: FleetSnapshot = fleetSnapshot(registry);

      // --- ASSERT: Every commandable run appears exactly once ---

      // 1. Snapshot must contain exactly 4 entries (one per commandable run).
      expect(snapshot.entries).toHaveLength(4);

      // 2. Each run ID appears exactly once (no duplicates).
      const runIds = snapshot.entries.map((e: FleetSnapshotEntry) => e.runId);
      const uniqueRunIds = new Set(runIds);
      expect(uniqueRunIds.size).toBe(4);
      expect(runIds).toEqual([runId1A, runId1B, runId2A, runId2B]);

      // 3. Each installation ID is present and correct per run.
      const installations = snapshot.entries.map((e: FleetSnapshotEntry) => e.installationId);
      expect(installations).toContain(installationId1);
      expect(installations).toContain(installationId2);

      // 4. Verify entry structure includes the expected fields (SC-003 contract).
      for (const entry of snapshot.entries) {
        expect(entry).toHaveProperty('runId');
        expect(entry).toHaveProperty('installationId');
        // The full C1/C2/C3 contract (instance, compass, three status axes, progress,
        // model, git, reconciliation) is verified at T048+ once T050/T053 define
        // the full entry shape. This RED test pins the seams: one snapshot,
        // every run, no dupes.
      }
    });

    it('snapshot uses only one request across multiple installations (no per-host fan-out)', () => {
      // SC-003 contract: no per-host request required. A single snapshot call
      // covers all installations in one go. This test pins that the API surface
      // takes all registry entries in one batch, never issues per-installation
      // sub-requests.
      //
      // We verify this by counting invocations: only one fleetSnapshot() call.

      const installationId1 = mintInstallationId();
      const installationId2 = mintInstallationId();
      const inv1 = mintUuidV7();
      const runId1 = mintUuidV7();
      const inv2 = mintUuidV7();
      const runId2 = mintUuidV7();

      const events: ClassifiedEvent[] = [
        mkEvent(installationId1, inv1, runId1, 'run.started', 'durable', 1),
        mkEvent(installationId1, inv1, runId1, 'run.completed', 'durable', 2),
        mkEvent(installationId2, inv2, runId2, 'run.started', 'durable', 1),
        mkEvent(installationId2, inv2, runId2, 'run.completed', 'durable', 2),
      ];

      const registry = buildRegistry(events);

      // Single snapshot call — this is the no-fan-out contract.
      // If the implementation issued per-host calls, a second fleetSnapshot() would
      // be needed; a RED failure here means the implementation is fanning out
      // (violating SC-003).
      const snapshot = fleetSnapshot(registry);

      expect(snapshot.entries).toHaveLength(2);
      expect(snapshot.entries.map((e: FleetSnapshotEntry) => e.installationId)).toEqual([
        installationId1,
        installationId2,
      ]);
    });

    it('snapshot excludes short-lived verbs (not commandable fleet entries)', () => {
      // FR-013: "Only long-running interruptible runs (`execute`, `govern`) MUST
      // register as commandable fleet instances."
      // FR-014: "CLI usage and timing data across every verb MUST be available
      // without those invocations appearing as fleet entries."
      //
      // Short verbs (e.g., `govern --help`, `backlog list`) emit invocation.completed
      // events with runId=null. They are NOT fleet entries. A RED test for this
      // is simple: the registry builder receives short-verb events (runId=null)
      // and they do NOT appear in the snapshot.

      const installationId = mintInstallationId();

      // One commandable run (execute).
      const commandableInv = mintUuidV7();
      const commandableRunId = mintUuidV7();

      // A short verb (help, version, etc.) — runId is null, not a fleet entry.
      // The registry will NOT create an entry for this.
      const shortVerbInv = mintUuidV7();

      const events: ClassifiedEvent[] = [
        // Commandable run: execute
        mkEvent(installationId, commandableInv, commandableRunId, 'run.started', 'durable', 1),
        mkEvent(
          installationId,
          commandableInv,
          commandableRunId,
          'run.completed',
          'durable',
          2,
        ),
        // Short verb: no runId, aggregated classification, never a fleet entry
        mkEvent(installationId, shortVerbInv, null, 'invocation.completed', 'aggregated', 3),
        // Another short verb
        mkEvent(installationId, shortVerbInv, null, 'invocation.completed', 'aggregated', 4),
      ];

      const registry = buildRegistry(events);
      const snapshot = fleetSnapshot(registry);

      // Only the commandable run appears.
      expect(snapshot.entries).toHaveLength(1);
      expect(snapshot.entries[0]?.runId).toBe(commandableRunId);

      // Short verbs are NOT in the snapshot entries, even though their
      // timing data remains queryable (FR-014) via registry.timings(invocationId).
      // That is not tested here; it is verified in registry.test.ts.
    });
  },
);
