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
 * every flag — name, template, scaffold default, host, id. Cleared
 * fields in the Edit form are NOT emitted as `--flag ""`; to clear a
 * field's value, manually edit the slash-command after pasting (the
 * Edit form is a copy-builder, not a destructive editor).
 *
 * Per Phase 39 (sites→lanes retirement) a lane carries no `contentDir`;
 * the former content-dir field builds `--scaffold-default markdown=<dir>`
 * (the editorial pipeline's artifact kind) and a separate optional
 * `--host` flag.
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
import {
  applyResultToCopy,
  type CopyBuildResult,
  type NoticeConfig,
} from '../copy-validation.ts';
import { resolveProjectKey } from '../dashboard/swimlane-storage.ts';

const ARCHIVED_OPEN_STORAGE_PREFIX = 'deskwork:lanes:';
const ARCHIVED_OPEN_STORAGE_SUFFIX = ':archived-open';

/**
 * Per-page notice element configuration for the lanes Copy buttons.
 * Distinct from the pipelines page's `pipelines-copy-notice` so a
 * single DOM containing both pages' fragments doesn't produce
 * notice-element collisions.
 */
const LANES_NOTICE_CONFIG: NoticeConfig = {
  datasetKey: 'lanesCopyNotice',
  selector: '[data-lanes-copy-notice]',
  className: 'lanes-copy-notice',
};

interface NewFormValues {
  readonly id: string;
  readonly name: string;
  readonly template: string;
  readonly scaffoldMarkdown: string;
  readonly host: string;
}

interface EditFormValues {
  readonly name: string;
  readonly nameCurrent: string;
  readonly template: string;
  readonly templateCurrent: string;
  readonly scaffoldMarkdown: string;
  readonly scaffoldMarkdownCurrent: string;
  readonly host: string;
  readonly hostCurrent: string;
}

/**
 * Module-level tracker for the currently-open Edit form row. Used to
 * implement the single-open accordion: opening a new row's Edit form
 * automatically closes the previously-open one.
 */
let openLaneId: string | null = null;

/**
 * DOM-attribute wired sentinel — guards `initLanesPage` against
 * double-binding when invoked twice against the same container. The
 * sentinel lives on the `[data-lanes-container]` element's dataset
 * (`data-lanes-wired="true"`); a fresh container rebuilds without
 * the attribute, so the next init wires normally. This shape
 * mirrors the swimlane controllers' shell-attribute variant (Task
 * 0.6, AUDIT-20260530-30) rather than the module-level boolean used
 * by `initRowMemberTab` (`row-member-tab.ts:87`). The choice matters
 * for test isolation: ~80 client-test invocations in this suite
 * rebuild the container between `beforeEach` blocks and expect the
 * next `initLanesPage()` to bind handlers on the fresh DOM. A
 * module-level boolean would leave the guard latched-true between
 * tests; the DOM-attribute sentinel resets naturally because the
 * container is a new element. Closes AUDIT-20260530-75 (cross-
 * model: AUDIT-BARRAGE-codex-P6-2).
 */
const LANES_WIRED_ATTR = 'lanesWired';

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
  // Trim symmetrically with `readFieldValue` so the diff comparison
  // in `buildUpdateCommand` is apples-to-apples. Pre-fix the live
  // value was trimmed but `dataset.current` was raw, producing a
  // spurious `--flag` whenever the stored value carried surrounding
  // whitespace. Closes AUDIT-20260530-69. Normalization-on-save, if
  // desired, must be an explicit operator action — not a side
  // effect of one-sided trimming in the diff path.
  return el?.dataset.current?.trim() ?? '';
}

/**
 * Build the `/deskwork:lane create` command from new-form values.
 *
 * Preview-vs-validity split (per AUDIT-20260530-73, Task 0.48):
 *
 *   - `command` is ALWAYS populated, using placeholder angle-brackets
 *     for empty required fields (`<id>`, `<template>`). The placeholder
 *     shape is preview-only — it gives the operator typing-feedback
 *     about the eventual command shape without premature value-binding.
 *   - `error` is non-null when one or more required fields (`id`,
 *     `template`) are empty. When set, the Copy button is disabled and
 *     the inline notice surfaces the message. This prevents the pre-fix
 *     bug where the Copy handler clipboarded the placeholder-bearing
 *     preview verbatim — pasting `<id>` into a shell is
 *     shell-injection-grade dangerous.
 *
 * Per Phase 39 (sites→lanes retirement) a lane carries no `contentDir`.
 * The scaffold-default (markdown) and host fields are OPTIONAL — emitted
 * as `--scaffold-default markdown=<dir>` / `--host <h>` only when filled.
 * Their absence does NOT mark the build invalid. The `name` field is
 * likewise optional.
 */
