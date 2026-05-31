/**
 * @vitest-environment jsdom
 *
 * Trim-symmetry regression test for the lanes edit-form diff-emit
 * logic. Closes AUDIT-20260530-69 (cross-model:
 * AUDIT-BARRAGE-claude-P6-2).
 *
 * Background: `readFieldValue` runs `.trim()` on the live input value
 * but `readFieldCurrent` previously read `el?.dataset.current` raw.
 * When `data-current` carried surrounding whitespace, an untouched
 * form compared trimmed-live (`"docs"`) against untrimmed-current
 * (`" docs "`); they differed; `buildUpdateCommand` then silently
 * emitted `--content-dir "docs"` though the operator changed nothing
 * — a spurious "normalize" command the operator never intended.
 *
 * Fix: trim BOTH sides before comparison so the diff is apples-to-
 * apples. Normalization-on-save, if desired, must be an explicit
 * operator action; it cannot be a side effect of one-sided trimming.
 *
 * Coverage:
 *   - Positive: live value `"docs"` + `data-current=" docs "`
 *     (whitespace-only delta) yields NO `--content-dir` flag.
 *   - Negative: live value `"new-docs"` + `data-current=" docs "`
 *     (real value change) DOES emit `--content-dir "new-docs"`.
 *   - Mixed: name field unchanged-with-whitespace + contentDir
 *     genuinely changed → only the genuinely-changed flag is emitted.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initLanesPage } from '../../../../plugins/deskwork-studio/public/src/lanes/lanes-page';

function buildContainer(): HTMLElement {
  document.body.innerHTML = '';
  const container = document.createElement('main');
  container.dataset.lanesContainer = '';
  container.dataset.projectKey = 'test-proj';
  document.body.appendChild(container);
  return container;
}

interface FieldSeed {
  readonly liveValue: string;
  readonly dataCurrent: string;
}

/**
 * Build an edit-form row where each field's live value and stored
 * `data-current` can be set independently. The asymmetry between
 * the two is the test fixture for the trim-symmetry contract.
 */
function buildEditFormRow(
  container: HTMLElement,
  laneId: string,
  fields: { readonly name: FieldSeed; readonly template: FieldSeed; readonly contentDir: FieldSeed },
  templates: readonly string[],
): { editRow: HTMLElement; form: HTMLElement; preview: HTMLElement } {
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
  toggleRow.appendChild(actionsCell);
  container.appendChild(toggleRow);

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
  nameInput.dataset.current = fields.name.dataCurrent;
  nameInput.value = fields.name.liveValue;
  form.appendChild(nameInput);

  const select = document.createElement('select');
  select.dataset.lanesField = 'template';
  select.dataset.current = fields.template.dataCurrent;
  // Include the live value as a selectable option so the synthetic
  // <select> can carry it. The trim contract applies to text inputs
  // (name, contentDir) in practice — but reading template through the
  // same path means symmetric handling is required.
  const seenOptions = new Set<string>();
  for (const t of templates) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === fields.template.liveValue) opt.selected = true;
    select.appendChild(opt);
    seenOptions.add(t);
  }
  if (!seenOptions.has(fields.template.liveValue)) {
    const opt = document.createElement('option');
    opt.value = fields.template.liveValue;
    opt.textContent = fields.template.liveValue;
    opt.selected = true;
    select.appendChild(opt);
  }
  form.appendChild(select);

  const contentDirInput = document.createElement('input');
  contentDirInput.dataset.lanesField = 'contentDir';
  contentDirInput.dataset.current = fields.contentDir.dataCurrent;
  contentDirInput.value = fields.contentDir.liveValue;
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

  cell.appendChild(form);
  editRow.appendChild(cell);
  container.appendChild(editRow);

  return { editRow, form, preview };
}

describe('lanes edit-form diff-emit: trim-symmetry contract (AUDIT-20260530-69)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('whitespace-only delta on contentDir does NOT emit --content-dir (both sides trimmed)', () => {
    const container = buildContainer();
    const { preview } = buildEditFormRow(
      container,
      'editorial-lane',
      {
        name: { liveValue: 'Editorial', dataCurrent: 'Editorial' },
        template: { liveValue: 'editorial', dataCurrent: 'editorial' },
        // The bug repros precisely when `data-current` carries
        // surrounding whitespace the live value (already trimmed by
        // the browser on render, or trimmed by readFieldValue) lacks.
        contentDir: { liveValue: 'docs', dataCurrent: ' docs ' },
      },
      ['editorial', 'visual'],
    );
    initLanesPage();

    // No operator interaction yet. The initial preview is built from
    // the form's current state. Pre-fix: the asymmetric trim caused
    // `--content-dir "docs"` to leak into the bare update command.
    // Post-fix: both sides trim to "docs"; no flag emitted.
    expect(preview.textContent).toBe('/deskwork:lane update "editorial-lane"');
    expect(preview.textContent).not.toContain('--content-dir');
  });

  it('whitespace-only delta on name does NOT emit --name', () => {
    const container = buildContainer();
    const { preview } = buildEditFormRow(
      container,
      'editorial-lane',
      {
        name: { liveValue: 'Editorial', dataCurrent: '  Editorial  ' },
        template: { liveValue: 'editorial', dataCurrent: 'editorial' },
        contentDir: { liveValue: 'docs', dataCurrent: 'docs' },
      },
      ['editorial'],
    );
    initLanesPage();

    expect(preview.textContent).toBe('/deskwork:lane update "editorial-lane"');
    expect(preview.textContent).not.toContain('--name');
  });

  it('genuine value change still emits the flag (whitespace on data-current does not mask real diffs)', () => {
    const container = buildContainer();
    const { preview } = buildEditFormRow(
      container,
      'editorial-lane',
      {
        name: { liveValue: 'Editorial', dataCurrent: 'Editorial' },
        template: { liveValue: 'editorial', dataCurrent: 'editorial' },
        // Real change: operator typed `"new-docs"`. The stored value's
        // surrounding whitespace must NOT swallow the diff.
        contentDir: { liveValue: 'new-docs', dataCurrent: ' docs ' },
      },
      ['editorial'],
    );
    initLanesPage();

    expect(preview.textContent).toBe(
      '/deskwork:lane update "editorial-lane" --content-dir "new-docs"',
    );
  });

  it('mixed: one field whitespace-only-delta, one field real change → only the real change emits', () => {
    const container = buildContainer();
    const { preview } = buildEditFormRow(
      container,
      'editorial-lane',
      {
        // Whitespace-only delta — should NOT emit.
        name: { liveValue: 'Editorial', dataCurrent: ' Editorial ' },
        template: { liveValue: 'editorial', dataCurrent: 'editorial' },
        // Real change — should emit.
        contentDir: { liveValue: 'docs-v2', dataCurrent: 'docs' },
      },
      ['editorial'],
    );
    initLanesPage();

    expect(preview.textContent).toBe(
      '/deskwork:lane update "editorial-lane" --content-dir "docs-v2"',
    );
    expect(preview.textContent).not.toContain('--name');
  });
});
