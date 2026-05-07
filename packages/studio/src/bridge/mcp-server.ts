/**
 * MCP server endpoint for the studio ↔ Claude Code bridge.
 *
 * Mounted at `/mcp` on the same Hono app. Exposes two tools:
 *   - `await_studio_message`  — block until operator sends a message
 *   - `send_studio_response`  — publish + persist an agent event
 *
 * Three invariants:
 *   1. Loopback-only (403 for non-loopback peers).
 *   2. Single-agent (409 for a second concurrent connection).
 *   3. State coupling — first await flips listenModeOn; disconnect
 *      resets all three state bits.
 *
 * Tool-handler logic + helpers live in `mcp-tools.ts`.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  isInitializeRequest,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import {
  approximatePayloadSize,
  awaitStudioMessageHandler,
  combineSignals,
  isLoopbackAddress,
  MAX_PAYLOAD_BYTES,
  sendStudioResponseHandler,
  sendStudioResponseInputSchema,
  serializeAwaitResult,
  type BridgeDeps,
} from './mcp-tools.ts';

export type { BridgeDeps } from './mcp-tools.ts';
export {
  awaitStudioMessageHandler,
  sendStudioResponseHandler,
  isLoopbackAddress,
} from './mcp-tools.ts';

export interface McpHandler {
  handler: (c: Context) => Promise<Response>;
  activeConnections: () => number;
}

interface ConnectionRecord {
  readonly transport: WebStandardStreamableHTTPServerTransport;
  readonly server: McpServer;
}

interface ConnectionTracker {
  active: ConnectionRecord | null;
}

interface RemoteAddrLookup {
  (c: Context): string | undefined;
}

interface CreateMcpHandlerOptions {
  /** Override remote-address lookup for tests. */
  readonly remoteAddrLookup?: RemoteAddrLookup;
}

function buildMcpServer(
  bridge: BridgeDeps,
  abortRef: { current: AbortController | null },
): McpServer {
  const server = new McpServer(
    { name: 'deskwork-studio-bridge', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'await_studio_message',
    {
      description:
        'Block until the operator sends a message via the studio chat panel, ' +
        'or until timeoutSeconds elapses.',
      inputSchema: {
        timeoutSeconds: z
          .number()
          .min(0)
          .describe('Max seconds to block; 0 returns immediately.'),
      },
    },
    async (args, extra): Promise<CallToolResult> => {
      const signal = combineSignals(extra.signal, abortRef.current?.signal);
      const result = await awaitStudioMessageHandler(bridge, args, signal);
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
      description:
        'Publish a tool-use or prose event to the studio chat panel and persist ' +
        'it to the chat log.',
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
      const parsed = sendStudioResponseInputSchema.safeParse(args);
      if (!parsed.success) {
        const reason = parsed.error.issues
          .map((i) => i.message)
          .join('; ');
        return {
          isError: true,
          content: [{ type: 'text', text: `invalid input: ${reason}` }],
        };
      }
      const size = approximatePayloadSize(parsed.data);
      if (size > MAX_PAYLOAD_BYTES) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `payload too large (${size} > ${MAX_PAYLOAD_BYTES} bytes)`,
            },
          ],
        };
      }
      const event = await sendStudioResponseHandler(bridge, parsed.data);
      const ok = { ok: true as const, seq: event.seq, ts: event.ts };
      return {
        content: [{ type: 'text', text: JSON.stringify(ok) }],
        structuredContent: ok,
      };
    },
  );

  return server;
}

export function createMcpHandler(
  bridge: BridgeDeps,
  opts: CreateMcpHandlerOptions = {},
): McpHandler {
  const tracker: ConnectionTracker = { active: null };
  const remoteAddrLookup = opts.remoteAddrLookup ?? defaultRemoteAddrLookup;

  const handler = async (c: Context): Promise<Response> => {
    const addr = remoteAddrLookup(c);
    if (!isLoopbackAddress(addr)) {
      return c.json(
        { error: 'loopback-only', message: 'MCP endpoint is loopback-only' },
        403,
      );
    }

    const sessionId = c.req.header('mcp-session-id');
    const method = c.req.method;

    if (sessionId !== undefined) {
      const active = tracker.active;
      if (active === null || active.transport.sessionId !== sessionId) {
        return c.json(
          {
            error: 'unknown-session',
            message: 'Session ID does not match the active MCP session',
          },
          404,
        );
      }
      return active.transport.handleRequest(c.req.raw);
    }

    if (method !== 'POST') {
      return c.json(
        {
          error: 'session-required',
          message: 'mcp-session-id header is required for non-POST requests',
        },
        400,
      );
    }

    const bodyText = await c.req.raw.clone().text();
    let parsedBody: unknown;
    try {
      parsedBody = bodyText.length === 0 ? undefined : JSON.parse(bodyText);
    } catch {
      return c.json(
        { error: 'invalid-json', message: 'Request body is not valid JSON' },
        400,
      );
    }

    if (!isInitializeRequest(parsedBody)) {
      return c.json(
        {
          error: 'session-required',
          message:
            'Non-initialization request without mcp-session-id; send an initialize request first',
        },
        400,
      );
    }

    if (tracker.active !== null) {
      return c.json(
        {
          error: 'bridge-busy',
          message: 'Another agent is already connected to this studio',
        },
        409,
      );
    }

    const abortRef: { current: AbortController | null } = {
      current: new AbortController(),
    };

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    const server = buildMcpServer(bridge, abortRef);
    const record: ConnectionRecord = { transport, server };

    tracker.active = record;
    bridge.queue.setMcpConnected(true);

    transport.onclose = (): void => {
      if (tracker.active === record) {
        tracker.active = null;
        bridge.queue.setListenModeOn(false);
        bridge.queue.setAwaitingMessage(false);
        bridge.queue.setMcpConnected(false);
      }
      abortRef.current?.abort();
      abortRef.current = null;
    };

    try {
      await server.connect(transport);
      const requestForTransport = new Request(c.req.raw.url, {
        method: c.req.raw.method,
        headers: c.req.raw.headers,
        body: bodyText.length === 0 ? null : bodyText,
      });
      return transport.handleRequest(requestForTransport, { parsedBody });
    } catch (err) {
      if (tracker.active === record) {
        tracker.active = null;
        bridge.queue.setListenModeOn(false);
        bridge.queue.setAwaitingMessage(false);
        bridge.queue.setMcpConnected(false);
      }
      abortRef.current?.abort();
      abortRef.current = null;
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'mcp-init-failed', message: reason }, 500);
    }
  };

  return {
    handler,
    activeConnections: () => (tracker.active === null ? 0 : 1),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function defaultRemoteAddrLookup(c: Context): string | undefined {
  // @hono/node-server attaches the underlying Node IncomingMessage
  // (with `.socket.remoteAddress`) under `c.env.incoming`. We avoid the
  // hono/conninfo helper here so tests can inject the address through
  // `opts.remoteAddrLookup` without faking a node socket.
  const env: unknown = c.env;
  if (!isRecord(env)) return undefined;
  const incoming = env['incoming'];
  if (!isRecord(incoming)) return undefined;
  const socket = incoming['socket'];
  if (!isRecord(socket)) return undefined;
  const remote = socket['remoteAddress'];
  if (typeof remote !== 'string') return undefined;
  return remote;
}
