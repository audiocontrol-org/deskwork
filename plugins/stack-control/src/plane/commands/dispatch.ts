// specs/036-fleet-control-plane — T070 + T073 (impl). This module is the
// PLANE-side command DELIVERY layer that sits over the durable store
// (store.ts): buffer / replay / expiry / fan-out (T070), plus the
// `config-push` compare-and-set application (T073) and the `reconcile`
// own-lifecycle state machine (FR-061). It pairs with the RED tests T058
// (command-blip), T063 (fanout), T065 (reconcile-lifecycle), and T066
// (config-push).
//
// The operator promises this surface exists for:
//   - C7 / SC-007: "The plane holds a command until delivered-and-acknowledged,
//     expired, or superseded, and replays unexpired commands on reconnect — so
//     a `cancel` survives a network blip." A held, unexpired, un-acknowledged
//     cancel is NEVER silently dropped on reconnect; that is the worst failure
//     the design names.
//   - FR-062: "Fan-out is never atomic — the response reports targets /
//     accepted / unavailable; per-instance state individually observable."
//   - FR-061: "`reconcile` has its own received → started → completed/failed
//     lifecycle; results linked by `commandId`. A single acknowledgement does
//     not represent it." — a distinct state machine, never conflated with the
//     generic command ack (command.ts).
//   - FR-060: "config-push — a newer revision supersedes an older un-applied
//     one; compare-and-set prevents lost updates." A stale (or equal-revision
//     racing) push is `superseded`, never silently applied over a newer one.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 resolution (no `@/` alias). No fallbacks / no
// silent defaults — illegal transitions and malformed payloads throw or
// return an explicit rejected/superseded outcome (fail loud).

import type { CommandKind, CommandState } from '../../fleet/command.js';
import type { CommandStore } from './store.js';

// ───────────────────────────────────────────────────────────────────────────
// T070 — buffer / replay / expiry (C7, SC-007)
// ───────────────────────────────────────────────────────────────────────────

/**
 * A command held by the plane for delivery to a target installation. Held
 * until delivered-and-acknowledged, expired, or superseded (C7). `expiresAt`
 * is an ISO-8601 instant, or null for a command that never expires.
 */
export interface HeldCommand {
  readonly commandId: string;
  readonly kind: CommandKind;
  readonly installationId: string;
  readonly runId: string | null;
  readonly expiresAt: string | null;
}

/**
 * The runtime delivery buffer over a durable {@link CommandStore}. Durability
 * ("was this command ever durably accepted") belongs to the store; delivery
 * state ("who still needs this command delivered right now") belongs here.
 */
export interface CommandDispatch {
  /**
   * Register a durably-accepted command for delivery. Held until
   * delivered+acknowledged, expired, or superseded. Throws if the command is
   * not present in the durable store — a delivery buffer must not hold a
   * command the store never accepted (fail loud, no phantom holds).
   */
  hold(command: HeldCommand): void;
  /** The sidecar for `installationId` disconnected before delivery completed. */
  onDisconnect(installationId: string): void;
  /**
   * The sidecar for `installationId` (re)connected. Returns the commands that
   * MUST be (re)delivered on this connection: held, unexpired, and not yet
   * acknowledged as terminal. NEVER silently drops a still-live hold.
   */
  replayOnReconnect(installationId: string): readonly HeldCommand[];
  /**
   * The sidecar acknowledged a command's delivery/application state (telemetry
   * per C7). A command acknowledged as a TERMINAL state (`applied`, `rejected`,
   * `failed`, `expired`, `superseded`) is no longer held and must not be
   * replayed on a later reconnect.
   */
  acknowledge(commandId: string, state: CommandState): void;
}

/** The command states that end a hold (no further delivery needed). */
const TERMINAL_ACK_STATES: readonly CommandState[] = [
  'applied',
  'rejected',
  'failed',
  'expired',
  'superseded',
];

function isTerminalAck(state: CommandState): boolean {
  return TERMINAL_ACK_STATES.includes(state);
}

/** True when `expiresAt` is a past instant relative to `now` (expired). */
function isExpired(expiresAt: string | null, now: number): boolean {
  if (expiresAt === null) {
    return false;
  }
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) {
    throw new Error(
      `createCommandDispatch: HeldCommand.expiresAt '${expiresAt}' is not a valid ISO-8601 instant.`,
    );
  }
  return at <= now;
}

