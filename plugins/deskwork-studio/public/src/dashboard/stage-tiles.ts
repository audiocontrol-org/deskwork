/**
 * Mobile collapsible stage tiles for the dashboard.
 *
 * On phone (<=600px), each stage section is collapsed by default and
 * fronted by a `<button class="er-stage-tile">` that the operator taps
 * to expand. Single-expand: tapping a tile collapses any other expanded
 * section. Empty-stage tiles are `disabled` (no rows to expand) but
 * stay visible so the operator can SEE the full pipeline shape at-rest.
 *
 * On desktop, all sections render expanded; the tile is `display: none`
 * via dashboard-mobile.css and the existing `<h2 class="er-section-head">`
 * carries the heading. The controller still wires click handlers (cheap),
 * gated by matchMedia at click-time so desktop clicks (which can't even
 * reach the tile) are safe no-ops.
 *
 * Visual reference: /static/mockups/dashboard-compact-1-collapsible.html
 */

const MOBILE_QUERY = '(max-width: 600px)';

export function initStageTiles(): void {
  const tiles = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-stage-tile]'),
  );
  if (tiles.length === 0) return;

  function isMobile(): boolean {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function getSection(stage: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `[data-stage-section="${CSS.escape(stage)}"]`,
    );
  }

  /**
   * Apply the appropriate collapse state for the current viewport.
   * Mobile = collapse all sections that the operator hasn't explicitly
   * opened. Desktop = expand everything (`data-collapsed` is dropped so
   * the existing layout works as before). Called at boot and on
   * matchMedia change.
   */
  function applyViewportCollapse(): void {
    const mobile = isMobile();
    for (const tile of tiles) {
      const stage = tile.dataset.stageTile;
      if (!stage) continue;
      const section = getSection(stage);
      if (!section) continue;
      if (mobile) {
        if (tile.dataset.userOpened !== '1') {
          section.setAttribute('data-collapsed', '');
          tile.setAttribute('aria-expanded', 'false');
        }
      } else {
        section.removeAttribute('data-collapsed');
        tile.setAttribute('aria-expanded', 'true');
      }
    }
  }

  for (const tile of tiles) {
    tile.addEventListener('click', () => {
      if (tile.disabled) return;
      const stage = tile.dataset.stageTile;
      if (!stage) return;
      const section = getSection(stage);
      if (!section) return;

      const wasCollapsed = section.hasAttribute('data-collapsed');

      // Single-expand: collapse all OTHER sections so only one stage's
      // rows are visible at a time on phone. Drop their userOpened mark
      // so a viewport-resize-driven applyViewportCollapse() re-collapses
      // them correctly later.
      for (const other of tiles) {
        if (other === tile) continue;
        const otherStage = other.dataset.stageTile;
        if (!otherStage) continue;
        const otherSection = getSection(otherStage);
        if (otherSection) otherSection.setAttribute('data-collapsed', '');
        other.setAttribute('aria-expanded', 'false');
        delete other.dataset.userOpened;
      }

      if (wasCollapsed) {
        section.removeAttribute('data-collapsed');
        tile.setAttribute('aria-expanded', 'true');
        tile.dataset.userOpened = '1';
      } else {
        section.setAttribute('data-collapsed', '');
        tile.setAttribute('aria-expanded', 'false');
        delete tile.dataset.userOpened;
      }
    });
  }

  applyViewportCollapse();
  window
    .matchMedia(MOBILE_QUERY)
    .addEventListener('change', applyViewportCollapse);
}
