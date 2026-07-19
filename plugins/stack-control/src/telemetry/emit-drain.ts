/**
 * specs/037-instance-observability — the SHARED bounded deliver-or-budget wait
 * every CLI-verb emit helper (invocation / session / phase) uses so a buffered
 * telemetry event reliably reaches the local sidecar when it is up, WITHOUT ever
 * hanging or measurably slowing the verb when the sidecar is down/stalled/absent.
 *
 * WHY THIS IS ONE HELPER (DRY): the three CLI-verb emit helpers each create their
 * OWN short-lived emit client (a per-invocation `long-run` client, not the
 * dispatcher's), `emit()` a bounded set of events, and then need the SAME guarantee
 * — give the eager UDS connect a small bounded window to complete + drain before
 * `close()` flushes — with the SAME fail-open + non-hanging discipline. Factoring
 * it here means the invariant lives in one place; T046 (invocation-telemetry.ts, the
 * originating pattern) and the 037 D-E fix (phase-entered.ts / session-events.ts)
 * all import it rather than restating the poll loop three times.
 *
 * FAIL-OPEN + NON-HANGING BY CONSTRUCTION (spec § "The constraint that dominates
 * every other"): every exit path of `awaitDeliveredOrBudget` is either an immediate
 * condition (delivered / unavailable / closed) or the hard `budgetMs` ceiling.
 * Nothing here waits on a peer reply, so a connected-but-stalled peer resolves the
 * instant the buffer drains — the 036 fail-open-hang contract is preserved. A
 * down/absent sidecar fires `error` on the next tick (state → 'unavailable') and
 * returns with NO wait. Never throws.
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports under
 * node16 resolution (no `@/` alias configured for this plugin).
 */

import type { EmitClient } from './emit.js';

/**
 * The SMALL BOUNDED window a CLI-verb emit helper gives the eager connect to
 * complete + drain a held event before `close()`. A local UDS connect to a live
 * sidecar is single-digit ms, so the common healthy case exits the wait the
 * instant the event is delivered — adding only the real connect time, NOT this
 * whole budget. The budget bites ONLY as a hard ceiling for a pathological socket
 * that neither connects nor errors. Sized in the "tens of ms" band the design
 * mandates — generous headroom (~10x) over a real connect, small enough that a
 * worst-case wait is imperceptible and can never hang. (This is the value T046
 * introduced as `INVOCATION_EMIT_DRAIN_BUDGET_MS`; single-sourced here.)
 */
export const EMIT_DRAIN_BUDGET_MS = 50;

/** Poll interval for the bounded drain-wait. `setTimeout` is ref'd (NOT unref'd)
 * so the event loop stays alive through the brief wait — otherwise a process whose
 * only live handle is this timer could exit before the eager connect completes,
 * dropping the very event the wait exists to deliver. Short-lived: cleared by the
 * wait resolving within the budget, after which nothing here keeps the CLI alive. */
const DRAIN_POLL_INTERVAL_MS = 2;

/**
 * Resolve as soon as the emit client has DELIVERED its held event (connected AND
 * its long-run buffer drained to empty), OR the socket is found unavailable
 * (down/absent sidecar — no point waiting), OR the client is closed, OR the
 * bounded budget elapses. Non-hanging by construction; never throws.
 */
export async function awaitDeliveredOrBudget(client: EmitClient, budgetMs: number): Promise<void> {
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
