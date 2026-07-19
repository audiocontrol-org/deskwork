# Contract: The Plane's Client API

**Feature**: `specs/036-fleet-control-plane` | **Settles**: FR-080…FR-087, PT-004, PT-005, PT-009

**This is the top edge of the plumbing and the surface the dogfood loop drives.** It specifies **what the plane exposes**, never how a client renders it.

**Scope note.** The browser dashboard is out of scope (`design:feature/fleet-dashboard`). This API is **not** speculative under Principle II: the dogfood loop makes the developer its first real consumer from day one, so the dashboard becomes its *second* — the order the principle requires. See [quickstart.md](../quickstart.md).

## C1 — The plane is the single endpoint (FR-080)

A client sources **everything** from the plane — live state and history alike. It never contacts the content-delivery layer, the durable store, or a sidecar.

## C2 — Snapshot, then deltas (FR-081)

| Step | Shape |
|---|---|
| Initial | **snapshot** of current fleet state |
| Live | **deltas**: instance upserted / instance removed / command updated / store health changed |

**A full registry push per telemetry event is prohibited.** Deltas describe only what changed.

## C3 — Fleet entries (FR-082, FR-013/014)

One entry per **commandable** run (`execute`, `govern`). Each carries: instance, compass, **the three status axes**, progress, model, git, reconciliation, and available actions.

**Short verbs are never fleet entries** — the fleet means "runs you can act on" — while their timing data stays retrievable (FR-014).

## C4 — The three axes are never collapsed (FR-029/030)

The plane exposes `connectionStatus`, `livenessStatus`, and `executionStatus` **separately** and never derives a single authoritative status. Summary derivation *for display* is a client concern belonging to the dashboard item.

The invariant this feature owns: **the axes stay independently readable**, so no consumer is forced to infer one meaning from an enum carrying three.

Honesty rules that show up here (FR-006, FR-026): a run disconnected from its sidecar reports **temporarily uncommandable**, never healthy; socket closure reports **`abnormally-disconnected`, reason unknown**, never crashed.

## C5 — Per-run detail (FR-083)

Overview, artifacts, execution, governance, timings, reconciliation.

**Artifact references (PT-009):** opaque identifiers plus **installation-relative** paths. **Never** `file://`, never absolute host paths — a remote client refers to a filesystem it cannot reach, and absolute paths are redacted before they leave the host anyway (PT-008). "Quick access" means **copy-path**, not open-link.

**Errors (FR-046):** structured `{ code, message, task, timestamp, recoverable }`, details **fetched on demand** — never carried in the fleet payload.

## C6 — Commands (FR-050…FR-062)

Issue `pause` / `resume` / `cancel` / `config-push` / `reconcile`. Every command's full lifecycle is **queryable by `commandId`**.

**The promise: the operator can always tell what happened to a command they issued. "Sent" is never reported as "applied."**

- `pause` is cooperative — requested-vs-applied is **observable** (FR-059).
- `reconcile` has its own received/started/completed/failed lifecycle; results linked by `commandId`. A single acknowledgement does not represent it (FR-061).
- **Fan-out is never atomic** (FR-062) — the response reports targets / accepted / unavailable; per-instance state individually observable. *Destructive-action confirmation UX belongs to the dashboard item; the plane's contract is that fan-out is never reported as atomic.*

## C7 — History without amplifying the capped store (FR-084/085, PT-004/005)

- Historical views are served from **artifacts the plane derived and cached**.
- **Live runs are served from the in-memory registry** — cloud reads are confined to **finalized** run artifacts (FR-072). Live views generate **zero** reads against the durable store (SC-009).
- A cold cache re-reads **through the delivery layer** (cached) and **does not touch the capped store**.
- **Phase durations** — design, spec, execution, governance — are retrievable per run (FR-085).

**The query-shape constraint binds this API, not just the plane's internals** (FR-069): the plane MUST NOT expose a query shape that forces a near-unique cache key per request. Arbitrary caller-driven ranges, filters, and pagination are prohibited — they would defeat the edge cache that justifies the CDN.

**Everything in the path; nothing in the query string.** Cloudflare's default cache key includes the full query string, so the moment a "canned query" becomes `?run=X&from=Y`, cardinality becomes a function of caller behavior instead of object identity. Path-only keys make an uncanned query **unrepresentable** rather than merely discouraged — the design's own thesis (make the failure state impossible) applied to caching.

## C8 — Auth

Same bearer-token scheme as the sidecar (sidecar-plane-protocol C6). Single-operator tenancy (FR-078): no cross-tenant isolation, no per-instance permissions, no per-operator history scoping. **Nothing here forecloses a later multi-operator model.**

**No client-held credential for the delivery layer exists** (FR-070), because there is no client-to-delivery-layer path. This is what makes the later browser consumer safe *by construction*: any secret reachable by browser JavaScript is exfiltratable, so the absence of the path — not a short-lived-grant mechanism — is the guarantee.

## C9 — Exercisable without a browser (FR-087, SC-018)

**Every state and every command this spec defines MUST be reachable** by running the sidecar and the plane and issuing the same requests a dashboard would make.

This is a **requirement, not a testing note**: a state reachable only through a UI that does not exist yet is a state this feature cannot prove it delivers.

## Route shape

Versioned, path-only, low-cardinality. Exact paths and payload schemas are pinned by RED tests at task time; route namespacing and versioning are PT-014 constants.

| Purpose | Shape |
|---|---|
| Snapshot | `GET /v1/fleet` |
| Live deltas | `GET /v1/fleet/stream` (SSE) |
| Run detail | `GET /v1/runs/{runId}` |
| History | `GET /v1/runs/{runId}/history` |
| Timings | `GET /v1/runs/{runId}/timings` |
| Issue command | `POST /v1/runs/{runId}/commands` |
| Command status | `GET /v1/commands/{commandId}` |
| Fleet-wide action | `POST /v1/fleet/commands` |
| Store health | `GET /v1/health/store` |

## Test obligations (RED first)

1. Snapshot returns **every** commandable run across multiple installations/hosts, **exactly once**, in **one** request (SC-003).
2. Progress arrives as a **delta**; **no** full registry push per event.
3. Short verbs **absent** from the fleet; their timings **retrievable**.
4. The three axes are **separately readable**; no collapsed authoritative status.
5. Disconnected run ⇒ **uncommandable**, not healthy. Closed socket ⇒ **abnormally-disconnected**, not crashed.
6. Every command reaches an **observable terminal state**; **no** state reported stronger than what occurred (SC-006).
7. Live views ⇒ **0** durable-store reads (SC-009).
8. Repeated/varied history reads ⇒ capped-store transactions **flat** as client traffic scales (SC-008).
9. **No route accepts a query shape that shards the cache key** (FR-069).
10. Fan-out response reports targets/accepted/unavailable; **never** presented as atomic.
11. Artifact refs are **never** `file://` and never absolute host paths.
12. **Every state and command is reachable headlessly** (SC-018) — the dogfood contract.
