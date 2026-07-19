/**
 * specs/036-fleet-control-plane — pure HTTP request/response + body-parsing
 * helpers factored out of `src/plane/runtime.ts` (which crossed the 300-500
 * line file cap once the AUDIT-20260717-13/-14/-15/-16 wiring landed). These
 * are stateless: `node:http` marshalling, path-param extraction, command/body
 * validation, and run-owner resolution. The runtime module owns the wiring and
 * closure state; this module owns the reusable, side-effect-light plumbing.
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
 * under node16 resolution (no `@/` alias — this plugin has none). Real
 * `node:http` — never a mocked transport.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RouteContext } from './http/server.js';
import type { CommandKind } from '../fleet/command.js';
import { buildRegistry, type ClassifiedEvent, type FleetEntry } from './registry.js';
import { computeFleetDeltas, type FleetDelta } from './http/api.js';
import { FUTURE_SKEW_TOLERANCE_MS } from '../fleet/liveness-constants.js';

/** Write a JSON body with an explicit status. */
export function respondJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Read and JSON-parse a request body, resolving `undefined` for an empty
 * body and rejecting (never silently accepting) a malformed payload. */
export function readJsonBody(req: IncomingMessage): Promise<unknown> {
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
 * invokes a handler after a positive regex match, so a `:name` segment always
 * resolved — this guard turns `noUncheckedIndexedAccess`'s `string | undefined`
 * into the `string` the route already promises, failing loud (never a silent
 * empty) if the invariant were ever violated. */
export function requireParam(ctx: RouteContext, name: string): string {
  const value = ctx.params[name];
  if (value === undefined) {
    throw new Error(`plane runtime: route matched but path param ${JSON.stringify(name)} is missing.`);
  }
  return value;
}

/**
 * Resolve the installation that owns `runId` from the live registry, or
 * `undefined` if the plane has never observed that run. The archived history
 * object key is per-installation (`runs/{installationId}/{runId}/summary.json`),
 * so history/timings resolve the owner here rather than trusting the caller
 * (AUDIT-20260717-13/-15).
 */
export function installationIdForRun(events: ClassifiedEvent[], runId: string): string | undefined {
  const entry = buildRegistry(events).entries().find((candidate) => candidate.runId === runId);
  return entry?.installationId;
}

/** Validate a command-issue body carries a recognized `kind`. */
export function parseCommandKind(body: unknown): CommandKind {
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

/** Validate a fleet-command body carries a `targets` array of installation ids. */
export function parseTargets(body: unknown): string[] {
  if (!isRecord(body)) {
    throw new Error('fleet command body must be a JSON object.');
  }
  const { targets } = body;
  if (!Array.isArray(targets) || targets.some((t) => typeof t !== 'string')) {
    throw new Error('fleet command "targets" must be an array of installation-id strings.');
  }
  return targets.filter((t): t is string => typeof t === 'string');
}

/**
 * The result of computing one fleet-stream SSE tick. `next` is the fresh
 * registry snapshot to carry forward; `deltas` is what changed since
 * `previous`. `error`, when present, means `buildRegistry` threw for this tick
 * (e.g. a poison event whose `type` `requireRunStatus` rejects) — the caller
 * skips the tick and keeps serving, never crashing.
 */
export interface FleetTickResult {
  readonly next: readonly FleetEntry[];
  readonly deltas: readonly FleetDelta[];
  readonly error?: unknown;
}

/**
 * Compute one fleet-stream tick, GUARDED (AUDIT-20260718-04). `buildRegistry`
 * hard-throws (`requireRunStatus`) for any run-scoped event whose `type` is not
 * a known lifecycle key. In the fleet-stream handler that computation runs
 * inside a bare `setInterval` callback: an uncaught throw there is an uncaught
 * exception that by default TERMINATES the Node process — taking down every
 * consumer and sidecar route, not just the one stream. Because the shared,
 * append-only `events` array is re-folded on every tick for every connected
 * client, a single anomalous event would poison every subsequent tick. This
 * wrapper contains the blast radius: on error it preserves `previous` and
 * returns the error for the caller to log-and-skip, so a bad event can never
 * crash the plane.
 */
export function computeFleetTickGuarded(
  events: ClassifiedEvent[],
  previous: readonly FleetEntry[],
): FleetTickResult {
  try {
    const next = buildRegistry(events).entries();
    return { next, deltas: computeFleetDeltas(previous, next) };
  } catch (error) {
    return { next: previous, deltas: [], error };
  }
}

/** A validated session-liveness heartbeat body (C3). Carries the instance
 * identity (`host`/`path`, D8) the plane keys liveness by — NOT installationId
 * alone (a copied checkout shares the UUID, AUDIT-20260719-21). */
export interface SessionLivenessHeartbeat {
  readonly kind: 'session-liveness';
  readonly installationId: string;
  readonly host: string;
  readonly path: string;
  readonly emittedAt: string;
}

/** Validate a session-liveness heartbeat body (C3), narrowing `body` to
 * {@link SessionLivenessHeartbeat} so the caller can enforce the claimed
 * `installationId` against the authenticated one (AUDIT-20260718-45) AND key the
 * live record by the instance's own `host:path` (AUDIT-20260719-21). A body
 * missing `host`/`path` is a client error (fail-loud 400), consistent with the
 * existing shape check — the sidecar and plane ship in lockstep, so every live
 * producer sends them (clean break, no dual-read shim). */
export function assertSessionLiveness(body: unknown): asserts body is SessionLivenessHeartbeat {
  if (
    !isRecord(body) ||
    body.kind !== 'session-liveness' ||
    typeof body.installationId !== 'string' ||
    typeof body.host !== 'string' ||
    typeof body.path !== 'string' ||
    typeof body.emittedAt !== 'string'
  ) {
    throw new Error(
      'session-liveness heartbeat must carry { kind: "session-liveness", installationId, host, path, emittedAt }.',
    );
  }
}

/**
 * Reject an implausible heartbeat `emittedAt` at the HTTP boundary
 * (AUDIT-20260719-10) — throwing so the caller 400s it (a malformed body is a
 * client error, consistent with the existing shape-error 400s):
 *
 *  - UNPARSEABLE (`Date.parse` -> `NaN`): a garbage timestamp cannot be a heartbeat.
 *  - FUTURE beyond `FUTURE_SKEW_TOLERANCE_MS`: a clock-skewed or malicious sidecar
 *    sending `emittedAt` in the far future must not be recorded — otherwise the
 *    recency check `now - emittedAt` stays within-window and pins the instance
 *    `live`/`attached` until the plane restarts.
 *
 * Time-relative, so `now` is injected (never read internally) — keeps it a pure,
 * deterministically-testable check. This is the fail-loud boundary arm; the store
 * and liveness derivation are ALSO defensive (belt-and-suspenders) so a bad value
 * can never poison liveness even if it slips past here.
 */
export function assertPlausibleHeartbeatInstant(emittedAt: string, now: number): void {
  const ms = Date.parse(emittedAt);
  if (Number.isNaN(ms)) {
    throw new Error(
      `session-liveness "emittedAt" must be a parseable ISO timestamp; got ${JSON.stringify(emittedAt)}.`,
    );
  }
  if (ms > now + FUTURE_SKEW_TOLERANCE_MS) {
    throw new Error(
      'session-liveness "emittedAt" is implausibly far in the future (beyond clock-skew tolerance); refusing to record it.',
    );
  }
}

/**
 * Refuse a sidecar-facing request 403 when the body-claimed installation
 * differs from the token's authenticated one (AUDIT-20260718-45), returning
 * `true` (response written). Returns `false` (no response) when they match, so
 * the caller proceeds. `surface` names the offending body field for the
 * operator-facing detail. Enforced at the HTTP boundary so a per-installation
 * bearer can only act for ITS OWN installation — never a caller-claimed id.
 */
export function refuseInstallationMismatch(
  res: ServerResponse,
  claimed: string,
  authed: string,
  surface: string,
): boolean {
  if (claimed === authed) {
    return false;
  }
  respondJson(res, 403, {
    error: 'forbidden',
    reason: 'installation-mismatch',
    detail: `${surface} does not match the authenticated installation; a token may only act for its own installation.`,
  });
  return true;
}

/**
 * Extract the caller-claimed `installationId` from an ingest event body, or
 * `undefined` when the body does not carry one as a string in the expected
 * `{ envelope: { installationId } }` shape. The runtime enforces this equals
 * the token's authenticated installation BEFORE ingest (AUDIT-20260718-45):
 * a mismatch is refused 403 so installation A's token cannot POST telemetry
 * claiming to be installation B. A body with no claimed id (`undefined`) is
 * left to `ingestEvent`'s envelope validation, which rejects it 400 —
 * preserving the malformed-body-is-a-client-error posture (AUDIT-20260718-26).
 */
export function ingestClaimedInstallationId(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const { envelope } = body;
  if (!isRecord(envelope)) {
    return undefined;
  }
  const { installationId } = envelope;
  return typeof installationId === 'string' ? installationId : undefined;
}

/**
 * Refuse a sidecar-facing request 403 when the body-claimed instance identity
 * (`host:path`, D8) differs from the token's authorized one — the token→
 * `host:path` check that runs ALONGSIDE {@link refuseInstallationMismatch}'s
 * installationId (UUID) check, never replacing it (specs/037 § Instance
 * Identity, D8). Returns `true` (response written) on a mismatch, `false`
 * (no response) when they match so the caller proceeds. Same status/shape as
 * the installationId mismatch — a distinct `reason` names the offending axis
 * so an operator can tell a host:path spoof from an installationId spoof.
 */
export function refuseInstanceMismatch(
  res: ServerResponse,
  claimed: string,
  authed: string,
  surface: string,
): boolean {
  if (claimed === authed) {
    return false;
  }
  respondJson(res, 403, {
    error: 'forbidden',
    reason: 'instance-mismatch',
    detail: `${surface} does not match the authenticated instance (host:path); a token may only act for its own instance.`,
  });
  return true;
}

/**
 * Extract the caller-claimed instance identity `${host}:${path}` (D8) from an
 * ingest event body, or `undefined` when the body does not carry both `host`
 * and `path` as strings in the expected `{ envelope: { host, path } }` shape.
 * The runtime enforces this equals the token's authorized instance BEFORE
 * ingest (specs/037 T038) — so installation A's token, authorized for instance
 * A, cannot POST telemetry claiming instance B's `host:path`. A body missing a
 * claimed instance (`undefined`) is left to `ingestEvent`'s envelope
 * validation, which rejects it 400 — malformed-body stays a client error
 * (AUDIT-20260718-26), never a spoof.
 */
export function ingestClaimedInstance(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const { envelope } = body;
  if (!isRecord(envelope)) {
    return undefined;
  }
  const { host, path } = envelope;
  if (typeof host !== 'string' || typeof path !== 'string') {
    return undefined;
  }
  return `${host}:${path}`;
}
