/**
 * Phase 5 Task 5.6 — integration test against a multi-lane fixture
 * (server-side / node env).
 *
 * Boots the studio against the canonical "3 lanes × 2 entries"
 * fixture from `dashboard-swimlane-integration-fixture.ts` and
 * asserts the structural invariants the server contract promises
 * for the multi-lane shape. The complementary jsdom client tests
 * in `dashboard-swimlane-integration-client.test.ts` exercise the
 * controllers (collapse, view-toggle, compose chip) against a
 * synthesised DOM mirroring this server output.
 *
 * The two-file split is forced by the esbuild + jsdom Uint8Array
 * invariant conflict — see the header in
 * `dashboard-swimlane-integration-fixture.ts` for the rationale.
 * Both files share one fixture-builder so the on-disk tree shape
 * is asserted exactly once.
 *
 * Coverage in this file (server contract):
 *   - Step 5.6.1: builds the fixture once per test via the shared
 *     helper.
 *   - Step 5.6.2: three <article class="swim"> per lane; stage
 *     columns match each lane's template; focus-chip strip shows
 *     3 chips + "All"; lane-visibility rail lists all 3 lanes with
 *     `.r-eye-btn`; hidden-lane total still includes hidden lane's
 *     entries (server-rendered total = 6 across all lanes).
 *   - Step 5.6.6: CSS rules for the mobile lane-sheet trigger and
 *     `.sc-label { display: none }` compact compose-chip form ship
 *     in the dashboard stylesheet.
 *
 * Per `.claude/rules/testing.md`, the fixture project tree lives on
 * disk via `mkdtempSync`. No filesystem mocks. The HTML+CSS
 * responses are fetched through the real `createApp` Hono router.
 *
 * Per `.claude/rules/ui-verification.md`, the dual-viewport sentence
 * for this surface is: desktop CSS rules (default trigger hidden +
 * default `.sc-label` shown) AND mobile CSS rules (trigger shown +
 * `.sc-label` hidden) both verified in the same suite via the CSS
 * response body. Companion full-browser smoke is
 * `scripts/smoke-er-viewport-regressions.mjs` (local-only — see the
 * doc-comment on the matching test in the client file).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { createApp } from '../src/server.ts';
import {
  buildMultiLaneFixture,
  makeConfig,
} from './dashboard-swimlane-integration-fixture';

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

async function getCss(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; css: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, css: await res.text() };
}

function extractLaneSection(html: string, laneId: string): string {
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

describe('Phase 5 Task 5.6 — multi-lane integration (server)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    root = await buildMultiLaneFixture();
    app = createApp({ projectRoot: root, config: makeConfig() });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // ============================================================
  //  Step 5.6.2 — Structural invariants from the rendered HTML.
  // ============================================================

  it('Step 5.6.2: three <article class="swim"> elements (one per lane)', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const swimMatches = r.html.match(/<article class="swim(?:\s[^"]*)?"/g) ?? [];
    expect(swimMatches.length).toBe(3);
    expect(r.html).toMatch(
      /<article class="swim swim--editorial[^"]*"[^>]*data-lane-id="default"/,
    );
    expect(r.html).toMatch(
      /<article class="swim swim--visual[^"]*"[^>]*data-lane-id="mockups"/,
    );
    expect(r.html).toMatch(
      /<article class="swim swim--qa-plan[^"]*"[^>]*data-lane-id="qa"/,
    );
  });

  it('Step 5.6.2: each swimlane carries stage columns matching its template (linear + off-pipeline)', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // editorial: 6 linear + 2 off-pipeline = 8 columns.
    const editorialBlock = extractLaneSection(r.html, 'default');
    expect((editorialBlock.match(/data-stage-col="[^"]+"/g) ?? []).length).toBe(8);
    // visual: 4 linear + 3 off-pipeline = 7.
    const mockupsBlock = extractLaneSection(r.html, 'mockups');
    expect((mockupsBlock.match(/data-stage-col="[^"]+"/g) ?? []).length).toBe(7);
    // qa-plan: 4 linear + 3 off-pipeline = 7.
    const qaBlock = extractLaneSection(r.html, 'qa');
    expect((qaBlock.match(/data-stage-col="[^"]+"/g) ?? []).length).toBe(7);
  });

  it('Step 5.6.2: focus-chip strip shows 3 lane chips + the "All" chip', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const chipMatches = r.html.match(/data-focus-chip="[^"]+"/g) ?? [];
    expect(chipMatches.length).toBe(3);
    expect(r.html).toContain('data-focus-chip="default"');
    expect(r.html).toContain('data-focus-chip="mockups"');
    expect(r.html).toContain('data-focus-chip="qa"');
    expect(r.html).toContain('data-focus-chip-all');
  });

  it('Step 5.6.2: lane-visibility rail lists all 3 lanes with .r-eye-btn per row', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const railMatches = r.html.match(/data-rail-lane="[^"]+"/g) ?? [];
    expect(railMatches.length).toBe(3);
    for (const id of ['default', 'mockups', 'qa']) {
      const re = new RegExp(
        `data-rail-lane="${id}"[\\s\\S]*?<button class="r-eye-btn"[^>]*data-rail-eye="${id}"`,
      );
      expect(r.html).toMatch(re);
    }
  });

  it('Step 5.6.2: hidden-lane scenario — server-rendered total count still includes the hidden lane\'s entries (6 across all 3 lanes)', async () => {
    // Server has no knowledge of client-side visibility state — the
    // bay-head total is rendered once from the on-disk lane buckets.
    // Even if the operator hides a lane client-side, the total stays
    // at 6 (2 entries × 3 lanes). The client-side jsdom companion test
    // verifies the .is-visibility-hidden modifier is applied to the
    // matching swim + chip + rail row when localStorage carries the
    // hidden set.
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toContain('6 entries');
  });

  it('Step 5.6.2: entries render inside the right lane + stage column', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // default lane carries Drafting + Final entries.
    const editorialBlock = extractLaneSection(r.html, 'default');
    expect(editorialBlock).toContain('data-slug="default-1"');
    expect(editorialBlock).toContain('data-slug="default-2"');
    // mockups lane carries Sketched + Approved entries.
    const mockupsBlock = extractLaneSection(r.html, 'mockups');
    expect(mockupsBlock).toContain('data-slug="mockups-1"');
    expect(mockupsBlock).toContain('data-slug="mockups-2"');
    // qa lane carries Drafted + Reviewed entries.
    const qaBlock = extractLaneSection(r.html, 'qa');
    expect(qaBlock).toContain('data-slug="qa-1"');
    expect(qaBlock).toContain('data-slug="qa-2"');
  });

  // ============================================================
  //  Step 5.6.6 — Phone-viewport CSS contract (dual-viewport rules
  //  both ship in the served stylesheet).
  // ============================================================

  it('Step 5.6.6: CSS ships the desktop default + mobile-gated `.lane-sheet-trigger` rules (dual-viewport)', async () => {
    // Per AUDIT-20260528-14: the dashboard-swimlane CSS bundle was
    // split per-section; both the desktop default and the mobile-gated
    // rule for `.lane-sheet-trigger` land in
    // `dashboard-swimlane-mobile.css` (which centralises the responsive
    // cascade).
    const r = await getCss(app, '/static/css/dashboard-swimlane-mobile.css');
    expect(r.status).toBe(200);
    // Desktop default — trigger hidden.
    expect(r.css).toMatch(/\.lane-sheet-trigger\s*\{[\s\S]*?display:\s*none/);
    // Mobile breakpoint — trigger visible.
    expect(r.css).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.lane-sheet-trigger\s*\{[\s\S]*?display:\s*inline-flex/,
    );
  });

  it('Step 5.6.6: CSS ships the mobile-gated `.swim-compose .sc-label { display: none }` rule (compact compose-chip form on phone)', async () => {
    const r = await getCss(app, '/static/css/dashboard-swimlane-mobile.css');
    expect(r.status).toBe(200);
    // The compact compose-chip CSS rule lives inside the
    // `@media (max-width: 720px)` block so the chip's text label
    // (`new`) is hidden on phone viewports — only the `+` glyph
    // remains. The chip's `aria-label` (swapped by the controller
    // during `.copied`) carries the screen-reader feedback per the
    // mobile a11y contract in `dashboard-swimlane-compose-client
    // .test.ts:175–197`.
    expect(r.css).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.swim-compose\s+\.sc-label\s*\{[\s\S]*?display:\s*none/,
    );
  });

  it('Step 5.6.6: bay-head emits the lane-sheet trigger in the DOM (server-side presence; CSS toggles visibility per viewport)', async () => {
    // Per the affordance-placement contract: the trigger is always
    // present in the bay-head; the `@media` block above controls when
    // it's visible. The trigger's aria-controls points at the
    // `[data-lane-sheet]` container that wraps the rail.
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toMatch(
      /<button class="lane-sheet-trigger"[^>]*type="button"[^>]*data-lane-sheet-trigger[^>]*aria-expanded="false"[^>]*aria-controls="lane-sheet"/,
    );
    // The lane-sheet container is present + wraps the rail (Task 5.3.3).
    expect(r.html).toMatch(
      /<div class="lane-sheet-container" id="lane-sheet" data-lane-sheet>\s*<div class="lane-sheet-backdrop"/,
    );
  });
});
