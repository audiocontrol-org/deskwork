/**
 * @vitest-environment jsdom
 *
 * AUDIT-20260530-50 (cross-model: AUDIT-BARRAGE-claude-P5-3) regression
 * — test coverage for the localStorage write-failure paths that the
 * production code defends against with silent try/catch.
 *
 * Scope of THIS file (the remaining gap left after AUDIT-20260530-44):
 *
 *   1. `writeStoredOrder` (drag/reorder, via the shared
 *      `writeJsonOrIgnore`) — when a drag drop's localStorage write
 *      fails, the controller's "in-page state still works" contract
 *      requires:
 *        (a) no exception propagates out of the drop handler;
 *        (b) the in-DOM reorder still happened (rail + chip + bay all
 *            in the new order).
 *
 *   2. `writeStoredSet` (visibility + focus state on `swimlane.ts`)
 *      — when the eye-toggle / focus-chip click's localStorage write
 *      fails, the same contract requires:
 *        (a) no exception propagates out of the click handler;
 *        (b) the in-DOM toggle still applied (rail data-lane-visible
 *            flipped, chip `.is-visibility-hidden` set).
 *
 * AUDIT-20260530-44 already covers the `writePresets` failure path via
 * a prototype-level `Storage.prototype.setItem` spy. This file uses
 * the same pattern (mockImplementation on the prototype, keyed on the
 * specific storage key) so the two failure paths are exercised with
 * identical machinery.
 *
 * The silent swallow is deliberate per `swimlane-storage.ts`'s
 * docblock — every caller is in "best-effort persistence; in-page
 * state still works without it" mode. Per AUDIT-20260530-50 the only
 * way to verify that contract on the disk-failure branch is a test
 * that stubs `setItem` to throw and asserts the contract holds.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSwimlane } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane';
import { initSwimlaneDrag } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-drag';
import {
  ORDER_STORAGE_KEY,
  buildShell as buildDragShell,
  dispatchDragEvent,
  getChipOrder,
  getLaneOrder,
  getRow,
  getSwimOrder,
  makeFakeDataTransfer,
} from './__helpers/dashboard-swimlane-drag-fixture.ts';
import { buildShell as buildSwimlaneShell } from './__helpers/dashboard-swimlane-client-fixture.ts';

/**
 * Wrap `Storage.prototype.setItem` so writes whose key matches the
 * `matcher` predicate throw a `QuotaExceededError`; other writes pass
 * through to the real implementation. Returns a restore function the
 * `afterEach` hook calls to drop the wrap.
 *
 * Spying on `Storage.prototype.setItem` (rather than the per-instance
 * storage) matches AUDIT-20260530-44's pattern — jsdom's Storage
 * instance proxies through to the prototype, so a per-instance spy is
 * not invoked on the actual write path. The targeted matcher lets
 * each test fail ONLY the key under test so the other persistence
 * paths in the same controller still succeed (e.g. the focus-toggle
 * test fails the visibility key but not the focus key).
 */
function failWritesMatching(matcher: (key: string) => boolean): () => void {
  const original = Storage.prototype.setItem;
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
    function (this: Storage, key: string, value: string): void {
      if (matcher(key)) {
        // The shape Safari private-mode + quota-exceeded both throw.
        // `Error.prototype.name` is writable per the language spec, so
        // no cast is needed to set it.
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      original.call(this, key, value);
    },
  );
  return () => {
    spy.mockRestore();
  };
}

describe('AUDIT-20260530-50 — drag-side writeStoredOrder failure path', () => {
  let restore: () => void = () => {};

  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  afterEach(() => {
    restore();
    restore = () => {};
  });

  it('drop with failing localStorage.setItem does NOT throw + in-DOM reorder still applies', () => {
    buildDragShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    // Sanity: pre-drop order matches the server-rendered sequence.
    expect(getLaneOrder()).toEqual(['default', 'mockups', 'qa']);

    // Install the failure wrap AFTER init so the controller's
    // reconciliation reads (which don't go through setItem) aren't
    // affected. Target only the lane-order key — other keys (none in
    // this test, but the matcher is defensive) pass through.
    restore = failWritesMatching((key) => key === ORDER_STORAGE_KEY);

    // Drag `qa` ABOVE `default` (cursor Y=8 < midY=16) → new order
    // ['qa', 'default', 'mockups']. Same drop the happy-path test in
    // dashboard-swimlane-drag-client.test.ts exercises.
    const source = getRow('qa');
    const target = getRow('default');
    const dt = makeFakeDataTransfer();
    dispatchDragEvent('dragstart', { target: source, clientY: 80, dataTransfer: dt });
    dispatchDragEvent('dragover', { target, clientY: 8, dataTransfer: dt });

    // The contract: drop handler must NOT throw even though
    // localStorage.setItem will throw on the lane-order key write.
    expect(() => {
      dispatchDragEvent('drop', { target, clientY: 8, dataTransfer: dt });
    }).not.toThrow();

    // The contract: in-DOM reorder STILL applied — rail, chips, swims
    // all in the new order. Persistence failed but the visual state
    // is intact for the rest of the session.
    expect(getLaneOrder()).toEqual(['qa', 'default', 'mockups']);
    expect(getChipOrder()).toEqual(['qa', 'default', 'mockups']);
    expect(getSwimOrder()).toEqual(['qa', 'default', 'mockups']);

    // Sanity: the failing write means nothing landed in storage.
    expect(window.localStorage.getItem(ORDER_STORAGE_KEY)).toBeNull();
  });
});

