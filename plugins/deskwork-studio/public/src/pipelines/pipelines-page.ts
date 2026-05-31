/**
 * Client controller for the `/dev/pipelines` studio page (Phase 6
 * Task 6.4).
 *
 * Responsibilities:
 *
 *   1. **Live command preview.** Every form (the New form + each
 *      template's Edit panel's five sub-operations) carries one
 *      `<code data-pipelines-preview="<scope>">` element. The
 *      controller rebuilds the preview on every change event so the
 *      operator sees the assembled slash command before clicking
 *      Copy.
 *
 *   2. **Clipboard copy.** Every copy button (`[data-pipelines-copy-
 *      button="<scope>"]` on forms, `[data-pipeline-copy]` on table
 *      rows for the Delete affordance) clipboards its payload through
 *      `copyOrShowFallback` and flashes a "Copied" affirmation.
 *
 *   3. **Per-row View / Edit toggles (single-open accordion).** A
 *      single module-level tracker holds the currently-open panel id
 *      across View and Edit — opening a new View or Edit auto-closes
 *      whichever was previously open. View and Edit are mutually
 *      exclusive per row too: opening Edit on row R closes Row R's
 *      View if it was open, and vice versa.
 *
 *   4. **Edit sub-operation single-open accordion.** Inside one Edit
 *      panel, the five `<details data-pipelines-op>` panels behave
 *      as a single-open accordion: opening one closes the others.
 *      This mirrors the CLI's mutually-exclusive contract — only
 *      one update operation runs per invocation.
 *
 * Slash-command quoting: every operator-supplied value flows through
 * `quoteValue()` (JSON.stringify). The CLI accepts the resulting
 * double-quoted, backslash-escaped form for every flag.
 *
 * Idempotent: when the page has no `[data-pipelines-container]`,
 * init is a no-op. The lanes-page controller's bundle shares the same
 * surface; both inits run on every page and short-circuit when their
 * markers are absent.
 *
 * THESIS Consequence 2: the controller never mutates state on the
 * server. There are no fetch / POST paths; every operator action
 * resolves to a clipboard write + paste in Claude Code.
 */

import { copyAndFlash } from '../copy-builder.ts';
import {
  applyResultToCopy,
  type NoticeConfig,
} from '../copy-validation.ts';
import {
  buildCreateCommand,
  buildEditCommand,
  UPDATE_OPS,
  type BuildResult,
  type UpdateOp,
} from './pipelines-builders.ts';

/**
 * Per-page notice element configuration for the pipelines Copy
 * buttons. Distinct dataset/selector/class from the lanes page so a
 * single DOM containing both pages' fragments (in tests, e.g.)
 * doesn't produce notice-element collisions.
 */
const PIPELINES_NOTICE_CONFIG: NoticeConfig = {
  datasetKey: 'pipelinesCopyNotice',
  selector: '[data-pipelines-copy-notice]',
  className: 'pipelines-copy-notice',
};

/**
 * Module-level tracker for the currently-open per-row panel (View or
 * Edit). Each entry is `{ pipelineId, panel: 'view'|'edit' }`. Used
 * by the single-open accordion logic so opening any panel auto-closes
 * the previously-open one (cross-row AND cross-panel).
 */
interface OpenPanelState {
  readonly pipelineId: string;
  readonly panel: 'view' | 'edit';
}

let openPanel: OpenPanelState | null = null;

/**
 * DOM-attribute wired sentinel — guards `initPipelinesPage` against
 * double-binding when invoked twice against the same container. Same
 * shape as `LANES_WIRED_ATTR` in `lanes-page.ts`; mirrors the
 * swimlane controllers' shell-attribute variant (Task 0.6, AUDIT-
 * 20260530-30). DOM-attribute over module-level boolean for the same
 * test-isolation reason: client-test fixtures rebuild the container
 * between cases, and a fresh container element naturally resets the
 * sentinel. Closes AUDIT-20260530-75 (cross-model: AUDIT-BARRAGE-
 * codex-P6-2).
 */
const PIPELINES_WIRED_ATTR = 'pipelinesWired';

function rebuildNewPreview(form: HTMLElement): BuildResult {
  const result = buildCreateCommand(form);
  const preview = form.querySelector<HTMLElement>(
    '[data-pipelines-preview="new"]',
  );
  if (preview) preview.textContent = result.command;
  return result;
}

