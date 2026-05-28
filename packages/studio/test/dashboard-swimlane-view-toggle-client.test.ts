/**
 * @vitest-environment jsdom
 *
 * Client-side controller tests for the per-lane kanban ↔ list view
 * toggle — Phase 5 Task 5.1B.
 *
 * Exercises `initSwimlaneViewToggle` against a synthesised DOM
 * mirroring the server-rendered swim-head + view-toggle + dual-body
 * (`.stage-grid` + `.list-body`) markup.
 *
 * Coverage:
 *   - Click on a `.vt-cell--list` flips the parent `.swim` to
 *     `.view-list` (drops `.view-kanban`) and persists to
 *     localStorage.
 *   - Click on a `.vt-cell--kanban` flips back.
 *   - Per-lane scope: clicking one swim's toggle does not affect
 *     another swim's view-mode.
 *   - Viewport-aware default: when `matchMedia` reports mobile, the
 *     controller sets `.view-list` by default (no operator override
 *     set yet).
 *   - Persistence: localStorage override survives a simulated reload.
 *   - Operator override beats viewport default: even on mobile, if
 *     a lane has `kanban` in localStorage, the swim renders kanban.
 *   - Keyboard activation: Space on a `.vt-cell` flips view-mode
 *     and preventDefaults page scroll.
 *   - Collapse precedence: when `.swim.collapsed`, click on a
 *     `.vt-cell` is a no-op.
 *   - `aria-checked` mirrors current selection on both cells (radio-
 *     group semantics — exactly one is true).
 *   - MutationObserver flips `aria-disabled` when the swim's
 *     `.collapsed` class is toggled by an external controller
 *     (swimlane-collapse.ts).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initSwimlaneViewToggle } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle';

interface BuildOptions {
  readonly laneId: string;
  readonly laneName: string;
  readonly stages: readonly string[];
  /** Initial server view-mode class — kanban by default (matches server render). */
  readonly initialViewMode?: 'kanban' | 'list';
  /** When true, the swim is pre-collapsed (for collapse-precedence tests). */
  readonly collapsed?: boolean;
}

function buildSwim(opts: BuildOptions): HTMLElement {
  const swim = document.createElement('article');
  const viewMode = opts.initialViewMode ?? 'kanban';
  swim.classList.add('swim', `swim--${opts.laneId}`, `view-${viewMode}`);
  if (opts.collapsed === true) swim.classList.add('collapsed');
  swim.dataset.laneId = opts.laneId;

  // Swim head with the view-toggle + a lane-collapse chevron sibling
  // (so the click handler's stopPropagation behaviour can be observed
  // — the chevron's click handler is in `swimlane-collapse.ts` but
  // we don't init that controller here; the assertion is just that
  // the view-toggle click doesn't bubble to the swim-head).
  const head = document.createElement('div');
  head.classList.add('swim-head');
  const name = document.createElement('span');
  name.classList.add('name');
  name.textContent = opts.laneName;
  head.appendChild(name);

  // View-toggle radiogroup.
  const toggle = document.createElement('div');
  toggle.classList.add('view-toggle');
  toggle.setAttribute('role', 'radiogroup');
  toggle.setAttribute('aria-label', `View mode for ${opts.laneName}`);
  toggle.dataset.viewToggle = '';
  toggle.dataset.laneId = opts.laneId;
  for (const mode of ['kanban', 'list'] as const) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.classList.add('vt-cell', `vt-cell--${mode}`);
    if (mode === viewMode) cell.classList.add('active');
    cell.setAttribute('role', 'radio');
    cell.setAttribute('aria-checked', mode === viewMode ? 'true' : 'false');
    cell.setAttribute('aria-disabled', opts.collapsed === true ? 'true' : 'false');
    cell.setAttribute('aria-label', mode === 'kanban' ? 'Kanban view' : 'List view');
    cell.dataset.viewMode = mode;
    cell.dataset.laneId = opts.laneId;
    const icon = document.createElement('span');
    icon.classList.add('vt-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = mode === 'kanban' ? '▦' : '≡';
    const label = document.createElement('span');
    label.classList.add('vt-label');
    label.textContent = mode === 'kanban' ? 'Kanban' : 'List';
    cell.appendChild(icon);
    cell.appendChild(label);
    toggle.appendChild(cell);
  }
  head.appendChild(toggle);
  swim.appendChild(head);

  // Stage grid + list body stubs (the controller never touches
  // their contents — only the swim's view-* class — so empty
  // stage-grid + list-body suffice).
  const grid = document.createElement('div');
  grid.classList.add('stage-grid');
  for (const stage of opts.stages) {
    const col = document.createElement('section');
    col.classList.add('stage-col');
    col.dataset.stageCol = stage;
    grid.appendChild(col);
  }
  swim.appendChild(grid);
  const list = document.createElement('div');
  list.classList.add('list-body');
  list.dataset.listBody = '';
  for (const stage of opts.stages) {
    const group = document.createElement('div');
    group.classList.add('lb-group');
    group.dataset.lbGroup = stage;
    list.appendChild(group);
  }
  swim.appendChild(list);
  return swim;
}

