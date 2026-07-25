# Fleet Dashboard

A standalone, out-of-process backend-for-frontend (BFF) that provides a live, credential-protected view of fleet instances. The BFF is the only party that calls the plane's `/v1/*` read API; the browser communicates only with the dashboard's own origin, keeping the plane read credential server-side.

## Quick Start

### Start the Dashboard Server

```bash
cd plugins/stack-control
PORT=8080 FLEET_PLANE_URL=http://localhost:7777 FLEET_PLANE_READ_TOKEN=<your-read-token> tsx fleet-dashboard/src/server/index.ts
```

The server binds to `127.0.0.1:8080` by default (loopback). See **Configuration** below.

### Open the Dashboard

Once the server is running, open your browser to `http://127.0.0.1:8080/`.

## Configuration

The server validates configuration at startup and exits with a descriptive error if any required variable is missing or invalid.

| Env Var | Required? | Default | Description |
|---------|-----------|---------|-------------|
| `FLEET_PLANE_URL` | **Yes** | — | Full URL of the plane's `/v1/*` read API (e.g., `http://localhost:7777`). Missing/empty value exits with an error. |
| `FLEET_PLANE_READ_TOKEN` | **Yes** | — | The dashboard's own read credential — exactly ONE bearer token, one of the plane's configured readers (see **Rotating / revoking read credentials** below). Missing/empty value exits with an error; a comma-separated value also exits with an error (that shape belongs to the plane's own `FLEET_PLANE_READ_TOKENS`, plural, not this var). |
| `HOST` | No | `127.0.0.1` | The address the server binds to. Loopback (`127.0.0.1`, `localhost`, `::1`) requires no opt-in. A non-loopback bind requires explicit opt-in via `FLEET_DASHBOARD_ALLOW_NON_LOOPBACK=true` and **must be fronted by deployment infrastructure** (service mesh / identity-aware proxy) enforcing authentication and authorization per connection. |
| `PORT` | No | `8080` | The port the server binds to. Must be an integer between 1 and 65535. |
| `FLEET_DASHBOARD_ALLOW_NON_LOOPBACK` | No | — | Explicit opt-in for non-loopback binding. **Only recognized when set to exactly `true`**. A non-loopback `HOST` without this flag set to `true` causes the server to exit with an error. See **Zero-Trust Posture** below. |

## Architecture

### Server (BFF)

- **Language**: TypeScript, Node ≥20
- **Runtime**: `tsx`
- **Entry**: `src/server/index.ts`

The BFF holds the read credential and is the sole authorized caller of the plane's `/v1/*` endpoints. It serves:

- `/api/instances` — the current fleet state (read from plane, cached in memory)
- `/api/stream` — server-sent events for live instance delta updates

### Browser UI (Deferred)

The browser UI's visual design and interaction model are deferred to a `/frontend-design` pass (see `src/client/CONTRACT.md` for the API contract). This document specifies the server and nonvisual interaction contracts; framework, layout, and styling are downstream of the design pass. The browser talks exclusively to the dashboard server's own origin; it never calls the plane directly.

## Security

### Loopback Binding (Default)

The dashboard server binds to loopback by default (`127.0.0.1:8080`), restricting access to the local machine. This is the default security posture and requires no configuration.

For deployments that require non-loopback binding (containerized setups, multi-host environments, etc.), an explicit opt-in is **required** via `FLEET_DASHBOARD_ALLOW_NON_LOOPBACK=true`. A non-loopback bind without this flag causes the server to exit with an error. **Any non-loopback bind must be fronted by deployment infrastructure** (service mesh, identity-aware proxy, etc.) that enforces authentication and authorization per connection.

### Zero-Trust Posture — No In-App Authentication

The dashboard implements **zero in-app human authentication** — there is no login form, session management, OAuth/OIDC integration, cookies, roles, or user store. All browser-facing access control is delegated entirely to deployment infrastructure.

- **Credential stays server-side**: The plane read credential is stored in the dashboard server process and is **never transmitted to or observable by the browser**.
- **No browser auth surface**: The browser receives no `WWW-Authenticate` challenges, `Set-Cookie` auth headers, or any application-level authentication mechanism.
- **Delegated to the mesh**: All identity and authorization decisions are made by the service mesh / identity-aware proxy in front of the dashboard server. The dashboard itself trusts nothing by network location and implements no fallback authentication.

This architecture ensures the read credential cannot leak through the browser and decouples the dashboard from identity-provider operations.

### Rotating / revoking read credentials

The plane and the dashboard hold **distinctly-named** env vars for a reason (AUDIT-20260725-07/AUDIT-20260725-08): they carry different multiplicities, and sharing one name between them is a real first-time-setup footgun (a shared comma-separated value silently breaks the dashboard's upstream auth — the plane accepts it as a list, the dashboard sends it verbatim as one bearer token, and the resulting 401 surfaces as a misleading "plane unreachable" 503).

| Env Var | Set on | Multiplicity | Purpose |
|---|---|---|---|
| `FLEET_PLANE_READ_TOKENS` (**plural**) | the **plane** | one or more comma-separated credentials | The plane's full SET of accepted reader credentials — each becomes an independently-revocable reader, distinct from sidecar telemetry tokens (FR-010). |
| `FLEET_PLANE_READ_TOKEN` (**singular**) | the **dashboard** | exactly one credential | The ONE credential this dashboard presents to the plane — it MUST be one of the plane's `FLEET_PLANE_READ_TOKENS` entries. A comma-separated value here is refused at boot (config-load time) rather than failing silently at request time. |

- **To revoke a read credential**: remove its entry from the plane's `FLEET_PLANE_READ_TOKENS` and restart the plane. The remaining credentials keep working; telemetry tokens are unaffected — revoking a reader never re-credentials or otherwise impacts the rest of the fleet.
- **Read-credential changes take effect on plane restart.** The read-credential lifecycle is static-minimal for this feature (FR-011): there is no live hot-reload for read credentials (unlike file-backed telemetry enrollment), and interactive mint/list/revoke commands are out of scope.
- The dashboard server's own `FLEET_PLANE_READ_TOKEN` (see **Configuration** above) holds the single credential it uses to authenticate itself to the plane — one of the plane's configured readers. Rotating the dashboard's copy also requires a dashboard restart to take effect.

## Development & Testing

Tests follow the Test-First discipline (Constitution I) and are run via `vitest`:

```bash
npm --workspace @deskwork/plugin-stack-control test
```

Test files live under `tests/` and `src/__tests__/` (per stack-control's shared tooling).

## Status

This is an early-stage implementation. See `specs/038-fleet-dashboard/` for the feature roadmap, design documents, and acceptance criteria.
