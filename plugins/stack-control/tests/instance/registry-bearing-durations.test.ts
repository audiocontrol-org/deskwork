// specs/037-instance-observability — T032 (RED), pairs with T033's impl
// (extending `buildInstanceRegistry` / `applyInstanceEvent` to fold
// `phase.entered` into `currentBearing` + cumulative `phaseDurations`).
//
// THE CONTRACT (data-model.md § InstanceState, § InstanceAccumulator; § Event
// types table):
//
//   `phase.entered` is a `durable` event whose SNAPSHOT carries
//   `{ phase, from, item }` (envelope identity — host/path/sessionId — rides
//   the envelope as usual; the phase-transition payload rides the snapshot,
//   data-model.md § ClassifiedEvent EXTEND / § Event types).
//
//   Folding it into `InstanceState` (data-model.md § InstanceState row list):
//     - `currentBearing` = the LATEST `phase.entered`'s `{ phase, item }`
//       (derived off that event's snapshot `{ phase, from, item }`).
//     - `currentBearing` PERSISTS through a `session.ended` (FR-016c) — ending
//       a session does not clear the instance's last-known phase/item.
//     - `phaseDurations` accrue CUMULATIVELY across re-entries (FR-018): the
//       InstanceAccumulator tracks a phase-entry timestamp and, on the NEXT
//       `phase.entered`, adds `(next.wallClock - thisEntry.wallClock)` to the
//       LEAVING phase's running total (data-model.md § InstanceAccumulator:
//       "tracks the phase-entry timestamp to accrue phaseDurations
//       cumulatively ... add now - phaseEnteredAt to the leaving phase's
//       total"). Re-entering a phase a second time adds to the SAME total,
//       it does not reset or overwrite it.
//     - An UNOBSERVED phase (never entered, or entered but never yet left) is
//       ABSENT from `phaseDurations` — never present with value `0` (SC-009).
//
// This file constructs events WITH a `snapshot` (the module's currently
// exported `ClassifiedEvent`, from `instance-accumulator.ts`, does not carry
// `snapshot` yet — that's this feature's T033 slice, mirroring how
// `registry.ts`'s `ClassifiedEvent` already carries one, data-model.md
// § ClassifiedEvent EXTEND). The local interface below is structurally wider
// than the module's current `ClassifiedEvent` (adds `snapshot`), which is
// exactly what makes this assignable today AND exactly what T033 is expected
// to start reading.
//
// RED: today, `applyInstanceEvent` never inspects `snapshot` and never folds
// `phase.entered` at all (instance-accumulator.ts's own header: "US3
// (`phase.entered`) fold[s] into them later; this module is their seam" —
// `currentBearing` stays `null` and `phaseDurations` stays `{}` regardless of
// input). Every assertion below MUST fail until T033 lands.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). Real fixtures, no mocks, no `any`/`as`/`@ts-ignore`.

import { describe, expect, it } from 'vitest';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { EventEnvelope, EventType, EventClassification } from '../../src/fleet/types.js';
import type { SnapshotPayload } from '../../src/fleet/event.js';
import { buildInstanceRegistry } from '../../src/plane/instance-registry.js';

/**
 * A classified event carrying a `snapshot` (data-model.md § ClassifiedEvent
 * EXTEND) — structurally wider than the module's current `ClassifiedEvent`
 * (which lacks `snapshot` until T033), so it is assignable to
 * `buildInstanceRegistry`'s parameter today.
 */
interface ClassifiedEvent {
  readonly envelope: EventEnvelope;
  readonly classification: EventClassification;
  readonly type: EventType;
  readonly snapshot: SnapshotPayload;
}

