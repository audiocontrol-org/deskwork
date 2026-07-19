/**
 * specs/036-fleet-control-plane — T004 (RED), Phase setup / PT-013.
 *
 * PT-013 (research.md "Clock semantics" — SETTLED, not re-derived here):
 * "sequences order; clocks describe." Wall-clock time and monotonic time are
 * DISTINCT operations and must never be conflated behind one method:
 *   - Wall clock (`nowIso()`): ISO-8601, ordering-non-authoritative, purely
 *     descriptive ("when did this happen, for a human/diagnostic to read").
 *   - Monotonic clock (`monotonicNowMs()`): a millisecond number meaningful
 *     ONLY within this process — the plane cannot difference `hrtime`/
 *     `performance.now()` readings taken in different processes or hosts
 *     even in principle (research.md PT-013, data-model.md § Envelope:
 *     `monotonicOffsetMs` is "computed at source").
 *
 * `Clock` is an injected DI seam (Constitution Principle VI) precisely so
 * that timeout-driven behaviors (PT-014: 45s read-idle, keepalive, backoff)
 * can be tested in microseconds against a FAKE clock instead of real wall
 * time. This test pins the interface shape and the real (system)
 * implementation's behavioral contract: two independently-callable methods,
 * and monotonic reads that never decrease within a process.
 *
 * Per research.md § Testability strategy: NOT vitest fake timers — a
 * verified open bug means they do not fake `performance.now()`, which is
 * exactly the clock this interface pins. A real `SystemClock` is exercised
 * directly against real wall time here (no fake timers involved).
 */

import { describe, expect, it } from 'vitest';
import type { Clock } from '../../src/fleet/clock.js';
import { SystemClock } from '../../src/fleet/clock.js';

describe('Clock (T004, PT-013 — wall and monotonic are separate operations)', () => {
  it('exposes two distinct methods: nowIso() and monotonicNowMs()', () => {
    const clock: Clock = new SystemClock();
    expect(typeof clock.nowIso).toBe('function');
    expect(typeof clock.monotonicNowMs).toBe('function');
    // Distinct operations, not one call serving both purposes.
    expect(clock.nowIso).not.toBe(clock.monotonicNowMs);
  });

  it('nowIso() returns an ISO-8601 wall-clock string', () => {
    const clock: Clock = new SystemClock();
    const wall = clock.nowIso();
    expect(typeof wall).toBe('string');
    // Round-trips through Date parsing and re-serializes to the same instant.
    expect(new Date(wall).toISOString()).toBe(wall);
    // ISO-8601 extended UTC form, e.g. 2026-07-17T12:00:00.000Z.
    expect(wall).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('monotonicNowMs() returns a finite millisecond number', () => {
    const clock: Clock = new SystemClock();
    const mono = clock.monotonicNowMs();
    expect(typeof mono).toBe('number');
    expect(Number.isFinite(mono)).toBe(true);
  });

  it('monotonic reads are non-decreasing across repeated calls within a process', () => {
    const clock: Clock = new SystemClock();
    const readings: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      readings.push(clock.monotonicNowMs());
    }
    for (let i = 1; i < readings.length; i += 1) {
      expect(readings[i]).toBeGreaterThanOrEqual(readings[i - 1] as number);
    }
  });

  it('wall-clock reads track real elapsed time (sanity: a later read is >= an earlier read)', () => {
    const clock: Clock = new SystemClock();
    const first = clock.nowIso();
    const second = clock.nowIso();
    expect(new Date(second).getTime()).toBeGreaterThanOrEqual(new Date(first).getTime());
  });

  it('is a DI seam: a fake implementing the same interface is injectable in place of the real one', () => {
    // The fake lives here (in the test), not in src/ — the interface is the
    // seam; src/ only ships the real (system) implementation (T005 scope).
    class FakeClock implements Clock {
      private wall: string;
      private mono: number;

      constructor(startWall: string, startMono: number) {
        this.wall = startWall;
        this.mono = startMono;
      }

      nowIso(): string {
        return this.wall;
      }

      monotonicNowMs(): number {
        return this.mono;
      }

      advance(ms: number): void {
        this.mono += ms;
        this.wall = new Date(new Date(this.wall).getTime() + ms).toISOString();
      }
    }

    function usesInjectedClock(clock: Clock): { wall: string; mono: number } {
      return { wall: clock.nowIso(), mono: clock.monotonicNowMs() };
    }

    const fake = new FakeClock('2026-01-01T00:00:00.000Z', 1000);
    expect(usesInjectedClock(fake)).toEqual({
      wall: '2026-01-01T00:00:00.000Z',
      mono: 1000,
    });

    // A 45-second-timeout-style behavior tested in microseconds: advance the
    // fake clock instead of waiting on real wall time.
    fake.advance(45_000);
    expect(fake.monotonicNowMs()).toBe(46_000);
    expect(fake.nowIso()).toBe('2026-01-01T00:00:45.000Z');
  });
});
