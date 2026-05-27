/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/recovery/trust-calibration.test.ts
 *
 * Phase 11 Task 8 — Trust calibration tests.
 *
 * Covers:
 *   - class-key derivation (event + components)
 *   - shape-tag derivation from registry paths
 *   - applyWrongDecision raises +0.05 per event (bounded by 0.4)
 *   - applyCorrectDecision lowers by -0.01 per event (bounded by 0.0)
 *   - effectiveThreshold picks max(perClass, global) + baseline (clamped)
 *   - durable load/persist round-trip + malformed-file rejection
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EMPTY_TRUST_CALIBRATION,
  TRUST_CALIBRATION_FILENAME,
  applyCorrectDecision,
  applyWrongDecision,
  classKeyForComponents,
  classKeyForEvent,
  deriveShapeTag,
  effectiveThreshold,
  loadTrustCalibration,
  persistTrustCalibration,
} from '../../../scope-discovery/recovery/trust-calibration.js';
import {
  MAX_TRUST_THRESHOLD_ADJUSTMENT,
  MIN_TRUST_THRESHOLD_ADJUSTMENT,
} from '../../../scope-discovery/recovery/recovery-types.js';
import { makeWrongDecisionEvent } from './recovery.fixtures.js';

describe('deriveShapeTag', () => {
  it('strips .yaml extension', () => {
    expect(deriveShapeTag('anti-patterns.yaml')).toBe('anti-patterns');
  });
  it('strips .yml extension (case-insensitive)', () => {
    expect(deriveShapeTag('adopter-manifests.YML')).toBe('adopter-manifests');
  });
  it('strips path prefix', () => {
    expect(deriveShapeTag('path/to/clones.yaml')).toBe('clones');
  });
  it('passes through paths without yaml extension', () => {
    expect(deriveShapeTag('pattern-matrix-patterns')).toBe(
      'pattern-matrix-patterns',
    );
  });
});

describe('class-key derivation', () => {
  it('classKeyForEvent uses patternType + priorStatus + shapeTag', () => {
    const event = makeWrongDecisionEvent({
      catalogEntryId: 'x',
      registryPath: 'anti-patterns.yaml',
      findingId: 'AUDIT-20260526-01',
      priorStatus: 'blessed',
      patternType: 'negative-space',
    });
    expect(classKeyForEvent(event)).toBe('negative-space|blessed|anti-patterns');
  });

  it('classKeyForEvent uses "untyped" when patternType is absent', () => {
    const event = makeWrongDecisionEvent({
      catalogEntryId: 'x',
      registryPath: 'clones.yaml',
      findingId: 'AUDIT-20260526-01',
      priorStatus: 'cursed',
    });
    expect(classKeyForEvent(event)).toBe('untyped|cursed|clones');
  });

  it('classKeyForComponents matches classKeyForEvent for the same inputs', () => {
    const event = makeWrongDecisionEvent({
      catalogEntryId: 'x',
      registryPath: 'anti-patterns.yaml',
      findingId: 'AUDIT-20260526-01',
      priorStatus: 'blessed',
      patternType: 'coverage',
    });
    expect(classKeyForComponents('coverage', 'blessed', 'anti-patterns.yaml')).toBe(
      classKeyForEvent(event),
    );
  });
});

