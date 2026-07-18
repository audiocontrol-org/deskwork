// specs/036-fleet-control-plane — T067 (impl), pairs with the RED tests
// T056 (command-machine), T059 (command-expiry), T060 (command-vs-cursor),
// T062 (command-idempotence), T064 (pause-cooperative). This module is THE
// COMMAND STATE MACHINE and the canonical command-kind union.
//
// The operator promise this surface exists for (FR-059, data-model.md §
// Command): "The operator can always tell what happened to a command they
// issued. 'Sent' is never reported as 'applied.'" The machine keeps every
// pre-applied waiting state (`delivered`, `received`) observably distinct from
// the applied terminal, so a cooperative pause that reached the run but has not
// yet taken effect never masquerades as done.
//
// State machine (data-model.md § Command → State machine, FR-050):
//
//                  ┌──────────────► rejected   (terminal)
//                  │
//  accepted ──► delivered ──► received ──► applied   (terminal)
//     │  │          │             │
//     │  │          │             └──────► failed    (terminal)
//     │  │          │
//     │  │          └─────────────────────► expired   (terminal)
//     │  └────────────────────────────────► expired   (terminal, never-delivered TTL)
//     └───────────────────────────────────► superseded (terminal)
//
// Terminal states (no transition out): applied, rejected, failed, expired,
// superseded. `accepted`, `delivered`, `received` are the live states.
//
// Idempotence (FR-054) is enforced STRUCTURALLY by the terminal guard: a
// re-delivered already-applied command cannot re-transition — the terminal
// state has no outgoing edge, so any event throws. At-least-once delivery
// (replay on reconnect, C7) is therefore harmless.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 resolution (no `@/` alias — this plugin has none).
// No fallbacks / no silent defaults — an illegal transition throws (fail loud).

/**
 * The canonical command-kind union (C6, FR-050). This is THE definition;
 * `src/plane/registry.ts` re-exports it as `FleetCommandKind`.
 *
 * - `pause` / `resume` — cooperative run control (data-model.md § Command).
 * - `cancel` — cooperative, task-boundary scoped (PT-011).
 * - `config-push` — carries a `revision`; a newer revision supersedes an
 *   older un-applied one (FR-060).
 * - `reconcile` — its own long-running lifecycle, results linked by
 *   `commandId` (FR-061).
 */
export type CommandKind = 'pause' | 'resume' | 'cancel' | 'config-push' | 'reconcile';

/**
 * The lifecycle states a command occupies (data-model.md § Command → State
 * machine). `accepted` / `delivered` / `received` are live (further
 * transitions possible); `applied` / `rejected` / `failed` / `expired` /
 * `superseded` are terminal (no transition out — the idempotence guard).
 */
export type CommandState =
  | 'accepted'
  | 'delivered'
  | 'received'
  | 'applied'
  | 'rejected'
  | 'failed'
  | 'expired'
  | 'superseded';

/**
 * The events that drive a command transition. Each event is legal from at
 * most one state (data-model.md § Command → State machine); applying an
 * event from any other state throws.
 */
export type CommandEvent =
  | 'deliver'
  | 'receive'
  | 'apply'
  | 'reject'
  | 'fail'
  | 'expire'
  | 'supersede';

/**
 * A command issued against a run (C6, FR-050). Minimal by contract — carries
 * identity and kind; `config-push` additionally carries the `revision` the
 * compare-and-set supersession rule (FR-060) reads. Richer per-command payload
 * (reconcile lifecycle linkage, etc.) is the concern of the supersession /
 * dispatch modules (later tasks), not this state-machine core.
 */
export interface Command {
  readonly commandId: string;
  readonly kind: CommandKind;
  readonly revision?: number;
  /**
   * The command's current lifecycle state, when known to the caller. Optional
   * because the state-machine core (`nextCommandState`) is stateless and most
   * command *values* carry only identity + kind; supersession (FR-057), which
   * is scoped to a still-*un-applied* command, reads it when present. Absent
   * means "state unknown here — treat as un-applied for supersession."
   */
  readonly state?: CommandState;
}

/**
 * The transition table: `TRANSITIONS[state][event]` is the resulting state, or
 * `undefined` when the event is illegal from that state. Terminal states map
 * to an empty record — every event out of them is illegal (the idempotence
 * guard, FR-054). Declared as a total `Record<CommandState, …>` so adding a
 * new `CommandState` value without declaring its outgoing edges is a compile
 * error here, not a silent gap.
 */
