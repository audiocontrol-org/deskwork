# Phase 0 Research: Fleet Control Plane

**Feature**: `specs/036-fleet-control-plane` | **Date**: 2026-07-16
**Input**: [spec.md](./spec.md) · design record `docs/superpowers/specs/2026-07-16-fleet-control-plane-design.md`

## Purpose and method

This artifact settles the spec's **Plan-Time Contracts** (PT-001…PT-015) — the decisions the approved design record deliberately deferred to plan time because prose cannot carry a write protocol. Each is settled here against concrete mechanism and pinned by RED tests at task time (Constitution Principle I).

Four parallel research agents were dispatched (SSE/transport, CDN/storage read path, local IPC/spawn, clocks/IDs/delivery). Each was instructed to verify current (2026) facts against primary sources rather than answer from memory, and to flag uncertainty explicitly rather than guess. Their raw findings informed the decisions below.

**The architecture survived.** Every settled decision from the design record held up against real facts: the sidecar topology, SSE-for-commands + POST-for-telemetry, sidecar-outbound-only, minted machine-local `installationId`, immutable per-event objects, B2 fronted by a CDN, plane-as-only-reader, buffered commands with visible expiry. What research falsified was *mechanism-level detail* and, in two places, *stated reasoning* — which is exactly what plan-time research is for.

---

## ⛔ Do NOT re-derive: B2 read caps are real (operator ground truth)

**Status: SETTLED by the operator, 2026-07-16. Do not re-open. Do not "correct" this from a pricing page.**

The design record's constraint stands **as written**:

> B2 reads are aggressively capped. Read economics — not global distribution — are what put a CDN in this design. Any read path that amplifies B2 transactions is a defect.

**Why this note exists.** Backblaze's public transaction-pricing page currently renders "Cost: Free" for transaction Classes A, B, and C, naming a daily allowance only for Class D. Reading that page, the CDN research agent concluded the design's cost premise was obsolete, and the planning agent independently fetched the same page and reached the same conclusion. **Both were wrong.** The operator has hit Class B read caps in production on another project recently and did substantial work to route around them. Direct production experience is authoritative; a vendor marketing page is not.

Corroborating the operator rather than the pricing page: Backblaze's own help-center documentation describes the older model (2,500 free Class B/C transactions per day, then per-call pricing), and the agent found third-party sources still describing it. **Backblaze's own surfaces contradict each other.** The agent also could not find any announcement or changelog dating a transition, and explicitly flagged the finding as requiring confirmation against a real invoice before being load-bearing. It was not confirmed; it was refuted.

**How to apply:**

- The CDN's justification is **read-amplification against a capped origin**, exactly as the design record states. Egress (free only to 3× average monthly storage, then $0.01/GB) and origin latency are *additional* reasons, not replacements.
- **Never "fix" the spec's or the design record's "capped" language on the basis of a vendor pricing page.** That page has already produced this exact false positive twice, from two independent agents.
- Spec language deliberately says "capped durable store" / "content-delivery layer" rather than naming a vendor billing mechanism. Keep it that way — per `.claude/rules/documentation.md`, hardcoding rot-prone vendor specifics is a known bug factory, and this vendor's own documentation is self-contradictory, which is the rot in action.
- This is the **third** time the CDN's rationale has been mis-reasoned in this design's history (the record documents the prior two: "why a CDN for a localhost dashboard," and mislocating the CDN on the browser hop). The conclusion — keep the CDN — has survived every time. Treat proposals to re-justify the CDN with suspicion.

---

## Findings that amend the spec

Research surfaced four defects in *specified* mechanism. Each is cheap to fix now and expensive after data exists or code lands. Each is recorded as a plan decision, reversible by the operator.

### R-01 — The object key has two independent defects (HIGH confidence: two agents, different lenses, converged)

`FR-063` specifies `{bucket}/runs/{installationId}/{runId}/events/{invocationSequence}-{eventId}.json`.

Two agents independently found it defective, neither aware of the other's work — the cross-perspective agreement this project treats as the high-confidence signal:

1. **It forecloses sequence probing.** `invocationSequence` is monotonic, so the plane should walk `0, 1, 2, … → 404` and never list. But `eventId` is in the filename, so the plane cannot construct the URL without already knowing the `eventId` — the very thing it is discovering. The cheapest read strategy is unreachable as specified.
2. **It does not sort.** Lexicographically `10-` precedes `2-`. Any listing or ordered enumeration is wrong by default.

