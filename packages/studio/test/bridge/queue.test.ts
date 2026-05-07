/**
 * BridgeQueue tests — exercises the in-process queue's invariants:
 * single-awaiter, disconnect-clears-await, monotonic seq, multi-
 * subscriber fanout, subscriber error isolation, and state tracking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BridgeQueue } from '@/bridge/queue.ts';
import type { AgentEvent } from '@/bridge/types.ts';

describe('BridgeQueue — enqueue/await pairing', () => {
  it('enqueue-then-await: await resolves with the head message', async () => {
    const q = new BridgeQueue();
    const msg = q.enqueueOperatorMessage('hello');
    const got = await q.awaitNextOperatorMessage(1000);
    expect(got).not.toBeNull();
    expect(got?.text).toBe('hello');
    expect(got?.seq).toBe(msg.seq);
  });

  it('await-then-enqueue: pending await resolves on enqueue', async () => {
    const q = new BridgeQueue();
    const pending = q.awaitNextOperatorMessage(1000);
    const msg = q.enqueueOperatorMessage('howdy');
    const got = await pending;
    expect(got).not.toBeNull();
    expect(got?.text).toBe('howdy');
    expect(got?.seq).toBe(msg.seq);
  });

  it('contextRef passes through on the message', async () => {
    const q = new BridgeQueue();
    q.enqueueOperatorMessage('with-context', 'entry/abc');
    const got = await q.awaitNextOperatorMessage(1000);
    expect(got?.contextRef).toBe('entry/abc');
  });
});

describe('BridgeQueue — multi-subscriber fanout', () => {
  it('three subscribers all receive every event in registration order', () => {
    const q = new BridgeQueue();
    const seenA: AgentEvent[] = [];
    const seenB: AgentEvent[] = [];
    const seenC: AgentEvent[] = [];
    const order: string[] = [];

    q.subscribe((e) => {
      seenA.push(e);
      order.push(`A:${e.seq}`);
    });
    q.subscribe((e) => {
      seenB.push(e);
      order.push(`B:${e.seq}`);
    });
    q.subscribe((e) => {
      seenC.push(e);
      order.push(`C:${e.seq}`);
    });

    const ev1: AgentEvent = { kind: 'prose', seq: 1, ts: 100, text: 'one' };
    const ev2: AgentEvent = { kind: 'prose', seq: 2, ts: 200, text: 'two' };
    q.publishAgentEvent(ev1);
    q.publishAgentEvent(ev2);

    expect(seenA).toEqual([ev1, ev2]);
    expect(seenB).toEqual([ev1, ev2]);
    expect(seenC).toEqual([ev1, ev2]);
    expect(order).toEqual([
      'A:1',
      'B:1',
      'C:1',
      'A:2',
      'B:2',
      'C:2',
    ]);
  });

  it('unsubscribe stops further deliveries', () => {
    const q = new BridgeQueue();
    const seen: AgentEvent[] = [];
    const unsub = q.subscribe((e) => seen.push(e));
    q.publishAgentEvent({ kind: 'prose', seq: 1, ts: 1, text: 'a' });
    unsub();
    q.publishAgentEvent({ kind: 'prose', seq: 2, ts: 2, text: 'b' });
    expect(seen.length).toBe(1);
  });

  it('subscriber error does not block other subscribers', () => {
    const q = new BridgeQueue();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: number[] = [];
    q.subscribe(() => {
      throw new Error('first subscriber boom');
    });
    q.subscribe((e) => seen.push(e.seq));
    q.subscribe((e) => seen.push(e.seq * 10));

    q.publishAgentEvent({ kind: 'prose', seq: 1, ts: 1, text: 'x' });

    expect(seen).toEqual([1, 10]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('subscriber that unsubscribes itself mid-publish: remaining subscribers still receive THIS event in registration order', () => {
    const q = new BridgeQueue();
    const seen: string[] = [];
    let unsubB: (() => void) | null = null;
    q.subscribe((e) => seen.push(`A:${e.seq}`));
    unsubB = q.subscribe((e) => {
      seen.push(`B:${e.seq}`);
      if (unsubB !== null) unsubB();
    });
    q.subscribe((e) => seen.push(`C:${e.seq}`));
    q.subscribe((e) => seen.push(`D:${e.seq}`));

    q.publishAgentEvent({ kind: 'prose', seq: 1, ts: 1, text: 'x' });
    expect(seen).toEqual(['A:1', 'B:1', 'C:1', 'D:1']);

    seen.length = 0;
    q.publishAgentEvent({ kind: 'prose', seq: 2, ts: 2, text: 'y' });
    expect(seen).toEqual(['A:2', 'C:2', 'D:2']);
  });

  it('subscriber that subscribes a new listener mid-publish: new listener is NOT delivered the in-flight event but IS delivered the next event', () => {
    const q = new BridgeQueue();
    const seen: string[] = [];
    q.subscribe((e) => {
      seen.push(`A:${e.seq}`);
      q.subscribe((ev) => seen.push(`NEW:${ev.seq}`));
    });
    q.subscribe((e) => seen.push(`B:${e.seq}`));

    q.publishAgentEvent({ kind: 'prose', seq: 1, ts: 1, text: 'x' });
    expect(seen).toEqual(['A:1', 'B:1']);

    seen.length = 0;
    q.publishAgentEvent({ kind: 'prose', seq: 2, ts: 2, text: 'y' });
    expect(seen).toContain('A:2');
    expect(seen).toContain('B:2');
    expect(seen).toContain('NEW:2');
  });
});

describe('BridgeQueue — timeout and abort', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('await resolves with null after timeout when no enqueue arrives', async () => {
    const q = new BridgeQueue();
    const pending = q.awaitNextOperatorMessage(50);
    await vi.advanceTimersByTimeAsync(50);
    const got = await pending;
    expect(got).toBeNull();
  });

  it('AbortSignal pre-aborted: rejects with AbortError', async () => {
    const q = new BridgeQueue();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(q.awaitNextOperatorMessage(1000, ctrl.signal)).rejects.toThrow(
      /aborted/,
    );
  });

  it('AbortSignal aborted while waiting: rejects with AbortError', async () => {
    const q = new BridgeQueue();
    const ctrl = new AbortController();
    const pending = q.awaitNextOperatorMessage(10_000, ctrl.signal);
    ctrl.abort();
    await expect(pending).rejects.toThrow(/aborted/);
  });
});

describe('BridgeQueue — single-awaiter invariant', () => {
  it('second concurrent await throws synchronously', () => {
    const q = new BridgeQueue();
    void q.awaitNextOperatorMessage(10_000);
    expect(() => q.awaitNextOperatorMessage(10_000)).toThrow(
      /single-agent invariant/,
    );
  });
});

describe('BridgeQueue — zero-timeout non-blocking poll', () => {
  it('awaitNextOperatorMessage(0) with empty inbox resolves with null and registers no waiter', async () => {
    const q = new BridgeQueue();
    const first = await q.awaitNextOperatorMessage(0);
    expect(first).toBeNull();
    // If a waiter had been registered, this second call would throw.
    const second = await q.awaitNextOperatorMessage(0);
    expect(second).toBeNull();
  });

  it('awaitNextOperatorMessage(0) returns the queued message when one is present', async () => {
    const q = new BridgeQueue();
    q.enqueueOperatorMessage('hello');
    const got = await q.awaitNextOperatorMessage(0);
    expect(got?.text).toBe('hello');
  });
});

describe('BridgeQueue — sequence and timestamp monotonicity', () => {
  it('5 enqueues produce seq 1..5 starting at 1 by default', () => {
    const q = new BridgeQueue();
    const seqs: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const m = q.enqueueOperatorMessage(`m${i}`);
      seqs.push(m.seq);
    }
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
  });

  it('5 quickly-enqueued messages have non-decreasing ts', () => {
    const q = new BridgeQueue();
    const tss: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      tss.push(q.enqueueOperatorMessage(`m${i}`).ts);
    }
    for (let i = 1; i < tss.length; i += 1) {
      const prev = tss[i - 1];
      const cur = tss[i];
      if (prev === undefined || cur === undefined) {
        throw new Error('ts array unexpectedly contains undefined');
      }
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });

  it('setNextSeq resets the seq counter; next enqueue uses the reset value', () => {
    const q = new BridgeQueue();
    q.enqueueOperatorMessage('first');
    q.enqueueOperatorMessage('second');
    q.setNextSeq(42);
    const m = q.enqueueOperatorMessage('reset');
    expect(m.seq).toBe(42);
    const m2 = q.enqueueOperatorMessage('after');
    expect(m2.seq).toBe(43);
  });
});

describe('BridgeQueue — state tracking', () => {
  it('subscribeState fires on changes; unchanged values do NOT re-fire', () => {
    const q = new BridgeQueue();
    const seen: boolean[] = [];
    q.subscribeState((s) => seen.push(s.mcpConnected));

    q.setMcpConnected(true);
    q.setMcpConnected(true);
    q.setMcpConnected(false);
    q.setMcpConnected(false);

    expect(seen).toEqual([true, false]);
  });

  it('currentState returns a snapshot copy', () => {
    const q = new BridgeQueue();
    q.setListenModeOn(true);
    const snap = q.currentState();
    q.setListenModeOn(false);
    expect(snap.listenModeOn).toBe(true);
  });

  it('setMcpConnected(false) after true clears a pending awaiter (rejects with AbortError)', async () => {
    const q = new BridgeQueue();
    q.setMcpConnected(true);
    const pending = q.awaitNextOperatorMessage(10_000);
    q.setMcpConnected(false);
    await expect(pending).rejects.toThrow(/dropped/);
  });

  it('state subscriber error does not block other state subscribers', () => {
    const q = new BridgeQueue();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: boolean[] = [];
    q.subscribeState(() => {
      throw new Error('state subscriber boom');
    });
    q.subscribeState((s) => seen.push(s.listenModeOn));
    q.setListenModeOn(true);
    expect(seen).toEqual([true]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
