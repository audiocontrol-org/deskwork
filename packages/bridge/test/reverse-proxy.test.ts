/**
 * Reverse-proxy tests for the sidecar's `/dev/*` and `/static/*`
 * routes. Boots a tiny in-process "fake studio" Hono app on a
 * loopback port, writes a `.studio` descriptor, fires the sidecar's
 * `/dev/foo` route, asserts the studio receives the request and the
 * sidecar returns the studio's response.
 *
 * Failure-path: pre-write a `.studio` descriptor pointing at a
 * non-listening port; assert the sidecar returns 502 with the
 * "Studio restarting…" page.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { serve, type ServerType } from '@hono/node-server';
import { createSidecarApp } from '@/server.ts';
import { writeStudioDescriptor } from '@/descriptor.ts';

interface Fixture {
  root: string;
  cleanup(): void;
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'bridge-reverse-proxy-'));
  mkdirSync(join(root, '.deskwork'), { recursive: true });
  // Minimal config — readConfig isn't called by createSidecarApp itself,
  // only by main(). The proxy doesn't need it either.
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

interface RunningStudio {
  port: number;
  server: ServerType;
  receivedPaths: string[];
}

function pickFakeStudioPort(seed: number): number {
  return 53000 + (process.pid % 200) + seed;
}

interface ReceivedRequest {
  readonly method: string;
  readonly path: string;
  readonly body: string;
  readonly headerXTest: string | null;
}

interface RunningStudioFull extends RunningStudio {
  receivedRequests: ReceivedRequest[];
  /**
   * Resolves with the moment in milliseconds (Date.now()) when the
   * stream handler enqueued the SECOND chunk. The handler enqueues
   * chunk-1 immediately, waits 50ms, then enqueues chunk-2. Test
   * code uses this to assert chunk-1 arrived at the client BEFORE
   * the upstream second-chunk enqueue moment — proving streaming.
   */
  secondChunkEnqueuedAt: Promise<number>;
}

async function bootFakeStudio(seed: number): Promise<RunningStudioFull> {
  const app = new Hono();
  const receivedPaths: string[] = [];
  const receivedRequests: ReceivedRequest[] = [];
  let secondChunkResolve: ((ms: number) => void) | null = null;
  const secondChunkEnqueuedAt = new Promise<number>((resolveFn) => {
    secondChunkResolve = resolveFn;
  });

  // GET endpoints (used by the original tests).
  app.get('/dev/echo', (c) => {
    receivedPaths.push(new URL(c.req.url).pathname);
    return c.text('echo from fake studio', 200);
  });
  app.get('/dev/stream', (c) => {
    return c.body(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('chunk-1\n'));
          controller.enqueue(new TextEncoder().encode('chunk-2\n'));
          controller.close();
        },
      }),
      200,
      { 'content-type': 'text/plain' },
    );
  });
  app.get('/static/foo.css', (c) => {
    receivedPaths.push(new URL(c.req.url).pathname);
    return c.text('body { color: red; }', 200, {
      'content-type': 'text/css',
    });
  });

  // Echoing handler used by the method/body/header round-trip tests.
  // Captures method, path, body, and a custom test header.
  const recordRequest = async (c: import('hono').Context): Promise<Response> => {
    const body = await c.req.text();
    receivedRequests.push({
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      body,
      headerXTest: c.req.header('x-test-header') ?? null,
    });
    return c.json({ ok: true, method: c.req.method, body }, 200);
  };
  app.post('/dev/echo-method', recordRequest);
  app.put('/dev/echo-method', recordRequest);
  app.delete('/dev/echo-method', recordRequest);
  app.patch('/dev/echo-method', recordRequest);
  app.get('/dev/echo-headers', recordRequest);

  // Status-pass-through: returns whatever status the path encodes.
  app.get('/dev/status/404', (c) => c.text('not found', 404));
  app.get('/dev/status/500', (c) => c.text('boom', 500));

  // True-streaming endpoint: emits chunk-1 immediately, then waits
  // 50ms before enqueuing chunk-2. The test reads the response body
  // and asserts chunk-1 was readable before the 50ms timer fired
  // upstream — i.e. the proxy did not buffer the entire body.
  app.get('/dev/slow-stream', (c) => {
    return c.body(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('chunk-1\n'));
          setTimeout(() => {
            const enqueuedAt = Date.now();
            controller.enqueue(new TextEncoder().encode('chunk-2\n'));
            controller.close();
            if (secondChunkResolve !== null) {
              secondChunkResolve(enqueuedAt);
            }
          }, 50);
        },
      }),
      200,
      { 'content-type': 'text/plain' },
    );
  });

  const port = pickFakeStudioPort(seed);
  const server = await new Promise<ServerType>((resolvePromise) => {
    const s = serve(
      { fetch: app.fetch, port, hostname: '127.0.0.1' },
      () => resolvePromise(s),
    );
  });
  return {
    port,
    server,
    receivedPaths,
    receivedRequests,
    secondChunkEnqueuedAt,
  };
}

