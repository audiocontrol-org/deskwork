/**
 * Vocabulary tests for the Compositor's Manual at /dev/editorial-help.
 *
 * Pipeline-redesign Task 37 gate: the rendered Manual MUST
 *   - present the universal verbs (add, iterate, approve, publish,
 *     block, cancel, induct, status, doctor)
 *   - mention every on-pipeline and off-pipeline stage
 *   - NOT reference the retired stage-named skills (plan, outline,
 *     draft, pause, resume, review-start, review-cancel, review-help,
 *     review-report)
 *   - NOT reference the retired stage names (Review-as-a-stage, Paused)
 *
 * The tests render `renderHelpPage` directly with a minimal stub
 * `StudioContext` rather than booting the Hono app — vocabulary is a
 * property of the page renderer alone; routing is covered elsewhere.
 */

import { describe, it, expect } from 'vitest';
import type { DeskworkConfig } from '@deskwork/core/config';
import { renderHelpPage } from '../src/pages/help.ts';
import type { StudioContext } from '../src/routes/api.ts';

function makeContext(): StudioContext {
  const config: DeskworkConfig = {
    version: 1,
    sites: {
      a: {
        host: 'a.example',
        contentDir: 'src/sites/a/content/blog',
        calendarPath: 'docs/cal-a.md',
        blogFilenameTemplate: '{slug}.md',
      },
    },
    defaultSite: 'a',
  };
  return {
    projectRoot: '/tmp/help-vocab-test',
    config,
    // Deterministic clock for the cover masthead — the test does not
    // assert on the date string but pinning it keeps output stable.
    now: () => new Date('2026-04-30T00:00:00Z'),
  };
}

describe('help page vocabulary', () => {
  it('contains the universal verbs', () => {
    const html = renderHelpPage(makeContext());
    expect(html).toContain('/deskwork:add');
    expect(html).toContain('/deskwork:iterate');
    expect(html).toContain('/deskwork:approve');
    expect(html).toContain('/deskwork:publish');
    expect(html).toContain('/deskwork:block');
    expect(html).toContain('/deskwork:cancel');
    expect(html).toContain('/deskwork:induct');
    expect(html).toContain('/deskwork:status');
    expect(html).toContain('/deskwork:doctor');
  });

  it('does not reference retired stage-named skills', () => {
    const html = renderHelpPage(makeContext());
    expect(html).not.toContain('/deskwork:plan');
    expect(html).not.toContain('/deskwork:outline');
    expect(html).not.toContain('/deskwork:draft');
    expect(html).not.toContain('/deskwork:pause');
    expect(html).not.toContain('/deskwork:resume');
    expect(html).not.toContain('/deskwork:review-start');
    expect(html).not.toContain('/deskwork:review-cancel');
    expect(html).not.toContain('/deskwork:review-help');
    expect(html).not.toContain('/deskwork:review-report');
  });

  it('mentions all eight stages (six on-pipeline, two off-pipeline)', () => {
    const html = renderHelpPage(makeContext());
    for (const stage of [
      'Ideas',
      'Planned',
      'Outlining',
      'Drafting',
      'Final',
      'Published',
      'Blocked',
      'Cancelled',
    ]) {
      expect(html).toContain(stage);
    }
  });

  it('names the per-stage primary artifacts', () => {
    const html = renderHelpPage(makeContext());
    expect(html).toContain('idea.md');
    expect(html).toContain('plan.md');
    expect(html).toContain('outline.md');
    expect(html).toContain('index.md');
  });

  it('describes approve as graduate-by-one-stage discipline', () => {
    const html = renderHelpPage(makeContext());
    // The Manual's promise: there is no "approve but stay" — approve
    // advances by exactly one stage. The phrasing here is the same the
    // run-through and Section I both rely on; if either drops it, the
    // test fails and the operator-facing message stays consistent.
    expect(html).toContain('exactly one');
  });

  it('describes induct semantics (preserves iterationByStage; default destinations)', () => {
    const html = renderHelpPage(makeContext());
    // Re-induct preserves the per-stage iteration counter so the
    // operator picks up where they left off.
    expect(html).toContain('iterationByStage');
    // Default destination wording: priorStage for Blocked/Cancelled,
    // Drafting for Final.
    expect(html).toContain('priorStage');
    expect(html).toContain('Drafting');
  });

  it('distinguishes Blocked (process flag) from Cancelled (semantic flag)', () => {
    const html = renderHelpPage(makeContext());
    // Blocked = process flag, resumable; Cancelled = intent abandoned.
    // Vocabulary anchors:
    expect(html).toContain('process flag');
    expect(html).toContain('semantic flag');
    expect(html).toContain('resumable');
    expect(html).toContain('abandoned');
  });

  it('names the sidecar as source of truth', () => {
    const html = renderHelpPage(makeContext());
    expect(html).toContain('.deskwork/entries/');
    // Sidecar is canonical; calendar.md is regenerated from it.
    expect(html).toContain('regenerated from sidecars');
  });

  it('keys the entry review surface by uuid (not workflow id)', () => {
    const html = renderHelpPage(makeContext());
    expect(html).toContain('/dev/editorial-review/entry/');
  });

  it('does NOT use Review or Paused as on-pipeline stage names', () => {
    const html = renderHelpPage(makeContext());
    // The literal stage chips/columns must not include Review or
    // Paused — they were dropped (Review was a stage in the prior
    // model; Paused is replaced by Blocked).
    //
    // The catalogue still references the workflow review-journal
    // directories as a substring of file paths, so we anchor these
    // matches to the studio keyboard hints for the legacy columns
    // (`jump to Paused`, `jump to Review`) which would only appear if
    // someone re-introduced those stages as columns.
    expect(html).not.toContain('jump to Review');
    expect(html).not.toContain('jump to Paused');
    // The on-pipeline diagram must not include a "Paused" stage box.
    expect(html).not.toMatch(/<div class="name">Paused<\/div>/);
    // Section I's Fig. 1 (forward-only on-pipeline chain) must not
    // include a Review stage box.
    expect(html).not.toMatch(/<div class="name">Review<\/div>/);
  });
});
