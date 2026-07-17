# Contract: Sidecar ↔ Plane Protocol

**Feature**: `specs/036-fleet-control-plane` | **Settles**: PT-007, PT-014, FR-018…FR-024, FR-037…FR-043, FR-050…FR-062, FR-075…FR-077

## C1 — Every connection is sidecar-outbound (FR-018)

Hosts sit behind NAT and firewalls. **The plane can never dial a sidecar.** This is a hard constraint, not a preference — it is what forces the transport shape.

| Direction | Mechanism |
|---|---|
| Commands (plane → sidecar) | held-open **SSE** stream, opened *by the sidecar* |
| Telemetry (sidecar → plane) | **HTTP POST** |

## C2 — Two connections is the baseline

The design record permits this explicitly: *"the system must still function over HTTP/1.1 using two connections. Absence of HTTP/2 is a cost, never a protocol failure."*

It is also what actually happens: **Node's `fetch` does not negotiate HTTP/2** on this target — undici's `allowH2` defaults to `false` in the versions Node 20–24 bundle, flipping only in undici v8 (Node ≥22.19.0). So the baseline is the record's own fallback; HTTP/2 multiplexing is a later, **evidence-gated** optimization.

**A trap to refuse:** forcing multiplexing via undici `connections: 1` would likely make telemetry POSTs **queue forever** behind an SSE response that never completes — converting a cost into an actual protocol failure. This head-of-line reasoning is **inference, not verified**; it is pinned as a RED test that must pass before any topology change.

## C3 — Two heartbeats, unrelated, both required (FR-022/023/024)

| Heartbeat | Direction | Proves | Constant |
|---|---|---|---|
| **Transport keepalive** | plane → sidecar, SSE **comment frames** | **Nothing about process health.** Exists solely to survive intermediaries that kill idle connections | **15s** |
| **Session liveness** | sidecar → plane | the sidecar and its host are alive and reachable | pinned at task time |

**Run liveness needs neither** — the local socket answers it (local-socket-protocol C5).

Client **read-idle timeout: 45s** (3× keepalive). Sized against real infrastructure floors — ALB 60s, nginx `proxy_read_timeout` 60s, Cloudflare ~100s. **These are engineering judgment, not looked-up facts.**

## C4 — SSE client rules (FR-019/020)

Reconnect is **not free outside a browser** — the automatic semantics belong to `EventSource`. The sidecar is a Node client and owns its connection loop, reconnect policy, and cursor advancement explicitly.

**Wire rules that are easy to get wrong** (each pinned by a test):
- **`Last-Event-ID` is a request HEADER**, not a query parameter.
- **The last-event-ID buffer persists across events that omit `id:`**, and updates even on dispatches that fire no event.
- **Comment frames** (leading `:`) are keepalive and **must re-arm the read-idle watchdog**. *This is the highest-value test in the feature* — the likeliest implementation bug, and it fails silently as a mystery disconnect every ~45s.
- **`fail` vs `reestablish` are distinct.** Per spec, a non-200 or wrong `Content-Type` is **terminal**, not retryable.

