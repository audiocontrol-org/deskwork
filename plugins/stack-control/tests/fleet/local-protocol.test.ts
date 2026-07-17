// specs/036-fleet-control-plane — T033 (RED), pairs with T038 impl
// (src/telemetry/protocol.ts).
//
// contracts/local-socket-protocol.md § Frames pins the frame set:
//   CLI -> sidecar: hello, event, register-run, end-invocation
//   sidecar -> CLI: hello-ack, command, ack
// and § C3 (FR-010) pins the version handshake: "First frame carries a
// protocol version. Match -> proceed. Mismatch -> defined restart path;
// the invocation is NEVER failed (C1 dominates)." This test proves:
//   1. every frame kind round-trips through serialize -> parse unchanged;
//   2. the handshake decision (`decideHandshake`) and its two frame-level
//      wrappers (`buildHelloAckFrame` on the sidecar side,
//      `interpretHelloAck` on the CLI side) return a MISMATCH VALUE, never
//      throw, on a version skew — the "restart path" is a return value the
//      caller acts on, not an exception that could propagate into and fail
//      an invocation;
//   3. a malformed/unparseable line never crashes the reader — parseFrame
//      returns a typed `{ ok: false }` result instead of throwing, for
//      every malformed-input shape tried (bad JSON, non-object JSON,
//      unknown "kind", missing required fields);
//   4. `splitFrameLines` (the newline-delimited chunk splitter later I/O
//      code will use) never throws and correctly holds back a partial
//      trailing line.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured). No vitest fake timers.

import { describe, expect, it } from 'vitest';
import type { Clock } from '../../src/fleet/clock.js';
import { constructEnvelope, type EnvelopeInput, type TelemetryEvent } from '../../src/fleet/event.js';
import { mintInstallationId, mintUuidV7 } from '../../src/fleet/types.js';
import {
  LOCAL_PROTOCOL_VERSION,
  buildAckFrame,
  buildCommandFrame,
  buildEndInvocationFrame,
  buildEventFrame,
  buildHelloAckFrame,
  buildHelloFrame,
  buildRegisterRunFrame,
  decideHandshake,
  interpretHelloAck,
  parseCliToSidecarFrame,
  parseFrame,
  parseSidecarToCliFrame,
  serializeFrame,
  splitFrameLines,
  type CliToSidecarFrame,
  type SidecarToCliFrame,
} from '../../src/telemetry/protocol.js';

/** Deterministic fake Clock — same shape used across tests/fleet/*.test.ts. */
class FakeClock implements Clock {
  constructor(
    private wall: string,
    private mono: number,
  ) {}
  nowIso(): string {
    return this.wall;
  }
  monotonicNowMs(): number {
    return this.mono;
  }
}

function makeTelemetryEvent(): TelemetryEvent {
  const clock = new FakeClock('2026-07-17T00:00:00.000Z', 1000);
  const input: EnvelopeInput = {
    installationId: mintInstallationId(),
    invocationId: mintUuidV7(),
    runId: mintUuidV7(),
    installationSequence: 1,
    invocationSequence: 1,
    schemaVersion: 1,
    type: 'run.started',
    classification: 'durable',
  };
  return {
    envelope: constructEnvelope(clock, 900, input),
    snapshot: { note: 'representative snapshot payload' },
  };
}

describe('local wire protocol — frame shapes (T033)', () => {
  it('round-trips every CLI -> sidecar frame kind through serialize -> parse unchanged', () => {
    const event = makeTelemetryEvent();
    const frames: readonly CliToSidecarFrame[] = [
      buildHelloFrame(LOCAL_PROTOCOL_VERSION),
      buildEventFrame(event),
      buildRegisterRunFrame(mintInstallationId(), mintUuidV7(), mintUuidV7()),
      buildEndInvocationFrame(mintInstallationId(), mintUuidV7(), mintUuidV7()),
      buildEndInvocationFrame(mintInstallationId(), mintUuidV7(), null),
    ];

    for (const frame of frames) {
      const wire = serializeFrame(frame);
      expect(wire.endsWith('\n')).toBe(true);
      const result = parseFrame(wire.trimEnd());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.frame).toEqual(frame);
      }
    }
  });

  it('round-trips every sidecar -> CLI frame kind through serialize -> parse unchanged', () => {
    const frames: readonly SidecarToCliFrame[] = [
      buildHelloAckFrame(buildHelloFrame(LOCAL_PROTOCOL_VERSION), LOCAL_PROTOCOL_VERSION),
      buildCommandFrame(mintUuidV7(), mintUuidV7(), { action: 'pause' }),
      buildAckFrame('event', mintUuidV7()),
      buildAckFrame('register-run', mintUuidV7()),
      buildAckFrame('end-invocation', mintUuidV7()),
    ];

    for (const frame of frames) {
      const wire = serializeFrame(frame);
      const result = parseFrame(wire.trimEnd());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.frame).toEqual(frame);
      }
    }
  });

  it('parseCliToSidecarFrame rejects a well-formed frame from the WRONG direction', () => {
    const ack = buildHelloAckFrame(buildHelloFrame(LOCAL_PROTOCOL_VERSION), LOCAL_PROTOCOL_VERSION);
    const wire = serializeFrame(ack).trimEnd();
    const result = parseCliToSidecarFrame(wire);
    expect(result.ok).toBe(false);
  });

  it('parseSidecarToCliFrame rejects a well-formed frame from the WRONG direction', () => {
    const hello = buildHelloFrame(LOCAL_PROTOCOL_VERSION);
    const wire = serializeFrame(hello).trimEnd();
    const result = parseSidecarToCliFrame(wire);
    expect(result.ok).toBe(false);
  });
});

