/**
 * Integration test for the multi-lane swimlane dashboard shell
 * (Phase 5 Task 5.1).
 *
 * Boots the studio against a fixture project with three lanes on
 * disk (editorial / visual / qa-plan) plus entries in each, hits the
 * dashboard route, and asserts the bay-shell + per-lane swimlanes
 * + focus-chip strip + lane-rail + swim-stub all render the
 * accepted Direction-3 "Press Bay" v11 markup contract.
 *
 * Pure integration — uses real sidecars, real lane configs, real
 * pipeline templates. No mocks. Per `.claude/rules/testing.md`,
 * fixture project trees live on disk via `mkdtempSync`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeSidecar } from '@deskwork/core/sidecar';
import {
  setupDashboardFixture,
  getHtml,
  makeEntry,
  extractLaneSection,
  extractStageCols,
  UUID_EDITORIAL_DRAFTING,
  UUID_VISUAL_SKETCHED,
  UUID_VISUAL_APPROVED,
  UUID_QA_DRAFTED,
} from './__helpers/dashboard-swimlane-fixture.ts';
import { createApp } from '../src/server.ts';

describe('dashboard swimlane shell — Phase 5 Task 5.1', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cleanup: () => void;

  beforeEach(async () => {
    const fixture = await setupDashboardFixture();
    root = fixture.root;
    app = fixture.app;
    cleanup = fixture.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders one <article class="swim ..."> per lane configured on disk', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Per Finding 3, the `<article>` carries `class="swim swim--<id>"`.
    // Tolerate the modifier in the count regex.
    const swimMatches = r.html.match(/<article class="swim(?:\s[^"]*)?"/g) ?? [];
    expect(swimMatches.length).toBe(3);
  });

  it('every swimlane carries data-lane-id matching its config', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toMatch(/<article class="swim(?:\s[^"]*)?"[^>]*data-lane-id="default"/);
    expect(r.html).toMatch(/<article class="swim(?:\s[^"]*)?"[^>]*data-lane-id="mockups"/);
    expect(r.html).toMatch(/<article class="swim(?:\s[^"]*)?"[^>]*data-lane-id="qa"/);
  });

  it('focus-chip strip contains one chip per lane + the All chip', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const chipMatches = r.html.match(/data-focus-chip="[^"]+"/g) ?? [];
    expect(chipMatches.length).toBe(3);
    expect(r.html).toContain('data-focus-chip="default"');
    expect(r.html).toContain('data-focus-chip="mockups"');
    expect(r.html).toContain('data-focus-chip="qa"');
    expect(r.html).toContain('data-focus-chip-all');
  });

  it('lane-visibility rail contains one row per lane with drag handle', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const railMatches = r.html.match(/data-rail-lane="[^"]+"/g) ?? [];
    expect(railMatches.length).toBe(3);
    expect(r.html).toContain('data-rail-lane="default"');
    expect(r.html).toContain('data-rail-lane="mockups"');
    expect(r.html).toContain('data-rail-lane="qa"');
    // Drag handle glyph renders on every row (Task 5.4 controller in
    // `swimlane-drag.ts` reads this).
    expect(r.html).toMatch(/<span class="rail-drag" aria-hidden="true">⋮⋮<\/span>/);
  });

  // ============================================================
  //  Task 5.4 + 5.5 rail-affordance tests moved to
  //  dashboard-swimlane-affordances-render.test.ts per
  //  AUDIT-20260528-14 (file-size cap split).
  // ============================================================


  it('each swimlane emits a .stage-grid with one column per template stage', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Editorial: 6 linear + 2 off-pipeline = 8 stages.
    const editorialBlock = extractLaneSection(r.html, 'default');
    expect(extractStageCols(editorialBlock).length).toBe(8);
    // Visual: 4 linear + 3 off-pipeline = 7 stages.
    const visualBlock = extractLaneSection(r.html, 'mockups');
    expect(extractStageCols(visualBlock).length).toBe(7);
    // QA-plan: 4 linear + 3 off-pipeline = 7 stages.
    const qaBlock = extractLaneSection(r.html, 'qa');
    expect(extractStageCols(qaBlock).length).toBe(7);
  });

  it('stage labels come from each lane\'s template (no hardcoded "Drafting" in visual lane)', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const visualBlock = extractLaneSection(r.html, 'mockups');
    // Visual stages are Sketched / Iterating / Approved / Shipped —
    // editorial-only "Drafting" must NOT appear inside the mockups lane.
    expect(visualBlock).toContain('data-stage-col="Sketched"');
    expect(visualBlock).toContain('data-stage-col="Iterating"');
    expect(visualBlock).toContain('data-stage-col="Approved"');
    expect(visualBlock).toContain('data-stage-col="Shipped"');
    expect(visualBlock).not.toContain('data-stage-col="Drafting"');
    // QA: Drafted / Reviewed / Tested / Approved.
    const qaBlock = extractLaneSection(r.html, 'qa');
    expect(qaBlock).toContain('data-stage-col="Drafted"');
    expect(qaBlock).toContain('data-stage-col="Reviewed"');
    expect(qaBlock).toContain('data-stage-col="Tested"');
    expect(qaBlock).toContain('data-stage-col="Approved"');
  });

  it('entries render inside the right lane + stage column', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // The editorial Drafting entry lives in the default lane's Drafting column.
    const editorialBlock = extractLaneSection(r.html, 'default');
    expect(editorialBlock).toMatch(
      new RegExp(`data-stage="Drafting"[^>]*data-uuid="${UUID_EDITORIAL_DRAFTING}"`),
    );
    // Visual entries live in the mockups lane.
    const visualBlock = extractLaneSection(r.html, 'mockups');
    expect(visualBlock).toMatch(
      new RegExp(`data-stage="Sketched"[^>]*data-uuid="${UUID_VISUAL_SKETCHED}"`),
    );
    expect(visualBlock).toMatch(
      new RegExp(`data-stage="Approved"[^>]*data-uuid="${UUID_VISUAL_APPROVED}"`),
    );
    // QA entry lives in the qa lane.
    const qaBlock = extractLaneSection(r.html, 'qa');
    expect(qaBlock).toMatch(
      new RegExp(`data-stage="Drafted"[^>]*data-uuid="${UUID_QA_DRAFTED}"`),
    );
  });

  it('loads each split dashboard-swimlane-*.css alongside existing stylesheets', async () => {
    // Per AUDIT-20260528-14: `dashboard-swimlane.css` was split into
    // per-section files (shell/rail/presets/chips/collapse/list/
    // compose/drag/mobile) to satisfy the project file-size cap. The
    // page must reference every split so the cascade stays whole.
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    for (const file of [
      'dashboard-swimlane-shell.css',
      'dashboard-swimlane-rail.css',
      'dashboard-swimlane-presets.css',
      'dashboard-swimlane-chips.css',
      'dashboard-swimlane-collapse.css',
      'dashboard-swimlane-list.css',
      'dashboard-swimlane-compose.css',
      'dashboard-swimlane-drag.css',
      'dashboard-swimlane-mobile.css',
    ]) {
      expect(r.html).toContain(`/static/css/${file}`);
    }
  });

  it('honours ?focus=<csv> URL param: focused lanes render with .swim (no .is-focus-hidden); non-focused with .is-focus-hidden', async () => {
    // Server-side focus filter — only editorial + mockups in focus.
    const r = await getHtml(
      app,
      '/dev/editorial-studio?focus=default,mockups',
    );
    expect(r.status).toBe(200);
    // Per AUDIT-20260528-02 the server now renders BOTH the swimlane
    // AND the stub for every visibility-on lane. `.is-focus-hidden`
    // is server-stamped on whichever node the initial focus state
    // wants invisible. So all 3 lanes emit a `<article class="swim">`
    // and all 3 emit a `<button class="swim-stub">`.
    const swimMatches = r.html.match(/<article class="swim(?:\s[^"]*)?"/g) ?? [];
    expect(swimMatches.length).toBe(3);
    const stubMatches = r.html.match(/<button class="swim-stub(?:\s[^"]*)?"/g) ?? [];
    expect(stubMatches.length).toBe(3);
    // Focused lanes' swims do NOT carry is-focus-hidden; their stubs DO.
    // Task 5.1B adds a `view-kanban` token between `swim--<id>` and
    // any focus-hidden modifier; the regex tolerates additional class
    // tokens via `[^"]*`.
    expect(r.html).toMatch(/<article class="swim swim--editorial[^"]*"[^>]*data-lane-id="default"/);
    expect(r.html).toMatch(/<article class="swim swim--visual[^"]*"[^>]*data-lane-id="mockups"/);
    expect(r.html).toMatch(
      /<button class="swim-stub is-focus-hidden"[^>]*data-swim-stub="default"/,
    );
    expect(r.html).toMatch(
      /<button class="swim-stub is-focus-hidden"[^>]*data-swim-stub="mockups"/,
    );
    // Non-focused lane (qa): swim carries is-focus-hidden; stub does NOT.
    expect(r.html).toMatch(
      /<article class="swim swim--qa-plan[^"]*\bis-focus-hidden\b[^"]*"[^>]*data-lane-id="qa"/,
    );
    expect(r.html).toMatch(
      /<button class="swim-stub"[^>]*data-swim-stub="qa"/,
    );
    // Bay shell's data-focus-url-driven attr surfaces the URL override.
    expect(r.html).toContain('data-focus-url-driven="true"');
  });

  it('bay-head meta reads "{n} of {m} lanes shown · {total} entries"', async () => {
    const r = await getHtml(app, '/dev/editorial-studio?focus=default,mockups');
    expect(r.status).toBe(200);
    // 2 of 3 lanes focused; total entries = 4 across all lanes.
    expect(r.html).toContain('2 of 3 lanes shown');
    expect(r.html).toContain('4 entries');
  });

  it('off-pipeline stage columns carry the off-pipeline class', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const editorialBlock = extractLaneSection(r.html, 'default');
    // Blocked + Cancelled are editorial's off-pipeline stages — assert
    // the column carries BOTH the off-pipeline class and the
    // data-stage-col attr (attribute ordering in the rendered output
    // is not guaranteed, so check by looking at the column markup).
    expect(editorialBlock).toMatch(
      /class="stage-col[^"]*off-pipeline[^"]*"[^>]*data-stage-col="Blocked"/,
    );
    expect(editorialBlock).toMatch(
      /class="stage-col[^"]*off-pipeline[^"]*"[^>]*data-stage-col="Cancelled"/,
    );
  });

  it('emits a real .swim-compose chip per lane', async () => {
    // Task 5.1C — per-lane compose chip in each swim-head. The chip
    // carries data-lane-id + data-first-stage so the client
    // controller can compose the slash command without a server
    // round trip; the aria-label carries the full action.
    //
    // First linear stages per preset (verified against the JSON):
    //   - editorial → Ideas  (editorial.json:linearStages[0])
    //   - visual    → Sketched (visual.json:linearStages[0])
    //   - qa-plan   → Drafted (qa-plan.json:linearStages[0])
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const lanes: Array<{ id: string; name: string; firstStage: string }> = [
      { id: 'default', name: 'Editorial', firstStage: 'Ideas' },
      { id: 'mockups', name: 'Mockups', firstStage: 'Sketched' },
      { id: 'qa', name: 'QA', firstStage: 'Drafted' },
    ];
    for (const lane of lanes) {
      const block = extractLaneSection(r.html, lane.id);
      // The chip carries class="swim-compose" AND the lane-scoped
      // data attributes. Attribute order is not guaranteed by the
      // template, so we assert each fragment independently.
      expect(block).toContain('class="swim-compose"');
      expect(block).toContain(`data-lane-id="${lane.id}"`);
      expect(block).toContain(`data-first-stage="${lane.firstStage}"`);
      expect(block).toContain(
        `aria-label="Compose new entry in ${lane.name}"`,
      );
    }
  });

  it('5.1C slot comment is removed from the rendered output', async () => {
    // Task 5.1C replaces the HTML-comment slot with real markup. Any
    // remaining `5.1C slot` literal would indicate the renderer
    // regressed to the placeholder shape.
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).not.toContain('5.1C slot');
  });

  it('per-lane glyphs from the mockup mapping (editorial=§, visual=◆, qa-plan=⊕)', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Editorial lane: § glyph appears in the rail row + focus chip + swim-head.
    const editorialBlock = extractLaneSection(r.html, 'default');
    expect(editorialBlock).toMatch(/<span class="glyph" aria-hidden="true">§<\/span>/);
    // Visual (mockups) lane: ◆ glyph in the swim-head.
    const visualBlock = extractLaneSection(r.html, 'mockups');
    expect(visualBlock).toMatch(/<span class="glyph" aria-hidden="true">◆<\/span>/);
    // QA lane: ⊕ glyph in the swim-head.
    const qaBlock = extractLaneSection(r.html, 'qa');
    expect(qaBlock).toMatch(/<span class="glyph" aria-hidden="true">⊕<\/span>/);
    // Focus-chip strip: each chip carries the template-mapped glyph.
    expect(r.html).toMatch(
      /data-focus-chip="default"[^>]*>\s*<span class="fc-glyph" aria-hidden="true">§<\/span>/,
    );
    expect(r.html).toMatch(
      /data-focus-chip="mockups"[^>]*>\s*<span class="fc-glyph" aria-hidden="true">◆<\/span>/,
    );
    expect(r.html).toMatch(
      /data-focus-chip="qa"[^>]*>\s*<span class="fc-glyph" aria-hidden="true">⊕<\/span>/,
    );
    // Rail rows: each row's r-glyph follows the same mapping.
    expect(r.html).toMatch(
      /data-rail-lane="default"[\s\S]*?<span class="r-glyph" aria-hidden="true">§<\/span>/,
    );
    expect(r.html).toMatch(
      /data-rail-lane="mockups"[\s\S]*?<span class="r-glyph" aria-hidden="true">◆<\/span>/,
    );
    expect(r.html).toMatch(
      /data-rail-lane="qa"[\s\S]*?<span class="r-glyph" aria-hidden="true">⊕<\/span>/,
    );
  });

  it('swim-stub for a focus-off lane carries the lane\'s template glyph', async () => {
    // Focus only editorial + mockups; qa is visibility-on, focus-off.
    const r = await getHtml(app, '/dev/editorial-studio?focus=default,mockups');
    expect(r.status).toBe(200);
    // QA stub renders with ⊕ (the qa-plan template glyph), NOT §.
    expect(r.html).toMatch(
      /data-swim-stub="qa"[\s\S]*?<span class="ss-glyph" aria-hidden="true">⊕<\/span>/,
    );
  });

  it('locked stages render with `class="stage-col ... locked"` (editorial Final, qa Reviewed)', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Editorial template: lockedStages = ["Final"].
    const editorialBlock = extractLaneSection(r.html, 'default');
    expect(editorialBlock).toMatch(
      /class="stage-col[^"]*\blocked\b[^"]*"[^>]*data-stage-col="Final"/,
    );
    // QA-plan template: lockedStages = ["Reviewed"].
    const qaBlock = extractLaneSection(r.html, 'qa');
    expect(qaBlock).toMatch(
      /class="stage-col[^"]*\blocked\b[^"]*"[^>]*data-stage-col="Reviewed"/,
    );
    // Non-locked stages do NOT pick up the modifier (editorial Drafting
    // is not in lockedStages).
    expect(editorialBlock).not.toMatch(
      /class="stage-col[^"]*\blocked\b[^"]*"[^>]*data-stage-col="Drafting"/,
    );
  });

  it('swim-compact strip mirrors the locked-stage modifier (.sc-stage.locked)', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Editorial Final → sc-stage.locked.
    const editorialBlock = extractLaneSection(r.html, 'default');
    expect(editorialBlock).toMatch(
      /class="sc-stage[^"]*\blocked\b[^"]*"[^>]*data-sc-stage="Final"/,
    );
    // QA Reviewed → sc-stage.locked.
    const qaBlock = extractLaneSection(r.html, 'qa');
    expect(qaBlock).toMatch(
      /class="sc-stage[^"]*\blocked\b[^"]*"[^>]*data-sc-stage="Reviewed"/,
    );
  });

  it('swimlane <article> carries template-id modifier class (swim--<template-id>)', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Editorial lane → swim--editorial (followed by Task 5.1B's
    // `view-kanban` server-default token).
    expect(r.html).toMatch(
      /<article class="swim swim--editorial[^"]*"[^>]*data-lane-id="default"/,
    );
    // Mockups (visual template) → swim--visual.
    expect(r.html).toMatch(
      /<article class="swim swim--visual[^"]*"[^>]*data-lane-id="mockups"/,
    );
    // QA → swim--qa-plan.
    expect(r.html).toMatch(
      /<article class="swim swim--qa-plan[^"]*"[^>]*data-lane-id="qa"/,
    );
  });

  it('bay-shell carries data-project-key with a 12-char lowercase hex hash', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const match = r.html.match(/data-project-key="([^"]+)"/);
    expect(match).not.toBeNull();
    // Hash shape: exactly 12 lowercase hex characters.
    expect(match?.[1]).toMatch(/^[0-9a-f]{12}$/);
  });

  it('"Filtered ·" badge appears in .bh-meta when ?focus= narrows the visible set', async () => {
    // 2 of 3 lanes focused → filter is active.
    const r1 = await getHtml(app, '/dev/editorial-studio?focus=default,mockups');
    expect(r1.status).toBe(200);
    expect(r1.html).toContain('<span class="filter-active">Filtered · </span>');
    // No filter: all lanes focused → badge absent.
    const r2 = await getHtml(app, '/dev/editorial-studio');
    expect(r2.status).toBe(200);
    expect(r2.html).not.toContain('class="filter-active"');
  });

  it('per ambiguity 4: entries with undefined lane route to default and surface a warn (does not crash)', async () => {
    // Add a legacy sidecar with no lane field.
    await writeSidecar(
      root,
      makeEntry({
        uuid: '99999999-9999-4999-8999-999999999999',
        slug: 'legacy-no-lane',
        title: 'Legacy No Lane',
        currentStage: 'Ideas',
        // lane: undefined  (legacy sidecar)
      }),
    );
    const r = await getHtml(app, '/dev/editorial-studio');
    // Page still renders.
    expect(r.status).toBe(200);
    // The legacy entry lands in the default lane's Ideas column.
    const editorialBlock = extractLaneSection(r.html, 'default');
    expect(editorialBlock).toContain('data-slug="legacy-no-lane"');
  });

  // ============================================================
  //  Tests for the following surfaces moved to sibling files per
  //  AUDIT-20260528-14 (file-size cap split):
  //    - AUDIT-02 / -04 / -05 acceptance → dashboard-swimlane-
  //      audits-render.test.ts
  //    - Task 5.1A collapse → dashboard-swimlane-collapse-render
  //      .test.ts
  //    - Task 5.1B view-toggle + list-body → dashboard-swimlane-
  //      list-render.test.ts
  //    - Task 5.2 empty-state copy + empty-lane CTA →
  //      dashboard-swimlane-cta-render.test.ts
  //    - Task 5.3 overflow + mobile lane-sheet (incl. AUDIT-22) →
  //      dashboard-swimlane-overflow-sheet-render.test.ts
  // ============================================================
});
