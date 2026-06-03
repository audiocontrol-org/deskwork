/**
 * @vitest-environment jsdom
 *
 * Client-controller VALIDATION test for `/dev/lanes` New form
 * (AUDIT-20260530-73 — cross-model: AUDIT-BARRAGE-codex-P6-2, Task
 * 0.48).
 *
 * The pre-fix bug: the New Lane builder renders placeholders
 * (`<id>`, `<template>`, `<path>`) when required fields are empty,
 * but the Copy handler clipboards that preview verbatim. An operator
 * who clicks Copy on an incomplete form pastes `/deskwork:lane create
 * <id> ...` — an invalid command (and a shell-injection vector if
 * pasted into a terminal, where `<id>` is literally shell-special).
 *
 * The fix mirrors the pattern already in place for `/dev/pipelines`
 * (see `pipelines-page-client-validation.test.ts`): the Copy button
 * is disabled (`disabled` + `aria-disabled="true"`) when required
 * fields are empty, an inline `[data-lanes-copy-notice]` surfaces
 * the reason, and a defense-in-depth click handler refuses to
 * clipboard a known-invalid command even if the disabled attribute
 * is bypassed.
 *
 * Required fields for `/deskwork:lane create <id> --template
 * <template>`: `id`, `template`. Per Phase 39 (sites→lanes retirement)
 * a lane carries no contentDir; the scaffold-default (markdown) and host
 * flags are OPTIONAL (only emitted when filled) per `buildCreateCommand`
 * in `lanes-page.ts`. The `name` flag is likewise optional.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initLanesPage } from '../../../../plugins/deskwork-studio/public/src/lanes/lanes-page';

function buildContainer(): HTMLElement {
  document.body.innerHTML = '';
  const container = document.createElement('main');
  container.dataset.lanesContainer = '';
  container.dataset.projectKey = 'test-proj';
  document.body.appendChild(container);
  return container;
}

function buildNewForm(
  container: HTMLElement,
  templates: readonly string[],
): HTMLElement {
  const form = document.createElement('section');
  form.dataset.lanesNewForm = '';

  const idInput = document.createElement('input');
  idInput.dataset.lanesField = 'id';
  form.appendChild(idInput);
  const nameInput = document.createElement('input');
  nameInput.dataset.lanesField = 'name';
  form.appendChild(nameInput);

  const select = document.createElement('select');
  select.dataset.lanesField = 'template';
  const blank = document.createElement('option');
  blank.value = '';
  select.appendChild(blank);
  for (const t of templates) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  }
  form.appendChild(select);

  const scaffoldMarkdown = document.createElement('input');
  scaffoldMarkdown.dataset.lanesField = 'scaffoldMarkdown';
  form.appendChild(scaffoldMarkdown);
  const host = document.createElement('input');
  host.dataset.lanesField = 'host';
  form.appendChild(host);

  const preview = document.createElement('code');
  preview.dataset.lanesPreview = '';
  form.appendChild(preview);

  // Wrap the copy button + (eventual) notice in a container so the
  // controller can append the notice as a sibling. Matches the
  // actions-block shape rendered server-side.
  const actions = document.createElement('div');
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.dataset.lanesCopyButton = 'new';
  copy.textContent = 'Copy command';
  actions.appendChild(copy);
  form.appendChild(actions);

  container.appendChild(form);
  return form;
}

function installClipboardStub(): { calls: string[] } {
  const calls: string[] = [];
  const clipboardStub = {
    writeText: async (text: string) => {
      calls.push(text);
    },
  };
  Object.defineProperty(navigator, 'clipboard', {
    value: clipboardStub,
    configurable: true,
    writable: false,
  });
  Object.defineProperty(window, 'isSecureContext', {
    value: true,
    configurable: true,
    writable: false,
  });
  return { calls };
}

function inputEvent(): Event {
  return new Event('input', { bubbles: true });
}

function changeEvent(): Event {
  return new Event('change', { bubbles: true });
}

describe('lanes-page client controller — Copy-button validation (AUDIT-20260530-73)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('New form: Copy disables + inline notice when required fields (id, template) are empty', async () => {
    const container = buildContainer();
    const form = buildNewForm(container, ['editorial', 'visual']);
    const { calls } = installClipboardStub();
    initLanesPage();

    const copy = form.querySelector<HTMLButtonElement>(
      '[data-lanes-copy-button="new"]',
    )!;
    expect(copy.disabled).toBe(true);
    expect(copy.getAttribute('aria-disabled')).toBe('true');

    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-lanes-copy-notice]',
    );
    expect(notice).not.toBeNull();
    expect(notice!.hidden).toBe(false);
    // The notice names the missing required fields so the operator
    // knows exactly which inputs to fill. Phase 39: only id + template
    // are required (scaffold default + host are optional).
    expect(notice!.textContent).toContain('Fill required');
    expect(notice!.textContent).toContain('id');
    expect(notice!.textContent).toContain('template');

    // Defense-in-depth: synthetic click on the disabled button must
    // not clipboard the placeholder-bearing command.
    copy.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBe(0);
  });

  it('New form: filling only id leaves Copy disabled (template still required)', () => {
    const container = buildContainer();
    const form = buildNewForm(container, ['editorial', 'visual']);
    initLanesPage();

    const idInput = form.querySelector<HTMLInputElement>(
      '[data-lanes-field="id"]',
    )!;
    idInput.value = 'mockups';
    idInput.dispatchEvent(inputEvent());

    const copy = form.querySelector<HTMLButtonElement>(
      '[data-lanes-copy-button="new"]',
    )!;
    expect(copy.disabled).toBe(true);
    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-lanes-copy-notice]',
    );
    expect(notice!.textContent).toContain('template');
    expect(notice!.textContent).not.toContain(' id ');
  });

  it('New form: filling id + template ENABLES Copy (scaffold default is optional in Phase 39)', () => {
    const container = buildContainer();
    const form = buildNewForm(container, ['editorial', 'visual']);
    initLanesPage();

    const idInput = form.querySelector<HTMLInputElement>(
      '[data-lanes-field="id"]',
    )!;
    idInput.value = 'mockups';
    idInput.dispatchEvent(inputEvent());

    const select = form.querySelector<HTMLSelectElement>(
      '[data-lanes-field="template"]',
    )!;
    select.value = 'visual';
    select.dispatchEvent(changeEvent());

    const copy = form.querySelector<HTMLButtonElement>(
      '[data-lanes-copy-button="new"]',
    )!;
    // Phase 39: a lane carries no contentDir; the scaffold default is
    // optional, so id + template is a complete, valid create command.
    expect(copy.disabled).toBe(false);
    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-lanes-copy-notice]',
    );
    expect(notice!.hidden).toBe(true);
  });

  it('New form: filling required fields + optional scaffold enables Copy + hides notice + clipboard works', async () => {
    const container = buildContainer();
    const form = buildNewForm(container, ['editorial', 'visual']);
    const { calls } = installClipboardStub();
    initLanesPage();

    const idInput = form.querySelector<HTMLInputElement>(
      '[data-lanes-field="id"]',
    )!;
    idInput.value = 'mockups';
    idInput.dispatchEvent(inputEvent());

    const select = form.querySelector<HTMLSelectElement>(
      '[data-lanes-field="template"]',
    )!;
    select.value = 'visual';
    select.dispatchEvent(changeEvent());

    const scaffold = form.querySelector<HTMLInputElement>(
      '[data-lanes-field="scaffoldMarkdown"]',
    )!;
    scaffold.value = 'mockups';
    scaffold.dispatchEvent(inputEvent());

    const copy = form.querySelector<HTMLButtonElement>(
      '[data-lanes-copy-button="new"]',
    )!;
    expect(copy.disabled).toBe(false);
    expect(copy.hasAttribute('aria-disabled')).toBe(false);
    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-lanes-copy-notice]',
    );
    expect(notice!.hidden).toBe(true);

    copy.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain(
      '/deskwork:lane create "mockups" --template "visual" --scaffold-default "markdown=mockups"',
    );
    // The clipboard payload must NEVER contain the placeholder
    // angle-brackets — those are preview-only shape, not valid args.
    expect(calls[0]).not.toContain('<id>');
    expect(calls[0]).not.toContain('<template>');
  });

  it('New form: re-emptying a REQUIRED field after fill re-disables Copy + re-shows notice', () => {
    const container = buildContainer();
    const form = buildNewForm(container, ['editorial', 'visual']);
    initLanesPage();

    const idInput = form.querySelector<HTMLInputElement>(
      '[data-lanes-field="id"]',
    )!;
    idInput.value = 'mockups';
    idInput.dispatchEvent(inputEvent());
    const select = form.querySelector<HTMLSelectElement>(
      '[data-lanes-field="template"]',
    )!;
    select.value = 'visual';
    select.dispatchEvent(changeEvent());

    const copy = form.querySelector<HTMLButtonElement>(
      '[data-lanes-copy-button="new"]',
    )!;
    expect(copy.disabled).toBe(false);

    // Clear the id (a required field) — Copy must re-disable.
    idInput.value = '';
    idInput.dispatchEvent(inputEvent());
    expect(copy.disabled).toBe(true);
    const notice = copy.parentElement!.querySelector<HTMLElement>(
      '[data-lanes-copy-notice]',
    );
    expect(notice!.hidden).toBe(false);
    expect(notice!.textContent).toContain('id');
  });
});
