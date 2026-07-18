/**
 * specs/036-fleet-control-plane — T124 (plane-runtime), pairs with the RED
 * test tests/fleet/plane-serve.test.ts and the `serve` subaction in
 * src/subcommands/plane.ts.
 *
 * THE RUNNABLE PLANE — assembles the already-tested plane primitives into a
 * live service the dogfood (T128) drives. This module WIRES; it does not
 * reinvent domain logic:
 *
 *   - buildRegistry (registry.ts)         — the live, derived fleet view.
 *   - fleetSnapshot / computeFleetDeltas /
 *     perRunDetail / commandStatus /
 *     issueCommand / issueFleetCommand
 *     (http/api.ts)                        — the pure C2/C5/C6 projections.
 *   - ingestEvent / rehydrateIngestState
 *     (http/ingest.ts)                     — the telemetry acceptance boundary,
 *                                            rehydrated from the durable event
 *                                            log on boot (AUDIT-20260717-14).
 *   - createCommandStore / createCommandDispatch
 *     (commands/*)                         — durable command custody + delivery.
 *   - createCommandStreamHandler (http/stream.ts) — SSE-out + 15s keepalive.
 *   - createTokenRegistry / parseBearer (http/auth.ts) — bearer auth (C6).
 *   - createPlaneServer (http/server.ts)   — the node:http router.
 *
 * ROUTES SERVED:
 *   - The NINE consumer routes (contracts/plane-client-api.md § Route shape),
 *     built from the pure projections above and mounted through
 *     `createPlaneServer`'s built-in table.
 *   - THREE sidecar-facing routes (contracts/sidecar-plane-protocol.md
 *     C1/C3/C7), NOT part of the consumer contract's table, mounted through
 *     `createPlaneServer`'s `extraRoutes` seam (no router duplication):
 *       · POST /v1/ingest          — accept one telemetry event (C1).
 *       · GET  /v1/sidecar/stream  — deliver held commands over SSE (C1/C7).
 *       · POST /v1/sidecar/liveness — accept a session-liveness heartbeat (C3).
 *
 * AUTH (contracts/sidecar-plane-protocol.md C6, FR-088): EVERY route requires
 * a valid bearer; a missing/unknown/revoked token is refused 401 with the
 * distinct reason surfaced — a revoked token is NEVER downgraded to unknown
 * or anonymous. For the single-operator dogfood model (FR-078) the consumer
 * routes require the same bearer as the sidecar routes.
 *
 * CADENCE SEAM: the SSE keepalive `IntervalScheduler` is injected so a test
 * proves the 15s cadence WITHOUT a real wait (mirrors stream.ts / the
 * Clock-DI convention). Production defaults to NODE_INTERVAL_SCHEDULER.
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
 * under node16 resolution (no `@/` alias — this plugin has none). Real
 * `node:fs`/`node:http` — never a mocked transport or filesystem.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { buildRegistry, type ClassifiedEvent } from './registry.js';
import {
  commandStatus,
  computeFleetDeltas,
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
  rehydrateIngestState,
  type DurableEventStore,
  type IngestState,
} from './http/ingest.js';
import { createEventLog, type EventLog } from './event-log.js';
import {
  assertSessionLiveness,
  installationIdForRun,
  parseCommandKind,
  parseTargets,
  readJsonBody,
  requireParam,
  respondJson,
} from './runtime-http.js';
import type { CdnReader } from '../storage/cdn-reader.js';
import { createCommandStore, type CommandStore } from './commands/store.js';
import { createCommandDispatch, type CommandDispatch } from './commands/dispatch.js';
import {
  KEEPALIVE_INTERVAL_MS,
  NODE_INTERVAL_SCHEDULER,
  createCommandStreamHandler,
  type IntervalScheduler,
} from './http/stream.js';
import { createTokenRegistry, parseBearer, type TokenRegistry } from './http/auth.js';
import {
  computeStoreHealth,
  type ArchiveSignals,
  type UplinkSignals,
} from './health.js';
import {
  createPlaneServer,
  type ExtraRoute,
  type PlaneRouteHandlers,
  type RouteContext,
  type RouteHandler,
} from './http/server.js';
import type { TelemetryEvent } from '../fleet/event.js';

// ---------------------------------------------------------------------------
// Options + public surface.
// ---------------------------------------------------------------------------

export interface PlaneRuntimeOptions {
  /**
   * Accepted bearer tokens, each mapped to its owning installation id (C6:
   * tokens are per-installation credentials). The `serve` subaction seeds
   * this with a single `--token` → local-installation-id pair; broader
   * per-installation provisioning is a documented follow-up seam.
   */
  readonly acceptedTokens: ReadonlyMap<string, string>;
  /** Tokens explicitly revoked — refused with reason 'revoked', never
   * downgraded (FR-088). Defaults to empty. */
  readonly revokedTokens?: ReadonlySet<string>;
  /** Directory backing the durable command store (FR-056) and the
   * late-event durable hand-off (FR-066). Created if absent. */
  readonly commandStoreDir: string;
  /** Injected SSE keepalive scheduler (test seam). Defaults to
   * {@link NODE_INTERVAL_SCHEDULER}. */
  readonly scheduler?: IntervalScheduler;
  /**
   * Injected CDN-fronted archive reader (C7, AUDIT-20260717-13/-15). When
   * provided, the `GET /v1/runs/:id/history` and `/timings` routes serve the
   * finalized run's archived `summary.json` through it (the ONLY sanctioned
   * durable-store read seam). When absent, those routes honestly report "no
   * archive reader configured" (found: false / undefined phases) rather than
   * fabricating a history. Injectable so tests exercise the READ path with a
   * fake reader — no real B2 credentials. Production wiring of a real
   * CDN-backed reader awaits the archival `summary.json` producer (TASK-459)
   * and the object-store adapter; the read wiring is live here regardless.
   */
  readonly cdnReader?: CdnReader;
}

