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
 * condition (delivery CONFIRMED / unavailable / closed) or the hard `budgetMs`
 * ceiling. The wait PREFERS a confirmed delivery within the budget, but it NEVER
 * hangs waiting for one: a connected-but-stalled peer that accepts + drains our
 * buffer yet never sends a compatible `hello-ack` leaves delivery unconfirmed, so
 * the wait rides the bounded budget and returns at the ceiling (best-effort, the
 * fire-and-forget writes already went out) — the 036 fail-open-hang contract is
 * preserved because `budgetMs` is a hard ceiling. A down/absent sidecar fires
 * `error` on the next tick (state → 'unavailable') and returns with NO wait.
 * Never throws.
 *
 * WHY CONFIRMED DELIVERY, NOT AN EMPTY BUFFER (AUDIT-20260719-19): the emit client
 * writes held events to the socket on connect and drains its buffer to empty
 * BEFORE the peer's `hello-ack` confirms a version-compatible peer received them
 * (emit.ts `onConnect` ~260-269 push to `unconfirmed`; a matching ack clears it
 * ~283-298). Resolving on `buffer.size === 0` alone therefore declares "delivered"
 * while the events are still PROVISIONAL — then `close()` runs and, on a protocol
 * mismatch / slow ack / peer-close-before-ack, the requeue/reconnect protection
 * can't help because success was already declared. Since this helper gates
 * `invocation.completed`, `session.*`, and `phase.entered`, that would SILENTLY
 * DROP the very events instances/sessions/bearings are built from. So the wait
 * keys on the client's `deliveryConfirmed` signal (connected AND buffer empty AND
 * nothing unconfirmed), preferring the ack within the budget.
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
 * Resolve as soon as the emit client has CONFIRMED delivery of its held events
 * (`deliveryConfirmed` — connected, buffer drained empty, AND a matching
 * `hello-ack` cleared the unconfirmed set), OR the socket is found unavailable
 * (down/absent sidecar — no point waiting), OR the client is closed, OR the
 * bounded budget elapses. Prefers a confirmed delivery within the budget but is
 * non-hanging by construction (the budget is the hard ceiling); never throws.
 */
export async function awaitDeliveredOrBudget(client: EmitClient, budgetMs: number): Promise<void> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    // CONFIRMED: the events were written, the buffer drained, AND a compatible
    // peer's hello-ack confirmed receipt — not merely an empty buffer.
    if (client.deliveryConfirmed) return;
    // Nothing more to wait for — the sidecar is unreachable (fail-open) or the
    // client is already torn down.
    if (client.state === 'unavailable' || client.state === 'closed') return;
    if (Date.now() >= deadline) return;
    await new Promise<void>((resolve) => setTimeout(resolve, DRAIN_POLL_INTERVAL_MS));
  }
}
