/**
 * @vitest-environment jsdom
 *
 * Client-controller tests for the `/dev/lanes` page (Phase 6 Task
 * 6.3).
 *
 * Coverage:
 *   - New form: editing fields rebuilds the slash-command preview
 *     live.
 *   - New form: copy button calls navigator.clipboard.writeText with
 *     the assembled `/deskwork:lane create ...` command.
 *   - Edit form: only changed fields appear in the
 *     `/deskwork:lane update ...` command.
 *   - Edit form: untouched form copies a bare `/deskwork:lane update
 *     <id>` (no flags) — the CLI rejects this; the studio's job is
 *     to surface the no-op shape so the operator sees the gate.
 *   - Edit toggle: clicking Edit reveals the hidden form row +
 *     flips aria-expanded; clicking Close hides it again.
 *   - Row Archive button: clicking copies the `/deskwork:lane archive
 *     <id>` command from the button's data-copy attribute.
 *   - Missing container: initLanesPage is a no-op (no throws) when
 *     `[data-lanes-container]` is absent.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initLanesPage } from '../../../../plugins/deskwork-studio/public/src/lanes/lanes-page';

/**
 * Build a synthetic lanes container that mirrors what the server
 * renders. Per AUDIT-20260530-68 (fixed in Task 0.43): the server
 * emits `data-project-key="<sha1-12 of projectRoot>"` on the lanes
 * container so the client's `resolveProjectKey` returns a stable
 * per-project namespace for localStorage. The fixture builder MUST
 * include the attribute by default — earlier versions of these tests
 * set `container.dataset.projectKey` by hand inside individual
 * archived-section cases, which masked the missing-from-server bug
 * the audit finding flagged (the TDD-blind-spot pattern).
 */
function buildContainer(): HTMLElement {
  document.body.innerHTML = '';
  const container = document.createElement('main');
  container.dataset.lanesContainer = '';
  container.dataset.projectKey = 'test-proj';
  document.body.appendChild(container);
  return container;
}

function buildNewForm(container: HTMLElement, templates: readonly string[]): HTMLElement {
  const form = document.createElement('section');
  form.dataset.lanesNewForm = '';

  // id
  const idInput = document.createElement('input');
  idInput.dataset.lanesField = 'id';
  form.appendChild(idInput);
  // name
  const nameInput = document.createElement('input');
  nameInput.dataset.lanesField = 'name';
  form.appendChild(nameInput);
  // template
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
  // contentDir
  const contentDir = document.createElement('input');
  contentDir.dataset.lanesField = 'contentDir';
  form.appendChild(contentDir);
  // preview + copy
  const preview = document.createElement('code');
  preview.dataset.lanesPreview = '';
  form.appendChild(preview);
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.dataset.lanesCopyButton = 'new';
  copy.textContent = 'Copy command';
  form.appendChild(copy);

  container.appendChild(form);
  return form;
}

