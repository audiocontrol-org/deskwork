/**
 * Lane-reorder shared primitives + keyboard-accessible up/down buttons
 * (AUDIT-20260528-31).
 *
 * This module owns the side-effect-free building blocks of the lane
 * reorder pipeline:
 *
 *   - storage helpers (`orderKey`, `readStoredOrder`, `writeStoredOrder`)
 *   - pure `computeReorder` / `orderEquals` / `reconcileOrder`
 *   - DOM-mutating `reorderRail` / `reorderFocusStrip` / `reorderBay`
 *   - the new `initSwimlaneReorderButtons` controller for the per-row
 *     `▲` / `▼` keyboard-reachable affordance pair.
 *
 * `swimlane-drag.ts` imports these primitives to implement the existing
 * mouse drag-and-drop reorder path. The reorder-button controller in
 * this file reuses the same primitives so the two affordance paths
 * (mouse DnD and keyboard buttons) finalize order byte-identically:
 * same storage key, same DOM reorder sequence, same no-op short-circuit.
 *
 * Per `.claude/rules/affordance-placement.md`, the up/down buttons live
 * ON the row's chrome alongside the existing `.r-eye-btn` and
 * `.rail-drag` handle — not in a separate toolbar. Per WCAG 2.2 SC 2.5.8
 * the hit area is ≥24×24 CSS px (enforced in CSS via min-width / min-
 * height); per WCAG 2.1 SC 2.4.7 the focus ring mirrors `.r-eye-btn`.
 *
 * The Enter key is handled natively by `<button>`. Space is handled
 * explicitly to call `preventDefault` and suppress the default page-
 * scroll on Space (mirrors the rail row's keyboard pattern in
 * `swimlane.ts:bindRailEyeToggles`).
 *
 * The AUDIT-06 fix in `swimlane.ts` makes the row's keydown handler
 * skip events targeting interactive descendants. Native `<button>`s
 * qualify, so clicks/keydown on these buttons do NOT bubble into the
 * row's focus-toggle path — the existing guard is what keeps the two
 * affordances independent.
 */

import {
  readStoredStringArray,
  STORAGE_KEY_PREFIX,
  writeJsonOrIgnore,
} from './swimlane-storage.ts';

const ORDER_KEY_SUFFIX = ':lane-order';

export function orderKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + ORDER_KEY_SUFFIX;
}

// Delegates to the shared string-array reader in swimlane-storage.ts.
// The lane order surface keeps the positional array (order matters);
// the focus / hidden surface in swimlane.ts projects into a Set.
export const readStoredOrder = readStoredStringArray;

// Per AUDIT-20260530-49 — `writeStoredOrder` was a near-identical copy
// of the `writePresets` + `writeJsonOrIgnore` try/catch shape. It now
// delegates to the shared `writeJsonOrIgnore` in `swimlane-storage.ts`
// so all four write call sites in the dashboard share one
// implementation. The reorder controllers don't branch on persistence
// success (the in-DOM reorder runs unconditionally and the operator
// only loses persistence across reloads on a swallowed failure), so the
// boolean return is dropped here.
export function writeStoredOrder(key: string, value: readonly string[]): void {
  writeJsonOrIgnore(key, value);
}

/**
 * Reconcile a stored order with the current lane set. The stored
 * order wins only when EVERY stored id is present in the live set;
 * otherwise the live (server-rendered) order is the source of truth.
 * Lanes added on disk since the stored order was written are
 * appended at the tail.
 */
