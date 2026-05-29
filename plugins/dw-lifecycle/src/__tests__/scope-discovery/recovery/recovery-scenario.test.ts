/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/recovery/recovery-scenario.test.ts
 *
 * Phase 11 Task 8 — End-to-end recovery scenario.
 *
 * Walks a realistic per-turn cycle:
 *
 *   1. Orchestrator-agent set three negative-space entries to `blessed`
 *      across two registries.
 *   2. The audit-log emits three findings that overturn the
 *      negative-space-blessed-anti-patterns class.
 *   3. detectWrongDecisions surfaces three events.
 *   4. buildReversalProposals emits three withdrawn-status proposals
 *      with audit-finding context.
 *   5. applyWrongDecision accumulates calibration adjustments for the
 *      class.
 *   6. classifySystematicWrongness clusters them into one threshold-
 *      crossed class; shouldRouteToEscalation gates future candidates
 *      in that class to escalation.
 *   7. State is persisted; reload + further events compound.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectWrongDecisions } from '../../../scope-discovery/recovery/detect-wrong-decisions.js';
import { buildReversalProposals } from '../../../scope-discovery/recovery/reverse-disposition.js';
import {
  EMPTY_TRUST_CALIBRATION,
  applyCorrectDecision,
  applyWrongDecision,
  classKeyForEvent,
  effectiveThreshold,
  loadTrustCalibration,
  persistTrustCalibration,
} from '../../../scope-discovery/recovery/trust-calibration.js';
import {
  classKeysAtThreshold,
  classifySystematicWrongness,
  shouldRouteToEscalation,
} from '../../../scope-discovery/recovery/systematic-wrongness.js';
import {
  makeAuditEntry,
  makeAuditLog,
  makeCatalogView,
} from './recovery.fixtures.js';

