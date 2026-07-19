// specs/036-fleet-control-plane — T116 (RED), contracts/sidecar-plane-protocol.md
// § C3 "Two heartbeats, unrelated, both required" (FR-022/023/024).
//
// § C3 names THREE liveness-adjacent signals in this feature, and this test
// exists to keep them from ever collapsing into one:
//
//   1. Transport keepalive  (plane → sidecar, 15s SSE comment frames, T115) —
//      proves NOTHING about process health; survives idle-killing
//      intermediaries only.
//   2. Session liveness     (sidecar → plane, THIS module, T116) — proves the
//      sidecar AND its host are alive and reachable. Cadence is pinned at
//      task time via an injected interval, not hardcoded to 15s/45s.
//   3. Run liveness         (the local socket — local-socket-protocol § C5,
//      OUT OF SCOPE here) — the ONLY signal that answers "is this run
//      alive". Session liveness MUST NOT be used to infer it.
//
// Time is driven EXPLICITLY via an injected Clock (src/fleet/clock.ts) — no
// real wall-clock sleeps, no vi.useFakeTimers() (research.md § Testability
// strategy: they don't fake performance.now()).
//
// RED: src/sidecar/session-liveness.ts does not exist yet — the value import
// below fails at module load, the correct failing-first signal.
//
// Relative `.js` imports (node16). No `any`, no `as`, no `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import {
  createSessionLivenessScheduler,
  type SessionLivenessScheduler,
  type SessionLivenessSignal,
} from '../../src/sidecar/session-liveness.js';
import type { Clock } from '../../src/fleet/clock.js';

// A hand-advanced Clock (the DI seam is the interface; fakes live in
// tests). Mirrors tests/fleet/reconciliation-window.test.ts's FakeClock.
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

const INTERVAL_MS = 20_000;
const INSTALLATION_ID = 'a1b2c3d4-0000-4000-8000-000000000000';
// The instance identity the signal carries (AUDIT-20260719-21): host:path, NOT
// (only) installationId — a UUID a copied checkout shares, so it cannot pin the
// heartbeat to the RIGHT host:path. The sidecar knows both because it serves ONE
// installation.
const HOST = 'orion-mbp';
const PATH = '/Users/orion/work/proj-a';

