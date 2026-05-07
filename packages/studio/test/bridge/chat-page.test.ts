/**
 * Server-side route + render tests for /dev/chat.
 *
 * The full-page client behavior (EventSource subscription, history
 * fetch, mobile breakpoint) is covered by the local end-to-end smoke
 * (Phase 8). Here we verify the route is wired conditionally on
 * ctx.bridge and the rendered HTML carries the mount node + client
 * script reference.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '@/server.ts';
import {
  makeConfig,
  makeFixture,
  cleanupFixture,
  type Fixture,
} from './fixture.ts';

let fx: Fixture;

beforeEach(() => {
  fx = makeFixture();
});

afterEach(() => {
  cleanupFixture(fx);
});

describe('GET /dev/chat', () => {
  it('returns 200 HTML when bridge is wired', async () => {
    const res = await fx.app.fetch(new Request('http://x/dev/chat'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('chat-root');
    expect(text).toContain('chat-page');
  });

  it('emits data-project-root on body so the client can namespace drafts', async () => {
    const res = await fx.app.fetch(new Request('http://x/dev/chat'));
    const text = await res.text();
    expect(text).toMatch(/data-project-root="[^"]+"/);
  });

  it('returns 404 when ctx.bridge is undefined', async () => {
    const root = mkdtempSync(join(tmpdir(), 'studio-bridge-chat-page-'));
    try {
      const appNoBridge = createApp({
        projectRoot: root,
        config: makeConfig(),
      });
      const res = await appNoBridge.fetch(new Request('http://x/dev/chat'));
      expect(res.status).toBe(404);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('references the chat.css stylesheet', async () => {
    const res = await fx.app.fetch(new Request('http://x/dev/chat'));
    const text = await res.text();
    expect(text).toContain('/static/css/chat.css');
  });
});

// Phase 10b: the bridge router lives in @deskwork/bridge, but the studio
// still mounts /api/chat conditionally on ctx.bridge in single-process
// mode. This test asserts the studio gates that mount; bridge-side route
// shapes are exercised in @deskwork/bridge's own test suite.
describe('Bridge router is opt-in (studio mount)', () => {
  it('routes are NOT mounted when ctx.bridge is undefined', async () => {
    const root = mkdtempSync(join(tmpdir(), 'studio-bridge-routes-noop-'));
    try {
      const appNoBridge = createApp({
        projectRoot: root,
        config: makeConfig(),
      });
      const res = await appNoBridge.fetch(
        new Request('http://x/api/chat/state'),
      );
      expect(res.status).toBe(404);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
