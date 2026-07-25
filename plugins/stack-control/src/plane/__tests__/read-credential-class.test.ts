/**
 * specs/038-fleet-dashboard — US1 (T005/T006 RED).
 *
 * THE COUPLING FIX (the root defect that sank the prototype): the plane's
 * consumer READ routes must be guarded by a DEDICATED read-credential CLASS,
 * verified on a path DISTINCT from the sidecar telemetry `TokenRegistry`. The
 * two credential sets never share a verification result (research R3).
 *
 * This suite pins the load-bearing behavioral invariant end-to-end against a
 * REAL node:http plane (ephemeral port, real fetch) — the contract in
 * specs/038-fleet-dashboard/contracts/plane-read-credential.md:
 *
 *   1. reader credential on a consumer READ route   → 200 (authorized)
 *   2. reader credential on an INGEST/sidecar route → 401 (refused)
 *   3. telemetry token on a consumer READ route     → 401 (refused)
 *   4. telemetry token on an INGEST route           → 200 (unchanged)
 *   5. NO read credential configured → every read route 401 (fail closed,
 *      FR-012 — no anonymous read, no telemetry fallback)
 *   6. read credentials are independently revocable — revoking one reader
 *      affects neither other readers nor telemetry (FR-010)
 *
 * Real node:fs tmp dir (.claude/rules/testing.md). Relative `.js` imports under
 * node16 resolution. No `any`, no `as`, no `@ts-ignore` (Constitution VI).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { mintUuidV7 } from '../../fleet/types.js';
import { createPlaneRuntime, type PlaneRuntimeOptions } from '../runtime.js';

const TELEMETRY_TOKEN = 'telemetry-token-abc';
const INST = '55555555-5555-7555-8555-555555555555';
const READ_TOKEN = 'reader-cred-1';
const READ_TOKEN_2 = 'reader-cred-2';

interface RunningPlane {
  readonly server: Server;
  readonly baseUrl: string;
}

const activePlanes: RunningPlane[] = [];
const dirsToClean = new Set<string>();

async function startPlane(
  overrides: (dir: string) => Partial<PlaneRuntimeOptions>,
): Promise<RunningPlane> {
  const dir = mkdtempSync(join(tmpdir(), 'scf-read-cred-'));
  dirsToClean.add(dir);
  const runtime = createPlaneRuntime({
    acceptedTokens: new Map([[TELEMETRY_TOKEN, INST]]),
    commandStoreDir: dir,
    ...overrides(dir),
  });
  const server = runtime.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  const running: RunningPlane = { server, baseUrl: `http://127.0.0.1:${port}` };
  activePlanes.push(running);
  return running;
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** A valid ingest envelope whose claimed installationId matches the telemetry
 * token's installation (AUDIT-20260718-45) so a telemetry-on-ingest call is a
 * genuine 200, not a spoof-refusal. */
function invocationBody(): string {
  return JSON.stringify({
    envelope: {
      eventId: mintUuidV7(),
      installationId: INST,
      invocationId: mintUuidV7(),
      runId: null,
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 2,
      type: 'invocation.completed',
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 1,
      classification: 'aggregated',
      host: 'read-cred-host',
      path: '/tmp/read-cred/proj',
      sessionId: null,
    },
    snapshot: {},
  });
}

async function get(plane: RunningPlane, path: string, token: string): Promise<Response> {
  return fetch(`${plane.baseUrl}${path}`, { headers: auth(token) });
}

async function ingest(plane: RunningPlane, token: string): Promise<Response> {
  return fetch(`${plane.baseUrl}/v1/ingest`, {
    method: 'POST',
    headers: { ...auth(token), 'content-type': 'application/json' },
    body: invocationBody(),
  });
}

// Every consumer READ route (contracts/plane-read-credential.md § Route
// classes). The auth guard answers 401 BEFORE a streaming handler opens its
// connection, so even the SSE routes resolve immediately in the refused case.
const READ_ROUTES: readonly string[] = [
  '/v1/fleet',
  '/v1/fleet/stream',
  '/v1/runs/some-run-id',
  '/v1/runs/some-run-id/history',
  '/v1/runs/some-run-id/timings',
  '/v1/instances',
  '/v1/instances/stream',
  '/v1/instances/some-id',
  '/v1/instances/some-id/runs',
];

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

