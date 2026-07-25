// T014 — RED test for the Fleet Dashboard BFF's browser-facing routes +
// node:http server.
//
// Per contracts/dashboard-bff-api.md: `/api/instances` and `/api/stream`
// serve on the dashboard's OWN origin (same-origin principle, FR-003/
// SC-006); no `/api/*` response ever carries the plane read credential
// (FR-003); with the plane unreachable, `/api/*` returns a clean
// upstream-unavailable status — never a crash — and recovers once the
// plane answers again (FR-016-adjacent resilience for the request path).
//
// Per FR-022/FR-023 (the no-in-app-auth invariant, T014's explicit U1
// hardening): the server implements no human auth/session/cookie/IdP
// surface. This is pinned MECHANICALLY here — `/api/*` responses set no
// auth/session `Set-Cookie` and carry no `WWW-Authenticate` challenge, and
// no auth/login route is mounted anywhere on the server (README note alone,
// T025, is not sufficient per the task's own wording).
//
// Per FR-014a (T016): `/api/instances` returns connected/recent instances
// by DEFAULT and reveals gone/disconnected instances ONLY under
// `?include=all` — this BFF layer's job is exactly to route that query
// param through to `PlaneClient.instanceSnapshot({ includeAll })`
// (plane-client.ts / T011 already implements the upstream `?include=all`
// passthrough; the plane itself does the actual filtering, per
// src/plane/http/instance-api.ts's `instanceSnapshot`).
//
// Real `node:http` server on an ephemeral port (port 0); every dependency
// (plane client, stream relay) is injected/faked — zero real network I/O,
// mirroring tests/fleet/plane-server.test.ts's ephemeral-port convention.

import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server, ServerResponse } from 'node:http';
import { createDashboardServer } from '../../src/server/http-server.js';
import type { RoutesDeps } from '../../src/server/routes.js';
import { createPlaneClient, PlaneClientError } from '../../src/server/plane-client.js';
import type { DashboardConfig } from '../../src/server/config.js';
import type { RelayEvent, StreamRelay } from '../../src/server/stream-relay.js';

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

interface FakePlaneClientCall {
  readonly includeAll: boolean | undefined;
}

/** A controllable fake for `RoutesDeps['planeClient']`: `respond` decides
 * (per call) whether to resolve with a body or reject, so a test can
 * simulate "plane unreachable, then plane recovers" deterministically. */
function createFakePlaneClient(
  respond: (call: FakePlaneClientCall) => unknown,
): { readonly planeClient: RoutesDeps['planeClient']; readonly calls: FakePlaneClientCall[] } {
  const calls: FakePlaneClientCall[] = [];
  const planeClient: RoutesDeps['planeClient'] = {
    instanceSnapshot: async (opts) => {
      const call: FakePlaneClientCall = { includeAll: opts?.includeAll };
      calls.push(call);
      return respond(call);
    },
  };
  return { planeClient, calls };
}

/** A fake relay: `subscribe()` just records the listener so a test can
 * drive `onEvent` by hand — mirrors stream-relay.test.ts's fake-upstream
 * pattern, one level up (fake relay instead of fake upstream connection). */
function createFakeRelay(): {
  readonly relay: RoutesDeps['relay'];
  readonly listeners: Array<(event: RelayEvent) => void>;
  readonly unsubscribed: boolean[];
} {
  const listeners: Array<(event: RelayEvent) => void> = [];
  const unsubscribed: boolean[] = [];
  const relay: RoutesDeps['relay'] = {
    subscribe: (onEvent) => {
      listeners.push(onEvent);
      const index = listeners.length - 1;
      unsubscribed.push(false);
      return {
        unsubscribe: (): void => {
          unsubscribed[index] = true;
        },
      };
    },
  };
  return { relay, listeners, unsubscribed };
}

const NOOP_RELAY: RoutesDeps['relay'] = {
  subscribe: () => ({ unsubscribe: () => {} }),
};

function buildDeps(planeClient: RoutesDeps['planeClient'], relay: RoutesDeps['relay'] = NOOP_RELAY): RoutesDeps {
  return { planeClient, relay };
}

async function drainStream(response: Response): Promise<void> {
  const body = response.body;
  if (body === null) {
    return;
  }
  await body.cancel();
}

describe('fleet-dashboard routes — same-origin serving (contracts/dashboard-bff-api.md)', () => {
  let activeServer: Server | undefined;

  afterEach(async () => {
    if (activeServer !== undefined) {
      await closeServer(activeServer);
      activeServer = undefined;
    }
  });

  it('serves /api/instances on the dashboard\'s own origin', async () => {
    const { planeClient } = createFakePlaneClient(() => ({ instances: [] }));
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/instances`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ instances: [] });
  });

  it('serves /api/stream on the dashboard\'s own origin as text/event-stream', async () => {
    const { relay } = createFakeRelay();
    const { planeClient } = createFakePlaneClient(() => ({ instances: [] }));
    const server = createDashboardServer(buildDeps(planeClient, relay));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/stream`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    await drainStream(response);
  });
});

