// tests/fleet/fleet-registry.test.ts
import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFleetRegistry, mintCredential } from '../../src/plane/fleet-registry.js';

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
});
