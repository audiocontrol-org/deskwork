/**
 * specs/036-fleet-control-plane — T007, Phase 2 (Foundational) / PT-014.
 *
 * `SseTransport` abstracts the ACT of opening a byte/chunk stream to a URL
 * with request headers, and receiving those chunks plus a status/close
 * signal. Nothing above (SSE FRAMING — `event:`/`data:`/comment parsing,
 * via `eventsource-parser`) or below (the reconnect loop, Last-Event-ID
 * cursor advancement, exponential backoff) belongs here. Framing lands in
 * a later sse-client.ts; the loop lands in a later reconnect.ts —
 * deliberately NOT built in this task.
 *
 * Why this seam exists (research.md § Testability strategy,
 * contracts/sidecar-plane-protocol.md § C4 + § Test obligations): the
 * sidecar is a Node client, not a browser, so it owns its SSE connection
 * loop explicitly rather than inheriting `EventSource`'s automatic
 * reconnect semantics — and that loop is driven by timeout-based behavior
 * (45s read-idle watchdog, 15s keepalive re-arm, exponential backoff).
 * Testing those against a REAL network connection would mean multi-second
 * (or 45-second) test runtimes. Injecting `SseTransport` (Constitution
 * Principle VI — DI with interface types) lets a later consumer swap in a
 * FAKE whose chunk delivery is under the TEST's control instead of real
 * network timing, so a 45-second-timeout test completes in microseconds.
 * This module ships the seam plus the one real (native-`fetch`-backed)
 * implementation; fakes live in test code (tests/fleet/transport.test.ts).
 *
 * Wire rule pinned here (contracts/sidecar-plane-protocol.md § C4):
 * `Last-Event-ID` MUST travel as a REQUEST HEADER, never a query
 * parameter. `SseConnectRequest` has no separate cursor field — headers
 * are the only place a caller can put it — precisely so nothing in this
 * seam tempts a caller into a query-string cursor.
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI).
 */

/**
 * A single outbound connect request. `headers` carries everything the
 * caller needs on the wire, including `Last-Event-ID` on reconnect (C4)
 * and the bearer token (C6) — this seam has no separate parameter for
 * either, deliberately.
 */
export interface SseConnectRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * An open (or attempted) connection. `status` and `headers` are always
 * populated as soon as `connect()` resolves — even for a non-200 response
 * — matching real HTTP semantics (status/headers arrive before the body
 * streams). This lets a caller classify `fail` vs `reestablish` (C4)
 * before ever touching `chunks`. `chunks` yields raw bytes as they
 * arrive; SSE framing is deliberately NOT this layer's job. Iteration
 * ends when the server closes the connection, the caller calls `close()`,
 * or a transport-level error occurs (surfaced as the async iterable
 * rejecting).
 */
export interface SseConnection {
  readonly status: number;
  readonly headers: ReadonlyMap<string, string>;
  readonly chunks: AsyncIterable<Uint8Array>;
  close(): void;
}

/**
 * The DI seam itself. `connect()` resolves once response headers are
 * available — it does NOT wait for the first body chunk, so a caller can
 * classify a non-200 or wrong-Content-Type response as terminal (C4)
 * without reading any bytes.
 */
export interface SseTransport {
  connect(request: SseConnectRequest): Promise<SseConnection>;
}

/**
 * The real (native-`fetch`-backed) `SseTransport`. Per research.md
 * § Transport topology, this is ONE of the two baseline connections (the
 * held-open SSE stream); the telemetry POST path is a separate, unrelated
 * dispatch built elsewhere and must never share a connection pool slot
 * with this one (the head-of-line trap C2 names). Uses `AbortController`
 * so `close()` actually tears down the underlying socket rather than
 * merely stopping local iteration.
 */
export class FetchSseTransport implements SseTransport {
  async connect(request: SseConnectRequest): Promise<SseConnection> {
    const controller = new AbortController();
    const response = await fetch(request.url, {
      headers: request.headers,
      signal: controller.signal,
    });

    const headers = new Map<string, string>();
    response.headers.forEach((value, key) => {
      headers.set(key, value);
    });

    return {
      status: response.status,
      headers,
      chunks: readChunks(response.body, controller.signal),
      close: () => controller.abort(),
    };
  }
}

/**
 * Adapts the WHATWG `ReadableStream<Uint8Array>` `fetch` hands back into a
 * plain `AsyncIterable<Uint8Array>` via `getReader()`, rather than relying
 * on `ReadableStream`'s own (unevenly supported) async-iterator protocol.
 * A caller-triggered abort (`close()`) surfaces as the reader's `read()`
 * rejecting with an `AbortError`; that is treated as a clean end of
 * iteration — the caller asked to close, so it is not a transport error —
 * while a rejection from any OTHER cause still propagates to the caller.
 */
async function* readChunks(
  body: ReadableStream<Uint8Array> | null,
  signal: AbortSignal,
): AsyncIterable<Uint8Array> {
  if (body === null) {
    return;
  }
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      if (value !== undefined) {
        yield value;
      }
    }
  } catch (error) {
    if (signal.aborted) {
      return;
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}
