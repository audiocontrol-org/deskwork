# Quickstart / Validation Guide: Fleet Dashboard

Runnable scenarios that prove the feature end-to-end. Implementation details live in `tasks.md`; this is the validation guide.

## Prerequisites

- A running control plane reachable at a base URL, configured with at least one **read credential** (the new credential class — see `contracts/plane-read-credential.md`).
- At least one enrolled instance reporting to the plane (so the fleet is non-empty).
- The dashboard (`plugins/stack-control/fleet-dashboard/`) built/runnable via stack-control's `tsx` toolchain.

## Setup

```bash
export FLEET_PLANE_URL="https://<plane-host>:<port>"
export FLEET_PLANE_READ_TOKEN="<the configured read credential>"
# start the dashboard server (loopback default)
<documented start command for plugins/stack-control/fleet-dashboard>
# open the dashboard origin in a browser (e.g. http://127.0.0.1:<port>/)
```

## Validation scenarios

### V1 — Credential class invariant (plane; no UI needed) — US1
- Reader credential on a consumer read route (`GET /v1/instances`) → **200**.
- Reader credential on an ingest route → **401**.
- Telemetry token on a consumer read route → **401**.
- No read credential configured → consumer read routes **401** (fail-closed).
- Revoke one reader → that reader **401**, a second reader still **200**, telemetry unaffected.

### V2 — Live fleet view — US2
- Open the dashboard: the instance table shows one row per connected/recent instance with connection + liveness.
- Change an instance's state on the plane → its row updates in place within a few seconds, no reload.
- Remove an instance → its row disappears.
- Reveal control → gone/disconnected instances appear (marked); default view hides them.
- Inspect browser network: **all** data requests are same-origin to the dashboard; none hit the plane; no response carries the read credential.

### V3 — Disconnect / reconnect — US2 (FR-016)
- Kill the plane (or the upstream stream) → the dashboard shows a disconnected/stale indicator.
- Restore the plane → the dashboard re-snapshots and resumes live updates automatically, no operator action.

### V4 — Drill-in — US3
- Select an instance → drawer shows state + recent activity + its runs.
- Select a run → its history and timings render.
- Reload the page with the drawer open → the same drawer reopens (deep-linked URL).
- While the drawer is open, an upstream change to that instance updates the drawer in place; removal marks it gone (no abrupt close).

### V5 — Cutover — US4 (FR-026..028)
- Confirm the standalone passes V1–V4 against a **released** plane.
- Remove `src/dashboard/` + its routes on the same branch.
- `GET /` and `GET /dashboard/*` on the plane → **404**.
- Confirm no released version exposes both dashboards.

## Notes

- Browser-facing authentication is **not** part of this validation — it is delegated to deployment infrastructure (mesh / identity-aware proxy). V2's same-origin/no-credential-leak checks are the app-level security assertions.
- Visual/interaction *look* is validated separately after the `/frontend-design` pass; these scenarios assert behavior/scope, not pixels.
