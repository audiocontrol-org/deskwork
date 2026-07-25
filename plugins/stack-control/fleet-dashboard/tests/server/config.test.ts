// T003 — RED test for the Fleet Dashboard BFF server config loader.
//
// Per spec FR-005 (read FLEET_PLANE_URL / FLEET_PLANE_READ_TOKEN from env),
// FR-024 (loopback-default bind; non-loopback requires explicit opt-in), and
// Constitution V (no fallbacks / no silent defaults — missing required
// config fails loud, naming what is absent).
//
// The loader takes its environment source as an injected parameter (DI) so
// tests never mutate global `process.env` — see `EnvSource` in config.ts.

import { describe, it, expect } from 'vitest';
import { loadConfig, DashboardConfigError, type EnvSource } from '../../src/server/config.js';

const REQUIRED: EnvSource = {
  FLEET_PLANE_URL: 'https://plane.example.internal:7777',
  FLEET_PLANE_READ_TOKEN: 'read-token-abc123',
};

function expectConfigError(env: EnvSource, pattern: RegExp): void {
  let thrown: unknown;
  try {
    loadConfig(env);
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(DashboardConfigError);
  if (!(thrown instanceof DashboardConfigError)) throw new Error('expected a DashboardConfigError');
  expect(thrown.message).toMatch(pattern);
}

describe('loadConfig — required plane credentials (FR-005)', () => {
  it('reads FLEET_PLANE_URL and FLEET_PLANE_READ_TOKEN from the injected env source', () => {
    const config = loadConfig(REQUIRED);
    expect(config.planeUrl).toBe('https://plane.example.internal:7777');
    expect(config.planeReadToken).toBe('read-token-abc123');
  });

  it('fails loud, naming the variable, when FLEET_PLANE_URL is absent', () => {
    const { FLEET_PLANE_URL: _drop, ...rest } = REQUIRED;
    expectConfigError(rest, /FLEET_PLANE_URL/);
  });

  it('fails loud, naming the variable, when FLEET_PLANE_URL is empty', () => {
    expectConfigError({ ...REQUIRED, FLEET_PLANE_URL: '   ' }, /FLEET_PLANE_URL/);
  });

  it('fails loud, naming the variable, when FLEET_PLANE_READ_TOKEN is absent', () => {
    const { FLEET_PLANE_READ_TOKEN: _drop, ...rest } = REQUIRED;
    expectConfigError(rest, /FLEET_PLANE_READ_TOKEN/);
  });

  it('fails loud, naming the variable, when FLEET_PLANE_READ_TOKEN is empty', () => {
    expectConfigError({ ...REQUIRED, FLEET_PLANE_READ_TOKEN: '' }, /FLEET_PLANE_READ_TOKEN/);
  });

  it('never falls back to a default URL or token — an empty env source throws', () => {
    expectConfigError({}, /FLEET_PLANE_URL|FLEET_PLANE_READ_TOKEN/);
  });
});

describe('loadConfig — FLEET_PLANE_READ_TOKEN is single-valued (AUDIT-20260725-07/08)', () => {
  it('fails loud, naming both env vars, when FLEET_PLANE_READ_TOKEN contains a comma', () => {
    expectConfigError(
      { ...REQUIRED, FLEET_PLANE_READ_TOKEN: 'r1,r2' },
      /FLEET_PLANE_READ_TOKEN.*FLEET_PLANE_READ_TOKENS|FLEET_PLANE_READ_TOKENS.*FLEET_PLANE_READ_TOKEN/s,
    );
  });

  it('does not leak the raw credential value into the comma-rejection message (AUDIT-20260725-09)', () => {
    const secretA = 'SECRET-reader-alpha';
    const secretB = 'SECRET-reader-beta';
    let thrown: unknown;
    try {
      loadConfig({ ...REQUIRED, FLEET_PLANE_READ_TOKEN: `${secretA},${secretB}` });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DashboardConfigError);
    if (!(thrown instanceof DashboardConfigError)) throw new Error('expected a DashboardConfigError');
    // The message must stay actionable (names the plural var) but MUST NOT echo the secret.
    expect(thrown.message).toMatch(/FLEET_PLANE_READ_TOKENS/);
    expect(thrown.message).not.toContain(secretA);
    expect(thrown.message).not.toContain(secretB);
  });

  it('the comma-rejection error names the plane-side plural var as the correct home for a list', () => {
    expectConfigError({ ...REQUIRED, FLEET_PLANE_READ_TOKEN: 'r1,r2' }, /FLEET_PLANE_READ_TOKENS/);
  });

  it('still loads a single-token FLEET_PLANE_READ_TOKEN with no comma', () => {
    const config = loadConfig({ ...REQUIRED, FLEET_PLANE_READ_TOKEN: 'solo-reader-token' });
    expect(config.planeReadToken).toBe('solo-reader-token');
  });
});

describe('loadConfig — bind address (FR-024)', () => {
  it('binds to loopback (127.0.0.1) by default when HOST is unset', () => {
    const config = loadConfig(REQUIRED);
    expect(config.host).toBe('127.0.0.1');
  });

  it('accepts an explicit loopback HOST without requiring opt-in', () => {
    const config = loadConfig({ ...REQUIRED, HOST: '127.0.0.1' });
    expect(config.host).toBe('127.0.0.1');
  });

  it('accepts "localhost" as a loopback HOST without requiring opt-in', () => {
    const config = loadConfig({ ...REQUIRED, HOST: 'localhost' });
    expect(config.host).toBe('localhost');
  });

  it('accepts the IPv6 loopback "::1" without requiring opt-in', () => {
    const config = loadConfig({ ...REQUIRED, HOST: '::1' });
    expect(config.host).toBe('::1');
  });

  it('refuses a non-loopback HOST with no opt-in — never an implicit non-loopback bind', () => {
    expectConfigError(
      { ...REQUIRED, HOST: '0.0.0.0' },
      /non-loopback|0\.0\.0\.0/,
    );
  });

  it('refuses a non-loopback HOST even when the opt-in flag is set to a non-"true" value', () => {
    expectConfigError(
      { ...REQUIRED, HOST: '0.0.0.0', FLEET_DASHBOARD_ALLOW_NON_LOOPBACK: 'yes' },
      /non-loopback|0\.0\.0\.0/,
    );
  });

  it('permits a non-loopback HOST only with the explicit opt-in set to "true"', () => {
    const config = loadConfig({
      ...REQUIRED,
      HOST: '0.0.0.0',
      FLEET_DASHBOARD_ALLOW_NON_LOOPBACK: 'true',
    });
    expect(config.host).toBe('0.0.0.0');
  });
});

describe('loadConfig — port', () => {
  it('defaults PORT to 8080 when unset', () => {
    const config = loadConfig(REQUIRED);
    expect(config.port).toBe(8080);
  });

  it('parses an explicit numeric PORT', () => {
    const config = loadConfig({ ...REQUIRED, PORT: '9090' });
    expect(config.port).toBe(9090);
  });

  it('fails loud on a non-numeric PORT', () => {
    expectConfigError({ ...REQUIRED, PORT: 'not-a-port' }, /PORT/);
  });

  it('fails loud on an out-of-range PORT', () => {
    expectConfigError({ ...REQUIRED, PORT: '0' }, /PORT/);
    expectConfigError({ ...REQUIRED, PORT: '70000' }, /PORT/);
  });
});

describe('loadConfig — returned config shape', () => {
  it('returns a frozen (readonly) config object', () => {
    const config = loadConfig(REQUIRED);
    expect(Object.isFrozen(config)).toBe(true);
  });
});
