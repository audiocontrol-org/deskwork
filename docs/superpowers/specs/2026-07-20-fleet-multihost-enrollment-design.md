# Fleet multi-host enrollment — design

- **Date:** 2026-07-20
- **Status:** Design — awaiting operator review before an implementation plan
- **Feature branch:** `feature/fleet-control-plane`
- **Supersedes assumption:** 036 FR-078 ("single operator; no join-code exchange, no automatic enrollment") is relaxed **for the remote-host case** by an operator-anchored self-enrollment flow. The single-operator trust model is unchanged; only the manual-only enrollment constraint is lifted.

## Problem

The fleet control plane (specs/036) is named for a *fleet*, but v0.59.0's plane serves exactly **one** installation. `plane serve` takes a single `--token`, and `buildServeRuntimeOptions` binds that token to the served installation's `installationId` **and** its `host:path` instance identity. Every sidecar-facing route (`/v1/ingest`, `/v1/sidecar/liveness`, `/v1/sidecar/stream`) refuses any other identity — proven live: a heartbeat carrying a foreign identity under a valid token returns

```
403 {"error":"forbidden","reason":"installation-mismatch",
     "detail":"a token may only act for its own installation."}
```

So a session on another host cannot report into this plane at all. Multi-host is the plane's reason to exist, and it is unbuilt. This design builds it.

## Decisions (settled with the operator)

1. **Multi-host is the feature**, not an edge case. The plane must accept instances from other hosts.
2. **Per-instance telemetry tokens (1:1 token ↔ instance).** Strong isolation: a leaked telemetry token can spoof exactly one instance. The operator explicitly chose this *over* per-host / per-fleet tokens, accepting that the N-tokens-for-N-instances friction is solved in the enrollment flow, not by weakening isolation.
3. **The plane mints telemetry tokens** and returns each once. The operator never handles per-instance tokens.
4. **Self-enrollment under a host credential.** The operator distributes exactly one secret per remote host — an *enrollment credential* — whose only power is to register new per-instance telemetry tokens. Each instance self-enrolls; attaching many instances from a host is "run the sidecar in each checkout."
5. **Bind identity at enroll time** (refinement of first-use TOFU): the enroll request already carries the instance's claimed `installationId` + `host:path`, so the plane records the binding then. This closes the enroll→first-uplink duplicate-token window and enables self-heal (below).
6. **Always over Tailscale.** The fleet transport is always a tailnet; WireGuard already encrypts it, and tailnet membership is a defense-in-depth authorization boundary beneath the bearer tokens. Plaintext-HTTP bearer inside the tailnet is acceptable. **TLS/mTLS is out of scope**; this design is not safe over an untrusted network, and that would be a separate feature.

## Credential model

Two disjoint credential tiers, distinguished by which accepted set they belong to:

