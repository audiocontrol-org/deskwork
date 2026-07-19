// specs/036-fleet-control-plane — T018 (impl), pairs with T017's RED test.
//
// Status axes per data-model.md § Status — three axes, never collapsed
// (line ~71-81) and FR-029/FR-030 (spec.md ~220-221):
//
//   connectionStatus — is the sidecar's session attached
//   livenessStatus   — is the sidecar answering
//   executionStatus  — starting | running | paused | cancelling |
//                       cancelled | completed | failed
//
// FR-029: these MUST be separate axes; no single enum may carry more than
// one meaning. FR-030: the plane exposes them SEPARATELY and MUST NOT
// collapse them into one authoritative status. Deriving a display summary
// from the three axes is a CLIENT concern owned by the future
// `design:feature/fleet-dashboard` — deliberately NOT built here. This
// module's only job is to keep the three axes structurally independent and
// independently readable.
//
// `abnormally-disconnected` (FR-026) is a socket-closed-without-a-preceding
// end-of-invocation-event condition — it proves disconnection, not death.
// It lives on the CONNECTION axis, not the execution axis: losing the
// socket says nothing about whether the run itself is still starting,
// running, or has already reached a terminal outcome (a reconnect inside
// the bounded reconciliation window — T074/T076/T083, out of scope here —
// proves the run was never dead). Modeling it as an executionStatus value
// would be exactly the conflation FR-026/FR-029 forbid: "the connection
// dropped" is not "the run failed".
//
// SCOPE (per the task pairing): the three axis types + membership guards
// only. No registry, no event wiring, no reconciliation window, no
// FleetInstance projection (data-model.md § Fleet instance) — those are
// later units.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI).

/**
 * Is the sidecar's session attached to this run? Per data-model.md §
 * Status, `abnormally-disconnected` is a member of THIS axis (not
 * executionStatus) — see the module doc comment / FR-026 for why.
 */
export type ConnectionStatus = 'attached' | 'disconnected' | 'abnormally-disconnected';

/** Is the sidecar answering? Independent of whether a session is attached. */
export type LivenessStatus = 'live' | 'unresponsive';

/**
 * The run's own execution lifecycle. Deliberately does NOT include
 * `abnormally-disconnected` — see the module doc comment / FR-026.
 */
export type ExecutionStatus =
  | 'starting'
  | 'running'
  | 'paused'
  | 'cancelling'
  | 'cancelled'
  | 'completed'
  | 'failed';

/** Every `ConnectionStatus` value, in the order data-model.md lists them. */
export const CONNECTION_STATUS_VALUES: readonly ConnectionStatus[] = [
  'attached',
  'disconnected',
  'abnormally-disconnected',
];

/** Every `LivenessStatus` value, in the order data-model.md lists them. */
export const LIVENESS_STATUS_VALUES: readonly LivenessStatus[] = ['live', 'unresponsive'];

/** Every `ExecutionStatus` value, in the order data-model.md lists them. */
export const EXECUTION_STATUS_VALUES: readonly ExecutionStatus[] = [
  'starting',
  'running',
  'paused',
  'cancelling',
  'cancelled',
  'completed',
  'failed',
];

/**
 * Membership check over a readonly literal-union array, without a type
 * assertion. `T extends string` keeps the comparison type-checkable
 * (`candidate: T` vs `value: string` overlap via the `string` supertype) so
 * this needs no `as` cast.
 */
function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return values.some((candidate) => candidate === value);
}

/** Type guard: is `value` a member of the connection axis? */
export function isConnectionStatus(value: string): value is ConnectionStatus {
  return isOneOf(CONNECTION_STATUS_VALUES, value);
}

/** Type guard: is `value` a member of the liveness axis? */
export function isLivenessStatus(value: string): value is LivenessStatus {
  return isOneOf(LIVENESS_STATUS_VALUES, value);
}

/**
 * Type guard: is `value` a member of the execution axis? Per FR-026,
 * `abnormally-disconnected` always answers `false` here — it is not, and
 * must never become, an executionStatus value.
 */
export function isExecutionStatus(value: string): value is ExecutionStatus {
  return isOneOf(EXECUTION_STATUS_VALUES, value);
}

/**
 * The three status axes, carried side by side on one object — NOT
 * collapsed into a single authoritative field (FR-030). Each field is
 * independently readable and independently settable; nothing in this type
 * (or this module) derives one axis from another. Deriving a display
 * summary from these three fields is a CLIENT concern
 * (`design:feature/fleet-dashboard`), never this module's.
 */
export interface StatusAxes {
  readonly connectionStatus: ConnectionStatus;
  readonly livenessStatus: LivenessStatus;
  readonly executionStatus: ExecutionStatus;
}