describe('session-liveness scheduler (T116, § C3 — sidecar → plane heartbeat, DISTINCT from transport keepalive and run liveness)', () => {
  it('(a) emits a heartbeat at the configured cadence, driven purely by advancing the injected Clock', () => {
    const clock = new FakeClock(0, Date.parse('2026-07-17T00:00:00.000Z'));
    const emitted: SessionLivenessSignal[] = [];
    const scheduler: SessionLivenessScheduler = createSessionLivenessScheduler({
      clock,
      intervalMs: INTERVAL_MS,
      installationId: INSTALLATION_ID,
      host: HOST,
      path: PATH,
      send: (signal) => {
        emitted.push(signal);
      },
    });

    // First check establishes the baseline and fires immediately.
    scheduler.checkAndEmit();
    expect(emitted).toHaveLength(1);

    // Well before the interval elapses: no second heartbeat.
    clock.advance(INTERVAL_MS - 1);
    scheduler.checkAndEmit();
    expect(emitted).toHaveLength(1);

    // Crossing the interval boundary: a second heartbeat fires.
    clock.advance(1);
    scheduler.checkAndEmit();
    expect(emitted).toHaveLength(2);

    // Advancing a further THREE full intervals without any intermediate
    // check-in: a single subsequent checkAndEmit() still only fires once
    // (the scheduler reports "at least one interval has elapsed", not "N
    // intervals elapsed") — never a wait, never a real timer, purely the
    // clock delta at the moment of the call.
    clock.advance(INTERVAL_MS * 3);
    scheduler.checkAndEmit();
    expect(emitted).toHaveLength(3);
  });

  it('(b) the injected send receives a session-liveness signal identifying the installation/host — not a run', () => {
    const clock = new FakeClock(0, Date.parse('2026-07-17T00:00:00.000Z'));
    const emitted: SessionLivenessSignal[] = [];
    const scheduler: SessionLivenessScheduler = createSessionLivenessScheduler({
      clock,
      intervalMs: INTERVAL_MS,
      installationId: INSTALLATION_ID,
      host: HOST,
      path: PATH,
      send: (signal) => {
        emitted.push(signal);
      },
    });

    scheduler.checkAndEmit();
    expect(emitted).toHaveLength(1);
    const signal = emitted[0];
    if (signal === undefined) {
      throw new Error('expected exactly one emitted session-liveness signal');
    }

    expect(signal.kind).toBe('session-liveness');
    expect(signal.installationId).toBe(INSTALLATION_ID);
    // The instance identity (host:path) the plane keys liveness by (AUDIT-20260719-21).
    expect(signal.host).toBe(HOST);
    expect(signal.path).toBe(PATH);
    // Descriptive wall-clock timestamp (PT-013: nowIso() is descriptive
    // only, never authoritative for ordering).
    expect(new Date(signal.emittedAt).toISOString()).toBe(signal.emittedAt);
  });

  it('(c) session-liveness carries NO run/execution-status field and cannot be mistaken for run liveness', () => {
    const clock = new FakeClock(0, Date.parse('2026-07-17T00:00:00.000Z'));
    const emitted: SessionLivenessSignal[] = [];
    const scheduler: SessionLivenessScheduler = createSessionLivenessScheduler({
      clock,
      intervalMs: INTERVAL_MS,
      installationId: INSTALLATION_ID,
      host: HOST,
      path: PATH,
      send: (signal) => {
        emitted.push(signal);
      },
    });

    scheduler.checkAndEmit();
    const signal = emitted[0];
    if (signal === undefined) {
      throw new Error('expected exactly one emitted session-liveness signal');
    }

    // The ENTIRE wire shape is exactly these identity/timing fields — kind,
    // installationId, host, path (the instance identity, AUDIT-20260719-21), and
    // emittedAt — no runId, no executionStatus, no connectionStatus, no
    // livenessStatus. host/path identify WHICH host is alive (a session-liveness
    // fact); they are NOT run/execution-status. Per § C3, run liveness is answered
    // ONLY by the local socket (local-socket-protocol § C5); this signal must
    // structurally be incapable of standing in for it.
    expect(Object.keys(signal).sort()).toEqual([
      'emittedAt',
      'host',
      'installationId',
      'kind',
      'path',
    ]);
    expect(signal).not.toHaveProperty('runId');
    expect(signal).not.toHaveProperty('executionStatus');
    expect(signal).not.toHaveProperty('livenessStatus');
    expect(signal).not.toHaveProperty('connectionStatus');
  });

  it('does not hard-depend on the telemetry POST dispatcher — any plain function seam works as `send`', () => {
    // The DI seam is an arbitrary function, not a TelemetryPoster (T114,
    // src/sidecar/uplink/post.ts). This module imports nothing from
    // ../sidecar/uplink/post.js — proving the decoupling by construction:
    // a bare in-memory array-pushing closure (below) is a fully valid
    // `send`, with no adapter required.
    const clock = new FakeClock(0, Date.parse('2026-07-17T00:00:00.000Z'));
    const log: string[] = [];
    const scheduler: SessionLivenessScheduler = createSessionLivenessScheduler({
      clock,
      intervalMs: INTERVAL_MS,
      installationId: INSTALLATION_ID,
      host: HOST,
      path: PATH,
      send: (signal) => {
        log.push(`${signal.kind}:${signal.installationId}`);
      },
    });

    scheduler.checkAndEmit();
    expect(log).toEqual([`session-liveness:${INSTALLATION_ID}`]);
  });
});
