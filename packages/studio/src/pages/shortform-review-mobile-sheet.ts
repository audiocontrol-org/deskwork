/**
 * Shortform-review-specific mobile sheet host + bar cell composition.
 *
 * Mirrors `entry-review/mobile-sheet.ts` for the shortform review
 * surface. The mobile-bar primitive (`../mobile-bar.ts`) is universal;
 * each surface composes its `Cell[]` and the corresponding slot host
 * here.
 *
 * Design contract (DESIGN-STANDARDS.md § Universal bar contract,
 * settled 2026-05-13):
 *   - One bar primitive, one shape. The per-surface design variable
 *     is the cells, not the chrome.
 *   - 1-6 contextual cells. The Actions cell is unconditional so the
 *     bar is never empty (renderMobileBar throws on empty cells).
 *   - The TOC and Versions cells are conditional (hidden when their
 *     content has fewer than 2 items).
 *
 * State-machine compliance (DESKWORK-STATE-MACHINE.md):
 *   - Commandment II: verbs are universal. Approve/Iterate/Cancel are
 *     rendered unconditionally inside the Actions slot. The shortform
 *     surface header (shortform-review.ts:1-18) explicitly defers the
 *     legacy `DraftWorkflowState` migration; for this step we surface
 *     the three universal verbs and trust the client clipboard handlers
 *     to compose the right slash command from the workflow context.
 *   - Commandment III: no review-state surfacing. No "IN REVIEW" /
 *     "ITERATING" / "APPROVED" pills. No `.er-stamp`. No
 *     `.er-pending-state` markup.
 *   - Commandment IV/V/VII: clipboard-copy is the only action. The
 *     three buttons carry `data-action="approve|iterate|cancel"`; the
 *     existing client handlers in `editorial-review-client.ts` wire
 *     them to clipboard-only handlers (post-G.3 refactor).
 *   - G.4 (issue #260): the destructive verb is `cancel`, NOT `reject`.
 *     The state machine has no `reject` verb.
 */

import type { TocEntry } from '@deskwork/core/review/toc';
import type {
  DraftVersion,
  DraftWorkflowItem,
} from '@deskwork/core/review/types';
import { html, unsafe, escapeHtml, type RawHtml } from './html.ts';
import type { Cell } from './mobile-bar.ts';

export interface ShortformBarCellOptions {
  readonly tocEntries: readonly TocEntry[];
  readonly versions: readonly DraftVersion[];
}

/**
 * Build the shortform review bar's contextual cell list.
 *
 * Cell ordering (when present): TOC → Versions → Actions. The Actions
 * cell is always last and always present; the bar is never empty.
 *
 * Conditional-omission rules:
 *   - TOC cell: omitted when fewer than 2 heading entries exist.
 *     Shortform drafts (social-platform copy) are often headingless;
 *     surfacing an empty TOC adds noise without value per the
 *     "structure over scrolling" principle.
 *   - Versions cell: omitted when only one revision exists. With one
 *     revision there is no history to navigate.
 */
export function getShortformBarCells(opts: ShortformBarCellOptions): readonly Cell[] {
  const cells: Cell[] = [];
  if (opts.tocEntries.length >= 2) {
    cells.push({
      glyph: '§',
      label: `TOC · ${opts.tocEntries.length}`,
      mode: 'review',
      action: { kind: 'sheet', name: 'toc' },
    });
  }
  if (opts.versions.length >= 2) {
    cells.push({
      glyph: '№',
      label: `Versions · ${opts.versions.length}`,
      mode: 'review',
      action: { kind: 'sheet', name: 'versions' },
    });
  }
  cells.push({
    glyph: '⊕',
    label: 'Actions',
    mode: 'review',
    action: { kind: 'sheet', name: 'actions' },
  });
  return cells;
}

export interface ShortformMobileSheetOptions {
  readonly tocEntries: readonly TocEntry[];
  readonly versions: readonly DraftVersion[];
  readonly workflow: DraftWorkflowItem;
  readonly currentVersion: DraftVersion;
}

