// specs/036-fleet-control-plane — T045 (RED), pairs with T050 impl.
//
// THE REGISTRY CONTRACT (plane-client-api.md C3, data-model.md § Fleet instance,
// spec.md User Story 2 acceptance scenario 3, FR-013/014):
//
//   **Exactly one entry per commandable run** (`execute`, `govern`). Each entry
//   carries instance, compass, status axes, progress, model, git, reconciliation,
//   and available actions.
//
//   **Short verbs are NEVER fleet entries** — the fleet means "runs you can act
//   on" — while their timing data stays retrievable (FR-014). Short verbs emit
//   `invocation.completed` (classified as `aggregated`, never `durable`); they
//   are high-frequency and must NOT populate the fleet entries collection. Their
//   timing metadata is accessible through a separate `timings` path, not through
//   the fleet-entries path.
//
// The registry is built from a stream of classified events. A commandable run
// (execute / govern invocation) mints `run.started`, `run.progress`, and terminal
// events (`run.completed` / `run.failed` / `run.cancelled`). A short verb
// (all other invocations) mints only `invocation.completed`. The registry's job is
// to:
//   1. Build EXACTLY ONE entry per commandable run across all installations.
//   2. Discard short-verb invocation.completed events from the entries collection.
//   3. Keep short-verb timing data queryable via the `timings` interface.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/` alias).
// Real fixtures, no mocks. Machine-state redirect harness (T009) to prevent real
// $HOME pollution.

import { afterEach, describe, expect, it } from 'vitest';
import { useMachineStateStore, assertTripwireEmpty } from './_machine-state-harness.js';
import type { EventEnvelope } from '../../src/fleet/types.js';
import { mintInstallationId, mintUuidV7 } from '../../src/fleet/types.js';
// The registry module: will not exist until T050 impl lands.
import type { FleetRegistry, FleetEntry, TimingsRecord } from '../../src/plane/registry.js';
import { buildRegistry } from '../../src/plane/registry.js';

/**
 * Minimal test double of a classified event. The registry will be tested
 * against a stream of these, which simulate what the plane's event processor
 * produces after event.ts wraps the raw telemetry and classification.ts
 * tags it.
 *
 * The classification is part of the event envelope (data-model.md § Event →
 * Envelope).
 */
interface ClassifiedEvent {
  readonly envelope: EventEnvelope;
  readonly classification: 'live-only' | 'aggregated' | 'durable';
  readonly type: string;
}

