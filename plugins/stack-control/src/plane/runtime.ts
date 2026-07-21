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
 *   - fleetSnapshot / computeFleetDeltas / perRunDetail / commandStatus /
 *     issueCommand / issueFleetCommand (http/api.ts) — pure C2/C5/C6 projections.
 *   - ingestEvent / rehydrateIngestState (http/ingest.ts) — the telemetry
 *     acceptance boundary, rehydrated from the durable log on boot (AUDIT-…-14).
 *   - createCommandStore / createCommandDispatch (commands/*) — command custody.
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
 * distinct reason surfaced — a revoked token is NEVER downgraded. For the
 * single-operator dogfood model (FR-078) the consumer routes require the same
 * bearer as the sidecar routes.
 *
 * CADENCE SEAM: the SSE keepalive `IntervalScheduler` is injected so a test
 * proves the 15s cadence WITHOUT a real wait. Production defaults to
 * NODE_INTERVAL_SCHEDULER.
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
 * under node16 resolution. Real `node:fs`/`node:http` — never a mocked transport.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, Server } from 'node:http';
import type { ClassifiedEvent } from './registry.js';
import {
  rehydrateIngestState,
  type DurableEventStore,
  type IngestState,
} from './http/ingest.js';
import { createEventLog, type EventLog } from './event-log.js';
import { respondJson } from './runtime-http.js';
import type { CdnReader } from '../storage/cdn-reader.js';
import { createCommandStore, type CommandStore } from './commands/store.js';
import { createCommandDispatch, type CommandDispatch } from './commands/dispatch.js';
import { NODE_INTERVAL_SCHEDULER, type IntervalScheduler } from './http/stream.js';
import { createTokenRegistry, parseBearer, type TokenRegistry } from './http/auth.js';
import { type ArchiveSignals, type UplinkSignals } from './health.js';
import {
  createPlaneServer,
  type ExtraRoute,
  type PlaneRouteHandlers,
  type RouteContext,
  type RouteHandler,
} from './http/server.js';
import type { TelemetryEvent } from '../fleet/event.js';
import { buildPlaneHandlers } from './runtime-handlers.js';
import { buildDashboardRoutes } from '../dashboard/serve.js';
import { createHeartbeatStore, type HeartbeatStore } from './heartbeat-store.js';

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
  /**
   * Accepted bearer tokens, each mapped to the instance identity (`host:path`,
   * D8) it is authorized to act for (specs/037 T038). Recorded ALONGSIDE
   * {@link acceptedTokens}'s installationId authorization — never replacing it:
   * `installationId` stays the durable, path-independent identity while this
   * `host:path` composite names "this checkout on this machine". When a token
   * has an entry here, an ingest whose envelope `host:path` differs from it is
   * refused 403 (the token→`host:path` check running alongside the installationId
   * check). A token with NO entry is not host:path-gated — only its installationId
   * authorization applies (this map, like `acceptedTokens`, seeds from a
   * documented per-installation provisioning seam). Defaults to empty. */
  readonly acceptedInstances?: ReadonlyMap<string, string>;
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
  /**
   * Injected durable accepted-event log (test seam, mirrors `scheduler` /
   * `cdnReader`). Defaults to a real file-backed {@link createEventLog} under
   * `commandStoreDir`. Injectable so a test can prove the ingest handler admits
   * an event and answers 200 ONLY AFTER the durable append succeeds
   * (AUDIT-20260718-06/-37) — a failing append must yield a non-2xx, leave the
   * registry untouched, and roll the ingest bookkeeping back so a retry re-accepts.
   */
  readonly eventLog?: EventLog;
  /**
   * When provided, mounts `POST /v1/enroll` (specs/037 Task 3) on the
   * sidecar route table using the given handler verbatim. The handler
   * authenticates by enrollment credential internally (`http/enroll.ts`,
   * Task 2), so it is NOT wrapped in the telemetry `withAuth` guard the
   * other sidecar routes use — enroll requests carry a credential, not an
   * already-provisioned bearer token. Absent by default: a plane serving
   * without a fleet registry offers no enroll route.
   */
  readonly enrollment?: { readonly handler: RouteHandler };
  /**
   * Called at the start of every bearer-gated request, before the token is
   * verified. `serve` wires this to the fleet registry's
   * `reloadEnrollmentIfChanged` so a token revoked by a separate process (the
   * `revoke` CLI) is refused by a running plane without a restart — the
   * symmetric dual of the enroll path refreshing before it mints. A no-op when
   * the enrollment file is unchanged; absent by default (tests that pass static
   * maps need no refresh).
   */
  readonly refreshBeforeAuth?: () => void;
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
  const eventLog: EventLog =
    options.eventLog ?? createEventLog(join(options.commandStoreDir, 'accepted-events'));
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

  // In-memory, live-only session-liveness heartbeat store (dogfood T050):
  // `livenessHandler` records the sidecar's ~45s heartbeat here; the instance
  // registry reads it so an idle-but-connected instance stays `live` and
  // `lastHeartbeatAt` populates. Ephemeral by contract — a plane restart empties
  // it and the next heartbeat refills it; reading it adds ZERO durable reads.
  const heartbeats: HeartbeatStore = createHeartbeatStore();

  // The authenticated installation for the in-flight request, keyed by the
  // request object — set by the auth guard, read by handlers (e.g. the SSE
  // stream's `installationIdOf`) that must not re-derive identity.
  const authedInstallation = new WeakMap<IncomingMessage, string>();

  // The authenticated instance identity (`host:path`, D8) for the in-flight
  // request, keyed by the request object — set by the auth guard ONLY when the
  // verified token has a recorded authorized instance (acceptedInstances). A
  // token with no entry leaves this unset, so `requireAuthedInstance` returns
  // `undefined` and the caller skips the host:path check (installationId auth
  // still applies).
  const acceptedInstances: ReadonlyMap<string, string> = options.acceptedInstances ?? new Map();
  const authedInstance = new WeakMap<IncomingMessage, string>();

  function requireAuthedInstallation(req: IncomingMessage): string {
    const id = authedInstallation.get(req);
    if (id === undefined) {
      throw new Error('plane runtime: handler ran without an authenticated installation (auth-guard bug).');
    }
    return id;
  }

  function requireAuthedInstance(req: IncomingMessage): string | undefined {
    return authedInstance.get(req);
  }

  // --- auth guard ---------------------------------------------------------
  function withAuth(handler: RouteHandler): RouteHandler {
    return async (ctx: RouteContext): Promise<void> => {
      // Pick up a revocation (or credential change) a separate process wrote
      // since the last request, before deciding on this token.
      options.refreshBeforeAuth?.();
      const token = parseBearer(ctx.req.headers.authorization);
      const outcome = tokenRegistry.verify(token);
      if (!outcome.ok) {
        // The reason is surfaced verbatim — 'revoked' stays 'revoked',
        // never downgraded to 'unknown' or anonymous (FR-088).
        respondJson(ctx.res, 401, { error: 'unauthorized', reason: outcome.reason });
        return;
      }
      authedInstallation.set(ctx.req, outcome.installationId);
      // Record the token's authorized instance (`host:path`, D8) alongside its
      // installationId — ONLY when this token has one provisioned. `token` is
      // defined here (verify() returned ok only for a present token).
      const authorizedInstance = token === undefined ? undefined : acceptedInstances.get(token);
      if (authorizedInstance !== undefined) {
        authedInstance.set(ctx.req, authorizedInstance);
      }
      await handler(ctx);
    };
  }

  // --- handlers (extracted to runtime-handlers.ts, T015) ------------------
  // The raw (pre-auth) handler bodies live in the sibling module to keep both
  // files under the Constitution VI file cap; they close over the live state
  // above through the injected context. Behavior is unchanged.
  const { consumerHandlers, ingestHandler, sidecarStreamHandler, livenessHandler } =
    buildPlaneHandlers({
      events,
      ingestState,
      commandStore,
      commandDispatch,
      uplinkSignals,
      archiveSignals,
      durableStore,
      eventLog,
      heartbeats,
      scheduler,
      cdnReader: options.cdnReader,
      requireAuthedInstallation,
      requireAuthedInstance,
    });

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
        instanceSnapshot: withAuth(consumerHandlers.instanceSnapshot),
        instanceStream: withAuth(consumerHandlers.instanceStream),
        instanceDetail: withAuth(consumerHandlers.instanceDetail),
        instanceRuns: withAuth(consumerHandlers.instanceRuns),
      };
      const enrollRoute: readonly ExtraRoute[] =
        options.enrollment === undefined
          ? []
          : [{ method: 'POST', pattern: '/v1/enroll', handler: options.enrollment.handler }];
      const sidecarRoutes: readonly ExtraRoute[] = [
        { method: 'POST', pattern: '/v1/ingest', handler: withAuth(ingestHandler) },
        { method: 'GET', pattern: '/v1/sidecar/stream', handler: withAuth(sidecarStreamHandler) },
        { method: 'POST', pattern: '/v1/sidecar/liveness', handler: withAuth(livenessHandler) },
        ...enrollRoute,
        ...buildDashboardRoutes(options.acceptedTokens),
      ];
      return createPlaneServer(guardedConsumer, sidecarRoutes);
    },
  };
}
