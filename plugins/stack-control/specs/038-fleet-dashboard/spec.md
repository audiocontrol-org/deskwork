# Feature Specification: Fleet Dashboard

**Feature Branch**: `feature/fleet-control-plane` (program long-lived branch; no per-spec branch — spec dir is authoritative)

**Created**: 2026-07-21

**Status**: Draft

**Input**: Approved design record `docs/superpowers/specs/2026-07-21-fleet-dashboard-design.md` (source of truth) + roadmap item `design:feature/fleet-dashboard`.

## Clarifications

### Session 2026-07-21

- Q: Default fleet-table membership — connected/recent only, or include stale/gone? → A: Connected/recent by default, with an explicit reveal (toggle/filter) for gone/disconnected instances.

## User Scenarios & Testing *(mandatory)*

The fleet control plane exposes a live read API. Operators need a browser surface over it: a live ops window and a way to drill into any one instance. The surface must be a standalone, out-of-process application that consumes the plane's read API as an ordinary external client with its own credential — replacing a rejected in-process prototype that authenticated by reusing a sidecar's telemetry token.

### User Story 1 - Read access uses a dedicated credential class, never a sidecar token (Priority: P1)

As the operator of the plane, I want an external reader to authenticate with a credential that is a distinct **class** from sidecar telemetry tokens, so a dashboard (or any consumer) can read fleet state without borrowing a sidecar's identity and without its access being coupled to sidecar enrollment timing.

