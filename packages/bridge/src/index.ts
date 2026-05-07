/**
 * @deskwork/bridge — public API surface.
 *
 * The bridge package owns the studio ↔ Claude Code IPC plumbing:
 *   - `BridgeQueue`       — single-awaiter inbox + agent-event fanout
 *   - `ChatLog`           — JSONL persistence under `.deskwork/chat-log/`
 *   - `createChatRouter`  — the `/api/chat/*` Hono router
 *   - `createMcpHandler`  — the `/mcp` endpoint (MCP streamable HTTP)
 *   - Shared type contracts (`BridgeState`, `OperatorMessage`, etc.)
 *
 * The studio imports these directly via `@deskwork/bridge` to mount the
 * bridge surface in single-process mode (pre-Phase-10c). The sidecar's
 * own boot path (`server.ts`) wires the same primitives into a dedicated
 * Hono app for the two-process mode.
 *
 * Phase 10b moves the surface here; Phase 10c flips the studio to
 * reverse-proxy through the sidecar instead of mounting in-process.
 */

export { BridgeQueue } from './queue.ts';
export type { PublishToolUseInput } from './queue.ts';

export { ChatLog } from './persistence.ts';
export type { ChatLogStore, LoadHistoryOptions } from './persistence.ts';

export { createChatRouter } from './routes.ts';

export {
  createMcpHandler,
  awaitStudioMessageHandler,
  sendStudioResponseHandler,
  isLoopbackAddress,
  isOriginAllowed,
} from './mcp-server.ts';
export type { McpHandler, BridgeDeps } from './mcp-server.ts';

export {
  approximatePayloadSize,
  combineSignals,
  serializeAwaitResult,
  sendStudioResponseInputSchema,
  MAX_PAYLOAD_BYTES,
} from './mcp-tools.ts';
export type {
  AwaitResult,
  SendStudioResponseInput,
} from './mcp-tools.ts';

export type {
  AgentEvent,
  AgentEventListener,
  AgentEventStatus,
  AgentProseEvent,
  AgentToolUseEvent,
  BridgeState,
  BridgeStateListener,
  ChatLogRow,
  CorruptionMarker,
  OperatorMessage,
} from './types.ts';

export {
  writeDescriptor,
  readDescriptor,
  removeDescriptor,
  descriptorPath,
} from './descriptor.ts';
export type { BridgeDescriptor } from './descriptor.ts';
