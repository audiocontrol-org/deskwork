/**
 * Lane-level + per-stage collapse controller (Phase 5 Task 5.1A,
 * extended in Task 5.1B to cover the list-body's `.lb-group` parent).
 *
 * Wires the universal `.collapse-chev` button at two scopes:
 *
 *   - lane-level: the chevron in `.swim-head` toggles the parent
 *     `<article class="swim">` between expanded (default) and
 *     `.collapsed`. CSS hides `.stage-grid` and reveals the
 *     `.swim-compact` per-stage count strip when collapsed.
 *   - per-stage: the chevron in `.stage-head` (kanban) OR `.lb-
 *     group-head` (list-body) toggles the parent `.stage-col` /
 *     `.lb-group` between expanded and `.collapsed`. CSS shrinks
 *     the kanban column to a 42px vertical strip with the stage
 *     name rotated bottom-to-top; the list-body group hides its
 *     rows + keeps the group-head visible.
 *
 * State is stored per-operator-per-project in localStorage:
 *
 *   - `deskwork:dashboard:v2:<projectKey>:lane-collapse`
 *     JSON array of lane ids the operator has collapsed.
 *   - `deskwork:dashboard:v2:<projectKey>:stage-collapse`
 *     JSON object mapping lane id → array of collapsed stage names.
 *     Per-stage collapse state is SHARED across kanban + list-body
 *     — a stage collapsed in kanban shows collapsed in list-body
 *     too (and vice-versa), since the operator's mental model of
 *     "this stage is folded away" is view-independent.
 *
 * Click anywhere on the `.swim-head` (or `.stage-head` / `.lb-
 * group-head`) toggles the affordance — not just the chevron — but
 * the chevron is the focusable element. Enter + Space activate the
 * chevron's toggle (free with the real `<button>` primitive).
 * `aria-expanded` mirrors current state.
 *
 * Accessibility primitives (per WAI-ARIA Authoring Practices for
 * disclosure widgets):
 *   - WCAG 2.2 SC 2.5.8 Target Size Minimum (AA): chevron ≥24×24.
 *   - WCAG 2.1 SC 2.4.7 Focus Visible (AA): proof-blue ring at rest
 *     on the focused chevron.
 *   - `aria-expanded="true|false"` reflects current state, updated
 *     in lockstep with the `.collapsed` class on the target.
 */

import {
  readStoredObjectMap,
  resolveProjectKey,
  STORAGE_KEY_PREFIX,
} from './swimlane-storage.ts';

const LANE_COLLAPSE_KEY_SUFFIX = ':lane-collapse';
const STAGE_COLLAPSE_KEY_SUFFIX = ':stage-collapse';

interface CollapseState {
  /** Lane ids the operator has lane-collapsed. */
  readonly lanes: Set<string>;
  /** Lane id → set of collapsed stage names within that lane. */
  readonly stages: Map<string, Set<string>>;
}

function laneCollapseKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + LANE_COLLAPSE_KEY_SUFFIX;
}

function stageCollapseKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + STAGE_COLLAPSE_KEY_SUFFIX;
}

function readStoredLanes(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return new Set<string>();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    const out = new Set<string>();
    for (const item of parsed) {
      if (typeof item === 'string') out.add(item);
    }
    return out;
  } catch {
    return new Set<string>();
  }
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function readStoredStages(key: string): Map<string, Set<string>> {
  // The on-disk shape is `Record<laneId, string[]>` — sets are
  // serialised as arrays. Use the shared object-map reader to get
  // a `Map<laneId, string[]>`, then post-process into the in-memory
  // `Map<laneId, Set<string>>`, dropping empty sets.
  const arrays = readStoredObjectMap<readonly string[]>(key, isStringArray);
  const out = new Map<string, Set<string>>();
  for (const [laneId, items] of arrays) {
    const stages = new Set<string>(items);
    if (stages.size > 0) out.set(laneId, stages);
  }
  return out;
}

function writeStoredLanes(key: string, value: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(value)));
  } catch {
    // localStorage unavailable — in-page state still works.
  }
}

function writeStoredStages(
  key: string,
  value: ReadonlyMap<string, ReadonlySet<string>>,
): void {
  try {
    const out: Record<string, string[]> = {};
    for (const [laneId, stages] of value) {
      if (stages.size === 0) continue;
      out[laneId] = Array.from(stages);
    }
    window.localStorage.setItem(key, JSON.stringify(out));
  } catch {
    // localStorage unavailable — in-page state still works.
  }
}

