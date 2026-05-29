/**
 * @vitest-environment jsdom
 *
 * Client-side controller tests for the Phase 5 Task 5.5 saveable
 * focus presets feature. Verifies:
 *
 *   - Save snapshot captures all four state axes (visible / focused /
 *     view-mode / collapse) from localStorage at the moment of save.
 *   - Load apply writes through all four axes + updates the DOM via
 *     the constituent controllers' `reapply*FromStorage` exports.
 *   - Deep-link URL `?preset=<id>` on init applies the named preset
 *     when the id resolves.
 *   - Delete removes a preset + refreshes the list surface.
 *   - Four-axis snapshot round-trip — every axis the snapshot
 *     captures is restorable through the apply path.
 *
 * Mirrors the CSS.escape shim pattern from `dashboard-swimlane-
 * client.test.ts:98-107` because jsdom does not ship `CSS.escape`
 * and the swimlane controller calls it on every apply pass.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initSwimlane } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane';
import { initSwimlaneCollapse } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-collapse';
import { initSwimlaneViewToggle } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle';
import {
  initSwimlanePresets,
  type PresetControllerHooks,
} from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-presets';
import {
  applyPreset,
  listPresets,
  savePresetFromCurrent,
  snapshotCurrentState,
  type FocusPreset,
} from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store';

const PROJECT_KEY = 'test-project-key';
const PREFIX = `deskwork:dashboard:${PROJECT_KEY}`;

interface CSSShim {
  escape: (id: string) => string;
}
if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
  (globalThis as { CSS: CSSShim }).CSS = { escape: (s: string) => s };
}

/**
 * Stub `window.matchMedia` so the view-toggle controller's viewport-
 * default branch resolves deterministically. Mirrors the shim in
 * `dashboard-swimlane-view-toggle-client.test.ts:194` — installed via
 * `Object.defineProperty` because jsdom seals `window.matchMedia`
 * against direct assignment in strict mode. Used by the AUDIT-38
 * regression test (save under mobile default, apply under desktop).
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

function buildShell(lanes: readonly string[]): void {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = PROJECT_KEY;
  document.body.appendChild(shell);

  const rail = document.createElement('aside');
  rail.classList.add('lane-rail');
  rail.dataset.laneRail = '';

  // Rail head + preset surface (mirrors server-rendered markup).
  const head = document.createElement('div');
  head.classList.add('rail-head');
  head.textContent = 'Lanes';
  const presetSurface = document.createElement('div');
  presetSurface.classList.add('rail-presets');
  presetSurface.dataset.railPresets = '';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.classList.add('preset-save');
  saveBtn.dataset.presetSave = '';
  saveBtn.textContent = '+ Save as preset';
  presetSurface.appendChild(saveBtn);
  const list = document.createElement('div');
  list.classList.add('preset-list');
  list.dataset.presetList = '';
  presetSurface.appendChild(list);
  head.appendChild(presetSurface);
  rail.appendChild(head);

  for (const id of lanes) {
    const row = document.createElement('div');
    row.classList.add('rail-lane', 'focused');
    row.dataset.railLane = id;
    row.dataset.laneVisible = 'true';
    row.setAttribute('aria-pressed', 'true');

    const eye = document.createElement('button');
    eye.type = 'button';
    eye.classList.add('r-eye-btn');
    eye.setAttribute('aria-label', `Toggle visibility for ${id} lane`);
    row.appendChild(eye);
    rail.appendChild(row);
  }
  shell.appendChild(rail);

  // Focus chips.
  const strip = document.createElement('nav');
  strip.classList.add('focus-strip');
  strip.dataset.focusStrip = '';
  for (const id of lanes) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.classList.add('focus-chip', 'active');
    chip.dataset.focusChip = id;
    chip.setAttribute('aria-pressed', 'true');
    strip.appendChild(chip);
  }
  shell.appendChild(strip);

  // Swims (+ a stage column + a view-toggle radiogroup per lane so
  // the constituent controllers have something to apply to).
  for (const id of lanes) {
    const swim = document.createElement('article');
    swim.classList.add('swim', 'view-kanban');
    swim.dataset.laneId = id;

    const swimHead = document.createElement('div');
    swimHead.classList.add('swim-head');
    const collapseChev = document.createElement('button');
    collapseChev.type = 'button';
    collapseChev.classList.add('collapse-chev');
    collapseChev.dataset.collapseTarget = 'lane';
    collapseChev.dataset.laneId = id;
    swimHead.appendChild(collapseChev);

    const viewToggle = document.createElement('div');
    viewToggle.classList.add('view-toggle');
    viewToggle.setAttribute('role', 'radiogroup');
    for (const mode of ['kanban', 'list'] as const) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.classList.add('vt-cell');
      cell.dataset.viewMode = mode;
      cell.dataset.laneId = id;
      cell.setAttribute('role', 'radio');
      cell.setAttribute('aria-checked', mode === 'kanban' ? 'true' : 'false');
      viewToggle.appendChild(cell);
    }
    swimHead.appendChild(viewToggle);
    swim.appendChild(swimHead);

    const stageGrid = document.createElement('div');
    stageGrid.classList.add('stage-grid');
    const stageCol = document.createElement('div');
    stageCol.classList.add('stage-col');
    stageCol.dataset.stageCol = 'Drafting';
    const stageHead = document.createElement('div');
    stageHead.classList.add('stage-head');
    const stageChev = document.createElement('button');
    stageChev.type = 'button';
    stageChev.classList.add('collapse-chev');
    stageChev.dataset.collapseTarget = 'stage';
    stageChev.dataset.laneId = id;
    stageChev.dataset.stageName = 'Drafting';
    stageHead.appendChild(stageChev);
    stageCol.appendChild(stageHead);
    stageGrid.appendChild(stageCol);
    swim.appendChild(stageGrid);

    shell.appendChild(swim);

    const stub = document.createElement('button');
    stub.type = 'button';
    stub.classList.add('swim-stub', 'is-focus-hidden');
    stub.dataset.swimStub = id;
    shell.appendChild(stub);
  }
}

function bootControllers(): void {
  initSwimlane();
  initSwimlaneCollapse();
  initSwimlaneViewToggle();
}

function makeHooks(name: string, confirm: boolean = true): PresetControllerHooks {
  return {
    promptForName: () => Promise.resolve(name),
    confirmDelete: () => Promise.resolve(confirm),
  };
}

describe('Task 5.5 — saveable focus presets client controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dev/editorial-studio');
    // Reset viewport to desktop between tests so each test starts from
    // a known matchMedia stance. The AUDIT-38 test flips this to mobile
    // mid-test; without the reset its state would leak into subsequent
    // tests under the module-singleton view-toggle state.
    setMatchMediaMatches(false);
  });

  it('snapshot captures all four state axes (view-mode from DOM, others from storage)', () => {
    buildShell(['default', 'mockups', 'qa']);

    // Set up storage BEFORE booting controllers so the view-toggle
    // init pass applies `default: list` to the DOM. The snapshot
    // reads view-mode from the live `.swim.view-*` classes (per
    // AUDIT-20260528-38) so the DOM must reflect the intended state.
    window.localStorage.setItem(
      `${PREFIX}:visibility`,
      JSON.stringify(['qa']),
    );
    window.localStorage.setItem(
      `${PREFIX}:focus`,
      JSON.stringify(['default', 'mockups']),
    );
    window.localStorage.setItem(
      `${PREFIX}:view-mode`,
      JSON.stringify({ default: 'list' }),
    );
    window.localStorage.setItem(
      `${PREFIX}:lane-collapse`,
      JSON.stringify(['mockups']),
    );
    window.localStorage.setItem(
      `${PREFIX}:stage-collapse`,
      JSON.stringify({ default: ['Drafting'] }),
    );

    bootControllers();

    const snapshot = snapshotCurrentState(PROJECT_KEY);

    expect(snapshot.visibleLanes).toEqual(['default', 'mockups']);
    expect(snapshot.focusedLanes).toEqual(['default', 'mockups']);
    // The view-toggle's desktop default (matchMedia matches=false in
    // jsdom) resolves to `kanban` for any lane without an explicit
    // override. The snapshot reflects the resolved DOM state — `default`
    // is `list` (operator override), `mockups` + `qa` are `kanban`.
    expect(snapshot.viewModePerLane).toEqual({
      default: 'list',
      mockups: 'kanban',
      qa: 'kanban',
    });
    expect(snapshot.laneCollapseState).toEqual({ mockups: true });
    // Per AUDIT-20260528-37 (F6) the stage-collapse axis is now
    // `Record<laneId, readonly string[]>` — only collapsed names
    // present.
    expect(snapshot.stageCollapseState).toEqual({
      default: ['Drafting'],
    });
  });

  it('AUDIT-20260528-38: preset round-trips view-mode across viewport (mobile→desktop)', () => {
    // Repro: save under mobile-default list mode (no explicit toggle),
    // apply under desktop matchMedia. Before the fix, the snapshot
    // read view-mode from storage only — viewport-derived defaults
    // are never persisted, so `viewModePerLane` would be `{}`. The
    // apply then resolves to desktop's `kanban` default, and the
    // operator's saved "list view" preset opens as kanban. With the
    // DOM-read fix the snapshot captures the EFFECTIVE per-lane mode
    // (mobile→list for all three lanes) and the apply restores it.
    setMatchMediaMatches(true); // simulate mobile viewport
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();

    // Sanity: the view-toggle's mobile default applied `view-list`
    // to every swim. (If this fails the test premise is wrong.)
    const defaultSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="default"]',
    );
    expect(defaultSwim?.classList.contains('view-list')).toBe(true);

    // Save a preset. localStorage's `view-mode` key is empty (no
    // operator clicks); only the DOM carries the resolved mode.
    expect(window.localStorage.getItem(`${PREFIX}:view-mode`)).toBeNull();
    const saved = savePresetFromCurrent(PROJECT_KEY, 'Mobile list view');
    // The snapshot captured the DOM state, so all three lanes are
    // `list`. Without the AUDIT-38 fix this would be `{}` because
    // storage is empty.
    expect(saved.viewModePerLane).toEqual({
      default: 'list',
      mockups: 'list',
      qa: 'list',
    });

    // Now rebuild the page under DESKTOP viewport and apply the
    // preset. Without the fix the preset's empty view-mode map plus
    // desktop default would resolve to `kanban`. With the fix the
    // preset carries `list` for every lane, so the lanes stay list.
    document.body.innerHTML = '';
    setMatchMediaMatches(false); // simulate desktop viewport
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();

    // Sanity: at this point all three swims are `view-kanban` (desktop
    // default applied during init).
    const desktopDefaultSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="default"]',
    );
    expect(desktopDefaultSwim?.classList.contains('view-kanban')).toBe(true);

    // Apply the preset — every lane should flip to list.
    applyPreset(PROJECT_KEY, saved);

    const swims = document.querySelectorAll<HTMLElement>('.swim[data-lane-id]');
    expect(swims.length).toBe(3);
    for (const swim of swims) {
      expect(swim.classList.contains('view-list')).toBe(true);
      expect(swim.classList.contains('view-kanban')).toBe(false);
    }
  });

  it('saving captures + persisting + listing the preset round-trips', () => {
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();

    window.localStorage.setItem(
      `${PREFIX}:focus`,
      JSON.stringify(['default']),
    );

    const saved = savePresetFromCurrent(PROJECT_KEY, 'Press Bay only');
    expect(saved.name).toBe('Press Bay only');
    expect(saved.focusedLanes).toEqual(['default']);

    const all = listPresets(PROJECT_KEY);
    expect(all.length).toBe(1);
    expect(all[0].id).toBe(saved.id);
    expect(all[0].name).toBe('Press Bay only');
  });

  it('applyPreset writes through all four storage keys', () => {
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();

    const preset: FocusPreset = {
      id: 'p-test',
      name: 'Test',
      createdAt: '2026-05-28T12:00:00.000Z',
      visibleLanes: ['default', 'qa'],
      focusedLanes: ['default'],
      viewModePerLane: { qa: 'list' },
      laneCollapseState: { default: true },
      stageCollapseState: { qa: ['Drafting'] },
    };

    applyPreset(PROJECT_KEY, preset);

    // Visibility: hidden = allLanes − visibleLanes = [mockups].
    expect(window.localStorage.getItem(`${PREFIX}:visibility`)).toBe(
      JSON.stringify(['mockups']),
    );
    // Focus: written through verbatim.
    expect(window.localStorage.getItem(`${PREFIX}:focus`)).toBe(
      JSON.stringify(['default']),
    );
    // View-mode: per-lane map written through verbatim.
    expect(window.localStorage.getItem(`${PREFIX}:view-mode`)).toBe(
      JSON.stringify({ qa: 'list' }),
    );
    // Lane-collapse: only `default` is true → ['default'].
    expect(window.localStorage.getItem(`${PREFIX}:lane-collapse`)).toBe(
      JSON.stringify(['default']),
    );
    // Stage-collapse: { qa: ['Drafting'] }.
    expect(window.localStorage.getItem(`${PREFIX}:stage-collapse`)).toBe(
      JSON.stringify({ qa: ['Drafting'] }),
    );
  });

  it('applyPreset reapplies through controllers (focused state matches preset)', () => {
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();

    const preset: FocusPreset = {
      id: 'p-focus',
      name: 'Focus',
      createdAt: '2026-05-28T12:00:00.000Z',
      visibleLanes: ['default', 'mockups', 'qa'],
      focusedLanes: ['mockups'],
      viewModePerLane: { mockups: 'list' },
      laneCollapseState: {},
      stageCollapseState: {},
    };

    applyPreset(PROJECT_KEY, preset);

    // DOM should reflect: only `mockups` is focused (its swim is
    // visible); default + qa are stubs.
    const mockupsSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="mockups"]',
    );
    const defaultSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="default"]',
    );
    expect(mockupsSwim?.classList.contains('is-focus-hidden')).toBe(false);
    expect(defaultSwim?.classList.contains('is-focus-hidden')).toBe(true);

    // View-mode: mockups should now be list.
    expect(mockupsSwim?.classList.contains('view-list')).toBe(true);
    expect(mockupsSwim?.classList.contains('view-kanban')).toBe(false);
  });

  it('deep-link `?preset=<id>` applies the named preset on init', () => {
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();

    // Seed a preset in storage.
    const preset: FocusPreset = {
      id: 'deeplink',
      name: 'Deep Link',
      createdAt: '2026-05-28T12:00:00.000Z',
      visibleLanes: ['default', 'mockups', 'qa'],
      focusedLanes: ['qa'],
      viewModePerLane: {},
      laneCollapseState: {},
      stageCollapseState: {},
    };
    window.localStorage.setItem(
      `${PREFIX}:focus-presets`,
      JSON.stringify({ deeplink: preset }),
    );

    // Arrange the URL with the preset param and init the preset
    // controller — it should read the param + apply the preset.
    window.history.replaceState({}, '', '/dev/editorial-studio?preset=deeplink');
    initSwimlanePresets(makeHooks(''));

    expect(window.localStorage.getItem(`${PREFIX}:focus`)).toBe(
      JSON.stringify(['qa']),
    );
    const qaSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="qa"]',
    );
    expect(qaSwim?.classList.contains('is-focus-hidden')).toBe(false);
    const defaultSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="default"]',
    );
    expect(defaultSwim?.classList.contains('is-focus-hidden')).toBe(true);
  });

  it('deep-link with unknown preset id is a no-op', () => {
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();
    window.history.replaceState({}, '', '/dev/editorial-studio?preset=does-not-exist');
    // Before init: focus has all-three (default behavior in init).
    const before = window.localStorage.getItem(`${PREFIX}:focus`);
    initSwimlanePresets(makeHooks(''));
    const after = window.localStorage.getItem(`${PREFIX}:focus`);
    expect(after).toBe(before);
  });

  it('Save button + name prompt + Load + Delete affordances are bound', async () => {
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();

    // Hook that always returns "MySaved" as the preset name.
    const hooks = makeHooks('MySaved', true);
    initSwimlanePresets(hooks);

    // Initially empty.
    expect(document.querySelector('.preset-empty')).not.toBeNull();

    // Click Save.
    const saveBtn = document.querySelector<HTMLButtonElement>(
      '[data-preset-save]',
    );
    expect(saveBtn).not.toBeNull();
    saveBtn?.click();
    // Yield for the async hook chain (promptForName + flash).
    await Promise.resolve();
    await Promise.resolve();

    // Save flash applied.
    expect(saveBtn?.classList.contains('is-flashing')).toBe(true);
    // Empty state replaced by the saved row.
    expect(document.querySelector('.preset-empty')).toBeNull();
    const loadBtn = document.querySelector<HTMLButtonElement>(
      '[data-preset-load]',
    );
    expect(loadBtn?.textContent).toBe('MySaved');

    // Delete the preset.
    const deleteBtn = document.querySelector<HTMLButtonElement>(
      '[data-preset-delete]',
    );
    expect(deleteBtn).not.toBeNull();
    deleteBtn?.click();
    await Promise.resolve();
    await Promise.resolve();

    // List goes back to empty.
    expect(document.querySelector('.preset-empty')).not.toBeNull();
    expect(listPresets(PROJECT_KEY).length).toBe(0);
  });

  it('Save prompt returning null short-circuits the save', async () => {
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();

    const hooks: PresetControllerHooks = {
      promptForName: () => Promise.resolve(null),
      confirmDelete: () => Promise.resolve(true),
    };
    initSwimlanePresets(hooks);
    const saveBtn = document.querySelector<HTMLButtonElement>(
      '[data-preset-save]',
    );
    saveBtn?.click();
    // Yield for the async hook to resolve.
    await Promise.resolve();
    expect(listPresets(PROJECT_KEY).length).toBe(0);
  });

  it('Delete confirm returning false short-circuits the delete', async () => {
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();

    const hooks: PresetControllerHooks = {
      promptForName: () => Promise.resolve('Saved'),
      confirmDelete: () => Promise.resolve(false),
    };
    initSwimlanePresets(hooks);

    const saveBtn = document.querySelector<HTMLButtonElement>(
      '[data-preset-save]',
    );
    saveBtn?.click();
    await Promise.resolve();
    expect(listPresets(PROJECT_KEY).length).toBe(1);

    const deleteBtn = document.querySelector<HTMLButtonElement>(
      '[data-preset-delete]',
    );
    deleteBtn?.click();
    await Promise.resolve();
    expect(listPresets(PROJECT_KEY).length).toBe(1);
  });
});
