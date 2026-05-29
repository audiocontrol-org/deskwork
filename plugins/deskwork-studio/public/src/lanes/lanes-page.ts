/**
 * Client controller for the `/dev/lanes` studio page (Phase 6 Task
 * 6.3).
 *
 * Responsibilities:
 *
 *   1. **Live command preview.** Each form (New + per-row Edit)
 *      carries a `<code data-lanes-preview>` element. On every
 *      change event the controller rebuilds the preview to match
 *      the form's current values.
 *
 *   2. **Clipboard copy.** Each copy button (`[data-lanes-copy-button]`
 *      on forms, `[data-lane-copy]` on table rows) clipboards its
 *      payload through `copyOrShowFallback` and flashes a "Copied"
 *      affirmation on the button.
 *
 *   3. **Per-row Edit toggle (single-open accordion).** Each row's
 *      Edit button toggles the sibling `tr[data-lane-edit-row]`
 *      between visible / hidden + flips `aria-expanded` on the
 *      toggle button. Opening one row's edit form auto-closes any
 *      previously-open row — at most one edit form is visible at a
 *      time.
 *
 *   4. **Archived-section open-state persistence.** A `toggle` event
 *      handler on `[data-lanes-archived-details]` writes the open
 *      state to `localStorage` (project-scoped); on init the page
 *      reads it back and restores the previous state.
 *
 *   5. **Empty-state CTA focus.** The "Create your first lane" CTA
 *      overrides its anchor scroll to focus the first field of the
 *      New Lane form — the operator's intent on click is "let me
 *      start typing," not "scroll me there." The anchor `href`
 *      stays as a no-JS fallback.
 *
 * Slash-command quoting convention: every operator-supplied value
 * routed through `quoteValue()` (JSON.stringify). This handles
 * embedded quotes, backslashes, and whitespace symmetrically across
 * every flag — name, template, contentDir, id. Cleared fields in
 * the Edit form are NOT emitted as `--flag ""`; to clear a field's
 * value, manually edit the slash-command after pasting (the Edit
 * form is a copy-builder, not a destructive editor).
 *
 * THESIS Consequence 2: the controller never mutates state on the
 * server. There are no fetch / POST paths; every operator action
 * resolves to a clipboard write + a paste in Claude Code.
 *
 * Idempotent: if the page has no `[data-lanes-container]`, init
 * is a no-op. This lets the same script bundle load on multiple
 * surfaces without per-surface guard checks at the import site.
 */

import { copyAndFlash, quoteValue } from '../copy-builder.ts';
import { resolveProjectKey } from '../dashboard/swimlane-storage.ts';

const ARCHIVED_OPEN_STORAGE_PREFIX = 'deskwork:lanes:';
const ARCHIVED_OPEN_STORAGE_SUFFIX = ':archived-open';

interface NewFormValues {
  readonly id: string;
  readonly name: string;
  readonly template: string;
  readonly contentDir: string;
}

interface EditFormValues {
  readonly name: string;
  readonly nameCurrent: string;
  readonly template: string;
  readonly templateCurrent: string;
  readonly contentDir: string;
  readonly contentDirCurrent: string;
}

/**
 * Module-level tracker for the currently-open Edit form row. Used to
 * implement the single-open accordion: opening a new row's Edit form
 * automatically closes the previously-open one.
 */
let openLaneId: string | null = null;

function readFieldValue(form: HTMLElement, name: string): string {
  const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[data-lanes-field="${name}"]`,
  );
  return el?.value.trim() ?? '';
}

function readFieldCurrent(form: HTMLElement, name: string): string {
  const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[data-lanes-field="${name}"]`,
  );
  return el?.dataset.current ?? '';
}

function buildCreateCommand(values: NewFormValues): string {
  const id = values.id.length > 0 ? quoteValue(values.id) : '<id>';
  const template =
    values.template.length > 0 ? quoteValue(values.template) : '<template>';
  const contentDir =
    values.contentDir.length > 0 ? quoteValue(values.contentDir) : '<path>';
  const nameFragment =
    values.name.length > 0 ? ` --name ${quoteValue(values.name)}` : '';
  return `/deskwork:lane create ${id} --template ${template} --content-dir ${contentDir}${nameFragment}`;
}

