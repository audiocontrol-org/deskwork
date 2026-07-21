// tests/fleet/fleet-registry.test.ts
import { describe, expect, it, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFleetRegistry, mintCredential } from '../../src/plane/fleet-registry.js';

interface EnrollmentFileOnDisk {
  credentials: Array<{ credential: string; label: string }>;
}

function readEnrollmentFile(d: string): EnrollmentFileOnDisk {
  const raw = readFileSync(join(d, 'fleet', 'enrollment.json'), 'utf8');
  return JSON.parse(raw) as EnrollmentFileOnDisk;
}

let dir: string | undefined;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined; });
function makeDir(): string { dir = mkdtempSync(join(tmpdir(), 'scf-registry-')); return dir; }

describe('fleet-registry', () => {
  it('mintCredential yields a 43-char base64url secret, unique per call', () => {
    const a = mintCredential();
    const b = mintCredential();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('enroll binds identity, exposes the token in live maps, and persists across reload', () => {
    const d = makeDir();
    const reg = loadFleetRegistry(d);
    reg.addCredential('cred-1', 'hostB');
    const out = reg.enroll('cred-1', { installationId: 'inst-1', host: 'hostB', path: '/p' });
    expect(out).toEqual({ ok: true, token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    if (!out.ok) throw new Error('unreachable');
    expect(reg.activeTokens().get(out.token)).toBe('inst-1');
    expect(reg.instanceBindings().get(out.token)).toBe('hostB:/p');

    const reloaded = loadFleetRegistry(d);
    expect(reloaded.activeTokens().get(out.token)).toBe('inst-1');
    expect(reloaded.enrollmentCredentials().has('cred-1')).toBe(true);
  });

  it('enroll rejects an unknown credential', () => {
    const reg = loadFleetRegistry(makeDir());
    expect(reg.enroll('nope', { installationId: 'i', host: 'h', path: '/p' }))
      .toEqual({ ok: false, reason: 'unknown-credential' });
  });

  it('re-enroll of the same identity under the SAME credential supersedes (self-heal), revoking the prior token', () => {
    const reg = loadFleetRegistry(makeDir());
    reg.addCredential('cred-1', 'hostB');
    const first = reg.enroll('cred-1', { installationId: 'i', host: 'h', path: '/p' });
    const second = reg.enroll('cred-1', { installationId: 'i', host: 'h', path: '/p' });
    if (!first.ok || !second.ok) throw new Error('unreachable');
    expect(second.token).not.toBe(first.token);
    expect(reg.activeTokens().has(first.token)).toBe(false);
    expect(reg.activeTokens().get(second.token)).toBe('i');
  });

  it('re-enroll of an identity owned by a DIFFERENT credential is refused', () => {
    const reg = loadFleetRegistry(makeDir());
    reg.addCredential('cred-1', 'hostB');
    reg.addCredential('cred-2', 'hostC');
    reg.enroll('cred-1', { installationId: 'i', host: 'h', path: '/p' });
    expect(reg.enroll('cred-2', { installationId: 'i', host: 'h', path: '/p' }))
      .toEqual({ ok: false, reason: 'identity-owned-by-other-credential' });
  });

  it('revokeToken removes the token from the live active map and persists', () => {
    const d = makeDir();
    const reg = loadFleetRegistry(d);
    reg.addCredential('cred-1', 'hostB');
    const out = reg.enroll('cred-1', { installationId: 'i', host: 'h', path: '/p' });
    if (!out.ok) throw new Error('unreachable');
    reg.revokeToken(out.token);
    expect(reg.activeTokens().has(out.token)).toBe(false);
    expect(reg.revokedTokens().has(out.token)).toBe(true);
    expect(loadFleetRegistry(d).revokedTokens().has(out.token)).toBe(true);
  });

  it('binding key does not collide when a space-containing host/path is split differently across two identities', () => {
    // Two DISTINCT identities that, if joined with a bare space delimiter,
    // would produce the SAME string: "i hostA/p" either as
    // host="hostA" path="/p" split on one boundary, or as
    // host="hostA " (trailing space folded into host) path="p" would also
    // collide under naive concatenation. Use a pair whose ` `-joined forms
    // are identical while the (host, path) pairs differ.
    const reg = loadFleetRegistry(makeDir());
    reg.addCredential('cred-1', 'label');
    reg.addCredential('cred-2', 'label');
    const first = reg.enroll('cred-1', { installationId: 'inst', host: 'host a', path: '/p' });
    const second = reg.enroll('cred-2', { installationId: 'inst', host: 'host', path: 'a /p' });
    if (!first.ok || !second.ok) throw new Error('unreachable');
    // Distinct identities must mint DISTINCT tokens and both remain active —
    // a colliding bindingKey would cause the second enroll to be treated as
    // a same-identity self-heal (revoking the first) or a hijack refusal.
    expect(second.token).not.toBe(first.token);
    expect(reg.activeTokens().has(first.token)).toBe(true);
    expect(reg.activeTokens().has(second.token)).toBe(true);
  });

  it('addCredential is a no-op (no duplicate persisted) when the same credential is registered twice', () => {
    const d = makeDir();
    const reg = loadFleetRegistry(d);
    reg.addCredential('cred-1', 'label-a');
    reg.addCredential('cred-1', 'label-a');
    // The persisted `credentials` array must not grow on the repeat call —
    // the credentialSet dedupes internally, so this must read the on-disk
    // array length directly to catch the append-a-duplicate bug.
    expect(readEnrollmentFile(d).credentials.length).toBe(1);
  });

  it('loadFleetRegistry throws on a malformed enrollment.json', () => {
    const d = makeDir();
    const fleetDir = join(d, 'fleet');
    mkdirSync(fleetDir, { recursive: true });
    writeFileSync(join(fleetDir, 'enrollment.json'), JSON.stringify({ credentials: 'not-an-array' }), 'utf8');
    expect(() => loadFleetRegistry(d)).toThrow();
  });

  it('loadFleetRegistry throws on a malformed telemetry.json', () => {
    const d = makeDir();
    const fleetDir = join(d, 'fleet');
    mkdirSync(fleetDir, { recursive: true });
    writeFileSync(join(fleetDir, 'telemetry.json'), JSON.stringify({ tokens: 'not-a-record' }), 'utf8');
    expect(() => loadFleetRegistry(d)).toThrow();
  });
});
