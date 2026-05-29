/**
 * Shared DOM builders for `/dev/pipelines` client-controller tests.
 *
 * The two client tests (preview builders + accordion/clipboard) both
 * need to assemble miniature page fixtures: containers, new form,
 * per-template edit panels with the 5 sub-operations, per-row toggle
 * buttons. Extracting the builders here keeps each test file under
 * the project's 500-line guidance and prevents drift between the two
 * fixtures.
 *
 * The helpers ONLY assemble DOM nodes that mirror what the server-
 * side renderer emits in `packages/studio/src/pages/pipelines/`. No
 * mocking, no stubbing of the controller under test.
 */

export function buildContainer(): HTMLElement {
  document.body.innerHTML = '';
  const container = document.createElement('main');
  container.dataset.pipelinesContainer = '';
  document.body.appendChild(container);
  return container;
}

export function buildInput(
  name: string,
  opts: { readonly type?: string } = {},
): HTMLInputElement {
  const el = document.createElement('input');
  el.type = opts.type ?? 'text';
  el.dataset.pipelinesField = name;
  return el;
}

export function buildPreview(scope: string, pipelineId?: string): HTMLElement {
  const el = document.createElement('code');
  el.dataset.pipelinesPreview = scope;
  if (pipelineId !== undefined) el.dataset.pipelineId = pipelineId;
  return el;
}

export function buildButton(
  scope: string,
  pipelineId?: string,
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.dataset.pipelinesCopyButton = scope;
  if (pipelineId !== undefined) el.dataset.pipelineId = pipelineId;
  el.textContent = 'Copy command';
  return el;
}

export function buildNewForm(container: HTMLElement): HTMLElement {
  const form = document.createElement('section');
  form.dataset.pipelinesNewForm = '';
  form.appendChild(buildInput('new-id'));
  form.appendChild(buildInput('new-shape'));
  form.appendChild(buildInput('new-name'));
  form.appendChild(buildInput('new-description'));
  form.appendChild(buildPreview('new'));
  form.appendChild(buildButton('new'));
  container.appendChild(form);
  return form;
}

interface EditPanelInput {
  readonly linearStages: readonly string[];
  readonly lockedStages: readonly string[];
  readonly offPipelineStages: readonly string[];
}

export interface EditPanel {
  readonly panel: HTMLElement;
}

function buildAddDetails(pipelineId: string): HTMLDetailsElement {
  const details = document.createElement('details');
  details.dataset.pipelinesOp = 'add';
  const body = document.createElement('div');
  body.dataset.pipelinesOpForm = 'add';
  body.dataset.pipelineId = pipelineId;
  body.appendChild(buildInput('add-name'));
  body.appendChild(buildInput('add-position', { type: 'number' }));
  body.appendChild(buildPreview('add', pipelineId));
  body.appendChild(buildButton('add', pipelineId));
  details.appendChild(body);
  return details;
}

function appendStageOptions(
  select: HTMLSelectElement,
  stages: readonly string[],
): void {
  for (const s of stages) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  }
}

function buildRenameDetails(
  pipelineId: string,
  current: EditPanelInput,
): HTMLDetailsElement {
  const details = document.createElement('details');
  details.dataset.pipelinesOp = 'rename';
  const body = document.createElement('div');
  body.dataset.pipelinesOpForm = 'rename';
  body.dataset.pipelineId = pipelineId;
  const fromSelect = document.createElement('select');
  fromSelect.dataset.pipelinesField = 'rename-from';
  appendStageOptions(fromSelect, [
    ...current.linearStages,
    ...current.offPipelineStages,
  ]);
  body.appendChild(fromSelect);
  body.appendChild(buildInput('rename-to'));
  body.appendChild(buildPreview('rename', pipelineId));
  body.appendChild(buildButton('rename', pipelineId));
  details.appendChild(body);
  return details;
}

function buildRemoveDetails(
  pipelineId: string,
  current: EditPanelInput,
): HTMLDetailsElement {
  const details = document.createElement('details');
  details.dataset.pipelinesOp = 'remove';
  const body = document.createElement('div');
  body.dataset.pipelinesOpForm = 'remove';
  body.dataset.pipelineId = pipelineId;
  const select = document.createElement('select');
  select.dataset.pipelinesField = 'remove-name';
  appendStageOptions(select, [
    ...current.linearStages,
    ...current.offPipelineStages,
  ]);
  body.appendChild(select);
  body.appendChild(buildPreview('remove', pipelineId));
  body.appendChild(buildButton('remove', pipelineId));
  details.appendChild(body);
  return details;
}