function mkEvent(opts: {
  host: string;
  path: string;
  sessionId: string | null;
  type: EventType;
  classification: EventClassification;
  invocationSequence: number;
  wallClock: string;
  snapshot?: SnapshotPayload;
  eventId?: string;
}): ClassifiedEvent {
  const envelope: EventEnvelope = {
    eventId: opts.eventId ?? mintUuidV7(),
    installationId: mintUuidV7(),
    invocationId: mintUuidV7(),
    runId: null,
    installationSequence: opts.invocationSequence,
    invocationSequence: opts.invocationSequence,
    schemaVersion: 2,
    type: opts.type,
    wallClock: opts.wallClock,
    monotonicOffsetMs: 0,
    classification: opts.classification,
    host: opts.host,
    path: opts.path,
    sessionId: opts.sessionId,
  };
  return {
    envelope,
    classification: opts.classification,
    type: opts.type,
    snapshot: opts.snapshot ?? {},
  };
}

/** A `phase.entered` event, snapshot `{ phase, from, item }` per data-model.md. */
function mkPhaseEntered(opts: {
  host: string;
  path: string;
  sessionId: string | null;
  invocationSequence: number;
  wallClock: string;
  phase: string;
  from: string | null;
  item: string;
}): ClassifiedEvent {
  return mkEvent({
    host: opts.host,
    path: opts.path,
    sessionId: opts.sessionId,
    type: 'phase.entered',
    classification: 'durable',
    invocationSequence: opts.invocationSequence,
    wallClock: opts.wallClock,
    snapshot: { phase: opts.phase, from: opts.from, item: opts.item },
  });
}

/** A `session.ended` event, snapshot `{ sessionId, endedAt, reason }` per data-model.md. */
function mkSessionEnded(opts: {
  host: string;
  path: string;
  sessionId: string;
  invocationSequence: number;
  wallClock: string;
}): ClassifiedEvent {
  return mkEvent({
    host: opts.host,
    path: opts.path,
    sessionId: opts.sessionId,
    type: 'session.ended',
    classification: 'durable',
    invocationSequence: opts.invocationSequence,
    wallClock: opts.wallClock,
    snapshot: { sessionId: opts.sessionId, endedAt: opts.wallClock, reason: 'ended' },
  });
}

const HOST = 'orion-mbp';
const PATH = '/Users/orion/work/proj-a';
const ITEM = 'INSTANCE-001';

