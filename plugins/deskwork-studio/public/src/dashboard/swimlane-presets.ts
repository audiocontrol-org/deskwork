/**
 * Saveable focus presets controller — Phase 5 Task 5.5.
 *
 * Thin DOM-binding layer for the preset save / load / delete
 * affordances. All store-side semantics (read, write, snapshot,
 * apply, list) live in the sibling `swimlane-presets-store.ts` so
 * this file stays focused on the click-handler contract + the
 * surface inside the rail head.
 *
 * Affordance placement (per `.claude/rules/affordance-placement.md`):
 * the Save + Load + Delete controls live INSIDE the rail head — the
 * "Lanes" head at the top of `.lane-rail`. They are not surfaced in
 * the page-level masthead because the affordances control rail-and-
 * bay state, not page-wide state. Component-attached, not toolbar-
 * attached.
 *
 * Deep-link URL pattern: `/dev/editorial-studio?preset=<id>` reads
 * the preset id from `window.location.search` on init and applies
 * the preset to the four state axes after the constituent
 * controllers have wired themselves. The reapply functions are no-
 * ops until each constituent controller's `init*` fires, which is
 * why `initSwimlanePresets` is invoked last in the editorial-
 * studio-client.ts dispatch order.
 *
 * Per THESIS Consequence 2 (no sidecar mutation): preset state is
 * pure client-side localStorage — see `swimlane-presets-store.ts`
 * for the canonical reasoning.
 */

import {
  resolveProjectKey,
} from './swimlane-storage.ts';
import {
  type FocusPreset,
  applyPreset,
  deletePreset,
  listPresets,
  parsePresetIdFromUrl,
  readPresets,
  savePresetFromCurrent,
} from './swimlane-presets-store.ts';

export type { FocusPreset };
export {
  applyPreset,
  deletePreset,
  listPresets,
  readPresets,
  savePresetFromCurrent,
} from './swimlane-presets-store.ts';

/**
 * Render the saved-preset list surface inside the rail head. Called
 * after every save / delete to refresh the surface. The chip carries
 * a `data-preset-load` attribute the click handler resolves into a
 * preset id; the chip's `data-preset-delete` sibling button triggers
 * removal.
 */
