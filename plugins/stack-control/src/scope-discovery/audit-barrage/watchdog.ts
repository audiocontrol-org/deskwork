/**
 * plugins/stack-control/src/scope-discovery/audit-barrage/watchdog.ts
 *
 * specs/014-audit-barrage-reliability — in-process liveness watchdog
 * (FR-008, research.md D2).
 *
 * Direct translation of the proven audiocontrol e2e heartbeat pattern
 * (producer stamps a timestamp on every event; a staleness loop kills on
 * silence) with the file transport collapsed into the parent process: the
 * spawn wrapper already owns the child's stdio streams, so the "heartbeat"
 * is simply `activity()` called on every data event of the lane's
 * configured pulse stream.
 *
 * Behavior:
 *   - a repeating check (default cadence: min(5s, window/4), floored at
 *     250 ms so sub-second test windows still get multiple checks) compares
 *     `now − lastActivityAt` against the window;
 *   - on staleness the watchdog fires `onStale(stalenessMs)` exactly once
 *     and self-disarms — the spawn wrapper owns the kill + settle;
 *   - `disarm()` stops monitoring (called when a competing kill path
 *     begins, and at settle). Idempotent.
 *
 * The interval is `unref()`d so a forgotten watchdog can never hold the
 * process open past the run.
 */

export interface WatchdogOptions {
  readonly windowSeconds: number;
  /** Poll cadence override; tests pass explicit values. */
  readonly checkIntervalMs?: number;
  /** Fired exactly once, with the observed staleness, when the window is exceeded. */
  readonly onStale: (stalenessMs: number) => void;
}

export interface Watchdog {
  /** Producer pulse: stamp "the spawn showed a sign of life now". */
  activity(): void;
  /** Stop monitoring permanently. Idempotent. */
  disarm(): void;
}

const MAX_CHECK_INTERVAL_MS = 5000;
const MIN_CHECK_INTERVAL_MS = 250;

function defaultCheckIntervalMs(windowSeconds: number): number {
  const quarterWindow = (windowSeconds * 1000) / 4;
  return Math.max(
    MIN_CHECK_INTERVAL_MS,
    Math.min(MAX_CHECK_INTERVAL_MS, quarterWindow),
  );
}

export function startWatchdog(options: WatchdogOptions): Watchdog {
  const windowMs = options.windowSeconds * 1000;
  const cadence = options.checkIntervalMs ?? defaultCheckIntervalMs(options.windowSeconds);
  let lastActivityAt = Date.now();
  let timer: NodeJS.Timeout | null = setInterval(() => {
    const stalenessMs = Date.now() - lastActivityAt;
    if (stalenessMs > windowMs) {
      disarm();
      options.onStale(stalenessMs);
    }
  }, cadence);
  timer.unref();

  function disarm(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    activity(): void {
      lastActivityAt = Date.now();
    },
    disarm,
  };
}