describe('applyWrongDecision', () => {
  it('raises class adjustment by +0.05 on the first wrong event', () => {
    const event = makeWrongDecisionEvent({
      catalogEntryId: 'x',
      registryPath: 'anti-patterns.yaml',
      findingId: 'AUDIT-20260526-01',
      patternType: 'negative-space',
    });
    const out = applyWrongDecision(EMPTY_TRUST_CALIBRATION, event);
    const key = classKeyForEvent(event);
    expect(out.perClassThresholdAdjustments[key]).toBeCloseTo(0.05, 10);
    expect(out.recentEvents[0]?.kind).toBe('wrong');
    expect(out.recentEvents[0]?.classKey).toBe(key);
  });

  it('accumulates additively across same-class wrong events', () => {
    const event = makeWrongDecisionEvent({
      catalogEntryId: 'x',
      registryPath: 'anti-patterns.yaml',
      findingId: 'AUDIT-20260526-01',
      patternType: 'negative-space',
    });
    let cal = EMPTY_TRUST_CALIBRATION;
    for (let i = 0; i < 5; i += 1) {
      cal = applyWrongDecision(cal, event);
    }
    const key = classKeyForEvent(event);
    expect(cal.perClassThresholdAdjustments[key]).toBeCloseTo(0.25, 10);
    expect(cal.recentEvents.length).toBe(5);
  });

  it('clamps at MAX_TRUST_THRESHOLD_ADJUSTMENT', () => {
    const event = makeWrongDecisionEvent({
      catalogEntryId: 'x',
      registryPath: 'anti-patterns.yaml',
      findingId: 'AUDIT-20260526-01',
      patternType: 'negative-space',
    });
    let cal = EMPTY_TRUST_CALIBRATION;
    for (let i = 0; i < 100; i += 1) {
      cal = applyWrongDecision(cal, event);
    }
    const key = classKeyForEvent(event);
    expect(cal.perClassThresholdAdjustments[key]).toBe(
      MAX_TRUST_THRESHOLD_ADJUSTMENT,
    );
    expect(cal.globalThresholdAdjustment).toBeLessThanOrEqual(
      MAX_TRUST_THRESHOLD_ADJUSTMENT,
    );
  });

  it('truncates recentEvents to the window size', () => {
    const event = makeWrongDecisionEvent({
      catalogEntryId: 'x',
      registryPath: 'anti-patterns.yaml',
      findingId: 'AUDIT-20260526-01',
      patternType: 'negative-space',
    });
    let cal = EMPTY_TRUST_CALIBRATION;
    for (let i = 0; i < 15; i += 1) {
      cal = applyWrongDecision(cal, event, 10);
    }
    expect(cal.recentEvents.length).toBe(10);
  });
});

describe('applyCorrectDecision', () => {
  it('ratchets class adjustment down by -0.01', () => {
    const event = makeWrongDecisionEvent({
      catalogEntryId: 'x',
      registryPath: 'anti-patterns.yaml',
      findingId: 'AUDIT-20260526-01',
      patternType: 'negative-space',
    });
    // Build up some adjustment then ratchet down.
    const key = classKeyForEvent(event);
    let cal = EMPTY_TRUST_CALIBRATION;
    for (let i = 0; i < 4; i += 1) {
      cal = applyWrongDecision(cal, event);
    }
    expect(cal.perClassThresholdAdjustments[key]).toBeCloseTo(0.2, 10);
    cal = applyCorrectDecision(cal, key, '2026-05-26T13:00:00Z');
    expect(cal.perClassThresholdAdjustments[key]).toBeCloseTo(0.19, 10);
    expect(cal.recentEvents[0]?.kind).toBe('correct');
  });

  it('clamps at MIN_TRUST_THRESHOLD_ADJUSTMENT (0.0)', () => {
    let cal = EMPTY_TRUST_CALIBRATION;
    cal = applyCorrectDecision(
      cal,
      'untyped|blessed|anti-patterns',
      '2026-05-26T12:00:00Z',
    );
    expect(cal.perClassThresholdAdjustments['untyped|blessed|anti-patterns']).toBe(
      MIN_TRUST_THRESHOLD_ADJUSTMENT,
    );
  });
});

