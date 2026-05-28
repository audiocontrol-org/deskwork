/**
 * @vitest-environment jsdom
 *
 * Client-side controller tests for the dashboard swimlane shell —
 * Phase 5 Task 5.1 / AUDIT-20260528-02 + AUDIT-20260528-04 acceptance.
 *
 * Exercises `initSwimlane` against a synthesised DOM that mirrors the
 * server-rendered bay-shell markup. Asserts the focus-toggle + eye-
 * toggle move state in the expected directions:
 *
 *   - AUDIT-02: toggling a focused lane off via the focus chip moves
 *     `.is-focus-hidden` from the stub onto the swim, so the stub
 *     becomes visible. Clicking the stub flips back.
 *   - AUDIT-04: toggling a lane's eye-glyph flips
 *     `data-lane-visible` on the rail row + adds `.is-visibility-
 *     hidden` to the focus chip (CSS then hides it).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initSwimlane } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane';

function buildShell(lanes: readonly string[]): void {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = 'test-project-key';
  document.body.appendChild(shell);

  // Lane rail rows.
  const rail = document.createElement('aside');
  rail.classList.add('lane-rail');
  for (const id of lanes) {
    const row = document.createElement('div');
    row.classList.add('rail-lane', 'focused');
    row.dataset.railLane = id;
    row.dataset.laneVisible = 'true';
    row.setAttribute('aria-pressed', 'true');

    const eye = document.createElement('span');
    eye.classList.add('r-eye');
    const visGlyph = document.createElement('span');
    visGlyph.classList.add('r-eye-visible');
    visGlyph.textContent = '●';
    const hidGlyph = document.createElement('span');
    hidGlyph.classList.add('r-eye-hidden');
    hidGlyph.textContent = '○';
    eye.appendChild(visGlyph);
    eye.appendChild(hidGlyph);

    row.appendChild(eye);
    rail.appendChild(row);
  }
  shell.appendChild(rail);

  // Focus chips.
  const strip = document.createElement('nav');
  strip.classList.add('focus-strip');
  for (const id of lanes) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.classList.add('focus-chip', 'active');
    chip.dataset.focusChip = id;
    chip.setAttribute('aria-pressed', 'true');
    strip.appendChild(chip);
  }
  shell.appendChild(strip);

  // Per-lane swim + stub pairs.
  for (const id of lanes) {
    const swim = document.createElement('article');
    swim.classList.add('swim', `swim--${id}`);
    swim.dataset.laneId = id;
    shell.appendChild(swim);

    const stub = document.createElement('button');
    stub.type = 'button';
    stub.classList.add('swim-stub', 'is-focus-hidden');
    stub.dataset.swimStub = id;
    shell.appendChild(stub);
  }
}

// jsdom lacks `CSS.escape`. The lane ids we use here are simple
// kebab-case strings, so identity is a safe shim — escape would be a
// no-op anyway. This avoids depending on a browser-only global the
// jsdom environment doesn't ship.
interface CSSShim {
  escape: (id: string) => string;
}
if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
  (globalThis as { CSS: CSSShim }).CSS = { escape: (s: string) => s };
}

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
    const qaEye = qaRow?.querySelector<HTMLElement>('.r-eye') ?? null;
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
});
