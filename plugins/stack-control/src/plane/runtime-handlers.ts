/**
 * specs/037-instance-observability — T015 (structural split of
 * src/plane/runtime.ts, Constitution Principle VI). PURE STRUCTURAL EXTRACTION:
 * the plane-runtime's request-handler wiring (consumer C2/C5/C6 handlers, the
 * fleet SSE stream handler, and the three sidecar-facing handlers C1/C3/C7)
 * lives here so both this module and `runtime.ts` stay under the 300-500 line
 * file cap. NO behavior change — every handler is byte-for-byte the same logic
 * it was inside `createPlaneRuntime`, now closed over an injected
 * {@link PlaneHandlerContext} instead of the factory's local scope.
 *
 * The runtime (runtime.ts) owns the live state and the process lifecycle
 * (auth guard, token registry, durable stores, server assembly); this module
 * owns the handler bodies that read/write that state through the context. The
 * auth-guard wrapping (`withAuth`) and route mounting stay in runtime.ts — this
 * module produces the RAW (pre-auth) handlers.
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
 * under node16 resolution. Real `node:http` — never a mocked transport.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildRegistry, type ClassifiedEvent, type FleetEntry } from './registry.js';
import {
  commandStatus,
  fleetSnapshot,
  issueCommand,
  issueFleetCommand,
  perRunDetail,
  runHistory,
  runTimings,
  type FleetDelta,
} from './http/api.js';
import {
  ingestEvent,
  type DurableEventStore,
  type IngestOutcome,
  type IngestState,
} from './http/ingest.js';
import { buildInstanceRegistry } from './instance-registry.js';
import {
  instanceDetail as projectInstanceDetail,
  instanceSnapshot as projectInstanceSnapshot,
} from './http/instance-api.js';
import type { EventLog } from './event-log.js';
import {
  assertSessionLiveness,
  computeFleetTickGuarded,
  ingestClaimedInstallationId,
  installationIdForRun,
  parseCommandKind,
  parseTargets,
  readJsonBody,
  refuseInstallationMismatch,
  requireParam,
  respondJson,
} from './runtime-http.js';
import type { CdnReader } from '../storage/cdn-reader.js';
import type { CommandStore } from './commands/store.js';
import type { CommandDispatch } from './commands/dispatch.js';
import {
  KEEPALIVE_INTERVAL_MS,
  createCommandStreamHandler,
  type IntervalScheduler,
} from './http/stream.js';
import {
  computeStoreHealth,
  type ArchiveSignals,
  type UplinkSignals,
} from './health.js';
import type { PlaneRouteHandlers, RouteContext, RouteHandler } from './http/server.js';

// ---------------------------------------------------------------------------
// The injected handler context — everything the runtime's live state provides
// to the handlers, so the handler bodies move out of the factory scope without
// changing what they read or write.
// ---------------------------------------------------------------------------

export interface PlaneHandlerContext {
  /** The shared, append-only classified-event log the registry is folded from. */
  readonly events: ClassifiedEvent[];
  /** The ingest no-regress/dedupe bookkeeping (mutated on accept + rollback). */
  readonly ingestState: IngestState;
  /** Durable command custody (FR-056). */
  readonly commandStore: CommandStore;
  /** Command dispatch (SSE hand-off to sidecars). */
  readonly commandDispatch: CommandDispatch;
  /** Uplink hop health signals (degraded on a genuine post-validation append failure). */
  readonly uplinkSignals: UplinkSignals;
  /** Archive hop health signals. */
  readonly archiveSignals: ArchiveSignals;
  /** Durable late-event hand-off (FR-066). */
  readonly durableStore: DurableEventStore;
  /** Durable accepted-event log — appended before an event is admitted. */
  readonly eventLog: EventLog;
  /** SSE keepalive scheduler (test seam). */
  readonly scheduler: IntervalScheduler;
  /** Injected CDN-fronted archive reader (C7); absent → honest "no archive". */
  readonly cdnReader?: CdnReader;
  /** Resolve the authenticated installation for the in-flight request (set by
   * the runtime's auth guard, read here without re-deriving identity). */
  readonly requireAuthedInstallation: (req: IncomingMessage) => string;
}

/** The RAW (pre-auth) handlers the runtime wraps with `withAuth` and mounts. */
export interface PlaneHandlers {
  readonly consumerHandlers: PlaneRouteHandlers;
  readonly ingestHandler: RouteHandler;
  readonly sidecarStreamHandler: RouteHandler;
  readonly livenessHandler: RouteHandler;
}

