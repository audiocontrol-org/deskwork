/**
 * Adjacent-tools section renderer (Step 2.2.9 — studio-mobile-first).
 *
 * Per DESIGN-STANDARDS.md § Desk information architecture, the Desk's
 * third section reserves space for Phase 3+ surfaces — Folio (standalone
 * scrapbook viewer) and Files (content tree). These render as inert
 * "future tiles" — visible but non-interactive — tagged `phase 3` so the
 * operator sees what's coming without being able to tap a dead control.
 *
 * Per DESIGN-STANDARDS.md § Accessibility / Contrast, future tiles
 * demote via explicit muted palette (NOT opacity reduction). All body
 * text reads at ≥4.5:1 against the tile background; the ornamental
 * border + glyph read at ≥3:1.
 *
 * The future tiles deliberately render as `<div>` (not `<button>`) — no
 * interactive markup — so the stage-tiles.ts controller leaves them
 * alone and assistive tech doesn't announce a disabled control. The
 * `aria-disabled="true"` attribute communicates the inert state to AT.
 */

import { html, unsafe, type RawHtml } from '../html.ts';

interface FutureTile {
  readonly glyph: string;
  readonly name: string;
  readonly tag: string;
}

const FUTURE_TILES: readonly FutureTile[] = [
  { glyph: '▦', name: 'Folio (standalone)', tag: 'phase 3' },
  { glyph: '⊞', name: 'Files (content tree)', tag: 'phase 3' },
] as const;

/**
 * Render the adjacent-tools section head — `<div class="er-desk-section-head
 * er-desk-section-head--adjacent">` matching the mockup's
 * `.desk-section-head.adjacent` shape. Kraft-colored glyph + label +
 * "phase 3" caption.
 */
export function renderAdjacentSectionHead(): RawHtml {
  return unsafe(html`
    <div class="er-desk-section-head er-desk-section-head--adjacent">
      <span class="er-desk-section-head-glyph" aria-hidden="true">▦</span>
      <span class="er-desk-section-head-label">Adjacent tools</span>
      <span class="er-desk-section-head-count">· phase 3</span>
    </div>`);
}

function renderFutureTile(tile: FutureTile): RawHtml {
  return unsafe(html`
    <div class="er-future-tile" aria-disabled="true" role="presentation">
      <span class="er-future-tile-glyph" aria-hidden="true">${tile.glyph}</span>
      <span class="er-future-tile-name">${tile.name}</span>
      <span class="er-future-tile-tag">${tile.tag}</span>
    </div>`);
}

/**
 * Compose the adjacent-tools section: section head + 2 future tiles
 * (Folio + Files). No tap targets, no `data-stage-tile` attrs — these
 * are structurally inert placeholders until Phase 3+ wires them.
 */
export function renderAdjacentSection(): RawHtml {
  const sectionHead = renderAdjacentSectionHead();
  const tiles = FUTURE_TILES.map((t) => renderFutureTile(t).__raw).join('');
  return unsafe(html`${sectionHead}${unsafe(tiles)}`);
}