**Decision:** the object key becomes `{invocationSequence padded}.json` — zero-padded fixed width, with `eventId` carried *inside* the object rather than in the key. Sequence is already unique within a run, so the key stays collision-free. This restores sequence probing and makes lexicographic order correct.

**Rationale:** both defects dissolve at once, listing leaves the read path entirely (demoted to a reconciliation backstop, see R-04), and the change is a rename now versus a migration later.

**Amends:** FR-063, FR-064. **Alternatives rejected:** keep `eventId` in the key and accept listing on the read path (pays latency forever to preserve a field that belongs in the payload).

### R-02 — `installationSequence` across sidecar restart is an unaddressed hole (genuine gap in the design record)

The record decides the sidecar is the sequencer and that runs survive its restart, but never says what happens to the **counter** on restart. FR-042 requires the plane to never regress live registry state from an older sequence. A restarted sidecar resuming from zero therefore makes every subsequent event look like a regression — the plane would reject its own fleet's ongoing telemetry. Nothing in the record closes this.

**Decision:** `installationSequence` is **durable, monotonic, and never resets** across sidecar restarts. It is persisted with the machine-local state (PT-001) and restored on start; the sidecar resumes from the high-water mark. A sequence that cannot be restored is a fail-loud condition (Principle V), never a silent reset to zero.

**Rationale:** the sequence's stated jobs — transport diagnostics, gap detection, spool restoration — all require continuity across exactly the restart that would break a volatile counter. A monotonic-across-restart counter is what FR-042 already assumes without saying so.

**Amends:** FR-039, FR-042 (adds the restart clause). Feeds PT-001 (the counter joins the machine-local store) and R-04 (gap detection reads the high-water mark).

### R-03 — "Must not exit holding an un-flushed spool" is unachievable as promised

The spec's Edge Cases and PT-003 both promise the sidecar must not exit holding an un-flushed spool. **No shutdown sequence can deliver this**: `SIGKILL` runs no code, and Windows does not deliver a real `SIGTERM`. As written, it is a promise the system cannot keep — the class of overclaim the design record's own "say so plainly" discipline rejects.

**Decision:** invert the guarantee. A **crash-safe on-disk write-ahead spool** makes exiting-with-an-unflushed-spool **non-catastrophic** rather than impossible: records are durable before acknowledgement, and a restarted sidecar replays them. Graceful shutdown is demoted from a correctness guarantee to a latency optimization.

This composes exactly with FR-049 (the spooled object is byte-for-byte identical to what is transmitted and stored), which is what makes replay-after-restart sound.

**Rationale:** honest guarantees over aspirational ones. The promise that survives is testable by `SIGKILL`-ing a sidecar mid-spool and asserting no record loss on restart — a test the original phrasing could not pass by construction.

**Amends:** the Edge Cases bullet, PT-003.

### R-04 — Gap detection cannot read the durable store to decide what is missing

FR-015's classification (live-only / aggregated / durable) makes the durable object set **sparse by design** — most events never become objects. So a gap detector that infers "missing" from absent objects reports permanent false positives on events that were never meant to be stored.

**Decision:** gap detection operates on the **sidecar's durable high-water mark** (R-02) plus event age, never on object-store contents. Classification: a sequence below the high-water mark and older than the settle bound is *lost*; below the mark and younger is *in-flight/retrying*; above the mark is *never sent*. Listing survives only as an **off-hot-path reconciliation backstop** that diffs stored objects against a manifest — the one mechanism that catches a lost manifest write, which is otherwise a silent lie of omission.

**Rationale:** distinguishes "lost" from "never sent" from "still retrying", which absence-of-object cannot. Keeps FR-042's diagnostic promise honest.

**Amends:** FR-042 (gap detection is high-water-mark-based). The settle bound joins PT-014.

---

## Plan-Time Contracts — settled

### PT-001 — Local socket transport, discovery, and machine-local state lookup

