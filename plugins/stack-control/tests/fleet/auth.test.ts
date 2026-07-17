/**
 * specs/036-fleet-control-plane — T109 (RED)
 *
 * C6 (sidecar-plane-protocol.md § C6 — Auth):
 * - TLS and authentication are mandatory
 * - Long-lived bearer token, per installation (not fleet-wide shared)
 * - Unknown or revoked token ⇒ refused (never downgraded to anonymous/partial)
 * - (C4) never retried
 *
 * FR-088: Revoked tokens are REFUSED with distinct reason, never downgraded.
 *
 * Test obligations (sidecar-plane-protocol.md § Test obligations):
 * 13. "Unknown/revoked token ⇒ refused, not degraded."
 *
 * API assumptions (design for T117 implementation):
 *
 * ```ts
 * export type AuthOutcome =
 *   | { readonly ok: true; readonly installationId: string }
 *   | { readonly ok: false; readonly reason: 'missing' | 'unknown' | 'revoked' };
 *
 * export interface TokenRegistry {
 *   // Resolves a bearer token to its installation, or reports unknown/revoked.
 *   verify(bearerToken: string | undefined): AuthOutcome;
 * }
 *
 * // Simple in-memory registry for testing.
 * export function createTokenRegistry(seed: {
 *   readonly active: ReadonlyMap<string, string>;  // token -> installationId
 *   readonly revoked: ReadonlySet<string>;         // revoked token set
 * }): TokenRegistry;
 *
 * // Parse "Bearer <token>" from Authorization header.
 * export function parseBearer(authorizationHeader: string | undefined): string | undefined;
 * ```
 */

import { describe, expect, it } from 'vitest';
import type {
  AuthOutcome,
  TokenRegistry,
} from '../../src/plane/http/auth.js';
import {
  createTokenRegistry,
  parseBearer,
} from '../../src/plane/http/auth.js';

