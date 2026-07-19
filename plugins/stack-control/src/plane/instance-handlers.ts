/**
 * specs/037-instance-observability — T036/T037 (impl). The two READ-ONLY
 * instance-observability route handlers that would push `runtime-handlers.ts`
 * over the Constitution VI file cap if inlined there:
 *
 *   - `instanceStream` (GET /v1/instances/stream, T036) — SSE deltas, MIRRORS
 *     the fleet stream handler (`runtime-handlers.ts` `fleetStreamHandler`):
 *     flush headers → emit the initial snapshot as deltas from `last = []` →
 *     guarded 15s keepalive tick → recompute deltas on registry change →
 *     `res.once('close')` clears the timer. Deltas only, never a full re-push.
 *   - `instanceRuns` (GET /v1/instances/:id/runs, T037) — the 036 run registry
 *     filtered to the runs owned by one instance (`instanceRuns` projection).
 *
 * Both read the SAME in-memory `events` array the run/instance registries fold
 * (pure recompute-on-read, FR-023/SC-007 — zero durable-store reads). The
 * keepalive `IntervalScheduler` is injected (test seam, mirrors the fleet
 * stream). These handlers are RAW (pre-auth); `runtime.ts` wraps them with
 * `withAuth` when mounting.
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
 * under node16 resolution (no `@/` alias — this plugin has none).
 */

import type { ServerResponse } from 'node:http';
import type { ClassifiedEvent } from './registry.js';
import { buildInstanceRegistry, type InstanceState } from './instance-registry.js';
import {
  computeInstanceDeltas,
  instanceRuns as projectInstanceRuns,
  type InstanceDelta,
} from './http/instance-api.js';
import { respondJson, requireParam } from './runtime-http.js';
import type { RouteContext, RouteHandler } from './http/server.js';
import { KEEPALIVE_INTERVAL_MS, type IntervalScheduler } from './http/stream.js';

// ---------------------------------------------------------------------------
// Instance SSE helpers (pure — no closure state), mirroring the fleet stream's
// `writeFleetDelta` / `logFleetTickError` / `computeFleetTickGuarded` trio.
// ---------------------------------------------------------------------------

function writeInstanceDelta(res: ServerResponse, delta: InstanceDelta): void {
  res.write(`event: instance-delta\ndata: ${JSON.stringify(delta)}\n\n`);
}

function logInstanceTickError(error: unknown): void {
  // A poison event must never crash the process (mirrors AUDIT-20260718-04):
  // skip the tick, keep the stream alive, leave a discoverable diagnostic.
  process.stderr.write(
    `plane instance-stream: skipping tick after buildInstanceRegistry error: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
}

interface InstanceTickResult {
  readonly next: readonly InstanceState[];
  readonly deltas: readonly InstanceDelta[];
  readonly error?: unknown;
}

/**
 * Compute one instance-stream tick, GUARDED (mirrors `computeFleetTickGuarded`).
 * The recompute runs inside a bare `setInterval` callback for every connected
 * client; an uncaught throw there is an uncaught exception that by default
 * terminates the Node process (every route down). This wrapper contains the
 * blast radius: on error it preserves `previous` and returns the error for the
 * caller to log-and-skip, so a bad event can never crash the plane.
 */
function computeInstanceTickGuarded(
  events: readonly ClassifiedEvent[],
  previous: readonly InstanceState[],
): InstanceTickResult {
  try {
    const next = buildInstanceRegistry(events).instances();
    return { next, deltas: computeInstanceDeltas(previous, next) };
  } catch (error) {
    return { next: previous, deltas: [], error };
  }
}

// ---------------------------------------------------------------------------
// The handlers.
// ---------------------------------------------------------------------------

export interface InstanceObservabilityHandlers {
  readonly instanceStream: RouteHandler;
  readonly instanceRuns: RouteHandler;
}

/**
 * Build the two read-only instance-observability handlers over the injected
 * live `events` array (folded fresh on every read) and the SSE keepalive
 * scheduler. Byte-for-byte the fleet stream's structure, keyed by instance
 * rather than run.
 */
export function buildInstanceObservabilityHandlers(
  events: ClassifiedEvent[],
  scheduler: IntervalScheduler,
): InstanceObservabilityHandlers {
  const instanceStream: RouteHandler = (routeCtx: RouteContext): void => {
    routeCtx.res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    routeCtx.res.flushHeaders();
    let last: readonly InstanceState[] = [];
    const initial = computeInstanceTickGuarded(events, last);
    if (initial.error === undefined) {
      for (const delta of initial.deltas) {
        writeInstanceDelta(routeCtx.res, delta);
      }
      last = initial.next;
    } else {
      logInstanceTickError(initial.error);
    }
    const timer = scheduler.setInterval(() => {
      const tick = computeInstanceTickGuarded(events, last);
      if (tick.error === undefined) {
        for (const delta of tick.deltas) {
          writeInstanceDelta(routeCtx.res, delta);
        }
        last = tick.next;
      } else {
        logInstanceTickError(tick.error);
      }
      // § C3 transport keepalive comment — proves nothing about health.
      routeCtx.res.write(':keepalive\n\n');
    }, KEEPALIVE_INTERVAL_MS);
    routeCtx.res.once('close', () => scheduler.clearInterval(timer));
  };

  const instanceRuns: RouteHandler = (routeCtx: RouteContext): void => {
    // `:id` is a URL-encoded `host:path` (contracts/instance-query-api.md).
    const id = decodeURIComponent(requireParam(routeCtx, 'id'));
    respondJson(routeCtx.res, 200, projectInstanceRuns(events, id));
  };

  return { instanceStream, instanceRuns };
}
