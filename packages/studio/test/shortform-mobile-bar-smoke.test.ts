/**
 * Smoke test for Step 2.2.10 — shortform review surface cell construction.
 *
 * The helper at `src/pages/shortform-review-mobile-sheet.ts` exports a
 * `getShortformBarCells(...)` function returning a `readonly Cell[]`
 * for `renderMobileBar`, plus a `renderShortformMobileSheet(...)`
 * helper rendering the slot host the bar's sheet-action cells dispatch
 * into.
 *
 * Spec-derived assertions (each maps to a workplan Step 2.2.10 promise):
 *
 *   - The Actions cell is ALWAYS present (the universal `renderMobileBar`
 *     primitive throws on empty cells; the Actions cell guarantees the
 *     bar is never empty regardless of TOC / version counts).
 *   - The TOC cell is omitted when fewer than 2 heading entries exist.
 *   - The Versions cell is omitted when only one revision exists.
 *   - The cell order, when present, is TOC → Versions → Actions.
 *   - Per Commandment III: no `.er-stamp` markup is emitted by the sheet
 *     host.
 *   - Per G.4: the Actions slot exposes a `data-action="cancel"` button
 *     (NOT `data-action="reject"`).
 */

import { describe, it, expect } from 'vitest';
import type { DraftVersion, DraftWorkflowItem } from '@deskwork/core/review/types';
import type { TocEntry } from '@deskwork/core/review/toc';
import {
  getShortformBarCells,
  renderShortformMobileSheet,
} from '../src/pages/shortform-review-mobile-sheet.ts';

function toc(depth: 2 | 3 | 4, id: string, text: string): TocEntry {
  return { depth, id, text };
}

function ver(version: number): DraftVersion {
  return {
    version,
    markdown: `# v${version}`,
    createdAt: new Date(`2026-01-${String(version).padStart(2, '0')}T00:00:00.000Z`).toISOString(),
    originatedBy: 'operator',
  };
}

