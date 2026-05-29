/**
 * Shared jsdom fixture + helpers for the swimlane-presets client
 * tests. Originally inlined in `dashboard-swimlane-presets-client
 * .test.ts` (589 lines); split out per AUDIT-20260528-14 to satisfy
 * the 300-500 line per-file cap.
 *
 * Mirrors the CSS.escape shim pattern from `dashboard-swimlane-
 * client.test.ts` because jsdom does not ship `CSS.escape` and the
 * swimlane controller calls it on every apply pass. Also installs
 * the `setMatchMediaMatches` shim so the view-toggle controller's
 * viewport-default branch resolves deterministically across the
 * AUDIT-38 mobile→desktop round-trip test.
 */

import { initSwimlane } from '../../../../plugins/deskwork-studio/public/src/dashboard/swimlane';
import { initSwimlaneCollapse } from '../../../../plugins/deskwork-studio/public/src/dashboard/swimlane-collapse';
import { initSwimlaneViewToggle } from '../../../../plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle';
import type { PresetControllerHooks } from '../../../../plugins/deskwork-studio/public/src/dashboard/swimlane-presets';

export const PROJECT_KEY = 'test-project-key';
export const PREFIX = `deskwork:dashboard:${PROJECT_KEY}`;

interface CSSShim {
  escape: (id: string) => string;
}
if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
  (globalThis as { CSS: CSSShim }).CSS = { escape: (s: string) => s };
}

/**
 * Stub `window.matchMedia` so the view-toggle controller's viewport-
 * default branch resolves deterministically. Mirrors the shim in
 * `dashboard-swimlane-view-toggle-client.test.ts` — installed via
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

export function setMatchMediaMatches(matches: boolean): void {
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

export function buildShell(lanes: readonly string[]): void {
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

export function bootControllers(): void {
  initSwimlane();
  initSwimlaneCollapse();
  initSwimlaneViewToggle();
}

export function makeHooks(
  name: string,
  confirm: boolean = true,
): PresetControllerHooks {
  return {
    promptForName: () => Promise.resolve(name),
    confirmDelete: () => Promise.resolve(confirm),
  };
}
