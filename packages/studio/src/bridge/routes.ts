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
import type { ChatLogStore } from './persistence.ts';
import type { AgentEvent, ChatLogRow } from './types.ts';

interface BridgeDeps {
  readonly queue: BridgeQueue;
  readonly log: ChatLogStore;
}

// Compared against `text.length` (UTF-16 code units), not bytes —
// 32k code units is plenty for chat input and avoids the byte-counting
// complexity multi-byte characters would introduce.
const MAX_TEXT_LENGTH = 32768;

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
  if (text.length > MAX_TEXT_LENGTH) {
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

// Empty string and whitespace-only values are treated as "not supplied"
// so `?since=` and `?limit=` (no value) fall back to defaults instead of
// coercing to 0 via `Number('')`.
function parseOptionalNonNegativeInt(raw: string | undefined): number | null | 'invalid' {
  if (raw === undefined) return null;
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 'invalid';
  return n;
}

function parseOptionalPositiveInt(raw: string | undefined): number | null | 'invalid' {
  if (raw === undefined) return null;
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 'invalid';
  return n;
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
      return c.json({ error: 'payload-too-large', max: MAX_TEXT_LENGTH }, 413);
    }
    const state = bridge.queue.currentState();
    if (!state.mcpConnected || !state.listenModeOn) {
      return c.json({ error: 'bridge-offline', state }, 503);
    }
    // Persist-before-publish: allocate the message (assigns seq+ts but
    // doesn't push to inbox or resolve waiters), persist it, only then
    // deliver. If `log.append` rejects, no agent ever sees the message.
    const message =
      parsed.value.contextRef === undefined
        ? bridge.queue.allocateOperatorMessage(parsed.value.text)
        : bridge.queue.allocateOperatorMessage(
            parsed.value.text,
            parsed.value.contextRef,
          );
    await bridge.log.append(message);
    bridge.queue.deliverOperatorMessage(message);
    return c.json({ seq: message.seq, ts: message.ts });
  });

  // GET /state
  app.get('/state', (c) => c.json(bridge.queue.currentState()));

  // GET /history
  app.get('/history', async (c) => {
    const sinceParsed = parseOptionalNonNegativeInt(c.req.query('since'));
    if (sinceParsed === 'invalid') {
      return c.json({ error: 'invalid-since' }, 400);
    }
    const limitParsed = parseOptionalPositiveInt(c.req.query('limit'));
    if (limitParsed === 'invalid') {
      return c.json({ error: 'invalid-limit' }, 400);
    }

    const sinceSeq = sinceParsed ?? 0;
    const limit = limitParsed ?? 100;

    const rows = await bridge.log.loadHistory({ sinceSeq, limit });
    return c.json({ rows });
  });

  // GET /stream — SSE
  app.get('/stream', (c) => {
    // X-Accel-Buffering: no tells nginx-style proxies not to buffer SSE.
    c.header('X-Accel-Buffering', 'no');

    const lastEventIdHeader = c.req.header('Last-Event-ID');
    let resumeFromSeq: number | null = null;
    if (lastEventIdHeader !== undefined && lastEventIdHeader !== '') {
      const n = Number(lastEventIdHeader);
      if (Number.isInteger(n) && n >= 0) {
        resumeFromSeq = n;
      }
    }

    return streamSSE(c, async (stream) => {
      // Subscribe-before-replay: register listeners FIRST and buffer
      // their events while history replay is in flight. After replay
      // completes, drain the buffer skipping any seq the replay already
      // covered. Closes the subscribe-after-replay window-of-loss.
      const buffer: AgentEvent[] = [];
      let draining = true;
      let lastReplayedSeq = resumeFromSeq ?? -1;

      const unsubEvent = bridge.queue.subscribe((event) => {
        if (draining) {
          buffer.push(event);
          return;
        }
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

      try {
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
            if (row.seq > lastReplayedSeq) lastReplayedSeq = row.seq;
          }
        }

        // Drain buffered live events; both replay and live publish are
        // seqd from the same BridgeQueue counter, so `seq > lastReplayedSeq`
        // dedupes against history exactly.
        draining = false;
        for (const event of buffer) {
          if (event.seq > lastReplayedSeq) {
            await stream.writeSSE({
              id: String(event.seq),
              event: 'agent-event',
              data: JSON.stringify(event),
            });
          }
        }
        buffer.length = 0;

        // Keep the callback pending until the client disconnects.
        // streamSSE closes the stream when this promise resolves; we
        // resolve it from the abort listener so subscriptions get cleaned
        // up exactly once per connection.
        await new Promise<void>((resolve) => {
          if (stream.aborted || stream.closed) {
            resolve();
            return;
          }
          stream.onAbort(() => {
            resolve();
          });
        });
      } finally {
        unsubEvent();
        unsubState();
      }
    });
  });

  return app;
}
