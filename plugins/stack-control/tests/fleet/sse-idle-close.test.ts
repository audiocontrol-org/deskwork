/**
 * specs/036-fleet-control-plane — AUDIT-20260718-31 + AUDIT-20260718-33 (RED→GREEN).
 *
 * The read-idle watchdog in `runSseClient` (src/sidecar/uplink/sse-client.ts)
 * fires `onReadIdleTimeout()` + `onClosed('idle-timeout')` when the 45s horizon
 * elapses. The cross-model finding: pre-fix the watchdog did NOT tear down the
 * underlying connection, and the `for await (const chunk of conn.chunks)` loop
 * only checked `stopped` (set by the public `stop()`), never a watchdog flag.
 * So a "dead" peer that later resumes sending bytes (a slow-but-not-actually-
 * dead link, a buffering proxy) would wake the loop and re-invoke `onEvent(...)`
 * for every subsequent frame — a DUPLICATE delivery alongside whatever fresh
 * connection the reconnect driver already started, plus a leaked socket.
 *
 * This pins the two guarantees the fix must provide:
 *   1. the watchdog CLOSES the connection when it fires (no leaked socket), and
 *   2. once the watchdog has fired, NO further `onEvent` from that connection is
 *      delivered — a late chunk from the abandoned stream is dropped, never
 *      surfaced as a duplicate.
 *
 * The FakeClock + push-controlled transport pattern mirrors
 * tests/fleet/sse-keepalive.test.ts. The transport's `close()` deliberately
 * only records the call (it does NOT end the stream) so the test can push a
 * LATE chunk AFTER the watchdog fired — exactly the "resurrection" scenario —
 * and prove the client's hard guard drops it rather than relying on the
 * transport aborting iteration.
 *
 * Relative `.js` imports (node16). No `any`, no `as`, no `@ts-ignore`.
 */

import { describe, expect, it } from 'vitest';
import type { Clock } from '../../src/fleet/clock.js';
import type {
  SseConnectRequest,
  SseConnection,
  SseTransport,
} from '../../src/sidecar/uplink/transport.js';
import type { SseCloseReason } from '../../src/sidecar/uplink/sse-client.js';
import { runSseClient } from '../../src/sidecar/uplink/sse-client.js';

/** Explicitly-advanced clock (mirrors tests/fleet/sse-keepalive.test.ts). */
class FakeClock implements Clock {
  private mono: number;
  private wallMs: number;

  constructor(startMono: number, startWallMs: number) {
    this.mono = startMono;
    this.wallMs = startWallMs;
  }

  nowIso(): string {
    return new Date(this.wallMs).toISOString();
  }

  monotonicNowMs(): number {
    return this.mono;
  }

  advance(ms: number): void {
    this.mono += ms;
    this.wallMs += ms;
  }
}

function newClock(): FakeClock {
  return new FakeClock(1_000, Date.parse('2026-07-17T00:00:00.000Z'));
}

/**
 * Push-controlled fake transport. Its `close()` records the call count but
 * does NOT end the chunk stream — so a test can push a LATE chunk after the
 * connection has been closed, simulating a stalled-but-not-dead peer that
 * resumes sending bytes. The client's own guard (not the transport) must be
 * what prevents the late chunk from being delivered.
 */
class ControllableFakeTransport implements SseTransport {
  private readonly queue: Uint8Array[] = [];
  private readonly waiters: Array<(value: IteratorResult<Uint8Array>) => void> = [];
  private ended = false;
  lastRequest: SseConnectRequest | undefined;
  closedCount = 0;

  async connect(request: SseConnectRequest): Promise<SseConnection> {
    this.lastRequest = request;
    const chunks: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<Uint8Array>> => {
          const queued = this.queue.shift();
          if (queued !== undefined) {
            return Promise.resolve({ value: queued, done: false });
          }
          if (this.ended) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise((resolve) => this.waiters.push(resolve));
        },
      }),
    };

    return {
      status: 200,
      headers: new Map([['content-type', 'text/event-stream']]),
      chunks,
      close: () => {
        this.closedCount += 1;
      },
    };
  }

  pushRaw(text: string): void {
    const chunk = new TextEncoder().encode(text);
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: chunk, done: false });
    } else {
      this.queue.push(chunk);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1000, stepMs = 5): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`waitUntil: predicate not satisfied within ${timeoutMs}ms`);
    }
    await sleep(stepMs);
  }
}

describe('SSE read-idle watchdog tears down the stalled connection and never delivers a late chunk (AUDIT-20260718-31 / -33)', () => {
  it('closes the connection when the watchdog fires AND drops a late chunk from the abandoned stream (no duplicate onEvent)', async () => {
    const clock = newClock();
    const transport = new ControllableFakeTransport();
    const events: Array<{ id?: string; event?: string; data: string }> = [];
    const closeReasons: SseCloseReason[] = [];
    let timeouts = 0;

    const client = runSseClient({
      transport,
      clock,
      url: 'https://plane.example/stream',
      readIdleMs: 45_000,
      onEvent: (e) => events.push(e),
      onReadIdleTimeout: () => {
        timeouts += 1;
      },
      onClosed: (reason) => {
        closeReasons.push(reason);
      },
    });

    try {
      // Prime the watchdog with one real data frame (delivered before the stall).
      transport.pushRaw('id: 1\nevent: run.started\ndata: {"n":1}\n\n');
      await waitUntil(() => events.length === 1);
      expect(events.map((e) => e.id)).toEqual(['1']);
      expect(transport.closedCount).toBe(0);

      // The peer goes silent: advance past the 45s read-idle horizon so the
      // watchdog fires exactly once.
      clock.advance(45_001);
      await waitUntil(() => timeouts === 1);
      expect(closeReasons).toEqual(['idle-timeout']);

      // GUARANTEE 1: the watchdog tore down the underlying connection (no leaked
      // socket). Pre-fix the watchdog never called connection.close(), so this
      // was 0.
      expect(transport.closedCount).toBe(1);

      // GUARANTEE 2: the "dead" peer resurrects and pushes one more frame on the
      // SAME (already-abandoned) stream. Pre-fix the for-await loop only checked
      // `stopped`, so it woke and delivered this as a DUPLICATE onEvent. Post-fix
      // the hard `fired` guard drops it — it must NEVER surface.
      transport.pushRaw('id: 2\nevent: run.started\ndata: {"n":2}\n\n');
      await sleep(30);

      expect(events.map((e) => e.id)).toEqual(['1']);
      expect(events.length).toBe(1);
      // The watchdog fires at most once; the late chunk did not re-trip anything.
      expect(timeouts).toBe(1);
    } finally {
      client.stop();
    }
  });
});