export interface PlaneRuntime {
  /** Build the wired `node:http` server (consumer + sidecar routes, all
   * bearer-gated). The caller owns `listen()`/`close()`. */
  createServer(): Server;
}

// ---------------------------------------------------------------------------
// Durable late-event store (FR-066) — a real file-backed hand-off, never a
// mock. A late event lands as a NEW object (its eventId key), never a
// rewrite.
// ---------------------------------------------------------------------------

function createFileDurableEventStore(dir: string, archive: ArchiveSignals): DurableEventStore {
  const lateDir = join(dir, 'late-events');
  mkdirSync(lateDir, { recursive: true });
  return {
    async storeLateEvent(event: TelemetryEvent): Promise<void> {
      const path = join(lateDir, `${event.envelope.eventId}.json`);
      writeFileSync(path, `${JSON.stringify(event, null, 2)}\n`);
      archive.lastSuccess = new Date().toISOString();
    },
  };
}

// ---------------------------------------------------------------------------
// The runtime.
// ---------------------------------------------------------------------------

export function createPlaneRuntime(options: PlaneRuntimeOptions): PlaneRuntime {
  const scheduler = options.scheduler ?? NODE_INTERVAL_SCHEDULER;
  const tokenRegistry: TokenRegistry = createTokenRegistry({
    active: options.acceptedTokens,
    revoked: options.revokedTokens ?? new Set(),
  });

  // --- live state ---------------------------------------------------------
  // The accepted-event log is durable + replayed on boot (AUDIT-20260717-14):
  // a plane restart over the same durable dir rehydrates the live registry and
  // the ingest no-regress/dedupe bookkeeping, so fleet visibility survives a
  // bounce (the ingesting sidecars won't re-send already-200'd events).
  const eventLog: EventLog = createEventLog(join(options.commandStoreDir, 'accepted-events'));
  const events: ClassifiedEvent[] = [...eventLog.replayed];
  const ingestState: IngestState = rehydrateIngestState(events);
  const commandStore: CommandStore = createCommandStore(options.commandStoreDir);
  const commandDispatch: CommandDispatch = createCommandDispatch(commandStore);

  const uplinkSignals: UplinkSignals = {
    spoolDepth: 0,
    lastSuccess: null,
    lastFailure: null,
    lastError: null,
  };
  const archiveSignals: ArchiveSignals = {
    pendingCount: 0,
    failedCount: 0,
    lastSuccess: null,
    lastFailure: null,
    lastError: null,
  };
  const durableStore = createFileDurableEventStore(options.commandStoreDir, archiveSignals);

  // The authenticated installation for the in-flight request, keyed by the
  // request object — set by the auth guard, read by handlers (e.g. the SSE
  // stream's `installationIdOf`) that must not re-derive identity.
  const authedInstallation = new WeakMap<IncomingMessage, string>();

  function requireAuthedInstallation(req: IncomingMessage): string {
    const id = authedInstallation.get(req);
    if (id === undefined) {
      throw new Error('plane runtime: handler ran without an authenticated installation (auth-guard bug).');
    }
    return id;
  }

  // --- auth guard ---------------------------------------------------------
  function withAuth(handler: RouteHandler): RouteHandler {
    return async (ctx: RouteContext): Promise<void> => {
      const token = parseBearer(ctx.req.headers.authorization);
      const outcome = tokenRegistry.verify(token);
      if (!outcome.ok) {
        // The reason is surfaced verbatim — 'revoked' stays 'revoked',
        // never downgraded to 'unknown' or anonymous (FR-088).
        respondJson(ctx.res, 401, { error: 'unauthorized', reason: outcome.reason });
        return;
      }
      authedInstallation.set(ctx.req, outcome.installationId);
      await handler(ctx);
    };
  }

  // --- fleet SSE (C2 deltas) ---------------------------------------------
  function writeFleetDelta(res: ServerResponse, delta: FleetDelta): void {
    res.write(`event: fleet-delta\ndata: ${JSON.stringify(delta)}\n\n`);
  }

  const fleetStreamHandler: RouteHandler = (ctx: RouteContext): void => {
    ctx.res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    ctx.res.flushHeaders();
    let last = buildRegistry(events).entries();
    for (const delta of computeFleetDeltas([], last)) {
      writeFleetDelta(ctx.res, delta);
    }
    const timer = scheduler.setInterval(() => {
      const next = buildRegistry(events).entries();
      for (const delta of computeFleetDeltas(last, next)) {
        writeFleetDelta(ctx.res, delta);
      }
      last = next;
      // § C3 transport keepalive comment — proves nothing about health.
      ctx.res.write(':keepalive\n\n');
    }, KEEPALIVE_INTERVAL_MS);
    ctx.res.once('close', () => scheduler.clearInterval(timer));
  };

  // --- consumer handlers (C2/C5/C6, § Store health) -----------------------
  const consumerHandlers: PlaneRouteHandlers = {
    fleetSnapshot: (ctx) => {
      respondJson(ctx.res, 200, fleetSnapshot(buildRegistry(events)));
    },
    fleetStream: fleetStreamHandler,
    runDetail: (ctx) => {
      const entry = buildRegistry(events)
        .entries()
        .find((candidate) => candidate.runId === ctx.params.runId);
      if (entry === undefined) {
        respondJson(ctx.res, 404, { error: 'run not found', runId: ctx.params.runId });
        return;
      }
      respondJson(ctx.res, 200, perRunDetail(entry));
    },
    runHistory: async (ctx) => {
      // History reads the finalized run's archived `summary.json` through the
      // injected CdnReader — the ONLY sanctioned durable-store read seam (C7,
      // AUDIT-20260717-13/-15). The run's installationId is resolved from the
      // live registry (the object key is per-installation).
      const runId = requireParam(ctx, 'runId');
      if (options.cdnReader === undefined) {
        respondJson(ctx.res, 200, { found: false, runId });
        return;
      }
      const installationId = installationIdForRun(events, runId);
      if (installationId === undefined) {
        respondJson(ctx.res, 200, { found: false, runId });
        return;
      }
      try {
        const result = await runHistory(options.cdnReader, installationId, runId);
        respondJson(ctx.res, 200, result);
      } catch (error) {
        respondJson(ctx.res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    },
    runTimings: async (ctx) => {
      const runId = requireParam(ctx, 'runId');
      const absent = {
        runId,
        phases: { design: undefined, spec: undefined, execution: undefined, governance: undefined },
      };
      if (options.cdnReader === undefined) {
        respondJson(ctx.res, 200, absent);
        return;
      }
      const installationId = installationIdForRun(events, runId);
      if (installationId === undefined) {
        respondJson(ctx.res, 200, absent);
        return;
      }
      try {
        const result = await runTimings(options.cdnReader, installationId, runId);
        respondJson(ctx.res, 200, result);
      } catch (error) {
        respondJson(ctx.res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    },
    issueRunCommand: async (ctx) => {
      try {
        const body = await readJsonBody(ctx.req);
        const kind = parseCommandKind(body);
        const runId = requireParam(ctx, 'runId');
        // Resolve the run's OWNER from the live registry (AUDIT-20260717-16).
        // The held command must target the installation that owns `runId`, NOT
        // whichever bearer the caller authenticated with — otherwise
        // `replayOnReconnect` delivers it to the wrong sidecar. An unknown run
        // is rejected (the plane cannot command a run it has never observed).
        const entry = buildRegistry(events).entries().find((candidate) => candidate.runId === runId);
        if (entry === undefined) {
          respondJson(ctx.res, 404, { error: 'run not found', runId });
          return;
        }
        const result = await issueCommand(commandStore, commandDispatch, {
          kind,
          installationId: entry.installationId,
          runId,
        });
        respondJson(ctx.res, 200, result);
      } catch (error) {
        respondJson(ctx.res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    },
    commandStatus: (ctx) => {
      respondJson(ctx.res, 200, commandStatus(commandStore, requireParam(ctx, 'commandId')));
    },
    issueFleetCommand: async (ctx) => {
      try {
        const body = await readJsonBody(ctx.req);
        const kind = parseCommandKind(body);
        const targets = parseTargets(body);
        const installationId = requireAuthedInstallation(ctx.req);
        const reachable = new Set(buildRegistry(events).entries().map((e) => e.installationId));
        const result = await issueFleetCommand(
          commandStore,
          commandDispatch,
          { kind, installationId, runId: null },
          targets,
          (target) => reachable.has(target),
        );
        respondJson(ctx.res, 200, result);
      } catch (error) {
        respondJson(ctx.res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    },
    storeHealth: (ctx) => {
      respondJson(ctx.res, 200, computeStoreHealth(uplinkSignals, archiveSignals));
    },
  };

  // --- sidecar-facing handlers (C1/C3/C7) --------------------------------
  const ingestHandler: RouteHandler = async (ctx) => {
    try {
      const body = await readJsonBody(ctx.req);
      const outcome = await ingestEvent(ingestState, { durableStore }, body);
      if (outcome.kind === 'accepted') {
        events.push(outcome.event);
        // Durably record every accepted event so a plane restart recovers the
        // live registry (AUDIT-20260717-14).
        eventLog.append(outcome.event);
      }
      uplinkSignals.lastSuccess = new Date().toISOString();
      respondJson(ctx.res, 200, outcome);
    } catch (error) {
      // Fail loud, but as an honest 400 (malformed body) — never a silent
      // drop, never a 200 that hides the rejection.
      uplinkSignals.lastFailure = new Date().toISOString();
      uplinkSignals.lastError = error instanceof Error ? error.message : String(error);
      respondJson(ctx.res, 400, { error: uplinkSignals.lastError });
    }
  };

  const sidecarStreamHandler: RouteHandler = createCommandStreamHandler({
    dispatch: commandDispatch,
    installationIdOf: (ctx) => requireAuthedInstallation(ctx.req),
    scheduler,
  });

  const livenessHandler: RouteHandler = async (ctx) => {
    try {
      const body = await readJsonBody(ctx.req);
      assertSessionLiveness(body);
      respondJson(ctx.res, 200, { kind: 'session-liveness', accepted: true });
    } catch (error) {
      respondJson(ctx.res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // --- wire the server ----------------------------------------------------
  return {
    createServer(): Server {
      const guardedConsumer: PlaneRouteHandlers = {
        fleetSnapshot: withAuth(consumerHandlers.fleetSnapshot),
        fleetStream: withAuth(consumerHandlers.fleetStream),
        runDetail: withAuth(consumerHandlers.runDetail),
        runHistory: withAuth(consumerHandlers.runHistory),
        runTimings: withAuth(consumerHandlers.runTimings),
        issueRunCommand: withAuth(consumerHandlers.issueRunCommand),
        commandStatus: withAuth(consumerHandlers.commandStatus),
        issueFleetCommand: withAuth(consumerHandlers.issueFleetCommand),
        storeHealth: withAuth(consumerHandlers.storeHealth),
      };
      const sidecarRoutes: readonly ExtraRoute[] = [
        { method: 'POST', pattern: '/v1/ingest', handler: withAuth(ingestHandler) },
        { method: 'GET', pattern: '/v1/sidecar/stream', handler: withAuth(sidecarStreamHandler) },
        { method: 'POST', pattern: '/v1/sidecar/liveness', handler: withAuth(livenessHandler) },
      ];
      return createPlaneServer(guardedConsumer, sidecarRoutes);
    },
  };
}
