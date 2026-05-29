/**
 * @vitest-environment jsdom
 *
 * Client-controller preview-building tests for `/dev/pipelines`
 * (Phase 6 Task 6.4).
 *
 * Coverage:
 *   - New form: live preview updates as fields change; Copy button
 *     clipboards the assembled `/deskwork:pipeline create ...` shape.
 *   - `quoteValue` symmetry: values containing spaces, quotes, and
 *     backslashes round-trip through JSON.stringify escaping.
 *   - Add sub-form: preview includes `--position` when set.
 *   - Rename sub-form: composes `--rename-stage <from> --to-stage <to>`.
 *   - Remove sub-form: composes `--remove-stage <name>`.
 *   - Set-locked sub-form: checkboxes feed a comma-separated list,
 *     including the empty-selection "clear all locks" shape.
 *   - Set-off-pipeline sub-form: comma-separated input is quoted as
 *     a single arg.
 *
 * Accordion and clipboard-row tests live in
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

describe('pipelines-page client controller — preview builders', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a no-op when [data-pipelines-container] is absent', () => {
    document.body.innerHTML = '<div>no container</div>';
    expect(() => initPipelinesPage()).not.toThrow();
  });

  it('New form: live preview updates as the operator types', () => {
    const container = buildContainer();
    const form = buildNewForm(container);
    initPipelinesPage();
    const previewEl = form.querySelector<HTMLElement>(
      '[data-pipelines-preview="new"]',
    )!;
    expect(previewEl.textContent).toBe(
      '/deskwork:pipeline create <id> --shape <stages>',
    );

    const idInput = form.querySelector<HTMLInputElement>(
      '[data-pipelines-field="new-id"]',
    )!;
    idInput.value = 'mockup';
    idInput.dispatchEvent(inputEvent());
    expect(previewEl.textContent).toContain('/deskwork:pipeline create "mockup"');

    const shapeInput = form.querySelector<HTMLInputElement>(
      '[data-pipelines-field="new-shape"]',
    )!;
    shapeInput.value = 'Idea,Inked,Final';
    shapeInput.dispatchEvent(inputEvent());
    expect(previewEl.textContent).toContain('--shape "Idea,Inked,Final"');

    const nameInput = form.querySelector<HTMLInputElement>(
      '[data-pipelines-field="new-name"]',
    )!;
    nameInput.value = 'Mockup Workflow';
    nameInput.dispatchEvent(inputEvent());
    expect(previewEl.textContent).toContain('--name "Mockup Workflow"');
  });

  it('New form: copy button clipboards the assembled command', async () => {
    const container = buildContainer();
    const form = buildNewForm(container);
    const { calls } = installClipboardStub();
    initPipelinesPage();

    (form.querySelector<HTMLInputElement>('[data-pipelines-field="new-id"]')!).value = 'mockup';
    (form.querySelector<HTMLInputElement>('[data-pipelines-field="new-shape"]')!).value = 'Idea,Final';
    const copy = form.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="new"]',
    )!;
    copy.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls.length).toBe(1);
    expect(calls[0]).toBe(
      '/deskwork:pipeline create "mockup" --shape "Idea,Final"',
    );
  });

  it('quoteValue symmetry: special characters round-trip through JSON.stringify', async () => {
    const container = buildContainer();
    const form = buildNewForm(container);
    const { calls } = installClipboardStub();
    initPipelinesPage();

    (form.querySelector<HTMLInputElement>('[data-pipelines-field="new-id"]')!).value = 'q-test';
    (form.querySelector<HTMLInputElement>('[data-pipelines-field="new-shape"]')!).value = 'A,B';
    (form.querySelector<HTMLInputElement>('[data-pipelines-field="new-name"]')!).value = 'foo "bar" \\ baz';
    const copy = form.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="new"]',
    )!;
    copy.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls.length).toBe(1);
    const fragment = calls[0].split('--name ')[1];
    expect(typeof JSON.parse(fragment)).toBe('string');
    expect(JSON.parse(fragment)).toBe('foo "bar" \\ baz');
  });

  it('Add sub-form: preview includes --position when set', () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'editorial', {
      linearStages: ['Ideas', 'Drafting', 'Final'],
      lockedStages: ['Final'],
      offPipelineStages: ['Cancelled'],
    });
    initPipelinesPage();
    const previewEl = panel.querySelector<HTMLElement>(
      '[data-pipelines-preview="add"]',
    )!;
    expect(previewEl.textContent).toBe(
      '/deskwork:pipeline update "editorial" --add-stage <name>',
    );

    const nameInput = panel.querySelector<HTMLInputElement>(
      '[data-pipelines-op-form="add"] [data-pipelines-field="add-name"]',
    )!;
    nameInput.value = 'Review';
    nameInput.dispatchEvent(inputEvent());
    expect(previewEl.textContent).toBe(
      '/deskwork:pipeline update "editorial" --add-stage "Review"',
    );

    const posInput = panel.querySelector<HTMLInputElement>(
      '[data-pipelines-op-form="add"] [data-pipelines-field="add-position"]',
    )!;
    posInput.value = '2';
    posInput.dispatchEvent(inputEvent());
    expect(previewEl.textContent).toBe(
      '/deskwork:pipeline update "editorial" --add-stage "Review" --position 2',
    );
  });

  it('Rename sub-form: preview composes --rename-stage <from> --to-stage <to>', () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'editorial', {
      linearStages: ['Ideas', 'Drafting', 'Final'],
      lockedStages: ['Final'],
      offPipelineStages: ['Cancelled'],
    });
    initPipelinesPage();

    const fromSel = panel.querySelector<HTMLSelectElement>(
      '[data-pipelines-op-form="rename"] [data-pipelines-field="rename-from"]',
    )!;
    fromSel.value = 'Drafting';
    fromSel.dispatchEvent(changeEvent());
    const toInput = panel.querySelector<HTMLInputElement>(
      '[data-pipelines-op-form="rename"] [data-pipelines-field="rename-to"]',
    )!;
    toInput.value = 'Editing';
    toInput.dispatchEvent(inputEvent());

    const previewEl = panel.querySelector<HTMLElement>(
      '[data-pipelines-preview="rename"]',
    )!;
    expect(previewEl.textContent).toBe(
      '/deskwork:pipeline update "editorial" --rename-stage "Drafting" --to-stage "Editing"',
    );
  });

  it('Remove sub-form: preview includes --remove-stage <name>', () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'editorial', {
      linearStages: ['Ideas', 'Drafting'],
      lockedStages: [],
      offPipelineStages: ['Cancelled'],
    });
    initPipelinesPage();

    const sel = panel.querySelector<HTMLSelectElement>(
      '[data-pipelines-op-form="remove"] [data-pipelines-field="remove-name"]',
    )!;
    sel.value = 'Drafting';
    sel.dispatchEvent(changeEvent());

    const previewEl = panel.querySelector<HTMLElement>(
      '[data-pipelines-preview="remove"]',
    )!;
    expect(previewEl.textContent).toBe(
      '/deskwork:pipeline update "editorial" --remove-stage "Drafting"',
    );
  });

  it('Set-locked sub-form: checkbox selections feed a comma-separated list', () => {
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
    expect(previewEl.textContent).toBe(
      '/deskwork:pipeline update "editorial" --set-locked "Final"',
    );

    const drafting = panel.querySelector<HTMLInputElement>(
      '[data-pipelines-op-form="set-locked"] input[value="Drafting"]',
    )!;
    drafting.checked = true;
    drafting.dispatchEvent(changeEvent());
    expect(previewEl.textContent).toBe(
      '/deskwork:pipeline update "editorial" --set-locked "Drafting,Final"',
    );

    const finalCb = panel.querySelector<HTMLInputElement>(
      '[data-pipelines-op-form="set-locked"] input[value="Final"]',
    )!;
    drafting.checked = false;
    drafting.dispatchEvent(changeEvent());
    finalCb.checked = false;
    finalCb.dispatchEvent(changeEvent());
    expect(previewEl.textContent).toBe(
      '/deskwork:pipeline update "editorial" --set-locked ""',
    );
  });

  it('Set-off-pipeline sub-form: comma-separated input is quoted as a single arg', () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'editorial', {
      linearStages: ['Ideas', 'Final'],
      lockedStages: [],
      offPipelineStages: ['Cancelled'],
    });
    initPipelinesPage();
    const previewEl = panel.querySelector<HTMLElement>(
      '[data-pipelines-preview="set-off-pipeline"]',
    )!;
    expect(previewEl.textContent).toBe(
      '/deskwork:pipeline update "editorial" --set-off-pipeline "Cancelled"',
    );

    const inputEl = panel.querySelector<HTMLInputElement>(
      '[data-pipelines-op-form="set-off-pipeline"] [data-pipelines-field="set-off-pipeline"]',
    )!;
    inputEl.value = 'Blocked,Cancelled';
    inputEl.dispatchEvent(inputEvent());
    expect(previewEl.textContent).toBe(
      '/deskwork:pipeline update "editorial" --set-off-pipeline "Blocked,Cancelled"',
    );
  });
});
