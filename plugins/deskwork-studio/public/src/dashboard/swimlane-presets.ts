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
import {
  inlineConfirm,
  inlinePrompt,
} from '../entry-review/inline-prompt.ts';

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

    // Per AUDIT-20260528-37 (F2): copy-deep-link affordance. The
    // button writes `${origin}/dev/editorial-studio?preset=<id>` to
    // the clipboard so the operator can share the preset URL.
    // Per `.claude/rules/affordance-placement.md` the button lives
    // ON the preset row (component-attached), not in a separate
    // toolbar.
    const linkBtn = document.createElement('button');
    linkBtn.type = 'button';
    linkBtn.classList.add('preset-link');
    linkBtn.dataset.presetLink = preset.id;
    linkBtn.setAttribute('aria-label', `Copy deep-link URL for preset ${preset.name}`);
    linkBtn.textContent = '🔗';
    row.appendChild(linkBtn);

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
 * Compose the deep-link URL for a preset id. Origin + the canonical
 * editorial-studio path + `?preset=<id>`. Centralised so the click
 * handler and any future surface (share menu, etc.) share the same
 * format.
 */
function composeDeepLinkUrl(presetId: string): string {
  return `${window.location.origin}/dev/editorial-studio?preset=${encodeURIComponent(presetId)}`;
}

/** Duration the link button stays in the `.copied` flash state (ms). */
const LINK_COPIED_FLASH_MS = 2000;

/**
 * Flash `.copied` on the link button for ~2s after a successful
 * clipboard write. Mirrors the `swimlane-compose.ts` copy-flash
 * pattern — same duration, same revert path. The button's text
 * swaps to a checkmark for the duration of the flash so screen
 * readers + sighted users both get confirmation.
 */
function flashLinkCopied(button: HTMLElement): void {
  button.classList.add('copied');
  const originalText = button.textContent;
  const originalLabel = button.getAttribute('aria-label');
  button.textContent = '✓';
  button.setAttribute('aria-label', 'Deep-link URL copied to clipboard');
  window.setTimeout(() => {
    button.classList.remove('copied');
    button.textContent = originalText;
    if (originalLabel !== null) {
      button.setAttribute('aria-label', originalLabel);
    }
  }, LINK_COPIED_FLASH_MS);
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
  readonly promptForName: (defaultName: string, anchor: HTMLElement) => Promise<string | null>;
  readonly confirmDelete: (presetName: string, anchor: HTMLElement) => Promise<boolean>;
}

const defaultHooks: PresetControllerHooks = {
  promptForName: (defaultName, anchor) =>
    inlinePrompt({
      label: 'Preset name',
      defaultValue: defaultName,
      placeholder: 'e.g. "Drafting focus"',
      confirm: 'Save',
      cancel: 'Cancel',
      anchor,
    }),
  confirmDelete: (presetName, anchor) =>
    inlineConfirm({
      label: 'Delete preset',
      message: `Delete preset "${presetName}"?`,
      confirm: 'Delete',
      cancel: 'Cancel',
      anchor,
    }),
};

async function handleSaveClick(
  saveBtn: HTMLButtonElement,
  projectKey: string,
  listContainer: HTMLElement,
  hooks: PresetControllerHooks,
): Promise<void> {
  const defaultName = `Preset ${listPresets(projectKey).length + 1}`;
  const name = await hooks.promptForName(defaultName, saveBtn);
  if (name === null) return;
  // The inlinePrompt helper trims and returns null on whitespace-only
  // input, so by contract we receive a non-empty trimmed string here.
  // Add a belt-and-braces guard in case a custom hook violates that
  // contract.
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  savePresetFromCurrent(projectKey, trimmed);
  renderPresetList(listContainer, projectKey);
  flashSaveConfirm(saveBtn);
}

