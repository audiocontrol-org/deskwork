/**
 * @vitest-environment jsdom
 *
 * Phase 5 Task 5.5 — saveable focus presets store-level tests.
 *
 * Covers the five store-and-apply-path tests originally inlined in
 * `dashboard-swimlane-presets-client.test.ts`:
 *
 *   - Snapshot captures all four state axes (visible / focused /
 *     view-mode / collapse) from localStorage at the moment of save.
 *   - AUDIT-20260528-38 mobile→desktop round-trip — preset preserves
 *     the operator's viewport-resolved view-mode across viewport
 *     changes.
 *   - Save / persist / list round-trip via `savePresetFromCurrent` +
 *     `listPresets`.
 *   - `applyPreset` writes through all four storage keys.
 *   - `applyPreset` reapplies through the constituent controllers
 *     (focused state matches the preset post-apply).
 *
 * The deep-link + Save/Delete UI tests live in the sibling
 * `dashboard-swimlane-presets-client.test.ts`. Per AUDIT-20260528-14
 * this split brings each file under the 300-500 line cap.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyPreset,
  listPresets,
  savePresetFromCurrent,
  snapshotCurrentState,
  type FocusPreset,
} from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store';
import {
  PROJECT_KEY,
  PREFIX,
  buildShell,
  bootControllers,
  setMatchMediaMatches,
} from './__helpers/dashboard-swimlane-presets-fixture.ts';

describe('Task 5.5 — saveable focus presets store + apply path', () => {
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
});
