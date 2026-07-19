// specs/037-instance-observability — AUDIT-20260719-19 (RED-first regression).
//
// THE DEFECT: `awaitDeliveredOrBudget` (src/telemetry/emit-drain.ts) resolved as
// soon as the emit client was `connected` AND its buffer had drained to empty.
// But per the emit client's own protocol, buffer-drained events are still
// PROVISIONAL until a matching `hello-ack` arrives: `onConnect` writes the held
// events and pushes them into `unconfirmed` (emit.ts ~260-269), and only a
// compatible `hello-ack` clears them (~283-298). So the bounded drain could
// return "delivered" while delivery was NOT yet confirmed — then the caller
// `close()`s the client, and on a protocol mismatch / slow ack / peer-close-
// before-ack the requeue/reconnect protection can't run (success was already
// declared). Since this helper gates `invocation.completed`, `session.*`, and
// `phase.entered`, a version-skew path could SILENTLY DROP the very events
// instances/sessions/bearings are built from.
//
// THE FIX: resolve on the client's DELIVERY-CONFIRMED state (`deliveryConfirmed`
// — connected AND buffer empty AND nothing unconfirmed), not merely an empty
// buffer. Still bounded + fail-open: the 50ms budget is a hard ceiling.
//
// RED PROOF (pure timing over the PUBLIC surface, so it compiles + runs pre-fix):
//   - A 'stall' peer ACCEPTS the connection and the client drains its buffer to
//     empty, but the peer NEVER sends a hello-ack. Pre-fix `awaitDeliveredOrBudget`
//     saw connected+empty-buffer and returned INSTANTLY (declared early success);
//     post-fix delivery is unconfirmed, so it rides the bounded budget and returns
//     at the ceiling. Asserting elapsed >= a fraction of the budget FAILS pre-fix,
//     PASSES post-fix.
//   - An 'ack' peer confirms delivery promptly, so the helper resolves well under a
//     generous budget (guards against the fix over-waiting the full budget on the
//     healthy path).
//
// Real `node:net` UDS peer + real temp dirs. No fake timers — real wall-clock is
// the point. Relative `.js` imports under node16. No `any`/`as`/`@ts-ignore`.

import { afterEach, describe, expect, it } from 'vitest';
import { createEmitClient, type EmitClient } from '../../src/telemetry/emit.js';
import { awaitDeliveredOrBudget } from '../../src/telemetry/emit-drain.js';
import {
  makeTelemetryEvent,
  startLocalSocketPeer,
  waitUntil,
  type LocalSocketPeer,
} from './_local-socket-peer.js';

const clients: EmitClient[] = [];
const peers: LocalSocketPeer[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const peer of peers.splice(0)) await peer.close();
});

describe('AUDIT-20260719-19 — awaitDeliveredOrBudget waits for CONFIRMED delivery, not an empty buffer', () => {
  it('does NOT declare early success on an empty buffer while delivery is UNCONFIRMED — waits the budget', async () => {
    // 'stall': accepts the connection, so the client reaches `connected` and
    // drains its buffer to the (silent) peer, but no hello-ack ever confirms.
    const peer = await startLocalSocketPeer('stall');
    peers.push(peer);

    const client = createEmitClient({ socketPath: peer.socketPath, callerKind: 'long-run' });
    clients.push(client);

    client.emit(makeTelemetryEvent());

    // The client connects and drains its buffer to empty — the exact pre-fix
    // early-success condition (connected && buffer.size === 0). Delivery is NOT
    // confirmed (no ack), so the fixed helper must keep waiting.
    await waitUntil(() => client.state === 'connected' && client.buffer.size === 0);

    const budgetMs = 60;
    const start = performance.now();
    await awaitDeliveredOrBudget(client, budgetMs);
    const elapsed = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(`[AUDIT-19] unconfirmed drain-wait rode the budget for ${elapsed.toFixed(2)}ms`);

    // Pre-fix: returned instantly on the empty buffer (~0ms) → FAILS. Post-fix:
    // delivery unconfirmed → rides the bounded budget → passes. Non-hanging: the
    // budget is the hard ceiling, so this can never exceed it meaningfully.
    expect(elapsed).toBeGreaterThanOrEqual(budgetMs * 0.7);
  });

  it('resolves PROMPTLY once a matching hello-ack CONFIRMS delivery (does not ride the full budget)', async () => {
    const peer = await startLocalSocketPeer('ack');
    peers.push(peer);

    const client = createEmitClient({ socketPath: peer.socketPath, callerKind: 'long-run' });
    clients.push(client);

    client.emit(makeTelemetryEvent());

    // A generous ceiling: over local UDS the hello-ack lands in single-digit ms,
    // so a confirmation-keyed wait returns FAR under this budget. If the fix
    // wrongly ignored the ack it would ride the full budget and blow this bound.
    const budgetMs = 1000;
    const start = performance.now();
    await awaitDeliveredOrBudget(client, budgetMs);
    const elapsed = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(`[AUDIT-19] confirmed drain-wait resolved in ${elapsed.toFixed(2)}ms`);

    expect(elapsed).toBeLessThan(budgetMs / 2);
    // And the client is genuinely delivery-confirmed at resolution.
    expect(client.deliveryConfirmed).toBe(true);
  });
});
