/**
 * Tool-handler tests — `awaitStudioMessageHandler` and
 * `sendStudioResponseHandler` exercised directly without instantiating
 * the SDK or mounting Hono. The bridge↔queue↔log core lives here.
 *
 * Includes the persist-before-publish regression: if `log.append`
 * rejects, no subscriber sees a phantom event.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  awaitStudioMessageHandler,
  sendStudioResponseHandler,
  type BridgeDeps,
} from '@/bridge/mcp-server.ts';
import type { ChatLogStore, LoadHistoryOptions } from '@/bridge/persistence.ts';
import type { AgentEvent, ChatLogRow } from '@/bridge/types.ts';
import { makeBridge, cleanupBridge, type Bridge } from './mcp-fixture.ts';

describe('awaitStudioMessageHandler', () => {
  let bridge: Bridge;
  beforeEach(() => {
    bridge = makeBridge();
  });
  afterEach(() => cleanupBridge(bridge));

  it('first call flips listenModeOn (idempotent on subsequent calls)', async () => {
    expect(bridge.queue.currentState().listenModeOn).toBe(false);
    const ctrl = new AbortController();
    const p1 = awaitStudioMessageHandler(
      bridge,
      { timeoutSeconds: 0.05 },
      ctrl.signal,
    );
    expect(bridge.queue.currentState().listenModeOn).toBe(true);
    const r1 = await p1;
    expect(r1.received).toBe(false);
    expect(bridge.queue.currentState().listenModeOn).toBe(true);

    const p2 = awaitStudioMessageHandler(
      bridge,
      { timeoutSeconds: 0.05 },
      ctrl.signal,
    );
    expect(bridge.queue.currentState().listenModeOn).toBe(true);
    await p2;
  });

  it('blocks until enqueue resolves the awaiter', async () => {
    const ctrl = new AbortController();
    const pending = awaitStudioMessageHandler(
      bridge,
      { timeoutSeconds: 5 },
      ctrl.signal,
    );
    bridge.queue.enqueueOperatorMessage('hi-there');
    const r = await pending;
    expect(r.received).toBe(true);
    expect(r.message?.text).toBe('hi-there');
  });

  it('returns null on timeout', async () => {
    const ctrl = new AbortController();
    const r = await awaitStudioMessageHandler(
      bridge,
      { timeoutSeconds: 0.05 },
      ctrl.signal,
    );
    expect(r.received).toBe(false);
    expect(r.message).toBeNull();
  });

  it('clears awaitingMessage after returning (success path)', async () => {
    const ctrl = new AbortController();
    const pending = awaitStudioMessageHandler(
      bridge,
      { timeoutSeconds: 5 },
      ctrl.signal,
    );
    expect(bridge.queue.currentState().awaitingMessage).toBe(true);
    bridge.queue.enqueueOperatorMessage('ok');
    await pending;
    expect(bridge.queue.currentState().awaitingMessage).toBe(false);
  });

  it('clears awaitingMessage after returning (timeout path)', async () => {
    const ctrl = new AbortController();
    await awaitStudioMessageHandler(
      bridge,
      { timeoutSeconds: 0.02 },
      ctrl.signal,
    );
    expect(bridge.queue.currentState().awaitingMessage).toBe(false);
  });
});

describe('sendStudioResponseHandler', () => {
  let bridge: Bridge;
  beforeEach(() => {
    bridge = makeBridge();
  });
  afterEach(() => cleanupBridge(bridge));

  it('prose: fans out to subscribers', async () => {
    const seen: AgentEvent[] = [];
    bridge.queue.subscribe((e) => seen.push(e));
    const ev = await sendStudioResponseHandler(bridge, {
      kind: 'prose',
      text: 'hello world',
    });
    expect(seen.length).toBe(1);
    const got = seen[0];
    if (got !== undefined && got.kind === 'prose') {
      expect(got.text).toBe('hello world');
    } else {
      throw new Error('expected prose event');
    }
    expect(ev.kind).toBe('prose');
    expect(ev.seq).toBeGreaterThan(0);
  });

  it('tool-use: fans out to subscribers', async () => {
    const seen: AgentEvent[] = [];
    bridge.queue.subscribe((e) => seen.push(e));
    const ev = await sendStudioResponseHandler(bridge, {
      kind: 'tool-use',
      tool: 'Read',
      args: { file: 'a.md' },
      status: 'starting',
    });
    expect(seen.length).toBe(1);
    const got = seen[0];
    if (got !== undefined && got.kind === 'tool-use') {
      expect(got.tool).toBe('Read');
      expect(got.args).toEqual({ file: 'a.md' });
      expect(got.status).toBe('starting');
    } else {
      throw new Error('expected tool-use event');
    }
    expect(ev.kind).toBe('tool-use');
  });

  it('persists to log before returning success', async () => {
    const ev = await sendStudioResponseHandler(bridge, {
      kind: 'prose',
      text: 'persisted',
    });
    const rows = await bridge.log.loadHistory({ sinceSeq: 0, limit: 10 });
    expect(rows.length).toBe(1);
    const row = rows[0];
    if (row !== undefined && 'kind' in row && row.kind === 'prose') {
      expect(row.text).toBe('persisted');
      expect(row.seq).toBe(ev.seq);
    } else {
      throw new Error('expected prose row');
    }
  });

  it('tool-use without optional fields persists cleanly', async () => {
    const ev = await sendStudioResponseHandler(bridge, {
      kind: 'tool-use',
      tool: 'Bash',
      args: 'ls',
    });
    expect(ev.kind).toBe('tool-use');
    const rows = await bridge.log.loadHistory({ sinceSeq: 0, limit: 10 });
    expect(rows.length).toBe(1);
  });

  // Regression for the Phase-3-review CRITICAL bug: if append rejects
  // AFTER publish, subscribers see a phantom event whose log row never
  // lands → SSE replay produces a spurious gap. The fix is
  // allocate→append→publish; this test pins the order.
  it('persist failure: rejects, NO subscriber sees the event, queue state unchanged', async () => {
    class FailingLog implements ChatLogStore {
      readonly inner: ChatLogStore;
      constructor(inner: ChatLogStore) {
        this.inner = inner;
      }
      append(_row: ChatLogRow): Promise<void> {
        return Promise.reject(new Error('disk full'));
      }
      loadHistory(opts?: LoadHistoryOptions): Promise<ChatLogRow[]> {
        return this.inner.loadHistory(opts);
      }
    }
    const failing: BridgeDeps = {
      queue: bridge.queue,
      log: new FailingLog(bridge.log),
    };
    let count = 0;
    bridge.queue.subscribe(() => {
      count += 1;
    });
    const stateBefore = bridge.queue.currentState();
    await expect(
      sendStudioResponseHandler(failing, {
        kind: 'prose',
        text: 'should not fan out',
      }),
    ).rejects.toThrow(/disk full/);
    expect(count).toBe(0);
    expect(bridge.queue.currentState()).toEqual(stateBefore);
  });
});
