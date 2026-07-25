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

### Required Environment Variables

- **`FLEET_PLANE_URL`**: The full URL of the plane's `/v1/*` API endpoint (e.g., `http://localhost:7777`). No default; server exits if missing.
- **`FLEET_PLANE_READ_TOKEN`**: The plane's read credential (a bearer token distinct from telemetry tokens). No default; server exits if missing.

### Optional Environment Variables

- **`PORT`** (default: `8080`): The port the dashboard server binds to.
- **`HOST`** (default: `127.0.0.1`): The address the server binds to. Loopback binding is the default security posture; non-loopback binds should only be used when the dashboard is deployed behind a service mesh or ingress controller that enforces authentication and authorization.

## Architecture

### Server (BFF)

- **Language**: TypeScript, Node ≥20
- **Runtime**: `tsx`
- **Entry**: `src/server/index.ts`

The BFF holds the read credential and is the sole authorized caller of the plane's `/v1/*` endpoints. It serves:

- `/api/instances` — the current fleet state (read from plane, cached in memory)
- `/api/stream` — server-sent events for live instance delta updates

### Browser

The browser UI is deferred to a `/frontend-design` pass (see `src/client/CONTRACT.md`). The browser-facing API contract and visual design are captured in that document; framework and implementation are downstream.

## Security

### Loopback Binding (Default)

The dashboard server binds to `127.0.0.1:8080` by default. This restricts access to the local machine. In a containerized or multi-host setup, non-loopback binds must be fronted by a service mesh or ingress controller that enforces authentication and authorization.

### Zero-Trust Posture

- The plane read credential is stored server-side and is **never transmitted to the browser**.
- The browser has no login/session/auth surface (no `WWW-Authenticate` challenges, no `Set-Cookie` auth headers).
- All authorization is delegated to the service mesh / ingress controller in front of the dashboard server.

## Development & Testing

Tests follow the Test-First discipline (Constitution I) and are run via `vitest`:

```bash
npm --workspace @deskwork/plugin-stack-control test
```

Test files live under `tests/` and `src/__tests__/` (per stack-control's shared tooling).

## Status

This is an early-stage implementation. See `specs/038-fleet-dashboard/` for the feature roadmap, design documents, and acceptance criteria.
