/**
 * specs/036-fleet-control-plane — T038 (impl), pairs with T033/T034's RED
 * tests. Local wire protocol + version handshake, per
 * contracts/local-socket-protocol.md § Frames and § C3 (FR-010).
 *
 * SCOPE (per the task pairing): the wire protocol only — frame shapes for
 * BOTH directions, (de)serialization to/from newline-delimited JSON, and
 * the version-handshake decision. This file does NOT open a socket, does
 * NOT implement the fail-open emit client (`src/telemetry/emit.ts`,
 * T039), does NOT implement the bounded buffer (`buffer.ts`, T040), and
 * does NOT implement the sidecar listener (`src/sidecar/server.ts`,
 * T041). Those import this module's types/functions; this module imports
 * nothing from them. Its only sibling import is `src/fleet/event.js`
 * (the `TelemetryEvent` an `event` frame carries) and `src/fleet/types.js`
 * indirectly via that.
 *
 * FRAME SET (contracts/local-socket-protocol.md § Frames):
 *   CLI -> sidecar: hello, event, register-run, end-invocation
 *   sidecar -> CLI: hello-ack, command, ack
 * Newline-delimited JSON. Each frame is a discriminated union member keyed
 * on `kind`; `frameToWire` below switches over the FULL `ProtocolFrame`
 * union with a `never`-typed exhaustiveness guard (Constitution Principle
 * VI: no boolean soup).
 *
 * C2 (token never crosses this socket): no frame interface below has a
 * `token` field, AND `frameToWire` never spreads `...frame` — it builds a
 * brand-new object literal per `kind` from an explicit field allowlist.
 * That second property is deliberate defense in depth: even if a caller
 * elsewhere manages to attach an extra `token` property to an
 * already-built frame object (a bug, not a sanctioned path — there is no
 * field to assign it to on construction), serialization still drops it,
 * because the allowlist reads named fields off the frame, never the frame
 * itself wholesale. tests/fleet/token-not-on-socket.test.ts (T034) proves
 * this by tampering with built frames the same way a bug plausibly would
 * (`{ ...frame, token: '...' }`) and asserting the wire output never
 * carries it.
 *
 * C3 (version handshake, FR-010): `decideHandshake` is the ONE decision
 * function — given a remote peer's protocol version and this side's local
 * version, it returns a `HandshakeOutcome` VALUE (`match` or `mismatch`),
 * never throws. `buildHelloAckFrame` (sidecar side, deciding about an
 * incoming `hello`) and `interpretHelloAck` (CLI side, deciding about an
 * incoming `hello-ack`) both wrap `decideHandshake` and are equally
 * throw-free. A `mismatch` outcome carries `action: 'restart-sidecar'` —
 * a value the caller (T039/T041, out of scope here) acts on to fire the
 * defined restart path. Nothing in this module can fail an invocation by
 * throwing into it on a version skew.
 *
 * Malformed input: `parseFrame` never throws. JSON.parse failures,
 * non-object JSON, unrecognized `kind` values, and recognized kinds
 * missing required fields all return a typed `{ ok: false }` result
 * instead of propagating an exception — "this protocol must never take
 * down the CLI" (task brief) applies to READING frames just as much as to
 * the handshake. `splitFrameLines` (the newline-chunk splitter later I/O
 * code composes this module with) is likewise total: it never throws for
 * any string input, including one with no trailing newline (the partial
 * last line is returned as `remainder` for the caller to prepend to the
 * next chunk, rather than discarded or force-parsed).
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI). Every `unknown` input
 * is narrowed with local type guards / require* helpers that throw
 * descriptively; `parseFrame` is the ONLY place those throws are caught
 * and converted into a `FrameParseResult`.
 *
 * FILE SPLIT (project's 300-500 line cap, `.claude/CLAUDE.md`): parsing
 * (`parseFrame` / `parseCliToSidecarFrame` / `parseSidecarToCliFrame` /
 * `splitFrameLines` and their internals) lives in the sibling
 * `frame-parse.ts` and is re-exported below — this is a file-size split,
 * NOT a second public surface; every caller imports from THIS module.
 *
 * This repo's convention is relative `.js` imports under node16 module
 * resolution (no `@/` alias configured for this plugin).
 */

import type { SnapshotPayload, TelemetryEvent } from '../fleet/event.js';

/**
 * The local wire protocol version this build of `stackctl` speaks.
 * Exported as a NAMED constant (matching `event.ts`'s
 * `MAX_EVENT_SNAPSHOT_BYTES` precedent) rather than a literal scattered
 * across call sites, since spec.md/research.md do not pin a specific
 * version NUMBER (only that a handshake with a defined restart path must
 * exist, FR-010) — this is a judgment call: start the version line at 1
 * and bump it whenever a frame shape below changes incompatibly.
 */
