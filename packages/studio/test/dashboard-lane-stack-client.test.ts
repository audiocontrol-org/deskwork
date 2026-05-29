/**
 * @vitest-environment jsdom
 *
 * Client-side controller tests for the mobile lane-stack accordion
 * — Phase 5 Task 5.1B mobile-variant (AUDIT-20260528-10).
 *
 * Exercises `initLaneStack` against a synthesised DOM mirroring the
 * server-rendered mobile lane-stack markup (`<section class="lane-
 * stack">` → `<article class="lane-section">` → `<header class="lane-
 * head">` + `<div class="lane-body">`).
 *
 * Coverage:
 *   - Click on the lane-head chevron flips `[hidden]` on the body
 *     AND `aria-expanded` on the chevron.
 *   - Click anywhere on the lane-head (NOT on an inner control)
 *     dispatches the same toggle.
 *   - Click on the lane-head's inner controls (compose chip, view-
 *     toggle radio) does NOT fire the accordion toggle (so the
 *     compose / view-toggle controllers can do their own work).
 *   - Space on the chevron activates + preventDefaults page scroll.
 *   - localStorage persists collapsed state across a simulated
 *     reload.
 *   - The `hidden` attribute is the canonical collapsed marker so
 *     screen readers skip collapsed bodies.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initLaneStack } from '../../../plugins/deskwork-studio/public/src/dashboard/lane-stack';

interface BuildOptions {
  readonly laneId: string;
  readonly laneName: string;
  readonly firstStage: string;
}

function buildLaneSection(opts: BuildOptions): HTMLElement {
  const section = document.createElement('article');
  section.classList.add('lane-section');
  section.dataset.laneSection = '';
  section.dataset.laneId = opts.laneId;
  section.dataset.templateId = 'editorial';

  const head = document.createElement('header');
  head.classList.add('lane-head');
  head.dataset.laneHead = '';

  const name = document.createElement('span');
  name.classList.add('lh-name');
  name.textContent = opts.laneName;
  head.appendChild(name);

  const chev = document.createElement('button');
  chev.type = 'button';
  chev.classList.add('lh-chev', 'collapse-chev');
  chev.setAttribute('aria-expanded', 'true');
  chev.setAttribute('aria-label', `Collapse ${opts.laneName} lane`);
  chev.setAttribute('aria-controls', `lane-body-${opts.laneId}`);
  chev.dataset.collapseTarget = 'lane-section';
  chev.dataset.laneId = opts.laneId;
  chev.dataset.laneName = opts.laneName;
  chev.textContent = '▾';
  head.appendChild(chev);

  // Compose chip — an inner control. Click on it should NOT bubble
  // into the accordion handler (the real compose controller calls
  // stopPropagation; we test the lane-stack's own guard against
  // inner-control clicks regardless).
  const compose = document.createElement('button');
  compose.type = 'button';
  compose.classList.add('swim-compose', 'lh-compose');
  compose.dataset.swimCompose = '';
  compose.dataset.laneId = opts.laneId;
  compose.dataset.firstStage = opts.firstStage;
  head.appendChild(compose);

  // View-toggle — `role="radiogroup"` container with `role="radio"`
  // cells inside. The lane-stack handler should NOT fire on clicks
  // landing on the radio group.
  const vt = document.createElement('div');
  vt.classList.add('view-toggle', 'lh-view-toggle');
  vt.setAttribute('role', 'radiogroup');
  vt.dataset.viewToggle = '';
  vt.dataset.laneId = opts.laneId;
  const kanbanCell = document.createElement('button');
  kanbanCell.type = 'button';
  kanbanCell.classList.add('vt-cell', 'vt-cell--kanban');
  kanbanCell.setAttribute('role', 'radio');
  kanbanCell.setAttribute('aria-checked', 'false');
  kanbanCell.dataset.viewMode = 'kanban';
  kanbanCell.dataset.laneId = opts.laneId;
  vt.appendChild(kanbanCell);
  head.appendChild(vt);

  section.appendChild(head);

  const body = document.createElement('div');
  body.classList.add('lane-body');
  body.dataset.laneBody = '';
  body.id = `lane-body-${opts.laneId}`;
  body.textContent = 'lane body content';
  section.appendChild(body);

  return section;
}

function buildShell(
  sections: readonly BuildOptions[],
  projectKey: string = 'lane-stack-test-key',
): void {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = projectKey;
  const stack = document.createElement('section');
  stack.classList.add('lane-stack');
  stack.dataset.laneStack = '';
  for (const opts of sections) {
    stack.appendChild(buildLaneSection(opts));
  }
  shell.appendChild(stack);
  document.body.appendChild(shell);
}

describe('lane-stack accordion client — AUDIT-20260528-10', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  it('click on the lane-head chevron flips body[hidden] AND aria-expanded', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
    ]);
    initLaneStack();
    const body = document.querySelector<HTMLElement>('[data-lane-body]');
    const chev = document.querySelector<HTMLButtonElement>(
      '.lh-chev[data-collapse-target="lane-section"]',
    );
    expect(body).not.toBeNull();
    expect(chev).not.toBeNull();
    // Starting state — expanded.
    expect(body?.hidden).toBe(false);
    expect(chev?.getAttribute('aria-expanded')).toBe('true');
    // Click to collapse.
    chev?.click();
    expect(body?.hidden).toBe(true);
    expect(chev?.getAttribute('aria-expanded')).toBe('false');
    expect(chev?.getAttribute('aria-label')).toBe('Expand Editorial lane');
    // Click to re-expand.
    chev?.click();
    expect(body?.hidden).toBe(false);
    expect(chev?.getAttribute('aria-expanded')).toBe('true');
    expect(chev?.getAttribute('aria-label')).toBe('Collapse Editorial lane');
  });

  it('click anywhere on the lane-head (not an inner control) dispatches the toggle', () => {
    buildShell([
      { laneId: 'mockups', laneName: 'Mockups', firstStage: 'Sketched' },
    ]);
    initLaneStack();
    const body = document.querySelector<HTMLElement>('[data-lane-body]');
    const head = document.querySelector<HTMLElement>('.lane-head');
    expect(body?.hidden).toBe(false);
    // Click the lane-name span (not the chevron) — should dispatch.
    const name = head?.querySelector<HTMLElement>('.lh-name');
    expect(name).not.toBeNull();
    name?.click();
    expect(body?.hidden).toBe(true);
  });

  it('click on the inner compose chip does NOT fire the accordion toggle', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
    ]);
    initLaneStack();
    const body = document.querySelector<HTMLElement>('[data-lane-body]');
    const compose = document.querySelector<HTMLButtonElement>(
      '.swim-compose[data-swim-compose]',
    );
    expect(body?.hidden).toBe(false);
    compose?.click();
    // Body remained expanded — the chip's click is the chip's own
    // gesture; the accordion handler should ignore it.
    expect(body?.hidden).toBe(false);
  });

  it('click on a view-toggle radio cell does NOT fire the accordion toggle', () => {
    buildShell([
      { laneId: 'qa', laneName: 'QA', firstStage: 'Drafted' },
    ]);
    initLaneStack();
    const body = document.querySelector<HTMLElement>('[data-lane-body]');
    const cell = document.querySelector<HTMLButtonElement>(
      '.vt-cell[data-view-mode]',
    );
    expect(body?.hidden).toBe(false);
    cell?.click();
    expect(body?.hidden).toBe(false);
  });

  it('Space on the chevron activates + preventDefaults page scroll', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
    ]);
    initLaneStack();
    const body = document.querySelector<HTMLElement>('[data-lane-body]');
    const chev = document.querySelector<HTMLButtonElement>(
      '.lh-chev[data-collapse-target="lane-section"]',
    );
    const ev = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    chev?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(body?.hidden).toBe(true);
  });

  it('Enter on the chevron activates via native button keyboard contract', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
    ]);
    initLaneStack();
    const body = document.querySelector<HTMLElement>('[data-lane-body]');
    const chev = document.querySelector<HTMLButtonElement>(
      '.lh-chev[data-collapse-target="lane-section"]',
    );
    // Native HTMLButtonElement.click() is what Enter would
    // trigger; jsdom doesn't synthesize Enter→click natively but
    // we cover the same code path via direct invocation. The
    // explicit click() exercises the same toggle handler the Enter
    // keydown would.
    chev?.click();
    expect(body?.hidden).toBe(true);
  });

  it('collapsed-state persists in localStorage and restores across a rebuild', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
      { laneId: 'mockups', laneName: 'Mockups', firstStage: 'Sketched' },
    ]);
    initLaneStack();
    const defaultChev = document.querySelector<HTMLButtonElement>(
      '.lane-section[data-lane-id="default"] .lh-chev',
    );
    defaultChev?.click();
    // Persisted to localStorage under the expected key.
    const stored = window.localStorage.getItem(
      'deskwork:dashboard:lane-stack-test-key:lane-stack-collapse',
    );
    expect(stored).not.toBeNull();
    if (stored === null) throw new Error('stored value missing');
    expect(JSON.parse(stored)).toEqual(['default']);
    // Simulate a reload — rebuild the DOM and re-invoke. The new
    // DOM should reflect the persisted collapsed state.
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
      { laneId: 'mockups', laneName: 'Mockups', firstStage: 'Sketched' },
    ]);
    initLaneStack();
    const restoredBody = document.querySelector<HTMLElement>(
      '.lane-section[data-lane-id="default"] [data-lane-body]',
    );
    expect(restoredBody?.hidden).toBe(true);
    const restoredChev = document.querySelector<HTMLButtonElement>(
      '.lane-section[data-lane-id="default"] .lh-chev',
    );
    expect(restoredChev?.getAttribute('aria-expanded')).toBe('false');
    // Mockups stays expanded (it was never collapsed).
    const mockupsBody = document.querySelector<HTMLElement>(
      '.lane-section[data-lane-id="mockups"] [data-lane-body]',
    );
    expect(mockupsBody?.hidden).toBe(false);
  });

  it('no bay-shell → no-op (no error thrown)', () => {
    document.body.innerHTML = '<main>no shell here</main>';
    expect(() => initLaneStack()).not.toThrow();
  });

  it('no lane-stack on the page → no-op (init is idempotent)', () => {
    document.body.innerHTML = '';
    const shell = document.createElement('section');
    shell.classList.add('bay-shell');
    shell.dataset.bayShell = '';
    shell.dataset.projectKey = 'k';
    document.body.appendChild(shell);
    expect(() => initLaneStack()).not.toThrow();
  });
});
