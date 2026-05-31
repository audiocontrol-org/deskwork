/**
 * Lane reorder (drag-to-reorder) controller — Phase 5 Task 5.4.
 *
 * Wires HTML5 native drag-and-drop on the lane-visibility rail so the
 * operator can reorder lanes by dragging a `.rail-lane` row up or
 * down. The new order:
 *
 *   - reorders the rail rows in the DOM (visible reorder),
 *   - reorders the focus-chip strip (`.focus-chip[data-focus-chip]`)
 *     to match, so the operator's mental model of "chip order
 *     mirrors rail order" is preserved across reorder gestures,
 *   - reorders the per-lane swim + stub pairs inside the bay so the
 *     bay column matches the new rail order,
 *   - persists to localStorage as `string[]` of lane ids under
 *     `deskwork:dashboard:v2:<projectKey>:lane-order` — per-operator,
 *     per-project (matches the other 5.x state idioms — visibility,
 *     focus, view-mode, collapse, compose). PRD `Two split state
 *     axes for lanes` leaves `.deskwork/lane-order.json` (project-
 *     wide) open as a Phase 6 enhancement; localStorage is the
 *     Phase 5 ship.
 *
 * Per `.claude/rules/affordance-placement.md`, the drag handle is ON
 * the rail row (`.rail-drag` glyph + `cursor: grab`), not in a
 * separate toolbar. HTML5 DnD requires `draggable="true"` on the
 * source root (`.rail-lane`), so the entire row is grabbable —
 * pragmatic given the browser contract; the visible handle anchors
 * the operator's mental model.
 *
 * Per THESIS Consequence 2 (no sidecar mutation): order is pure
 * client-side state. No CLI calls; no `writeSidecar`; no
 * `journal.append`. The order surfaces in the operator's local view
 * only — collaborators see their own ordering.
 *
 * Drop targeting: dragover over a target row computes the cursor's
 * Y vs the target's `getBoundingClientRect()` midpoint and applies
 * `.drop-target-above` or `.drop-target-below` for visual feedback
 * (CSS draws an insertion hairline on the corresponding edge).
 *
 * Restoration: on init, the stored order (if any) wins over the
 * server-rendered order. The validity check (every stored id present
 * in the live lane set) prevents stale order entries from breaking
 * the reorder pass when a lane is removed on disk; mismatch
 * collapses to the server order.
 *
 * Per AUDIT-20260528-31, the keyboard-accessible reorder affordance
 * (per-row `▲` / `▼` buttons) ships alongside this drag controller.
 * The button controller lives in `swimlane-reorder.ts` and shares the
 * same `ReorderState` instance so the two paths stay in sync.
 */

import { resolveProjectKey } from './swimlane-storage.ts';
import {
  applyOrderChange,
  collectRailLanes,
  computeReorder,
  initSwimlaneReorderButtons,
  orderKey,
  readStoredOrder,
  reconcileOrder,
  refreshReorderButtonDisabledState,
  reorderBay,
  reorderFocusStrip,
  reorderRail,
  type ReorderState,
} from './swimlane-reorder.ts';

// Re-export the pure `computeReorder` so existing imports (notably
// the unit test at packages/studio/test/dashboard-swimlane-drag-
// client.test.ts) keep their module path stable post-split.
export { computeReorder };

function clearDropTargets(rail: HTMLElement): void {
  for (const row of rail.querySelectorAll<HTMLElement>('.rail-lane')) {
    row.classList.remove('drop-target-above', 'drop-target-below');
  }
}

function findRowFromTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const closest = target.closest<HTMLElement>('[data-rail-lane]');
  return closest;
}

/**
 * Shared HTML5-DnD precondition resolver for `dragover` and `drop`:
 * both events bail when not actively dragging, otherwise resolve the
 * target lane id from the event and `preventDefault` (required by
 * HTML5 DnD to allow the subsequent drop). Returns the target row +
 * id when the event should proceed; null when it should be ignored.
 */
function resolveDropTarget(
  ev: DragEvent,
  state: ReorderState,
): { row: HTMLElement; id: string } | null {
  if (state.draggingId === null) return null;
  const row = findRowFromTarget(ev.target);
  if (row === null) return null;
  const id = row.dataset.railLane;
  if (id === undefined) return null;
  ev.preventDefault();
  return { row, id };
}

