// specs/037 — the dual of live issuance: a token revoked against a RUNNING
// plane (by a separate `revoke` CLI process) is refused without a restart,
// because the auth path refreshes the enrollment file before it verifies.
import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { boundPort } from '../_bound-port.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';
import { createEnrollHandler } from '../../src/plane/http/enroll.js';
import { loadFleetRegistry } from '../../src/plane/fleet-registry.js';

let dir: string | undefined;
let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((r) => server?.close(() => r()));
  if (dir) rmSync(dir, { recursive: true, force: true });
  server = undefined; dir = undefined;
});

describe('plane honors an external revocation live (no restart)', () => {
  it('a token revoked by a separate registry handle is refused on the next request', async () => {
    dir = mkdtempSync(join(tmpdir(), 'scf-live-revoke-'));
    const registry = loadFleetRegistry(dir);        // the running plane's registry
    registry.addCredential('cred-1', 'h');
    const enrolled = registry.enroll('cred-1', { installationId: 'i', host: 'h', path: '/p' });
    if (!enrolled.ok) throw new Error('unreachable');

    const runtime = createPlaneRuntime({
      acceptedTokens: registry.activeTokens(),
      acceptedInstances: registry.instanceBindings(),
      revokedTokens: registry.revokedTokens(),
      commandStoreDir: join(dir, 'commands'),
      enrollment: { handler: createEnrollHandler(registry) },
      refreshBeforeAuth: () => registry.reloadEnrollmentIfChanged(),
    });
    server = runtime.createServer();
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', () => resolve()));
    const base = `http://127.0.0.1:${boundPort(server)}`;
    const auth = { authorization: `Bearer ${enrolled.token}` };

    // The token works.
    expect((await fetch(`${base}/v1/fleet`, { headers: auth })).status).toBe(200);

    // A SEPARATE process revokes it (writes enrollment.json).
    const cli = loadFleetRegistry(dir);
    cli.revokeToken(enrolled.token);

    // Next request is refused live — no restart, no manual reload.
    const after = await fetch(`${base}/v1/fleet`, { headers: auth });
    expect(after.status).toBe(401);
    expect(await after.json()).toMatchObject({ reason: 'revoked' });
  });
});
