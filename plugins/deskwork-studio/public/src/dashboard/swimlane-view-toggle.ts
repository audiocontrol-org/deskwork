/**
 * Per-lane view-toggle controller (Phase 5 Task 5.1B).
 *
 * Wires the `.view-toggle` segmented `▦ Kanban` / `≡ List` cell pair
 * on each `<article class="swim">`:
 *
 *   - Reads the current viewport class via
 *     `window.matchMedia('(max-width: 720px)')`. The 720px breakpoint
 *     is the existing mobile gate in `dashboard-swimlane-mobile.css`
 *     (the `.bay-shell` grid collapse + lane-rail hide block);
 *     reusing it here keeps the view-default switch aligned with the
 *     layout switch the operator already perceives.
 *   - Reads any per-lane operator overrides from localStorage at
 *     `deskwork:dashboard:v2:<projectKey>:view-mode` (a `Record<laneId,
 *     'kanban' | 'list'>` map).
 *   - Applies the resolved mode to each swim by swapping `.view-
 *     kanban` and `.view-list` classes; mirrors `aria-checked` on
 *     each `.vt-cell` accordingly.
 *
 * Click handlers on the `.vt-cell` buttons flip the operator's
 * choice + persist. Per-lane state — clicking the list button in
 * the editorial swim does not affect the press-releases swim's
 * view.
 *
 * Collapse precedence (Task 5.1B.3): when the swim is `.collapsed`,
 * the toggle is non-interactive — the CSS rule `.swim.collapsed
 * .view-toggle { opacity: 0.4; pointer-events: none }` handles the
 * visual + pointer-event side; this controller also stamps
 * `aria-disabled="true"` on each cell + early-returns on click so
 * assistive tech reads the disabled state and the operator's
 * gesture is a no-op even if the CSS hasn't loaded yet.
 *
 * Keyboard activation: Enter activates via the native `<button>`
 * primitive's keyboard contract; Space is wired explicitly with
 * preventDefault to suppress page scroll (per WCAG 2.1 SC 2.1.1).
 *
 * Per WAI-ARIA Authoring Practices for radio buttons: the cells
 * are grouped under a `role="radiogroup"` element and each cell
 * carries `role="radio"` + `aria-checked`. Single-choice semantics
 * — exactly one cell is `aria-checked="true"` per group.
 */

import {
  readStoredObjectMap,
  resolveProjectKey,
  STORAGE_KEY_PREFIX,
} from './swimlane-storage.ts';

const VIEW_MODE_KEY_SUFFIX = ':view-mode';

/**
 * Mobile breakpoint shared with the layout side. Mobile-list /
 * desktop-kanban defaults are the spec contract (see the brief at
 * `docs/studio-design/ACCEPTED/2026-05-27-multi-lane-dashboard-d3
 * -press-bay/brief.md` § "Implementation notes"). The 720px value
 * matches the `@media (max-width: 720px)` rule in
 * `dashboard-swimlane-mobile.css` so the view-default flips at
 * exactly the viewport size the layout collapses.
 */
const MOBILE_MEDIA_QUERY = '(max-width: 720px)';

type ViewMode = 'kanban' | 'list';

function isViewMode(value: unknown): value is ViewMode {
  return value === 'kanban' || value === 'list';
}

function viewModeKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + VIEW_MODE_KEY_SUFFIX;
}

function readStoredOverrides(key: string): Map<string, ViewMode> {
  return readStoredObjectMap(key, isViewMode);
}

function writeStoredOverrides(
  key: string,
  overrides: ReadonlyMap<string, ViewMode>,
): void {
  try {
    const obj: Record<string, ViewMode> = {};
    for (const [laneId, mode] of overrides) {
      obj[laneId] = mode;
    }
    window.localStorage.setItem(key, JSON.stringify(obj));
  } catch {
    // localStorage unavailable — in-page state still works.
  }
}

/**
 * Resolve the effective view-mode for a lane: per-lane override
 * wins if present; otherwise the viewport-aware default applies
 * (mobile→list, desktop→kanban).
 */
