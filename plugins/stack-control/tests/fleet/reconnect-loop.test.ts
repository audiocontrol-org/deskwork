/**
 * specs/036-fleet-control-plane — T113 (RED→GREEN), Phase 7-adjacent uplink work.
 *
 * Pins the SSE RECONNECT DRIVER described in
 * contracts/sidecar-plane-protocol.md § C4:
 *
 *   "Reconnect policy: full jitter, base 1s (reseeded by the server's
 *   `retry:` field), ×2, cap 30s, reset after 60s healthy. Retry forever,
 *   except: terminal-fail states, 401, 403 — an invalid or revoked token
 *   will not fix itself by retrying."
 *
 * The T113 primitives (`EventIdBuffer`, `buildReconnectHeaders`,
 * `ReconnectBackoff`) and the T112 single-connection client (`runSseClient`)
 * already exist; nothing composed them into the actual loop. This file pins
 * `runReconnectingSseClient` — the driver that:
 *
 *  - advances the cursor (FR-058) on EVERY delivered event — the cursor
 *    tracks frame delivery, never command status;
 *  - on a reestablish-class close ('idle-timeout' | 'stream-ended') waits a
 *    backoff delay (via an INJECTED timer seam — never a real wall-clock
 *    wait) and RECONNECTS, sending `Last-Event-ID` as a REQUEST HEADER
 *    carrying the cursor;
 *  - on a terminal close (401 / 403 / non-200 / wrong Content-Type) STOPS —
 *    NO further connect;
 *  - tears everything down on `stop()`.
 *
 * Fake transport / FakeClock patterns mirror tests/fleet/transport.test.ts
 * and tests/fleet/sse-keepalive.test.ts (push-controlled, per-connection).
 * The read-idle watchdog is driven exclusively via the injected FakeClock
 * (never `vi.useFakeTimers()` — it does not fake `performance.now()`), and
 * the backoff wait via the injected FakeTimer.
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
import {
  ReconnectBackoff,
  runReconnectingSseClient,
} from '../../src/sidecar/uplink/reconnect.js';

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

/** A single push-controlled fake connection. The TEST decides when bytes
 * arrive and when the stream ends — never real network timing. `close()`
 * ends the stream cleanly so the client's chunk loop can unwind. */
class FakeConnection implements SseConnection {
  readonly status: number;
  readonly headers: ReadonlyMap<string, string>;
  readonly chunks: AsyncIterable<Uint8Array>;
  closedCount = 0;
  private readonly queue: Uint8Array[] = [];
  private readonly waiters: Array<(value: IteratorResult<Uint8Array>) => void> = [];
  private ended = false;

