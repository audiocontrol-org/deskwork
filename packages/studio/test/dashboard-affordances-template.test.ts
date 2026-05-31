/**
 * Template-aware verb dispatch tests — Phase 5 Task 5.2 Step 5.2.1.
 *
 * The `verbsForStage` resolver in `packages/studio/src/pages/
 * dashboard/affordances.ts` now categorizes a stage against its
 * pipeline template (linearStages / lockedStages / offPipelineStages
 * / terminal position) and emits the verb set for that category. The
 * tests below pin one example per category per template:
 *
 *   - Off-pipeline (Blocked / Cancelled / Archived) — inductForward
 *     + scrapbook only.
 *   - Terminal (last linearStages member) — view + scrapbook only.
 *   - Locked — approve (labeled `Approve → <nextLinearStage>`) +
 *     scrapbook; menu carries block + induct + cancel.
 *   - Active linear — iterate + approve + scrapbook; menu carries
 *     block + induct + cancel.
 *
 * Per DESKWORK-STATE-MACHINE.md Commandment II, verbs are universal
 * and stage-gated — the categorization is what differs across
 * templates, not the verb set itself. The renderer emits the same
 * `/deskwork:<verb> <slug>` slash commands regardless of template.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  verbsForStage,
  classifyStage,
  renderRowActions,
  renderRowDrawer,
  renderRowMenu,
} from '../src/pages/dashboard/affordances.ts';
import { loadPipelineTemplate } from '@deskwork/core/pipelines';
import type { PipelineTemplate } from '@deskwork/core/pipelines';
import type { Entry } from '@deskwork/core/schema/entry';

// Resolve every template via the public loader against an empty
// projectRoot — the loader falls through to the plugin-built-in
// presets in `packages/core/src/pipelines/*.json`. No fixture-disk
// JSON authoring required.
const tmpRoot = mkdtempSync(join(tmpdir(), 'dw-affordances-tests-'));
const editorial: PipelineTemplate = loadPipelineTemplate('editorial', tmpRoot);
const visual: PipelineTemplate = loadPipelineTemplate('visual', tmpRoot);
const featureDoc: PipelineTemplate = loadPipelineTemplate(
  'feature-doc',
  tmpRoot,
);
const qaPlan: PipelineTemplate = loadPipelineTemplate('qa-plan', tmpRoot);
const blogPost: PipelineTemplate = loadPipelineTemplate('blog-post', tmpRoot);

// Vitest's per-file lifecycle — tear the tmp root down after every
// test in this file has resolved its templates above. Templates are
// loaded eagerly at module-load, so the cleanup at process-exit time
// is the operator-side hygiene step rather than a test-side one.
process.on('exit', () => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // Process is exiting; suppressing cleanup failure is acceptable
    // here per the existing in-repo `mkdtempSync` test pattern.
  }
});

function makeEntry(stage: string, slug: string = 'x'): Entry {
  return {
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    slug,
    title: 'X',
    keywords: [],
    source: 'manual',
    currentStage: stage,
    iterationByStage: {},
    createdAt: '2026-05-28T10:00:00.000Z',
    updatedAt: '2026-05-28T10:00:00.000Z',
  };
}

const DEFAULT_SITE = 'd';

describe('classifyStage — Task 5.2 template-aware dispatch', () => {
  it('editorial Drafting → activeLinear', () => {
    expect(classifyStage('Drafting', editorial)).toEqual({ kind: 'activeLinear' });
  });

  it('editorial Final → locked, next = Published', () => {
    expect(classifyStage('Final', editorial)).toEqual({
      kind: 'locked',
      nextLinearStage: 'Published',
    });
  });

  it('editorial Published → terminal', () => {
    expect(classifyStage('Published', editorial)).toEqual({ kind: 'terminal' });
  });

  it('editorial Blocked → offPipeline', () => {
    expect(classifyStage('Blocked', editorial)).toEqual({ kind: 'offPipeline' });
  });

  it('editorial Cancelled → offPipeline', () => {
    expect(classifyStage('Cancelled', editorial)).toEqual({ kind: 'offPipeline' });
  });

  it('visual Sketched → activeLinear', () => {
    expect(classifyStage('Sketched', visual)).toEqual({ kind: 'activeLinear' });
  });

  it('visual Approved → locked, next = Shipped', () => {
    expect(classifyStage('Approved', visual)).toEqual({
      kind: 'locked',
      nextLinearStage: 'Shipped',
    });
  });

  it('visual Shipped → terminal', () => {
    expect(classifyStage('Shipped', visual)).toEqual({ kind: 'terminal' });
  });

  it('visual Blocked → offPipeline', () => {
    expect(classifyStage('Blocked', visual)).toEqual({ kind: 'offPipeline' });
  });

  it('feature-doc Approved → locked, next = Implemented', () => {
    expect(classifyStage('Approved', featureDoc)).toEqual({
      kind: 'locked',
      nextLinearStage: 'Implemented',
    });
  });

  it('feature-doc Implemented → locked, next = Complete', () => {
    expect(classifyStage('Implemented', featureDoc)).toEqual({
      kind: 'locked',
      nextLinearStage: 'Complete',
    });
  });

  it('feature-doc Complete → terminal', () => {
    expect(classifyStage('Complete', featureDoc)).toEqual({ kind: 'terminal' });
  });

  it('qa-plan Reviewed → locked, next = Tested', () => {
    expect(classifyStage('Reviewed', qaPlan)).toEqual({
      kind: 'locked',
      nextLinearStage: 'Tested',
    });
  });

  it('qa-plan Approved → terminal', () => {
    expect(classifyStage('Approved', qaPlan)).toEqual({ kind: 'terminal' });
  });

  it('blog-post Edited → locked, next = Published', () => {
    expect(classifyStage('Edited', blogPost)).toEqual({
      kind: 'locked',
      nextLinearStage: 'Published',
    });
  });

  it('blog-post Published → terminal', () => {
    expect(classifyStage('Published', blogPost)).toEqual({ kind: 'terminal' });
  });

  it('throws when stage is not in either linearStages or offPipelineStages', () => {
    expect(() => classifyStage('NotAStage', editorial)).toThrow(
      /not in template "editorial"/,
    );
  });
});

describe('verbsForStage — Task 5.2 active linear (iterate + approve + scrapbook)', () => {
  it('editorial Drafting emits iterate + approve + scrapbook inline', () => {
    const v = verbsForStage('Drafting', editorial, makeEntry('Drafting'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['iterate', 'approve', 'scrapbook']);
    expect(v.menu.map((x) => x.kind)).toEqual([
      'iterate',
      'approve',
      'block',
      'induct',
      'cancel',
      'scrapbook',
    ]);
    expect(v.inline[1]?.label).toBe('Approve');
  });

  it('visual Sketched emits iterate + approve + scrapbook inline', () => {
    const v = verbsForStage('Sketched', visual, makeEntry('Sketched'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['iterate', 'approve', 'scrapbook']);
    expect(v.inline[1]?.label).toBe('Approve');
  });

  it('qa-plan Drafted emits iterate + approve + scrapbook inline', () => {
    const v = verbsForStage('Drafted', qaPlan, makeEntry('Drafted'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['iterate', 'approve', 'scrapbook']);
  });

  it('feature-doc Drafting emits iterate + approve + scrapbook inline', () => {
    const v = verbsForStage('Drafting', featureDoc, makeEntry('Drafting'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['iterate', 'approve', 'scrapbook']);
    expect(v.inline[1]?.label).toBe('Approve');
  });

  it('blog-post Drafting emits iterate + approve + scrapbook inline', () => {
    const v = verbsForStage('Drafting', blogPost, makeEntry('Drafting'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['iterate', 'approve', 'scrapbook']);
    expect(v.inline[1]?.label).toBe('Approve');
  });
});

describe('verbsForStage — Task 5.2 drawer-view invariants', () => {
  // The mobile-swipe drawer set per category. Active linear surfaces
  // iterate+approve+scrapbook (the top-N power-user verbs); locked
  // surfaces approve+cancel+scrapbook (no iterate; explicit cancel
  // escape); off-pipeline mirrors the inline set; terminal mirrors the
  // inline view+scrapbook pair.

  it('active linear drawer = iterate + approve + cancel + scrapbook', () => {
    const v = verbsForStage('Drafting', editorial, makeEntry('Drafting'), DEFAULT_SITE);
    expect(v.drawer.map((x) => x.kind)).toEqual([
      'iterate',
      'approve',
      'cancel',
      'scrapbook',
    ]);
  });

  it('locked drawer = approve + cancel + scrapbook (no iterate)', () => {
    const v = verbsForStage('Final', editorial, makeEntry('Final'), DEFAULT_SITE);
    expect(v.drawer.map((x) => x.kind)).toEqual(['approve', 'cancel', 'scrapbook']);
  });

  it('off-pipeline drawer mirrors inline (induct + scrapbook)', () => {
    const v = verbsForStage('Blocked', editorial, makeEntry('Blocked'), DEFAULT_SITE);
    expect(v.drawer.map((x) => x.kind)).toEqual(v.inline.map((x) => x.kind));
    expect(v.drawer.map((x) => x.kind)).toEqual(['induct', 'scrapbook']);
  });

  it('terminal drawer mirrors inline (view + scrapbook)', () => {
    const v = verbsForStage('Published', editorial, makeEntry('Published'), DEFAULT_SITE);
    expect(v.drawer.map((x) => x.kind)).toEqual(v.inline.map((x) => x.kind));
    expect(v.drawer.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
  });
});

describe('verbsForStage — Task 5.2 locked stages (Approve → next)', () => {
  it('editorial Final → "Approve → Published"', () => {
    const v = verbsForStage('Final', editorial, makeEntry('Final'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['approve', 'scrapbook']);
    expect(v.inline[0]?.label).toBe('Approve → Published');
    expect(v.inline[0]?.copy).toContain('/deskwork:approve');
    // iterate is refused — not in inline OR menu.
    expect(v.menu.find((x) => x.kind === 'iterate')).toBeUndefined();
  });

  it('visual Approved → "Approve → Shipped"', () => {
    const v = verbsForStage('Approved', visual, makeEntry('Approved'), DEFAULT_SITE);
    expect(v.inline[0]?.label).toBe('Approve → Shipped');
    expect(v.menu.find((x) => x.kind === 'iterate')).toBeUndefined();
  });

  it('feature-doc Approved → "Approve → Implemented"', () => {
    const v = verbsForStage('Approved', featureDoc, makeEntry('Approved'), DEFAULT_SITE);
    expect(v.inline[0]?.label).toBe('Approve → Implemented');
  });

  it('feature-doc Implemented → "Approve → Complete"', () => {
    const v = verbsForStage(
      'Implemented',
      featureDoc,
      makeEntry('Implemented'),
      DEFAULT_SITE,
    );
    expect(v.inline[0]?.label).toBe('Approve → Complete');
  });

  it('qa-plan Reviewed → "Approve → Tested"', () => {
    const v = verbsForStage('Reviewed', qaPlan, makeEntry('Reviewed'), DEFAULT_SITE);
    expect(v.inline[0]?.label).toBe('Approve → Tested');
  });

  it('blog-post Edited → "Approve → Published"', () => {
    const v = verbsForStage('Edited', blogPost, makeEntry('Edited'), DEFAULT_SITE);
    expect(v.inline[0]?.label).toBe('Approve → Published');
  });
});

describe('verbsForStage — Task 5.2 terminal (frozen artifact)', () => {
  it('editorial Published — view + scrapbook only', () => {
    const v = verbsForStage(
      'Published',
      editorial,
      makeEntry('Published'),
      DEFAULT_SITE,
    );
    expect(v.inline.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
    expect(v.menu.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
  });

  it('visual Shipped — view + scrapbook only', () => {
    const v = verbsForStage('Shipped', visual, makeEntry('Shipped'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
  });

  it('feature-doc Complete — view + scrapbook only', () => {
    const v = verbsForStage('Complete', featureDoc, makeEntry('Complete'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
  });

  it('qa-plan Approved (terminal) — view + scrapbook only', () => {
    const v = verbsForStage('Approved', qaPlan, makeEntry('Approved'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
  });

  it('blog-post Published — view + scrapbook only', () => {
    const v = verbsForStage('Published', blogPost, makeEntry('Published'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['view', 'scrapbook']);
  });
});

describe('verbsForStage — Task 5.2 off-pipeline (Blocked / Cancelled / Archived)', () => {
  it('editorial Blocked — induct + scrapbook only', () => {
    const v = verbsForStage('Blocked', editorial, makeEntry('Blocked'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['induct', 'scrapbook']);
    expect(v.inline[0]?.label).toBe('Induct… (pick stage)');
    expect(v.inline[0]?.title).toBe('bring this entry back into the pipeline');
  });

  it('editorial Cancelled — induct + scrapbook only', () => {
    const v = verbsForStage('Cancelled', editorial, makeEntry('Cancelled'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['induct', 'scrapbook']);
  });

  it('visual Archived — induct + scrapbook only', () => {
    const v = verbsForStage('Archived', visual, makeEntry('Archived'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['induct', 'scrapbook']);
  });

  it('qa-plan Archived — induct + scrapbook only', () => {
    const v = verbsForStage('Archived', qaPlan, makeEntry('Archived'), DEFAULT_SITE);
    expect(v.inline.map((x) => x.kind)).toEqual(['induct', 'scrapbook']);
  });
});

describe('Commandment III — no review-state labels in template-aware row chrome', () => {
  // Pinning Commandment III for the new template-aware verb-chip
  // render path: an absence assertion on every rendered chrome
  // ensures the next time someone tries to add a state badge (e.g.
  // `er-stamp-iterating`, `IN REVIEW`, `ITERATING`) the test catches
  // the regression before review.
  const REVIEW_STATE_TOKENS = [
    'er-stamp',
    'IN REVIEW',
    'ITERATING',
    'reviewState',
    'in-review',
  ];

  function assertNoReviewState(html: string, label: string): void {
    for (const token of REVIEW_STATE_TOKENS) {
      expect(html, `${label} must not contain review-state token "${token}"`)
        .not.toContain(token);
    }
  }

  // Per Task 0.12 (AUDIT-20260530-36): the renderers now consume
  // pre-computed `verbs` + `category` rather than re-deriving via
  // `verbsForStage` / `classifyStage`. The helper below hoists those
  // calls per test case so the assertions stay readable.
  function rowChrome(
    template: PipelineTemplate,
    stage: string,
  ): { actions: string; drawer: string; menu: string } {
    const e = makeEntry(stage);
    const verbs = verbsForStage(stage, template, e, DEFAULT_SITE);
    const category = classifyStage(stage, template);
    return {
      actions: renderRowActions(verbs).__raw,
      drawer: renderRowDrawer(verbs).__raw,
      menu: renderRowMenu(verbs, category).__raw,
    };
  }

  it('editorial active-linear row chrome carries no review-state tokens', () => {
    const chrome = rowChrome(editorial, 'Drafting');
    assertNoReviewState(chrome.actions, 'editorial Drafting actions');
    assertNoReviewState(chrome.drawer, 'editorial Drafting drawer');
    assertNoReviewState(chrome.menu, 'editorial Drafting menu');
  });

  it('editorial locked + terminal row chrome carries no review-state tokens', () => {
    for (const stage of ['Final', 'Published']) {
      const chrome = rowChrome(editorial, stage);
      assertNoReviewState(chrome.actions, `editorial ${stage} actions`);
      assertNoReviewState(chrome.drawer, `editorial ${stage} drawer`);
      assertNoReviewState(chrome.menu, `editorial ${stage} menu`);
    }
  });

  it('visual + qa-plan + feature-doc + blog-post row chrome carries no review-state tokens', () => {
    const cases: Array<[PipelineTemplate, string]> = [
      [visual, 'Sketched'],
      [visual, 'Approved'],
      [visual, 'Shipped'],
      [qaPlan, 'Reviewed'],
      [qaPlan, 'Approved'],
      [featureDoc, 'Approved'],
      [featureDoc, 'Implemented'],
      [featureDoc, 'Complete'],
      [blogPost, 'Edited'],
      [blogPost, 'Published'],
    ];
    for (const [template, stage] of cases) {
      const chrome = rowChrome(template, stage);
      assertNoReviewState(chrome.actions, `${template.id} ${stage} actions`);
      assertNoReviewState(chrome.drawer, `${template.id} ${stage} drawer`);
      assertNoReviewState(chrome.menu, `${template.id} ${stage} menu`);
    }
  });
});

describe('verbsForStage — Task 5.2 unknown stage throws', () => {
  it('editorial NotAStage throws with template id in the message', () => {
    expect(() =>
      verbsForStage('NotAStage', editorial, makeEntry('NotAStage'), DEFAULT_SITE),
    ).toThrow(/not in template "editorial"/);
  });
});
