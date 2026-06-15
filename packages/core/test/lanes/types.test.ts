/**
 * LaneConfig Zod schema invariant tests.
 *
 * Mirrors the structure of pipelines/types.test.ts — each schema
 * invariant gets its own block.
 */

import { describe, it, expect } from 'vitest';
import { LaneConfigSchema, ArtifactKindSchema } from '../../src/lanes/types.ts';

/**
 * Helper: build a minimally-valid lane config, optionally overriding
 * any field. Keeps per-test fixtures focused on the field under test.
 */
function makeLane(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'default',
    name: 'Default',
    pipelineTemplate: 'editorial',
    ...overrides,
  };
}

describe('LaneConfigSchema', () => {
  describe('happy path', () => {
    it('accepts a minimally-valid lane', () => {
      const result = LaneConfigSchema.safeParse(makeLane());
      expect(result.success).toBe(true);
    });

    it('passes through unknown top-level fields (e.g. $rationale)', () => {
      const result = LaneConfigSchema.safeParse(
        makeLane({ $rationale: 'why this lane exists' }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe('required fields', () => {
    it('rejects a missing id', () => {
      const result = LaneConfigSchema.safeParse(makeLane({ id: undefined }));
      expect(result.success).toBe(false);
    });

    it('rejects an empty id', () => {
      const result = LaneConfigSchema.safeParse(makeLane({ id: '' }));
      expect(result.success).toBe(false);
    });

    it('rejects a missing name', () => {
      const result = LaneConfigSchema.safeParse(makeLane({ name: undefined }));
      expect(result.success).toBe(false);
    });

    it('rejects an empty name', () => {
      const result = LaneConfigSchema.safeParse(makeLane({ name: '' }));
      expect(result.success).toBe(false);
    });

    it('rejects a missing pipelineTemplate', () => {
      const result = LaneConfigSchema.safeParse(
        makeLane({ pipelineTemplate: undefined }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects an empty pipelineTemplate', () => {
      const result = LaneConfigSchema.safeParse(
        makeLane({ pipelineTemplate: '' }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe('contentDir removal (Phase 39 sites→lanes retirement)', () => {
    it('accepts a lane that omits contentDir entirely (no longer a field)', () => {
      const result = LaneConfigSchema.safeParse(makeLane());
      expect(result.success).toBe(true);
    });

    it('REJECTS a lane that still carries contentDir (now an unknown key under .strict())', () => {
      const result = LaneConfigSchema.safeParse(
        makeLane({ contentDir: 'docs' }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.message.toLowerCase().includes('unrecognized')
          || i.path.includes('contentDir'),
        );
        expect(issue).toBeDefined();
      }
    });
  });

  describe('field types', () => {
    it('rejects non-string id', () => {
      const result = LaneConfigSchema.safeParse(makeLane({ id: 42 }));
      expect(result.success).toBe(false);
    });

    it('rejects non-string scaffoldDefaults value', () => {
      const result = LaneConfigSchema.safeParse(
        makeLane({ scaffoldDefaults: { markdown: ['docs'] } }),
      );
      expect(result.success).toBe(false);
    });
  });
});

describe('ArtifactKindSchema', () => {
  it('accepts every supported kind', () => {
    expect(ArtifactKindSchema.safeParse('markdown').success).toBe(true);
    expect(ArtifactKindSchema.safeParse('html-mockup').success).toBe(true);
    expect(ArtifactKindSchema.safeParse('single-file-html').success).toBe(true);
    expect(ArtifactKindSchema.safeParse('image').success).toBe(true);
  });

  it('rejects unknown kinds', () => {
    expect(ArtifactKindSchema.safeParse('pdf').success).toBe(false);
    expect(ArtifactKindSchema.safeParse('').success).toBe(false);
    expect(ArtifactKindSchema.safeParse(null).success).toBe(false);
  });
});
