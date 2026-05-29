/**
 * Phase 5 Task 5.1A acceptance — universal collapse-chev primitive at
 * lane-level + per-stage, plus the CSS rules that drive both states.
 *
 * Originally part of `dashboard-swimlane.test.ts`; split out per
 * AUDIT-20260528-14 to satisfy the project's 300-500 line file-size
 * cap. The shared three-lane fixture lives in
 * `__helpers/dashboard-swimlane-fixture.ts`.
 *
 * Pure integration — uses real sidecars, real lane configs, real
 * pipeline templates. No mocks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setupDashboardFixture,
  getHtml,
  extractLaneSection,
  extractStageGridSection,
} from './__helpers/dashboard-swimlane-fixture.ts';
import { createApp } from '../src/server.ts';

describe('dashboard swimlane Task 5.1A — collapse chevrons (render + CSS)', () => {
  let app: ReturnType<typeof createApp>;
  let cleanup: () => void;

  beforeEach(async () => {
    const fixture = await setupDashboardFixture();
    app = fixture.app;
    cleanup = fixture.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('Task 5.1A: every swim-head emits a lane-level `<button class="collapse-chev">` with aria-expanded="true"', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // One lane-level chevron per lane.
    const laneChevs = r.html.match(
      /<button class="collapse-chev"[^>]*data-collapse-target="lane"/g,
    ) ?? [];
    expect(laneChevs.length).toBe(3);
    // Each lane-level chevron carries the correct data-lane-id +
    // data-lane-name (used by the client to restore aria-label when
    // toggling) + aria-expanded="true" + descriptive aria-label.
    for (const [id, displayName] of [
      ['default', 'Editorial'],
      ['mockups', 'Mockups'],
      ['qa', 'QA'],
    ] as const) {
      const re = new RegExp(
        `<button class="collapse-chev"[^>]*aria-expanded="true"[^>]*aria-label="Collapse ${displayName} lane"[^>]*data-collapse-target="lane"[^>]*data-lane-id="${id}"[^>]*data-lane-name="${displayName}"`,
      );
      expect(r.html).toMatch(re);
    }
  });

  it('Task 5.1A: every stage-head emits a per-stage `<button class="collapse-chev">` with aria-expanded="true"', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // One per-stage chevron per `(lane, stage)` pair in the kanban
    // body. Editorial=8, Visual=7, QA=7 — 22 in total. Task 5.1B
    // adds a sibling chevron per `lb-group` in the list-body — same
    // count, mirroring the kanban shape — so the total over both
    // bodies is 44. The kanban-only count is asserted by scoping to
    // the stage-grid section.
    const stageChevs = r.html.match(
      /<button class="collapse-chev"[^>]*data-collapse-target="stage"/g,
    ) ?? [];
    expect(stageChevs.length).toBe(44);
    // Kanban-scoped count (the original Task 5.1A invariant): walk
    // each lane's stage-grid section and count.
    let kanbanStageChevCount = 0;
    for (const laneId of ['default', 'mockups', 'qa']) {
      const grid = extractStageGridSection(extractLaneSection(r.html, laneId));
      kanbanStageChevCount += (
        grid.match(/<button class="collapse-chev"[^>]*data-collapse-target="stage"/g)
        ?? []
      ).length;
    }
    expect(kanbanStageChevCount).toBe(22);
    // The Drafting column in the editorial lane has the canonical
    // shape: lane-scoped data-lane-id + data-stage-name carrying the
    // human-readable stage name. Scope to the stage-grid so the
    // assertion targets the kanban chevron — the list-body's
    // `lb-group` chevron uses the same data attributes.
    const editorialGrid = extractStageGridSection(extractLaneSection(r.html, 'default'));
    expect(editorialGrid).toMatch(
      /<button class="collapse-chev"[^>]*aria-expanded="true"[^>]*aria-label="Collapse Drafting stage"[^>]*data-collapse-target="stage"[^>]*data-lane-id="default"[^>]*data-stage-name="Drafting"/,
    );
  });

  it('Task 5.1A: chevron glyph is the canonical `▾` (U+25BE) — same at lane-level and per-stage', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Pick a specific lane-level chevron + verify it carries ▾ as
    // its glyph text.
    expect(r.html).toMatch(
      /<button class="collapse-chev"[^>]*data-collapse-target="lane"[^>]*data-lane-id="default"[^>]*>▾<\/button>/,
    );
    // Same glyph at stage-level. The pattern matches against any
    // chevron with the canonical data attributes — kanban OR list-
    // body — since both bodies use the same chevron primitive
    // (Task 5.1B reuses the universal `.collapse-chev` from 5.1A).
    expect(r.html).toMatch(
      /<button class="collapse-chev"[^>]*data-collapse-target="stage"[^>]*data-stage-name="Drafting"[^>]*>▾<\/button>/,
    );
  });

  it('Task 5.1A: dashboard-swimlane-{collapse,shell}.css ship the universal `.collapse-chev` primitive + collapsed-state rules', async () => {
    // Per AUDIT-20260528-14: `.collapse-chev` primitive + collapsed
    // states moved into `dashboard-swimlane-collapse.css`; the
    // `.swim.collapsed .stage-grid` hide rule stays in
    // `dashboard-swimlane-shell.css` next to the stage-grid base
    // styles. Two fetches assert both files ship the rules.
    const collapseRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-collapse.css'),
    );
    expect(collapseRes.status).toBe(200);
    const collapseCss = await collapseRes.text();
    // Universal primitive: min-width: 24px + min-height: 24px (WCAG
    // 2.2 SC 2.5.8 AA target size).
    expect(collapseCss).toMatch(/\.collapse-chev\s*\{[\s\S]*?min-width:\s*24px/);
    expect(collapseCss).toMatch(/\.collapse-chev\s*\{[\s\S]*?min-height:\s*24px/);
    // Focus-visible ring (WCAG 2.1 SC 2.4.7 AA).
    expect(collapseCss).toMatch(
      /\.collapse-chev:focus-visible\s*\{[\s\S]*?outline:\s*2px\s+solid\s+var\(--er-proof-blue\)/,
    );
    // Collapsed-state rotation.
    expect(collapseCss).toMatch(
      /\.collapse-chev\[aria-expanded="false"\]\s*\{[\s\S]*?transform:\s*rotate\(-90deg\)/,
    );
    // Per-stage: `.stage-col.collapsed` becomes a 42px strip.
    expect(collapseCss).toMatch(
      /\.stage-col\.collapsed\s*\{[\s\S]*?flex:\s*0\s+0\s+42px/,
    );
    // Vertical writing-mode for the rotated stage name.
    expect(collapseCss).toMatch(
      /\.stage-col\.collapsed\s+\.stage-head\s+\.stage-name\s*\{[\s\S]*?writing-mode:\s*vertical-rl/,
    );

    const shellRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-shell.css'),
    );
    expect(shellRes.status).toBe(200);
    const shellCss = await shellRes.text();
    // Lane-level: `.swim.collapsed` hides the stage-grid (already
    // shipped in 5.1; the reciprocal CSS makes the chevron the only
    // toggle).
    expect(shellCss).toMatch(/\.swim\.collapsed\s+\.stage-grid\s*\{[\s\S]*?display:\s*none/);
  });
});
