import { describe, it, expect } from 'vitest';
import type { Stage, ReviewState } from '@/schema/entry';
import { isLinearPipelineStage, isOffPipelineStage, nextStage } from '@/schema/entry';

// ReviewState is referenced here so the type-only import compiles cleanly under
// `noUnusedLocals`. Its enum members are exercised by downstream tests in later
// tasks; this task only asserts the type exists and the Stage helpers behave.
const _reviewStateRef: ReviewState = 'in-review';
void _reviewStateRef;

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
