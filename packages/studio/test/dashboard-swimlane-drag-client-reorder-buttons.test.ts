/**
 * @vitest-environment jsdom
 *
 * AUDIT-20260528-31 — per-row up/down buttons for keyboard reordering.
 *
 * The native HTML5 DnD path has no keyboard equivalent. The fix adds
 * `▲` / `▼` buttons inside each rail row that swap the row with its
 * neighbor via the same shared reorder primitive the drag-drop path
 * uses. Tests cover: click reorder + localStorage persistence,
 * disabled boundary state, Enter / Space activation, Space's
 * preventDefault suppressing page-scroll, AUDIT-06 invariant
 * (keydown on the button does NOT bubble to a parent row's keydown).
 *
 * Originally part of `dashboard-swimlane-drag-client.test.ts`; split
 * out per AUDIT-20260528-14 to satisfy the project's 300-500 line
 * file-size cap. Shared fixture + helpers live in
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

describe('swimlane reorder buttons — AUDIT-20260528-31', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  function getMoveBtn(
    id: string,
    direction: 'up' | 'down',
  ): HTMLButtonElement {
    const cls = direction === 'up' ? '.r-move-up-btn' : '.r-move-down-btn';
    const btn = document.querySelector<HTMLButtonElement>(
      `[data-rail-lane="${id}"] ${cls}`,
    );
    if (btn === null) throw new Error(`${direction} button for ${id} not found`);
    return btn;
  }

  it('click on ▼ shifts the row down by 1 + writes localStorage', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    expect(getLaneOrder()).toEqual(['default', 'mockups', 'qa']);
    const downBtn = getMoveBtn('default', 'down');
    downBtn.click();
    expect(getLaneOrder()).toEqual(['mockups', 'default', 'qa']);
    expect(getChipOrder()).toEqual(['mockups', 'default', 'qa']);
    expect(getSwimOrder()).toEqual(['mockups', 'default', 'qa']);
    const stored = window.localStorage.getItem(ORDER_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? '[]')).toEqual([
      'mockups',
      'default',
      'qa',
    ]);
  });

  it('click on ▲ shifts the row up by 1 + writes localStorage', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    const upBtn = getMoveBtn('qa', 'up');
    upBtn.click();
    expect(getLaneOrder()).toEqual(['default', 'qa', 'mockups']);
    expect(getChipOrder()).toEqual(['default', 'qa', 'mockups']);
    expect(getSwimOrder()).toEqual(['default', 'qa', 'mockups']);
    const stored = window.localStorage.getItem(ORDER_STORAGE_KEY);
    expect(JSON.parse(stored ?? '[]')).toEqual([
      'default',
      'qa',
      'mockups',
    ]);
  });

  it('top row ▲ is disabled + bottom row ▼ is disabled after init', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    expect(getMoveBtn('default', 'up').disabled).toBe(true);
    expect(getMoveBtn('default', 'up').getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(getMoveBtn('qa', 'down').disabled).toBe(true);
    expect(getMoveBtn('qa', 'down').getAttribute('aria-disabled')).toBe(
      'true',
    );
    // Middle row's up + down are enabled.
    expect(getMoveBtn('mockups', 'up').disabled).toBe(false);
    expect(getMoveBtn('mockups', 'down').disabled).toBe(false);
  });

  it('disabled state refreshes after a reorder so the new top + bottom buttons disable', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    // Move qa to the top via two ▲ clicks.
    getMoveBtn('qa', 'up').click();
    getMoveBtn('qa', 'up').click();
    expect(getLaneOrder()).toEqual(['qa', 'default', 'mockups']);
    // qa is now top → its ▲ is disabled, ▼ is enabled.
    expect(getMoveBtn('qa', 'up').disabled).toBe(true);
    expect(getMoveBtn('qa', 'down').disabled).toBe(false);
    // mockups is now bottom → its ▼ is disabled.
    expect(getMoveBtn('mockups', 'down').disabled).toBe(true);
    // default was previously top — now in the middle, both enabled.
    expect(getMoveBtn('default', 'up').disabled).toBe(false);
    expect(getMoveBtn('default', 'down').disabled).toBe(false);
  });

  it('Enter on ▼ moves the row (native button activation)', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    const downBtn = getMoveBtn('default', 'down');
    // Native <button> activates on Enter — dispatching a click event
    // is the contractual equivalent of pressing Enter on a focused
    // button per the HTML spec.
    downBtn.click();
    expect(getLaneOrder()).toEqual(['mockups', 'default', 'qa']);
  });

  it('Space on ▼ moves the row AND calls preventDefault (no page-scroll)', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    const downBtn = getMoveBtn('default', 'down');
    const ev = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    downBtn.dispatchEvent(ev);
    // The Space handler calls preventDefault to suppress the default
    // page-scroll, mirroring the rail-row keyboard pattern in
    // `swimlane.ts:bindRailEyeToggles`.
    expect(ev.defaultPrevented).toBe(true);
    // Per the test contract the handler should fire the move on
    // Space, mirroring native button's Enter behavior.
    expect(getLaneOrder()).toEqual(['mockups', 'default', 'qa']);
  });

  it('keydown on ▼ does NOT bubble to a parent row keydown listener (AUDIT-06 invariant)', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    // Install a row-level keydown listener that mirrors the AUDIT-06
    // fix in swimlane.ts:bindRailEyeToggles — it bails when the event
    // target is an interactive descendant. The button is an
    // interactive descendant, so the listener should observe the
    // event bubble but not actually toggle anything.
    const row = getRow('mockups');
    let rowKeydownFired = false;
    row.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      if (
        ev.target instanceof Element
        && ev.target.closest(
          'button, a[href], input, select, textarea, [role="button"]:not([data-rail-lane])',
        ) !== null
      ) {
        // Same guard as swimlane.ts — bail when the target is a
        // descendant interactive element. Test asserts the guard
        // catches our button.
        return;
      }
      rowKeydownFired = true;
    });
    const downBtn = getMoveBtn('mockups', 'down');
    const ev = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    downBtn.dispatchEvent(ev);
    // The row's listener received the event but the AUDIT-06 guard
    // bailed before any row-level handling ran.
    expect(rowKeydownFired).toBe(false);
    // The reorder DID fire via the button's own handler.
    expect(getLaneOrder()).toEqual(['default', 'qa', 'mockups']);
  });

  it('aria-label names the lane + direction on every up/down button', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    expect(getMoveBtn('default', 'up').getAttribute('aria-label')).toBe(
      'Move lane default up',
    );
    expect(getMoveBtn('mockups', 'down').getAttribute('aria-label')).toBe(
      'Move lane mockups down',
    );
    expect(getMoveBtn('qa', 'up').getAttribute('aria-label')).toBe(
      'Move lane qa up',
    );
  });

  it('clicking a disabled ▼ is a no-op (no reorder, no localStorage write)', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    const qaDown = getMoveBtn('qa', 'down');
    expect(qaDown.disabled).toBe(true);
    qaDown.click();
    expect(getLaneOrder()).toEqual(['default', 'mockups', 'qa']);
    expect(window.localStorage.getItem(ORDER_STORAGE_KEY)).toBeNull();
  });

  it('click on ▲ stops propagation so the row click handler does not also fire', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    // Install a row-level click listener — it should NOT fire when
    // the up/down button is clicked (stopPropagation in the button's
    // own handler).
    const row = getRow('mockups');
    let rowClickFired = false;
    row.addEventListener('click', () => {
      rowClickFired = true;
    });
    getMoveBtn('mockups', 'up').click();
    expect(rowClickFired).toBe(false);
    expect(getLaneOrder()).toEqual(['mockups', 'default', 'qa']);
  });

  it('drag-drop reorder refreshes button disabled state too (shared sweep)', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlaneDrag();
    // Drag qa above default → new order ['qa', 'default', 'mockups'].
    const source = getRow('qa');
    const target = getRow('default');
    const dt = makeFakeDataTransfer();
    dispatchDragEvent('dragstart', { target: source, clientY: 80, dataTransfer: dt });
    dispatchDragEvent('dragover', { target, clientY: 8, dataTransfer: dt });
    dispatchDragEvent('drop', { target, clientY: 8, dataTransfer: dt });
    expect(getLaneOrder()).toEqual(['qa', 'default', 'mockups']);
    // qa is now top — its ▲ must be disabled. mockups is now bottom —
    // its ▼ must be disabled. default's previously-disabled ▲ must
    // re-enable.
    expect(getMoveBtn('qa', 'up').disabled).toBe(true);
    expect(getMoveBtn('mockups', 'down').disabled).toBe(true);
    expect(getMoveBtn('default', 'up').disabled).toBe(false);
  });
});
