/**
 * GET /api/chat/stream (SSE) route tests: headers, live publication,
 * Last-Event-ID replay (incl. invalid + decimal id rejection),
 * corruption-marker filtering, and subscribe-before-replay dedup.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '@/server.ts';
import { BridgeQueue } from '@/bridge/queue.ts';
import type { ChatLogStore } from '@/bridge/persistence.ts';
import type { AgentEvent, ChatLogRow } from '@/bridge/types.ts';
import { openSSE, readSSEUntil } from './sse-helpers.ts';
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

  it('Last-Event-ID replays AgentEvent rows on the agent-event channel', async () => {
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
    expect(buf).toContain('event: agent-event');
    expect(buf).toContain('id: 2');
    expect(buf).toContain('id: 3');
    expect(buf).toContain('"text":"agent-1"');
    expect(buf).toContain('"tool":"Bash"');
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

  it('Last-Event-ID replay covers operator messages and corruption markers via history-row', async () => {
    // Live SSE doesn't fan out operator messages (subscribe carries
    // AgentEvent only), but reconnect needs full catch-up: operator
    // rows posted via /send from another tab, and any corruption
    // markers persisted by the log store, must be replayed too.
    await fx.log.append({ seq: 1, ts: 100, role: 'operator', text: 'op-1' });
    await fx.log.append({ kind: 'prose', seq: 2, ts: 200, text: 'agent-1' });
    await fx.log.append({ seq: 3, ts: 300, role: 'operator', text: 'op-2' });
    await fx.log.append({
      kind: 'corruption-marker',
      from: 3,
      to: 5,
      ts: 350,
    });
    await fx.log.append({ kind: 'prose', seq: 5, ts: 500, text: 'agent-2' });

    const opened = await openSSE(fx.app, 'http://x/api/chat/stream', {
      'Last-Event-ID': '0',
    });
    const buf = await readSSEUntil(
      opened.response,
      (s) => s.includes('"text":"agent-2"'),
      800,
    );
    // Both operator messages present on the history-row channel.
    expect(buf).toContain('event: history-row');
    expect(buf).toContain('"text":"op-1"');
    expect(buf).toContain('"text":"op-2"');
    expect(buf).toContain('id: 1');
    expect(buf).toContain('id: 3');
    // Both agent events present on the agent-event channel.
    expect(buf).toContain('event: agent-event');
    expect(buf).toContain('"text":"agent-1"');
    expect(buf).toContain('"text":"agent-2"');
    // Corruption marker present on history-row (no id; markers don't
    // carry seq).
    expect(buf).toContain('"kind":"corruption-marker"');
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
