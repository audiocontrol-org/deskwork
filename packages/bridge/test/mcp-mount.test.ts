/**
 * Hono-mount tests for `createMcpHandler` — loopback guard, origin guard,
 * validation surfaces, single-agent invariant, connection lifecycle.
 *
 * The 409 test is structured to avoid the body-cancel race that surfaced
 * during code review: the second initialize is dispatched while the
 * first response is still active; the cancel happens AFTER the assertion.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createMcpHandler } from '@/mcp-server.ts';
import {
  makeBridge,
  cleanupBridge,
  asErrorBody,
  type Bridge,
} from './mcp-fixture.ts';

describe('createMcpHandler — Hono mount: loopback guard + validation', () => {
  let bridge: Bridge;
  beforeEach(() => {
    bridge = makeBridge();
  });
  afterEach(() => cleanupBridge(bridge));

  function mount(remote: string | undefined): Hono {
    const mcp = createMcpHandler(bridge, {
      remoteAddrLookup: () => remote,
    });
    const app = new Hono();
    app.all('/mcp', (c) => mcp.handler(c));
    return app;
  }

  it('returns 403 for non-loopback peers', async () => {
    const app = mount('192.168.1.1');
    const res = await app.fetch(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(403);
    const body = asErrorBody(await res.json());
    expect(body.error).toBe('loopback-only');
  });

  it('returns 400 for non-init POST without session header', async () => {
    const app = mount('127.0.0.1');
    const res = await app.fetch(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(asErrorBody(await res.json()).error).toBe('session-required');
  });

  it('returns 400 for invalid JSON body on POST', async () => {
    const app = mount('127.0.0.1');
    const res = await app.fetch(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
    );
    expect(res.status).toBe(400);
    expect(asErrorBody(await res.json()).error).toBe('invalid-json');
  });

  it('returns 400 for non-POST request without session header', async () => {
    const app = mount('127.0.0.1');
    const res = await app.fetch(new Request('http://x/mcp', { method: 'GET' }));
    expect(res.status).toBe(400);
    expect(asErrorBody(await res.json()).error).toBe('session-required');
  });

  it('returns 404 for unknown session header (no active session)', async () => {
    const app = mount('127.0.0.1');
    const res = await app.fetch(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'mcp-session-id': 'bogus-session',
        },
        body: '{}',
      }),
    );
    expect(res.status).toBe(404);
    expect(asErrorBody(await res.json()).error).toBe('unknown-session');
  });
});

describe('createMcpHandler — origin guard', () => {
  let bridge: Bridge;
  beforeEach(() => {
    bridge = makeBridge();
  });
  afterEach(() => cleanupBridge(bridge));

  function mount(): Hono {
    const mcp = createMcpHandler(bridge, {
      remoteAddrLookup: () => '127.0.0.1',
    });
    const app = new Hono();
    app.all('/mcp', (c) => mcp.handler(c));
    return app;
  }

  async function fetchWithOrigin(
    app: Hono,
    origin: string | undefined,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (origin !== undefined) headers['origin'] = origin;
    return app.fetch(
      new Request('http://x/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      }),
    );
  }

  it('rejects cross-site origin with 403 invalid-origin', async () => {
    const res = await fetchWithOrigin(mount(), 'http://attacker.example');
    expect(res.status).toBe(403);
    expect(asErrorBody(await res.json()).error).toBe('invalid-origin');
  });

  it('allows http://localhost:<port>', async () => {
    const res = await fetchWithOrigin(mount(), 'http://localhost:47321');
    // Origin passes; this request fails the session-required check (400),
    // not the origin check. The point is: not 403 invalid-origin.
    expect(res.status).not.toBe(403);
  });

  it('allows http://127.0.0.1:<port>', async () => {
    const res = await fetchWithOrigin(mount(), 'http://127.0.0.1:9999');
    expect(res.status).not.toBe(403);
  });

  it('allows the literal "null" origin', async () => {
    const res = await fetchWithOrigin(mount(), 'null');
    expect(res.status).not.toBe(403);
  });

  it('allows a request with no Origin header (server-to-server clients)', async () => {
    const res = await fetchWithOrigin(mount(), undefined);
    expect(res.status).not.toBe(403);
  });
});

const INIT_BODY = JSON.stringify({
  jsonrpc: '2.0',
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.0.0' },
  },
  id: 1,
});

const INIT_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

function buildApp(
  bridge: Bridge,
  remote: string,
): { mcp: ReturnType<typeof createMcpHandler>; app: Hono } {
  const mcp = createMcpHandler(bridge, { remoteAddrLookup: () => remote });
  const app = new Hono();
  app.all('/mcp', (c) => mcp.handler(c));
  return { mcp, app };
}

describe('createMcpHandler — single-agent invariant + connection lifecycle', () => {
  let bridge: Bridge;
  beforeEach(() => {
    bridge = makeBridge();
  });
  afterEach(() => cleanupBridge(bridge));

  it('reports activeConnections=0 before any session is opened', () => {
    const { mcp } = buildApp(bridge, '127.0.0.1');
    expect(mcp.activeConnections()).toBe(0);
  });

  it('rejects 409 when a second initialize lands while a session is active', async () => {
    const { mcp, app } = buildApp(bridge, '127.0.0.1');

    const r1 = await app.fetch(
      new Request('http://x/mcp', { method: 'POST', headers: INIT_HEADERS, body: INIT_BODY }),
    );
    expect(r1.status).toBeLessThan(400);
    expect(bridge.queue.currentState().mcpConnected).toBe(true);
    expect(mcp.activeConnections()).toBe(1);

    // Drive the second init while the first connection is still active.
    // Body-cancel happens AFTER, so the cancel-onclose race can't free
    // the tracker before the second request lands.
    const r2 = await app.fetch(
      new Request('http://x/mcp', { method: 'POST', headers: INIT_HEADERS, body: INIT_BODY }),
    );
    expect(r2.status).toBe(409);
    expect(asErrorBody(await r2.json()).error).toBe('bridge-busy');

    if (r1.body !== null) await r1.body.cancel().catch(() => undefined);
    // Give the transport's onclose handler a chance to fire and clean up.
    // If onclose doesn't fire (some SDK transports don't surface cancel
    // as close), the tracker remains active — that's NOT a regression in
    // OUR code; the 409 invariant above is what we're proving.
  });

  it('DELETE with the active session ID resets bridge state', async () => {
    const { mcp, app } = buildApp(bridge, '127.0.0.1');

    const r1 = await app.fetch(
      new Request('http://x/mcp', { method: 'POST', headers: INIT_HEADERS, body: INIT_BODY }),
    );
    expect(mcp.activeConnections()).toBe(1);
    expect(bridge.queue.currentState().mcpConnected).toBe(true);

    const sessionId = r1.headers.get('mcp-session-id');
    if (r1.body !== null) await r1.body.cancel().catch(() => undefined);
    expect(sessionId).toBeTruthy();
    if (sessionId === null) throw new Error('no session id');

    bridge.queue.setListenModeOn(true);
    bridge.queue.setAwaitingMessage(true);
    expect(bridge.queue.currentState()).toMatchObject({
      mcpConnected: true,
      listenModeOn: true,
      awaitingMessage: true,
    });

    const rDel = await app.fetch(
      new Request('http://x/mcp', {
        method: 'DELETE',
        headers: { 'mcp-session-id': sessionId },
      }),
    );
    if (rDel.body !== null) await rDel.body.cancel().catch(() => undefined);

    expect(mcp.activeConnections()).toBe(0);
    expect(bridge.queue.currentState()).toEqual({
      mcpConnected: false,
      listenModeOn: false,
      awaitingMessage: false,
    });
  });

  it('non-loopback peer cannot bypass the session check', async () => {
    const { app } = buildApp(bridge, '8.8.8.8');
    const res = await app.fetch(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'mcp-session-id': 'whatever' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(403);
    expect(asErrorBody(await res.json()).error).toBe('loopback-only');
  });
});
