/**
 * Mobile lane-stack accordion controller — Phase 5 Task 5.1B
 * mobile-variant (AUDIT-20260528-10).
 *
 * Closes AUDIT-20260528-10: the brief contracts a vertical lane-
 * stack of accordion sections on mobile (`docs/studio-design/
 * ACCEPTED/2026-05-27-multi-lane-dashboard-d3-press-bay/brief.md:14`).
 * This controller wires the `<header class="lane-head">` ↔ `<div
 * class="lane-body">` accordion contract:
 *
 *   - Click anywhere on the lane-head (except inner controls that
 *     stop propagation) toggles the lane-body's `[hidden]` attribute
 *     AND flips `aria-expanded` on the head's chevron.
 *   - Keyboard activation (Enter / Space) on the chevron dispatches
 *     the same toggle; the chevron is a real `<button>` so Enter is
 *     free.
 *   - State is persisted in localStorage namespaced per project so
 *     the operator's collapsed-lane choices survive reloads.
 *
 * The compose chip (`.lh-compose`) and view-toggle (`.lh-view-toggle`)
 * inside the lane-head share data attributes with the desktop
 * affordances, so `initSwimlaneCompose` and `initSwimlaneViewToggle`
 * wire them transparently — no separate binding needed here. Those
 * controllers stop propagation on their own clicks so the lane-head
 * accordion handler does NOT fire when an operator taps a chip.
 *
 * Per `.claude/rules/affordance-placement.md`: the chevron lives ON
 * the lane-head, not in a separate toolbar.
 *
 * Per the brief: `hidden` attribute (not CSS-only `display: none`)
 * so screen readers skip collapsed bodies — the accessible-name
 * contract is preserved without paint-only hide.
 */

import {
  resolveProjectKey,
  STORAGE_KEY_PREFIX,
} from './swimlane-storage.ts';

const LANE_STACK_COLLAPSE_KEY_SUFFIX = ':lane-stack-collapse';

interface LaneStackState {
  /** Set of lane ids whose lane-section is collapsed in the mobile lane-stack. */
  readonly collapsed: Set<string>;
}

function laneStackCollapseKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + LANE_STACK_COLLAPSE_KEY_SUFFIX;
}

function readStoredCollapsed(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const out = new Set<string>();
    for (const item of parsed) {
      if (typeof item === 'string') out.add(item);
    }
    return out;
  } catch {
    return new Set();
  }
}

function writeStoredCollapsed(key: string, value: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(value)));
  } catch {
    // localStorage unavailable — in-page state still works.
  }
}

/**
 * Apply the current collapse state to every lane-section in the DOM.
 * Walks `.lane-section[data-lane-id]` elements and flips the
 * `[hidden]` attribute on the matching `[data-lane-body]` + the
 * `aria-expanded` attribute on the matching `[data-collapse-target
 * ="lane-section"]` chevron.
 */
function applyLaneStackState(state: LaneStackState): void {
  for (const section of document.querySelectorAll<HTMLElement>(
    '.lane-section[data-lane-id]',
  )) {
    const laneId = section.dataset.laneId;
    if (laneId === undefined) continue;
    const collapsed = state.collapsed.has(laneId);
    const body = section.querySelector<HTMLElement>('[data-lane-body]');
    if (body !== null) {
      body.hidden = collapsed;
    }
    const chev = section.querySelector<HTMLButtonElement>(
      '.lane-head .collapse-chev[data-collapse-target="lane-section"]',
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
}

function toggleLaneSection(state: LaneStackState, laneId: string): void {
  if (state.collapsed.has(laneId)) {
    state.collapsed.delete(laneId);
  } else {
    state.collapsed.add(laneId);
  }
}

/**
 * Resolve a click / keyboard activation on a lane-head element into
 * a lane-section toggle. Returns true when the gesture fired so the
 * caller can persist + reapply.
 */
function dispatchToggle(
  state: LaneStackState,
  target: HTMLElement,
): boolean {
  // Prefer the chevron's data attributes when the click landed on
  // (or inside) one — that's the authoritative source.
  const chev = target.closest<HTMLElement>(
    '.collapse-chev[data-collapse-target="lane-section"]',
  );
  if (chev !== null) {
    const laneId = chev.dataset.laneId;
    if (laneId === undefined) return false;
    toggleLaneSection(state, laneId);
    return true;
  }

  // Fall back to the lane-head — clicking anywhere on the head (per
  // the affordance contract) toggles the lane-section, EXCEPT when
  // the click landed on an inner interactive control (compose chip,
  // view-toggle). Those controls handle their own stopPropagation,
  // but we add a belt-and-suspenders guard so the accordion never
  // fires on a chip click that bubbled accidentally.
  const head = target.closest<HTMLElement>('.lane-head[data-lane-head]');
  if (head !== null) {
    if (
      target.closest(
        'button:not(.collapse-chev), a[href], input, select, textarea, [role="radiogroup"], [role="radio"]',
      ) !== null
    ) {
      return false;
    }
    const section = head.closest<HTMLElement>(
      '.lane-section[data-lane-id]',
    );
    const laneId = section?.dataset.laneId;
    if (laneId === undefined) return false;
    toggleLaneSection(state, laneId);
    return true;
  }

  return false;
}

function persist(state: LaneStackState, projectKey: string): void {
  writeStoredCollapsed(laneStackCollapseKey(projectKey), state.collapsed);
}

function bindLaneHeadHandlers(
  state: LaneStackState,
  projectKey: string,
): void {
  for (const head of document.querySelectorAll<HTMLElement>(
    '.lane-head[data-lane-head]',
  )) {
    head.addEventListener('click', (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      if (!dispatchToggle(state, target)) return;
      applyLaneStackState(state);
      persist(state, projectKey);
    });
  }

  // Keyboard activation on the chevron — Enter is free via the
  // native `<button>` contract; Space we wire explicitly so we can
  // preventDefault the page scroll (per WCAG 2.1 SC 2.1.1).
  for (const chev of document.querySelectorAll<HTMLButtonElement>(
    '.lane-head .collapse-chev[data-collapse-target="lane-section"]',
  )) {
    chev.addEventListener('keydown', (ev) => {
      if (ev.key !== ' ') return;
      ev.preventDefault();
      if (!dispatchToggle(state, chev)) return;
      applyLaneStackState(state);
      persist(state, projectKey);
    });
  }
}

/**
 * Entry point — wire lane-stack accordion handlers + restore the
 * operator's persisted collapsed-lane state. No-op when there's no
 * bay-shell on the page OR when no lane-stack is present (the
 * controller runs on every dashboard load regardless of viewport
 * because both DOM trees are always server-rendered).
 */
export function initLaneStack(): void {
  const shell = document.querySelector<HTMLElement>('[data-bay-shell]');
  if (shell === null) return;
  const stack = document.querySelector<HTMLElement>('[data-lane-stack]');
  if (stack === null) return;

  const projectKey = resolveProjectKey(shell);
  const state: LaneStackState = {
    collapsed: readStoredCollapsed(laneStackCollapseKey(projectKey)),
  };

  applyLaneStackState(state);
  bindLaneHeadHandlers(state, projectKey);
}