function rebuildEditPreview(
  form: HTMLElement,
  op: UpdateOp,
  pipelineId: string,
): BuildResult {
  const result = buildEditCommand(form, op, pipelineId);
  const preview = form.querySelector<HTMLElement>(
    `[data-pipelines-preview="${op}"]`,
  );
  if (preview) preview.textContent = result.command;
  return result;
}

function initNewForm(container: HTMLElement): void {
  const form = container.querySelector<HTMLElement>('[data-pipelines-new-form]');
  if (!form) return;
  const inputs = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      '[data-pipelines-field]',
    ),
  );
  const copy = form.querySelector<HTMLButtonElement>(
    '[data-pipelines-copy-button="new"]',
  );
  const rebuild = (): void => {
    const result = rebuildNewPreview(form);
    if (copy) applyResultToCopy(copy, result, PIPELINES_NOTICE_CONFIG);
  };
  for (const input of inputs) {
    input.addEventListener('input', rebuild);
    input.addEventListener('change', rebuild);
  }
  rebuild();

  if (copy) {
    copy.addEventListener('click', async () => {
      const result = rebuildNewPreview(form);
      applyResultToCopy(copy, result, PIPELINES_NOTICE_CONFIG);
      // Refuse to clipboard a command whose preview still carries the
      // `<id>` / `<stages>` angle-bracket markers. The disabled
      // attribute prevents native clicks, but defense-in-depth: if a
      // stale dispatch reaches this handler, the error re-check stops
      // the clipboard write.
      if (result.error !== null) return;
      await copyAndFlash(result.command, copy, 'Copied create command');
    });
  }
}

function initEditOpForm(
  panel: HTMLElement,
  op: UpdateOp,
  pipelineId: string,
  isPluginPreset: boolean,
): void {
  const form = panel.querySelector<HTMLElement>(
    `[data-pipelines-op-form="${op}"]`,
  );
  if (!form) return;
  const inputs = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      '[data-pipelines-field]',
    ),
  );
  const copy = form.querySelector<HTMLButtonElement>(
    `[data-pipelines-copy-button="${op}"]`,
  );
  const buildForCopy = (): BuildResult => {
    const raw = rebuildEditPreview(form, op, pipelineId);
    // Plugin presets are read-only at the CLI level; the customize
    // command writes a project override the operator can then mutate.
    // Override the build error so every Copy button on a preset panel
    // surfaces the same next-step guidance regardless of field state.
    if (isPluginPreset) {
      return {
        command: raw.command,
        error:
          `Plugin presets are read-only. Run /deskwork:customize pipeline ${pipelineId} first to write a project override, then the Edit operations apply.`,
      };
    }
    return raw;
  };
  const rebuild = (): void => {
    const result = buildForCopy();
    if (copy) applyResultToCopy(copy, result, PIPELINES_NOTICE_CONFIG);
  };
  for (const input of inputs) {
    input.addEventListener('input', rebuild);
    input.addEventListener('change', rebuild);
  }
  rebuild();

  if (copy) {
    copy.addEventListener('click', async () => {
      const result = buildForCopy();
      applyResultToCopy(copy, result, PIPELINES_NOTICE_CONFIG);
      // Defense-in-depth: refuse to clipboard a command the build
      // reported as invalid (empty required field, empty stage list,
      // plugin-preset gate, etc.) even if the disabled attribute was
      // bypassed.
      if (result.error !== null) return;
      await copyAndFlash(result.command, copy, `Copied ${op} command`);
    });
  }
}

/**
 * Wire the single-open accordion across the five `<details
 * data-pipelines-op>` sub-panels inside one Edit panel. Opening any
 * one closes the others — matches the CLI's mutually-exclusive
 * contract.
 */
function initEditSubAccordion(panel: HTMLElement): void {
  const details = Array.from(
    panel.querySelectorAll<HTMLDetailsElement>('[data-pipelines-op]'),
  );
  for (const target of details) {
    target.addEventListener('toggle', () => {
      if (!target.open) return;
      for (const other of details) {
        if (other !== target && other.open) other.open = false;
      }
    });
  }
}

