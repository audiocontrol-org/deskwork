// specs/036-fleet-control-plane — T075 (RED), Phase 6 / US4.
// *** THE SINGLE MOST IMPORTANT HONESTY TEST IN THE FEATURE ***
// Pairs with T082 (src/sidecar/liveness.ts) + T083 (src/sidecar/lifecycle.ts).
//
// This feature's PRIMARY NAMED RISK: a fleet view that lies is worse than no
// fleet view. The worst possible lie, at the worst possible moment:
//
//   A sidecar RESTART closes ALL N local sockets AT ONCE while NOTHING has
//   actually died. A sidecar concluding "all my runs crashed" because its
//   OWN sockets closed would be MAXIMALLY WRONG (FR-026, SC-005,
//   local-socket-protocol.md C5, sidecar-plane-protocol.md test obligation
//   #11: "Plane restart ⇒ sidecars re-announce; registry rebuilds; 0 false
//   deaths").
//
// The system MUST produce ZERO false deaths:
//   (1) interpreting each mass close never yields a death verdict — it is
//       `abnormally-disconnected` (a CONNECTION-axis value), reason unknown;
//   (2) the bounded reconciliation window (PT-010) holds each run as ALIVE
//       across the restart gap, letting all N re-announce and be seen alive;
//   (3) none is marked presumed-gone purely because the sidecar bounced.
//
// Time is driven EXPLICITLY via an injected Clock — no real sleeps.
//
// RED: neither src/sidecar/liveness.ts nor src/sidecar/lifecycle.ts exists
// yet — the VALUE imports below fail at module-load, the correct
// failing-first signal.
//
// Relative `.js` imports (node16). No `any`, no `as`, no `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import {
  interpretSocketClose,
  type SocketCloseObservation,
} from '../../src/sidecar/liveness.js';
import {
  createReconciliationWindow,
  type ReconciliationWindow,
  type RunPresence,
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

const WINDOW_MS = 45_000;
// A sidecar restart + reconnect is fast relative to the window — the window
// must comfortably exceed it (PT-010 / T083).
const RESTART_RECONNECT_MS = 2_000;

// Death verdicts that would be LIES if any run were labeled with them purely
// because the sidecar bounced.
const DEATH_VERDICTS: readonly string[] = [
  'crashed',
  'dead',
  'died',
  'failed',
  'killed',
  'terminated',
];

function healthyRunIds(n: number): readonly string[] {
  return Array.from({ length: n }, (_unused, i) => `run-${i + 1}`);
}

describe('sidecar restart ⇒ 0 false deaths (T075 — THE honesty test; SC-005, FR-026)', () => {
  it('interpreting each of N simultaneous socket closes yields ZERO death verdicts', () => {
    const runs = healthyRunIds(12);

    // The restart closes every socket at once, none preceded by an
    // end-of-invocation frame — but NOTHING actually died.
    const verdicts = runs.map((runId) => {
      const observation: SocketCloseObservation = { runId, sawEndOfInvocation: false };
      return interpretSocketClose(observation);
    });

    let deathConclusions = 0;
    for (const verdict of verdicts) {
      if (DEATH_VERDICTS.includes(verdict.connectionStatus)) {
        deathConclusions += 1;
      }
      // Each is honest: a dropped connection, reason unknown.
      expect(verdict.connectionStatus).toBe('abnormally-disconnected');
      expect(verdict.terminationReason).toBe('unknown');
    }
    expect(deathConclusions).toBe(0);
  });

  it('the reconciliation window holds ALL N runs alive across the restart, then all re-announce ⇒ 0 presumed-gone', () => {
    const clock = new FakeClock(1_000, Date.parse('2026-07-17T00:00:00.000Z'));
    const window: ReconciliationWindow = createReconciliationWindow({ clock, windowMs: WINDOW_MS });
    const runs = healthyRunIds(12);

    // Restart: every socket closes at once ⇒ open a reconciliation window
    // for every run.
    for (const runId of runs) {
      window.openWindow(runId);
    }

    // Right after the restart — the worst moment. NONE may be presumed gone:
    // the window is open and nothing died.
    const atRestart: RunPresence[] = runs.map((runId) => window.presenceOf(runId));
    expect(atRestart.filter((presence) => presence === 'presumed-gone')).toHaveLength(0);
    expect(atRestart.every((presence) => presence === 'alive')).toBe(true);

    // The sidecar comes back and every run re-announces, well within the
    // window (restart+reconnect is fast relative to WINDOW_MS).
    clock.advance(RESTART_RECONNECT_MS);
    expect(RESTART_RECONNECT_MS).toBeLessThan(WINDOW_MS);
    for (const runId of runs) {
      window.reannounce(runId);
    }

    // Advance well past where the window WOULD have closed. Because every run
    // re-announced, none was ever gone.
    clock.advance(WINDOW_MS * 3);

    const falseDeaths = runs.filter((runId) => window.presenceOf(runId) === 'presumed-gone');
    expect(falseDeaths).toHaveLength(0);
    expect(runs.every((runId) => window.presenceOf(runId) === 'alive')).toBe(true);
  });

  it('a sidecar bounce is modeled as CONNECTION loss, never execution death — the axes never collapse', () => {
    // The whole point: "the sidecar restarted" is a connection-axis fact. It
    // must never be readable as an execution-axis death. Each close verdict
    // lives on connectionStatus with reason unknown — there is no path from
    // "my socket closed" to "the run crashed".
    const runs = healthyRunIds(5);
    for (const runId of runs) {
      const verdict = interpretSocketClose({ runId, sawEndOfInvocation: false });
      expect(verdict.connectionStatus).toBe('abnormally-disconnected');
      expect(DEATH_VERDICTS).not.toContain(verdict.connectionStatus);
    }
  });
});
