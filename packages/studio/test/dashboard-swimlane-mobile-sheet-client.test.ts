/**
 * @vitest-environment jsdom
 *
 * Client-side controller tests for the mobile lane-visibility sheet —
 * Phase 5 Task 5.3.3.
 *
 * Exercises `initSwimlaneMobileSheet` against a synthesised DOM that
 * mirrors the server-rendered bay-shell markup (trigger in the bay-
 * head + `[data-lane-sheet]` container wrapping `.lane-rail` +
 * `[data-lane-sheet-backdrop]` sibling).
 *
 * Coverage:
 *   - Click on `[data-lane-sheet-trigger]` flips
 *     `body[data-lane-sheet-open]` and the trigger's aria-expanded.
 *   - Escape key closes the sheet.
 *   - Backdrop click closes the sheet.
 *   - Clicking a `[data-rail-lane]` row inside the sheet closes the
 *     sheet (so the operator sees the bay update after their
 *     activation).
 *   - Clicking the `.r-eye-btn` inside the sheet does NOT close the
 *     sheet (the operator is still curating visibility from inside).
 *   - On close, focus returns to the trigger.
 *   - Focus trap (AUDIT-20260530-38 / AUDIT-20260530-41): Tab from the
 *     last focusable wraps to the first; Shift+Tab from the first
 *     wraps to the last; Tab mid-list does not escape to document.body
 *     or to the trigger behind the scrim.
 *   - Unified-state contract (AUDIT-20260530-40): the sheet's visual
 *     state is driven by a SINGLE signal —
 *     `body[data-lane-sheet-open]`. The local controller does not
 *     maintain a parallel `.is-open` class on the container; both the
 *     rail slide-up and the backdrop CSS key off the body attribute.
 *
 * The shared `createSlideUpSheet` controller writes its own
 * `data-lane-sheet-open` attribute on `document.body`; assertions
 * verify the body attribute mirrors the open/closed state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initSwimlaneMobileSheet } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet';

function buildShellWithSheet(lanes: readonly string[]): void {
  document.body.innerHTML = '';
  document.body.removeAttribute('data-lane-sheet-open');

  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  document.body.appendChild(shell);

  // Lane sheet container (wraps the rail).
  const container = document.createElement('div');
  container.classList.add('lane-sheet-container');
  container.id = 'lane-sheet';
  container.dataset.laneSheet = '';

  // Backdrop sibling — the controller uses it as the scrim.
  const backdrop = document.createElement('div');
  backdrop.classList.add('lane-sheet-backdrop');
  backdrop.dataset.laneSheetBackdrop = '';
  backdrop.setAttribute('aria-hidden', 'true');
  container.appendChild(backdrop);

  // The rail itself, containing one row per lane with an eye button.
  const rail = document.createElement('aside');
  rail.classList.add('lane-rail');
  for (const id of lanes) {
    const row = document.createElement('div');
    row.classList.add('rail-lane');
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.dataset.railLane = id;
    row.dataset.laneVisible = 'true';
    row.setAttribute('aria-pressed', 'true');

    const eye = document.createElement('button');
    eye.type = 'button';
    eye.classList.add('r-eye-btn');
    eye.setAttribute('aria-label', `Toggle visibility for ${id} lane`);
    row.appendChild(eye);

    const name = document.createElement('span');
    name.classList.add('r-name');
    name.textContent = id;
    row.appendChild(name);

    rail.appendChild(row);
  }
  container.appendChild(rail);
  shell.appendChild(container);

  // Bay-head with the trigger.
  const bay = document.createElement('main');
  bay.classList.add('bay');
  const bayHead = document.createElement('div');
  bayHead.classList.add('bay-head');
  const row1 = document.createElement('div');
  row1.classList.add('bh-row-1');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.classList.add('lane-sheet-trigger');
  trigger.dataset.laneSheetTrigger = '';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'lane-sheet');
  trigger.setAttribute('aria-label', 'Show lane visibility sheet');
  trigger.textContent = 'Lanes ▾';
  row1.appendChild(trigger);
  bayHead.appendChild(row1);
  bay.appendChild(bayHead);
  shell.appendChild(bay);
}

interface CSSShim {
  escape: (id: string) => string;
}
if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
  (globalThis as { CSS: CSSShim }).CSS = { escape: (s: string) => s };
}

describe('swimlane mobile sheet controller — Task 5.3.3', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.removeAttribute('data-lane-sheet-open');
  });

  it('clicking the trigger opens the sheet (body attribute + aria-expanded mirrors)', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
    expect(trigger).not.toBeNull();
    expect(container).not.toBeNull();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);

    trigger?.click();

    // The body attribute is the single source of truth for the sheet's
    // visual state (AUDIT-20260530-40); the local controller does not
    // maintain a parallel `.is-open` class on the container.
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(true);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
  });

  it('clicking the trigger again closes the sheet', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    trigger?.click();
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(true);
    trigger?.click();
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });

  it('Escape key closes an open sheet', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    trigger?.click();
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(true);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking the backdrop closes the sheet', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const backdrop = document.querySelector<HTMLElement>(
      '[data-lane-sheet-backdrop]',
    );
    trigger?.click();
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(true);
    backdrop?.click();
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
  });

  it('clicking a rail-lane row inside the open sheet closes the sheet', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const qaRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="qa"]',
    );
    trigger?.click();
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(true);
    qaRow?.click();
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
  });

  it('clicking the .r-eye-btn inside the open sheet does NOT close (operator is curating visibility)', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const eye = document.querySelector<HTMLElement>(
      '[data-rail-lane="qa"] .r-eye-btn',
    );
    trigger?.click();
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(true);
    eye?.click();
    // Sheet remains open — the eye-button is a hide/show gesture the
    // operator may want to repeat without dismissing.
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(true);
  });

  it('pressing Enter on a rail-lane row inside the sheet closes the sheet (mirrors click)', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const mockupsRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="mockups"]',
    );
    trigger?.click();
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(true);
    mockupsRow?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
  });

  it('on close, focus returns to the trigger', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    trigger?.click();
    // Focus has moved into the sheet (first eye button).
    const firstEye = document.querySelector<HTMLElement>(
      '[data-rail-lane] .r-eye-btn',
    );
    expect(document.activeElement).toBe(firstEye);
    // Close via Escape.
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(document.activeElement).toBe(trigger);
  });

  // ---------------------------------------------------------------------------
  // Focus trap — AUDIT-20260530-38 / AUDIT-20260530-41 regression coverage.
  //
  // The audit scope explicitly names "mobile-sheet a11y (focus trap, scrim,
  // dismiss)" and a scrim-backed bottom sheet over background content is the
  // canonical case where Tab can silently walk focus out of the sheet into the
  // page behind the scrim. These tests pin the contract that Tab from the last
  // focusable wraps to the first sheet-internal focusable and that Shift+Tab
  // from the first wraps to the last — proving focus does NOT escape to
  // document.body or background controls while the sheet is open.
  //
  // Note: jsdom does not implement the browser's native Tab focus traversal;
  // the focus-trap controller must explicitly call `.focus()` on the wrap
  // target. These tests dispatch a Tab keydown from a focused source element
  // and assert `document.activeElement` is the wrap target.
  // ---------------------------------------------------------------------------

  it('Tab from the last focusable inside the sheet wraps focus to the first focusable (no escape)', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    trigger?.click();
    // Sheet is open; focus is on the first eye-button.
    const sheet = document.querySelector<HTMLElement>('[data-lane-sheet]');
    expect(sheet).not.toBeNull();
    const focusables = sheet?.querySelectorAll<HTMLElement>(
      'button, [tabindex="0"]',
    );
    expect(focusables).not.toBeUndefined();
    const first = focusables?.[0];
    const last = focusables?.[focusables.length - 1];
    expect(first).not.toBeUndefined();
    expect(last).not.toBeUndefined();
    // Focus the last focusable and dispatch Tab — focus must wrap to first.
    last?.focus();
    expect(document.activeElement).toBe(last);
    last?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    );
    expect(document.activeElement).toBe(first);
    // And focus has NOT escaped to the body or to the trigger.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).not.toBe(trigger);
  });

  it('Shift+Tab from the first focusable inside the sheet wraps focus to the last focusable (no escape)', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    trigger?.click();
    const sheet = document.querySelector<HTMLElement>('[data-lane-sheet]');
    const focusables = sheet?.querySelectorAll<HTMLElement>(
      'button, [tabindex="0"]',
    );
    const first = focusables?.[0];
    const last = focusables?.[focusables.length - 1];
    expect(first).not.toBeUndefined();
    expect(last).not.toBeUndefined();
    first?.focus();
    expect(document.activeElement).toBe(first);
    first?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(last);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).not.toBe(trigger);
  });

  it('Tab keydown inside the sheet does NOT escape to document.body when focus is mid-list', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    trigger?.click();
    const sheet = document.querySelector<HTMLElement>('[data-lane-sheet]');
    const focusables = sheet?.querySelectorAll<HTMLElement>(
      'button, [tabindex="0"]',
    );
    // Focus a middle focusable (not the first or last). The trap permits the
    // browser's natural traversal — we assert only that focus remains inside
    // the sheet (i.e., the trap does not move focus, and the source element
    // remains the activeElement because jsdom does not natively advance Tab
    // focus). This pins that the trap does not over-fire on non-edge Tabs.
    const middleIdx = Math.floor((focusables?.length ?? 0) / 2);
    const middle = focusables?.[middleIdx];
    expect(middle).not.toBeUndefined();
    middle?.focus();
    expect(document.activeElement).toBe(middle);
    middle?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    );
    // The trap should NOT have hijacked focus to first/last; jsdom's natural
    // behavior (no advance) is preserved. The point is focus stays inside the
    // sheet — not at document.body, not at the trigger.
    expect(sheet?.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).not.toBe(trigger);
  });

  it('initSwimlaneMobileSheet is a no-op when the trigger is absent', () => {
    document.body.innerHTML = '';
    document.body.removeAttribute('data-lane-sheet-open');
    // No throw, no body-attribute side-effect.
    expect(() => initSwimlaneMobileSheet()).not.toThrow();
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Unified state-source — AUDIT-20260530-40 regression coverage.
  //
  // Pre-fix, the sheet's visual state was split across two flags: the backdrop
  // CSS keyed off `body[data-lane-sheet-open]` (set by the shared controller),
  // while the rail's slide-up CSS keyed off `.lane-sheet-container.is-open`
  // (set by the local controller's `openSheet`/`onClose`). The finding called
  // out the fragility: if the shared controller ever closed via a path that
  // didn't invoke the local `onClose` (auto-dismiss, resize handler, second
  // close() early-return), the body attribute and the container class would
  // diverge — backdrop fading while the panel stays slid-up, or vice-versa.
  //
  // The fix unifies on `body[data-lane-sheet-open]` as the single source of
  // truth (CSS rewritten to key the rail slide-up off the body attribute; the
  // `.is-open` class manipulation removed from `swimlane-mobile-sheet.ts`).
  // These tests pin the unified-state contract: both the rail and backdrop's
  // visible state derive from the same body attribute, and the local code no
  // longer maintains a parallel class.
  // ---------------------------------------------------------------------------

  it('open and close paths drive a single body attribute — no parallel container class added', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
    expect(container?.classList.contains('is-open')).toBe(false);

    trigger?.click();
    // Open: body attribute flips, container does NOT acquire `.is-open`
    // (the local code no longer maintains this redundant flag).
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(true);
    expect(container?.classList.contains('is-open')).toBe(false);

    trigger?.click();
    // Close: body attribute clears, container still does not carry `.is-open`.
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
    expect(container?.classList.contains('is-open')).toBe(false);
  });

  it('Escape close clears the body attribute and aria-expanded together (no class divergence)', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
    trigger?.click();
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(true);
    // Pre-fix this asserted `.is-open` true after open; post-fix the class is
    // never set. The body attribute is the sole presentation signal.
    expect(container?.classList.contains('is-open')).toBe(false);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    // Escape closes via the shared controller's keydown handler (NOT via the
    // trigger click path). The body attribute clears, aria-expanded mirrors,
    // and no container class is left dangling.
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(container?.classList.contains('is-open')).toBe(false);
  });

  it('backdrop close drives the same single signal (body attribute) — no divergence', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
    const backdrop = document.querySelector<HTMLElement>(
      '[data-lane-sheet-backdrop]',
    );
    trigger?.click();
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(true);

    backdrop?.click();

    // The shared controller's scrim-click path closes the sheet by clearing
    // the body attribute and firing onClose. Because the rail and backdrop
    // CSS both key off `body[data-lane-sheet-open]`, both surfaces close in
    // lockstep — there is no second flag to keep in sync.
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
    expect(container?.classList.contains('is-open')).toBe(false);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });
});
