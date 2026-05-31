/**
 * @vitest-environment jsdom
 *
 * Client-controller VALIDATION tests for `/dev/pipelines` (Phase 6
 * Task 6.4 — review followups).
 *
 * Each sub-form's Copy button must disable + surface an inline notice
 * when required fields are empty (or, for set-locked /
 * set-off-pipeline, when the comma-separated value would reach the
 * CLI's `splitStageList` empty — which the CLI rejects with exit 2).
 *
 * Why this lives in its own file: keeping the preview-builder happy-
 * path tests + the validation-state tests in one file pushed the file
 * past the project's 500-line cap. Splitting by concern keeps both
 * files focused. Accordion / clipboard-row tests live in
 * `pipelines-page-client-interactions.test.ts`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initPipelinesPage } from '../../../../plugins/deskwork-studio/public/src/pipelines/pipelines-page';
import {
  buildContainer,
  buildNewForm,
  buildEditPanel,
  installClipboardStub,
  inputEvent,
  changeEvent,
} from './test-helpers.ts';

describe('pipelines-page client controller — Copy-button validation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Set-locked sub-form: Copy disables + inline notice surfaces the CLI gate when zero boxes are ticked', async () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'editorial', {
      linearStages: ['Ideas', 'Drafting', 'Final'],
      lockedStages: ['Final'],
      offPipelineStages: [],
    });
    const { calls } = installClipboardStub();
    initPipelinesPage();

    // Uncheck the only ticked box → empty selection.
    const finalCb = panel.querySelector<HTMLInputElement>(
      '[data-pipelines-op-form="set-locked"] input[value="Final"]',
    )!;
    finalCb.checked = false;
    finalCb.dispatchEvent(changeEvent());

    const copy = panel.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="set-locked"]',
    )!;
    expect(copy.disabled).toBe(true);
    expect(copy.getAttribute('aria-disabled')).toBe('true');
    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-pipelines-copy-notice]',
    );
    expect(notice).not.toBeNull();
    expect(notice!.hidden).toBe(false);
    expect(notice!.textContent).toContain(
      'Cannot clear all locked stages via --set-locked',
    );
    expect(notice!.textContent).toContain(
      '.deskwork/pipelines/<id>.json',
    );

    // Defense-in-depth: dispatching a synthetic click on the disabled
    // button must not clipboard the CLI-invalid command.
    copy.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBe(0);

    // Re-tick a box → Copy enables, notice hides, clipboard works.
    finalCb.checked = true;
    finalCb.dispatchEvent(changeEvent());
    expect(copy.disabled).toBe(false);
    expect(copy.hasAttribute('aria-disabled')).toBe(false);
    expect(notice!.hidden).toBe(true);
  });

  // AUDIT-20260530-74 — even when the Copy gate disables paste-out, the
  // live preview for an empty checkbox selection MUST NOT advertise the
  // CLI-refused literal `--set-locked ""` shape (which reads as "this
  // would clear all locks" — exactly the operator misread the audit
  // names). The preview surfaces a `<stages>` placeholder instead,
  // mirroring the New form's `<id>` / `<stages>` placeholder convention
  // for unfilled required fields.
  it('Set-locked sub-form: preview shows <stages> placeholder for empty selection, never --set-locked ""', () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'editorial', {
      linearStages: ['Ideas', 'Drafting', 'Final'],
      lockedStages: ['Final'],
      offPipelineStages: [],
    });
    initPipelinesPage();

    const previewEl = panel.querySelector<HTMLElement>(
      '[data-pipelines-preview="set-locked"]',
    )!;

    // Uncheck the only ticked box → empty selection.
    const finalCb = panel.querySelector<HTMLInputElement>(
      '[data-pipelines-op-form="set-locked"] input[value="Final"]',
    )!;
    finalCb.checked = false;
    finalCb.dispatchEvent(changeEvent());

    // Preview MUST NOT carry the CLI-refused empty-quoted literal.
    expect(previewEl.textContent).not.toContain('--set-locked ""');
    // Preview MUST carry the `<stages>` placeholder so the operator
    // reads "fill this in" rather than "this looks valid".
    expect(previewEl.textContent).toBe(
      '/deskwork:pipeline update "editorial" --set-locked <stages>',
    );

    // Re-tick a box → preview snaps to the real assembled value.
    finalCb.checked = true;
    finalCb.dispatchEvent(changeEvent());
    expect(previewEl.textContent).toBe(
      '/deskwork:pipeline update "editorial" --set-locked "Final"',
    );
  });

  it('Set-off-pipeline sub-form: Copy disables + inline notice surfaces the CLI gate when the field is empty', () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'editorial', {
      linearStages: ['Ideas', 'Final'],
      lockedStages: [],
      offPipelineStages: [],
    });
    initPipelinesPage();

    const copy = panel.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="set-off-pipeline"]',
    )!;
    expect(copy.disabled).toBe(true);
    expect(copy.getAttribute('aria-disabled')).toBe('true');
    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-pipelines-copy-notice]',
    );
    expect(notice).not.toBeNull();
    expect(notice!.hidden).toBe(false);
    expect(notice!.textContent).toContain(
      'Cannot clear all off-pipeline stages via --set-off-pipeline',
    );
  });

  it('New form: Copy disables + inline notice when required fields (id, shape) are empty', async () => {
    const container = buildContainer();
    const form = buildNewForm(container);
    const { calls } = installClipboardStub();
    initPipelinesPage();

    const copy = form.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="new"]',
    )!;
    expect(copy.disabled).toBe(true);
    expect(copy.getAttribute('aria-disabled')).toBe('true');
    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-pipelines-copy-notice]',
    );
    expect(notice).not.toBeNull();
    expect(notice!.hidden).toBe(false);
    expect(notice!.textContent).toContain('Fill required');
    expect(notice!.textContent).toContain('id');
    expect(notice!.textContent).toContain('shape');

    copy.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBe(0);

    // Fill id only → still disabled (shape missing).
    const idInput = form.querySelector<HTMLInputElement>(
      '[data-pipelines-field="new-id"]',
    )!;
    idInput.value = 'mockup';
    idInput.dispatchEvent(inputEvent());
    expect(copy.disabled).toBe(true);
    expect(notice!.textContent).toContain('shape');

    // Fill both → enabled.
    const shapeInput = form.querySelector<HTMLInputElement>(
      '[data-pipelines-field="new-shape"]',
    )!;
    shapeInput.value = 'A,B';
    shapeInput.dispatchEvent(inputEvent());
    expect(copy.disabled).toBe(false);
    expect(notice!.hidden).toBe(true);
  });

  it('Add sub-form: Copy disables + inline notice when stage name is empty', async () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'editorial', {
      linearStages: ['Ideas', 'Final'],
      lockedStages: [],
      offPipelineStages: [],
    });
    const { calls } = installClipboardStub();
    initPipelinesPage();

    const copy = panel.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="add"]',
    )!;
    expect(copy.disabled).toBe(true);
    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-pipelines-copy-notice]',
    );
    expect(notice!.hidden).toBe(false);
    expect(notice!.textContent).toContain('stage name');

    copy.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBe(0);

    const nameInput = panel.querySelector<HTMLInputElement>(
      '[data-pipelines-op-form="add"] [data-pipelines-field="add-name"]',
    )!;
    nameInput.value = 'Review';
    nameInput.dispatchEvent(inputEvent());
    expect(copy.disabled).toBe(false);
    expect(notice!.hidden).toBe(true);
  });

  it('Rename sub-form: Copy disables + inline notice when from OR to is empty', () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'editorial', {
      linearStages: ['Ideas', 'Drafting', 'Final'],
      lockedStages: [],
      offPipelineStages: [],
    });
    initPipelinesPage();

    const copy = panel.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="rename"]',
    )!;
    // Initial: neither from nor to picked.
    expect(copy.disabled).toBe(true);
    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-pipelines-copy-notice]',
    );
    expect(notice!.hidden).toBe(false);
    expect(notice!.textContent).toContain('from');
    expect(notice!.textContent).toContain('to');

    // Fill 'from' only → still disabled.
    const fromSel = panel.querySelector<HTMLSelectElement>(
      '[data-pipelines-op-form="rename"] [data-pipelines-field="rename-from"]',
    )!;
    fromSel.value = 'Drafting';
    fromSel.dispatchEvent(changeEvent());
    expect(copy.disabled).toBe(true);
    expect(notice!.textContent).toContain('to');

    // Fill 'to' → enabled.
    const toInput = panel.querySelector<HTMLInputElement>(
      '[data-pipelines-op-form="rename"] [data-pipelines-field="rename-to"]',
    )!;
    toInput.value = 'Editing';
    toInput.dispatchEvent(inputEvent());
    expect(copy.disabled).toBe(false);
    expect(notice!.hidden).toBe(true);
  });

  it('Remove sub-form: Copy disables + inline notice when no stage is picked', () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'editorial', {
      linearStages: ['Ideas', 'Drafting'],
      lockedStages: [],
      offPipelineStages: [],
    });
    initPipelinesPage();

    const copy = panel.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="remove"]',
    )!;
    expect(copy.disabled).toBe(true);
    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-pipelines-copy-notice]',
    );
    expect(notice!.hidden).toBe(false);
    expect(notice!.textContent).toContain('Pick a stage');

    const sel = panel.querySelector<HTMLSelectElement>(
      '[data-pipelines-op-form="remove"] [data-pipelines-field="remove-name"]',
    )!;
    sel.value = 'Drafting';
    sel.dispatchEvent(changeEvent());
    expect(copy.disabled).toBe(false);
    expect(notice!.hidden).toBe(true);
  });

  // AUDIT-20260529-03 — plugin-preset Edit panels must surface a
  // customize-first gate; the CLI refuses preset mutation, so the
  // studio shouldn't ship a paste that's known to fail.
  it('Edit panel: Copy buttons disabled on plugin presets with customize-first notice', () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'editorial', {
      linearStages: ['Ideas', 'Drafting', 'Final'],
      lockedStages: ['Drafting'],
      offPipelineStages: ['Cancelled'],
    }, { source: 'plugin-preset' });
    installClipboardStub();
    initPipelinesPage();

    for (const op of ['add', 'rename', 'remove', 'set-locked', 'set-off-pipeline']) {
      const copy = panel.querySelector<HTMLButtonElement>(
        `[data-pipelines-copy-button="${op}"]`,
      )!;
      expect(copy.disabled).toBe(true);
      expect(copy.getAttribute('aria-disabled')).toBe('true');
      const notice = copy.parentElement!.querySelector<HTMLElement>(
        '[data-pipelines-copy-notice]',
      );
      expect(notice!.hidden).toBe(false);
      expect(notice!.textContent).toContain('Plugin presets are read-only');
      expect(notice!.textContent).toContain('/deskwork:customize pipeline editorial');
    }
  });

  it('Edit panel: project-override panels keep their normal Copy gating', () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'custom', {
      linearStages: ['Ideas', 'Drafting', 'Final'],
      lockedStages: [],
      offPipelineStages: ['Cancelled'],
    }, { source: 'project-override' });
    installClipboardStub();
    initPipelinesPage();

    // Add panel: empty name → required-field gate (not the preset gate).
    const addCopy = panel.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="add"]',
    )!;
    expect(addCopy.disabled).toBe(true);
    const notice = addCopy.parentElement!.querySelector<HTMLElement>(
      '[data-pipelines-copy-notice]',
    );
    expect(notice!.textContent).not.toContain('Plugin presets are read-only');
    expect(notice!.textContent).toContain('Fill required field');
  });

  // AUDIT-20260529-04 — Copy-builder must reject CLI-invalid values
  // (id charset, position integer, blank-entry comma lists) before
  // emitting the clipboard write.
  it('New form: rejects invalid pipeline id charset', () => {
    const container = buildContainer();
    const form = buildNewForm(container);
    installClipboardStub();
    initPipelinesPage();

    const idInput = form.querySelector<HTMLInputElement>(
      '[data-pipelines-field="new-id"]',
    )!;
    const shapeInput = form.querySelector<HTMLInputElement>(
      '[data-pipelines-field="new-shape"]',
    )!;
    idInput.value = 'Bad Id';
    shapeInput.value = 'Ideas,Drafting,Final';
    idInput.dispatchEvent(inputEvent());
    shapeInput.dispatchEvent(inputEvent());

    const copy = form.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="new"]',
    )!;
    expect(copy.disabled).toBe(true);
    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-pipelines-copy-notice]',
    );
    expect(notice!.textContent).toContain('Invalid pipeline id');
    expect(notice!.textContent).toContain('kebab-case');

    idInput.value = 'my-pipeline';
    idInput.dispatchEvent(inputEvent());
    expect(copy.disabled).toBe(false);
  });

  it('New form: rejects shape with blank stage entries', () => {
    const container = buildContainer();
    const form = buildNewForm(container);
    installClipboardStub();
    initPipelinesPage();

    const idInput = form.querySelector<HTMLInputElement>(
      '[data-pipelines-field="new-id"]',
    )!;
    const shapeInput = form.querySelector<HTMLInputElement>(
      '[data-pipelines-field="new-shape"]',
    )!;
    idInput.value = 'ok';
    shapeInput.value = 'Ideas,,Final';
    idInput.dispatchEvent(inputEvent());
    shapeInput.dispatchEvent(inputEvent());

    const copy = form.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="new"]',
    )!;
    expect(copy.disabled).toBe(true);
    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-pipelines-copy-notice]',
    );
    expect(notice!.textContent).toContain('blank stage');
  });

  it('Add panel: rejects non-integer position', () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'custom', {
      linearStages: ['Ideas', 'Drafting', 'Final'],
      lockedStages: [],
      offPipelineStages: ['Cancelled'],
    }, { source: 'project-override' });
    installClipboardStub();
    initPipelinesPage();

    const nameInput = panel.querySelector<HTMLInputElement>(
      '[data-pipelines-op-form="add"] [data-pipelines-field="add-name"]',
    )!;
    const posInput = panel.querySelector<HTMLInputElement>(
      '[data-pipelines-op-form="add"] [data-pipelines-field="add-position"]',
    )!;
    nameInput.value = 'Review';
    posInput.value = '1.5';
    nameInput.dispatchEvent(inputEvent());
    posInput.dispatchEvent(inputEvent());

    const copy = panel.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="add"]',
    )!;
    expect(copy.disabled).toBe(true);
    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-pipelines-copy-notice]',
    );
    expect(notice!.textContent).toContain('Invalid position');
    expect(notice!.textContent).toContain('non-negative integer');

    posInput.value = '2';
    posInput.dispatchEvent(inputEvent());
    expect(copy.disabled).toBe(false);
  });
});