/**
 * Apply current collapse state to the DOM: toggle `.collapsed` on
 * targets, set `aria-expanded` on the matching chevrons.
 */
function applyCollapseState(state: CollapseState): void {
  // Lane-level collapse: `.swim[data-lane-id]`.
  for (const swim of document.querySelectorAll<HTMLElement>('.swim[data-lane-id]')) {
    const laneId = swim.dataset.laneId;
    if (laneId === undefined) continue;
    const collapsed = state.lanes.has(laneId);
    swim.classList.toggle('collapsed', collapsed);
    const chev = swim.querySelector<HTMLButtonElement>(
      '.swim-head > .collapse-chev[data-collapse-target="lane"]',
    );
    if (chev !== null) {
      chev.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const humanName = chev.dataset.laneName ?? laneId;
      chev.setAttribute(
        'aria-label',
        `${collapsed ? 'Expand' : 'Collapse'} ${humanName} lane`,
      );
    }
  }

  // Per-stage collapse — kanban scope (`.stage-col[data-stage-col]`)
  // + list-body scope (`.lb-group[data-lb-group]`). Both views share
  // the same lane:stage state — a stage collapsed in one view shows
  // collapsed in the other (the operator's mental model of "this
  // stage is folded" is view-independent).
  applyStageScope(state, {
    parentSelector: '.stage-col[data-stage-col]',
    stageAttrKey: 'stageCol',
    chevSelector: '.stage-head > .collapse-chev[data-collapse-target="stage"]',
    labelNoun: 'stage',
  });
  applyStageScope(state, {
    parentSelector: '.lb-group[data-lb-group]',
    stageAttrKey: 'lbGroup',
    chevSelector: '.lb-group-head > .collapse-chev[data-collapse-target="stage"]',
    labelNoun: 'group',
  });
}

interface StageScopeConfig {
  /** CSS selector for the per-stage parent element. */
  readonly parentSelector: string;
  /** Dataset key on the parent that carries the stage name. */
  readonly stageAttrKey: string;
  /** CSS selector for the chevron button inside the parent. */
  readonly chevSelector: string;
  /** Noun appended to the aria-label (e.g. "stage" or "group"). */
  readonly labelNoun: string;
}

function applyStageScope(state: CollapseState, cfg: StageScopeConfig): void {
  for (const parent of document.querySelectorAll<HTMLElement>(cfg.parentSelector)) {
    const stageName = parent.dataset[cfg.stageAttrKey];
    if (stageName === undefined) continue;
    const swim = parent.closest<HTMLElement>('.swim[data-lane-id]');
    const laneId = swim?.dataset.laneId;
    if (laneId === undefined) continue;
    const stages = state.stages.get(laneId);
    const collapsed = stages !== undefined && stages.has(stageName);
    parent.classList.toggle('collapsed', collapsed);
    const chev = parent.querySelector<HTMLButtonElement>(cfg.chevSelector);
    if (chev !== null) {
      chev.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      chev.setAttribute(
        'aria-label',
        `${collapsed ? 'Expand' : 'Collapse'} ${stageName} ${cfg.labelNoun}`,
      );
    }
  }
}

function persist(state: CollapseState, projectKey: string): void {
  writeStoredLanes(laneCollapseKey(projectKey), state.lanes);
  writeStoredStages(stageCollapseKey(projectKey), state.stages);
}

function toggleLane(state: CollapseState, laneId: string): void {
  if (state.lanes.has(laneId)) {
    state.lanes.delete(laneId);
  } else {
    state.lanes.add(laneId);
  }
}

function toggleStage(
  state: CollapseState,
  laneId: string,
  stageName: string,
): void {
  let stages = state.stages.get(laneId);
  if (stages === undefined) {
    stages = new Set<string>();
    state.stages.set(laneId, stages);
  }
  if (stages.has(stageName)) {
    stages.delete(stageName);
    if (stages.size === 0) state.stages.delete(laneId);
  } else {
    stages.add(stageName);
  }
}

/**
 * Resolve a click/keyboard activation on a chevron OR on its
 * enclosing head into a lane-or-stage toggle. Returns true when a
 * toggle fired so the caller can persist + reapply.
 */
