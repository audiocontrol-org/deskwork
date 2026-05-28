/**
 * Multi-lane swimlane dashboard controller (Phase 5 Task 5.1).
 *
 * Wires the bay shell's focus-chip strip + lane-visibility rail to
 * persistent per-operator state stored in localStorage. The server
 * renders the initial paint from a `?focus=<csv>` URL param (or "all
 * focused" when absent); the client controller takes over once
 * `DOMContentLoaded` fires and:
 *
 *   - Reads `?focus=` from `window.location.search`. If present, the
 *     URL wins on this load AND is written through to localStorage so
 *     subsequent loads (without the param) see the URL-set focus.
 *   - Otherwise reads the focus set from localStorage and applies it.
 *   - Reads the visibility set from localStorage and hides any lane
 *     the operator has flipped persistently OFF (eye-toggle in the
 *     rail).
 *
 * Click handlers:
 *
 *   - Focus chip: toggles whether the lane is in the focus set.
 *     "All" chip resets focus to every visible lane.
 *   - Rail eye-toggle (clicking the `.r-eye-btn` button — F6 a11y
 *     fix promoted the previous `.r-eye` span to a real focusable
 *     `<button>`): flips persistent visibility.
 *   - Rail row keyboard activation (F5 a11y fix): Enter / Space on
 *     a `.rail-lane[role="button"]` toggles focus state (mirrors the
 *     click handler bound on the same element).
 *   - Swim-stub: re-adds the lane to focus (the stub removes itself
 *     once the swimlane renders).
 *
 * State keys are namespaced per project root so two operators
 * sharing a machine but working on different projects don't see
 * each other's focus state. The project-root hash is server-rendered
 * onto `<section class="bay-shell" data-project-key>`.
 *
 * Out of scope for 5.1: lane-level collapse (5.1A), per-stage
 * collapse (5.1A), kanban ↔ list toggle (5.1B), compose chip (5.1C),
 * drag reorder (5.4), preset save (5.5).
 */

import {
  resolveProjectKey,
  STORAGE_KEY_PREFIX,
} from './swimlane-storage.ts';

const FOCUS_KEY_SUFFIX = ':focus';
const VISIBILITY_KEY_SUFFIX = ':visibility';

export interface SwimlaneState {
  /** Set of lane ids currently focused. */
  readonly focused: Set<string>;
  /**
   * Set of lane ids the operator has flipped persistently OFF in
   * the rail. Visibility-off lanes are removed from the focus-chip
   * strip and don't render in the bay; the operator must flip them
   * back ON via the rail to see them again.
   */
  readonly hidden: Set<string>;
  /** All lane ids known to the page (server-rendered ordering). */
  readonly allLanes: readonly string[];
}

function focusKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + FOCUS_KEY_SUFFIX;
}

function visibilityKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + VISIBILITY_KEY_SUFFIX;
}

function readStoredSet(key: string): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out = new Set<string>();
    for (const item of parsed) {
      if (typeof item === 'string') out.add(item);
    }
    return out;
  } catch {
    // localStorage unavailable or corrupted — proceed without stored state.
    return null;
  }
}

function writeStoredSet(key: string, value: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(value)));
  } catch {
    // localStorage unavailable — the client controller still works
    // in-page; the operator just loses persistence across reloads.
  }
}

function parseFocusFromUrl(): Set<string> | null {
  const url = new URL(window.location.href);
  const list = parseCsvNonEmpty(url.searchParams.get('focus'));
  return list === null ? null : new Set(list);
}

/**
 * Parse a CSV string into a deduped non-empty list of trimmed items.
 * Returns null when the input is null OR empty after trimming. Shared
 * by `parseFocusFromUrl` here and (logically) by the server-side
 * `parseFocusCsv` in the dashboard render path — both implement the
 * same parsing contract on the same wire format. The shapes are
 * deliberately near-identical; the duplication is a wire-format
 * symmetry, not a refactor opportunity (server bundle and client
 * bundle are separate; cross-bundle imports would force a shared
 * vendored module).
 */
function parseCsvNonEmpty(raw: string | null): string[] | null {
  if (raw === null) return null;
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  return parts;
}

function collectAllLanes(): string[] {
  const ids: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-rail-lane]')) {
    const id = el.dataset.railLane;
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

/**
 * Apply the current state to the DOM: toggle `.is-focus-hidden` on
 * swimlanes / swim-stubs, set chip `.active` state, set rail
 * `aria-pressed` + `.focused` state, hide visibility-off lanes
 * entirely.
 */
