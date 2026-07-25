// specs/037-instance-observability (plan: docs/superpowers/plans/
// 2026-07-20-fleet-multihost-enrollment.md) — Task 5.
//
// Proves `plane serve`'s runtime construction is wired to the FLEET REGISTRY
// (Task 1) rather than the deleted single-`--token` path: `buildServeRuntime`
// loads (creating if absent) the registry rooted at the installation's
// machine-local durable dir, and — because a fresh registry has no
// enrollment credentials yet — seeds a loopback credential into THIS HOST's
// enrollment custody (`enrollment-custody.ts`, `locateHostState().durableDir`)
// so a sidecar on this host can self-enroll immediately after first boot.
//
// Real filesystem, real temp dirs (.claude/rules/testing.md) — no mocked fs.
// The machine-local store is redirected for the whole file via
// `useMachineStateStore()` (T009) so this test never touches a real
// developer's `$HOME`. Relative `.js` imports under node16 module resolution
// (no `@/` alias configured).

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { buildServeRuntime, readerCredentialsFromEnv } from '../../src/subcommands/plane.js';
import { openEnrollmentCustody } from '../../src/machine-state/enrollment-custody.js';
import { locateHostState } from '../../src/machine-state/locate.js';
import { boundPort } from '../_bound-port.js';
import { useMachineStateStore } from './_machine-state-harness.js';

const IS_WIN = process.platform === 'win32';

describe('plane serve on the fleet registry (Task 5)', () => {
  useMachineStateStore();

  it('seeds a loopback enrollment credential into host custody on first serve', () => {
    const base = IS_WIN ? tmpdir() : '/tmp';
    const root = mkdtempSync(join(base, 'scf-serve-'));
    try {
      const built = buildServeRuntime(root);
      expect(built.runtime).toBeDefined();

      const seeded = openEnrollmentCustody(locateHostState().durableDir).read();
      expect(seeded).toBeDefined();
      // mintCredential() = randomBytes(32).toString('base64url') — 32 bytes
      // base64url-encoded is always 43 chars, no padding.
      expect(seeded).toMatch(/^[A-Za-z0-9_-]{43}$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does NOT mint a second loopback credential on a second buildServeRuntime call (idempotent boot)', () => {
    const base = IS_WIN ? tmpdir() : '/tmp';
    const root = mkdtempSync(join(base, 'scf-serve-'));
    try {
      buildServeRuntime(root);
      const first = openEnrollmentCustody(locateHostState().durableDir).read();

      buildServeRuntime(root);
      const second = openEnrollmentCustody(locateHostState().durableDir).read();

      expect(second).toBe(first);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// specs/038-fleet-dashboard — US1 T009: read-credential configuration is wired
// into `plane serve` from the env-backed, installation-anchored source, and the
// consumer read routes verify against it (never the telemetry registry).
describe('plane serve reader-credential configuration (specs/038 T009)', () => {
  useMachineStateStore();

  const IS_WIN = process.platform === 'win32';
  const servers: Server[] = [];
  const roots: string[] = [];
  let priorReadToken: string | undefined;

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (server === undefined) break;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    while (roots.length > 0) {
      const root = roots.pop();
      if (root !== undefined) rmSync(root, { recursive: true, force: true });
    }
    if (priorReadToken === undefined) delete process.env.FLEET_PLANE_READ_TOKENS;
    else process.env.FLEET_PLANE_READ_TOKENS = priorReadToken;
  });

  function mkRoot(): string {
    const base = IS_WIN ? tmpdir() : '/tmp';
    const root = mkdtempSync(join(base, 'scf-serve-read-'));
    roots.push(root);
    return root;
  }

  async function startFrom(root: string): Promise<string> {
    const { runtime } = buildServeRuntime(root);
    const server = runtime.createServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    return `http://127.0.0.1:${boundPort(server)}`;
  }

  it('parses one-or-more comma-separated read credentials from the environment', () => {
    expect(readerCredentialsFromEnv({})).toEqual(new Map());
    expect(readerCredentialsFromEnv({ FLEET_PLANE_READ_TOKENS: '  r1 , r2 ,, ' })).toEqual(
      new Map([
        ['r1', 'configured-reader-1'],
        ['r2', 'configured-reader-2'],
      ]),
    );
  });

  it('accepts the configured reader on a read route and refuses an unknown credential', async () => {
    priorReadToken = process.env.FLEET_PLANE_READ_TOKENS;
    process.env.FLEET_PLANE_READ_TOKENS = 'configured-read-secret';
    const base = await startFrom(mkRoot());

    const ok = await fetch(`${base}/v1/instances`, {
      headers: { authorization: 'Bearer configured-read-secret' },
    });
    expect(ok.status).toBe(200);

    const refused = await fetch(`${base}/v1/instances`, {
      headers: { authorization: 'Bearer not-the-reader' },
    });
    expect(refused.status).toBe(401);
  });

  it('with no read credential configured, consumer read routes fail closed (FR-012)', async () => {
    priorReadToken = process.env.FLEET_PLANE_READ_TOKENS;
    delete process.env.FLEET_PLANE_READ_TOKENS;
    const base = await startFrom(mkRoot());

    const refused = await fetch(`${base}/v1/instances`, {
      headers: { authorization: 'Bearer anything' },
    });
    expect(refused.status).toBe(401);
  });
});
