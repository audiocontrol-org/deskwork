// T018 — RED test for the Fleet Dashboard BFF's drill-in routes (US3).
//
// Per contracts/dashboard-bff-api.md § Drill-In Endpoints and data-model.md
// (Run entity / "no instance-level history/timings endpoint" note):
//
//   GET /api/instances/:id        -> plane GET /v1/instances/:id
//   GET /api/instances/:id/runs   -> plane GET /v1/instances/:id/runs
//   GET /api/runs/:id             -> plane GET /v1/runs/:id
//   GET /api/runs/:id/history     -> plane GET /v1/runs/:id/history
//   GET /api/runs/:id/timings     -> plane GET /v1/runs/:id/timings
//
// These five routes MUST proxy same-origin (the browser never talks to the
// plane origin, FR-003/SC-006); the plane read credential MUST NEVER reach
// the browser (FR-003) — pinned here exactly as T014 pinned it for
// /api/instances; and an upstream failure MUST be handled as a clean,
// credential-free upstream-unavailable response — never a crash — mirroring
// T015's /api/instances behavior exactly (contracts/dashboard-bff-api.md §
// Test obligations).
//
// This file ALSO pins the data-model.md invariant that there is NO
// instance-level history/timings endpoint: an instance's "history" is its
// recentActivity (already served by /api/instances(/:id)) plus its owned
// runs (/api/instances/:id/runs) — /api/instances/:id/history and
// /api/instances/:id/timings must not exist (404), so a future session
// cannot silently fabricate an aggregated instance timeline the plane does
// not provide.
//
// Real `node:http` server on an ephemeral port (port 0); every dependency
// (plane client) is injected/faked — zero real network I/O, mirroring
// routes.test.ts's (T014-T016) own conventions exactly.

import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createDashboardServer } from '../../src/server/http-server.js';
import { createPlaneClient, PlaneClientError } from '../../src/server/plane-client.js';
import type { PlaneClient } from '../../src/server/plane-client.js';
import type { DashboardConfig } from '../../src/server/config.js';
import type { RoutesDeps } from '../../src/server/routes.js';

// --- helpers (mirrors routes.test.ts) ---------------------------------------

interface RunningServer {
  readonly server: Server;
  readonly baseUrl: string;
}