export const LOCAL_PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// CLI -> sidecar frames
// ---------------------------------------------------------------------------

/** First frame on every connection; carries the CLI's protocol version. */
export interface HelloFrame {
  readonly kind: 'hello';
  readonly protocolVersion: number;
}

/**
 * A raw, UN-REDACTED telemetry event. Redaction is the sidecar's job
 * (FR-047), applied before spooling (FR-048) — raw events crossing this
 * socket is by design, per contracts/local-socket-protocol.md § Frames.
 */
export interface EventFrame {
  readonly kind: 'event';
  readonly event: TelemetryEvent;
}

/**
 * Registers this connection as hosting a COMMANDABLE run (`execute`,
 * `govern` only — FR-013), so the sidecar knows which connection to
 * deliver `command` frames to for `runId`. `runId` is required (never
 * null) here — a caller with no run does not send this frame at all.
 */
export interface RegisterRunFrame {
  readonly kind: 'register-run';
  readonly installationId: string;
  readonly invocationId: string;
  readonly runId: string;
}

/**
 * Signals this invocation is ending. C5's liveness primitive is socket
 * CLOSURE with no preceding `end-invocation` — so this frame's own
 * payload only needs to identify WHICH invocation/run is ending; deriving
 * an execution outcome from closure timing/reconciliation is the
 * sidecar's job (later tasks), not this frame's. `runId` is nullable,
 * matching `EventEnvelope.runId` (`null` for non-run invocations).
 */
export interface EndInvocationFrame {
  readonly kind: 'end-invocation';
  readonly installationId: string;
  readonly invocationId: string;
  readonly runId: string | null;
}

export type CliToSidecarFrame = HelloFrame | EventFrame | RegisterRunFrame | EndInvocationFrame;

// ---------------------------------------------------------------------------
// sidecar -> CLI frames
// ---------------------------------------------------------------------------

/** Answers a `hello`: whether the version matched, and the sidecar's own
 * version (so a CLI can `interpretHelloAck` even a mismatch precisely). */
export interface HelloAckFrame {
  readonly kind: 'hello-ack';
  readonly accepted: boolean;
  readonly sidecarProtocolVersion: number;
}

/** Delivered only to a connection that previously sent `register-run` for
 * this `runId` (commandable runs only, FR-013). `payload` is a bounded
 * JSON object — reusing `SnapshotPayload` / `validateSnapshot` from
 * `event.ts` rather than inventing a parallel bounded-payload contract. */
export interface CommandFrame {
  readonly kind: 'command';
  readonly commandId: string;
  readonly runId: string;
  readonly payload: SnapshotPayload;
}

/** Which CLI -> sidecar frame kind is being acknowledged. Acks are not
 * defined for `hello` (that's `hello-ack`'s job specifically). */
export type AckedFrameKind = 'event' | 'register-run' | 'end-invocation';

/**
 * Acknowledges receipt of an `event` / `register-run` / `end-invocation`
 * frame. `correlationId` identifies WHICH one: for `event` it is the
 * envelope's `eventId`; for `register-run` / `end-invocation` it is the
 * `invocationId` — both are already-unique identifiers minted per
 * data-model.md § Identity, so no separate ack-id scheme is needed.
 */
export interface AckFrame {
  readonly kind: 'ack';
  readonly acked: AckedFrameKind;
  readonly correlationId: string;
}

export type SidecarToCliFrame = HelloAckFrame | CommandFrame | AckFrame;

export type ProtocolFrame = CliToSidecarFrame | SidecarToCliFrame;

// ---------------------------------------------------------------------------
// Builders — one per frame kind, so a caller can never hand-assemble a
// frame object with an extra (e.g. `token`) field by construction.
// ---------------------------------------------------------------------------

export function buildHelloFrame(protocolVersion: number = LOCAL_PROTOCOL_VERSION): HelloFrame {
  return { kind: 'hello', protocolVersion };
}

export function buildEventFrame(event: TelemetryEvent): EventFrame {
  return { kind: 'event', event };
}

export function buildRegisterRunFrame(
  installationId: string,
  invocationId: string,
  runId: string,
): RegisterRunFrame {
  return { kind: 'register-run', installationId, invocationId, runId };
}

export function buildEndInvocationFrame(
  installationId: string,
  invocationId: string,
  runId: string | null,
): EndInvocationFrame {
  return { kind: 'end-invocation', installationId, invocationId, runId };
}