**Decision:**
- **Transport: Unix domain sockets, with Windows named pipes via Node's single `net` path API.** Reject localhost TCP.
- **Authorization comes from a `0700` parent directory, NOT the socket file mode.** This is the load-bearing correction: `unix(7)` states POSIX makes no guarantee about socket-file permissions and that "on some systems (e.g., older BSDs), the socket permissions are ignored. Portable programs should not rely on this feature for security." macOS is BSD-derived. Directory search permission is the universally-enforced mechanism; socket mode `0600` is defense-in-depth only.
- **Split the state store by lifetime.** Durable (`installationId`, bearer token, `installationSequence` high-water mark): `XDG_STATE_HOME` / `~/Library/Application Support` / `%LOCALAPPDATA%`. Ephemeral (socket/pipe endpoint): `XDG_RUNTIME_DIR` / `$TMPDIR` / named pipe — correctly cleared on reboot, which a socket should be.
- **Keyed by `sha256(realpath.native(installationRoot))[0:16]`.**
- **Token at rest: `0600` file. No OS keychain** — disproportionate for a single-operator tool, and it buys little once the token never crosses the socket (below).
- **The CLI never transmits the bearer token over the local socket.** The sidecar reads it from its own state file.

**Rationale:** the socket path is the forcing constraint — UDS paths are limited to 107 usable bytes on Linux and 103 on macOS, and this bites real tools today. Hashing into a short runtime dir keeps the macOS worst case around 76 of 103. It also means the socket is never under the installation root (which could be arbitrarily deep).

The never-send-the-token rule is the highest-leverage decision here. Windows named pipes get a NULL default DACL that Microsoft documents as granting "read access to members of the Everyone group and the anonymous account", and libuv does not expose `SECURITY_ATTRIBUTES`. With the token on the wire, that is a credential-disclosure bug; with the token read from a `0600` file by the sidecar alone, it degrades to a low-severity telemetry-visibility note and demotes pipe-squatting to a fail-open non-event.

**Alternatives rejected:** localhost TCP (needs a token and port allocation, and is reachable by any local process/user — strictly worse than UDS with no compensating benefit); relying on socket file mode for authorization (unsound on macOS per `unix(7)`); keychain (over-built here).

### PT-002 — Spawn race and stale locks

**Decision:** a two-layer guard — an **advisory debounce in the CLI** (cheap, avoids thundering-herd spawns) plus an **authoritative election in the sidecar** via bind-wins: whoever successfully binds the socket/pipe is the sidecar; `EADDRINUSE` means someone else won, and the loser exits silently. Stale-socket recovery: on `ECONNREFUSED` against an existing socket file, verify liveness by **PID + process start-time** (start-time defeats PID reuse), then unlink and re-bind.

**Rationale:** bind-wins is atomic at the OS level, which is what makes the election authoritative rather than advisory. Node has **no native `flock`** (open since 2014), which is why liveness is reconstructed in userspace from PID + start-time; a lockfile carrying a bare PID is unsound because PID reuse is a real hazard.

**Alternatives rejected:** bare-PID lockfile (PID reuse); `proper-lockfile` (adds a dependency for what bind-wins gives atomically); abstract sockets (Linux-only).

### PT-003 — Idle lifetime vs spool durability

**Decision:** **WAL-first spool** (see R-03) with an idle-exit around 10 minutes. Because the spool is crash-safe, idle-exit is safe by construction rather than by careful sequencing. Clean shutdown flushes and exits; an unclean one replays on next start.

**Rationale:** R-03 dissolves the original tension. Once exiting-with-a-spool is non-catastrophic, idle-exit is a resource decision rather than a correctness one.

### PT-004 — Delivery-layer read mechanism

**Decision:** **Cloudflare as a pull-through cache over a public B2 bucket** — custom domain, mandatory Transform Rule, Cache Rules, Smart Tiered Cache. **No Worker. No R2.** Plus:
- **An explicit Cache Rule marking `.json` eligible for cache.** Cloudflare does not cache JSON by default; `.json` is absent from the default-cached extension list. Every object in this design is `.json`. Stood up with defaults, the cache hit rate is **zero** and the shield is decorative *while appearing to work* — the data is still correct, so nothing surfaces the failure. This single finding justifies the research pass.
- **Immutable period manifests** replace listing on the read path: one cacheable GET instead of N paginated round-trips (listing pages at 1,000 objects, so a 10,000-event run costs 10 sequential LISTs).
- **The plane's own index resolves the manifest-revision pointer** — no mutable `latest.json`, no listing to find the newest revision.
- **The Transform Rule is a security control, not a convenience.** Without `concat("/file/<bucket>", http.request.uri.path)`, the hostname is an open proxy to every other bucket on that B2 origin.

**Rationale:** a Worker's only job would be the dynamic listing that manifests eliminate; once listing is off the read path, the Worker has no purpose and costs compute, a deploy surface, and a failure mode. Worker subrequests are also not automatically edge-cached, so it would hand-roll what Cache Rules give declaratively.

