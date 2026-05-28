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
 *     `deskwork:dashboard:<projectKey>:lane-order` — per-operator,
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
 */

import {
  readStoredStringArray,
  resolveProjectKey,
  STORAGE_KEY_PREFIX,
} from './swimlane-storage.ts';

const ORDER_KEY_SUFFIX = ':lane-order';

function orderKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + ORDER_KEY_SUFFIX;
}

// Delegates to the shared string-array reader in swimlane-storage.ts.
// The lane order surface keeps the positional array (order matters);
// the focus / hidden surface in swimlane.ts projects into a Set.
const readStoredOrder = readStoredStringArray;

function writeStoredOrder(key: string, value: readonly string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable — the reorder still applies in-page;
    // the operator just loses persistence across reloads.
  }
}

/**
 * Reconcile a stored order with the current lane set. The stored
 * order wins only when EVERY stored id is present in the live set;
 * otherwise the live (server-rendered) order is the source of truth.
 * Lanes added on disk since the stored order was written are
 * appended at the tail.
 */
function reconcileOrder(
  stored: readonly string[] | null,
  live: readonly string[],
): readonly string[] {
  if (stored === null) return live;
  const liveSet = new Set(live);
  for (const id of stored) {
    if (!liveSet.has(id)) return live;
  }
  const storedSet = new Set(stored);
  const tail = live.filter((id) => !storedSet.has(id));
  return [...stored, ...tail];
}

function collectRailLanes(rail: HTMLElement): string[] {
  const ids: string[] = [];
  for (const el of rail.querySelectorAll<HTMLElement>('[data-rail-lane]')) {
    const id = el.dataset.railLane;
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

/**
 * Reorder DOM nodes within a parent so they appear in the given
 * sequence. Nodes outside the sequence (e.g. backdrop, headings,
 * other chrome) are left in place — appendChild on a node already in
 * the parent moves it to the end, so we append each target node in
 * sequence to land them in order at the tail. Non-target siblings
 * remain at their original positions.
 *
 * Caller provides:
 *   - `parent`: the element whose direct children include the targets,
 *   - `idForChild`: a function returning the order-id of a child or
 *     null when the child is not a target node.
 *   - `desiredOrder`: the sequence of ids the targets should appear
 *     in (left-to-right / top-to-bottom).
 */
function reorderChildren(
  parent: HTMLElement,
  idForChild: (child: HTMLElement) => string | null,
  desiredOrder: readonly string[],
): void {
  const byId = new Map<string, HTMLElement>();
  for (const child of Array.from(parent.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const id = idForChild(child);
    if (id !== null) byId.set(id, child);
  }
  for (const id of desiredOrder) {
    const el = byId.get(id);
    if (el !== undefined) parent.appendChild(el);
  }
}

function reorderRail(rail: HTMLElement, order: readonly string[]): void {
  reorderChildren(
    rail,
    (child) => {
      if (!child.classList.contains('rail-lane')) return null;
      return child.dataset.railLane ?? null;
    },
    order,
  );
}

function reorderFocusStrip(order: readonly string[]): void {
  const strip = document.querySelector<HTMLElement>('[data-focus-strip]');
  if (strip === null) return;
  reorderChildren(
    strip,
    (child) => {
      const id = child.dataset.focusChip;
      // The "All" chip carries `data-focus-chip-all`, not `data-focus-
      // chip`; skipping it leaves it pinned at its original position
      // (before the strip-divider), which matches the operator's
      // mental model — "All" is not a lane.
      return id ?? null;
    },
    order,
  );
}

function reorderBay(order: readonly string[]): void {
  const bay = document.querySelector<HTMLElement>('[data-bay]');
  if (bay === null) return;
  // The bay holds (head, swim+stub pairs...). Each lane has TWO
  // direct-child nodes — the swim and the stub. Append the pair in
  // sequence so the bay column matches the rail order. Non-lane
  // siblings (bay-head, etc.) stay at their original positions
  // because we only move nodes whose id resolution returns non-null.
  const swimsById = new Map<string, HTMLElement>();
  const stubsById = new Map<string, HTMLElement>();
  for (const child of Array.from(bay.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.classList.contains('swim')) {
      const id = child.dataset.laneId;
      if (id !== undefined) swimsById.set(id, child);
    } else if (child.classList.contains('swim-stub')) {
      const id = child.dataset.swimStub;
      if (id !== undefined) stubsById.set(id, child);
    }
  }
  for (const id of order) {
    const swim = swimsById.get(id);
    if (swim !== undefined) bay.appendChild(swim);
    const stub = stubsById.get(id);
    if (stub !== undefined) bay.appendChild(stub);
  }
}

/**
 * Compute the desired new order after dropping `sourceId` relative
 * to a target row. `position === 'above'` inserts the source
 * directly before the target; `'below'` directly after. Source's
 * old slot is removed first so the new index counts from the post-
 * removal positions.
 */
export function computeReorder(
  order: readonly string[],
  sourceId: string,
  targetId: string,
  position: 'above' | 'below',
): readonly string[] {
  if (sourceId === targetId) return order;
  const without = order.filter((id) => id !== sourceId);
  const targetIdx = without.indexOf(targetId);
  if (targetIdx === -1) return order;
  const insertIdx = position === 'above' ? targetIdx : targetIdx + 1;
  return [
    ...without.slice(0, insertIdx),
    sourceId,
    ...without.slice(insertIdx),
  ];
}

function clearDropTargets(rail: HTMLElement): void {
  for (const row of rail.querySelectorAll<HTMLElement>('.rail-lane')) {
    row.classList.remove('drop-target-above', 'drop-target-below');
  }
}

/**
 * Strict positional equality on two lane-order arrays. Used by the
 * drop handler to detect no-op drops (same source-target or
 * `computeReorder` short-circuit) so we don't bother writing the
 * unchanged array back to localStorage.
 */
function orderEquals(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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
  state: DragControllerState,
): { row: HTMLElement; id: string } | null {
  if (state.draggingId === null) return null;
  const row = findRowFromTarget(ev.target);
  if (row === null) return null;
  const id = row.dataset.railLane;
  if (id === undefined) return null;
  ev.preventDefault();
  return { row, id };
}

interface DragControllerState {
  order: string[];
  draggingId: string | null;
}

function bindDragHandlers(
  rail: HTMLElement,
  projectKey: string,
  state: DragControllerState,
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
    const changed = !orderEquals(state.order, next);
    if (changed) {
      state.order = [...next];
      reorderRail(rail, state.order);
      reorderFocusStrip(state.order);
      reorderBay(state.order);
      writeStoredOrder(orderKey(projectKey), state.order);
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
 * so reload restores the operator's reordering.
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

  const state: DragControllerState = {
    order: [...initial],
    draggingId: null,
  };

  bindDragHandlers(rail, projectKey, state);
}
