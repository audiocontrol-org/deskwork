/**
 * Smoke test for Step 2.2.8 — universal Cell-driven mobile bar.
 *
 * The helper at `src/pages/mobile-bar.ts` exports a `Cell`-driven
 * `renderMobileBar(opts)` that emits the `<nav class="er-mobile-bar">`
 * markup the existing `editorial-review.css` rules already key off.
 *
 * Spec-derived: each assertion below maps to a literal shape promise of
 * the helper API documented in the entry-review-keyed bar markup the
 * pre-refactor implementation emitted. The 6-cell entry-review
 * configuration is the back-compat reference — the bytes the helper
 * emits for that configuration MUST match the pre-refactor hardcoded
 * markup so the existing CSS + sheet-controller wiring keeps working.
 */

import { describe, it, expect } from 'vitest';
import {
  renderMobileBar,
  type Cell,
} from '../src/pages/mobile-bar.ts';

function cell(overrides: Partial<Cell> & { glyph: string; label: string }): Cell {
  return {
    glyph: overrides.glyph,
    label: overrides.label,
    mode: overrides.mode ?? 'both',
    action: overrides.action ?? { kind: 'sheet', name: 'outline' },
    ...(overrides.count !== undefined ? { count: overrides.count } : {}),
    ...(overrides.modifierClass !== undefined
      ? { modifierClass: overrides.modifierClass }
      : {}),
  };
}

/** Count occurrences of a literal substring in a string. */
function countSubstr(haystack: string, needle: string): number {
  let n = 0;
  let idx = 0;
  for (;;) {
    const next = haystack.indexOf(needle, idx);
    if (next < 0) return n;
    n += 1;
    idx = next + needle.length;
  }
}

