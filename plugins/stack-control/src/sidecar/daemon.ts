/**
 * specs/036-fleet-control-plane — sidecar-daemon (the runnable daemon).
 * Contracts: local-socket-protocol.md § Frames (receive + redact + spool),
 * sidecar-plane-protocol.md C1 (uplink POST /v1/ingest + SSE-in commands) and
 * C3 (session-liveness heartbeat).
 *
 * THIS MODULE ASSEMBLES ALREADY-TESTED PRIMITIVES — it is WIRING, not new
 * domain logic. It re-implements none of them:
 *
 *   - `electSidecarForInstallation` (server.ts) — bind-wins election. On a win
 *     we route the additive `onFrame` seam into the pipeline; a LOST election
 *     resolves `started` as `{ kind: 'lost' }` and wires nothing (the caller
 *     exits silently, per C6).
 *   - `createPipeline` (pipeline.ts) — validate → REDACT → assign → spool. The
 *     redaction-precedes-spool invariant (FR-047/048) lives entirely inside
 *     `receive()`; this module never spools around it.
 *   - `openWal` (spool/wal.ts) — a SECOND, read-only handle over the SAME spool
 *     dir the pipeline writes to, used by the drain loop's `replay()`. Two
 *     handles over one append-only file is safe: the pipeline appends+fsyncs,
 *     `replay()` always reads fresh from disk (never a cache).
 *   - `createTelemetryPoster` (uplink/post.ts) — the plain HTTP POST seam for
 *     both telemetry uplink (`/v1/ingest`) and the liveness heartbeat.
 *   - `BackoffSchedule` (spool/drain.ts) — the transmit retry cadence on a
 *     failed drain pass (full-jitter, server-reseedable — § C4 shape).
 *   - `runReconnectingSseClient` (uplink/reconnect.ts) — the held-open SSE
 *     command stream (`/v1/sidecar/stream`); command `data:` frames surface
 *     as events, keepalive comments never do.
 *   - `createSessionLivenessScheduler` (session-liveness.ts) — the § C3
 *     sidecar→plane heartbeat, its `send` wired to POST `/v1/sidecar/liveness`.
 *
 * EventFrame(TelemetryEvent) → pipeline.receive(RawInvocationEvent) IMPEDANCE
 * (flagged, not silently papered over): the local socket's `event` frame
 * carries a FULL, RAW `TelemetryEvent` (FR-047 — redaction is the sidecar's
 * job, not the CLI's). `pipeline.receive` takes the narrower
 * `RawInvocationEvent` (identity + type + classification) and MINTS its own
 * `eventId` + BOTH sequences and REDACTS before spooling. So we extract the
 * five identity/classification fields off `frame.event.envelope` and hand them
 * to the pipeline — which spools a fresh, sidecar-sequenced, REDACTED event.
 * The inbound frame's own `eventId`/sequences are deliberately discarded (the
 * sidecar is the authoritative durable outbound counter, FR-039). The pipeline
 * CAN now carry a redactable snapshot (pipeline.ts's `RawSnapshot`,
 * AUDIT-20260717-12), but the daemon does NOT yet thread the inbound
 * `frame.event.snapshot` through, because the local-socket `event` frame
 * carries no per-field `FieldAllowlist` — with none, deny-by-default would drop
 * every snapshot field anyway. Threading it needs the local-socket protocol to
 * carry a field policy (out of scope here); until then the daemon spools
 * identity-only. What matters for FR-048 is preserved either way: redaction
 * still runs inside `receive()` BEFORE the WAL append.
 *
 * PLANE-URL / TOKEN RESOLUTION: the uplink is ACTIVE only when BOTH a plane URL
 * (explicit option ?? `STACKCTL_CP_URL`) AND a provisioned bearer token
 * (machine-local token custody) resolve. With neither URL nor token, the
 * daemon STILL runs the local socket receiver + spools to the WAL — the uplink
 * simply stays idle (no crash). This is the "spool now, transmit when the
 * plane is reachable" posture the WAL's at-least-once replay (FR-049) makes
 * safe.
 *
 * TIME: every cadence/backoff is driven by an injected `Clock` (default
 * `SystemClock`) plus small `setInterval`s that are `unref()`'d (so they never
 * keep the process alive on their own) and cleared on `stop()`. The happy path
 * keeps the SSE stream connected, so neither the 45s read-idle watchdog nor the
 * transmit backoff fires in a test — no real long wait is ever required.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution (no `@/` alias configured).
 */

