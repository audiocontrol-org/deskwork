/**
 * Shared fixture for bridge HTTP route tests. Builds a minimal Hono app
 * that mounts only the bridge surface (`/api/chat/*`) — no studio
 * pages, no static assets, no api/dev routes. The fixture is the
 * package-local equivalent of what the sidecar's `createSidecarApp`
 * builds, scoped to the chat router so tests stay focused on the route
 * shapes.
 */

import { Hono } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BridgeQueue } from '@/queue.ts';
import { ChatLog } from '@/persistence.ts';
import { createChatRouter } from '@/routes.ts';

export interface Fixture {
  app: Hono;
  queue: BridgeQueue;
  log: ChatLog;
  root: string;
}

export function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'deskwork-bridge-routes-'));
  const queue = new BridgeQueue();
  const log = new ChatLog({ projectRoot: root });
  const app = new Hono();
  app.route('/api/chat', createChatRouter({ queue, log }));
  return { app, queue, log, root };
}

export function cleanupFixture(fx: Fixture): void {
  rmSync(fx.root, { recursive: true, force: true });
}

export async function postJson(
  fx: Fixture,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fx.app.fetch(
    new Request(`http://x${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

export async function postRaw(
  fx: Fixture,
  path: string,
  raw: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fx.app.fetch(
    new Request(`http://x${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }),
  );
  return { status: res.status, body: await res.json() };
}

export async function getJson(
  fx: Fixture,
  path: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fx.app.fetch(new Request(`http://x${path}`));
  return { status: res.status, body: await res.json() };
}
