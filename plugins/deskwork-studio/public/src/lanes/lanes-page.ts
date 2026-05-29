/**
 * Client controller for the `/dev/lanes` studio page (Phase 6 Task
 * 6.3).
 *
 * Three responsibilities:
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
 *   3. **Per-row Edit toggle.** Each row's Edit button toggles the
 *      sibling `tr[data-lane-edit-row]` between visible / hidden +
 *      flips `aria-expanded` on the toggle button.
 *
 * THESIS Consequence 2: the controller never mutates state on the
 * server. There are no fetch / POST paths; every operator action
 * resolves to a clipboard write + a paste in Claude Code.
 *
 * Idempotent: if the page has no `[data-lanes-container]`, init
 * is a no-op. This lets the same script bundle load on multiple
 * surfaces without per-surface guard checks at the import site.
 */

import { copyOrShowFallback } from '../clipboard.ts';

const COPIED_FLASH_MS = 1500;

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
  const id = values.id.length > 0 ? values.id : '<id>';
  const template = values.template.length > 0 ? values.template : '<template>';
  const contentDir = values.contentDir.length > 0 ? values.contentDir : '<path>';
  const nameFragment = values.name.length > 0 ? ` --name ${JSON.stringify(values.name)}` : '';
  return `/deskwork:lane create ${id} --template ${template} --content-dir ${contentDir}${nameFragment}`;
}

function buildUpdateCommand(
  laneId: string,
  values: EditFormValues,
): string {
  const flags: string[] = [];
  if (values.name !== values.nameCurrent) {
    flags.push(`--name ${JSON.stringify(values.name)}`);
  }
  if (values.template !== values.templateCurrent && values.template.length > 0) {
    flags.push(`--template ${values.template}`);
  }
  if (values.contentDir !== values.contentDirCurrent && values.contentDir.length > 0) {
    flags.push(`--content-dir ${values.contentDir}`);
  }
  const flagFragment = flags.length === 0 ? '' : ` ${flags.join(' ')}`;
  return `/deskwork:lane update ${laneId}${flagFragment}`;
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

async function copyAndFlash(
  command: string,
  button: HTMLButtonElement,
  successMessage: string,
): Promise<void> {
  const original = button.textContent;
  const ok = await copyOrShowFallback(command, {
    successMessage,
    fallbackMessage:
      'Clipboard unavailable — select and Cmd-C to copy this command, then paste it into Claude Code:',
  });
  if (ok) {
    button.classList.add('is-copied');
    button.textContent = 'Copied ✓';
    window.setTimeout(() => {
      button.classList.remove('is-copied');
      if (original !== null) button.textContent = original;
    }, COPIED_FLASH_MS);
  }
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
      target.hidden = !willOpen;
      toggle.setAttribute('aria-expanded', String(willOpen));
    });
  }

  const cancels = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[data-lane-edit-cancel]'),
  );
  for (const cancel of cancels) {
    const laneId = cancel.dataset.laneId;
    if (!laneId) continue;
    cancel.addEventListener('click', () => {
      const row = container.querySelector<HTMLElement>(
        `[data-lane-edit-row][data-lane-id="${laneId}"]`,
      );
      const toggle = container.querySelector<HTMLButtonElement>(
        `[data-lane-edit-toggle][data-lane-id="${laneId}"]`,
      );
      if (row) row.hidden = true;
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
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
 * Wire every interactive control on the lanes page. Idempotent —
 * a missing `[data-lanes-container]` short-circuits, so importing
 * this from a shared bundle on other surfaces is harmless.
 */
export function initLanesPage(): void {
  const container = document.querySelector<HTMLElement>('[data-lanes-container]');
  if (!container) return;
  initNewForm(container);
  initEditForms(container);
  initEditToggles(container);
  initRowCopyButtons(container);
}
