/**
 * Universal mobile bottom-bar.
 *
 * Renders the `<nav class="er-mobile-bar">` chrome that the studio's
 * phone-width surfaces share. The existing `editorial-review.css` rules
 * (`.er-mobile-bar`, `.er-mobile-tab*`, `.er-mobile-tab--review`,
 * `.er-mobile-tab--edit`) cascade against the markup this helper emits
 * unchanged — the bar is contextual chrome the caller composes by
 * supplying a list of `Cell`s that name each tab's surface affordance.
 *
 * Design contract (DESIGN-STANDARDS.md § Studio navigation model):
 * the mobile bar carries ONLY contextual cells — no global nav. The
 * star nav (Desk hub, ← back, ⋮ menu) lives in the masthead. This
 * helper is intentionally narrow: it cannot emit nav-region cells; it
 * only emits the contextual ribbon the caller supplied.
 *
 * THESIS Consequence 2: the bar is server-rendered chrome. None of the
 * buttons rendered here mutate state directly on render — sheet-kind
 * cells open a sheet (client-side state change, no POST); the single
 * direct-kind cell defined today (Save) triggers the existing
 * `[data-action="save-version"]` handler, the one allowed file
 * mutation.
 *
 * The mode tag (`'review' | 'edit' | 'both'`) maps to the existing
 * `er-mobile-tab--review` / `er-mobile-tab--edit` modifier classes;
 * the `body[data-edit-mode="editing"]` CSS rules swap the grid layout
 * between modes by hiding the off-mode cells.
 */

import { html, unsafe, escapeHtml, type RawHtml } from './html.ts';

/** Maximum cells the bar can carry. CSS grid swaps between 3 and 4
 *  visible columns by mode; the bar must hold all mode-keyed cells the
 *  caller defines, but more than 6 would overflow the layout the CSS
 *  assumes. */
const MAX_CELLS = 6;

/** Discriminated union of bar cell actions. A cell either opens a
 *  bottom-sheet (the dominant pattern) or fires a direct client-side
 *  action (the Save tab is the only direct-kind today). */
export type CellAction =
  | { readonly kind: 'sheet'; readonly name: string }
  | { readonly kind: 'direct'; readonly action: string };

/** Optional count badge rendered after the label. Default tone is
 *  red-pencil; `kraft` tone is the kraft-coloured variant used by the
 *  Scrapbook tab to distinguish folio context from action peers. */
export interface CellCount {
  readonly dataAttr: string;
  readonly tone?: 'red' | 'kraft';
}

/** A single bar cell. Caller-supplied; the helper renders the cell
 *  into the bar's flex row. */
export interface Cell {
  readonly glyph: string;
  readonly label: string;
  /** Which edit-mode the cell is visible in. `both` renders no modifier
   *  (the cell shows in both review and edit). */
  readonly mode: 'review' | 'edit' | 'both';
  readonly action: CellAction;
  readonly count?: CellCount;
  /** Additional class modifier appended to the base class string
   *  (e.g. `er-mobile-tab--scrapbook`). */
  readonly modifierClass?: string;
}

export interface RenderMobileBarOptions {
  readonly contextual: readonly Cell[];
}

function modeClass(mode: Cell['mode']): string {
  if (mode === 'review') return ' er-mobile-tab--review';
  if (mode === 'edit') return ' er-mobile-tab--edit';
  return '';
}

function renderCell(cell: Cell): string {
  const baseClass = 'er-mobile-tab' + modeClass(cell.mode)
    + (cell.modifierClass !== undefined ? ' ' + cell.modifierClass : '');

  let actionAttr: string;
  let ariaAttrs: string;
  if (cell.action.kind === 'sheet') {
    actionAttr = `data-mobile-sheet="${escapeHtml(cell.action.name)}"`;
    ariaAttrs = ' aria-controls="er-mobile-sheet" aria-expanded="false"';
  } else {
    actionAttr = `data-mobile-action="${escapeHtml(cell.action.action)}"`;
    ariaAttrs = '';
  }

  const countMarkup = cell.count !== undefined
    ? (() => {
        const tone = cell.count.tone ?? 'red';
        const countClass = tone === 'kraft'
          ? 'er-mobile-tab-count er-mobile-tab-count--kraft'
          : 'er-mobile-tab-count';
        return `<span class="${countClass}" ${cell.count.dataAttr} hidden>0</span>`;
      })()
    : '';

  return `<button class="${escapeHtml(baseClass)}" ${actionAttr} type="button"${ariaAttrs}>`
    + `<span class="er-mobile-tab-glyph" aria-hidden="true">${escapeHtml(cell.glyph)}</span>`
    + `<span class="er-mobile-tab-label">${escapeHtml(cell.label)}</span>`
    + countMarkup
    + `</button>`;
}

/**
 * Render the mobile bottom-bar chrome from a list of contextual cells.
 *
 * Throws when `contextual` is empty (a bar with zero cells is
 * malformed) or when it carries more than `MAX_CELLS` (overflows the
 * CSS grid layout).
 */
export function renderMobileBar(opts: RenderMobileBarOptions): RawHtml {
  const cells = opts.contextual;
  if (cells.length === 0) {
    throw new Error('renderMobileBar: contextual must contain at least one cell; an empty bar is malformed.');
  }
  if (cells.length > MAX_CELLS) {
    throw new Error(
      `renderMobileBar: contextual.length=${cells.length} exceeds the bar's MAX_CELLS=${MAX_CELLS}.`,
    );
  }

  const cellsMarkup = cells.map(renderCell).join('');
  return unsafe(html`<nav class="er-mobile-bar" data-mobile-bar aria-label="Surface tabs">${unsafe(cellsMarkup)}</nav>`);
}
