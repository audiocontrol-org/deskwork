/**
 * specs/036-fleet-control-plane — T007 (RED), Phase 2 (Foundational) / PT-014.
 *
 * `SseTransport` (src/sidecar/uplink/transport.ts) abstracts the ACT of
 * opening a byte/chunk stream to a URL with request headers, and receiving
 * chunks + a status/close signal. It is deliberately BELOW SSE framing
 * (eventsource-parser's job, later) and BELOW the reconnect loop / cursor
 * advancement / backoff (sse-client.ts, reconnect.ts — later tasks, NOT
 * built here).
 *
 * Why this seam matters (contracts/sidecar-plane-protocol.md § Test
 * obligations, research.md § Testability strategy): the sidecar owns its
 * own SSE connection loop and that loop is driven by timeout behaviors —
 * 45s read-idle, 15s keepalive re-arm, exponential backoff. A later
 * consumer that races transport chunk-delivery against a `Clock`-driven
 * watchdog needs to inject a FAKE transport whose chunk delivery is under
 * the TEST's control (synchronous / instant), not real network timing —
 * that is the only way a 45-second-timeout test completes in microseconds
 * instead of forty-five real seconds. This file pins:
 *   1. the interface shape (a fake is injectable in place of the real one);
 *   2. the real (native-`fetch`-backed) implementation's wire behavior
 *      against a REAL in-process `node:http` server (never a mock — a
 *      mock cannot stall without EOF or die mid-frame, the failures that
 *      matter per research.md § Testability strategy);
 *   3. that a fake conforming to the SAME interface can simulate arbitrary
 *      silence/activity and still resolve in near-zero real wall time —
 *      the property later timeout tests depend on.
 *
 * Per contracts/sidecar-plane-protocol.md § C4: `Last-Event-ID` is a
 * REQUEST HEADER, never a query parameter — pinned directly against a real
 * server below.
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { SseConnectRequest, SseConnection, SseTransport } from '../../src/sidecar/uplink/transport.js';
import { FetchSseTransport } from '../../src/sidecar/uplink/transport.js';

/** Starts a real in-process HTTP server on an ephemeral port; resolves to
 * its base URL. Caller is responsible for `close()`. */