function buildEditFormRow(
  container: HTMLElement,
  laneId: string,
  current: { name: string; template: string; contentDir: string },
  templates: readonly string[],
): { toggleRow: HTMLElement; editRow: HTMLElement; toggle: HTMLButtonElement; form: HTMLElement } {
  // Toggle row
  const toggleRow = document.createElement('tr');
  toggleRow.dataset.laneRow = '';
  toggleRow.dataset.laneId = laneId;
  const actionsCell = document.createElement('td');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.laneEditToggle = '';
  toggle.dataset.laneId = laneId;
  toggle.setAttribute('aria-expanded', 'false');
  actionsCell.appendChild(toggle);

  // Archive button (carries data-lane-copy)
  const archiveBtn = document.createElement('button');
  archiveBtn.type = 'button';
  archiveBtn.dataset.laneCopy = '';
  archiveBtn.dataset.copy = `/deskwork:lane archive ${laneId}`;
  archiveBtn.textContent = 'Archive';
  actionsCell.appendChild(archiveBtn);
  toggleRow.appendChild(actionsCell);
  container.appendChild(toggleRow);

  // Edit form row (hidden)
  const editRow = document.createElement('tr');
  editRow.dataset.laneEditRow = '';
  editRow.dataset.laneId = laneId;
  editRow.hidden = true;
  const cell = document.createElement('td');
  const form = document.createElement('section');
  form.dataset.lanesEditForm = '';
  form.dataset.laneId = laneId;

  const nameInput = document.createElement('input');
  nameInput.dataset.lanesField = 'name';
  nameInput.dataset.current = current.name;
  nameInput.value = current.name;
  form.appendChild(nameInput);

  const select = document.createElement('select');
  select.dataset.lanesField = 'template';
  select.dataset.current = current.template;
  for (const t of templates) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === current.template) opt.selected = true;
    select.appendChild(opt);
  }
  form.appendChild(select);

  const contentDirInput = document.createElement('input');
  contentDirInput.dataset.lanesField = 'contentDir';
  contentDirInput.dataset.current = current.contentDir;
  contentDirInput.value = current.contentDir;
  form.appendChild(contentDirInput);

  const preview = document.createElement('code');
  preview.dataset.lanesPreview = '';
  preview.dataset.laneId = laneId;
  form.appendChild(preview);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.dataset.lanesCopyButton = 'edit';
  copy.dataset.laneId = laneId;
  copy.textContent = 'Copy command';
  form.appendChild(copy);

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.dataset.laneEditCancel = '';
  cancel.dataset.laneId = laneId;
  cancel.textContent = 'Close';
  form.appendChild(cancel);

  cell.appendChild(form);
  editRow.appendChild(cell);
  container.appendChild(editRow);

  return { toggleRow, editRow, toggle, form };
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
  const ev = new Event('input', { bubbles: true });
  return ev;
}

function changeEvent(): Event {
  const ev = new Event('change', { bubbles: true });
  return ev;
}