function workflow(over: Partial<DraftWorkflowItem> = {}): DraftWorkflowItem {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    site: 'test-site',
    slug: 'test-slug',
    contentKind: 'shortform',
    platform: 'reddit',
    channel: 'r/test',
    state: 'open',
    currentVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('getShortformBarCells — cell construction', () => {
  it('emits 1 cell (Actions only) when no TOC entries and only one version', () => {
    const cells = getShortformBarCells({
      tocEntries: [],
      versions: [ver(1)],
    });
    expect(cells).toHaveLength(1);
    expect(cells[0]?.label).toBe('Actions');
    expect(cells[0]?.action).toEqual({ kind: 'sheet', name: 'actions' });
  });

  it('emits 2 cells (TOC + Actions) when TOC has 2+ entries and only one version', () => {
    const cells = getShortformBarCells({
      tocEntries: [toc(2, 'a', 'A'), toc(2, 'b', 'B')],
      versions: [ver(1)],
    });
    expect(cells).toHaveLength(2);
    expect(cells[0]?.label).toBe('TOC · 2');
    expect(cells[0]?.action).toEqual({ kind: 'sheet', name: 'toc' });
    expect(cells[1]?.label).toBe('Actions');
  });

  it('emits 2 cells (Versions + Actions) when no TOC entries but multiple versions', () => {
    const cells = getShortformBarCells({
      tocEntries: [],
      versions: [ver(1), ver(2)],
    });
    expect(cells).toHaveLength(2);
    expect(cells[0]?.label).toBe('Versions · 2');
    expect(cells[0]?.action).toEqual({ kind: 'sheet', name: 'versions' });
    expect(cells[1]?.label).toBe('Actions');
  });

  it('emits 3 cells (TOC + Versions + Actions) in that order when all conditions met', () => {
    const cells = getShortformBarCells({
      tocEntries: [toc(2, 'a', 'A'), toc(3, 'b', 'B'), toc(2, 'c', 'C')],
      versions: [ver(1), ver(2)],
    });
    expect(cells).toHaveLength(3);
    expect(cells[0]?.label).toBe('TOC · 3');
    expect(cells[1]?.label).toBe('Versions · 2');
    expect(cells[2]?.label).toBe('Actions');
  });

  it('omits the TOC cell when only one heading entry exists', () => {
    const cells = getShortformBarCells({
      tocEntries: [toc(2, 'solo', 'Solo')],
      versions: [ver(1)],
    });
    expect(cells.find((c) => c.action.kind === 'sheet' && c.action.name === 'toc')).toBeUndefined();
  });

  it('each cell carries the expected glyph + mode + action.kind', () => {
    const cells = getShortformBarCells({
      tocEntries: [toc(2, 'a', 'A'), toc(2, 'b', 'B')],
      versions: [ver(1), ver(2)],
    });
    expect(cells[0]?.glyph).toBe('§');
    expect(cells[0]?.mode).toBe('review');
    expect(cells[0]?.action.kind).toBe('sheet');
    expect(cells[1]?.glyph).toBe('№');
    expect(cells[1]?.mode).toBe('review');
    expect(cells[1]?.action.kind).toBe('sheet');
    expect(cells[2]?.glyph).toBe('⊕');
    expect(cells[2]?.mode).toBe('review');
    expect(cells[2]?.action.kind).toBe('sheet');
  });
});

describe('renderShortformMobileSheet — sheet host', () => {
  it('emits the er-mobile-sheet host element', () => {
    const out = renderShortformMobileSheet({
      tocEntries: [],
      versions: [ver(1)],
      workflow: workflow(),
      currentVersion: ver(1),
    });
    expect(out.__raw).toContain('<section');
    expect(out.__raw).toContain('class="er-mobile-sheet"');
    expect(out.__raw).toContain('id="er-mobile-sheet"');
  });

  it('emits the three named slots (toc / versions / actions)', () => {
    const out = renderShortformMobileSheet({
      tocEntries: [toc(2, 'a', 'A'), toc(2, 'b', 'B')],
      versions: [ver(1), ver(2)],
      workflow: workflow(),
      currentVersion: ver(2),
    });
    expect(out.__raw).toContain('data-mobile-sheet-slot="toc"');
    expect(out.__raw).toContain('data-mobile-sheet-slot="versions"');
    expect(out.__raw).toContain('data-mobile-sheet-slot="actions"');
  });

  it('Actions slot contains the three verb buttons with data-action attributes', () => {
    const out = renderShortformMobileSheet({
      tocEntries: [],
      versions: [ver(1)],
      workflow: workflow(),
      currentVersion: ver(1),
    });
    expect(out.__raw).toContain('data-action="approve"');
    expect(out.__raw).toContain('data-action="iterate"');
    expect(out.__raw).toContain('data-action="cancel"');
  });

  it('Actions slot does NOT carry a data-action="reject" button (G.4)', () => {
    const out = renderShortformMobileSheet({
      tocEntries: [],
      versions: [ver(1)],
      workflow: workflow(),
      currentVersion: ver(1),
    });
    expect(out.__raw).not.toContain('data-action="reject"');
  });

  it('does NOT emit any er-stamp markup (Commandment III)', () => {
    const out = renderShortformMobileSheet({
      tocEntries: [],
      versions: [ver(1)],
      workflow: workflow({ state: 'in-review' }),
      currentVersion: ver(1),
    });
    expect(out.__raw).not.toContain('er-stamp');
  });

  it('does NOT emit any er-pending-state markup (review-state retired)', () => {
    const out = renderShortformMobileSheet({
      tocEntries: [],
      versions: [ver(1)],
      workflow: workflow({ state: 'iterating' }),
      currentVersion: ver(1),
    });
    expect(out.__raw).not.toContain('er-pending-state');
  });

  it('TOC slot renders heading entries as anchor links (when present)', () => {
    const out = renderShortformMobileSheet({
      tocEntries: [toc(2, 'first', 'First Heading'), toc(2, 'second', 'Second Heading')],
      versions: [ver(1)],
      workflow: workflow(),
      currentVersion: ver(1),
    });
    expect(out.__raw).toContain('href="#first"');
    expect(out.__raw).toContain('First Heading');
    expect(out.__raw).toContain('href="#second"');
    expect(out.__raw).toContain('Second Heading');
  });

  it('Versions slot renders revisions as anchor links with ?v= query', () => {
    const out = renderShortformMobileSheet({
      tocEntries: [],
      versions: [ver(1), ver(2), ver(3)],
      workflow: workflow(),
      currentVersion: ver(2),
    });
    expect(out.__raw).toContain('href="?v=1"');
    expect(out.__raw).toContain('href="?v=2"');
    expect(out.__raw).toContain('href="?v=3"');
  });

  it('Versions slot marks the current version with the active class', () => {
    const out = renderShortformMobileSheet({
      tocEntries: [],
      versions: [ver(1), ver(2)],
      workflow: workflow(),
      currentVersion: ver(2),
    });
    // v2 is current — should carry class="active"
    expect(out.__raw).toMatch(/<a[^>]+href="\?v=2"[^>]+class="active"/);
  });
});
