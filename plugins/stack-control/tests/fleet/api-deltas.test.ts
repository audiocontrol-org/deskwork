// specs/036-fleet-control-plane — T047 (RED), pairs with T053 impl (over
// T050's registry, src/plane/registry.ts).
//
// THE CONTRACT (contracts/plane-client-api.md C2 "Snapshot, then deltas",
// FR-081, data-model.md § Event → Snapshot / § Fleet instance):
//
//   | Step    | Shape                                                    |
//   |---------|-----------------------------------------------------------|
//   | Initial | **snapshot** of current fleet state                      |
//   | Live    | **deltas**: instance upserted / instance removed /       |
//   |         | command updated / store health changed                    |
//
//   "A full registry push per telemetry event is PROHIBITED. Deltas
//   describe only what changed." (C2, verbatim.) Test obligation #2 in the
//   same contract file states it as the acceptance shape this file pins:
//   "Progress arrives as a delta; no full registry push per event."
//
// SEAM CHOSEN (per the dispatch note: "choose the seam matching the
// contract and state it"): this test targets a PURE, HTTP-transport-
// independent diffing function —
//
//     computeFleetDeltas(previous: readonly FleetEntry[], next: readonly
//     FleetEntry[]): readonly FleetDelta[]
//
// — exported from src/plane/http/api.ts (T053), operating over
// src/plane/registry.ts's `buildRegistry(events).entries()` (T050,
// confirmed shape: tests/fleet/registry.test.ts already pins
// `buildRegistry(events: ClassifiedEvent[]): FleetRegistry` with
// `.entries(): FleetEntry[]`). This is deliberately BELOW the SSE
// transport (server.ts/T051, ingest.ts/T052, the `GET /v1/fleet/stream`
// wire framing) — the same layering discipline transport.test.ts uses for
// SseTransport (below SSE framing) and event.test.ts uses for envelope
// construction (below the HTTP route). The wire-level SSE framing of
// `FleetDelta` onto `GET /v1/fleet/stream` is T053/T101's concern; THIS
// file pins the shape-level contract those routes must serve: given a
// before/after registry snapshot, the produced delta set is BOUNDED to
// what changed, never the whole registry restated.
//
// IMPORT-PATH DEVIATION FROM THE DISPATCH NOTE (documented, not silent):
// the dispatch note said "imports the seam from `@/plane/...`" — but this
// plugin has NO `@/` path alias configured (tsconfig.json has no `paths`;
// vitest.config.ts has no `resolve.alias`), and every sibling fleet test
// (event.test.ts, registry.test.ts, transport.test.ts,
// _machine-state-harness.ts) explicitly documents + uses relative `.js`
// imports under node16 resolution instead. Using `@/plane/...` here would
// make this test fail FOREVER (wrong reason — unresolved alias) even after
// T050/T053 land correctly per the repo's own convention. This file
// follows the repo convention instead, so it is RED now for the true
// reason (the modules don't exist yet) and flips GREEN when T050/T053 land
// using the SAME relative-import shape every other module in this feature
// uses.
//
// Repo convention: relative `.js` imports under node16 resolution (no
// `@/` alias). Real fixtures, no mocks (.claude/rules/testing.md). Machine-
// state redirect harness (T009) — every fleet test uses it, per its own
// header comment, even though `buildRegistry`/`computeFleetDeltas` are
// pure functions that never touch identity storage: the harness's
// import-time poison + tripwire assertion is the safety net that makes an
// accidental future touch of $HOME fail loud instead of silently leaking.

import { afterEach, describe, expect, it } from 'vitest';
import { useMachineStateStore, assertTripwireEmpty } from './_machine-state-harness.js';
import type { EventEnvelope } from '../../src/fleet/types.js';
import { mintInstallationId, mintUuidV7 } from '../../src/fleet/types.js';
// The registry module (T050 — confirmed shape via tests/fleet/registry.test.ts,
// itself still RED as of this writing): will not exist until T050 lands.
import type { FleetEntry } from '../../src/plane/registry.js';
import { buildRegistry } from '../../src/plane/registry.js';
// The api module (T053): will not exist until T053 lands. This is the
// delta-producing seam this test pins.
import type { FleetDelta } from '../../src/plane/http/api.js';
import { computeFleetDeltas } from '../../src/plane/http/api.js';

/** Mirrors registry.test.ts's local test double — a classified event, the
 * shape the plane's event processor produces after event.ts wraps raw
 * telemetry and classification.ts tags it (data-model.md § Event →
 * Envelope). Duplicated here rather than imported: registry.test.ts's
 * `ClassifiedEvent` is a private, unexported test-local type. */
interface ClassifiedEvent {
  readonly envelope: EventEnvelope;
  readonly classification: 'live-only' | 'aggregated' | 'durable';
  readonly type: string;
}

function mkEvent(
  installationId: string,
  invocationId: string,
  runId: string | null,
  type: string,
  classification: 'live-only' | 'aggregated' | 'durable',
  invocationSequence: number,
): ClassifiedEvent {
  const envelope: EventEnvelope = {
    eventId: mintUuidV7(),
    installationId,
    invocationId,
    runId,
    installationSequence: invocationSequence,
    invocationSequence,
    schemaVersion: 1,
    type,
    wallClock: new Date().toISOString(),
    monotonicOffsetMs: Date.now(),
    classification,
  };
  return { envelope, classification, type };
}