async function handleListClick(
  ev: MouseEvent,
  projectKey: string,
  listContainer: HTMLElement,
  hooks: PresetControllerHooks,
): Promise<void> {
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

  const linkBtn = target.closest<HTMLElement>('[data-preset-link]');
  if (linkBtn !== null) {
    const id = linkBtn.dataset.presetLink;
    if (id === undefined) return;
    // Per the no-fallback rule (swimlane-compose.ts:36-40): when
    // `navigator.clipboard` is missing the controller surfaces the
    // runtime error rather than papering over it. The clipboard
    // API is gated on a secure context (https or localhost) — both
    // of which the editorial-studio surface always meets.
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.clipboard?.writeText !== 'function'
    ) {
      throw new Error(
        'preset-link copy requires navigator.clipboard.writeText',
      );
    }
    await navigator.clipboard.writeText(composeDeepLinkUrl(id));
    flashLinkCopied(linkBtn);
    return;
  }

  const deleteBtn = target.closest<HTMLElement>('[data-preset-delete]');
  if (deleteBtn !== null) {
    const id = deleteBtn.dataset.presetDelete;
    if (id === undefined) return;
    const presets = readPresets(projectKey);
    const preset = presets.get(id);
    if (preset === undefined) return;
    const confirmed = await hooks.confirmDelete(preset.name, deleteBtn);
    if (!confirmed) return;
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
      void handleSaveClick(saveBtn, projectKey, listContainer, hooks);
    });
  }

  listContainer.addEventListener('click', (ev) => {
    void handleListClick(ev, projectKey, listContainer, hooks);
  });
}

/**
 * Apply the deep-link preset on init when `?preset=<id>` is present
 * AND the id resolves to a stored preset. The four-axis apply runs
 * AFTER each constituent controller's `init*` has fired (per the
 * editorial-studio-client.ts wiring order) so the reapply functions
 * have a non-null active state to mutate.
 *
 * URL precedence — `?preset=` overrides `?focus=`. Per AUDIT-20260528-37
 * (F4): a deep-link preset apply silently overrides any concurrent
 * `?focus=<csv>` URL param, because preset apply is a complete-state
 * restore of all four axes (visible / focused / view-mode / collapse)
 * — letting a partial-axis param like `?focus=` survive would leave
 * the operator with a state that's neither the preset NOR the focus
 * URL. The preset wins; the `?focus=` param is observed by the
 * pre-preset init pass (writing through to the focus storage key)
 * and then immediately replaced when `applyPreset` writes the
 * preset's `focusedLanes` to the same key. The `?preset=` param is
 * stripped from the URL post-apply (see `stripPresetFromUrl`); the
 * `?focus=` param is left intact for back-link symmetry but no
 * longer reflects live state.
 */
function applyDeepLinkPreset(projectKey: string): void {
  const id = parsePresetIdFromUrl();
  if (id === null) return;
  const presets = readPresets(projectKey);
  const preset = presets.get(id);
  if (preset === undefined) return;
  applyPreset(projectKey, preset);
  // Per AUDIT-20260528-33 — strip `?preset=<id>` from the URL after
  // applying the preset. Once applied the preset's contribution to
  // the page state is complete; subsequent operator-driven mutations
  // (focus chip clicks, view-toggle flips, etc.) should not silently
  // drift the live state away from what the URL bar advertises. A
  // shareable deep-link should always be honest about what it opens.
  stripPresetFromUrl();
}

/**
 * Remove the `preset` query parameter from the current URL via
 * `history.replaceState`. No-op when `history.replaceState` is
 * unavailable (older browsers, certain sandboxes); the URL stays
 * intact and the operator still sees the applied state — only the
 * URL hygiene step degrades.
 */
function stripPresetFromUrl(): void {
  if (typeof window.history?.replaceState !== 'function') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('preset')) return;
  url.searchParams.delete('preset');
  const search = url.searchParams.toString();
  const newUrl = url.pathname + (search.length > 0 ? `?${search}` : '') + url.hash;
  window.history.replaceState({}, '', newUrl);
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
