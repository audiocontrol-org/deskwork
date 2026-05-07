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
  AgentEventStatus,
  AgentProseEvent,
  AgentToolUseEvent,
  BridgeState,
  BridgeStateListener,
  OperatorMessage,
} from './types.ts';

interface PublishToolUseInput {
  readonly tool: string;
  readonly args: unknown;
  readonly status?: AgentEventStatus;
  readonly result?: unknown;
}

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

  // Allocates seq + ts + builds the OperatorMessage WITHOUT pushing it
  // onto the inbox or resolving any waiter. The route layer uses this to
  // persist-then-deliver: if persistence rejects, no agent ever sees the
  // message. Subsequent enqueues still consume monotonically; gaps from
  // failed writes are legitimate (the corruption-detection layer also
  // tolerates gaps from restart behavior).
  allocateOperatorMessage(text: string, contextRef?: string): OperatorMessage {
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
    return message;
  }

  deliverOperatorMessage(message: OperatorMessage): void {
    if (this.waiter !== null) {
      const w = this.waiter;
      this.waiter = null;
      this.clearWaiterResources(w);
      w.resolve(message);
      return;
    }
    this.inbox.push(message);
  }

  enqueueOperatorMessage(text: string, contextRef?: string): OperatorMessage {
    const message = this.allocateOperatorMessage(text, contextRef);
    this.deliverOperatorMessage(message);
    return message;
  }

  awaitNextOperatorMessage(
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<OperatorMessage | null> {
    // Non-blocking poll fast-path: timeoutMs <= 0 with empty inbox returns
    // null synchronously without registering a waiter, so back-to-back polls
    // never trip the single-awaiter invariant.
    if (timeoutMs <= 0 && this.inbox.length === 0) {
      return Promise.resolve(null);
    }

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

  // Allocates seq+ts and synchronously fans out a tool-use event. The
  // returned event is what the caller should persist to the chat-log so
  // SSE Last-Event-ID replay sees the same row the live subscribers
  // already received. Sharing the operator-message seq counter keeps the
  // SSE stream globally monotonic.
  publishToolUse(input: PublishToolUseInput): AgentToolUseEvent {
    const seq = this.nextSeq;
    this.nextSeq += 1;
    const base = {
      kind: 'tool-use' as const,
      seq,
      ts: Date.now(),
      tool: input.tool,
      args: input.args,
    };
    const withResult =
      input.result === undefined ? base : { ...base, result: input.result };
    const event: AgentToolUseEvent =
      input.status === undefined
        ? withResult
        : { ...withResult, status: input.status };
    this.publishAgentEvent(event);
    return event;
  }

  publishProse(text: string): AgentProseEvent {
    const seq = this.nextSeq;
    this.nextSeq += 1;
    const event: AgentProseEvent = {
      kind: 'prose',
      seq,
      ts: Date.now(),
      text,
    };
    this.publishAgentEvent(event);
    return event;
  }

  // Subscriber re-entrancy: callbacks must NOT synchronously call enqueueOperatorMessage.
  publishAgentEvent(event: AgentEvent): void {
    const snapshot = this.eventListeners.slice();
    for (let i = 0; i < snapshot.length; i += 1) {
      const listener = snapshot[i];
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
    const listenersSnapshot = this.stateListeners.slice();
    for (let i = 0; i < listenersSnapshot.length; i += 1) {
      const listener = listenersSnapshot[i];
      if (listener === undefined) continue;
      try {
        listener(snapshot);
      } catch (err) {
        console.error(`BridgeQueue: state subscriber #${i} threw`, err);
      }
    }
  }
}
