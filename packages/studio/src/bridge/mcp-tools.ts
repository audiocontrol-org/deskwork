/**
 * Tool-handler logic for the MCP bridge — kept in its own module so
 * `mcp-server.ts` stays under the file-size cap and the handlers are
 * directly callable from tests without instantiating the SDK.
 *
 * Two handlers:
 *   - `awaitStudioMessageHandler` — await operator message; flips
 *     listenModeOn (idempotent) and tracks awaitingMessage state.
 *   - `sendStudioResponseHandler` — publish + persist; persistence
 *     blocks the success return so SSE replay can see the row.
 */

import { z } from 'zod';
import type { BridgeQueue } from './queue.ts';
import type { ChatLogStore } from './persistence.ts';
import type {
  AgentEvent,
  AgentEventStatus,
  OperatorMessage,
} from './types.ts';

export interface BridgeDeps {
  readonly queue: BridgeQueue;
  readonly log: ChatLogStore;
}

export const MAX_PAYLOAD_BYTES = 1_048_576;

export const sendStudioResponseInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('tool-use'),
    tool: z.string().min(1),
    args: z.unknown(),
    result: z.unknown().optional(),
    status: z.enum(['starting', 'done', 'error']).optional(),
  }),
  z.object({
    kind: z.literal('prose'),
    text: z.string(),
  }),
]);

export type SendStudioResponseInput = z.infer<
  typeof sendStudioResponseInputSchema
>;

export interface AwaitResult {
  readonly received: boolean;
  readonly message: OperatorMessage | null;
}

export async function awaitStudioMessageHandler(
  bridge: BridgeDeps,
  args: { timeoutSeconds: number },
  signal: AbortSignal,
): Promise<AwaitResult> {
  // First-call inference: the agent starting to listen IS what flips
  // listenModeOn. setListenModeOn is idempotent on already-true.
  bridge.queue.setListenModeOn(true);
  bridge.queue.setAwaitingMessage(true);
  try {
    const timeoutMs = Math.max(0, Math.floor(args.timeoutSeconds * 1000));
    const message = await bridge.queue.awaitNextOperatorMessage(timeoutMs, signal);
    return { received: message !== null, message };
  } finally {
    bridge.queue.setAwaitingMessage(false);
  }
}

export async function sendStudioResponseHandler(
  bridge: BridgeDeps,
  input: SendStudioResponseInput,
): Promise<AgentEvent> {
  let event: AgentEvent;
  if (input.kind === 'prose') {
    event = bridge.queue.publishProse(input.text);
  } else {
    const base = { tool: input.tool, args: input.args };
    const withResult =
      input.result === undefined ? base : { ...base, result: input.result };
    const fullInput: ToolUseInput =
      input.status === undefined
        ? withResult
        : { ...withResult, status: input.status };
    event = bridge.queue.publishToolUse(fullInput);
  }
  await bridge.log.append(event);
  return event;
}

interface ToolUseInput {
  readonly tool: string;
  readonly args: unknown;
  readonly status?: AgentEventStatus;
  readonly result?: unknown;
}

export function serializeAwaitResult(r: AwaitResult): Record<string, unknown> {
  if (r.message === null) return { received: false, message: null };
  const m = r.message;
  const inner: Record<string, unknown> = {
    seq: m.seq,
    ts: m.ts,
    role: m.role,
    text: m.text,
  };
  if (m.contextRef !== undefined) inner['contextRef'] = m.contextRef;
  return { received: true, message: inner };
}

export function approximatePayloadSize(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return 0;
    return Buffer.byteLength(json, 'utf8');
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function combineSignals(
  a: AbortSignal,
  b: AbortSignal | undefined,
): AbortSignal {
  if (b === undefined) return a;
  if (a.aborted) return a;
  if (b.aborted) return b;
  const ctrl = new AbortController();
  const onA = (): void => ctrl.abort(a.reason);
  const onB = (): void => ctrl.abort(b.reason);
  a.addEventListener('abort', onA, { once: true });
  b.addEventListener('abort', onB, { once: true });
  return ctrl.signal;
}

const LOOPBACK_ADDRS = new Set<string>([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  'localhost',
]);

export function isLoopbackAddress(addr: string | undefined): boolean {
  if (addr === undefined || addr === '') return false;
  return LOOPBACK_ADDRS.has(addr);
}
