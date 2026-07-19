/**
 * specs/036-fleet-control-plane — T112, Phase 2 (Foundational) / Phase 8 (US6).
 *
 * The sidecar's SSE client: framing decoder + connection loop + outcome
 * classification, sitting ABOVE the injected `SseTransport` byte/chunk seam
 * (transport.ts) and consuming the injected `Clock` (fleet/clock.ts) for the
 * read-idle watchdog. This is a Node client, NOT a browser — so we own the
 * loop explicitly rather than inheriting `EventSource`'s reconnect semantics.
 * `eventsource-parser` is used for FRAMING ONLY (parsing
 * `id:`/`event:`/`data:`/`retry:`/comment lines); its reconnect behavior is
 * deliberately NOT used.
 *
 * Contract (contracts/sidecar-plane-protocol.md § C4, § C3):
 *  - Classify BEFORE reading body bytes: non-200 / wrong Content-Type / 401 /
 *    403 are terminal (do not retry — a revoked token will not heal on retry).
 *  - Read-idle watchdog is 45s (3× the 15s keepalive). Comment (keepalive)
 *    frames MUST re-arm it exactly like data frames — the highest-value
 *    behavior in the feature. A comment-only stream must never trip the
 *    watchdog. The watchdog is driven by the injected monotonic `Clock`, not
 *    real wall time, so timeout behavior is provable in microseconds.
 *
 * No `any`, no `as`, no `@ts-ignore`. Relative `.js` (node16) imports.
 */

import { createParser } from 'eventsource-parser';
import type { Clock } from '../../fleet/clock.js';
import type { SseConnection, SseTransport } from './transport.js';

// ─── Framing decoder (§ C4) ─────────────────────────────────────────────────

/**
 * A single decoded SSE event. `retry` is folded in from the frame's `retry:`
 * field (the underlying parser surfaces it via a separate callback within the
 * same frame). Fields are readonly and each event is frozen — a decoded frame
 * is an immutable value.
 */
export interface SseEvent {
  readonly id?: string;
  readonly event?: string;
  readonly data: string;
  readonly retry?: number;
}

/**
 * Incremental, chunk-boundary-resilient SSE framing machine. `push()` feeds
 * raw bytes and returns any COMPLETE events produced by those bytes (empty
 * until a frame's terminating blank line arrives). Comment frames (leading
 * `:`) are surfaced ONLY via `onComment` — never as an `SseEvent` — enforcing
 * the C4 rule that keepalive comments re-arm the watchdog without being data.
 */
export interface SseDecoder {
  push(chunk: Uint8Array): SseEvent[];
  onComment(cb: (text: string) => void): void;
}

/**
 * Build an `SseDecoder` over `eventsource-parser` (framing only). A streaming
 * `TextDecoder` handles multi-byte UTF-8 sequences split across chunks. Frames
 * accumulate into a per-`push()` batch that is returned to the caller.
 */
export function createSseDecoder(): SseDecoder {
  const textDecoder = new TextDecoder();
  let commentCb: ((text: string) => void) | undefined;
  let batch: SseEvent[] = [];
  let pendingRetry: number | undefined;

  const parser = createParser({
    onEvent(message) {
      const event: SseEvent = Object.freeze({
        id: message.id,
        event: message.event,
        data: message.data,
        retry: pendingRetry,
      });
      pendingRetry = undefined;
      batch.push(event);
    },
    onRetry(retry) {
      // The parser fires this when it parses the frame's `retry:` line, which
      // precedes the blank-line dispatch — so it is available to fold into the
      // event `onEvent` builds next.
      pendingRetry = retry;
    },
    onComment(text) {
      if (commentCb !== undefined) {
        commentCb(text);
      }
    },
    onError() {
      // Unknown-field and invalid-retry lines are ignored by design (§ C4): a
      // single malformed field must never reject the surrounding frame.
    },
  });

  return {
    push(chunk: Uint8Array): SseEvent[] {
      batch = [];
      parser.feed(textDecoder.decode(chunk, { stream: true }));
      const produced = batch;
      batch = [];
      return produced;
    },
    onComment(cb: (text: string) => void): void {
      // Single active callback: a later registration REPLACES the earlier one
      // (registering does not stack, so the same handler wired twice does not
      // double-fire).
      commentCb = cb;
    },
  };
}

// ─── Connection-outcome classification (§ C4) ────────────────────────────────

