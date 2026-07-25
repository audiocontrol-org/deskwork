// specs/038-fleet-dashboard — AUDIT-20260725-07 / AUDIT-20260725-08 (RED-first fix).
//
// THE DEFECT: the plane's `readerCredentialsFromEnv` and the dashboard BFF's
// `loadConfig` both read the SAME env-var name (`FLEET_PLANE_READ_TOKEN`) but
// parse it with incompatible multiplicities — the plane as a comma-separated
// LIST of independently-revocable readers, the dashboard as one opaque
// string handed straight to `Authorization: Bearer <token>`. An operator who
// shares one `.env` value across both processes (a very plausible first-time
// setup) gets a silent 401 -> 503 "upstream unreachable" instead of a
// credential-format error.
//
// THE FIX (distinct names for distinct semantics, clean break, no alias):
// the PLANE now reads its comma-separated reader SET from the PLURAL
// `FLEET_PLANE_READ_TOKENS`. The singular `FLEET_PLANE_READ_TOKEN` remains
// the DASHBOARD's own single-credential env var (FR-005) and is no longer
// read by the plane at all.
//
// `readerCredentialsFromEnv` is a pure function over an injected env
// snapshot (no process.env mutation needed) — tested directly here rather
// than through the full `runPlane` CLI harness.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution VI). Relative `.js`
// imports under node16 module resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import { readerCredentialsFromEnv } from '../../subcommands/plane.js';

describe('readerCredentialsFromEnv — plane reads FLEET_PLANE_READ_TOKENS (plural)', () => {
  it('registers each comma-separated credential in FLEET_PLANE_READ_TOKENS as an independent reader', () => {
    const map = readerCredentialsFromEnv({ FLEET_PLANE_READ_TOKENS: 'r1,r2' });
    expect(map.size).toBe(2);
    expect(map.has('r1')).toBe(true);
    expect(map.has('r2')).toBe(true);
  });

  it('trims whitespace around each credential and drops empty entries', () => {
    const map = readerCredentialsFromEnv({ FLEET_PLANE_READ_TOKENS: ' r1 , , r2 ' });
    expect(map.size).toBe(2);
    expect(map.has('r1')).toBe(true);
    expect(map.has('r2')).toBe(true);
  });

  it('registers a single credential when FLEET_PLANE_READ_TOKENS has no comma', () => {
    const map = readerCredentialsFromEnv({ FLEET_PLANE_READ_TOKENS: 'solo-reader' });
    expect(map.size).toBe(1);
    expect(map.has('solo-reader')).toBe(true);
  });

  it('returns an empty map when FLEET_PLANE_READ_TOKENS is absent', () => {
    const map = readerCredentialsFromEnv({});
    expect(map.size).toBe(0);
  });

  it('IGNORES the old singular FLEET_PLANE_READ_TOKEN — the plane no longer reads it (clean break, no alias)', () => {
    const map = readerCredentialsFromEnv({ FLEET_PLANE_READ_TOKEN: 'r1,r2' });
    expect(map.size).toBe(0);
  });

  it('reads only the plural var when both are set, ignoring the singular entirely', () => {
    const map = readerCredentialsFromEnv({
      FLEET_PLANE_READ_TOKENS: 'plural-reader',
      FLEET_PLANE_READ_TOKEN: 'singular-should-be-ignored',
    });
    expect(map.size).toBe(1);
    expect(map.has('plural-reader')).toBe(true);
    expect(map.has('singular-should-be-ignored')).toBe(false);
  });
});