describe('renderMobileBar — contract', () => {
  it('throws when contextual.length > 6', () => {
    const cells: Cell[] = Array.from({ length: 7 }, (_, i) =>
      cell({ glyph: '§', label: `T${i}`, action: { kind: 'sheet', name: 'outline' } }),
    );
    expect(() => renderMobileBar({ contextual: cells })).toThrow(/contextual/);
  });

  it('throws when contextual is empty (a bar with zero cells is malformed)', () => {
    expect(() => renderMobileBar({ contextual: [] })).toThrow(/contextual/);
  });

  it('emits exactly one er-mobile-tab button per cell (N=1)', () => {
    const out = renderMobileBar({
      contextual: [cell({ glyph: '§', label: 'Outline' })],
    });
    const buttonCount = countSubstr(out.__raw, '<button class="er-mobile-tab');
    expect(buttonCount).toBe(1);
  });

  it('emits exactly one er-mobile-tab button per cell (N=3)', () => {
    const out = renderMobileBar({
      contextual: [
        cell({ glyph: '§', label: 'A', action: { kind: 'sheet', name: 'outline' } }),
        cell({ glyph: '¶', label: 'B', action: { kind: 'sheet', name: 'format' } }),
        cell({ glyph: '✎', label: 'C', action: { kind: 'sheet', name: 'notes' } }),
      ],
    });
    const buttonCount = countSubstr(out.__raw, '<button class="er-mobile-tab');
    expect(buttonCount).toBe(3);
  });

  it('emits exactly one er-mobile-tab button per cell (N=6)', () => {
    const cells: Cell[] = Array.from({ length: 6 }, (_, i) =>
      cell({ glyph: '§', label: `T${i}`, action: { kind: 'sheet', name: 'outline' } }),
    );
    const out = renderMobileBar({ contextual: cells });
    const buttonCount = countSubstr(out.__raw, '<button class="er-mobile-tab');
    expect(buttonCount).toBe(6);
  });

  it('renders data-mobile-sheet="<name>" for sheet-kind actions', () => {
    const out = renderMobileBar({
      contextual: [
        cell({ glyph: '§', label: 'Outline', action: { kind: 'sheet', name: 'outline' } }),
        cell({ glyph: '✎', label: 'Notes', action: { kind: 'sheet', name: 'notes' } }),
      ],
    });
    expect(out.__raw).toContain('data-mobile-sheet="outline"');
    expect(out.__raw).toContain('data-mobile-sheet="notes"');
  });

  it('renders data-mobile-action="<action>" for direct-kind actions', () => {
    const out = renderMobileBar({
      contextual: [
        cell({ glyph: '⊕', label: 'Save', action: { kind: 'direct', action: 'save' } }),
      ],
    });
    expect(out.__raw).toContain('data-mobile-action="save"');
  });

  it('direct-action tabs carry NO aria-controls (only sheet-action tabs do)', () => {
    const out = renderMobileBar({
      contextual: [
        cell({ glyph: '⊕', label: 'Save', action: { kind: 'direct', action: 'save' } }),
      ],
    });
    expect(out.__raw).not.toContain('aria-controls');
    expect(out.__raw).not.toContain('aria-expanded');
  });

  it('sheet-action tabs carry aria-controls="er-mobile-sheet" and aria-expanded="false"', () => {
    const out = renderMobileBar({
      contextual: [
        cell({ glyph: '§', label: 'Outline', action: { kind: 'sheet', name: 'outline' } }),
      ],
    });
    expect(out.__raw).toContain('aria-controls="er-mobile-sheet"');
    expect(out.__raw).toContain('aria-expanded="false"');
  });

  it('mode "review" appends er-mobile-tab--review', () => {
    const out = renderMobileBar({
      contextual: [
        cell({ glyph: '§', label: 'Outline', mode: 'review' }),
      ],
    });
    expect(out.__raw).toContain('er-mobile-tab er-mobile-tab--review');
  });

  it('mode "edit" appends er-mobile-tab--edit', () => {
    const out = renderMobileBar({
      contextual: [
        cell({ glyph: '¶', label: 'Format', mode: 'edit' }),
      ],
    });
    expect(out.__raw).toContain('er-mobile-tab er-mobile-tab--edit');
  });

  it('mode "both" appends neither modifier', () => {
    const out = renderMobileBar({
      contextual: [
        cell({ glyph: '✎', label: 'Notes', mode: 'both' }),
      ],
    });
    expect(out.__raw).not.toContain('er-mobile-tab--review');
    expect(out.__raw).not.toContain('er-mobile-tab--edit');
  });

  it('omits the count badge when no count is provided', () => {
    const out = renderMobileBar({
      contextual: [
        cell({ glyph: '§', label: 'Outline' }),
      ],
    });
    expect(out.__raw).not.toContain('er-mobile-tab-count');
  });

  it('renders the count badge (default red tone — no kraft modifier)', () => {
    const out = renderMobileBar({
      contextual: [
        cell({
          glyph: '✎',
          label: 'Notes',
          count: { dataAttr: 'data-notes-count' },
        }),
      ],
    });
    expect(out.__raw).toMatch(
      /<span class="er-mobile-tab-count" data-notes-count hidden>0<\/span>/,
    );
    expect(out.__raw).not.toContain('er-mobile-tab-count--kraft');
  });

  it('renders the count badge with the kraft tone modifier when requested', () => {
    const out = renderMobileBar({
      contextual: [
        cell({
          glyph: '▦',
          label: 'Scrapbook',
          count: { dataAttr: 'data-scrapbook-count', tone: 'kraft' },
        }),
      ],
    });
    expect(out.__raw).toMatch(
      /<span class="er-mobile-tab-count er-mobile-tab-count--kraft" data-scrapbook-count hidden>0<\/span>/,
    );
  });

  it('appends modifierClass to the base class string', () => {
    const out = renderMobileBar({
      contextual: [
        cell({
          glyph: '⊕',
          label: 'Save',
          mode: 'edit',
          action: { kind: 'direct', action: 'save' },
          modifierClass: 'er-mobile-tab--save',
        }),
      ],
    });
    expect(out.__raw).toContain(
      'class="er-mobile-tab er-mobile-tab--edit er-mobile-tab--save"',
    );
  });

  it('renders the glyph inside er-mobile-tab-glyph and the label inside er-mobile-tab-label', () => {
    const out = renderMobileBar({
      contextual: [cell({ glyph: '§', label: 'Outline' })],
    });
    expect(out.__raw).toContain(
      '<span class="er-mobile-tab-glyph" aria-hidden="true">§</span>',
    );
    expect(out.__raw).toContain(
      '<span class="er-mobile-tab-label">Outline</span>',
    );
  });

  it('opens with the <nav class="er-mobile-bar" data-mobile-bar aria-label="Surface tabs"> envelope', () => {
    const out = renderMobileBar({
      contextual: [cell({ glyph: '§', label: 'Outline' })],
    });
    expect(out.__raw).toContain(
      '<nav class="er-mobile-bar" data-mobile-bar aria-label="Surface tabs">',
    );
    expect(out.__raw).toContain('</nav>');
  });
});