/**
 * The initial-response classification of an SSE connect attempt:
 *  - `'stream'`   — 200 + `text/event-stream`; proceed to read events.
 *  - `'reestablish'` — a dropped connection after a good stream; reconnect
 *    with backoff (the reconnect loop's concern, not decided here).
 *  - `'terminal'` — non-200 / wrong Content-Type / 401 / 403; give up, no
 *    retry (an invalid or revoked token will not fix itself by retrying).
 */
export type ConnectionOutcome = 'stream' | 'reestablish' | 'terminal';

/**
 * How a single `runSseClient` connection attempt ENDED — the signal a
 * reconnect driver needs to distinguish "stop" from "reestablish"
 * (specs/036-fleet-control-plane — T113, contracts/sidecar-plane-protocol.md
 * § C4):
 *  - `'idle-timeout'`  — the read-idle watchdog elapsed; reconnect with backoff.
 *  - `'terminal'`      — `classifyConnection` returned 'terminal' (non-200 /
 *    wrong Content-Type / 401 / 403); STOP — an invalid or revoked token will
 *    not heal on retry.
 *  - `'stream-ended'`  — a good 200 stream ended (server closed / drop);
 *    reconnect with backoff.
 * `onClosed` fires AT MOST ONCE per connection attempt, and never on an
 * external `stop()` (a deliberate teardown is not a connection-end reason).
 */
export type SseCloseReason = 'idle-timeout' | 'terminal' | 'stream-ended';

/**
 * Classify a connection from its status + Content-Type, BEFORE consuming body
 * bytes. Anything that is not a 200 `text/event-stream` response is terminal.
 * The Content-Type may carry parameters (e.g. `; charset=utf-8`), so only the
 * media type is compared.
 */
export function classifyConnection(
  status: number,
  contentType: string | undefined,
): ConnectionOutcome {
  if (status !== 200) {
    return 'terminal';
  }
  if (contentType === undefined) {
    return 'terminal';
  }
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'text/event-stream') {
    return 'terminal';
  }
  return 'stream';
}

// ─── Connection loop with read-idle watchdog (§ C3, § C4) ────────────────────

/** Read-idle horizon: 45s = 3× the 15s transport keepalive cadence (§ C3). */
export const DEFAULT_READ_IDLE_MS = 45_000;

/**
 * Poll cadence for the watchdog. The watchdog's semantic timing is entirely a
 * function of the injected monotonic `Clock`; this small real-timer tick only
 * governs how quickly the loop NOTICES the clock has crossed the horizon. It
 * is nowhere near the 45s horizon itself.
 */
const WATCHDOG_POLL_MS = 5;

export interface SseClientOptions {
  readonly transport: SseTransport;
  readonly clock: Clock;
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly readIdleMs?: number;
  readonly onEvent: (e: {
    readonly id?: string;
    readonly event?: string;
    readonly data: string;
  }) => void;
  readonly onReadIdleTimeout: () => void;
  /**
   * Fired at most once when the connection attempt ends (T113). Additive and
   * optional — T112 callers that only wire `onReadIdleTimeout` are unaffected.
   * A reconnect driver subscribes here to decide reconnect vs. stop.
   */
  readonly onClosed?: (reason: SseCloseReason) => void;
}

export interface SseClientHandle {
  stop(): void;
}

/**
 * Open an SSE connection over the injected transport and run the read loop.
 * ANY frame — data OR comment (keepalive) — re-arms the read-idle watchdog;
 * `onReadIdleTimeout` fires at most once if the watchdog horizon elapses with
 * no frame since the last one. `stop()` tears the loop down (clears the
 * watchdog, closes the connection).
 */
