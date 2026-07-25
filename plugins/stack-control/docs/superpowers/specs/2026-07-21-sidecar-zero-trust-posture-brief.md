# Brief — sidecar↔plane auth under a zero-trust posture

**Status:** discussion brief, revised after team review (2026-07-21). A converged
**working posture**, still pre-implementation — not yet a design decision.
**Related:** fleet-dashboard design record (`2026-07-21-fleet-dashboard-design.md`,
decision 13), where we adopted the zero-trust posture that prompts this review.

## Why this brief exists

While designing the fleet dashboard we settled a **security posture lean**: build
as little novel security code as possible (no one on the team is a security
expert), rely on mature infrastructure wherever practical, and frame it as **zero
trust** — *nothing is trusted for its network location; every accepted request must
arrive over an authenticated transport path whose trust boundary is enforced rather
than assumed.*

Applying that lens to the **sidecar → plane** channel surfaces one real gap and a
clarifying separation of concerns the team review sharpened.

## Three separate concerns (keep them separate)

The discussion stays clean only if we do not merge these:

1. **Transport security** — is the channel confidential and its integrity assured
   (TLS)?
2. **Workload identity** — *which machine / workload* is connecting? (mTLS, SPIFFE,
   service mesh, tailnet node identity, …)
3. **Application identity** — *which stack-control installation* is connecting?

These are different questions with different owners, and (2) and (3) are **not
substitutes**: multiple installations can run on one host, revoking one installation
must not revoke the whole machine, and installation identity can outlive
infrastructure changes. Even with mesh-based workload identity later, we may still
want an application-level notion of installation identity.

## How it works today

Protocol contract (`specs/036-fleet-control-plane/contracts/sidecar-plane-protocol.md`
§ C6): **TLS + authentication mandatory; long-lived bearer token, per installation;
credentials live in the sidecar only; unknown/revoked token ⇒ refused.**

In the implementation:

- The plane is a **plain `node:http` server** — not `node:https`. **No in-process
  TLS, no mTLS, no workload-identity check.**
- TLS is expected to be **terminated by an external proxy** (the protocol's timeout
  notes size against ALB / nginx / Cloudflare).
- The **per-installation bearer token is the application-identity mechanism** — a
  token→installation map with enroll / mint / revoke (`src/plane/http/auth.ts`,
  `src/plane/fleet-registry.ts`).

So concern (1) is delegated to infrastructure; concern (3) is the bearer; concern
(2) is currently not established at all.

## The one real gap: transport-security *enforcement*

The concern is **not** that TLS terminates outside the application, and **not** that
bearer auth is weak. Bearer-over-TLS is a reasonable authentication mechanism. The
gap is that **authenticated traffic can bypass the required secure transport**:

- the bearer can be transmitted without confidentiality if TLS is bypassed,
- traffic can reach the plane without passing the intended TLS-termination point,
- so the deployment no longer *guarantees* the protocol-required TLS is in use.

Zero trust's operative property here: **the telemetry ingress surface must be
unreachable except through the authenticated transport boundary** — via a private
listener, a trusted-proxy-only accept policy, network policy that prevents bypass, or
equivalent. (Scoping this to the telemetry ingress surface, rather than the whole
plane, is deliberately future-proof: the plane may later expose other APIs with
different trust requirements.) Externally terminated TLS is fully compatible with
zero trust *when that boundary is actually enforced.*

## The application credential is legitimate — keep it minimal

Avoiding custom security infrastructure does **not** mean eliminating every
application credential. A small, opaque, per-installation bearer is a very different
thing from inventing an identity platform. It is legitimate when it:

- is randomly generated,
- is transmitted only over authenticated, encrypted transport,
- identifies exactly one installation,
- can be revoked independently (no fleet re-crediting).

Those are application-authorization semantics stack-control legitimately owns. What
we must **not** grow: certificate lifecycle / custom PKI, OAuth/OIDC, browser login,
custom cryptographic protocols, or identity-provider integration — all of which have
mature existing solutions.

## Working posture (team recommendation)

Until a common identity fabric is available across all supported sidecar hosts:

- **Infrastructure owns transport security and, where available, workload
  identity** — service mesh, reverse proxy, mTLS, identity-aware access, existing
  workload-identity systems, used whenever available.
- **stack-control owns only application-specific identity + authorization** — the
  minimal per-installation credential and its revocation.
- **Require the plane to be reachable only through the trusted transport boundary**
  (closes the enforcement gap above).
- **Build no** custom PKI, certificate lifecycle, browser authentication, or
  identity-management code inside stack-control.

Clean separation of responsibility: **infrastructure** owns transport security and,
where available, workload identity; **stack-control** owns application authorization
decisions.

## Architectural invariant

The application never grants authority based solely on network location or transport
identity. Transport identity establishes *who is connected*; application identity
establishes *which stack-control installation is authorized*.

## Non-goal

This posture does not require stack-control to become an identity provider,
certificate authority, authentication gateway, or browser-authentication system. The
objective is to minimize security-sensitive code while preserving application-level
authorization.

## Remaining input we still want

**What identity fabric, if any, spans the hosts sidecars run on** (single tailnet /
WireGuard, shared mTLS CA, or heterogeneous)?

- This determines **which infrastructure mechanisms are available** for concerns (1)
  and (2) — where a workload-identity fabric exists, the deployment can enforce
  authenticated workload identity on every accepted connection (not "it arrived over
  the tailnet," which would re-import the perimeter we reject). The application
  architecture stays stable regardless of which transport or workload-identity
  technology a deployment chooses.
- It does **not** decide concern (3): the minimal installation credential is
  retained regardless, because infrastructure identity generally cannot express
  "which installation" or give per-installation revocation.

## Scope notes

- Does **not** decide the dashboard design (settled and independent; it already
  authorizes "by credential class regardless of network position").
- Does **not** pick an implementation. It frames the current state, the one
  enforcement gap, the transport / workload / application separation, and the fact
  (hosts' network relationship) that decides what is available for the first two.

## Reference points

- Contract: `specs/036-fleet-control-plane/contracts/sidecar-plane-protocol.md` § C6.
- Code: `src/plane/http/server.ts` (plain `node:http`), `src/plane/http/auth.ts`
  (bearer `TokenRegistry`), `src/plane/fleet-registry.ts` (enroll / mint / revoke).
- Posture origin: `docs/superpowers/specs/2026-07-21-fleet-dashboard-design.md`
  decision 13.
