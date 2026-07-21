# Fleet dashboard — design record

- **Roadmap item:** `design:feature/fleet-dashboard`
- **Date:** 2026-07-21
- **Supersedes (architecture axis):** `docs/superpowers/specs/2026-07-19-fleet-dashboard-design.md` (the plane-embedded validation-build sketch, PR #529)
- **Status:** designing — awaiting operator `design-approved:` marker

## problem-domain

The fleet control plane exposes a read API that projects live fleet state.
Operators need a **browser surface** over that API: a live ops window showing which
instances are active right now and what each is doing, with the ability to drill
into any one instance (and, from there, any one run) for its detail, timeline,
history, and timings.

A **validation build** (PR #529, merged to main 2026-07-20) proved the plane end
to end but is architecturally rejected (operator decision 2026-07-21):

1. **In-process.** It runs *inside* the plane process, serving static routes
   alongside `/v1/*`, yet is a client-side SPA that calls the plane's own authed
   HTTP API — a browser app reaching back into the process that hosts it.
2. **Credential-class violation.** Having no credential of its own, it reuses a
   sidecar's **telemetry token** — snapshotting the first plane-accepted token at
   startup (`src/dashboard/serve.ts`, `[...acceptedBearers.keys()][0]`). The
   dashboard therefore authenticates *as a sidecar*, and its operation is coupled
   to whether/when a sidecar enrolled before startup (blank until an instance
   connects — backlog TASK-476/TASK-477).

The read side reusing the telemetry-token registry is the root defect that forced
that reuse: today the consumer read routes are wrapped in the same `withAuth`
guard (`src/plane/runtime.ts`) that verifies sidecar ingest against
`TokenRegistry` (`src/plane/http/auth.ts`), so the *only* credential that can read
the fleet is a sidecar's minted token.

**What this feature is:** a standalone, out-of-process dashboard — a thin
**backend-for-frontend (BFF)** server plus its browser UI — that consumes `/v1/*`
as an ordinary external client holding its own **read credential**, plus the one
modest plane-side change that lets such a credential exist. The in-process build
under `plugins/stack-control/src/dashboard/` is removed when this ships.

### Explicitly out of scope

- **Fleet command dispatch / "commandable runs."** The ROADMAP entry and the
  `/v1/*` docs still say "read + command" and "fleet table of commandable runs";
  that framing is stale prior-session scope, disowned by the operator
  (2026-07-21) and not near-term. This feature is **read-only**: no command
  button, no command-authority credential scope. This is deliberately *not*
  carried as a "for later" open question — it is simply not part of the fleet
  roadmap right now.
- **Human authentication and browser session security.** No login page, password
  handling, OAuth/OIDC flow, browser session, cookie-security scheme, token
  refresh, user database, authorization role, or identity-provider integration.
  Browser-facing trust is delegated to deployment infrastructure (decision 13).

## solution-space

Five axes, each with the chosen option and the rejected alternative(s) + reason.

### Axis 1 — app process architecture

- **Chosen: standalone out-of-process app.** Its own process, own credential,
  HTTP-only coupling to `/v1/*`. This is the operator's 2026-07-21 rebuild
  decision and the reason the item re-entered design.
- **Rejected: plane-embedded in-process SPA** (the PR #529 prototype). Couples the
  reader to the plane process, has no credential of its own, and forces the
  telemetry-token reuse. The exact model being replaced.

### Axis 2 — browser-to-plane topology

- **Chosen: backend-for-frontend (BFF).** A thin dashboard **server** holds the
  plane read credential and is the only party that talks to `/v1/*`. The browser
  talks only to the dashboard origin. Consequences: no plane CORS surface; no
  plane bearer stored in browser JavaScript; **same-origin SSE** (native browser
  `EventSource` cannot attach an `Authorization` header, so the server terminates
  the authed upstream stream and re-emits it same-origin); multi-plane targeting
  can later live in the server without exposing multiple credentials to the
  browser. This also makes "own process" load-bearing rather than a static-file
  server, and — per the operator's steer — it *reduces* total security surface by
  concentrating the one credential server-side.
- **Rejected: direct browser-to-plane.** A static browser app calling `/v1/*`
  with a browser-held bearer. Requires a plane CORS policy, browser credential
  storage/provisioning/rotation, and an SSE-auth workaround (cookie or
  query-string token, since `EventSource` can't set headers). Thinner to deploy
  (pure static assets) but spreads the security model across browser + plane for
  no functional gain over the BFF.

### Axis 3 — home-surface entity root

- **Chosen: instance-rooted.** One row per instance (`GET /v1/instances`), matching
  the shipped instance-observability model (037), where the instance is the
  top-level unit and runs are a facet. The drawer shows instance state +
  `recentActivity` + the instance's runs; you drill from a run into run
  history/timings. Consistent with the ops question "which of my machines is doing
  what."
- **Rejected: run-rooted** (one row per run, `GET /v1/fleet`, instance as owning
  context). Its main rationale was the now-dead command-dispatch "fleet of
  commandable runs" framing; with command out, the instance root is the more
  natural fit and matches 037.
- **Rejected: two separate first-class views** (Instances | Runs, never mixed).
  Clearest separation, but more surface to build than the headline jobs justify;
  the run view is reachable as a drill-in facet instead.

### Axis 4 — app home

- **Chosen: a new workspace package in the monorepo**, out-of-process from the
  plane, sharing repo tooling. First-class-external in every load-bearing sense
  (own process, own credential, HTTP-only coupling) while avoiding the cost of a
  separate repo/CI/deploy now.
- **Rejected-for-now: a separate repository.** The isolation it buys over
  "separate package, separate process" is deploy/release independence we do not
  need yet. Left as a later spin-out, not built now.

### Axis 5 — credential-class boundary on the plane

- **Chosen: a read credential that is a distinct credential *class* from telemetry
  tokens**, stated as a behavioral invariant (below) rather than a storage
  prescription. Kept minimal: enough to let a legitimate read credential exist and
  guard the read routes — no scopes/roles apparatus.
- **Rejected: unified registry with a `kind` tag feeding one generic `withAuth`
  result.** Two typed records in one store *could* satisfy the invariants, but a
  single generic verification result is exactly how a reader could accidentally be
  accepted on an ingest route; the load-bearing property is the rejection
  invariant, not the store count.
- **Rejected: a front gateway/proxy process that terminates consumer auth.**
  Maximal isolation but a whole new network hop + deploy surface — heavy for
  "accept a second credential class." (The BFF is *not* this: the BFF is the
  external client, it does not sit in the plane's trust path or re-terminate
  sidecar auth.)

## decisions

1. **Out-of-process BFF app** (Axes 1–2): a thin dashboard server holding the read
   credential + a browser UI talking only to the dashboard origin. The in-process
   `src/dashboard/` build is removed when this ships.
2. **Read-only.** No command dispatch, no command-authority scope. The table is
   instances, not "commandable runs."
3. **Two headline jobs:** (a) live fleet situational awareness — the instance table
   updating in place off `GET /v1/instances/stream`; (b) drill-in — a per-instance
   drawer (state + `recentActivity` + its runs), with run history/timings reached
   by drilling into a run. Historical review rides along in the drawer as a
   secondary surface, not the headline.
4. **Home surface is instance-rooted** (Axis 3).
5. **Reuse the existing read + delta API shapes — verified.** The instance-rooted
   home + drill-in needs **no new plane read projection** (see the surface→endpoint
   mapping and its honest gap below).
6. **Credential-class invariant (plane-side, storage-agnostic):** *Reader and
   telemetry credentials are distinct credential classes. A reader credential MUST
   be rejected on ingest and sidecar-only routes; a telemetry credential MUST be
   rejected on consumer read routes.* Issuance and revocation remain
   credential-specific. Whether that is separate stores, separate registries, or
   typed records in one facility is a spec/impl choice, provided these invariants
   hold.
7. **Credential lifecycle — static-minimal for this feature.** The plane accepts
   one or more **configured** read credentials, supplied via startup configuration
   or environment-backed secret material; changes take effect on restart or the
   plane's existing config-reload path. Interactive `stackctl` mint/list/revoke
   verbs are **out of scope** for this feature — a later managed-credential system
   can replace the *source* without changing the credential class or the
   route-authorization boundary (decision 6).
8. **App home: new monorepo workspace package** (Axis 4); separate-repo spin-out
   deferred.
9. **Deployable-process boundary (concrete, testable):** the package ships a
   server entrypoint started by a single documented command; it serves HTTP on a
   configurable port (**loopback by default** — decision 13 bind safeguard); it
   reads the **plane base URL** and its **read credential** (`FLEET_PLANE_URL`,
   `FLEET_PLANE_READ_TOKEN`) from its own configuration/environment; it is an
   ordinary HTTP client of
   `/v1/*` and **may run on a different host from the plane**. Single-plane target
   is the default (multi-plane is an open question). Whether the package is
   distributed with the stack-control plugin or separately is an open question; it
   does not block the process boundary above.
10. **Nonvisual interaction contracts (fixed now — product architecture, not
    pixels):**
    - Home is a **single instance-rooted table**, not separate views.
    - Detail is a **drawer** over the table, but **deep-linkable** (the open-drawer
      state is encoded in the URL so it survives reload and is shareable).
    - **Loading / disconnected / stale:** the table surfaces each instance's
      `connection` + `liveness` (`attached` / `live` / `stale` / `gone`); on SSE
      disconnect the app shows a reconnecting/stale-data state and **re-snapshots
      then resumes deltas** on reconnect (snapshot-then-deltas).
    - **Live updates with an open drawer:** deltas keep applying underneath an open
      drawer; the drawer's instance updates in place on upsert; if the instance
      goes `gone`/removed while open, the drawer reflects that rather than closing
      abruptly.
11. **`/frontend-design` is a pre-*execute* deliverable, not improvised during
    coding.** Lifecycle: design record → spec → `/frontend-design` exploration +
    selection → implementation plan → execute. This record fixes the nonvisual
    contracts (decision 10); the visual/stack (framework, layout, pixels) is
    selected in the frontend-design pass *before* execution.
12. **Cutover rule (clean break, no coexistence):** the standalone dashboard MUST
    pass its acceptance tests against a released plane **before** the embedded
    dashboard (`src/dashboard/`) and its routes are removed, in the **same feature
    branch**. No supported release contains both dashboard architectures as product
    surfaces. After removal, the former in-process routes (`/`, `/dashboard/*`)
    match no route and return the plane's standard **404** (no diagnostic-redirect
    surface) — the expected 404 is itself a testable contract. Per
    `.claude/rules/agent-discipline.md` § "Zero backwards compatibility."
13. **Browser-facing trust boundary — delegated to deployment infrastructure
    (settled, not an open question).** The dashboard implements **no** human
    authentication, browser session management, identity-provider integration, or
    application-level user authorization. Browser-facing authentication and access
    policy are delegated to deployment infrastructure — an ingress proxy,
    service-mesh gateway, identity-aware proxy, mTLS boundary, or equivalent. The
    dashboard server **assumes requests reaching its browser-facing listener have
    already crossed that trusted perimeter**, and MUST NOT expose a secondary or
    fallback application authentication mechanism. The *specific* proxy (Istio,
    Envoy, an ingress controller, Cloudflare Access, oauth2-proxy, …) is deployment
    policy and is **not** selected by this design.
    - **Two separate trust relationships.** *Human → perimeter → dashboard* belongs
      entirely to infrastructure. *Dashboard → plane* is a deliberately simple
      configured machine secret (`FLEET_PLANE_URL`, `FLEET_PLANE_READ_TOKEN`, per
      decision 9): the BFF attaches the read token **only** to its allowlisted
      upstream read requests; browser JavaScript never sees it. The plane's
      reader-vs-telemetry invariant (decision 6) is authorization at an API
      boundary, **not** a human-security system.
    - **Bind safeguard (concrete, testable).** The dashboard binds to **loopback by
      default** where the topology permits. A non-loopback bind MUST be **explicit**
      and MUST be paired with infrastructure that prevents untrusted clients from
      reaching the listener directly. The general invariant (covers container /
      mesh, where a sidecar proxy reaches the dashboard over the pod network so
      loopback may not apply): *the dashboard listener MUST either be locally
      constrained or protected from direct untrusted access by deployment-level
      network policy; the application provides no fallback browser-authentication
      mechanism.*

### Surface → endpoint mapping (Decision 5 detail)

| Dashboard surface | Source endpoint |
|---|---|
| Instance rows (home) | `GET /v1/instances` (`?include=all` for gone/disconnected) |
| Live instance deltas | `GET /v1/instances/stream` (instance-upserted / -removed) |
| Instance detail (drawer) | `GET /v1/instances/:id` — instance state + `recentActivity` |
| Instance's runs (drawer facet) | `GET /v1/instances/:id/runs` |
| Run summary (drill from a run) | `GET /v1/runs/:id` |
| Run timeline / history | `GET /v1/runs/:id/history` |
| Run timings | `GET /v1/runs/:id/timings` |
| (available, not headline) cross-run fleet view | `GET /v1/fleet` (+ `/v1/fleet/stream`) |

**Honest gap:** there is **no** instance-level `history`/`timings` endpoint —
those are run-scoped. An instance's "history" is served by `recentActivity` (on
the detail response) + its owned-runs list; per-run history/timings already exist
for the drill-in. So Decision 5 ("no new projection needed") holds **for the
scoped surface**. If a richer *instance-level* aggregated timeline is later wanted,
that is a **new** plane projection — flagged here, not silently assumed.

## open-questions

1. **BFF ↔ plane SSE relay shape.** Whether the dashboard server proxies the
   upstream `/v1/instances/stream` 1:1 per browser connection, or holds one
   upstream stream and fans out / merges to many browsers. A server-internal
   spec/impl detail; the contract (same-origin authed→re-emitted SSE) is fixed.
2. **Credential config format + reload semantics.** Given static-minimal
   (decision 7): the exact config key/env-var shape and whether changes take effect
   on restart only or via the existing live-reload path. Settle at spec time.
3. **Multi-plane targeting.** Single-plane is the default (decision 9). If several
   planes are wanted, the BFF is where that lives; config-shape question, not built
   now.
4. **Package distribution.** Whether the dashboard package ships with the
   stack-control plugin or as its own artifact (and whether a container image is a
   deliverable). Does not block the process boundary (decision 9).
5. **Removal sequencing specifics.** The cutover *rule* is fixed (decision 12);
   the task-ordering of deleting `src/dashboard/` + its routes/assets relative to
   the new app's acceptance tests is an implementation-plan detail.

## provenance

- **Operator rebuild decision (2026-07-21):** the merged validation build is
  architecturally rejected; the real dashboard is out-of-process with its own read
  credential. Captured in commit `913d9e56` and the
  `design:feature/fleet-dashboard` ROADMAP entry.
- **Operator steer (2026-07-21, this design session):** don't over-index on
  security/credential machinery — the dashboard is the feature, the credential is
  one small piece; and "commandable runs" is a disowned prior-session obsession,
  not near-term.
- **Third-party design review (2026-07-21):** approved the out-of-process
  direction; flagged browser topology and credential lifecycle as unresolved
  load-bearing axes, and asked for behavioral credential-class invariants, an
  entity-root decision, a surface→endpoint mapping, an authenticated-SSE decision,
  a concrete deployable-process boundary, and a precise cutover rule. This revision
  settles topology (BFF), entity root (instance), lifecycle (static-minimal), the
  invariants (decision 6), the mapping (above), SSE (BFF same-origin), the process
  boundary (decision 9), and cutover (decision 12).
- **Third-party follow-on review (2026-07-21):** argued the browser-facing trust
  boundary should be delegated to deployment infrastructure (identity-aware proxy /
  mesh), so the dashboard implements no human auth at all, holds only the machine
  read credential for the plane, and binds to loopback by default. Adopted verbatim
  in intent as decision 13 and the expanded out-of-scope list.
- **Superseded sketch:** `docs/superpowers/specs/2026-07-19-fleet-dashboard-design.md`
  — its surface sketch (columns, drawer tabs, delta-not-full-push) remains a
  starting point; its plane-embedded / plane-as-only-reader architecture is the
  rejected model.
- **Code grounding:** `src/plane/http/auth.ts` (telemetry `TokenRegistry`),
  `src/plane/runtime.ts` (`withAuth` guarding the consumer read routes),
  `src/plane/http/api.ts` (run-rooted snapshot + delta shapes),
  `src/plane/http/instance-api.ts` (instance-rooted snapshot/detail/runs + instance
  stream), `src/dashboard/serve.ts` (the in-process prototype + telemetry-token
  reuse).
- **Related backlog:** TASK-476 (instance-requires-events-not-heartbeat),
  TASK-477 (dashboard-bearer-startup-snapshot) — both symptoms of the rejected
  model.
