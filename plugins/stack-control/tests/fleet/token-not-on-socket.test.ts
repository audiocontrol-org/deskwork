// specs/036-fleet-control-plane — T034 (RED), pairs with T038 impl
// (src/telemetry/protocol.ts).
//
// contracts/local-socket-protocol.md § C2: "The CLI NEVER transmits the
// bearer token. The sidecar reads it from its own 0600 file." This is
// load-bearing, not hygiene (Windows named pipes get a NULL DACL granting
// Everyone read access — a token on the wire would be credential
// disclosure; never sending it degrades that to a non-event).
//
// This test proves the token-never-crosses guarantee TWO ways:
//   1. Structural: none of the frame builders' return shapes carry a
//      `token` property at all (own-property check on a freshly built
//      frame from every constructor, both directions).
//   2. Defense in depth: even if some other, buggy code SMUGGLES an extra
//      top-level `token` property onto an otherwise well-formed frame
//      object (a realistic "a bug appended a field" scenario — expressed
//      here as `{ ...frame, token: '...' }`, which needs no `as` cast
//      because TypeScript's excess-property check only fires on object
//      literals assigned directly to a narrower type, not on a variable
//      passed structurally), `serializeFrame` NEVER lets it reach the wire
//      — the wire string doesn't contain the token value, and the parsed
//      JSON has no `token` key. This is what "structurally hard to put a
//      token on the wire" means in practice: serialization is an explicit
//      per-kind field allowlist, never a raw `JSON.stringify(frame)` of
//      whatever object happens to be in hand.
//
// Raw EVENT payloads legitimately cross this socket un-redacted (redaction
// is the sidecar's job, FR-047/048) — a snapshot containing the WORD
// "token" as ordinary user/domain data is not what this test is about.
// This test is about the CLI's own bearer secret never appearing as a
// frame-level field, which is the one thing the contract singles out.
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
  parseFrame,
  serializeFrame,
  type CliToSidecarFrame,
  type ProtocolFrame,
  type SidecarToCliFrame,
} from '../../src/telemetry/protocol.js';

const SECRET_TOKEN_VALUE = 'sk-fleet-bearer-DO-NOT-LEAK-4f9c2b';

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

/** A representative event carrying sensitive-LOOKING (but not the actual
 * secret) domain data in its snapshot — proving ordinary snapshot content
 * is unaffected by the token guard, since raw events cross by design. */
function makeSensitiveLookingEvent(): TelemetryEvent {
  const clock = new FakeClock('2026-07-17T00:00:00.000Z', 1000);
  const input: EnvelopeInput = {
    installationId: mintInstallationId(),
    invocationId: mintUuidV7(),
    runId: mintUuidV7(),
    installationSequence: 1,
    invocationSequence: 1,
    schemaVersion: 1,
    type: 'run.progress',
    classification: 'live-only',
    sessionId: null,
  };
  return {
    envelope: constructEnvelope(clock, 900, input, process.cwd()),
    snapshot: { commandLine: '--token-like-flag=not-a-real-secret' },
  };
}

