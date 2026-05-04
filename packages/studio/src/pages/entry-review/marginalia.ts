/**
 * Marginalia column + stow chevron + edge pull tab for the entry-keyed
 * press-check surface (Phase 34a — T10).
 *
 * Relocated from `pages/review.ts`. Per `.claude/rules/affordance-placement.md`,
 * the toggle for "show / hide the margin-notes column" lives ON the
 * marginalia component:
 *
 *   - `.er-marginalia-stow` chevron INSIDE the marginalia head — visible
 *     only when marginalia is visible (it's inside `.er-marginalia`,
 *     which is `display: none` when stowed).
 *   - `.er-marginalia-tab` pull tab on the right edge of the viewport,
 *     visible only when stowed (CSS rule `body[data-marginalia="hidden"]
 *     .er-marginalia-tab { display: block }`).
 *
 * Both affordances + Shift+M dispatch through the same client-side
 * `toggleMarginalia` handler. Mirrors the outline-drawer's pull-tab
 * pattern so the project's affordance vocabulary stays consistent.
 *
 * The marginalia composer + saved-mark list are populated by
 * `entry-review-client.ts` after page load — the server emits the
 * shell + the empty composer; the client fetches annotations from
 * `/api/dev/editorial-review/entry/<uuid>/annotations` and renders.
 */

import { html, unsafe, type RawHtml } from '../html.ts';

export function renderMarginaliaTab(): RawHtml {
  return unsafe(html`
    <button class="er-marginalia-tab" data-action="toggle-marginalia" type="button" aria-pressed="true" aria-label="Show margin notes (Shift+M)" title="Show margin notes (Shift+M)">
      <span class="er-marginalia-tab-glyph" aria-hidden="true">‹</span>
      <span class="er-marginalia-tab-label">Notes</span>
    </button>`);
}

export function renderMarginalia(): RawHtml {
  return unsafe(html`
    <aside class="er-marginalia" data-comments-sidebar aria-label="Margin notes">
      <p class="er-marginalia-head">
        <button class="er-marginalia-stow" data-action="toggle-marginalia" type="button" aria-pressed="false" aria-label="Hide margin notes (Shift+M)" title="Hide margin notes (Shift+M)">
          <span aria-hidden="true">›</span>
        </button>
        <span class="er-marginalia-head-label">Margin notes</span>
      </p>
      <p class="er-marginalia-empty" data-sidebar-empty>Select text in the draft to leave a <em>margin note</em>.</p>
      <section class="er-marginalia-composer" data-comment-composer hidden aria-label="New margin note">
        <p class="er-marginalia-composer-head">New mark</p>
        <div class="er-marginalia-composer-quote" data-composer-quote></div>
        <label class="er-marginalia-composer-label" for="comment-category">Mark as</label>
        <select id="comment-category" class="er-marginalia-composer-select" data-comment-category>
          <option value="other" selected>other</option>
          <option value="voice-drift">voice-drift</option>
          <option value="missing-receipt">missing-receipt</option>
          <option value="tutorial-framing">tutorial-framing</option>
          <option value="saas-vocabulary">saas-vocabulary</option>
          <option value="fake-authority">fake-authority</option>
          <option value="structural">structural</option>
        </select>
        <label class="er-marginalia-composer-label" for="comment-text">Note</label>
        <textarea id="comment-text" class="er-marginalia-composer-textarea" data-comment-text rows="4"
          placeholder="What needs attention here?"></textarea>
        <div class="er-marginalia-composer-actions">
          <button type="button" class="er-btn er-btn-small" data-action="cancel-comment">Cancel</button>
          <button type="button" class="er-btn er-btn-small er-btn-primary" data-action="submit-comment">Leave mark</button>
        </div>
      </section>
      <ol class="er-marginalia-list" data-sidebar-list></ol>
    </aside>`);
}
