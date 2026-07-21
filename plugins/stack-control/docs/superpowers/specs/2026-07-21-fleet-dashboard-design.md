# Fleet dashboard — design record

- **Roadmap item:** `design:feature/fleet-dashboard`
- **Date:** 2026-07-21
- **Supersedes (architecture axis):** `docs/superpowers/specs/2026-07-19-fleet-dashboard-design.md` (the plane-embedded validation-build sketch, PR #529)
- **Status:** designing — awaiting operator `design-approved:` marker

## problem-domain

The fleet control plane exposes a read API (`GET /v1/fleet`, `/v1/fleet/stream`,
`/v1/runs/{id}`, `/v1/instances/{id}`, `/v1/runs/{id}/history|timings`) that
projects live fleet state. Operators need a **browser surface** over that API: a
live ops window that shows what runs/instances are active right now and what
phase each is in, and lets you drill into any one run/instance for its phase
timeline, history, and timings.

A **validation build** (PR #529, merged to main 2026-07-20) proved the plane end
to end but is architecturally rejected (operator decision 2026-07-21):

1. **In-process.** It runs *inside* the plane process, serving static routes
   alongside `/v1/*`, yet is a client-side SPA that calls the plane's own authed
   HTTP API — a browser app reaching back into the process that hosts it.
2. **Stolen credential.** Having no credential of its own, it injects the first
   plane-accepted **sidecar telemetry token** snapshotted once at startup
   (`src/dashboard/serve.ts`, `[...acceptedBearers.keys()][0]`). The dashboard
   therefore authenticates *as a sidecar*, and its operation is coupled to
   whether/when a sidecar enrolled before startup (blank until an instance
   connects — backlog TASK-476/TASK-477).

The read side reusing the telemetry-token registry is the root defect that forced
the theft: today the consumer read routes are wrapped in the same `withAuth`
guard (`src/plane/runtime.ts`) that verifies sidecar ingest against
`TokenRegistry` (`src/plane/http/auth.ts`), so the *only* credential that can read
the fleet is a sidecar's minted token.

**What this feature is:** a standalone, out-of-process dashboard app that consumes
`/v1/*` as an ordinary external client with its own **read credential** — plus the
one modest plane-side change that lets such a credential exist. The in-process
build under `plugins/stack-control/src/dashboard/` is removed when this ships.

### Explicitly out of scope

- **Fleet command dispatch / "commandable runs."** The ROADMAP entry and the
  `/v1/*` docs still say "read + command" and "fleet table of commandable runs";
  that framing is stale prior-session scope, disowned by the operator
  (2026-07-21) and not near-term. This feature is **read-only**. No command
  button, no command-authority credential scope, and this is deliberately *not*
  carried as a "for later" open question — it is simply not part of the fleet
  roadmap right now.

## solution-space

Three axes, each with the chosen option and the rejected alternative(s) + reason.

### Axis 1 — app architecture

- **Chosen: standalone out-of-process app.** Its own process, own credential,
  talks HTTP to `/v1/*` like any external consumer. This is the operator's
  2026-07-21 rebuild decision and the reason the item re-entered design.
- **Rejected: plane-embedded in-process SPA** (the PR #529 prototype). Couples the
  reader to the plane process, has no credential of its own, and forces the
  telemetry-token theft. This is the exact model being replaced.

### Axis 2 — app home

- **Chosen (proposed): a new workspace package in the monorepo**, out-of-process
  from the plane, sharing repo tooling. First-class-external in every load-bearing
  sense (own process, own credential, HTTP-only coupling) while avoiding the cost
  of standing up a separate repo/CI/deploy now.
- **Rejected-for-now: a separate repository.** The strongest form of external
  consumer, but the isolation it buys over "separate package, separate process"
  is deploy/release independence we do not need yet. Left as a later spin-out
  (open question below), not built now.

### Axis 3 — read-credential integration on the plane

- **Chosen (proposed): the plane accepts a read credential distinct from telemetry
  tokens**, verified on the consumer read routes — so a reader never presents a
  sidecar's token and read access is decoupled from sidecar enrollment timing.
  Kept deliberately small: enough to let a legitimate read credential exist and
  guard the read routes, not a scopes/roles apparatus.
- **Rejected: unified token registry with a `kind` tag + per-route kind check.**
  Less new code, but it keeps reader identity and sidecar identity in one store
  and one revocation path — re-entangling exactly what the rebuild exists to
  separate.
- **Rejected: a front gateway/proxy process that terminates consumer auth.**
  Maximal isolation, but a whole new network hop and deploy surface to build and
  secure — heavy for what is fundamentally "accept a second credential type."

## decisions

1. **Out-of-process app** consuming `/v1/*` as a first-class external client
   (Axis 1). The in-process `src/dashboard/` build is removed when this ships.
2. **Read-only.** No command dispatch; no command-authority credential scope. The
   table is runs/instances, not "commandable runs."
3. **Two headline jobs:** (a) live fleet situational awareness — the runs/instances
   table updating in place off the existing `GET /v1/fleet/stream` SSE delta
   contract; (b) drill-in — a per-run/instance drawer with phase timeline,
   history, and timings. Historical review rides along in the drawer as a
   secondary surface, not the headline.
4. **Reuse the existing read + delta API shapes.** The headline surface needs no
   new plane read projections — snapshot-then-deltas and the per-run/instance/
   history/timings endpoints already exist.
5. **The plane gains a read credential distinct from telemetry tokens** (Axis 3,
   chosen), scoped minimally to "a reader can authenticate without a sidecar
   token." Issuance mechanics are an open question (below), to be settled at spec
   time.
6. **App home: new monorepo workspace package** (Axis 2, chosen), with separate-
   repo spin-out deferred.
7. **Visual/stack design is deferred to a `/frontend-design` pass at
   implementation.** This record fixes the surface *scope* (runs/instances table,
   drawer tabs: timeline / history / timings, live-delta-not-full-push behavior);
   it does not pin a framework or lay out pixels. Per
   `.claude/rules/agent-discipline.md` § "Use /frontend-design for all design
   tasks," the look is an implementation-time design pass.

## open-questions

1. **Credential issuance mechanics.** How a read credential comes into existence
   and is managed on the plane — two candidates to settle at spec time:
   (a) minted via a `stackctl` verb into a plane-owned store (parallel to
   `telemetry.json`) with list/revoke and live-reload, mirroring the enrollment
   machinery; or (b) seeded directly in plane config/startup like enrollment
   credentials, with revocation = edit + reload. (a) is the fuller lifecycle;
   (b) is the smaller surface. No scopes/roles model either way for this feature.
2. **Browser-origin / CORS cross-cut.** A separate-origin browser app calling
   `/v1/*` means the plane must answer CORS preflight and set the right
   `Access-Control-Allow-*` headers for the dashboard origin — the plane's HTTP
   layer today serves non-browser sidecar clients and likely has no CORS surface.
   A bounded, real plane-side item to scope. (Also implicates how a browser holds
   a bearer token — capture at spec time, don't over-engineer.)
3. **Final app-home call.** Monorepo package (proposed) vs eventual separate repo
   — ratify the package choice, keep the spin-out as a later, explicit move.
4. **Multi-plane targeting.** Whether the app points at exactly one plane
   (URL + credential in config) or can target several. Config-shape question;
   single-plane is the assumed default unless the operator wants otherwise.
5. **Removal of the in-process build.** Sequencing of deleting
   `src/dashboard/` (and its routes/assets) relative to the new app shipping — a
   clean break per `.claude/rules/agent-discipline.md` § "Zero backwards
   compatibility," not a grandfathered coexistence.

## provenance

- **Operator rebuild decision (2026-07-21):** the merged validation build is
  architecturally rejected; the real dashboard is out-of-process with its own
  read credential. Captured in commit `913d9e56` and the
  `design:feature/fleet-dashboard` ROADMAP entry.
- **Operator steer (2026-07-21, this design session):** don't over-index on
  security/credential machinery — the dashboard is the feature, the credential is
  one small piece; and "commandable runs" is a disowned prior-session obsession,
  not near-term. Recorded in memory `project_commandable_runs_dead_concept`.
- **Superseded sketch:** `docs/superpowers/specs/2026-07-19-fleet-dashboard-design.md`
  — its surface sketch (columns, drawer tabs, delta-not-full-push) remains a
  starting point; its plane-embedded / plane-as-only-reader architecture is the
  rejected model.
- **Code grounding:** `src/plane/http/auth.ts` (telemetry `TokenRegistry`),
  `src/plane/runtime.ts` (`withAuth` guarding the consumer read routes),
  `src/plane/http/api.ts` (snapshot + delta read shapes),
  `src/dashboard/serve.ts` (the in-process prototype + token theft).
- **Related backlog:** TASK-476 (instance-requires-events-not-heartbeat),
  TASK-477 (dashboard-bearer-startup-snapshot) — both symptoms of the rejected
  model.
