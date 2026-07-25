---
slug: 038-fleet-dashboard
targetVersion: ""
---

# Audit log — 038-fleet-dashboard

## 2026-07-25 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260725-01 — Fire-and-forget resync after upstream drop crashes the entire BFF on the exact scenario FR-016 is meant to survive

Finding-ID: AUDIT-20260725-01
Status:     open
Severity:   blocking
Per-lane:   claude=blocking
Decision:   single-model (gate-counted blocking)
Surface:    fleet-dashboard/src/server/stream-relay.ts — `handlers.onDrop` / `resync()` (createStreamRelay, ~lines 220-265)

`onDrop()` calls `void resync()` with no `.catch()`:

```js
onDrop(): void {
  ready = false;
  broadcast({ kind: 'disconnected' });
  void resync();
},
```

`resync()` is `async function resync(): Promise<void> { const body = await deps.planeClient.instanceSnapshot(); ... }`. `instanceSnapshot()` (the real `plane-client.ts`) throws `PlaneClientError` on any transport failure, non-2xx, or malformed body. Since Node 15, an unhandled promise rejection is fatal by default (`--unhandled-rejections=throw`) unless a global `process.on('unhandledRejection', ...)` handler exists — none is registered anywhere in this diff (`index.ts`'s `startRelayResilient` only guards the *initial* `relay.start()` call with `.catch()`; the reconnect path inside `stream-relay.ts` itself has no equivalent).

The failure mode is not a rare edge case — it is the *most likely* outcome of exactly the event `onDrop` handles: the upstream connection just dropped, almost always because the plane restarted or is momentarily unreachable, and the very next thing `resync()` does is immediately re-hit that same unreachable plane for a fresh snapshot. So a routine plane restart/hiccup — the case FR-016 explicitly promises to survive with "a resync, never a silent gap" — instead crashes the whole dashboard BFF process, dropping every connected operator's dashboard, not just failing to resync. `stream-relay.test.ts`'s fake plane client never rejects `instanceSnapshot()` during a drop-triggered resync, so this path is untested. Fix: `resync()`'s failure inside `onDrop` needs to be caught and retried (mirroring `index.ts`'s `startRelayResilient` retry loop), not fired-and-forgotten.

### AUDIT-20260725-02 — SSE broadcast has no per-listener error isolation and no `error` handler on the response — one client disconnect can crash the process for every connected dashboard

Finding-ID: AUDIT-20260725-02
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    fleet-dashboard/src/server/routes.ts (`handleStream`, ~lines 105-140) and fleet-dashboard/src/server/stream-relay.ts (`broadcast`, ~lines 225-232)

`handleStream()` writes SSE headers and subscribes to the relay but never attaches `res.on('error', ...)`:

```js
res.writeHead(200, {...});
res.flushHeaders();
...
subscription = deps.relay.subscribe((event) => { forwardRelayEvent(res, unsubscribe, event); });
res.once('close', unsubscribe);
```

And `stream-relay.ts`'s fan-out loop has no isolation between subscribers:

```js
function broadcast(event: RelayEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}
```

Node's classic SSE gotcha applies here directly: when a browser tab is closed abruptly, the laptop sleeps, or the network drops mid-stream (EPIPE/ECONNRESET), the *next* `res.write()` inside `forwardRelayEvent` (routes.ts) can emit an unhandled `error` event on the response stream. With no `res.on('error', ...)` listener anywhere on this path, that becomes an uncaught exception that terminates the whole Node process — taking down every other dashboard client's live connection, not just the one that disconnected. Separately, even absent that specific Node quirk, `broadcast()`'s bare `for` loop means any listener throwing synchronously (for any reason) both aborts delivery to subsequent listeners in that same broadcast and, if the exception is uncaught upstream, kills the process. None of the tests in `routes.test.ts` exercise an abrupt/severed connection (only graceful `unsubscribe()`/`stream.cancel()`), so this is untested. Fix: attach `res.on('error', () => unsubscribe())` in `handleStream`, and wrap each listener invocation in `broadcast()` in a try/catch that logs-and-continues rather than propagating.

### AUDIT-20260725-03 — Relay reconnect permanently stalls if the re-snapshot fails after a drop

Finding-ID: AUDIT-20260725-03
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    fleet-dashboard/src/server/stream-relay.ts:225-248, fleet-dashboard/src/server/index.ts:37-48, fleet-dashboard/tests/server/stream-relay.test.ts:179-205

On upstream drop, `stream-relay` broadcasts `disconnected` and calls `void resync()` with no catch or retry. If `deps.planeClient.instanceSnapshot()` rejects during that resync, the promise is unhandled, `ready` stays false, no new upstream connection is opened, and existing/future subscribers never receive the fresh snapshot required by FR-016. The retry loop in `index.ts` only wraps the initial `relay.start()` path; it does not cover post-drop resync failures.

Blast radius is high because a normal transient plane outage during reconnect breaks the live stream until process restart. The current tests cover only the successful second snapshot path, so this failure mode is not pinned. A reasonable fix is to route drop recovery through a retrying reconnect/resnapshot loop with a deterministic test where the first post-drop snapshot rejects and a later one succeeds.
