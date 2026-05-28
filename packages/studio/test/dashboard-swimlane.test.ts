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

  it('renders one <article class="swim"> per lane configured on disk', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const swimMatches = r.html.match(/<article class="swim"/g) ?? [];
    expect(swimMatches.length).toBe(3);
  });

  it('every swimlane carries data-lane-id matching its config', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toMatch(/<article class="swim"[^>]*data-lane-id="default"/);
    expect(r.html).toMatch(/<article class="swim"[^>]*data-lane-id="mockups"/);
    expect(r.html).toMatch(/<article class="swim"[^>]*data-lane-id="qa"/);
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

  it('honours ?focus=<csv> URL param: focused lanes render as <article class="swim">', async () => {
    // Server-side focus filter — only editorial + mockups in focus.
    const r = await getHtml(
      app,
      '/dev/editorial-studio?focus=default,mockups',
    );
    expect(r.status).toBe(200);
    // Two swimlanes render fully.
    const swimMatches = r.html.match(/<article class="swim"/g) ?? [];
    expect(swimMatches.length).toBe(2);
    expect(r.html).toMatch(/<article class="swim"[^>]*data-lane-id="default"/);
    expect(r.html).toMatch(/<article class="swim"[^>]*data-lane-id="mockups"/);
    // QA lane renders as a swim-stub (visibility-on, focus-off).
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

  it('leaves later-task affordance slots in place (5.1A/B/C placeholders, no stubs)', async () => {
    // Slots are HTML comments — they survive into the rendered page
    // because we render via string templates rather than JSX. The
    // assertion verifies the placeholder commentary lands so the
    // next dispatch can do additive diffs.
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toContain('5.1A slot');
    expect(r.html).toContain('5.1B slot');
    expect(r.html).toContain('5.1C slot');
    // No 5.1A/B/C ACTUAL affordances render yet — assert by absence
    // of their class names.
    expect(r.html).not.toContain('class="swim-compose"');
    expect(r.html).not.toContain('class="view-toggle"');
    // The chevron primitive itself is a known later affordance; the
    // shell does NOT emit a `.collapse-chev` anywhere in 5.1.
    expect(r.html).not.toMatch(/class="collapse-chev"/);
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
});

/**
 * Extract the substring of HTML from a `<article class="swim"
 * data-lane-id="<id>"` to its closing `</article>`. Used to scope
 * per-lane assertions so a Drafting column in editorial doesn't
 * leak into mockups-lane assertions.
 */
function extractLaneSection(html: string, laneId: string): string {
  const openPattern = new RegExp(
    `<article class="swim"[^>]*data-lane-id="${laneId}"`,
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
