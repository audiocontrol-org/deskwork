# Contract: Plane read-credential class

The one plane-side change. Storage-agnostic; the contract is the **behavioral invariant**, not a schema.

## Route classes

- **Consumer read routes** (guarded by the READER credential class): the fleet/instance/run read + delta endpoints —
  `GET /v1/fleet`, `GET /v1/fleet/stream`, `GET /v1/runs/:id`, `GET /v1/runs/:id/history`, `GET /v1/runs/:id/timings`,
  `GET /v1/instances`, `GET /v1/instances/stream`, `GET /v1/instances/:id`, `GET /v1/instances/:id/runs`.
- **Ingest / sidecar / liveness routes** (guarded by the TELEMETRY token registry — unchanged): enroll, ingest, sidecar stream, liveness.

## Invariant (MUST — the load-bearing contract)

1. A **read credential** presented on a **consumer read route** → authorized.
2. A **read credential** presented on an **ingest/sidecar/liveness route** → refused.
3. A **telemetry token** presented on a **consumer read route** → refused.
4. A telemetry token presented on an ingest/sidecar route → authorized (unchanged behavior).
5. **No read credential configured** → every consumer read route refuses (no anonymous read; no fallback to accepting a telemetry token). FR-012.
6. Read credentials are **independently revocable**: revoking one reader affects neither other readers nor any telemetry credential. FR-010.

## Refusal shape

- Refusals reuse the plane's existing unauthorized response shape (`401`, `{ error: 'unauthorized', reason: … }`), with the reason surfaced verbatim (consistent with the current auth guard). A revoked reader is distinguishable from an unknown reader (mirrors the telemetry `revoked` vs `unknown` distinction).

## Lifecycle (static-minimal — FR-011)

- Read credentials are **configured** (environment-backed secret material and/or the plane's config surface), installation-anchored.
- Effective at startup and via the plane's **existing** live-reload path (`refreshBeforeAuth`), not a new mechanism.
- No `mint` / `list` / `revoke` CLI verbs in this feature.

## Non-goals

- No scopes/roles model. No per-route granular permissions beyond the two route classes.
- No certificate/PKI, no OAuth/OIDC, no identity-provider integration (delegated to deployment infra — see the BFF contract).

## Test obligations (RED-first)

- Reader-on-read → 200; reader-on-ingest → 401; telemetry-on-read → 401; telemetry-on-ingest → 200 (the four-cell truth table).
- No-credential-configured → read routes 401 (fail-closed).
- Revoke one reader → that reader 401, a second reader still 200, telemetry unaffected.