/**
 * Helper to mint a classified event with predictable IDs for testing.
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

describe('fleet registry — exactly one entry per commandable run, short verbs never listed (T045, FR-013/014)', () => {
  const store = useMachineStateStore();

  afterEach(() => {
    assertTripwireEmpty();
  });

  it('builds a registry with EXACTLY ONE entry per commandable (execute/govern) run', () => {
    // Simulate a stream of events from two commandable runs across one installation.
    const installId = mintInstallationId();
    const inv1 = mintUuidV7(); // First commandable run
    const inv2 = mintUuidV7(); // Second commandable run
    const run1 = mintUuidV7();
    const run2 = mintUuidV7();

    const events: ClassifiedEvent[] = [
      // Run 1: execute invocation
      mkEvent(installId, inv1, run1, 'run.started', 'durable', 1),
      mkEvent(installId, inv1, run1, 'run.progress', 'aggregated', 2),
      mkEvent(installId, inv1, run1, 'run.completed', 'durable', 3),
      // Run 2: govern invocation
      mkEvent(installId, inv2, run2, 'run.started', 'durable', 4),
      mkEvent(installId, inv2, run2, 'run.progress', 'aggregated', 5),
      mkEvent(installId, inv2, run2, 'run.completed', 'durable', 6),
    ];

    const registry = buildRegistry(events);
    expect(registry.entries()).toHaveLength(2);
    expect(registry.entries()).toContainEqual(
      expect.objectContaining({ runId: run1 })
    );
    expect(registry.entries()).toContainEqual(
      expect.objectContaining({ runId: run2 })
    );
  });

  it('short verbs (invocation.completed) are NEVER fleet entries despite being emitted (FR-014)', () => {
    const installId = mintInstallationId();
    const shortVerbInv = mintUuidV7(); // Short verb: no runId
    const commandableInv = mintUuidV7();
    const commandableRun = mintUuidV7();

    const events: ClassifiedEvent[] = [
      // A commandable run
      mkEvent(installId, commandableInv, commandableRun, 'run.started', 'durable', 1),
      mkEvent(installId, commandableInv, commandableRun, 'run.completed', 'durable', 2),
      // A short verb: emitted, but aggregated, never a fleet entry
      mkEvent(installId, shortVerbInv, null, 'invocation.completed', 'aggregated', 3),
      // Another short verb
      mkEvent(installId, shortVerbInv, null, 'invocation.completed', 'aggregated', 4),
    ];

    const registry = buildRegistry(events);
    const entries = registry.entries();
    expect(entries).toHaveLength(1); // Only the commandable run
    expect(entries[0].runId).toBe(commandableRun);
    // Verify short verbs are NOT in the entries.
    expect(entries).not.toContainEqual(
      expect.objectContaining({ invocationId: shortVerbInv })
    );
  });

  it('short-verb timing data remains retrievable via the timings API even though they are not fleet entries', () => {
    const installId = mintInstallationId();
    const shortVerbInv = mintUuidV7(); // No runId
    const now = Date.now();

    const events: ClassifiedEvent[] = [
      // A short verb with a timestamp we can verify
      mkEvent(installId, shortVerbInv, null, 'invocation.completed', 'aggregated', 1),
    ];

    const registry = buildRegistry(events);
    expect(registry.entries()).toHaveLength(0); // No fleet entries
    const timings = registry.timings(shortVerbInv);
    expect(timings).toBeDefined();
    expect(timings?.wallClock).toBeTruthy();
    expect(timings?.monotonicOffsetMs).toBeLessThanOrEqual(now + 1000); // roughly now
  });

  it('multiple installations contribute entries without duplication', () => {
    const inst1 = mintInstallationId();
    const inst2 = mintInstallationId();
    const inv1 = mintUuidV7();
    const inv2 = mintUuidV7();
    const run1 = mintUuidV7();
    const run2 = mintUuidV7();

    const events: ClassifiedEvent[] = [
      // Installation 1: one commandable run
      mkEvent(inst1, inv1, run1, 'run.started', 'durable', 1),
      mkEvent(inst1, inv1, run1, 'run.completed', 'durable', 2),
      // Installation 2: another commandable run
      mkEvent(inst2, inv2, run2, 'run.started', 'durable', 1),
      mkEvent(inst2, inv2, run2, 'run.completed', 'durable', 2),
    ];

    const registry = buildRegistry(events);
    expect(registry.entries()).toHaveLength(2);
    expect(registry.entries()).toContainEqual(
      expect.objectContaining({ runId: run1, installationId: inst1 })
    );
    expect(registry.entries()).toContainEqual(
      expect.objectContaining({ runId: run2, installationId: inst2 })
    );
  });

  it('run progress events (aggregated) contribute to a single entry, not separate entries', () => {
    const installId = mintInstallationId();
    const inv = mintUuidV7();
    const run = mintUuidV7();

    const events: ClassifiedEvent[] = [
      // A single commandable run with many progress ticks
      mkEvent(installId, inv, run, 'run.started', 'durable', 1),
      mkEvent(installId, inv, run, 'run.progress', 'aggregated', 2),
      mkEvent(installId, inv, run, 'run.progress', 'aggregated', 3),
      mkEvent(installId, inv, run, 'run.progress', 'aggregated', 4),
      mkEvent(installId, inv, run, 'run.completed', 'durable', 5),
    ];

    const registry = buildRegistry(events);
    expect(registry.entries()).toHaveLength(1);
    expect(registry.entries()[0].runId).toBe(run);
  });
});