describe('fleet-dashboard routes — credential never reaches the browser (FR-003)', () => {
  let activeServer: Server | undefined;

  afterEach(async () => {
    if (activeServer !== undefined) {
      await closeServer(activeServer);
      activeServer = undefined;
    }
  });

  const SECRET_TOKEN = 'read-token-SECRET-abc123';
  const CONFIG: DashboardConfig = Object.freeze({
    planeUrl: 'https://plane.example.internal:7777',
    planeReadToken: SECRET_TOKEN,
    host: '127.0.0.1',
    port: 8080,
  });

  it('a successful /api/instances response body/headers never contain the plane read token', async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ instances: [{ id: 'a:b' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const realPlaneClient = createPlaneClient({ config: CONFIG, fetchFn });
    const server = createDashboardServer(buildDeps(realPlaneClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/instances`);
    const text = await response.text();

    expect(text).not.toContain(SECRET_TOKEN);
    for (const [, value] of response.headers.entries()) {
      expect(value).not.toContain(SECRET_TOKEN);
    }
  });

  it('an upstream-failure /api/instances response body/headers never contain the plane read token', async () => {
    const fetchFn = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const realPlaneClient = createPlaneClient({ config: CONFIG, fetchFn });
    const server = createDashboardServer(buildDeps(realPlaneClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/instances`);
    const text = await response.text();

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(text).not.toContain(SECRET_TOKEN);
  });
});

describe('fleet-dashboard routes — plane unreachable is not a crash, and recovers (contract "Test obligations")', () => {
  let activeServer: Server | undefined;

  afterEach(async () => {
    if (activeServer !== undefined) {
      await closeServer(activeServer);
      activeServer = undefined;
    }
  });

  it('returns a clean upstream-unavailable status (not a crash) while the plane is down, then recovers on the next request', async () => {
    let shouldFail = true;
    const { planeClient } = createFakePlaneClient(() => {
      if (shouldFail) {
        throw new PlaneClientError('plane-client: request to upstream path failed to reach the plane');
      }
      return { instances: [{ id: 'a:b' }] };
    });
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const downResponse = await fetch(`${baseUrl}/api/instances`);
    expect(downResponse.status).toBeGreaterThanOrEqual(500);
    expect(downResponse.status).toBeLessThan(600);
    const downBody: unknown = await downResponse.json();
    expect(downBody).toMatchObject({ error: expect.any(String) });

    shouldFail = false;
    const recoveredResponse = await fetch(`${baseUrl}/api/instances`);
    expect(recoveredResponse.status).toBe(200);
    expect(await recoveredResponse.json()).toEqual({ instances: [{ id: 'a:b' }] });
  });

  it('an unexpected (non-PlaneClientError) throw from the plane client also returns a clean status, never a crash', async () => {
    const { planeClient } = createFakePlaneClient(() => {
      throw new TypeError('something unrelated broke');
    });
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/instances`);
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.status).toBeLessThan(600);
    await response.text();
  });
});

describe('fleet-dashboard routes — no-in-app-auth invariant (FR-022/FR-023, U1 hardening)', () => {
  let activeServer: Server | undefined;

  afterEach(async () => {
    if (activeServer !== undefined) {
      await closeServer(activeServer);
      activeServer = undefined;
    }
  });

  it('/api/instances sets no auth/session Set-Cookie and carries no WWW-Authenticate challenge', async () => {
    const { planeClient } = createFakePlaneClient(() => ({ instances: [] }));
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/instances`);

    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('www-authenticate')).toBeNull();
  });

  it('/api/stream sets no auth/session Set-Cookie and carries no WWW-Authenticate challenge', async () => {
    const { relay } = createFakeRelay();
    const { planeClient } = createFakePlaneClient(() => ({ instances: [] }));
    const server = createDashboardServer(buildDeps(planeClient, relay));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/stream`);

    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('www-authenticate')).toBeNull();
    await drainStream(response);
  });

  it('no login/session/auth route is mounted anywhere on the server', async () => {
    const { planeClient } = createFakePlaneClient(() => ({ instances: [] }));
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const candidatePaths = [
      '/login',
      '/logout',
      '/auth',
      '/session',
      '/api/login',
      '/api/logout',
      '/api/auth',
      '/api/session',
      '/oauth/callback',
    ];
    for (const path of candidatePaths) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status).toBe(404);
      await response.text();
    }
  });
});

describe('fleet-dashboard routes — default membership (FR-014a, T016)', () => {
  let activeServer: Server | undefined;

  afterEach(async () => {
    if (activeServer !== undefined) {
      await closeServer(activeServer);
      activeServer = undefined;
    }
  });

  it('GET /api/instances (no query) calls the plane client WITHOUT includeAll — connected/recent by default', async () => {
    const { planeClient, calls } = createFakePlaneClient((call) =>
      call.includeAll === true
        ? { instances: [{ id: 'a:b' }, { id: 'gone:c' }] }
        : { instances: [{ id: 'a:b' }] },
    );
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/instances`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ instances: [{ id: 'a:b' }] });
    expect(calls).toEqual([{ includeAll: undefined }]);
  });

  it('GET /api/instances?include=all calls the plane client WITH includeAll:true — reveals gone/disconnected', async () => {
    const { planeClient, calls } = createFakePlaneClient((call) =>
      call.includeAll === true
        ? { instances: [{ id: 'a:b' }, { id: 'gone:c' }] }
        : { instances: [{ id: 'a:b' }] },
    );
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/instances?include=all`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ instances: [{ id: 'a:b' }, { id: 'gone:c' }] });
    expect(calls).toEqual([{ includeAll: true }]);
  });

  it('an unrecognized include value is treated as the default (connected/recent only)', async () => {
    const { planeClient, calls } = createFakePlaneClient((call) =>
      call.includeAll === true ? { instances: [{ id: 'x' }] } : { instances: [] },
    );
    const server = createDashboardServer(buildDeps(planeClient));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/instances?include=bogus`);

    expect(await response.json()).toEqual({ instances: [] });
    expect(calls).toEqual([{ includeAll: undefined }]);
  });
});