/** Builds a `run.started` + N `run.progress` event stream for one
 * commandable run, returning the events AND the ids used, so a test can
 * grow the stream one progress tick at a time. */
function startedRun(installationId: string): {
  invocationId: string;
  runId: string;
  events: ClassifiedEvent[];
} {
  const invocationId = mintUuidV7();
  const runId = mintUuidV7();
  return {
    invocationId,
    runId,
    events: [mkEvent(installationId, invocationId, runId, 'run.started', 'durable', 1)],
  };
}

/** Compile-time-only vocabulary pin (never a runtime branch in production
 * code): if src/plane/http/api.ts's `FleetDelta` union ever drops or
 * renames one of the four kinds C2 enumerates, this switch stops
 * exhausting the union and `tsc --noEmit` fails — catching drift the
 * runtime assertions below cannot see (mirrors the `never`-exhaustiveness
 * idiom; the audit-barrage-is-stochastic rule places this kind of
 * decidable, closed-union check on the compiler, not a heuristic). */
function pinDeltaKindVocabulary(delta: FleetDelta): string {
  switch (delta.kind) {
    case 'instance-upserted':
      return delta.kind;
    case 'instance-removed':
      return delta.kind;
    case 'command-updated':
      return delta.kind;
    case 'store-health-changed':
      return delta.kind;
    default: {
      const exhaustive: never = delta;
      return exhaustive;
    }
  }
}

