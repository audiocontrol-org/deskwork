# Quickstart: Fleet Control Plane — the dogfood loop

**Feature**: `specs/036-fleet-control-plane` | **Validates**: FR-087, SC-018, and every user story

This is **not** a demo script. It is the feature's **primary verification path** and a first-class requirement (FR-087/SC-018).

**Why it is load-bearing.** The browser dashboard is out of scope, so this loop *is* the consumer: run the sidecar and the plane, issue **the same API requests a dashboard would make**, and find out whether it works or how it is broken — in a tight feedback loop (operator decision, 2026-07-16). Two consequences the implementation inherits:

1. **The plane's API is not speculative.** It has a real consumer from day one, which is what Constitution Principle II requires before the dashboard becomes its second consumer.
2. **A green test suite is a prerequisite, not proof.** Per `.claude/rules/agent-discipline.md`, tests written against our own assumptions cannot establish that a distributed system behaves. **The dogfood loop is the primary evidence; the suite is the floor beneath it.**

If a scenario below cannot be driven from a terminal, that is a **defect in the feature**, not a gap in the guide — a state reachable only through a UI that does not exist yet is a state this feature cannot prove it delivers.

## Prerequisites

- Node ≥20 (declared floor; 22.19.0 actual). `npm install` at the repo root.
- A reachable plane. For the loop: run one locally — deployment location is not a design input (`STACKCTL_CP_URL` is the only thing that matters).
- A bearer token provisioned into the machine-local durable store (PT-015).

> **Before running anything: redirect the machine-local store to a temp dir.** Identity, token, and the sequence high-water mark live **outside** the installation tree (the declared installation-anchor exception — see [plan.md](./plan.md) § Complexity Tracking). Without redirection, a loop run mints identity into your real `$HOME`.

## Scenario 1 — The CLI is never degraded (US1, SC-001/002)

**The dominant constraint. Verify it first: if this fails, nothing else matters.**

1. Baseline: time any `stackctl` verb with telemetry disabled.
2. **No sidecar:** delete the socket, run the verb. → Completes; identical output and exit code; wall-clock indistinguishable from baseline. A sidecar is spawned for *next* time.
3. **Plane unreachable:** point `STACKCTL_CP_URL` at a dead address. → Verb unaffected and never informed; sidecar spools.
4. **Plane hanging:** point at a server that accepts and never responds. → **Verb completes at normal speed.** There is no network in the interactive path to time out. *This is the scenario that catches an accidental `await` on the WAN.*
5. **Concurrent spawn:** launch several invocations at once with no sidecar. → **Exactly one** sidecar; all invocations unaffected.
6. **Version skew:** start an old-protocol sidecar, run a newer CLI. → Restart path fires; invocation **not** failed.

## Scenario 2 — Fleet aggregation (US2, SC-003)

1. Start commandable runs (`execute` / `govern`) in several installations — ideally on more than one host.
2. `GET /v1/fleet` → **exactly one** entry per commandable run, carrying instance, compass, the three status axes, progress, model, git, reconciliation.
3. Follow `GET /v1/fleet/stream`. Let a run progress. → **Deltas** only; never a full registry push per event.
4. Hammer short verbs in a loop. → They **never** appear as fleet entries; their timings remain retrievable.
5. `GET /v1/runs/{runId}` → overview, artifacts, execution, governance, timings, reconciliation. **Artifact refs are installation-relative — never `file://`, never absolute host paths.**

## Scenario 3 — Commands, and always knowing their fate (US3, SC-006/007)

1. `POST /v1/runs/{runId}/commands` with `pause`. → Returns a `commandId`. `GET /v1/commands/{commandId}` shows **requested vs applied** distinctly — pause is cooperative.
2. **The blip test:** issue `cancel`, immediately sever the sidecar's network, restore it. → Buffered command **replays and applies**. Not silently dropped. *This is the one destructive command; a silent no-op here is the worst failure in the design.*
3. **The restart test:** issue a command, kill the plane within a second, restart it. → `accepted` **survived**; honored from the durable record.
4. Deliver a command to a run that never applies it. → Reports **delivered**, not complete. *Stream replay position is not command status.*
5. Let a command expire undelivered. → **Visible terminal `expired`.** It says so loudly rather than vanishing.
6. Issue `pause`, then `resume` before apply. → `pause` **superseded**. Issue two `cancel`s → they **deduplicate**, never queue.
7. `POST /v1/fleet/commands`. → Response reports targets / accepted / unavailable. **Never presented as atomic.**
8. Issue `reconcile`. → Its own received/started/completed/failed lifecycle; results linked by `commandId`.