**Why this priority**: This is the enabling, foundational slice and the fix for the root defect that sank the prototype (the read routes today are guarded by the same registry that authenticates sidecar ingest, so the only credential that can read the fleet is a sidecar's). Without it, an out-of-process reader cannot authenticate honestly. It is independently valuable and testable at the plane boundary with no UI.

**Independent Test**: Configure the plane with a read credential. A request to a consumer read route bearing the read credential succeeds; the same read credential is refused on an ingest/sidecar route; a telemetry token is refused on a consumer read route. Verifiable with API-level tests, no browser.

**Acceptance Scenarios**:

1. **Given** the plane is configured with a read credential, **When** a client calls a consumer read route with that credential, **Then** the request is authorized.
2. **Given** the same read credential, **When** a client calls a sidecar ingest route with it, **Then** the request is refused.
3. **Given** a valid sidecar telemetry token, **When** a client calls a consumer read route with it, **Then** the request is refused.
4. **Given** no read credential is configured, **When** the plane starts, **Then** consumer read routes refuse all requests (no anonymous read, no fallback to telemetry-token acceptance).

---

### User Story 2 - See live fleet state in a browser (situational awareness) (Priority: P1)

As an operator, I want to open the dashboard and see an instance-rooted table of the fleet that updates in place as instances change, so I know at a glance which instances are active, connected, and recent, and what is stalled — without manual refresh.

**Why this priority**: This is the headline value — the always-open ops window. Together with US1 it is the minimum viable product: an external, credentialed, live view of the fleet.

**Independent Test**: Run the dashboard against a plane that has a read credential and at least one instance. The browser shows one row per instance with its connection + liveness. When an instance's state changes (upsert) or it drops (removed), the row updates or disappears in place, driven by the live delta stream, with no full-page reload.

**Acceptance Scenarios**:

1. **Given** a plane with one or more instances and a configured read credential, **When** the operator opens the dashboard, **Then** the browser shows one row per instance (instance-rooted), each showing at least connection and liveness.
2. **Given** the dashboard is open, **When** an instance changes state on the plane, **Then** the corresponding row updates in place from the live delta stream without a full reload.
3. **Given** the dashboard is open, **When** an instance is removed, **Then** its row disappears from the table.
4. **Given** the live stream drops, **When** the connection is lost, **Then** the view shows a disconnected/stale indicator and, on reconnect, re-fetches a fresh snapshot and resumes applying deltas.
5. **Given** a browser is loading the dashboard, **When** the page requests data, **Then** it talks only to the dashboard's own origin — the plane read credential is never delivered to browser code.
6. **Given** the fleet has gone/disconnected instances, **When** the operator opens the dashboard, **Then** those instances are not shown by default; **When** the operator uses the reveal control, **Then** the gone/disconnected instances become visible, marked as such.

---

### User Story 3 - Drill into an instance and its runs (Priority: P2)

As an operator, I want to open a detail drawer for any instance showing its current state, recent activity, and its runs — and from a run, reach that run's history and timings — so I can investigate depth without leaving the fleet view.

**Why this priority**: Depth-on-demand. Valuable but secondary to the live overview; the table is usable without it.

**Independent Test**: With the dashboard open on a fleet, select an instance; a drawer shows the instance's state, recent activity, and its runs. Selecting a run surfaces that run's history and timings. The drawer's open state is encoded in the URL so a reload or shared link reopens the same drawer. While the drawer is open, live deltas continue to apply underneath it.

**Acceptance Scenarios**:

1. **Given** the fleet table is shown, **When** the operator selects an instance, **Then** a drawer shows that instance's state, recent activity, and its runs.
2. **Given** an instance drawer is open, **When** the operator selects one of its runs, **Then** the run's history and timings are shown.
3. **Given** an instance drawer is open, **When** the operator reloads the page or opens the deep link, **Then** the same drawer reopens (drawer state is in the URL).
4. **Given** an instance drawer is open, **When** the underlying instance updates or is removed, **Then** the drawer reflects the change (updates in place, or indicates the instance is gone) rather than showing stale data or closing abruptly.

---

### User Story 4 - Retire the in-process prototype (cutover) (Priority: P3)

As a maintainer, I want the rejected in-process dashboard removed once the standalone dashboard is proven, so there is exactly one dashboard architecture and no borrowed-token surface remains.

**Why this priority**: Cleanup/hygiene; it depends on US1–US3 being demonstrably working first.

**Independent Test**: The standalone dashboard passes its acceptance tests against a released plane; then the in-process build (`src/dashboard/`) and its routes are removed on the same branch. Afterward, the former in-process routes (`/`, `/dashboard/*`) return the plane's standard 404.

**Acceptance Scenarios**:

1. **Given** the standalone dashboard has passed acceptance against a released plane, **When** the in-process build is removed, **Then** no release exists in which both dashboard architectures are product surfaces.
2. **Given** the in-process build is removed, **When** a client requests `/` or `/dashboard/*` on the plane, **Then** the plane returns its standard 404 (no redirect, no diagnostic surface).

---

### Edge Cases

- **No instances yet**: the dashboard shows an empty fleet state (not an error, not a blank screen), and the first instance appears via the live stream when it enrolls.
- **Read credential rotated/removed**: after the plane reloads its configured read credential, a dashboard using the old value is refused and surfaces an unauthenticated state rather than silently showing stale data.
- **Plane unreachable from the dashboard server**: the dashboard surfaces an upstream-unavailable state; it does not crash and recovers when the plane returns.
- **Non-loopback bind without a fronting mesh**: a non-loopback bind that is not explicitly opted into (and fronted by mesh identity + authorization) must not happen — loopback is the default.
- **Run with no history/timings yet**: the drawer shows an empty/partial state for that run rather than an error.
- **Instance-level history**: there is no instance-level history/timings endpoint; an instance's "history" is its recent activity plus its runs — the drawer must not imply an aggregated instance timeline that the API does not provide.

## Requirements *(mandatory)*

### Functional Requirements

**Architecture & topology**

- **FR-001**: The dashboard MUST run as a standalone process, out-of-process from the control plane, coupled to it only over the plane's HTTP read API.
- **FR-002**: The dashboard MUST be structured as a backend-for-frontend: a dashboard server that holds the plane read credential and is the only party that calls the plane read API, plus a browser UI that talks only to the dashboard server's own origin.
- **FR-003**: The plane read credential MUST NOT be delivered to, or observable by, browser-side code.
- **FR-004**: The dashboard MUST be able to run on a different host from the plane.
- **FR-005**: The dashboard MUST read the plane base URL and its read credential from its own configuration/environment (`FLEET_PLANE_URL`, `FLEET_PLANE_READ_TOKEN`).
- **FR-006**: The dashboard MUST target a single plane by default; multi-plane targeting is not required in this feature (see Assumptions).

**Read-credential class (plane-side)**

- **FR-007**: The plane MUST accept a read credential that is a distinct credential class from sidecar telemetry tokens.
- **FR-008**: A read credential MUST be refused on ingest/sidecar routes.
- **FR-009**: A telemetry token MUST be refused on consumer read routes.
- **FR-010**: Read credentials MUST be revocable independently, without re-crediting other credentials.
- **FR-011**: The read credential lifecycle MUST be static-minimal for this feature: one or more read credentials supplied via startup configuration or environment-backed secret material, taking effect on restart or the plane's existing configuration-reload path. Interactive mint/list/revoke commands are out of scope.
- **FR-012**: With no read credential configured, consumer read routes MUST refuse all requests — no anonymous read and no fallback to accepting a telemetry token.

**Live fleet view**

- **FR-013**: The dashboard's home surface MUST be a single instance-rooted table (one row per instance), not separate side-by-side views.
- **FR-014**: The table MUST render each instance's connection and liveness state.
- **FR-014a**: The table MUST show connected/recent instances by default and MUST provide an explicit reveal (toggle/filter) that additionally shows gone/disconnected instances (marked as such). Gone/disconnected instances MUST NOT appear in the default view.
- **FR-015**: The table MUST update in place from the plane's live delta stream (instance upserted / removed) — never by a full re-fetch per change and never by a full-page reload.
- **FR-016**: On live-stream disconnect, the dashboard MUST surface a disconnected/stale indicator; on reconnect it MUST re-fetch a fresh snapshot and resume applying deltas.
- **FR-017**: The dashboard MUST reuse the plane's existing read + delta API shapes for the scoped surface; it MUST NOT require a new plane read projection for the instance-rooted home + drill-in.

**Drill-in**

- **FR-018**: The dashboard MUST let the operator open a per-instance detail drawer showing the instance's state, recent activity, and its runs.
- **FR-019**: From a run in the drawer, the dashboard MUST surface that run's history and timings.
- **FR-020**: The drawer's open state MUST be deep-linkable — encoded in the URL so reload or a shared link reopens the same drawer.
- **FR-021**: While a drawer is open, live deltas MUST keep applying underneath it; the drawer MUST reflect an update or removal of its instance rather than showing stale data or closing abruptly.

**Security posture (zero trust; delegated auth)**

- **FR-022**: The dashboard MUST implement no human authentication, browser session management, identity-provider integration, or application-level user authorization (no login, OAuth/OIDC, cookies, roles, user store).
- **FR-023**: Browser-facing access control MUST be delegated to deployment infrastructure (service mesh / identity-aware proxy) enforcing per-connection identity + authorization; the dashboard MUST NOT expose a fallback application-authentication mechanism and MUST NOT treat a connection as trustworthy because of its network origin.
- **FR-024**: The dashboard server MUST bind to loopback by default. A non-loopback bind MUST require an explicit opt-in and MUST be paired with infrastructure that prevents untrusted clients from reaching the listener directly.
- **FR-025**: The dashboard→plane hop MUST carry the machine read credential attached server-side only to the dashboard's allowlisted upstream read requests; the plane MUST authorize it by credential class regardless of network position.

**Cutover**

- **FR-026**: The standalone dashboard MUST pass its acceptance tests against a released plane before the in-process build (`src/dashboard/`) and its routes are removed.
- **FR-027**: The in-process removal MUST happen on the same feature branch; no released version may contain both dashboard architectures as product surfaces.
- **FR-028**: After removal, the former in-process routes (`/`, `/dashboard/*`) MUST return the plane's standard 404 — no redirect and no diagnostic surface.

**Delivery boundary**

- **FR-029**: The dashboard MUST be delivered as a new subtree under the stack-control tree (`plugins/stack-control/`), started by a single documented command that serves HTTP on a configurable port. It MUST NOT live in the deskwork-owned `packages/` area — all stack-control source stays under `plugins/stack-control/` so it travels with stack-control's planned move into its own dedicated repository.
- **FR-030**: The visual and interaction *look* (framework, layout, styling) is out of scope for this spec and MUST be settled by a `/frontend-design` pass before implementation; this spec fixes surface scope and nonvisual interaction contracts only.

### Key Entities *(include if feature involves data)*

- **Fleet instance**: a machine/workload reporting to the plane, identified by host:path; carries connection state, liveness (attached / live / stale / gone), and recent activity. The home table's row unit.
- **Run**: a unit of work owned by an instance, identified by run id; carries phase state, history, and timings. Reached by drilling from its owning instance.
- **Fleet delta**: the live-update unit (instance upserted / instance removed) the dashboard applies to keep the table current without full re-push.
- **Read credential**: an opaque, configured credential of the consumer/read class — distinct from a telemetry token — that authorizes read access and is independently revocable. Held only by the dashboard server, never the browser.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The dashboard never holds or transmits a sidecar telemetry token; read access is performed with a credential that is refused on ingest routes (verifiable at the plane boundary, 100% of the time).
- **SC-002**: A telemetry token is refused on every consumer read route, and a read credential is refused on every ingest route (invariant — no exceptions).
- **SC-003**: With the dashboard open, an instance state change on the plane is reflected in the table within a few seconds, with no manual refresh.
- **SC-004**: An operator can open the dashboard and identify which instances are active/connected at a glance in the default view, and can reveal stale/gone instances on demand — all without any drill-in action.
- **SC-005**: When the live stream drops and later recovers, the dashboard shows a disconnected indicator during the outage and returns to an accurate live view automatically on reconnect (no operator action, no stale-shown-as-live).
- **SC-006**: The browser makes no request to the plane origin — all data arrives from the dashboard server's own origin.
- **SC-007**: The dashboard runs successfully with the dashboard server on a different host from the plane.
- **SC-008**: After cutover, requests to `/` and `/dashboard/*` on the plane return 404, and no released version exposes both dashboards.

## Assumptions

- **App home**: the dashboard is a new subtree under `plugins/stack-control/` (`plugins/stack-control/fleet-dashboard/`), sharing stack-control's tooling — NOT a `packages/` workspace. Rationale: stack-control will be moved out of the deskwork repository into its own dedicated repository, so all its source stays under `plugins/stack-control/` to travel with that move. A per-app separate-repository spin-out is not a thing; the spin-out is a whole-stack-control move.
- **Single plane**: the dashboard targets exactly one plane (URL + read credential in its own config). Multi-plane targeting, if ever wanted, would live in the dashboard server and is out of scope here.
- **Credential config format + reload**: the exact configuration key / environment-variable shape for read credentials, and whether changes take effect on restart only or via the plane's existing live-reload path, are implementation-level details to be settled in planning; the requirement is only that read credentials are configured (not minted) and independently revocable.
- **BFF↔plane live-stream relay shape**: whether the dashboard server proxies the upstream stream per browser connection or holds one upstream stream and fans out is an internal implementation detail; the contract is that the browser receives same-origin live updates and the credential stays server-side.
- **Existing read API is sufficient**: the plane's current instance-rooted snapshot/detail/runs endpoints and run history/timings endpoints, plus the instance delta stream, cover the scoped surface. There is no instance-level history/timings endpoint; an instance's history is its recent activity + its runs. A richer aggregated instance-level timeline, if ever wanted, would be a new plane projection and is out of scope.
- **Package distribution** (with the plugin vs as its own artifact, and whether a container image is a deliverable) is an implementation/planning detail and does not change the process boundary.
- **Removal task-sequencing**: the cutover *rule* (FR-026–FR-028) is fixed; the exact task ordering of deleting `src/dashboard/` relative to the standalone's acceptance tests is an implementation-plan detail.
- **Zero-trust deployment**: the operating environment provides a service mesh / identity-aware proxy that authenticates and authorizes browser-facing access per connection. The dashboard assumes nothing is trusted by network location and provides no fallback human authentication.
- **Program branch convention**: this feature is authored on the program's long-lived branch with a numbered spec directory; no per-spec git branch is created (the spec directory is authoritative). This matches specs 036/037.