describe('local wire protocol — version handshake never fails the invocation (T033, FR-010, C3)', () => {
  it('decideHandshake returns a MATCH outcome when versions agree', () => {
    const outcome = decideHandshake(LOCAL_PROTOCOL_VERSION, LOCAL_PROTOCOL_VERSION);
    expect(outcome).toEqual({ kind: 'match', agreedVersion: LOCAL_PROTOCOL_VERSION });
  });

  it('decideHandshake returns a MISMATCH restart-path VALUE on skew — it does not throw', () => {
    expect(() => decideHandshake(LOCAL_PROTOCOL_VERSION + 1, LOCAL_PROTOCOL_VERSION)).not.toThrow();
    const outcome = decideHandshake(LOCAL_PROTOCOL_VERSION + 1, LOCAL_PROTOCOL_VERSION);
    expect(outcome).toEqual({
      kind: 'mismatch',
      remoteVersion: LOCAL_PROTOCOL_VERSION + 1,
      localVersion: LOCAL_PROTOCOL_VERSION,
      action: 'restart-sidecar',
    });
  });

  it('buildHelloAckFrame (sidecar side) rejects a stale hello WITHOUT throwing, and marks accepted:false', () => {
    const staleHello = buildHelloFrame(LOCAL_PROTOCOL_VERSION - 1 < 0 ? 0 : LOCAL_PROTOCOL_VERSION - 1);
    // Force a genuine skew regardless of what LOCAL_PROTOCOL_VERSION is.
    const skewedHello = { ...staleHello, protocolVersion: LOCAL_PROTOCOL_VERSION + 7 };
    expect(() => buildHelloAckFrame(skewedHello, LOCAL_PROTOCOL_VERSION)).not.toThrow();
    const ack = buildHelloAckFrame(skewedHello, LOCAL_PROTOCOL_VERSION);
    expect(ack.accepted).toBe(false);
    expect(ack.sidecarProtocolVersion).toBe(LOCAL_PROTOCOL_VERSION);
  });

  it('buildHelloAckFrame accepts a matching hello', () => {
    const hello = buildHelloFrame(LOCAL_PROTOCOL_VERSION);
    const ack = buildHelloAckFrame(hello, LOCAL_PROTOCOL_VERSION);
    expect(ack.accepted).toBe(true);
  });

  it('interpretHelloAck (CLI side) yields a restart-path outcome on skew WITHOUT throwing — never fails the invocation', () => {
    const skewedAck = buildHelloAckFrame(
      { kind: 'hello', protocolVersion: LOCAL_PROTOCOL_VERSION + 3 },
      LOCAL_PROTOCOL_VERSION + 3,
    );
    // The CLI's own local version disagrees with what the sidecar just acked.
    expect(() => interpretHelloAck(skewedAck, LOCAL_PROTOCOL_VERSION)).not.toThrow();
    const outcome = interpretHelloAck(skewedAck, LOCAL_PROTOCOL_VERSION);
    expect(outcome.kind).toBe('mismatch');
    if (outcome.kind === 'mismatch') {
      expect(outcome.action).toBe('restart-sidecar');
    }
  });

  it('interpretHelloAck yields a match outcome when versions agree', () => {
    const ack = buildHelloAckFrame(buildHelloFrame(LOCAL_PROTOCOL_VERSION), LOCAL_PROTOCOL_VERSION);
    const outcome = interpretHelloAck(ack, LOCAL_PROTOCOL_VERSION);
    expect(outcome).toEqual({ kind: 'match', agreedVersion: LOCAL_PROTOCOL_VERSION });
  });
});

describe('local wire protocol — a malformed line never crashes the reader (T033)', () => {
  it('parseFrame rejects invalid JSON without throwing', () => {
    expect(() => parseFrame('{not valid json')).not.toThrow();
    const result = parseFrame('{not valid json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.raw).toBe('{not valid json');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('parseFrame rejects well-formed JSON that is not an object', () => {
    for (const raw of ['null', '42', '"a string"', '[1,2,3]', 'true']) {
      expect(() => parseFrame(raw)).not.toThrow();
      expect(parseFrame(raw).ok).toBe(false);
    }
  });

  it('parseFrame rejects an object with an unrecognized "kind"', () => {
    const raw = JSON.stringify({ kind: 'not-a-real-frame-kind' });
    expect(() => parseFrame(raw)).not.toThrow();
    expect(parseFrame(raw).ok).toBe(false);
  });

  it('parseFrame rejects a recognized "kind" missing its required fields', () => {
    const raw = JSON.stringify({ kind: 'hello' }); // missing protocolVersion
    expect(() => parseFrame(raw)).not.toThrow();
    expect(parseFrame(raw).ok).toBe(false);
  });

  it('parseFrame rejects an empty string', () => {
    expect(() => parseFrame('')).not.toThrow();
    expect(parseFrame('').ok).toBe(false);
  });
});

describe('local wire protocol — splitFrameLines never throws and holds back a partial trailing line (T033)', () => {
  it('splits complete newline-terminated lines and reports no remainder', () => {
    const { complete, remainder } = splitFrameLines('a\nb\nc\n');
    expect(complete).toEqual(['a', 'b', 'c']);
    expect(remainder).toBe('');
  });

  it('holds back a partial trailing line with no terminating newline', () => {
    const { complete, remainder } = splitFrameLines('a\nb\npartial');
    expect(complete).toEqual(['a', 'b']);
    expect(remainder).toBe('partial');
  });

  it('an empty buffer yields no complete lines and no remainder', () => {
    const { complete, remainder } = splitFrameLines('');
    expect(complete).toEqual([]);
    expect(remainder).toBe('');
  });

  it('never throws regardless of input shape', () => {
    expect(() => splitFrameLines('\n\n\n')).not.toThrow();
    expect(() => splitFrameLines('no newline at all')).not.toThrow();
  });
});