function buildCreateCommand(values: NewFormValues): CopyBuildResult {
  const id = values.id.length > 0 ? quoteValue(values.id) : '<id>';
  const template =
    values.template.length > 0 ? quoteValue(values.template) : '<template>';
  const scaffoldFragment =
    values.scaffoldMarkdown.length > 0
      ? ` --scaffold-default ${quoteValue(`markdown=${values.scaffoldMarkdown}`)}`
      : '';
  const hostFragment =
    values.host.length > 0 ? ` --host ${quoteValue(values.host)}` : '';
  const nameFragment =
    values.name.length > 0 ? ` --name ${quoteValue(values.name)}` : '';
  const command = `/deskwork:lane create ${id} --template ${template}${scaffoldFragment}${hostFragment}${nameFragment}`;

  const missing: string[] = [];
  if (values.id.length === 0) missing.push('id');
  if (values.template.length === 0) missing.push('template');

  if (missing.length === 0) {
    return { command, error: null };
  }
  const fieldsLabel = missing.length === 1 ? 'field' : 'fields';
  return {
    command,
    error: `Fill required ${fieldsLabel}: ${missing.join(', ')}.`,
  };
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
 * quoting symmetric across name / template / scaffold default / host.
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
    values.scaffoldMarkdown !== values.scaffoldMarkdownCurrent &&
    values.scaffoldMarkdown.length > 0
  ) {
    flags.push(
      `--scaffold-default ${quoteValue(`markdown=${values.scaffoldMarkdown}`)}`,
    );
  }
  if (values.host !== values.hostCurrent && values.host.length > 0) {
    flags.push(`--host ${quoteValue(values.host)}`);
  }
  const flagFragment = flags.length === 0 ? '' : ` ${flags.join(' ')}`;
  return `/deskwork:lane update ${quoteValue(laneId)}${flagFragment}`;
}

function rebuildNewFormPreview(form: HTMLElement): CopyBuildResult {
  const values: NewFormValues = {
    id: readFieldValue(form, 'id'),
    name: readFieldValue(form, 'name'),
    template: readFieldValue(form, 'template'),
    scaffoldMarkdown: readFieldValue(form, 'scaffoldMarkdown'),
    host: readFieldValue(form, 'host'),
  };
  const result = buildCreateCommand(values);
  const preview = form.querySelector<HTMLElement>('[data-lanes-preview]');
  if (preview) preview.textContent = result.command;
  return result;
}

function rebuildEditFormPreview(form: HTMLElement, laneId: string): string {
  const values: EditFormValues = {
    name: readFieldValue(form, 'name'),
    nameCurrent: readFieldCurrent(form, 'name'),
    template: readFieldValue(form, 'template'),
    templateCurrent: readFieldCurrent(form, 'template'),
    scaffoldMarkdown: readFieldValue(form, 'scaffoldMarkdown'),
    scaffoldMarkdownCurrent: readFieldCurrent(form, 'scaffoldMarkdown'),
    host: readFieldValue(form, 'host'),
    hostCurrent: readFieldCurrent(form, 'host'),
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
  const copyButton = form.querySelector<HTMLButtonElement>(
    '[data-lanes-copy-button="new"]',
  );
  const rebuild = (): void => {
    const result = rebuildNewFormPreview(form);
    if (copyButton) applyResultToCopy(copyButton, result, LANES_NOTICE_CONFIG);
  };
  for (const input of inputs) {
    input.addEventListener('input', rebuild);
    input.addEventListener('change', rebuild);
  }
  rebuild();

  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      const result = rebuildNewFormPreview(form);
      applyResultToCopy(copyButton, result, LANES_NOTICE_CONFIG);
      // Defense-in-depth (AUDIT-20260530-73, Task 0.48): refuse to
      // clipboard a placeholder-bearing command even if a synthetic
      // dispatch bypasses the `disabled` attribute. The visible gate
      // is the disabled state; this re-check is the hard stop.
      if (result.error !== null) return;
      await copyAndFlash(result.command, copyButton, 'Copied create command');
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
 * Wire every interactive control on the lanes page. Idempotent — a
 * second invocation against the same DOM is a no-op, guarded by the
 * module-level `wiredLanes` sentinel (per AUDIT-20260530-75). A
 * missing `[data-lanes-container]` short-circuits BEFORE the sentinel
 * flips, so importing this from a shared bundle on other surfaces is
 * harmless and a subsequent run on the actual lanes page still wires
 * correctly.
 */
export function initLanesPage(): void {
  // Reset module-level state so repeat init calls don't carry an
  // open-row tracker across mounts.
  openLaneId = null;
  const container = document.querySelector<HTMLElement>('[data-lanes-container]');
  if (!container) return;
  // Wired-once guard via container dataset. If the page was already
  // wired (same container element), this is a no-op. A re-render that
  // replaces the container resets the sentinel naturally.
  if (container.dataset[LANES_WIRED_ATTR] === 'true') return;
  initNewForm(container);
  initEditForms(container);
  initEditToggles(container);
  initRowCopyButtons(container);
  initArchivedSection(container);
  initEmptyStateCta(container);
  // Flip the sentinel only AFTER all wiring lands. An exception
  // during wiring leaves the sentinel absent so the operator can
  // retry; pre-flipping would strand the page half-wired.
  container.dataset[LANES_WIRED_ATTR] = 'true';
}
