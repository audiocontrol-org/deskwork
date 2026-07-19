/**
 * specs/036-fleet-control-plane — T116, contracts/sidecar-plane-protocol.md
 * § C3 "Two heartbeats, unrelated, both required" (FR-022/023/024).
 *
 * THREE liveness-adjacent signals exist in this feature. This module is
 * exactly one of them, and it MUST NOT be confused with — or made to stand
 * in for — either of the others:
 *
 *   1. Transport keepalive (plane → sidecar, SSE **comment frames**, T115,
 *      src/sidecar/uplink/sse-client.ts) — proves NOTHING about process
 *      health. It exists solely so idle-connection-killing intermediaries
 *      (ALB/nginx/Cloudflare) don't sever a quiet stream. Fixed 15s cadence.
 *
 *   2. Session liveness (sidecar → plane, THIS module) — proves the
 *      sidecar AND its host are alive and reachable. Cadence is an
 *      injected interval (pinned at task time by the caller), NOT hardcoded
 *      to the transport keepalive's 15s.
 *
 *   3. Run liveness (the local socket — local-socket-protocol.md § C5,
 *      OUT OF SCOPE here) — the ONLY signal that answers "is this
 *      particular run alive". Per § C3, "Run liveness needs neither" of the
 *      other two heartbeats.
 *
 * The trap this module exists to avoid: collapsing these into one signal,
 * or letting session liveness (an installation/host-reachability fact)
 * stand in for run liveness (a per-run execution fact). Concretely, that
 * means `SessionLivenessSignal` below carries NO `runId`, NO
 * `executionStatus`, NO `connectionStatus`/`livenessStatus` (the
 * `StatusAxes` vocabulary, ../fleet/status.js) — it is structurally
 * incapable of being read as a run-liveness or execution-status claim.
 *
 * DECOUPLING FROM THE TELEMETRY DISPATCHER (deliberate, per task guidance):
 * this module does NOT import ./uplink/post.js (`TelemetryPoster`, T114/a
 * concurrent task). Transmission is an injected `send` function — a plain
 * single-argument callback, not a `TelemetryPoster`-shaped seam — so this
 * module has no hard dependency on the HTTP POST dispatcher's shape,
 * lifecycle, or task sequencing. A caller wires `send` to
 * `TelemetryPoster.post(...)` (framing the signal into a POST body) once
 * both pieces exist; until then, this module is independently unit-testable
 * with a bare in-memory closure.
 *
 * SCHEDULING: `checkAndEmit()` is a pure function of "how much monotonic
 * time has elapsed since the last emission" (../fleet/clock.js's
 * `monotonicNowMs()`, PT-013) — it takes no clock reading itself as an
 * argument and drives no timer. A production caller invokes it from a real
 * `setInterval`/loop; a test invokes it directly after advancing a fake
 * Clock. Either way, the decision of "is a heartbeat due" never depends on
 * how the caller chooses to invoke it, only on elapsed monotonic time.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI).
 */

import type { Clock } from '../fleet/clock.js';

/**
 * The session-liveness wire signal: sidecar → plane, proving only that the
 * sidecar and its host are alive and reachable. Deliberately carries NO
 * run/execution-status field (see the module doc comment) — this is an
 * installation/host-reachability fact, never a run-liveness claim.
 */
export interface SessionLivenessSignal {
  readonly kind: 'session-liveness';
  readonly installationId: string;
  /**
   * The instance identity this heartbeat marks live (`host` + `path`, D8,
   * AUDIT-20260719-21). The plane keys liveness by `host:path`, NOT by
   * `installationId` alone: `installationId` is a UUID a COPIED checkout carries
   * verbatim, so it cannot distinguish two observed instances that share it (a
   * copied/moved checkout — the exact reason 037 keys the instance by `host:path`).
   * Keying the heartbeat by installationId would mark a stale copy `attached`/`live`
   * off the original's beat. The sidecar knows its own `host`/`path` because it
   * serves exactly ONE installation. This is instance IDENTITY, never a
   * run/execution-status field — it names WHICH host is alive, nothing about a run.
   */
  readonly host: string;
  readonly path: string;
  /** Wall-clock ISO-8601 timestamp (PT-013: descriptive only, never
   * authoritative for ordering — `invocationSequence`/`installationSequence`
   * own ordering elsewhere in the protocol). */
  readonly emittedAt: string;
}

/** Constructor options for `createSessionLivenessScheduler`. */
export interface SessionLivenessSchedulerOptions {
  /** Injected time source (../fleet/clock.js) — a `SystemClock` in
   * production, a hand-advanced fake in tests. Never a real wall-clock
   * sleep is required to exercise this module. */
  readonly clock: Clock;
  /** The cadence, in milliseconds, at which a heartbeat is due. Pinned by
   * the caller at task time — this module has no hardcoded default,
   * deliberately distinct from the transport keepalive's fixed 15s
   * (§ C3: the two cadences are independent constants). */
  readonly intervalMs: number;
  /** The installation this heartbeat identifies (data-model.md:
   * `installationId`, UUIDv4). */
  readonly installationId: string;
  /** The instance identity (`host:path`, D8) the plane keys liveness by — see
   * {@link SessionLivenessSignal}. Sourced from `deriveInstanceId(installationRoot)`
   * at the caller, so it is the SAME identity the event envelope carries. */
  readonly host: string;
  readonly path: string;
  /** The injected transmission seam. A plain single-argument function —
   * NOT a `TelemetryPoster` (see module doc comment on decoupling). May
   * return void or a Promise; this module does not await it, matching the
   * "fire the heartbeat, don't block scheduling on delivery" shape a
   * best-effort liveness ping wants. */
  readonly send: (signal: SessionLivenessSignal) => void | Promise<void>;
}

/** The scheduling seam this module exposes. */
export interface SessionLivenessScheduler {
  /**
   * Check whether `intervalMs` has elapsed since the last emission (or,
   * for the very first call, emit immediately to establish the baseline)
   * and, if due, call `send` with a fresh `SessionLivenessSignal`. Pure
   * with respect to time: it reads `clock.monotonicNowMs()` exactly once
   * per call and compares against the last-emitted reading — no timer, no
   * TTL bookkeeping beyond that single comparison.
   */
  checkAndEmit(): void;
}

/**
 * Construct a `SessionLivenessScheduler`. See the module doc comment for
 * why this is a distinct heartbeat from both the transport keepalive
 * (T115) and run liveness (the local socket, out of scope here).
 */
export function createSessionLivenessScheduler(
  opts: SessionLivenessSchedulerOptions,
): SessionLivenessScheduler {
  let lastEmittedMonotonicMs: number | null = null;

  return {
    checkAndEmit(): void {
      const nowMonotonicMs = opts.clock.monotonicNowMs();
      const due =
        lastEmittedMonotonicMs === null ||
        nowMonotonicMs - lastEmittedMonotonicMs >= opts.intervalMs;
      if (!due) {
        return;
      }
      lastEmittedMonotonicMs = nowMonotonicMs;
      void opts.send({
        kind: 'session-liveness',
        installationId: opts.installationId,
        host: opts.host,
        path: opts.path,
        emittedAt: opts.clock.nowIso(),
      });
    },
  };
}
