/**
 * specs/036-fleet-control-plane — T113, Phase 7-adjacent uplink work.
 *
 * contracts/sidecar-plane-protocol.md § C4 pins two independent reconnect
 * concerns, both implemented here:
 *
 * 1. CURSOR ADVANCEMENT (`EventIdBuffer` / `buildReconnectHeaders`). Per
 *    FR-058: the cursor is NOT command status — Last-Event-ID tracks which
 *    FRAMES were delivered to this sidecar, never whether a command
 *    completed. `EventIdBuffer` persists the last-seen `id:` across events
 *    that omit one (an id-less event does not clear the remembered id; only
 *    a new `id:` updates it — SSE client semantics, not this codebase's
 *    invention). `buildReconnectHeaders` injects the buffered id as the
 *    `Last-Event-ID` REQUEST HEADER — never a query-string parameter, per
 *    src/sidecar/uplink/transport.ts's `SseConnectRequest` shape, which has
 *    no separate cursor field precisely to close off that temptation.
 *
 * 2. RECONNECT BACKOFF (`ReconnectBackoff`). Full jitter, base 1s (reseeded
 *    by the server's `retry:` field), ×2 growth, cap 30s, reset after 60s
 *    healthy. This is a SEPARATE backoff instance from
 *    src/sidecar/spool/drain.ts's `BackoffSchedule` (that one backs the
 *    spool drain/transmit retry loop, FR-017's overflow-drain path) — same
 *    numeric policy shape by design, deliberately decoupled call sites (no
 *    shared mutable state), per drain.ts's own header note.
 *
 *    This class does NOT reuse drain.ts's `computeBackoffDelayMs`: that
 *    function's `jitter()` contract requires a return value strictly in
 *    `[0, 1)` and throws otherwise (Principle V — fail loud on a malformed
 *    injected source). This module's own RED test (tests/fleet/backoff.test.ts)
 *    asserts `random: () => 1` yields exactly the base delay — a value
 *    `computeBackoffDelayMs` would reject. The two call sites are pinned to
 *    slightly different injected-randomness contracts on purpose (this one
 *    tolerates the closed interval `[0, 1]`, matching "full jitter" in the
 *    inclusive sense the reconnect spec's own test fixture assumes), so the
 *    math is reimplemented here rather than shared. See also
 *    `.claude/rules/audit-barrage-is-stochastic-defense-in-depth.md` —
 *    this is not a case of hand-rolling deterministic logic a compiler
 *    already owns; it is two deliberately decoupled numeric policies that
 *    happen to share a shape (drain.ts's own header comment says as much).
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI).
 */

import type { Clock } from '../../fleet/clock.js';
import type { SseClientHandle } from './sse-client.js';
import { runSseClient } from './sse-client.js';
import type { SseTransport } from './transport.js';

// ---------------------------------------------------------------------------
// 1. Cursor advancement — Last-Event-ID buffer + reconnect header injection
// ---------------------------------------------------------------------------

/**
 * Tracks the Last-Event-ID buffer per SSE client rules.
 *
 * `current()`: returns the last seen event id, or `undefined` if none seen
 * yet. `observe(event)`: updates the buffer when `event.id` is present
 * (including an empty string, which is a valid id); PERSISTS across events
 * that omit `id` entirely or carry `id: undefined` — those do NOT clear the
 * remembered id.
 *
 * FR-058: this buffer tracks FRAME delivery only. It is never read as, or
 * written from, command/task completion status — a caller that wires this
 * buffer to command outcomes is misusing it.
 */
export interface EventIdBuffer {
  current(): string | undefined;
  observe(event: { readonly id?: string }): void;
}

/** Creates a new, empty `EventIdBuffer`. */
export function createEventIdBuffer(): EventIdBuffer {
  let current: string | undefined;
  return {
    current: () => current,
    observe: (event) => {
      if (event.id !== undefined) {
        current = event.id;
      }
    },
  };
}

/**
 * Builds request headers for a reconnect, injecting `Last-Event-ID` when
 * `lastEventId` is defined. `base` is copied, never mutated, so the caller's
 * own header object is safe to reuse across reconnect attempts. Per C4, this
 * ONLY ever touches headers — never the URL/query string.
 *
 * @param base Base headers to include (e.g. authorization, user-agent).
 * @param lastEventId The `EventIdBuffer`'s `current()` value, or `undefined`.
 * @returns A new headers object with `Last-Event-ID` injected iff
 *   `lastEventId` is defined; base headers are always included.
 */
