// specs/036-fleet-control-plane — AUDIT-20260717-04 (RED→GREEN), Phase 6/7
// hardening. Pins that `buildRegistry`'s progress counter obeys the same
// no-regress ordering invariant the module header already promises for
// executionStatus: a stale-delivered `run.progress` (an OLDER
// invocationSequence than the run's applied high-water mark) MUST NOT
// increment `progressEventCount`.
//
// WHY THIS IS A REAL DEFECT (not a test-only correction): `applyRunEvent`
// (src/plane/registry.ts) counted every `run.progress` event
// UNCONDITIONALLY (`acc.progressEventCount += 1`), ignoring its own
// no-regress guard. So a progress tick delivered out of order — after a
// higher sequence already advanced the run — was still counted, over-counting
// stale/superseded progress (the exact double/over-count no-regress exists to
// prevent, FR-042/SC-015). This test drives `buildRegistry` DIRECTLY (no
// ingest layer) so the defect is pinned at the counting site itself.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). No `any`, no `as`, no `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '../../src/fleet/types.js';
import { mintInstallationId, mintUuidV7 } from '../../src/fleet/types.js';
import { buildRegistry, type ClassifiedEvent } from '../../src/plane/registry.js';

function mkEvent(
  installationId: string,
  invocationId: string,
  runId: string,
  type: string,
  invocationSequence: number,
): ClassifiedEvent {
  const envelope: EventEnvelope = {
    eventId: mintUuidV7(),
    installationId,
    invocationId,
    runId,
    installationSequence: invocationSequence,
    invocationSequence,
    schemaVersion: 1,
    // The registry consumes `type` as an `EventType`; every literal here is a
    // registered run-lifecycle type, so the derivation table resolves it.
    type: type as EventEnvelope['type'],
    wallClock: new Date().toISOString(),
    monotonicOffsetMs: 12,
    classification: type === 'run.progress' ? 'aggregated' : 'durable',
  };
  return { envelope, classification: envelope.classification, type: envelope.type };
}

describe('buildRegistry progress counting obeys no-regress (AUDIT-20260717-04)', () => {
  it('a progress tick delivered AFTER a higher sequence (stale) does NOT increment progressEventCount', () => {
    const inst = mintInstallationId();
    const inv = mintUuidV7();
    const run = mintUuidV7();

    // Delivery order pins the reorder: started(1), completed(4) advance the
    // high-water to 4; the two progress ticks (3, 2) then arrive LOWER than 4
    // — stale. Neither may be counted.
    const events: ClassifiedEvent[] = [
      mkEvent(inst, inv, run, 'run.started', 1),
      mkEvent(inst, inv, run, 'run.completed', 4),
      mkEvent(inst, inv, run, 'run.progress', 3),
      mkEvent(inst, inv, run, 'run.progress', 2),
    ];

    const entry = buildRegistry(events).entries().find((e) => e.runId === run);
    expect(entry).toBeDefined();
    if (entry === undefined) throw new Error('unreachable');
    expect(entry.statusAxes.executionStatus).toBe('completed');
    expect(entry.progress.progressEventCount).toBe(0);
    expect(entry.progress.latestInvocationSequence).toBe(4);
  });

  it('progress ticks delivered IN ORDER are each counted (the no-regress guard never under-counts a genuine advance)', () => {
    const inst = mintInstallationId();
    const inv = mintUuidV7();
    const run = mintUuidV7();

    const events: ClassifiedEvent[] = [
      mkEvent(inst, inv, run, 'run.started', 1),
      mkEvent(inst, inv, run, 'run.progress', 2),
      mkEvent(inst, inv, run, 'run.progress', 3),
      mkEvent(inst, inv, run, 'run.completed', 4),
    ];

    const entry = buildRegistry(events).entries().find((e) => e.runId === run);
    expect(entry).toBeDefined();
    if (entry === undefined) throw new Error('unreachable');
    expect(entry.progress.progressEventCount).toBe(2);
  });
});
