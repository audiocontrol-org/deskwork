/**
 * @vitest-environment jsdom
 *
 * Client-side controller tests for the lane-level + per-stage collapse
 * affordances — Phase 5 Task 5.1A.
 *
 * Exercises `initSwimlaneCollapse` against a synthesised DOM mirroring
 * the server-rendered swim-head + stage-head + collapse-chev markup.
 *
 * Coverage:
 *   - Click on a lane-level chevron toggles `.collapsed` on the
 *     parent `<article class="swim">` and flips aria-expanded.
 *   - Click on a per-stage chevron toggles `.collapsed` on the
 *     parent `<div class="stage-col">` and flips aria-expanded.
 *   - Click anywhere on the enclosing head (not just the chevron)
 *     fires the same toggle.
 *   - Enter / Space on the chevron button activate the toggle;
 *     Space preventDefaults page scroll.
 *   - localStorage persists state across a simulated reload (rebuild
 *     DOM, re-invoke initSwimlaneCollapse, state restores).
 *   - Chevron's hit target is ≥24×24 (the universal min-width /
 *     min-height rule comes from the CSS; jsdom can't compute it
 *     directly, but we assert the rule is on the disk via the
 *     integration test in `dashboard-swimlane.test.ts`).
 *
 * Per WAI-ARIA Authoring Practices for disclosure widgets:
 * `aria-expanded` mirrors `.collapsed`. Per WCAG 2.1 SC 2.4.7 AA
 * (Focus Visible) the chevron is a real focusable `<button>`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initSwimlaneCollapse } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-collapse';

interface BuildOptions {
  readonly laneId: string;
  readonly laneName: string;
  readonly stages: readonly string[];
}

function buildSwim(opts: BuildOptions): HTMLElement {
  const swim = document.createElement('article');
  swim.classList.add('swim', `swim--${opts.laneId}`);
  swim.dataset.laneId = opts.laneId;

  // Swim head with lane-level chevron at the tail.
  const head = document.createElement('div');
  head.classList.add('swim-head');
  const name = document.createElement('span');
  name.classList.add('name');
  name.textContent = opts.laneName;
  head.appendChild(name);
  const laneChev = document.createElement('button');
  laneChev.type = 'button';
  laneChev.classList.add('collapse-chev');
  laneChev.setAttribute('aria-expanded', 'true');
  laneChev.setAttribute('aria-label', `Collapse ${opts.laneName} lane`);
  laneChev.dataset.collapseTarget = 'lane';
  laneChev.dataset.laneId = opts.laneId;
  laneChev.dataset.laneName = opts.laneName;
  laneChev.textContent = '▾';
  head.appendChild(laneChev);
  swim.appendChild(head);

  // Stage grid with per-stage chevrons.
  const grid = document.createElement('div');
  grid.classList.add('stage-grid');
  for (const stage of opts.stages) {
    const col = document.createElement('section');
    col.classList.add('stage-col');
    col.dataset.stageCol = stage;
    const stageHead = document.createElement('div');
    stageHead.classList.add('stage-head');
    const stageName = document.createElement('span');
    stageName.classList.add('stage-name');
    stageName.textContent = stage;
    stageHead.appendChild(stageName);
    const stageChev = document.createElement('button');
    stageChev.type = 'button';
    stageChev.classList.add('collapse-chev');
    stageChev.setAttribute('aria-expanded', 'true');
    stageChev.setAttribute('aria-label', `Collapse ${stage} stage`);
    stageChev.dataset.collapseTarget = 'stage';
    stageChev.dataset.laneId = opts.laneId;
    stageChev.dataset.stageName = stage;
    stageChev.textContent = '▾';
    stageHead.appendChild(stageChev);
    col.appendChild(stageHead);
    grid.appendChild(col);
  }
  swim.appendChild(grid);

  return swim;
}

function buildShell(swims: readonly BuildOptions[]): void {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = 'task-5-1a-test-key';
  for (const opts of swims) {
    shell.appendChild(buildSwim(opts));
  }
  document.body.appendChild(shell);
}

describe('swimlane collapse client — Task 5.1A', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dev/editorial-studio');
  });

  it('clicking the lane-level chevron toggles .collapsed on the swim + flips aria-expanded', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting', 'Final'] },
    ]);
    initSwimlaneCollapse();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    const chev = swim?.querySelector<HTMLButtonElement>(
      '.swim-head > .collapse-chev[data-collapse-target="lane"]',
    ) ?? null;
    expect(swim).not.toBeNull();
    expect(chev).not.toBeNull();
    // Initial state: expanded.
    expect(swim?.classList.contains('collapsed')).toBe(false);
    expect(chev?.getAttribute('aria-expanded')).toBe('true');
    // Click — collapses.
    chev?.click();
    expect(swim?.classList.contains('collapsed')).toBe(true);
    expect(chev?.getAttribute('aria-expanded')).toBe('false');
    // Click again — expands.
    chev?.click();
    expect(swim?.classList.contains('collapsed')).toBe(false);
    expect(chev?.getAttribute('aria-expanded')).toBe('true');
  });

  it('clicking the per-stage chevron toggles .collapsed on the stage-col + flips aria-expanded', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting', 'Final'] },
    ]);
    initSwimlaneCollapse();
    const col = document.querySelector<HTMLElement>(
      '.stage-col[data-stage-col="Drafting"]',
    );
    const chev = col?.querySelector<HTMLButtonElement>(
      '.stage-head > .collapse-chev[data-collapse-target="stage"]',
    ) ?? null;
    expect(col).not.toBeNull();
    expect(chev).not.toBeNull();
    // Initial state: expanded.
    expect(col?.classList.contains('collapsed')).toBe(false);
    expect(chev?.getAttribute('aria-expanded')).toBe('true');
    // Click — collapses.
    chev?.click();
    expect(col?.classList.contains('collapsed')).toBe(true);
    expect(chev?.getAttribute('aria-expanded')).toBe('false');
    // Click again — expands.
    chev?.click();
    expect(col?.classList.contains('collapsed')).toBe(false);
    expect(chev?.getAttribute('aria-expanded')).toBe('true');
  });

  it('clicking elsewhere on the swim-head (not the chevron) also toggles', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneCollapse();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    const name = swim?.querySelector<HTMLElement>('.swim-head > .name');
    expect(swim).not.toBeNull();
    expect(name).not.toBeNull();
    // Click on the lane name — bubbles through to the swim-head
    // handler which toggles via dispatchToggle's fallback.
    name?.click();
    expect(swim?.classList.contains('collapsed')).toBe(true);
  });

  it('clicking elsewhere on the stage-head (not the chevron) also toggles the stage', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneCollapse();
    const col = document.querySelector<HTMLElement>(
      '.stage-col[data-stage-col="Drafting"]',
    );
    const stageName = col?.querySelector<HTMLElement>('.stage-head > .stage-name');
    expect(col).not.toBeNull();
    expect(stageName).not.toBeNull();
    stageName?.click();
    expect(col?.classList.contains('collapsed')).toBe(true);
  });

  it('Enter on the lane chevron activates the toggle (free with <button> primitive)', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneCollapse();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    const chev = swim?.querySelector<HTMLButtonElement>(
      '.swim-head > .collapse-chev[data-collapse-target="lane"]',
    ) ?? null;
    expect(chev).not.toBeNull();
    // jsdom's default `<button>` activation on Enter dispatches a
    // click — call .click() to simulate (which the controller wires
    // through the click handler on swim-head).
    chev?.focus();
    chev?.click();
    expect(swim?.classList.contains('collapsed')).toBe(true);
  });

  it('Space on a chevron activates the toggle + preventDefaults the page scroll', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneCollapse();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    const chev = swim?.querySelector<HTMLButtonElement>(
      '.swim-head > .collapse-chev[data-collapse-target="lane"]',
    ) ?? null;
    expect(chev).not.toBeNull();
    const ev = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    chev?.dispatchEvent(ev);
    // Default prevented (no page scroll).
    expect(ev.defaultPrevented).toBe(true);
    // Toggle fired.
    expect(swim?.classList.contains('collapsed')).toBe(true);
    expect(chev?.getAttribute('aria-expanded')).toBe('false');
  });

  it('keys other than Space on the chevron are ignored by the keydown handler', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneCollapse();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    const chev = swim?.querySelector<HTMLButtonElement>(
      '.swim-head > .collapse-chev[data-collapse-target="lane"]',
    ) ?? null;
    expect(chev).not.toBeNull();
    const tabEv = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    chev?.dispatchEvent(tabEv);
    expect(tabEv.defaultPrevented).toBe(false);
    expect(swim?.classList.contains('collapsed')).toBe(false);
  });

  it('lane-collapse persists in localStorage across a simulated reload', () => {
    const storageKey = 'deskwork:dashboard:task-5-1a-test-key:lane-collapse';
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
      { laneId: 'mockups', laneName: 'Mockups', stages: ['Sketched'] },
    ]);
    initSwimlaneCollapse();
    // Collapse the default lane.
    const chev = document.querySelector<HTMLButtonElement>(
      '.swim[data-lane-id="default"] .swim-head > .collapse-chev',
    );
    chev?.click();
    // localStorage persists.
    const storedRaw = window.localStorage.getItem(storageKey);
    expect(storedRaw).not.toBeNull();
    if (storedRaw === null) return;
    const stored: unknown = JSON.parse(storedRaw);
    expect(Array.isArray(stored)).toBe(true);
    expect(stored).toContain('default');
    expect(stored).not.toContain('mockups');

    // Simulate reload: rebuild DOM, re-invoke init, state restores.
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
      { laneId: 'mockups', laneName: 'Mockups', stages: ['Sketched'] },
    ]);
    initSwimlaneCollapse();
    const defaultSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="default"]',
    );
    const mockupsSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="mockups"]',
    );
    expect(defaultSwim?.classList.contains('collapsed')).toBe(true);
    expect(mockupsSwim?.classList.contains('collapsed')).toBe(false);
    // aria-expanded mirrors the restored state on the chevron too.
    const restoredChev = defaultSwim?.querySelector<HTMLButtonElement>(
      '.swim-head > .collapse-chev[data-collapse-target="lane"]',
    );
    expect(restoredChev?.getAttribute('aria-expanded')).toBe('false');
  });

  it('stage-collapse persists in localStorage (per-lane scoped) across a simulated reload', () => {
    const storageKey = 'deskwork:dashboard:task-5-1a-test-key:stage-collapse';
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting', 'Final'] },
      { laneId: 'mockups', laneName: 'Mockups', stages: ['Sketched', 'Approved'] },
    ]);
    initSwimlaneCollapse();
    // Collapse `default:Drafting` only.
    const chev = document.querySelector<HTMLButtonElement>(
      '.swim[data-lane-id="default"] .stage-col[data-stage-col="Drafting"] .stage-head > .collapse-chev',
    );
    chev?.click();
    // localStorage object: { default: ["Drafting"] }.
    const storedRaw = window.localStorage.getItem(storageKey);
    expect(storedRaw).not.toBeNull();
    if (storedRaw === null) return;
    const stored: unknown = JSON.parse(storedRaw);
    expect(stored).toEqual({ default: ['Drafting'] });

    // Reload — only the default-lane Drafting column collapses.
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting', 'Final'] },
      { laneId: 'mockups', laneName: 'Mockups', stages: ['Sketched', 'Approved'] },
    ]);
    initSwimlaneCollapse();
    const draftingCol = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="default"] .stage-col[data-stage-col="Drafting"]',
    );
    const finalCol = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="default"] .stage-col[data-stage-col="Final"]',
    );
    const mockupsCol = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="mockups"] .stage-col[data-stage-col="Sketched"]',
    );
    expect(draftingCol?.classList.contains('collapsed')).toBe(true);
    expect(finalCol?.classList.contains('collapsed')).toBe(false);
    expect(mockupsCol?.classList.contains('collapsed')).toBe(false);
  });

  it('clicking the collapsed stage-col background (strip) re-expands the stage', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneCollapse();
    const col = document.querySelector<HTMLElement>(
      '.stage-col[data-stage-col="Drafting"]',
    );
    expect(col).not.toBeNull();
    // Collapse first.
    const chev = col?.querySelector<HTMLButtonElement>(
      '.stage-head > .collapse-chev',
    ) ?? null;
    chev?.click();
    expect(col?.classList.contains('collapsed')).toBe(true);
    // Add a non-head child (e.g. a card stub) and click ON THE COL
    // itself (simulating a click on the narrow strip's background
    // padding). dispatchToggleStage's `isCollapsed` branch re-expands.
    col?.click();
    expect(col?.classList.contains('collapsed')).toBe(false);
  });

  it('clicking a card inside an expanded stage-col does NOT toggle (card click is independent)', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneCollapse();
    const col = document.querySelector<HTMLElement>(
      '.stage-col[data-stage-col="Drafting"]',
    );
    expect(col).not.toBeNull();
    // Add a card-like child outside the stage-head.
    const card = document.createElement('div');
    card.classList.add('card');
    card.textContent = 'A draft entry';
    col?.appendChild(card);
    // Click the card — should NOT toggle the column.
    card.click();
    expect(col?.classList.contains('collapsed')).toBe(false);
  });

  it('chevron remains a focusable <button> with non-empty aria-label after toggling', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneCollapse();
    const chev = document.querySelector<HTMLButtonElement>(
      '.swim[data-lane-id="default"] .swim-head > .collapse-chev',
    );
    expect(chev).not.toBeNull();
    expect(chev?.tagName.toLowerCase()).toBe('button');
    // Initial label uses the human-readable lane name from the
    // server: "Collapse <name> lane".
    expect(chev?.getAttribute('aria-label')).toBe('Collapse Editorial lane');
    // After collapse: label flips to "Expand …".
    chev?.click();
    expect(chev?.getAttribute('aria-label')).toBe('Expand Editorial lane');
    // Element is still a focusable <button>.
    expect(chev?.tagName.toLowerCase()).toBe('button');
  });
});
