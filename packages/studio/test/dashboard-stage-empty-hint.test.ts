/**
 * AUDIT-20260530-39 — `EDITORIAL_STAGE_EMPTY_HINTS` hardcoded the
 * editorial pipeline's eight stage names + bespoke empty-state copy
 * inside the studio renderer, gated on `templateId === 'editorial'`.
 * Same drift hazard AUDIT-20260530-19 named for `EDITORIAL_FALLBACK`
 * vs `editorial.json`: a stage rename in the JSON would silently
 * desync from the studio map.
 *
 * The fix moves the per-stage hint copy onto the pipeline template
 * itself (optional `stageEmptyHints` field, schema-validated). The
 * editorial preset carries the eight hints; the renderer reads
 * `template.stageEmptyHints?.[stage]` first and falls back to the
 * neutral `Nothing in ${stage.toLowerCase()}.` when the template
 * omits the field (or the specific stage). The `templateId ===
 * 'editorial'` special case is gone — every template's empty-state
 * vocabulary now travels with the template.
 *
 * These tests pin the contract from three directions:
 *
 *   1. Editorial template's bespoke hints come from `editorial.json`
 *      via the new `stageEmptyHints` field (the same verbatim strings
 *      the dashboard.test.ts + dashboard-swimlane-cta-render.test.ts
 *      suites assert end-to-end, but exercised through the unit-level
 *      renderer entry-point so a future stage rename in editorial.json
 *      flows through here without a studio-side patch).
 *
 *   2. A custom template with NO `stageEmptyHints` field falls back
 *      to the generic `Nothing in <stage>.` copy for every empty
 *      column — no editorial vocabulary leaks into other templates.
 *
 *   3. A custom template with PARTIAL `stageEmptyHints` (one stage
 *      named, another omitted) takes the named hint where present
 *      and the generic fallback where absent. Both branches active
 *      on the same lane proves the lookup is per-stage, not
 *      per-template.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSwimlane } from '@/pages/dashboard/swimlane-card.ts';
import type { LaneBucket } from '@/pages/dashboard/lane-data.ts';
import {
  loadPipelineTemplate,
  type PipelineTemplate,
} from '@deskwork/core/pipelines';
import type { LaneConfig } from '@deskwork/core/lanes';

function makeLane(id: string, pipelineTemplate: string): LaneConfig {
  return {
    id,
    name: id,
    pipelineTemplate,
    scaffoldDefaults: { markdown: 'docs' },
  };
}

function makeBucket(lane: LaneConfig, template: PipelineTemplate): LaneBucket {
  const byStage = new Map<string, readonly never[]>();
  for (const s of template.linearStages) byStage.set(s, []);
  for (const s of template.offPipelineStages) byStage.set(s, []);
  return {
    lane,
    template,
    byStage,
    unbucketed: [],
    entryCount: 0,
  };
}

/**
 * Extract the body of every `<div class="empty-state" data-empty-stage-msg>`
 * keyed by its parent `<section ... data-stage-col="...">` attribute, so
 * an assertion can target the hint for one specific stage on a rendered
 * lane.
 */
function extractEmptyHintsByStage(html: string): Map<string, string> {
  const result = new Map<string, string>();
  const sectionRe = /<section\s+class="stage-col[^"]*"[^>]*data-stage-col="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g;
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(html)) !== null) {
    const stage = m[1];
    const body = m[2];
    if (stage === undefined || body === undefined) continue;
    const hintMatch = body.match(
      /<div\s+class="empty-state"\s+data-empty-stage-msg>([^<]*)<\/div>/,
    );
    if (hintMatch && hintMatch[1] !== undefined) {
      result.set(stage, hintMatch[1]);
    }
  }
  return result;
}

