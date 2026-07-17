// specs/036-fleet-control-plane — T076 (RED), Phase 6 / US4. Pairs with T083
// impl (src/sidecar/lifecycle.ts).
//
// PT-010 reconciliation window (data-model.md § Status, contracts/
// sidecar-plane-protocol.md, local-socket-protocol.md C5): a run whose
// socket closed abnormally is NOT immediately gone. A bounded reconciliation
// window lets it RE-ANNOUNCE. A run that re-announces INSIDE the window was
// never gone; a run that MISSES the whole window is presumed gone — ONLY
// THEN. The window must comfortably exceed a sidecar restart + reconnect.
//
// Time is driven EXPLICITLY via an injected Clock (src/fleet/clock.ts) — no
// real wall-clock sleeps. A 45s-scale window is exercised in microseconds by
// advancing a fake clock.
//
// RED: src/sidecar/lifecycle.ts does not exist yet — the VALUE import below
// fails at module-load, the correct failing-first signal.
//
// Relative `.js` imports (node16). No `any`, no `as`, no `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import {
  createReconciliationWindow,
  type ReconciliationWindow,
} from '../../src/sidecar/lifecycle.js';
import type { Clock } from '../../src/fleet/clock.js';

// A hand-advanced Clock (the DI seam is the interface; fakes live in tests).
// Drives both clock reads from one monotonic base so no real time passes.
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

const WINDOW_MS = 45_000;

describe('reconciliation window (T076, PT-010 — re-announce ⇒ alive; full-window miss ⇒ presumed gone ONLY THEN)', () => {
  it('a run whose socket just closed is ALIVE while the window is still open — not yet presumed gone', () => {
    const clock = new FakeClock(1_000, Date.parse('2026-07-17T00:00:00.000Z'));
    const window: ReconciliationWindow = createReconciliationWindow({ clock, windowMs: WINDOW_MS });

    window.openWindow('run-1');
    // Immediately after the close, before any time has passed.
    expect(window.presenceOf('run-1')).toBe('alive');

    // Part-way through the window, still no re-announce: still alive. The
    // window has NOT closed, so concluding "gone" here would be premature.
    clock.advance(WINDOW_MS - 1);
    expect(window.presenceOf('run-1')).toBe('alive');
  });

  it('re-announcement INSIDE the window ⇒ alive, and it STAYS alive past the window (it was never gone)', () => {
    const clock = new FakeClock(1_000, Date.parse('2026-07-17T00:00:00.000Z'));
    const window: ReconciliationWindow = createReconciliationWindow({ clock, windowMs: WINDOW_MS });

    window.openWindow('run-1');
    clock.advance(WINDOW_MS / 2);
    window.reannounce('run-1'); // reconnected & re-registered within the window

    expect(window.presenceOf('run-1')).toBe('alive');

    // Advance well past where the window WOULD have closed. Because it
    // re-announced, the run was never gone; it must not flip to presumed-gone.
    clock.advance(WINDOW_MS * 3);
    expect(window.presenceOf('run-1')).toBe('alive');
  });

  it('a FULL-window MISS ⇒ presumed gone — and only then', () => {
    const clock = new FakeClock(1_000, Date.parse('2026-07-17T00:00:00.000Z'));
    const window: ReconciliationWindow = createReconciliationWindow({ clock, windowMs: WINDOW_MS });

    window.openWindow('run-1');

    // Still inside the window ⇒ NOT presumed gone yet.
    clock.advance(WINDOW_MS - 1);
    expect(window.presenceOf('run-1')).not.toBe('presumed-gone');
    expect(window.presenceOf('run-1')).toBe('alive');

    // Cross the full window with no re-announce ⇒ presumed gone, only now.
    clock.advance(1);
    expect(window.presenceOf('run-1')).toBe('presumed-gone');
  });

  it('presence is a function of the injected clock — no real wall-clock sleep decides it', () => {
    const clock = new FakeClock(1_000, Date.parse('2026-07-17T00:00:00.000Z'));
    const window: ReconciliationWindow = createReconciliationWindow({ clock, windowMs: WINDOW_MS });

    window.openWindow('run-1');
    // Nothing but advancing the fake clock moves the verdict; we never sleep.
    expect(window.presenceOf('run-1')).toBe('alive');
    clock.advance(WINDOW_MS + 5_000);
    expect(window.presenceOf('run-1')).toBe('presumed-gone');
  });
});