// ---------------------------------------------------------------------------
// Fleet SSE helpers (pure — no closure state).
// ---------------------------------------------------------------------------

function writeFleetDelta(res: ServerResponse, delta: FleetDelta): void {
  res.write(`event: fleet-delta\ndata: ${JSON.stringify(delta)}\n\n`);
}

function logFleetTickError(error: unknown): void {
  // A poison event must never crash the process (AUDIT-20260718-04). Skip the
  // tick, keep the stream alive, and leave a diagnostic so the bad event is
  // discoverable — the honest "visible, not silent" posture.
  process.stderr.write(
    `plane fleet-stream: skipping tick after buildRegistry error: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
}

// Undo an accepted event's ingest-state mutation to its pre-image so a retry
// of an event whose durable append FAILED is re-accepted, never deduped/staled
// into a 200 for an event the plane never durably recorded (AUDIT-20260718-37).
// `ingestEvent` always installs a FRESH `RunIngestState` via `runs.set` (never
// mutates one in place), so the shallow snapshot's references are faithful.
function rollbackAcceptedIngest(
  ingestState: IngestState,
  runsBefore: IngestState['runs'],
  event: ClassifiedEvent,
): void {
  ingestState.seenEventIds.delete(event.envelope.eventId);
  const { runId } = event.envelope;
  if (runId === null) {
    return;
  }
  const prior = runsBefore.get(runId);
  if (prior === undefined) {
    ingestState.runs.delete(runId);
  } else {
    ingestState.runs.set(runId, prior);
  }
}

// ---------------------------------------------------------------------------
// The handler factory.
// ---------------------------------------------------------------------------

/**
 * Build the plane's RAW request handlers over the injected live state. Byte-for-
 * byte the same handler logic that previously lived inside `createPlaneRuntime`
 * — only the enclosing scope changed (context injection instead of closure).
 */
export function buildPlaneHandlers(ctx: PlaneHandlerContext): PlaneHandlers {
  const { events } = ctx;

  // --- fleet SSE (C2 deltas) ---------------------------------------------
  const fleetStreamHandler: RouteHandler = (routeCtx: RouteContext): void => {
    routeCtx.res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    routeCtx.res.flushHeaders();
    let last: readonly FleetEntry[] = [];
    const initial = computeFleetTickGuarded(events, last);
    if (initial.error === undefined) {
      for (const delta of initial.deltas) {
        writeFleetDelta(routeCtx.res, delta);
      }
      last = initial.next;
    } else {
      logFleetTickError(initial.error);
    }
    const timer = ctx.scheduler.setInterval(() => {
      // GUARDED: the tick body ran a bare `buildRegistry(...)` with no
      // try/catch — any throw here is an UNCAUGHT exception in a setInterval
      // callback, which by default terminates the whole Node process (every
      // route down), not just this stream. `computeFleetTickGuarded` contains
      // the throw so a bad event only skips a tick (AUDIT-20260718-04).
      const tick = computeFleetTickGuarded(events, last);
      if (tick.error === undefined) {
        for (const delta of tick.deltas) {
          writeFleetDelta(routeCtx.res, delta);
        }
        last = tick.next;
      } else {
        logFleetTickError(tick.error);
      }
      // § C3 transport keepalive comment — proves nothing about health.
      routeCtx.res.write(':keepalive\n\n');
    }, KEEPALIVE_INTERVAL_MS);
    routeCtx.res.once('close', () => ctx.scheduler.clearInterval(timer));
  };

  // --- consumer handlers (C2/C5/C6, § Store health) -----------------------
  const consumerHandlers: PlaneRouteHandlers = {
    fleetSnapshot: (routeCtx) => {
      respondJson(routeCtx.res, 200, fleetSnapshot(buildRegistry(events)));
    },
    fleetStream: fleetStreamHandler,
    runDetail: (routeCtx) => {
      const entry = buildRegistry(events)
        .entries()
        .find((candidate) => candidate.runId === routeCtx.params.runId);
      if (entry === undefined) {
        respondJson(routeCtx.res, 404, { error: 'run not found', runId: routeCtx.params.runId });
        return;
      }
      respondJson(routeCtx.res, 200, perRunDetail(entry));
    },
    runHistory: async (routeCtx) => {
      // History reads the finalized run's archived `summary.json` through the
      // injected CdnReader — the ONLY sanctioned durable-store read seam (C7,
      // AUDIT-20260717-13/-15). The run's installationId is resolved from the
      // live registry (the object key is per-installation).
      const runId = requireParam(routeCtx, 'runId');
      if (ctx.cdnReader === undefined) {
        respondJson(routeCtx.res, 200, { found: false, runId });
        return;
      }
      const installationId = installationIdForRun(events, runId);
      if (installationId === undefined) {
        respondJson(routeCtx.res, 200, { found: false, runId });
        return;
      }
      try {
        const result = await runHistory(ctx.cdnReader, installationId, runId);
        respondJson(routeCtx.res, 200, result);
      } catch (error) {
        respondJson(routeCtx.res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    },
    runTimings: async (routeCtx) => {
      const runId = requireParam(routeCtx, 'runId');
      const absent = {
        runId,
        phases: { design: undefined, spec: undefined, execution: undefined, governance: undefined },
      };
      if (ctx.cdnReader === undefined) {
        respondJson(routeCtx.res, 200, absent);
        return;
      }
      const installationId = installationIdForRun(events, runId);
      if (installationId === undefined) {
        respondJson(routeCtx.res, 200, absent);
        return;
      }
      try {
        const result = await runTimings(ctx.cdnReader, installationId, runId);
        respondJson(routeCtx.res, 200, result);
      } catch (error) {
        respondJson(routeCtx.res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    },
    issueRunCommand: async (routeCtx) => {
      try {
        const body = await readJsonBody(routeCtx.req);
        const kind = parseCommandKind(body);
        const runId = requireParam(routeCtx, 'runId');
        // Resolve the run's OWNER from the live registry (AUDIT-20260717-16).
        // The held command must target the installation that owns `runId`, NOT
        // whichever bearer the caller authenticated with — otherwise
        // `replayOnReconnect` delivers it to the wrong sidecar. An unknown run
        // is rejected (the plane cannot command a run it has never observed).
        const entry = buildRegistry(events).entries().find((candidate) => candidate.runId === runId);
        if (entry === undefined) {
          respondJson(routeCtx.res, 404, { error: 'run not found', runId });
          return;
        }
        const result = await issueCommand(ctx.commandStore, ctx.commandDispatch, {
          kind,
          installationId: entry.installationId,
          runId,
        });
        respondJson(routeCtx.res, 200, result);
      } catch (error) {
        respondJson(routeCtx.res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    },
    commandStatus: (routeCtx) => {
      respondJson(routeCtx.res, 200, commandStatus(ctx.commandStore, requireParam(routeCtx, 'commandId')));
    },
    issueFleetCommand: async (routeCtx) => {
      try {
        const body = await readJsonBody(routeCtx.req);
        const kind = parseCommandKind(body);
        const targets = parseTargets(body);
        const installationId = ctx.requireAuthedInstallation(routeCtx.req);
        const reachable = new Set(buildRegistry(events).entries().map((e) => e.installationId));
        const result = await issueFleetCommand(
          ctx.commandStore,
          ctx.commandDispatch,
          { kind, installationId, runId: null },
          targets,
          (target) => reachable.has(target),
        );
        respondJson(routeCtx.res, 200, result);
      } catch (error) {
        respondJson(routeCtx.res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    },
    storeHealth: (routeCtx) => {
      respondJson(routeCtx.res, 200, computeStoreHealth(ctx.uplinkSignals, ctx.archiveSignals));
    },
    // --- instance observability (specs/037, read-only) --------------------
    // The instance registry is a PURE recompute-on-read over the same in-memory
    // `events` array the run registry folds (mirrors `fleetSnapshot` calling
    // `buildRegistry(events)`) — so it stays current as events arrive and reads
    // zero durable store (FR-023/SC-007). `events` seeds from `eventLog.replayed`
    // on boot, so the instance view rehydrates across a plane restart (T023).
    instanceSnapshot: (routeCtx) => {
      const opts =
        routeCtx.url.searchParams.get('include') === 'all' ? { include: 'all' as const } : undefined;
      respondJson(routeCtx.res, 200, projectInstanceSnapshot(buildInstanceRegistry(events), opts));
    },
    instanceDetail: (routeCtx) => {
      // `:id` is a URL-encoded `host:path` (contracts/instance-query-api.md).
      const id = decodeURIComponent(requireParam(routeCtx, 'id'));
      const detail = projectInstanceDetail(buildInstanceRegistry(events), id);
      // Unknown id → 404 with the pure not-found body verbatim ({ found:false, id }).
      respondJson(routeCtx.res, detail.found ? 200 : 404, detail);
    },
  };

  // --- sidecar-facing handlers (C1/C3/C7) --------------------------------
  const ingestHandler: RouteHandler = async (routeCtx) => {
    // Pre-image captured BEFORE `ingestEvent` mutates the bookkeeping — the
    // rollback anchor for a failed durable append (AUDIT-20260718-37).
    const runsBefore: IngestState['runs'] = new Map(ctx.ingestState.runs);
    let outcome: IngestOutcome;
    try {
      const body = await readJsonBody(routeCtx.req);
      // AUTHED-INSTALLATION ENFORCEMENT (AUDIT-20260718-45): the authenticated
      // installation is the TOKEN's, never the caller-claimed body id — so a valid
      // installation-A token cannot POST telemetry claiming `installationId: B`
      // (spoofing B's fleet/host-health state). Refuse 403 BEFORE `ingestEvent`
      // touches any bookkeeping. A body with NO claimed id (`undefined`) falls
      // through to envelope validation, which 400s it — malformed-body stays a
      // client error, not a spoof (AUDIT-20260718-26).
      const claimed = ingestClaimedInstallationId(body);
      if (
        claimed !== undefined &&
        refuseInstallationMismatch(routeCtx.res, claimed, ctx.requireAuthedInstallation(routeCtx.req), 'ingest body envelope.installationId')
      ) {
        return;
      }
      outcome = await ingestEvent(ctx.ingestState, { durableStore: ctx.durableStore }, body);
    } catch (error) {
      // A body rejected AT THE BOUNDARY (malformed JSON / failed validation) is
      // CLIENT input error — an honest 400 that must NOT move the uplink health
      // needle, or one caller sending garbage makes /v1/health/store cry wolf to
      // every subsequent caller (AUDIT-20260718-26). Only failures DOWNSTREAM of
      // successful validation (the append below) degrade the uplink hop.
      respondJson(routeCtx.res, 400, { error: error instanceof Error ? error.message : String(error) });
      return;
    }
    if (outcome.kind === 'accepted') {
      try {
        // Durable append is the FIRST irreversible step for an accepted event
        // (AUDIT-20260718-06/-37): synchronous + fsynced (event-log.ts). Only
        // after it returns do we admit the event and let the mutation stand.
        ctx.eventLog.append(outcome.event);
      } catch (error) {
        // Genuine downstream transport/storage failure (post-validation): roll
        // the bookkeeping back so the retry re-accepts, degrade the UPLINK hop
        // honestly, answer non-2xx so the sidecar resends.
        rollbackAcceptedIngest(ctx.ingestState, runsBefore, outcome.event);
        ctx.uplinkSignals.lastFailure = new Date().toISOString();
        ctx.uplinkSignals.lastError = error instanceof Error ? error.message : String(error);
        respondJson(routeCtx.res, 500, { error: ctx.uplinkSignals.lastError });
        return;
      }
      events.push(outcome.event);
    }
    ctx.uplinkSignals.lastSuccess = new Date().toISOString();
    respondJson(routeCtx.res, 200, outcome);
  };

  const sidecarStreamHandler: RouteHandler = createCommandStreamHandler({
    dispatch: ctx.commandDispatch,
    installationIdOf: (routeCtx) => ctx.requireAuthedInstallation(routeCtx.req),
    scheduler: ctx.scheduler,
  });

  const livenessHandler: RouteHandler = async (routeCtx) => {
    try {
      const body = await readJsonBody(routeCtx.req);
      assertSessionLiveness(body);
      // AUTHED-INSTALLATION ENFORCEMENT (AUDIT-20260718-45): as with ingest, the
      // heartbeat's claimed installationId must equal the token's authenticated
      // one — else installation-A's token could record liveness as installation B.
      if (
        refuseInstallationMismatch(routeCtx.res, body.installationId, ctx.requireAuthedInstallation(routeCtx.req), 'liveness installationId')
      ) {
        return;
      }
      respondJson(routeCtx.res, 200, { kind: 'session-liveness', accepted: true });
    } catch (error) {
      respondJson(routeCtx.res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  return { consumerHandlers, ingestHandler, sidecarStreamHandler, livenessHandler };
}