function dispatchToggle(
  state: CollapseState,
  target: HTMLElement,
): boolean {
  // Prefer the chevron's data attributes when the click landed on
  // (or inside) one — that's the authoritative source.
  const chev = target.closest<HTMLElement>('.collapse-chev');
  if (chev !== null) {
    const scope = chev.dataset.collapseTarget;
    const laneId = chev.dataset.laneId;
    if (laneId === undefined) return false;
    if (scope === 'lane') {
      toggleLane(state, laneId);
      return true;
    }
    if (scope === 'stage') {
      const stageName = chev.dataset.stageName;
      if (stageName === undefined) return false;
      toggleStage(state, laneId, stageName);
      return true;
    }
    return false;
  }

  // Fall back to the head element — clicking anywhere on the head
  // (per the affordance contract) toggles the affordance.
  const stageHead = target.closest<HTMLElement>('.stage-head');
  if (stageHead !== null) {
    const col = stageHead.closest<HTMLElement>('.stage-col[data-stage-col]');
    const stageName = col?.dataset.stageCol;
    const swim = col?.closest<HTMLElement>('.swim[data-lane-id]');
    const laneId = swim?.dataset.laneId;
    if (laneId === undefined || stageName === undefined) return false;
    toggleStage(state, laneId, stageName);
    return true;
  }

  // List-body group head — same per-stage contract, different
  // parent element. Per Task 5.1B the lane:stage state is shared
  // with kanban so the toggle applies across both views.
  const groupHead = target.closest<HTMLElement>('.lb-group-head');
  if (groupHead !== null) {
    const group = groupHead.closest<HTMLElement>('.lb-group[data-lb-group]');
    const stageName = group?.dataset.lbGroup;
    const swim = group?.closest<HTMLElement>('.swim[data-lane-id]');
    const laneId = swim?.dataset.laneId;
    if (laneId === undefined || stageName === undefined) return false;
    toggleStage(state, laneId, stageName);
    return true;
  }

  const swimHead = target.closest<HTMLElement>('.swim-head');
  if (swimHead !== null) {
    const swim = swimHead.closest<HTMLElement>('.swim[data-lane-id]');
    const laneId = swim?.dataset.laneId;
    if (laneId === undefined) return false;
    toggleLane(state, laneId);
    return true;
  }

  return false;
}

/**
 * Stage-level dispatch: when the click is inside the stage-head OR
 * the column is currently collapsed (so any click on the narrow
 * strip should re-expand), fire the stage toggle. Otherwise the
 * click is on a card inside an expanded column — defer to the
 * card's own handler.
 */
function dispatchToggleStage(
  state: CollapseState,
  target: HTMLElement,
  col: HTMLElement,
): boolean {
  const stageName = col.dataset.stageCol;
  const swim = col.closest<HTMLElement>('.swim[data-lane-id]');
  const laneId = swim?.dataset.laneId;
  if (laneId === undefined || stageName === undefined) return false;

  const inHead = target.closest<HTMLElement>('.stage-head') !== null;
  const isCollapsed = col.classList.contains('collapsed');
  if (!inHead && !isCollapsed) return false;

  toggleStage(state, laneId, stageName);
  return true;
}

/**
 * List-body group dispatch: mirror of `dispatchToggleStage` but
 * scoped to `.lb-group` containers. The list-body lb-row carries
 * its own `<a>` semantics (open the entry-review surface), so the
 * group toggle fires only when the click lands on the group head
 * — clicking a row navigates instead of collapsing the group.
 */
function dispatchToggleListGroup(
  state: CollapseState,
  target: HTMLElement,
  group: HTMLElement,
): boolean {
  const stageName = group.dataset.lbGroup;
  const swim = group.closest<HTMLElement>('.swim[data-lane-id]');
  const laneId = swim?.dataset.laneId;
  if (laneId === undefined || stageName === undefined) return false;

  const inHead = target.closest<HTMLElement>('.lb-group-head') !== null;
  if (!inHead) return false;

  toggleStage(state, laneId, stageName);
  return true;
}