describe('fleet-dashboard routes — SSE stream fan-out (via injected relay)', () => {
  let activeServer: Server | undefined;

  afterEach(async () => {
    if (activeServer !== undefined) {
      await closeServer(activeServer);
      activeServer = undefined;
    }
  });

  it('forwards relay deltas as SSE instance-upserted / instance-removed frames', async () => {
    const { relay, listeners } = createFakeRelay();
    const { planeClient } = createFakePlaneClient(() => ({ instances: [] }));
    const server = createDashboardServer(buildDeps(planeClient, relay));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/stream`);
    expect(listeners).toHaveLength(1);
    const onEvent = listeners[0];
    if (onEvent === undefined) throw new Error('expected a registered relay listener');

    const reader = response.body;
    if (reader === null) throw new Error('expected a readable SSE body');
    const streamReader = reader.getReader();
    const decoder = new TextDecoder();

    onEvent({ kind: 'delta', delta: { kind: 'instance-upserted', instance: { id: 'a:b' } } });
    const first = await streamReader.read();
    const firstText = decoder.decode(first.value);
    expect(firstText).toContain('event: instance-upserted');
    expect(firstText).toContain('"id":"a:b"');

    onEvent({ kind: 'delta', delta: { kind: 'instance-removed', id: 'a:b' } });
    const second = await streamReader.read();
    const secondText = decoder.decode(second.value);
    expect(secondText).toContain('event: instance-removed');
    expect(secondText).toContain('"id":"a:b"');

    await streamReader.cancel();
  });

  it('attaches an error handler on the SSE response so an abrupt client disconnect (EPIPE/ECONNRESET) never crashes the process (AUDIT-20260725-02)', async () => {
    const { relay, listeners, unsubscribed } = createFakeRelay();
    const { planeClient } = createFakePlaneClient(() => ({ instances: [] }));
    const server = createDashboardServer(buildDeps(planeClient, relay));
    activeServer = server;
    // Capture the real ServerResponse the handler is given (both 'request'
    // listeners receive the same res) so the test can exercise the exact
    // stream Node would emit 'error' on when a client disconnects abruptly.
    let capturedRes: ServerResponse | undefined;
    server.on('request', (_req, res) => {
      capturedRes = res;
    });
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/stream`);
    expect(listeners).toHaveLength(1);

    const res = capturedRes;
    if (res === undefined) throw new Error('expected to capture the SSE ServerResponse');

    // Pre-fix: no 'error' listener is attached, so emitting 'error' throws
    // (Node's unhandled-'error' EventEmitter behavior) — an uncaught
    // exception that would terminate the whole BFF process, killing every
    // connected dashboard. Post-fix: a handler absorbs it and tears this one
    // subscriber down.
    expect(() => res.emit('error', new Error('EPIPE'))).not.toThrow();
    expect(unsubscribed[0]).toBe(true);

    await drainStream(response);
  });

  it('ends the SSE response and unsubscribes when the relay reports "disconnected"', async () => {
    const { relay, listeners, unsubscribed } = createFakeRelay();
    const { planeClient } = createFakePlaneClient(() => ({ instances: [] }));
    const server = createDashboardServer(buildDeps(planeClient, relay));
    activeServer = server;
    const { baseUrl } = await listenEphemeral(server);

    const response = await fetch(`${baseUrl}/api/stream`);
    const onEvent = listeners[0];
    if (onEvent === undefined) throw new Error('expected a registered relay listener');

    const reader = response.body;
    if (reader === null) throw new Error('expected a readable SSE body');
    const streamReader = reader.getReader();

    onEvent({ kind: 'disconnected' });
    const result = await streamReader.read();

    expect(result.done).toBe(true);
    expect(unsubscribed[0]).toBe(true);
  });
});