describe('renderMobileBar — entry-review back-compat fixture', () => {
  const ENTRY_REVIEW_CELLS: readonly Cell[] = [
    {
      glyph: '§',
      label: 'Outline',
      mode: 'review',
      action: { kind: 'sheet', name: 'outline' },
    },
    {
      glyph: '¶',
      label: 'Format',
      mode: 'edit',
      action: { kind: 'sheet', name: 'format' },
    },
    {
      glyph: '✎',
      label: 'Notes',
      mode: 'both',
      action: { kind: 'sheet', name: 'notes' },
      count: { dataAttr: 'data-notes-count' },
    },
    {
      glyph: '▦',
      label: 'Scrapbook',
      mode: 'review',
      action: { kind: 'sheet', name: 'scrapbook' },
      count: { dataAttr: 'data-scrapbook-count', tone: 'kraft' },
      modifierClass: 'er-mobile-tab--scrapbook',
    },
    {
      glyph: '⊕',
      label: 'Actions',
      mode: 'review',
      action: { kind: 'sheet', name: 'actions' },
    },
    {
      glyph: '⊕',
      label: 'Save',
      mode: 'edit',
      action: { kind: 'direct', action: 'save' },
      modifierClass: 'er-mobile-tab--save',
    },
  ];

  it('emits the pre-refactor Outline button verbatim', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    expect(out.__raw).toContain(
      '<button class="er-mobile-tab er-mobile-tab--review" data-mobile-sheet="outline" type="button" aria-controls="er-mobile-sheet" aria-expanded="false">'
        + '<span class="er-mobile-tab-glyph" aria-hidden="true">§</span>'
        + '<span class="er-mobile-tab-label">Outline</span>'
        + '</button>',
    );
  });

  it('emits the pre-refactor Format button verbatim', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    expect(out.__raw).toContain(
      '<button class="er-mobile-tab er-mobile-tab--edit" data-mobile-sheet="format" type="button" aria-controls="er-mobile-sheet" aria-expanded="false">'
        + '<span class="er-mobile-tab-glyph" aria-hidden="true">¶</span>'
        + '<span class="er-mobile-tab-label">Format</span>'
        + '</button>',
    );
  });

  it('emits the pre-refactor Notes button verbatim (mode "both", red count)', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    expect(out.__raw).toContain(
      '<button class="er-mobile-tab" data-mobile-sheet="notes" type="button" aria-controls="er-mobile-sheet" aria-expanded="false">'
        + '<span class="er-mobile-tab-glyph" aria-hidden="true">✎</span>'
        + '<span class="er-mobile-tab-label">Notes</span>'
        + '<span class="er-mobile-tab-count" data-notes-count hidden>0</span>'
        + '</button>',
    );
  });

  it('emits the pre-refactor Scrapbook button verbatim (kraft count + modifier)', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    expect(out.__raw).toContain(
      '<button class="er-mobile-tab er-mobile-tab--review er-mobile-tab--scrapbook" data-mobile-sheet="scrapbook" type="button" aria-controls="er-mobile-sheet" aria-expanded="false">'
        + '<span class="er-mobile-tab-glyph" aria-hidden="true">▦</span>'
        + '<span class="er-mobile-tab-label">Scrapbook</span>'
        + '<span class="er-mobile-tab-count er-mobile-tab-count--kraft" data-scrapbook-count hidden>0</span>'
        + '</button>',
    );
  });

  it('emits the pre-refactor Actions button verbatim', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    expect(out.__raw).toContain(
      '<button class="er-mobile-tab er-mobile-tab--review" data-mobile-sheet="actions" type="button" aria-controls="er-mobile-sheet" aria-expanded="false">'
        + '<span class="er-mobile-tab-glyph" aria-hidden="true">⊕</span>'
        + '<span class="er-mobile-tab-label">Actions</span>'
        + '</button>',
    );
  });

  it('emits the pre-refactor Save button verbatim (no aria-controls)', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    expect(out.__raw).toContain(
      '<button class="er-mobile-tab er-mobile-tab--edit er-mobile-tab--save" data-mobile-action="save" type="button">'
        + '<span class="er-mobile-tab-glyph" aria-hidden="true">⊕</span>'
        + '<span class="er-mobile-tab-label">Save</span>'
        + '</button>',
    );
  });

  it('emits exactly 6 buttons for the entry-review configuration', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    const buttonCount = countSubstr(out.__raw, '<button class="er-mobile-tab');
    expect(buttonCount).toBe(6);
  });
});