describe('token never appears on the local socket (T034, contract C2)', () => {
  it('no CLI -> sidecar frame constructor produces a "token" own-property', () => {
    const event = makeSensitiveLookingEvent();
    const frames: readonly CliToSidecarFrame[] = [
      buildHelloFrame(LOCAL_PROTOCOL_VERSION),
      buildEventFrame(event),
      buildRegisterRunFrame(mintInstallationId(), mintUuidV7(), mintUuidV7()),
      buildEndInvocationFrame(mintInstallationId(), mintUuidV7(), mintUuidV7()),
    ];
    for (const frame of frames) {
      expect(Object.prototype.hasOwnProperty.call(frame, 'token')).toBe(false);
    }
  });

  it('no sidecar -> CLI frame constructor produces a "token" own-property', () => {
    const frames: readonly SidecarToCliFrame[] = [
      buildHelloAckFrame(buildHelloFrame(LOCAL_PROTOCOL_VERSION), LOCAL_PROTOCOL_VERSION),
      buildCommandFrame(mintUuidV7(), mintUuidV7(), { action: 'pause' }),
      buildAckFrame('event', mintUuidV7()),
    ];
    for (const frame of frames) {
      expect(Object.prototype.hasOwnProperty.call(frame, 'token')).toBe(false);
    }
  });

  it('serializing every legitimate frame never emits the literal string "token" as a JSON key', () => {
    const event = makeSensitiveLookingEvent();
    const frames: readonly ProtocolFrame[] = [
      buildHelloFrame(LOCAL_PROTOCOL_VERSION),
      buildEventFrame(event),
      buildRegisterRunFrame(mintInstallationId(), mintUuidV7(), mintUuidV7()),
      buildEndInvocationFrame(mintInstallationId(), mintUuidV7(), null),
      buildHelloAckFrame(buildHelloFrame(LOCAL_PROTOCOL_VERSION), LOCAL_PROTOCOL_VERSION),
      buildCommandFrame(mintUuidV7(), mintUuidV7(), { action: 'pause' }),
      buildAckFrame('end-invocation', mintUuidV7()),
    ];
    for (const frame of frames) {
      const wire = serializeFrame(frame);
      const parsed: unknown = JSON.parse(wire);
      expect(parsed).not.toHaveProperty('token');
    }
  });

  it('a smuggled top-level "token" on a hello frame is dropped by serializeFrame — never reaches the wire', () => {
    const hello = buildHelloFrame(LOCAL_PROTOCOL_VERSION);
    const tampered = { ...hello, token: SECRET_TOKEN_VALUE };
    const wire = serializeFrame(tampered);
    expect(wire).not.toContain(SECRET_TOKEN_VALUE);
    const parsed: unknown = JSON.parse(wire);
    expect(parsed).not.toHaveProperty('token');
  });

  it('a smuggled top-level "token" on a register-run frame is dropped by serializeFrame', () => {
    const registerRun = buildRegisterRunFrame(mintInstallationId(), mintUuidV7(), mintUuidV7());
    const tampered = { ...registerRun, token: SECRET_TOKEN_VALUE };
    const wire = serializeFrame(tampered);
    expect(wire).not.toContain(SECRET_TOKEN_VALUE);
    const parsed: unknown = JSON.parse(wire);
    expect(parsed).not.toHaveProperty('token');
  });

  it('a smuggled top-level "token" on an end-invocation frame is dropped by serializeFrame', () => {
    const endInvocation = buildEndInvocationFrame(mintInstallationId(), mintUuidV7(), null);
    const tampered = { ...endInvocation, token: SECRET_TOKEN_VALUE };
    const wire = serializeFrame(tampered);
    expect(wire).not.toContain(SECRET_TOKEN_VALUE);
    const parsed: unknown = JSON.parse(wire);
    expect(parsed).not.toHaveProperty('token');
  });

  it('a smuggled top-level "token" on an event frame is dropped by serializeFrame, while the legitimate snapshot payload still crosses unredacted (redaction is the sidecar\'s job, not this file\'s)', () => {
    const event = makeSensitiveLookingEvent();
    const eventFrame = buildEventFrame(event);
    const tampered = { ...eventFrame, token: SECRET_TOKEN_VALUE };
    const wire = serializeFrame(tampered);
    expect(wire).not.toContain(SECRET_TOKEN_VALUE);
    const parsed: unknown = JSON.parse(wire);
    expect(parsed).not.toHaveProperty('token');
    // The raw event itself DID cross, snapshot and all — by design (C2
    // bounds the TOKEN specifically, not raw event content).
    expect(wire).toContain('not-a-real-secret');
  });

  it('a smuggled top-level "token" on a hello-ack frame is dropped by serializeFrame', () => {
    const ack = buildHelloAckFrame(buildHelloFrame(LOCAL_PROTOCOL_VERSION), LOCAL_PROTOCOL_VERSION);
    const tampered = { ...ack, token: SECRET_TOKEN_VALUE };
    const wire = serializeFrame(tampered);
    expect(wire).not.toContain(SECRET_TOKEN_VALUE);
    const parsed: unknown = JSON.parse(wire);
    expect(parsed).not.toHaveProperty('token');
  });

  it('a smuggled top-level "token" on a command frame is dropped by serializeFrame', () => {
    const command = buildCommandFrame(mintUuidV7(), mintUuidV7(), { action: 'pause' });
    const tampered = { ...command, token: SECRET_TOKEN_VALUE };
    const wire = serializeFrame(tampered);
    expect(wire).not.toContain(SECRET_TOKEN_VALUE);
    const parsed: unknown = JSON.parse(wire);
    expect(parsed).not.toHaveProperty('token');
  });

  it('a smuggled top-level "token" on an ack frame is dropped by serializeFrame', () => {
    const ack = buildAckFrame('event', mintUuidV7());
    const tampered = { ...ack, token: SECRET_TOKEN_VALUE };
    const wire = serializeFrame(tampered);
    expect(wire).not.toContain(SECRET_TOKEN_VALUE);
    const parsed: unknown = JSON.parse(wire);
    expect(parsed).not.toHaveProperty('token');
  });

  it('parsing a wire line that DOES contain an injected "token" key (e.g. a hostile/buggy peer) strips it just as thoroughly — the type has no field to carry it into', () => {
    const raw = JSON.stringify({
      kind: 'register-run',
      installationId: mintInstallationId(),
      invocationId: mintUuidV7(),
      runId: mintUuidV7(),
      token: SECRET_TOKEN_VALUE,
    });
    const result = parseFrame(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.prototype.hasOwnProperty.call(result.frame, 'token')).toBe(false);
      expect(JSON.stringify(result.frame)).not.toContain(SECRET_TOKEN_VALUE);
    }
  });
});
