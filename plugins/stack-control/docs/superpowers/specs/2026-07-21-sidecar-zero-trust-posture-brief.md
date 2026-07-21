# Brief — sidecar↔plane auth under a zero-trust posture

**Status:** discussion brief for team review (not a design decision).
**Date:** 2026-07-21.
**Related:** fleet-dashboard design record (`2026-07-21-fleet-dashboard-design.md`,
decision 13), where we adopted the zero-trust posture that prompts this review.

## Why this brief exists

While designing the fleet dashboard we settled a **security posture lean**: build
as little novel security code as possible (no one on the team is a security
expert), delegate authentication to a mature service mesh / proxy, and frame it as
**zero trust** — *there is no safe inner network behind a secure perimeter; every
hop is authenticated and authorized by identity, nothing is trusted for its network
location.*

Applying that same lens to the **sidecar → plane** channel surfaces a gap between
what the protocol *says* and what the code *does*, plus a genuine design tension we
want the team's read on before committing.

## How it works today

The sidecar↔plane protocol (contract `specs/036-fleet-control-plane/contracts/
sidecar-plane-protocol.md` § C6) states: **TLS + authentication mandatory;
long-lived bearer token, per installation; credentials live in the sidecar only;
unknown/revoked token ⇒ refused.**

In the implementation:

- The plane is a **plain `node:http` server** — not `node:https`. There is **no
  in-process TLS, no mTLS, no client-certificate check, no network-fabric identity
  (e.g. Tailscale) check.**
- TLS is expected to be **terminated by an external proxy** in front of the plane
  (the protocol's own timeout notes size against ALB / nginx / Cloudflare).
- The **hand-rolled bearer token is therefore the *only* thing authenticating
  which sidecar is calling** — a token→installation map with enroll / mint /
  revoke (`src/plane/http/auth.ts`, `src/plane/fleet-registry.ts`).

So transport security is already delegated to infrastructure; client identity is
not.

## The two gaps zero-trust surfaces

1. **Implicit trust in the plane's own listener.** Anyone who can reach the
   plain-HTTP port *directly* — bypassing the TLS terminator — skips TLS entirely
   and needs only a valid bearer token. That is "the network is safe" thinking: the
   plane assumes its listener is only reachable via the terminator. Under zero
   trust, it must not.

2. **The bearer registry is the one piece of hand-rolled security code.** That cuts
   against "build as little novel security code as possible." *But* it is **simple**
   (a token map + revoke), and it provides a property we do not want to lose:
   **per-host revocation without re-crediting the rest of the fleet** (C6). Removing
   it in favor of mesh / mTLS identity means adding certificate issuance + rotation
   (a CA or SPIFFE) — arguably *more* novel security surface, unless we can lean on
   an identity fabric these hosts already have.

## The tension we want reviewed

Three goals pull against each other for the sidecar channel:

- **Minimal novel security code** → lean on an existing identity fabric, don't
  hand-roll.
- **Zero trust** → authenticate every connection by identity; never trust network
  presence.
- **Deployment reality** → sidecars are **long-lived machine agents scattered
  across hosts** (our live dogfood ran the plane on one machine, a sidecar on
  another). This is *not* a single Kubernetes cluster with a mesh spanning
  everything.

The dashboard's "punt to a mesh" was clean because it is human→app inside a deploy
environment. Sidecars are machine→plane, cross-host, and long-lived — there may be
no single mesh spanning them.

## The question for the team

**What identity fabric, if any, spans the hosts sidecars run on?**

- If there **is** one (e.g. a single tailnet / WireGuard network, or a shared mTLS
  CA), zero trust can lean on **per-connection fabric identity that the plane
  verifies on every request** — *not* "it arrived over the tailnet," which would
  just re-import the perimeter we are rejecting. The bearer could then be retired,
  or kept only for the per-host revocation property.
- If the hosts are **heterogeneous** (no common fabric), the pragmatic zero-trust
  endpoint may be to **keep the simple bearer as app-level identity + revocation**
  and instead close **Gap 1** — make the plane authenticate every connection and
  never trust listener reachability, and make the terminator/mesh assumption
  explicit rather than implied.

## Scope notes

- This brief does **not** decide the dashboard design (that is settled and
  independent; the dashboard already authorizes "by credential class regardless of
  network position," so it is compatible with whatever we choose here).
- This brief does **not** pick an implementation. It frames the current state, the
  two gaps, and the one fact (the hosts' network relationship) that decides which
  direction is even available.

## Reference points

- Contract: `specs/036-fleet-control-plane/contracts/sidecar-plane-protocol.md` § C6.
- Code: `src/plane/http/server.ts` (plain `node:http`), `src/plane/http/auth.ts`
  (bearer `TokenRegistry`), `src/plane/fleet-registry.ts` (enroll / mint / revoke).
- Posture origin: `docs/superpowers/specs/2026-07-21-fleet-dashboard-design.md`
  decision 13.