async function shutFakeStudio(s: RunningStudio): Promise<void> {
  await new Promise<void>((resolvePromise) => {
    s.server.close(() => resolvePromise());
  });
}

describe('sidecar reverse proxy', () => {
  let fx: Fixture;
  const studios: RunningStudioFull[] = [];

  beforeEach(() => {
    fx = makeFixture();
  });

  afterEach(async () => {
    for (const s of studios) {
      await shutFakeStudio(s);
    }
    studios.length = 0;
    fx.cleanup();
  });

  it('proxies /dev/* through to the studio described by .studio', async () => {
    const studio = await bootFakeStudio(1);
    studios.push(studio);
    await writeStudioDescriptor(fx.root, {
      port: studio.port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: '0.15.0',
    });
    const { app } = createSidecarApp(fx.root);
    const res = await app.fetch(new Request('http://x/dev/echo'));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe('echo from fake studio');
    expect(studio.receivedPaths).toContain('/dev/echo');
  });

  it('proxies /static/* through to the studio', async () => {
    const studio = await bootFakeStudio(2);
    studios.push(studio);
    await writeStudioDescriptor(fx.root, {
      port: studio.port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: '0.15.0',
    });
    const { app } = createSidecarApp(fx.root);
    const res = await app.fetch(new Request('http://x/static/foo.css'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/css/);
    const body = await res.text();
    expect(body).toBe('body { color: red; }');
  });

  it('streams responses (no buffering)', async () => {
    const studio = await bootFakeStudio(3);
    studios.push(studio);
    await writeStudioDescriptor(fx.root, {
      port: studio.port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: '0.15.0',
    });
    const { app } = createSidecarApp(fx.root);
    const res = await app.fetch(new Request('http://x/dev/stream'));
    expect(res.status).toBe(200);
    // Body comes back chunked; concatenated content matches.
    const body = await res.text();
    expect(body).toBe('chunk-1\nchunk-2\n');
  });

  it('returns 502 with Studio-restarting page when descriptor is missing', async () => {
    const { app } = createSidecarApp(fx.root);
    const res = await app.fetch(new Request('http://x/dev/anything'));
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toMatch(/Studio restarting/);
    expect(body).toMatch(/<!doctype html>/i);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
  });

  it('returns 502 when descriptor points at a port nothing is listening on', async () => {
    // Pick a port no one is listening on. The TCP connect will refuse.
    await writeStudioDescriptor(fx.root, {
      port: 1, // Reserved port; nothing legit binds it from userspace.
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: '0.15.0',
    });
    const { app } = createSidecarApp(fx.root);
    const res = await app.fetch(new Request('http://x/dev/anything'));
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toMatch(/Studio restarting/);
  });

  it('does NOT proxy /api/chat/* (handled directly by sidecar)', async () => {
    const { app } = createSidecarApp(fx.root);
    const res = await app.fetch(new Request('http://x/api/chat/state'));
    // Sidecar handles state directly — should be 200, not the 502 from proxy.
    expect(res.status).toBe(200);
  });

  // ----- Phase 10c review fix-up: proxy round-trip regression tests -------
  //
  // These tests guard against the bug where the proxy spread `...c.req`
  // (a HonoRequest) instead of using `c.req.raw` (the underlying Request).
  // HonoRequest exposes method/body/headers via getters, which are NOT
  // copied by object spread; before the fix, every proxied request silently
  // degraded to a default `fetch(upstream)` (GET, no body).

  it('forwards POST + body to the studio (round-trip)', async () => {
    const studio = await bootFakeStudio(7);
    studios.push(studio);
    await writeStudioDescriptor(fx.root, {
      port: studio.port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: '0.15.0',
    });
    const { app } = createSidecarApp(fx.root);
    const payload = 'hello-from-proxy-post';
    const res = await app.fetch(
      new Request('http://x/dev/echo-method', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: payload,
      }),
    );
    expect(res.status).toBe(200);
    const json: unknown = await res.json();
    expect(json).toMatchObject({ ok: true, method: 'POST', body: payload });
    expect(studio.receivedRequests).toHaveLength(1);
    expect(studio.receivedRequests[0]?.method).toBe('POST');
    expect(studio.receivedRequests[0]?.body).toBe(payload);
  });

  it('forwards PUT + body to the studio (round-trip)', async () => {
    const studio = await bootFakeStudio(8);
    studios.push(studio);
    await writeStudioDescriptor(fx.root, {
      port: studio.port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: '0.15.0',
    });
    const { app } = createSidecarApp(fx.root);
    const payload = '{"save":"document"}';
    const res = await app.fetch(
      new Request('http://x/dev/echo-method', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: payload,
      }),
    );
    expect(res.status).toBe(200);
    expect(studio.receivedRequests).toHaveLength(1);
    expect(studio.receivedRequests[0]?.method).toBe('PUT');
    expect(studio.receivedRequests[0]?.body).toBe(payload);
  });

  it('forwards custom headers to the studio (X-Test-Header)', async () => {
    const studio = await bootFakeStudio(9);
    studios.push(studio);
    await writeStudioDescriptor(fx.root, {
      port: studio.port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: '0.15.0',
    });
    const { app } = createSidecarApp(fx.root);
    const res = await app.fetch(
      new Request('http://x/dev/echo-headers', {
        headers: { 'X-Test-Header': 'round-trip-value' },
      }),
    );
    expect(res.status).toBe(200);
    expect(studio.receivedRequests).toHaveLength(1);
    expect(studio.receivedRequests[0]?.headerXTest).toBe('round-trip-value');
  });

  it('passes through 404 from the studio unchanged', async () => {
    const studio = await bootFakeStudio(10);
    studios.push(studio);
    await writeStudioDescriptor(fx.root, {
      port: studio.port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: '0.15.0',
    });
    const { app } = createSidecarApp(fx.root);
    const res = await app.fetch(new Request('http://x/dev/status/404'));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('not found');
  });

  it('passes through 500 from the studio unchanged', async () => {
    const studio = await bootFakeStudio(11);
    studios.push(studio);
    await writeStudioDescriptor(fx.root, {
      port: studio.port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: '0.15.0',
    });
    const { app } = createSidecarApp(fx.root);
    const res = await app.fetch(new Request('http://x/dev/status/500'));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('boom');
  });

  it('does not forward the literal string "undefined" as X-Forwarded-Host when no host header is present', async () => {
    // Boot a header-capture studio that records the X-Forwarded-Host
    // value on each incoming request. The test sends a Request with
    // no `host` header to force the undefined branch in the proxy
    // handler.
    const captured: string[] = [];
    const inspectorApp = new Hono();
    inspectorApp.get('/dev/inspect', (c) => {
      captured.push(c.req.header('x-forwarded-host') ?? '<missing>');
      return c.text('ok');
    });
    const inspectorPort = pickFakeStudioPort(13);
    const inspectorServer = await new Promise<ServerType>((resolvePromise) => {
      const s = serve(
        { fetch: inspectorApp.fetch, port: inspectorPort, hostname: '127.0.0.1' },
        () => resolvePromise(s),
      );
    });
    studios.push({
      port: inspectorPort,
      server: inspectorServer,
      receivedPaths: [],
      receivedRequests: [],
      secondChunkEnqueuedAt: Promise.resolve(0),
    });
    await writeStudioDescriptor(fx.root, {
      port: inspectorPort,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: '0.15.0',
    });
    const { app } = createSidecarApp(fx.root);
    const req = new Request('http://x/dev/inspect');
    req.headers.delete('host');
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    // Acceptable values: '' (empty string from `?? ''`) or '<missing>'
    // (header omitted entirely). The bug we're guarding against is
    // the literal four-letter string 'undefined'.
    expect(captured[0]).not.toBe('undefined');
    expect(['', '<missing>']).toContain(captured[0]);
  });

  it('streams response body unbuffered (chunk-1 arrives before chunk-2 is enqueued)', async () => {
    const studio = await bootFakeStudio(12);
    studios.push(studio);
    await writeStudioDescriptor(fx.root, {
      port: studio.port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: '0.15.0',
    });
    const { app } = createSidecarApp(fx.root);
    const res = await app.fetch(new Request('http://x/dev/slow-stream'));
    expect(res.status).toBe(200);
    if (res.body === null) throw new Error('expected streamed body');
    const reader = res.body.getReader();
    const firstRead = await reader.read();
    const firstChunkAt = Date.now();
    expect(firstRead.done).toBe(false);
    const firstChunk = new TextDecoder().decode(firstRead.value);
    expect(firstChunk).toContain('chunk-1');
    // Drain remaining chunks so the upstream stream completes and
    // `secondChunkEnqueuedAt` resolves.
    let rest = '';
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      rest += new TextDecoder().decode(r.value);
    }
    expect(rest).toContain('chunk-2');
    const secondChunkAt = await studio.secondChunkEnqueuedAt;
    // The first chunk must arrive at the client BEFORE the second
    // chunk is enqueued upstream (50ms after start). If the proxy
    // buffered, both chunks would arrive together AFTER the 50ms
    // upstream wait — making firstChunkAt >= secondChunkAt.
    expect(firstChunkAt).toBeLessThan(secondChunkAt);
  });
});