function resolveMode(
  laneId: string,
  overrides: ReadonlyMap<string, ViewMode>,
  isMobile: boolean,
): ViewMode {
  const override = overrides.get(laneId);
  if (override !== undefined) return override;
  return isMobile ? 'list' : 'kanban';
}

/**
 * Apply the effective view-mode for one swim: swap `.view-kanban`
 * / `.view-list` classes on the swim, and mirror `aria-checked`
 * across the two `.vt-cell` cells in its toggle.
 */
function applySwimMode(swim: HTMLElement, mode: ViewMode): void {
  swim.classList.toggle('view-kanban', mode === 'kanban');
  swim.classList.toggle('view-list', mode === 'list');
  const cells = swim.querySelectorAll<HTMLButtonElement>(
    '.view-toggle .vt-cell[data-view-mode]',
  );
  for (const cell of cells) {
    const cellMode = cell.dataset.viewMode;
    const checked = cellMode === mode;
    cell.setAttribute('aria-checked', checked ? 'true' : 'false');
    cell.classList.toggle('active', checked);
  }
}

/**
 * Apply collapse-precedence to every swim: when a swim has
 * `.collapsed`, stamp `aria-disabled="true"` on each toggle cell.
 * The class on the swim is owned by `swimlane-collapse.ts`; this
 * controller observes it (via a MutationObserver) so the aria
 * state stays in lockstep.
 */
function applyCollapseFlag(swim: HTMLElement): void {
  const collapsed = swim.classList.contains('collapsed');
  const cells = swim.querySelectorAll<HTMLButtonElement>(
    '.view-toggle .vt-cell[data-view-mode]',
  );
  for (const cell of cells) {
    cell.setAttribute('aria-disabled', collapsed ? 'true' : 'false');
  }
}

function applyAll(
  overrides: ReadonlyMap<string, ViewMode>,
  isMobile: boolean,
): void {
  for (const swim of document.querySelectorAll<HTMLElement>('.swim[data-lane-id]')) {
    const laneId = swim.dataset.laneId;
    if (laneId === undefined) continue;
    const mode = resolveMode(laneId, overrides, isMobile);
    applySwimMode(swim, mode);
    applyCollapseFlag(swim);
  }
}

interface ViewToggleState {
  /** Per-lane operator overrides; per-lane override > viewport default. */
  readonly overrides: Map<string, ViewMode>;
  /** Current viewport-class (true when narrower than the breakpoint). */
  isMobile: boolean;
}

/**
 * Resolve a cell-activation gesture (click OR Space keydown) into
 * a (laneId, mode) tuple, then write the override + reapply + persist.
 * Returns false when the gesture is invalid (missing data attrs) or
 * blocked by collapse precedence (parent swim has `.collapsed`).
 *
 * Factored out of the click + keydown handler bodies (which were
 * identical save for the event-prep step) so the dispatch logic
 * lives in one place.
 */
function activateCell(
  cell: HTMLButtonElement,
  state: ViewToggleState,
  projectKey: string,
): boolean {
  const laneId = cell.dataset.laneId;
  const mode = cell.dataset.viewMode;
  if (laneId === undefined || !isViewMode(mode)) return false;
  // Collapse precedence: when the parent swim is collapsed, the
  // gesture is a no-op. The CSS rule disables pointer events too,
  // but this guard makes the contract explicit + the jsdom test
  // path doesn't honor CSS pointer-events.
  const swim = cell.closest<HTMLElement>('.swim[data-lane-id]');
  if (swim !== null && swim.classList.contains('collapsed')) return false;
  state.overrides.set(laneId, mode);
  applyAll(state.overrides, state.isMobile);
  writeStoredOverrides(viewModeKey(projectKey), state.overrides);
  return true;
}