/**
 * Build the `/deskwork:lane update` command from edit-form values.
 *
 * Cleared fields are NOT emitted as `--flag ""`. Every diff-emit
 * branch requires the new value to be non-empty AND different from
 * the current value — the Edit form is a copy-builder, not a
 * destructive editor. An operator who wants to clear a value
 * manually edits the resulting slash-command after pasting.
 *
 * Operator-supplied values flow through `quoteValue()` to keep
 * quoting symmetric across name / template / contentDir.
 */
function buildUpdateCommand(
  laneId: string,
  values: EditFormValues,
): string {
  const flags: string[] = [];
  if (values.name !== values.nameCurrent && values.name.length > 0) {
    flags.push(`--name ${quoteValue(values.name)}`);
  }
  if (values.template !== values.templateCurrent && values.template.length > 0) {
    flags.push(`--template ${quoteValue(values.template)}`);
  }
  if (
    values.contentDir !== values.contentDirCurrent &&
    values.contentDir.length > 0
  ) {
    flags.push(`--content-dir ${quoteValue(values.contentDir)}`);
  }
  const flagFragment = flags.length === 0 ? '' : ` ${flags.join(' ')}`;
  return `/deskwork:lane update ${quoteValue(laneId)}${flagFragment}`;
}

function rebuildNewFormPreview(form: HTMLElement): string {
  const values: NewFormValues = {
    id: readFieldValue(form, 'id'),
    name: readFieldValue(form, 'name'),
    template: readFieldValue(form, 'template'),
    contentDir: readFieldValue(form, 'contentDir'),
  };
  const command = buildCreateCommand(values);
  const preview = form.querySelector<HTMLElement>('[data-lanes-preview]');
  if (preview) preview.textContent = command;
  return command;
}

function rebuildEditFormPreview(form: HTMLElement, laneId: string): string {
  const values: EditFormValues = {
    name: readFieldValue(form, 'name'),
    nameCurrent: readFieldCurrent(form, 'name'),
    template: readFieldValue(form, 'template'),
    templateCurrent: readFieldCurrent(form, 'template'),
    contentDir: readFieldValue(form, 'contentDir'),
    contentDirCurrent: readFieldCurrent(form, 'contentDir'),
  };
  const command = buildUpdateCommand(laneId, values);
  const preview = form.querySelector<HTMLElement>('[data-lanes-preview]');
  if (preview) preview.textContent = command;
  return command;
}

function initNewForm(container: HTMLElement): void {
  const form = container.querySelector<HTMLElement>('[data-lanes-new-form]');
  if (!form) return;
  const inputs = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-lanes-field]'),
  );
  const rebuild = (): void => {
    rebuildNewFormPreview(form);
  };
  for (const input of inputs) {
    input.addEventListener('input', rebuild);
    input.addEventListener('change', rebuild);
  }
  rebuild();

  const copyButton = form.querySelector<HTMLButtonElement>(
    '[data-lanes-copy-button="new"]',
  );
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      const command = rebuildNewFormPreview(form);
      await copyAndFlash(command, copyButton, 'Copied create command');
    });
  }
}

function initEditForms(container: HTMLElement): void {
  const editForms = Array.from(
    container.querySelectorAll<HTMLElement>('[data-lanes-edit-form]'),
  );
  for (const form of editForms) {
    const laneId = form.dataset.laneId;
    if (!laneId) continue;
    const inputs = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-lanes-field]'),
    );
    const rebuild = (): void => {
      rebuildEditFormPreview(form, laneId);
    };
    for (const input of inputs) {
      input.addEventListener('input', rebuild);
      input.addEventListener('change', rebuild);
    }
    rebuild();

    const copyButton = form.querySelector<HTMLButtonElement>(
      '[data-lanes-copy-button="edit"]',
    );
    if (copyButton) {
      copyButton.addEventListener('click', async () => {
        const command = rebuildEditFormPreview(form, laneId);
        await copyAndFlash(command, copyButton, 'Copied update command');
      });
    }
  }
}

/**
 * Close the edit-form row for `laneId` and reset its toggle button's
 * `aria-expanded` to `false`. Used by the single-open accordion logic
 * to close the previously-open row when a different row opens.
 */