describe('computeFleetDeltas — progress arrives as a delta, never a full registry re-push (T047, C2/FR-081)', () => {
  const store = useMachineStateStore();

  afterEach(() => {
    assertTripwireEmpty();
  });

  it('N subsequent telemetry events after the initial snapshot yield exactly N bounded deltas, each naming only the run that event touched', () => {
    const installationId = mintInstallationId();
    const run1 = startedRun(installationId);
    const run2 = startedRun(installationId);
    const run3 = startedRun(installationId);

    // Initial snapshot (C2 "Initial: snapshot") — all three commandable
    // runs established up front, exactly like the plane's GET /v1/fleet.
    let events: ClassifiedEvent[] = [...run1.events, ...run2.events, ...run3.events];
    let previousEntries: readonly FleetEntry[] = buildRegistry(events).entries();
    expect(previousEntries).toHaveLength(3);

    // Live phase (C2 "Live: deltas") — three SEPARATE subsequent telemetry
    // events, one progress tick per run, applied and diffed ONE AT A TIME
    // (never batched), exactly mirroring how the plane would react to each
    // inbound telemetry POST individually.
    const touchedRuns = [run1, run2, run3];
    const collectedDeltas: FleetDelta[][] = [];

    touchedRuns.forEach((run, index) => {
      events = [
        ...events,
        mkEvent(installationId, run.invocationId, run.runId, 'run.progress', 'aggregated', 2 + index),
      ];
      const nextEntries = buildRegistry(events).entries();

      const deltas = computeFleetDeltas(previousEntries, nextEntries);
      collectedDeltas.push([...deltas]);

      previousEntries = nextEntries;
    });

    // N=3 telemetry events ⇒ N=3 delta-computation results (one per event,
    // never batched or deferred to a single end-of-stream diff).
    expect(collectedDeltas).toHaveLength(3);

    collectedDeltas.forEach((deltas, index) => {
      const touchedRunId = touchedRuns[index]?.runId;
      // Each event is BOUNDED to a single delta — never "one entry per
      // fleet member" (which would be a disguised full registry push: 3
      // instances restated instead of the 1 that actually changed).
      expect(deltas).toHaveLength(1);
      const delta = deltas[0];
      if (delta === undefined) {
        throw new Error('expected exactly one delta');
      }
      expect(delta.kind).toBe('instance-upserted');
      if (delta.kind !== 'instance-upserted') {
        throw new Error(`expected instance-upserted, got ${delta.kind}`);
      }
      // Names only the ONE instance that changed — never the other two
      // untouched runs in the same fleet.
      expect(delta.instance.runId).toBe(touchedRunId);
      // Structurally NOT a snapshot: a delta never carries a bulk
      // fleet-wide field alongside the single changed instance.
      expect(delta).not.toHaveProperty('entries');
      expect(delta).not.toHaveProperty('instances');
    });
  });

  it('a delta stays bounded to the ONE changed instance regardless of total fleet size — never scales with fleet size the way a full registry push would', () => {
    const installationId = mintInstallationId();

    function buildFleetOfSize(size: number): {
      events: ClassifiedEvent[];
      runs: Array<{ invocationId: string; runId: string }>;
    } {
      const runs = Array.from({ length: size }, () => startedRun(installationId));
      const events = runs.flatMap((run) => run.events);
      return { events, runs: runs.map(({ invocationId, runId }) => ({ invocationId, runId })) };
    }

    function deltaAndSnapshotSizesAfterOneProgressTick(fleetSize: number): {
      deltaJsonLength: number;
      fullSnapshotJsonLength: number;
      deltaCount: number;
    } {
      const { events, runs } = buildFleetOfSize(fleetSize);
      const previousEntries = buildRegistry(events).entries();
      const targetRun = runs[0];
      if (targetRun === undefined) {
        throw new Error('expected at least one run in the fixture fleet');
      }

      const nextEvents = [
        ...events,
        mkEvent(installationId, targetRun.invocationId, targetRun.runId, 'run.progress', 'aggregated', 2),
      ];
      const nextEntries = buildRegistry(nextEvents).entries();

      const deltas = computeFleetDeltas(previousEntries, nextEntries);
      return {
        deltaJsonLength: JSON.stringify(deltas).length,
        fullSnapshotJsonLength: JSON.stringify(nextEntries).length,
        deltaCount: deltas.length,
      };
    }

    const small = deltaAndSnapshotSizesAfterOneProgressTick(5);
    const large = deltaAndSnapshotSizesAfterOneProgressTick(25);

    // Bounded: exactly one delta regardless of fleet size.
    expect(small.deltaCount).toBe(1);
    expect(large.deltaCount).toBe(1);

    // The full-registry snapshot payload grows with fleet size (5 → 25
    // members)...
    expect(large.fullSnapshotJsonLength).toBeGreaterThan(small.fullSnapshotJsonLength * 2);

    // ...but the DELTA payload does not — proving the delta is not a
    // disguised full-registry push whose size tracks fleet size. A delta
    // describing 1 of 25 instances stays roughly the same size as a delta
    // describing 1 of 5 (allow slack for id-length variance only, never a
    // fleet-size-proportional jump).
    expect(large.deltaJsonLength).toBeLessThan(small.deltaJsonLength * 2);
    // And concretely: the delta is always far smaller than the full
    // snapshot it was derived from — the direct negation of "full registry
    // push per telemetry event" (C2).
    expect(large.deltaJsonLength).toBeLessThan(large.fullSnapshotJsonLength / 5);
  });

  it('a run present in the previous snapshot but absent from the next yields an instance-removed delta naming only that run — never a re-sent snapshot', () => {
    const installationId = mintInstallationId();
    const staying = startedRun(installationId);
    const leaving = startedRun(installationId);

    const previousEntries = buildRegistry([...staying.events, ...leaving.events]).entries();
    expect(previousEntries).toHaveLength(2);

    // "leaving" drops out of the next window entirely (the registry no
    // longer carries it) while "staying" is unchanged.
    const nextEntries = buildRegistry([...staying.events]).entries();
    expect(nextEntries).toHaveLength(1);

    const deltas = computeFleetDeltas(previousEntries, nextEntries);
    expect(deltas).toHaveLength(1);
    const delta = deltas[0];
    if (delta === undefined) {
      throw new Error('expected exactly one delta');
    }
    expect(delta.kind).toBe('instance-removed');
    if (delta.kind !== 'instance-removed') {
      throw new Error(`expected instance-removed, got ${delta.kind}`);
    }
    expect(delta.runId).toBe(leaving.runId);
    // Bounded — no mention of "staying", no bulk fleet field.
    expect(delta).not.toHaveProperty('entries');
    expect(delta).not.toHaveProperty('instances');
  });

  it('no telemetry event ever produces a delta equal in size to a full registry re-push — the direct negation of C2\'s prohibition', () => {
    const installationId = mintInstallationId();
    const runs = Array.from({ length: 10 }, () => startedRun(installationId));
    const events = runs.flatMap((run) => run.events);

    const previousEntries = buildRegistry(events).entries();
    const targetRun = runs[4];
    if (targetRun === undefined) {
      throw new Error('expected at least 5 runs in the fixture fleet');
    }
    const nextEvents = [
      ...events,
      mkEvent(installationId, targetRun.invocationId, targetRun.runId, 'run.progress', 'aggregated', 2),
    ];
    const nextEntries = buildRegistry(nextEvents).entries();

    const deltas = computeFleetDeltas(previousEntries, nextEntries);

    // A "full registry push per telemetry event" would mean: the number of
    // items communicated for this ONE event equals the fleet size (10).
    // C2 prohibits exactly that.
    expect(deltas.length).not.toBe(nextEntries.length);
    expect(deltas.length).toBeLessThan(nextEntries.length);
    expect(deltas).toHaveLength(1);
  });

  it('FleetDelta is a closed, four-kind vocabulary (C2) — pinned at the type level so a dropped/renamed kind fails tsc, not just this test', () => {
    // Runtime witness that the exhaustiveness-checked helper above is a
    // real, reachable function (not dead code the compiler never visits).
    // Its true value is the `never`-exhaustive switch itself: if
    // src/plane/http/api.ts's FleetDelta union stops covering exactly
    // {instance-upserted, instance-removed, command-updated,
    // store-health-changed}, `tsc --noEmit` fails on the `default` branch
    // above before this assertion ever runs.
    expect(typeof pinDeltaKindVocabulary).toBe('function');
  });
});
