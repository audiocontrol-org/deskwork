/**
 * specs/036-fleet-control-plane — T104 (RED), Phase 8 / US6.
 *
 * Per contracts/sidecar-plane-protocol.md § C3 ("Two heartbeats, unrelated,
 * both required"): the transport keepalive is a plane→sidecar SSE **comment
 * frame** (leading `:`), sent every 15s, proving NOTHING about process
 * health — it exists solely to survive intermediaries (ALB/nginx/Cloudflare)
 * that kill idle connections. The client's own **read-idle timeout is 45s**
 * (3× keepalive).
 *
 * Per § C4 ("SSE client rules"): "Comment frames (leading `:`) are keepalive
 * and MUST re-arm the read-idle watchdog. This is the highest-value test in
 * the feature — the likeliest implementation bug, and it fails silently as a
 * mystery disconnect every ~45s." THIS is that test.
 *
 * If comment frames were (incorrectly) ignored by the watchdog — e.g. an
 * implementation that only re-arms on parsed `event:`/`data:` dispatches —
 * a healthy stream that is ONLY ever sending keepalives (the plane has no
 * domain events to emit) would silently disconnect every ~45s even though
 * bytes are arriving on schedule every 15s. That failure mode is exactly
 * what assertion (1) below pins.
 *
 * Target implementation (does NOT exist yet — T112, correct for RED):
 * `src/sidecar/uplink/sse-client.ts`. It sits ABOVE `SseTransport`
 * (src/sidecar/uplink/transport.ts, T007 — the byte/chunk-stream DI seam)
 * and consumes an injected `Clock` (src/fleet/clock.ts, T005) so the 45s
 * watchdog is provable in real milliseconds of test wall time, never a real
 * 45-second wait (research.md § Testability strategy explicitly rules out
 * vitest fake timers here — they do not fake `performance.now()`, the clock
 * PT-013/`SystemClock.monotonicNowMs()` relies on — so this test drives the
 * watchdog exclusively via the injected `Clock`, never `vi.useFakeTimers()`).
 *
 * Assumed public API (this test IS the spec T112 must conform to):
 *
 *   import type { SseTransport } from './transport.js';
 *   import type { Clock } from '../../fleet/clock.js';
 *
 *   export interface SseClientOptions {
 *     readonly transport: SseTransport;
 *     readonly clock: Clock;
 *     readonly url: string;
 *     readonly headers?: Readonly<Record<string, string>>;
 *     readonly readIdleMs?: number;   // default 45000 (3x the 15s keepalive)
 *     readonly onEvent: (e: { readonly id?: string; readonly event?: string; readonly data: string }) => void;
 *     readonly onReadIdleTimeout: () => void;   // fired when watchdog elapses with no frame (data OR comment)
 *   }
 *
 *   export function runSseClient(opts: SseClientOptions): { stop(): void };
 *
 * `onEvent` fires only for parsed `event:`/`data:` dispatches — comment
 * frames never surface through it (they are transport-layer noise, not
 * domain events) but MUST still re-arm the watchdog, which is precisely the
 * distinction this file exists to pin.
 *
 * Relative `.js` imports (node16). No `any`, no `as`, no `@ts-ignore`.
 */

import { describe, expect, it } from 'vitest';
import type { Clock } from '../../src/fleet/clock.js';
import type { SseConnectRequest, SseConnection, SseTransport } from '../../src/sidecar/uplink/transport.js';
import { runSseClient } from '../../src/sidecar/uplink/sse-client.js';

/** Matches the FakeClock pattern established in tests/fleet/clock.test.ts and
 * tests/fleet/idle-exit.test.ts: an explicitly-advanced clock, never a real
 * timer, so a 45s-scale scenario runs in real milliseconds. */
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

/** Push-controlled fake transport, matching the `ControllableFakeTransport`
 * pattern in tests/fleet/transport.test.ts: the TEST decides exactly when
 * (and whether) bytes arrive — never real network timing. `pushRaw` delivers
 * raw SSE wire bytes (comment or data frames) as a single chunk; `end()`
 * closes the stream cleanly. */
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

  /** Delivers one raw SSE wire frame (e.g. ":keepalive\n\n" or
   * "data: hello\n\n") as a chunk. Never real network timing. */
  pushRaw(text: string): void {
    const chunk = new TextEncoder().encode(text);
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: chunk, done: false });
    } else {
      this.queue.push(chunk);
    }
  }

  end(): void {
    this.ended = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }
}