describe('lanes-page client controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a no-op when [data-lanes-container] is absent', () => {
    document.body.innerHTML = '<div>no container</div>';
    expect(() => initLanesPage()).not.toThrow();
  });

  it('New form: live-updates the slash-command preview on input', () => {
    const container = buildContainer();
    buildNewForm(container, ['editorial', 'visual']);
    initLanesPage();
    const preview = container.querySelector<HTMLElement>('[data-lanes-preview]')!;

    // Initial preview is the placeholder shape (no values yet)
    expect(preview.textContent).toMatch(/^\/deskwork:lane create <id>/);

    // Every operator-supplied value is JSON-stringified into the
    // command (quoted symmetrically across id / name / template /
    // contentDir). Placeholders stay un-quoted angle-brackets.
    const idInput = container.querySelector<HTMLInputElement>('[data-lanes-field="id"]')!;
    idInput.value = 'mockups';
    idInput.dispatchEvent(inputEvent());
    expect(preview.textContent).toContain('/deskwork:lane create "mockups"');

    const select = container.querySelector<HTMLSelectElement>('[data-lanes-field="template"]')!;
    select.value = 'visual';
    select.dispatchEvent(changeEvent());
    expect(preview.textContent).toContain('--template "visual"');

    const contentDir = container.querySelector<HTMLInputElement>('[data-lanes-field="contentDir"]')!;
    contentDir.value = 'mockups';
    contentDir.dispatchEvent(inputEvent());
    expect(preview.textContent).toContain('--content-dir "mockups"');

    // Optional name appears only when filled
    expect(preview.textContent).not.toContain('--name');
    const name = container.querySelector<HTMLInputElement>('[data-lanes-field="name"]')!;
    name.value = 'Mockup Lane';
    name.dispatchEvent(inputEvent());
    expect(preview.textContent).toContain('--name "Mockup Lane"');
  });

  it('New form: copy button writes the assembled slash command to the clipboard', async () => {
    const container = buildContainer();
    const form = buildNewForm(container, ['editorial', 'visual']);
    const { calls } = installClipboardStub();
    initLanesPage();

    // Per AUDIT-20260530-73 (Task 0.48): each required-field set MUST
    // dispatch an `input` (or `change` for <select>) event so the
    // controller's rebuild fires and the Copy button transitions from
    // disabled (initial state with empty required fields) to enabled.
    // Pre-fix, the Copy button was always enabled regardless of
    // validity — that was the bug.
    const idInput = container.querySelector<HTMLInputElement>('[data-lanes-field="id"]')!;
    idInput.value = 'mockups';
    idInput.dispatchEvent(inputEvent());
    const select = container.querySelector<HTMLSelectElement>('[data-lanes-field="template"]')!;
    select.value = 'visual';
    select.dispatchEvent(changeEvent());
    const contentDir = container.querySelector<HTMLInputElement>('[data-lanes-field="contentDir"]')!;
    contentDir.value = 'mockups';
    contentDir.dispatchEvent(inputEvent());

    const copy = form.querySelector<HTMLButtonElement>('[data-lanes-copy-button="new"]')!;
    expect(copy.disabled).toBe(false);
    copy.click();
    // Allow the async copyAndFlash to flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(calls.length).toBe(1);
    expect(calls[0]).toContain(
      '/deskwork:lane create "mockups" --template "visual" --content-dir "mockups"',
    );
  });

  it('Edit form: only changed fields appear in the update command', () => {
    const container = buildContainer();
    buildEditFormRow(
      container,
      'editorial-lane',
      { name: 'Editorial', template: 'editorial', contentDir: 'docs' },
      ['editorial', 'visual'],
    );
    initLanesPage();

    const preview = container.querySelector<HTMLElement>(
      '[data-lanes-preview][data-lane-id="editorial-lane"]',
    )!;
    // No changes yet → bare update shape. Lane id is JSON-stringified
    // for symmetry with the value flags.
    expect(preview.textContent).toBe('/deskwork:lane update "editorial-lane"');

    // Change contentDir only — its flag value is quoted symmetrically
    // with name (per the slash-command quoting convention).
    const contentDir = container.querySelector<HTMLInputElement>(
      '[data-lanes-edit-form][data-lane-id="editorial-lane"] [data-lanes-field="contentDir"]',
    )!;
    contentDir.value = 'docs-new';
    contentDir.dispatchEvent(inputEvent());
    expect(preview.textContent).toBe(
      '/deskwork:lane update "editorial-lane" --content-dir "docs-new"',
    );

    // Also change name
    const name = container.querySelector<HTMLInputElement>(
      '[data-lanes-edit-form][data-lane-id="editorial-lane"] [data-lanes-field="name"]',
    )!;
    name.value = 'Edit Lane';
    name.dispatchEvent(inputEvent());
    expect(preview.textContent).toContain('--name "Edit Lane"');
    expect(preview.textContent).toContain('--content-dir "docs-new"');
  });

  it('Edit toggle reveals + hides the hidden edit row + flips aria-expanded', () => {
    const container = buildContainer();
    const { toggle, editRow } = buildEditFormRow(
      container,
      'editorial-lane',
      { name: 'Editorial', template: 'editorial', contentDir: 'docs' },
      ['editorial'],
    );
    initLanesPage();

    expect(editRow.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    expect(editRow.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    expect(editRow.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('Cancel button hides the edit form + resets the toggle aria state', () => {
    const container = buildContainer();
    const { toggle, editRow, form } = buildEditFormRow(
      container,
      'editorial-lane',
      { name: 'Editorial', template: 'editorial', contentDir: 'docs' },
      ['editorial'],
    );
    initLanesPage();

    toggle.click();
    expect(editRow.hidden).toBe(false);

    const cancel = form.querySelector<HTMLButtonElement>('[data-lane-edit-cancel]')!;
    cancel.click();
    expect(editRow.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('Edit form: cleared fields are NOT emitted as --flag "" (blank-clear is a no-op for diff emit)', () => {
    const container = buildContainer();
    buildEditFormRow(
      container,
      'editorial-lane',
      { name: 'Editorial', template: 'editorial', contentDir: 'docs' },
      ['editorial', 'visual'],
    );
    initLanesPage();
    const preview = container.querySelector<HTMLElement>(
      '[data-lanes-preview][data-lane-id="editorial-lane"]',
    )!;

    // Clear the name — should NOT emit `--name ""`.
    const name = container.querySelector<HTMLInputElement>(
      '[data-lanes-edit-form][data-lane-id="editorial-lane"] [data-lanes-field="name"]',
    )!;
    name.value = '';
    name.dispatchEvent(inputEvent());
    expect(preview.textContent).toBe('/deskwork:lane update "editorial-lane"');
    expect(preview.textContent).not.toContain('--name');

    // Clear the contentDir — same, no `--content-dir ""`.
    const contentDir = container.querySelector<HTMLInputElement>(
      '[data-lanes-edit-form][data-lane-id="editorial-lane"] [data-lanes-field="contentDir"]',
    )!;
    contentDir.value = '';
    contentDir.dispatchEvent(inputEvent());
    expect(preview.textContent).toBe('/deskwork:lane update "editorial-lane"');
    expect(preview.textContent).not.toContain('--content-dir');
  });

  it('Edit toggle: single-open accordion — opening row B closes row A', () => {
    const container = buildContainer();
    const a = buildEditFormRow(
      container,
      'lane-a',
      { name: 'A', template: 'editorial', contentDir: 'docs-a' },
      ['editorial'],
    );
    const b = buildEditFormRow(
      container,
      'lane-b',
      { name: 'B', template: 'editorial', contentDir: 'docs-b' },
      ['editorial'],
    );
    initLanesPage();

    // Open A
    a.toggle.click();
    expect(a.editRow.hidden).toBe(false);
    expect(a.toggle.getAttribute('aria-expanded')).toBe('true');
    expect(b.editRow.hidden).toBe(true);

    // Open B — A should close automatically
    b.toggle.click();
    expect(b.editRow.hidden).toBe(false);
    expect(b.toggle.getAttribute('aria-expanded')).toBe('true');
    expect(a.editRow.hidden).toBe(true);
    expect(a.toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('row Archive button clipboards the slash command from data-copy', async () => {
    const container = buildContainer();
    buildEditFormRow(
      container,
      'editorial-lane',
      { name: 'Editorial', template: 'editorial', contentDir: 'docs' },
      ['editorial'],
    );
    const { calls } = installClipboardStub();
    initLanesPage();

    const archiveBtn = container.querySelector<HTMLButtonElement>('[data-lane-copy]')!;
    archiveBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls.length).toBe(1);
    expect(calls[0]).toBe('/deskwork:lane archive editorial-lane');
  });

  it('archived section: toggle event persists open state to localStorage (project-scoped)', () => {
    // `buildContainer` already mirrors the server-emitted
    // `data-project-key="test-proj"`. Per AUDIT-20260530-68 fix, the
    // fixture matches the production markup — no per-test injection.
    const container = buildContainer();

    // Build a <details> archived section
    const section = document.createElement('section');
    const details = document.createElement('details');
    details.dataset.lanesArchivedDetails = '';
    const summary = document.createElement('summary');
    summary.textContent = 'Archived lanes';
    details.appendChild(summary);
    section.appendChild(details);
    container.appendChild(section);

    window.localStorage.clear();
    initLanesPage();

    // Open the details (which fires `toggle`)
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    expect(window.localStorage.getItem('deskwork:lanes:test-proj:archived-open')).toBe('true');

    // Close again
    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    expect(window.localStorage.getItem('deskwork:lanes:test-proj:archived-open')).toBe('false');
  });

  it('archived section: stored open=true is restored on init', () => {
    // Same: `buildContainer` carries the server-mirrored attribute.
    const container = buildContainer();

    const section = document.createElement('section');
    const details = document.createElement('details');
    details.dataset.lanesArchivedDetails = '';
    const summary = document.createElement('summary');
    summary.textContent = 'Archived lanes';
    details.appendChild(summary);
    section.appendChild(details);
    container.appendChild(section);

    // Section was server-rendered closed; storage says it should
    // be open from a previous session.
    expect(details.open).toBe(false);
    window.localStorage.setItem('deskwork:lanes:test-proj:archived-open', 'true');

    initLanesPage();
    expect(details.open).toBe(true);
  });

  it('empty-state CTA: click focuses the New Lane id field (overrides anchor scroll)', () => {
    const container = buildContainer();

    // Build the New Lane form (so the focus target exists)
    buildNewForm(container, ['editorial']);

    // Build the empty-state CTA
    const empty = document.createElement('div');
    empty.dataset.lanesEmpty = '';
    const cta = document.createElement('a');
    cta.href = '#lanes-new-form-heading';
    cta.dataset.lanesCtaFocus = '';
    cta.textContent = 'Create your first lane';
    empty.appendChild(cta);
    container.appendChild(empty);

    initLanesPage();

    // Click the CTA: default should be prevented + focus should
    // move to the id field
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    cta.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const idInput = container.querySelector<HTMLInputElement>(
      '[data-lanes-new-form] [data-lanes-field="id"]',
    )!;
    expect(document.activeElement).toBe(idInput);
  });
});
