/**
 * Phase 5 Task 5.1B mobile-variant acceptance (AUDIT-20260528-10) —
 * server-rendered mobile lane-stack markup.
 *
 * The brief at `docs/studio-design/ACCEPTED/2026-05-27-multi-lane-
 * dashboard-d3-press-bay/brief.md:14` contracts a vertical lane-
 * stack of accordion sections on mobile, separate from the desktop
 * swim-bay markup. This suite asserts the server emits both:
 *
 *   - One `<section class="lane-stack">` listing every lane.
 *   - Per-lane `<article class="lane-section">` with `<header
 *     class="lane-head">` carrying chevron + compose chip + view-
 *     toggle, and `<div class="lane-body">` holding the list-mode
 *     stage groups (+ empty-CTA on empty lanes).
 *
 * Pure integration — uses real sidecars, real lane configs, real
 * pipeline templates via the shared three-lane fixture. No mocks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import {
  setupDashboardFixture,
  getHtml,
  makeConfig,
  makeEntry,
  writeLane,
  UUID_EDITORIAL_DRAFTING,
} from './__helpers/dashboard-swimlane-fixture.ts';
import { createApp } from '../src/server.ts';

/**
 * Extract the substring of HTML from `<section class="lane-stack"`
 * through its closing `</section>` so per-lane assertions don't
 * leak into the desktop bay-body siblings.
 */
function extractLaneStackSection(html: string): string {
  const open = html.indexOf('<section class="lane-stack"');
  if (open === -1) return '';
  // The lane-stack is the FINAL section inside the bay-main; look
  // forward for the closing tag matched against the open.
  const closeMarker = '</section>';
  // Walk forward past any nested <section> tags inside lane-section
  // articles. The renderer emits no nested <section>s but the
  // walking pattern is safe even so.
  const close = html.indexOf(closeMarker, open);
  if (close === -1) return html.slice(open);
  return html.slice(open, close + closeMarker.length);
}

/**
 * Extract the substring of HTML from `<article class="lane-section"
 * ... data-lane-id="<id>"` through its closing `</article>`.
 */
function extractLaneSectionMarkup(html: string, laneId: string): string {
  const openPattern = new RegExp(
    `<article class="lane-section(?:\\s[^"]*)?"[^>]*data-lane-id="${laneId}"`,
  );
  const m = openPattern.exec(html);
  if (m === null) return '';
  const close = html.indexOf('</article>', m.index);
  if (close === -1) return html.slice(m.index);
  return html.slice(m.index, close + '</article>'.length);
}

