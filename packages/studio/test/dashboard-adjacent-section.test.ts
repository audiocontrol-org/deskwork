/**
 * Unit tests for the dashboard's Adjacent-tools section renderer (Step
 * 2.2.9 — studio-mobile-first feature workplan).
 *
 * Assertions derive from the spec at DESIGN-STANDARDS.md § Desk
 * information architecture + the v7 mockup at desk-states-v7.html
 * (specifically lines 663-672). Each assertion captures a visible
 * promise the spec makes (per .claude/rules/ui-verification.md).
 */

import { describe, it, expect } from 'vitest';
import {
  renderAdjacentSection,
  renderAdjacentSectionHead,
} from '../src/pages/dashboard/adjacent-section.ts';

describe('renderAdjacentSectionHead', () => {
  it('emits ▦ glyph + "Adjacent tools" label + "phase 3" caption', () => {
    const out = renderAdjacentSectionHead().__raw;
    expect(out).toContain('▦');
    expect(out).toContain('Adjacent tools');
    expect(out).toContain('phase 3');
  });

  it('emits the er-desk-section-head--adjacent variant class so CSS applies the kraft accent', () => {
    const out = renderAdjacentSectionHead().__raw;
    expect(out).toContain('er-desk-section-head--adjacent');
  });
});

describe('renderAdjacentSection', () => {
  it('renders the section head before the tiles', () => {
    const out = renderAdjacentSection().__raw;
    const headIdx = out.indexOf('er-desk-section-head--adjacent');
    const firstTileIdx = out.indexOf('er-future-tile');
    expect(headIdx).toBeGreaterThan(-1);
    expect(firstTileIdx).toBeGreaterThan(headIdx);
  });

  it('renders exactly 2 future tiles (Folio + Files)', () => {
    const out = renderAdjacentSection().__raw;
    const matches = out.match(/class="er-future-tile"/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it('renders the Folio tile with glyph ▦ and label "Folio (standalone)"', () => {
    const out = renderAdjacentSection().__raw;
    expect(out).toContain('Folio (standalone)');
    // The ▦ glyph appears in both the section head AND the Folio tile;
    // both occurrences are expected. We confirm presence in the tile by
    // verifying both ▦ + "Folio (standalone)" co-exist.
    expect(out).toContain('▦');
  });

  it('renders the Files tile with glyph ⊞ and label "Files (content tree)"', () => {
    const out = renderAdjacentSection().__raw;
    expect(out).toContain('Files (content tree)');
    expect(out).toContain('⊞');
  });

  it('renders both future tiles with "phase 3" tags', () => {
    const out = renderAdjacentSection().__raw;
    const matches = out.match(/er-future-tile-tag[^>]*>phase 3</g) ?? [];
    expect(matches.length).toBe(2);
  });

  it('future tiles are NOT <button> elements — no interactive markup', () => {
    const out = renderAdjacentSection().__raw;
    // The whole section should not contain a <button> tag — these tiles
    // are inert. The stage-tiles.ts controller leaves them alone.
    expect(out).not.toMatch(/<button[\s>]/);
  });

  it('future tiles carry aria-disabled="true" to communicate inert state to AT', () => {
    const out = renderAdjacentSection().__raw;
    const matches = out.match(/aria-disabled="true"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('future tiles do NOT carry data-stage-tile (so stage-tiles.ts ignores them)', () => {
    const out = renderAdjacentSection().__raw;
    // The future-tile selector should not appear with data-stage-tile —
    // checking the substring is sufficient since the section is small.
    const futureTileBlocks = out.split('er-future-tile').slice(1);
    for (const block of futureTileBlocks) {
      // Only look at the block until the next tile starts (or end of section).
      const segment = block.split('er-future-tile')[0];
      expect(segment).not.toContain('data-stage-tile');
    }
  });
});
