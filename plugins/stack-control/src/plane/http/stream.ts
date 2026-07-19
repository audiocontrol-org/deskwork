/**
 * specs/036-fleet-control-plane — T115 (impl), pairs with the RED test
 * tests/fleet/plane-stream.test.ts.
 *
 * THE PLANE'S SSE-OUT: this module holds the sidecar's SSE connection open
 * (contracts/sidecar-plane-protocol.md § C1 — "Commands (plane → sidecar):
 * held-open SSE stream, opened BY THE SIDECAR") and frames two things onto
 * it:
 *
 *   1. Held commands (§ C7) as `data:` events carrying an `id:`. This
 *      module CONSUMES a command source (src/plane/commands/dispatch.ts's
 *      `CommandDispatch.replayOnReconnect`, T070/T073) — it does not
 *      reimplement the durable store or the buffer/replay/expiry/fan-out
 *      logic that already lives there.
 *   2. A `:` COMMENT keepalive frame every 15s (§ C3 — "Transport
 *      keepalive ... proves NOTHING about process health — it exists
 *      solely to survive intermediaries that kill idle connections"). The
 *      comment is deliberately distinct from a data event on the wire: a
 *      client that (incorrectly) treated a comment as a domain event would
 *      be a bug in the CLIENT (src/sidecar/uplink/sse-client.ts, T112) —
 *      this module's only job is to emit the right shape on the right
 *      cadence.
 *
 * CADENCE SEAM: the 15s keepalive cadence is driven by an injected
 * `IntervalScheduler`, never a bare `setInterval` call reached for
 * directly inside the handler, so a test can prove the cadence WITHOUT a
 * real 15-second wait — it supplies a fake scheduler, captures the
 * callback `createCommandStreamHandler` registers, and invokes it directly
 * to simulate an elapsed interval. This mirrors the Clock-DI convention
 * `src/fleet/clock.ts` and `src/sidecar/lifecycle.ts` establish for every
 * other timeout-driven behavior in this feature (PT-013/014): a pure,
 * externally-driven decision, never a real wall-clock wait baked into the
 * primitive itself. The production default (`NODE_INTERVAL_SCHEDULER`) is
 * a thin wrapper over the real `setInterval`/`clearInterval`.
 *
 * This module holds `ctx.res` open and NEVER calls `res.end()` — per
 * `server.ts`'s `RouteHandler` contract, that is only valid for a
 * deliberately-streaming route, which this is (§ C1). The keepalive timer
 * is cancelled once the connection closes, so a churned connection never
 * leaks a live interval.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution (no `@/` alias — this plugin has
 * none).
 */

import type { ServerResponse } from 'node:http';
import type { RouteContext, RouteHandler } from './server.js';
import type { CommandDispatch, HeldCommand } from '../commands/dispatch.js';

// ---------------------------------------------------------------------------
// CADENCE SEAM — see header comment.
// ---------------------------------------------------------------------------

/**
 * A minimal scheduling DI seam: just enough surface to register and cancel
 * a repeating callback. The handle is deliberately `unknown` (not
 * `NodeJS.Timeout`) so this interface stays decoupled from Node's timer
 * type — a fake scheduler in a test can hand back any opaque token.
 */
export interface IntervalScheduler {
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}

/**
 * The production scheduler: a thin wrapper over Node's real
 * `setInterval`/`clearInterval`. Handles are opaque numeric tokens over an
 * internal map, so `clearInterval` never needs to narrow `unknown` back to
 * `NodeJS.Timeout` via a cast — a `typeof` guard is enough.
 */
export const NODE_INTERVAL_SCHEDULER: IntervalScheduler = (() => {
  const timers = new Map<number, NodeJS.Timeout>();
  let nextHandle = 1;
  return {
    setInterval(callback: () => void, intervalMs: number): unknown {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, setInterval(callback, intervalMs));
      return handle;
    },
    clearInterval(handle: unknown): void {
      if (typeof handle !== 'number') {
        return;
      }
      const timer = timers.get(handle);
      if (timer !== undefined) {
        clearInterval(timer);
        timers.delete(handle);
      }
    },
  };
})();

