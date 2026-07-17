// specs/036-fleet-control-plane — T088, Phase 6 / US4. Pairs with the idle-exit
// primitive in src/sidecar/lifecycle.ts.
//
// PT-003 idle-exit (~10 min): a sidecar that has been idle exits. This is a
// LATENCY optimization, not a correctness guarantee — the WAL (T084), not a
// graceful flush, is what makes durability safe by construction. The decision
// is a pure function of an injected Clock (no real timer is armed); the caller
// drives checkIdle() on its own poll cadence.
//
// Time is driven EXPLICITLY via an injected Clock (src/fleet/clock.ts) — no
// real wall-clock sleeps.
//
// Relative `.js` imports (node16). No `any`, no `as`, no `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import {
  createIdleExit,
  DEFAULT_IDLE_EXIT_MS,
  type IdleExit,
} from '../../src/sidecar/lifecycle.js';
import type { Clock } from '../../src/fleet/clock.js';

class FakeClock implements Clock {
  private mono: number;
  private wallMs: number;

  constructor(startMono: number, startWallMs: number) {
    this.mono = startMono;
    this.wallMs = startWallMs;
  }

  nowIso(): string {
    return new Date(this.wallMs).toISOString();
  }

  monotonicNowMs(): number {
    return this.mono;
  }

  advance(ms: number): void {
    this.mono += ms;
    this.wallMs += ms;
  }
}

function newClock(): FakeClock {
  return new FakeClock(1_000, Date.parse('2026-07-17T00:00:00.000Z'));
}

describe('idle-exit primitive (T088, PT-003)', () => {
  it('does NOT exit before the idle threshold', () => {
    const clock = newClock();
    let exits = 0;
    const idle: IdleExit = createIdleExit({ clock, onExit: () => (exits += 1), idleMs: 10_000 });
    clock.advance(9_999);
    idle.checkIdle();
    expect(exits).toBe(0);
  });

  it('exits once the idle threshold is reached', () => {
    const clock = newClock();
    let exits = 0;
    const idle = createIdleExit({ clock, onExit: () => (exits += 1), idleMs: 10_000 });
    clock.advance(10_000);
    idle.checkIdle();
    expect(exits).toBe(1);
  });

  it('fires onExit AT MOST ONCE even across repeated idle checks', () => {
    const clock = newClock();
    let exits = 0;
    const idle = createIdleExit({ clock, onExit: () => (exits += 1), idleMs: 10_000 });
    clock.advance(50_000);
    idle.checkIdle();
    idle.checkIdle();
    idle.checkIdle();
    expect(exits).toBe(1);
  });

  it('recordActivity resets the idle timer, deferring exit', () => {
    const clock = newClock();
    let exits = 0;
    const idle = createIdleExit({ clock, onExit: () => (exits += 1), idleMs: 10_000 });
    clock.advance(9_000);
    idle.recordActivity();
    clock.advance(9_000); // 18s total elapsed but only 9s since last activity
    idle.checkIdle();
    expect(exits).toBe(0);
    clock.advance(1_000); // now 10s since the recorded activity
    idle.checkIdle();
    expect(exits).toBe(1);
  });

  it('idleForMs reports elapsed time since the last activity, from the injected clock', () => {
    const clock = newClock();
    const idle = createIdleExit({ clock, onExit: () => undefined, idleMs: 10_000 });
    expect(idle.idleForMs()).toBe(0);
    clock.advance(3_500);
    expect(idle.idleForMs()).toBe(3_500);
    idle.recordActivity();
    expect(idle.idleForMs()).toBe(0);
  });

  it('defaults to ~10 minutes when idleMs is omitted', () => {
    expect(DEFAULT_IDLE_EXIT_MS).toBe(600_000);
    const clock = newClock();
    let exits = 0;
    const idle = createIdleExit({ clock, onExit: () => (exits += 1) });
    clock.advance(DEFAULT_IDLE_EXIT_MS - 1);
    idle.checkIdle();
    expect(exits).toBe(0);
    clock.advance(1);
    idle.checkIdle();
    expect(exits).toBe(1);
  });
});
