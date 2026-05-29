/**
 * Phase 5 Task 5.2 acceptance — template-aware empty-state copy +
 * empty-lane Compose CTA. Tests cover three scenarios:
 *
 *   - Editorial-specific empty-state hints fire ONLY for the
 *     editorial lane (non-editorial lanes get generic vocabulary).
 *   - Every entry in a non-editorial lane renders verb-chip chrome
 *     (no compact-card dispatch); locked-stage Approve verb labels
 *     reference the next linear stage.
 *   - The .swim-empty-cta surface renders for empty lanes only, lives
 *     alongside the Compose chip, and the stage-grid stays visible
 *     behind it.
 *
 * Plus the CSS-side check that
 * `dashboard-swimlane-compose.css` ships the `.swim-empty-cta` rule
 * set + the `.swim.collapsed` precedence override.
 *
 * Originally part of `dashboard-swimlane.test.ts`; split out per
 * AUDIT-20260528-14 to satisfy the project's 300-500 line file-size
 * cap. The shared three-lane fixture lives in
 * `__helpers/dashboard-swimlane-fixture.ts`; the inline empty-lane
 * fixtures use the same `makeConfig` / `makeEntry` / `writeLane`
 * helpers + `mkdtempSync` so each test builds its own short-lived
 * on-disk shape.
 *
 * Pure integration — uses real sidecars, real lane configs, real
 * pipeline templates. No mocks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import {
  setupDashboardFixture,
  getHtml,
  extractLaneSection,
  extractStageCols,
  extractStageGridSection,
  makeConfig,
  makeEntry,
  writeLane,
  UUID_EDITORIAL_DRAFTING,
} from './__helpers/dashboard-swimlane-fixture.ts';
import { createApp } from '../src/server.ts';

describe('dashboard swimlane Task 5.2 — empty-state copy + empty-lane CTA (render + CSS)', () => {
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

  it('Task 5.2: editorial-specific empty-state copy fires ONLY for the editorial lane', async () => {
    // The default editorial lane has an entry in Drafting but Ideas /
    // Planned / Outlining / Final / Published are empty — those
    // columns must surface the editorial-specific verbose hints
    // ("Run /deskwork:add to capture one.", etc.).
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const editorial = extractLaneSection(r.html, 'default');
    expect(editorial).toContain('No open ideas. Run /deskwork:add to capture one.');
    // The literal `<slug>` placeholder is HTML-escaped by the html
    // tagged-template helper to `&lt;slug&gt;` on render — assert
    // against the escaped form since the test reads the response
    // body verbatim.
    expect(editorial).toContain(
      'Nothing planned. /deskwork:approve &lt;slug&gt; to graduate an idea.',
    );
    expect(editorial).toContain('Nothing in outlining.');
    expect(editorial).toContain('Nothing in final review.');
    expect(editorial).toContain('No published posts yet.');
    // The visual (mockups) lane's empty Iterating / Shipped columns
    // must NOT inherit editorial vocabulary — they get the neutral
    // fallback `Nothing in ${stage.toLowerCase()}.` instead.
    const visual = extractLaneSection(r.html, 'mockups');
    expect(visual).not.toContain('Run /deskwork:add');
    expect(visual).not.toContain('/deskwork:approve <slug> to graduate');
    expect(visual).toContain('Nothing in iterating.');
    expect(visual).toContain('Nothing in shipped.');
    // QA-plan lane's empty Reviewed / Tested / Approved columns —
    // generic vocabulary only.
    const qa = extractLaneSection(r.html, 'qa');
    expect(qa).not.toContain('Run /deskwork:add');
    expect(qa).toContain('Nothing in reviewed.');
    expect(qa).toContain('Nothing in tested.');
    expect(qa).toContain('Nothing in approved.');
  });

  it('Task 5.2: every entry in a non-editorial lane renders verb-chip chrome (no compact-card dispatch)', async () => {
    // The visual Sketched + Approved entries and the qa Drafted
    // entry previously routed through the lighter `renderEntryCard`
    // (a <a class="card">) because `isLegacyEditorialStage` was false
    // for non-editorial stage names. Task 5.2 lifts that dispatch:
    // every entry now renders via `renderRow` (`.er-row-shell`).
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const visual = extractStageGridSection(extractLaneSection(r.html, 'mockups'));
    // The visual Sketched entry now renders as a .er-row-shell.
    expect(visual).toMatch(
      /<div class="er-row-shell"[^>]*data-uuid="22222222-2222-4222-8222-222222222222"/,
    );
    // The visual Approved entry (locked stage) does too.
    expect(visual).toMatch(
      /<div class="er-row-shell"[^>]*data-uuid="33333333-3333-4333-8333-333333333333"/,
    );
    // The `<a class="card">` from the prior lighter dispatch must
    // not appear inside the visual lane's stage grid anymore.
    expect(visual).not.toMatch(/<a class="card"/);
    // QA-plan Drafted entry renders as .er-row-shell too.
    const qa = extractStageGridSection(extractLaneSection(r.html, 'qa'));
    expect(qa).toMatch(
      /<div class="er-row-shell"[^>]*data-uuid="44444444-4444-4444-8444-444444444444"/,
    );
    expect(qa).not.toMatch(/<a class="card"/);
  });

  it('Task 5.2: visual Approved (locked) row carries "Approve → Shipped" verb', async () => {
    // Per the locked-stage dispatch: lockedStages render with the
    // approve verb labeled `Approve → {nextLinearStage}`. For visual
    // template, Approved → Shipped.
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    const visual = extractStageGridSection(extractLaneSection(r.html, 'mockups'));
    // The Approved row is in this section.
    expect(visual).toContain('data-uuid="33333333-3333-4333-8333-333333333333"');
    // The "Approve → Shipped" label appears somewhere in the row's
    // affordance chrome (inline chip uses lowercase; menu/drawer
    // use sentence case).
    expect(visual).toMatch(/approve\s+→\s+shipped/i);
    // The "Approve → Published" editorial-only label must NOT appear
    // in the visual lane.
    expect(visual).not.toMatch(/approve\s+→\s+published/i);
  });

  it('Task 5.2: empty-lane CTA renders for empty lanes only', async () => {
    // Build a fresh app with one EMPTY lane (no entries on disk for
    // it) so the empty-lane CTA invariant is testable. The other
    // two lanes still have entries.
    const emptyRoot = mkdtempSync(join(tmpdir(), 'deskwork-dash-empty-'));
    try {
      mkdirSync(join(emptyRoot, '.deskwork', 'entries'), { recursive: true });
      mkdirSync(join(emptyRoot, '.deskwork', 'lanes'), { recursive: true });
      writeLane(emptyRoot, 'default', 'Editorial', 'editorial', 'docs');
      writeLane(emptyRoot, 'mockups', 'Mockups', 'visual', 'mockups');
      writeLane(emptyRoot, 'qa', 'QA', 'qa-plan', 'qa');
      const emptyApp = createApp({ projectRoot: emptyRoot, config: makeConfig() });
      // Entries only in the default lane.
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
      // Empty mockups + qa lanes must each emit a `.swim-empty-cta`
      // block with the lane-id-bound copy button. The button's
      // attributes can render in any order, so assert each fragment
      // independently against the per-lane section.
      const mockups = extractLaneSection(r.html, 'mockups');
      expect(mockups).toContain('class="swim-empty-cta"');
      expect(mockups).toMatch(/<button class="sec-cta"/);
      expect(mockups).toContain('data-lane-id="mockups"');
      expect(mockups).toContain('aria-label="Compose first entry in Mockups"');
      expect(mockups).toContain('data-swim-empty-copy');
      expect(mockups).toContain('Create your first entry in this lane.');
      // The visible code hint shows the lane-id-bound slash command.
      expect(mockups).toMatch(/<code>\/deskwork:add --lane mockups<\/code>/);
      const qa = extractLaneSection(r.html, 'qa');
      expect(qa).toContain('class="swim-empty-cta"');
      expect(qa).toMatch(/<button class="sec-cta"/);
      expect(qa).toContain('data-lane-id="qa"');
      expect(qa).toContain('aria-label="Compose first entry in QA"');
      expect(qa).toMatch(/<code>\/deskwork:add --lane qa<\/code>/);
      // The non-empty default lane must NOT emit a `.swim-empty-cta`.
      const editorial = extractLaneSection(r.html, 'default');
      expect(editorial).not.toContain('class="swim-empty-cta"');
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it('Task 5.2: empty-lane CTA does NOT replace the compose chip — both affordances coexist on empty lanes', async () => {
    // The Compose chip in the swim-head (Task 5.1C) and the empty-
    // lane CTA in the swim body (Task 5.2) are siblings — the empty
    // lane shows BOTH. The chip is always present; the CTA is
    // conditional on entryCount === 0.
    const emptyRoot = mkdtempSync(join(tmpdir(), 'deskwork-dash-coexist-'));
    try {
      mkdirSync(join(emptyRoot, '.deskwork', 'entries'), { recursive: true });
      mkdirSync(join(emptyRoot, '.deskwork', 'lanes'), { recursive: true });
      writeLane(emptyRoot, 'default', 'Editorial', 'editorial', 'docs');
      const emptyApp = createApp({ projectRoot: emptyRoot, config: makeConfig() });
      const r = await getHtml(emptyApp, '/dev/editorial-studio');
      expect(r.status).toBe(200);
      const editorial = extractLaneSection(r.html, 'default');
      // Compose chip (Task 5.1C — data-first-stage carries the next
      // entry's destination).
      expect(editorial).toContain('class="swim-compose"');
      expect(editorial).toContain('data-first-stage="Ideas"');
      // Empty CTA (Task 5.2 — no <SLUG>, no --stage in payload).
      expect(editorial).toContain('class="swim-empty-cta"');
      expect(editorial).toMatch(/<code>\/deskwork:add --lane default<\/code>/);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it('Task 5.2: empty-lane CTA still emits stage columns AND the data-first-stage chip', async () => {
    // Per the Step 5.2.2 contract, the kanban stage-grid + the
    // Compose chip remain visible on empty lanes — the CTA renders
    // in addition to (not instead of) the lane's pipeline shape.
    const emptyRoot = mkdtempSync(join(tmpdir(), 'deskwork-dash-empty-shape-'));
    try {
      mkdirSync(join(emptyRoot, '.deskwork', 'entries'), { recursive: true });
      mkdirSync(join(emptyRoot, '.deskwork', 'lanes'), { recursive: true });
      writeLane(emptyRoot, 'mockups', 'Mockups', 'visual', 'mockups');
      const emptyApp = createApp({ projectRoot: emptyRoot, config: makeConfig() });
      const r = await getHtml(emptyApp, '/dev/editorial-studio');
      expect(r.status).toBe(200);
      const mockups = extractLaneSection(r.html, 'mockups');
      // Empty CTA present.
      expect(mockups).toContain('class="swim-empty-cta"');
      // 5.1C chip is still emitted on empty lanes with data-first-stage.
      expect(mockups).toContain('data-first-stage="Sketched"');
      // Stage-grid is still emitted with the visual template's 4 + 3 = 7
      // stage columns even though all are empty.
      const cols = extractStageCols(extractStageGridSection(mockups));
      expect(cols.length).toBe(7);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it('Task 5.2: CSS ships `.swim-empty-cta` rules (block, button, hint, collapse precedence)', async () => {
    // Per AUDIT-20260528-14: empty-lane CTA lives with `.swim-compose`
    // in `dashboard-swimlane-compose.css` (the two affordances share
    // the green-flash semantic + collapse-precedence pattern).
    const cssRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-compose.css'),
    );
    expect(cssRes.status).toBe(200);
    const css = await cssRes.text();
    expect(css).toMatch(/\.swim-empty-cta\s*\{/);
    expect(css).toMatch(/\.swim-empty-cta\s+\.sec-cta\s*\{[\s\S]*?min-height:\s*36px/);
    expect(css).toMatch(
      /\.swim-empty-cta\s+\.sec-cta:focus-visible\s*\{[\s\S]*?outline:\s*2px\s+solid\s+var\(--er-proof-blue\)/,
    );
    expect(css).toMatch(
      /\.swim-empty-cta\s+\.sec-cta\.copied\s*\{[\s\S]*?background:\s*var\(--er-stamp-green\)/,
    );
    // Collapse precedence — non-interactive when the parent swim is
    // .collapsed.
    expect(css).toMatch(
      /\.swim\.collapsed\s+\.swim-empty-cta\s+\.sec-cta\s*\{[\s\S]*?pointer-events:\s*none/,
    );
  });
});