**R2 evaluated and rejected on the merits** (not merely on procedure): R2 prices `ListObjects` as Class A at $4.50/million where B2 gives listing free, and R2 storage is ~2.2× B2's. R2's genuine edge — unconditional free egress — is already obtained by the B2+Cloudflare pairing. **The settled B2 decision survives contact with R2's 2026 numbers.**

**Alternatives rejected:** Worker (above); R2 (above); force-caching LIST responses (caches a stale answer to "what exists right now" — a correctness bug, and continuation tokens guarantee unique cache keys so it would not hit anyway).

### PT-005 — Derived-artifact staleness, revision, and backfill

**Decision:** **revision-in-the-key + `Cache-Control: public, max-age=31536000, immutable` on everything. Never purge.** A new revision is a new URL (`derived/summary-{rev}.json` or content-addressed by hash), so **staleness becomes unrepresentable rather than operationally avoided**. The plane's own index holds the current revision — it derived the artifact, so it never needs to discover it.

**One deliberate exception:** 404s on the probe path must **bypass cache**. Sequence probing terminates on 404, and Cloudflare caches 404s with a short but nonzero TTL — a cached "doesn't exist" for sequence N would stall the plane when event N lands a second later. Everything else caches forever; this is the one place a no-cache decision is required, and it is easy to miss.

**Rationale:** purge is eventually consistent across the edge, so there is a real window in which stale IS served — violating the requirement outright. Purge also fails silently (a rate-limited purge serves stale data with no signal), whereas a revision-in-key scheme that fails simply does not produce the new URL, which is loud.

**Alternatives rejected:** CF purge API (above); mutable `latest.json` pointer with short TTL (reintroduces a mutable object and a staleness window into an immutability-thesis design).

### PT-006 — `runId` uniqueness scope and invocation linkage

**Decision:** **`runId` is globally unique** (UUIDv7). The storage path stays `{installationId}/{runId}/…`; invocation linkage lives in event **data**, not the path. Invocation:run is **1:N**. **No third sequence** is introduced.

**Rationale:** a globally-unique `runId` makes the path collision-free by construction, which is simply the right answer rather than a close call. Carrying `invocationId` in the path would bloat the key to encode a relationship the payload already carries.

### PT-007 — Plane restart beyond commands

**Decision:** command acceptance already survives restart by design decision (FR-056). On restart the plane rebuilds live registry state from **sidecar re-announcement**: sidecars detect stream death, reconnect with backoff (PT-014), and re-announce their live runs. The registry is explicitly **derived, not authoritative** — the sidecars are.

**Rationale:** consistent with the record's authority split (stackctl owns execution; the plane aggregates). A plane that treated its in-memory registry as authoritative would have to persist it, which buys nothing the re-announce path does not.

### PT-008 — Telemetry redaction and retention policy

**Decision:** redaction boundary and ordering are already fixed (FR-047/048). Policy settled here: a **deny-by-default field policy** — absolute paths are normalized to installation-relative or dropped; usernames, home-directory segments, and hostnames are redacted; commit messages and error content are length-capped; branch names retained. Retention: durable objects are retained indefinitely by default (they are the historical record the feature exists to provide), with retention a plane-side configuration rather than a sidecar concern.

**Rationale:** the sidecar is the last hop under the operator's control, and redaction precedes spooling (FR-048), so a deny-by-default policy is what keeps un-redacted data off local disk.

### PT-009 — Artifact reference semantics

**Decision:** artifacts are referenced as **opaque identifiers plus installation-relative paths**, never `file://` URLs and never absolute host paths. A remote client refers to a filesystem it cannot reach, so "quick-access" means **copy-path**, not open-link.

**Rationale:** the design record already names the constraint; this fixes the shape. Installation-relative paths also compose with PT-008's redaction (absolute paths never leave the host).

### PT-010 — Reconciliation window length

**Decision:** the bound joins PT-014 as a pinned constant. Semantics: during the window a run reports `abnormally-disconnected` with termination reason unknown (FR-026) — never "healthy", never "crashed". The window must comfortably exceed sidecar restart + reconnect, since sidecar restart is the case that closes every socket while nothing has died.

### PT-011 — `cancel` semantics

