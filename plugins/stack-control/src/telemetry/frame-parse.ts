/**
 * specs/036-fleet-control-plane — T038 (impl), companion to `protocol.ts`.
 *
 * Split out of `protocol.ts` purely for the project's 300-500 line file
 * cap (`.claude/CLAUDE.md`) — this is NOT a separate public surface.
 * `protocol.ts` re-exports everything here, so callers only ever import
 * from `./protocol.js`; nothing outside this pair imports this file
 * directly. Owns the "never throws" half of the contract: `parseFrame` /
 * `parseCliToSidecarFrame` / `parseSidecarToCliFrame` convert every
 * malformed-input shape into a typed `{ ok: false }` result instead of an
 * exception, and `splitFrameLines` is a total newline-chunk splitter. See
 * `protocol.ts`'s module doc comment for the full contract this serves
 * (contracts/local-socket-protocol.md § Frames, § C3).
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI) — every `unknown`
 * input is narrowed with local type guards / require* helpers that throw
 * descriptively; `parseFrame` is the ONLY place those throws are caught.
 */

import { validateSnapshot, validateTelemetryEvent } from '../fleet/event.js';
import type {
  AckFrame,
  AckedFrameKind,
  CliToSidecarFrame,
  CommandFrame,
  EndInvocationFrame,
  EventFrame,
  HelloAckFrame,
  HelloFrame,
  ProtocolFrame,
  RegisterRunFrame,
  SidecarToCliFrame,
} from './protocol.js';

/** User-defined type guard on the FRAME itself (not just its `kind`
 * string) — narrowing a discriminated union through a helper only works
 * when the guard's parameter is the union value, not an extracted
 * sub-property, so this takes `frame: ProtocolFrame` directly. */
export function isCliToSidecarFrame(frame: ProtocolFrame): frame is CliToSidecarFrame {
  switch (frame.kind) {
    case 'hello':
    case 'event':
    case 'register-run':
    case 'end-invocation':
      return true;
    case 'hello-ack':
    case 'command':
    case 'ack':
      return false;
    default: {
      const exhaustive: never = frame;
      throw new Error(`frame-parse.ts: unhandled frame kind ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function isSidecarToCliFrame(frame: ProtocolFrame): frame is SidecarToCliFrame {
  switch (frame.kind) {
    case 'hello-ack':
    case 'command':
    case 'ack':
      return true;
    case 'hello':
    case 'event':
    case 'register-run':
    case 'end-invocation':
      return false;
    default: {
      const exhaustive: never = frame;
      throw new Error(`frame-parse.ts: unhandled frame kind ${JSON.stringify(exhaustive)}`);
    }
  }
}

export interface FrameParseSuccess<T> {
  readonly ok: true;
  readonly frame: T;
}

export interface FrameParseFailure {
  readonly ok: false;
  readonly raw: string;
  readonly error: string;
}

export type FrameParseResult<T> = FrameParseSuccess<T> | FrameParseFailure;

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${context}.${key}: expected a non-empty string, got ${describeType(value)}`);
  }
  return value;
}

function requireNullableString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `${context}.${key}: expected a non-empty string or null, got ${describeType(value)}`,
    );
  }
  return value;
}

