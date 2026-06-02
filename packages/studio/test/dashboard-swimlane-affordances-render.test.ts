/**
 * Phase 5 rail-affordance acceptance:
 *
 *   - Task 5.5 — saveable focus presets surface (Save button + empty
 *     preset-list container on the rail head).
 *   - Task 5.4 — drag-to-reorder server contract (draggable="true"
 *     on each `.rail-lane` row + cursor: grab CSS + drop-target
 *     hairline feedback).
 *   - Task 5.4.2 — bay-head meta total INCLUDES hidden lanes' entry
 *     counts (visibility-state is a client-only concern; server
 *     emits the aggregate over every visibility-on lane bucket).
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

describe('dashboard swimlane Task 5.4 + 5.5 — rail drag + preset affordances (render + CSS)', () => {
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

  it('Task 5.5: rail head renders the "Save current as preset…" + preset-list surface', async () => {
    // Per `.claude/rules/affordance-placement.md`, the Save / Load
    // preset affordances live ON the rail head (component-attached),
    // not in a separate page-level toolbar. Server-rendered markup
    // ships the Save button + an empty preset-list container the
    // client controller populates from localStorage.
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // The rail head exists.
    expect(r.html).toMatch(/<div class="rail-head">/);
    // The preset-save button is inside the rail (a real focusable
    // <button> with an accessible name + data hook).
    expect(r.html).toMatch(
      /<button class="preset-save" type="button"\s+data-preset-save\s+aria-label="Save current view as preset">\+ Save as preset<\/button>/,
    );
    // The preset-list container is server-rendered with the empty-
    // state child so first paint matches what the client renders
    // for an operator with no saved presets.
    expect(r.html).toMatch(/<div class="preset-list" data-preset-list>/);
    expect(r.html).toMatch(
      /<span class="preset-empty">No saved presets<\/span>/,
    );
  });

  it('Task 5.4: every rail row carries draggable="true" so HTML5 DnD can start', async () => {
    // HTML5 native drag-and-drop requires the source root to opt
    // into draggable. The whole `.rail-lane` row carries the attribute
    // (per the affordance-placement contract — drag handle on the
    // row, not in a separate toolbar). The visible `.rail-drag` glyph
    // is the operator's grab-here cue (cursor: grab in CSS).
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    for (const id of ['default', 'mockups', 'qa']) {
      const re = new RegExp(
        `<div class="rail-lane(?:\\s[^"]*)?"[^>]*draggable="true"[^>]*data-rail-lane="${id}"`,
      );
      expect(r.html).toMatch(re);
    }
  });

  it('Task 5.4: dashboard-swimlane-{rail,drag}.css ship cursor: grab on the drag handle + drop-target feedback rules', async () => {
    // Per AUDIT-20260528-14: rail base styles live in `dashboard-
    // swimlane-rail.css`; drag-state overlays moved to `dashboard-
    // swimlane-drag.css` so the rail's at-rest appearance is
    // independent of the DnD state machine. The two-fetch shape
    // verifies both files ship.
    const railRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-rail.css'),
    );
    expect(railRes.status).toBe(200);
    const railCss = await railRes.text();
    // `.rail-drag` carries the canonical grab cursor.
    expect(railCss).toMatch(/\.rail-lane\s+\.rail-drag\s*\{[\s\S]*?cursor:\s*grab/);

    const dragRes = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-drag.css'),
    );
    expect(dragRes.status).toBe(200);
    const dragCss = await dragRes.text();
    // While a row is being dragged the source carries `is-dragging`
    // and the cursor flips to grabbing on both the row and the handle.
    expect(dragCss).toMatch(/\.rail-lane\.is-dragging\s*\{[\s\S]*?cursor:\s*grabbing/);
    // Drop-target feedback — insertion hairline above / below the
    // target row via inset box-shadow on the red-pencil token.
    expect(dragCss).toMatch(
      /\.rail-lane\.drop-target-above\s*\{[\s\S]*?box-shadow:\s*inset\s+0\s+2px\s+0\s+0\s+var\(--er-red-pencil\)/,
    );
    expect(dragCss).toMatch(
      /\.rail-lane\.drop-target-below\s*\{[\s\S]*?box-shadow:\s*inset\s+0\s+-2px\s+0\s+0\s+var\(--er-red-pencil\)/,
    );
  });

  it('Task 5.4.2: bay-head meta total INCLUDES hidden lanes\' entry counts', async () => {
    // Step 5.4.2 verification: hidden lanes don't render swimlanes
    // but their entries DO count in dashboard stats. The server
    // emits the total via `countTotal(lanes)` which iterates every
    // lane bucket regardless of visibility (visibility is a client-
    // side concern; server has no knowledge of it). This invariant
    // ships at the server boundary.
    //
    // Fixture: 3 lanes (default=1 entry, mockups=2 entries, qa=1
    // entry) = 4 total. Even if the operator hides any subset
    // client-side, the server-rendered total is still 4.
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toContain('4 entries');
  });
});
