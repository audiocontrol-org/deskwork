/**
 * Shared fixture for bridge HTTP route tests. Builds a fresh Hono app
 * via `createApp(ctx)` with a `BridgeQueue` + `ChatLog` pointed at a
 * tmpdir project root. Each test file calls `makeFixture()` in its
 * `beforeEach` and `cleanupFixture(fx)` in its `afterEach`.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '@/server.ts';
import { BridgeQueue } from '@/bridge/queue.ts';
import { ChatLog } from '@/bridge/persistence.ts';

export function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      a: {
        host: 'a.example',
        contentDir: 'src/sites/a/content/blog',
        calendarPath: 'docs/cal-a.md',
        blogFilenameTemplate: '{slug}.md',
      },
    },
    defaultSite: 'a',
  };
}

export interface Fixture {
  app: ReturnType<typeof createApp>;
  queue: BridgeQueue;
  log: ChatLog;
  root: string;
}

export function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'studio-bridge-routes-'));
  const queue = new BridgeQueue();
  const log = new ChatLog({ projectRoot: root });
  const app = createApp({
    projectRoot: root,
    config: makeConfig(),
    bridge: { queue, log },
  });
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
