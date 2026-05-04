/**
 * Decision strip for the entry-keyed press-check surface (Phase 34a — T13).
 *
 * Edit toggle + Approve / Iterate / Reject + shortcuts (?) trigger.
 * Drives the press-check decision flow on the entry-centric model:
 *
 *   - `Approve` → POST `/api/dev/editorial-review/entry/<uuid>/decision`
 *     with `{decision: 'approve'}` (graduates the entry to the next stage).
 *   - `Iterate` → POST `/api/dev/editorial-review/entry/<uuid>/version`
 *     (records a new iteration via `iterateEntry`).
 *   - `Reject` → DISABLED, tooltipped with the GitHub-issue link for the
 *     pending design decision (entry-centric reject semantics are
 *     undefined; see #173).
 *
 * Affordance set is gated by `getAffordances(entry)` so the strip
 * automatically degrades to read-only / induct-to / fork shapes for
 * Published / Blocked / Cancelled entries (T15-prep).
 *
 * Per `.claude/rules/affordance-placement.md`, the destructive buttons
 * (Approve, Iterate, Reject) are wrapped in `.er-shortcut-chip-wrap`
 * spans carrying small chord chips beneath each button — visual cue
 * for the bare-letter double-tap shortcuts (`a`, `i`, `r`).
 */

import type { Entry } from '@deskwork/core/schema/entry';
import type { Affordances } from '../../lib/stage-affordances.ts';
import { html, unsafe, type RawHtml } from '../html.ts';

const REJECT_ISSUE_URL =
  'https://github.com/audiocontrol-org/deskwork/issues/173';
const REJECT_TOOLTIP = `reject semantics filed as #173 — see ${REJECT_ISSUE_URL}`;

const HISTORICAL_TOOLTIP =
  'viewing historical version (read-only) — switch back to current to act';

const STAGE_PICKER_OPTIONS = [
  'Ideas',
  'Planned',
  'Outlining',
  'Drafting',
  'Final',
] as const;

/**
 * Wrap an action button in a `.er-shortcut-chip-wrap` span carrying the
 * chord chip. Mirrors the legacy surface verbatim — bare-letter double-
 * tap with no Cmd/Ctrl modifier (#108).
 */
function shortcutChipWrap(buttonHtml: string, letter: 'a' | 'i' | 'r'): string {
  return html`<span class="er-shortcut-chip-wrap">${unsafe(buttonHtml)}<small class="er-shortcut-chip"><kbd>${letter}</kbd><kbd>${letter}</kbd></small></span>`;
}

function renderEditToggle(): string {
  // Issue 7 — edit-mode disclosure label sits next to the Edit button.
  // Initial state matches the surface's initial mode (preview).
  return html`<button class="er-btn er-btn-small" data-action="toggle-edit" type="button">Edit</button><span class="er-edit-mode-label" data-mode="preview">preview</span>`;
}

function renderInductPicker(entry: Entry): string {
  // #189: induct-to client handler builds `/deskwork:induct <slug> --to <Stage>`
  // from the dataset; it needs the slug, not the uuid, for the skill command.
  // First option is a blank placeholder so the operator's selection always
  // produces a `change` event (selecting the already-selected option doesn't
  // fire `change`).
  const options = [
    unsafe(html`<option value="">— pick a stage —</option>`),
    ...STAGE_PICKER_OPTIONS.map(
      (s) => unsafe(html`<option value="${s}">${s}</option>`),
    ),
  ];
  return html`
    <label class="er-entry-control er-entry-control--induct">
      <span class="er-entry-control-label">Induct to</span>
      <select name="induct-to" data-entry-uuid="${entry.uuid}" data-entry-slug="${entry.slug}">
        ${options}
      </select>
    </label>`;
}

function renderHistoricalStageDropdown(entry: Entry): string {
  const stages = Object.keys(entry.iterationByStage);
  if (stages.length === 0) return '';
  const options = stages.map(
    (s) => unsafe(html`<option value="${s}">${s}</option>`),
  );
  return html`
    <label class="er-entry-control er-entry-control--history">
      <span class="er-entry-control-label">Historical stage</span>
      <select name="history-stage" data-entry-uuid="${entry.uuid}">
        ${options}
      </select>
    </label>`;
}

function renderShortcutsBtn(): string {
  return html`<button class="er-btn er-btn-small" data-action="shortcuts" type="button" aria-label="Show keyboard shortcuts" title="Keyboard shortcuts">?</button>`;
}