**Reconnect policy:** full jitter, base 1s (**reseeded by the server's `retry:` field**), ×2, cap 30s, reset after 60s healthy. **Retry forever, except:** terminal-fail states, `401`, `403` — an invalid or revoked token will not fix itself by retrying.

## C5 — Sequencing (FR-037…FR-042)

The sidecar is the sequencer. Every event carries `eventId` + **two** sequences.

| Sequence | Meaning | Legitimate use |
|---|---|---|
| `installationSequence` | the sidecar's outbound emission order | transport diagnostics, gap detection, spool restoration |
| `invocationSequence` | per-invocation order | **the only one with domain meaning** |

**`installationSequence` MUST NOT be used for domain or causal ordering** (FR-041). It interleaves every concurrent invocation and short verb into one counter, so it defines emission order at the sidecar — **not** causal ordering across simultaneous runs. Using it for domain ordering would assert relationships between concurrent runs that do not exist.

**It is durable and never resets across sidecar restart** (R-02). A reset makes every subsequent event look like a regression under the plane's no-regress rule, causing the plane to reject its own fleet's ongoing telemetry. Unrestorable ⇒ **fail loud**, never silently restart at zero.

**Plane ingestion:** dedupe by `eventId`; **never regress live registry state from an older sequence**; store late events **durably** rather than discarding; surface gaps **diagnostically**.

**Dedupe is an optimization, not a correctness mechanism** — no-regress plus deterministic object naming make ingestion correct with the dedupe set absent. Recorded so nobody agonizes over its TTL.

## C6 — Auth (FR-075…FR-077, FR-088)

- **TLS and authentication are mandatory** — the plane is network-exposed by construction.
- **Long-lived bearer token, per installation** — not a fleet-wide shared secret, so one host is revocable without re-crediting the fleet.
- **Credentials live in the sidecar only** — never in a CLI process, never on the local socket.
- **Unknown or revoked token ⇒ refused.** Never downgraded to anonymous or partial access, and (C4) never retried.

## C7 — Command delivery (FR-050…FR-062)

- The plane holds a command until **delivered-and-acknowledged, expired, or superseded**, and **replays unexpired commands on reconnect** — so a `cancel` survives a network blip, which on a WAN is routine rather than exceptional.
- **`accepted` is durable before it is returned** (FR-056). Authoritative across plane restart.
- **Acknowledgement travels back as telemetry** (FR-051).
- **Stream replay position is not command status** (FR-058). `Last-Event-ID` tracks frames delivered; a delivered-but-unapplied command must never look complete. Separate state, separate advancement.
- **Idempotent** (FR-054) — delivery is at-least-once.
- **Expiry is a visible terminal state** (FR-055).
- **Supersession is per-command, never generic** (FR-057).
- **Fan-out is never atomic** (FR-062): the response reports targets / accepted / unavailable, with per-instance state individually observable.

## C8 — Plane restart (PT-007)

Accepted commands survive by decision (C7). The **live registry does not** — it is explicitly **derived, not authoritative**; the sidecars are.

On restart: streams die, sidecars detect death via read-idle, reconnect with backoff (C4), and **re-announce** their live runs. The registry rebuilds from re-announcement.

Consistent with the authority split — the plane aggregates; stackctl owns execution (FR-079).

## C9 — Store health (FR-074)

Two hops, **independently** surfaced, each `healthy` | `degraded` | `disabled` with pending counts, last success, last failure, last error:

- **uplink** (sidecar → plane) — signal: spool depth
- **archive** (plane → durable store) — signal: pending + failed write counts

**"Degraded" must always answer which hop.** They fail for unrelated reasons; one combined indicator would be ambiguous exactly when it matters.

## Test obligations (RED first)

1. **Keepalive comments re-arm the read-idle watchdog** — the highest-value test here.
2. Read-idle expiry ⇒ reconnect; `Last-Event-ID` sent **as a header**; stream resumes from cursor.
3. Last-event-id buffer **persists** across `id:`-less events.
4. Non-200 / wrong `Content-Type` / 401 / 403 ⇒ **terminal**, no retry loop.
5. Backoff: full jitter, server `retry:` reseeds base, cap honored, reset after healthy period.
6. **Telemetry POSTs are not head-of-line blocked by the SSE stream** — must pass before any topology change (C2).
7. `installationSequence` **survives sidecar restart**; no regression storm; unrestorable ⇒ fail loud.
8. Duplicate + reordered delivery ⇒ correct registry state; **never** walks backward (SC-015).
9. Late event after finalization ⇒ stored durably, **new object**, new derived revision; **no published object mutated** (SC-010).
10. `accepted` survives plane restart (SC-007-adjacent); `cancel` during a blip ⇒ applied on reconnect.
11. Plane restart ⇒ sidecars re-announce; registry rebuilds; **0 false deaths**.
12. Gap classification separates lost / in-flight / never-sent from the high-water mark.
13. Unknown/revoked token ⇒ refused, not degraded.

Real in-process `node:http` servers on ephemeral ports — a fixture can stall without EOF and die mid-frame; a mock cannot. Injected `SseTransport` + `Clock` so 45s-timeout tests run in microseconds.