## Scenario 4 — Trust, including about failure (US4, SC-004/005/015/016)

1. **`kill -9` a run's process.** → Within **milliseconds**, `abnormally-disconnected`, **termination reason unknown**. **Not** "crashed". No TTL or polling interval contributes latency.
2. **Restart the sidecar with N healthy runs.** → **Zero** false death conclusions. Every socket closed at once and nothing died. Runs re-announce inside the reconciliation window. *The single most important honesty test in the feature.*
3. Let a run miss the reconciliation window. → **Presumed gone** — only then.
4. Sever a run's sidecar connection while it keeps executing. → Reports **temporarily uncommandable**, never healthy.
5. **Sever the uplink.** → **Uplink** health degrades, naming that hop, with spool depth / last success / last failure / last error. Run execution **unaffected**.
6. **Break the archive** (bad durable-store credentials). → **Archive** health degrades, naming *that* hop, with pending + failed counts. **"Degraded" always answers which hop.**
7. Replay duplicate and reordered events. → Deduped; registry **never walks backward** from a later state to an earlier one.
8. **`SIGKILL` the sidecar mid-spool, restart it.** → **No record loss**; the WAL replays. *Note: this is the test the original "must not exit holding an un-flushed spool" phrasing could not pass by construction — `SIGKILL` runs no code (R-03).*

## Scenario 5 — History without amplifying the capped store (US5, SC-008/009/010)

1. Instrument durable-store reads.
2. View **live** runs repeatedly. → **Zero** durable-store reads. Live is served from the in-memory registry.
3. Finalize a run; read its history repeatedly and with varied shapes. → Capped-store transactions stay **flat** as client traffic scales.
4. **Cold-cache test:** clear the plane's derived cache; request history. → Re-reads **through the delivery layer** (cached); **does not touch the capped store**.
5. **The decorative-shield test:** confirm the CDN is actually caching `.json`. → **Cloudflare does not cache JSON by default.** Without an explicit cache rule the hit rate is **zero** while the data stays correct — the shield *looks* like it works and shields nothing. **Measure the hit rate; do not infer it from correct data.**
6. Deliver a **late event after finalization**. → Lands as a **new object**; triggers a **new derived revision**. **Zero** published objects mutated.
7. Probe a sequence that does not exist yet, then write it. → The **404 is not cached**; the new event is seen immediately. *The one deliberate no-cache decision in an otherwise cache-forever design.*
8. `GET /v1/runs/{runId}/timings` → design / spec / execution / governance durations.

### Cloudflare configuration (enables Scenario 5's cache validation)

The delivery layer (Cloudflare in front of Backblaze B2) requires five specific settings. Without them, the architecture's read-cost shield does not function, though correct data will still serve — the failure is invisible.

#### 1. Cache Rule for `.json` files

**The critical setting — without this, CDN hit rate is zero.**

Cloudflare does not cache `.json` files by default; `.json` is absent from the default cached-by-default content types. Every object in this design is `.json` (events, manifests, derived artifacts). On a stock Cloudflare setup, the cache hit rate measures **zero** — the origin B2 bucket sees every request — while data correctness remains unaffected, so the failure never surfaces without instrumentation. This is the one finding that justified the full plan-time research pass.

**Required:** Add an explicit Cache Rule (Cloudflare → Rules → Cache Rules or equivalent) that matches `Path contains: .json` and sets `Cache eligibility: Eligible for cache`. This restores the read-amplification shield that justifies the CDN's presence. Validate by measuring the actual cache hit rate (Cloudflare Analytics → Caching) rather than inferring from correct responses; you are looking for a high cache-hit percentage on `.json` objects.

#### 2. Transform Rule (security control — not optional)

**This is a security boundary, not a convenience.**

The delivery layer uses a Cloudflare custom domain pointing at a Backblaze B2 origin. Without a Transform Rule, the hostname becomes an **open proxy to every other bucket on that B2 origin** — any request can be rewritten to target any path on the origin. This is a critical authorization bypass.

