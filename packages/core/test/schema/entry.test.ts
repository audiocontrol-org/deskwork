import { describe, it, expect } from 'vitest';
import type { Stage } from '@/schema/entry';
import { isLinearPipelineStage, isOffPipelineStage, nextStage, EntrySchema, type Entry } from '@/schema/entry';

describe('Stage enum', () => {
  it('contains all eight stages', () => {
    const stages: Stage[] = ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled'];
    expect(stages.length).toBe(8);
  });

  it('isLinearPipelineStage returns true for pipeline stages', () => {
    expect(isLinearPipelineStage('Ideas')).toBe(true);
    expect(isLinearPipelineStage('Drafting')).toBe(true);
    expect(isLinearPipelineStage('Published')).toBe(true);
  });

  it('isLinearPipelineStage returns false for off-pipeline stages', () => {
    expect(isLinearPipelineStage('Blocked')).toBe(false);
    expect(isLinearPipelineStage('Cancelled')).toBe(false);
  });

  it('isOffPipelineStage is the inverse', () => {
    expect(isOffPipelineStage('Blocked')).toBe(true);
    expect(isOffPipelineStage('Drafting')).toBe(false);
  });

  it('nextStage returns the linear successor', () => {
    expect(nextStage('Ideas')).toBe('Planned');
    expect(nextStage('Planned')).toBe('Outlining');
    expect(nextStage('Outlining')).toBe('Drafting');
    expect(nextStage('Drafting')).toBe('Final');
  });

  it('nextStage returns null for stages without a forward successor', () => {
    expect(nextStage('Final')).toBe(null);       // use publish, not approve
    expect(nextStage('Published')).toBe(null);
    expect(nextStage('Blocked')).toBe(null);
    expect(nextStage('Cancelled')).toBe(null);
  });
});

describe('EntrySchema', () => {
  it('parses a valid Ideas entry', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'my-article',
      title: 'My Article',
      keywords: ['kw1'],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    const result = EntrySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('parses a valid Drafting entry with reviewState', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440001',
      slug: 'my-second-article',
      title: 'My Second',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: { Ideas: 3, Planned: 2, Outlining: 4, Drafting: 7 },
      reviewState: 'in-review',
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T11:00:00.000Z',
    };
    expect(EntrySchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an entry with unknown stage', () => {
    const invalid = {
      uuid: '550e8400-e29b-41d4-a716-446655440002',
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Reviewing',  // not a real stage
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects an entry with malformed uuid', () => {
    const invalid = {
      uuid: 'not-a-uuid',
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(invalid).success).toBe(false);
  });

  it('parses a Blocked entry with priorStage', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440003',
      slug: 'paused-thing',
      title: 'Paused Thing',
      keywords: [],
      source: 'manual',
      currentStage: 'Blocked',
      priorStage: 'Drafting',
      iterationByStage: { Ideas: 1, Planned: 1, Outlining: 1, Drafting: 5 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(valid).success).toBe(true);
  });
});
