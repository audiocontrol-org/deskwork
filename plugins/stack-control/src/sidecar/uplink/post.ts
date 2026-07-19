/**
 * specs/036-fleet-control-plane — T114 (GREEN).
 *
 * `TelemetryPoster` dispatches sidecar→plane telemetry as plain HTTP POST
 * requests. Per contracts/sidecar-plane-protocol.md § C2 and research.md
 * § Transport topology, the sidecar↔plane wire is TWO connections — the
 * held-open SSE stream (`FetchSseTransport`, ../transport.ts) is one; this
 * module is the other. They are deliberately unrelated: this file imports
 * nothing from transport.ts, shares no `AbortController`, and shares no
 * connection-pool configuration with it.
 *
 * WHY DEFAULT `fetch` (not `undici` with `connections: 1`) IS CORRECT:
 * research.md names the exact trap — pinning telemetry onto the SAME
 * single-connection pool slot the SSE stream occupies would make a POST
 * QUEUE FOREVER behind an SSE response that never completes, turning a
 * mere inefficiency into an outright protocol failure (a live head-of-line
 * hang). Node's global `fetch` (undici under the hood) opens a per-origin
 * keep-alive POOL sized for concurrency by default — it does NOT collapse
 * to one shared socket unless a caller explicitly configures `connections:
 * 1` (or otherwise forces a shared agent). This module does neither: it
 * calls the ambient global `fetch` with no custom dispatcher/agent, so
 * every `post()` call gets its own connection-pool slot, independent of
 * whatever slot the SSE stream is holding open and silent. That is what
 * `tests/fleet/no-head-of-line.test.ts` (T108) pins: a telemetry POST must
 * resolve while a silent, held-open SSE stream sits on the same origin.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI).
 */

/** A single outbound telemetry POST. `headers` and `body` are caller-owned
 * — this seam does not interpret the payload; framing (event envelope,
 * auth header shape) is the caller's concern. */
export interface TelemetryPostRequest {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: string;
}

/** The resolved outcome of a telemetry POST: the HTTP status and the raw
 * response body text. Callers classify success/failure from `status`;
 * this seam does not throw on non-2xx — a POST that reaches the plane and
 * gets an HTTP response (of any status) is a completed dispatch, not a
 * transport error. */
export interface TelemetryPostResult {
  readonly status: number;
  readonly body: string;
}

/** The DI seam for telemetry dispatch. Kept a plain single-method
 * interface — no reconnect loop, no retry/backoff — mirroring
 * `SseTransport`'s scope discipline in transport.ts: this layer is the
 * bare wire operation only. */
export interface TelemetryPoster {
  post(req: TelemetryPostRequest): Promise<TelemetryPostResult>;
}

/**
 * The real (native-`fetch`-backed) `TelemetryPoster`. Deliberately uses
 * the ambient global `fetch` with no custom `dispatcher`/`agent` option —
 * see the header comment for why that default (not a shared
 * single-connection pool) is the correct choice for this seam.
 */
export class FetchTelemetryPoster implements TelemetryPoster {
  async post(req: TelemetryPostRequest): Promise<TelemetryPostResult> {
    const response = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.body,
    });
    const body = await response.text();
    return {
      status: response.status,
      body,
    };
  }
}

/** Factory matching the sibling `FetchSseTransport` construction style —
 * callers get the real fetch-backed poster with no configuration. */
export function createTelemetryPoster(): TelemetryPoster {
  return new FetchTelemetryPoster();
}
