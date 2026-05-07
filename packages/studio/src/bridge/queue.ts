/**
 * In-process queue for the studio ↔ Claude Code bridge.
 *
 * Pairs operator-side enqueue with agent-side await, fans agent events
 * out to multiple subscribers, and tracks bridge state. No I/O —
 * persistence is the caller's responsibility.
 *
 * Key invariants:
 *  - Single-awaiter: at most one in-flight `awaitNextOperatorMessage`
 *    promise. The bridge serves one Claude Code session per worktree.
 *  - Disconnect-clears-await: `setMcpConnected(false)` (when value
 *    flips from true) rejects any pending awaiter so the listen-loop
 *    exits cleanly.
 *  - Seq-per-day: the queue's seq counter is monotonic; the
 *    persistence layer resets it via `setNextSeq` at day rotation.
 */

import type {
  AgentEvent,
  AgentEventListener,
  BridgeState,
  BridgeStateListener,
  OperatorMessage,
} from './types.ts';

interface Waiter {
  readonly resolve: (msg: OperatorMessage | null) => void;
  readonly reject: (err: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly abortHandler?: () => void;
  readonly signal?: AbortSignal;
}

class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}

export class BridgeQueue {
  private nextSeq = 1;
  private readonly inbox: OperatorMessage[] = [];
  private waiter: Waiter | null = null;
  private readonly eventListeners: AgentEventListener[] = [];
  private readonly stateListeners: BridgeStateListener[] = [];
  private state: BridgeState = {
    mcpConnected: false,
    listenModeOn: false,
    awaitingMessage: false,
  };

  enqueueOperatorMessage(text: string, contextRef?: string): OperatorMessage {
    const message: OperatorMessage =
      contextRef === undefined
        ? {
            seq: this.nextSeq,
            ts: Date.now(),
            role: 'operator',
            text,
          }
        : {
            seq: this.nextSeq,
            ts: Date.now(),
            role: 'operator',
            text,
            contextRef,
          };
    this.nextSeq += 1;

    if (this.waiter !== null) {
      const w = this.waiter;
      this.waiter = null;
      this.clearWaiterResources(w);
      w.resolve(message);
      return message;
    }

    this.inbox.push(message);
    return message;
  }

  awaitNextOperatorMessage(
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<OperatorMessage | null> {
    if (this.waiter !== null) {
      throw new Error(
        'BridgeQueue: a second concurrent awaitNextOperatorMessage was attempted. ' +
          'The single-agent invariant permits only one in-flight awaiter.',
      );
    }

    const head = this.inbox.shift();
    if (head !== undefined) {
      return Promise.resolve(head);
    }

    if (signal?.aborted) {
      return Promise.reject(new AbortError('awaitNextOperatorMessage was aborted'));
    }

    return new Promise<OperatorMessage | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.waiter !== null) {
          const w = this.waiter;
          this.waiter = null;
          this.clearWaiterResources(w);
          w.resolve(null);
        }
      }, timeoutMs);

      const abortHandler = signal
        ? () => {
            if (this.waiter !== null) {
              const w = this.waiter;
              this.waiter = null;
              this.clearWaiterResources(w);
              w.reject(new AbortError('awaitNextOperatorMessage was aborted'));
            }
          }
        : undefined;

      const waiter: Waiter =
        signal !== undefined && abortHandler !== undefined
          ? { resolve, reject, timer, abortHandler, signal }
          : { resolve, reject, timer };

      this.waiter = waiter;

      if (signal !== undefined && abortHandler !== undefined) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    });
  }

  private clearWaiterResources(w: Waiter): void {
    clearTimeout(w.timer);
    if (w.signal !== undefined && w.abortHandler !== undefined) {
      w.signal.removeEventListener('abort', w.abortHandler);
    }
  }

  subscribe(listener: AgentEventListener): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx >= 0) {
        this.eventListeners.splice(idx, 1);
      }
    };
  }

  publishAgentEvent(event: AgentEvent): void {
    for (let i = 0; i < this.eventListeners.length; i += 1) {
      const listener = this.eventListeners[i];
      if (listener === undefined) continue;
      try {
        listener(event);
      } catch (err) {
        // Subscriber errors must not block fanout to other subscribers.
        console.error(`BridgeQueue: agent-event subscriber #${i} threw`, err);
      }
    }
  }

  currentState(): BridgeState {
    return {
      mcpConnected: this.state.mcpConnected,
      listenModeOn: this.state.listenModeOn,
      awaitingMessage: this.state.awaitingMessage,
    };
  }

  subscribeState(listener: BridgeStateListener): () => void {
    this.stateListeners.push(listener);
    return () => {
      const idx = this.stateListeners.indexOf(listener);
      if (idx >= 0) {
        this.stateListeners.splice(idx, 1);
      }
    };
  }

  setMcpConnected(b: boolean): void {
    if (this.state.mcpConnected === b) return;
    const previous = this.state.mcpConnected;
    this.state = { ...this.state, mcpConnected: b };
    this.fanOutState();
    if (previous && !b) {
      // Disconnect-clears-awaiter: callers blocked on await get a
      // synchronous rejection so the listen-loop can exit cleanly.
      this.abortPendingWaiter();
    }
  }

  setListenModeOn(b: boolean): void {
    if (this.state.listenModeOn === b) return;
    this.state = { ...this.state, listenModeOn: b };
    this.fanOutState();
  }

  setAwaitingMessage(b: boolean): void {
    if (this.state.awaitingMessage === b) return;
    this.state = { ...this.state, awaitingMessage: b };
    this.fanOutState();
  }

  setNextSeq(n: number): void {
    this.nextSeq = n;
  }

  private abortPendingWaiter(): void {
    if (this.waiter === null) return;
    const w = this.waiter;
    this.waiter = null;
    this.clearWaiterResources(w);
    w.reject(new AbortError('Bridge MCP connection dropped; awaiter aborted'));
  }

  private fanOutState(): void {
    const snapshot = this.currentState();
    for (let i = 0; i < this.stateListeners.length; i += 1) {
      const listener = this.stateListeners[i];
      if (listener === undefined) continue;
      try {
        listener(snapshot);
      } catch (err) {
        console.error(`BridgeQueue: state subscriber #${i} threw`, err);
      }
    }
  }
}
