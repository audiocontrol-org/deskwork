/**
 * Mobile collapsible stage tiles for the dashboard.
 *
 * On phone (<=600px), each stage section is collapsed by default and
 * fronted by a `<button class="er-stage-tile">` that the operator taps
 * to expand. Single-expand: tapping a tile collapses any other expanded
 * section IN THE SAME GROUP. Empty-stage tiles are `disabled` (no rows
 * to expand) but stay visible so the operator can SEE the full pipeline
 * shape at-rest.
 *
 * v7 architecture (Step 2.2.9): single-expand is partitioned by
 * `data-stage-section-group`. The longform pipeline and the shortform-
 * by-platform section operate independent single-expand state — the
 * operator may have one longform stage AND one shortform platform
 * expanded simultaneously, useful when cross-referencing pipeline state
 * with social distribution shape (per DESIGN-STANDARDS.md § Desk
 * information architecture). Tiles without a group attribute (e.g. a
 * standalone Distribution placeholder pre-v7) participate in NO group
 * — tapping them does its own thing.
 *
 * On desktop, all sections render expanded; the tile is `display: none`
 * via dashboard-mobile.css and the existing `<h2 class="er-section-head">`
 * carries the heading. The controller still wires click handlers (cheap),
 * gated by matchMedia at click-time so desktop clicks (which can't even
 * reach the tile) are safe no-ops.
 *
 * Visual reference: /static/mockups/desk-states-v7.html
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

      // Single-expand SCOPED TO THE TILE'S GROUP. v7 architecture:
      // tiles in different sections (longform pipeline vs shortform-by-
      // platform) operate independent single-expand state. Tiles
      // without `data-stage-section-group` are standalone — they collapse
      // NO siblings on expand (legacy pre-v7 behavior for any unmarked
      // tile that still ships).
      const group = tile.dataset.stageSectionGroup;
      if (group !== undefined && group !== '') {
        for (const other of tiles) {
          if (other === tile) continue;
          if (other.dataset.stageSectionGroup !== group) continue;
          const otherStage = other.dataset.stageTile;
          if (!otherStage) continue;
          const otherSection = getSection(otherStage);
          if (otherSection) otherSection.setAttribute('data-collapsed', '');
          other.setAttribute('aria-expanded', 'false');
          delete other.dataset.userOpened;
        }
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
