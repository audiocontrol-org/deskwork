/**
 * MCP server tests — three layers, descending in coupling to the SDK:
 *
 *   1. Pure helpers (`isLoopbackAddress`, `serializeAwaitResult`, etc.)
 *      tested directly.
 *   2. Tool handlers (`awaitStudioMessageHandler`,
 *      `sendStudioResponseHandler`) tested directly — these are the
 *      bridge-to-queue-and-log core; the SDK wiring around them is a
 *      thin adapter.
 *   3. Hono mount tested via `app.fetch(new Request)` — covers the
 *      loopback guard, validation, and (with a real initialize round
 *      trip) the single-agent 409 invariant.
 *
 *   4. End-to-end SDK round-trip via paired `InMemoryTransport`s —
 *      proves listTools/callTool wiring works against an `McpServer`
 *      that wires the same handlers as `mcp-server.ts`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BridgeQueue } from '@/bridge/queue.ts';
import { ChatLog } from '@/bridge/persistence.ts';
import {
  createMcpHandler,
  isLoopbackAddress,
  awaitStudioMessageHandler,
  sendStudioResponseHandler,
} from '@/bridge/mcp-server.ts';
import {
  serializeAwaitResult,
  approximatePayloadSize,
  combineSignals,
  MAX_PAYLOAD_BYTES,
  type SendStudioResponseInput,
} from '@/bridge/mcp-tools.ts';
import type { AgentEvent } from '@/bridge/types.ts';

interface Bridge {
  readonly queue: BridgeQueue;
  readonly log: ChatLog;
  readonly root: string;
}

function makeBridge(): Bridge {
  const root = mkdtempSync(join(tmpdir(), 'mcp-bridge-test-'));
  return {
    queue: new BridgeQueue(),
    log: new ChatLog({ projectRoot: root }),
    root,
  };
}

function cleanupBridge(b: Bridge): void {
  rmSync(b.root, { recursive: true, force: true });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

interface AwaitResultStructured {
  received: boolean;
  message: { text: string; seq: number; ts: number; role: string } | null;
}

function asAwaitResultStructured(v: unknown): AwaitResultStructured {
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

function asOkResult(v: unknown): { ok: boolean; seq: number; ts: number } {
  if (!isObject(v)) throw new Error('expected object');
  const ok = v['ok'];
  const seq = v['seq'];
  const ts = v['ts'];
  if (typeof ok !== 'boolean' || typeof seq !== 'number' || typeof ts !== 'number') {
    throw new Error('bad ok shape');
  }
  return { ok, seq, ts };
}

function asErrorBody(v: unknown): { error: string } {
  if (!isObject(v)) throw new Error('expected object');
  const e = v['error'];
  if (typeof e !== 'string') throw new Error('bad error body');
  return { error: e };
}

describe('isLoopbackAddress', () => {
  it('accepts loopback variants', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('localhost')).toBe(true);
  });

  it('rejects non-loopback addresses and undefined', () => {
    expect(isLoopbackAddress('192.168.1.1')).toBe(false);
    expect(isLoopbackAddress('10.0.0.1')).toBe(false);
    expect(isLoopbackAddress('100.64.1.2')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress('')).toBe(false);
    expect(isLoopbackAddress('0.0.0.0')).toBe(false);
  });
});

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
});

describe('helper functions: serializeAwaitResult / approximatePayloadSize / combineSignals', () => {
  it('serializeAwaitResult — null branch', () => {
    expect(serializeAwaitResult({ received: false, message: null })).toEqual({
      received: false,
      message: null,
    });
  });

  it('serializeAwaitResult — message branch with contextRef', () => {
    const r = serializeAwaitResult({
      received: true,
      message: {
        seq: 7,
        ts: 1000,
        role: 'operator',
        text: 'hi',
        contextRef: 'entry/abc',
      },
    });
    expect(r).toEqual({
      received: true,
      message: {
        seq: 7,
        ts: 1000,
        role: 'operator',
        text: 'hi',
        contextRef: 'entry/abc',
      },
    });
  });

  it('approximatePayloadSize — basic JSON sizing', () => {
    expect(approximatePayloadSize({ a: 1 })).toBe(7);
  });

  it('combineSignals — abort propagates from either side', () => {
    const a = new AbortController();
    const b = new AbortController();
    const sig = combineSignals(a.signal, b.signal);
    expect(sig.aborted).toBe(false);
    a.abort(new Error('a'));
    expect(sig.aborted).toBe(true);
  });

  it('MAX_PAYLOAD_BYTES is 1MB', () => {
    expect(MAX_PAYLOAD_BYTES).toBe(1_048_576);
  });
});

describe('createMcpHandler — Hono mount: loopback guard + validation', () => {
  let bridge: Bridge;
  beforeEach(() => {
    bridge = makeBridge();
  });
  afterEach(() => cleanupBridge(bridge));

  function mount(remote: string | undefined): Hono {
    const mcp = createMcpHandler(bridge, {
      remoteAddrLookup: () => remote,
    });
    const app = new Hono();
    app.all('/mcp', (c) => mcp.handler(c));
    return app;
  }

  it('returns 403 for non-loopback peers', async () => {
    const app = mount('192.168.1.1');
    const res = await app.fetch(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(403);
    const body = asErrorBody(await res.json());
    expect(body.error).toBe('loopback-only');
  });

  it('returns 400 for non-init POST without session header', async () => {
    const app = mount('127.0.0.1');
    const res = await app.fetch(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(asErrorBody(await res.json()).error).toBe('session-required');
  });

  it('returns 400 for invalid JSON body on POST', async () => {
    const app = mount('127.0.0.1');
    const res = await app.fetch(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
    );
    expect(res.status).toBe(400);
    expect(asErrorBody(await res.json()).error).toBe('invalid-json');
  });

  it('returns 400 for non-POST request without session header', async () => {
    const app = mount('127.0.0.1');
    const res = await app.fetch(new Request('http://x/mcp', { method: 'GET' }));
    expect(res.status).toBe(400);
    expect(asErrorBody(await res.json()).error).toBe('session-required');
  });

  it('returns 404 for unknown session header (no active session)', async () => {
    const app = mount('127.0.0.1');
    const res = await app.fetch(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'mcp-session-id': 'bogus-session',
        },
        body: '{}',
      }),
    );
    expect(res.status).toBe(404);
    expect(asErrorBody(await res.json()).error).toBe('unknown-session');
  });
});

describe('createMcpHandler — single-agent invariant + connection lifecycle', () => {
  let bridge: Bridge;
  beforeEach(() => {
    bridge = makeBridge();
  });
  afterEach(() => cleanupBridge(bridge));

  it('reports activeConnections=0 before any session is opened', () => {
    const mcp = createMcpHandler(bridge, {
      remoteAddrLookup: () => '127.0.0.1',
    });
    expect(mcp.activeConnections()).toBe(0);
  });

  it('rejects 409 when a second initialize lands while a session is active', async () => {
    const mcp = createMcpHandler(bridge, {
      remoteAddrLookup: () => '127.0.0.1',
    });
    const app = new Hono();
    app.all('/mcp', (c) => mcp.handler(c));

    const initBody = JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.0' },
      },
      id: 1,
    });

    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };

    const r1 = await app.fetch(
      new Request('http://x/mcp', { method: 'POST', headers, body: initBody }),
    );
    // The first init must succeed (the SDK might reply via SSE; we
    // just need the active session set up).
    expect(r1.status).toBeLessThan(400);
    expect(bridge.queue.currentState().mcpConnected).toBe(true);
    expect(mcp.activeConnections()).toBe(1);

    // Drain so the SSE response doesn't keep the test pending.
    if (r1.body !== null) await r1.body.cancel().catch(() => undefined);

    const r2 = await app.fetch(
      new Request('http://x/mcp', { method: 'POST', headers, body: initBody }),
    );
    expect(r2.status).toBe(409);
    expect(asErrorBody(await r2.json()).error).toBe('bridge-busy');
  });

  it('DELETE with the active session ID resets bridge state', async () => {
    const mcp = createMcpHandler(bridge, {
      remoteAddrLookup: () => '127.0.0.1',
    });
    const app = new Hono();
    app.all('/mcp', (c) => mcp.handler(c));

    const initBody = JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.0' },
      },
      id: 1,
    });

    const r1 = await app.fetch(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: initBody,
      }),
    );
    expect(mcp.activeConnections()).toBe(1);
    expect(bridge.queue.currentState().mcpConnected).toBe(true);

    const sessionId = r1.headers.get('mcp-session-id');
    if (r1.body !== null) await r1.body.cancel().catch(() => undefined);
    expect(sessionId).toBeTruthy();
    if (sessionId === null) throw new Error('no session id');

    // Drive a flip to listenModeOn before the disconnect to prove the
    // cleanup zeroes it out.
    bridge.queue.setListenModeOn(true);
    bridge.queue.setAwaitingMessage(true);
    expect(bridge.queue.currentState()).toMatchObject({
      mcpConnected: true,
      listenModeOn: true,
      awaitingMessage: true,
    });

    const rDel = await app.fetch(
      new Request('http://x/mcp', {
        method: 'DELETE',
        headers: { 'mcp-session-id': sessionId },
      }),
    );
    if (rDel.body !== null) await rDel.body.cancel().catch(() => undefined);

    // After disconnect, every state bit is cleared and the connection
    // counter is back to zero.
    expect(mcp.activeConnections()).toBe(0);
    expect(bridge.queue.currentState()).toEqual({
      mcpConnected: false,
      listenModeOn: false,
      awaitingMessage: false,
    });
  });

  it('non-loopback peer cannot bypass the session check', async () => {
    // Even with an mcp-session-id header, non-loopback gets 403 first.
    const mcp = createMcpHandler(bridge, {
      remoteAddrLookup: () => '8.8.8.8',
    });
    const app = new Hono();
    app.all('/mcp', (c) => mcp.handler(c));

    const res = await app.fetch(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'mcp-session-id': 'whatever',
        },
        body: '{}',
      }),
    );
    expect(res.status).toBe(403);
    expect(asErrorBody(await res.json()).error).toBe('loopback-only');
  });
});

describe('In-process MCP round-trip via InMemoryTransport', () => {
  let bridge: Bridge;
  beforeEach(() => {
    bridge = makeBridge();
  });
  afterEach(() => cleanupBridge(bridge));

  // Mirrors what `buildMcpServer` registers in mcp-server.ts. We
  // re-register here so the round-trip exercises the SDK API surface
  // (registerTool + listTools + callTool + Zod input validation)
  // without depending on the mounted Hono path.
  function buildTestServer(): McpServer {
    const server = new McpServer(
      { name: 'test-bridge', version: '0.0.0' },
      { capabilities: { tools: {} } },
    );
    server.registerTool(
      'await_studio_message',
      {
        description: 'await operator message',
        inputSchema: { timeoutSeconds: z.number().min(0) },
      },
      async (args, extra): Promise<CallToolResult> => {
        const result = await awaitStudioMessageHandler(
          bridge,
          args,
          extra.signal,
        );
        const structured = serializeAwaitResult(result);
        return {
          content: [{ type: 'text', text: JSON.stringify(structured) }],
          structuredContent: structured,
        };
      },
    );
    server.registerTool(
      'send_studio_response',
      {
        description: 'send response to studio',
        inputSchema: {
          kind: z.enum(['tool-use', 'prose']),
          tool: z.string().optional(),
          args: z.unknown().optional(),
          result: z.unknown().optional(),
          status: z.enum(['starting', 'done', 'error']).optional(),
          text: z.string().optional(),
        },
      },
      async (args): Promise<CallToolResult> => {
        const input = toSendInput(args);
        const ev = await sendStudioResponseHandler(bridge, input);
        const ok = { ok: true as const, seq: ev.seq, ts: ev.ts };
        return {
          content: [{ type: 'text', text: JSON.stringify(ok) }],
          structuredContent: ok,
        };
      },
    );
    return server;
  }

  function toSendInput(v: Record<string, unknown>): SendStudioResponseInput {
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
      const out: SendStudioResponseInput = {
        kind: 'tool-use',
        tool,
        args: v['args'],
        ...(v['result'] === undefined ? {} : { result: v['result'] }),
        ...(status === 'starting' || status === 'done' || status === 'error'
          ? { status }
          : {}),
      };
      return out;
    }
    throw new Error(`unknown kind: ${String(kind)}`);
  }

  async function connectClient(): Promise<{
    client: Client;
    close: () => Promise<void>;
  }> {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = buildTestServer();
    await server.connect(serverT);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientT);
    return {
      client,
      close: async () => {
        await client.close();
        await server.close();
      },
    };
  }

  it('listTools advertises both tools with input schemas', async () => {
    const { client, close } = await connectClient();
    try {
      const list = await client.listTools();
      const names = list.tools.map((t) => t.name).sort();
      expect(names).toEqual(['await_studio_message', 'send_studio_response']);
      const await_ = list.tools.find((t) => t.name === 'await_studio_message');
      const send_ = list.tools.find((t) => t.name === 'send_studio_response');
      expect(await_?.inputSchema).toBeDefined();
      expect(send_?.inputSchema).toBeDefined();
    } finally {
      await close();
    }
  });

  it('await_studio_message blocks until enqueue', async () => {
    const { client, close } = await connectClient();
    try {
      const callPromise = client.callTool({
        name: 'await_studio_message',
        arguments: { timeoutSeconds: 5 },
      });
      // Allow the call to land on the server before enqueuing.
      await new Promise((r) => setTimeout(r, 25));
      bridge.queue.enqueueOperatorMessage('round-trip-message');
      const result = await callPromise;
      const s = asAwaitResultStructured(result['structuredContent']);
      expect(s.received).toBe(true);
      expect(s.message?.text).toBe('round-trip-message');
    } finally {
      await close();
    }
  });

  it('await_studio_message returns null on timeout', async () => {
    const { client, close } = await connectClient();
    try {
      const result = await client.callTool({
        name: 'await_studio_message',
        arguments: { timeoutSeconds: 0.05 },
      });
      const s = asAwaitResultStructured(result['structuredContent']);
      expect(s.received).toBe(false);
      expect(s.message).toBeNull();
    } finally {
      await close();
    }
  });

  it('send_studio_response prose persists to log', async () => {
    const { client, close } = await connectClient();
    try {
      const seen: AgentEvent[] = [];
      bridge.queue.subscribe((e) => seen.push(e));
      const result = await client.callTool({
        name: 'send_studio_response',
        arguments: { kind: 'prose', text: 'round-trip-prose' },
      });
      const ok = asOkResult(result['structuredContent']);
      expect(ok.ok).toBe(true);
      expect(seen.length).toBe(1);

      const rows = await bridge.log.loadHistory({ sinceSeq: 0, limit: 10 });
      expect(rows.length).toBe(1);
      const row = rows[0];
      if (row !== undefined && 'kind' in row && row.kind === 'prose') {
        expect(row.text).toBe('round-trip-prose');
        expect(row.seq).toBe(ok.seq);
      } else {
        throw new Error('expected prose row');
      }
    } finally {
      await close();
    }
  });

  it('send_studio_response tool-use with all fields persists', async () => {
    const { client, close } = await connectClient();
    try {
      const result = await client.callTool({
        name: 'send_studio_response',
        arguments: {
          kind: 'tool-use',
          tool: 'Read',
          args: { file: '/x.md' },
          status: 'done',
          result: { content: 'hello' },
        },
      });
      const ok = asOkResult(result['structuredContent']);
      expect(ok.ok).toBe(true);
      const rows = await bridge.log.loadHistory({ sinceSeq: 0, limit: 10 });
      expect(rows.length).toBe(1);
      const row = rows[0];
      if (row !== undefined && 'kind' in row && row.kind === 'tool-use') {
        expect(row.tool).toBe('Read');
        expect(row.status).toBe('done');
      } else {
        throw new Error('expected tool-use row');
      }
    } finally {
      await close();
    }
  });
});
