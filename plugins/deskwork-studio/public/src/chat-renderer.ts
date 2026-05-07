/**
 * Pure renderer for chat-log rows + bridge state.
 *
 * Produces sanitized HTML strings. The trust boundary lives here:
 * every operator/agent text or attribute interpolation is HTML-escaped
 * before reaching the page DOM. The chat-panel orchestrator assigns
 * these strings via `innerHTML` only because they came through this
 * module — never raw user input.
 *
 * Markdown rendering for agent prose flows through
 * `./scrapbook-markdown.ts`. That helper handles its own escaping for
 * inline text but is not a full sanitizer; we accept the trust
 * boundary that agent prose is trusted (the agent runs the operator's
 * own Claude Code session). Operator text and tool args/results,
 * which include arbitrary external content, are escaped here without
 * markdown processing.
 */

import { renderMarkdown } from './scrapbook-markdown.ts';

// Type shapes mirror packages/studio/src/bridge/types.ts. Duplicated
// here so the browser bundle has no cross-package import — the types
// describe wire-format JSON the SSE/history endpoints emit, so the
// duplication is the contract we want, enforced by the server tests.
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

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderRow(row: ChatLogRow): string {
  if ('role' in row && row.role === 'operator') {
    return renderOperatorRow(row);
  }
  if ('kind' in row) {
    if (row.kind === 'prose') return renderProseRow(row);
    if (row.kind === 'tool-use') return renderToolUseRow(row);
    if (row.kind === 'corruption-marker') return renderCorruptionRow(row);
  }
  return '';
}

function renderOperatorRow(row: OperatorMessage): string {
  const text = escapeHtml(row.text);
  const time = formatRelativeTime(row.ts);
  const subtitle = row.contextRef
    ? `<div class="chat-row-context">${escapeHtml(row.contextRef)}</div>`
    : '';
  return [
    `<div class="chat-row chat-row--operator" data-seq="${escapeHtml(String(row.seq))}">`,
    `<div class="chat-bubble">`,
    `<div class="chat-bubble-text">${text}</div>`,
    subtitle,
    `<time class="chat-time" datetime="${escapeHtml(new Date(row.ts).toISOString())}">${escapeHtml(time)}</time>`,
    `</div>`,
    `</div>`,
  ].join('');
}

function renderProseRow(row: AgentProseEvent): string {
  // renderMarkdown escapes inline text; agent prose is the trust
  // boundary documented in the file header.
  const body = renderMarkdown(row.text);
  const time = formatRelativeTime(row.ts);
  return [
    `<div class="chat-row chat-row--prose" data-seq="${escapeHtml(String(row.seq))}">`,
    `<div class="chat-bubble">`,
    `<div class="chat-bubble-md">${body}</div>`,
    `<time class="chat-time" datetime="${escapeHtml(new Date(row.ts).toISOString())}">${escapeHtml(time)}</time>`,
    `</div>`,
    `</div>`,
  ].join('');
}

function renderToolUseRow(row: AgentToolUseEvent): string {
  const status: AgentEventStatus = row.status ?? 'starting';
  const isOpen = status !== 'done';
  const argsJson = safeStringify(row.args);
  const resultBlock = row.result === undefined
    ? ''
    : `<div class="chat-tool-section"><div class="chat-tool-label">result</div><pre class="chat-tool-pre">${escapeHtml(safeStringify(row.result))}</pre></div>`;
  const time = formatRelativeTime(row.ts);
  const statusClass = `chat-tool-pill--${status}`;
  return [
    `<div class="chat-row chat-row--tool" data-seq="${escapeHtml(String(row.seq))}">`,
    `<details class="chat-tool-card chat-tool-card--${status}"${isOpen ? ' open' : ''}>`,
    `<summary class="chat-tool-head">`,
    `<code class="chat-tool-name">${escapeHtml(row.tool)}</code>`,
    `<span class="chat-tool-pill ${statusClass}">${escapeHtml(status)}</span>`,
    `<time class="chat-time" datetime="${escapeHtml(new Date(row.ts).toISOString())}">${escapeHtml(time)}</time>`,
    `</summary>`,
    `<div class="chat-tool-body">`,
    `<div class="chat-tool-section"><div class="chat-tool-label">args</div><pre class="chat-tool-pre">${escapeHtml(argsJson)}</pre></div>`,
    resultBlock,
    `</div>`,
    `</details>`,
    `</div>`,
  ].join('');
}

function renderCorruptionRow(row: CorruptionMarker): string {
  const msg = `Detected gap in chat log between seq ${row.from} and ${row.to}`;
  return `<div class="chat-row chat-row--marker"><div class="chat-corruption">${escapeHtml(msg)}</div></div>`;
}

export function renderBridgeState(state: BridgeState): string {
  const { variant, label, pulse } = bridgeStateChip(state);
  const pulseClass = pulse ? ' chat-state-chip--pulse' : '';
  return [
    `<span class="chat-state-chip chat-state-chip--${variant}${pulseClass}" role="status" aria-live="polite">`,
    `<span class="chat-state-dot" aria-hidden="true"></span>`,
    `<span class="chat-state-label">${escapeHtml(label)}</span>`,
    `</span>`,
  ].join('');
}

interface ChipDescriptor {
  readonly variant: 'offline' | 'connected' | 'listening' | 'listening-active';
  readonly label: string;
  readonly pulse: boolean;
}

function bridgeStateChip(state: BridgeState): ChipDescriptor {
  if (!state.mcpConnected) {
    return { variant: 'offline', label: 'Bridge offline', pulse: false };
  }
  if (!state.listenModeOn) {
    return {
      variant: 'connected',
      label: 'Agent connected, not listening',
      pulse: false,
    };
  }
  if (state.awaitingMessage) {
    return {
      variant: 'listening-active',
      label: 'Listening (awaiting...)',
      pulse: true,
    };
  }
  return { variant: 'listening', label: 'Listening', pulse: false };
}

function safeStringify(value: unknown): string {
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - ts);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