export function runSseClient(opts: SseClientOptions): SseClientHandle {
  const clock = opts.clock;
  const readIdleMs = opts.readIdleMs ?? DEFAULT_READ_IDLE_MS;

  let stopped = false;
  let fired = false;
  let closedFired = false;
  let lastFrameMono = clock.monotonicNowMs();
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let connection: SseConnection | undefined;

  const rearm = (): void => {
    lastFrameMono = clock.monotonicNowMs();
  };

  // Fire the T113 close-reason surface exactly once per attempt. An external
  // stop() never routes through here — a deliberate teardown is not a
  // connection-end reason (§ C4).
  const fireClosed = (reason: SseCloseReason): void => {
    if (closedFired) {
      return;
    }
    closedFired = true;
    opts.onClosed?.(reason);
  };

  const clearWatchdog = (): void => {
    if (watchdog !== undefined) {
      clearInterval(watchdog);
      watchdog = undefined;
    }
  };

  const startWatchdog = (): void => {
    lastFrameMono = clock.monotonicNowMs();
    const handle = setInterval(() => {
      if (stopped || fired) {
        return;
      }
      if (clock.monotonicNowMs() - lastFrameMono >= readIdleMs) {
        fired = true;
        clearWatchdog();
        // Tear down the stalled connection the moment the watchdog fires
        // (AUDIT-20260718-31 / -33). Without this, the underlying transport
        // (e.g. the `fetch` request in FetchSseTransport) is left open: a
        // slow-but-not-dead peer or a buffering proxy that later resumes
        // sending would wake the `for await` loop below and deliver DUPLICATE
        // events alongside the fresh connection the reconnect driver already
        // started — plus leak the socket. Mirrors what `stop()` does.
        connection?.close();
        opts.onReadIdleTimeout();
        fireClosed('idle-timeout');
      }
    }, WATCHDOG_POLL_MS);
    handle.unref();
    watchdog = handle;
  };

  const decoder = createSseDecoder();
  decoder.onComment(() => {
    // Comment (keepalive) frames re-arm the watchdog exactly like data frames,
    // without ever surfacing as an event. THIS is the highest-value behavior.
    // Once the watchdog has already `fired` (or we `stopped`), the connection
    // is abandoned — a late keepalive must not re-arm a torn-down watchdog
    // (AUDIT-20260718-31 / -33).
    if (!stopped && !fired) {
      rearm();
    }
  });

  const run = async (): Promise<void> => {
    let conn: SseConnection;
    try {
      conn = await opts.transport.connect({
        url: opts.url,
        headers: opts.headers ?? {},
      });
    } catch {
      // The connect attempt itself rejected — an UNREACHABLE plane (DNS
      // failure, connection refused, TLS error, a blocked/invalid URL). That is
      // a reestablish-class end (§ C4), handled with backoff by the reconnect
      // driver — NEVER an unhandled promise rejection. The sidecar must tolerate
      // an unreachable plane and keep spooling (quickstart Scenario 1: "Plane
      // unreachable ⇒ sidecar spools"; the interactive path is never informed).
      // A caller-triggered stop() during the connect is filtered by the guard.
      if (!stopped) {
        fireClosed('stream-ended');
      }
      return;
    }
    connection = conn;
    if (stopped) {
      conn.close();
      return;
    }

    const outcome = classifyConnection(conn.status, conn.headers.get('content-type'));
    if (outcome !== 'stream') {
      conn.close();
      fireClosed('terminal');
      return;
    }

    startWatchdog();

    try {
      for await (const chunk of conn.chunks) {
        // HARD GUARD (AUDIT-20260718-31 / -33): once the read-idle watchdog has
        // `fired` (or the caller `stopped` us), this connection is abandoned —
        // a late chunk from it must NEVER be dispatched as an event. The
        // watchdog closes the connection, but a chunk already in flight (or one
        // a fake/buffering transport still yields) must be dropped here so it
        // can never resurrect as a duplicate `onEvent` alongside the fresh
        // reconnected stream.
        if (stopped || fired) {
          break;
        }
        const events = decoder.push(chunk);
        for (const event of events) {
          if (stopped || fired) {
            break;
          }
          rearm();
          opts.onEvent({ id: event.id, event: event.event, data: event.data });
        }
      }
    } catch {
      // A transport-level drop mid-stream (the async iterable rejecting) is a
      // reestablish-class end, not terminal (§ C4) — fall through to
      // 'stream-ended' below. A caller-triggered close surfaces here too when
      // stopped is already set, and is filtered out by the `!stopped` guard.
    }
    clearWatchdog();
    // A good 200 stream that ended on its own (server close / drop) is a
    // reestablish. If the watchdog already fired 'idle-timeout', or an external
    // stop() tore the loop down, fireClosed's once-guard / the `!stopped` guard
    // suppress a duplicate/spurious close (§ C4).
    if (!stopped) {
      fireClosed('stream-ended');
    }
  };

  void run();

  return {
    stop(): void {
      stopped = true;
      clearWatchdog();
      connection?.close();
    },
  };
}
