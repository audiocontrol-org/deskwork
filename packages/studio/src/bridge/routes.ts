/**
 * HTTP routes for the studio ↔ Claude Code bridge.
 *
 * Mounted at `/api/chat/*` only when `ctx.bridge` is present:
 *   - POST /send                — operator -> agent message
 *   - GET  /stream              — SSE: agent events + bridge-state
 *   - GET  /state               — current BridgeState as JSON
 *   - GET  /history?since&limit — chat-log replay
 *
 * The router is opt-in: `createApp` mounts it only when the boot path
 * constructed a `BridgeQueue` + `ChatLog`. Tests that don't exercise
 * the bridge can build `ctx` without one.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { BridgeQueue } from './queue.ts';
import type { ChatLog } from './persistence.ts';
import type { AgentEvent, ChatLogRow } from './types.ts';

interface BridgeDeps {
  readonly queue: BridgeQueue;
  readonly log: ChatLog;
}

const MAX_TEXT_BYTES = 32768;

interface ParsedSendBody {
  readonly text: string;
  readonly contextRef?: string;
}

type SendBodyResult =
  | { readonly kind: 'ok'; readonly value: ParsedSendBody }
  | { readonly kind: 'invalid-body' }
  | { readonly kind: 'too-large' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseSendBody(raw: unknown): SendBodyResult {
  if (!isRecord(raw)) {
    return { kind: 'invalid-body' };
  }
  const text = raw['text'];
  const contextRef = raw['contextRef'];
  if (typeof text !== 'string' || text.length === 0) {
    return { kind: 'invalid-body' };
  }
  if (text.length > MAX_TEXT_BYTES) {
    return { kind: 'too-large' };
  }
  if (contextRef !== undefined && typeof contextRef !== 'string') {
    return { kind: 'invalid-body' };
  }
  if (contextRef === undefined) {
    return { kind: 'ok', value: { text } };
  }
  return { kind: 'ok', value: { text, contextRef } };
}

function isAgentEvent(row: ChatLogRow): row is AgentEvent {
  return 'kind' in row && (row.kind === 'tool-use' || row.kind === 'prose');
}

export function createChatRouter(bridge: BridgeDeps): Hono {
  const app = new Hono();

  // POST /send
  app.post('/send', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'invalid-json' }, 400);
    }
    const parsed = parseSendBody(raw);
    if (parsed.kind === 'invalid-body') {
      return c.json({ error: 'invalid-body' }, 400);
    }
    if (parsed.kind === 'too-large') {
      return c.json({ error: 'payload-too-large', max: MAX_TEXT_BYTES }, 413);
    }
    const state = bridge.queue.currentState();
    if (!state.mcpConnected || !state.listenModeOn) {
      return c.json({ error: 'bridge-offline', state }, 503);
    }
    const message =
      parsed.value.contextRef === undefined
        ? bridge.queue.enqueueOperatorMessage(parsed.value.text)
        : bridge.queue.enqueueOperatorMessage(
            parsed.value.text,
            parsed.value.contextRef,
          );
    await bridge.log.append(message);
    return c.json({ seq: message.seq, ts: message.ts });
  });

  // GET /state
  app.get('/state', (c) => c.json(bridge.queue.currentState()));

  // GET /history
  app.get('/history', async (c) => {
    const sinceRaw = c.req.query('since');
    const limitRaw = c.req.query('limit');

    let sinceSeq = 0;
    if (sinceRaw !== undefined) {
      const n = Number(sinceRaw);
      if (!Number.isInteger(n) || n < 0) {
        return c.json({ error: 'invalid-since' }, 400);
      }
      sinceSeq = n;
    }

    let limit = 100;
    if (limitRaw !== undefined) {
      const n = Number(limitRaw);
      if (!Number.isInteger(n) || n < 1) {
        return c.json({ error: 'invalid-limit' }, 400);
      }
      limit = n;
    }

    const rows = await bridge.log.loadHistory({ sinceSeq, limit });
    return c.json({ rows });
  });

  // GET /stream — SSE
  app.get('/stream', (c) => {
    // X-Accel-Buffering: no tells nginx-style proxies not to buffer SSE;
    // streamSSE itself sets Cache-Control + Content-Type + Connection.
    c.header('X-Accel-Buffering', 'no');

    const lastEventIdHeader = c.req.header('Last-Event-ID');
    let resumeFromSeq: number | null = null;
    if (lastEventIdHeader !== undefined) {
      const n = Number.parseInt(lastEventIdHeader, 10);
      if (Number.isInteger(n) && n >= 0) {
        resumeFromSeq = n;
      }
    }

    return streamSSE(c, async (stream) => {
      if (resumeFromSeq !== null) {
        const history = await bridge.log.loadHistory({
          sinceSeq: resumeFromSeq,
          limit: 1000,
        });
        for (const row of history) {
          if (!isAgentEvent(row)) continue;
          await stream.writeSSE({
            id: String(row.seq),
            event: 'agent-event',
            data: JSON.stringify(row),
          });
        }
      }

      const unsubEvent = bridge.queue.subscribe((event) => {
        void stream.writeSSE({
          id: String(event.seq),
          event: 'agent-event',
          data: JSON.stringify(event),
        });
      });
      const unsubState = bridge.queue.subscribeState((state) => {
        void stream.writeSSE({
          event: 'bridge-state',
          data: JSON.stringify(state),
        });
      });

      // Keep the callback pending until the client disconnects.
      // streamSSE closes the stream when this promise resolves; we resolve
      // it from the abort listener so subscriptions get cleaned up exactly
      // once per connection.
      await new Promise<void>((resolve) => {
        if (stream.aborted || stream.closed) {
          resolve();
          return;
        }
        stream.onAbort(() => {
          resolve();
        });
      });

      unsubEvent();
      unsubState();
    });
  });

  return app;
}
