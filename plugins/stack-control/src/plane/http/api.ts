// specs/036-fleet-control-plane — T053 + T054 [US2] (impl), pairs with
// tests/fleet/api-snapshot.test.ts (T046), tests/fleet/api-deltas.test.ts
// (T047), and tests/fleet/api-axes.test.ts (T048).
//
// Projects src/plane/registry.ts's (T050) derived `FleetRegistry` onto the
// two client-facing shapes contracts/plane-client-api.md defines:
//
//   C2 — Snapshot, then deltas (FR-081):
//     - `fleetSnapshot(registry)`      → GET /v1/fleet          (T053)
//     - `computeFleetDeltas(prev,next)` → GET /v1/fleet/stream   (T053)
//   C5 — Per-run detail (FR-083):
//     - `perRunDetail(entry)`          → GET /v1/runs/{runId}    (T054)
//
// This module is deliberately BELOW the HTTP/SSE transport (no server.ts /
// ingest.ts wiring here — that is T051/T052/T101's concern). It pins the
// shape-level contract those routes must serve: pure, synchronous,
// transport-independent projections over `FleetEntry` / `FleetRegistry`.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
// under node16 resolution (no `@/` alias — this plugin has none).

import type { FleetCommandKind, FleetEntry, FleetRegistry, RunProgress, TimingsRecord } from '../registry.js';
import type { StatusAxes } from '../../fleet/status.js';
import type { AcceptCommandInput, CommandRecord, CommandStore } from '../commands/store.js';
import type { CommandDispatch, HeldCommand } from '../commands/dispatch.js';
import { dispatchFanOut } from '../commands/dispatch.js';

// ---------------------------------------------------------------------------
// C7 — History + timings (T101, GET /v1/runs/{runId}/history and
// GET /v1/runs/{runId}/timings). Implemented in history-api.ts (kept
// separate to hold this file under the project's 300-500 line file cap);
// re-exported here so every api.ts consumer keeps a single import surface.
// ---------------------------------------------------------------------------

export type {
  PhaseDuration,
  RunHistoryObjectKeyInput,
  RunHistoryRecord,
  RunHistoryResult,
  RunPhaseDurations,
  RunTimings,
} from './history-api.js';
export { runHistory, runHistoryObjectKey, runTimings } from './history-api.js';

// ---------------------------------------------------------------------------
// C2 — Snapshot (T053, GET /v1/fleet).
// ---------------------------------------------------------------------------

/**
 * The client-visible projection of one commandable run, as it appears in a
 * fleet snapshot. Structurally identical to `FleetEntry` (T050) — the
 * snapshot is a direct, order-preserving projection of the registry, not a
 * re-shaping — aliased under the API's own name so callers of this module
 * depend on the API contract's vocabulary, not the registry's internal type.
 */
export type FleetSnapshotEntry = FleetEntry;

/**
 * The full current fleet state (C2 "Initial: snapshot"). One entry per
 * commandable run, each exactly once (SC-003), in first-observed order
 * (the order `FleetRegistry.entries()` — T050 — already guarantees).
 */
export interface FleetSnapshot {
  readonly entries: readonly FleetSnapshotEntry[];
}

/**
 * Project a `FleetRegistry` into a `FleetSnapshot` — the whole current fleet
 * state in ONE call, no per-installation fan-out (SC-003). Synchronous: the
 * registry already holds everything in memory (C7 — live views generate
 * zero durable-store reads), so there is nothing to await here.
 */
export function fleetSnapshot(registry: FleetRegistry): FleetSnapshot {
  return { entries: registry.entries() };
}

// ---------------------------------------------------------------------------
// C2 — Deltas (T053, GET /v1/fleet/stream).
// ---------------------------------------------------------------------------

