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

/** The result of verifying a bearer token against the registry. */
export type AuthOutcome =
  | { readonly ok: true; readonly installationId: string }
  | { readonly ok: false; readonly reason: 'missing' | 'unknown' | 'revoked' };

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
      if (bearerToken === undefined || bearerToken === '') {
        return { ok: false, reason: 'missing' };
      }

      // Revoked is checked first and wins even if the token also appears in
      // `active` — revocation is terminal (FR-088), never downgraded to a
      // plain "unknown" and never allowed to resolve to `ok: true`.
      if (revoked.has(bearerToken)) {
        return { ok: false, reason: 'revoked' };
      }

      const installationId = active.get(bearerToken);
      if (installationId === undefined) {
        return { ok: false, reason: 'unknown' };
      }

      return { ok: true, installationId };
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