**Required:** Add a Transform Rule (Cloudflare → Rules → Transform Rules or equivalent) that **appends `/file/<bucket>` to the request path**. Specifically:
- **On request Path:** Rewrite to `concat("/file/<bucket>", http.request.uri.path)`
- Where `<bucket>` is the literal B2 bucket name configured for this deployment

This pinning ensures the request can only access the named bucket, not arbitrary buckets on the shared B2 origin. Every request now includes the bucket namespace in the origin path, defeating cross-bucket traversal. Verify by confirming that a direct request to `https://<custom-domain>/runs/...` (missing the bucket-pinning prefix) either 404s or is rewritten to include the bucket prefix.

#### 3. Full (strict) TLS

**Required:** Enable TLS mode `Full (strict)` (Cloudflare → SSL/TLS → Overview or equivalent). This validates the SSL certificate of the origin (the B2 custom-domain endpoint) and prevents man-in-the-middle attacks between Cloudflare and the origin. Set Minimum TLS Version to `1.2` or higher to enforce modern cryptography.

#### 4. Smart Tiered Cache

**Recommended:** Enable Smart Tiered Cache (Cloudflare → Caching → Cache Rules or Settings, depending on your Cloudflare plan). This feature extends cache capacity by tiering hot content at Cloudflare's edge while less-frequently accessed content is served from regional tiers — improving hit rates and origin load at scale without manual configuration. For fleet history workloads (finalized runs with immutable payloads), this amplifies the read-cost reduction the CDN provides.

#### 5. Cache-Control behavior and the probe-path no-cache carve-out

**How immutability and the special case compose.**

Every object stored in B2 carries the HTTP header `Cache-Control: public, max-age=31536000, immutable` — a one-year cache, marked immutable to signal the content will never change. This is the load-bearing contract: staleness becomes unrepresentable rather than operationally managed. No purge, no invalidation. A new revision is a new URL with a new key, so old URLs serve forever without risk of staleness.

**One exception:** sequence probing (discovering which events have landed) terminates on HTTP 404 — a request for a sequence number that does not yet exist. Cloudflare caches 404 responses with a short but nonzero TTL by default. A cached "this sequence does not exist" response would block the plane from seeing a newly-arrived event with that sequence number, stalling discovery for the duration of the 404's cache TTL. This is a correctness bug.

**Required:** Configure a **second Cache Rule that overrides the default for probe-path 404s:**
- **On request Path:** Match `Path contains: /` (or the specific sequence-probe endpoint pattern, if narrower)
- **Status Code:** `404`
- **Cache Status:** `Bypass cache` (do not cache 404s on this path)

This carve-out ensures that a newly-arrived event is visible on the next probe, not hidden behind a stale-404 window. Everything else on the delivery layer caches for one year; this path does not cache 404s. Measure by probing a non-existent sequence, then writing the event and probing again — the event must be visible immediately (latency only for the B2 round-trip), not delayed by the 404 cache window.

## Scenario 6 — Hostile network (US6, SC-011/012/013/014)

1. Run a sidecar behind NAT with **no inbound reachability**. → Session establishes — every connection is sidecar-outbound.
2. Connect **unauthenticated**. → Refused. **Revoked token** → refused, never downgraded to partial access.
3. Inspect any CLI process's environment and memory. → **Zero** credentials. Inspect every frame on the local socket. → **The token never crosses it.**
4. Put an intermediary that blocks connection upgrades in front. → The command stream **still traverses it** — it is plain HTTP.
5. Idle the command stream past the intermediary's timeout. → **Keepalive comment frames** hold it open. *Verify the comment frames re-arm the client's read-idle watchdog — the likeliest silent bug in the feature; it presents as a mystery disconnect every ~45s.*
6. Inspect the spool **on disk**. → **Zero** raw un-redacted values. Redaction precedes spooling.
7. **Copy an installation tree to another host** (or another path) and start it. → It **re-mints**. Distinct installation; **zero** identity collisions — including for identical checkout paths on different machines. *Confirm no usable credential travelled with the tree.*

## Definition of done for this guide

Every scenario is drivable from a terminal against a running sidecar + plane, with **no browser** and **no UI** (SC-018). Any scenario that is not is a **defect**.