function applyState(state: SwimlaneState): void {
  // Swimlanes and stubs.
  for (const id of state.allLanes) {
    const swim = document.querySelector<HTMLElement>(
      `.swim[data-lane-id="${CSS.escape(id)}"]`,
    );
    const stub = document.querySelector<HTMLElement>(
      `.swim-stub[data-swim-stub="${CSS.escape(id)}"]`,
    );
    const hidden = state.hidden.has(id);
    const focused = state.focused.has(id);

    if (swim !== null) {
      swim.classList.toggle('is-visibility-hidden', hidden);
      swim.classList.toggle('is-focus-hidden', !hidden && !focused);
    }
    if (stub !== null) {
      stub.classList.toggle('is-visibility-hidden', hidden);
      stub.classList.toggle('is-focus-hidden', hidden || focused);
    }
  }

  // Focus chips.
  for (const chip of document.querySelectorAll<HTMLButtonElement>(
    '[data-focus-chip]',
  )) {
    const id = chip.dataset.focusChip;
    if (id === undefined) continue;
    const hidden = state.hidden.has(id);
    const focused = state.focused.has(id);
    chip.classList.toggle('active', focused && !hidden);
    chip.classList.toggle('is-visibility-hidden', hidden);
    chip.setAttribute('aria-pressed', focused && !hidden ? 'true' : 'false');
  }

  // "All" chip — active when every visible lane is focused.
  const allChip = document.querySelector<HTMLButtonElement>(
    '[data-focus-chip-all]',
  );
  if (allChip !== null) {
    const visibleLanes = state.allLanes.filter((id) => !state.hidden.has(id));
    const allVisibleFocused =
      visibleLanes.length > 0 &&
      visibleLanes.every((id) => state.focused.has(id));
    allChip.classList.toggle('active', allVisibleFocused);
    allChip.setAttribute(
      'aria-pressed',
      allVisibleFocused ? 'true' : 'false',
    );
  }

  // Rail rows.
  for (const row of document.querySelectorAll<HTMLElement>('[data-rail-lane]')) {
    const id = row.dataset.railLane;
    if (id === undefined) continue;
    const hidden = state.hidden.has(id);
    const focused = state.focused.has(id);
    row.classList.toggle('focused', focused && !hidden);
    row.dataset.laneVisible = hidden ? 'false' : 'true';
    row.setAttribute('aria-pressed', focused && !hidden ? 'true' : 'false');
  }
}

function persist(state: SwimlaneState, projectKey: string): void {
  writeStoredSet(focusKey(projectKey), state.focused);
  writeStoredSet(visibilityKey(projectKey), state.hidden);
}

/**
 * Single shared focus toggle. Used by the per-lane focus chips —
 * those callers never want to surface a hidden lane (the chip's CSS
 * `is-visibility-hidden` rule hides it from the strip entirely).
 * Returns true when the toggle actually fired (visible lanes); false
 * when ignored (hidden lanes don't participate in focus from the
 * chip path).
 */
function toggleFocus(
  state: SwimlaneState,
  projectKey: string,
  id: string,
): boolean {
  if (state.hidden.has(id)) return false;
  if (state.focused.has(id)) {
    state.focused.delete(id);
  } else {
    state.focused.add(id);
  }
  applyState(state);
  persist(state, projectKey);
  return true;
}

/**
 * Task 5.3.2 — rail-row activation contract: the rail acts as the
 * master list of every lane (visible AND hidden). Clicking (or
 * keyboard-activating) a rail row has a dual semantics:
 *
 *   - On a HIDDEN lane: flip visibility ON AND add the lane to focus
 *     in a single gesture. This is the "bring it back" semantic the
 *     rail exists to serve.
 *   - On a VISIBLE lane: toggle focus on/off (the existing 5.1
 *     behavior).
 *
 * The dedicated `.r-eye-btn` (handled separately) still exclusively
 * toggles persistent visibility — its click path stays unchanged so
 * the operator retains the "hide without focusing" gesture.
 *
 * Returns the activation kind so callers (e.g. the mobile-sheet
 * controller) can chain additional behavior — closing the sheet on
 * focus activation, for instance.
 */
export type RailRowActivation = 'unhid-and-focused' | 'focus-toggled';

export function handleRailRowActivation(
  state: SwimlaneState,
  projectKey: string,
  id: string,
): RailRowActivation {
  if (state.hidden.has(id)) {
    state.hidden.delete(id);
    state.focused.add(id);
    applyState(state);
    persist(state, projectKey);
    return 'unhid-and-focused';
  }
  toggleFocus(state, projectKey, id);
  return 'focus-toggled';
}

