/**
 * Unit tests for `pickDefaultLongformEntry` — the entry-uuid keyed
 * default-picker that replaces the workflow-based picker as part of
 * pipeline-redesign Task 36.
 *
 * The picker is pure (no I/O) so these tests assemble Entry fixtures
 * directly and assert ordering / filtering behavior.
 */

import { describe, it, expect } from 'vitest';
import type { Entry } from '@deskwork/core/schema/entry';
import { pickDefaultLongformEntry } from '../src/pages/index.ts';

function makeEntry(overrides: Partial<Entry> & Pick<Entry, 'uuid'>): Entry {
  return {
    slug: overrides.uuid,
    title: 'T',
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: { Drafting: 1 },
    reviewState: 'in-review',
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('pickDefaultLongformEntry', () => {
  it('returns null when the input is empty', () => {
    expect(pickDefaultLongformEntry([])).toBeNull();
  });

  it('returns null when no entries are in-review or iterating', () => {
    const entries: Entry[] = [
      makeEntry({
        uuid: '11111111-1111-4111-8111-111111111111',
        reviewState: 'approved',
      }),
      makeEntry({
        uuid: '22222222-2222-4222-8222-222222222222',
        reviewState: undefined,
      }),
    ];
    expect(pickDefaultLongformEntry(entries)).toBeNull();
  });

  it('returns null when the only candidate is in a non-pipeline stage', () => {
    const entries: Entry[] = [
      makeEntry({
        uuid: '33333333-3333-4333-8333-333333333333',
        currentStage: 'Published',
        reviewState: 'in-review',
      }),
      makeEntry({
        uuid: '44444444-4444-4444-8444-444444444444',
        currentStage: 'Blocked',
        reviewState: 'iterating',
      }),
      makeEntry({
        uuid: '55555555-5555-4555-8555-555555555555',
        currentStage: 'Cancelled',
        reviewState: 'iterating',
      }),
    ];
    expect(pickDefaultLongformEntry(entries)).toBeNull();
  });

  it('picks the most-recent in-review pipeline entry by updatedAt', () => {
    const entries: Entry[] = [
      makeEntry({
        uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        slug: 'older',
        currentStage: 'Drafting',
        reviewState: 'in-review',
        updatedAt: '2026-04-01T10:00:00.000Z',
      }),
      makeEntry({
        uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        slug: 'newer',
        currentStage: 'Outlining',
        reviewState: 'iterating',
        updatedAt: '2026-04-29T10:00:00.000Z',
      }),
      makeEntry({
        uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        slug: 'newest-but-approved',
        currentStage: 'Final',
        reviewState: 'approved',
        updatedAt: '2026-04-30T10:00:00.000Z',
      }),
    ];
    const picked = pickDefaultLongformEntry(entries);
    expect(picked?.slug).toBe('newer');
  });

  it('accepts every linear pipeline stage as a candidate', () => {
    const stages: Entry['currentStage'][] = [
      'Ideas',
      'Planned',
      'Outlining',
      'Drafting',
      'Final',
    ];
    for (const stage of stages) {
      const entries: Entry[] = [
        makeEntry({
          uuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          currentStage: stage,
          reviewState: 'in-review',
        }),
      ];
      const picked = pickDefaultLongformEntry(entries);
      expect(picked?.currentStage).toBe(stage);
    }
  });
});