function requireFiniteNumber(record: Record<string, unknown>, key: string, context: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${context}.${key}: expected a finite number, got ${describeType(value)}`);
  }
  return value;
}

function requireBoolean(record: Record<string, unknown>, key: string, context: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    throw new Error(`${context}.${key}: expected a boolean, got ${describeType(value)}`);
  }
  return value;
}

const ACKED_FRAME_KIND_VALUES: readonly AckedFrameKind[] = ['event', 'register-run', 'end-invocation'];

function isAckedFrameKind(value: string): value is AckedFrameKind {
  return value === 'event' || value === 'register-run' || value === 'end-invocation';
}

function requireAckedKind(record: Record<string, unknown>, key: string, context: string): AckedFrameKind {
  const value = record[key];
  if (typeof value !== 'string' || !isAckedFrameKind(value)) {
    throw new Error(
      `${context}.${key}: expected one of ${JSON.stringify(ACKED_FRAME_KIND_VALUES)}, got ${describeType(value)}`,
    );
  }
  return value;
}

function parseHelloRecord(record: Record<string, unknown>): HelloFrame {
  return { kind: 'hello', protocolVersion: requireFiniteNumber(record, 'protocolVersion', 'hello') };
}

function parseEventRecord(record: Record<string, unknown>): EventFrame {
  // Reuses event.ts's own validator rather than re-deriving envelope/
  // snapshot shape rules here — validateTelemetryEvent already throws a
  // descriptive Error on any malformed field, which parseFrame's caller
  // (below) converts into a FrameParseFailure exactly like every other
  // per-kind validator's throw.
  return { kind: 'event', event: validateTelemetryEvent(record.event) };
}

function parseRegisterRunRecord(record: Record<string, unknown>): RegisterRunFrame {
  return {
    kind: 'register-run',
    installationId: requireString(record, 'installationId', 'register-run'),
    invocationId: requireString(record, 'invocationId', 'register-run'),
    runId: requireString(record, 'runId', 'register-run'),
  };
}

function parseEndInvocationRecord(record: Record<string, unknown>): EndInvocationFrame {
  return {
    kind: 'end-invocation',
    installationId: requireString(record, 'installationId', 'end-invocation'),
    invocationId: requireString(record, 'invocationId', 'end-invocation'),
    runId: requireNullableString(record, 'runId', 'end-invocation'),
  };
}

function parseHelloAckRecord(record: Record<string, unknown>): HelloAckFrame {
  return {
    kind: 'hello-ack',
    accepted: requireBoolean(record, 'accepted', 'hello-ack'),
    sidecarProtocolVersion: requireFiniteNumber(record, 'sidecarProtocolVersion', 'hello-ack'),
  };
}

function parseCommandRecord(record: Record<string, unknown>): CommandFrame {
  return {
    kind: 'command',
    commandId: requireString(record, 'commandId', 'command'),
    runId: requireString(record, 'runId', 'command'),
    payload: validateSnapshot(record.payload),
  };
}

function parseAckRecord(record: Record<string, unknown>): AckFrame {
  return {
    kind: 'ack',
    acked: requireAckedKind(record, 'acked', 'ack'),
    correlationId: requireString(record, 'correlationId', 'ack'),
  };
}

function buildFrameFromRecord(kind: string, record: Record<string, unknown>): ProtocolFrame {
  switch (kind) {
    case 'hello':
      return parseHelloRecord(record);
    case 'event':
      return parseEventRecord(record);
    case 'register-run':
      return parseRegisterRunRecord(record);
    case 'end-invocation':
      return parseEndInvocationRecord(record);
    case 'hello-ack':
      return parseHelloAckRecord(record);
    case 'command':
      return parseCommandRecord(record);
    case 'ack':
      return parseAckRecord(record);
    default:
      throw new Error(`unrecognized frame kind ${JSON.stringify(kind)}`);
  }
}

/**
 * Parses one newline-delimited-JSON line (without its trailing newline)
 * into a `ProtocolFrame`. Total: NEVER throws — bad JSON, non-object
 * JSON, an unrecognized `kind`, or a recognized `kind` missing required
 * fields all come back as `{ ok: false, raw, error }` instead of
 * propagating an exception into the caller's read loop. "This protocol
 * must never take down the CLI" (nor the sidecar) applies here exactly as
 * much as to the handshake.
 */
export function parseFrame(line: string): FrameParseResult<ProtocolFrame> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    return {
      ok: false,
      raw: line,
      error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, raw: line, error: `expected a JSON object, got ${describeType(parsed)}` };
  }

  const kindValue = parsed.kind;
  if (typeof kindValue !== 'string') {
    return {
      ok: false,
      raw: line,
      error: `expected a string "kind" field, got ${describeType(kindValue)}`,
    };
  }

  try {
    return { ok: true, frame: buildFrameFromRecord(kindValue, parsed) };
  } catch (error) {
    return { ok: false, raw: line, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Like `parseFrame`, but additionally rejects a well-formed frame that
 * arrived from the WRONG direction (e.g. a sidecar receiving a `command`
 * frame on its listen side would be a protocol violation). */
export function parseCliToSidecarFrame(line: string): FrameParseResult<CliToSidecarFrame> {
  const result = parseFrame(line);
  if (!result.ok) return result;
  if (!isCliToSidecarFrame(result.frame)) {
    return {
      ok: false,
      raw: line,
      error: `expected a CLI -> sidecar frame, got "${result.frame.kind}" (a sidecar -> CLI frame)`,
    };
  }
  return { ok: true, frame: result.frame };
}

/** Direction-checked counterpart of `parseCliToSidecarFrame`, for the CLI
 * side reading responses from the sidecar. */
export function parseSidecarToCliFrame(line: string): FrameParseResult<SidecarToCliFrame> {
  const result = parseFrame(line);
  if (!result.ok) return result;
  if (!isSidecarToCliFrame(result.frame)) {
    return {
      ok: false,
      raw: line,
      error: `expected a sidecar -> CLI frame, got "${result.frame.kind}" (a CLI -> sidecar frame)`,
    };
  }
  return { ok: true, frame: result.frame };
}

// ---------------------------------------------------------------------------
// Stream chunking — total; never throws. Later I/O code (emit.ts's socket
// read handler, server.ts's connection handler) composes this with
// parseFrame to turn arbitrary, possibly-partial socket chunks into
// complete lines without ever losing or mis-splitting a frame across
// reads.
// ---------------------------------------------------------------------------

export interface SplitFrameLinesResult {
  /** Every complete (newline-terminated) line found, in order, with the
   * terminating newline stripped. Empty lines are dropped — newline-
   * delimited JSON has no meaningful blank-line frame. */
  readonly complete: readonly string[];
  /** The bytes after the last newline, if any — an incomplete line a
   * caller should prepend to the NEXT chunk before splitting again. */
  readonly remainder: string;
}

export function splitFrameLines(buffered: string): SplitFrameLinesResult {
  const parts = buffered.split('\n');
  const remainder = parts.pop() ?? '';
  const complete = parts.filter((line) => line.length > 0);
  return { complete, remainder };
}