describe('instance registry — folds phase.entered into currentBearing + cumulative phaseDurations (T032, data-model.md § InstanceState / § InstanceAccumulator)', () => {
  it('sets currentBearing to the LATEST phase.entered, derived from its snapshot {phase,item}', () => {
    const events: ClassifiedEvent[] = [
      mkPhaseEntered({
        host: HOST,
        path: PATH,
        sessionId: 'sess-1',
        invocationSequence: 1,
        wallClock: '2026-07-18T12:00:00.000Z',
        phase: 'design',
        from: null,
        item: ITEM,
      }),
      mkPhaseEntered({
        host: HOST,
        path: PATH,
        sessionId: 'sess-1',
        invocationSequence: 2,
        wallClock: '2026-07-18T12:00:05.000Z',
        phase: 'spec',
        from: 'design',
        item: ITEM,
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const [instance] = registry.instances();

    // Latest phase.entered wins — 'spec', not the first-observed 'design'.
    expect(instance.currentBearing).toEqual({ phase: 'spec', item: ITEM });
  });

  it('currentBearing PERSISTS through a session.ended (FR-016c) — ending the session does not clear it', () => {
    const events: ClassifiedEvent[] = [
      mkPhaseEntered({
        host: HOST,
        path: PATH,
        sessionId: 'sess-1',
        invocationSequence: 1,
        wallClock: '2026-07-18T12:00:00.000Z',
        phase: 'design',
        from: null,
        item: ITEM,
      }),
      mkSessionEnded({
        host: HOST,
        path: PATH,
        sessionId: 'sess-1',
        invocationSequence: 2,
        wallClock: '2026-07-18T12:00:10.000Z',
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const [instance] = registry.instances();

    // session.ended folded AFTER phase.entered must not null out currentBearing.
    expect(instance.currentBearing).toEqual({ phase: 'design', item: ITEM });
  });

  it('phaseDurations accrue CUMULATIVELY across re-entries (FR-018): design→spec→design sums BOTH design visits', () => {
    // design entered @ t0, left for spec @ t1  -> design visit #1 =  5_000ms
    // spec   entered @ t1, left for design @ t2 -> spec total       =  3_000ms
    // design entered @ t2, left for impl  @ t3  -> design visit #2 =  7_000ms
    // implementing entered @ t3, never left     -> implementing ABSENT
    const t0 = '2026-07-18T12:00:00.000Z';
    const t1 = '2026-07-18T12:00:05.000Z';
    const t2 = '2026-07-18T12:00:08.000Z';
    const t3 = '2026-07-18T12:00:15.000Z';

    const events: ClassifiedEvent[] = [
      mkPhaseEntered({
        host: HOST,
        path: PATH,
        sessionId: 'sess-1',
        invocationSequence: 1,
        wallClock: t0,
        phase: 'design',
        from: null,
        item: ITEM,
      }),
      mkPhaseEntered({
        host: HOST,
        path: PATH,
        sessionId: 'sess-1',
        invocationSequence: 2,
        wallClock: t1,
        phase: 'spec',
        from: 'design',
        item: ITEM,
      }),
      mkPhaseEntered({
        host: HOST,
        path: PATH,
        sessionId: 'sess-1',
        invocationSequence: 3,
        wallClock: t2,
        phase: 'design',
        from: 'spec',
        item: ITEM,
      }),
      mkPhaseEntered({
        host: HOST,
        path: PATH,
        sessionId: 'sess-1',
        invocationSequence: 4,
        wallClock: t3,
        phase: 'implementing',
        from: 'design',
        item: ITEM,
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const [instance] = registry.instances();

    // design's two visits (5_000ms + 7_000ms) accrue into ONE cumulative total —
    // re-entering design does not reset the running total from visit #1.
    expect(instance.phaseDurations.design).toBe(12_000);
    expect(instance.phaseDurations.spec).toBe(3_000);
  });

  it('an UNOBSERVED phase is ABSENT from phaseDurations, never 0 (SC-009)', () => {
    const t0 = '2026-07-18T12:00:00.000Z';
    const t1 = '2026-07-18T12:00:05.000Z';

    const events: ClassifiedEvent[] = [
      // Only ONE phase.entered — 'design' is entered but never left, and no
      // other phase has ever been observed at all.
      mkPhaseEntered({
        host: HOST,
        path: PATH,
        sessionId: 'sess-1',
        invocationSequence: 1,
        wallClock: t0,
        phase: 'design',
        from: null,
        item: ITEM,
      }),
    ];

    const registry = buildInstanceRegistry(events);
    const [instanceAfterOneEntry] = registry.instances();

    // Entered but not yet LEFT — design has no accrued duration yet, and the
    // key must be absent (not present with value 0).
    expect('design' in instanceAfterOneEntry.phaseDurations).toBe(false);
    expect('governing' in instanceAfterOneEntry.phaseDurations).toBe(false);
    expect(Object.keys(instanceAfterOneEntry.phaseDurations)).toHaveLength(0);

    // Now leave 'design' for 'implementing' — design accrues; 'governing'
    // (never observed at all) stays absent.
    const registryAfterSecond = buildInstanceRegistry([
      ...events,
      mkPhaseEntered({
        host: HOST,
        path: PATH,
        sessionId: 'sess-1',
        invocationSequence: 2,
        wallClock: t1,
        phase: 'implementing',
        from: 'design',
        item: ITEM,
      }),
    ]);
    const [instanceAfterTwoEntries] = registryAfterSecond.instances();

    expect(instanceAfterTwoEntries.phaseDurations.design).toBe(5_000);
    expect('implementing' in instanceAfterTwoEntries.phaseDurations).toBe(false);
    expect('governing' in instanceAfterTwoEntries.phaseDurations).toBe(false);
  });
});
