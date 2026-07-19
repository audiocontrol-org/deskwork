// specs/037-instance-observability — T031 [US3] (impl), pairs with T030's RED
// test (tests/instance/phase-emit.test.ts).
//
// THE ONE INSTRUMENTATION SEAM for the design→spec→execute→govern timeline (D4;
// contracts/telemetry-events.md § phase.entered): a COMMITTED workflow phase
// transition emits a single `phase.entered` telemetry event carrying the bounded
// snapshot `{ phase, from, item }`. `currentBearing` is DERIVED downstream as
// `{ phase, item }` (analyze L2), so this seam carries NO separate bearing/compass
// field and does NOT resolve the compass here.
//
// FAIL-OPEN DOMINATES (SC-005, reused from 036): nothing about telemetry —
// socket resolution, identity/sequence minting, session read, envelope
// construction, or emission — may fail, throw from, block, or perturb the real
// phase advance. Every step runs inside one swallowing try/catch.
//
// THE SYNCHRONOUS-CONNECT-GAP DETAIL + THE D-E DELIVERY FIX (FR-027 dogfood
// Scenario 3): `emitAdvance` fires this AFTER the transition already committed, and
// the socket has NOT connected at emit-time. The `long-run` buffer HOLDS the event
// across the connect gap and DRAINS it on the `connect` event (emit.ts § onConnect).
// D-E fix: this helper is now ASYNC and, after `emit()`, gives the eager connect a
// SMALL BOUNDED window (`EMIT_DRAIN_BUDGET_MS`) to complete + drain, then closes the
// client — mirroring the proven invocation.completed path (T046). Before this fix it
// returned WITHOUT waiting and relied on the process staying alive; a real
// `stackctl workflow advance --apply` CLI then EXITED before the separate client's
// UDS connect completed, ABANDONING the buffered phase.entered (it reached the
// sidecar in-session but never from the real exiting CLI). The bounded wait makes
// delivery reliable when the sidecar is up while staying strictly FAIL-OPEN +
// NON-HANGING: a down/absent sidecar returns instantly (state 'unavailable', no
// wait), a stalled peer never blocks (delivery never waits on a peer ack), and the
// budget is a hard ceiling so a pathological socket can never hang the advance.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative `.js`
// imports under node16 resolution (no `@/` alias configured for this plugin).

import { createEmitClient, resolveLocalSocketPath, type EmitClient } from './emit.js';
import { EMIT_DRAIN_BUDGET_MS, awaitDeliveredOrBudget } from './emit-drain.js';
import { constructEnvelope, type TelemetryEvent } from '../fleet/event.js';
import { classifyEvent } from '../fleet/classification.js';
import { mintUuidV7 } from '../fleet/types.js';
import { SystemClock, type Clock } from '../fleet/clock.js';
import { mintOrReadInstallationId } from '../machine-state/identity.js';
import { locateMachineState } from '../machine-state/locate.js';
import { reserveNextSequence } from '../machine-state/highwater.js';
import { read as readCurrentSession } from '../machine-state/current-session.js';

/** The bounded `phase.entered` snapshot (contracts/telemetry-events.md). */
export interface PhaseEnteredSnapshot {
  /** The phase the transition ENTERED (`t.to`). */
  readonly phase: string;
  /** The phase the transition LEFT (`t.from`). */
  readonly from: string;
  /** The roadmap item identifier the transition advanced. */
  readonly item: string;
}

/**
 * Read the current Claude Code session id for the enclosing installation,
 * FAIL-OPEN — mirrors `invocation-telemetry.ts`'s `readSessionIdFailOpen`.
 * `current-session.read()` throws on a corrupt/unreadable record (Principle V);
 * on the telemetry path that throw must degrade to `null`, never surface.
 */
function readSessionIdFailOpen(): string | null {
  try {
    const record = readCurrentSession();
    return record === null ? null : record.sessionId;
  } catch {
    return null;
  }
}

/**
 * Emit a single fail-open `phase.entered` side event for a COMMITTED workflow
 * advance. Call this ONLY after `applyTransition` returned `committed === true`
 * (never on a dry-run — D4). Any telemetry failure is swallowed so the phase
 * advance is never perturbed.
 *
 * ASYNC (D-E fix): after `emit()` this awaits a SMALL BOUNDED deliver-or-budget
 * window then `close()`s the client, so the event reliably reaches the sidecar
 * before the caller (`emitAdvance`, in turn the CLI) returns — instead of being
 * abandoned when the process exits mid-connect. The whole body is fail-open: any
 * throw/timeout is swallowed here and NEVER surfaces to (or slows past the bounded
 * budget) the already-committed phase advance.
 */
export async function emitPhaseEntered(
  installationRoot: string,
  snapshot: PhaseEnteredSnapshot,
  clock: Clock = new SystemClock(),
): Promise<void> {
  let client: EmitClient | undefined;
  try {
    const socketPath = resolveLocalSocketPath(installationRoot);
    // long-run buffer: holds the event across the synchronous connect gap and
    // drains it on connect (see the module doc's connect-gap section).
    client = createEmitClient({ socketPath, callerKind: 'long-run' });
    const originMonotonicMs = clock.monotonicNowMs();
    const location = locateMachineState(installationRoot);
    const event: TelemetryEvent = {
      envelope: constructEnvelope(
        clock,
        originMonotonicMs,
        {
          installationId: mintOrReadInstallationId(installationRoot),
          invocationId: mintUuidV7(),
          runId: null, // a phase advance is never a commandable run (FR-013)
          installationSequence: reserveNextSequence(location),
          invocationSequence: 0, // sole event of this side emission
          schemaVersion: 2, // specs/037: envelope carries host/path/sessionId
          type: 'phase.entered',
          classification: classifyEvent('phase.entered'),
          sessionId: readSessionIdFailOpen(),
        },
        installationRoot, // host/path derived by construction (FR-011)
      ),
      // The bounded snapshot the instance's `currentBearing` derives from.
      snapshot: { phase: snapshot.phase, from: snapshot.from, item: snapshot.item },
    };
    client.emit(event);
    // D-E: give the eager connect a bounded window to complete + drain the held
    // event before close() flushes it. Fail-open + non-hanging (see emit-drain.js).
    await awaitDeliveredOrBudget(client, EMIT_DRAIN_BUDGET_MS);
  } catch {
    // Fail-open: no telemetry failure may surface to the phase advance (SC-005).
  } finally {
    // Flush any freshly-emitted frame still queued, then tear the socket down.
    // Idempotent; on an absent sidecar the client is already unavailable so this
    // just releases the handle. Never throws (close() is internally guarded).
    client?.close();
  }
}
