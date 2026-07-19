/**
 * specs/036-fleet-control-plane — T128/T130 regression: a REJECTING
 * `transport.connect()` (an UNREACHABLE plane — DNS failure / connection
 * refused / TLS error / blocked URL) must be handled as a reestablish-class
 * close, NEVER escape as an unhandled promise rejection.
 *
 * WHY THIS EXISTS: the dogfood loop (tests/fleet/dogfood.test.ts, Scenario 1)
 * stood up a live sidecar pointed at an unreachable plane and observed an
 * UNHANDLED REJECTION leaking out of `runSseClient` — `run()` awaited
 * `transport.connect()` OUTSIDE its try/catch, so a connect rejection escaped
 * `void run()`. That contradicts quickstart Scenario 1 ("Plane unreachable ⇒
 * sidecar spools"; the interactive path is never informed) and can crash the
 * process under Node's default unhandledRejection behavior. The fix wraps the
 * connect; this test pins it: a connect rejection fires `onClosed('stream-ended')`
 * (reestablish, handled with backoff by the reconnect driver) and throws nothing.
 *
 * Relative `.js` imports (node16). No `any`, no `as`, no `@ts-ignore`.
 */

import { describe, expect, it } from 'vitest';
import type { Clock } from '../../src/fleet/clock.js';
import type { SseConnection, SseConnectRequest, SseTransport } from '../../src/sidecar/uplink/transport.js';
import { runSseClient } from '../../src/sidecar/uplink/sse-client.js';

class FixedClock implements Clock {
  nowIso(): string {
    return '2026-07-17T00:00:00.000Z';
  }
  monotonicNowMs(): number {
    return 1_000;
  }
}

/** A transport whose `connect` always rejects — models an unreachable plane. */
class RejectingTransport implements SseTransport {
  lastRequest: SseConnectRequest | undefined;
  connect(request: SseConnectRequest): Promise<SseConnection> {
    this.lastRequest = request;
    return Promise.reject(new Error('ECONNREFUSED: the plane is unreachable'));
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('runSseClient — a rejecting connect is a reestablish-class close, never an unhandled rejection (T128/T130)', () => {
  it('fires onClosed("stream-ended") once and surfaces no throw when the plane is unreachable', async () => {
    const transport = new RejectingTransport();
    const closes: string[] = [];
    let events = 0;

    // Registering our own handler proves NO unhandled rejection escapes the
    // client: if one did, this listener would capture it and fail the test.
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const client = runSseClient({
        transport,
        clock: new FixedClock(),
        url: 'https://plane.unreachable.example/v1/sidecar/stream',
        onEvent: () => {
          events += 1;
        },
        onReadIdleTimeout: () => undefined,
        onClosed: (reason) => closes.push(reason),
      });

      // Let the rejected connect settle through the microtask/macrotask queue.
      await sleep(20);
      client.stop();
      await sleep(5);

      // A connect rejection is reestablish-class (retry with backoff), never
      // 'terminal' and never an escaping rejection.
      expect(closes).toEqual(['stream-ended']);
      expect(events).toBe(0);
      expect(unhandled).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });
});