**Decision:** `cancel` is **cooperative and task-boundary-scoped**: it sets a cancellation flag the run observes at its next task boundary; it does not interrupt a task mid-execution. It ends the **run**, not the invocation. Child processes are **not** forcefully terminated — that is the named future `terminate` verb's job, which exists precisely to keep cooperative `cancel` unambiguous. Cancellation does not time out; a run that never reaches a boundary stays `cancelling` **visibly**, which is honest rather than silently escalating to a kill.

**Rationale:** matches the record's requested-vs-applied discipline (FR-059) and the authority boundary (FR-079 — the plane does not own cancellation semantics; stackctl does).

### PT-012 — Completed-instance retention in the live registry

**Decision:** completed/failed/cancelled runs remain in the live registry for a bounded window (constant → PT-014), scoped **per installation**, then drop out of live state and are served from history. Independent of durable retention (PT-008).

### PT-013 — Clock semantics

**Decision:** **sequences order; clocks describe.**
- **Ordering within a run:** `invocationSequence`. Never a timestamp.
- **Ordering across runs on a host, and across hosts:** not defined by wall-clock. Only causal relationships the data actually carries are asserted; the design already forbids inferring cross-run relationships from `installationSequence`.
- **Durations:** monotonic deltas computed **at source** and carried in the event. The plane **cannot** difference `hrtime` values even in principle — they are meaningless across processes and hosts.
- **Display/description:** wall-clock timestamps, explicitly non-authoritative for ordering.
- **Plane-side receive time:** recorded for diagnostics.
- **Skew estimation:** attach as a **diagnostic only, never auto-correct.** Honestly, it is near-worthless for correctness here — the architecture already routes around skew by never ordering on wall-clock. **If scope must be cut, cut this first.**

**Rationale:** this is the decision that makes cross-host ordering sound without a distributed clock. It also means an injected `Clock` interface is required for testability (Principle VI — dependency injection with interface types).

### PT-014 — Constants and protocol contracts

All pinned by RED tests. Values below are **engineering judgment sized against real infrastructure floors**, not looked-up facts — flagged as such so a future reader does not mistake them for measurements:

| Constant | Value | Basis |
|---|---|---|
| SSE keepalive interval | 15s | Must be well under the real idle floor: ALB 60s, nginx `proxy_read_timeout` 60s, Cloudflare ~100s |
| Client read-idle timeout | 45s | 3× keepalive |
| Reconnect backoff | full jitter, base 1s (reseeded by server `retry:`), ×2, cap 30s | Standard; base reseeded per SSE spec |
| Backoff reset | after 60s healthy | Prevents a flapping link from pinning max delay |
| Sidecar idle-exit | ~10 min | Safe by construction given the WAL (R-03/PT-003) |
| Command expiry, reconciliation window (PT-010), completed-retention (PT-012), gap settle bound (R-04), max event size, spool cap + drop policy, invocation buffer bound (FR-007), token lifetime/rotation | pinned at task time | — |
| Object key padding width | fixed width, zero-padded (R-01) | Lexicographic correctness |

**Reconnect policy:** retry forever, **except** terminal-fail states — per the SSE spec, a non-200 or wrong `Content-Type` is terminal (distinct from *reestablish*), as are 401/403 (an invalid token will not fix itself by retrying).

### PT-015 — Credential provisioning transport

**Decision:** the token is placed into the machine-local durable store (PT-001) by an explicit operator-run verb. No join-code exchange, no automatic enrollment. Revocation is plane-side: removing a token from the accepted set refuses that installation (FR-088) without touching the rest of the fleet.

**Rationale:** proportionate to a single-operator fleet; FR-088's guarantees are met without building an enrollment protocol nobody asked for.

---

## Additional decisions (no PT, but required)

### SSE client

**Decision:** depend on **`eventsource-parser`** (dependency-free, MIT) for **framing only**; own the connection loop over an **injected `SseTransport`** backed by native `fetch`.

**Rationale:** both the `eventsource` and `eventsource-client` packages are thin wrappers over that same parser, and both own the reconnect loop the design record explicitly says we must own ourselves. Taking the parser directly *removes* a wrapper rather than adding one.

**Wire-format rules that are easy to get wrong** (pinned by tests): `Last-Event-ID` is a **request header**, not a query parameter; the last-event-ID buffer **persists across events that omit `id:`** and updates even on dispatches that fire no event.

### Transport topology — two connections is the baseline

**Decision:** **two dispatchers / two connections** (one for the SSE stream, one for telemetry POSTs). HTTP/2 multiplexing is a later, evidence-gated optimization.