  constructor(status: number, contentType: string | undefined) {
    this.status = status;
    this.headers =
      contentType === undefined
        ? new Map<string, string>()
        : new Map([['content-type', contentType]]);
    this.chunks = {
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

  end(): void {
    this.ended = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  close(): void {
    this.closedCount += 1;
    // A close ends the stream so the client's `for await` unwinds cleanly.
    this.end();
  }
}

/** Records each connect() request and hands out a fresh FakeConnection per
 * call, so a multi-connection reconnect scenario is fully under test control.
 * The status/Content-Type per attempt is taken from `responseQueue` (default
 * 200 + text/event-stream when the queue is exhausted). */
class RecordingTransport implements SseTransport {
  readonly requests: SseConnectRequest[] = [];
  readonly connections: FakeConnection[] = [];
  private readonly responseQueue: Array<{ status: number; contentType?: string }> = [];

  queueResponse(status: number, contentType?: string): void {
    this.responseQueue.push({ status, contentType });
  }

  async connect(request: SseConnectRequest): Promise<SseConnection> {
    this.requests.push(request);
    const spec = this.responseQueue.shift() ?? { status: 200, contentType: 'text/event-stream' };
    const conn = new FakeConnection(spec.status, spec.contentType);
    this.connections.push(conn);
    return conn;
  }
}

/** Injected timer seam: records each scheduled backoff and lets the test fire
 * it — NO real wall-clock wait. The delay VALUE proves the backoff policy. */
class FakeTimer {
  readonly pending: Array<{ delayMs: number; cb: () => void; cancelled: boolean }> = [];

  readonly setTimer = (delayMs: number, cb: () => void): (() => void) => {
    const entry = { delayMs, cb, cancelled: false };
    this.pending.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };

  /** Fires the earliest still-live scheduled timer. */
  fireNext(): void {
    for (;;) {
      const entry = this.pending.shift();
      if (entry === undefined) {
        throw new Error('FakeTimer.fireNext: no pending timer to fire');
      }
      if (!entry.cancelled) {
        entry.cb();
        return;
      }
    }
  }

  liveCount(): number {
    return this.pending.filter((e) => !e.cancelled).length;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Bounded real-time poll — the SEMANTIC timing is the FakeClock/FakeTimer;
 * this only accounts for the client's tiny internal scheduling granularity. */
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

const DATA_FRAME = (id: string): string =>
  `id: ${id}\nevent: invocation.started\ndata: {"n":${id}}\n\n`;

describe('runReconnectingSseClient — SSE reconnect driver (T113, § C4 / FR-058)', () => {
  it('happy path: cursor advances, then reconnects after backoff with Last-Event-ID as a header', async () => {
    const clock = newClock();
    const transport = new RecordingTransport();
    const timer = new FakeTimer();
    const events: Array<{ id?: string; event?: string; data: string }> = [];

    const handle = runReconnectingSseClient({
      transport,
      clock,
      url: 'https://plane.example/stream',
      headers: { authorization: 'bearer tok' },
      readIdleMs: 45_000,
      backoff: new ReconnectBackoff({ baseMs: 1000, capMs: 30_000, random: () => 1 }),
      setTimer: timer.setTimer,
      onEvent: (e) => events.push(e),
    });

    try {
      // First connect fires immediately — no cursor yet, so no Last-Event-ID.
      await waitUntil(() => transport.connections.length === 1);
      expect(transport.requests[0]!.headers['Last-Event-ID']).toBeUndefined();
      expect(transport.requests[0]!.headers['authorization']).toBe('bearer tok');

      // Deliver two data events; the cursor advances to '2'.
      transport.connections[0]!.pushRaw(DATA_FRAME('1'));
      transport.connections[0]!.pushRaw(DATA_FRAME('2'));
      await waitUntil(() => events.length === 2);
      expect(events.map((e) => e.id)).toEqual(['1', '2']);

      // Simulate a read-idle end: advance the clock past the 45s watchdog.
      // The driver schedules a backoff wait (attempt 0 ⇒ base 1000ms).
      clock.advance(45_000);
      await waitUntil(() => timer.liveCount() === 1);
      expect(timer.pending[0]!.delayMs).toBe(1000);
      // No reconnect has happened yet — only the initial connect.
      expect(transport.connections.length).toBe(1);

      // Fire the backoff timer ⇒ the driver RECONNECTS.
      timer.fireNext();
      await waitUntil(() => transport.connections.length === 2);

      // The second connect carries the cursor as a HEADER, never a query param.
      const secondReq = transport.requests[1]!;
      expect(secondReq.headers['Last-Event-ID']).toBe('2');
      expect(secondReq.headers['authorization']).toBe('bearer tok');
      expect(secondReq.url).toBe('https://plane.example/stream');
      expect(secondReq.url).not.toContain('?');
      expect(secondReq.url).not.toContain('Last-Event-ID');

      // The loop continues: more events flow on the reconnected stream.
      transport.connections[1]!.pushRaw(DATA_FRAME('3'));
      await waitUntil(() => events.length === 3);
      expect(events.map((e) => e.id)).toEqual(['1', '2', '3']);
    } finally {
      handle.stop();
    }
  });

  it('reconnects on a natural stream-end (reestablish-class close), advancing the cursor', async () => {
    const clock = newClock();
    const transport = new RecordingTransport();
    const timer = new FakeTimer();

    const handle = runReconnectingSseClient({
      transport,
      clock,
      url: 'https://plane.example/stream',
      backoff: new ReconnectBackoff({ baseMs: 500, random: () => 1 }),
      setTimer: timer.setTimer,
    });

    try {
      await waitUntil(() => transport.connections.length === 1);
      transport.connections[0]!.pushRaw(DATA_FRAME('7'));
      await sleep(10);

      // The server ends the stream cleanly ⇒ reestablish-class close.
      transport.connections[0]!.end();
      await waitUntil(() => timer.liveCount() === 1);
      expect(timer.pending[0]!.delayMs).toBe(500);

      timer.fireNext();
      await waitUntil(() => transport.connections.length === 2);
      expect(transport.requests[1]!.headers['Last-Event-ID']).toBe('7');
    } finally {
      handle.stop();
    }
  });

  it('terminal: a 401 response STOPS the driver — no second connect, no backoff scheduled', async () => {
    const clock = newClock();
    const transport = new RecordingTransport();
    const timer = new FakeTimer();
    transport.queueResponse(401, 'application/json');

    const handle = runReconnectingSseClient({
      transport,
      clock,
      url: 'https://plane.example/stream',
      setTimer: timer.setTimer,
    });

    try {
      await waitUntil(() => transport.connections.length === 1);
      // Give the driver ample real time to (wrongly) schedule a retry.
      await sleep(30);

      // Terminal ⇒ exactly one connect, and no backoff timer scheduled.
      expect(transport.requests.length).toBe(1);
      expect(timer.liveCount()).toBe(0);
    } finally {
      handle.stop();
    }
  });

  it('terminal: a non-200 (503) response also STOPS the driver', async () => {
    const clock = newClock();
    const transport = new RecordingTransport();
    const timer = new FakeTimer();
    transport.queueResponse(503, 'text/event-stream');

    const handle = runReconnectingSseClient({
      transport,
      clock,
      url: 'https://plane.example/stream',
      setTimer: timer.setTimer,
    });

    try {
      await waitUntil(() => transport.connections.length === 1);
      await sleep(30);
      expect(transport.requests.length).toBe(1);
      expect(timer.liveCount()).toBe(0);
    } finally {
      handle.stop();
    }
  });

  it('stop() tears everything down and prevents any further reconnect', async () => {
    const clock = newClock();
    const transport = new RecordingTransport();
    const timer = new FakeTimer();

    const handle = runReconnectingSseClient({
      transport,
      clock,
      url: 'https://plane.example/stream',
      readIdleMs: 45_000,
      backoff: new ReconnectBackoff({ baseMs: 1000, random: () => 1 }),
      setTimer: timer.setTimer,
    });

    await waitUntil(() => transport.connections.length === 1);
    transport.connections[0]!.pushRaw(DATA_FRAME('1'));
    await sleep(10);

    // A read-idle end schedules a backoff timer...
    clock.advance(45_000);
    await waitUntil(() => timer.liveCount() === 1);

    // ...but stop() cancels it and closes the current connection.
    handle.stop();
    expect(transport.connections[0]!.closedCount).toBeGreaterThan(0);
    expect(timer.liveCount()).toBe(0);

    // Even if a stale timer somehow fired, it must not reconnect after stop().
    await sleep(20);
    expect(transport.connections.length).toBe(1);
  });
});