/**
 * The four-kind delta vocabulary C2 enumerates. A delta describes only WHAT
 * CHANGED — never a restatement of the whole fleet (FR-081: "a full registry
 * push per telemetry event is prohibited"). `command-updated` and
 * `store-health-changed` are part of this closed union for API-contract
 * completeness (C6 commands, § Store health — two hops); this module's own
 * `computeFleetDeltas` (a pure `FleetEntry[]` diff) only ever produces
 * `instance-upserted` / `instance-removed` — command lifecycle and store
 * health are sourced elsewhere (the command subsystem, T05x; the store
 * health poller) and multiplexed onto this same delta stream at the
 * transport layer (T101), not fabricated here.
 */
export type FleetDelta =
  | { readonly kind: 'instance-upserted'; readonly instance: FleetEntry }
  | { readonly kind: 'instance-removed'; readonly runId: string }
  | { readonly kind: 'command-updated'; readonly commandId: string; readonly status: string }
  | {
      readonly kind: 'store-health-changed';
      readonly hop: 'uplink' | 'archive';
      readonly status: string;
    };

/**
 * Deterministic delta ordering: upserts before removals before command
 * updates before store-health changes (mirrors C2's own listing order).
 * Exhaustive `never` switch (Constitution: the audit-barrage is stochastic
 * defense-in-depth; a closed union's completeness is the COMPILER's job,
 * never a heuristic's — see
 * .claude/rules/audit-barrage-is-stochastic-defense-in-depth.md). If
 * `FleetDelta` ever grows, drops, or renames a kind, this function's
 * `default` branch fails `tsc --noEmit` before any review — heuristic or
 * human — would get a chance to notice.
 */
