// specs/036-fleet-control-plane — T051 RED test for the plane's `node:http`
// server + router (pairs with the T051 impl, src/plane/http/server.ts).
//
// CONTRACT (plane-client-api.md § Route shape, C1/C7):
//   The plane exposes a fixed, path-only, versioned route table. This test
//   exercises the ROUTER ONLY — every handler injected here is a sentinel
//   fake, because the real projections (src/plane/http/api.ts) are a
//   SEPARATE task (T053/T054) not yet built. That is the point of the DI
//   seam: server.ts must be fully testable before api.ts exists.
//
// Test obligations (per the T051 dispatch prompt):
//   (a) the server binds on an ephemeral port and responds.
//   (b) each contract route dispatches to the right injected handler.
//   (c) unknown route ⇒ 404.
//   (d) method mismatch on a known path ⇒ 405 (+ Allow header).
//   (e) no external framework imported — server.ts imports only 'node:http'.
//
// This module does not touch machine-state (no installationId/token/store
// reads), so the _machine-state-harness redirect is not required here —
// unlike registry.test.ts / api-snapshot.test.ts, which build from
// classified events that DO mint identity.
//
// Real `node:http` server on an ephemeral port; no mocked transport
// (.claude/rules/testing.md). Repo convention: relative `.js` imports under
// node16 resolution (no `@/` alias in this plugin).

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { PlaneRouteHandlers, RouteContext, RouteHandler } from '../../src/plane/http/server.js';
import { createPlaneServer } from '../../src/plane/http/server.js';

// --- helpers ---------------------------------------------------------------

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

/** A sentinel handler: records that it was called (with its ctx.params) and
 * writes a fixed, recognizable JSON body so a test can prove THIS handler
 * (not some other route's) answered the request. */
function sentinelHandler(
  name: string,
  calls: { name: string; params: Readonly<Record<string, string>> }[],
): RouteHandler {
  return (ctx: RouteContext): void => {
    calls.push({ name, params: ctx.params });
    ctx.res.writeHead(200, { 'content-type': 'application/json' });
    ctx.res.end(JSON.stringify({ sentinel: name, params: ctx.params }));
  };
}

function buildFakeHandlers(calls: { name: string; params: Readonly<Record<string, string>> }[]): PlaneRouteHandlers {
  return {
    fleetSnapshot: sentinelHandler('fleetSnapshot', calls),
    fleetStream: sentinelHandler('fleetStream', calls),
    runDetail: sentinelHandler('runDetail', calls),
    runHistory: sentinelHandler('runHistory', calls),
    runTimings: sentinelHandler('runTimings', calls),
    issueRunCommand: sentinelHandler('issueRunCommand', calls),
    commandStatus: sentinelHandler('commandStatus', calls),
    issueFleetCommand: sentinelHandler('issueFleetCommand', calls),
    storeHealth: sentinelHandler('storeHealth', calls),
  };
}

describe('plane node:http server + router (T051, contracts/plane-client-api.md § Route shape)', () => {
  let activeServer: Server | undefined;

  afterEach(async () => {
    if (activeServer !== undefined) {
      await closeServer(activeServer);
      activeServer = undefined;
    }
  });

  // --- (a) binds on an ephemeral port and responds --------------------

  it('binds on an ephemeral port and responds to a request', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/fleet`);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toEqual({ sentinel: 'fleetSnapshot', params: {} });
  });

  // --- (b) every contract route dispatches to the right handler --------

  it('dispatches GET /v1/fleet to fleetSnapshot', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/fleet`);

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ name: 'fleetSnapshot', params: {} }]);
  });

  it('dispatches GET /v1/fleet/stream to fleetStream', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/fleet/stream`);

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ name: 'fleetStream', params: {} }]);
  });

  it('dispatches GET /v1/runs/{runId} to runDetail with the runId param', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/runs/run-abc-123`);

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ name: 'runDetail', params: { runId: 'run-abc-123' } }]);
  });

  it('dispatches GET /v1/runs/{runId}/history to runHistory with the runId param', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/runs/run-abc-123/history`);

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ name: 'runHistory', params: { runId: 'run-abc-123' } }]);
  });

  it('dispatches GET /v1/runs/{runId}/timings to runTimings with the runId param', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/runs/run-abc-123/timings`);

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ name: 'runTimings', params: { runId: 'run-abc-123' } }]);
  });

  it('dispatches POST /v1/runs/{runId}/commands to issueRunCommand with the runId param', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/runs/run-abc-123/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'pause' }),
    });

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ name: 'issueRunCommand', params: { runId: 'run-abc-123' } }]);
  });

  it('dispatches GET /v1/commands/{commandId} to commandStatus with the commandId param', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/commands/cmd-xyz-789`);

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ name: 'commandStatus', params: { commandId: 'cmd-xyz-789' } }]);
  });

  it('dispatches POST /v1/fleet/commands to issueFleetCommand', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/fleet/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'pause', targets: ['a', 'b'] }),
    });

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ name: 'issueFleetCommand', params: {} }]);
  });

  it('dispatches GET /v1/health/store to storeHealth', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/health/store`);

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ name: 'storeHealth', params: {} }]);
  });

  // --- (c) unknown route ⇒ 404 -----------------------------------------

  it('returns 404 for an unknown path', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/does-not-exist`);

    expect(response.status).toBe(404);
    expect(calls).toEqual([]);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ error: expect.any(String) as unknown as string });
  });

  it('returns 404 for a path one segment longer than any route (no partial match)', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/fleet/stream/extra`);

    expect(response.status).toBe(404);
    expect(calls).toEqual([]);
  });

  // --- (d) method mismatch ⇒ 405 ----------------------------------------

  it('returns 405 with an Allow header when the path matches but the method does not (GET-only route)', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/fleet`, { method: 'POST' });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(calls).toEqual([]);
  });

  it('returns 405 when GETting a POST-only route (fleet-wide commands)', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/fleet/commands`, { method: 'GET' });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(calls).toEqual([]);
  });

  it('returns 405 when GETting a POST-only per-run route (issue command)', async () => {
    const calls: { name: string; params: Readonly<Record<string, string>> }[] = [];
    const server = createPlaneServer(buildFakeHandlers(calls));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/v1/runs/run-abc-123/commands`, { method: 'GET' });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(calls).toEqual([]);
  });

  // --- structural: no framework import, only node:http ------------------

  it('imports only node:http — no web framework dependency', () => {
    const serverSourcePath = fileURLToPath(
      new URL('../../src/plane/http/server.ts', import.meta.url),
    );
    const source = readFileSync(serverSourcePath, 'utf8');

    const importSpecifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    );

    expect(importSpecifiers.length).toBeGreaterThan(0);
    for (const specifier of importSpecifiers) {
      expect(specifier).toBe('node:http');
    }

    // Belt-and-suspenders: no bare `require(` escape hatch either, and no
    // reference to a known framework identifier anywhere in the source.
    expect(source).not.toMatch(/require\(/);
    expect(source.toLowerCase()).not.toMatch(/express|fastify|koa|hapi|restify/);
  });
});