| Tier | Scope | Power | Where it lives |
|---|---|---|---|
| **Enrollment credential** | One per host | *Only* `POST /v1/enroll`. Cannot submit telemetry or read fleet data. | Operator-issued on the plane; carried to the host; stored in a **host-level** custody on the remote host (shared by that host's instances). |
| **Telemetry token** | One per instance (`host:path`) | Presented on every uplink (`/v1/ingest`, `/v1/sidecar/liveness`, `/v1/sidecar/stream`). | Minted by the plane at enroll; stored in the instance's existing **per-instance** token custody (`openTokenCustody`, `bearer-token`, 0600). |

An enrollment credential presented to a telemetry route → 401. A telemetry token presented to `/v1/enroll` → 401. The tiers never cross.

## Enrollment flow

```
Operator (host A)                Remote host B                     Plane (host A)
-----------------                -------------                     --------------
stackctl plane issue-enrollment
  --label hostB
  → mints enrollment credential,
    adds to accepted-enrollment set,
    prints ONCE
        │  (operator carries secret out-of-band, over tailnet trust)
        └───────────────────────▶ stackctl sidecar set-enrollment --token <cred>
                                     → stores in host-level enrollment custody

                                 stackctl sidecar run --plane-url <tailnet-url>
                                   no telemetry token in custody?
                                   → POST /v1/enroll
                                        Authorization: Bearer <enrollment-cred>
                                        body: { installationId, host, path } ──▶ validate enrollment cred
                                                                                  bind token → (installationId, host:path)
                                                                                  mint telemetry token, persist registry
                                   ◀── { telemetryToken } (returned once) ───────
                                   store in per-instance token custody
                                   proceed to normal sidecar run
                                   uplinks present the telemetry token ─────────▶ enforced against the enroll-time binding
```

**"Attach many instances from a remote host" = run the sidecar in each checkout.** Each instance self-enrolls on its first run under the one host credential. Zero per-instance operator steps.

### Self-heal (crash before store)

If a sidecar enrolls, receives a token, and dies before writing custody, its next run finds no token and re-enrolls. Re-enrolling an identity **already bound under the same host enrollment credential** re-issues a fresh telemetry token and supersedes the prior binding (the orphaned token is revoked). A re-enroll of that identity under a *different* enrollment credential is refused (409) — one host cannot steal another host's instance.

## Persistence

- **Plane (host A)** — a *fleet registry* in the plane's machine-local durable dir (`durableDir`, 0700; entries 0600; never git-tracked):
  - accepted enrollment credentials (with their operator label),
  - accepted telemetry tokens, each with its bound identity `{ installationId, host:path }`,
  - revoked tokens (reuses the existing `revokedTokens` concept).
  `plane serve` loads this registry at startup, so the fleet survives a plane restart.
- **Remote host B** — the host-level enrollment credential (one custody per host) and each instance's per-instance telemetry token (existing `openTokenCustody`).

## Runtime changes (against existing code)

- **`PlaneRuntimeOptions`**: replace the 1:1 `acceptedTokens: ReadonlyMap<token, installationId>` + `acceptedInstances: ReadonlyMap<token, host:path>` pair with a single **fleet-registry** input: `ReadonlyMap<token, InstanceBinding>` where `InstanceBinding = { installationId, host, path }`. The existing `revokedTokens` set stays. Per the zero-backcompat rule, the old single-token pair is **deleted**, not kept as a fallback.
- **Auth guard (`withAuth`)**: verify token membership in the fleet registry (and not revoked). The authenticated principal becomes the token's *bound identity* from the registry, sourced from persisted state rather than a serve-time `--token` argument.
- **Mismatch check**: `refuseInstallationMismatch` / `refuseInstanceMismatch` are reused unchanged in shape — they now compare the envelope's claimed identity against the token's **registry binding** instead of a serve-provisioned constant.
- **New accepted-enrollment set + `POST /v1/enroll` route**: authed by an enrollment credential; validates the body's `{ installationId, host, path }`, mints a telemetry token, writes the binding to the fleet registry, returns the token once.
- **`serve` local-instance seeding**: on first `serve`, mint a loopback enrollment credential into host A's host-level enrollment custody so host A's own instances self-enroll through the identical path — no special-case for "the local one." `issue-enrollment` is for remote hosts.

## New / changed verbs

| Verb | Change |
|---|---|
| `stackctl plane issue-enrollment [--label <host>]` | **New.** Mint an enrollment credential, add to the accepted-enrollment set, print once. |
| `stackctl plane serve` | Loads the fleet registry; the single `--token` path is **removed** (clean break). First run seeds the loopback enrollment credential. |
| `stackctl plane revoke --token <t>` / `--enrollment <e>` | **New.** Remove a telemetry token (that instance stops) or an enrollment credential (no new enrollment from that host; issued tokens keep working). |
| `stackctl sidecar set-enrollment --token <cred>` | **New.** Store the operator-issued enrollment credential into the remote host's host-level enrollment custody (once per host). |
| `stackctl sidecar run --plane-url <url>` | Auto-enrolls when no telemetry token is in custody, using the host-level enrollment credential; then runs normally. |
| `stackctl plane provision-token` | **Removed** (clean break — superseded by mint-at-enroll). |

## Security properties

- **Telemetry-token leak** → spoof exactly one instance's telemetry. Bounded by design (per-instance).
- **Enrollment-credential leak** → register *new* instances under that host (noise / DoS), but cannot spoof an existing bound instance, cannot read fleet data, cannot enroll under another host's already-bound identity. Operator revokes the enrollment credential to stop it.
- **Tailnet boundary** → only tailnet peers can reach the plane at all; the bearer tiers are the second layer.
- **No plane impersonation concern** → the sidecar dials an operator-configured tailnet URL; MITM inside WireGuard is not in the threat model.

## Error handling (fail-loud)

| Condition | Response |
|---|---|
| `/v1/enroll` with unknown/revoked enrollment credential | 401 |
| `/v1/enroll` for an identity already bound under a *different* enrollment credential | 409 |
| Uplink with a token not in the fleet registry (or revoked) | 401 |
| Uplink whose claimed identity ≠ the token's registry binding | 403 `installation-mismatch` (existing) |
| Telemetry token on `/v1/enroll`, or enrollment credential on a telemetry route | 401 |

## Scope boundary (YAGNI)

- **In:** per-instance telemetry tokens, host-scoped self-enrollment, plane-side fleet registry + persistence, revocation verbs, loopback seeding for the local host, auto-enroll on `sidecar run`.
- **Out:** TLS/mTLS (always-tailnet), join-code / invite exchange, multi-operator or RBAC, credential rotation schedules, a UI for the registry (the dashboard consuming it is a follow-on), cross-plane federation.

## Testing approach

- **Unit:** fleet-registry load/persist round-trip; auth guard membership + revocation; enroll-time binding; mismatch against a registry binding; enrollment/telemetry tier separation (each rejected on the other's routes).
- **Integration (tmp fixtures, real fs):** `issue-enrollment` → `sidecar run` self-enroll → uplink accepted, on a fixture plane; second instance on the same "host" enrolls under the same credential; re-enroll self-heal; re-enroll under a different credential → 409; revoke → subsequent uplink 401.
- **Live dogfood (the motivating case):** a real second host on the tailnet runs `sidecar run` and appears in `/v1/instances` — the acceptance test this whole feature exists for.
- Per project convention, no new browser/binary-boot tests in CI; live checks are local-only.

## Open questions

None blocking. The registry file format (single JSON vs per-entry files) and the exact enroll request/response schema are implementation-plan details, not design forks.
