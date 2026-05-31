/**
 * @vitest-environment jsdom
 *
 * Client-controller VALIDATION test for `/dev/pipelines` New form,
 * scoped specifically to the AUDIT-20260530-73 contract (cross-model:
 * AUDIT-BARRAGE-codex-P6-2, Task 0.48): the clipboard payload must
 * NEVER contain the placeholder angle-brackets (`<id>`, `<stages>`)
 * the preview renders for empty required fields.
 *
 * The broader Copy-button-disabled / inline-notice behavior is
 * exercised by `pipelines-page-client-validation.test.ts`; this file's
 * job is the narrower "the placeholder never reaches the clipboard"
 * guarantee — both via the disabled attribute (primary gate) and via
 * the click-handler's defense-in-depth refusal (secondary gate that
 * fires if a synthetic dispatch bypasses the disabled state).
 *
 * The previous behavior (pre-Task 0.48 for lanes, pre-AUDIT-29-04 for
 * pipelines) clipboarded the preview verbatim — pasting `<id>` into a
 * shell is shell-injection-grade dangerous.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initPipelinesPage } from '../../../../plugins/deskwork-studio/public/src/pipelines/pipelines-page';
import {
  buildContainer,
  buildNewForm,
  installClipboardStub,
  inputEvent,
} from './test-helpers.ts';

describe('pipelines-page New form — placeholder never reaches clipboard (AUDIT-20260530-73)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('synthetic click on disabled Copy with empty required fields does NOT clipboard the placeholder command', async () => {
    const container = buildContainer();
    const form = buildNewForm(container);
    const { calls } = installClipboardStub();
    initPipelinesPage();

    const copy = form.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="new"]',
    )!;
    // Preview MAY contain the angle-bracket shape (preview-is-shape,
    // copy-is-validated is the contract — see pipelines-builders.ts
    // docblock). The clipboard payload is what this test guards.
    expect(copy.disabled).toBe(true);

    copy.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBe(0);
  });

  it('clipboard payload (after all required fields filled) never contains <id> or <stages> placeholders', async () => {
    const container = buildContainer();
    const form = buildNewForm(container);
    const { calls } = installClipboardStub();
    initPipelinesPage();

    const idInput = form.querySelector<HTMLInputElement>(
      '[data-pipelines-field="new-id"]',
    )!;
    const shapeInput = form.querySelector<HTMLInputElement>(
      '[data-pipelines-field="new-shape"]',
    )!;
    idInput.value = 'mockup';
    shapeInput.value = 'Ideas,Drafting,Final';
    idInput.dispatchEvent(inputEvent());
    shapeInput.dispatchEvent(inputEvent());

    const copy = form.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="new"]',
    )!;
    expect(copy.disabled).toBe(false);

    copy.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBe(1);
    expect(calls[0]).not.toContain('<id>');
    expect(calls[0]).not.toContain('<stages>');
    expect(calls[0]).not.toContain('<name>');
    expect(calls[0]).not.toContain('<path>');
  });

  it('emptying a required field after enable re-disables Copy AND re-gates the clipboard', async () => {
    const container = buildContainer();
    const form = buildNewForm(container);
    const { calls } = installClipboardStub();
    initPipelinesPage();

    const idInput = form.querySelector<HTMLInputElement>(
      '[data-pipelines-field="new-id"]',
    )!;
    const shapeInput = form.querySelector<HTMLInputElement>(
      '[data-pipelines-field="new-shape"]',
    )!;
    idInput.value = 'mockup';
    shapeInput.value = 'Ideas,Drafting,Final';
    idInput.dispatchEvent(inputEvent());
    shapeInput.dispatchEvent(inputEvent());

    const copy = form.querySelector<HTMLButtonElement>(
      '[data-pipelines-copy-button="new"]',
    )!;
    expect(copy.disabled).toBe(false);

    // Clear the id → re-disable.
    idInput.value = '';
    idInput.dispatchEvent(inputEvent());
    expect(copy.disabled).toBe(true);

    // Synthetic click must NOT clipboard the partial-placeholder command.
    copy.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBe(0);
  });
});
