/**
 * specs/036-fleet-control-plane — T040 (impl), pairs with T037's RED test
 * (tests/fleet/buffer-asymmetry.test.ts).
 *
 * The BUFFERING ASYMMETRY, per contracts/local-socket-protocol.md § C4 and
 * spec.md FR-007:
 *
 *   - **Long-running commandable run** (`execute`, `govern`): a SMALL
 *     BOUNDED in-memory buffer covering a sidecar RESTART GAP. The bound is
 *     `INVOCATION_BUFFER_BOUND` below — PT-014 "pinned at task time".
 *   - **Short verb**: NONE. It DROPS on a sidecar-unavailable socket. A
 *     200ms process exits long before a sidecar returns; buffering it is
 *     ceremony.
 *
 * Long-term durability is the SIDECAR's job (its WAL) — this in-memory
 * buffer covers ONLY the restart gap for a long run. It is NOT a
 * durability mechanism and must never masquerade as one: a gap that
 * outlasts the bound loses its oldest events here, permanently, by design.
 *
 * DESIGN: the caller's KIND (`CallerKind`) selects buffer-vs-drop, at both
 * the value level (`createEventBuffer`'s runtime branch) and the type
 * level (the overloaded signatures below refuse to accept a `capacity` for
 * `'short-verb'` — passing one is a compile error, not a runtime no-op).
 * Both variants implement the SAME `EventBuffer` interface (composition
 * over inheritance, Principle VI) so `src/telemetry/emit.ts` (T039, out of
 * scope here) can hold one `EventBuffer` reference regardless of which
 * kind backs it.
 *
 * DROP POLICY (long-run, when full): drop the OLDEST buffered event to
 * make room for the newest. Named judgment call: the buffer's only job is
 * covering a short restart gap, so once it is saturated, the freshest
 * state is more useful than the stalest — the sidecar's WAL (not this
 * buffer) is the durability story for anything older, and
 * `src/fleet/sequence.ts`'s gap classification already handles reconciling
 * events that never arrive. A drop-newest policy would instead freeze the
 * buffer on the very first restart-gap event and never reflect anything
 * that happened after — strictly less useful once the sidecar returns.
 *
 * SCOPE (per the task pairing): the buffer only. Does NOT implement the
 * emit client (T039 `emit.ts` — it imports this buffer), the socket, or
 * the sidecar. Imports only `src/fleet/event.js` (for `TelemetryEvent`) —
 * nothing else.
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI).
 */

import type { TelemetryEvent } from '../fleet/event.js';

/**
 * Which kind of caller is buffering. This is the ENTIRE selector for the
 * asymmetry (FR-007 headline) — never derived from event content, event
 * rate, or any other signal.
 */
export type CallerKind = 'short-verb' | 'long-run';

/** The outcome of a single `push()` call. */
export type BufferPushResult = 'buffered' | 'dropped';

/**
 * The long-running run's in-memory buffer bound (FR-007), in EVENT COUNT.
 *
 * research.md § PT-014 lists "the long-running run's in-memory buffer
 * bound (FR-007)" among the constants "pinned at task time" — i.e. NOT a
 * number settled at plan time, and no spec artifact (spec.md,
 * data-model.md, contracts/local-socket-protocol.md) pins a concrete
 * count as of this task. Per the same convention `event.ts` established
 * for `MAX_EVENT_SNAPSHOT_BYTES`, this is an exported, NAMED constant
 * rather than a literal scattered across call sites, and the value itself
 * IS a judgment call (engineering sizing, not a looked-up fact):
 *
 * A sidecar restart-and-reconnect cycle is bounded by spawn time plus the
 * reconnect backoff schedule (`src/fleet/sequence.ts`'s
 * `RECONNECT_BACKOFF_CAP_MS` = 30s, `BACKOFF_RESET_HEALTHY_MS` = 60s) — so
 * the gap this buffer needs to cover is on the order of tens of seconds,
 * not minutes. A long-running `execute`/`govern` run emits aggregated
 * progress + occasional durable lifecycle events, not a high-frequency
 * flood (that volume belongs to `session.heartbeat`, which is live-only
 * and never buffered here at all — it dies with the gap, by design).
 * 64 is sized generously above a plausible worst-case event count across
 * such a gap, while staying small enough that "bounded" is not a fig leaf
 * for effectively-unbounded growth.
 */
