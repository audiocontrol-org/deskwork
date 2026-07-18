/**
 * specs/036-fleet-control-plane — the telemetry-emit wrapper the CLI dispatcher
 * runs for EVERY `stackctl` invocation (extracted from `src/cli.ts`'s inline
 * emit block so it is unit-testable WITHOUT importing `cli.ts`, which runs
 * `main()` on module load).
 *
 * This module owns two audit fixes:
 *
 *   AUDIT-20260717-08 — handler failure must NOT skip emission or leak the
 *     socket. `await handler(args)` runs inside a try/finally so the
 *     `invocation.completed` event still fires (FR-012 — "every invocation
 *     emits") AND the emit client is closed regardless of whether the handler
 *     threw. The original error + exit behavior is preserved: the handler's
 *     throw is re-thrown AFTER the finally, so `main().catch` still maps it to
 *     exit 1 unchanged. A failing invocation is precisely the one a fleet
 *     monitor most wants to see — the old ordering made telemetry disappear
 *     exactly then.
 *
 *   AUDIT-20260717-07 — the `installationSequence` is drawn from the ATOMIC
 *     `reserveNextSequence` primitive, never the racy
 *     `advanceHighWaterMark(location, readHighWaterMark(location) + 1)`
 *     read-then-write that let two concurrent invocations emit the same value.
 *
 * FAIL-OPEN DOMINATES (spec § "The constraint that dominates every other"):
 * nothing about telemetry — socket resolution, identity minting, sequence
 * reservation, envelope construction, or emission — may perturb the verb's
 * contract (output, exit code, wall-clock). Every telemetry step is wrapped so
 * a throw is swallowed; only the HANDLER's own error propagates.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution (no `@/` alias configured).
 */

import { createEmitClient, resolveLocalSocketPath, type EmitClient } from './emit.js';
import { constructEnvelope, type TelemetryEvent } from '../fleet/event.js';
import { classifyEvent } from '../fleet/classification.js';
import { mintUuidV7 } from '../fleet/types.js';
import { SystemClock, type Clock } from '../fleet/clock.js';
import { mintOrReadInstallationId } from '../machine-state/identity.js';
import { locateMachineState } from '../machine-state/locate.js';
import { reserveNextSequence } from '../machine-state/highwater.js';

/** One dispatched subcommand handler. Mirrors `cli.ts`'s `Subcommand`. */
export type Handler = (args: string[]) => Promise<void>;

/**
 * Test/override seams. Defaults reproduce the production hot path exactly:
 * `installationRoot` = `process.cwd()`, a real `SystemClock`, the store's
 * resolved local socket, and the real `createEmitClient`. Tests inject a live
 * peer socket + capture the client to assert on emission/closure without a
 * subprocess.
 */
export interface InvocationTelemetryOptions {
  /** Installation root — the store key + emit target derive from it. */
  readonly installationRoot?: string;
  /** Pre-resolved local socket path (skips `resolveLocalSocketPath`). */
  readonly socketPath?: string;
  /** Injected clock (default `SystemClock`). */
  readonly clock?: Clock;
  /** Injected emit-client factory (default the real `createEmitClient`). */
  readonly createEmit?: typeof createEmitClient;
}

/**
 * Run `handler(args)` and emit exactly one `invocation.completed` telemetry
 * event for the invocation, closing the emit client afterward — whether or not
 * the handler threw. Re-throws the handler's original error unchanged so the
 * caller's exit behavior is preserved (AUDIT-20260717-08).
 */
export async function runInvocationWithTelemetry(
  handler: Handler,
  args: string[],
  options: InvocationTelemetryOptions = {},
): Promise<void> {
  const clock = options.clock ?? new SystemClock();
  const originMonotonicMs = clock.monotonicNowMs();
  const invocationId = mintUuidV7();
  const installationRoot = options.installationRoot ?? process.cwd();
  const createEmit = options.createEmit ?? createEmitClient;

  // Create the emit client up front (fail-open — a resolution failure never
  // touches the invocation), so a live sidecar is usually reachable by the time
  // the event fires after the handler.
  let emitClient: EmitClient | undefined;
  try {
    const socketPath = options.socketPath ?? resolveLocalSocketPath(installationRoot);
    emitClient = createEmit({ socketPath, callerKind: 'short-verb' });
  } catch {
    // Failed to resolve/create — fail-open, continue without emit.
  }

  let handlerError: unknown;
  let handlerThrew = false;
  try {
    await handler(args);
  } catch (err) {
    handlerThrew = true;
    handlerError = err;
  } finally {
    // FR-012: emit an invocation.completed event even when the handler threw —
    // and ALWAYS close the emit client (AUDIT-20260717-08: the old ordering
    // skipped both on a throw and leaked the socket).
    if (emitClient !== undefined) {
      try {
        const installationId = mintOrReadInstallationId(installationRoot);
        const location = locateMachineState(installationRoot);
        // AUDIT-20260717-07: atomic reservation — never the racy read-then-write.
        const installationSequence = reserveNextSequence(location);
        const event: TelemetryEvent = {
          envelope: constructEnvelope(clock, originMonotonicMs, {
            installationId,
            invocationId,
            runId: null, // short verbs are never commandable runs (FR-013)
            installationSequence,
            invocationSequence: 0, // sole event of this invocation
            schemaVersion: 1,
            type: 'invocation.completed',
            classification: classifyEvent('invocation.completed'),
          }),
          // Carry a success/failure signal so a fleet monitor can distinguish a
          // clean invocation from a failing one (AUDIT-20260717-08).
          snapshot: { outcome: handlerThrew ? 'error' : 'ok' },
        };
        emitClient.emit(event);
      } catch {
        // Fail-open: nothing about event construction/emission can surface.
      } finally {
        emitClient.close();
      }
    }
  }

  // Preserve the original error + exit code: re-throw AFTER telemetry ran.
  if (handlerThrew) {
    throw handlerError;
  }
}
