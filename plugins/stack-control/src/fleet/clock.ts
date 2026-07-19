/**
 * specs/036-fleet-control-plane — T005, Phase setup / PT-013.
 *
 * PT-013 (research.md "Clock semantics" — SETTLED): "sequences order; clocks
 * describe." Wall-clock time and monotonic time are DISTINCT operations and
 * must never be conflated behind one method:
 *   - `nowIso()` — wall clock, ISO-8601, purely descriptive. Never
 *     authoritative for ordering (`invocationSequence` owns ordering).
 *   - `monotonicNowMs()` — a millisecond number meaningful ONLY within this
 *     process. The plane cannot difference readings across processes or
 *     hosts even in principle; do not carry a raw monotonic reading across a
 *     process boundary. (Envelope's `monotonicOffsetMs`, data-model.md, is a
 *     DELTA computed at source from two same-process readings of this
 *     clock — not a cross-process comparison.)
 *
 * `Clock` is an injected DI seam (Constitution Principle VI) so that
 * timeout-driven behaviors (PT-014: 45s read-idle, 15s keepalive, backoff)
 * can be tested in microseconds against a fake clock instead of real wall
 * time. This module ships only the real (system) implementation; fakes live
 * in test code (tests/fleet/clock.test.ts), per the plan's test-vs-src split.
 */

/**
 * Injectable time source with wall-clock and monotonic reads kept as
 * separate operations (PT-013). Never conflate the two into a single method.
 */
export interface Clock {
  /**
   * Current wall-clock time as an ISO-8601 string (UTC). Descriptive only —
   * never use this for ordering within or across runs (PT-013).
   */
  nowIso(): string;

  /**
   * Current monotonic time in milliseconds. Meaningful only as a delta
   * against another reading taken from the SAME `Clock` instance within the
   * SAME process — never compare or difference against a reading from a
   * different process or host (PT-013).
   */
  monotonicNowMs(): number;
}

/**
 * The real (system) `Clock`. Backs `nowIso()` with `Date` and
 * `monotonicNowMs()` with `performance.now()` — Node's monotonic clock,
 * unaffected by wall-clock adjustments (NTP steps, DST, manual changes).
 */
export class SystemClock implements Clock {
  nowIso(): string {
    return new Date().toISOString();
  }

  monotonicNowMs(): number {
    return performance.now();
  }
}
