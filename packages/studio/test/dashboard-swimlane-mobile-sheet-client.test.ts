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
 *   - Click on `[data-lane-sheet-trigger]` toggles `.is-open` on the
 *     container and flips the trigger's aria-expanded.
 *   - Escape key closes the sheet.
 *   - Backdrop click closes the sheet.
 *   - Clicking a `[data-rail-lane]` row inside the sheet closes the
 *     sheet (so the operator sees the bay update after their
 *     activation).
 *   - Clicking the `.r-eye-btn` inside the sheet does NOT close the
 *     sheet (the operator is still curating visibility from inside).
 *   - On close, focus returns to the trigger.
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

  it('clicking the trigger opens the sheet (.is-open class + body attribute + aria-expanded mirrors)', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
    expect(trigger).not.toBeNull();
    expect(container).not.toBeNull();
    expect(container?.classList.contains('is-open')).toBe(false);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);

    trigger?.click();

    expect(container?.classList.contains('is-open')).toBe(true);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(true);
  });

  it('clicking the trigger again closes the sheet', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
    trigger?.click();
    expect(container?.classList.contains('is-open')).toBe(true);
    trigger?.click();
    expect(container?.classList.contains('is-open')).toBe(false);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
  });

  it('Escape key closes an open sheet', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
    trigger?.click();
    expect(container?.classList.contains('is-open')).toBe(true);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(container?.classList.contains('is-open')).toBe(false);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking the backdrop closes the sheet', () => {
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
    expect(container?.classList.contains('is-open')).toBe(true);
    backdrop?.click();
    expect(container?.classList.contains('is-open')).toBe(false);
  });

  it('clicking a rail-lane row inside the open sheet closes the sheet', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
    const qaRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="qa"]',
    );
    trigger?.click();
    expect(container?.classList.contains('is-open')).toBe(true);
    qaRow?.click();
    expect(container?.classList.contains('is-open')).toBe(false);
  });

  it('clicking the .r-eye-btn inside the open sheet does NOT close (operator is curating visibility)', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
    const eye = document.querySelector<HTMLElement>(
      '[data-rail-lane="qa"] .r-eye-btn',
    );
    trigger?.click();
    expect(container?.classList.contains('is-open')).toBe(true);
    eye?.click();
    // Sheet remains open — the eye-button is a hide/show gesture the
    // operator may want to repeat without dismissing.
    expect(container?.classList.contains('is-open')).toBe(true);
  });

  it('pressing Enter on a rail-lane row inside the sheet closes the sheet (mirrors click)', () => {
    buildShellWithSheet(['default', 'mockups', 'qa']);
    initSwimlaneMobileSheet();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    const container = document.querySelector<HTMLElement>('[data-lane-sheet]');
    const mockupsRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="mockups"]',
    );
    trigger?.click();
    expect(container?.classList.contains('is-open')).toBe(true);
    mockupsRow?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(container?.classList.contains('is-open')).toBe(false);
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

  it('initSwimlaneMobileSheet is a no-op when the trigger is absent', () => {
    document.body.innerHTML = '';
    document.body.removeAttribute('data-lane-sheet-open');
    // No throw, no body-attribute side-effect.
    expect(() => initSwimlaneMobileSheet()).not.toThrow();
    expect(document.body.hasAttribute('data-lane-sheet-open')).toBe(false);
  });
});
