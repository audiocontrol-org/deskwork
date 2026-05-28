/**
 * @vitest-environment jsdom
 *
 * Client-side controller tests for the dashboard swimlane shell —
 * Phase 5 Task 5.1 / AUDIT-20260528-02 + AUDIT-20260528-04 acceptance
 * + F5 / F6 a11y acceptance from the code-quality pass.
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
 *   - F6: the eye-toggle is a real focusable `<button class="r-eye-
 *     btn">` with a non-empty `aria-label`; the visible / hidden
 *     glyphs still ship as decorative `aria-hidden` children.
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

    // F6 a11y: the eye-toggle is a real `<button class="r-eye-btn">`
    // (previously a `<span class="r-eye">`). The inner `<span>`
    // glyphs are decorative children — driven by CSS visibility
    // rules on the parent rail-lane's data-lane-visible attribute.
    const eye = document.createElement('button');
    eye.type = 'button';
    eye.classList.add('r-eye-btn');
    eye.setAttribute('aria-label', `Toggle visibility for ${id} lane`);
    const visGlyph = document.createElement('span');
    visGlyph.classList.add('r-eye-visible');
    visGlyph.setAttribute('aria-hidden', 'true');
    visGlyph.textContent = '●';
    const hidGlyph = document.createElement('span');
    hidGlyph.classList.add('r-eye-hidden');
    hidGlyph.setAttribute('aria-hidden', 'true');
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
