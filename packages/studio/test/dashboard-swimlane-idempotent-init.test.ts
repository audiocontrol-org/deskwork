/**
 * @vitest-environment jsdom
 *
 * AUDIT-20260530-30 (cross-model: AUDIT-BARRAGE-codex-P5-1) —
 * the four swimlane init controllers must be idempotent across
 * repeated invocations against the SAME bay-shell. Pre-fix, each
 * `init*()` bound its listeners unconditionally; a second call against
 * the same DOM stacked duplicate handlers AND (for `initSwimlane`)
 * reassigned the module-level `activeState` singleton so previously-
 * bound handlers retained closure references to the prior `state`
 * object — splitting state mutations across two objects.
 *
 * The fix mirrors the `initRowMemberTab` / `initGroupMembersSection`
 * precedent (commit 90be5c3, AUDIT-20260529-42) but stores the wired-
 * once sentinel on the bay-shell element's dataset rather than on
 * module-level state. This adaptation preserves the wired-once
 * contract while staying compatible with the existing ~80 test
 * invocations across nine sibling test files that rebuild the shell
 * between `beforeEach` blocks and expect the next `init*()` against
 * the fresh DOM to bind handlers. Same shell + second init = no-op
 * (audit's concern); fresh shell + first init = bind (existing tests).
 *
 * Each per-controller test measures an observable signal:
 *   - `initSwimlane`: clicking a focus chip once writes the focus
 *     storage key exactly once (one handler bound, not two).
 *   - `initSwimlaneCollapse`: clicking a stage-collapse chev once
 *     writes the stage-collapse storage key exactly once.
 *   - `initSwimlaneViewToggle`: clicking a list-mode cell once
 *     writes the view-mode storage key exactly once.
 *   - `initSwimlaneCompose`: clicking the compose chip once writes
 *     the clipboard exactly once.
 *
 * Sentinel: in every case the assertion is `setItem` (or clipboard
 * `writeText`) call-count === 1 after a SECOND init followed by a
 * single click. Pre-fix the count was 2. Post-fix it is 1.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { initSwimlane } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane';
import { initSwimlaneCollapse } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-collapse';
import { initSwimlaneViewToggle } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle';
import { initSwimlaneCompose } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-compose';

const PROJECT_KEY = 'audit-30-idempotent-key';

interface ClipboardShim {
  writeText: (text: string) => Promise<void>;
}

function installClipboard(): { calls: string[] } {
  const calls: string[] = [];
  const shim: ClipboardShim = {
    writeText: async (text) => {
      calls.push(text);
    },
  };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: shim,
  });
  return { calls };
}

function uninstallClipboard(): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

/**
 * Build a bay-shell rich enough to exercise every controller in one
 * DOM. Mirrors the server-rendered shape: data-bay-shell, lane rail
 * + eye buttons, focus chips, per-lane swim with header + compose
 * chip + stage column + collapse chev + view-toggle cells.
 */