**Rationale:** Node's `fetch` does **not** negotiate HTTP/2 on this repo's target — `allowH2` defaults to `false` in the undici versions Node 20–24 bundle, flipping only in undici v8 (Node ≥22.19.0). The design record already blessed this outcome: *"the system must still function over HTTP/1.1 using two connections. Absence of HTTP/2 is a cost, never a protocol failure."* So the baseline is the record's own fallback, not a deviation.

**A trap to refuse:** forcing multiplexing via undici `connections: 1` would likely make telemetry POSTs **queue forever** behind an SSE response that never completes — converting a cost into an actual protocol failure, precisely what the record forbids. This head-of-line reasoning is **inference, not verified**; it is pinned as a RED test that must run before the topology is fixed.

### Identifier generation

**Decision:** `installationId` → **UUIDv4** (`crypto.randomUUID()`, stdlib). `eventId` / `invocationId` / `runId` → **UUIDv7** via the zero-dependency `uuidv7` package.

**A version trap avoided:** `crypto.randomUUIDv7()` exists only in **Node 26.1.0+**. This repo declares `"node": ">=20"` and runs 22.19.0, where it is `undefined` — a plan reaching for the stdlib v7 would crash at the declared engine floor. The package is also *better*: Node's v7 lacks the `rand_a` counter, so it is not monotonic within a millisecond.

`installationId` stays v4 deliberately: it is never sorted, and v7 would leak installation time for no benefit.

**A rule that must hold, because v7 invites breaking it:** **`eventId` is identity, never an ordering key.** v7's payoff here is range-eviction of the dedupe window by time prefix; its cost is a wall-clock leak that tempts illegitimate ordering. Ordering is `invocationSequence`'s job (PT-013).

### Dedupe is an optimization, not a correctness mechanism

**Decision:** state plainly that the plane's `eventId` dedupe set is an **optimization**. FR-042's no-regress rule plus deterministic object naming make ingestion correct with the dedupe set entirely absent.

**Rationale:** worth recording explicitly, or the next engineer agonizes over its TTL as though correctness depends on it. The record's object-naming reasoning checks out and rests on FR-049 byte-identity: identical bytes mean a duplicate PUT is a no-op, so last-writer-wins is harmless.

**Alternative rejected:** `If-None-Match` — adds a 412 branch that must be read as *success*, which is a trap.

---

## Testability strategy

Per Constitution Principle I (test-first) and the project rule preferring real fixtures over mocks:

- **Real in-process `node:http` servers** on ephemeral ports for SSE/transport tests — a fixture, not a mock, because **a mock cannot be cruel**: it will not stall without EOF or die mid-frame, which are the failures that matter.
- **Real sockets, processes, and files** for IPC/spawn tests.
- **Injected `Clock` and `SseTransport` interfaces** (Principle VI — DI with interface types) so 45-second timeout tests run in microseconds.
- **Injected `ProcessProbe`** for PID + start-time liveness.
- **NOT vitest fake timers** — a verified open bug means they do not fake `performance.now()`, which is exactly the clock PT-013 relies on.
- **Machine-local store redirected to a temp dir in every test.** Non-negotiable: without it, a test run mints identity into the real developer's `$HOME` (see the Constitution Check's isolation exception in [plan.md](./plan.md)).
- **Highest-value single test:** keepalive comment frames must re-arm the read-idle watchdog. It is the likeliest implementation bug, and it fails silently as a mystery disconnect every ~45 seconds.

## Open items explicitly carried (not gaps — bounded)

- **Move vs. clone identity is in genuine tension.** Path-hash keying (PT-001) delivers FR-033's clone-re-mints requirement, but `mv ~/proj ~/proj2` then *also* silently re-mints, losing identity and history. Auto-detecting a move requires an in-tree marker — which a clone copies, reintroducing the collision minting exists to prevent. **Decision: mint-new on move, plus an explicit `reattach` escape hatch.** Recorded as a plan decision; the operator may overturn it.
- **`T_SETTLE` (gap settle bound) is a formula, not a measured value** — it derives from the backoff schedule fixed in PT-014. Pin the derivation, not a magic number.
- **Bandwidth Alliance × the 3× egress rule** could not be reconciled from first-party sources. Not load-bearing (the CDN is justified by the capped reads per the operator's ground truth regardless), but do not assert the interaction as fact.