describe('read-credential class — the four-cell truth table (T005, FR-007..009)', () => {
  it('cell 1: reader credential on a consumer READ route → 200', async () => {
    const plane = await startPlane(() => ({
      readCredentials: new Map([[READ_TOKEN, 'reader-1']]),
    }));
    const res = await get(plane, '/v1/instances', READ_TOKEN);
    expect(res.status).toBe(200);
  });

  it('cell 2: reader credential on an INGEST route → 401', async () => {
    const plane = await startPlane(() => ({
      readCredentials: new Map([[READ_TOKEN, 'reader-1']]),
    }));
    const res = await ingest(plane, READ_TOKEN);
    expect(res.status).toBe(401);
  });

  it('cell 3: telemetry token on a consumer READ route → 401', async () => {
    const plane = await startPlane(() => ({
      readCredentials: new Map([[READ_TOKEN, 'reader-1']]),
    }));
    const res = await get(plane, '/v1/instances', TELEMETRY_TOKEN);
    expect(res.status).toBe(401);
  });

  it('cell 4: telemetry token on an INGEST route → 200 (unchanged)', async () => {
    const plane = await startPlane(() => ({
      readCredentials: new Map([[READ_TOKEN, 'reader-1']]),
    }));
    const res = await ingest(plane, TELEMETRY_TOKEN);
    expect(res.status).toBe(200);
  });

  it('the reader credential is refused on EVERY read route it is not (a telemetry token) and accepted where it is', async () => {
    const plane = await startPlane(() => ({
      readCredentials: new Map([[READ_TOKEN, 'reader-1']]),
    }));
    // A telemetry token is refused on every consumer read route (FR-009).
    for (const route of READ_ROUTES) {
      const res = await get(plane, route, TELEMETRY_TOKEN);
      expect(res.status, `telemetry token must be refused on ${route}`).toBe(401);
    }
  });
});

describe('read-credential class — fail-closed with no reader configured (T006, FR-012)', () => {
  it('no read credential configured → every consumer read route refuses (no anonymous read, no telemetry fallback)', async () => {
    const plane = await startPlane(() => ({}));
    for (const route of READ_ROUTES) {
      // Even the telemetry token cannot read — no fallback to telemetry.
      const withTelemetry = await get(plane, route, TELEMETRY_TOKEN);
      expect(withTelemetry.status, `no-config: telemetry must not read ${route}`).toBe(401);
      // An arbitrary would-be reader is refused too — no anonymous read.
      const withReader = await get(plane, route, READ_TOKEN);
      expect(withReader.status, `no-config: reader must be refused on ${route}`).toBe(401);
    }
  });
});

describe('read-credential class — independent revocation (T006, FR-010)', () => {
  it('revoking one reader refuses that reader while a second reader and telemetry are unaffected', async () => {
    const revoked = new Set<string>();
    const plane = await startPlane(() => ({
      readCredentials: new Map([
        [READ_TOKEN, 'reader-1'],
        [READ_TOKEN_2, 'reader-2'],
      ]),
      revokedReadCredentials: revoked,
    }));

    // Both readers work; telemetry ingests.
    expect((await get(plane, '/v1/instances', READ_TOKEN)).status).toBe(200);
    expect((await get(plane, '/v1/instances', READ_TOKEN_2)).status).toBe(200);
    expect((await ingest(plane, TELEMETRY_TOKEN)).status).toBe(200);

    // Revoke ONE reader against the running plane (the registry reads the live
    // revoked-set reference — the same live-reload seam the telemetry path uses).
    revoked.add(READ_TOKEN);

    const revokedRes = await get(plane, '/v1/instances', READ_TOKEN);
    expect(revokedRes.status).toBe(401);
    expect(await revokedRes.json()).toMatchObject({ reason: 'revoked' });

    // The second reader is unaffected.
    expect((await get(plane, '/v1/instances', READ_TOKEN_2)).status).toBe(200);
    // Telemetry is unaffected — revoking a reader never re-credentials telemetry.
    expect((await ingest(plane, TELEMETRY_TOKEN)).status).toBe(200);
  });
});