/**
 * Build a command dispatch buffer over a durable store. `hold` verifies the
 * command is durably accepted before buffering it, tying delivery to the
 * store's durability guarantee (a hold with no durable record would be a
 * phantom the operator could never account for).
 */
export function createCommandDispatch(store: CommandStore): CommandDispatch {
  /** commandId → held command, while it still needs delivery. */
  const held = new Map<string, HeldCommand>();
  /** commandId → terminal ack state, once acknowledged terminally. */
  const terminallyAcknowledged = new Map<string, CommandState>();
  /** installationId → connected flag (false after a disconnect). */
  const connected = new Map<string, boolean>();

  return {
    hold(command: HeldCommand): void {
      if (store.get(command.commandId) === undefined) {
        throw new Error(
          `createCommandDispatch.hold: command '${command.commandId}' is not durably accepted; ` +
            'a delivery hold requires a durable store record (FR-056).',
        );
      }
      held.set(command.commandId, command);
    },
    onDisconnect(installationId: string): void {
      connected.set(installationId, false);
    },
    replayOnReconnect(installationId: string): readonly HeldCommand[] {
      connected.set(installationId, true);
      const now = Date.now();
      const toReplay: HeldCommand[] = [];
      for (const command of held.values()) {
        if (command.installationId !== installationId) {
          continue;
        }
        if (terminallyAcknowledged.has(command.commandId)) {
          continue;
        }
        if (isExpired(command.expiresAt, now)) {
          continue;
        }
        toReplay.push(command);
      }
      return toReplay;
    },
    acknowledge(commandId: string, state: CommandState): void {
      if (isTerminalAck(state)) {
        terminallyAcknowledged.set(commandId, state);
        held.delete(commandId);
      }
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// T070 — fan-out (FR-062: never atomic)
// ───────────────────────────────────────────────────────────────────────────

/**
 * The result of fanning one command out to N targets (FR-062). Never a single
 * atomic pass/fail: `accepted` and `unavailable` partition `targets` so
 * per-instance state is individually observable.
 */
export interface FanOutResult {
  targets: string[];
  accepted: string[];
  unavailable: string[];
}

/**
 * Fan a command out to `targets`, partitioning them by reachability. Reachable
 * targets land in `accepted`; unreachable ones in `unavailable`. Even total
 * unavailability returns a structured partition — it NEVER throws an
 * all-or-nothing error (FR-062). `isReachable` is the injected registry
 * reachability predicate (the boundary is injected so partitioning is testable
 * without a live sidecar fleet).
 */
export function dispatchFanOut(params: {
  commandId: string;
  kind: CommandKind;
  targets: string[];
  isReachable: (target: string) => boolean;
}): FanOutResult {
  const { targets, isReachable } = params;
  const accepted: string[] = [];
  const unavailable: string[] = [];
  for (const target of targets) {
    if (isReachable(target)) {
      accepted.push(target);
    } else {
      unavailable.push(target);
    }
  }
  return { targets: [...targets], accepted, unavailable };
}

// ───────────────────────────────────────────────────────────────────────────
// T070 — reconcile own lifecycle (FR-061)
// ───────────────────────────────────────────────────────────────────────────

/**
 * The `reconcile` command's own lifecycle (FR-061), DISTINCT from the generic
 * command ack (command.ts). Reaching the generic `applied` ack does not imply
 * the reconcile work completed — a single ack does not represent it.
 */
export type ReconcileLifecycleState = 'received' | 'started' | 'completed' | 'failed';

/**
 * A reconcile lifecycle result, linked to its originating command by
 * `commandId` (stable across every advance).
 */
export interface ReconcileResult {
  commandId: string;
  state: ReconcileLifecycleState;
}

/** Legal reconcile advances. Terminal states (`completed`, `failed`) map to []. */
const RECONCILE_TRANSITIONS: Readonly<Record<ReconcileLifecycleState, readonly ReconcileLifecycleState[]>> = {
  received: ['started'],
  started: ['completed', 'failed'],
  completed: [],
  failed: [],
};

/**
 * Begin a reconcile lifecycle for `commandId` in the initial `received` state
 * (FR-061). Results linked by `commandId`.
 */
export function startReconcileLifecycle(commandId: string): ReconcileResult {
  if (typeof commandId !== 'string' || commandId.length === 0) {
    throw new Error('startReconcileLifecycle: commandId must be a non-empty string.');
  }
  return { commandId, state: 'received' };
}

/**
 * Advance a reconcile lifecycle by one legal step (received → started →
 * completed|failed). Throws on an illegal advance — a skipped intermediate
 * state (a single ack does not represent the lifecycle, FR-061) or any move
 * out of a terminal state. Preserves `commandId` (results stay linked).
 */
export function advanceReconcileLifecycle(
  result: ReconcileResult,
  next: ReconcileLifecycleState,
): ReconcileResult {
  const legal = RECONCILE_TRANSITIONS[result.state];
  if (!legal.includes(next)) {
    const description =
      legal.length === 0
        ? `'${result.state}' is a terminal reconcile state with no outgoing transitions`
        : `legal advances from '${result.state}' are: ${legal.join(', ')}`;
    throw new Error(
      `advanceReconcileLifecycle: illegal advance to '${next}' from '${result.state}' (${description}).`,
    );
  }
  return { commandId: result.commandId, state: next };
}

// ───────────────────────────────────────────────────────────────────────────
// T073 — config-push application with compare-and-set (FR-060)
// ───────────────────────────────────────────────────────────────────────────

/**
 * A schema-versioned config-push payload (FR-060). `revision` drives the
 * compare-and-set supersession check; `config` is validated against an
 * allowed-key set before being applied.
 */
export interface ConfigPushPayload {
  schemaVersion: number;
  revision: number;
  config: Record<string, unknown>;
}

/** The currently persisted config-push state the caller hands in. */
export interface ConfigPushState {
  revision: number;
  config: Record<string, unknown>;
}

/**
 * The outcome of applying a config-push:
 *  - `applied`   — valid and newer; `state` is what the caller persists.
 *  - `rejected`  — malformed / bad schema version / unknown key; `reason` says why.
 *  - `superseded`— revision not strictly newer than persisted; `currentRevision`
 *                  is the revision that wins (compare-and-set, prevents lost updates).
 */
export type ConfigPushApplyResult =
  | { outcome: 'applied'; state: ConfigPushState }
  | { outcome: 'rejected'; reason: string }
  | { outcome: 'superseded'; currentRevision: number };

/**
 * Apply a config-push against the currently persisted state via compare-and-set
 * (FR-060). Validation order: schema version present + positive integer →
 * config well-formed → every key within `allowedKeys`. Then compare-and-set:
 * `payload.revision > (current?.revision ?? -1)` ⇒ applied; otherwise
 * superseded (an equal-revision racing push is superseded, NEVER silently
 * re-applied). A rejected/superseded path never mutates `current`.
 */
export function applyConfigPush(
  payload: ConfigPushPayload,
  current: ConfigPushState | undefined,
  allowedKeys: readonly string[],
): ConfigPushApplyResult {
  const schemaVersion: unknown = payload.schemaVersion;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion <= 0) {
    return {
      outcome: 'rejected',
      reason: `config-push rejected: schemaVersion must be a positive integer, got ${describe(schemaVersion)}.`,
    };
  }

  const revision: unknown = payload.revision;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) {
    return {
      outcome: 'rejected',
      reason: `config-push rejected: revision must be a non-negative integer, got ${describe(revision)}.`,
    };
  }

  const config: unknown = payload.config;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return {
      outcome: 'rejected',
      reason: `config-push rejected: config must be an object, got ${describe(config)}.`,
    };
  }

  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) {
      return {
        outcome: 'rejected',
        reason: `config-push rejected: key '${key}' is outside the allowed-key set (${allowedKeys.join(', ')}).`,
      };
    }
  }

  const currentRevision = current?.revision ?? -1;
  if (revision <= currentRevision) {
    return { outcome: 'superseded', currentRevision };
  }

  return {
    outcome: 'applied',
    state: { revision, config: { ...config } },
  };
}

/** Compact, safe description of an unexpected value for a rejection reason. */
function describe(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'object') {
    return Array.isArray(value) ? 'an array' : 'an object';
  }
  return `${typeof value} ${JSON.stringify(value)}`;
}
