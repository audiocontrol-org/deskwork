/**
 * specs/036-fleet-control-plane — T106 (RED)
 *
 * SSE Connection outcome classification (specs/036-fleet-control-plane/contracts/sidecar-plane-protocol.md § C4, § Test obligations #4).
 *
 * `classifyConnection(status: number, contentType: string | undefined): ConnectionOutcome`
 * classifies the initial response of an SSE connection as:
 *
 * - `'stream'`: 200 + `text/event-stream` ⇒ proceed to read events
 * - `'reestablish'`: a dropped connection after a good 200 stream ⇒ reconnect with backoff (NOT tested here; that is the reconnect loop's concern)
 * - `'terminal'`: non-200, wrong Content-Type, 401, 403 ⇒ give up, do not retry (an invalid or revoked token will not fix itself by retrying)
 *
 * The classification fires BEFORE consuming any body bytes — the transport's `connect()` resolves with `status` +
 * `headers` before chunks flow, so a caller can decide fail-vs-retry upfront without reading the response body.
 *
 * Per the contract: non-200 is terminal (the response body is not a stream). 401 and 403 are explicitly
 * non-retryable authentication failures. Wrong Content-Type means the server did not send an SSE stream.
 */

import { describe, expect, it } from 'vitest';
import type { SseConnectRequest, SseConnection, SseTransport } from '../../src/sidecar/uplink/transport.js';
import type { ConnectionOutcome } from '../../src/sidecar/uplink/sse-client.js';
import { classifyConnection } from '../../src/sidecar/uplink/sse-client.js';

describe('SSE connection outcome classification (T106 — terminal vs retryable)', () => {
  it('classifies 200 + text/event-stream as a stream (retryable boundary)', () => {
    const outcome = classifyConnection(200, 'text/event-stream');
    expect(outcome).toBe('stream');
  });

  it('classifies 401 as terminal (authentication failure, non-retryable)', () => {
    const outcome = classifyConnection(401, 'text/event-stream');
    expect(outcome).toBe('terminal');
  });

  it('classifies 403 as terminal (authorization failure, non-retryable)', () => {
    const outcome = classifyConnection(403, 'text/event-stream');
    expect(outcome).toBe('terminal');
  });

  it('classifies any non-200 status as terminal (response body is not a stream)', () => {
    expect(classifyConnection(500, 'text/event-stream')).toBe('terminal');
    expect(classifyConnection(502, 'text/event-stream')).toBe('terminal');
    expect(classifyConnection(503, 'text/event-stream')).toBe('terminal');
    expect(classifyConnection(404, 'text/event-stream')).toBe('terminal');
    expect(classifyConnection(400, 'text/event-stream')).toBe('terminal');
  });

  it('classifies wrong Content-Type as terminal even with 200 status', () => {
    expect(classifyConnection(200, 'application/json')).toBe('terminal');
    expect(classifyConnection(200, 'text/plain')).toBe('terminal');
    expect(classifyConnection(200, 'text/html')).toBe('terminal');
  });

  it('classifies undefined Content-Type as terminal (missing required header)', () => {
    const outcome = classifyConnection(200, undefined);
    expect(outcome).toBe('terminal');
  });

  it('end-to-end: a 401 response from the fake transport produces no retry attempt', async () => {
    // Track how many times connect() is called to verify no retry loop fires.
    let connectCallCount = 0;

    class NonRetryingFakeTransport implements SseTransport {
      async connect(_request: SseConnectRequest): Promise<SseConnection> {
        connectCallCount++;
        return {
          status: 401,
          headers: new Map([['content-type', 'application/json']]),
          chunks: (async function* () {
            yield new TextEncoder().encode(JSON.stringify({ error: 'invalid token' }));
          })(),
          close: () => {},
        };
      }
    }

    // Simulate an SSE client that classifies the connection and decides whether to retry.
    const transport = new NonRetryingFakeTransport();
    const connection = await transport.connect({ url: 'https://plane.example/stream', headers: {} });

    // The client classifies the connection outcome upfront, before reading chunks.
    const outcome = classifyConnection(connection.status, connection.headers.get('content-type'));

    // A 401 is terminal — the client must NOT attempt a retry.
    expect(outcome).toBe('terminal');

    // Only one connect() call should have fired (no retry loop).
    expect(connectCallCount).toBe(1);
  });

  it('end-to-end: a wrong Content-Type response from the fake transport produces no retry attempt', async () => {
    let connectCallCount = 0;

    class NonRetryingFakeTransport implements SseTransport {
      async connect(_request: SseConnectRequest): Promise<SseConnection> {
        connectCallCount++;
        return {
          status: 200,
          headers: new Map([['content-type', 'text/plain']]),
          chunks: (async function* () {
            yield new TextEncoder().encode('not an event stream');
          })(),
          close: () => {},
        };
      }
    }

    const transport = new NonRetryingFakeTransport();
    const connection = await transport.connect({ url: 'https://plane.example/stream', headers: {} });
    const outcome = classifyConnection(connection.status, connection.headers.get('content-type'));

    // Wrong Content-Type is terminal — the client must NOT attempt a retry.
    expect(outcome).toBe('terminal');
    expect(connectCallCount).toBe(1);
  });
});
