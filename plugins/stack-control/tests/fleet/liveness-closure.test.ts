// specs/036-fleet-control-plane — T074 (RED), Phase 6 / US4 (trust what the
// fleet says, including about failure). Pairs with T082 impl
// (src/sidecar/liveness.ts).
//
// THE honesty invariant (FR-026, SC-004): a closed socket proves
// DISCONNECTION, not DEATH. The termination reason is UNKNOWN. The
// interpreter MUST NEVER emit a 'crashed'/'dead' verdict from a closed
// socket. `abnormally-disconnected` is a ConnectionStatus (data-model.md §
// Status — three axes), NOT an executionStatus value.
//
// This test pins the interpreter as a PURE FUNCTION of the close event:
// a `kill -9`-style abrupt close ⇒ `abnormally-disconnected` computed
// SYNCHRONOUSLY on the close event itself — no TTL, no poll interval, no
// clock read contributes latency (SC-004: "within milliseconds"). If the
// interpreter had to wait for a timer to decide, the verdict would be late
// by exactly the amount this test forbids.
//
// RED: src/sidecar/liveness.ts does not exist yet — the VALUE import below
// fails at module-load, which is the correct failing-first signal.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured). No `any`, no `as`, no `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import {
  interpretSocketClose,
  type CloseInterpretation,
  type SocketCloseObservation,
} from '../../src/sidecar/liveness.js';
import { isExecutionStatus } from '../../src/fleet/status.js';

// Verdicts that would be LIES if emitted from a mere socket closure — the
// interpreter must never produce any of these. A closed socket says the
// connection dropped; it says NOTHING about whether the process died.
const DEATH_VERDICTS: readonly string[] = [
  'crashed',
  'dead',
  'died',
  'failed',
  'killed',
  'terminated',
  'gone',
];

describe('socket-close liveness interpretation (T074, FR-026/SC-004 — closure proves disconnection, not death)', () => {
  it('an abrupt (kill -9-style) close with no preceding end-of-invocation ⇒ abnormally-disconnected', () => {
    const abrupt: SocketCloseObservation = { runId: 'run-1', sawEndOfInvocation: false };
    const verdict: CloseInterpretation = interpretSocketClose(abrupt);
    expect(verdict.connectionStatus).toBe('abnormally-disconnected');
  });

  it('the termination reason of an abrupt close is UNKNOWN — we do not know why the socket died', () => {
    const abrupt: SocketCloseObservation = { runId: 'run-1', sawEndOfInvocation: false };
    const verdict: CloseInterpretation = interpretSocketClose(abrupt);
    expect(verdict.terminationReason).toBe('unknown');
  });

  it('NEVER reports crashed/dead/failed — a dropped socket is not a dead process', () => {
    const abrupt: SocketCloseObservation = { runId: 'run-1', sawEndOfInvocation: false };
    const verdict: CloseInterpretation = interpretSocketClose(abrupt);
    expect(DEATH_VERDICTS).not.toContain(verdict.connectionStatus);
    // Structural proof: the abnormal-close verdict lives on the CONNECTION
    // axis, never the execution axis. If it were an executionStatus value,
    // a consumer could read "the connection dropped" as "the run failed".
    expect(isExecutionStatus(verdict.connectionStatus)).toBe(false);
  });

  it('is a PURE FUNCTION of the close event — no TTL/poll/clock contributes latency (SC-004)', () => {
    const abrupt: SocketCloseObservation = { runId: 'run-1', sawEndOfInvocation: false };

    // Synchronous: the verdict is available on the close event, not after a
    // timer resolves. A Promise here would mean the decision is deferred.
    const verdict = interpretSocketClose(abrupt);
    expect(verdict).not.toBeInstanceOf(Promise);

    // Arity is exactly the close observation — there is nowhere to inject a
    // clock or a TTL. The interpreter cannot depend on elapsed time.
    expect(interpretSocketClose.length).toBe(1);

    // Deterministic: same close event ⇒ same verdict, every call, with no
    // time having passed between them.
    const again = interpretSocketClose(abrupt);
    expect(again).toEqual(verdict);
  });

  it('a graceful close (preceded by end-of-invocation) is a plain disconnect, NOT abnormal', () => {
    // The contrast case that proves the interpreter is honest in both
    // directions: only a close WITHOUT a goodbye is abnormal. A clean
    // end-of-invocation followed by close is an ordinary disconnection.
    const graceful: SocketCloseObservation = { runId: 'run-1', sawEndOfInvocation: true };
    const verdict: CloseInterpretation = interpretSocketClose(graceful);
    expect(verdict.connectionStatus).toBe('disconnected');
    expect(verdict.connectionStatus).not.toBe('abnormally-disconnected');
    expect(DEATH_VERDICTS).not.toContain(verdict.connectionStatus);
  });
});
