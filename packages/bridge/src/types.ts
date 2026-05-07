/**
 * Shared contracts for the studio ↔ Claude Code bridge.
 *
 * These types are imported by both server-side primitives (queue,
 * persistence, future MCP server, future HTTP routes) and the eventual
 * browser-side chat panel. Keep them dependency-free.
 */

export interface OperatorMessage {
  readonly seq: number;
  readonly ts: number;
  readonly role: 'operator';
  readonly text: string;
  readonly contextRef?: string;
}

export type AgentEventStatus = 'starting' | 'done' | 'error';

export interface AgentToolUseEvent {
  readonly kind: 'tool-use';
  readonly seq: number;
  readonly ts: number;
  readonly tool: string;
  readonly args: unknown;
  readonly result?: unknown;
  readonly status?: AgentEventStatus;
}

export interface AgentProseEvent {
  readonly kind: 'prose';
  readonly seq: number;
  readonly ts: number;
  readonly text: string;
}

export type AgentEvent = AgentToolUseEvent | AgentProseEvent;

export interface BridgeState {
  readonly mcpConnected: boolean;
  readonly listenModeOn: boolean;
  readonly awaitingMessage: boolean;
}

export interface CorruptionMarker {
  readonly kind: 'corruption-marker';
  readonly from: number;
  readonly to: number;
  readonly ts: number;
}

export type ChatLogRow = OperatorMessage | AgentEvent | CorruptionMarker;

export type BridgeStateListener = (state: BridgeState) => void;
export type AgentEventListener = (event: AgentEvent) => void;