export const INVOCATION_BUFFER_BOUND = 64;

/**
 * The buffer surface both `CallerKind` variants implement identically, so
 * `src/telemetry/emit.ts` (T039) can hold one reference regardless of
 * which kind backs it.
 */
export interface EventBuffer {
  /** Which kind of caller this buffer instance backs. Fixed at construction. */
  readonly kind: CallerKind;
  /** Maximum retained events. `0` for `'short-verb'` (nothing is ever retained). */
  readonly capacity: number;
  /** Events currently retained, awaiting `drain()`. */
  readonly size: number;
  /** Total events dropped over this buffer's lifetime — a short-verb push
   * that was refused, or a long-run eviction of the oldest event once full. */
  readonly droppedCount: number;

  /**
   * Offer one event to the buffer.
   * - `'short-verb'`: always returns `'dropped'`; `size` never moves off `0`.
   * - `'long-run'`: always returns `'buffered'`. If already at `capacity`,
   *   the oldest retained event is evicted first (incrementing
   *   `droppedCount`) so `size` never exceeds `capacity`.
   */
  push(event: TelemetryEvent): BufferPushResult;

  /**
   * Flush every retained event, in FIFO order (oldest first), and clear
   * the buffer — modeling "the sidecar returned; send everything queued
   * for the gap it missed." Idempotent: draining an empty buffer returns
   * `[]`. For `'short-verb'` this is always `[]`, since nothing is ever
   * retained.
   */
  drain(): TelemetryEvent[];
}

/**
 * `'short-verb'` variant (C4 / FR-007: "None. Drops on a sidecar-unavailable
 * socket."). Every `push()` is an immediate, zero-cost drop — no array, no
 * allocation beyond the counter, so "buffering it is ceremony" is true by
 * construction, not just by contract.
 */
class NoopEventBuffer implements EventBuffer {
  readonly kind = 'short-verb' as const;
  readonly capacity = 0;
  readonly size = 0;
  private drops = 0;

  get droppedCount(): number {
    return this.drops;
  }

  push(_event: TelemetryEvent): BufferPushResult {
    this.drops += 1;
    return 'dropped';
  }

  drain(): TelemetryEvent[] {
    return [];
  }
}

/**
 * `'long-run'` variant (C4 / FR-007: "small bounded in-memory buffer
 * covering a sidecar restart gap"). A bounded FIFO queue: `push()` always
 * retains the newest event, evicting the oldest first once `capacity` is
 * reached (see the module-level DROP POLICY comment for the justification).
 */
class BoundedFifoEventBuffer implements EventBuffer {
  readonly kind = 'long-run' as const;
  private readonly queue: TelemetryEvent[] = [];
  private drops = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(
        `createEventBuffer('long-run', capacity): capacity must be a positive ` +
          `integer (a bounded buffer with capacity <= 0 is not a buffer, it is ` +
          `a drop policy wearing a buffer's name — use 'short-verb' for that). ` +
          `Received ${JSON.stringify(capacity)}.`,
      );
    }
  }

  get size(): number {
    return this.queue.length;
  }

  get droppedCount(): number {
    return this.drops;
  }

  push(event: TelemetryEvent): BufferPushResult {
    if (this.queue.length >= this.capacity) {
      // Bounded means bounded: evict the oldest to make room for the
      // newest rather than growing past `capacity`.
      this.queue.shift();
      this.drops += 1;
    }
    this.queue.push(event);
    return 'buffered';
  }

  drain(): TelemetryEvent[] {
    const flushed = this.queue.splice(0, this.queue.length);
    return flushed;
  }
}

/** `'short-verb'`: no buffer, ever. `capacity` is not a parameter — the
 * type system refuses one, matching the runtime contract (C4 / FR-007). */
export function createEventBuffer(kind: 'short-verb'): EventBuffer;
/** `'long-run'`: a bounded FIFO buffer. `capacity` defaults to
 * `INVOCATION_BUFFER_BOUND` (PT-014) when omitted. */
export function createEventBuffer(kind: 'long-run', capacity?: number): EventBuffer;
export function createEventBuffer(kind: CallerKind, capacity?: number): EventBuffer {
  if (kind === 'short-verb') {
    return new NoopEventBuffer();
  }
  return new BoundedFifoEventBuffer(capacity ?? INVOCATION_BUFFER_BOUND);
}
