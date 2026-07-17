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
 *   - ingestEvent / createIngestState
 *     (http/ingest.ts)                     — the telemetry acceptance boundary.
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
  type FleetDelta,
} from './http/api.js';
import {
  createIngestState,
  ingestEvent,
  type DurableEventStore,
  type IngestState,
} from './http/ingest.js';
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
import type { CommandKind } from '../fleet/command.js';

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
}

export interface PlaneRuntime {
  /** Build the wired `node:http` server (consumer + sidecar routes, all
   * bearer-gated). The caller owns `listen()`/`close()`. */
  createServer(): Server;
}

// ---------------------------------------------------------------------------
// Small HTTP helpers (no framework — node:http only).
// ---------------------------------------------------------------------------

function respondJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim() === '') {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    req.on('error', (error) => reject(error));
  });
}

const COMMAND_KINDS: readonly CommandKind[] = ['pause', 'resume', 'cancel', 'config-push', 'reconcile'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A path param the route pattern guarantees is present. The router only
 * invokes a handler after a positive regex match, so a `:name` segment
 * always resolved — this guard turns `noUncheckedIndexedAccess`'s
 * `string | undefined` into the `string` the route already promises, failing
 * loud (never a silent empty) if the invariant were ever violated. */
function requireParam(ctx: RouteContext, name: string): string {
  const value = ctx.params[name];
  if (value === undefined) {
    throw new Error(`plane runtime: route matched but path param ${JSON.stringify(name)} is missing.`);
  }
  return value;
}

function parseCommandKind(body: unknown): CommandKind {
  if (!isRecord(body)) {
    throw new Error('command request body must be a JSON object carrying a "kind".');
  }
  const { kind } = body;
  const match = COMMAND_KINDS.find((candidate) => candidate === kind);
  if (match === undefined) {
    throw new Error(
      `command "kind" must be one of ${COMMAND_KINDS.join(', ')}; got ${JSON.stringify(kind)}.`,
    );
  }
  return match;
}

function parseTargets(body: unknown): string[] {
  if (!isRecord(body)) {
    throw new Error('fleet command body must be a JSON object.');
  }
  const { targets } = body;
  if (!Array.isArray(targets) || targets.some((t) => typeof t !== 'string')) {
    throw new Error('fleet command "targets" must be an array of installation-id strings.');
  }
  return targets.filter((t): t is string => typeof t === 'string');
}

function assertSessionLiveness(body: unknown): void {
  if (
    !isRecord(body) ||
    body.kind !== 'session-liveness' ||
    typeof body.installationId !== 'string' ||
    typeof body.emittedAt !== 'string'
  ) {
    throw new Error(
      'session-liveness heartbeat must carry { kind: "session-liveness", installationId, emittedAt }.',
    );
  }
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
  const events: ClassifiedEvent[] = [];
  const ingestState: IngestState = createIngestState();
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
    runHistory: (ctx) => {
      // History reads through the CDN-fronted archive (C7). The archival
      // producer that writes the finalized `summary.json` is a separate
      // durable-store task; until it is wired here, this endpoint honestly
      // reports "no archived history yet" rather than fabricating one.
      respondJson(ctx.res, 200, { found: false, runId: ctx.params.runId });
    },
    runTimings: (ctx) => {
      respondJson(ctx.res, 200, {
        runId: ctx.params.runId,
        phases: { design: undefined, spec: undefined, execution: undefined, governance: undefined },
      });
    },
    issueRunCommand: async (ctx) => {
      let body: unknown;
      try {
        body = await readJsonBody(ctx.req);
        const kind = parseCommandKind(body);
        const installationId = requireAuthedInstallation(ctx.req);
        const result = await issueCommand(commandStore, commandDispatch, {
          kind,
          installationId,
          runId: requireParam(ctx, 'runId'),
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