function bindFocusChips(state: SwimlaneState, projectKey: string): void {
  // Per-lane chips.
  for (const chip of document.querySelectorAll<HTMLButtonElement>(
    '[data-focus-chip]',
  )) {
    const id = chip.dataset.focusChip;
    if (id === undefined) continue;
    chip.addEventListener('click', () => {
      toggleFocus(state, projectKey, id);
    });
  }

  // "All" chip — focuses every visible lane.
  const allChip = document.querySelector<HTMLButtonElement>(
    '[data-focus-chip-all]',
  );
  if (allChip !== null) {
    allChip.addEventListener('click', () => {
      const allVisible = state.allLanes.filter((id) => !state.hidden.has(id));
      const isAlreadyAll =
        allVisible.length > 0 &&
        allVisible.every((id) => state.focused.has(id));
      state.focused.clear();
      if (!isAlreadyAll) {
        for (const id of allVisible) state.focused.add(id);
      }
      applyState(state);
      persist(state, projectKey);
    });
  }
}

function bindRailEyeToggles(
  state: SwimlaneState,
  projectKey: string,
): void {
  // Clicking the rail row's eye glyph toggles persistent visibility;
  // clicking elsewhere on the row toggles focus (default rail
  // behavior). F5 a11y fix: the row carries `role="button"` so it
  // must also honor Enter / Space activation via keyboard.
  for (const row of document.querySelectorAll<HTMLElement>(
    '[data-rail-lane]',
  )) {
    const id = row.dataset.railLane;
    if (id === undefined) continue;

    // F6 a11y fix: the visibility toggle is a real `<button
    // class="r-eye-btn">` (previously a span). Stops click
    // propagation so the row's focus-toggle handler doesn't also
    // fire on the same gesture.
    const eye = row.querySelector<HTMLElement>('.r-eye-btn');
    if (eye !== null) {
      eye.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (state.hidden.has(id)) {
          state.hidden.delete(id);
        } else {
          state.hidden.add(id);
          state.focused.delete(id);
        }
        applyState(state);
        persist(state, projectKey);
      });
    }

    row.addEventListener('click', () => {
      handleRailRowActivation(state, projectKey, id);
    });

    // F5 a11y fix: keyboard activation for the row's role="button".
    // Enter and Space both activate; preventDefault on Space stops
    // the default page-scroll. Per Task 5.3.2 the keyboard path
    // mirrors the click path — both gestures dispatch through
    // `handleRailRowActivation` so hidden-lane Enter unhides + focuses
    // identically to click.
    row.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      handleRailRowActivation(state, projectKey, id);
    });
  }
}

function bindSwimStubs(state: SwimlaneState, projectKey: string): void {
  for (const stub of document.querySelectorAll<HTMLButtonElement>(
    '[data-swim-stub]',
  )) {
    const id = stub.dataset.swimStub;
    if (id === undefined) continue;
    stub.addEventListener('click', () => {
      if (state.hidden.has(id)) return; // shouldn't be reachable; defensive
      state.focused.add(id);
      applyState(state);
      persist(state, projectKey);
    });
  }
}

/**
 * Entry point — wire the swimlane shell to localStorage + click
 * handlers. No-op when the bay shell is absent (e.g. on a project
 * without lanes, or a page that doesn't render the dashboard).
 */
export function initSwimlane(): void {
  const shell = document.querySelector<HTMLElement>('[data-bay-shell]');
  if (shell === null) return;

  const allLanes = collectAllLanes();
  if (allLanes.length === 0) return;

  const projectKey = resolveProjectKey(shell);

  // Establish the initial focus set. URL takes precedence; it also
  // writes through to localStorage so subsequent loads pick it up.
  const urlFocus = parseFocusFromUrl();
  const storedFocus = readStoredSet(focusKey(projectKey));
  const storedHidden = readStoredSet(visibilityKey(projectKey)) ?? new Set<string>();

  let focused: Set<string>;
  if (urlFocus !== null) {
    focused = new Set<string>();
    for (const id of urlFocus) {
      if (allLanes.includes(id)) focused.add(id);
    }
  } else if (storedFocus !== null) {
    focused = new Set<string>();
    for (const id of storedFocus) {
      if (allLanes.includes(id)) focused.add(id);
    }
  } else {
    focused = new Set<string>(allLanes.filter((id) => !storedHidden.has(id)));
  }

  const state: SwimlaneState = {
    focused,
    hidden: storedHidden,
    allLanes,
  };

  applyState(state);
  // Persist after applyState so URL-driven values land in storage
  // for the next reload.
  persist(state, projectKey);

  bindFocusChips(state, projectKey);
  bindRailEyeToggles(state, projectKey);
  bindSwimStubs(state, projectKey);
}
