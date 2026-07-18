// specs/036-fleet-control-plane — RED→GREEN for AUDIT-20260718-04
// (fleet-stream SSE tick can crash the entire plane process on any unexpected
// event).
//
// THE DEFECT: `runtime.ts`'s `fleetStreamHandler` armed a bare, synchronous
// `scheduler.setInterval(() => { buildRegistry(events).entries(); ... })` with
// NO try/catch. `buildRegistry` → `requireRunStatus` HARD-THROWS for any
// run-scoped event (`runId !== null`) whose `type` is not one of the five
// registered lifecycle keys. A throw inside a `setInterval` callback is an
// UNCAUGHT exception in Node — by default it terminates the whole process
// (every consumer + sidecar route down), and since the shared, append-only
// `events` array is re-folded on every tick for every connected client, a
// single anomalous event poisons every subsequent tick for every client.
//
// THE FIX: `computeFleetTickGuarded` (runtime-http.ts) wraps the throwing
// `buildRegistry` in try/catch, so a bad event only SKIPS a tick (preserving
// the previous snapshot) — it can never crash the process.
//
// This exercises the load-bearing guard directly (the seam the interval body
// now calls) with a real poison event, no mocked process-exit.
//
// Relative `.js` imports under node16 resolution. No `any`, no `as`, no
// `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import type { ClassifiedEvent } from '../../src/plane/registry.js';
import { buildRegistry } from '../../src/plane/registry.js';
import { computeFleetTickGuarded } from '../../src/plane/runtime-http.js';

/** A run-scoped event (`runId !== null`) whose `type` is NOT a registered
 * run-lifecycle key — the exact shape that makes `requireRunStatus` throw. */
function poisonEvent(): ClassifiedEvent {
  const envelope = {
    eventId: '01912345-0000-7000-8000-00000000dead',
    installationId: '99999999-9999-4999-8999-999999999999',
    invocationId: 'inv-poison',
    runId: 'run-poison', // non-null → run-scoped → routed through requireRunStatus
    installationSequence: 1,
    invocationSequence: 1,
    schemaVersion: 1,
    type: 'invocation.completed', // NOT in RUN_LIFECYCLE_STATUS → hard throw
    wallClock: new Date().toISOString(),
    monotonicOffsetMs: 3,
    classification: 'durable' as const,
  };
  return { envelope, classification: envelope.classification, type: envelope.type };
}

function runStartedEvent(runId: string): ClassifiedEvent {
  const envelope = {
    eventId: `01912345-0000-7000-8000-0000000000${runId.length.toString(16).padStart(2, '0')}`,
    installationId: '11111111-1111-4111-8111-111111111111',
    invocationId: `inv-${runId}`,
    runId,
    installationSequence: 1,
    invocationSequence: 1,
    schemaVersion: 1,
    type: 'run.started',
    wallClock: new Date().toISOString(),
    monotonicOffsetMs: 5,
    classification: 'durable' as const,
  };
  return { envelope, classification: envelope.classification, type: envelope.type };
}

describe('fleet-stream tick survives a poison event (AUDIT-20260718-04)', () => {
  it('the hazard is real: buildRegistry HARD-THROWS on a run-scoped event with an unregistered type', () => {
    // This is what fired inside the bare setInterval callback — an uncaught
    // exception that terminates the process.
    expect(() => buildRegistry([poisonEvent()])).toThrow();
  });

  it('computeFleetTickGuarded catches the throw, skips the tick, and preserves the previous snapshot', () => {
    const previous = buildRegistry([runStartedEvent('run-ok')]).entries();
    expect(previous).toHaveLength(1);

    // A poison event now sits in the shared events array. Before the fix this
    // throw propagated out of the setInterval callback and crashed the plane.
    const events = [runStartedEvent('run-ok'), poisonEvent()];

    let result: ReturnType<typeof computeFleetTickGuarded> | undefined;
    expect(() => {
      result = computeFleetTickGuarded(events, previous);
    }).not.toThrow();

    // The tick is SKIPPED: error is surfaced (log-and-skip), the previous
    // snapshot is preserved, and no deltas are emitted for the poisoned tick.
    expect(result?.error).toBeDefined();
    expect(result?.next).toBe(previous);
    expect(result?.deltas).toEqual([]);
  });

  it('a clean tick still computes deltas normally (the guard does not swallow good ticks)', () => {
    const previous = buildRegistry([]).entries();
    const events = [runStartedEvent('run-a')];

    const result = computeFleetTickGuarded(events, previous);
    expect(result.error).toBeUndefined();
    expect(result.next).toHaveLength(1);
    expect(result.deltas.length).toBeGreaterThan(0);
    expect(result.deltas[0]?.kind).toBe('instance-upserted');
  });
});
