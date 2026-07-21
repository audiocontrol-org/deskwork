// specs/037 — a credential issued against a RUNNING plane must work without a
// restart. The plane process and the `issue-enrollment` CLI process are
// distinct OS processes sharing only `enrollment.json`; this test simulates
// them as two `FleetRegistry` handles over the SAME dir. The "plane" handle
// must honor a credential the "CLI" handle added — the enroll path refreshes
// the enrollment file on change before it decides, so the credential works the
// first time it is used. Also covers the symmetric revocation case.
import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFleetRegistry } from '../../src/plane/fleet-registry.js';

let dir: string | undefined;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined; });
function makeDir(): string { dir = mkdtempSync(join(tmpdir(), 'scf-live-reload-')); return dir; }

describe('fleet-registry live reload (issued credential works without restart)', () => {
  it('the plane handle honors a credential the CLI handle issued after the plane loaded', () => {
    const d = makeDir();
    const plane = loadFleetRegistry(d);   // stands in for the running `plane serve`
    const cli = loadFleetRegistry(d);     // stands in for `plane issue-enrollment`

    // Credential issued AFTER the plane already loaded its registry.
    cli.addCredential('cred-late', 'hostB');

    // Enroll on the plane handle with no restart and no explicit reload call.
    const out = plane.enroll('cred-late', { installationId: 'i', host: 'h', path: '/p' });
    expect(out).toEqual({ ok: true, token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
  });

  it('the plane handle rejects a token the CLI handle revoked after the plane loaded', () => {
    const d = makeDir();
    const setup = loadFleetRegistry(d);
    setup.addCredential('cred-1', 'hostB');
    const enrolled = setup.enroll('cred-1', { installationId: 'i', host: 'h', path: '/p' });
    if (!enrolled.ok) throw new Error('unreachable');

    const plane = loadFleetRegistry(d);   // running plane loads with the token active
    expect(plane.activeTokens().has(enrolled.token)).toBe(true);

    const cli = loadFleetRegistry(d);
    cli.revokeToken(enrolled.token);       // revoked by a separate process

    plane.reloadEnrollmentIfChanged();     // the auth path calls this before verifying
    expect(plane.activeTokens().has(enrolled.token)).toBe(false);
    expect(plane.revokedTokens().has(enrolled.token)).toBe(true);
  });

  it('does not spuriously reload / clobber when nothing changed', () => {
    const d = makeDir();
    const plane = loadFleetRegistry(d);
    plane.addCredential('cred-own', 'local');   // an in-process write by the plane itself
    plane.reloadEnrollmentIfChanged();          // must NOT drop the credential it just wrote
    expect(plane.enrollmentCredentials().has('cred-own')).toBe(true);
  });
});
