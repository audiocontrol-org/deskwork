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
 *   - AUDIT-20260530-31 (cross-model: AUDIT-BARRAGE-gemini-P5-1):
 *     re-surfacing of -07 by the audit barrage. The gemini reviewer
 *     cited the pre-`a281ea7` source (line 127 of swimlane-card.ts)
 *     and noted `renderListGroup` as an "implicit" sibling site. The
 *     stage path in `renderSwimlane` is already fixed via
 *     `stageNameToFilesystemToken`; this task extends regression
 *     coverage to the list-body path (`renderListBody` →
 *     `renderListGroup`) so the no-collision contract is pinned on
 *     BOTH dashboard surfaces. `renderListGroup` does not emit an
 *     `id` attribute today (only `data-lb-group="<stage>"`), but the
 *     verbatim-stage attribute MUST stay distinct across the two
 *     collision-prone stage names — pinning the contract here means
 *     a future patch that adds an id (or that swaps the data-attr
 *     derivation) can't silently re-introduce the collision class.
 */

import { describe, it, expect } from 'vitest';
import { renderSwimlane } from '@/pages/dashboard/swimlane-card.ts';
import { renderListBody } from '@/pages/dashboard/swimlane-list-body.ts';
import type { LaneBucket } from '@/pages/dashboard/lane-data.ts';
import type { PipelineTemplate } from '@deskwork/core/pipelines';
import type { LaneConfig } from '@deskwork/core/lanes';

function makeTemplate(stages: readonly string[]): PipelineTemplate {
  return {
    id: 'test-collide',
    description: 'Test template covering stage-token-collision DOM ids',
    linearStages: [...stages],
    offPipelineStages: [],
    lockedStages: [],
  };
}

function makeLane(): LaneConfig {
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

describe('renderListBody — AUDIT-20260530-31 list-group stage uniqueness', () => {
  it('emits distinct `data-lb-group` attrs for stages differing only in `_` vs space', () => {
    // The list-body renders one `.lb-group` per template stage and
    // tags each with `data-lb-group="<stage>"` (verbatim stage name,
    // unmodified). The prior collision shape that bit the kanban
    // surface (AUDIT-20260528-07) could have re-surfaced here if the
    // attribute had ever been derived from a lossy slugifier instead
    // of the verbatim stage. Pin the verbatim-stage contract so a
    // future patch that introduces an id or swaps the data-attr
    // derivation can't silently re-introduce the collision class
    // gemini flagged in AUDIT-20260530-31.
    const bucket = makeBucket(['QA Review', 'QA_Review']);
    const html = renderListBody(bucket, 'd').__raw;
    // Gather every `data-lb-group` attribute value on the rendered
    // list-body output.
    const lbGroupMatches = html.match(/\sdata-lb-group="([^"]+)"/g) ?? [];
    const lbGroupValues = lbGroupMatches.map((m) =>
      m.replace(/^\sdata-lb-group="(.+)"$/, '$1'),
    );
    // The two stages produce distinct verbatim attribute values.
    expect(lbGroupValues).toContain('QA Review');
    expect(lbGroupValues).toContain('QA_Review');
    // No duplicates across the entire output.
    const dedup = new Set(lbGroupValues);
    expect(dedup.size).toBe(lbGroupValues.length);
  });

  it('emits no duplicate `id` attributes on the list-body surface', () => {
    // `renderListGroup` does not currently derive a DOM id from the
    // stage name (per swimlane-list-body.ts:132-148 — only
    // `data-lb-group`). Pin the no-duplicate-id contract on the
    // list-body output so a future patch that adds a stage-derived
    // id can't silently re-introduce the AUDIT-20260530-31
    // collision class.
    const bucket = makeBucket(['QA Review', 'QA_Review']);
    const html = renderListBody(bucket, 'd').__raw;
    const idMatches = html.match(/\sid="([^"]+)"/g) ?? [];
    const idValues = idMatches.map((m) => m.replace(/^\sid="(.+)"$/, '$1'));
    const dedup = new Set(idValues);
    expect(dedup.size).toBe(idValues.length);
  });
});
