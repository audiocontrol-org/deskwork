/**
 * specs/036-fleet-control-plane — T083 + T088, Phase 6 / US4. Pairs with the
 * RED tests T076 (reconciliation-window) and T075 (the honesty test —
 * sidecar-restart-no-false-death).
 *
 * Two time-driven lifecycle primitives, both fed EXCLUSIVELY by an injected
 * Clock (src/fleet/clock.ts) so they can be exercised in microseconds against
 * a fake clock — no real wall-clock sleep ever decides a verdict (PT-013,
 * Constitution Principle VI).
 *
 * ── T083: reconciliation window (PT-010) ────────────────────────────────────
 * A run whose socket closed abnormally is NOT immediately gone. A bounded
 * window lets it RE-ANNOUNCE. A run that re-announces inside the window was
 * never gone (it stays alive past the window). A run that MISSES the entire
 * window is presumed gone — ONLY THEN. The window must comfortably exceed a
 * sidecar restart + reconnect, so a plane/sidecar bounce that closes all N
 * sockets at once yields ZERO false deaths (T075, SC-005, FR-026): each mass
 * close is a CONNECTION-axis fact (liveness.ts), and this window holds every
 * run alive across the gap while they re-announce.
 *
 * ── T088: idle-exit (~10 min) (PT-003) ──────────────────────────────────────
 * The sidecar may exit after an idle period. This is SAFE BY CONSTRUCTION: the
 * spool is a crash-safe write-ahead log — records are durable before
 * acknowledgement and replay on restart — so exiting with an un-flushed spool
 * is non-catastrophic. Graceful shutdown is a latency optimization, not a
 * correctness guarantee (a `SIGKILL` runs no shutdown code anyway). The
 * idle-exit clock is injected for the same reason the window's is.
 *
 * No `any`, no `as`, no `@ts-ignore`.
 */

import type { Clock } from '../fleet/clock.js';

// ─── T083: reconciliation window (PT-010) ────────────────────────────────────

/**
 * Whether a run is still considered present. `alive` = within its
 * reconciliation window OR confirmed re-announced; `presumed-gone` = it missed
 * the ENTIRE window without re-announcing. A closed socket alone never yields
 * `presumed-gone` — only a full-window miss does (FR-026).
 */
export type RunPresence = 'alive' | 'presumed-gone';

/**
 * Construction options. `windowMs` is the reconciliation window length; it
 * MUST comfortably exceed a sidecar restart + reconnect so a bounce produces
 * zero false deaths (PT-010 / T075).
 */
export interface ReconciliationWindowOptions {
  readonly clock: Clock;
  readonly windowMs: number;
}

/**
 * The reconciliation-window surface. `openWindow` starts (or restarts) the
 * window for a run whose socket just closed; `reannounce` records that the run
 * reconnected within the window (it was never gone → alive from then on);
 * `presenceOf` derives the verdict from the injected clock at query time.
 */
export interface ReconciliationWindow {
  openWindow(runId: string): void;
  reannounce(runId: string): void;
  presenceOf(runId: string): RunPresence;
}

/** Per-run reconciliation state, kept side-by-side (never collapsed). */
interface RunWindowState {
  /** Monotonic reading when the window was opened. */
  readonly openedAtMs: number;
  /**
   * True once the run re-announced within the window. A re-announced run was
   * never gone; it stays `alive` regardless of how far the clock advances.
   */
  readonly reannounced: boolean;
}

/**
 * Create a reconciliation window (PT-010). Presence is a pure function of the
 * injected clock at query time: a run flips to `presumed-gone` exactly when
 * `monotonicNowMs() - openedAtMs >= windowMs` AND it has not re-announced.
 * Within the window, and forever after a re-announce, it is `alive`.
 *
 * Throws on a non-positive `windowMs` (a zero/negative window would presume
 * every run gone the instant its socket closed — the exact false-death this
 * primitive exists to prevent) and on a query for a run that was never opened
 * (no fabricated verdict — the caller has a bug).
 */