function initEditPanels(container: HTMLElement): void {
  const panels = Array.from(
    container.querySelectorAll<HTMLElement>('[data-pipelines-edit-panel]'),
  );
  for (const panel of panels) {
    const pipelineId = panel.dataset.pipelineId;
    if (!pipelineId) continue;
    const isPluginPreset =
      panel.dataset.pipelinesSource === 'plugin-preset';
    for (const op of UPDATE_OPS) {
      initEditOpForm(panel, op, pipelineId, isPluginPreset);
    }
    initEditSubAccordion(panel);
  }
}

/**
 * Close a hidden panel row (View or Edit) and reset its toggle's
 * aria-expanded. Used by the single-open accordion when a sibling
 * panel opens.
 */
function closePanelRow(
  container: HTMLElement,
  pipelineId: string,
  panel: 'view' | 'edit',
): void {
  const rowSelector =
    panel === 'view' ? 'data-pipeline-view-row' : 'data-pipeline-edit-row';
  const toggleSelector =
    panel === 'view' ? 'data-pipeline-view-toggle' : 'data-pipeline-edit-toggle';
  const row = container.querySelector<HTMLElement>(
    `[${rowSelector}][data-pipeline-id="${pipelineId}"]`,
  );
  const toggle = container.querySelector<HTMLButtonElement>(
    `[${toggleSelector}][data-pipeline-id="${pipelineId}"]`,
  );
  if (row) row.hidden = true;
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function initRowToggles(container: HTMLElement): void {
  const wire = (panel: 'view' | 'edit', toggleAttr: string, rowAttr: string): void => {
    const toggles = Array.from(
      container.querySelectorAll<HTMLButtonElement>(`[${toggleAttr}]`),
    );
    for (const toggle of toggles) {
      const pipelineId = toggle.dataset.pipelineId;
      if (!pipelineId) continue;
      toggle.addEventListener('click', () => {
        const target = container.querySelector<HTMLElement>(
          `[${rowAttr}][data-pipeline-id="${pipelineId}"]`,
        );
        if (!target) return;
        const willOpen = target.hidden;
        if (willOpen && openPanel !== null) {
          // Close whichever panel was previously open (could be the
          // same row's sibling panel or a different row's panel).
          closePanelRow(container, openPanel.pipelineId, openPanel.panel);
        }
        target.hidden = !willOpen;
        toggle.setAttribute('aria-expanded', String(willOpen));
        openPanel = willOpen ? { pipelineId, panel } : null;
      });
    }
  };
  wire('view', 'data-pipeline-view-toggle', 'data-pipeline-view-row');
  wire('edit', 'data-pipeline-edit-toggle', 'data-pipeline-edit-row');

  const cancels = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[data-pipeline-edit-cancel]'),
  );
  for (const cancel of cancels) {
    const pipelineId = cancel.dataset.pipelineId;
    if (!pipelineId) continue;
    cancel.addEventListener('click', () => {
      closePanelRow(container, pipelineId, 'edit');
      if (openPanel?.pipelineId === pipelineId && openPanel.panel === 'edit') {
        openPanel = null;
      }
    });
  }
}

function initRowCopyButtons(container: HTMLElement): void {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[data-pipeline-copy]'),
  );
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      const command = button.dataset.copy;
      if (!command || command.length === 0) return;
      await copyAndFlash(command, button, `Copied ${command}`);
    });
  }
}

/**
 * Wire every interactive control on the pipelines page. Idempotent —
 * a second invocation against the same DOM is a no-op, guarded by
 * the module-level `wiredPipelines` sentinel (per AUDIT-20260530-75).
 * Absent `[data-pipelines-container]` short-circuits BEFORE the
 * sentinel flips, so importing this from a shared bundle on other
 * surfaces is harmless and a subsequent run on the actual pipelines
 * page still wires correctly.
 */
export function initPipelinesPage(): void {
  // Reset module-level state so repeat init calls don't carry a
  // stale open-panel tracker.
  openPanel = null;
  const container = document.querySelector<HTMLElement>(
    '[data-pipelines-container]',
  );
  if (!container) return;
  // Wired-once guard via container dataset. If the page was already
  // wired (same container element), this is a no-op. A re-render that
  // replaces the container resets the sentinel naturally.
  if (container.dataset[PIPELINES_WIRED_ATTR] === 'true') return;
  initNewForm(container);
  initEditPanels(container);
  initRowToggles(container);
  initRowCopyButtons(container);
  // Flip the sentinel only AFTER wiring lands. An exception during
  // wiring leaves it absent so the operator can retry.
  container.dataset[PIPELINES_WIRED_ATTR] = 'true';
}
