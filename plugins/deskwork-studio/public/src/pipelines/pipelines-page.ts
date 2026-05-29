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

/**
 * Quote an operator-supplied value for inclusion in a slash command.
 * `JSON.stringify` wraps in double quotes and escapes embedded quotes,
 * backslashes, and control characters — applied symmetrically across
 * id / shape / name / description / stage names so injection-shape
 * inputs can't slip through if pasted into a shell.
 */
function quoteValue(value: string): string {
  return JSON.stringify(value);
}

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
 * Read a field's trimmed value from a form. Returns empty string when
 * the field is absent so callers can treat "missing" and "blank" as
 * equivalent for the preview-rebuild path.
 */
function readField(form: HTMLElement, name: string): string {
  const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[data-pipelines-field="${name}"]`,
  );
  return el?.value.trim() ?? '';
}

/**
 * Read a set of checkbox values (used by the set-locked sub-operation).
 * Returns the values of every checked input in document order.
 */
function readCheckedValues(form: HTMLElement, name: string): string[] {
  const els = Array.from(
    form.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][data-pipelines-field="${name}"]`,
    ),
  );
  return els.filter((el) => el.checked).map((el) => el.value);
}

/** Build the `/deskwork:pipeline create` command from the New form. */
function buildCreateCommand(form: HTMLElement): string {
  const id = readField(form, 'new-id');
  const shape = readField(form, 'new-shape');
  const name = readField(form, 'new-name');
  const description = readField(form, 'new-description');

  const idArg = id.length > 0 ? quoteValue(id) : '<id>';
  const shapeArg = shape.length > 0 ? quoteValue(shape) : '<stages>';
  const nameFragment = name.length > 0 ? ` --name ${quoteValue(name)}` : '';
  const descFragment =
    description.length > 0 ? ` --description ${quoteValue(description)}` : '';
  return `/deskwork:pipeline create ${idArg} --shape ${shapeArg}${nameFragment}${descFragment}`;
}

function rebuildNewPreview(form: HTMLElement): string {
  const command = buildCreateCommand(form);
  const preview = form.querySelector<HTMLElement>(
    '[data-pipelines-preview="new"]',
  );
  if (preview) preview.textContent = command;
  return command;
}

/** Build the `/deskwork:pipeline update <id> --add-stage ...` command. */
function buildAddCommand(form: HTMLElement, pipelineId: string): string {
  const name = readField(form, 'add-name');
  const position = readField(form, 'add-position');
  const idArg = quoteValue(pipelineId);
  const nameArg = name.length > 0 ? quoteValue(name) : '<name>';
  const positionFragment =
    position.length > 0 ? ` --position ${position}` : '';
  return `/deskwork:pipeline update ${idArg} --add-stage ${nameArg}${positionFragment}`;
}

/** Build the `--rename-stage <from> --to-stage <to>` command. */
function buildRenameCommand(form: HTMLElement, pipelineId: string): string {
  const from = readField(form, 'rename-from');
  const to = readField(form, 'rename-to');
  const idArg = quoteValue(pipelineId);
  const fromArg = from.length > 0 ? quoteValue(from) : '<from>';
  const toArg = to.length > 0 ? quoteValue(to) : '<to>';
  return `/deskwork:pipeline update ${idArg} --rename-stage ${fromArg} --to-stage ${toArg}`;
}

/** Build the `--remove-stage <name>` command. */
function buildRemoveCommand(form: HTMLElement, pipelineId: string): string {
  const name = readField(form, 'remove-name');
  const idArg = quoteValue(pipelineId);
  const nameArg = name.length > 0 ? quoteValue(name) : '<name>';
  return `/deskwork:pipeline update ${idArg} --remove-stage ${nameArg}`;
}