describe('dashboard lane-stack mobile variant — render (AUDIT-20260528-10)', () => {
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

  it('emits exactly one `<section class="lane-stack">` per dashboard render', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const matches = r.html.match(/<section class="lane-stack"/g) ?? [];
    expect(matches.length).toBe(1);
    // The lane-stack carries `data-lane-stack` so the client
    // controller picks it up.
    expect(r.html).toContain('<section class="lane-stack" data-lane-stack>');
  });

  it('emits one `<article class="lane-section">` per lane with data-lane-id matching the bucket', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const stack = extractLaneStackSection(r.html);
    expect(stack).not.toBe('');
    const sections = stack.match(/<article class="lane-section[^"]*"/g) ?? [];
    expect(sections.length).toBe(3);
    for (const id of ['default', 'mockups', 'qa']) {
      expect(stack).toMatch(
        new RegExp(
          `<article class="lane-section(?:\\s[^"]*)?"[^>]*data-lane-id="${id}"`,
        ),
      );
    }
  });

  it('each lane-section carries a `<header class="lane-head">` with chevron + compose + view-toggle', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const stack = extractLaneStackSection(r.html);
    const editorial = extractLaneSectionMarkup(stack, 'default');
    expect(editorial).not.toBe('');
    // The lane-head wraps every affordance.
    expect(editorial).toMatch(/<header class="lane-head" data-lane-head>/);
    // Chevron with data-collapse-target="lane-section" (the new
    // mobile-only collapse scope) + aria-expanded="true" + descriptive
    // aria-label + aria-controls pointing at the body's id.
    expect(editorial).toMatch(
      /<button class="lh-chev collapse-chev"[^>]*aria-expanded="true"[^>]*aria-label="Collapse Editorial lane"[^>]*aria-controls="lane-body-default"[^>]*data-collapse-target="lane-section"[^>]*data-lane-id="default"[^>]*data-lane-name="Editorial"/,
    );
    // Compose chip (shares `.swim-compose` + `data-swim-compose` with
    // desktop so `initSwimlaneCompose` wires both DOM trees).
    expect(editorial).toMatch(
      /<button class="swim-compose lh-compose"[^>]*data-swim-compose[^>]*data-lane-id="default"[^>]*data-first-stage="Ideas"/,
    );
    // View-toggle (shares `.view-toggle` + `data-view-toggle` with
    // desktop so `initSwimlaneViewToggle` wires both).
    expect(editorial).toMatch(
      /<div class="view-toggle lh-view-toggle"[^>]*role="radiogroup"[^>]*data-view-toggle[^>]*data-lane-id="default"/,
    );
    // Server-default on mobile is LIST view (per the brief).
    expect(editorial).toMatch(
      /<button class="vt-cell vt-cell--list active"[^>]*role="radio"[^>]*aria-checked="true"[^>]*data-view-mode="list"/,
    );
    expect(editorial).toMatch(
      /<button class="vt-cell vt-cell--kanban"[^>]*role="radio"[^>]*aria-checked="false"[^>]*data-view-mode="kanban"/,
    );
  });

  it('each lane-section has a `<div class="lane-body">` carrying the list-mode group markup', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const stack = extractLaneStackSection(r.html);
    const editorial = extractLaneSectionMarkup(stack, 'default');
    // The lane-body carries data-lane-body + a deterministic id used
    // by the chevron's aria-controls.
    expect(editorial).toMatch(
      /<div class="lane-body" data-lane-body\s*id="lane-body-default">/,
    );
    // The body contains list-body markup (reused from
    // `renderListBody` so the list-mode CSS already styles it).
    expect(editorial).toMatch(/<div class="list-body" data-list-body>/);
    // Editorial template has 8 stages (6 linear + 2 off-pipeline)
    // → 8 `.lb-group` entries inside the lane-body. The regex below
    // matches the root `<div class="lb-group ..."` only, not the
    // inner `.lb-group-head` whose class string starts with `lb-
    // group-`. The `data-lb-group="<stage>"` attribute is the
    // canonical group marker.
    const lbGroups = editorial.match(/data-lb-group="[^"]+"/g) ?? [];
    expect(lbGroups.length).toBe(8);
  });

  it('lane-section carries `is-focus-hidden` for lanes not in the URL focus set', async () => {
    // ?focus=default narrows the focus to the editorial lane only;
    // mockups + qa should each carry `is-focus-hidden` on their
    // mobile lane-section to mirror the desktop swim's focus
    // suppression.
    const r = await getHtml(app, '/dev/editorial-studio?focus=default');
    expect(r.status).toBe(200);
    const stack = extractLaneStackSection(r.html);
    // Default is in focus — no is-focus-hidden.
    const editorial = extractLaneSectionMarkup(stack, 'default');
    expect(editorial).not.toContain('is-focus-hidden');
    // Mockups + qa are out of focus.
    const mockups = extractLaneSectionMarkup(stack, 'mockups');
    expect(mockups).toContain('is-focus-hidden');
    const qa = extractLaneSectionMarkup(stack, 'qa');
    expect(qa).toContain('is-focus-hidden');
  });

  it('emits the empty-lane CTA inside the lane-body for empty lanes (AUDIT-10)', async () => {
    // Build a fresh app with one EMPTY lane (mockups) so we can
    // assert the lane-stack version of the empty CTA fires.
    const emptyRoot = mkdtempSync(join(tmpdir(), 'deskwork-lane-stack-empty-'));
    try {
      mkdirSync(join(emptyRoot, '.deskwork', 'entries'), { recursive: true });
      mkdirSync(join(emptyRoot, '.deskwork', 'lanes'), { recursive: true });
      writeLane(emptyRoot, 'default', 'Editorial', 'editorial', 'docs');
      writeLane(emptyRoot, 'mockups', 'Mockups', 'visual', 'mockups');
      const emptyApp = createApp({ projectRoot: emptyRoot, config: makeConfig() });
      // Editorial has one entry; mockups is empty.
      await writeSidecar(
        emptyRoot,
        makeEntry({
          uuid: UUID_EDITORIAL_DRAFTING,
          slug: 'a-draft',
          title: 'A Draft',
          currentStage: 'Drafting',
          iterationByStage: { Drafting: 1 },
          lane: 'default',
        }),
      );
      const r = await getHtml(emptyApp, '/dev/editorial-studio');
      expect(r.status).toBe(200);
      const stack = extractLaneStackSection(r.html);
      const mockups = extractLaneSectionMarkup(stack, 'mockups');
      // The empty CTA shares its primitive with desktop so
      // `initSwimlaneCompose` wires either DOM tree.
      expect(mockups).toContain('class="swim-empty-cta lane-empty-cta"');
      expect(mockups).toMatch(
        /<button class="sec-cta"[^>]*aria-label="Compose first entry in Mockups"[^>]*data-swim-empty-copy[^>]*data-lane-id="mockups"/,
      );
      expect(mockups).toMatch(/<code>\/deskwork:add --lane mockups<\/code>/);
      // The non-empty editorial lane must NOT carry the empty CTA
      // inside its mobile lane-section.
      const editorial = extractLaneSectionMarkup(stack, 'default');
      expect(editorial).not.toContain('lane-empty-cta');
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it('emits a `.bay-body` wrapper around the desktop swim markup so CSS can hide the desktop body on mobile', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // The desktop bay-body wraps every `<article class="swim">` (3
    // lanes × 1 swim each = 3 swims). The wrapper exists so the
    // mobile CSS can hide all of them with one rule while keeping
    // the bay-head + lane-stack visible.
    expect(r.html).toContain('<div class="bay-body" data-bay-body>');
  });

  it('CSS file `dashboard-lane-stack.css` ships the gating rules', async () => {
    // The page's CSS includes list pulls the file in.
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.html).toContain('/static/css/dashboard-lane-stack.css');
    // Fetch the CSS and assert the gating rules are present.
    const css = await app.fetch(
      new Request('http://x/static/css/dashboard-lane-stack.css'),
    );
    expect(css.status).toBe(200);
    const cssText = await css.text();
    // Desktop default: lane-stack hidden.
    expect(cssText).toMatch(/^\.lane-stack\s*\{[\s\S]*?display:\s*none/m);
    // Mobile gate: bay-body hidden, lane-stack shown.
    expect(cssText).toMatch(/@media\s*\(max-width:\s*720px\)/);
    expect(cssText).toMatch(
      /@media\s*\(max-width:\s*720px\)[\s\S]*?\.bay-body\s*\{[\s\S]*?display:\s*none/,
    );
    expect(cssText).toMatch(
      /@media\s*\(max-width:\s*720px\)[\s\S]*?\.lane-stack\s*\{[\s\S]*?display:\s*block/,
    );
    // The accordion uses the `hidden` attribute on the lane-body so
    // screen readers skip collapsed sections — that's the spec
    // contract, not a CSS-only display:none.
    expect(cssText).toMatch(/\.lane-body\[hidden\]\s*\{[\s\S]*?display:\s*none/);
  });
});
