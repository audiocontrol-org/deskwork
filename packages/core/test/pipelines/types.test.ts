/**
 * PipelineTemplate Zod schema invariant tests.
 *
 * Each Zod refinement in `src/pipelines/types.ts` gets its own block
 * here. Refinements share a single test surface but the failure modes
 * are independent (subset, disjointness, reserved name) — we want each
 * to fail loudly on its own when broken.
 */

import { describe, it, expect } from 'vitest';
import { PipelineTemplateSchema } from '../../src/pipelines/types.ts';

/**
 * Helper: build a minimally-valid template, optionally overriding any
 * field. Keeps the per-test fixtures focused on the field under test.
 */
function makeTemplate(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'editorial',
    name: 'Editorial',
    description: 'Long-form writing pipeline.',
    linearStages: ['Ideas', 'Planned', 'Drafting', 'Final', 'Published'],
    lockedStages: ['Final'],
    offPipelineStages: ['Blocked', 'Cancelled'],
    ...overrides,
  };
}

describe('PipelineTemplateSchema', () => {
  describe('happy path', () => {
    it('accepts a minimally-valid template', () => {
      const result = PipelineTemplateSchema.safeParse(makeTemplate());
      expect(result.success).toBe(true);
    });

    it('accepts a template that omits lockedStages (the field is optional)', () => {
      const tpl = makeTemplate({ lockedStages: undefined });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(true);
    });

    it('accepts a template with empty offPipelineStages', () => {
      // Per the schema: offPipelineStages can be empty (no cul-de-sacs).
      // The cancel verb refuses at runtime if Cancelled is absent; the
      // schema does not enforce its presence.
      const tpl = makeTemplate({ offPipelineStages: [] });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(true);
    });

    it('passes through unknown top-level fields (e.g. $rationale)', () => {
      const tpl = makeTemplate({ $rationale: 'why this pipeline exists' });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(true);
    });
  });

  describe('required fields', () => {
    it('rejects a missing id', () => {
      const tpl = makeTemplate({ id: undefined });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(false);
    });

    it('rejects an empty-string id', () => {
      const tpl = makeTemplate({ id: '' });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(false);
    });

    it('rejects a missing name', () => {
      const tpl = makeTemplate({ name: undefined });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(false);
    });

    it('rejects a missing description', () => {
      const tpl = makeTemplate({ description: undefined });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(false);
    });
  });

  describe('linearStages invariants', () => {
    it('rejects an empty linearStages array', () => {
      const tpl = makeTemplate({ linearStages: [] });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(false);
    });

    it('rejects empty-string stage names', () => {
      const tpl = makeTemplate({ linearStages: ['Ideas', '', 'Final', 'Published'] });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(false);
    });

    it('rejects duplicate stage names in linearStages', () => {
      const tpl = makeTemplate({ linearStages: ['Ideas', 'Drafting', 'Drafting', 'Published'] });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(false);
    });

    it('rejects "Cancelled" inside linearStages (reserved name)', () => {
      const tpl = makeTemplate({
        linearStages: ['Ideas', 'Cancelled', 'Published'],
        offPipelineStages: ['Blocked'],
      });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((issue) => issue.message);
        expect(messages.some((m) => m.includes('reserved'))).toBe(true);
      }
    });
  });

  describe('lockedStages invariants', () => {
    it('rejects lockedStages that are not a subset of linearStages', () => {
      const tpl = makeTemplate({
        linearStages: ['Ideas', 'Drafting', 'Published'],
        lockedStages: ['Final'],
      });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((issue) => issue.message);
        expect(messages.some((m) => m.includes('subset'))).toBe(true);
      }
    });

    it('rejects duplicate entries inside lockedStages', () => {
      const tpl = makeTemplate({
        linearStages: ['Ideas', 'Drafting', 'Final', 'Published'],
        lockedStages: ['Final', 'Final'],
      });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(false);
    });

    it('accepts an empty lockedStages array (workflow with no pre-terminal lock)', () => {
      const tpl = makeTemplate({ lockedStages: [] });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(true);
    });
  });

  describe('offPipelineStages invariants', () => {
    it('rejects overlap between linearStages and offPipelineStages', () => {
      const tpl = makeTemplate({
        linearStages: ['Ideas', 'Drafting', 'Blocked', 'Published'],
        lockedStages: [],
        offPipelineStages: ['Blocked', 'Cancelled'],
      });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((issue) => issue.message);
        expect(messages.some((m) => m.includes('overlap'))).toBe(true);
      }
    });

    it('rejects duplicate entries inside offPipelineStages', () => {
      const tpl = makeTemplate({ offPipelineStages: ['Blocked', 'Blocked', 'Cancelled'] });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(false);
    });

    it('accepts an Archived cul-de-sac alongside Blocked / Cancelled', () => {
      const tpl = makeTemplate({ offPipelineStages: ['Blocked', 'Cancelled', 'Archived'] });
      const result = PipelineTemplateSchema.safeParse(tpl);
      expect(result.success).toBe(true);
    });
  });
});