describe('end-to-end recovery scenario', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'recovery-scenario-'));
  });

  afterAll(async () => {
    if (root !== undefined && root.length > 0) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('walks the full detect → reverse → calibrate → classify → persist cycle', async () => {
    // ---- Step 1+2: three blessed negative-space entries overturned ----
    const catalogEntries = [
      makeCatalogView({
        registryPath: 'anti-patterns.yaml',
        entryId: 'neg-space-foo',
        status: 'blessed',
        provenanceSource: 'orchestrator-agent',
        patternType: 'negative-space',
      }),
      makeCatalogView({
        registryPath: 'anti-patterns.yaml',
        entryId: 'neg-space-bar',
        status: 'blessed',
        provenanceSource: 'orchestrator-agent',
        patternType: 'negative-space',
      }),
      makeCatalogView({
        registryPath: 'anti-patterns.yaml',
        entryId: 'neg-space-baz',
        status: 'blessed',
        provenanceSource: 'llm-judge-proposed',
        patternType: 'negative-space',
      }),
      // A non-matching catalog entry that should NOT surface (operator-
      // authored; the audit log doesn't cite it anyway).
      makeCatalogView({
        registryPath: 'anti-patterns.yaml',
        entryId: 'operator-baseline',
        status: 'blessed',
        provenanceSource: 'operator-authored',
        patternType: 'negative-space',
      }),
    ];

    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-01',
        body: 'Negative-space pattern flagged here is wrong; please overturn the disposition.',
        affects: ['anti-patterns.yaml#neg-space-foo'],
      }),
      makeAuditEntry({
        findingId: 'AUDIT-20260526-02',
        body: 'Incorrect classification — this catalog entry should not have been blessed.',
        affects: ['anti-patterns.yaml#neg-space-bar'],
      }),
      makeAuditEntry({
        findingId: 'AUDIT-20260526-03',
        body: 'Disagree with the prior auto-disposition.',
        affects: ['anti-patterns.yaml#neg-space-baz'],
      }),
      // Quiet audit-log entry (no disagreement token) — should NOT
      // produce an event even though it cites a catalog entry.
      makeAuditEntry({
        findingId: 'AUDIT-20260526-04',
        body: 'Spot-checked the implementation; matches the pattern.',
        affects: ['anti-patterns.yaml#operator-baseline'],
      }),
    ]);

    // ---- Step 3: detection ----
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries,
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(events.length).toBe(3);
    expect(events.map((e) => e.catalogEntryId).sort()).toEqual([
      'neg-space-bar',
      'neg-space-baz',
      'neg-space-foo',
    ]);

    // ---- Step 4: reversal proposals ----
    const proposals = buildReversalProposals(events);
    expect(proposals.length).toBe(3);
    for (const p of proposals) {
      expect(p.targetStatus).toBe('withdrawn');
      expect(p.proposalSource).toBe('recovery');
      expect(p.targetProvenance.context).toMatch(/^audit-finding-AUDIT-/);
    }

    // ---- Step 5: trust calibration accumulates ----
    let calibration = EMPTY_TRUST_CALIBRATION;
    for (const event of events) {
      calibration = applyWrongDecision(calibration, event);
    }
    const classKey = classKeyForEvent(events[0]!);
    expect(calibration.perClassThresholdAdjustments[classKey]).toBeCloseTo(0.15, 10);
    expect(calibration.recentEvents.length).toBe(3);

    // Effective threshold for a candidate in the same class is now
    // baseline + 0.15.
    expect(effectiveThreshold(0.7, calibration, classKey)).toBeCloseTo(0.85, 10);

    // ---- Step 6: systematic-wrongness classification ----
    const classes = classifySystematicWrongness(events);
    expect(classes.length).toBe(1);
    expect(classes[0]?.thresholdCrossed).toBe(true);
    expect(classes[0]?.classKey).toBe(classKey);
    expect(classKeysAtThreshold(classes)).toEqual([classKey]);

    // A new candidate in the same class should now route to escalation
    // by default, regardless of confidence.
    expect(
      shouldRouteToEscalation(
        classes,
        'negative-space',
        'blessed',
        'anti-patterns.yaml',
      ),
    ).toBe(true);

    // A candidate in a different class should NOT route by default.
    expect(
      shouldRouteToEscalation(
        classes,
        'coverage',
        'blessed',
        'anti-patterns.yaml',
      ),
    ).toBe(false);

    // ---- Step 7: persistence ----
    await persistTrustCalibration(root, calibration);
    const reloaded = await loadTrustCalibration(root);
    expect(reloaded.perClassThresholdAdjustments[classKey]).toBeCloseTo(0.15, 10);
    expect(reloaded.recentEvents.length).toBe(3);

    // Apply a correct-decision event — the class adjustment ratchets
    // down by 0.01.
    const afterCorrect = applyCorrectDecision(
      reloaded,
      classKey,
      '2026-05-26T13:00:00Z',
    );
    expect(afterCorrect.perClassThresholdAdjustments[classKey]).toBeCloseTo(0.14, 10);
    expect(afterCorrect.recentEvents[0]?.kind).toBe('correct');

    // Persist + reload again — the change survives.
    await persistTrustCalibration(root, afterCorrect);
    const final = await loadTrustCalibration(root);
    expect(final.perClassThresholdAdjustments[classKey]).toBeCloseTo(0.14, 10);
  });

  it('multiple registries with same id still produce distinct events', () => {
    // Bare-id audit citation resolves to BOTH entries; the detector
    // emits one event per registry.
    const catalogEntries = [
      makeCatalogView({
        registryPath: 'anti-patterns.yaml',
        entryId: 'shared-id',
        provenanceSource: 'orchestrator-agent',
      }),
      makeCatalogView({
        registryPath: 'clones.yaml',
        entryId: 'shared-id',
        provenanceSource: 'orchestrator-agent',
      }),
    ];
    const auditLog = makeAuditLog([
      makeAuditEntry({
        findingId: 'AUDIT-20260526-50',
        body: 'wrong on both surfaces',
        affects: ['shared-id'], // bare id
      }),
    ]);
    const events = detectWrongDecisions({
      auditLog,
      catalogEntries,
      detectedAt: '2026-05-26T12:00:00Z',
    });
    expect(events.length).toBe(2);
    const registries = events.map((e) => e.registryPath).sort();
    expect(registries).toEqual(['anti-patterns.yaml', 'clones.yaml']);
    // Class-keys differ because the shape-tag differs.
    const classKeys = new Set(events.map((e) => classKeyForEvent(e)));
    expect(classKeys.size).toBe(2);
  });
});
