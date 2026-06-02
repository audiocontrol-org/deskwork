/**
 * @vitest-environment jsdom
 *
 * Client-side controller tests for the lane reorder drag-and-drop
 * affordance — Phase 5 Task 5.4.
 *
 * Exercises `initSwimlaneDrag` against a synthesised DOM mirroring
 * the server-rendered rail + focus-strip + swim/stub pairs.
 *
 * Coverage in THIS file (the core DnD controller):
 *   - dragstart on a rail row sets `.is-dragging` and stashes the
 *     lane id via DataTransfer.
 *   - dragover on a different row preventDefaults and adds
 *     `.drop-target-above` or `.drop-target-below` based on cursor
 *     Y vs the row's midpoint.
 *   - drop reorders the rail rows, the focus-chip strip, and the
 *     swim+stub pairs in the bay AND persists to localStorage.
 *   - dragend clears all drag-related classes from every row.
 *   - On reload, a stored order pre-seeded in localStorage is
 *     applied — the DOM lands in the stored order before any
 *     drag gesture.
 *   - Reconciliation: stale ids are dropped, new lanes land at the
 *     tail.
 *   - AUDIT-20260528-29 / -27 / -30 invariants (no-op drop, dragleave
 *     class clearing, dragstart sweep of stale classes).
 *
 * The `computeReorder` pure-function tests live in
 * `dashboard-swimlane-drag-client-pure.test.ts` (no DOM dependency).
 * The AUDIT-20260528-31 reorder-button tests live in
 * `dashboard-swimlane-drag-client-reorder-buttons.test.ts`. Per
 * AUDIT-20260528-14 this 3-way split brings each file under the
 * 300-500 line cap.
 *
 * jsdom does NOT implement HTML5 DnD's DataTransfer object — the
 * helper builds a real DragEvent with a synthesised DataTransfer
 * (via Object.defineProperty so the controller can read/write the
 * field without runtime errors). All event + DOM helpers live in
 * `__helpers/dashboard-swimlane-drag-fixture.ts`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initSwimlaneDrag } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-drag';
import {
  ORDER_STORAGE_KEY,
  buildShell,
  dispatchDragEvent,
  getChipOrder,
  getLaneOrder,
  getRow,
  getSwimOrder,
  makeFakeDataTransfer,
} from './__helpers/dashboard-swimlane-drag-fixture.ts';

describe('swimlane drag client controller — Task 5.4', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  it('dragstart on a rail row sets .is-dragging + writes the lane id to DataTransfer', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    const row = getRow('mockups');
    const dt = makeFakeDataTransfer();
    dispatchDragEvent('dragstart', { target: row, clientY: 16, dataTransfer: dt });
    expect(row.classList.contains('is-dragging')).toBe(true);
    expect(dt.effectAllowed).toBe('move');
    expect(dt.getData('text/plain')).toBe('mockups');
  });

  it('dragover above the target midpoint adds .drop-target-above', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    const source = getRow('qa');
    const target = getRow('default');
    const dt = makeFakeDataTransfer();
    dispatchDragEvent('dragstart', { target: source, clientY: 80, dataTransfer: dt });
    // Target `default` is at top=0, bottom=32, midY=16. cursor at Y=8
    // is ABOVE the midpoint.
    const ev = dispatchDragEvent('dragover', {
      target,
      clientY: 8,
      dataTransfer: dt,
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(target.classList.contains('drop-target-above')).toBe(true);
    expect(target.classList.contains('drop-target-below')).toBe(false);
  });

  it('dragover below the target midpoint adds .drop-target-below', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    const source = getRow('qa');
    const target = getRow('mockups');
    const dt = makeFakeDataTransfer();
    dispatchDragEvent('dragstart', { target: source, clientY: 80, dataTransfer: dt });
    // Target `mockups` is at top=32, bottom=64, midY=48. cursor at Y=60
    // is BELOW the midpoint.
    const ev = dispatchDragEvent('dragover', {
      target,
      clientY: 60,
      dataTransfer: dt,
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(target.classList.contains('drop-target-below')).toBe(true);
    expect(target.classList.contains('drop-target-above')).toBe(false);
  });

  it('drop reorders rail rows, focus chips, and swim+stub pairs AND writes localStorage', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    expect(getLaneOrder()).toEqual(['default', 'mockups', 'qa']);
    expect(getChipOrder()).toEqual(['default', 'mockups', 'qa']);
    expect(getSwimOrder()).toEqual(['default', 'mockups', 'qa']);

    // Drag `qa` ABOVE `default` (cursor Y=8 < midY=16) → new order
    // ['qa', 'default', 'mockups'].
    const source = getRow('qa');
    const target = getRow('default');
    const dt = makeFakeDataTransfer();
    dispatchDragEvent('dragstart', { target: source, clientY: 80, dataTransfer: dt });
    dispatchDragEvent('dragover', { target, clientY: 8, dataTransfer: dt });
    const ev = dispatchDragEvent('drop', {
      target,
      clientY: 8,
      dataTransfer: dt,
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(getLaneOrder()).toEqual(['qa', 'default', 'mockups']);
    expect(getChipOrder()).toEqual(['qa', 'default', 'mockups']);
    expect(getSwimOrder()).toEqual(['qa', 'default', 'mockups']);
    // localStorage carries the new order.
    const stored = window.localStorage.getItem(ORDER_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? '[]')).toEqual([
      'qa',
      'default',
      'mockups',
    ]);
  });

  it('dragend clears all drag-related classes', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    const source = getRow('mockups');
    const target = getRow('qa');
    const dt = makeFakeDataTransfer();
    dispatchDragEvent('dragstart', { target: source, clientY: 48, dataTransfer: dt });
    // Target `qa` is at top=64, bottom=96, midY=80. cursor at Y=88
    // is BELOW the midpoint.
    dispatchDragEvent('dragover', { target, clientY: 88, dataTransfer: dt });
    expect(source.classList.contains('is-dragging')).toBe(true);
    expect(target.classList.contains('drop-target-below')).toBe(true);
    dispatchDragEvent('dragend', { target: source, clientY: 88 });
    expect(source.classList.contains('is-dragging')).toBe(false);
    expect(target.classList.contains('drop-target-above')).toBe(false);
    expect(target.classList.contains('drop-target-below')).toBe(false);
  });

  it('reload restoration: pre-seeded localStorage order applies on init', () => {
    // Pre-seed an order BEFORE init. The server rendered the
    // canonical order ['default', 'mockups', 'qa']; the operator has
    // previously dragged into ['qa', 'default', 'mockups'].
    window.localStorage.setItem(
      ORDER_STORAGE_KEY,
      JSON.stringify(['qa', 'default', 'mockups']),
    );
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    expect(getLaneOrder()).toEqual(['qa', 'default', 'mockups']);
    expect(getChipOrder()).toEqual(['qa', 'default', 'mockups']);
    expect(getSwimOrder()).toEqual(['qa', 'default', 'mockups']);
  });

  it('reconciliation: stored order with stale ids falls back to live order', () => {
    // Stored order references a lane that no longer exists on disk
    // (`removed`); the controller's validity check fails AND the
    // live server-rendered order wins.
    window.localStorage.setItem(
      ORDER_STORAGE_KEY,
      JSON.stringify(['removed', 'qa', 'default', 'mockups']),
    );
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    expect(getLaneOrder()).toEqual(['default', 'mockups', 'qa']);
  });

  it('reconciliation: lanes added since the order was stored land at the tail', () => {
    // Stored: ['mockups', 'default']; live now includes a new 'qa'
    // lane. Reconciliation prepends the stored order and appends new
    // lanes at the tail.
    window.localStorage.setItem(
      ORDER_STORAGE_KEY,
      JSON.stringify(['mockups', 'default']),
    );
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    expect(getLaneOrder()).toEqual(['mockups', 'default', 'qa']);
  });

  it('drag with source === target is a no-op (no localStorage write, no reorder) — AUDIT-29', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    const row = getRow('mockups');
    const dt = makeFakeDataTransfer();
    dispatchDragEvent('dragstart', { target: row, clientY: 48, dataTransfer: dt });
    dispatchDragEvent('dragover', { target: row, clientY: 48, dataTransfer: dt });
    dispatchDragEvent('drop', { target: row, clientY: 48, dataTransfer: dt });
    expect(getLaneOrder()).toEqual(['default', 'mockups', 'qa']);
    // Per AUDIT-20260528-29 — the no-op drop branch skips the
    // localStorage write entirely so the controller's contract is
    // "writes happen only on real reorders." Confirm no stored entry
    // was emitted by the no-op drop.
    expect(window.localStorage.getItem(ORDER_STORAGE_KEY)).toBeNull();
  });

  it('AUDIT-27: dragleave that exits the rail clears all drop-target classes', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    const source = getRow('default');
    const target = getRow('qa');
    const dt = makeFakeDataTransfer();
    dispatchDragEvent('dragstart', { target: source, clientY: 8, dataTransfer: dt });
    // Stage a drop-target class on `qa`.
    dispatchDragEvent('dragover', { target, clientY: 95, dataTransfer: dt });
    expect(
      target.classList.contains('drop-target-above')
        || target.classList.contains('drop-target-below'),
    ).toBe(true);
    // dragleave that exits the rail (relatedTarget outside the rail)
    // should clear the drop-target classes. Synthesize relatedTarget
    // as a node OUTSIDE the rail container.
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    const leaveEv = new Event('dragleave', { bubbles: true, cancelable: true });
    Object.defineProperty(leaveEv, 'relatedTarget', {
      configurable: true,
      get: () => outside,
    });
    target.dispatchEvent(leaveEv);
    expect(target.classList.contains('drop-target-above')).toBe(false);
    expect(target.classList.contains('drop-target-below')).toBe(false);
  });

  it('AUDIT-27: dragging a visibility-hidden lane preserves the is-visibility-hidden class post-reorder', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    // Pretend the qa lane was previously hidden via the eye-toggle —
    // stamp the class directly on the rail row + focus chip.
    const qaRow = getRow('qa');
    const qaChip = document.querySelector<HTMLElement>(
      '[data-focus-chip="qa"]',
    );
    qaRow.dataset.laneVisible = 'false';
    qaChip?.classList.add('is-visibility-hidden');
    // Drag qa above default.
    const source = qaRow;
    const target = getRow('default');
    const dt = makeFakeDataTransfer();
    dispatchDragEvent('dragstart', { target: source, clientY: 96, dataTransfer: dt });
    dispatchDragEvent('dragover', { target, clientY: 4, dataTransfer: dt });
    dispatchDragEvent('drop', { target, clientY: 4, dataTransfer: dt });
    // Order has changed: qa moved to the top.
    expect(getLaneOrder()).toEqual(['qa', 'default', 'mockups']);
    // Class state on the moved row + chip survives the appendChild
    // moves (per AUDIT-20260528-29 — class state is preserved on a
    // per-id basis by appendChild; no applyState reapply needed).
    expect(qaRow.dataset.laneVisible).toBe('false');
    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(true);
  });

  it('AUDIT-30: dragstart sweeps stale .is-dragging classes from a prior aborted drag', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    // Simulate a previous drag's dragend that failed to fire — a
    // stale .is-dragging class is sitting on default.
    const stale = getRow('default');
    stale.classList.add('is-dragging');
    expect(stale.classList.contains('is-dragging')).toBe(true);
    // Now start a new drag on a different row. The dragstart sweep
    // should clear the stale class.
    const newSource = getRow('mockups');
    const dt = makeFakeDataTransfer();
    dispatchDragEvent('dragstart', { target: newSource, clientY: 48, dataTransfer: dt });
    expect(stale.classList.contains('is-dragging')).toBe(false);
    expect(newSource.classList.contains('is-dragging')).toBe(true);
  });
});
