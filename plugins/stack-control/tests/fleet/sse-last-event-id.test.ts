/**
 * specs/036-fleet-control-plane — T105 (RED), Phase 2 (Foundational).
 *
 * contracts/sidecar-plane-protocol.md § C4 pins two wire rules:
 *
 * 1. On reconnect, the client sends the last seen event id as the
 *    `Last-Event-ID` REQUEST HEADER, NOT as a query-string parameter on
 *    the URL. `SseConnectRequest` has no separate cursor field — headers
 *    are the only place a caller can put it — precisely to enforce this
 *    constraint.
 *
 * 2. The last-event-id buffer PERSISTS across events that omit `id:`.
 *    An event without an `id:` field does NOT clear the remembered id;
 *    the buffer only updates when a new `id:` arrives.
 *
 * This test pins the cursor advancement API and verifies it against an
 * injected fake transport:
 *
 * - `EventIdBuffer` tracks the Last-Event-ID per SSE client rules
 *   (persists across events that omit `id:`).
 * - `buildReconnectHeaders` injects `Last-Event-ID` into headers when
 *   the buffer is non-empty; never modifies the URL.
 * - A fake `SseTransport` captures the `headers` of each `connect()`
 *   request so assertions can verify the wire contract.
 *
 * No `any`, no `as`, no `@ts-ignore`. Strict TS.
 */

import { describe, expect, it } from 'vitest';
import type { Clock } from '../../src/fleet/clock.js';
import type { SseConnectRequest, SseConnection, SseTransport } from '../../src/sidecar/uplink/transport.js';
import {
  buildReconnectHeaders,
  createEventIdBuffer,
  runReconnectingSseClient,
} from '../../src/sidecar/uplink/reconnect.js';

// EventIdBuffer, createEventIdBuffer, and buildReconnectHeaders are pinned
// (and now implemented) in src/sidecar/uplink/reconnect.ts (T113); this test
// imports the real module rather than redeclaring the API shape locally.

// --- AUDIT-20260718-03 driver harness --------------------------------------
//
// The tests above prove the HELPERS (`EventIdBuffer`, `buildReconnectHeaders`)
// are correct in isolation and that a hand-composed call sequence produces the
// right headers. Neither proves the production reconnect DRIVER
// (`runReconnectingSseClient`) actually wires those helpers into its real
// connect attempts. The harness below drives the driver itself over a fake
// transport that records every connect() request, forces a reestablish, and
// asserts the SECOND real connect's headers carry `Last-Event-ID` — the wire
// contract this file exists to pin, not just helper composability.

/** Explicitly-advanced clock (mirrors tests/fleet/reconnect-loop.test.ts). */
class DriverFakeClock implements Clock {
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
}

/** A single push-controlled fake connection — the TEST decides when bytes
 * arrive and when the stream ends, never real network timing. */
class DriverFakeConnection implements SseConnection {
  readonly status = 200;
  readonly headers: ReadonlyMap<string, string> = new Map([['content-type', 'text/event-stream']]);
  readonly chunks: AsyncIterable<Uint8Array>;
  private readonly queue: Uint8Array[] = [];
  private readonly waiters: Array<(value: IteratorResult<Uint8Array>) => void> = [];
  private ended = false;

