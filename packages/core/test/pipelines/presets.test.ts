/**
 * Preset template validation.
 *
 * Asserts each shipped preset:
 *   - loads cleanly via the resolver,
 *   - passes Zod validation,
 *   - matches the stage layout the PRD specifies (verbatim).
 *
 * The shipped values are the auto-migration target for pre-feature
 * projects (editorial) and the documented adopter-facing contract for
 * the other four — a silent drift here is exactly the failure mode the
 * test catches.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadPipelineTemplate,
  listAvailablePipelineTemplates,
} from '../../src/pipelines/loader.ts';
import { PipelineTemplateSchema } from '../../src/pipelines/types.ts';

/**
 * Expected shipped shape per preset (PRD § Preset templates).
 * Keep this table in sync with the workplan + JSON.
 */
const EXPECTED_PRESETS: Record<
  string,
  {
    linearStages: string[];
    lockedStages: string[] | undefined;
    offPipelineStages: string[];
  }
> = {
  editorial: {
    linearStages: ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published'],
    lockedStages: ['Final'],
    offPipelineStages: ['Blocked', 'Cancelled'],
  },
  visual: {
    linearStages: ['Sketched', 'Iterating', 'Approved', 'Shipped'],
    lockedStages: ['Approved'],
    offPipelineStages: ['Blocked', 'Cancelled', 'Archived'],
  },
  'feature-doc': {
    linearStages: ['Defined', 'Drafting', 'Approved', 'Implemented', 'Complete'],
    lockedStages: ['Approved', 'Implemented'],
    offPipelineStages: ['Blocked', 'Cancelled'],
  },
  'qa-plan': {
    linearStages: ['Drafted', 'Reviewed', 'Tested', 'Approved'],
    lockedStages: ['Reviewed'],
    offPipelineStages: ['Blocked', 'Cancelled', 'Archived'],
  },
  'blog-post': {
    linearStages: ['Idea', 'Drafting', 'Edited', 'Published'],
    lockedStages: ['Edited'],
    offPipelineStages: ['Blocked', 'Cancelled'],
  },
};

describe('preset pipeline templates', () => {
  let projectRoot: string;

  beforeEach(() => {
    // Empty project root — exercises the plugin-default-fallback path.
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-presets-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('listAvailablePipelineTemplates includes all five preset ids', () => {
    const ids = listAvailablePipelineTemplates(projectRoot);
    for (const id of Object.keys(EXPECTED_PRESETS)) {
      expect(ids).toContain(id);
    }
  });

  for (const [id, expected] of Object.entries(EXPECTED_PRESETS)) {
    describe(`preset: ${id}`, () => {
      it('loads via the resolver and passes Zod validation', () => {
        const template = loadPipelineTemplate(id, projectRoot);
        // Re-validate explicitly so a future loader bug that skips the
        // schema check still gets caught here.
        const result = PipelineTemplateSchema.safeParse(template);
        expect(result.success).toBe(true);
      });

      it('matches the PRD-specified stage layout', () => {
        const template = loadPipelineTemplate(id, projectRoot);
        expect(template.id).toBe(id);
        expect(template.linearStages).toEqual(expected.linearStages);
        expect(template.lockedStages).toEqual(expected.lockedStages);
        expect(template.offPipelineStages).toEqual(expected.offPipelineStages);
      });

      it('has a non-empty name and description', () => {
        const template = loadPipelineTemplate(id, projectRoot);
        expect(template.name.length).toBeGreaterThan(0);
        expect(template.description.length).toBeGreaterThan(0);
      });
    });
  }
});
