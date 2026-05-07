/**
 * MCP server endpoint for the studio ↔ Claude Code bridge.
 *
 * Mounted at `/mcp`. Invariants:
 *   1. Loopback-only (403 for non-loopback peers).
 *   2. Origin allow-list (403 for cross-site Origin to prevent CSRF /
 *      DNS-rebinding from a browser tab).
 *   3. Single-agent (409 for a second concurrent connection).
 *   4. Disconnect resets mcpConnected/listenModeOn/awaitingMessage.
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
import type { BridgeQueue } from './queue.ts';
import {
  approximatePayloadSize,
  awaitStudioMessageHandler,
  combineSignals,
  isLoopbackAddress,
  isOriginAllowed,
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
  isOriginAllowed,
} from './mcp-tools.ts';

export interface McpHandler {
  handler: (c: Context) => Promise<Response>;
  activeConnections: () => number;
}

interface ConnectionRecord {
  readonly transport: WebStandardStreamableHTTPServerTransport;
  readonly server: McpServer;
  readonly abortRef: { current: AbortController | null };
}

interface ConnectionTracker {
  active: ConnectionRecord | null;
}

interface CreateMcpHandlerOptions {
  /** Override remote-address lookup for tests. */
  readonly remoteAddrLookup?: (c: Context) => string | undefined;
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

    const origin = c.req.header('origin');
    if (!isOriginAllowed(origin)) {
      return c.json(
        { error: 'invalid-origin', message: 'Origin not allowed for /mcp' },
        403,
      );
    }

    const sessionId = c.req.header('mcp-session-id');
    const method = c.req.method;

    if (sessionId !== undefined) {
      const active = tracker.active;
      if (active === null || active.transport.sessionId !== sessionId) {
        return c.json(
          { error: 'unknown-session', message: 'Session ID does not match the active MCP session' },
          404,
        );
      }
      return active.transport.handleRequest(c.req.raw);
    }

    if (method !== 'POST') {
      return c.json(
        { error: 'session-required', message: 'mcp-session-id header is required for non-POST requests' },
        400,
      );
    }

    const bodyText = await c.req.raw.clone().text();
    let parsedBody: unknown;
    try {
      parsedBody = bodyText.length === 0 ? undefined : JSON.parse(bodyText);
    } catch {
      return c.json({ error: 'invalid-json', message: 'Request body is not valid JSON' }, 400);
    }

    if (!isInitializeRequest(parsedBody)) {
      return c.json(
        {
          error: 'session-required',
          message: 'Non-initialization request without mcp-session-id; send an initialize request first',
        },
        400,
      );
    }

    // Issue #235 / zombie tracker fix: a new initialize from CC always
    // wins over any existing tracker. The previous behavior (409 on
    // existing tracker) was correct in theory — single-agent invariant —
    // but the streamable-HTTP transport's per-request stream cancel
    // doesn't fire `transport.onclose`, so a CC session that lost its
    // transport at the network layer (the 5-min idle drop documented in
    // #235) leaves the tracker pinned to a dead transport. Without this
    // override, the next CC reconnect (or a fresh CC session) gets 409
    // forever, and the bridge requires a sidecar restart to recover.
    //
    // Trade-off: two CC sessions deliberately racing for the bridge will
    // see the LAST initializer win, with the prior session's tracker
    // cleaned up. v1's single-agent invariant becomes best-effort: we
    // still publish events to one tracker at a time, but enforcement
    // against deliberate concurrent attaches relaxes. Acceptable for the
    // internal-only posture documented in the PRD.
    if (tracker.active !== null) {
      const stale = tracker.active;
      process.stderr.write(
        `deskwork-bridge: a new MCP initialize is preempting an existing tracker (session=${stale.transport.sessionId ?? '<none>'}). Likely the previous session's transport silently dropped (issue #235). Cleaning up.\n`,
      );
      cleanupConnection(tracker, stale, bridge.queue);
      try {
        await stale.transport.close();
      } catch {
        // Closing a dead transport may throw; the cleanup already cleared
        // the tracker so this is best-effort.
      }
    }

    const abortRef: { current: AbortController | null } = {
      current: new AbortController(),
    };

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    const server = buildMcpServer(bridge, abortRef);
    const record: ConnectionRecord = { transport, server, abortRef };

    tracker.active = record;
    bridge.queue.setMcpConnected(true);

    transport.onclose = (): void => {
      cleanupConnection(tracker, record, bridge.queue);
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
      cleanupConnection(tracker, record, bridge.queue);
      const reason = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'mcp-init-failed', message: reason }, 500);
    }
  };

  return {
    handler,
    activeConnections: () => (tracker.active === null ? 0 : 1),
  };
}

function cleanupConnection(
  tracker: ConnectionTracker,
  record: ConnectionRecord,
  queue: BridgeQueue,
): void {
  if (tracker.active === record) {
    tracker.active = null;
    queue.setListenModeOn(false);
    queue.setAwaitingMessage(false);
    queue.setMcpConnected(false);
  }
  record.abortRef.current?.abort();
  record.abortRef.current = null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

let warnedRemoteAddrMissing = false;

// @hono/node-server attaches the underlying Node IncomingMessage (with
// `.socket.remoteAddress`) under `c.env.incoming`. We avoid the
// hono/conninfo helper here so tests can inject through opts.remoteAddrLookup.
function defaultRemoteAddrLookup(c: Context): string | undefined {
  const env: unknown = c.env;
  if (isRecord(env)) {
    const incoming = env['incoming'];
    if (isRecord(incoming)) {
      const socket = incoming['socket'];
      if (isRecord(socket)) {
        const remote = socket['remoteAddress'];
        if (typeof remote === 'string') return remote;
      }
    }
  }
  if (!warnedRemoteAddrMissing) {
    warnedRemoteAddrMissing = true;
    console.warn(
      'deskwork-studio: MCP remote-address lookup found no socket; loopback guard will reject all requests',
    );
  }
  return undefined;
}