function bindHandlers(state: CollapseState, projectKey: string): void {
  // Lane-level: click on swim-head (anywhere) toggles. The chevron is
  // a child of the swim-head so its click bubbles through this handler.
  // The 5.1B view-toggle + 5.1C compose chip will live inside the
  // same swim-head; once they ship their own click handlers will need
  // to `event.stopPropagation()` so the lane-collapse handler doesn't
  // fire on their gestures.
  for (const head of document.querySelectorAll<HTMLElement>('.swim-head')) {
    head.addEventListener('click', (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      if (!dispatchToggle(state, target)) return;
      applyCollapseState(state);
      persist(state, projectKey);
    });
  }

  // Per-stage: click anywhere on the stage-col toggles. The stage-
  // head + chevron are children of stage-col so their clicks bubble
  // through. When the column is collapsed (narrow vertical strip,
  // mockup line 612 `.stage-col.collapsed { cursor: pointer }`)
  // clicking anywhere on the strip re-expands it; `dispatchToggle`'s
  // fallback covers that via `target.closest('.stage-head')`.
  // Cards inside an expanded column carry their own click handlers
  // and use stopPropagation; the toggle fires only on stage-head
  // gestures and on the collapsed-strip background.
  for (const col of document.querySelectorAll<HTMLElement>('.stage-col')) {
    col.addEventListener('click', (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      if (!dispatchToggleStage(state, target, col)) return;
      applyCollapseState(state);
      persist(state, projectKey);
    });
  }

  // Per-stage (list-body scope): click on the `.lb-group-head`
  // toggles. The list-body has `.lb-row` anchor links inside the
  // group; clicking a row navigates via its own `<a>` semantics —
  // `dispatchToggleListGroup` only fires when the target is inside
  // the head so a row click doesn't accidentally collapse its
  // group on the way to the entry-review surface.
  for (const group of document.querySelectorAll<HTMLElement>('.lb-group[data-lb-group]')) {
    group.addEventListener('click', (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      if (!dispatchToggleListGroup(state, target, group)) return;
      applyCollapseState(state);
      persist(state, projectKey);
    });
  }

  // Keyboard: Enter + Space on the chevron buttons activate the
  // toggle. The `<button>` element gets click-on-Enter for free; we
  // bind Space explicitly so we can preventDefault the page scroll
  // (per WCAG 2.1 SC 2.1.1 keyboard accessibility — the focusable
  // button must not trigger an unrelated default action).
  for (const chev of document.querySelectorAll<HTMLButtonElement>('.collapse-chev')) {
    chev.addEventListener('keydown', (ev) => {
      if (ev.key !== ' ') return;
      ev.preventDefault();
      if (!dispatchToggle(state, chev)) return;
      applyCollapseState(state);
      persist(state, projectKey);
    });
  }
}

/**
 * Module-level singleton — written by `initSwimlaneCollapse`,
 * mutated in-place by `reapplyCollapseFromStorage` so the bound
 * `swim-head` / `stage-col` click handlers (which closure-capture
 * the state object) keep operating on the same Sets / Maps after a
 * preset apply. See `swimlane.ts:activeState` for the same pattern
 * + rationale.
 *
 * Per AUDIT-20260528-37 (F5): tests that mutate this singleton must
 * reset DOM + storage in `beforeEach` so cross-describe-block state
 * does not leak. There is no `resetActiveState()` export — the
 * singleton's lifecycle is bound to `initSwimlaneCollapse`, which
 * reassigns it. Rebuilding the page shell + re-invoking init is the
 * sanctioned reset path.
 */
let activeState: CollapseState | null = null;

/**
 * Re-read storage + re-apply to the DOM. Used by the Task 5.5
 * preset controller after writing through the lane-collapse + stage-
 * collapse storage keys. No-op when `initSwimlaneCollapse` hasn't
 * fired yet (controllers run in order at DOMContentLoaded).
 */
export function reapplyCollapseFromStorage(): void {
  if (activeState === null) return;
  const shell = document.querySelector<HTMLElement>('[data-bay-shell]');
  if (shell === null) return;
  const projectKey = resolveProjectKey(shell);

  const nextLanes = readStoredLanes(laneCollapseKey(projectKey));
  const nextStages = readStoredStages(stageCollapseKey(projectKey));

  // Mutate the singleton in-place so already-bound handlers see the
  // new lane + stage state through their closure-captured references.
  activeState.lanes.clear();
  for (const id of nextLanes) activeState.lanes.add(id);
  activeState.stages.clear();
  for (const [laneId, stages] of nextStages) {
    activeState.stages.set(laneId, stages);
  }
  applyCollapseState(activeState);
}

/**
 * Entry point — wire collapse-chev handlers + restore persisted
 * state. No-op when there's no bay-shell on the page.
 */
export function initSwimlaneCollapse(): void {
  const shell = document.querySelector<HTMLElement>('[data-bay-shell]');
  if (shell === null) return;

  const projectKey = resolveProjectKey(shell);
  const state: CollapseState = {
    lanes: readStoredLanes(laneCollapseKey(projectKey)),
    stages: readStoredStages(stageCollapseKey(projectKey)),
  };
  activeState = state;

  applyCollapseState(state);
  bindHandlers(state, projectKey);
}
