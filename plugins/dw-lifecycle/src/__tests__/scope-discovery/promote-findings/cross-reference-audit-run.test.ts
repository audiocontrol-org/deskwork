/**
 * Phase 13 Task 4 Step 3 — cross-reference logic for re-audit-fixed-findings.
 *
 * Library-level tests covering the heading-substring and surface-token
 * match heuristics + the still-surfaced / not-surfaced / unmatchable
 * classification.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyEntry,
  crossReferenceAuditRun,
} from '../../../scope-discovery/promote-findings/cross-reference-audit-run.js';

const HEADING = 'AUDIT-20260529-12 — orchestrator-turn 3/6 catalog NOTE is constant per-turn noise';
const SURFACE = 'plugins/dw-lifecycle/src/scope-discovery/orchestrator-turn.ts';

describe('classifyEntry — heading + surface match heuristics', () => {
  it("classifies as still-surfaced when the new run text contains the heading (after prefix strip)", () => {
    const result = classifyEntry(
      { findingId: 'AUDIT-20260529-12', status: 'fixed-245f8ae', heading: HEADING },
      'The model surfaced: orchestrator-turn 3/6 catalog NOTE is constant per-turn noise in module X.',
    );
    expect(result.classification).toBe('still-surfaced');
    expect(result.matchedBy).toContain('heading');
  });

  it("classifies as still-surfaced when the new run text contains the surface path", () => {
    const result = classifyEntry(
      { findingId: 'AUDIT-20260529-12', status: 'fixed-245f8ae', surface: SURFACE },
      'Bug in plugins/dw-lifecycle/src/scope-discovery/orchestrator-turn.ts at line 100.',
    );
    expect(result.classification).toBe('still-surfaced');
    expect(result.matchedBy).toContain('surface');
  });

  it("classifies as still-surfaced when BOTH heading and surface match", () => {
    const result = classifyEntry(
      {
        findingId: 'AUDIT-20260529-12',
        status: 'fixed-245f8ae',
        heading: HEADING,
        surface: SURFACE,
      },
      'orchestrator-turn 3/6 catalog NOTE is constant per-turn noise — see plugins/dw-lifecycle/src/scope-discovery/orchestrator-turn.ts',
    );
    expect(result.classification).toBe('still-surfaced');
    expect(result.matchedBy).toEqual(expect.arrayContaining(['heading', 'surface']));
  });

  it("classifies as not-surfaced when neither heading nor surface appear in the new run", () => {
    const result = classifyEntry(
      {
        findingId: 'AUDIT-20260529-12',
        status: 'fixed-245f8ae',
        heading: HEADING,
        surface: SURFACE,
      },
      'Findings about an unrelated subsystem at lib/router/index.ts.',
    );
    expect(result.classification).toBe('not-surfaced');
    expect(result.matchedBy).toEqual([]);
  });

  it("case-insensitive heading match", () => {
    const result = classifyEntry(
      { findingId: 'AUDIT-20260529-12', status: 'fixed-245f8ae', heading: HEADING },
      'ORCHESTRATOR-TURN 3/6 CATALOG NOTE IS CONSTANT PER-TURN NOISE',
    );
    expect(result.classification).toBe('still-surfaced');
  });

  it("short heading falls through to surface matching (no false positives)", () => {
    const result = classifyEntry(
      {
        findingId: 'AUDIT-20260529-99',
        status: 'fixed-abc1234',
        heading: 'AUDIT-20260529-99 — bug',
        surface: 'src/foo.ts',
      },
      'unrelated text without the surface',
    );
    expect(result.classification).toBe('not-surfaced');
  });

  it("classifies as unmatchable when entry has no heading and no surface", () => {
    const result = classifyEntry(
      { findingId: 'AUDIT-20260529-99', status: 'fixed-abc1234' },
      'arbitrary text',
    );
    expect(result.classification).toBe('unmatchable');
  });

  it("classifies as unmatchable when heading is too short AND surface has no path tokens", () => {
    const result = classifyEntry(
      {
        findingId: 'AUDIT-20260529-99',
        status: 'fixed-abc1234',
        heading: 'AUDIT-20260529-99 — x',
        surface: 'general area',
      },
      'arbitrary text',
    );
    expect(result.classification).toBe('unmatchable');
  });

  it("matches multi-path Surface field — any token surfaces", () => {
    const result = classifyEntry(
      {
        findingId: 'AUDIT-20260529-12',
        status: 'fixed-245f8ae',
        surface:
          'src/foo/first.ts, plugins/bar/second.ts, third path-shape',
      },
      'Finding in plugins/bar/second.ts at offset 42.',
    );
    expect(result.classification).toBe('still-surfaced');
    expect(result.matchedBy).toContain('surface');
  });
});

describe('crossReferenceAuditRun — batch classification', () => {
  it('classifies every entry in a batch', () => {
    const entries = [
      { findingId: 'AUDIT-A', status: 'fixed-1', heading: HEADING, surface: SURFACE },
      { findingId: 'AUDIT-B', status: 'fixed-2', heading: 'AUDIT-X — unrelated finding never re-surfaces' },
      { findingId: 'AUDIT-C', status: 'fixed-3' },
    ];
    const results = crossReferenceAuditRun({
      fixedEntries: entries,
      newRunText:
        'orchestrator-turn 3/6 catalog NOTE is constant per-turn noise: plugins/dw-lifecycle/src/scope-discovery/orchestrator-turn.ts',
    });
    expect(results).toHaveLength(3);
    expect(results[0]?.classification).toBe('still-surfaced');
    expect(results[1]?.classification).toBe('not-surfaced');
    expect(results[2]?.classification).toBe('unmatchable');
  });

  it('returns empty when given no entries', () => {
    const results = crossReferenceAuditRun({
      fixedEntries: [],
      newRunText: 'irrelevant',
    });
    expect(results).toEqual([]);
  });
});