export function buildReconnectHeaders(
  base: Readonly<Record<string, string>>,
  lastEventId: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = { ...base };
  if (lastEventId !== undefined) {
    headers['Last-Event-ID'] = lastEventId;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// 2. Reconnect backoff — full jitter, server-reseedable, healthy-resettable
// ---------------------------------------------------------------------------

/** Constructor options for `ReconnectBackoff`. All fields optional. */
export interface ReconnectBackoffOptions {
  /** Base delay (ms) before any growth/jitter is applied. Default 1000. */
  readonly baseMs?: number;
  /** Maximum delay (ms) growth may reach before jitter is applied. Default 30000. */
  readonly capMs?: number;
  /**
   * How long (ms) a reseeded base must go unbroken-healthy before it reverts
   * to the constructor default. Default 60000.
   */
  readonly healthyResetMs?: number;
  /**
   * Injected full-jitter randomness source, `[0, 1]`. Defaults to
   * `Math.random`. Tests inject a fixed source so delays are deterministic.
   */
  readonly random?: () => number;
}

const DEFAULT_BASE_MS = 1000;
const DEFAULT_CAP_MS = 30_000;
const DEFAULT_HEALTHY_RESET_MS = 60_000;

/**
 * The SSE stream's own reconnect backoff (contracts/sidecar-plane-protocol.md
 * § C4): `delay = random() * min(capMs, base * 2^attempt)`, where `base` is
 * the server-reseeded value when one has been supplied and not yet expired,
 * else the constructor default.
 */
export class ReconnectBackoff {
  private readonly baseMs: number;
  private readonly capMs: number;
  private readonly healthyResetMs: number;
  private readonly random: () => number;
  private reseededBaseMs: number | undefined;

  constructor(opts: ReconnectBackoffOptions = {}) {
    this.baseMs = opts.baseMs ?? DEFAULT_BASE_MS;
    this.capMs = opts.capMs ?? DEFAULT_CAP_MS;
    this.healthyResetMs = opts.healthyResetMs ?? DEFAULT_HEALTHY_RESET_MS;
    this.random = opts.random ?? Math.random;
  }

  /**
   * Computes the full-jitter delay for `attempt` (0-based). Growth is ×2 per
   * attempt from the current base, capped at `capMs`; the entire bounded
   * window `[0, boundedGrowth]` is the sampling range.
   *
   * Fails loud (Principle V) on a malformed `attempt` — never silently
   * clamps a caller bug.
   */
  nextDelayMs(attempt: number): number {
    if (!Number.isInteger(attempt) || attempt < 0) {
      throw new Error(
        `ReconnectBackoff.nextDelayMs: attempt must be a non-negative integer, got ${String(attempt)}`,
      );
    }
    const base = this.reseededBaseMs ?? this.baseMs;
    const boundedGrowth = Math.min(this.capMs, base * 2 ** attempt);
    return this.random() * boundedGrowth;
  }

  /**
   * Reseeds the base used by every subsequent `nextDelayMs()` call — "the
   * server's `retry:` field reseeds the base" (§ C4). Persists until
   * `noteHealthyFor` observes a sufficiently long healthy period.
   */
  reseedBaseFromServerRetry(retryMs: number): void {
    this.reseededBaseMs = retryMs;
  }

  /**
   * Reports that the connection has been continuously healthy for
   * `elapsedMs`. Once `elapsedMs >= healthyResetMs`, a reseeded base reverts
   * to the constructor default — "reset after 60s healthy" (§ C4), so a
   * server-suggested retry interval from a past incident does not pin the
   * base forever once the link has recovered.
   */
  noteHealthyFor(elapsedMs: number): void {
    if (elapsedMs >= this.healthyResetMs) {
      this.reseededBaseMs = undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Reconnect loop — compose cursor + backoff + single-connection client
// ---------------------------------------------------------------------------

/**
 * Cancels a pending scheduled reconnect. Returned by `setTimer`.
 */
export type CancelTimer = () => void;

/**
 * The injected sleep/timer seam that schedules the next reconnect attempt
 * (specs/036-fleet-control-plane — T113). In production this is a
 * `setTimeout` wrapper; tests inject a fake so the backoff delay is provable
 * WITHOUT a real wall-clock wait — the delay VALUE is computed by
 * `ReconnectBackoff` (injected `random`), and the fake fires the callback on
 * the test's command. § C4's "full jitter … retry forever" loop must never
 * block on real time in a test.
 */
export type SetReconnectTimer = (delayMs: number, cb: () => void) => CancelTimer;

const defaultSetReconnectTimer: SetReconnectTimer = (delayMs, cb) => {
  const handle = setTimeout(cb, delayMs);
  handle.unref();
  return () => clearTimeout(handle);
};

/** Options for {@link runReconnectingSseClient}. */
export interface ReconnectingSseClientOptions {
  readonly transport: SseTransport;
  readonly clock: Clock;
  readonly url: string;
  /** Base request headers (auth, user-agent). `Last-Event-ID` is injected per
   * attempt from the cursor — never place it here. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly readIdleMs?: number;
  /** Observes every delivered event (the cursor advances internally regardless). */
  readonly onEvent?: (e: {
    readonly id?: string;
    readonly event?: string;
    readonly data: string;
  }) => void;
  /** Injectable backoff so tests pin the delay via a fixed `random`. Defaults
   * to a fresh `ReconnectBackoff` with the § C4 policy. */
  readonly backoff?: ReconnectBackoff;
  /** Injectable timer seam (default `setTimeout`). Tests inject a fake. */
  readonly setTimer?: SetReconnectTimer;
}

/** Handle returned by {@link runReconnectingSseClient}. */
export interface ReconnectingSseClientHandle {
  /** Tears down the current connection and prevents any further reconnect. */
  stop(): void;
}

/**
 * The SSE reconnect DRIVER (specs/036-fleet-control-plane — T113,
 * contracts/sidecar-plane-protocol.md § C4): composes the T113 cursor
 * primitives and the T112 single-connection client into the forever-retry
 * loop the sidecar owns explicitly (it is a Node client, not a browser
 * `EventSource`).
 *
 * Per attempt it builds headers via `buildReconnectHeaders(base,
 * buffer.current())` — the cursor rides as the `Last-Event-ID` REQUEST HEADER,
 * never a query param — runs one connection through `runSseClient`, and
 * advances the cursor on EVERY delivered event (FR-058: the cursor tracks
 * frame delivery, NOT command status). On a reestablish-class close
 * ('idle-timeout' | 'stream-ended') it schedules the next attempt after
 * `ReconnectBackoff.nextDelayMs(attempt)` via the injected timer seam. On a
 * 'terminal' close (non-200 / wrong Content-Type / 401 / 403) it STOPS — an
 * invalid or revoked token will not heal on retry.
 */
export function runReconnectingSseClient(
  opts: ReconnectingSseClientOptions,
): ReconnectingSseClientHandle {
  const buffer = createEventIdBuffer();
  const backoff = opts.backoff ?? new ReconnectBackoff();
  const setTimer = opts.setTimer ?? defaultSetReconnectTimer;
  const baseHeaders = opts.headers ?? {};

  let attempt = 0;
  let stopped = false;
  let currentHandle: SseClientHandle | undefined;
  let cancelTimer: CancelTimer | undefined;

  const scheduleReconnect = (): void => {
    if (stopped) {
      return;
    }
    const delayMs = backoff.nextDelayMs(attempt);
    attempt += 1;
    cancelTimer = setTimer(delayMs, () => {
      cancelTimer = undefined;
      if (stopped) {
        return;
      }
      connectOnce();
    });
  };

  const connectOnce = (): void => {
    if (stopped) {
      return;
    }
    const headers = buildReconnectHeaders(baseHeaders, buffer.current());
    currentHandle = runSseClient({
      transport: opts.transport,
      clock: opts.clock,
      url: opts.url,
      headers,
      readIdleMs: opts.readIdleMs,
      onEvent: (e) => {
        // FR-058: the cursor advances on every delivered frame — an id-less
        // event persists the last id (EventIdBuffer semantics).
        buffer.observe({ id: e.id });
        opts.onEvent?.(e);
      },
      onReadIdleTimeout: () => {
        // The reconnect decision is made in onClosed('idle-timeout'); this
        // required T112 callback is intentionally inert for the driver.
      },
      onClosed: (reason) => {
        // Tear down the just-closed attempt (idempotent; for 'idle-timeout' the
        // chunk loop is still parked until the connection closes).
        currentHandle?.stop();
        if (stopped) {
          return;
        }
        if (reason === 'terminal') {
          // § C4: terminal / 401 / 403 — do NOT retry.
          stopped = true;
          return;
        }
        // 'idle-timeout' | 'stream-ended' — reestablish with backoff.
        scheduleReconnect();
      },
    });
  };

  connectOnce();

  return {
    stop(): void {
      stopped = true;
      if (cancelTimer !== undefined) {
        cancelTimer();
        cancelTimer = undefined;
      }
      currentHandle?.stop();
    },
  };
}
