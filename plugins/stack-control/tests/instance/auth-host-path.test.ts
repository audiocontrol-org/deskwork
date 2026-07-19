// specs/037-instance-observability — T038 (RED→GREEN). D8: a bearer token
// authorized for ONE instance (`host:path`) must be REFUSED when it claims a
// DIFFERENT `host:path`. This is a token→`host:path` check applied ALONGSIDE
// the existing UUID `installationId` `refuseInstallationMismatch` check
// (AUDIT-20260718-45) — identity (host:path) is ADDED alongside installationId,
// never replacing it.
//
// The spoof bodies below carry the MATCHING installationId (so the existing
// installationId mismatch check passes) but a DIFFERENT `host:path` — isolating
// the NEW instance-identity check as the sole reason for the 403.
//
// End-to-end over a REAL node:http plane (ephemeral port, real fetch), mirroring
// tests/fleet/plane-runtime-fixes.test.ts's installation-mismatch harness. Real
// node:fs tmp dir (.claude/rules/testing.md). Relative `.js` imports under
// node16 resolution. No `any`, no `as`, no `@ts-ignore`.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { mintUuidV7 } from '../../src/fleet/types.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';
import { boundPort } from '../_bound-port.js';

const TOKEN_A = 'token-a-owner';
const INST_A = '11111111-1111-4111-8111-111111111111';

// Instance A is the token's AUTHORIZED `host:path`; instance B is a DIFFERENT
// checkout the token must not be able to claim.
const HOST_A = 'host-a';
const PATH_A = '/real/path/a';
const INSTANCE_A = `${HOST_A}:${PATH_A}`;
const HOST_B = 'host-b';
const PATH_B = '/real/path/b';

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
}

const activePlanes: RunningPlane[] = [];
const dirsToClean = new Set<string>();

async function startPlane(): Promise<RunningPlane> {
  const dir = mkdtempSync(join(tmpdir(), 'scf-auth-host-path-'));
  dirsToClean.add(dir);
  const runtime = createPlaneRuntime({
    acceptedTokens: new Map([[TOKEN_A, INST_A]]),
    // Token A is authorized for instance A's `host:path` (D8) — recorded
    // ALONGSIDE its installationId authorization, never replacing it.
    acceptedInstances: new Map([[TOKEN_A, INSTANCE_A]]),
    commandStoreDir: dir,
  });
  const server = runtime.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const running: RunningPlane = { server, baseUrl: `http://127.0.0.1:${boundPort(server)}` };
  activePlanes.push(running);
  return running;
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** An ingest body whose installationId ALWAYS matches the token (INST_A) but
 * whose `host`/`path` are parameterized — so `host:path` is the only axis that
 * can differ from the token's authorized instance. */
function runStartedBody(runId: string, host: string, path: string): string {
  return JSON.stringify({
    envelope: {
      eventId: mintUuidV7(),
      installationId: INST_A,
      invocationId: `inv-${runId}`,
      runId,
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 2, // 037 identity-bearing event (AUDIT-20260719-06: v1 is legacy-without-identity)
      type: 'run.started',
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 5,
      classification: 'durable',
      host,
      path,
      sessionId: null,
    },
    snapshot: {},
  });
}

afterEach(async () => {
  while (activePlanes.length > 0) {
    const plane = activePlanes.pop();
    if (plane === undefined) break;
    await new Promise<void>((resolve, reject) => {
      plane.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  for (const dir of dirsToClean) {
    rmSync(dir, { recursive: true, force: true });
  }
  dirsToClean.clear();
});

describe('ingest enforces authed instance == body-claimed host:path (specs/037 T038, D8)', () => {
  it('REFUSES an ingest whose envelope host:path is a DIFFERENT instance than the token authorizes (403), even when installationId matches', async () => {
    const plane = await startPlane();

    // Token A's VALID token, installationId matches (INST_A), but the envelope
    // claims instance B's host:path.
    const spoof = await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN_A), 'content-type': 'application/json' },
      body: runStartedBody('run-spoofed-host-path', HOST_B, PATH_B),
    });
    expect(spoof.status).toBe(403);

    // The spoofed instance must NOT have been recorded — the fleet stays empty.
    const fleet = await fetch(`${plane.baseUrl}/v1/fleet`, { headers: bearer(TOKEN_A) });
    expect(fleet.status).toBe(200);
    const snapshot: unknown = await fleet.json();
    if (typeof snapshot !== 'object' || snapshot === null || !('entries' in snapshot)) {
      throw new Error(`expected a FleetSnapshot, got ${JSON.stringify(snapshot)}`);
    }
    const { entries } = snapshot as { entries: unknown };
    if (!Array.isArray(entries)) throw new Error('expected entries array');
    expect(entries).toHaveLength(0);
  });

  it('ACCEPTS an ingest whose envelope host:path MATCHES the token-authorized instance (200)', async () => {
    const plane = await startPlane();

    const accepted = await fetch(`${plane.baseUrl}/v1/ingest`, {
      method: 'POST',
      headers: { ...bearer(TOKEN_A), 'content-type': 'application/json' },
      body: runStartedBody('run-owned-by-a', HOST_A, PATH_A),
    });
    expect(accepted.status).toBe(200);

    const fleet = await fetch(`${plane.baseUrl}/v1/fleet`, { headers: bearer(TOKEN_A) });
    const snapshot: unknown = await fleet.json();
    const { entries } = snapshot as { entries: unknown };
    if (!Array.isArray(entries)) throw new Error('expected entries array');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ runId: 'run-owned-by-a', installationId: INST_A });
  });
});
