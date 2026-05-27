/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/recovery/systematic-wrongness.test.ts
 *
 * Phase 11 Task 8 — Systematic-wrongness classifier tests.
 *
 * Verifies:
 *   - clustering by class-key (pattern-type + disposition + shape-tag)
 *   - threshold = 3 by default (configurable)
 *   - shouldRouteToEscalation gates correctly per class
 */

import { describe, expect, it } from 'vitest';
import {
  classKeysAtThreshold,
  classifySystematicWrongness,
  shouldRouteToEscalation,
} from '../../../scope-discovery/recovery/systematic-wrongness.js';
import { DEFAULT_SYSTEMATIC_WRONGNESS_THRESHOLD } from '../../../scope-discovery/recovery/recovery-types.js';
import { makeWrongDecisionEvent } from './recovery.fixtures.js';

describe('classifySystematicWrongness', () => {
  it('groups events by class-key', () => {
    const events = [
      makeWrongDecisionEvent({
        catalogEntryId: 'a',
        registryPath: 'anti-patterns.yaml',
        findingId: 'AUDIT-20260526-01',
        patternType: 'negative-space',
      }),
      makeWrongDecisionEvent({
        catalogEntryId: 'b',
        registryPath: 'anti-patterns.yaml',
        findingId: 'AUDIT-20260526-02',
        patternType: 'negative-space',
      }),
      makeWrongDecisionEvent({
        catalogEntryId: 'c',
        registryPath: 'anti-patterns.yaml',
        findingId: 'AUDIT-20260526-03',
        patternType: 'coverage',
      }),
    ];
    const classes = classifySystematicWrongness(events);
    expect(classes.length).toBe(2);
    const ns = classes.find((c) => c.patternType === 'negative-space');
    const cov = classes.find((c) => c.patternType === 'coverage');
    expect(ns?.wrongCount).toBe(2);
    expect(cov?.wrongCount).toBe(1);
  });

  it('threshold-crossed at default threshold 3', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makeWrongDecisionEvent({
        catalogEntryId: `e${i}`,
        registryPath: 'anti-patterns.yaml',
        findingId: `AUDIT-20260526-0${i}`,
        patternType: 'negative-space',
      }),
    );
    const classes = classifySystematicWrongness(events);
    expect(classes[0]?.thresholdCrossed).toBe(true);
    expect(classes[0]?.wrongCount).toBe(DEFAULT_SYSTEMATIC_WRONGNESS_THRESHOLD);
  });

  it('threshold-crossed false at count below threshold', () => {
    const events = [
      makeWrongDecisionEvent({
        catalogEntryId: 'a',
        registryPath: 'anti-patterns.yaml',
        findingId: 'AUDIT-20260526-01',
        patternType: 'negative-space',
      }),
      makeWrongDecisionEvent({
        catalogEntryId: 'b',
        registryPath: 'anti-patterns.yaml',
        findingId: 'AUDIT-20260526-02',
        patternType: 'negative-space',
      }),
    ];
    const classes = classifySystematicWrongness(events);
    expect(classes[0]?.thresholdCrossed).toBe(false);
  });

  it('threshold respects override', () => {
    const events = [
      makeWrongDecisionEvent({
        catalogEntryId: 'a',
        registryPath: 'anti-patterns.yaml',
        findingId: 'AUDIT-20260526-01',
        patternType: 'negative-space',
      }),
    ];
    const classes = classifySystematicWrongness(events, { threshold: 1 });
    expect(classes[0]?.thresholdCrossed).toBe(true);
  });

  it('different disposition (priorStatus) splits the class', () => {
    const events = [
      makeWrongDecisionEvent({
        catalogEntryId: 'a',
        registryPath: 'anti-patterns.yaml',
        findingId: 'AUDIT-20260526-01',
        patternType: 'negative-space',
        priorStatus: 'blessed',
      }),
      makeWrongDecisionEvent({
        catalogEntryId: 'b',
        registryPath: 'anti-patterns.yaml',
        findingId: 'AUDIT-20260526-02',
        patternType: 'negative-space',
        priorStatus: 'cursed',
      }),
    ];
    const classes = classifySystematicWrongness(events);
    expect(classes.length).toBe(2);
  });

  it('different registry shape-tag splits the class', () => {
    const events = [
      makeWrongDecisionEvent({
        catalogEntryId: 'a',
        registryPath: 'anti-patterns.yaml',
        findingId: 'AUDIT-20260526-01',
        patternType: 'negative-space',
      }),
      makeWrongDecisionEvent({
        catalogEntryId: 'a',
        registryPath: 'clones.yaml',
        findingId: 'AUDIT-20260526-02',
        patternType: 'negative-space',
      }),
    ];
    const classes = classifySystematicWrongness(events);
    expect(classes.length).toBe(2);
    expect(classes.map((c) => c.shapeTag).sort()).toEqual([
      'anti-patterns',
      'clones',
    ]);
  });

  it('missing patternType defaults to "untyped"', () => {
    const events = [
      makeWrongDecisionEvent({
        catalogEntryId: 'a',
        registryPath: 'clones.yaml',
        findingId: 'AUDIT-20260526-01',
      }),
    ];
    const classes = classifySystematicWrongness(events);
    expect(classes[0]?.patternType).toBe('untyped');
    expect(classes[0]?.classKey).toBe('untyped|blessed|clones');
  });

  it('handles empty input', () => {
    expect(classifySystematicWrongness([])).toEqual([]);
  });
});