function renderTocSlotBody(tocEntries: readonly TocEntry[]): string {
  if (tocEntries.length === 0) return '';
  const items = tocEntries
    .map((entry) => {
      const depthClass = `er-mobile-toc-item er-mobile-toc-item--h${entry.depth}`;
      return `<li class="${depthClass}"><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.text)}</a></li>`;
    })
    .join('');
  return `<ul class="er-mobile-toc-list">${items}</ul>`;
}

function renderVersionsSlotBody(
  versions: readonly DraftVersion[],
  currentVersion: DraftVersion,
): string {
  if (versions.length === 0) return '';
  const items = versions
    .map((v) => {
      const isActive = v.version === currentVersion.version;
      const cls = isActive ? ' class="active"' : '';
      return `<li class="er-mobile-versions-item"><a href="?v=${v.version}"${cls}>v${v.version}</a></li>`;
    })
    .join('');
  return `<ul class="er-mobile-versions-list">${items}</ul>`;
}

/**
 * The Actions slot renders the three universal verbs unconditionally
 * per Commandment II. Per Commandment VII (and THESIS Cons. 2), each
 * button is a clipboard-copy trigger handled by the existing
 * `editorial-review-client.ts` `[data-action]` listeners — the markup
 * here carries no copy-target or state mutation logic; the client
 * composes the slash command from the embedded workflow state.
 *
 * G.4: `data-action="cancel"`, NOT `reject` (the state machine has
 * no `reject` verb; this matches issue #260's resolution shape).
 */
function renderActionsSlotBody(): string {
  return [
    '<div class="er-mobile-actions">',
    '  <button class="er-btn er-btn-primary er-btn-approve" data-action="approve" type="button">Approve</button>',
    '  <button class="er-btn" data-action="iterate" type="button">Iterate</button>',
    '  <button class="er-btn er-btn-cancel" data-action="cancel" type="button">Cancel</button>',
    '</div>',
  ].join('\n');
}

/**
 * Render the shortform mobile sheet host with the three named slots
 * (toc / versions / actions). Each slot body is server-rendered so
 * the client doesn't need to clone DOM from elsewhere on the page —
 * the slot is self-contained.
 *
 * The sheet host is always rendered (matches the entry-review pattern
 * where the host is present and the client toggles `hidden` on
 * dispatch). Individual slots are hidden until the corresponding bar
 * cell opens them via the shared `sheet-controller` primitive.
 */
export function renderShortformMobileSheet(
  opts: ShortformMobileSheetOptions,
): RawHtml {
  const tocBody = renderTocSlotBody(opts.tocEntries);
  const versionsBody = renderVersionsSlotBody(opts.versions, opts.currentVersion);
  const actionsBody = renderActionsSlotBody();
  return unsafe(html`
    <section
      class="er-mobile-sheet"
      id="er-mobile-sheet"
      data-mobile-sheet-host
      hidden
      aria-label="Surface sheet"
      role="dialog"
      aria-modal="false"
    >
      <button class="er-mobile-sheet-handle" data-mobile-sheet-handle type="button" aria-label="Drag to dismiss the sheet">
        <span class="er-mobile-sheet-handle-bar" aria-hidden="true"></span>
      </button>
      <header class="er-mobile-sheet-head">
        <span class="er-mobile-sheet-kicker" data-mobile-sheet-kicker></span>
        <span class="er-mobile-sheet-meta" data-mobile-sheet-meta></span>
        <button class="er-mobile-sheet-close" data-mobile-sheet-close type="button" aria-label="Close sheet">×</button>
      </header>
      <div class="er-mobile-sheet-body" data-mobile-sheet-body>
        <div class="er-mobile-sheet-slot" data-mobile-sheet-slot="toc" hidden>${unsafe(tocBody)}</div>
        <div class="er-mobile-sheet-slot" data-mobile-sheet-slot="versions" hidden>${unsafe(versionsBody)}</div>
        <div class="er-mobile-sheet-slot" data-mobile-sheet-slot="actions" hidden>${unsafe(actionsBody)}</div>
      </div>
    </section>`);
}
