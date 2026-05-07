/**
 * In-process MCP round-trip via paired `InMemoryTransport`s. Proves the
 * SDK API surface (registerTool / listTools / callTool / Zod input
 * validation) wires correctly to our handlers, without depending on the
 * Hono mount path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  awaitStudioMessageHandler,
  sendStudioResponseHandler,
} from '@/bridge/mcp-server.ts';
import { serializeAwaitResult } from '@/bridge/mcp-tools.ts';
import type { AgentEvent } from '@/bridge/types.ts';
import {
  makeBridge,
  cleanupBridge,
  asAwaitResultStructured,
  asOkResult,
  toSendInput,
  type Bridge,
} from './mcp-fixture.ts';

describe('In-process MCP round-trip via InMemoryTransport', () => {
  let bridge: Bridge;
  beforeEach(() => {
    bridge = makeBridge();
  });
  afterEach(() => cleanupBridge(bridge));

  // Mirrors what `buildMcpServer` registers in mcp-server.ts. Re-registered
  // here so the round-trip exercises the SDK API surface without depending
  // on the mounted Hono path.
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
