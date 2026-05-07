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
  readonly onHistoryRow: (row: ChatLogRow) => void;
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

function asChatLogRow(value: unknown): ChatLogRow | null {
  if (!isRecord(value)) return null;
  if (value.role === 'operator') {
    if (
      typeof value.seq === 'number' &&
      typeof value.ts === 'number' &&
      typeof value.text === 'string'
    ) {
      return typeof value.contextRef === 'string'
        ? { seq: value.seq, ts: value.ts, role: 'operator', text: value.text, contextRef: value.contextRef }
        : { seq: value.seq, ts: value.ts, role: 'operator', text: value.text };
    }
    return null;
  }
  if (value.kind === 'corruption-marker') {
    if (
      typeof value.from === 'number' &&
      typeof value.to === 'number' &&
      typeof value.ts === 'number'
    ) {
      return { kind: 'corruption-marker', from: value.from, to: value.to, ts: value.ts };
    }
    return null;
  }
  return asAgentEvent(value);
}

function asChatLogRows(value: unknown): ChatLogRow[] {
  if (!isRecord(value) || !Array.isArray(value.rows)) return [];
  const out: ChatLogRow[] = [];
  for (const row of value.rows) {
    const parsed = asChatLogRow(row);
    if (parsed !== null) out.push(parsed);
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
  // history-row carries operator messages and corruption markers
  // emitted by the server during Last-Event-ID replay only. Live
  // operator messages and live markers do not flow over SSE.
  es.addEventListener('history-row', (ev) => {
    if (!(ev instanceof MessageEvent)) return;
    try {
      const row = asChatLogRow(JSON.parse(ev.data));
      if (row !== null) handlers.onHistoryRow(row);
    } catch {
      // Malformed payloads are tested at the server contract layer.
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