  constructor() {
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

  /** Server closes the stream cleanly ⇒ reestablish-class close upstream. */
  end(): void {
    this.ended = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  close(): void {
    this.end();
  }
}

/** Records each connect() request and hands out a fresh connection per call. */
class DriverRecordingTransport implements SseTransport {
  readonly requests: SseConnectRequest[] = [];
  readonly connections: DriverFakeConnection[] = [];

  async connect(request: SseConnectRequest): Promise<SseConnection> {
    this.requests.push(request);
    const conn = new DriverFakeConnection();
    this.connections.push(conn);
    return conn;
  }
}

/** Injected timer seam: fires on the test's command, never a real wait. */
class DriverFakeTimer {
  private pending: Array<{ cb: () => void; cancelled: boolean }> = [];

  readonly setTimer = (_delayMs: number, cb: () => void): (() => void) => {
    const entry = { cb, cancelled: false };
    this.pending.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };

  fireNext(): void {
    for (;;) {
      const entry = this.pending.shift();
      if (entry === undefined) {
        throw new Error('DriverFakeTimer.fireNext: no pending timer to fire');
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

function driverSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function driverWaitUntil(
  predicate: () => boolean,
  timeoutMs = 1000,
  stepMs = 5,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`driverWaitUntil: predicate not satisfied within ${timeoutMs}ms`);
    }
    await driverSleep(stepMs);
  }
}

const DRIVER_DATA_FRAME = (id: string): string =>
  `id: ${id}\nevent: invocation.started\ndata: {"n":${id}}\n\n`;

describe('SSE Last-Event-ID handling (T105 — C4 wire contract)', () => {
  describe('EventIdBuffer', () => {
    it('persists across events that omit id', () => {
      const buffer = createEventIdBuffer();

      buffer.observe({ id: '5' });
      expect(buffer.current()).toBe('5');

      // Event with no id field — buffer should persist
      buffer.observe({});
      expect(buffer.current()).toBe('5');

      // Event with undefined id — also persists
      buffer.observe({ id: undefined });
      expect(buffer.current()).toBe('5');
    });

    it('updates to a new id when present', () => {
      const buffer = createEventIdBuffer();

      buffer.observe({ id: '1' });
      expect(buffer.current()).toBe('1');

      buffer.observe({ id: '2' });
      expect(buffer.current()).toBe('2');
    });

    it('starts undefined', () => {
      const buffer = createEventIdBuffer();
      expect(buffer.current()).toBeUndefined();
    });

    it('handles empty string id', () => {
      const buffer = createEventIdBuffer();

      buffer.observe({ id: '' });
      expect(buffer.current()).toBe('');

      buffer.observe({});
      expect(buffer.current()).toBe('');
    });
  });

  describe('buildReconnectHeaders', () => {
    it('includes Last-Event-ID when buffer is non-empty', () => {
      const headers = buildReconnectHeaders({}, '5');
      expect(headers['Last-Event-ID']).toBe('5');
    });

    it('omits Last-Event-ID when buffer is undefined', () => {
      const headers = buildReconnectHeaders({}, undefined);
      expect(headers['Last-Event-ID']).toBeUndefined();
      expect('Last-Event-ID' in headers).toBe(false);
    });

    it('preserves base headers', () => {
      const base = { authorization: 'bearer token123', 'user-agent': 'sidecar/1.0' };
      const headers = buildReconnectHeaders(base, '5');

      expect(headers['authorization']).toBe('bearer token123');
      expect(headers['user-agent']).toBe('sidecar/1.0');
      expect(headers['Last-Event-ID']).toBe('5');
    });

    it('base headers are copied, not mutated', () => {
      const base = Object.freeze({ authorization: 'bearer token' });
      const headers = buildReconnectHeaders(base, '5');

      // base should be untouched
      expect(base).toEqual({ authorization: 'bearer token' });
      // result should be a new object with the header added
      expect(headers).toEqual({ authorization: 'bearer token', 'Last-Event-ID': '5' });
    });
  });

  describe('Reconnect with SSE transport (Last-Event-ID as header, never query param)', () => {
    it('injects Last-Event-ID as request header, not query string', async () => {
      const capturedRequests: SseConnectRequest[] = [];

      class CapturingTransport implements SseTransport {
        async connect(request: SseConnectRequest): Promise<SseConnection> {
          capturedRequests.push(request);
          return {
            status: 200,
            headers: new Map([['content-type', 'text/event-stream']]),
            chunks: (async function* () {})(),
            close: () => {},
          };
        }
      }

      const transport = new CapturingTransport();
      const buffer = createEventIdBuffer();

      // Observe an event with an id
      buffer.observe({ id: 'evt-42' });

      // Build reconnect headers and connect
      const headers = buildReconnectHeaders({ 'user-agent': 'sidecar/1.0' }, buffer.current());
      const baseUrl = 'https://plane.example/stream';
      await transport.connect({ url: baseUrl, headers });

      // Verify the transport received the request
      expect(capturedRequests).toHaveLength(1);
      const req = capturedRequests[0]!;

      // URL must be untouched — no query string, no cursor leak
      expect(req.url).toBe(baseUrl);
      expect(req.url).not.toContain('?');
      expect(req.url).not.toContain('evt-42');

      // Last-Event-ID MUST be in headers
      expect(req.headers['Last-Event-ID']).toBe('evt-42');

      // Base headers must be preserved
      expect(req.headers['user-agent']).toBe('sidecar/1.0');
    });

    it('omits Last-Event-ID header when buffer is empty', async () => {
      const capturedRequests: SseConnectRequest[] = [];

      class CapturingTransport implements SseTransport {
        async connect(request: SseConnectRequest): Promise<SseConnection> {
          capturedRequests.push(request);
          return {
            status: 200,
            headers: new Map([['content-type', 'text/event-stream']]),
            chunks: (async function* () {})(),
            close: () => {},
          };
        }
      }

      const transport = new CapturingTransport();
      const buffer = createEventIdBuffer();

      // Buffer is empty; current() is undefined
      const headers = buildReconnectHeaders({}, buffer.current());
      await transport.connect({ url: 'https://plane.example/stream', headers });

      expect(capturedRequests).toHaveLength(1);
      const req = capturedRequests[0]!;

      // Last-Event-ID must not be in headers
      expect(req.headers['Last-Event-ID']).toBeUndefined();
      expect('Last-Event-ID' in req.headers).toBe(false);
    });

    it('persists buffer across reconnects', async () => {
      const capturedRequests: SseConnectRequest[] = [];

      class CapturingTransport implements SseTransport {
        async connect(request: SseConnectRequest): Promise<SseConnection> {
          capturedRequests.push(request);
          return {
            status: 200,
            headers: new Map([['content-type', 'text/event-stream']]),
            chunks: (async function* () {})(),
            close: () => {},
          };
        }
      }

      const transport = new CapturingTransport();
      const buffer = createEventIdBuffer();

      // First event has an id
      buffer.observe({ id: '1' });

      // First reconnect sends id '1'
      let headers = buildReconnectHeaders({}, buffer.current());
      await transport.connect({ url: 'https://plane.example/stream', headers });
      expect(capturedRequests[0]!.headers['Last-Event-ID']).toBe('1');

      // Next event has no id — buffer persists
      buffer.observe({});
      expect(buffer.current()).toBe('1');

      // Second reconnect still sends id '1'
      headers = buildReconnectHeaders({}, buffer.current());
      await transport.connect({ url: 'https://plane.example/stream', headers });
      expect(capturedRequests[1]!.headers['Last-Event-ID']).toBe('1');

      // New event with id '2' updates buffer
      buffer.observe({ id: '2' });
      expect(buffer.current()).toBe('2');

      // Third reconnect sends id '2'
      headers = buildReconnectHeaders({}, buffer.current());
      await transport.connect({ url: 'https://plane.example/stream', headers });
      expect(capturedRequests[2]!.headers['Last-Event-ID']).toBe('2');
    });
  });

  describe('AUDIT-20260718-03: production driver wires Last-Event-ID into real reconnects', () => {
    it('sends Last-Event-ID as a request HEADER (never a query param) on the driver’s second real connect', async () => {
      const clock = new DriverFakeClock(1_000, Date.parse('2026-07-18T00:00:00.000Z'));
      const transport = new DriverRecordingTransport();
      const timer = new DriverFakeTimer();

      const handle = runReconnectingSseClient({
        transport,
        clock,
        url: 'https://plane.example/stream',
        headers: { authorization: 'bearer tok' },
        setTimer: timer.setTimer,
      });

      try {
        // First real connect: no cursor observed yet, so no Last-Event-ID.
        await driverWaitUntil(() => transport.connections.length === 1);
        expect(transport.requests[0]!.headers['Last-Event-ID']).toBeUndefined();

        // The server delivers an event carrying id "evt-42" — the driver's
        // internal EventIdBuffer must observe it (the test never calls
        // buffer.observe()/buildReconnectHeaders() itself; only the
        // driver's own wiring can make the assertion below pass).
        transport.connections[0]!.pushRaw(DRIVER_DATA_FRAME('evt-42'));

        // Force a reestablish: the server ends the stream cleanly.
        transport.connections[0]!.end();
        await driverWaitUntil(() => timer.liveCount() === 1);
        timer.fireNext();

        // The driver's SECOND real connect() must carry Last-Event-ID as a
        // request header, sourced from the event the FIRST connection
        // delivered — proving the driver (not the test) wired the cursor
        // into the reconnect headers. It must never appear in the URL.
        await driverWaitUntil(() => transport.connections.length === 2);
        const secondReq = transport.requests[1]!;
        expect(secondReq.headers['Last-Event-ID']).toBe('evt-42');
        expect(secondReq.headers['authorization']).toBe('bearer tok');
        expect(secondReq.url).toBe('https://plane.example/stream');
        expect(secondReq.url).not.toContain('?');
        expect(secondReq.url).not.toContain('evt-42');
      } finally {
        handle.stop();
      }
    });
  });
});