async function listenEphemeral(server: Server): Promise<RunningServer> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo | string | null;
  if (address === null || typeof address === 'string') {
    throw new Error('listenEphemeral: expected a bound TCP AddressInfo');
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

const NOOP_RELAY: RoutesDeps['relay'] = {
  subscribe: () => ({ unsubscribe: () => {} }),
};

interface RecordedCall {
  readonly method: keyof PlaneClient;
  readonly arg: string | undefined;
}

/** A controllable fake `PlaneClient`: every method records its call and is
 * answered by `respond` — mirrors routes.test.ts's `createFakePlaneClient`,
 * widened to the full six-method surface the drill-in routes need. */
function createFakePlaneClient(
  respond: (call: RecordedCall) => unknown,
): { readonly planeClient: PlaneClient; readonly calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const record = (method: keyof PlaneClient, arg?: string): unknown => {
    const call: RecordedCall = { method, arg };
    calls.push(call);
    return respond(call);
  };
  const planeClient: PlaneClient = {
    instanceSnapshot: async () => record('instanceSnapshot'),
    instanceDetail: async (id) => record('instanceDetail', id),
    instanceRuns: async (id) => record('instanceRuns', id),
    runDetail: async (runId) => record('runDetail', runId),
    runHistory: async (runId) => record('runHistory', runId),
    runTimings: async (runId) => record('runTimings', runId),
  };
  return { planeClient, calls };
}

function buildDeps(planeClient: PlaneClient): { planeClient: PlaneClient; relay: RoutesDeps['relay'] } {
  return { planeClient, relay: NOOP_RELAY };
}

const INSTANCE_ID_WITH_SLASH = 'myhost:/work/proj';

describe('drill-in routes — proxy correctly, same-origin (contracts/dashboard-bff-api.md § Drill-In Endpoints)', () => {
  let activeServer: Server | undefined;

  afterEach(async () => {
    if (activeServer !== undefined) {
      await closeServer(activeServer);
      activeServer = undefined;
    }
  });

  it('GET /api/instances/:id proxies plane instanceDetail(id) and forwards the body verbatim', async () => {
    const { planeClient, calls } = createFakePlaneClient(() => ({
      id: INSTANCE_ID_WITH_SLASH,
      connection: 'attached',
      liveness: 'live',
      recentActivity: [],
    }));
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/instances/${encodeURIComponent(INSTANCE_ID_WITH_SLASH)}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: INSTANCE_ID_WITH_SLASH,
      connection: 'attached',
      liveness: 'live',
      recentActivity: [],
    });
    expect(calls).toEqual([{ method: 'instanceDetail', arg: INSTANCE_ID_WITH_SLASH }]);
  });

  it('GET /api/instances/:id/runs proxies plane instanceRuns(id) and forwards the body verbatim', async () => {
    const { planeClient, calls } = createFakePlaneClient(() => [{ runId: 'run-1' }, { runId: 'run-2' }]);
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(
      `${baseUrl}/api/instances/${encodeURIComponent(INSTANCE_ID_WITH_SLASH)}/runs`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ runId: 'run-1' }, { runId: 'run-2' }]);
    expect(calls).toEqual([{ method: 'instanceRuns', arg: INSTANCE_ID_WITH_SLASH }]);
  });

  it('GET /api/runs/:id proxies plane runDetail(id) and forwards the body verbatim', async () => {
    const { planeClient, calls } = createFakePlaneClient(() => ({ runId: 'run-123', phase: 'complete' }));
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/runs/run-123`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ runId: 'run-123', phase: 'complete' });
    expect(calls).toEqual([{ method: 'runDetail', arg: 'run-123' }]);
  });

  it('GET /api/runs/:id/history proxies plane runHistory(id) and forwards the body verbatim', async () => {
    const { planeClient, calls } = createFakePlaneClient(() => [{ at: '2026-07-21T00:00:00Z', event: 'started' }]);
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/runs/run-123/history`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ at: '2026-07-21T00:00:00Z', event: 'started' }]);
    expect(calls).toEqual([{ method: 'runHistory', arg: 'run-123' }]);
  });

  it('GET /api/runs/:id/timings proxies plane runTimings(id) and forwards the body verbatim', async () => {
    const { planeClient, calls } = createFakePlaneClient(() => ({ totalMs: 4200 }));
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/runs/run-123/timings`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ totalMs: 4200 });
    expect(calls).toEqual([{ method: 'runTimings', arg: 'run-123' }]);
  });
});

describe('drill-in routes — credential never reaches the browser (FR-003)', () => {
  let activeServer: Server | undefined;

  afterEach(async () => {
    if (activeServer !== undefined) {
      await closeServer(activeServer);
      activeServer = undefined;
    }
  });

  const SECRET_TOKEN = 'read-token-SECRET-drillin-xyz789';
  const CONFIG: DashboardConfig = Object.freeze({
    planeUrl: 'https://plane.example.internal:7777',
    planeReadToken: SECRET_TOKEN,
    host: '127.0.0.1',
    port: 8080,
  });

  const DRILL_IN_PATHS = [
    '/api/instances/a%3Ab',
    '/api/instances/a%3Ab/runs',
    '/api/runs/run-1',
    '/api/runs/run-1/history',
    '/api/runs/run-1/timings',
  ];

  it('a successful drill-in response body/headers never contain the plane read token', async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const realPlaneClient = createPlaneClient({ config: CONFIG, fetchFn });
    const server = createDashboardServer(buildDeps(realPlaneClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    for (const path of DRILL_IN_PATHS) {
      const response = await fetch(`${baseUrl}${path}`);
      const text = await response.text();
      expect(text).not.toContain(SECRET_TOKEN);
      for (const [, value] of response.headers.entries()) {
        expect(value).not.toContain(SECRET_TOKEN);
      }
    }
  });

  it('an upstream-failure drill-in response body/headers never contain the plane read token', async () => {
    const fetchFn = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const realPlaneClient = createPlaneClient({ config: CONFIG, fetchFn });
    const server = createDashboardServer(buildDeps(realPlaneClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    for (const path of DRILL_IN_PATHS) {
      const response = await fetch(`${baseUrl}${path}`);
      const text = await response.text();
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(text).not.toContain(SECRET_TOKEN);
    }
  });
});

describe('drill-in routes — plane unreachable is not a crash, and recovers (mirrors T015)', () => {
  let activeServer: Server | undefined;

  afterEach(async () => {
    if (activeServer !== undefined) {
      await closeServer(activeServer);
      activeServer = undefined;
    }
  });

  it('returns a clean upstream-unavailable status (not a crash) while the plane is down, then recovers on the next request', async () => {
    let shouldFail = true;
    const { planeClient } = createFakePlaneClient((call) => {
      if (shouldFail) {
        throw new PlaneClientError(
          `plane-client: request to upstream path for ${call.method} failed to reach the plane`,
        );
      }
      return { runId: 'run-1', phase: 'running' };
    });
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const downResponse = await fetch(`${baseUrl}/api/runs/run-1`);
    expect(downResponse.status).toBeGreaterThanOrEqual(500);
    expect(downResponse.status).toBeLessThan(600);
    const downBody: unknown = await downResponse.json();
    expect(downBody).toMatchObject({ error: expect.any(String) });

    shouldFail = false;
    const recoveredResponse = await fetch(`${baseUrl}/api/runs/run-1`);
    expect(recoveredResponse.status).toBe(200);
    expect(await recoveredResponse.json()).toEqual({ runId: 'run-1', phase: 'running' });
  });

  it('an unexpected (non-PlaneClientError) throw from the plane client also returns a clean status, never a crash', async () => {
    const { planeClient } = createFakePlaneClient(() => {
      throw new TypeError('something unrelated broke');
    });
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/instances/a%3Ab`);
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.status).toBeLessThan(600);
    await response.text();
  });
});

describe('drill-in routes — no fabricated instance-level history/timings endpoint (data-model.md)', () => {
  let activeServer: Server | undefined;

  afterEach(async () => {
    if (activeServer !== undefined) {
      await closeServer(activeServer);
      activeServer = undefined;
    }
  });

  it('GET /api/instances/:id/history and /api/instances/:id/timings do not exist (404) — an instance\'s "history" is recentActivity + its runs, not an aggregated timeline', async () => {
    const { planeClient, calls } = createFakePlaneClient(() => ({ ok: true }));
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const historyResponse = await fetch(`${baseUrl}/api/instances/a%3Ab/history`);
    expect(historyResponse.status).toBe(404);
    await historyResponse.text();

    const timingsResponse = await fetch(`${baseUrl}/api/instances/a%3Ab/timings`);
    expect(timingsResponse.status).toBe(404);
    await timingsResponse.text();

    // Neither request reached the plane client at all — there is no
    // method on PlaneClient this route could even proxy to.
    expect(calls).toEqual([]);
  });
});
