/**
 * specs/036-fleet-control-plane — T082, Phase 6 / US4 (trust what the fleet
 * says, including about failure). Pairs with the RED tests T074
 * (liveness-closure), T077 (uncommandable), and T075 (the honesty test).
 *
 * THE feature's PRIMARY NAMED RISK lives here: a fleet view that lies is worse
 * than no fleet view. The honesty invariant (FR-026, SC-004): a closed socket
 * proves DISCONNECTION, not DEATH. The termination reason is UNKNOWN. This
 * interpreter MUST NEVER emit a death/crashed verdict from a mere socket
 * closure — `abnormally-disconnected` is a ConnectionStatus (the connection
 * axis of status.ts), never an executionStatus value.
 *
 * The interpretation is a PURE, SYNCHRONOUS function of the close event
 * itself — no TTL, no poll interval, no clock read contributes latency
 * (SC-004: "within milliseconds"). If it had to wait for a timer to decide,
 * the verdict would be late by exactly the amount the design forbids. The
 * bounded reconciliation window that lets a run re-announce (and proves it was
 * never dead) lives in lifecycle.ts (T083) — a separate, time-driven concern.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI).
 */

import type { ConnectionStatus, StatusAxes } from '../fleet/status.js';

/**
 * Why the socket ended, as much as a socket closure can tell us — which is
 * very little. `graceful-end-of-invocation` is the ONLY reason we can name
 * with confidence, and only because it was preceded by an end-of-invocation
 * frame. Every other closure is `unknown`: we saw the connection drop; we did
 * NOT see why, and we MUST NOT invent a cause (FR-026).
 */
export type TerminationReason = 'unknown' | 'graceful-end-of-invocation';

/**
 * What we observed at the socket boundary. `sawEndOfInvocation === false` is
 * an abrupt / kill-9-style close (no goodbye frame preceded it);
 * `sawEndOfInvocation === true` is an ordinary close that followed a clean
 * end-of-invocation. This is the ENTIRE input — there is deliberately no
 * clock, TTL, or elapsed-time field to depend on.
 */
export interface SocketCloseObservation {
  readonly runId: string;
  readonly sawEndOfInvocation: boolean;
}

/**
 * The honest verdict for a socket closure: a CONNECTION-axis status plus the
 * reason (which is `unknown` whenever the close was abrupt). It carries no
 * execution-axis value — there is no path from "my socket closed" to "the run
 * failed".
 */
export interface CloseInterpretation {
  readonly connectionStatus: ConnectionStatus;
  readonly terminationReason: TerminationReason;
}

/**
 * Interpret a socket closure — PURE, SYNCHRONOUS, arity-1, with NO clock/TTL
 * parameter (SC-004). An abrupt close (no preceding end-of-invocation) is
 * `abnormally-disconnected` with reason `unknown`; a graceful close is a plain
 * `disconnected` with reason `graceful-end-of-invocation`. It NEVER returns a
 * death/crashed verdict: the connection dropping says nothing about whether
 * the process is still running (FR-026).
 */
export function interpretSocketClose(obs: SocketCloseObservation): CloseInterpretation {
  if (obs.sawEndOfInvocation) {
    return {
      connectionStatus: 'disconnected',
      terminationReason: 'graceful-end-of-invocation',
    };
  }
  return {
    connectionStatus: 'abnormally-disconnected',
    terminationReason: 'unknown',
  };
}

/**
 * The commandability verdict — can the operator act on this run RIGHT NOW?
 * Deliberately a DIFFERENT vocabulary from the three status axes: it excludes
 * `healthy` and `dead` by construction (FR-006). A run whose connection was
 * lost mid-execution is neither healthy (you'd wrongly think you could command
 * it) nor dead (it is still executing) — it is its own state,
 * `temporarily-uncommandable`.
 */
export type CommandabilityVerdict = 'commandable' | 'temporarily-uncommandable';

/**
 * Every `CommandabilityVerdict`. Named exhaustively so a consumer can assert
 * the vocabulary EXCLUDES 'healthy'/'dead'/'crashed' — a mid-run connection
 * loss cannot be coerced into either label (FR-006).
 */
export const COMMANDABILITY_VERDICTS: readonly CommandabilityVerdict[] = [
  'commandable',
  'temporarily-uncommandable',
];

/**
 * Derive commandability from the three status axes. A fully attached, live,
 * running run is `commandable`. Any other combination — most importantly a
 * connection lost while the run is still executing — is
 * `temporarily-uncommandable`, NEVER `healthy` (FR-006, local-socket-protocol
 * C1: "Reports as temporarily uncommandable, never healthy"). We can no longer
 * reach the run to command it; that is a commandability fact, not a death
 * verdict.
 */
export function interpretCommandability(axes: StatusAxes): CommandabilityVerdict {
  const attachedAndLive = axes.connectionStatus === 'attached' && axes.livenessStatus === 'live';
  const running = axes.executionStatus === 'running';
  if (attachedAndLive && running) {
    return 'commandable';
  }
  return 'temporarily-uncommandable';
}
