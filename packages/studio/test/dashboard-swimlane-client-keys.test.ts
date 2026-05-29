/**
 * @vitest-environment jsdom
 *
 * Client-side keyboard + eye-button + All-chip tests for the
 * dashboard swimlane shell. Phase 5 covers:
 *
 *   - Task 5.3.2: clicking a HIDDEN lane row flips visibility ON and
 *     adds the lane to focus; Enter on the same row mirrors the click.
 *     A visible row preserves the 5.1 focus toggle behavior (no
 *     unhide path fires).
 *   - Task 5.3.2 followup (AUDIT-20260528-21): Enter / Space on the
 *     eye-button triggers the eye-button's visibility contract, NOT
 *     the row's dual-action path — the row's keydown handler must
 *     not preventDefault the bubbled eye-button activation.
 *   - AUDIT-20260528-06: keyboard Enter / Space on the eye-button
 *     toggles visibility end-to-end (browser-synthesised click runs
 *     without row interception).
 *   - AUDIT-20260528-09: clicking the All chip is idempotent — does
 *     NOT empty the focus set when every lane is already focused; a
 *     partial-focus state restores every visible lane.
 *   - F6 a11y: the eye-toggle is a real focusable `<button class=
 *     "r-eye-btn">` with non-empty aria-label + decorative glyph
 *     children.
 *
 * Originally part of `dashboard-swimlane-client.test.ts`; split out
 * per AUDIT-20260528-14 to satisfy the project's 300-500 line file-
 * size cap. The AUDIT-02 / AUDIT-04 / F5 focus-chip + eye-toggle
 * tests stay in the original file. Shared fixture lives in
 * `__helpers/dashboard-swimlane-client-fixture.ts`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initSwimlane } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane';
import { buildShell } from './__helpers/dashboard-swimlane-client-fixture.ts';

describe('swimlane client — keyboard + eye-button + All chip', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  it('Task 5.3.2: clicking a HIDDEN lane row flips visibility ON and adds the lane to focus', () => {
    buildShell(['default', 'mockups', 'qa']);
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
    // Step 1: hide the qa lane via the eye-button. After this the
    // chip is `.is-visibility-hidden`, the row is `data-lane-visible
    // ="false"`, and focus is dropped.
    qaEye?.click();
    expect(qaRow?.dataset.laneVisible).toBe('false');
    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(true);
    expect(qaRow?.getAttribute('aria-pressed')).toBe('false');
    // Step 2: clicking the ROW (not the eye) on the hidden lane
    // restores visibility AND adds the lane to focus. After this
    // both lane-visible and aria-pressed reflect the focused state,
    // and the chip is no longer visibility-hidden.
    qaRow?.click();
    expect(qaRow?.dataset.laneVisible).toBe('true');
    expect(qaRow?.getAttribute('aria-pressed')).toBe('true');
    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(false);
    expect(qaChip?.classList.contains('active')).toBe(true);
  });

  it('Task 5.3.2: pressing Enter on a HIDDEN rail row flips visibility ON and focuses (mirrors click)', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const mockupsRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="mockups"]',
    );
    const mockupsEye
      = mockupsRow?.querySelector<HTMLElement>('.r-eye-btn') ?? null;
    const mockupsChip = document.querySelector<HTMLButtonElement>(
      '[data-focus-chip="mockups"]',
    );
    // Hide the mockups lane.
    mockupsEye?.click();
    expect(mockupsRow?.dataset.laneVisible).toBe('false');
    expect(mockupsChip?.classList.contains('is-visibility-hidden')).toBe(true);
    // Press Enter on the row — same dual-action contract as the
    // click path (Task 5.3.2 spec).
    mockupsRow?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(mockupsRow?.dataset.laneVisible).toBe('true');
    expect(mockupsRow?.getAttribute('aria-pressed')).toBe('true');
    expect(mockupsChip?.classList.contains('is-visibility-hidden')).toBe(false);
  });

  it('Task 5.3.2 followup (AUDIT-21): Enter on the eye-button triggers the eye contract, NOT the row dual-action', () => {
    // Regression test for the keyboard a11y finding — when the eye-
    // button has focus and the operator presses Enter/Space, the
    // row's keydown handler must NOT preventDefault the native button
    // activation. Otherwise the eye-button's visibility-only contract
    // is silently swallowed and the row's focus-toggle fires instead.
    buildShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const defaultRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="default"]',
    );
    const defaultEye
      = defaultRow?.querySelector<HTMLButtonElement>('.r-eye-btn') ?? null;
    expect(defaultEye).not.toBeNull();
    // Default lane starts visible AND focused.
    expect(defaultRow?.dataset.laneVisible).toBe('true');
    expect(defaultRow?.getAttribute('aria-pressed')).toBe('true');
    // Synthesise a keydown originating ON the eye-button that
    // bubbles to the row (matches what jsdom + the browser produce
    // when the eye-button has focus and the operator presses Enter).
    const ev = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    defaultEye?.dispatchEvent(ev);
    // The row's keydown listener must NOT have called preventDefault —
    // otherwise the native button click synthesis was cancelled.
    expect(ev.defaultPrevented).toBe(false);
    // The row's focus state must be unchanged — only the eye-button's
    // contract should fire. (jsdom does not synthesize the native
    // click on Enter without a real event-loop turn; the assertion
    // above is the contract guarantee. We additionally verify the row
    // state hasn't been mutated by the dual-action handler.)
    expect(defaultRow?.getAttribute('aria-pressed')).toBe('true');
  });

  it('Task 5.3.2 followup (AUDIT-21): Space on the eye-button does NOT trigger the row dual-action', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const qaRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="qa"]',
    );
    const qaEye = qaRow?.querySelector<HTMLButtonElement>('.r-eye-btn') ?? null;
    // Hide the qa lane first via the eye click (so we have a hidden
    // lane to verify the row's dual-action DOESN'T re-show on Space).
    qaEye?.click();
    expect(qaRow?.dataset.laneVisible).toBe('false');
    // Press Space on the eye-button. The row's keydown listener must
    // ignore the gesture so the eye's contract owns it.
    const ev = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    qaEye?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    // The lane is still hidden — the row's unhide-and-focus path did
    // not fire on the eye-button-targeted Space gesture.
    expect(qaRow?.dataset.laneVisible).toBe('false');
  });

  it('Task 5.3.2: clicking a VISIBLE row preserves the 5.1 toggle behavior (no unhide path fires)', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const defaultRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="default"]',
    );
    // Initially focused (visible). One click toggles focus off.
    expect(defaultRow?.getAttribute('aria-pressed')).toBe('true');
    expect(defaultRow?.dataset.laneVisible).toBe('true');
    defaultRow?.click();
    // Visibility unchanged; focus flipped off.
    expect(defaultRow?.dataset.laneVisible).toBe('true');
    expect(defaultRow?.getAttribute('aria-pressed')).toBe('false');
    // Click again to flip focus back on.
    defaultRow?.click();
    expect(defaultRow?.getAttribute('aria-pressed')).toBe('true');
    expect(defaultRow?.dataset.laneVisible).toBe('true');
  });

  it('AUDIT-06: keyboard Enter on the eye-button toggles visibility (browser-synthesized click runs without row interception)', () => {
    // End-to-end keyboard contract for the eye-button. Native browser
    // behavior on a focused `<button>`: pressing Enter (or Space on
    // keyup) dispatches a synthetic `click` event on the button. The
    // row's bubbled keydown handler must NOT preventDefault that
    // synthesis. jsdom does not synthesize the click itself across
    // bubbles, so the test (a) asserts the row's handler stays quiet
    // (no preventDefault, no row mutation) AND (b) explicitly calls
    // `.click()` on the eye to mirror the native synthesis, proving
    // the eye's contract delivers the visibility toggle end-to-end.
    buildShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const qaRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="qa"]',
    );
    const qaEye = qaRow?.querySelector<HTMLButtonElement>('.r-eye-btn') ?? null;
    const qaChip = document.querySelector<HTMLButtonElement>(
      '[data-focus-chip="qa"]',
    );
    expect(qaEye).not.toBeNull();
    // Start state: visible, focused.
    expect(qaRow?.dataset.laneVisible).toBe('true');
    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(false);
    // Step 1: keydown originates on the eye-button and bubbles to the
    // row. The row's listener must NOT cancel it (otherwise the native
    // click synthesis is killed).
    const keydown = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    qaEye?.dispatchEvent(keydown);
    expect(keydown.defaultPrevented).toBe(false);
    expect(qaRow?.getAttribute('aria-pressed')).toBe('true');
    // Step 2: simulate the native browser's keyboard→click synthesis.
    // After Enter on a focused <button>, the browser fires a click —
    // the eye's click handler flips persistent visibility.
    qaEye?.click();
    expect(qaRow?.dataset.laneVisible).toBe('false');
    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(true);
  });

  it('AUDIT-06: keyboard Space on the eye-button toggles visibility (browser-synthesized click runs without row interception)', () => {
    // Same end-to-end contract as the Enter case above, for Space.
    // Native browsers synthesize click on keyup-Space (not keydown);
    // the row's keydown handler still must not preventDefault the
    // bubbled Space gesture.
    buildShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const mockupsRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="mockups"]',
    );
    const mockupsEye
      = mockupsRow?.querySelector<HTMLButtonElement>('.r-eye-btn') ?? null;
    const mockupsChip = document.querySelector<HTMLButtonElement>(
      '[data-focus-chip="mockups"]',
    );
    expect(mockupsEye).not.toBeNull();
    expect(mockupsRow?.dataset.laneVisible).toBe('true');
    const keydown = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    mockupsEye?.dispatchEvent(keydown);
    // Row's keydown handler must stay quiet so the browser can
    // synthesize the keyup-Space click on the focused button.
    expect(keydown.defaultPrevented).toBe(false);
    expect(mockupsRow?.getAttribute('aria-pressed')).toBe('true');
    // Mirror the browser's keyup-Space click synthesis.
    mockupsEye?.click();
    expect(mockupsRow?.dataset.laneVisible).toBe('false');
    expect(mockupsChip?.classList.contains('is-visibility-hidden')).toBe(true);
  });

  it('AUDIT-09: clicking the All chip is idempotent — all-already-focused stays all-focused (does NOT empty the set)', () => {
    // The workplan + bindFocusChips docstring define `All` as
    // "focuses every visible lane" with NO documented toggle-off
    // semantics. The prior `isAlreadyAll`-gated branch silently
    // emptied the focus set when the operator clicked `All` while
    // all lanes were already focused. The fix collapses the handler
    // to clear → add-all-visible regardless of prior state.
    buildShell(['default', 'mockups', 'qa']);
    initSwimlane();
    // After init, all three lanes are focused (the default-focus path
    // when no `?focus=` URL param and no storage value).
    const allChip = document.querySelector<HTMLButtonElement>(
      '[data-focus-chip-all]',
    );
    expect(allChip).not.toBeNull();
    for (const id of ['default', 'mockups', 'qa']) {
      const chip = document.querySelector<HTMLButtonElement>(
        `[data-focus-chip="${id}"]`,
      );
      expect(chip?.classList.contains('active')).toBe(true);
    }
    // Click All while all three are already focused. The fix
    // guarantees focus stays at all three (idempotent), NOT emptied.
    allChip?.click();
    for (const id of ['default', 'mockups', 'qa']) {
      const chip = document.querySelector<HTMLButtonElement>(
        `[data-focus-chip="${id}"]`,
      );
      expect(chip?.classList.contains('active')).toBe(true);
      expect(chip?.getAttribute('aria-pressed')).toBe('true');
    }
    // The All chip itself stays active (every visible lane is focused).
    expect(allChip?.classList.contains('active')).toBe(true);
    expect(allChip?.getAttribute('aria-pressed')).toBe('true');
  });

  it('AUDIT-09: clicking the All chip from a partial-focus state restores every visible lane', () => {
    // Existing behavior the fix MUST preserve: when not all lanes are
    // focused, clicking `All` puts every visible lane into focus.
    buildShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const qaChip = document.querySelector<HTMLButtonElement>(
      '[data-focus-chip="qa"]',
    );
    const allChip = document.querySelector<HTMLButtonElement>(
      '[data-focus-chip-all]',
    );
    // Toggle qa off — focus is now { default, mockups }.
    qaChip?.click();
    expect(qaChip?.classList.contains('active')).toBe(false);
    // Click All — qa is re-focused, default + mockups stay focused.
    allChip?.click();
    for (const id of ['default', 'mockups', 'qa']) {
      const chip = document.querySelector<HTMLButtonElement>(
        `[data-focus-chip="${id}"]`,
      );
      expect(chip?.classList.contains('active')).toBe(true);
    }
  });

  it('F6: the eye-toggle button carries aria-label + dual decorative glyphs', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const eye = document.querySelector<HTMLButtonElement>(
      '[data-rail-lane="qa"] .r-eye-btn',
    );
    expect(eye).not.toBeNull();
    // Real focusable <button>, not a <span>.
    expect(eye?.tagName.toLowerCase()).toBe('button');
    // Non-empty accessible name.
    const label = eye?.getAttribute('aria-label') ?? '';
    expect(label.length).toBeGreaterThan(0);
    // Dual decorative glyphs present and marked aria-hidden so they
    // don't surface to assistive tech (the button's aria-label is
    // the accessible name).
    const visGlyph = eye?.querySelector<HTMLElement>('.r-eye-visible');
    const hidGlyph = eye?.querySelector<HTMLElement>('.r-eye-hidden');
    expect(visGlyph).not.toBeNull();
    expect(hidGlyph).not.toBeNull();
    expect(visGlyph?.getAttribute('aria-hidden')).toBe('true');
    expect(hidGlyph?.getAttribute('aria-hidden')).toBe('true');
  });
});