export function createReconciliationWindow(
  options: ReconciliationWindowOptions,
): ReconciliationWindow {
  const { clock, windowMs } = options;
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error(
      `createReconciliationWindow: windowMs must be a positive, finite number of milliseconds; got ${windowMs}. A non-positive window would presume every run gone the instant its socket closed.`,
    );
  }

  const runs = new Map<string, RunWindowState>();

  return {
    openWindow(runId: string): void {
      runs.set(runId, { openedAtMs: clock.monotonicNowMs(), reannounced: false });
    },

    reannounce(runId: string): void {
      const existing = runs.get(runId);
      if (existing === undefined) {
        throw new Error(
          `ReconciliationWindow.reannounce: run "${runId}" has no open window — openWindow must precede a re-announce.`,
        );
      }
      runs.set(runId, { openedAtMs: existing.openedAtMs, reannounced: true });
    },

    presenceOf(runId: string): RunPresence {
      const state = runs.get(runId);
      if (state === undefined) {
        throw new Error(
          `ReconciliationWindow.presenceOf: no window has been opened for run "${runId}". Presence cannot be inferred for an unknown run.`,
        );
      }
      if (state.reannounced) {
        return 'alive';
      }
      const elapsedMs = clock.monotonicNowMs() - state.openedAtMs;
      return elapsedMs >= windowMs ? 'presumed-gone' : 'alive';
    },
  };
}

// ─── T088: idle-exit (~10 min) (PT-003) ──────────────────────────────────────

/**
 * Default idle-exit horizon (~10 minutes, PT-003 / PT-014). Safe by
 * construction: the spool's write-ahead log — not a graceful flush —
 * guarantees durability, so exiting after this idle period loses nothing.
 */
export const DEFAULT_IDLE_EXIT_MS = 600_000;

/**
 * Idle-exit construction options. `onExit` fires (at most once) when the run
 * has been idle for `idleMs` and `checkIdle()` is next called. `idleMs`
 * defaults to `DEFAULT_IDLE_EXIT_MS`.
 */
export interface IdleExitOptions {
  readonly clock: Clock;
  readonly onExit: () => void;
  readonly idleMs?: number;
}

/**
 * The idle-exit surface. `recordActivity` marks now as the last activity;
 * `checkIdle` fires `onExit` once if the idle horizon has elapsed since the
 * last activity; `idleForMs` reports the current idle duration (for callers
 * that drive their own poll cadence).
 */
export interface IdleExit {
  recordActivity(): void;
  checkIdle(): void;
  idleForMs(): number;
}

/**
 * Create an idle-exit primitive (T088, PT-003). Clock-injected and
 * self-contained so it is testable in microseconds against a fake clock — no
 * real timer is armed here; the caller drives `checkIdle()` on whatever cadence
 * it already polls, and the decision is a pure function of the injected clock.
 * `onExit` fires at most once (a second idle crossing does not re-fire), because
 * process exit is not idempotent to repeat.
 *
 * Note: because durability is guaranteed by the write-ahead spool rather than a
 * graceful flush, `onExit` is free to exit immediately — there is no drain
 * obligation on this seam (PT-003).
 *
 * Idle-exit has no committed RED test in this feature slice (no test imports
 * this symbol — verified against tests/fleet/*). It is added minimal + fully
 * clock-injected per the T088 task note; behavior is pinned by this doc
 * comment and the DEFAULT_IDLE_EXIT_MS constant, and it is trivially
 * exercisable with the same FakeClock the reconciliation-window tests use.
 *
 * Throws on a non-positive `idleMs` (an idle horizon of zero would exit the
 * instant it is checked).
 */
export function createIdleExit(options: IdleExitOptions): IdleExit {
  const { clock, onExit } = options;
  const idleMs = options.idleMs ?? DEFAULT_IDLE_EXIT_MS;
  if (!Number.isFinite(idleMs) || idleMs <= 0) {
    throw new Error(
      `createIdleExit: idleMs must be a positive, finite number of milliseconds; got ${idleMs}.`,
    );
  }

  let lastActivityMs = clock.monotonicNowMs();
  let exited = false;

  const idleForMs = (): number => clock.monotonicNowMs() - lastActivityMs;

  return {
    recordActivity(): void {
      lastActivityMs = clock.monotonicNowMs();
    },
    checkIdle(): void {
      if (exited) {
        return;
      }
      if (idleForMs() >= idleMs) {
        exited = true;
        onExit();
      }
    },
    idleForMs,
  };
}