function buildShell(
  swims: readonly BuildOptions[],
  projectKey: string = 'task-5-1b-test-key',
): void {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = projectKey;
  for (const opts of swims) {
    shell.appendChild(buildSwim(opts));
  }
  document.body.appendChild(shell);
}

/**
 * Stub `window.matchMedia` so the controller's viewport-default
 * branch resolves deterministically. jsdom's default `matchMedia`
 * returns `matches: false` for every query.
 *
 * The shim is installed via `Object.defineProperty(window, ...)`
 * so we can replace the value attribute under jsdom (which seals
 * `window.matchMedia` against direct assignment in strict mode).
 * The controller reads only `.matches` + `.addEventListener` from
 * the returned object — the shim covers those two surfaces with
 * the same structural shape `MediaQueryList` declares; no cast
 * needed because we install via `defineProperty` with the
 * function value, which is `unknown`-typed at the property level.
 */
interface MediaQueryListShim {
  matches: boolean;
  media: string;
  onchange: null;
  addEventListener(
    type: 'change',
    listener: (ev: MediaQueryListEvent) => void,
  ): void;
  removeEventListener(
    type: 'change',
    listener: (ev: MediaQueryListEvent) => void,
  ): void;
  addListener(listener: (ev: MediaQueryListEvent) => void): void;
  removeListener(listener: (ev: MediaQueryListEvent) => void): void;
  dispatchEvent(ev: Event): boolean;
}

function setMatchMediaMatches(matches: boolean): void {
  const listeners = new Set<(ev: MediaQueryListEvent) => void>();
  function makeMql(): MediaQueryListShim {
    return {
      matches,
      media: '(max-width: 720px)',
      onchange: null,
      addEventListener(_type, listener): void {
        listeners.add(listener);
      },
      removeEventListener(_type, listener): void {
        listeners.delete(listener);
      },
      addListener(listener): void {
        listeners.add(listener);
      },
      removeListener(listener): void {
        listeners.delete(listener);
      },
      dispatchEvent(_ev: Event): boolean {
        return false;
      },
    };
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: makeMql,
  });
}

