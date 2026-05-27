import { describe, it, expect } from 'vitest';
import {
  isLinearPipelineStageInTemplate,
  isOffPipelineStageInTemplate,
  isLockedStageInTemplate,
  isKnownStageInTemplate,
  nextStageInTemplate,
  assertStageInTemplate,
  terminalLinearStage,
  preTerminalLinearStage,
} from '@/pipelines/helpers';
import type { StrictPipelineTemplate } from '@/pipelines/types';

const editorial: StrictPipelineTemplate = {
  id: 'editorial',
  name: 'Editorial',
  description: 'edt',
  linearStages: ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published'],
  lockedStages: ['Final'],
  offPipelineStages: ['Blocked', 'Cancelled'],
};

const visual: StrictPipelineTemplate = {
  id: 'visual',
  name: 'Visual',
  description: 'vis',
  linearStages: ['Sketched', 'Iterating', 'Approved', 'Shipped'],
  lockedStages: ['Approved'],
  offPipelineStages: ['Blocked', 'Cancelled', 'Archived'],
};

describe('pipeline helpers', () => {
  describe('isLinearPipelineStageInTemplate', () => {
    it('returns true for editorial linear stages', () => {
      expect(isLinearPipelineStageInTemplate(editorial, 'Ideas')).toBe(true);
      expect(isLinearPipelineStageInTemplate(editorial, 'Final')).toBe(true);
      expect(isLinearPipelineStageInTemplate(editorial, 'Published')).toBe(true);
    });

    it('returns false for editorial off-pipeline stages', () => {
      expect(isLinearPipelineStageInTemplate(editorial, 'Blocked')).toBe(false);
      expect(isLinearPipelineStageInTemplate(editorial, 'Cancelled')).toBe(false);
    });

    it('returns false for visual stages in editorial template', () => {
      expect(isLinearPipelineStageInTemplate(editorial, 'Sketched')).toBe(false);
      expect(isLinearPipelineStageInTemplate(editorial, 'Shipped')).toBe(false);
    });

    it('returns true for visual linear stages in visual template', () => {
      expect(isLinearPipelineStageInTemplate(visual, 'Sketched')).toBe(true);
      expect(isLinearPipelineStageInTemplate(visual, 'Approved')).toBe(true);
      expect(isLinearPipelineStageInTemplate(visual, 'Shipped')).toBe(true);
    });
  });

  describe('isOffPipelineStageInTemplate', () => {
    it('detects editorial off-pipeline stages', () => {
      expect(isOffPipelineStageInTemplate(editorial, 'Blocked')).toBe(true);
      expect(isOffPipelineStageInTemplate(editorial, 'Cancelled')).toBe(true);
      expect(isOffPipelineStageInTemplate(editorial, 'Ideas')).toBe(false);
    });

    it('detects visual off-pipeline stages including Archived', () => {
      expect(isOffPipelineStageInTemplate(visual, 'Archived')).toBe(true);
      expect(isOffPipelineStageInTemplate(visual, 'Blocked')).toBe(true);
      expect(isOffPipelineStageInTemplate(visual, 'Sketched')).toBe(false);
    });
  });

  describe('isLockedStageInTemplate', () => {
    it('detects the editorial lock at Final', () => {
      expect(isLockedStageInTemplate(editorial, 'Final')).toBe(true);
      expect(isLockedStageInTemplate(editorial, 'Drafting')).toBe(false);
    });

    it('detects the visual lock at Approved', () => {
      expect(isLockedStageInTemplate(visual, 'Approved')).toBe(true);
      expect(isLockedStageInTemplate(visual, 'Sketched')).toBe(false);
    });

    it('returns false when template has no lockedStages', () => {
      const lockless: StrictPipelineTemplate = {
        id: 'lockless',
        name: 'lockless',
        description: 'd',
        linearStages: ['A', 'B'],
        offPipelineStages: [],
      };
      expect(isLockedStageInTemplate(lockless, 'A')).toBe(false);
      expect(isLockedStageInTemplate(lockless, 'B')).toBe(false);
    });
  });

  describe('isKnownStageInTemplate', () => {
    it('returns true for either linear or off-pipeline stages', () => {
      expect(isKnownStageInTemplate(editorial, 'Ideas')).toBe(true);
      expect(isKnownStageInTemplate(editorial, 'Cancelled')).toBe(true);
    });

    it('returns false for stages outside the template vocabulary', () => {
      expect(isKnownStageInTemplate(editorial, 'Sketched')).toBe(false);
      expect(isKnownStageInTemplate(visual, 'Drafting')).toBe(false);
    });
  });

  describe('nextStageInTemplate', () => {
    it('returns the editorial successor', () => {
      expect(nextStageInTemplate(editorial, 'Ideas')).toBe('Planned');
      expect(nextStageInTemplate(editorial, 'Drafting')).toBe('Final');
      expect(nextStageInTemplate(editorial, 'Final')).toBe('Published');
    });

    it('returns null at the editorial terminal stage', () => {
      expect(nextStageInTemplate(editorial, 'Published')).toBeNull();
    });

    it('returns the visual successor', () => {
      expect(nextStageInTemplate(visual, 'Sketched')).toBe('Iterating');
      expect(nextStageInTemplate(visual, 'Approved')).toBe('Shipped');
    });

    it('returns null at the visual terminal stage', () => {
      expect(nextStageInTemplate(visual, 'Shipped')).toBeNull();
    });

    it('throws for an off-pipeline stage', () => {
      expect(() => nextStageInTemplate(editorial, 'Cancelled')).toThrow(/not in template "editorial".linearStages/);
    });

    it('throws for an unknown stage', () => {
      expect(() => nextStageInTemplate(editorial, 'Sketched')).toThrow(/not in template "editorial".linearStages/);
    });
  });

  describe('assertStageInTemplate', () => {
    it('passes for a known stage', () => {
      expect(() => assertStageInTemplate(editorial, 'Drafting', 'test')).not.toThrow();
      expect(() => assertStageInTemplate(visual, 'Archived', 'test')).not.toThrow();
    });

    it('throws with the full allowed stage list for an unknown stage', () => {
      expect(() => assertStageInTemplate(editorial, 'Sketched', 'approveEntryStage')).toThrow(/approveEntryStage.*Sketched.*editorial/);
      expect(() => assertStageInTemplate(editorial, 'Sketched', 'approveEntryStage')).toThrow(/Ideas, Planned, Outlining, Drafting, Final, Published, Blocked, Cancelled/);
    });
  });

  describe('terminalLinearStage / preTerminalLinearStage', () => {
    it('identifies editorial terminal + pre-terminal positions', () => {
      expect(terminalLinearStage(editorial)).toBe('Published');
      expect(preTerminalLinearStage(editorial)).toBe('Final');
    });

    it('identifies visual terminal + pre-terminal positions', () => {
      expect(terminalLinearStage(visual)).toBe('Shipped');
      expect(preTerminalLinearStage(visual)).toBe('Approved');
    });

    it('returns null for preTerminal when only one linear stage', () => {
      const single: StrictPipelineTemplate = {
        id: 'single',
        name: 's',
        description: 'd',
        linearStages: ['One'],
        offPipelineStages: [],
      };
      expect(terminalLinearStage(single)).toBe('One');
      expect(preTerminalLinearStage(single)).toBeNull();
    });
  });
});
