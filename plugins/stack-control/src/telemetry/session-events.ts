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

import { createEmitClient, resolveLocalSocketPath } from './emit.js';
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
 * Emit one `session.*` telemetry event for `installationRoot`, FAIL-OPEN.
 *
 * `sessionId` is threaded onto the envelope (the session this event belongs
 * to — for `session.started` the newly-minted id, for `session.ended` the
 * id being closed, contracts/telemetry-events.md). `snapshot` is the
 * already-shaped, bounded payload the caller builds
 * (`{ sessionId, startedAt }` / `{ sessionId, endedAt, reason }`).
 *
 * Opens its OWN `callerKind: 'long-run'` emit client (a bounded FIFO that
 * HOLDS the event across the brief connect gap rather than dropping it —
 * unlike the dispatcher's `'short-verb'` `invocation.completed` emission)
 * rather than sharing one. Session verbs may emit zero, one, or two of these
 * (the FR-009a supersede case) in addition to that per-invocation event, and
 * each is independently fail-open.
 *
 * THE SYNCHRONOUS-CONNECT-GAP DETAIL (mirrors `phase-entered.ts`): a session
 * event is emitted with no intervening async work, so the eager socket
 * `connect` has NOT completed at `emit()` time. The `long-run` buffer holds
 * the event and DRAINS it on the `connect` event (emit.ts § onConnect). The
 * client is deliberately NOT closed: `close()` before connect would set the
 * client `closed` and discard the still-buffered event (which a fixed connect
 * budget could not reliably beat under load — the flake this replaces), and
 * the socket + reconnect/flush timers are already `unref()`d (emit.ts), so
 * leaving it open never keeps the CLI alive nor delays its exit.
 */
export async function emitSessionEvent(
  installationRoot: string,
  type: SessionEventType,
  sessionId: string,
  snapshot: SnapshotPayload,
): Promise<void> {
  try {
    const socketPath = resolveLocalSocketPath(installationRoot);
    // long-run buffer: holds the event across the synchronous connect gap and
    // drains it on connect (see the module doc). NOT closed — unref()d timers.
    const client = createEmitClient({ socketPath, callerKind: 'long-run', bufferCapacity: 2 });
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
  } catch {
    // Fail-open: nothing about event construction/emission may surface.
  }
}