function buildFullShell(): HTMLElement {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = PROJECT_KEY;

  // Lane rail.
  const rail = document.createElement('aside');
  rail.classList.add('lane-rail');
  const railLane = document.createElement('div');
  railLane.classList.add('rail-lane', 'focused');
  railLane.dataset.railLane = 'default';
  railLane.dataset.laneVisible = 'true';
  railLane.setAttribute('aria-pressed', 'true');
  const eye = document.createElement('button');
  eye.type = 'button';
  eye.classList.add('r-eye-btn');
  eye.setAttribute('aria-label', 'Toggle visibility for default lane');
  railLane.appendChild(eye);
  rail.appendChild(railLane);
  shell.appendChild(rail);

  // Focus chips.
  const strip = document.createElement('nav');
  strip.classList.add('focus-strip');
  const focusChip = document.createElement('button');
  focusChip.type = 'button';
  focusChip.classList.add('focus-chip', 'active');
  focusChip.dataset.focusChip = 'default';
  focusChip.setAttribute('aria-pressed', 'true');
  strip.appendChild(focusChip);
  shell.appendChild(strip);

  // Per-lane swim — view-kanban so view-toggle list-cell switches.
  const swim = document.createElement('article');
  swim.classList.add('swim', 'swim--default', 'view-kanban');
  swim.dataset.laneId = 'default';

  // Swim head with compose chip + view-toggle cells.
  const head = document.createElement('div');
  head.classList.add('swim-head');
  const name = document.createElement('span');
  name.classList.add('name');
  name.textContent = 'Default';
  head.appendChild(name);
  const composeChip = document.createElement('button');
  composeChip.type = 'button';
  composeChip.classList.add('swim-compose');
  composeChip.setAttribute('aria-label', 'Compose new entry in Default');
  composeChip.dataset.swimCompose = '';
  composeChip.dataset.laneId = 'default';
  composeChip.dataset.firstStage = 'Ideas';
  const composeIcon = document.createElement('span');
  composeIcon.classList.add('sc-icon');
  composeIcon.setAttribute('aria-hidden', 'true');
  composeIcon.textContent = '+';
  const composeLabel = document.createElement('span');
  composeLabel.classList.add('sc-label');
  composeLabel.textContent = 'new';
  composeChip.appendChild(composeIcon);
  composeChip.appendChild(composeLabel);
  head.appendChild(composeChip);

  // View-toggle radiogroup — selectors mirror the canonical shape
  // bound by `bindCellClicks` in swimlane-view-toggle.ts:
  // `.view-toggle .vt-cell[data-view-mode]`. The per-cell
  // `data-lane-id` is required so `activateCell` can route the
  // override into the per-lane overrides Map.
  const viewToggle = document.createElement('div');
  viewToggle.classList.add('view-toggle');
  viewToggle.dataset.viewToggle = '';
  viewToggle.dataset.laneId = 'default';
  viewToggle.setAttribute('role', 'radiogroup');
  const kanbanCell = document.createElement('button');
  kanbanCell.type = 'button';
  kanbanCell.classList.add('vt-cell', 'vt-cell--kanban', 'active');
  kanbanCell.dataset.viewMode = 'kanban';
  kanbanCell.dataset.laneId = 'default';
  kanbanCell.setAttribute('role', 'radio');
  kanbanCell.setAttribute('aria-checked', 'true');
  viewToggle.appendChild(kanbanCell);
  const listCell = document.createElement('button');
  listCell.type = 'button';
  listCell.classList.add('vt-cell', 'vt-cell--list');
  listCell.dataset.viewMode = 'list';
  listCell.dataset.laneId = 'default';
  listCell.setAttribute('role', 'radio');
  listCell.setAttribute('aria-checked', 'false');
  viewToggle.appendChild(listCell);
  head.appendChild(viewToggle);

  // Lane-level collapse chev on the swim head — selectors mirror
  // the canonical shape bound by `bindHandlers` in
  // swimlane-collapse.ts: `.swim-head > .collapse-chev[data-collapse
  // -target="lane"]`. Append BEFORE closing the head so the chev
  // sits as a swim-head child.
  const laneChev = document.createElement('button');
  laneChev.type = 'button';
  laneChev.classList.add('collapse-chev');
  laneChev.dataset.collapseTarget = 'lane';
  laneChev.dataset.laneId = 'default';
  laneChev.dataset.laneName = 'Default';
  laneChev.setAttribute('aria-expanded', 'true');
  laneChev.setAttribute('aria-label', 'Collapse Default lane');
  head.appendChild(laneChev);

  swim.appendChild(head);

  // Stage grid + per-stage column with collapse chev — selectors
  // mirror the canonical shape bound by `bindHandlers` in
  // swimlane-collapse.ts: `.stage-col[data-stage-col]` parent,
  // `.stage-head > .collapse-chev[data-collapse-target="stage"]`
  // chev with `data-lane-id` + `data-stage-name`.
  const grid = document.createElement('div');
  grid.classList.add('stage-grid');
  const stageCol = document.createElement('section');
  stageCol.classList.add('stage-col');
  stageCol.dataset.stageCol = 'Ideas';
  const stageHead = document.createElement('div');
  stageHead.classList.add('stage-head');
  const stageChev = document.createElement('button');
  stageChev.type = 'button';
  stageChev.classList.add('collapse-chev');
  stageChev.dataset.collapseTarget = 'stage';
  stageChev.dataset.laneId = 'default';
  stageChev.dataset.stageName = 'Ideas';
  stageChev.setAttribute('aria-expanded', 'true');
  stageChev.setAttribute('aria-label', 'Collapse Ideas stage');
  stageHead.appendChild(stageChev);
  stageCol.appendChild(stageHead);
  grid.appendChild(stageCol);
  swim.appendChild(grid);

  shell.appendChild(swim);

  // Per-lane stub (for swim-stub click path).
  const stub = document.createElement('button');
  stub.type = 'button';
  stub.classList.add('swim-stub', 'is-focus-hidden');
  stub.dataset.swimStub = 'default';
  shell.appendChild(stub);

  document.body.appendChild(shell);
  return shell;
}

