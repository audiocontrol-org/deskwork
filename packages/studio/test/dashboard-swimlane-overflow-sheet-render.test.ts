/**
 * Phase 5 Task 5.3 acceptance — many-lane overflow (focus-strip
 * horizontal scroll + fade gradient) + mobile lane-sheet slide-up
 * panel. Tests cover server markup (trigger, container, backdrop)
 * plus the CSS split contracts that ship the rules in their per-
 * section files.
 *
 * Also includes the Task 5.3.2 review followup (AUDIT-22) — hidden
 * lanes use the AA-passing readable color, no opacity wash.
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
} from './__helpers/dashboard-swimlane-fixture.ts';
import { createApp } from '../src/server.ts';

describe('dashboard swimlane Task 5.3 — overflow + mobile lane-sheet (render + CSS)', () => {
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

  it('Task 5.3.3: bay-head row 1 emits the `<button class="lane-sheet-trigger">` after `.bh-meta`', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // The trigger appears AFTER `.bh-meta` in the same `.bh-row-1`.
    // Tolerate whitespace between the meta close and the trigger
    // open. The trigger carries data-lane-sheet-trigger, aria-
    // expanded="false", aria-controls="lane-sheet", and a non-empty
    // aria-label.
    expect(r.html).toMatch(
      /<span class="bh-meta">[\s\S]*?<\/span>\s*<button class="lane-sheet-trigger"[^>]*type="button"[^>]*data-lane-sheet-trigger[^>]*aria-expanded="false"[^>]*aria-controls="lane-sheet"[^>]*aria-label="[^"]+">/,
    );
  });

  it('Task 5.3.3: `.lane-rail` is wrapped inside `[data-lane-sheet]` container with backdrop sibling', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // The container opens with class + id + data attr; the backdrop
    // sibling is the FIRST child of the container; the rail follows.
    expect(r.html).toMatch(
      /<div class="lane-sheet-container" id="lane-sheet" data-lane-sheet>\s*<div class="lane-sheet-backdrop" data-lane-sheet-backdrop aria-hidden="true"><\/div>\s*<aside class="lane-rail"/,
    );
  });

  it('Task 5.3.1: dashboard-swimlane-chips.css uses `flex-wrap: nowrap` + `overflow-x: auto` on `.focus-strip`', async () => {
    // Per AUDIT-20260528-14: focus-strip + focus-chip rules moved to
    // `dashboard-swimlane-chips.css`. The Task 5.3.1 override that
    // historically lived later in the source file was consolidated
    // into the single `.focus-strip` rule there during the split (no
    // behavioural change — nowrap + overflow-x: auto wins regardless).
    const cssRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-chips.css'),
    );
    expect(cssRes.status).toBe(200);
    const css = await cssRes.text();
    // Assert the consolidated rule exists with both contracts.
    expect(css).toMatch(
      /\.focus-strip\s*\{[\s\S]*?flex-wrap:\s*nowrap[\s\S]*?overflow-x:\s*auto/,
    );
    // Right-edge fade gradient via ::after.
    expect(css).toMatch(
      /\.focus-strip::after\s*\{[\s\S]*?background:\s*linear-gradient\(to right,\s*transparent,\s*var\(--er-paper\) 100%\)/,
    );
    // Smooth scroll behavior.
    expect(css).toMatch(/\.focus-strip\s*\{[\s\S]*?scroll-behavior:\s*smooth/);
  });

  it('Task 5.3.3: dashboard-swimlane-mobile.css ships the mobile lane-sheet rules (trigger, panel, backdrop)', async () => {
    // Per AUDIT-20260528-14: mobile lane-sheet rules (both desktop
    // defaults and the @media (max-width: 720px) block) consolidated
    // into `dashboard-swimlane-mobile.css` so the responsive cascade
    // stays in one file.
    const cssRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-mobile.css'),
    );
    expect(cssRes.status).toBe(200);
    const css = await cssRes.text();
    // Desktop default: trigger hidden.
    expect(css).toMatch(/\.lane-sheet-trigger\s*\{[\s\S]*?display:\s*none/);
    // Mobile breakpoint: trigger visible.
    expect(css).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.lane-sheet-trigger\s*\{[\s\S]*?display:\s*inline-flex/,
    );
    // Sheet panel — slide-up + fixed-bottom.
    expect(css).toMatch(
      /\.lane-sheet-container\s+\.lane-rail\s*\{[\s\S]*?position:\s*fixed[\s\S]*?bottom:\s*0[\s\S]*?transform:\s*translateY\(100%\)/,
    );
    // Open state translates to 0. Per AUDIT-20260530-40, this rule
    // keys off the SAME body attribute the backdrop CSS uses, so the
    // two surfaces (rail + scrim) animate in lockstep without a
    // hand-maintained `.is-open` class on the container.
    expect(css).toMatch(
      /body\[data-lane-sheet-open\]\s+\.lane-sheet-container\s+\.lane-rail\s*\{[\s\S]*?transform:\s*translateY\(0\)/,
    );
    // Backdrop reveal via body[data-lane-sheet-open] (shared
    // controller's attribute name) — same single signal as the rail.
    expect(css).toMatch(
      /body\[data-lane-sheet-open\]\s+\.lane-sheet-backdrop\s*\{[\s\S]*?background:\s*rgba\(/,
    );
    // Focus-visible ring on the trigger (WCAG 2.1 SC 2.4.7 AA).
    expect(css).toMatch(
      /\.lane-sheet-trigger:focus-visible\s*\{[\s\S]*?outline:\s*2px\s+solid\s+var\(--er-proof-blue\)/,
    );
  });

  it('Task 5.3.2 followup (AUDIT-22): hidden lanes use an AA-passing readable color (no opacity wash)', async () => {
    // Per AUDIT-20260528-14: rail row styles (including hidden-lane
    // color treatment) live in `dashboard-swimlane-rail.css`.
    const cssRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-rail.css'),
    );
    expect(cssRes.status).toBe(200);
    const css = await cssRes.text();
    // The Task 5.3 initial pass added `opacity: 0.6` which compounded
    // an already-failing contrast on `--er-faded`. The review followup
    // upgrades the color to `--er-ink-soft` (AAA) and drops the
    // redundant opacity wash. Line-through on `.r-name` still
    // differentiates hidden lanes visually.
    expect(css).toMatch(
      /\.rail-lane\[data-lane-visible="false"\]\s*\{[\s\S]*?color:\s*var\(--er-ink-soft\)/,
    );
    // The opacity wash is removed — verify no `.rail-lane[data-lane-
    // visible="false"]` rule sets opacity: 0.6.
    const hiddenRowRules = css.match(
      /\.rail-lane\[data-lane-visible="false"\][^{]*\{[^}]*\}/g,
    ) ?? [];
    for (const rule of hiddenRowRules) {
      expect(rule).not.toMatch(/opacity:\s*0\.6/);
    }
    // The line-through differentiation stays in place.
    expect(css).toMatch(
      /\.rail-lane\[data-lane-visible="false"\]\s+\.r-name\s*\{[\s\S]*?text-decoration:\s*line-through/,
    );
  });
});