function buildSetLockedDetails(
  pipelineId: string,
  current: EditPanelInput,
): HTMLDetailsElement {
  const details = document.createElement('details');
  details.dataset.pipelinesOp = 'set-locked';
  const body = document.createElement('div');
  body.dataset.pipelinesOpForm = 'set-locked';
  body.dataset.pipelineId = pipelineId;
  const lockedSet = new Set(current.lockedStages);
  for (const s of current.linearStages) {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.pipelinesField = 'set-locked';
    cb.value = s;
    cb.checked = lockedSet.has(s);
    body.appendChild(cb);
  }
  body.appendChild(buildPreview('set-locked', pipelineId));
  body.appendChild(buildButton('set-locked', pipelineId));
  details.appendChild(body);
  return details;
}

function buildSetOffDetails(
  pipelineId: string,
  current: EditPanelInput,
): HTMLDetailsElement {
  const details = document.createElement('details');
  details.dataset.pipelinesOp = 'set-off-pipeline';
  const body = document.createElement('div');
  body.dataset.pipelinesOpForm = 'set-off-pipeline';
  body.dataset.pipelineId = pipelineId;
  const offInput = buildInput('set-off-pipeline');
  offInput.value = current.offPipelineStages.join(',');
  body.appendChild(offInput);
  body.appendChild(buildPreview('set-off-pipeline', pipelineId));
  body.appendChild(buildButton('set-off-pipeline', pipelineId));
  details.appendChild(body);
  return details;
}

export function buildEditPanel(
  container: HTMLElement,
  pipelineId: string,
  current: EditPanelInput,
): EditPanel {
  const panel = document.createElement('section');
  panel.dataset.pipelinesEditPanel = '';
  panel.dataset.pipelineId = pipelineId;
  panel.appendChild(buildAddDetails(pipelineId));
  panel.appendChild(buildRenameDetails(pipelineId, current));
  panel.appendChild(buildRemoveDetails(pipelineId, current));
  panel.appendChild(buildSetLockedDetails(pipelineId, current));
  panel.appendChild(buildSetOffDetails(pipelineId, current));
  container.appendChild(panel);
  return { panel };
}

export interface RowFixture {
  readonly toggleView: HTMLButtonElement;
  readonly toggleEdit: HTMLButtonElement;
  readonly viewRow: HTMLElement;
  readonly editRow: HTMLElement;
  readonly deleteBtn: HTMLButtonElement | undefined;
}

export function buildRow(
  container: HTMLElement,
  pipelineId: string,
  opts: { readonly withDelete?: boolean } = {},
): RowFixture {
  const toggleRow = document.createElement('tr');
  toggleRow.dataset.pipelineRow = '';
  toggleRow.dataset.pipelineId = pipelineId;
  const cell = document.createElement('td');

  const toggleView = document.createElement('button');
  toggleView.type = 'button';
  toggleView.dataset.pipelineViewToggle = '';
  toggleView.dataset.pipelineId = pipelineId;
  toggleView.setAttribute('aria-expanded', 'false');
  cell.appendChild(toggleView);

  const toggleEdit = document.createElement('button');
  toggleEdit.type = 'button';
  toggleEdit.dataset.pipelineEditToggle = '';
  toggleEdit.dataset.pipelineId = pipelineId;
  toggleEdit.setAttribute('aria-expanded', 'false');
  cell.appendChild(toggleEdit);

  let deleteBtn: HTMLButtonElement | undefined;
  if (opts.withDelete === true) {
    deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.dataset.pipelineCopy = '';
    deleteBtn.dataset.copy = `/deskwork:pipeline delete ${pipelineId}`;
    cell.appendChild(deleteBtn);
  }

  toggleRow.appendChild(cell);
  container.appendChild(toggleRow);

  const viewRow = document.createElement('tr');
  viewRow.dataset.pipelineViewRow = '';
  viewRow.dataset.pipelineId = pipelineId;
  viewRow.hidden = true;
  container.appendChild(viewRow);

  const editRow = document.createElement('tr');
  editRow.dataset.pipelineEditRow = '';
  editRow.dataset.pipelineId = pipelineId;
  editRow.hidden = true;
  container.appendChild(editRow);

  return { toggleView, toggleEdit, viewRow, editRow, deleteBtn };
}

export function installClipboardStub(): { calls: string[] } {
  const calls: string[] = [];
  const stub = {
    writeText: async (text: string) => {
      calls.push(text);
    },
  };
  Object.defineProperty(navigator, 'clipboard', {
    value: stub,
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

export function inputEvent(): Event {
  return new Event('input', { bubbles: true });
}

export function changeEvent(): Event {
  return new Event('change', { bubbles: true });
}