export function buildCommandFrame(
  commandId: string,
  runId: string,
  payload: SnapshotPayload,
): CommandFrame {
  return { kind: 'command', commandId, runId, payload };
}

export function buildAckFrame(acked: AckedFrameKind, correlationId: string): AckFrame {
  return { kind: 'ack', acked, correlationId };
}

// ---------------------------------------------------------------------------
// Version handshake (C3, FR-010) — a VALUE the caller acts on, never a throw.
// ---------------------------------------------------------------------------

export interface HandshakeMatch {
  readonly kind: 'match';
  readonly agreedVersion: number;
}

export interface HandshakeMismatch {
  readonly kind: 'mismatch';
  readonly remoteVersion: number;
  readonly localVersion: number;
  /** The defined restart path (C3): the CALLER restarts the sidecar. This
   * module only names the outcome; T039/T041 (emit.ts / server.ts) own
   * actually acting on it. */
  readonly action: 'restart-sidecar';
}

export type HandshakeOutcome = HandshakeMatch | HandshakeMismatch;

/**
 * Given a hello's version and the local version, decide match vs
 * mismatch. Pure and total — never throws, regardless of input — so
 * nothing about calling it can fail an invocation (C1 dominates C3).
 */
export function decideHandshake(remoteVersion: number, localVersion: number): HandshakeOutcome {
  if (remoteVersion === localVersion) {
    return { kind: 'match', agreedVersion: localVersion };
  }
  return { kind: 'mismatch', remoteVersion, localVersion, action: 'restart-sidecar' };
}

/** Sidecar side: build the `hello-ack` in response to an incoming `hello`,
 * per `decideHandshake`. Never throws. */
export function buildHelloAckFrame(
  hello: HelloFrame,
  localVersion: number = LOCAL_PROTOCOL_VERSION,
): HelloAckFrame {
  const outcome = decideHandshake(hello.protocolVersion, localVersion);
  return {
    kind: 'hello-ack',
    accepted: outcome.kind === 'match',
    sidecarProtocolVersion: localVersion,
  };
}

/** CLI side: interpret an incoming `hello-ack` against this side's own
 * local version. Never throws; a mismatch is a returned restart-path
 * value, exactly like `decideHandshake`. */
export function interpretHelloAck(
  ack: HelloAckFrame,
  localVersion: number = LOCAL_PROTOCOL_VERSION,
): HandshakeOutcome {
  return decideHandshake(ack.sidecarProtocolVersion, localVersion);
}

// ---------------------------------------------------------------------------
// Serialization — an explicit per-kind field allowlist (C2's mechanism).
// ---------------------------------------------------------------------------

function frameToWire(frame: ProtocolFrame): Record<string, unknown> {
  switch (frame.kind) {
    case 'hello':
      return { kind: frame.kind, protocolVersion: frame.protocolVersion };
    case 'event':
      return { kind: frame.kind, event: frame.event };
    case 'register-run':
      return {
        kind: frame.kind,
        installationId: frame.installationId,
        invocationId: frame.invocationId,
        runId: frame.runId,
      };
    case 'end-invocation':
      return {
        kind: frame.kind,
        installationId: frame.installationId,
        invocationId: frame.invocationId,
        runId: frame.runId,
      };
    case 'hello-ack':
      return {
        kind: frame.kind,
        accepted: frame.accepted,
        sidecarProtocolVersion: frame.sidecarProtocolVersion,
      };
    case 'command':
      return { kind: frame.kind, commandId: frame.commandId, runId: frame.runId, payload: frame.payload };
    case 'ack':
      return { kind: frame.kind, acked: frame.acked, correlationId: frame.correlationId };
    default: {
      // Exhaustiveness guard: a new ProtocolFrame member that forgets a
      // case above fails to compile here, not at runtime.
      const exhaustive: never = frame;
      throw new Error(`protocol.ts: unhandled frame kind ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Serializes one frame to a single newline-delimited-JSON line, including
 * the trailing `\n`. Never spreads `...frame` — see the module doc
 * comment's C2 section for why that matters. */
export function serializeFrame(frame: ProtocolFrame): string {
  return `${JSON.stringify(frameToWire(frame))}\n`;
}

// ---------------------------------------------------------------------------
// Parsing + stream chunking — see the module doc comment's FILE SPLIT note.
// Re-exported here so every caller imports from THIS module only.
// ---------------------------------------------------------------------------

export {
  parseFrame,
  parseCliToSidecarFrame,
  parseSidecarToCliFrame,
  splitFrameLines,
  type FrameParseSuccess,
  type FrameParseFailure,
  type FrameParseResult,
  type SplitFrameLinesResult,
} from './frame-parse.js';
