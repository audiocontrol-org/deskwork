// specs/036-fleet-control-plane — T037 (RED), pairs with T040 impl
// (src/telemetry/buffer.ts).
//
// contracts/local-socket-protocol.md § C4 (Buffering asymmetry, FR-007):
//
//   | Caller                                              | Buffer |
//   |------------------------------------------------------|--------|
//   | Long-running commandable run (`execute`, `govern`)   | Small bounded in-memory buffer covering a sidecar restart gap (bound -> PT-014) |
//   | Short verb                                            | NONE. Drops on a sidecar-unavailable socket. |
//
//   "A 200ms process exits long before a sidecar returns; buffering it is
//   ceremony. Long-term durability is the sidecar's job (WAL); this buffer
//   covers only the restart gap."
//
// spec.md FR-007: "Long-running commandable runs MUST carry a small bounded
// in-memory buffer covering a sidecar restart gap. Short verbs MUST NOT
// buffer and MUST drop on a sidecar-unavailable socket."
//
// research.md PT-014 pins "the long-running run's in-memory buffer bound
// (FR-007)" as a constant "pinned at task time" — i.e. an engineering-sized
// judgment call, not a looked-up fact (same caveat as event.ts's
// MAX_EVENT_SNAPSHOT_BYTES). `INVOCATION_BUFFER_BOUND` is that constant.
//
// This test pins BOTH halves of the asymmetry, per this task's brief:
//   1. A short verb's buffer drops every event immediately — zero
//      buffering, size always 0, drain always empty.
//   2. A long run's bounded buffer retains events across a SIMULATED
//      sidecar-restart gap (buffer while "down", then "sidecar returns",
//      then drain) and flushes them in FIFO order; when the gap outlasts
//      the bound, the OLDEST events drop — bounded means bounded, never
//      unbounded growth on a long run whose sidecar is gone.
//
// This buffer is NOT a durability mechanism — it only covers the restart
// gap. Long-term durability is the sidecar's WAL (out of scope here).
//
// SCOPE: the buffer only. Does not import or exercise the emit client
// (T039 emit.ts), the socket, or the sidecar — those import THIS module,
// not the reverse.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured). Real fixtures (`constructEnvelope`
// + a deterministic fake Clock, same shape as event.test.ts's fixture) —
// never mocks. NO vitest fake timers.

import { describe, expect, it } from 'vitest';
import type { Clock } from '../../src/fleet/clock.js';
import { constructEnvelope, type TelemetryEvent } from '../../src/fleet/event.js';
import { mintInstallationId, mintUuidV7 } from '../../src/fleet/types.js';
import {
  createEventBuffer,
  INVOCATION_BUFFER_BOUND,
  type EventBuffer,
} from '../../src/telemetry/buffer.js';

/** Deterministic fake Clock — same shape as event.test.ts's fixture. */
class FakeClock implements Clock {
  constructor(
    private wall: string,
    private mono: number,
  ) {}

  nowIso(): string {
    return this.wall;
  }

  monotonicNowMs(): number {
    return this.mono;
  }
}

const clock = new FakeClock('2026-07-17T00:00:00.000Z', 0);
const installationId = mintInstallationId();
const invocationId = mintUuidV7();
const runId = mintUuidV7();

/**
 * A real `TelemetryEvent` fixture, built via `constructEnvelope` (never a
 * hand-rolled literal). `invocationSequence` is set to the caller-supplied
 * `seq` so FIFO order is independently verifiable from envelope content,
 * not array/object identity.
 */
function makeEvent(seq: number): TelemetryEvent {
  return {
    envelope: constructEnvelope(clock, 0, {
      installationId,
      invocationId,
      runId,
      installationSequence: seq,
      invocationSequence: seq,
      schemaVersion: 1,
      type: 'run.progress',
      classification: 'aggregated',
      sessionId: null,
    }, process.cwd()),
    snapshot: {},
  };
}

function sequencesOf(events: readonly TelemetryEvent[]): number[] {
  return events.map((e) => e.envelope.invocationSequence);
}