function deltaKindOrder(kind: FleetDelta['kind']): number {
  switch (kind) {
    case 'instance-upserted':
      return 0;
    case 'instance-removed':
      return 1;
    case 'command-updated':
      return 2;
    case 'store-health-changed':
      return 3;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/**
 * Value-equality over two `FleetEntry` instances. `FleetEntry` (T050) is
 * plain, cycle-free, insertion-ordered data — always built through the same
 * `toEntry()` construction path — so `JSON.stringify` comparison is a
 * faithful, dependency-free structural-equality check (no deep-equal
 * library needed for this shape).
 */
function fleetEntriesEqual(a: FleetEntry, b: FleetEntry): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Diff two `FleetEntry` snapshots (e.g. successive `registry.entries()`
 * calls, one per inbound telemetry event) into the BOUNDED set of deltas
 * that changed (C2, FR-081). Pure and transport-independent: no HTTP/SSE
 * framing here (T101's concern) — only the shape-level diff those routes
 * must serve.
 *
 * - A run present in `next` but absent from — or changed since — `previous`
 *   yields exactly one `instance-upserted` delta naming only that run.
 * - A run present in `previous` but absent from `next` yields exactly one
 *   `instance-removed` delta naming only that run's id.
 * - An unchanged run yields NO delta — this is what keeps the payload
 *   bounded to what changed, never proportional to fleet size.
 */
export function computeFleetDeltas(
  previous: readonly FleetEntry[],
  next: readonly FleetEntry[],
): readonly FleetDelta[] {
  const previousByRunId = new Map(previous.map((entry) => [entry.runId, entry] as const));
  const nextRunIds = new Set(next.map((entry) => entry.runId));

  const deltas: FleetDelta[] = [];

  for (const entry of next) {
    const before = previousByRunId.get(entry.runId);
    if (before === undefined || !fleetEntriesEqual(before, entry)) {
      deltas.push({ kind: 'instance-upserted', instance: entry });
    }
  }

  for (const entry of previous) {
    if (!nextRunIds.has(entry.runId)) {
      deltas.push({ kind: 'instance-removed', runId: entry.runId });
    }
  }

  return deltas.sort((a, b) => deltaKindOrder(a.kind) - deltaKindOrder(b.kind));
}

// ---------------------------------------------------------------------------
// C5 — Per-run detail (T054, GET /v1/runs/{runId}).
// ---------------------------------------------------------------------------

/** Bare identity facet — the two ids that, together with the top-level
 * `runId`, uniquely place this run in the fleet. */
export interface PerRunOverview {
  readonly installationId: string;
  readonly invocationId: string;
}

/** Execution-progress facet: derived progress counters + the commands
 * currently offered (both already carried on `FleetEntry`, C6). */
export interface PerRunExecution {
  readonly progress: RunProgress;
  readonly availableActions: readonly FleetCommandKind[];
}

/** Timing-envelope facet: first/last observed telemetry for this run. */
export interface PerRunTimings {
  readonly firstObserved: TimingsRecord;
  readonly lastObserved: TimingsRecord;
}

/**
 * Per-run detail response (C5: "Overview, artifacts, execution, governance,
 * timings, reconciliation"). `status` carries the three axes SEPARATELY
 * (FR-029/030) — it is `entry.statusAxes` verbatim, so it has EXACTLY the
 * three axis fields and nothing else; this response never adds a collapsed
 * `overallStatus`/`summaryStatus`/`state`/`health`/`condition` field.
 *
 * `artifacts`, `governance`, and `reconciliation` are C5 facets this type
 * deliberately does NOT declare: `FleetEntry` (T050) carries no data for
 * them — they are sourced from bounded SNAPSHOT PAYLOADS (event.ts §
 * SnapshotPayload) once that pipeline lands, mirroring T050's own
 * documented omission of the `compass`/`model`/`git` Fleet-instance facets
 * for the identical no-fallback reason. Any artifact reference a future
 * producer of the `artifacts` facet surfaces here MUST first pass
 * `validateArtifactRef` (src/fleet/artifact.ts, T049, PT-009).
 */
export interface PerRunResponse {
  readonly runId: string;
  readonly status: StatusAxes;
  readonly overview: PerRunOverview;
  readonly execution: PerRunExecution;
  readonly timings: PerRunTimings;
}

/**
 * Project one `FleetEntry` into its per-run detail response (C5). Pure and
 * synchronous — everything this projection needs already lives on the
 * in-memory registry entry (C7).
 */
export function perRunDetail(entry: FleetEntry): PerRunResponse {
  return {
    runId: entry.runId,
    status: entry.statusAxes,
    overview: {
      installationId: entry.installationId,
      invocationId: entry.invocationId,
    },
    execution: {
      progress: entry.progress,
      availableActions: entry.availableActions,
    },
    timings: {
      firstObserved: entry.firstObserved,
      lastObserved: entry.lastObserved,
    },
  };
}

// ---------------------------------------------------------------------------
// C6 — Commands (T071): issue, status by commandId, fleet-wide issue.
//   - POST /v1/runs/{runId}/commands  → issueCommand
//   - GET  /v1/commands/{commandId}   → commandStatus
//   - POST /v1/fleet/commands         → issueFleetCommand
// ---------------------------------------------------------------------------
//
// The operator promise (plane-client-api.md C6, FR-059): "the operator can
// always tell what happened to a command they issued. 'Sent' is never
// reported as 'applied.'" These three functions are the data layer that
// promise rests on — pure and dependency-injected (a `CommandStore`, T069,
// and a `CommandDispatch`, T070, are passed in, never constructed here), so
// server.ts's issueRunCommand / commandStatus / issueFleetCommand handlers
// (T051) can call straight through without this module knowing anything
// about `node:http`, mirroring how fleetSnapshot/perRunDetail above stay
// below the transport layer.

/**
 * The result of issuing a single command (`POST /v1/runs/{runId}/commands`,
 * C6). `state` is pinned to the literal `'accepted'` — issuing a command can
 * NEVER report `applied` here; that would be exactly the honesty violation
 * FR-059 names ("sent" reported as "applied"). Reaching `applied` (or any
 * later state) is only ever observable afterward, through
 * {@link commandStatus}.
 */
export interface CommandIssueResult {
  readonly commandId: string;
  readonly state: 'accepted';
}

/**
 * Durably accept `input` (FR-056: durable-before-returned) and hold it for
 * delivery (C7). By the time this promise resolves, the `accepted` it
 * reports is not a lie a plane restart can erase — `store.accept()` already
 * fsyncs before resolving. This function never advances the command past
 * `accepted`; delivery, application, and every later transition are the
 * sidecar's and the dispatch layer's concern, observed later through
 * `commandStatus`.
 */
export async function issueCommand(
  store: CommandStore,
  dispatch: CommandDispatch,
  input: AcceptCommandInput,
): Promise<CommandIssueResult> {
  const { commandId, state } = await store.accept(input);
  const held: HeldCommand = {
    commandId,
    kind: input.kind,
    installationId: input.installationId,
    runId: input.runId,
    expiresAt: null,
  };
  dispatch.hold(held);
  return { commandId, state };
}

/**
 * The full queryable lifecycle state for one command (`GET
 * /v1/commands/{commandId}`, C6: "every command's full lifecycle is
 * queryable by commandId"). `found` is always present so a caller never has
 * to infer "not found" from `command`'s absence under a narrowed union — an
 * unknown `commandId` is a CLEAN, typed result, never a throw (a throwing
 * lookup would leak "unknown command" as a transport-layer 500 instead of
 * an honest, queryable not-found).
 */
export interface CommandStatusResult {
  readonly commandId: string;
  readonly found: boolean;
  readonly command: CommandRecord | undefined;
}

/**
 * Look up the durable record for `commandId` (C6). Synchronous: the durable
 * store's `get()` already resolves from its in-memory index (recovered from
 * disk at store construction, FR-056), so there is nothing to await here.
 */
export function commandStatus(store: CommandStore, commandId: string): CommandStatusResult {
  const record = store.get(commandId);
  return { commandId, found: record !== undefined, command: record };
}

/**
 * The result of a fleet-wide command issue (`POST /v1/fleet/commands`,
 * FR-062: "fan-out is never atomic"). `targets` / `accepted` / `unavailable`
 * partition every requested target so per-instance state is individually
 * observable — this type deliberately carries NO single collapsed
 * success/failure field, so a caller cannot construct an atomic verdict
 * from it even by mistake.
 */
export interface FleetCommandResult {
  readonly commandId: string;
  readonly targets: readonly string[];
  readonly accepted: readonly string[];
  readonly unavailable: readonly string[];
}

/**
 * Durably accept one fleet-wide command, then fan it out to `targets` via
 * {@link dispatchFanOut} (FR-062). One durable record backs the whole
 * fleet-wide action — `store.accept()` is called exactly once, matching
 * `AcceptCommandInput`'s single-installationId shape (the caller supplies
 * whatever `installationId` best names the fleet-wide scope of the action;
 * per-target identity lives in `targets`, not in the durable record).
 * `isReachable` is the injected reachability predicate the caller (server.ts,
 * backed by the live registry) supplies, so partitioning is testable without
 * a live sidecar fleet. Every reachable target is durably held for delivery
 * under the same `commandId`; an unreachable one is reported in
 * `unavailable` and held nowhere — never a thrown all-or-nothing error, even
 * when every target is unavailable (FR-062).
 */
export async function issueFleetCommand(
  store: CommandStore,
  dispatch: CommandDispatch,
  input: AcceptCommandInput,
  targets: readonly string[],
  isReachable: (target: string) => boolean,
): Promise<FleetCommandResult> {
  const { commandId } = await store.accept(input);
  const fanOut = dispatchFanOut({
    commandId,
    kind: input.kind,
    targets: [...targets],
    isReachable,
  });
  for (const target of fanOut.accepted) {
    dispatch.hold({
      commandId,
      kind: input.kind,
      installationId: target,
      runId: input.runId,
      expiresAt: null,
    });
  }
  return {
    commandId,
    targets: fanOut.targets,
    accepted: fanOut.accepted,
    unavailable: fanOut.unavailable,
  };
}