describe('renderSwimlane — AUDIT-20260530-39 stage-empty-hint sourced from template', () => {
  it('editorial preset surfaces every stageEmptyHints entry from editorial.json', () => {
    // `loadPipelineTemplate('editorial', <empty project root>)` resolves
    // the plugin-default `editorial.json` (no operator override). The
    // hints come from the JSON now, not from a hardcoded map in
    // swimlane-card.ts.
    const projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-audit-39-editorial-'));
    try {
      const template = loadPipelineTemplate('editorial', projectRoot);
      // The template MUST carry stageEmptyHints (sourced from
      // editorial.json post-fix). The presence of this field on the
      // loaded template is the contract this fix lands; if a future
      // refactor strips the JSON field or the schema-side declaration,
      // this assertion fails before the dashboard renders.
      expect(template.stageEmptyHints).toBeDefined();
      const sourceHints = template.stageEmptyHints ?? {};
      const lane = makeLane('default', 'editorial');
      const bucket = makeBucket(lane, template);
      const html = renderSwimlane(bucket, 'd', false, new Map()).__raw;
      const hints = extractEmptyHintsByStage(html);
      // Every stage in editorial.json's stageEmptyHints must reach
      // the rendered DOM. The `<slug>` literal in the `Planned` hint
      // gets HTML-escaped to `&lt;slug&gt;` on render — handle that
      // single difference inline so the assertion compares the
      // JSON source against the escaped DOM output.
      for (const [stage, raw] of Object.entries(sourceHints)) {
        const escaped = raw.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        expect(hints.get(stage)).toBe(escaped);
      }
      // Belt-and-suspenders: the eight verbatim strings the
      // pre-AUDIT-39 hardcoded map carried still appear in
      // editorial.json so the existing dashboard.test.ts +
      // dashboard-swimlane-cta-render.test.ts assertions stay
      // green across the migration.
      expect(sourceHints['Ideas']).toBe('No open ideas. Run /deskwork:add to capture one.');
      expect(sourceHints['Planned']).toBe(
        'Nothing planned. /deskwork:approve <slug> to graduate an idea.',
      );
      expect(sourceHints['Outlining']).toBe('Nothing in outlining.');
      expect(sourceHints['Drafting']).toBe('No posts in drafting.');
      expect(sourceHints['Final']).toBe('Nothing in final review.');
      expect(sourceHints['Published']).toBe('No published posts yet.');
      expect(sourceHints['Blocked']).toBe('Nothing blocked.');
      expect(sourceHints['Cancelled']).toBe('No cancelled entries.');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('custom template with no stageEmptyHints falls back to generic hint on every stage', () => {
    const template: PipelineTemplate = {
      id: 'audit-39-no-hints',
      name: 'Audit 39 No Hints',
      description: 'Custom template with no stageEmptyHints — exercises the generic fallback.',
      linearStages: ['Drafted', 'Reviewed', 'Shipped'],
      offPipelineStages: ['Cancelled'],
    };
    const lane = makeLane('custom-no-hints', 'audit-39-no-hints');
    const bucket = makeBucket(lane, template);
    const html = renderSwimlane(bucket, 'd', false, new Map()).__raw;
    const hints = extractEmptyHintsByStage(html);
    // None of the editorial-specific strings may leak in — the
    // template carries no `stageEmptyHints`, so every column gets
    // the neutral `Nothing in ${stage.toLowerCase()}.` shape.
    expect(hints.get('Drafted')).toBe('Nothing in drafted.');
    expect(hints.get('Reviewed')).toBe('Nothing in reviewed.');
    expect(hints.get('Shipped')).toBe('Nothing in shipped.');
    expect(hints.get('Cancelled')).toBe('Nothing in cancelled.');
    // Sanity: no editorial vocabulary anywhere on the lane.
    expect(html).not.toContain('Run /deskwork:add');
    expect(html).not.toContain('graduate an idea');
  });

  it('custom template with partial stageEmptyHints uses named hint where present, generic fallback where absent', () => {
    const template: PipelineTemplate = {
      id: 'audit-39-partial',
      name: 'Audit 39 Partial Hints',
      description: 'Custom template with stageEmptyHints for only one stage — exercises per-stage lookup.',
      linearStages: ['Drafted', 'Reviewed', 'Shipped'],
      offPipelineStages: ['Cancelled'],
      stageEmptyHints: {
        // Drafted has a named hint.
        Drafted: 'Author the first draft when you are ready.',
        // Reviewed and Shipped intentionally omitted — they must
        // fall back to the generic `Nothing in <stage>.` copy.
      },
    };
    const lane = makeLane('custom-partial', 'audit-39-partial');
    const bucket = makeBucket(lane, template);
    const html = renderSwimlane(bucket, 'd', false, new Map()).__raw;
    const hints = extractEmptyHintsByStage(html);
    // Named hint surfaces verbatim.
    expect(hints.get('Drafted')).toBe('Author the first draft when you are ready.');
    // Omitted stages take the generic fallback — proves the lookup
    // is per-stage, not template-wide.
    expect(hints.get('Reviewed')).toBe('Nothing in reviewed.');
    expect(hints.get('Shipped')).toBe('Nothing in shipped.');
    expect(hints.get('Cancelled')).toBe('Nothing in cancelled.');
  });
});