describe('short verb: NO buffer (C4 / FR-007) — drops immediately, zero buffering', () => {
  it('push() reports dropped and size never moves off 0', () => {
    const buffer: EventBuffer = createEventBuffer('short-verb');
    expect(buffer.kind).toBe('short-verb');
    expect(buffer.capacity).toBe(0);

    for (let seq = 1; seq <= 5; seq++) {
      const result = buffer.push(makeEvent(seq));
      expect(result).toBe('dropped');
      expect(buffer.size).toBe(0);
    }
    expect(buffer.droppedCount).toBe(5);
  });

  it('drain() is always empty — nothing was ever retained to cover a restart gap', () => {
    const buffer = createEventBuffer('short-verb');
    buffer.push(makeEvent(1));
    buffer.push(makeEvent(2));
    buffer.push(makeEvent(3));
    expect(buffer.drain()).toEqual([]);
  });
});

describe('long run: bounded buffer (C4 / FR-007) — retains up to the bound, covers a restart gap', () => {
  it('push() reports buffered and retains events under the bound', () => {
    const buffer = createEventBuffer('long-run', 3);
    expect(buffer.kind).toBe('long-run');
    expect(buffer.capacity).toBe(3);

    expect(buffer.push(makeEvent(1))).toBe('buffered');
    expect(buffer.push(makeEvent(2))).toBe('buffered');
    expect(buffer.size).toBe(2);
    expect(buffer.droppedCount).toBe(0);
  });

  it('SIMULATED RESTART GAP: buffer while the sidecar is down, then drain FIFO once it returns', () => {
    const buffer = createEventBuffer('long-run', 5);

    // "sidecar unavailable" — the caller just keeps pushing; nothing drains.
    for (let seq = 1; seq <= 4; seq++) {
      expect(buffer.push(makeEvent(seq))).toBe('buffered');
    }
    expect(buffer.size).toBe(4);

    // "sidecar returns" — the caller flushes the buffer in FIFO order.
    const flushed = buffer.drain();
    expect(sequencesOf(flushed)).toEqual([1, 2, 3, 4]);

    // Drained: cleared, ready to cover the next gap from empty.
    expect(buffer.size).toBe(0);
    expect(buffer.drain()).toEqual([]);
  });

  it('BOUNDED: when the gap outlasts the bound, the OLDEST events drop — never unbounded growth', () => {
    const buffer = createEventBuffer('long-run', 3);

    for (let seq = 1; seq <= 7; seq++) {
      buffer.push(makeEvent(seq));
      // Never exceeds the bound at ANY point mid-gap, not just at the end.
      expect(buffer.size).toBeLessThanOrEqual(3);
    }
    expect(buffer.size).toBe(3);
    expect(buffer.droppedCount).toBe(4); // 7 pushed, 3 retained, 4 evicted

    const flushed = buffer.drain();
    // Oldest (1,2,3,4) evicted; newest 3 survive, still in FIFO order.
    expect(sequencesOf(flushed)).toEqual([5, 6, 7]);
  });

  it('defaults to INVOCATION_BUFFER_BOUND (PT-014 pinned-at-task-time constant) when no capacity is given', () => {
    const buffer = createEventBuffer('long-run');
    expect(buffer.capacity).toBe(INVOCATION_BUFFER_BOUND);
    expect(INVOCATION_BUFFER_BOUND).toBeGreaterThan(0);
  });
});

describe('the asymmetry is selected by the CALLER KIND alone (FR-007 headline)', () => {
  it('the identical event stream: short-verb kind drops all of it; long-run kind retains all of it', () => {
    const events = [makeEvent(1), makeEvent(2), makeEvent(3)];

    const shortVerb = createEventBuffer('short-verb');
    for (const e of events) shortVerb.push(e);
    expect(shortVerb.drain()).toEqual([]);

    const longRun = createEventBuffer('long-run', 10);
    for (const e of events) longRun.push(e);
    expect(sequencesOf(longRun.drain())).toEqual([1, 2, 3]);
  });
});

describe('misuse fails loud, never silently (Principle V / project error-handling rule)', () => {
  it('a non-positive capacity for a long-run buffer throws rather than silently accepting', () => {
    expect(() => createEventBuffer('long-run', 0)).toThrow(/capacity/i);
    expect(() => createEventBuffer('long-run', -1)).toThrow(/capacity/i);
  });
});