/**
 * § C3's fixed constant: 15s. Sized against the client's 45s (3x) read-idle
 * watchdog (tests/fleet/sse-keepalive.test.ts, T104/T112) — changing one
 * without the other breaks that ratio.
 */
export const KEEPALIVE_INTERVAL_MS = 15_000;

// ---------------------------------------------------------------------------
// Frame rendering.
// ---------------------------------------------------------------------------

/**
 * Writes AND flushes the SSE response head. `writeHead` alone only buffers
 * the status/headers inside Node's `ServerResponse` — they are not
 * actually sent over the socket until the first `write()`/`end()` call.
 * With no commands queued at connect time, nothing would reach the client
 * until the FIRST keepalive fires (15s in production); an SSE client must
 * see `200`/`text/event-stream` immediately on connect, independent of
 * whether any frame has been written yet, so this explicitly flushes.
 */
function writeSseHead(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.flushHeaders();
}

/**
 * Renders one held command as a `data:` SSE event carrying an `id:` (§
 * C7: commands are delivered as `data:` events). `event: command` names
 * the frame's domain kind so a client can distinguish it from other event
 * types without parsing the payload first.
 */
function writeCommandFrame(res: ServerResponse, command: HeldCommand): void {
  const body = JSON.stringify(command);
  res.write(`id: ${command.commandId}\nevent: command\ndata: ${body}\n\n`);
}

/**
 * Renders the § C3 transport-keepalive frame: a leading `:` COMMENT,
 * never a `data:`/`event:`/`id:` line — the wire-level distinction the
 * client (T112) relies on to never mistake this for a domain event.
 */
function writeKeepaliveComment(res: ServerResponse): void {
  res.write(':keepalive\n\n');
}

// ---------------------------------------------------------------------------
// The handler.
// ---------------------------------------------------------------------------

/**
 * Everything `createCommandStreamHandler` needs to hold one sidecar's
 * command stream open. `dispatch` is the EXISTING command-delivery buffer
 * (src/plane/commands/dispatch.ts, T070/T073) — narrowed to
 * `replayOnReconnect` only, since that is the sole operation this module
 * calls; it never reimplements hold/expire/fan-out.
 */
export interface CommandStreamOptions {
  readonly dispatch: Pick<CommandDispatch, 'replayOnReconnect'>;
  /**
   * Extracts the connecting installation's id from the request context.
   * Authentication (T117) resolves and injects this; this module does not
   * know how an installation authenticates, only which id its held
   * commands are keyed by.
   */
  readonly installationIdOf: (ctx: RouteContext) => string;
  /** Defaults to {@link NODE_INTERVAL_SCHEDULER}. */
  readonly scheduler?: IntervalScheduler;
  /** Defaults to {@link KEEPALIVE_INTERVAL_MS} (15s, § C3). Production
   * callers should not override this; the override exists for tests that
   * need to observe the registered value explicitly. */
  readonly keepaliveIntervalMs?: number;
}

/**
 * Build the plane's SSE-out route handler (§ C1/C3/C7). On connect: writes
 * SSE headers, replays every command `dispatch.replayOnReconnect` reports
 * still held for this installation (§ C7 — "replays unexpired commands on
 * reconnect"), then arms a repeating § C3 keepalive comment every
 * `keepaliveIntervalMs`. Never calls `res.end()` — the connection stays
 * open until the sidecar (or an intermediary) closes it, at which point
 * the keepalive timer is cancelled so a churned connection cannot leak a
 * live interval.
 */
export function createCommandStreamHandler(options: CommandStreamOptions): RouteHandler {
  const { dispatch, installationIdOf } = options;
  const scheduler = options.scheduler ?? NODE_INTERVAL_SCHEDULER;
  const keepaliveIntervalMs = options.keepaliveIntervalMs ?? KEEPALIVE_INTERVAL_MS;

  return (ctx: RouteContext): void => {
    const installationId = installationIdOf(ctx);
    writeSseHead(ctx.res);

    for (const command of dispatch.replayOnReconnect(installationId)) {
      writeCommandFrame(ctx.res, command);
    }

    const timer = scheduler.setInterval(() => {
      writeKeepaliveComment(ctx.res);
    }, keepaliveIntervalMs);

    ctx.res.once('close', () => {
      scheduler.clearInterval(timer);
    });
  };
}
