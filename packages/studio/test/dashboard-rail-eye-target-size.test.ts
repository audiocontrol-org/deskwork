/**
 * AUDIT-20260530-27 acceptance — `.rail-lane .r-eye-btn` honors the WCAG
 * 2.2 SC 2.5.8 (AA) 24×24 target-size floor.
 *
 * Origin: AUDIT-BARRAGE-claude-P5-1 caught that the F6 a11y promotion
 * of the rail visibility toggle from `<span>` to
 * `<button class="r-eye-btn">` left the button styled
 * `width: 14px; ... padding: 0;` with no min-height — below the floor
 * the rest of the feature honors (`.collapse-chev` =
 * `min-width: 24px; min-height: 24px`, `.r-move-up-btn` /
 * `.r-move-down-btn` = same, `.view-toggle .vt-cell` =
 * `min-height: 24px`, etc.).
 *
 * The button has its own click handler in `swimlane.ts:bindRailEyeToggles`
 * with `stopPropagation`, so it is an independent interactive control
 * subject to the target-size rule on its own (not covered by the row's
 * larger hit area).
 *
 * Pattern mirrors `dashboard-swimlane-collapse-render.test.ts`'s
 * `.collapse-chev` assertions — fetch the CSS via the studio's static
 * route, then `.toMatch(/.r-eye-btn ... min-width: 24px/)` +
 * `min-height: 24px`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupDashboardFixture } from './__helpers/dashboard-swimlane-fixture.ts';
import { createApp } from '../src/server.ts';

describe('AUDIT-20260530-27 — rail eye-toggle WCAG 24×24 target size', () => {
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

  it('`.rail-lane .r-eye-btn` declares min-width: 24px AND min-height: 24px (WCAG 2.2 SC 2.5.8)', async () => {
    const res = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-rail.css'),
    );
    expect(res.status).toBe(200);
    const css = await res.text();
    // Both target-size dimensions must be declared inside the same
    // rule block — `[\s\S]*?` matches across newlines but is lazy so
    // it cannot leak past the closing brace into a sibling rule.
    expect(css).toMatch(
      /\.rail-lane\s+\.r-eye-btn\s*\{[^}]*?min-width:\s*24px/,
    );
    expect(css).toMatch(
      /\.rail-lane\s+\.r-eye-btn\s*\{[^}]*?min-height:\s*24px/,
    );
  });

  it('`.rail-lane .r-eye-btn` uses inline-flex centering so the 14px glyph stays centered in the 24×24 bounding box', async () => {
    const res = await app.fetch(
      new Request('http://x/static/css/dashboard-swimlane-rail.css'),
    );
    expect(res.status).toBe(200);
    const css = await res.text();
    // Mirrors the `.r-move-up-btn` / `.r-move-down-btn` pattern in
    // the same file — the visible glyph stays small while the hit
    // area expands via min-width / min-height + flex centering.
    expect(css).toMatch(
      /\.rail-lane\s+\.r-eye-btn\s*\{[^}]*?display:\s*inline-flex/,
    );
    expect(css).toMatch(
      /\.rail-lane\s+\.r-eye-btn\s*\{[^}]*?align-items:\s*center/,
    );
    expect(css).toMatch(
      /\.rail-lane\s+\.r-eye-btn\s*\{[^}]*?justify-content:\s*center/,
    );
  });
});