describe('swimlane view-toggle client — Task 5.1B', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dev/editorial-studio');
    setMatchMediaMatches(false); // desktop default
  });

  it('clicking the .vt-cell--list flips the swim to .view-list + persists', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneViewToggle();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    expect(swim).not.toBeNull();
    expect(swim?.classList.contains('view-kanban')).toBe(true);
    expect(swim?.classList.contains('view-list')).toBe(false);

    const listCell = swim?.querySelector<HTMLButtonElement>(
      '.view-toggle .vt-cell--list',
    );
    expect(listCell).not.toBeNull();
    listCell?.click();
    expect(swim?.classList.contains('view-list')).toBe(true);
    expect(swim?.classList.contains('view-kanban')).toBe(false);

    // localStorage persists.
    const storedRaw = window.localStorage.getItem(
      'deskwork:dashboard:task-5-1b-test-key:view-mode',
    );
    expect(storedRaw).not.toBeNull();
    if (storedRaw === null) return;
    const stored: unknown = JSON.parse(storedRaw);
    expect(stored).toEqual({ default: 'list' });
  });

  it('clicking .vt-cell--kanban flips back to .view-kanban', () => {
    // Pre-seed the operator override so the post-init state is
    // `view-list` (otherwise the desktop default would resolve the
    // swim back to kanban regardless of the server-rendered class).
    window.localStorage.setItem(
      'deskwork:dashboard:task-5-1b-test-key:view-mode',
      JSON.stringify({ default: 'list' }),
    );
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'], initialViewMode: 'list' },
    ]);
    initSwimlaneViewToggle();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    expect(swim?.classList.contains('view-list')).toBe(true);
    const kanbanCell = swim?.querySelector<HTMLButtonElement>(
      '.view-toggle .vt-cell--kanban',
    );
    kanbanCell?.click();
    expect(swim?.classList.contains('view-kanban')).toBe(true);
    expect(swim?.classList.contains('view-list')).toBe(false);
  });

  it('per-lane scope: clicking one swim does not change another', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
      { laneId: 'mockups', laneName: 'Mockups', stages: ['Sketched'] },
    ]);
    initSwimlaneViewToggle();
    const defaultSwim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    const mockupsSwim = document.querySelector<HTMLElement>('.swim[data-lane-id="mockups"]');
    const defaultListCell = defaultSwim?.querySelector<HTMLButtonElement>('.vt-cell--list');
    defaultListCell?.click();
    expect(defaultSwim?.classList.contains('view-list')).toBe(true);
    // Mockups swim still in kanban.
    expect(mockupsSwim?.classList.contains('view-kanban')).toBe(true);
    expect(mockupsSwim?.classList.contains('view-list')).toBe(false);

    // localStorage only carries the default lane's override.
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(
        'deskwork:dashboard:task-5-1b-test-key:view-mode',
      ) ?? '{}',
    );
    expect(stored).toEqual({ default: 'list' });
  });

  it('viewport-aware default — mobile viewport flips lanes to list by default', () => {
    setMatchMediaMatches(true); // mobile
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
      { laneId: 'mockups', laneName: 'Mockups', stages: ['Sketched'] },
    ]);
    initSwimlaneViewToggle();
    // Server-default class is `view-kanban`; the controller flips
    // both to `view-list` on mobile when no override is present.
    for (const id of ['default', 'mockups']) {
      const swim = document.querySelector<HTMLElement>(`.swim[data-lane-id="${id}"]`);
      expect(swim?.classList.contains('view-list')).toBe(true);
      expect(swim?.classList.contains('view-kanban')).toBe(false);
    }
  });

  it('viewport-aware default — desktop viewport keeps lanes in kanban', () => {
    setMatchMediaMatches(false); // desktop
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneViewToggle();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    expect(swim?.classList.contains('view-kanban')).toBe(true);
    expect(swim?.classList.contains('view-list')).toBe(false);
  });

  it('per-lane override beats viewport default — mobile with stored kanban shows kanban', () => {
    window.localStorage.setItem(
      'deskwork:dashboard:task-5-1b-test-key:view-mode',
      JSON.stringify({ default: 'kanban' }),
    );
    setMatchMediaMatches(true); // mobile
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
      { laneId: 'mockups', laneName: 'Mockups', stages: ['Sketched'] },
    ]);
    initSwimlaneViewToggle();
    // default lane has stored override → kanban; mockups falls to
    // viewport default → list.
    const defaultSwim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    const mockupsSwim = document.querySelector<HTMLElement>('.swim[data-lane-id="mockups"]');
    expect(defaultSwim?.classList.contains('view-kanban')).toBe(true);
    expect(mockupsSwim?.classList.contains('view-list')).toBe(true);
  });

  it('per-lane override survives a simulated reload', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneViewToggle();
    const listCell = document.querySelector<HTMLButtonElement>(
      '.swim[data-lane-id="default"] .vt-cell--list',
    );
    listCell?.click();
    // Simulate reload: rebuild DOM, re-init. The server still
    // serves `view-kanban`; the controller restores the operator
    // override from localStorage on top.
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneViewToggle();
    const restoredSwim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    expect(restoredSwim?.classList.contains('view-list')).toBe(true);
    expect(restoredSwim?.classList.contains('view-kanban')).toBe(false);
  });

  it('aria-checked mirrors current selection on both cells (radio-group semantics)', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneViewToggle();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    const kanbanCell = swim?.querySelector<HTMLButtonElement>('.vt-cell--kanban');
    const listCell = swim?.querySelector<HTMLButtonElement>('.vt-cell--list');
    expect(kanbanCell?.getAttribute('aria-checked')).toBe('true');
    expect(listCell?.getAttribute('aria-checked')).toBe('false');
    listCell?.click();
    expect(kanbanCell?.getAttribute('aria-checked')).toBe('false');
    expect(listCell?.getAttribute('aria-checked')).toBe('true');
    // .active class mirrors aria-checked.
    expect(kanbanCell?.classList.contains('active')).toBe(false);
    expect(listCell?.classList.contains('active')).toBe(true);
  });

  it('Space on a vt-cell activates the toggle + preventDefaults', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneViewToggle();
    const listCell = document.querySelector<HTMLButtonElement>(
      '.swim[data-lane-id="default"] .vt-cell--list',
    );
    expect(listCell).not.toBeNull();
    const ev = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    listCell?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    expect(swim?.classList.contains('view-list')).toBe(true);
  });

  it('collapse precedence — click on .vt-cell when swim is .collapsed is a no-op', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'], collapsed: true },
    ]);
    initSwimlaneViewToggle();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    expect(swim?.classList.contains('collapsed')).toBe(true);
    // Server default is `view-kanban`; verify still kanban after click.
    const listCell = swim?.querySelector<HTMLButtonElement>('.vt-cell--list');
    listCell?.click();
    expect(swim?.classList.contains('view-kanban')).toBe(true);
    expect(swim?.classList.contains('view-list')).toBe(false);
    // No localStorage write either.
    const storedRaw = window.localStorage.getItem(
      'deskwork:dashboard:task-5-1b-test-key:view-mode',
    );
    expect(storedRaw).toBeNull();
  });

  it('collapse precedence — aria-disabled flips when an external controller toggles .collapsed', async () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneViewToggle();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    const cells = swim?.querySelectorAll<HTMLButtonElement>(
      '.view-toggle .vt-cell[data-view-mode]',
    );
    expect(cells?.length).toBe(2);
    // Initial state: aria-disabled="false".
    for (const c of cells ?? []) {
      expect(c.getAttribute('aria-disabled')).toBe('false');
    }
    // Simulate collapse via external controller toggling the class.
    swim?.classList.add('collapsed');
    // MutationObserver fires asynchronously — yield once.
    await Promise.resolve();
    for (const c of cells ?? []) {
      expect(c.getAttribute('aria-disabled')).toBe('true');
    }
    swim?.classList.remove('collapsed');
    await Promise.resolve();
    for (const c of cells ?? []) {
      expect(c.getAttribute('aria-disabled')).toBe('false');
    }
  });

  it('vt-cell click does not bubble to the swim-head (would otherwise trigger lane collapse)', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneViewToggle();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    const swimHead = swim?.querySelector<HTMLElement>('.swim-head');
    let bubbledClicks = 0;
    swimHead?.addEventListener('click', () => {
      bubbledClicks += 1;
    });
    const listCell = swim?.querySelector<HTMLButtonElement>('.vt-cell--list');
    listCell?.click();
    expect(bubbledClicks).toBe(0);
  });

  it('cells remain real focusable <button> elements after toggling', () => {
    buildShell([
      { laneId: 'default', laneName: 'Editorial', stages: ['Drafting'] },
    ]);
    initSwimlaneViewToggle();
    const listCell = document.querySelector<HTMLButtonElement>(
      '.swim[data-lane-id="default"] .vt-cell--list',
    );
    expect(listCell?.tagName.toLowerCase()).toBe('button');
    listCell?.click();
    expect(listCell?.tagName.toLowerCase()).toBe('button');
    expect(listCell?.getAttribute('aria-label')).toBe('List view');
  });
});
