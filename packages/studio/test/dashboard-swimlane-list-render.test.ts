/**
 * Phase 5 Task 5.1B acceptance — per-lane kanban ↔ list view toggle:
 * view-toggle markup, dual-body server render, list-body shape (lb-
 * group + lb-row), locked/empty/off-pipeline modifiers, plus the CSS
 * split that ships the rules.
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
  extractListBodySection,
  UUID_EDITORIAL_DRAFTING,
} from './__helpers/dashboard-swimlane-fixture.ts';
import { createApp } from '../src/server.ts';

describe('dashboard swimlane Task 5.1B — view-toggle + list-body (render + CSS)', () => {
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

  it('Task 5.1B: every swim-head emits a `.view-toggle` segmented control', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // One toggle per lane.
    const toggles = r.html.match(
      /<div class="view-toggle"[^>]*data-view-toggle/g,
    ) ?? [];
    expect(toggles.length).toBe(3);
    // Each toggle is a role="radiogroup" with the lane's name in
    // its aria-label.
    for (const [id, displayName] of [
      ['default', 'Editorial'],
      ['mockups', 'Mockups'],
      ['qa', 'QA'],
    ] as const) {
      const re = new RegExp(
        `<div class="view-toggle"[^>]*role="radiogroup"[^>]*aria-label="View mode for ${displayName}"[^>]*data-lane-id="${id}"`,
      );
      expect(r.html).toMatch(re);
    }
  });

  it('Task 5.1B: each `.view-toggle` carries two real <button class="vt-cell"> cells with role="radio"', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Three lanes × 2 cells × 2 viewport variants (desktop swim +
    // mobile lane-stack, per AUDIT-20260528-10) = 12 cell buttons
    // total across both DOM trees.
    const kanbanCells = r.html.match(
      /<button class="vt-cell vt-cell--kanban[^"]*"[^>]*type="button"[^>]*role="radio"/g,
    ) ?? [];
    expect(kanbanCells.length).toBe(6);
    const listCells = r.html.match(
      /<button class="vt-cell vt-cell--list[^"]*"[^>]*type="button"[^>]*role="radio"/g,
    ) ?? [];
    expect(listCells.length).toBe(6);
    // Server-default selection: kanban cell is aria-checked="true"
    // + carries `.active`; list cell is aria-checked="false".
    const editorialBlock = extractLaneSection(r.html, 'default');
    expect(editorialBlock).toMatch(
      /<button class="vt-cell vt-cell--kanban active"[^>]*aria-checked="true"[^>]*data-view-mode="kanban"[^>]*data-lane-id="default"/,
    );
    expect(editorialBlock).toMatch(
      /<button class="vt-cell vt-cell--list"[^>]*aria-checked="false"[^>]*data-view-mode="list"[^>]*data-lane-id="default"/,
    );
  });

  it('Task 5.1B: every swim is server-rendered with `view-kanban` class (server default)', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // The class string is `swim swim--<template-id> view-kanban ...`.
    for (const id of ['default', 'mockups', 'qa']) {
      const re = new RegExp(
        `<article class="swim swim--[a-z0-9-]+ view-kanban[^"]*"[^>]*data-lane-id="${id}"`,
      );
      expect(r.html).toMatch(re);
    }
  });

  it('Task 5.1B: every swim emits BOTH `.stage-grid` AND `.list-body` (dual-body server render)', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const grids = r.html.match(/<div class="stage-grid"/g) ?? [];
    const lists = r.html.match(/<div class="list-body"/g) ?? [];
    expect(grids.length).toBe(3);
    // AUDIT-20260528-10: mobile lane-stack reuses the list-body
    // renderer to emit list-mode markup inside each `<article
    // class="lane-section">`, doubling the page-wide `.list-body`
    // count. The desktop swim still emits exactly one list-body
    // per lane (asserted below via per-lane scoping).
    expect(lists.length).toBe(6);
    // Each desktop swim has both bodies inside it.
    for (const id of ['default', 'mockups', 'qa']) {
      const block = extractLaneSection(r.html, id);
      expect(block).toMatch(/<div class="stage-grid"/);
      expect(block).toMatch(/<div class="list-body" data-list-body/);
    }
  });

  it('Task 5.1B: list-body emits one `.lb-group[data-lb-group="<stage>"]` per template stage', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Editorial: 6 linear + 2 off-pipeline = 8 stages.
    const editorialBlock = extractLaneSection(r.html, 'default');
    const editorialListBody = extractListBodySection(editorialBlock);
    const editorialGroups = editorialListBody.match(/data-lb-group="[^"]+"/g) ?? [];
    expect(editorialGroups.length).toBe(8);
    // Visual: 4 linear + 3 off-pipeline = 7 stages.
    const visualListBody = extractListBodySection(extractLaneSection(r.html, 'mockups'));
    expect((visualListBody.match(/data-lb-group="[^"]+"/g) ?? []).length).toBe(7);
    // QA: 4 linear + 3 off-pipeline = 7 stages.
    const qaListBody = extractListBodySection(extractLaneSection(r.html, 'qa'));
    expect((qaListBody.match(/data-lb-group="[^"]+"/g) ?? []).length).toBe(7);
  });

  it('Task 5.1B: each `.lb-group` carries glyph + name + count + per-stage `collapse-chev` (role="button")', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const editorialListBody = extractListBodySection(extractLaneSection(r.html, 'default'));
    // Drafting group has the canonical shape. The html`` template
    // renders attributes across newlines + indentation, so the
    // regex tolerates whitespace between attributes.
    expect(editorialListBody).toMatch(
      /<div class="lb-group[^"]*"\s+data-lb-group="Drafting">[\s\S]*?<span class="lb-glyph"[^>]*>[\s\S]*?<\/span>[\s\S]*?<span class="lb-name">Drafting<\/span>[\s\S]*?<span class="lb-count">/,
    );
    // Per-stage chevron lives inside `.lb-group-head` with data-
    // collapse-target="stage" + data-stage-name + data-lane-id.
    expect(editorialListBody).toMatch(
      /<div class="lb-group-head">[\s\S]*?<button class="collapse-chev"[^>]*aria-expanded="true"[^>]*aria-label="Collapse Drafting group"[^>]*data-collapse-target="stage"[^>]*data-lane-id="default"[^>]*data-stage-name="Drafting"/,
    );
  });

  it('Task 5.1B: list-body entries render as <a class="lb-row"> rows with title + slug + state-slot + overflow', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // The editorial Drafting entry has slug=a-draft, title=A Draft.
    const editorialListBody = extractListBodySection(extractLaneSection(r.html, 'default'));
    // Per AUDIT-20260528-08: the overflow span is decorative chrome
    // (`aria-hidden="true"`, no role, no tabindex, no aria-label) —
    // it carries the data-uuid hook for future wiring but does not
    // present itself as a focusable affordance. Nesting a real
    // `<button>` inside the wrapping `<a>` would be invalid HTML;
    // the span shape stays, but the inert/decorative attributes
    // replace the prior would-be-interactive shape.
    const rowRe = new RegExp(
      `<a class="lb-row"[^>]*data-stage="Drafting"[^>]*data-uuid="${UUID_EDITORIAL_DRAFTING}"[^>]*data-slug="a-draft"[^>]*>[\\s\\S]*?` +
        `<span class="lb-title">A Draft</span>[\\s\\S]*?` +
        `<span class="lb-version">a-draft</span>[\\s\\S]*?` +
        `<span class="lb-state"></span>[\\s\\S]*?` +
        `<span class="lb-overflow"[^>]*aria-hidden="true"[^>]*data-lb-overflow="${UUID_EDITORIAL_DRAFTING}"`,
    );
    expect(editorialListBody).toMatch(rowRe);
  });

  it('AUDIT-08: lb-overflow span is NOT in the keyboard tab order (no role, no tabindex, no aria-label)', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const editorialListBody = extractListBodySection(extractLaneSection(r.html, 'default'));
    // Pull the lb-overflow span markup for the editorial Drafting
    // entry and inspect every attribute that would land it in the
    // tab order. The prior shape carried role="button" + tabindex="0"
    // + aria-label="Actions for ..." (a focusable, screen-reader-
    // announced control with no wired handler — a dead key trap).
    // The fix removes all three; the data-uuid hook stays for the
    // future overflow-menu wiring.
    const overflowMatch = editorialListBody.match(
      /<span class="lb-overflow"[^>]*>/,
    );
    expect(overflowMatch).not.toBeNull();
    const overflowTag = overflowMatch?.[0] ?? '';
    // No role attribute at all (in particular no role="button").
    expect(overflowTag).not.toMatch(/\srole=/);
    // No tabindex attribute at all (in particular no tabindex="0").
    expect(overflowTag).not.toMatch(/\stabindex=/);
    // No aria-label (the span is aria-hidden; no accessible name).
    expect(overflowTag).not.toMatch(/\saria-label=/);
    // Aria-hidden="true" — assistive tech skips the decorative glyph.
    expect(overflowTag).toMatch(/aria-hidden="true"/);
  });

  it('Task 5.1B: locked stages in list-body get `.lb-group.locked`', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Editorial template: lockedStages = ["Final"]. The html``
    // template renders attributes across newlines, so the regex
    // tolerates whitespace between `class="..."` and the next
    // attribute.
    const editorialListBody = extractListBodySection(extractLaneSection(r.html, 'default'));
    expect(editorialListBody).toMatch(
      /<div class="lb-group[^"]*\blocked\b[^"]*"\s+data-lb-group="Final"/,
    );
    // QA template: lockedStages = ["Reviewed"].
    const qaListBody = extractListBodySection(extractLaneSection(r.html, 'qa'));
    expect(qaListBody).toMatch(
      /<div class="lb-group[^"]*\blocked\b[^"]*"\s+data-lb-group="Reviewed"/,
    );
  });

  it('Task 5.1B: empty stages in list-body render `<div class="lb-row empty-state">`', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Editorial has 1 Drafting entry; every other stage in the
    // editorial lane is empty.
    const editorialListBody = extractListBodySection(extractLaneSection(r.html, 'default'));
    expect(editorialListBody).toMatch(
      /<div class="lb-row empty-state"[^>]*data-empty-stage="Ideas"[^>]*>Nothing in ideas\./,
    );
    // The non-empty Drafting group does NOT have an empty-state row
    // — locate the Drafting group's content (between its head and
    // the next `<div class="lb-group"`) and assert empty-state is
    // absent.
    const draftingGroupRe = /<div class="lb-group[^"]*"\s+data-lb-group="Drafting">[\s\S]*?(?=<div class="lb-group|<\/div>\s*<\/article>|$)/;
    const draftingMatch = draftingGroupRe.exec(editorialListBody);
    expect(draftingMatch).not.toBeNull();
    if (draftingMatch !== null) {
      expect(draftingMatch[0]).not.toContain('empty-state');
    }
  });

  it('Task 5.1B: off-pipeline stages in list-body get `.lb-group.off-pipeline`', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Editorial off-pipeline stages: Blocked + Cancelled.
    const editorialListBody = extractListBodySection(extractLaneSection(r.html, 'default'));
    expect(editorialListBody).toMatch(
      /<div class="lb-group[^"]*\boff-pipeline\b[^"]*"\s+data-lb-group="Blocked"/,
    );
    expect(editorialListBody).toMatch(
      /<div class="lb-group[^"]*\boff-pipeline\b[^"]*"\s+data-lb-group="Cancelled"/,
    );
  });

  it('Task 5.1B: split CSS ships `.view-toggle`, body-switching, list-body, and collapse-precedence rules', async () => {
    // Per AUDIT-20260528-14: view-toggle + list-body + body-switching
    // rules live in `dashboard-swimlane-list.css`; the mobile-gated
    // view-toggle narrowing lives in `dashboard-swimlane-mobile.css`.
    const listRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-list.css'),
    );
    expect(listRes.status).toBe(200);
    const listCss = await listRes.text();
    // View-toggle primitive.
    expect(listCss).toMatch(/\.view-toggle\s*\{[\s\S]*?display:\s*inline-flex/);
    expect(listCss).toMatch(/\.view-toggle\s+\.vt-cell\s*\{[\s\S]*?min-height:\s*24px/);
    // Focus-visible ring on cells (WCAG 2.1 SC 2.4.7 AA).
    expect(listCss).toMatch(
      /\.view-toggle\s+\.vt-cell:focus-visible\s*\{[\s\S]*?outline:\s*2px\s+solid\s+var\(--er-proof-blue\)/,
    );
    // Body switching rules.
    expect(listCss).toMatch(/\.swim\.view-kanban\s+\.list-body\s*\{[\s\S]*?display:\s*none/);
    expect(listCss).toMatch(/\.swim\.view-list\s+\.stage-grid\s*\{[\s\S]*?display:\s*none/);
    // Collapse precedence (Task 5.1B.3).
    expect(listCss).toMatch(
      /\.swim\.collapsed\s+\.view-toggle\s*\{[\s\S]*?opacity:\s*0\.4[\s\S]*?pointer-events:\s*none/,
    );
    // Locked-stage proof-blue in list-body (mockup line 420 mirror).
    expect(listCss).toMatch(
      /\.list-body\s+\.lb-group\.locked\s+\.lb-glyph\s*\{[\s\S]*?color:\s*var\(--er-proof-blue\)/,
    );
    // List-body group head + row presence.
    expect(listCss).toMatch(/\.list-body\s+\.lb-group-head\s*\{/);
    expect(listCss).toMatch(/\.list-body\s+\.lb-row\s*\{/);

    // Mobile gate at 720px: view-toggle narrows. Lives in the
    // mobile-only split per AUDIT-20260528-14.
    const mobileRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-mobile.css'),
    );
    expect(mobileRes.status).toBe(200);
    const mobileCss = await mobileRes.text();
    expect(mobileCss).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.view-toggle\s+\.vt-cell\s*\{[\s\S]*?font-size:\s*0\.62rem/,
    );
  });
});