function closeEditRow(container: HTMLElement, laneId: string): void {
  const row = container.querySelector<HTMLElement>(
    `[data-lane-edit-row][data-lane-id="${laneId}"]`,
  );
  const toggle = container.querySelector<HTMLButtonElement>(
    `[data-lane-edit-toggle][data-lane-id="${laneId}"]`,
  );
  if (row) row.hidden = true;
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function initEditToggles(container: HTMLElement): void {
  const toggles = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[data-lane-edit-toggle]'),
  );
  for (const toggle of toggles) {
    const laneId = toggle.dataset.laneId;
    if (!laneId) continue;
    toggle.addEventListener('click', () => {
      const target = container.querySelector<HTMLElement>(
        `[data-lane-edit-row][data-lane-id="${laneId}"]`,
      );
      if (!target) return;
      const willOpen = target.hidden;
      // Single-open accordion: when opening, close any other row's
      // edit form first. When closing, just drop the tracker.
      if (willOpen && openLaneId !== null && openLaneId !== laneId) {
        closeEditRow(container, openLaneId);
      }
      target.hidden = !willOpen;
      toggle.setAttribute('aria-expanded', String(willOpen));
      openLaneId = willOpen ? laneId : null;
    });
  }

  const cancels = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[data-lane-edit-cancel]'),
  );
  for (const cancel of cancels) {
    const laneId = cancel.dataset.laneId;
    if (!laneId) continue;
    cancel.addEventListener('click', () => {
      closeEditRow(container, laneId);
      if (openLaneId === laneId) openLaneId = null;
    });
  }
}

function initRowCopyButtons(container: HTMLElement): void {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[data-lane-copy]'),
  );
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      const command = button.dataset.copy;
      if (!command || command.length === 0) {
        return;
      }
      await copyAndFlash(command, button, `Copied ${command}`);
    });
  }
}

/**
 * Resolve the localStorage key for the archived-section open state.
 * Namespaces by project key (same convention as the dashboard's
 * swimlane storage) so two operators sharing a machine but working on
 * different projects don't see each other's collapse state.
 */
function archivedOpenKey(container: HTMLElement): string {
  const projectKey = resolveProjectKey(container);
  return `${ARCHIVED_OPEN_STORAGE_PREFIX}${projectKey}${ARCHIVED_OPEN_STORAGE_SUFFIX}`;
}

function initArchivedSection(container: HTMLElement): void {
  const details = container.querySelector<HTMLDetailsElement>(
    '[data-lanes-archived-details]',
  );
  if (!details) return;
  const key = archivedOpenKey(container);

  // Restore previous open state on init.
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      details.open = stored === 'true';
    }
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — fall
    // through to the server-rendered default (closed). Persistence
    // is best-effort; the page still works without it.
  }

  details.addEventListener('toggle', () => {
    try {
      window.localStorage.setItem(key, String(details.open));
    } catch {
      // Same posture as the read path: best-effort. A failed write
      // doesn't prevent the operator from toggling the section.
    }
  });
}

function initEmptyStateCta(container: HTMLElement): void {
  const cta = container.querySelector<HTMLAnchorElement>(
    '[data-lanes-cta-focus]',
  );
  if (!cta) return;
  cta.addEventListener('click', (event) => {
    const first = container.querySelector<HTMLInputElement | HTMLSelectElement>(
      '[data-lanes-new-form] [data-lanes-field="id"]',
    );
    if (!first) return;
    event.preventDefault();
    first.focus();
  });
}

/**
 * Wire every interactive control on the lanes page. Idempotent —
 * a missing `[data-lanes-container]` short-circuits, so importing
 * this from a shared bundle on other surfaces is harmless.
 */
export function initLanesPage(): void {
  // Reset module-level state so repeat init calls (e.g. in tests)
  // don't carry an open-row tracker across mounts.
  openLaneId = null;
  const container = document.querySelector<HTMLElement>('[data-lanes-container]');
  if (!container) return;
  initNewForm(container);
  initEditForms(container);
  initEditToggles(container);
  initRowCopyButtons(container);
  initArchivedSection(container);
  initEmptyStateCta(container);
}