describe('AUDIT-20260530-50 — swimlane writeStoredSet failure path', () => {
  let restore: () => void = () => {};

  const PROJECT_KEY = 'test-project-key';
  const VISIBILITY_KEY = `deskwork:dashboard:v2:${PROJECT_KEY}:visibility`;
  const FOCUS_KEY = `deskwork:dashboard:v2:${PROJECT_KEY}:focus`;

  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dev/editorial-studio');
  });

  afterEach(() => {
    restore();
    restore = () => {};
  });

  it('eye-toggle click with failing visibility-key setItem does NOT throw + in-DOM flip still applies', () => {
    buildSwimlaneShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const qaRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="qa"]',
    );
    const qaEye = qaRow?.querySelector<HTMLElement>('.r-eye-btn') ?? null;
    const qaChip = document.querySelector<HTMLButtonElement>(
      '[data-focus-chip="qa"]',
    );
    expect(qaRow).not.toBeNull();
    expect(qaEye).not.toBeNull();
    expect(qaChip).not.toBeNull();

    // Pre-state: lane is visible.
    expect(qaRow?.dataset.laneVisible).toBe('true');
    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(false);

    // Fail writes on BOTH the visibility and focus keys — eye-toggle
    // persists both via persist() so either could throw. Targeting
    // both verifies the contract holds even when both fail.
    restore = failWritesMatching(
      (key) => key === VISIBILITY_KEY || key === FOCUS_KEY,
    );

    // The contract: eye-toggle click must NOT throw even though the
    // persist() call will hit a throwing setItem.
    expect(() => {
      qaEye?.click();
    }).not.toThrow();

    // The contract: in-DOM toggle STILL applied — row's
    // data-lane-visible flipped to false; chip carries the
    // visibility-hidden class.
    expect(qaRow?.dataset.laneVisible).toBe('false');
    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(true);

    // Sanity: the failing write means the new state ('qa' hidden) did
    // NOT land in storage. `initSwimlane` itself wrote the initial
    // (empty) state before the failure wrap was installed, so the
    // key carries the pre-toggle value rather than null. The post-
    // toggle value (containing 'qa') is what we assert did NOT land.
    const visAfter = window.localStorage.getItem(VISIBILITY_KEY);
    expect(visAfter === null || !visAfter.includes('qa')).toBe(true);
  });

  it('focus-chip click with failing focus-key setItem does NOT throw + in-DOM toggle still applies', () => {
    buildSwimlaneShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const qaSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="qa"]',
    );
    const qaStub = document.querySelector<HTMLElement>(
      '.swim-stub[data-swim-stub="qa"]',
    );
    const qaChip = document.querySelector<HTMLButtonElement>(
      '[data-focus-chip="qa"]',
    );
    expect(qaSwim).not.toBeNull();
    expect(qaStub).not.toBeNull();
    expect(qaChip).not.toBeNull();
    // Pre-state: focused — swim visible, stub hidden.
    expect(qaSwim?.classList.contains('is-focus-hidden')).toBe(false);
    expect(qaStub?.classList.contains('is-focus-hidden')).toBe(true);

    // Fail writes on the focus key (focus-chip persists via the same
    // persist() helper that writes both focus and visibility; failing
    // both verifies the broader contract).
    restore = failWritesMatching(
      (key) => key === FOCUS_KEY || key === VISIBILITY_KEY,
    );

    // The contract: chip click must NOT throw even though persist()
    // will hit a throwing setItem.
    expect(() => {
      qaChip?.click();
    }).not.toThrow();

    // The contract: in-DOM focus flip STILL applied — swim now
    // carries is-focus-hidden; stub is now visible.
    expect(qaSwim?.classList.contains('is-focus-hidden')).toBe(true);
    expect(qaStub?.classList.contains('is-focus-hidden')).toBe(false);

    // Sanity: the failing write means the new focus state (with 'qa'
    // removed) did NOT land in storage. `initSwimlane` wrote the
    // initial focus set (containing 'qa') before the failure wrap
    // was installed; what we assert is that the post-toggle state
    // (without 'qa') is NOT what storage carries.
    const focusAfter = window.localStorage.getItem(FOCUS_KEY);
    expect(focusAfter !== null && focusAfter.includes('qa')).toBe(true);
  });
});