// jsdom lacks `CSS.escape`. The lane ids we use are simple
// kebab-case strings — identity shim is safe (escape would be a
// no-op anyway).
interface CSSShim {
  escape: (id: string) => string;
}
if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
  (globalThis as { CSS: CSSShim }).CSS = { escape: (s: string) => s };
}

describe('swimlane init* — idempotency (AUDIT-20260530-30)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dev/editorial-studio');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initSwimlane: second call against the same shell does NOT stack focus-chip handlers', () => {
    buildFullShell();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    initSwimlane();
    // Reset spy history so we only count writes from the post-click
    // phase (initSwimlane writes through the focus + visibility keys
    // on first paint per the controller's `persist` call).
    setItemSpy.mockClear();
    initSwimlane(); // second call MUST be a no-op (sentinel guard).

    const chip = document.querySelector<HTMLButtonElement>(
      '[data-focus-chip="default"]',
    );
    expect(chip, 'focus chip should exist').not.toBeNull();
    chip!.click();

    // Filter to the focus storage key written by the toggle handler.
    // Pre-fix two handlers wrote two pairs (focus + visibility) =
    // four total writes; post-fix one handler writes one pair = two
    // writes (focus + visibility together via `persist`).
    const focusWrites = setItemSpy.mock.calls.filter(
      ([key]) => typeof key === 'string' && key.endsWith(':focus'),
    );
    expect(focusWrites.length).toBe(1);
  });

  it('initSwimlane: sanity — first init alone wires exactly one focus-chip handler', () => {
    buildFullShell();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    initSwimlane();
    setItemSpy.mockClear();

    const chip = document.querySelector<HTMLButtonElement>(
      '[data-focus-chip="default"]',
    );
    chip!.click();

    const focusWrites = setItemSpy.mock.calls.filter(
      ([key]) => typeof key === 'string' && key.endsWith(':focus'),
    );
    expect(focusWrites.length).toBe(1);
  });

  it('initSwimlaneCollapse: second call does NOT stack stage-collapse-chev handlers', () => {
    buildFullShell();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    initSwimlaneCollapse();
    setItemSpy.mockClear();
    initSwimlaneCollapse(); // second call MUST be a no-op.

    const chev = document.querySelector<HTMLButtonElement>(
      '.stage-col[data-stage-col="Ideas"] .stage-head > .collapse-chev[data-collapse-target="stage"]',
    );
    expect(chev, 'stage chev should exist').not.toBeNull();
    chev!.click();

    const stageWrites = setItemSpy.mock.calls.filter(
      ([key]) =>
        typeof key === 'string' && key.endsWith(':stage-collapse'),
    );
    expect(stageWrites.length).toBe(1);
  });

  it('initSwimlaneCollapse: sanity — first init alone wires exactly one stage-chev handler', () => {
    buildFullShell();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    initSwimlaneCollapse();
    setItemSpy.mockClear();

    const chev = document.querySelector<HTMLButtonElement>(
      '.stage-col[data-stage-col="Ideas"] .stage-head > .collapse-chev[data-collapse-target="stage"]',
    );
    chev!.click();

    const stageWrites = setItemSpy.mock.calls.filter(
      ([key]) =>
        typeof key === 'string' && key.endsWith(':stage-collapse'),
    );
    expect(stageWrites.length).toBe(1);
  });

  it('initSwimlaneViewToggle: second call does NOT stack view-toggle-cell handlers', () => {
    buildFullShell();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    initSwimlaneViewToggle();
    setItemSpy.mockClear();
    initSwimlaneViewToggle(); // second call MUST be a no-op.

    const listCell = document.querySelector<HTMLButtonElement>(
      '.view-toggle .vt-cell[data-view-mode="list"]',
    );
    expect(listCell, 'list cell should exist').not.toBeNull();
    listCell!.click();

    const viewModeWrites = setItemSpy.mock.calls.filter(
      ([key]) =>
        typeof key === 'string' && key.endsWith(':view-mode'),
    );
    expect(viewModeWrites.length).toBe(1);
  });

  it('initSwimlaneViewToggle: sanity — first init alone wires exactly one view-cell handler', () => {
    buildFullShell();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    initSwimlaneViewToggle();
    setItemSpy.mockClear();

    const listCell = document.querySelector<HTMLButtonElement>(
      '.view-toggle .vt-cell[data-view-mode="list"]',
    );
    listCell!.click();

    const viewModeWrites = setItemSpy.mock.calls.filter(
      ([key]) =>
        typeof key === 'string' && key.endsWith(':view-mode'),
    );
    expect(viewModeWrites.length).toBe(1);
  });

  it('initSwimlaneCompose: second call does NOT stack compose-chip handlers', async () => {
    buildFullShell();
    const { calls } = installClipboard();
    try {
      initSwimlaneCompose();
      initSwimlaneCompose(); // second call MUST be a no-op.

      const chip = document.querySelector<HTMLButtonElement>('.swim-compose');
      expect(chip, 'compose chip should exist').not.toBeNull();
      chip!.click();
      // Yield once for the async clipboard write to resolve. The
      // controller's bindAffordance handler awaits clipboard.writeText
      // before transitioning to the copied flash state; a single
      // microtask flush is enough to observe the call.
      await Promise.resolve();
      await Promise.resolve();

      // Pre-fix: two click handlers => two writeText calls.
      // Post-fix: one handler => one call.
      expect(calls.length).toBe(1);
    } finally {
      uninstallClipboard();
    }
  });

  it('initSwimlaneCompose: sanity — first init alone wires exactly one compose-chip handler', async () => {
    buildFullShell();
    const { calls } = installClipboard();
    try {
      initSwimlaneCompose();

      const chip = document.querySelector<HTMLButtonElement>('.swim-compose');
      chip!.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(calls.length).toBe(1);
    } finally {
      uninstallClipboard();
    }
  });

  it('all four init*: sentinel attributes flip to "true" on the bay-shell after init', () => {
    const shell = buildFullShell();
    initSwimlane();
    initSwimlaneCollapse();
    initSwimlaneViewToggle();
    initSwimlaneCompose();

    expect(shell.dataset.swimlaneWired).toBe('true');
    expect(shell.dataset.swimlaneCollapseWired).toBe('true');
    expect(shell.dataset.swimlaneViewToggleWired).toBe('true');
    expect(shell.dataset.swimlaneComposeWired).toBe('true');
  });
});
