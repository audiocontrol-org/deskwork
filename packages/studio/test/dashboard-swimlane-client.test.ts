/**
 * @vitest-environment jsdom
 *
 * Client-side controller tests for the dashboard swimlane shell —
 * Phase 5 Task 5.1 / AUDIT-20260528-02 + AUDIT-20260528-04 acceptance
 * + F5 a11y from the code-quality pass.
 *
 * Exercises `initSwimlane` against a synthesised DOM that mirrors the
 * server-rendered bay-shell markup. Asserts the focus-toggle + eye-
 * toggle move state in the expected directions:
 *
 *   - AUDIT-02: toggling a focused lane off via the focus chip moves
 *     `.is-focus-hidden` from the stub onto the swim, so the stub
 *     becomes visible. Clicking the stub flips back.
 *   - AUDIT-04: toggling a lane's eye-button flips
 *     `data-lane-visible` on the rail row + adds `.is-visibility-
 *     hidden` to the focus chip (CSS then hides it).
 *   - F5: keyboard activation on the rail row (Enter / Space) flips
 *     focus state, matching the click handler bound on the same row.
 *     Non-Enter/Space keys are ignored.
 *
 * The Task 5.3.2 / AUDIT-21 / AUDIT-06 / AUDIT-09 / F6 tests
 * (keyboard contracts on the eye-button, hidden-lane row activation,
 * idempotent All chip, eye-toggle decorative glyph children) live in
 * the sibling `dashboard-swimlane-client-keys.test.ts`. Per
 * AUDIT-20260528-14 this split brings each file under the 300-500
 * line cap. Shared fixture lives in
 * `__helpers/dashboard-swimlane-client-fixture.ts`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initSwimlane } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane';
import { buildShell } from './__helpers/dashboard-swimlane-client-fixture.ts';

describe('swimlane client controller — AUDIT-02 / AUDIT-04 acceptance', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    // Reset URL — happy-path: no `?focus=` in the search string.
    window.history.replaceState({}, '', '/dev/editorial-studio');
  });

  it('AUDIT-02: clicking a focus chip moves .is-focus-hidden from stub onto swim', () => {
    buildShell(['default', 'mockups', 'qa']);
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
    // Initially focused: swim is visible, stub carries is-focus-hidden.
    expect(qaSwim?.classList.contains('is-focus-hidden')).toBe(false);
    expect(qaStub?.classList.contains('is-focus-hidden')).toBe(true);
    // Click the chip to toggle focus off.
    qaChip?.click();
    // Now swim is hidden, stub is visible.
    expect(qaSwim?.classList.contains('is-focus-hidden')).toBe(true);
    expect(qaStub?.classList.contains('is-focus-hidden')).toBe(false);
    // Clicking the stub flips back.
    qaStub?.click();
    expect(qaSwim?.classList.contains('is-focus-hidden')).toBe(false);
    expect(qaStub?.classList.contains('is-focus-hidden')).toBe(true);
  });

  it('AUDIT-04: clicking the rail eye flips data-lane-visible + hides the focus chip via .is-visibility-hidden', () => {
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
    // Initially visible.
    expect(qaRow?.dataset.laneVisible).toBe('true');
    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(false);
    // Click the eye glyph — toggles persistent visibility off.
    qaEye?.click();
    expect(qaRow?.dataset.laneVisible).toBe('false');
    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(true);
    // Click again — turns visibility back on.
    qaEye?.click();
    expect(qaRow?.dataset.laneVisible).toBe('true');
    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(false);
  });

  it('AUDIT-20260530-26: ignores stale unversioned dashboard visibility state', () => {
    window.localStorage.setItem(
      'deskwork:dashboard:test-project-key:visibility',
      JSON.stringify(['qa']),
    );
    buildShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const qaRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="qa"]',
    );
    const qaChip = document.querySelector<HTMLButtonElement>(
      '[data-focus-chip="qa"]',
    );
    expect(qaRow?.dataset.laneVisible).toBe('true');
    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(false);
  });

  it('F5: pressing Enter on a rail row toggles focus (mirrors the click handler)', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const qaRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="qa"]',
    );
    expect(qaRow).not.toBeNull();
    // Initially focused.
    expect(qaRow?.getAttribute('aria-pressed')).toBe('true');
    qaRow?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    // Focus flipped off.
    expect(qaRow?.getAttribute('aria-pressed')).toBe('false');
    // Press Enter again — flips back.
    qaRow?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(qaRow?.getAttribute('aria-pressed')).toBe('true');
  });

  it('F5: pressing Space on a rail row toggles focus and prevents page scroll', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const mockupsRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="mockups"]',
    );
    expect(mockupsRow).not.toBeNull();
    expect(mockupsRow?.getAttribute('aria-pressed')).toBe('true');
    const ev = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    mockupsRow?.dispatchEvent(ev);
    // Toggled.
    expect(mockupsRow?.getAttribute('aria-pressed')).toBe('false');
    // Default prevented (no page scroll on Space).
    expect(ev.defaultPrevented).toBe(true);
  });

  it('F5: keys other than Enter / Space on the rail row are ignored', () => {
    buildShell(['default', 'mockups', 'qa']);
    initSwimlane();
    const qaRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="qa"]',
    );
    expect(qaRow).not.toBeNull();
    const before = qaRow?.getAttribute('aria-pressed');
    qaRow?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
    );
    qaRow?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    );
    expect(qaRow?.getAttribute('aria-pressed')).toBe(before ?? null);
  });
});
