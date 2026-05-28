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
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import { createApp } from '../src/server.ts';

const UUID_EDITORIAL_DRAFTING = '11111111-1111-4111-8111-111111111111';
const UUID_VISUAL_SKETCHED = '22222222-2222-4222-8222-222222222222';
const UUID_VISUAL_APPROVED = '33333333-3333-4333-8333-333333333333';
const UUID_QA_DRAFTED = '44444444-4444-4444-8444-444444444444';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      d: {
        contentDir: 'docs',
        calendarPath: '.deskwork/calendar.md',
      },
    },
    defaultSite: 'd',
  };
}

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    uuid: UUID_EDITORIAL_DRAFTING,
    slug: 'placeholder',
    title: 'Placeholder',
    keywords: [],
    source: 'manual',
    currentStage: 'Ideas',
    iterationByStage: { Ideas: 0 },
    createdAt: '2026-05-27T10:00:00.000Z',
    updatedAt: '2026-05-27T10:00:00.000Z',
    ...overrides,
  };
}

function writeLane(
  root: string,
  id: string,
  name: string,
  pipelineTemplate: string,
  contentDir: string,
): void {
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify({ id, name, pipelineTemplate, contentDir }, null, 2),
    'utf8',
  );
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('dashboard swimlane shell — Phase 5 Task 5.1', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-dash-swimlane-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });

    // Three lanes on disk: editorial (default) + visual (mockups) +
    // qa-plan (qa). The bootstrap helper sees default.json on disk
    // and short-circuits without writing — that's the legitimate
    // multi-lane configuration.
    writeLane(root, 'default', 'Editorial', 'editorial', 'docs');
    writeLane(root, 'mockups', 'Mockups', 'visual', 'mockups');
    writeLane(root, 'qa', 'QA', 'qa-plan', 'qa');

    app = createApp({ projectRoot: root, config: makeConfig() });

    // One entry per lane in different stages so we can verify the
    // template-driven stage columns show up correctly.
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_EDITORIAL_DRAFTING,
        slug: 'a-draft',
        title: 'A Draft',
        currentStage: 'Drafting',
        iterationByStage: { Drafting: 1 },
        lane: 'default',
      }),
    );
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_VISUAL_SKETCHED,
        slug: 'logo-rough',
        title: 'Logo rough',
        currentStage: 'Sketched',
        iterationByStage: { Sketched: 0 },
        lane: 'mockups',
      }),
    );
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_VISUAL_APPROVED,
        slug: 'icon-set',
        title: 'Icon set',
        currentStage: 'Approved',
        iterationByStage: { Approved: 0 },
        lane: 'mockups',
      }),
    );
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_QA_DRAFTED,
        slug: 'release-qa',
        title: 'Release QA',
        currentStage: 'Drafted',
        iterationByStage: { Drafted: 0 },
        lane: 'qa',
      }),
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
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

  it('lane-visibility rail contains one row per lane with drag stub', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const railMatches = r.html.match(/data-rail-lane="[^"]+"/g) ?? [];
    expect(railMatches.length).toBe(3);
    expect(r.html).toContain('data-rail-lane="default"');
    expect(r.html).toContain('data-rail-lane="mockups"');
    expect(r.html).toContain('data-rail-lane="qa"');
    // Drag handle stub renders (Task 5.4 wires the handler).
    expect(r.html).toMatch(/<span class="rail-drag" aria-hidden="true">⋮⋮<\/span>/);
  });

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

  it('loads dashboard-swimlane.css alongside existing stylesheets', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toContain('/static/css/dashboard-swimlane.css');
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

  // AUDIT-20260528-02 acceptance: server renders BOTH the swim and
  // stub for every visibility-on lane, with exactly one carrying
  // is-focus-hidden based on initial focus state.
  it('AUDIT-02: every visibility-on lane emits BOTH <article class="swim"> AND <button class="swim-stub">', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Default render — all lanes focused.
    const swims = r.html.match(/<article class="swim(?:\s[^"]*)?"/g) ?? [];
    const stubs = r.html.match(/<button class="swim-stub(?:\s[^"]*)?"/g) ?? [];
    expect(swims.length).toBe(3);
    expect(stubs.length).toBe(3);
    // With nothing in `?focus=`, all 3 swims show and all 3 stubs hide.
    // Task 5.1B added the `view-kanban` server-default class token; the
    // regex tolerates additional class tokens after `swim--<id>`.
    for (const id of ['default', 'mockups', 'qa']) {
      // swim is NOT focus-hidden
      const swimRe = new RegExp(
        `<article class="swim swim--[a-z0-9-]+[^"]*"[^>]*data-lane-id="${id}"`,
      );
      expect(r.html).toMatch(swimRe);
      // stub IS focus-hidden
      const stubRe = new RegExp(
        `<button class="swim-stub is-focus-hidden"[^>]*data-swim-stub="${id}"`,
      );
      expect(r.html).toMatch(stubRe);
    }
  });

  it('AUDIT-02: with ?focus= narrowing, exactly one of {swim, stub} per lane carries is-focus-hidden', async () => {
    // Focus only default + mockups; qa is focus-off.
    const r = await getHtml(app, '/dev/editorial-studio?focus=default,mockups');
    expect(r.status).toBe(200);
    // Focused lanes — swim visible, stub hidden.
    for (const id of ['default', 'mockups']) {
      const swimRe = new RegExp(
        `<article class="swim swim--[a-z0-9-]+[^"]*"[^>]*data-lane-id="${id}"`,
      );
      expect(r.html).toMatch(swimRe);
      const stubRe = new RegExp(
        `<button class="swim-stub is-focus-hidden"[^>]*data-swim-stub="${id}"`,
      );
      expect(r.html).toMatch(stubRe);
    }
    // Non-focused — swim hidden, stub visible.
    expect(r.html).toMatch(
      /<article class="swim swim--qa-plan[^"]*\bis-focus-hidden\b[^"]*"[^>]*data-lane-id="qa"/,
    );
    expect(r.html).toMatch(
      /<button class="swim-stub"[^>]*data-swim-stub="qa"/,
    );
  });

  // AUDIT-20260528-04 acceptance: rail eye renders BOTH glyphs as
  // siblings; CSS picks one based on data-lane-visible. Focus-chip
  // CSS class `.focus-chip.is-visibility-hidden` is the surface the
  // client toggles on visibility-off lanes. F6 a11y fix promoted
  // the eye container from `<span class="r-eye">` to `<button
  // class="r-eye-btn">` so the regex matches the new shape.
  it('AUDIT-04: rail row emits both `.r-eye-visible` (●) and `.r-eye-hidden` (○) glyphs inside the eye-button', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    for (const id of ['default', 'mockups', 'qa']) {
      const re = new RegExp(
        `data-rail-lane="${id}"[\\s\\S]*?<button class="r-eye-btn"[\\s\\S]*?` +
          `<span class="r-eye-visible" aria-hidden="true">●</span>` +
          `<span class="r-eye-hidden" aria-hidden="true">○</span>` +
          `[\\s\\S]*?</button>`,
      );
      expect(r.html).toMatch(re);
    }
  });

  it('F6 a11y: the eye-toggle is a focusable <button class="r-eye-btn"> with a non-empty aria-label', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    for (const id of ['default', 'mockups', 'qa']) {
      const re = new RegExp(
        `data-rail-lane="${id}"[\\s\\S]*?<button class="r-eye-btn"[^>]*` +
          `data-rail-eye="${id}"[^>]*aria-label="[^"]+"`,
      );
      expect(r.html).toMatch(re);
    }
  });

  it('AUDIT-04: dashboard-swimlane.css contains `.focus-chip.is-visibility-hidden` hide rule', async () => {
    const cssRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane.css'),
    );
    expect(cssRes.status).toBe(200);
    const css = await cssRes.text();
    // Rule body has display: none; matched via the selector list
    // including .focus-chip.is-visibility-hidden.
    expect(css).toMatch(
      /\.focus-chip\.is-visibility-hidden[\s\S]*?display:\s*none/,
    );
    // Eye-glyph swap rules — selector + display:inline (F6 fix
    // selectors target `.r-eye-btn`).
    expect(css).toMatch(
      /\.rail-lane\[data-lane-visible="true"\] \.r-eye-btn \.r-eye-visible/,
    );
    expect(css).toMatch(
      /\.rail-lane\[data-lane-visible="false"\] \.r-eye-btn \.r-eye-hidden/,
    );
  });

  // AUDIT-20260528-05 acceptance: stage IDs are lane-scoped + unique;
  // legacy `id="stage-<slug>"` survives ONLY for the default lane.
  it('AUDIT-05: multi-lane stage columns carry unique `id="lane-<laneId>-stage-<slug>"` IDs', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Both visual and qa-plan templates contain an "Approved" stage.
    // Each lane's Approved column must carry a unique lane-scoped ID.
    expect(r.html).toContain('id="lane-mockups-stage-approved"');
    expect(r.html).toContain('id="lane-qa-stage-approved"');
    // Default lane's Drafting column carries the lane-scoped ID too.
    expect(r.html).toContain('id="lane-default-stage-drafting"');
    // No duplicate `id="..."` attributes anywhere in the rendered
    // dashboard output — gather every id value and assert uniqueness.
    // Match `id="..."` preceded by whitespace (not by `-`, which
    // would also match `data-lane-id` / `data-stage-id` etc.).
    const idMatches = r.html.match(/\sid="([^"]+)"/g) ?? [];
    const idValues = idMatches.map((m) => m.replace(/^\sid="(.+)"$/, '$1'));
    const dedup = new Set(idValues);
    expect(dedup.size).toBe(idValues.length);
  });

  it('AUDIT-05: legacy `id="stage-<slug>"` anchor is preserved ONLY for the default editorial lane', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Default lane Drafting column carries the back-compat anchor
    // (used by `/dev/editorial-studio#stage-drafting` deep links).
    expect(r.html).toContain('id="stage-drafting"');
    expect(r.html).toContain('id="stage-ideas"');
    // Non-default lanes do NOT emit the bare-anchor form for stages
    // that exist only in their template. `Sketched` is unique to the
    // visual template, so no `id="stage-sketched"` should appear.
    expect(r.html).not.toContain('id="stage-sketched"');
    expect(r.html).not.toContain('id="stage-drafted"');
    expect(r.html).not.toContain('id="stage-tested"');
  });

  // Task 5.1A acceptance — lane-level + per-stage collapse chevrons.
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

  it('Task 5.1A: dashboard-swimlane.css ships the universal `.collapse-chev` primitive + collapsed-state rules', async () => {
    const cssRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane.css'),
    );
    expect(cssRes.status).toBe(200);
    const css = await cssRes.text();
    // Universal primitive: min-width: 24px + min-height: 24px (WCAG
    // 2.2 SC 2.5.8 AA target size).
    expect(css).toMatch(/\.collapse-chev\s*\{[\s\S]*?min-width:\s*24px/);
    expect(css).toMatch(/\.collapse-chev\s*\{[\s\S]*?min-height:\s*24px/);
    // Focus-visible ring (WCAG 2.1 SC 2.4.7 AA).
    expect(css).toMatch(
      /\.collapse-chev:focus-visible\s*\{[\s\S]*?outline:\s*2px\s+solid\s+var\(--er-proof-blue\)/,
    );
    // Collapsed-state rotation.
    expect(css).toMatch(
      /\.collapse-chev\[aria-expanded="false"\]\s*\{[\s\S]*?transform:\s*rotate\(-90deg\)/,
    );
    // Lane-level: `.swim.collapsed` hides the stage-grid (already
    // shipped in 5.1; the reciprocal CSS makes the chevron the only
    // toggle).
    expect(css).toMatch(/\.swim\.collapsed\s+\.stage-grid\s*\{[\s\S]*?display:\s*none/);
    // Per-stage: `.stage-col.collapsed` becomes a 42px strip.
    expect(css).toMatch(
      /\.stage-col\.collapsed\s*\{[\s\S]*?flex:\s*0\s+0\s+42px/,
    );
    // Vertical writing-mode for the rotated stage name.
    expect(css).toMatch(
      /\.stage-col\.collapsed\s+\.stage-head\s+\.stage-name\s*\{[\s\S]*?writing-mode:\s*vertical-rl/,
    );
  });

  // ============================================================
  //  Task 5.1B — per-lane kanban ↔ list view toggle.
  // ============================================================

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
    // Three lanes × 2 cells = 6 cell buttons.
    const kanbanCells = r.html.match(
      /<button class="vt-cell vt-cell--kanban[^"]*"[^>]*type="button"[^>]*role="radio"/g,
    ) ?? [];
    expect(kanbanCells.length).toBe(3);
    const listCells = r.html.match(
      /<button class="vt-cell vt-cell--list"[^>]*type="button"[^>]*role="radio"/g,
    ) ?? [];
    expect(listCells.length).toBe(3);
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
    expect(lists.length).toBe(3);
    // Each lane has both bodies inside its swim.
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
    // The row carries data attributes + the three spans + a role=
    // "button" overflow span (nested `<button>` would be invalid
    // inside a wrapping `<a>` — interactive inside interactive).
    const rowRe = new RegExp(
      `<a class="lb-row"[^>]*data-stage="Drafting"[^>]*data-uuid="${UUID_EDITORIAL_DRAFTING}"[^>]*data-slug="a-draft"[^>]*>[\\s\\S]*?` +
        `<span class="lb-title">A Draft</span>[\\s\\S]*?` +
        `<span class="lb-version">a-draft</span>[\\s\\S]*?` +
        `<span class="lb-state"></span>[\\s\\S]*?` +
        `<span class="lb-overflow"[^>]*role="button"[^>]*aria-label="Actions for A Draft"`,
    );
    expect(editorialListBody).toMatch(rowRe);
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

  it('Task 5.1B: CSS ships `.view-toggle`, body-switching, list-body, and collapse-precedence rules', async () => {
    const cssRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane.css'),
    );
    expect(cssRes.status).toBe(200);
    const css = await cssRes.text();
    // View-toggle primitive.
    expect(css).toMatch(/\.view-toggle\s*\{[\s\S]*?display:\s*inline-flex/);
    expect(css).toMatch(/\.view-toggle\s+\.vt-cell\s*\{[\s\S]*?min-height:\s*24px/);
    // Focus-visible ring on cells (WCAG 2.1 SC 2.4.7 AA).
    expect(css).toMatch(
      /\.view-toggle\s+\.vt-cell:focus-visible\s*\{[\s\S]*?outline:\s*2px\s+solid\s+var\(--er-proof-blue\)/,
    );
    // Body switching rules.
    expect(css).toMatch(/\.swim\.view-kanban\s+\.list-body\s*\{[\s\S]*?display:\s*none/);
    expect(css).toMatch(/\.swim\.view-list\s+\.stage-grid\s*\{[\s\S]*?display:\s*none/);
    // Collapse precedence (Task 5.1B.3).
    expect(css).toMatch(
      /\.swim\.collapsed\s+\.view-toggle\s*\{[\s\S]*?opacity:\s*0\.4[\s\S]*?pointer-events:\s*none/,
    );
    // Locked-stage proof-blue in list-body (mockup line 420 mirror).
    expect(css).toMatch(
      /\.list-body\s+\.lb-group\.locked\s+\.lb-glyph\s*\{[\s\S]*?color:\s*var\(--er-proof-blue\)/,
    );
    // List-body group head + row presence.
    expect(css).toMatch(/\.list-body\s+\.lb-group-head\s*\{/);
    expect(css).toMatch(/\.list-body\s+\.lb-row\s*\{/);
    // Mobile gate at 720px: view-toggle narrows.
    expect(css).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.view-toggle\s+\.vt-cell\s*\{[\s\S]*?font-size:\s*0\.62rem/,
    );
  });
});

/**
 * Extract the substring of HTML from a `<article class="swim"
 * data-lane-id="<id>"` to its closing `</article>`. Used to scope
 * per-lane assertions so a Drafting column in editorial doesn't
 * leak into mockups-lane assertions.
 */
function extractLaneSection(html: string, laneId: string): string {
  // Matches `<article class="swim"` or `<article class="swim swim--<id>"`
  // — Finding 3 added the template-id modifier so the regex tolerates
  // additional class tokens before the `data-lane-id` attribute.
  const openPattern = new RegExp(
    `<article class="swim(?:\\s[^"]*)?"[^>]*data-lane-id="${laneId}"`,
  );
  const openMatch = openPattern.exec(html);
  if (openMatch === null) return '';
  const startIdx = openMatch.index;
  const closeIdx = html.indexOf('</article>', startIdx);
  if (closeIdx === -1) return html.slice(startIdx);
  return html.slice(startIdx, closeIdx + '</article>'.length);
}

function extractStageCols(htmlSection: string): readonly string[] {
  return htmlSection.match(/data-stage-col="[^"]+"/g) ?? [];
}

/**
 * Extract the substring of HTML between a swim's `<div class="stage-
 * grid">` opening and its closing tag. Task 5.1B added a sibling
 * `<div class="list-body">` — when callers want to assert kanban-
 * specific markup without leaking into list-body matches, slice the
 * stage-grid section first.
 */
function extractStageGridSection(htmlSection: string): string {
  const openIdx = htmlSection.indexOf('<div class="stage-grid"');
  if (openIdx === -1) return '';
  const sentinel = '<div class="list-body"';
  const closeIdx = htmlSection.indexOf(sentinel, openIdx);
  if (closeIdx === -1) return htmlSection.slice(openIdx);
  return htmlSection.slice(openIdx, closeIdx);
}

/**
 * Extract the substring of HTML between a swim's `<div class="list-
 * body">` opening and its closing tag (the swim's closing
 * `</article>` is the boundary). Used to scope assertions inside the
 * list-body without bleeding into the kanban stage-grid above.
 */
function extractListBodySection(htmlSection: string): string {
  const openIdx = htmlSection.indexOf('<div class="list-body"');
  if (openIdx === -1) return '';
  const closeIdx = htmlSection.indexOf('</article>', openIdx);
  if (closeIdx === -1) return htmlSection.slice(openIdx);
  return htmlSection.slice(openIdx, closeIdx);
}
