// specs/014-audit-barrage-reliability — T021 (RED): in-process liveness
// watchdog (FR-008, research.md D2 — the audiocontrol heartbeat pattern with
// the transport collapsed into the parent process).
//
// The watchdog tracks `lastActivityAt`, polls staleness on a check interval,
// and fires `onStale` exactly once when staleness exceeds the window — then
// self-disarms. `activity()` (called on every data event of the configured
// pulse stream) resets staleness; `disarm()` (called when a competing kill
// path begins, or at settle) stops monitoring entirely.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startWatchdog } from '../../../scope-discovery/audit-barrage/watchdog.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('staleness kill (FR-008 / SC-004)', () => {
  it('fires onStale once when staleness exceeds the window, then self-disarms', () => {
    const onStale = vi.fn();
    startWatchdog({ windowSeconds: 10, checkIntervalMs: 1000, onStale });
    vi.advanceTimersByTime(9_000);
    expect(onStale).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3_000);
    expect(onStale).toHaveBeenCalledTimes(1);
    const stalenessMs = onStale.mock.calls[0]![0] as number;
    expect(stalenessMs).toBeGreaterThan(10_000);
    // Self-disarmed: no repeat fire however long we wait.
    vi.advanceTimersByTime(120_000);
    expect(onStale).toHaveBeenCalledTimes(1);
  });
});

describe('a slow-but-alive pulse is never killed (FR-008 / SC-005)', () => {
  it('activity() resets staleness — continuous pulse outlives many windows', () => {
    const onStale = vi.fn();
    const wd = startWatchdog({ windowSeconds: 10, checkIntervalMs: 1000, onStale });
    // 5s pulse cadence over 150s: 15 windows' worth of wall time, alive.
    for (let i = 0; i < 30; i += 1) {
      vi.advanceTimersByTime(5_000);
      wd.activity();
    }
    expect(onStale).not.toHaveBeenCalled();
    // Pulse stops → the kill arrives one window later.
    vi.advanceTimersByTime(12_000);
    expect(onStale).toHaveBeenCalledTimes(1);
  });
});

describe('disarm', () => {
  it('a disarmed watchdog never fires (the competing-kill interlock)', () => {
    const onStale = vi.fn();
    const wd = startWatchdog({ windowSeconds: 10, checkIntervalMs: 1000, onStale });
    wd.disarm();
    vi.advanceTimersByTime(600_000);
    expect(onStale).not.toHaveBeenCalled();
  });

  it('disarm is idempotent', () => {
    const onStale = vi.fn();
    const wd = startWatchdog({ windowSeconds: 10, checkIntervalMs: 1000, onStale });
    wd.disarm();
    wd.disarm();
    vi.advanceTimersByTime(60_000);
    expect(onStale).not.toHaveBeenCalled();
  });
});
