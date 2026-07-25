---
slug: 038-fleet-dashboard
targetVersion: ""
---

# Audit log — 038-fleet-dashboard

## 2026-07-25 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260725-01 — Fire-and-forget resync after upstream drop crashes the entire BFF on the exact scenario FR-016 is meant to survive

Finding-ID: AUDIT-20260725-01
Status:     resolved (fixed 2d590b71 — cancellable retrying reconnect loop; re-govern round 2 did not re-raise)
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
Status:     resolved (fixed 2d590b71 — shared deliver() try/catch + idempotent res.on('error'); re-govern round 2 did not re-raise)
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
Status:     resolved (fixed 2d590b71 — same root cause as -01; retrying resync; re-govern round 2 did not re-raise)
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    fleet-dashboard/src/server/stream-relay.ts:225-248, fleet-dashboard/src/server/index.ts:37-48, fleet-dashboard/tests/server/stream-relay.test.ts:179-205

On upstream drop, `stream-relay` broadcasts `disconnected` and calls `void resync()` with no catch or retry. If `deps.planeClient.instanceSnapshot()` rejects during that resync, the promise is unhandled, `ready` stays false, no new upstream connection is opened, and existing/future subscribers never receive the fresh snapshot required by FR-016. The retry loop in `index.ts` only wraps the initial `relay.start()` path; it does not cover post-drop resync failures.

Blast radius is high because a normal transient plane outage during reconnect breaks the live stream until process restart. The current tests cover only the successful second snapshot path, so this failure mode is not pinned. A reasonable fix is to route drop recovery through a retrying reconnect/resnapshot loop with a deterministic test where the first post-drop snapshot rejects and a later one succeeds.

## 2026-07-25 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260725-04 — FR-010 "independent revocation" for read credentials has no production wiring — a leaked read credential cannot be revoked without a full plane restart

Finding-ID: AUDIT-20260725-04 (claude-01 + codex-02; cross-model)
Status:     dispositioned — spec-bounded (invariant-first). FR-010 independent revocation IS satisfied: FLEET_PLANE_READ_TOKEN is comma-separated multi-credential; revoke a reader by removing its entry + restart, others + telemetry unaffected (credential-class mechanism tested in read-credential-class.test.ts). Lifecycle is FR-011 static-minimal: "effective on restart OR the reload path" + "interactive mint/list/revoke out of scope"; spec Assumptions explicitly permit "restart only." The one real defect — the T009 ledger's "live-reload wiring" overclaim — is CORRECTED in the ledger, and the restart-based revocation model is now documented in the dashboard README (0e776f38). Live read-credential hot-reload / interactive revoke is a scope addition beyond FR-011 (operator call). Graduated via recorded --override.
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    fleet-dashboard's reader-credential class, spanning `src/subcommands/plane.ts:96-121` (`readerCredentialsFromEnv`, `buildServeRuntime`), `src/plane/runtime.ts:107-121` (`readCredentials`/`revokedReadCredentials` options), and `src/plane/http/auth.ts` (`createReadCredentialRegistry`)

`createReadCredentialRegistry` and `withConsumerAuth` correctly implement per-credential revocation as a *mechanism* — the registry closes over a live `revoked` `Set` reference, and mutating that set in place refuses the credential on the next request (proven by `src/plane/__tests__/read-credential-class.test.ts`'s "independent revocation" test, which hand-constructs the runtime with `readCredentials`/`revokedReadCredentials` and mutates the set directly). But the actual production entry point, `buildServeRuntime` in `src/subcommands/plane.ts:124-165`, never passes `revokedReadCredentials` to `createPlaneRuntime` at all — only `readCredentials: readerCredentialsFromEnv(process.env)` is wired (line ~157). `createPlaneRuntime` defaults `revokedReadCredentials` to `new Set()` when omitted (`runtime.ts:207-210`), so in real `stackctl plane serve` operation there is no set for any process to mutate, and no mechanism exists to populate one (no CLI verb, no file-backed store analogous to `registry.revokedTokens()` for telemetry tokens, no live-reload hook — `refreshBeforeAuth` only calls `registry.reloadEnrollmentIfChanged()`, which reloads the telemetry-token enrollment file, not anything related to read credentials).

Compounding this, `readerCredentialsFromEnv(process.env)` is evaluated once at `buildServeRuntime()` call time (process boot), with no analogous "reload if changed" seam — so even rotating the `FLEET_PLANE_READ_TOKEN` env var requires a full process restart to take effect, unlike telemetry tokens which are file-backed and hot-reloaded via `reloadEnrollmentIfChanged()`. The ledger entry for T009 (`.stack-control/execute/038-fleet-dashboard.ledger.jsonl`) even describes this task as "read-credential config + live-reload wiring," but no live-reload exists for read credentials in the shipped code — only for the pre-existing telemetry path it reuses the `refreshBeforeAuth` hook from.

Blast radius: an operator who needs to revoke a leaked or compromised `FLEET_PLANE_READ_TOKEN` (the exact scenario FR-010 is written to cover) has no way to do so short of stopping and restarting the entire plane process — which also interrupts telemetry ingestion and command dispatch for every connected sidecar, not just the dashboard's read path. A fix would either (a) wire `revokedReadCredentials` to a file-backed, live-reloadable store analogous to the existing token registry, or (b) if deliberately deferred, downgrade the ledger's "reviewClean: true" claim and explicitly scope this as a known gap rather than implying FR-010 is satisfied end-to-end.

### AUDIT-20260725-05 — PlaneClientError can leak the read token through injected fetch errors

Finding-ID: AUDIT-20260725-05
Status:     resolved (fixed 3f752a34 — redactCredential scrubs the token from PlaneClientError at both interpolation sites; RED test e5ee21d1)
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    fleet-dashboard/src/server/plane-client.ts:151-155,171-175

`getJson()` promises that thrown errors never carry the plane read credential, but both failure branches include `String(err)` in the `PlaneClientError` message. Because `fetchFn` is injected, a wrapper or transport error can include request headers in its error text, including `Authorization: Bearer <token>`. The browser routes currently mask these messages, but the public `PlaneClient` contract is violated and server-side logs/tests/callers can receive the secret.

The blast radius is high because this is a credential-handling boundary: a downstream caller can reasonably rely on the documented "never carries the read credential" invariant and log the error. A reasonable fix is to avoid embedding raw upstream exception text in `PlaneClientError`, or scrub the configured token before constructing the message.

## 2026-07-25 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260725-06 — Snapshot-to-stream ordering can silently lose live deltas

Finding-ID: AUDIT-20260725-06
Status:     resolved (fixed 2af56fbe — resync subscribes-first + buffers upstream deltas, then reads the authoritative snapshot, then folds the buffer idempotently by id; within FR-017 (existing GET+SSE only); bounded via maxBufferedDeltas; RED c3da5881; 84/84 green)
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    fleet-dashboard/src/server/stream-relay.ts:307-323

`resync()` fetches the authoritative snapshot first, broadcasts it, and only then opens the upstream SSE connection. Any plane delta committed after `instanceSnapshot()` is read but before `connectUpstream()` is established is in neither channel: it is not in the snapshot and it will not be replayed by the newly opened stream. The same `resync()` function is used for initial start and post-drop recovery, so this affects both first load and reconnect.

The blast radius is high because the dashboard can show a permanently stale fleet view until some later delta or manual reload happens, violating the stated snapshot-then-deltas / reconnect-resync contract. A reasonable fix needs a gap-closing mechanism: for example, a cursor/sequence handshake with the plane, or a relay protocol that connects in a way that cannot miss events between the snapshot boundary and the stream boundary.