import { join } from 'node:path';
import { SystemClock, type Clock } from '../fleet/clock.js';
import { locateMachineState } from '../machine-state/locate.js';
import { mintOrReadInstallationId } from '../machine-state/identity.js';
import { openTokenCustody } from '../machine-state/token.js';
import { createPipeline, type SidecarPipeline } from './pipeline.js';
import { openWal, type WalHandle } from './spool/wal.js';
import { BackoffSchedule } from './spool/drain.js';
import { createTelemetryPoster, type TelemetryPoster } from './uplink/post.js';
import {
  runReconnectingSseClient,
  type ReconnectingSseClientHandle,
} from './uplink/reconnect.js';
import { FetchSseTransport, type SseTransport } from './uplink/transport.js';
import {
  createSessionLivenessScheduler,
  type SessionLivenessSignal,
} from './session-liveness.js';
import {
  electSidecarForInstallation,
  type LossReason,
  type ReceivedFrameHandler,
  type SidecarServer,
} from './server.js';
import type { EventFrame } from '../telemetry/protocol.js';

/** How the daemon finished its startup (election): won ⇒ it is now live and
 * (if the uplink resolved) transmitting; lost ⇒ another sidecar holds the
 * socket and the caller should exit silently (C6). */
export type SidecarDaemonStart =
  | { readonly kind: 'won'; readonly socketPath: string }
  | { readonly kind: 'lost'; readonly reason: LossReason };

/** Options for {@link runSidecarDaemon}. Only `installationRoot` is required. */
export interface SidecarDaemonOptions {
  /** The installation root (production: `process.cwd()`). Keys the machine-
   * local store (socket, token, spool) via `locateMachineState`. */
  readonly installationRoot: string;
  /** The control plane URL. Explicit value wins; else `STACKCTL_CP_URL`; else
   * the uplink stays idle (local receiver + spool still run). */
  readonly planeUrl?: string;
  /** Injected time source (default `SystemClock`). */
  readonly clock?: Clock;
  /** Drain-loop poll cadence in ms (default 1000). Tests pass a tiny value. */
  readonly drainIntervalMs?: number;
  /** Session-liveness cadence in ms (default 45000 — distinct from the
   * transport keepalive's 15s, § C3). */
  readonly livenessIntervalMs?: number;
  /** Injected SSE transport (default real `FetchSseTransport`). */
  readonly transport?: SseTransport;
  /** Injected telemetry/liveness POST seam (default real fetch-backed poster). */
  readonly poster?: TelemetryPoster;
  /** The LOCAL-RUN delivery sink: fired for each command delivered over the
   * plane's SSE stream so the daemon can route it onward to the target run.
   * When this is provided, the daemon considers the command DELIVERED. Full
   * command→local-run fan-in over the socket (`register-run`/`command` frames)
   * is a larger tracked concern (TASK-461). */
  readonly onCommand?: (command: unknown) => void;
  /** Observable record for a command that arrived over SSE but had NO local-run
   * delivery sink (`onCommand` absent). The daemon MUST NOT silently discard a
   * received command (AUDIT-20260717-17): with no sink, each command is
   * recorded here as UNDELIVERED. Absent ⇒ a default recorder logs the
   * undelivered command to stderr, so the production default path is never
   * silent. */
  readonly onUndeliveredCommand?: (command: unknown) => void;
  /** Best-effort observer for non-fatal background errors (drain/liveness
   * failures, malformed command frames). Telemetry never crashes the daemon. */
  readonly onError?: (error: unknown) => void;
}

/** The daemon handle: `started` settles once the election resolves; `stop`
 * tears everything down (timers, SSE, spool read handle, socket listener). */
export interface SidecarDaemonHandle {
  readonly started: Promise<SidecarDaemonStart>;
  stop(): Promise<void>;
}

const DEFAULT_DRAIN_INTERVAL_MS = 1000;
const DEFAULT_LIVENESS_INTERVAL_MS = 45_000;
/** Transmit-retry backoff policy (§ C4 shape; only fires on a failed pass). */
const DRAIN_BACKOFF_BASE_MS = 1000;
const DRAIN_BACKOFF_CAP_MS = 30_000;
const DRAIN_BACKOFF_HEALTHY_RESET_MS = 60_000;

