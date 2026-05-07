/**
 * Integration test for the "studio restart doesn't drop MCP" property.
 *
 * The property under test:
 *
 *   1. Sidecar holds the BridgeQueue + ChatLog. The studio is a
 *      separate, transient HTTP surface.
 *   2. An MCP-side caller (the listen loop) is awaiting an operator
 *      message via `awaitNextOperatorMessage`.
 *   3. The studio process bounces — its descriptor goes stale, then a
 *      new one comes online with a different port.
 *   4. An operator message arriving via the sidecar's
 *      `/api/chat/send` route is delivered to the awaiter regardless
 *      of the studio bounce.
 *
 * No real CC needed — we drive the queue directly via the sidecar's
 * createSidecarApp + a fake studio Hono app. The studio bounce is
 * simulated by closing one fake studio's server and writing a new
 * descriptor pointing at a fresh fake studio.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { serve, type ServerType } from '@hono/node-server';
import { createSidecarApp } from '@/server.ts';
import { writeStudioDescriptor } from '@/descriptor.ts';

interface RunningStudio {
  port: number;
  server: ServerType;
}

function pickPort(seed: number): number {
  return 54000 + (process.pid % 200) + seed;
}

async function bootFakeStudio(seed: number): Promise<RunningStudio> {
  const app = new Hono();
  app.get('/dev/ping', (c) => c.text(`pong ${seed}`, 200));
  const port = pickPort(seed);
  const server = await new Promise<ServerType>((resolvePromise) => {
    const s = serve(
      { fetch: app.fetch, port, hostname: '127.0.0.1' },
      () => resolvePromise(s),
    );
  });
  return { port, server };
}

async function shutFakeStudio(s: RunningStudio): Promise<void> {
  await new Promise<void>((resolvePromise) => {
    s.server.close(() => resolvePromise());
  });
}

describe('survives-studio-restart', () => {
  let root: string;
  const studios: RunningStudio[] = [];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bridge-survives-restart-'));
    mkdirSync(join(root, '.deskwork'), { recursive: true });
  });

  afterEach(async () => {
    for (const s of studios) {
      await shutFakeStudio(s);
    }
    studios.length = 0;
    rmSync(root, { recursive: true, force: true });
  });

  it('queue + MCP awaiter survive a studio bounce', async () => {
    // 1. Boot a fake studio + write its descriptor.
    const studioA = await bootFakeStudio(1);
    studios.push(studioA);
    await writeStudioDescriptor(root, {
      port: studioA.port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: '0.15.0',
    });

    // 2. Construct the sidecar app — same instance held across the
    //    studio bounce, mimicking the long-lived process.
    const { app, queue } = createSidecarApp(root);

    // 3. Through-proxy hit succeeds.
    const beforeBounce = await app.fetch(new Request('http://x/dev/ping'));
    expect(beforeBounce.status).toBe(200);
    expect(await beforeBounce.text()).toBe('pong 1');

    // 4. MCP-side awaiter parks on the queue.
    queue.setMcpConnected(true);
    queue.setListenModeOn(true);
    const awaitPromise = queue.awaitNextOperatorMessage(5000);

    // 5. Studio bounces: kill A, boot B on a different port, rewrite
    //    the descriptor.
    await shutFakeStudio(studioA);
    studios.length = 0;

    // While the studio is down, /dev/* through the sidecar returns
    // 502. /api/chat/* is unaffected.
    const duringBounce = await app.fetch(new Request('http://x/dev/ping'));
    expect(duringBounce.status).toBe(502);
    const stateDuringBounce = await app.fetch(
      new Request('http://x/api/chat/state'),
    );
    expect(stateDuringBounce.status).toBe(200);

    const studioB = await bootFakeStudio(2);
    studios.push(studioB);
    await writeStudioDescriptor(root, {
      port: studioB.port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: '0.15.0',
    });

    // 6. Operator-side message arrives via the sidecar's
    //    /api/chat/send route.
    const sendRes = await app.fetch(
      new Request('http://x/api/chat/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hello after bounce' }),
      }),
    );
    expect(sendRes.status).toBe(200);

    // 7. The awaiter parked BEFORE the bounce resolves with the
    //    post-bounce message. Property held: the bridge queue
    //    survived the studio's lifecycle.
    const msg = await awaitPromise;
    expect(msg).not.toBeNull();
    if (msg !== null) {
      expect(msg.text).toBe('hello after bounce');
    }

    // 8. /dev/* now reaches studio B.
    const afterBounce = await app.fetch(new Request('http://x/dev/ping'));
    expect(afterBounce.status).toBe(200);
    expect(await afterBounce.text()).toBe('pong 2');
  });
});