async function startServer(
  handler: Parameters<typeof createServer>[0],
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a bound TCP address from the ephemeral-port listener');
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function collectChunks(connection: SseConnection): Promise<Uint8Array[]> {
  const collected: Uint8Array[] = [];
  for await (const chunk of connection.chunks) {
    collected.push(chunk);
  }
  return collected;
}

function decode(chunks: Uint8Array[]): string {
  return chunks.map((chunk) => new TextDecoder().decode(chunk)).join('');
}

describe('SseTransport (T007 — the DI seam below SSE framing and the reconnect loop)', () => {
  it('is a DI seam: a fake implementing the interface is injectable wherever a real transport is expected', () => {
    class FakeTransport implements SseTransport {
      async connect(_request: SseConnectRequest): Promise<SseConnection> {
        return {
          status: 200,
          headers: new Map([['content-type', 'text/event-stream']]),
          chunks: (async function* () {})(),
          close: () => {},
        };
      }
    }

    function acceptsAnySseTransport(transport: SseTransport): boolean {
      return typeof transport.connect === 'function';
    }

    expect(acceptsAnySseTransport(new FakeTransport())).toBe(true);
    expect(acceptsAnySseTransport(new FetchSseTransport())).toBe(true);
  });

  it('sends Last-Event-ID as a REQUEST HEADER, never a query parameter (C4)', async () => {
    let observedHeader: string | undefined;
    let observedUrl: string | undefined;
    const { server, baseUrl } = await startServer((req, res) => {
      observedHeader = req.headers['last-event-id'] as string | undefined;
      observedUrl = req.url;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end();
    });

    try {
      const transport = new FetchSseTransport();
      const connection = await transport.connect({
        url: `${baseUrl}/stream`,
        headers: { 'Last-Event-ID': 'evt-42' },
      });
      await collectChunks(connection);

      expect(observedHeader).toBe('evt-42');
      // The cursor must never leak into the URL — no query string at all,
      // and specifically no "evt-42" substring anywhere in the path.
      expect(observedUrl).toBe('/stream');
      expect(observedUrl).not.toContain('evt-42');
      expect(observedUrl).not.toContain('?');
    } finally {
      await closeServer(server);
    }
  });

  it('resolves status + headers before the caller touches chunks, so fail vs reestablish is classifiable up front (C4)', async () => {
    const { server, baseUrl } = await startServer((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'revoked' }));
    });

    try {
      const transport = new FetchSseTransport();
      const connection = await transport.connect({ url: `${baseUrl}/stream`, headers: {} });

      // status/headers are already populated — no need to read chunks
      // first to know this connection is terminal (401 per C4/C6).
      expect(connection.status).toBe(401);
      expect(connection.headers.get('content-type')).toBe('application/json');
    } finally {
      await closeServer(server);
    }
  });

  it('surfaces a wrong Content-Type via headers so a caller can classify the response as terminal (C4)', async () => {
    const { server, baseUrl } = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('not an event stream');
    });

    try {
      const transport = new FetchSseTransport();
      const connection = await transport.connect({ url: `${baseUrl}/stream`, headers: {} });

      expect(connection.status).toBe(200);
      expect(connection.headers.get('content-type')).toBe('text/plain');
    } finally {
      await closeServer(server);
    }
  });

  it('streams real bytes across multiple writes and reassembles them exactly', async () => {
    const { server, baseUrl } = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(':keepalive\n\n');
      setTimeout(() => {
        res.write('data: hello\n\n');
        res.end();
      }, 20);
    });

    try {
      const transport = new FetchSseTransport();
      const connection = await transport.connect({ url: `${baseUrl}/stream`, headers: {} });
      const chunks = await collectChunks(connection);

      expect(chunks.length).toBeGreaterThan(0);
      expect(decode(chunks)).toBe(':keepalive\n\ndata: hello\n\n');
    } finally {
      await closeServer(server);
    }
  });

  it('close() tears down the connection and ends chunk iteration without throwing', async () => {
    const { server, baseUrl } = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(':keepalive\n\n');
      // Deliberately never ends — a held-open stream, like the real thing.
    });

    try {
      const transport = new FetchSseTransport();
      const connection = await transport.connect({ url: `${baseUrl}/stream`, headers: {} });

      const iterator = connection.chunks[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.done).toBe(false);

      connection.close();

      const afterClose = await iterator.next();
      expect(afterClose.done).toBe(true);
    } finally {
      await closeServer(server);
    }
  });

  it('a fake transport makes a "45-second-silence" scenario resolve in near-zero real wall time — the property later timeout tests depend on', async () => {
    // A push-controlled fake: the TEST decides when chunks arrive, never a
    // real timer. This is the shape a later reconnect-loop test would use
    // to simulate 45 real seconds of read-idle without waiting 45 seconds.
    let pushChunk: ((chunk: Uint8Array) => void) | undefined;
    let endStream: (() => void) | undefined;
    let closed = false;

    class ControllableFakeTransport implements SseTransport {
      async connect(_request: SseConnectRequest): Promise<SseConnection> {
        const queue: Uint8Array[] = [];
        const waiters: Array<(value: IteratorResult<Uint8Array>) => void> = [];
        let ended = false;

        pushChunk = (chunk) => {
          const waiter = waiters.shift();
          if (waiter) {
            waiter({ value: chunk, done: false });
          } else {
            queue.push(chunk);
          }
        };
        endStream = () => {
          ended = true;
          for (const waiter of waiters.splice(0)) {
            waiter({ value: undefined, done: true });
          }
        };

        const chunks: AsyncIterable<Uint8Array> = {
          [Symbol.asyncIterator]() {
            return {
              next(): Promise<IteratorResult<Uint8Array>> {
                const queued = queue.shift();
                if (queued !== undefined) {
                  return Promise.resolve({ value: queued, done: false });
                }
                if (ended) {
                  return Promise.resolve({ value: undefined, done: true });
                }
                return new Promise((resolve) => waiters.push(resolve));
              },
            };
          },
        };

        return {
          status: 200,
          headers: new Map([['content-type', 'text/event-stream']]),
          chunks,
          close: () => {
            closed = true;
          },
        };
      }
    }

    const transport = new ControllableFakeTransport();
    const startedAt = performance.now();

    const connection = await transport.connect({ url: 'https://plane.example/stream', headers: {} });
    const iterator = connection.chunks[Symbol.asyncIterator]();

    // Simulate "45 seconds of silence, then a keepalive comment frame" by
    // simply choosing WHEN (not waiting real time) to push the chunk.
    const pending = iterator.next();
    expect(typeof pushChunk).toBe('function');
    pushChunk?.(new TextEncoder().encode(':keepalive\n\n'));
    const result = await pending;

    expect(result.done).toBe(false);
    expect(result.value).toBeDefined();

    endStream?.();
    const final = await iterator.next();
    expect(final.done).toBe(true);
    expect(closed).toBe(false); // never explicitly closed in this scenario

    const elapsedMs = performance.now() - startedAt;
    // The whole "45-second-silence" scenario above ran with ZERO real
    // waiting — this is the seam property that makes 45s-timeout tests in
    // later tasks (sse-client.ts read-idle watchdog) run in microseconds.
    expect(elapsedMs).toBeLessThan(50);
  });
});
