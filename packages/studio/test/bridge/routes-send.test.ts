/**
 * POST /api/chat/send route tests: validation, happy path, and the
 * persist-before-deliver ordering invariant.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '@/server.ts';
import { BridgeQueue } from '@/bridge/queue.ts';
import { ChatLog } from '@/bridge/persistence.ts';
import type { ChatLogStore, LoadHistoryOptions } from '@/bridge/persistence.ts';
import {
  makeConfig,
  makeFixture,
  cleanupFixture,
  postJson,
  postRaw,
  type Fixture,
} from './fixture.ts';

let fx: Fixture;

beforeEach(() => {
  fx = makeFixture();
});

afterEach(() => {
  cleanupFixture(fx);
});

function bringBridgeOnline(): void {
  fx.queue.setMcpConnected(true);
  fx.queue.setListenModeOn(true);
}

function seqAndTsOf(body: unknown): { seq: number; ts: number } {
  if (
    body === null ||
    typeof body !== 'object' ||
    !('seq' in body) ||
    !('ts' in body) ||
    typeof body.seq !== 'number' ||
    typeof body.ts !== 'number'
  ) {
    throw new Error(`expected {seq, ts}, got ${JSON.stringify(body)}`);
  }
  return { seq: body.seq, ts: body.ts };
}

describe('POST /api/chat/send', () => {
  it('returns 503 when the bridge is offline (initial state)', async () => {
    const r = await postJson(fx, '/api/chat/send', { text: 'hi' });
    expect(r.status).toBe(503);
    expect(r.body).toEqual({
      error: 'bridge-offline',
      state: {
        mcpConnected: false,
        listenModeOn: false,
        awaitingMessage: false,
      },
    });
  });

  it('returns 503 when only mcpConnected is true', async () => {
    fx.queue.setMcpConnected(true);
    const r = await postJson(fx, '/api/chat/send', { text: 'hi' });
    expect(r.status).toBe(503);
  });

  it('returns 503 when only listenModeOn is true', async () => {
    fx.queue.setListenModeOn(true);
    const r = await postJson(fx, '/api/chat/send', { text: 'hi' });
    expect(r.status).toBe(503);
  });

  it('happy path: enqueues and persists, returns {seq, ts}', async () => {
    bringBridgeOnline();
    const r = await postJson(fx, '/api/chat/send', { text: 'hello' });
    expect(r.status).toBe(200);
    const body = seqAndTsOf(r.body);
    expect(body.seq).toBe(1);
    expect(typeof body.ts).toBe('number');

    const rows = await fx.log.loadHistory({ sinceSeq: 0, limit: 100 });
    expect(rows.length).toBe(1);
    const row = rows[0];
    if (row === undefined) throw new Error('row missing');
    expect('role' in row && row.role === 'operator').toBe(true);
    if ('role' in row && row.role === 'operator') {
      expect(row.text).toBe('hello');
      expect(row.seq).toBe(1);
    }
  });

  it('contextRef flows through to the persisted message', async () => {
    bringBridgeOnline();
    const r = await postJson(fx, '/api/chat/send', {
      text: 'with-ref',
      contextRef: 'entry/abc-123',
    });
    expect(r.status).toBe(200);
    const rows = await fx.log.loadHistory({ sinceSeq: 0, limit: 100 });
    const row = rows[0];
    if (row === undefined || !('role' in row) || row.role !== 'operator') {
      throw new Error('expected operator row');
    }
    expect(row.contextRef).toBe('entry/abc-123');
  });

  it('returns 400 on malformed JSON', async () => {
    bringBridgeOnline();
    const r = await postRaw(fx, '/api/chat/send', '{ not-json');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-json' });
  });

  it('returns 400 on missing text', async () => {
    bringBridgeOnline();
    const r = await postJson(fx, '/api/chat/send', {});
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-body' });
  });

  it('returns 400 on non-string text', async () => {
    bringBridgeOnline();
    const r = await postJson(fx, '/api/chat/send', { text: 42 });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-body' });
  });

  it('returns 400 on empty text', async () => {
    bringBridgeOnline();
    const r = await postJson(fx, '/api/chat/send', { text: '' });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-body' });
  });

  it('returns 400 on non-string contextRef', async () => {
    bringBridgeOnline();
    const r = await postJson(fx, '/api/chat/send', {
      text: 'ok',
      contextRef: 99,
    });
    expect(r.status).toBe(400);
  });

  it('returns 413 when text > 32768 bytes', async () => {
    bringBridgeOnline();
    const big = 'x'.repeat(32769);
    const r = await postJson(fx, '/api/chat/send', { text: big });
    expect(r.status).toBe(413);
    expect(r.body).toEqual({ error: 'payload-too-large', max: 32768 });
  });

  it('accepts text exactly at 32768 bytes', async () => {
    bringBridgeOnline();
    const exact = 'x'.repeat(32768);
    const r = await postJson(fx, '/api/chat/send', { text: exact });
    expect(r.status).toBe(200);
  });

  it('persistence failure: agent never sees the message and operator gets non-2xx', async () => {
    // Wrapper around the real ChatLog whose `append` rejects. Composition,
    // not inheritance — `ChatLogStore` is a structural interface so this
    // typechecks without `as`. The route must persist-then-deliver, so a
    // rejected append leaves the queue's waiter unresolved.
    const root = mkdtempSync(join(tmpdir(), 'studio-bridge-routes-fail-'));
    try {
      const realLog = new ChatLog({ projectRoot: root });
      const failingLog: ChatLogStore = {
        append: () => Promise.reject(new Error('disk-full')),
        loadHistory: (opts?: LoadHistoryOptions) =>
          realLog.loadHistory(opts ?? {}),
      };
      const queue = new BridgeQueue();
      const app = createApp({
        projectRoot: root,
        config: makeConfig(),
        bridge: { queue, log: failingLog },
      });
      queue.setMcpConnected(true);
      queue.setListenModeOn(true);

      // Concurrent awaiter: if the route delivered before persisting, this
      // would resolve with the message. Persist-before-deliver means the
      // awaiter must time out (resolve null) instead.
      const awaiter = queue.awaitNextOperatorMessage(50);

      const res = await app.fetch(
        new Request('http://x/api/chat/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: 'never-delivered' }),
        }),
      );
      // Hono surfaces a thrown handler as a 500 by default; the exact body
      // shape isn't asserted (Hono's choice), only the non-2xx status.
      expect(res.status).toBeGreaterThanOrEqual(500);

      const got = await awaiter;
      expect(got).toBeNull();
      expect(queue.currentState().awaitingMessage).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
