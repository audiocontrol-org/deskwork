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

describe('renderMobileBar — entry-review configuration (regression net)', () => {
  // These tests verify the SHAPE of each cell in the entry-review 6-cell
  // configuration: that the right attributes, classes, and child elements
  // land on the right button. They do NOT assert byte-equality (attribute
  // order is not part of the contract); the contract suite above covers
  // the attribute-level spec clauses. The purpose here is to catch a
  // future refactor of `renderCell` that drops or mis-routes an attribute
  // for a specific cell shape (e.g. dropping aria-controls from a
  // sheet-kind cell that also carries a count badge).
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

  // Asserts each cell's structural fingerprint: every attribute, class,
  // and child element the CSS / client controller depends on is present
  // on the right cell. Does NOT assert order — order is not part of the
  // contract.
  function assertCellShape(
    raw: string,
    selector: { dataAttr: string; value: string },
    expected: {
      classes: readonly string[];
      hasAriaControls: boolean;
      glyph: string;
      label: string;
      count?: { dataAttr: string; isKraft: boolean };
    },
  ): void {
    // Find the button by its data-mobile-sheet / data-mobile-action match.
    const buttonRe = new RegExp(
      `<button\\s[^>]*${selector.dataAttr}="${selector.value}"[^>]*>[\\s\\S]*?</button>`,
    );
    const match = raw.match(buttonRe);
    expect(match, `button with ${selector.dataAttr}="${selector.value}" not found`).not.toBeNull();
    const buttonHtml = match![0];

    // Class tokens — order-insensitive.
    for (const cls of expected.classes) {
      expect(buttonHtml).toMatch(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`));
    }

    // ARIA gating — only sheet-kind cells carry these.
    if (expected.hasAriaControls) {
      expect(buttonHtml).toContain('aria-controls="er-mobile-sheet"');
      expect(buttonHtml).toContain('aria-expanded="false"');
    } else {
      expect(buttonHtml).not.toContain('aria-controls');
      expect(buttonHtml).not.toContain('aria-expanded');
    }

    // Glyph + label child elements.
    expect(buttonHtml).toContain(
      `<span class="er-mobile-tab-glyph" aria-hidden="true">${expected.glyph}</span>`,
    );
    expect(buttonHtml).toContain(
      `<span class="er-mobile-tab-label">${expected.label}</span>`,
    );

    // Count badge (presence + kraft modifier).
    if (expected.count !== undefined) {
      const countClass = expected.count.isKraft
        ? 'er-mobile-tab-count er-mobile-tab-count--kraft'
        : 'er-mobile-tab-count';
      expect(buttonHtml).toContain(
        `<span class="${countClass}" ${expected.count.dataAttr} hidden>0</span>`,
      );
    } else {
      expect(buttonHtml).not.toContain('er-mobile-tab-count');
    }
  }

  it('Outline cell carries review modifier + outline sheet wiring', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    assertCellShape(
      out.__raw,
      { dataAttr: 'data-mobile-sheet', value: 'outline' },
      {
        classes: ['er-mobile-tab', 'er-mobile-tab--review'],
        hasAriaControls: true,
        glyph: '§',
        label: 'Outline',
      },
    );
  });

  it('Format cell carries edit modifier + format sheet wiring', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    assertCellShape(
      out.__raw,
      { dataAttr: 'data-mobile-sheet', value: 'format' },
      {
        classes: ['er-mobile-tab', 'er-mobile-tab--edit'],
        hasAriaControls: true,
        glyph: '¶',
        label: 'Format',
      },
    );
  });

  it('Notes cell renders in both modes + carries red-tone count badge', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    assertCellShape(
      out.__raw,
      { dataAttr: 'data-mobile-sheet', value: 'notes' },
      {
        classes: ['er-mobile-tab'],
        hasAriaControls: true,
        glyph: '✎',
        label: 'Notes',
        count: { dataAttr: 'data-notes-count', isKraft: false },
      },
    );
    // Mode 'both' means NO modifier class is appended.
    const buttonRe = /<button\s[^>]*data-mobile-sheet="notes"[^>]*>/;
    const match = out.__raw.match(buttonRe);
    expect(match![0]).not.toMatch(/er-mobile-tab--(review|edit)/);
  });

  it('Scrapbook cell carries review + scrapbook modifiers + kraft count badge', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    assertCellShape(
      out.__raw,
      { dataAttr: 'data-mobile-sheet', value: 'scrapbook' },
      {
        classes: [
          'er-mobile-tab',
          'er-mobile-tab--review',
          'er-mobile-tab--scrapbook',
        ],
        hasAriaControls: true,
        glyph: '▦',
        label: 'Scrapbook',
        count: { dataAttr: 'data-scrapbook-count', isKraft: true },
      },
    );
  });

  it('Actions cell carries review modifier + actions sheet wiring', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    assertCellShape(
      out.__raw,
      { dataAttr: 'data-mobile-sheet', value: 'actions' },
      {
        classes: ['er-mobile-tab', 'er-mobile-tab--review'],
        hasAriaControls: true,
        glyph: '⊕',
        label: 'Actions',
      },
    );
  });

  it('Save cell uses data-mobile-action (not sheet) + carries no aria-controls', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    assertCellShape(
      out.__raw,
      { dataAttr: 'data-mobile-action', value: 'save' },
      {
        classes: ['er-mobile-tab', 'er-mobile-tab--edit', 'er-mobile-tab--save'],
        hasAriaControls: false,
        glyph: '⊕',
        label: 'Save',
      },
    );
  });

  it('emits exactly 6 buttons for the entry-review configuration', () => {
    const out = renderMobileBar({ contextual: ENTRY_REVIEW_CELLS });
    const buttonCount = countSubstr(out.__raw, '<button class="er-mobile-tab');
    expect(buttonCount).toBe(6);
  });
});
