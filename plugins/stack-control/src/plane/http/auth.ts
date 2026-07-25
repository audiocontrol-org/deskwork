/**
 * specs/036-fleet-control-plane — T117 (impl), makes tests/fleet/auth.test.ts
 * (T109 RED) GREEN.
 *
 * BEARER-TOKEN AUTH — contracts/sidecar-plane-protocol.md § C6 (Auth):
 * - TLS and authentication are mandatory.
 * - Long-lived bearer token, PER INSTALLATION — not a fleet-wide shared
 *   secret. Credentials live in the sidecar only.
 * - Unknown OR revoked token ⇒ refused. Never downgraded to anonymous or
 *   partial access, never retried.
 *
 * FR-088: revoking one host's token must not re-credential (or otherwise
 * impact) the rest of the fleet, and a revoked token's outcome MUST be
 * distinguishable from an unknown token's outcome — 'revoked' is a distinct,
 * terminal reason, never collapsed into 'unknown'.
 *
 * SCOPE BOUNDARY: this is a PURE module — no HTTP server wiring. It exposes
 * a `TokenRegistry` verification port and an Authorization-header parser;
 * `src/plane/http/server.ts` wires these into request handling in a later
 * task (T121/T124).
 */

/** The refusal reason shared by both credential-verification paths. */
export type CredentialRefusal = 'missing' | 'unknown' | 'revoked';

/** The result of verifying a bearer token against the registry. */
export type AuthOutcome =
  | { readonly ok: true; readonly installationId: string }
  | { readonly ok: false; readonly reason: CredentialRefusal };

/**
 * The core credential lookup, shared by the telemetry and reader verification
 * paths WITHOUT sharing a verification RESULT: each registry closes over its
 * OWN `active`/`revoked` collections and calls this pure helper against them,
 * so a credential in one registry's set is never consulted by the other. The
 * two paths remain structurally distinct (research R3) while the missing →
 * revoked (terminal) → unknown → ok decision order is expressed once.
 */
function resolveCredential(
  active: ReadonlyMap<string, string>,
  revoked: ReadonlySet<string>,
  credential: string | undefined,
):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: CredentialRefusal } {
  if (credential === undefined || credential === '') {
    return { ok: false, reason: 'missing' };
  }

  // Revoked is checked first and wins even if the credential also appears in
  // `active` — revocation is terminal, never downgraded to a plain "unknown"
  // and never allowed to resolve to `ok: true`.
  if (revoked.has(credential)) {
    return { ok: false, reason: 'revoked' };
  }

  const value = active.get(credential);
  if (value === undefined) {
    return { ok: false, reason: 'unknown' };
  }

  return { ok: true, value };
}

/** Verifies bearer tokens, resolving each to its owning installation. */
export interface TokenRegistry {
  /**
   * Resolves a bearer token to its installation, or reports why it was
   * refused. A revoked token is refused with reason 'revoked' — even if it
   * is also (still) present in the active set — never downgraded to
   * 'unknown' and never accepted.
   */
  verify(bearerToken: string | undefined): AuthOutcome;
}

/**
 * Builds an in-memory TokenRegistry from a seed of active tokens
 * (token -> installationId) and revoked tokens. Per C6, tokens are
 * per-installation long-lived credentials; revoking one host's token here
 * means adding it to `revoked` without touching any other installation's
 * entry in `active` — revocation never re-credentials the fleet.
 */
export function createTokenRegistry(seed: {
  readonly active: ReadonlyMap<string, string>;
  readonly revoked: ReadonlySet<string>;
}): TokenRegistry {
  const { active, revoked } = seed;

  return {
    verify(bearerToken: string | undefined): AuthOutcome {
      const resolution = resolveCredential(active, revoked, bearerToken);
      if (!resolution.ok) {
        return { ok: false, reason: resolution.reason };
      }
      return { ok: true, installationId: resolution.value };
    },
  };
}

// ---------------------------------------------------------------------------
// Reader-credential class (specs/038-fleet-dashboard, US1 — FR-007..012).
//
// A SEPARATE verification path from the telemetry `TokenRegistry` (research
// R3). The consumer read routes verify against a `ReadCredentialRegistry`;
// ingest/sidecar/liveness routes stay on the telemetry `TokenRegistry`. The
// two never share a verification result — the load-bearing structural property
// that makes the class invariant (a reader is refused on ingest routes; a
// telemetry token is refused on read routes) impossible to violate by
// construction, rather than by a `kind`-tagged shared registry whose single
// generic result is exactly how a reader could leak onto an ingest route.
// ---------------------------------------------------------------------------

/** The result of verifying a read credential. Carries a `readerId` (an opaque
 * reader label) rather than an installationId — read access is a consumer
 * concern, not a per-installation identity. */
export type ReadAuthOutcome =
  | { readonly ok: true; readonly readerId: string }
  | { readonly ok: false; readonly reason: CredentialRefusal };

/** Verifies read credentials of the consumer/read class. */
export interface ReadCredentialRegistry {
  /**
   * Resolves a read credential to its reader label, or reports why it was
   * refused. A revoked reader is refused with reason 'revoked' (distinguishable
   * from an unknown reader), never downgraded and never accepted. With an empty
   * active set (no reader configured) EVERY credential is refused — the
   * fail-closed guarantee (FR-012): no anonymous read, no telemetry fallback.
   */
  verify(credential: string | undefined): ReadAuthOutcome;
}

/**
 * Builds an in-memory ReadCredentialRegistry from a seed of active read
 * credentials (credential -> readerId) and revoked ones. Read credentials are
 * independently revocable (FR-010): the registry closes over the CALLER's
 * `active`/`revoked` collection references, so mutating the passed `revoked`
 * set (the plane's existing live-reload seam) refuses that reader on the next
 * request without touching any other reader or any telemetry credential.
 */
export function createReadCredentialRegistry(seed: {
  readonly active: ReadonlyMap<string, string>;
  readonly revoked: ReadonlySet<string>;
}): ReadCredentialRegistry {
  const { active, revoked } = seed;

  return {
    verify(credential: string | undefined): ReadAuthOutcome {
      const resolution = resolveCredential(active, revoked, credential);
      if (!resolution.ok) {
        return { ok: false, reason: resolution.reason };
      }
      return { ok: true, readerId: resolution.value };
    },
  };
}

const BEARER_PREFIX = 'Bearer ';

/**
 * Parses the bearer token out of an `Authorization` header value.
 * Returns undefined for a missing header, a non-"Bearer" scheme, a bare
 * "Bearer" with no token, or a "Bearer " prefix followed only by
 * whitespace. The extracted token is trimmed of surrounding whitespace.
 */
export function parseBearer(
  authorizationHeader: string | undefined,
): string | undefined {
  if (authorizationHeader === undefined) {
    return undefined;
  }

  if (!authorizationHeader.startsWith(BEARER_PREFIX)) {
    return undefined;
  }

  const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();
  return token === '' ? undefined : token;
}
