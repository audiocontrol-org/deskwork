/**
 * Unit-level tests for the per-lane swimlane card renderer
 * (`packages/studio/src/pages/dashboard/swimlane-card.ts`).
 *
 * These tests exercise `renderSwimlane` directly with a hand-rolled
 * `LaneBucket` rather than booting the studio app — they target a
 * single renderer-side invariant per test, where the integration
 * tests in `dashboard-swimlane.test.ts` already cover the end-to-end
 * shape.
 *
 * Scope:
 *
 *   - AUDIT-20260528-07: stage DOM ids must be unique within a lane
 *     when two stage names differ only by `_` vs ` ` (e.g.
 *     `"QA Review"` vs `"QA_Review"` — both permitted by the
 *     pipeline-template schema; their filesystem tokens are
 *     `qa-review` and `qa_review` respectively, NOT collapsed to a
 *     single value as the prior local regex did).
 */

import { describe, it, expect } from 'vitest';
import { renderSwimlane } from '@/pages/dashboard/swimlane-card.ts';
import type { LaneBucket } from '@/pages/dashboard/lane-data.ts';
import type { StrictPipelineTemplate } from '@deskwork/core/pipelines';
import type { StrictLaneConfig } from '@deskwork/core/lanes';

function makeTemplate(stages: readonly string[]): StrictPipelineTemplate {
  return {
    id: 'test-collide',
    description: 'Test template covering stage-token-collision DOM ids',
    linearStages: [...stages],
    offPipelineStages: [],
    lockedStages: [],
  };
}

function makeLane(): StrictLaneConfig {
  return {
    id: 'test-lane',
    name: 'Test Lane',
    pipelineTemplate: 'test-collide',
    contentDir: 'docs',
  };
}

function makeBucket(stages: readonly string[]): LaneBucket {
  const byStage = new Map<string, readonly never[]>();
  for (const s of stages) byStage.set(s, []);
  return {
    lane: makeLane(),
    template: makeTemplate(stages),
    byStage,
    unbucketed: [],
    entryCount: 0,
  };
}

describe('renderSwimlane — AUDIT-20260528-07 stage DOM-id uniqueness', () => {
  it('emits distinct DOM ids for stages that differ only in `_` vs space', () => {
    // Both names are permitted by `stageNameToFilesystemToken`
    // (underscores are explicitly allowed by the regex in
    // packages/core/src/pipelines/stage-token.ts:71). The prior local
    // tokenizer in swimlane-card collapsed `_` and ` ` to the same
    // hyphen, producing duplicate `id="lane-test-lane-stage-qa-review"`
    // attributes on the rendered article.
    const bucket = makeBucket(['QA Review', 'QA_Review']);
    const html = renderSwimlane(bucket, 'd', false, new Map()).__raw;
    // Gather every id attribute value on the rendered output.
    const idMatches = html.match(/\sid="([^"]+)"/g) ?? [];
    const idValues = idMatches.map((m) => m.replace(/^\sid="(.+)"$/, '$1'));
    // The two stage columns produce distinct lane-scoped ids.
    expect(idValues).toContain('lane-test-lane-stage-qa-review');
    expect(idValues).toContain('lane-test-lane-stage-qa_review');
    // No duplicates across the entire output.
    const dedup = new Set(idValues);
    expect(dedup.size).toBe(idValues.length);
  });
});
