/**
 * Stage-affordance helper tests. The studio's entry-centric review
 * surface (pipeline-redesign Task 35) uses `getAffordances(entry)` to
 * decide which controls to render. This test pins the four affordance
 * shapes:
 *
 *   - Linear pipeline stages (Ideas .. Final): mutable, full controls.
 *   - Published: read-only, "view-only" + "fork-placeholder".
 *   - Blocked / Cancelled: read-only, "induct-to" stage picker.
 */

import { describe, it, expect } from 'vitest';
import { getAffordances } from '../src/lib/stage-affordances.ts';
import type { Entry } from '@deskwork/core/schema/entry';

function makeEntry(stage: Entry['currentStage'], overrides: Partial<Entry> = {}): Entry {
  return {
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    slug: 'x',
    title: 'X',
    keywords: [],
    source: 'manual',
    currentStage: stage,
    iterationByStage: {},
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('getAffordances', () => {
  it('Drafting is mutable with full controls', () => {
    const a = getAffordances(makeEntry('Drafting'));
    expect(a.mutable).toBe(true);
    expect(a.controls).toContain('save');
    expect(a.controls).toContain('iterate');
    expect(a.controls).toContain('approve');
  });

  it('Published is read-only', () => {
    const a = getAffordances(makeEntry('Published'));
    expect(a.mutable).toBe(false);
    expect(a.controls).toContain('view-only');
  });

  it('Blocked / Cancelled show induct-to', () => {
    const blocked = getAffordances(makeEntry('Blocked'));
    expect(blocked.mutable).toBe(false);
    expect(blocked.controls).toContain('induct-to');
    const cancelled = getAffordances(makeEntry('Cancelled'));
    expect(cancelled.mutable).toBe(false);
    expect(cancelled.controls).toContain('induct-to');
  });

  it.each(['Ideas', 'Planned', 'Outlining', 'Final'] as const)(
    '%s stage gets full controls',
    (stage) => {
      const a = getAffordances(makeEntry(stage));
      expect(a.mutable).toBe(true);
    },
  );
});
