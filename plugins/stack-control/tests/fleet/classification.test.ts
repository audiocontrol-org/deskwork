// specs/036-fleet-control-plane — T135 (RED), pairs with T136 impl.
//
// EVENT classification (FR-015/016): every event the sidecar emits is one of
//   - live-only  — never durably stored (heartbeats belong here); updates the
//                  live registry, then is gone.
//   - aggregated — rolled into a summary (the rollup machinery is NOT built
//                  until volume justifies it — but the SEAM exists now).
//   - durable    — its own immutable object in the store.
//
// The headline promise (spec.md § Edge Cases line ~174, FR-015):
// **classification, not emission, decides cost.** An operator whose shell
// completions or automation loop hammers stackctl at high frequency must mint
// ZERO durable objects from that stream — because those events classify as
// aggregated / live-only, NOT durable. Without this seam, "every invocation
// telemeters" silently becomes "every event becomes a cloud object" and cost
// scales with emission RATE. This test pins that it does not.
//
// WORD-COLLISION WARNING (the /speckit-analyze finding that added this task):
// T019/T020's `sequence.ts` has "gap classification" (lost / in-flight /
// never-sent) — a COMPLETELY UNRELATED concept. This file is EVENT
// classification; it does not import from or touch sequence.ts.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). Real fixtures, no mocks.

import { describe, expect, it } from 'vitest';
import type { EventClassification } from '../../src/fleet/types.js';
import {
  classifyEvent,
  isKnownEventType,
  knownEventTypes,
  mintsDurableObject,
  CLASS_STORAGE_POLICY,
} from '../../src/fleet/classification.js';

describe('classifyEvent — the event-type → classification seam (FR-015)', () => {
  it('classifies a session-liveness heartbeat as live-only (heartbeats belong here)', () => {
    expect(classifyEvent('session.heartbeat')).toBe<EventClassification>('live-only');
  });

  it('classifies short-verb invocation telemetry as aggregated (FR-012/014 — emitted, never a fleet entry, timing retained)', () => {
    expect(classifyEvent('invocation.completed')).toBe<EventClassification>('aggregated');
  });

  it('classifies run lifecycle transitions as durable (the immutable historical record)', () => {
    expect(classifyEvent('run.started')).toBe<EventClassification>('durable');
    expect(classifyEvent('run.completed')).toBe<EventClassification>('durable');
    expect(classifyEvent('run.failed')).toBe<EventClassification>('durable');
    expect(classifyEvent('run.cancelled')).toBe<EventClassification>('durable');
  });

  it('classifies high-frequency run progress as aggregated (rolled into the summary, not one object per tick)', () => {
    // JUDGMENT CALL (named): run.progress is aggregated, not durable. Progress
    // ticks are high-frequency; the durable set is sparse by design (research.md
    // line ~80), so the immutable record is start + terminal + snapshots, and
    // progress rolls into the derived summary. Minting one durable object per
    // tick is exactly the cost failure FR-015 exists to prevent.
    expect(classifyEvent('run.progress')).toBe<EventClassification>('aggregated');
  });
});