interface MutableButtons {
  readonly entry: Entry;
  /** When true, viewer is on a historical version — Approve/Iterate
   *  shouldn't be invokable because they'd act against the live entry
   *  (`approveEntryStage` / `iterateEntry` both read sidecar state,
   *  not the historical snapshot). Render as disabled with tooltip. */
  readonly historical: boolean;
}

/**
 * The full mutable affordance set: Edit + Approve + Iterate + Reject
 * (disabled). Returned as a single concatenated HTML string so the
 * caller can wrap it in `.er-strip-right`.
 */
function renderMutableButtons({ entry, historical }: MutableButtons): string {
  const buttons: string[] = [];
  buttons.push(renderEditToggle());

  // Phase 34a F2 remediation — Approve/Iterate disabled when viewing a
  // historical version. The endpoints act against live sidecar state,
  // not the historical snapshot; allowing the click while showing
  // historical content is the same "surface lying about content"
  // failure mode 34a was meant to fix. Defense-in-depth: client-side
  // also short-circuits in entry-review/decision.ts.
  const histDisabled = historical ? ' disabled aria-disabled="true"' : '';
  const histTitle = historical ? ` title="${HISTORICAL_TOOLTIP}"` : '';

  // Approve — wired to the entry-keyed decision endpoint.
  buttons.push(
    shortcutChipWrap(
      html`<button class="er-btn er-btn-small er-btn-approve" data-action="approve" data-entry-uuid="${entry.uuid}" type="button"${unsafe(histDisabled)}${unsafe(histTitle)}>Approve</button>`,
      'a',
    ),
  );

  // Iterate — wired to the entry-keyed version endpoint.
  buttons.push(
    shortcutChipWrap(
      html`<button class="er-btn er-btn-small" data-action="iterate" data-entry-uuid="${entry.uuid}" type="button"${unsafe(histDisabled)}${unsafe(histTitle)}>Iterate</button>`,
      'i',
    ),
  );

  // Reject — DISABLED pending the design decision in #173.
  buttons.push(
    shortcutChipWrap(
      html`<button class="er-btn er-btn-small er-btn-reject" data-action="reject" data-entry-uuid="${entry.uuid}" type="button" disabled title="${REJECT_TOOLTIP}" aria-disabled="true">Reject</button>`,
      'r',
    ),
  );

  // Historical-stage dropdown — only useful when more than one stage
  // has recorded iterations for this entry. The renderer returns an
  // empty string when there are none; keep it conditional here so the
  // strip doesn't carry an empty `<label>` for first-iteration entries.
  const history = renderHistoricalStageDropdown(entry);
  if (history) buttons.push(history);

  buttons.push(renderShortcutsBtn());
  return buttons.join('');
}

function renderReadOnlyButtons(entry: Entry, affordances: Affordances): string {
  const buttons: string[] = [];
  for (const control of affordances.controls) {
    if (control === 'view-only') {
      buttons.push(html`<span class="er-entry-control er-entry-control--readonly">Read-only</span>`);
      continue;
    }
    if (control === 'fork-placeholder') {
      buttons.push(
        html`<button class="er-entry-control er-entry-control--button" type="button" disabled data-control="fork">Fork (coming)</button>`,
      );
      continue;
    }
    if (control === 'induct-to') {
      buttons.push(renderInductPicker(entry));
      continue;
    }
    // Unknown read-only control — render a label so the operator sees
    // it in case a new affordance type ships without a renderer
    // counterpart. Throwing here would tank the page; surfacing the
    // raw control name is loud enough that the gap gets noticed.
    buttons.push(html`<span class="er-entry-control">${control}</span>`);
  }
  buttons.push(renderShortcutsBtn());
  return buttons.join('');
}

interface DecisionStripOptions {
  readonly entry: Entry;
  readonly affordances: Affordances;
  /** Whether the page is rendering a historical version (`?v=<n>`).
   *  When true, mutation buttons (Approve / Iterate) render disabled
   *  with a tooltip explaining the read-only state. */
  readonly historical: boolean;
}

export function renderDecisionStrip(opts: DecisionStripOptions): RawHtml {
  const { entry, affordances, historical } = opts;
  const inner = affordances.mutable
    ? renderMutableButtons({ entry, historical })
    : renderReadOnlyButtons(entry, affordances);
  return unsafe(`<span class="er-strip-right">${inner}</span>`);
}