describe('effectiveThreshold', () => {
  it('returns baseline when no calibration applies', () => {
    expect(effectiveThreshold(0.7, EMPTY_TRUST_CALIBRATION, 'foo')).toBeCloseTo(0.7, 10);
  });

  it('adds perClass adjustment when set', () => {
    const cal = {
      ...EMPTY_TRUST_CALIBRATION,
      perClassThresholdAdjustments: { 'foo': 0.1 },
    };
    expect(effectiveThreshold(0.7, cal, 'foo')).toBeCloseTo(0.8, 10);
  });

  it('falls back to globalThresholdAdjustment when perClass is unset', () => {
    const cal = {
      ...EMPTY_TRUST_CALIBRATION,
      globalThresholdAdjustment: 0.05,
    };
    expect(effectiveThreshold(0.7, cal, 'foo')).toBeCloseTo(0.75, 10);
  });

  it('uses max(perClass, global) when both are present', () => {
    const cal = {
      ...EMPTY_TRUST_CALIBRATION,
      globalThresholdAdjustment: 0.05,
      perClassThresholdAdjustments: { 'foo': 0.1 },
    };
    expect(effectiveThreshold(0.7, cal, 'foo')).toBeCloseTo(0.8, 10);
  });

  it('clamps to [0.0, 1.0]', () => {
    const cal = {
      ...EMPTY_TRUST_CALIBRATION,
      perClassThresholdAdjustments: { 'foo': 0.4 },
    };
    expect(effectiveThreshold(0.9, cal, 'foo')).toBe(1.0);
  });
});

describe('trust-calibration persistence', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'trust-calibration-'));
  });

  afterAll(async () => {
    if (root !== undefined && root.length > 0) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns empty calibration when file is absent', async () => {
    const out = await loadTrustCalibration(root);
    expect(out).toEqual(EMPTY_TRUST_CALIBRATION);
  });

  it('round-trips a calibration to disk + back', async () => {
    const event = makeWrongDecisionEvent({
      catalogEntryId: 'x',
      registryPath: 'anti-patterns.yaml',
      findingId: 'AUDIT-20260526-01',
      patternType: 'negative-space',
    });
    const cal = applyWrongDecision(EMPTY_TRUST_CALIBRATION, event);
    await persistTrustCalibration(root, cal);
    const path = join(
      root,
      '.dw-lifecycle',
      'scope-discovery',
      'orchestrator-runtime',
      TRUST_CALIBRATION_FILENAME,
    );
    const text = await readFile(path, 'utf8');
    expect(text).toContain('"version": 1');
    const reloaded = await loadTrustCalibration(root);
    expect(reloaded.perClassThresholdAdjustments).toEqual(
      cal.perClassThresholdAdjustments,
    );
    expect(reloaded.recentEvents.length).toBe(1);
    expect(reloaded.recentEvents[0]?.kind).toBe('wrong');
  });

  it('rejects unsupported version', async () => {
    const stateDir = join(
      root,
      '.dw-lifecycle',
      'scope-discovery',
      'orchestrator-runtime',
    );
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, TRUST_CALIBRATION_FILENAME),
      JSON.stringify({
        version: 99,
        globalThresholdAdjustment: 0,
        perClassThresholdAdjustments: {},
        recentEvents: [],
      }),
      'utf8',
    );
    await expect(loadTrustCalibration(root)).rejects.toThrow(
      /unsupported version 99/,
    );
  });

  it('rejects malformed JSON', async () => {
    const stateDir = join(
      root,
      '.dw-lifecycle',
      'scope-discovery',
      'orchestrator-runtime',
    );
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, TRUST_CALIBRATION_FILENAME),
      'not json',
      'utf8',
    );
    await expect(loadTrustCalibration(root)).rejects.toThrow(/cannot parse/);
  });

  it('rejects non-finite numbers in perClassThresholdAdjustments', async () => {
    const stateDir = join(
      root,
      '.dw-lifecycle',
      'scope-discovery',
      'orchestrator-runtime',
    );
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, TRUST_CALIBRATION_FILENAME),
      JSON.stringify({
        version: 1,
        globalThresholdAdjustment: 0,
        perClassThresholdAdjustments: { 'foo': 'not-a-number' },
        recentEvents: [],
      }),
      'utf8',
    );
    await expect(loadTrustCalibration(root)).rejects.toThrow(
      /must be a finite number/,
    );
  });
});