describe('classKeysAtThreshold', () => {
  it('returns only class-keys at threshold', () => {
    const events = [
      ...Array.from({ length: 3 }, (_, i) =>
        makeWrongDecisionEvent({
          catalogEntryId: `a${i}`,
          registryPath: 'anti-patterns.yaml',
          findingId: `AUDIT-20260526-0${i}`,
          patternType: 'negative-space',
        }),
      ),
      makeWrongDecisionEvent({
        catalogEntryId: 'b',
        registryPath: 'anti-patterns.yaml',
        findingId: 'AUDIT-20260526-10',
        patternType: 'coverage',
      }),
    ];
    const classes = classifySystematicWrongness(events);
    const atThreshold = classKeysAtThreshold(classes);
    expect(atThreshold).toEqual(['negative-space|blessed|anti-patterns']);
  });
});

describe('shouldRouteToEscalation', () => {
  it('returns true when candidate matches a threshold-crossed class', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makeWrongDecisionEvent({
        catalogEntryId: `e${i}`,
        registryPath: 'anti-patterns.yaml',
        findingId: `AUDIT-20260526-0${i}`,
        patternType: 'negative-space',
      }),
    );
    const classes = classifySystematicWrongness(events);
    expect(
      shouldRouteToEscalation(
        classes,
        'negative-space',
        'blessed',
        'anti-patterns.yaml',
      ),
    ).toBe(true);
  });

  it('returns false when candidate matches a class below threshold', () => {
    const events = [
      makeWrongDecisionEvent({
        catalogEntryId: 'a',
        registryPath: 'anti-patterns.yaml',
        findingId: 'AUDIT-20260526-01',
        patternType: 'negative-space',
      }),
    ];
    const classes = classifySystematicWrongness(events);
    expect(
      shouldRouteToEscalation(
        classes,
        'negative-space',
        'blessed',
        'anti-patterns.yaml',
      ),
    ).toBe(false);
  });

  it('returns false when candidate does not match any class', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makeWrongDecisionEvent({
        catalogEntryId: `e${i}`,
        registryPath: 'anti-patterns.yaml',
        findingId: `AUDIT-20260526-0${i}`,
        patternType: 'negative-space',
      }),
    );
    const classes = classifySystematicWrongness(events);
    expect(
      shouldRouteToEscalation(
        classes,
        'coverage',
        'blessed',
        'anti-patterns.yaml',
      ),
    ).toBe(false);
  });

  it('correctly handles untyped patternType', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      makeWrongDecisionEvent({
        catalogEntryId: `e${i}`,
        registryPath: 'clones.yaml',
        findingId: `AUDIT-20260526-0${i}`,
      }),
    );
    const classes = classifySystematicWrongness(events);
    expect(
      shouldRouteToEscalation(classes, undefined, 'blessed', 'clones.yaml'),
    ).toBe(true);
  });
});