/** A tiny REAL wait — matches the established convention in
 * tests/fleet/_local-socket-peer.ts / process-probe.test.ts / spawn.test.ts
 * (2-20ms real settles to let an async consumer loop process a just-pushed
 * chunk). This is NOT "waiting on real time" for the 45s behavior under
 * test — the 45s is driven entirely via `clock.advance()`; this only lets
 * the event loop drain a microtask/macrotask turn. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Bounded real-time poll for the watchdog's async callback to fire. The
 * watchdog's OWN timing is entirely a function of the injected FakeClock
 * (advanced synchronously, in microseconds); this only accounts for
 * whatever small, real, internal scheduling granularity the implementation
 * uses to notice that the clock has moved (e.g. a zero-delay internal
 * tick) — bounded well under a second, nowhere near the real 45s this test
 * exists to avoid waiting on. */
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

describe('SSE keepalive comment frames re-arm the read-idle watchdog (T104, C3/C4 — highest-value test)', () => {
  it('a stream carrying ONLY keepalive comment frames every 15s never trips the 45s watchdog across several intervals', async () => {
    const clock = newClock();
    const transport = new ControllableFakeTransport();
    const events: Array<{ id?: string; event?: string; data: string }> = [];
    let timeouts = 0;

    const client = runSseClient({
      transport,
      clock,
      url: 'https://plane.example/stream',
      onEvent: (e) => events.push(e),
      onReadIdleTimeout: () => {
        timeouts += 1;
      },
    });

    try {
      // Prime the watchdog with a first keepalive comment frame.
      transport.pushRaw(':keepalive\n\n');
      await sleep(5);
      expect(timeouts).toBe(0);

      // 5 keepalive intervals at 15s (real protocol cadence per C3) = 75s of
      // SIMULATED elapsed time — comfortably past the 45s read-idle
      // threshold IF comment frames did NOT re-arm the watchdog. Zero
      // timeouts across this whole loop is the load-bearing assertion: only
      // comment frames are arriving (never a data/event frame), and the
      // watchdog must still never trip.
      for (let i = 0; i < 5; i += 1) {
        clock.advance(15_000);
        transport.pushRaw(':keepalive\n\n');
        await sleep(5);
        expect(timeouts).toBe(0);
      }

      // Comment frames are transport-layer noise, never surfaced as events.
      expect(events).toEqual([]);
    } finally {
      client.stop();
    }
  });

  it('fires onReadIdleTimeout exactly once once readIdleMs elapses with NO frame (data or comment) since the last one', async () => {
    const clock = newClock();
    const transport = new ControllableFakeTransport();
    let timeouts = 0;

    const client = runSseClient({
      transport,
      clock,
      url: 'https://plane.example/stream',
      readIdleMs: 45_000,
      onEvent: () => {},
      onReadIdleTimeout: () => {
        timeouts += 1;
      },
    });

    try {
      transport.pushRaw(':keepalive\n\n');
      await sleep(5);

      // Just under the threshold since the last frame: still silent, no fire.
      clock.advance(44_999);
      await sleep(5);
      expect(timeouts).toBe(0);

      // Cross the 45s threshold with no further frames arriving at all —
      // the watchdog MUST fire.
      clock.advance(2);
      await waitUntil(() => timeouts === 1);

      // Continued silence must not re-fire — fires AT MOST ONCE per the
      // same convention as src/sidecar/lifecycle.ts's idle-exit primitive.
      clock.advance(500_000);
      await sleep(20);
      expect(timeouts).toBe(1);
    } finally {
      client.stop();
    }
  });

  it('control case: data frames also re-arm the watchdog, and are delivered via onEvent', async () => {
    const clock = newClock();
    const transport = new ControllableFakeTransport();
    const events: Array<{ id?: string; event?: string; data: string }> = [];
    let timeouts = 0;

    const client = runSseClient({
      transport,
      clock,
      url: 'https://plane.example/stream',
      onEvent: (e) => events.push(e),
      onReadIdleTimeout: () => {
        timeouts += 1;
      },
    });

    try {
      transport.pushRaw('id: 1\nevent: invocation.started\ndata: {"ok":true}\n\n');
      await sleep(5);
      expect(events).toEqual([{ id: '1', event: 'invocation.started', data: '{"ok":true}' }]);

      // Same 15s x 5 cadence as the comment-only test, but with data frames
      // instead — the control case proving data frames re-arm the watchdog
      // exactly like comment frames do (§ C4: "exactly like data frames").
      for (let i = 0; i < 4; i += 1) {
        clock.advance(15_000);
        transport.pushRaw(`id: ${i + 2}\nevent: invocation.started\ndata: {"n":${i}}\n\n`);
        await sleep(5);
      }

      expect(timeouts).toBe(0);
      expect(events.length).toBe(5);
    } finally {
      client.stop();
    }
  });
});