export function reconcileOrder(
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

export function collectRailLanes(rail: HTMLElement): string[] {
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

export function reorderRail(
  rail: HTMLElement,
  order: readonly string[],
): void {
  reorderChildren(
    rail,
    (child) => {
      if (!child.classList.contains('rail-lane')) return null;
      return child.dataset.railLane ?? null;
    },
    order,
  );
}

export function reorderFocusStrip(order: readonly string[]): void {
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

export function reorderBay(order: readonly string[]): void {
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

/**
 * Strict positional equality on two lane-order arrays. Used by the
 * drop / button handlers to detect no-op operations so we don't
 * bother writing the unchanged array back to localStorage.
 */
export function orderEquals(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Shared finalize step: apply the new order to the DOM (rail + focus
 * strip + bay) and persist to localStorage. No-op when the new order
 * equals the current order — same contract as the drop handler's
 * post-`computeReorder` short-circuit (AUDIT-20260528-29). Returns
 * `true` when the order changed and was committed; `false` on no-op.
 */
export function applyOrderChange(
  rail: HTMLElement,
  projectKey: string,
  currentOrder: readonly string[],
  nextOrder: readonly string[],
): boolean {
  if (orderEquals(currentOrder, nextOrder)) return false;
  reorderRail(rail, nextOrder);
  reorderFocusStrip(nextOrder);
  reorderBay(nextOrder);
  writeStoredOrder(orderKey(projectKey), nextOrder);
  return true;
}

/**
 * Mutable reorder state shared between the drag controller and the
 * button controller. Both controllers hold a reference to the same
 * object so each gesture's persisted result is visible to the next
 * gesture from either path.
 */
export interface ReorderState {
  order: string[];
  draggingId: string | null;
}

/**
 * Swap two adjacent ids in an order array and return the new order.
 * Used by the up/down button handlers — moving a row up swaps with
 * its predecessor; moving down swaps with its successor.
 *
 * Returns the input order unchanged when:
 *   - the id is not in the order array,
 *   - moving up from the first position,
 *   - moving down from the last position.
 */
export function swapAdjacent(
  order: readonly string[],
  id: string,
  direction: 'up' | 'down',
): readonly string[] {
  const idx = order.indexOf(id);
  if (idx === -1) return order;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= order.length) return order;
  const next = [...order];
  const tmp = next[idx];
  const other = next[swapIdx];
  if (tmp === undefined || other === undefined) return order;
  next[idx] = other;
  next[swapIdx] = tmp;
  return next;
}

/**
 * Update the `disabled` + `aria-disabled` state on every row's
 * up/down buttons based on the lane's current position. Top row's
 * `▲` is disabled; bottom row's `▼` is disabled. Called after every
 * reorder so the disabled state stays in sync with the live order.
 *
 * Exported so the drag controller in `swimlane-drag.ts` can call it
 * after a drag-drop reorder without re-implementing the disabled-state
 * sweep.
 */
export function refreshReorderButtonDisabledState(rail: HTMLElement): void {
  const rows = Array.from(
    rail.querySelectorAll<HTMLElement>('[data-rail-lane]'),
  );
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row === undefined) continue;
    const upBtn = row.querySelector<HTMLButtonElement>('.r-move-up-btn');
    const downBtn = row.querySelector<HTMLButtonElement>('.r-move-down-btn');
    const isTop = i === 0;
    const isBottom = i === rows.length - 1;
    if (upBtn !== null) {
      upBtn.disabled = isTop;
      upBtn.setAttribute('aria-disabled', isTop ? 'true' : 'false');
    }
    if (downBtn !== null) {
      downBtn.disabled = isBottom;
      downBtn.setAttribute('aria-disabled', isBottom ? 'true' : 'false');
    }
  }
}

function moveLane(
  rail: HTMLElement,
  projectKey: string,
  state: ReorderState,
  id: string,
  direction: 'up' | 'down',
): void {
  const next = swapAdjacent(state.order, id, direction);
  const changed = applyOrderChange(rail, projectKey, state.order, next);
  if (changed) {
    state.order = [...next];
    refreshReorderButtonDisabledState(rail);
  }
}

function bindRowButtons(
  row: HTMLElement,
  rail: HTMLElement,
  projectKey: string,
  state: ReorderState,
): void {
  const id = row.dataset.railLane;
  if (id === undefined) return;

  const upBtn = row.querySelector<HTMLButtonElement>('.r-move-up-btn');
  const downBtn = row.querySelector<HTMLButtonElement>('.r-move-down-btn');

  // Click handler (handles mouse + Enter — native <button> activates
  // on Enter by default). Native click also `stopPropagation` so the
  // row's click handler (focus-toggle in swimlane.ts) doesn't fire on
  // the same gesture, mirroring `.r-eye-btn`.
  if (upBtn !== null) {
    upBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (upBtn.disabled) return;
      moveLane(rail, projectKey, state, id, 'up');
    });
    // Space handler: prevent the default page-scroll on Space; the
    // native <button> handles Enter by default but Space's default is
    // page-scroll. Mirror the rail row's pattern in swimlane.ts.
    upBtn.addEventListener('keydown', (ev) => {
      if (ev.key !== ' ') return;
      ev.preventDefault();
      ev.stopPropagation();
      if (upBtn.disabled) return;
      moveLane(rail, projectKey, state, id, 'up');
    });
  }

  if (downBtn !== null) {
    downBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (downBtn.disabled) return;
      moveLane(rail, projectKey, state, id, 'down');
    });
    downBtn.addEventListener('keydown', (ev) => {
      if (ev.key !== ' ') return;
      ev.preventDefault();
      ev.stopPropagation();
      if (downBtn.disabled) return;
      moveLane(rail, projectKey, state, id, 'down');
    });
  }
}

/**
 * Wire per-row up/down buttons. The rail must already be initialized
 * (rows + buttons rendered). Shares the `ReorderState` with
 * `initSwimlaneDrag` so the two affordance paths stay in sync.
 *
 * Idempotent disabled-state seed: walks every row once on init and
 * sets the top row's `▲` + bottom row's `▼` to disabled. Subsequent
 * reorders re-run the same logic via `refreshReorderButtonDisabledState`.
 */
export function initSwimlaneReorderButtons(
  rail: HTMLElement,
  projectKey: string,
  state: ReorderState,
): void {
  for (const row of rail.querySelectorAll<HTMLElement>('[data-rail-lane]')) {
    bindRowButtons(row, rail, projectKey, state);
  }
  refreshReorderButtonDisabledState(rail);
}