describe('Auth (T109 — FR-088, C6: unknown/revoked tokens refused, never downgraded)', () => {
  describe('parseBearer() — Authorization header parsing', () => {
    it('parses "Bearer <token>" correctly', () => {
      const token = parseBearer('Bearer abc123');
      expect(token).toBe('abc123');
    });

    it('parses bearer token with spaces in token value', () => {
      const token = parseBearer('Bearer long-token-with-dashes');
      expect(token).toBe('long-token-with-dashes');
    });

    it('returns undefined for missing header', () => {
      const token = parseBearer(undefined);
      expect(token).toBeUndefined();
    });

    it('returns undefined for empty header', () => {
      const token = parseBearer('');
      expect(token).toBeUndefined();
    });

    it('returns undefined for malformed header (missing Bearer prefix)', () => {
      const token = parseBearer('abc123');
      expect(token).toBeUndefined();
    });

    it('returns undefined for malformed header (wrong scheme)', () => {
      const token = parseBearer('Basic abc123');
      expect(token).toBeUndefined();
    });

    it('returns undefined for "Bearer" with no token', () => {
      const token = parseBearer('Bearer');
      expect(token).toBeUndefined();
    });

    it('returns undefined for "Bearer " with only whitespace', () => {
      const token = parseBearer('Bearer ');
      expect(token).toBeUndefined();
    });

    it('trims whitespace after Bearer prefix', () => {
      const token = parseBearer('Bearer  abc123  ');
      // Depending on implementation, may trim or not — spec the expected behavior.
      // For now, assume trimmed: "Bearer  abc123  " → "abc123"
      expect(token).toBe('abc123');
    });
  });

  describe('TokenRegistry.verify() — token verification', () => {
    it('returns { ok: false, reason: "missing" } for undefined token', () => {
      const registry = createTokenRegistry({
        active: new Map([['token1', 'inst-a']]),
        revoked: new Set(),
      });
      const outcome = registry.verify(undefined);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe('missing');
      }
    });

    it('returns { ok: false, reason: "missing" } for empty string token', () => {
      const registry = createTokenRegistry({
        active: new Map([['token1', 'inst-a']]),
        revoked: new Set(),
      });
      const outcome = registry.verify('');
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe('missing');
      }
    });

    it('returns { ok: false, reason: "unknown" } for token not in registry', () => {
      const registry = createTokenRegistry({
        active: new Map([['known-token', 'inst-a']]),
        revoked: new Set(),
      });
      const outcome = registry.verify('unknown-token');
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe('unknown');
      }
    });

    it('returns { ok: false, reason: "revoked" } for revoked token — NOT downgraded to unknown', () => {
      const registry = createTokenRegistry({
        active: new Map([['active-token', 'inst-a']]),
        revoked: new Set(['revoked-token']),
      });
      const outcome = registry.verify('revoked-token');
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        // FR-088: must be 'revoked', not 'unknown' — the distinction matters for security.
        expect(outcome.reason).toBe('revoked');
      }
    });

    it('returns { ok: true, installationId } for active token', () => {
      const registry = createTokenRegistry({
        active: new Map([['my-token', 'installation-uuid-1']]),
        revoked: new Set(),
      });
      const outcome = registry.verify('my-token');
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.installationId).toBe('installation-uuid-1');
      }
    });

    it('supports multiple active tokens with distinct installations', () => {
      const registry = createTokenRegistry({
        active: new Map([
          ['token-for-inst-a', 'inst-a'],
          ['token-for-inst-b', 'inst-b'],
          ['token-for-inst-c', 'inst-c'],
        ]),
        revoked: new Set(),
      });

      const outcomeA = registry.verify('token-for-inst-a');
      expect(outcomeA.ok).toBe(true);
      if (outcomeA.ok) {
        expect(outcomeA.installationId).toBe('inst-a');
      }

      const outcomeB = registry.verify('token-for-inst-b');
      expect(outcomeB.ok).toBe(true);
      if (outcomeB.ok) {
        expect(outcomeB.installationId).toBe('inst-b');
      }

      const outcomeC = registry.verify('token-for-inst-c');
      expect(outcomeC.ok).toBe(true);
      if (outcomeC.ok) {
        expect(outcomeC.installationId).toBe('inst-c');
      }
    });

    it('distinguishes revoked from unknown: a token in revoked set is NOT in active', () => {
      const activeTokens = new Map([['token1', 'inst-a']]);
      const revokedTokens = new Set(['token2']);
      const registry = createTokenRegistry({
        active: activeTokens,
        revoked: revokedTokens,
      });

      // token2 is revoked but never was active — reason should still be 'revoked'.
      const outcome = registry.verify('token2');
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe('revoked');
      }
    });

    it('revoked token that was once active returns "revoked", not "unknown"', () => {
      // Scenario: a token was active, then revoked. Verify returns 'revoked'.
      // Note: in this test, we seed the revoked set but registry does not mutate;
      // we're testing the verification logic, not the lifecycle.
      const registry = createTokenRegistry({
        active: new Map([['other-token', 'inst-a']]),
        revoked: new Set(['previously-active-token']),
      });

      const outcome = registry.verify('previously-active-token');
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe('revoked');
      }
    });

    it('never downgrades revoked to anonymous or partial access', () => {
      // The contract: revoked tokens are REFUSED (ok: false), never accepted
      // with reduced permissions or as anonymous.
      const registry = createTokenRegistry({
        active: new Map([['valid-token', 'inst-a']]),
        revoked: new Set(['revoked-token']),
      });

      const outcome = registry.verify('revoked-token');
      // Must be refused entirely.
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        // Must clearly indicate revocation, not ambiguity.
        expect(outcome.reason).toBe('revoked');
      }
      // No field like installationId should be present on a revoked outcome.
      expect('installationId' in outcome).toBe(false);
    });

    it('a token cannot be both active and revoked', () => {
      // Logical invariant: if a token is in both active and revoked, revoked wins.
      // (Implementation detail: depends on lookup order, but the spec is clear:
      // revoked is terminal.)
      const registry = createTokenRegistry({
        active: new Map([['token1', 'inst-a']]),
        revoked: new Set(['token1']),
      });

      const outcome = registry.verify('token1');
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe('revoked');
      }
    });
  });

  describe('Integration: parseBearer + verify', () => {
    it('full flow: Authorization header → parsed token → verified', () => {
      const registry = createTokenRegistry({
        active: new Map([['my-secret-token', 'inst-1']]),
        revoked: new Set(),
      });

      const authHeader = 'Bearer my-secret-token';
      const token = parseBearer(authHeader);
      expect(token).toBeDefined();
      if (token) {
        const outcome = registry.verify(token);
        expect(outcome.ok).toBe(true);
        if (outcome.ok) {
          expect(outcome.installationId).toBe('inst-1');
        }
      }
    });

    it('full flow: revoked token in Authorization header is refused', () => {
      const registry = createTokenRegistry({
        active: new Map(),
        revoked: new Set(['revoked-token']),
      });

      const authHeader = 'Bearer revoked-token';
      const token = parseBearer(authHeader);
      expect(token).toBeDefined();
      if (token) {
        const outcome = registry.verify(token);
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
          expect(outcome.reason).toBe('revoked');
        }
      }
    });

    it('full flow: missing Authorization header is refused with "missing" reason', () => {
      const registry = createTokenRegistry({
        active: new Map([['valid-token', 'inst-1']]),
        revoked: new Set(),
      });

      const authHeader = undefined;
      const token = parseBearer(authHeader);
      expect(token).toBeUndefined();
      // Undefined token passed to verify should yield 'missing'.
      const outcome = registry.verify(token);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe('missing');
      }
    });
  });
});
