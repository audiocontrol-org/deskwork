/**
 * Bridge HTTP route tests. Builds the Hono app via `createApp(ctx)`
 * with a fresh BridgeQueue + ChatLog per test pointed at a tmpdir
 * project root, then drives routes via `app.fetch(new Request(...))`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '@/server.ts';
import { BridgeQueue } from '@/bridge/queue.ts';
import { ChatLog } from '@/bridge/persistence.ts';
import type { ChatLogStore, LoadHistoryOptions } from '@/bridge/persistence.ts';
import type { AgentEvent, ChatLogRow } from '@/bridge/types.ts';
import { openSSE, readSSEUntil } from './sse-helpers.ts';

function makeConfig(): DeskworkConfig {
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

interface Fixture {
  app: ReturnType<typeof createApp>;
  queue: BridgeQueue;
  log: ChatLog;
  root: string;
}

let fx: Fixture;

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'studio-bridge-routes-'));
  const queue = new BridgeQueue();
  const log = new ChatLog({ projectRoot: root });
  const app = createApp({
    projectRoot: root,
    config: makeConfig(),
    bridge: { queue, log },
  });
  fx = { app, queue, log, root };
});

afterEach(() => {
  rmSync(fx.root, { recursive: true, force: true });
});

async function postJson(
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

async function postRaw(
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

async function getJson(
  path: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fx.app.fetch(new Request(`http://x${path}`));
  return { status: res.status, body: await res.json() };
}

function bringBridgeOnline(): void {
  fx.queue.setMcpConnected(true);
  fx.queue.setListenModeOn(true);
}

function rowsOf(body: unknown): ChatLogRow[] {
  if (
    body === null ||
    typeof body !== 'object' ||
    !('rows' in body) ||
    !Array.isArray(body.rows)
  ) {
    throw new Error(`expected {rows: []}, got ${JSON.stringify(body)}`);
  }
  return body.rows;
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
    const r = await postJson('/api/chat/send', { text: 'hi' });
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
    const r = await postJson('/api/chat/send', { text: 'hi' });
    expect(r.status).toBe(503);
  });

  it('returns 503 when only listenModeOn is true', async () => {
    fx.queue.setListenModeOn(true);
    const r = await postJson('/api/chat/send', { text: 'hi' });
    expect(r.status).toBe(503);
  });

  it('happy path: enqueues and persists, returns {seq, ts}', async () => {
    bringBridgeOnline();
    const r = await postJson('/api/chat/send', { text: 'hello' });
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
    const r = await postJson('/api/chat/send', {
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
    const r = await postRaw('/api/chat/send', '{ not-json');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-json' });
  });

  it('returns 400 on missing text', async () => {
    bringBridgeOnline();
    const r = await postJson('/api/chat/send', {});
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-body' });
  });

  it('returns 400 on non-string text', async () => {
    bringBridgeOnline();
    const r = await postJson('/api/chat/send', { text: 42 });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-body' });
  });

  it('returns 400 on empty text', async () => {
    bringBridgeOnline();
    const r = await postJson('/api/chat/send', { text: '' });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-body' });
  });

  it('returns 400 on non-string contextRef', async () => {
    bringBridgeOnline();
    const r = await postJson('/api/chat/send', {
      text: 'ok',
      contextRef: 99,
    });
    expect(r.status).toBe(400);
  });

  it('returns 413 when text > 32768 bytes', async () => {
    bringBridgeOnline();
    const big = 'x'.repeat(32769);
    const r = await postJson('/api/chat/send', { text: big });
    expect(r.status).toBe(413);
    expect(r.body).toEqual({ error: 'payload-too-large', max: 32768 });
  });

  it('accepts text exactly at 32768 bytes', async () => {
    bringBridgeOnline();
    const exact = 'x'.repeat(32768);
    const r = await postJson('/api/chat/send', { text: exact });
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

describe('GET /api/chat/state', () => {
  it('returns initial offline state', async () => {
    const r = await getJson('/api/chat/state');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      mcpConnected: false,
      listenModeOn: false,
      awaitingMessage: false,
    });
  });

  it('reflects state changes', async () => {
    fx.queue.setMcpConnected(true);
    const r = await getJson('/api/chat/state');
    expect(r.body).toEqual({
      mcpConnected: true,
      listenModeOn: false,
      awaitingMessage: false,
    });
  });
});

describe('GET /api/chat/history', () => {
  async function seedRows(rows: ChatLogRow[]): Promise<void> {
    for (const r of rows) await fx.log.append(r);
  }

  it('empty log returns {rows: []}', async () => {
    const r = await getJson('/api/chat/history');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ rows: [] });
  });

  it('returns 3 rows in order after 3 appends', async () => {
    await seedRows([
      { seq: 1, ts: 100, role: 'operator', text: 'one' },
      { kind: 'prose', seq: 2, ts: 200, text: 'two' },
      { seq: 3, ts: 300, role: 'operator', text: 'three' },
    ]);
    const r = await getJson('/api/chat/history');
    expect(r.status).toBe(200);
    const body = { rows: rowsOf(r.body) };
    expect(body.rows.length).toBe(3);
    expect(body.rows[0]).toMatchObject({ seq: 1, text: 'one' });
    expect(body.rows[2]).toMatchObject({ seq: 3, text: 'three' });
  });

  it('?since=2 filters out rows with seq <= 2', async () => {
    await seedRows([
      { seq: 1, ts: 100, role: 'operator', text: 'one' },
      { seq: 2, ts: 200, role: 'operator', text: 'two' },
      { seq: 3, ts: 300, role: 'operator', text: 'three' },
    ]);
    const r = await getJson('/api/chat/history?since=2');
    const body = { rows: rowsOf(r.body) };
    expect(body.rows.length).toBe(1);
    expect(body.rows[0]).toMatchObject({ seq: 3 });
  });

  it('?limit=1 returns 1 row', async () => {
    await seedRows([
      { seq: 1, ts: 100, role: 'operator', text: 'one' },
      { seq: 2, ts: 200, role: 'operator', text: 'two' },
      { seq: 3, ts: 300, role: 'operator', text: 'three' },
    ]);
    const r = await getJson('/api/chat/history?limit=1');
    const body = { rows: rowsOf(r.body) };
    expect(body.rows.length).toBe(1);
    expect(body.rows[0]).toMatchObject({ seq: 1 });
  });

  it('?since=0 returns all rows', async () => {
    await seedRows([
      { seq: 1, ts: 100, role: 'operator', text: 'one' },
      { seq: 2, ts: 200, role: 'operator', text: 'two' },
    ]);
    const r = await getJson('/api/chat/history?since=0');
    const body = { rows: rowsOf(r.body) };
    expect(body.rows.length).toBe(2);
  });

  it('returns 400 on negative since', async () => {
    const r = await getJson('/api/chat/history?since=-1');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-since' });
  });

  it('returns 400 on non-integer since', async () => {
    const r = await getJson('/api/chat/history?since=abc');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-since' });
  });

  it('returns 400 on limit=0', async () => {
    const r = await getJson('/api/chat/history?limit=0');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-limit' });
  });

  it('returns 400 on negative limit', async () => {
    const r = await getJson('/api/chat/history?limit=-3');
    expect(r.status).toBe(400);
  });

  it('returns 400 on non-integer limit', async () => {
    const r = await getJson('/api/chat/history?limit=foo');
    expect(r.status).toBe(400);
  });

  it('empty ?since= falls back to default (treated as if not supplied)', async () => {
    await fx.log.append({ seq: 1, ts: 100, role: 'operator', text: 'one' });
    await fx.log.append({ seq: 2, ts: 200, role: 'operator', text: 'two' });
    const r = await getJson('/api/chat/history?since=');
    expect(r.status).toBe(200);
    expect(rowsOf(r.body).length).toBe(2);
  });

  it('empty ?limit= falls back to default (treated as if not supplied)', async () => {
    await fx.log.append({ seq: 1, ts: 100, role: 'operator', text: 'one' });
    const r = await getJson('/api/chat/history?limit=');
    expect(r.status).toBe(200);
    expect(rowsOf(r.body).length).toBe(1);
  });
});

describe('GET /api/chat/stream (SSE)', () => {
  it('returns text/event-stream content-type with no-cache + no-buffer headers', async () => {
    const opened = await openSSE(fx.app, 'http://x/api/chat/stream');
    expect(opened.response.status).toBe(200);
    expect(opened.response.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(opened.response.headers.get('x-accel-buffering')).toBe('no');
    expect(opened.response.headers.get('cache-control')).toMatch(/no-cache/);
    await opened.close();
  });

  it('emits an agent-event when the queue publishes one', async () => {
    const opened = await openSSE(fx.app, 'http://x/api/chat/stream');
    // Publish after subscription registers (subscribe is synchronous;
    // publishAgentEvent fans out to current subscribers only).
    setTimeout(() => {
      const ev: AgentEvent = { kind: 'prose', seq: 5, ts: 1000, text: 'hello' };
      fx.queue.publishAgentEvent(ev);
    }, 20);
    const buf = await readSSEUntil(
      opened.response,
      (s) => s.includes('event: agent-event') && s.includes('"seq":5'),
      800,
    );
    expect(buf).toContain('event: agent-event');
    expect(buf).toContain('id: 5');
    expect(buf).toContain('"text":"hello"');
    await opened.close();
  });

  it('emits a bridge-state event when state changes', async () => {
    const opened = await openSSE(fx.app, 'http://x/api/chat/stream');
    setTimeout(() => fx.queue.setMcpConnected(true), 20);
    const buf = await readSSEUntil(
      opened.response,
      (s) => s.includes('event: bridge-state') && s.includes('"mcpConnected":true'),
      800,
    );
    expect(buf).toContain('event: bridge-state');
    await opened.close();
  });

  it('Last-Event-ID replays AgentEvent rows; filters operator messages', async () => {
    await fx.log.append({ seq: 1, ts: 100, role: 'operator', text: 'op-msg' });
    await fx.log.append({ kind: 'prose', seq: 2, ts: 200, text: 'agent-1' });
    await fx.log.append({
      kind: 'tool-use',
      seq: 3,
      ts: 300,
      tool: 'Bash',
      args: { command: 'ls' },
    });

    const opened = await openSSE(fx.app, 'http://x/api/chat/stream', {
      'Last-Event-ID': '1',
    });
    expect(opened.response.status).toBe(200);
    const buf = await readSSEUntil(
      opened.response,
      (s) => s.includes('"seq":2') && s.includes('"seq":3'),
      800,
    );
    expect(buf).toContain('id: 2');
    expect(buf).toContain('id: 3');
    expect(buf).toContain('"text":"agent-1"');
    expect(buf).toContain('"tool":"Bash"');
    expect(buf).not.toContain('"text":"op-msg"');
    await opened.close();
  });

  it('invalid Last-Event-ID is ignored (no replay, no error)', async () => {
    await fx.log.append({ kind: 'prose', seq: 1, ts: 100, text: 'should-not-replay' });
    const opened = await openSSE(fx.app, 'http://x/api/chat/stream', {
      'Last-Event-ID': 'not-a-number',
    });
    expect(opened.response.status).toBe(200);
    const buf = await readSSEUntil(opened.response, () => false, 100);
    expect(buf).not.toContain('should-not-replay');
    await opened.close();
  });

  it('decimal Last-Event-ID is rejected (no replay)', async () => {
    await fx.log.append({ kind: 'prose', seq: 1, ts: 100, text: 'first' });
    await fx.log.append({ kind: 'prose', seq: 2, ts: 200, text: 'second' });
    const opened = await openSSE(fx.app, 'http://x/api/chat/stream', {
      'Last-Event-ID': '1.5',
    });
    expect(opened.response.status).toBe(200);
    const buf = await readSSEUntil(opened.response, () => false, 100);
    expect(buf).not.toContain('id: 1');
    expect(buf).not.toContain('id: 2');
    expect(buf).not.toContain('"text":"first"');
    expect(buf).not.toContain('"text":"second"');
    await opened.close();
  });

  it('corruption-marker rows are filtered out of replay', async () => {
    await fx.log.append({ kind: 'prose', seq: 1, ts: 100, text: 'first' });
    // A corruption marker is a valid log row but not an AgentEvent; the
    // SSE replay path filters via isAgentEvent so the marker MUST NOT
    // appear in the stream output.
    await fx.log.append({
      kind: 'corruption-marker',
      from: 1,
      to: 3,
      ts: 150,
    });
    await fx.log.append({ kind: 'prose', seq: 3, ts: 200, text: 'third' });

    const opened = await openSSE(fx.app, 'http://x/api/chat/stream', {
      'Last-Event-ID': '0',
    });
    const buf = await readSSEUntil(
      opened.response,
      (s) => s.includes('"seq":3'),
      800,
    );
    expect(buf).toContain('"text":"first"');
    expect(buf).toContain('"text":"third"');
    expect(buf).not.toContain('corruption-marker');
    await opened.close();
  });

  it('subscribe-before-replay: live event published during replay is delivered exactly once (no dedup miss)', async () => {
    // Construct an app whose loadHistory we control via a deferred
    // promise: the SSE handler calls loadHistory and awaits it; while
    // it's awaiting, we publish a live event whose seq exceeds the
    // history's last seq. After we resolve loadHistory, the buffered
    // live event must be drained and delivered exactly once.
    const root = mkdtempSync(join(tmpdir(), 'studio-bridge-routes-dedup-'));
    try {
      let resolveHistory: ((rows: ChatLogRow[]) => void) | null = null;
      const historyPromise = new Promise<ChatLogRow[]>((resolve) => {
        resolveHistory = resolve;
      });
      const queue = new BridgeQueue();
      const controlledLog: ChatLogStore = {
        append: () => Promise.resolve(),
        loadHistory: () => historyPromise,
      };
      const app = createApp({
        projectRoot: root,
        config: makeConfig(),
        bridge: { queue, log: controlledLog },
      });

      const opened = await openSSE(app, 'http://x/api/chat/stream', {
        'Last-Event-ID': '1',
      });

      // Publish a live event BEFORE history resolves. The handler is
      // currently blocked on loadHistory(); the buffered event has seq=4,
      // which will exceed lastReplayedSeq=3 after replay finishes.
      await new Promise((r) => setTimeout(r, 20));
      queue.publishAgentEvent({
        kind: 'prose',
        seq: 4,
        ts: 400,
        text: 'live',
      });

      // Resolve the replay with seq 2 + 3.
      if (resolveHistory === null) throw new Error('resolveHistory not set');
      resolveHistory([
        { kind: 'prose', seq: 2, ts: 200, text: 'replay-2' },
        { kind: 'prose', seq: 3, ts: 300, text: 'replay-3' },
      ]);

      const buf = await readSSEUntil(
        opened.response,
        (s) => s.includes('"seq":4'),
        800,
      );
      expect(buf).toContain('"text":"replay-2"');
      expect(buf).toContain('"text":"replay-3"');
      expect(buf).toContain('"text":"live"');
      // seq=4 must appear EXACTLY once.
      const matches = buf.match(/"seq":4/g);
      expect(matches?.length).toBe(1);
      await opened.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('subscribe-before-replay: live event with seq <= lastReplayedSeq is deduped (covered by history)', async () => {
    // Live event seq=2 published during replay; replay covers seq 2 + 3.
    // The buffered live event must be SKIPPED because lastReplayedSeq=3
    // already covers it.
    const root = mkdtempSync(join(tmpdir(), 'studio-bridge-routes-dedup2-'));
    try {
      let resolveHistory: ((rows: ChatLogRow[]) => void) | null = null;
      const historyPromise = new Promise<ChatLogRow[]>((resolve) => {
        resolveHistory = resolve;
      });
      const queue = new BridgeQueue();
      const controlledLog: ChatLogStore = {
        append: () => Promise.resolve(),
        loadHistory: () => historyPromise,
      };
      const app = createApp({
        projectRoot: root,
        config: makeConfig(),
        bridge: { queue, log: controlledLog },
      });

      const opened = await openSSE(app, 'http://x/api/chat/stream', {
        'Last-Event-ID': '1',
      });

      await new Promise((r) => setTimeout(r, 20));
      // This event would already be in the replay set; the dedup must
      // prevent a second copy from getting written when the buffer drains.
      queue.publishAgentEvent({
        kind: 'prose',
        seq: 2,
        ts: 250,
        text: 'duplicate',
      });

      if (resolveHistory === null) throw new Error('resolveHistory not set');
      resolveHistory([
        { kind: 'prose', seq: 2, ts: 200, text: 'replay-2' },
        { kind: 'prose', seq: 3, ts: 300, text: 'replay-3' },
      ]);

      // Read until the timeout fires — this drains everything the
      // server is going to emit (replay rows + any drained-buffer live
      // events). The dedup logic runs synchronously after replay
      // completes; if it fired correctly, "duplicate" never appears.
      const buf = await readSSEUntil(opened.response, () => false, 400);
      expect(buf).toContain('"text":"replay-2"');
      expect(buf).toContain('"text":"replay-3"');
      expect(buf).not.toContain('"text":"duplicate"');
      await opened.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('Bridge router is opt-in', () => {
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
