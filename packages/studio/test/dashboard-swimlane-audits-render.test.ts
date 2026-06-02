/**
 * Phase 5 audit-trail acceptance tests:
 *
 *   - AUDIT-20260528-02: server renders BOTH `<article class="swim">`
 *     AND `<button class="swim-stub">` for every visibility-on lane,
 *     with exactly one carrying `is-focus-hidden` based on the
 *     initial focus state.
 *   - AUDIT-20260528-04: rail eye renders BOTH `.r-eye-visible` (●)
 *     and `.r-eye-hidden` (○) glyphs as siblings; CSS picks one
 *     based on `data-lane-visible`. F6 a11y promoted the eye
 *     container from `<span>` to `<button class="r-eye-btn">` with
 *     a non-empty aria-label. The focus-chip `.is-visibility-hidden`
 *     hide rule + the rail eye-glyph swap rules ship in the split
 *     `dashboard-swimlane-{shell,rail}.css` files.
 *   - AUDIT-20260528-05: stage IDs are lane-scoped + unique; legacy
 *     `id="stage-<slug>"` survives ONLY for the default lane.
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

describe('dashboard swimlane AUDIT-02 / AUDIT-04 / AUDIT-05 acceptance (server render + CSS)', () => {
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

  it('AUDIT-04: dashboard-swimlane-{shell,rail}.css ship the visibility-hide + eye-glyph swap rules', async () => {
    // Per AUDIT-20260528-14: visibility/focus-hide rules ship in
    // `dashboard-swimlane-shell.css` because they affect the swim +
    // swim-stub + focus-chip set in a single selector list (cross-
    // cutting). The eye-glyph swap rules (F6 fix selectors targeting
    // `.r-eye-btn`) live with the rail row primitives in
    // `dashboard-swimlane-rail.css`.
    const shellRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-shell.css'),
    );
    expect(shellRes.status).toBe(200);
    const shellCss = await shellRes.text();
    // Rule body has display: none; matched via the selector list
    // including .focus-chip.is-visibility-hidden.
    expect(shellCss).toMatch(
      /\.focus-chip\.is-visibility-hidden[\s\S]*?display:\s*none/,
    );

    const railRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-rail.css'),
    );
    expect(railRes.status).toBe(200);
    const railCss = await railRes.text();
    // Eye-glyph swap rules — selector + display:inline (F6 fix
    // selectors target `.r-eye-btn`).
    expect(railCss).toMatch(
      /\.rail-lane\[data-lane-visible="true"\] \.r-eye-btn \.r-eye-visible/,
    );
    expect(railCss).toMatch(
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
});