/**
 * Assemble and run the sidecar daemon. Returns synchronously with a handle
 * whose `started` promise settles once the bind-wins election resolves — a
 * caller (test or `sidecar run`) awaits it to learn won/lost and, on a win, the
 * bound socket path.
 */
export function runSidecarDaemon(options: SidecarDaemonOptions): SidecarDaemonHandle {
  const clock: Clock = options.clock ?? new SystemClock();
  const drainIntervalMs = options.drainIntervalMs ?? DEFAULT_DRAIN_INTERVAL_MS;
  const livenessIntervalMs = options.livenessIntervalMs ?? DEFAULT_LIVENESS_INTERVAL_MS;
  const transport: SseTransport = options.transport ?? new FetchSseTransport();
  const poster: TelemetryPoster = options.poster ?? createTelemetryPoster();
  const onError = options.onError ?? ((): void => undefined);
  // When no local-run delivery sink is wired, a received command must still be
  // OBSERVABLE (AUDIT-20260717-17) — never silently `?.()`-dropped. The default
  // recorder writes a "received but not delivered" line to stderr so the
  // production default path (no injected sink) is loud, not silent.
  const recordUndeliveredCommand =
    options.onUndeliveredCommand ??
    ((command: unknown): void => {
      process.stderr.write(
        `stackctl sidecar: received a plane command with no local-run delivery sink — ` +
          `RECORDED AS UNDELIVERED (not routed to a run): ${JSON.stringify(command)}\n`,
      );
    });

  const location = locateMachineState(options.installationRoot);
  const installationId = mintOrReadInstallationId(options.installationRoot);
  const walDir = join(location.durableDir, 'spool');

  const planeUrl = options.planeUrl ?? process.env.STACKCTL_CP_URL;
  const token = openTokenCustody(location.durableDir).read();
  const uplinkReady = planeUrl !== undefined && planeUrl.length > 0 && token !== undefined;

  // Redact+spool every received `event` frame through the pipeline. The
  // pipeline mints its own eventId+sequences and redacts BEFORE spooling.
  const pipeline: SidecarPipeline = createPipeline(walDir);
  const ingestFrame = async (frame: EventFrame): Promise<void> => {
    const env = frame.event.envelope;
    await pipeline.receive({
      installationId: env.installationId,
      invocationId: env.invocationId,
      runId: env.runId,
      type: env.type,
      classification: env.classification,
    });
  };
  const onFrame: ReceivedFrameHandler = (frame) => {
    if (frame.kind === 'event') {
      // Fire-and-forget: telemetry ingest never blocks the socket read loop and
      // never crashes the sidecar (C1/SC-001). The WAL is the durable buffer;
      // the drain loop transmits from it independently.
      void ingestFrame(frame).catch((error: unknown) => onError(error));
    }
    // `register-run` / `end-invocation` are received but not yet routed to a
    // local run's command delivery — the command→local-run fan-in is a larger
    // tracked concern (TASK-461). Until it lands, a plane command with no
    // `onCommand` sink is recorded as UNDELIVERED (see the SSE handler), never
    // silently dropped (AUDIT-20260717-17).
  };

  // --- background state (populated only on a won election) -------------------
  let stopped = false;
  let electedServer: SidecarServer | undefined;
  let drainWal: WalHandle | undefined;
  let sseClient: ReconnectingSseClientHandle | undefined;
  let drainTimer: NodeJS.Timeout | undefined;
  let livenessTimer: NodeJS.Timeout | undefined;

  const bearerHeaders: Readonly<Record<string, string>> = { authorization: `Bearer ${token ?? ''}` };
  const ingestUrl = `${planeUrl ?? ''}/v1/ingest`;
  const streamUrl = `${planeUrl ?? ''}/v1/sidecar/stream`;
  const livenessUrl = `${planeUrl ?? ''}/v1/sidecar/liveness`;

  // --- drain loop: replay WAL, POST new records to the plane (at-least-once) -
  const backoff = new BackoffSchedule({
    baseMs: DRAIN_BACKOFF_BASE_MS,
    capMs: DRAIN_BACKOFF_CAP_MS,
    jitter: Math.random,
    healthyResetMs: DRAIN_BACKOFF_HEALTHY_RESET_MS,
  });
  let drainCursor = 0; // highest WAL sequence transmitted (in-process; at-least-once on restart)
  let draining = false;
  let nextDrainAllowedMs = 0;

  const drainTick = async (): Promise<void> => {
    if (stopped || draining || drainWal === undefined) return;
    if (clock.monotonicNowMs() < nextDrainAllowedMs) return;
    draining = true;
    let failed = false;
    try {
      const records = await drainWal.replay();
      for (const record of records) {
        if (stopped) break;
        if (record.sequence <= drainCursor) continue;
        let status: number;
        try {
          const result = await poster.post({ url: ingestUrl, headers: bearerHeaders, body: record.payload });
          status = result.status;
        } catch (error) {
          onError(error);
          failed = true;
          break;
        }
        if (status >= 200 && status < 300) {
          drainCursor = record.sequence;
        } else {
          // A non-2xx (e.g. 401/400) is a transient-from-here failure: leave the
          // cursor, back off, retry next pass. Never advance past an unaccepted
          // record (at-least-once, never at-most-once).
          failed = true;
          break;
        }
      }
    } catch (error) {
      onError(error);
      failed = true;
    } finally {
      draining = false;
    }
    if (failed) {
      nextDrainAllowedMs = clock.monotonicNowMs() + backoff.nextDelayMs();
    } else {
      backoff.markHealthy(clock.monotonicNowMs());
    }
  };

  // --- session liveness: § C3 heartbeat POSTed to /v1/sidecar/liveness -------
  const livenessScheduler = createSessionLivenessScheduler({
    clock,
    intervalMs: livenessIntervalMs,
    installationId,
    send: (signal: SessionLivenessSignal): void => {
      void poster
        .post({ url: livenessUrl, headers: bearerHeaders, body: JSON.stringify(signal) })
        .catch((error: unknown) => onError(error));
    },
  });

  const startUplink = async (): Promise<void> => {
    // A dedicated read-only WAL handle over the same spool dir the pipeline
    // writes to (replay() reads fresh from disk — safe alongside the pipeline's
    // append handle).
    drainWal = await openWal(walDir);

    drainTimer = setInterval(() => {
      void drainTick();
    }, drainIntervalMs);
    drainTimer.unref();

    // Fire an immediate baseline heartbeat, then on cadence.
    livenessScheduler.checkAndEmit();
    livenessTimer = setInterval(() => {
      livenessScheduler.checkAndEmit();
    }, livenessIntervalMs);
    livenessTimer.unref();

    // Consume the plane's command stream (§ C1/C7). Command `data:` frames
    // surface as events (`event: command`); keepalive comments never do.
    sseClient = runReconnectingSseClient({
      transport,
      clock,
      url: streamUrl,
      headers: bearerHeaders,
      onEvent: (e) => {
        if (e.event !== 'command') return;
        let command: unknown;
        try {
          command = JSON.parse(e.data);
        } catch (error) {
          // A malformed command frame is a non-fatal background error.
          onError(error);
          return;
        }
        // Deliver to the local-run sink when one is wired; otherwise the
        // command cannot reach a run — record it OBSERVABLY as undelivered
        // rather than silently dropping it (AUDIT-20260717-17).
        if (options.onCommand !== undefined) {
          options.onCommand(command);
        } else {
          recordUndeliveredCommand(command);
        }
      },
    });
  };

  const started: Promise<SidecarDaemonStart> = (async (): Promise<SidecarDaemonStart> => {
    const outcome = await electSidecarForInstallation(options.installationRoot, onFrame);
    if (outcome.kind !== 'won') {
      return { kind: 'lost', reason: outcome.reason };
    }
    // Record the server BEFORE the stop-race check so a concurrent stop() (which
    // awaits `started`) can always close it.
    electedServer = outcome.server;
    if (stopped) {
      return { kind: 'won', socketPath: outcome.socketPath };
    }
    if (uplinkReady) {
      await startUplink();
    }
    return { kind: 'won', socketPath: outcome.socketPath };
  })();

  const stop = async (): Promise<void> => {
    stopped = true;
    // Ensure the election has settled so everything it wired is visible here.
    await started.catch(() => undefined);
    if (drainTimer !== undefined) {
      clearInterval(drainTimer);
      drainTimer = undefined;
    }
    if (livenessTimer !== undefined) {
      clearInterval(livenessTimer);
      livenessTimer = undefined;
    }
    sseClient?.stop();
    sseClient = undefined;
    if (drainWal !== undefined) {
      await drainWal.close();
      drainWal = undefined;
    }
    if (electedServer !== undefined) {
      await electedServer.close();
      electedServer = undefined;
    }
  };

  return { started, stop };
}
