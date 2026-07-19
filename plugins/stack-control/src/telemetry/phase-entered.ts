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
// THE SYNCHRONOUS-CONNECT-GAP DETAIL (the load-bearing delivery concern the T030
// author flagged): `emitAdvance` is SYNCHRONOUS, so unlike the invocation-telemetry
// path — which awaits the handler between client construction and emit, giving the
// eager connect time to complete — here the socket has NOT connected at emit-time.
// A `short-verb` (capacity-0) buffer would therefore DROP the event before connect.
// So this uses the `long-run` buffer, whose bounded FIFO HOLDS the event across the
// connect gap and DRAINS it on the `connect` event (emit.ts § onConnect). The client
// is deliberately NOT closed here: `close()` before connect would set the client
// `closed` and discard the still-buffered event, and its socket + timers are already
// `unref()`d (emit.ts), so leaving it open never keeps the CLI alive nor delays exit.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative `.js`
// imports under node16 resolution (no `@/` alias configured for this plugin).

import { createEmitClient, resolveLocalSocketPath } from './emit.js';
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
 */
export function emitPhaseEntered(
  installationRoot: string,
  snapshot: PhaseEnteredSnapshot,
  clock: Clock = new SystemClock(),
): void {
  try {
    const socketPath = resolveLocalSocketPath(installationRoot);
    // long-run buffer: holds the event across the synchronous connect gap and
    // drains it on connect (see the module doc's connect-gap section). NOT closed.
    const client = createEmitClient({ socketPath, callerKind: 'long-run' });
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
  } catch {
    // Fail-open: no telemetry failure may surface to the phase advance (SC-005).
  }
}
