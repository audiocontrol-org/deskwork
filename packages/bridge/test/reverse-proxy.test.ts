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

async function bootFakeStudio(seed: number): Promise<RunningStudio> {
  const app = new Hono();
  const receivedPaths: string[] = [];
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
  const port = pickFakeStudioPort(seed);
  const server = await new Promise<ServerType>((resolvePromise) => {
    const s = serve(
      { fetch: app.fetch, port, hostname: '127.0.0.1' },
      () => resolvePromise(s),
    );
  });
  return { port, server, receivedPaths };
}

async function shutFakeStudio(s: RunningStudio): Promise<void> {
  await new Promise<void>((resolvePromise) => {
    s.server.close(() => resolvePromise());
  });
}

describe('sidecar reverse proxy', () => {
  let fx: Fixture;
  const studios: RunningStudio[] = [];

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
});
