/**
 * Studio-side fixture for chat-page tests. The bridge route shapes are
 * tested directly against `createChatRouter` in `@deskwork/bridge`'s
 * test suite; this fixture only exists for the studio's `/dev/chat`
 * page-render test, which needs a full `createApp` mount with `bridge`
 * threaded through the StudioContext.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BridgeQueue, ChatLog } from '@deskwork/bridge';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '@/server.ts';

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
  const root = mkdtempSync(join(tmpdir(), 'studio-bridge-chat-page-'));
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
