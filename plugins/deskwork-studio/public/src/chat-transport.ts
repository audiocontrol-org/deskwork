/**
 * Network plumbing for the chat panel: history fetch, state fetch,
 * SSE subscription, and POST /send.
 *
 * The panel module owns all DOM mutations; this module is pure data
 * I/O so the orchestration shell stays under the file-size cap.
 */

import type { AgentEvent, BridgeState, ChatLogRow } from './chat-renderer.ts';

export interface ChatStreamHandlers {
  readonly onAgentEvent: (event: AgentEvent) => void;
  readonly onBridgeState: (state: BridgeState) => void;
}

export interface SendResult {
  readonly ok: boolean;
  readonly status: number;
  readonly error?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asBridgeState(value: unknown): BridgeState | null {
  if (!isRecord(value)) return null;
  const { mcpConnected, listenModeOn, awaitingMessage } = value;
  if (
    typeof mcpConnected !== 'boolean' ||
    typeof listenModeOn !== 'boolean' ||
    typeof awaitingMessage !== 'boolean'
  ) {
    return null;
  }
  return { mcpConnected, listenModeOn, awaitingMessage };
}

function asAgentEvent(value: unknown): AgentEvent | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'prose') {
    if (
      typeof value.seq !== 'number' ||
      typeof value.ts !== 'number' ||
      typeof value.text !== 'string'
    ) return null;
    return { kind: 'prose', seq: value.seq, ts: value.ts, text: value.text };
  }
  if (value.kind === 'tool-use') {
    if (
      typeof value.seq !== 'number' ||
      typeof value.ts !== 'number' ||
      typeof value.tool !== 'string'
    ) return null;
    const status = value.status;
    const validStatus = status === 'starting' || status === 'done' || status === 'error';
    return {
      kind: 'tool-use',
      seq: value.seq,
      ts: value.ts,
      tool: value.tool,
      args: value.args,
      result: 'result' in value ? value.result : undefined,
      ...(validStatus ? { status } : {}),
    };
  }
  return null;
}

function asChatLogRows(value: unknown): ChatLogRow[] {
  if (!isRecord(value) || !Array.isArray(value.rows)) return [];
  const out: ChatLogRow[] = [];
  for (const row of value.rows) {
    if (!isRecord(row)) continue;
    if (row.role === 'operator') {
      if (
        typeof row.seq === 'number' &&
        typeof row.ts === 'number' &&
        typeof row.text === 'string'
      ) {
        const op: ChatLogRow = typeof row.contextRef === 'string'
          ? { seq: row.seq, ts: row.ts, role: 'operator', text: row.text, contextRef: row.contextRef }
          : { seq: row.seq, ts: row.ts, role: 'operator', text: row.text };
        out.push(op);
      }
      continue;
    }
    if (row.kind === 'corruption-marker') {
      if (
        typeof row.from === 'number' &&
        typeof row.to === 'number' &&
        typeof row.ts === 'number'
      ) {
        out.push({ kind: 'corruption-marker', from: row.from, to: row.to, ts: row.ts });
      }
      continue;
    }
    const event = asAgentEvent(row);
    if (event) out.push(event);
  }
  return out;
}

export async function loadHistory(limit = 200): Promise<ChatLogRow[]> {
  const res = await fetch(`/api/chat/history?since=0&limit=${limit}`);
  if (!res.ok) return [];
  return asChatLogRows(await res.json());
}

export async function loadState(): Promise<BridgeState | null> {
  const res = await fetch('/api/chat/state');
  if (!res.ok) return null;
  return asBridgeState(await res.json());
}

export function openStream(handlers: ChatStreamHandlers): EventSource {
  const es = new EventSource('/api/chat/stream');
  es.addEventListener('agent-event', (ev) => {
    if (!(ev instanceof MessageEvent)) return;
    try {
      const event = asAgentEvent(JSON.parse(ev.data));
      if (event) handlers.onAgentEvent(event);
    } catch {
      // Malformed payloads are tested at the server contract layer.
    }
  });
  es.addEventListener('bridge-state', (ev) => {
    if (!(ev instanceof MessageEvent)) return;
    try {
      const state = asBridgeState(JSON.parse(ev.data));
      if (state) handlers.onBridgeState(state);
    } catch {
      // Ignore malformed state events.
    }
  });
  // Browser auto-reconnects on its own; nothing to do on 'error'.
  return es;
}

export async function sendMessage(
  text: string,
  contextRef: string | undefined,
): Promise<SendResult> {
  const body: { text: string; contextRef?: string } =
    contextRef === undefined ? { text } : { text, contextRef };
  try {
    const res = await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 503) {
      return { ok: false, status: 503, error: 'bridge-offline' };
    }
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, error: reason };
  }
}