describe('classifyEvent — fail loud on an unknown event type (never a silent default)', () => {
  it('throws on an unregistered event type rather than defaulting', () => {
    expect(() => classifyEvent('totally.unregistered.verb')).toThrow(
      /totally\.unregistered\.verb/,
    );
  });

  it('never silently defaults an unknown type to durable (a cost bug) or live-only (a data-loss bug)', () => {
    // The direction of a silent default is the trap: default-to-durable mints
    // objects nobody asked for; default-to-live-only loses history. Both are
    // wrong, so an unknown type is a fail-loud condition — assert it throws and
    // therefore returns NEITHER default.
    let threw = false;
    let returned: EventClassification | undefined;
    try {
      returned = classifyEvent('mystery.event');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(returned).toBeUndefined();
  });

  it('isKnownEventType is the guard that lets a caller check before classifying', () => {
    expect(isKnownEventType('session.heartbeat')).toBe(true);
    expect(isKnownEventType('mystery.event')).toBe(false);
  });
});

describe('COST INVARIANT — classification, not emission, decides cost (FR-015 headline)', () => {
  // The operator-perceivable promise, as a real falsifiable assertion: a
  // high-frequency stream of short verbs / heartbeats mints ZERO durable
  // objects, no matter how many are emitted. "Minting a durable object" is
  // modeled exactly as the storage economy defines it: an event mints a durable
  // object iff its classification's storage policy says so.
  function countDurableObjectsMinted(types: readonly string[]): number {
    return types.filter((t) => mintsDurableObject(classifyEvent(t))).length;
  }

  it('a 50,000-event short-verb stream mints ZERO durable objects', () => {
    const stream = Array.from({ length: 50_000 }, () => 'invocation.completed');
    expect(stream.length).toBe(50_000); // the stream is genuinely high-volume
    expect(countDurableObjectsMinted(stream)).toBe(0);
  });

  it('a 50,000-event heartbeat stream mints ZERO durable objects', () => {
    const stream = Array.from({ length: 50_000 }, () => 'session.heartbeat');
    expect(countDurableObjectsMinted(stream)).toBe(0);
  });

  it('a mixed high-frequency non-durable stream mints ZERO durable objects regardless of emission rate', () => {
    const nonDurable = ['invocation.completed', 'session.heartbeat', 'run.progress'];
    const stream = Array.from(
      { length: 100_000 },
      (_, i) => nonDurable[i % nonDurable.length],
    );
    expect(countDurableObjectsMinted(stream)).toBe(0);
  });

  it('is NOT vacuously true — durable events DO mint objects, so cost tracks classification', () => {
    // Contrast case proving the classifier can and does produce durable objects
    // for the events that ARE the historical record. Cost is a function of the
    // durable COUNT in the stream, not the stream length: 3 durable + 100k
    // non-durable = exactly 3 objects.
    const durableEvents = ['run.started', 'run.completed', 'run.failed'];
    expect(countDurableObjectsMinted(durableEvents)).toBe(3);

    const flood = Array.from({ length: 100_000 }, () => 'session.heartbeat');
    const mixed = [...durableEvents, ...flood];
    expect(countDurableObjectsMinted(mixed)).toBe(3);
  });
});

describe('the seam leaves room for future rollup without a contract change (FR-016)', () => {
  it('separates the classification DECISION (type → class) from the DISPOSITION (class → cost)', () => {
    // classifyEvent answers "which class"; CLASS_STORAGE_POLICY answers "what
    // does that class cost". They are independent tables. Adding real rollup
    // machinery gives the 'aggregated' class a summarizer — it flips how the
    // policy is CONSUMED, changing neither classifyEvent's result nor this
    // policy's shape. That independence is the seam.
    const classes: EventClassification[] = ['live-only', 'aggregated', 'durable'];
    for (const c of classes) {
      expect(CLASS_STORAGE_POLICY[c]).toBeDefined();
    }
  });

  it('only the durable class mints an immutable object; aggregated is destined for a summary; live-only is never stored', () => {
    expect(CLASS_STORAGE_POLICY['durable'].mintsDurableObject).toBe(true);
    expect(CLASS_STORAGE_POLICY['durable'].feedsRollup).toBe(false);

    expect(CLASS_STORAGE_POLICY['aggregated'].mintsDurableObject).toBe(false);
    expect(CLASS_STORAGE_POLICY['aggregated'].feedsRollup).toBe(true);

    expect(CLASS_STORAGE_POLICY['live-only'].mintsDurableObject).toBe(false);
    expect(CLASS_STORAGE_POLICY['live-only'].feedsRollup).toBe(false);
  });

  it('mintsDurableObject is derived purely from the class, never from the event type', () => {
    // The cost of an event is a property of its CLASS. Two different types that
    // share a class share a cost — which is what makes "classification decides
    // cost" true by construction.
    expect(mintsDurableObject(classifyEvent('run.started'))).toBe(true);
    expect(mintsDurableObject(classifyEvent('run.completed'))).toBe(true);
    expect(mintsDurableObject(classifyEvent('invocation.completed'))).toBe(false);
    expect(mintsDurableObject(classifyEvent('run.progress'))).toBe(false);
    expect(mintsDurableObject(classifyEvent('session.heartbeat'))).toBe(false);
  });
});

describe('the catalog is explicit and extensible', () => {
  it('exposes its known event types, and every one classifies into a valid class', () => {
    const valid: ReadonlySet<EventClassification> = new Set([
      'live-only',
      'aggregated',
      'durable',
    ]);
    const types = knownEventTypes();
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) {
      expect(valid.has(classifyEvent(t))).toBe(true);
    }
  });

  it('covers every classification in the catalog (each class is actually reachable)', () => {
    const reached = new Set(knownEventTypes().map((t) => classifyEvent(t)));
    expect(reached.has('live-only')).toBe(true);
    expect(reached.has('aggregated')).toBe(true);
    expect(reached.has('durable')).toBe(true);
  });
});