function renderPresetList(
  container: HTMLElement,
  projectKey: string,
): void {
  container.textContent = '';
  const presets = listPresets(projectKey);
  if (presets.length === 0) {
    const empty = document.createElement('span');
    empty.classList.add('preset-empty');
    empty.textContent = 'No saved presets';
    container.appendChild(empty);
    return;
  }
  for (const preset of presets) {
    const row = document.createElement('div');
    row.classList.add('preset-row');
    row.dataset.presetRow = preset.id;

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.classList.add('preset-load');
    loadBtn.dataset.presetLoad = preset.id;
    loadBtn.setAttribute('aria-label', `Load preset ${preset.name}`);
    loadBtn.textContent = preset.name;
    row.appendChild(loadBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.classList.add('preset-delete');
    deleteBtn.dataset.presetDelete = preset.id;
    deleteBtn.setAttribute('aria-label', `Delete preset ${preset.name}`);
    deleteBtn.textContent = '×';
    row.appendChild(deleteBtn);

    container.appendChild(row);
  }
}

/**
 * Flash the Save button green for ~1.4s to confirm a successful
 * save. The class is removed by a `setTimeout`; if the operator
 * clicks Save again mid-flash, the new save's `setTimeout` resets
 * the cleanup. The flash is purely affordance feedback.
 */
function flashSaveConfirm(button: HTMLElement): void {
  button.classList.add('is-flashing');
  window.setTimeout(() => {
    button.classList.remove('is-flashing');
  }, 1400);
}

export interface PresetControllerHooks {
  readonly promptForName: (defaultName: string) => string | null;
  readonly confirmDelete: (presetName: string) => boolean;
}

const defaultHooks: PresetControllerHooks = {
  promptForName: (defaultName) => window.prompt('Preset name:', defaultName),
  confirmDelete: (presetName) =>
    window.confirm(`Delete preset "${presetName}"?`),
};

function handleSaveClick(
  saveBtn: HTMLButtonElement,
  projectKey: string,
  listContainer: HTMLElement,
  hooks: PresetControllerHooks,
): void {
  const defaultName = `Preset ${listPresets(projectKey).length + 1}`;
  const name = hooks.promptForName(defaultName);
  if (name === null) return;
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  savePresetFromCurrent(projectKey, trimmed);
  renderPresetList(listContainer, projectKey);
  flashSaveConfirm(saveBtn);
}

function handleListClick(
  ev: MouseEvent,
  projectKey: string,
  listContainer: HTMLElement,
  hooks: PresetControllerHooks,
): void {
  const target = ev.target;
  if (!(target instanceof HTMLElement)) return;

  const loadBtn = target.closest<HTMLElement>('[data-preset-load]');
  if (loadBtn !== null) {
    const id = loadBtn.dataset.presetLoad;
    if (id === undefined) return;
    const presets = readPresets(projectKey);
    const preset = presets.get(id);
    if (preset === undefined) return;
    applyPreset(projectKey, preset);
    return;
  }

  const deleteBtn = target.closest<HTMLElement>('[data-preset-delete]');
  if (deleteBtn !== null) {
    const id = deleteBtn.dataset.presetDelete;
    if (id === undefined) return;
    const presets = readPresets(projectKey);
    const preset = presets.get(id);
    if (preset === undefined) return;
    if (!hooks.confirmDelete(preset.name)) return;
    deletePreset(projectKey, id);
    renderPresetList(listContainer, projectKey);
    return;
  }
}

function bindHandlers(
  rail: HTMLElement,
  projectKey: string,
  listContainer: HTMLElement,
  hooks: PresetControllerHooks,
): void {
  const saveBtn = rail.querySelector<HTMLButtonElement>('[data-preset-save]');
  if (saveBtn !== null) {
    saveBtn.addEventListener('click', () => {
      handleSaveClick(saveBtn, projectKey, listContainer, hooks);
    });
  }

  listContainer.addEventListener('click', (ev) => {
    handleListClick(ev, projectKey, listContainer, hooks);
  });
}

/**
 * Apply the deep-link preset on init when `?preset=<id>` is present
 * AND the id resolves to a stored preset. The four-axis apply runs
 * AFTER each constituent controller's `init*` has fired (per the
 * editorial-studio-client.ts wiring order) so the reapply functions
 * have a non-null active state to mutate.
 */
function applyDeepLinkPreset(projectKey: string): void {
  const id = parsePresetIdFromUrl();
  if (id === null) return;
  const presets = readPresets(projectKey);
  const preset = presets.get(id);
  if (preset === undefined) return;
  applyPreset(projectKey, preset);
}

/**
 * Entry point — wire the preset Save + Load + Delete affordances in
 * the rail head, apply any deep-link preset from `?preset=`, and
 * render the saved-preset list. No-op when the bay shell is absent.
 *
 * The `hooks` parameter exists so tests can substitute deterministic
 * prompt + confirm shims (jsdom honors `window.prompt` returning
 * null by default, which would skip every save).
 */
export function initSwimlanePresets(
  hooks: PresetControllerHooks = defaultHooks,
): void {
  const shell = document.querySelector<HTMLElement>('[data-bay-shell]');
  if (shell === null) return;
  const rail = document.querySelector<HTMLElement>('[data-lane-rail]');
  if (rail === null) return;
  const listContainer = rail.querySelector<HTMLElement>(
    '[data-preset-list]',
  );
  if (listContainer === null) return;

  const projectKey = resolveProjectKey(shell);
  renderPresetList(listContainer, projectKey);
  bindHandlers(rail, projectKey, listContainer, hooks);
  applyDeepLinkPreset(projectKey);
}
