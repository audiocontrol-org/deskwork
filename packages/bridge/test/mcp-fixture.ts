/**
 * Shared fixture for MCP-server tests. Builds a fresh `BridgeQueue` +
 * `ChatLog` pointed at a tmpdir project root. Distinct from `fixture.ts`
 * (which builds a minimal Hono mount of `/api/chat/*`) — MCP tests instantiate the
 * MCP handler directly.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BridgeQueue } from '@/queue.ts';
import { ChatLog } from '@/persistence.ts';

export interface Bridge {
  readonly queue: BridgeQueue;
  readonly log: ChatLog;
  readonly root: string;
}

export function makeBridge(): Bridge {
  const root = mkdtempSync(join(tmpdir(), 'mcp-bridge-test-'));
  return {
    queue: new BridgeQueue(),
    log: new ChatLog({ projectRoot: root }),
    root,
  };
}

export function cleanupBridge(b: Bridge): void {
  rmSync(b.root, { recursive: true, force: true });
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export interface AwaitResultStructured {
  received: boolean;
  message: { text: string; seq: number; ts: number; role: string } | null;
}

export function asAwaitResultStructured(v: unknown): AwaitResultStructured {
  if (!isObject(v)) throw new Error('expected object');
  const received = v['received'];
  if (typeof received !== 'boolean') throw new Error('bad received');
  const message = v['message'];
  if (message === null) return { received, message: null };
  if (!isObject(message)) throw new Error('bad message');
  const text = message['text'];
  const seq = message['seq'];
  const ts = message['ts'];
  const role = message['role'];
  if (
    typeof text !== 'string' ||
    typeof seq !== 'number' ||
    typeof ts !== 'number' ||
    typeof role !== 'string'
  ) {
    throw new Error('bad message fields');
  }
  return { received, message: { text, seq, ts, role } };
}

export function asOkResult(v: unknown): { ok: boolean; seq: number; ts: number } {
  if (!isObject(v)) throw new Error('expected object');
  const ok = v['ok'];
  const seq = v['seq'];
  const ts = v['ts'];
  if (typeof ok !== 'boolean' || typeof seq !== 'number' || typeof ts !== 'number') {
    throw new Error('bad ok shape');
  }
  return { ok, seq, ts };
}

export function asErrorBody(v: unknown): { error: string } {
  if (!isObject(v)) throw new Error('expected object');
  const e = v['error'];
  if (typeof e !== 'string') throw new Error('bad error body');
  return { error: e };
}

export function toSendInput(
  v: Record<string, unknown>,
):
  | { kind: 'prose'; text: string }
  | {
      kind: 'tool-use';
      tool: string;
      args: unknown;
      result?: unknown;
      status?: 'starting' | 'done' | 'error';
    } {
  const kind = v['kind'];
  if (kind === 'prose') {
    const text = v['text'];
    if (typeof text !== 'string') throw new Error('text required');
    return { kind: 'prose', text };
  }
  if (kind === 'tool-use') {
    const tool = v['tool'];
    if (typeof tool !== 'string') throw new Error('tool required');
    const status = v['status'];
    return {
      kind: 'tool-use',
      tool,
      args: v['args'],
      ...(v['result'] === undefined ? {} : { result: v['result'] }),
      ...(status === 'starting' || status === 'done' || status === 'error'
        ? { status }
        : {}),
    };
  }
  throw new Error(`unknown kind: ${String(kind)}`);
}
