/**
 * specs/037-instance-observability — T026 (impl), pairs with T025's RED test
 * (tests/instance/session-verbs.test.ts). contracts/telemetry-events.md
 * § session.started / session.ended; data-model.md D9.
 *
 * A small, FAIL-OPEN helper the `session-start` / `session-end` CLI verbs use
 * to emit their `session.*` lifecycle event on the SAME local-socket path
 * every other emit site uses (`resolveLocalSocketPath` /
 * `locateMachineState`, T024) — mirrors `invocation-telemetry.ts`'s emit
 * shape (envelope construction via `constructEnvelope`, atomic
 * `reserveNextSequence`, `mintOrReadInstallationId`) but is deliberately its
 * own module: session events are emitted ALONGSIDE the dispatcher's
 * `invocation.completed` emission (`cli.ts` -> `runInvocationWithTelemetry`),
 * never in place of it, and this module must not be threaded through or
 * touch that file (concurrent sibling task).
 *
 * FAIL-OPEN DOMINATES (`.claude/rules/session-skills-never-block.md`, spec
 * SC-005): socket resolution, identity minting, sequence reservation,
 * envelope construction, and emission MUST NOT slow, block, or throw into
 * the calling verb. Every step here is wrapped so a throw degrades to a
 * silent no-op; `emitSessionEvent` itself never throws.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution (no `@/` alias configured).
 */

import { createEmitClient, resolveLocalSocketPath, type EmitClient } from './emit.js';
import { constructEnvelope, type SnapshotPayload, type TelemetryEvent } from '../fleet/event.js';
import { classifyEvent } from '../fleet/classification.js';
import { mintUuidV7, type EventType } from '../fleet/types.js';
import { SystemClock } from '../fleet/clock.js';
import { mintOrReadInstallationId } from '../machine-state/identity.js';
import { locateMachineState } from '../machine-state/locate.js';
import { reserveNextSequence } from '../machine-state/highwater.js';

/** The two session-lifecycle event types this module ever emits. */
export type SessionEventType = Extract<EventType, 'session.started' | 'session.ended'>;

/**
 * Bounded budget for how long `emitSessionEvent` gives a LOCAL sidecar to
 * finish connecting before closing the client. This is NOT a wait for
 * delivery confirmation (no `hello-ack` is awaited — see below); it exists
 * only because, unlike `invocation-telemetry.ts` (whose emit happens after
 * the handler ran, so the connection — begun eagerly at client construction
 * — has usually already completed by emit time), a session event has no such
 * intervening work: construction, `emit()`, and `close()` would otherwise
 * all land in the same synchronous tick, well before a same-host UDS
 * `connect` callback fires, so `emit()` would see a not-yet-connected socket
 * and — with a `'short-verb'` buffer — DROP the event on the floor every
 * time (`buffer.ts`'s "None. Drops on a sidecar-unavailable socket."). A
 * TINY bounded poll (same shape as `highwater.ts`'s
 * `LOCK_ACQUIRE_TIMEOUT_MS`/`LOCK_POLL_MS` fail-open budget) closes that gap
 * for the common case (a live local sidecar; same-host UDS connects in low
 * single-digit ms) while still bounding worst-case latency when nothing is
 * listening (`markUnavailable` fires the `error` handler almost immediately,
 * so the no-peer case returns well before the budget is exhausted anyway).
 */
const CONNECT_BUDGET_MS = 150;

/** Poll interval while waiting for the connection (mirrors `LOCK_POLL_MS`). */
const CONNECT_POLL_MS = 3;

/**
 * Resolve once `client.state` is `'connected'`, or once `budgetMs` has
 * elapsed — whichever comes first. Never rejects, never throws.
 */
async function waitForConnectOrBudget(client: EmitClient, budgetMs: number): Promise<void> {
  const start = Date.now();
  while (client.state !== 'connected') {
    if (Date.now() - start >= budgetMs) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, CONNECT_POLL_MS));
  }
}

/**
 * Emit one `session.*` telemetry event for `installationRoot`, FAIL-OPEN.
 *
 * `sessionId` is threaded onto the envelope (the session this event belongs
 * to — for `session.started` the newly-minted id, for `session.ended` the
 * id being closed, contracts/telemetry-events.md). `snapshot` is the
 * already-shaped, bounded payload the caller builds
 * (`{ sessionId, startedAt }` / `{ sessionId, endedAt, reason }`).
 *
 * Opens and closes its OWN short-lived emit client (`callerKind: 'long-run'`
 * with a tiny bound — this emission is retained across the brief connect gap
 * rather than dropped, unlike the dispatcher's `'short-verb'`
 * `invocation.completed` emission) rather than sharing one with it — session
 * verbs may emit zero, one, or two of these (the FR-009a supersede case) in
 * addition to that per-invocation event, and each is independently
 * fail-open. Awaits (with a tiny bound, see `CONNECT_BUDGET_MS`) a live
 * connection before closing so a local sidecar actually receives the event
 * instead of it landing in a buffer that is then torn down unread.
 */
export async function emitSessionEvent(
  installationRoot: string,
  type: SessionEventType,
  sessionId: string,
  snapshot: SnapshotPayload,
): Promise<void> {
  let emitClient: EmitClient | undefined;
  try {
    const socketPath = resolveLocalSocketPath(installationRoot);
    // A tiny bounded 'long-run' buffer (not 'short-verb'): this emission's
    // one event must survive the brief connect gap above rather than drop
    // on the floor the instant `emit()` observes a not-yet-connected socket.
    emitClient = createEmitClient({ socketPath, callerKind: 'long-run', bufferCapacity: 2 });
  } catch {
    // Failed to resolve/create — fail-open, nothing to emit or close.
  }
  if (emitClient === undefined) {
    return;
  }
  const client = emitClient;
  try {
    const clock = new SystemClock();
    const originMonotonicMs = clock.monotonicNowMs();
    const installationId = mintOrReadInstallationId(installationRoot);
    const location = locateMachineState(installationRoot);
    const installationSequence = reserveNextSequence(location);
    const event: TelemetryEvent = {
      envelope: constructEnvelope(
        clock,
        originMonotonicMs,
        {
          installationId,
          invocationId: mintUuidV7(),
          runId: null, // session events are never fleet runs (FR-013 shape)
          installationSequence,
          invocationSequence: 0, // sole event of this emission
          schemaVersion: 2, // envelope carries host/path/sessionId (specs/037)
          type,
          classification: classifyEvent(type),
          sessionId,
        },
        installationRoot, // host/path derived by construction (FR-011)
      ),
      snapshot,
    };
    client.emit(event);
    await waitForConnectOrBudget(client, CONNECT_BUDGET_MS);
  } catch {
    // Fail-open: nothing about event construction/emission may surface.
  } finally {
    try {
      client.close();
    } catch {
      // Fail-open: closing must never surface either.
    }
  }
}