function bindDragHandlers(
  rail: HTMLElement,
  projectKey: string,
  state: ReorderState,
): void {
  rail.addEventListener('dragstart', (ev) => {
    const row = findRowFromTarget(ev.target);
    if (row === null) return;
    const id = row.dataset.railLane;
    if (id === undefined) return;
    // Per AUDIT-20260528-30 — if a previous drag's `dragend` failed
    // to fire (browser quirks: disconnect mid-drag, page navigation,
    // dev-tools-cancellation), a stale `.is-dragging` class may
    // survive on an old row. Sweep before stamping the new source so
    // the visual state matches the actual drag.
    for (const stale of rail.querySelectorAll('.is-dragging')) {
      stale.classList.remove('is-dragging');
    }
    state.draggingId = id;
    row.classList.add('is-dragging');
    if (ev.dataTransfer !== null) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', id);
    }
  });

  rail.addEventListener('dragover', (ev) => {
    const resolved = resolveDropTarget(ev, state);
    if (resolved === null) return;
    if (ev.dataTransfer !== null) ev.dataTransfer.dropEffect = 'move';
    if (resolved.id === state.draggingId) {
      clearDropTargets(rail);
      return;
    }
    const rect = resolved.row.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: 'above' | 'below' = ev.clientY < midY ? 'above' : 'below';
    clearDropTargets(rail);
    resolved.row.classList.add(
      position === 'above' ? 'drop-target-above' : 'drop-target-below',
    );
  });

  rail.addEventListener('dragleave', (ev) => {
    // dragleave fires per-row; only clear when the cursor leaves the
    // rail entirely. relatedTarget is the element the cursor entered;
    // null means "left the document"; outside the rail means "left
    // the rail."
    const next = ev.relatedTarget;
    if (next instanceof Node && rail.contains(next)) return;
    clearDropTargets(rail);
  });

  rail.addEventListener('drop', (ev) => {
    const resolved = resolveDropTarget(ev, state);
    if (resolved === null || state.draggingId === null) return;
    const rect = resolved.row.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: 'above' | 'below' = ev.clientY < midY ? 'above' : 'below';
    const next = computeReorder(
      state.order,
      state.draggingId,
      resolved.id,
      position,
    );
    // Per AUDIT-20260528-29 — skip the DOM reorder + localStorage
    // write when the drop didn't move anything (same source as
    // target, or computeReorder short-circuited). `is-visibility-
    // hidden` / `is-focus-hidden` / `aria-pressed` classes survive
    // `appendChild` moves on a per-id basis, so no `applyState` call
    // is needed after the reorder; the appended class state IS the
    // state.
    const changed = applyOrderChange(rail, projectKey, state.order, next);
    if (changed) {
      state.order = [...next];
      // Per AUDIT-20260528-31 the reorder-button disabled state
      // (top-row `▲` / bottom-row `▼`) must refresh after EVERY
      // reorder gesture — including drag drops, not just button
      // clicks. The shared sweep lives in `swimlane-reorder.ts` so
      // the keyboard path and drag path use the same code.
      refreshReorderButtonDisabledState(rail);
    }
    clearDropTargets(rail);
  });

  rail.addEventListener('dragend', () => {
    if (state.draggingId !== null) {
      // Per AUDIT-20260528-28 — escape the id via CSS.escape; lane
      // ids are operator-authored (`.deskwork/lanes/<id>.json`) and
      // are not constrained to alphanumeric. An id containing `"`,
      // `]`, or `\` would break the attribute selector. Mirrors the
      // CSS.escape usage in `swimlane.ts:138,141` for the same
      // data dictionary.
      const sourceRow = rail.querySelector<HTMLElement>(
        `[data-rail-lane="${CSS.escape(state.draggingId)}"]`,
      );
      if (sourceRow !== null) sourceRow.classList.remove('is-dragging');
    }
    state.draggingId = null;
    clearDropTargets(rail);
  });
}

/**
 * Entry point — wire reorder controller on the lane rail. No-op when
 * the bay shell or rail is absent. Applies any stored order on init
 * so reload restores the operator's reordering. Also wires the per-
 * row up/down buttons (AUDIT-20260528-31) so keyboard operators can
 * reorder via Enter / Space on `▲` / `▼`.
 */
export function initSwimlaneDrag(): void {
  const shell = document.querySelector<HTMLElement>('[data-bay-shell]');
  if (shell === null) return;
  const rail = document.querySelector<HTMLElement>('[data-lane-rail]');
  if (rail === null) return;
  const live = collectRailLanes(rail);
  if (live.length === 0) return;

  const projectKey = resolveProjectKey(shell);
  const stored = readStoredOrder(orderKey(projectKey));
  const initial = reconcileOrder(stored, live);

  // Apply the reconciled order on init (only when it differs from
  // the live server-rendered order). When stored === live the apply
  // is a no-op; when stored is a strict subset / superset the live
  // order wins (per `reconcileOrder`'s validity check).
  const orderChanged
    = initial.length !== live.length
      || initial.some((id, idx) => id !== live[idx]);
  if (orderChanged) {
    reorderRail(rail, initial);
    reorderFocusStrip(initial);
    reorderBay(initial);
  }

  const state: ReorderState = {
    order: [...initial],
    draggingId: null,
  };

  bindDragHandlers(rail, projectKey, state);
  initSwimlaneReorderButtons(rail, projectKey, state);
}
