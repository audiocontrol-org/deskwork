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
 * specs/037 D-B (FR-027 dogfood Scenario 1) — a FAST short verb must still create
 *     an instance. The `invocation.completed` emit now uses a `'long-run'` buffer
 *     (not `'short-verb'`) so the event is HELD across the eager-connect gap
 *     instead of dropped (a capacity-0 short-verb buffer drops when the socket is
 *     not yet connected — and for a fast handler it never is by emit-time). After
 *     emit(), a SMALL BOUNDED window (`INVOCATION_EMIT_DRAIN_BUDGET_MS`) lets the
 *     connect complete + drain before close() flushes. This deliberately changes
 *     036's C4 "short verbs don't wait" asymmetry FOR THIS ONE EMIT — bounded so
 *     fail-open is preserved: a down/absent sidecar errors on the next tick (no
 *     wait), a stalled peer never blocks (delivery never waits on a peer ack —
 *     the 036 fail-open-hang contract is intact), and the budget is a hard
 *     ceiling so a pathological socket can never turn the wait into a hang.
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
import { read as readCurrentSession } from '../machine-state/current-session.js';

/**
 * Read the current Claude Code session id for the enclosing installation,
 * FAIL-OPEN. `current-session.read()` throws on a corrupt/unreadable record
 * (Constitution Principle V — it refuses to silently treat a corrupt file as
 * absent); on the telemetry hot path that throw must NOT surface, so it is
 * caught HERE and degraded to `null`. Wrapping the read separately (rather than
 * relying on the outer emit-level catch) is deliberate: a swallowed throw at the
 * envelope-construction level would skip the whole emission, but FR-012 requires
 * the event to fire regardless — best-effort session identity, never a blocker.
 * It is a single small sync read (same shape as the identity read already on
 * this path), so it adds no latency-inducing work.
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
 * The SMALL BOUNDED window `runInvocationWithTelemetry` gives the eager connect
 * to complete + drain the held `invocation.completed` event before close()
 * (specs/037 D-B). A local UDS connect to a live sidecar is single-digit ms, so
 * the common healthy case exits this wait as soon as the event is delivered —
 * adding only the real connect time, NOT this whole budget. The budget bites
 * ONLY as a hard ceiling for a pathological socket that neither connects nor
 * errors; a down/absent sidecar fires `error` on the next tick (state
 * 'unavailable' → no wait), and a connected-but-stalled peer resolves the
 * instant the buffer drains (delivery never waits on a peer ack). Sized in the
 * "tens of ms" band the design mandates — generous headroom (~10x) over a real
 * connect, small enough that a worst-case wait is imperceptible and can never
 * hang. Modeled on the codebase's existing fail-open budgets (emit.ts's
 * `RECONNECT_DELAY_MS` = 25ms; the long-run restart-gap coverage).
 */
export const INVOCATION_EMIT_DRAIN_BUDGET_MS = 50;

/** Poll interval for the bounded drain-wait. Ref'd (NOT unref'd) so the event
 * loop stays alive through the brief wait — otherwise a process whose only live
 * handle is this timer could exit before the eager connect completes, dropping
 * the very event the wait exists to deliver. Short-lived: cleared by the wait
 * resolving within the budget, after which nothing here keeps the CLI alive. */
const DRAIN_POLL_INTERVAL_MS = 2;

/**
 * Resolve as soon as the emit client has DELIVERED its held event (connected AND
 * the long-run buffer drained to empty), OR the socket is found unavailable
 * (down/absent sidecar — no point waiting), OR the client is closed, OR the
 * bounded budget elapses. Non-hanging by construction: every exit path is either
 * an immediate condition or the hard `budgetMs` ceiling; nothing here waits on a
 * peer reply, so a connected-but-stalled peer resolves the instant the buffer
 * drains — the 036 fail-open-hang contract is preserved. Never throws.
 */
async function awaitDeliveredOrBudget(client: EmitClient, budgetMs: number): Promise<void> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    // Delivered: the event was written on connect and the buffer drained.
    if (client.state === 'connected' && client.buffer.size === 0) return;
    // Nothing more to wait for — the sidecar is unreachable (fail-open) or the
    // client is already torn down.
    if (client.state === 'unavailable' || client.state === 'closed') return;
    if (Date.now() >= deadline) return;
    await new Promise<void>((resolve) => setTimeout(resolve, DRAIN_POLL_INTERVAL_MS));
  }
}

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
    // specs/037 D-B: a 'long-run' buffer HOLDS the sole invocation.completed
    // event across the eager-connect gap (a 'short-verb' capacity-0 buffer drops
    // it — for a FAST handler the connect never completes by emit-time). Paired
    // with the bounded drain-wait below, this delivers the event reliably while
    // staying strictly fail-open + non-hanging.
    emitClient = createEmit({ socketPath, callerKind: 'long-run' });
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
          envelope: constructEnvelope(
            clock,
            originMonotonicMs,
            {
              installationId,
              invocationId,
              runId: null, // short verbs are never commandable runs (FR-013)
              installationSequence,
              invocationSequence: 0, // sole event of this invocation
              schemaVersion: 2, // specs/037: envelope now carries host/path/sessionId
              type: 'invocation.completed',
              classification: classifyEvent('invocation.completed'),
              // T019: thread the current Claude Code session id (§ D3),
              // read fail-open — a corrupt/unreadable record degrades to null
              // and NEVER blocks or skips this emission (FR-012).
              sessionId: readSessionIdFailOpen(),
            },
            installationRoot, // host/path derived by construction (FR-011)
          ),
          // Carry a success/failure signal so a fleet monitor can distinguish a
          // clean invocation from a failing one (AUDIT-20260717-08).
          snapshot: { outcome: handlerThrew ? 'error' : 'ok' },
        };
        emitClient.emit(event);
        // specs/037 D-B: give the eager connect a SMALL BOUNDED window to
        // complete + drain the held event before close() flushes it. Fail-open +
        // non-hanging (see awaitDeliveredOrBudget) — a down sidecar returns
        // instantly, a stalled peer never blocks, the budget is a hard ceiling.
        await awaitDeliveredOrBudget(emitClient, INVOCATION_EMIT_DRAIN_BUDGET_MS);
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
