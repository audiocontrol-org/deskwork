/**
 * specs/036-fleet-control-plane — T042, PT-002 / C6.
 *
 * Detached spawn of the sidecar process. C6
 * (contracts/local-socket-protocol.md — SETTLED, not re-derived here) pins
 * exactly four properties:
 *
 *   - `detached: true`   — new process group; the child survives this
 *                          (the CLI's) process exiting.
 *   - `stdio: 'ignore'`  — no inherited stdio pipes; nothing here holds the
 *                          CLI open waiting to drain a child's stdout/stderr.
 *   - `unref()`          — the CLI's event loop does not wait on the child;
 *                          calling this is what actually lets a
 *                          detached+ignored child allow the parent to exit.
 *   - `windowsHide: true` — MANDATORY, NOT COSMETIC. Node documents that a
 *                          detached Windows child gets its own console
 *                          window that CANNOT be disabled after the fact.
 *                          Every canonical `child_process.spawn` snippet
 *                          omits this flag because none of them are about
 *                          background daemons — copying one verbatim here
 *                          would pop a console window on every single
 *                          Windows invocation.
 *
 * PT-002 (research.md "Spawn race and stale locks" — SETTLED): the
 * authoritative guard against duplicate sidecars is bind-wins in the
 * server (src/sidecar/server.ts, T041) — atomic at the OS level, so racing
 * spawns are safe by construction; the loser's `EADDRINUSE` makes it exit
 * silently. This module's job is narrower and does not attempt that guard:
 * it spawns, with the correct flags, and never waits for readiness.
 *
 * ADVISORY DEBOUNCE — deliberately NOT implemented here (judgment call):
 * C6 names a CLI-side advisory debounce that avoids thundering-herd
 * spawns, explicitly NOT the authoritative guard (bind-wins owns that).
 * A debounce is a policy decision about WHETHER to call this function at
 * all for a given invocation (e.g. "skip spawning if we spawned in the
 * last N ms") — that policy has to live where invocations are sequenced
 * and observable across CLI processes, which is the caller wiring this
 * into the dispatcher (T044, src/cli.ts), not this single-purpose
 * "spawn correctly, once, when asked" primitive. Keeping this file to the
 * one concern (the four flags + fire-and-forget) also keeps it small and
 * matches the seam pattern already used for `StartTimeSource`
 * (src/fleet/process-probe.ts) and `SseTransport`
 * (src/sidecar/uplink/transport.ts): the primitive is injectable so a
 * fake can assert the exact options object, since a real detached
 * process's console-window suppression cannot be observed from a single
 * CI platform.
 *
 * FIRE-AND-FORGET (C6: "the CLI never waits for the sidecar to become
 * ready") is modeled at the TYPE level, not just by convention:
 * `spawnDetachedSidecar` returns `void`, synchronously — there is no
 * Promise a caller could `await` sidecar readiness on, so the mistake C6
 * forbids is unwritable, not merely undocumented.
 */

import { spawn as nodeChildProcessSpawn } from 'node:child_process';

/** The exact, and only, options this module ever passes to a spawn
 * primitive — see C6. Literal types (not `boolean`/`string`) pin the
 * VALUES, not just the shape, at the type level. */
export interface DetachedSpawnOptions {
  readonly detached: true;
  readonly stdio: 'ignore';
  readonly windowsHide: true;
}

/** The minimal surface `spawnDetachedSidecar` needs from whatever a spawn
 * primitive returns: something it can `unref()`. Node's real `ChildProcess`
 * satisfies this structurally; a test fake can be a bare `{ unref() {} }`
 * with no other `ChildProcess` machinery to fake. */
export interface Unreffable {
  unref(): void;
}

/**
 * The injected DI seam (Constitution Principle VI): abstracts "spawn a
 * process with these exact flags" so a test can assert the options object
 * a real detached process's platform-specific behavior (a suppressed
 * Windows console window) cannot itself prove on a single CI platform.
 */
export type SpawnPrimitive = (
  command: string,
  args: readonly string[],
  options: DetachedSpawnOptions,
) => Unreffable;

/** The real, `node:child_process.spawn`-backed primitive. This is the
 * ONLY place in this module that touches the actual Node API — everything
 * else composes against the `SpawnPrimitive` interface above. */
export function createNodeSpawnPrimitive(): SpawnPrimitive {
  return (command, args, options) => nodeChildProcessSpawn(command, args, options);
}

/**
 * Spawns `command args` fully detached per C6, fire-and-forget. Never
 * awaits, never returns a Promise, never checks whether the process it
 * spawned is the sidecar or a loser of the bind-wins election (T041's
 * concern, not this function's) — it only asks the OS to start a
 * background process the correct way and gets out of the way.
 *
 * `spawnPrimitive` defaults to `createNodeSpawnPrimitive()`; callers only
 * override it in tests, to inject a fake that records the options object
 * instead of touching the real OS.
 */
export function spawnDetachedSidecar(
  command: string,
  args: readonly string[],
  spawnPrimitive: SpawnPrimitive = createNodeSpawnPrimitive(),
): void {
  const handle = spawnPrimitive(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  handle.unref();
}