const TRANSITIONS: Readonly<Record<CommandState, Partial<Record<CommandEvent, CommandState>>>> = {
  accepted: {
    deliver: 'delivered',
    reject: 'rejected',
    supersede: 'superseded',
    // A held command can expire while still ACCEPTED — never delivered (its TTL
    // elapsed before any sidecar reconnect). Expiry is a visible terminal state
    // for that never-delivered case too, not silent loss (FR-055,
    // AUDIT-20260718-23).
    expire: 'expired',
  },
  delivered: {
    receive: 'received',
    fail: 'failed',
    expire: 'expired',
  },
  received: {
    apply: 'applied',
  },
  // Terminal — no outgoing edges. Any event throws (idempotence guard).
  applied: {},
  rejected: {},
  failed: {},
  expired: {},
  superseded: {},
};

/**
 * Advance the command state machine by one event, or throw a descriptive error
 * if the transition is illegal (FR-050). Illegal covers: any event out of a
 * terminal state (the idempotence guard, FR-054), an event that skips an
 * intermediate state (e.g. `accepted` --apply-->), and an event that does not
 * apply to the current live state. Never returns a silently-defaulted state —
 * a caller relies on this throwing so a "sent" command is never reported as
 * "applied" (FR-059).
 */
export function nextCommandState(current: CommandState, event: CommandEvent): CommandState {
  const outgoing = TRANSITIONS[current];
  const next = outgoing[event];
  if (next === undefined) {
    const legal = Object.keys(outgoing);
    const legalDescription =
      legal.length === 0
        ? `'${current}' is a terminal state with no outgoing transitions`
        : `legal events from '${current}' are: ${legal.join(', ')}`;
    throw new Error(
      `nextCommandState: illegal transition — event '${event}' is not permitted from ` +
        `state '${current}' (${legalDescription}).`,
    );
  }
  return next;
}

/**
 * True when `state` is terminal — no outgoing transition exists (`applied`,
 * `rejected`, `failed`, `expired`, `superseded`). Derived from the same
 * {@link TRANSITIONS} table the machine advances over, so terminality is
 * defined in exactly one place (a terminal state is one whose outgoing-edge
 * record is empty), never re-listed and drifting.
 */
export function isTerminalCommandState(state: CommandState): boolean {
  return Object.keys(TRANSITIONS[state]).length === 0;
}

/**
 * Observe a (re)delivery/(re)application of a command idempotently (FR-054 —
 * "delivery is at-least-once"). Unlike {@link nextCommandState}, replaying an
 * event onto an ALREADY-TERMINAL command is HARMLESS: it returns the existing
 * terminal state unchanged — no state bounce, no side effect, and NO throw.
 * This is the seam the at-least-once replay path (C7 "replays unexpired
 * commands on reconnect") relies on: a sidecar that receives the same command
 * twice observes the same settled state, not a false command failure.
 *
 * From a LIVE (non-terminal) state the event is still validated by
 * {@link nextCommandState}, so a genuinely illegal *live* transition (e.g.
 * `accepted` --apply--> skipping `delivered`/`received`) still throws — that is
 * a real protocol error, not a benign replay.
 */
export function observeCommandReplay(current: CommandState, event: CommandEvent): CommandState {
  if (isTerminalCommandState(current)) {
    return current;
  }
  return nextCommandState(current, event);
}

/**
 * A `pause` command (data-model.md § Command, PT-011). Cooperative and
 * task-boundary scoped: the run observes it at its next boundary, so its
 * `received` (delivered to the run, waiting) state is observably distinct from
 * `applied` (the run actually paused) — the honest-not-silent guarantee
 * (FR-059).
 */
export interface PauseCommand extends Command {
  readonly kind: 'pause';
}

/**
 * Build a `pause` command with the given id. The command begins its lifecycle
 * at `accepted` (recorded durably by the plane before it is returned, FR-056);
 * this factory carries only identity + kind — the state lives with the
 * durable command record (a later task), not on the command value.
 */
export function buildPauseCommand(commandId: string): PauseCommand {
  if (typeof commandId !== 'string' || commandId.length === 0) {
    throw new Error(
      `buildPauseCommand: commandId must be a non-empty string, got ${
        commandId === null ? 'null' : typeof commandId
      }.`,
    );
  }
  return { commandId, kind: 'pause' };
}