function bindCellClicks(
  state: ViewToggleState,
  projectKey: string,
): void {
  for (const cell of document.querySelectorAll<HTMLButtonElement>(
    '.view-toggle .vt-cell[data-view-mode]',
  )) {
    cell.addEventListener('click', (ev) => {
      // Stop the click from bubbling into `swimlane-collapse.ts`'s
      // swim-head handler, which would otherwise also toggle the
      // lane collapse on every cell click (the cells live inside
      // the swim-head DOM tree).
      ev.stopPropagation();
      activateCell(cell, state, projectKey);
    });
    cell.addEventListener('keydown', (ev) => {
      if (ev.key !== ' ') return;
      // Space activates the radio cell. Per WCAG 2.1 SC 2.1.1,
      // preventDefault to suppress page scroll. Enter is free
      // with the native `<button>` keyboard contract — no extra
      // handler needed.
      ev.preventDefault();
      activateCell(cell, state, projectKey);
    });
  }
}

/**
 * Observe each swim's class list so the toggle's `aria-disabled`
 * flips when `swimlane-collapse.ts` adds/removes `.collapsed`.
 * The class is owned externally; the observer keeps the toggle's
 * a11y state in lockstep without re-binding click handlers.
 */
function observeCollapseClassChanges(): void {
  if (typeof MutationObserver === 'undefined') return;
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      const target = r.target;
      if (!(target instanceof HTMLElement)) continue;
      if (!target.classList.contains('swim')) continue;
      applyCollapseFlag(target);
    }
  });
  for (const swim of document.querySelectorAll<HTMLElement>('.swim[data-lane-id]')) {
    obs.observe(swim, { attributes: true, attributeFilter: ['class'] });
  }
}

function watchViewport(state: ViewToggleState): void {
  if (typeof window.matchMedia !== 'function') return;
  const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
  // matchMedia.addEventListener is the modern API; older browsers
  // exposed `addListener`. We only call the modern API — if it's
  // unavailable, the viewport-default applies on initial paint and
  // doesn't re-flow on resize, which is acceptable (the operator
  // can still flip the toggle by hand and the override persists).
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', (ev) => {
      state.isMobile = ev.matches;
      applyAll(state.overrides, state.isMobile);
    });
  }
}

/**
 * Module-level singleton — written by `initSwimlaneViewToggle`,
 * mutated in-place by `reapplyViewToggleFromStorage` so the bound
 * `.vt-cell` click handlers (which closure-capture the state object)
 * keep operating on the same overrides Map after a preset apply.
 *
 * Per AUDIT-20260528-37 (F5): tests that mutate this singleton must
 * reset DOM + storage in `beforeEach` so cross-describe-block state
 * does not leak. Re-invoking `initSwimlaneViewToggle` after the
 * reset reassigns the singleton — that is the sanctioned reset path.
 */
let activeState: ViewToggleState | null = null;

/**
 * Re-read storage + re-apply to every swim. Used by the Task 5.5
 * preset controller after writing through the view-mode storage
 * key. No-op when `initSwimlaneViewToggle` hasn't fired yet.
 */
export function reapplyViewToggleFromStorage(): void {
  if (activeState === null) return;
  const shell = document.querySelector<HTMLElement>('[data-bay-shell]');
  if (shell === null) return;
  const projectKey = resolveProjectKey(shell);
  const next = readStoredOverrides(viewModeKey(projectKey));
  // Mutate the singleton's overrides Map in-place so bound handlers
  // observe the new entries through their closure-captured reference.
  activeState.overrides.clear();
  for (const [k, v] of next) activeState.overrides.set(k, v);
  applyAll(activeState.overrides, activeState.isMobile);
}

/**
 * Entry point — wire view-toggle handlers + restore the operator's
 * resolved view-mode for every swim on the page. No-op when the
 * bay-shell is absent.
 */
export function initSwimlaneViewToggle(): void {
  const shell = document.querySelector<HTMLElement>('[data-bay-shell]');
  if (shell === null) return;

  const projectKey = resolveProjectKey(shell);
  const overrides = readStoredOverrides(viewModeKey(projectKey));
  const isMobile = typeof window.matchMedia === 'function'
    ? window.matchMedia(MOBILE_MEDIA_QUERY).matches
    : false;

  const state: ViewToggleState = {
    overrides,
    isMobile,
  };
  activeState = state;

  applyAll(state.overrides, state.isMobile);
  bindCellClicks(state, projectKey);
  observeCollapseClassChanges();
  watchViewport(state);
}