/** Build the `--set-locked "s1,s2,..."` command. */
function buildSetLockedCommand(form: HTMLElement, pipelineId: string): string {
  const checked = readCheckedValues(form, 'set-locked');
  const idArg = quoteValue(pipelineId);
  const csv = checked.join(',');
  // Empty selection means "clear all locks" — emit `--set-locked ""`
  // so the CLI sees an explicit empty list rather than an absent flag.
  return `/deskwork:pipeline update ${idArg} --set-locked ${quoteValue(csv)}`;
}

/** Build the `--set-off-pipeline "s1,s2,..."` command. */
function buildSetOffCommand(form: HTMLElement, pipelineId: string): string {
  const csv = readField(form, 'set-off-pipeline');
  const idArg = quoteValue(pipelineId);
  return `/deskwork:pipeline update ${idArg} --set-off-pipeline ${quoteValue(csv)}`;
}

type UpdateOp =
  | 'add'
  | 'rename'
  | 'remove'
  | 'set-locked'
  | 'set-off-pipeline';

function rebuildEditPreview(
  form: HTMLElement,
  op: UpdateOp,
  pipelineId: string,
): string {
  let command: string;
  switch (op) {
    case 'add':
      command = buildAddCommand(form, pipelineId);
      break;
    case 'rename':
      command = buildRenameCommand(form, pipelineId);
      break;
    case 'remove':
      command = buildRemoveCommand(form, pipelineId);
      break;
    case 'set-locked':
      command = buildSetLockedCommand(form, pipelineId);
      break;
    case 'set-off-pipeline':
      command = buildSetOffCommand(form, pipelineId);
      break;
  }
  const preview = form.querySelector<HTMLElement>(
    `[data-pipelines-preview="${op}"]`,
  );
  if (preview) preview.textContent = command;
  return command;
}

function initNewForm(container: HTMLElement): void {
  const form = container.querySelector<HTMLElement>('[data-pipelines-new-form]');
  if (!form) return;
  const inputs = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      '[data-pipelines-field]',
    ),
  );
  const rebuild = (): void => {
    rebuildNewPreview(form);
  };
  for (const input of inputs) {
    input.addEventListener('input', rebuild);
    input.addEventListener('change', rebuild);
  }
  rebuild();

  const copy = form.querySelector<HTMLButtonElement>(
    '[data-pipelines-copy-button="new"]',
  );
  if (copy) {
    copy.addEventListener('click', async () => {
      const command = rebuildNewPreview(form);
      await copyAndFlash(command, copy, 'Copied create command');
    });
  }
}

const UPDATE_OPS: readonly UpdateOp[] = [
  'add',
  'rename',
  'remove',
  'set-locked',
  'set-off-pipeline',
];

function initEditOpForm(
  panel: HTMLElement,
  op: UpdateOp,
  pipelineId: string,
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
  const rebuild = (): void => {
    rebuildEditPreview(form, op, pipelineId);
  };
  for (const input of inputs) {
    input.addEventListener('input', rebuild);
    input.addEventListener('change', rebuild);
  }
  rebuild();

  const copy = form.querySelector<HTMLButtonElement>(
    `[data-pipelines-copy-button="${op}"]`,
  );
  if (copy) {
    copy.addEventListener('click', async () => {
      const command = rebuildEditPreview(form, op, pipelineId);
      await copyAndFlash(command, copy, `Copied ${op} command`);
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
    for (const op of UPDATE_OPS) {
      initEditOpForm(panel, op, pipelineId);
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
 * absent `[data-pipelines-container]` short-circuits, so importing
 * this from a shared bundle on other surfaces is harmless.
 */
export function initPipelinesPage(): void {
  // Reset module-level state so repeat init calls (e.g. across tests)
  // don't carry a stale open-panel tracker.
  openPanel = null;
  const container = document.querySelector<HTMLElement>(
    '[data-pipelines-container]',
  );
  if (!container) return;
  initNewForm(container);
  initEditPanels(container);
  initRowToggles(container);
  initRowCopyButtons(container);
}
