/**
 * specs/036-fleet-control-plane — T138 (impl), FR-009 / contracts/
 * local-socket-protocol.md § C6 (Spawn, bind-wins election).
 *
 * SUPPORT RUNNING THE SIDECAR UNDER EXTERNAL SUPERVISION (launchd/systemd) AS
 * AN ALTERNATIVE TO AUTO-SPAWN, WITHOUT CHANGING THE LOCAL SOCKET CONTRACT.
 *
 * Auto-spawn (`spawn.ts`, T042) exists because a forgotten daemon is a silent
 * gap that erodes trust in the fleet view: the CLI detaches a child and moves
 * on, never verifying it started. Supervision exists for operators who want a
 * predictable lifecycle instead — a launchd/systemd unit execs the sidecar
 * directly, in the FOREGROUND, and owns starting/stopping/restarting it. The
 * two start paths differ ONLY in who launches the process and how it is kept
 * alive; they MUST reach the identical socket contract. This module is the
 * thin wrapper a supervised invocation runs: it drives the SAME `electSidecar`
 * bind-wins election `server.ts` (T041/T043) already implements — re-deriving
 * none of it — and adds exactly the one behavior a foreground-under-supervisor
 * process needs that a detached auto-spawned one does not: a graceful-
 * shutdown seam a supervisor can signal (SIGTERM/SIGINT) to stop the sidecar
 * cleanly instead of the supervisor's harder fallback (SIGKILL after a grace
 * period).
 *
 * WHY A SEPARATE MODULE, NOT A FLAG ON `electSidecar`: `electSidecar` already
 * has a full, tested contract (win/lose, stale recovery) with zero knowledge
 * of process lifecycle — keeping it that way means this module can wrap it
 * without perturbing spawn-race.test.ts / stale-lock.test.ts. A LOST election
 * has nothing to shut down (the loser exits silently, per C6); only a WON
 * election arms the shutdown seam.
 *
 * THE SIGNAL SOURCE IS INJECTED (Constitution Principle VI, matching the
 * `StartTimeSource` / `SseTransport` / `SpawnPrimitive` seam pattern already
 * used elsewhere in this feature): a test process must never wire a real
 * `process.on('SIGTERM', …)` onto ITSELF — that would either kill the test
 * runner or require faking process-wide signal delivery, neither of which is
 * honest. `createProcessShutdownSignalSource` is the real, production-only
 * wiring; tests inject a fake that a test fully controls.
 *
 * SCOPE (per the task pairing): the supervised-run wrapper ONLY. This module
 * does NOT wire a CLI verb or `bin/` entrypoint that a launchd/systemd unit
 * would literally exec (that is dispatcher-wiring work, the same class of
 * work T044 does for telemetry emission, and is not part of this task) — it
 * provides the reusable, testable primitive that wiring would call. It does
 * NOT change `electSidecar`, `spawnDetachedSidecar`, or the wire protocol.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI): every
 * `unknown` is narrowed with a user-defined type guard (none needed here — no
 * `unknown` crosses this module's boundary). Relative `.js` imports under
 * node16 resolution (no `@/` alias configured for this plugin).
 */

import { electSidecar, type ElectionConfig, type ElectionOutcome } from './server.js';

/**
 * A source of "the supervisor wants this sidecar to stop" — SIGTERM/SIGINT
 * under a real supervisor. `onShutdown` registers the handler that fires
 * exactly once when that happens; the source owns delivering it (real
 * process signals in production, a test-driven trigger in tests).
 */
export interface ShutdownSignalSource {
  onShutdown(handler: () => void): void;
}

/**
 * The real, `process`-backed shutdown signal source: SIGTERM (systemd/
 * launchd's standard stop signal) and SIGINT (Ctrl-C, for a supervisor or
 * operator running the sidecar attached to a terminal) both trigger the same
 * graceful-shutdown handler, whichever fires first. `once` (not `on`) per
 * signal — a supervisor that sends a second SIGTERM/SIGKILL while shutdown is
 * already in progress must not re-invoke the handler.
 */
export function createProcessShutdownSignalSource(
  proc: NodeJS.Process = process,
): ShutdownSignalSource {
  return {
    onShutdown(handler: () => void): void {
      let fired = false;
      const fire = (): void => {
        if (fired) return;
        fired = true;
        handler();
      };
      proc.once('SIGTERM', fire);
      proc.once('SIGINT', fire);
    },
  };
}

/**
 * The outcome of a supervised run attempt: the same `ElectionOutcome` a
 * direct `electSidecar` caller would see (proving the contract is unchanged,
 * FR-009), plus `shutdown` — a promise that resolves once this instance no
 * longer holds the socket.
 *
 *   - LOST: `shutdown` resolves immediately — there was never anything to
 *     shut down (the loser exits silently, per C6); a caller running this as
 *     a supervised process's entrypoint should exit right away.
 *   - WON: `shutdown` resolves once the armed `ShutdownSignalSource` fires
 *     AND the resulting `server.close()` has finished (socket unlinked, owner
 *     record cleared) — a caller awaits it, THEN exits. Until it resolves,
 *     the process staying alive is exactly what a listening `net.Server`
 *     already guarantees (it is never `unref()`d — see `server.ts`), so no
 *     extra "keep the process alive" mechanism is needed here.
 */
export interface SupervisedRunResult {
  readonly outcome: ElectionOutcome;
  readonly shutdown: Promise<void>;
}

/**
 * Run the bind-wins election exactly as any other caller would (T041/T043's
 * `electSidecar` — re-implemented / re-derived NOTHING here), then, ONLY on a
 * win, arm `signalSource` so a supervisor's stop signal closes the server
 * gracefully. This is the whole of "supported under external supervision":
 * the same election, the same listener, the same wire protocol as an
 * auto-spawned winner — plus a clean-shutdown seam a supervisor can rely on.
 *
 * `signalSource` defaults to the real process-signal wiring; tests inject a
 * fake so no real signal ever touches the test runner's own process.
 */
export async function runSidecarSupervised(
  config: ElectionConfig,
  signalSource: ShutdownSignalSource = createProcessShutdownSignalSource(),
): Promise<SupervisedRunResult> {
  const outcome = await electSidecar(config);

  if (outcome.kind !== 'won') {
    // Losing is a value, never a throw (C6) — nothing to arm, nothing to
    // shut down. A caller treats this exactly like a losing auto-spawn
    // attempt: exit silently.
    return { outcome, shutdown: Promise.resolve() };
  }

  const server = outcome.server;
  const shutdown = new Promise<void>((resolve) => {
    signalSource.onShutdown(() => {
      // Best-effort: a close() failure must not leave the supervised process
      // hanging past its supervisor's stop-signal grace period — resolve
      // either way so the caller can still exit.
      server.close().then(resolve, resolve);
    });
  });

  return { outcome, shutdown };
}
