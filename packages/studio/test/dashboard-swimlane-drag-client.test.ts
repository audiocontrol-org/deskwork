/**
 * @vitest-environment jsdom
 *
 * Client-side controller tests for the lane reorder drag-and-drop
 * affordance — Phase 5 Task 5.4.
 *
 * Exercises `initSwimlaneDrag` against a synthesised DOM mirroring
 * the server-rendered rail + focus-strip + swim/stub pairs.
 *
 * Coverage:
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
 *   - `computeReorder` pure function: above/below semantics for
 *     same-id, contiguous, and non-contiguous moves.
 *
 * jsdom does NOT implement HTML5 DnD's DataTransfer object — the
 * helper builds a real DragEvent with a synthesised DataTransfer
 * (via Object.defineProperty so the controller can read/write the
 * field without runtime errors).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initSwimlaneDrag,
  computeReorder,
} from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-drag';

// jsdom lacks `CSS.escape`. Per AUDIT-20260528-28 the drag controller
// escapes lane ids in querySelector calls; the test installs an
// identity shim mirroring the pattern in
// `dashboard-swimlane-client.test.ts:98-107`. Real browsers ship
// `CSS.escape`; this is a jsdom-only gap.
interface CSSShim {
  escape: (id: string) => string;
}
if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
  (globalThis as { CSS: CSSShim }).CSS = { escape: (s: string) => s };
}

const PROJECT_KEY = 'task-5-4-drag-test-key';
const ORDER_STORAGE_KEY = `deskwork:dashboard:${PROJECT_KEY}:lane-order`;

interface FakeDataTransfer {
  effectAllowed: string;
  dropEffect: string;
  data: Map<string, string>;
  setData(format: string, value: string): void;
  getData(format: string): string;
}

function makeFakeDataTransfer(): FakeDataTransfer {
  return {
    effectAllowed: '',
    dropEffect: '',
    data: new Map(),
    setData(format: string, value: string): void {
      this.data.set(format, value);
    },
    getData(format: string): string {
      return this.data.get(format) ?? '';
    },
  };
}

interface DragEventOptions {
  readonly target: HTMLElement;
  readonly clientY: number;
  readonly dataTransfer?: FakeDataTransfer;
  readonly relatedTarget?: HTMLElement | null;
}

function dispatchDragEvent(
  type: string,
  options: DragEventOptions,
): Event {
  // jsdom's DragEvent constructor exists but does not populate
  // DataTransfer; we attach our fake via defineProperty so the
  // controller reads/writes it without "as" casts. clientY is also
  // not honored by jsdom's MouseEvent init for DragEvent, so we
  // pin it via defineProperty too.
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'target', {
    value: options.target,
    configurable: true,
  });
  Object.defineProperty(ev, 'clientY', {
    value: options.clientY,
    configurable: true,
  });
  Object.defineProperty(ev, 'dataTransfer', {
    value: options.dataTransfer ?? null,
    configurable: true,
  });
  if (options.relatedTarget !== undefined) {
    Object.defineProperty(ev, 'relatedTarget', {
      value: options.relatedTarget,
      configurable: true,
    });
  }
  options.target.dispatchEvent(ev);
  return ev;
}

function buildShell(lanes: readonly string[]): HTMLElement {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = PROJECT_KEY;
  document.body.appendChild(shell);

  // Lane rail.
  const rail = document.createElement('aside');
  rail.classList.add('lane-rail');
  rail.dataset.laneRail = '';
  for (const id of lanes) {
    const row = document.createElement('div');
    row.classList.add('rail-lane');
    row.setAttribute('draggable', 'true');
    row.dataset.railLane = id;
    row.dataset.laneVisible = 'true';
    rail.appendChild(row);
  }
  shell.appendChild(rail);

  // Focus strip with one chip per lane (plus a non-lane "All" chip).
  const strip = document.createElement('nav');
  strip.classList.add('focus-strip');
  strip.dataset.focusStrip = '';
  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.classList.add('focus-chip', 'all');
  allChip.dataset.focusChipAll = '';
  strip.appendChild(allChip);
  for (const id of lanes) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.classList.add('focus-chip');
    chip.dataset.focusChip = id;
    strip.appendChild(chip);
  }
  shell.appendChild(strip);

  // Bay column holding head + swim+stub pairs.
  const bay = document.createElement('main');
  bay.classList.add('bay');
  bay.dataset.bay = '';
  const bayHead = document.createElement('div');
  bayHead.classList.add('bay-head');
  bay.appendChild(bayHead);
  for (const id of lanes) {
    const swim = document.createElement('article');
    swim.classList.add('swim');
    swim.dataset.laneId = id;
    bay.appendChild(swim);
    const stub = document.createElement('button');
    stub.type = 'button';
    stub.classList.add('swim-stub');
    stub.dataset.swimStub = id;
    bay.appendChild(stub);
  }
  shell.appendChild(bay);

  return rail;
}

function getLaneOrder(): readonly string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-rail-lane]'),
  ).map((el) => el.dataset.railLane ?? '');
}

function getChipOrder(): readonly string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-focus-chip]'),
  ).map((el) => el.dataset.focusChip ?? '');
}

function getSwimOrder(): readonly string[] {
  const bay = document.querySelector<HTMLElement>('[data-bay]');
  if (bay === null) return [];
  const out: string[] = [];
  for (const child of Array.from(bay.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.classList.contains('swim')) {
      out.push(child.dataset.laneId ?? '');
    }
  }
  return out;
}

function getRow(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-rail-lane="${id}"]`);
  if (el === null) throw new Error(`row ${id} not found`);
  // Mock getBoundingClientRect — every row 32px tall, sequential top.
  const ids = getLaneOrder();
  const idx = ids.indexOf(id);
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: (): DOMRect => ({
      top: idx * 32,
      bottom: idx * 32 + 32,
      left: 0,
      right: 200,
      height: 32,
      width: 200,
      x: 0,
      y: idx * 32,
      toJSON: () => ({}),
    }),
    configurable: true,
  });
  return el;
}

describe('computeReorder pure function — Task 5.4', () => {
  it('returns the input unchanged when source === target', () => {
    const result = computeReorder(['a', 'b', 'c'], 'b', 'b', 'above');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('drops source ABOVE target — moves source up', () => {
    const result = computeReorder(['a', 'b', 'c', 'd'], 'd', 'b', 'above');
    expect(result).toEqual(['a', 'd', 'b', 'c']);
  });

  it('drops source BELOW target — moves source down', () => {
    const result = computeReorder(['a', 'b', 'c', 'd'], 'a', 'c', 'below');
    expect(result).toEqual(['b', 'c', 'a', 'd']);
  });

  it('handles same-position drop as a no-op (above immediate neighbor)', () => {
    const result = computeReorder(['a', 'b', 'c'], 'a', 'b', 'above');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('returns unchanged order when target id is not in the list', () => {
    const result = computeReorder(['a', 'b'], 'a', 'z', 'above');
    expect(result).toEqual(['a', 'b']);
  });
});

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
