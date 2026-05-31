/**
 * @vitest-environment jsdom
 *
 * AUDIT-20260530-45 (cross-model: AUDIT-BARRAGE-claude-P5-3) — preset
 * lane-id reconciliation against the live lane set.
 *
 * The drag-order controller defends against stale lane ids via
 * `reconcileOrder` in `swimlane-reorder.ts`: every stored id is
 * checked against the live lane set and the read collapses to the
 * server order when any stored id is missing. The preset store had
 * no equivalent — `applyPreset` and `savePresetFromCurrent` wrote
 * `visibleLanes` / `focusedLanes` verbatim, so a renamed / archived /
 * purged lane id stayed in the preset (and in `:focus` / `:visibility`
 * storage post-apply) indefinitely.
 *
 * The fix mirrors `reconcileOrder`'s read-time-filter discipline:
 * intersect `visibleLanes` and `focusedLanes` against the live lane
 * set (`collectAllLaneIds`) at the apply boundary and at the snapshot
 * boundary. No self-heal write-back to the saved preset — same shape
 * as `reconcileOrder` (which leaves the stored order untouched and
 * only reconciles on read). The disposition matches: presets remain
 * fixed in storage; the live application of a preset reflects the
 * current lane inventory.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyPreset,
  savePresetFromCurrent,
  type FocusPreset,
} from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store';
import {
  PROJECT_KEY,
  PREFIX,
  buildShell,
  bootControllers,
  setMatchMediaMatches,
} from './__helpers/dashboard-swimlane-presets-fixture.ts';

describe('AUDIT-20260530-45 — preset lane-id reconciliation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dev/editorial-studio');
    setMatchMediaMatches(false);
  });

  it('applyPreset drops dead lane ids from focusedLanes before writing :focus', () => {
    // Set up a preset captured when 3 lanes existed: default, mockups,
    // qa. Two of those (default, mockups) are focused. The page is
    // then rebuilt with only 2 lanes (default, qa) — mockups was
    // archived/renamed/purged.
    const preset: FocusPreset = {
      id: 'p-test',
      name: 'old three-lane preset',
      createdAt: '2026-05-30T10:00:00.000Z',
      visibleLanes: ['default', 'mockups', 'qa'],
      focusedLanes: ['default', 'mockups'],
      viewModePerLane: { default: 'kanban', mockups: 'kanban', qa: 'kanban' },
      laneCollapseState: {},
      stageCollapseState: {},
    };

    // Live page has only 2 lanes — `mockups` is dead.
    buildShell(['default', 'qa']);
    bootControllers();

    applyPreset(PROJECT_KEY, preset);

    // Bug reproduction (pre-fix): :focus storage contained
    // ['default', 'mockups'] verbatim — `mockups` is a dead id.
    // Post-fix: :focus is filtered to the intersection with the live
    // lane set, so only `default` survives.
    const focusRaw = window.localStorage.getItem(`${PREFIX}:focus`);
    expect(focusRaw).not.toBeNull();
    const focusParsed: unknown = JSON.parse(focusRaw ?? '[]');
    expect(focusParsed).toEqual(['default']);
  });

  it('applyPreset drops dead lane ids from visibleLanes (no spurious hidden write)', () => {
    // The visibility key is computed as `liveLanes − visibleLanes`.
    // When `visibleLanes` carries a dead id, the pre-fix code's
    // `allLanes.filter(id => !visibleSet.has(id))` already
    // silently dropped unknown lanes from the hidden write — but
    // the dead id remained in the in-memory preset, and would be
    // re-written verbatim if the preset were re-saved or surfaced
    // elsewhere. The post-fix `visibleLanes` filter at the apply
    // boundary ensures the storage write reflects only live ids,
    // and the hidden write remains consistent.
    const preset: FocusPreset = {
      id: 'p-test-vis',
      name: 'three-lane visibility preset',
      createdAt: '2026-05-30T10:00:00.000Z',
      visibleLanes: ['default', 'mockups', 'qa'],
      focusedLanes: ['default'],
      viewModePerLane: { default: 'kanban', mockups: 'kanban', qa: 'kanban' },
      laneCollapseState: {},
      stageCollapseState: {},
    };

    buildShell(['default', 'qa']);
    bootControllers();

    applyPreset(PROJECT_KEY, preset);

    // Live lanes minus reconciled-visible-lanes (post-fix:
    // ['default', 'qa']) = nothing hidden. The hidden write is
    // the inverse of visibleLanes against the live set; with the
    // fix applied, `mockups` is filtered OUT of visibleLanes
    // before the hidden computation, so the hidden write becomes
    // `liveLanes − [default, qa]` = [].
    const visRaw = window.localStorage.getItem(`${PREFIX}:visibility`);
    expect(visRaw).not.toBeNull();
    const visParsed: unknown = JSON.parse(visRaw ?? '[]');
    expect(visParsed).toEqual([]);
  });

  it('savePresetFromCurrent drops dead lane ids from the captured focus set', () => {
    // Corruption case: a prior session focused on `legacy`, then that
    // lane was renamed/archived/purged. The :focus storage retains the
    // dead id. The snapshot inside savePresetFromCurrent must not
    // carry the dead id into the newly-minted preset.
    //
    // Important: the seed-and-snapshot order matters. The swimlane
    // controller's `initSwimlane` runs its own focus-reconciliation
    // against the live lane set on boot, so seeding :focus BEFORE
    // bootControllers would let init rewrite the key and erase the
    // dead id before the snapshot runs. Seeding AFTER bootControllers
    // bypasses that — the snapshot reads the post-corruption state.
    buildShell(['default', 'qa']);
    bootControllers();
    window.localStorage.setItem(
      `${PREFIX}:focus`,
      JSON.stringify(['default', 'legacy']),
    );

    const result = savePresetFromCurrent(PROJECT_KEY, 'snapshot test');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Pre-fix: focusedLanes would carry the dead `legacy` id.
    // Post-fix: snapshotCurrentState intersects against
    // collectAllLaneIds (the live rail rows) and only `default`
    // survives.
    expect(result.preset.focusedLanes).toEqual(['default']);
  });

  it('applyPreset preserves live lane ids that overlap with the preset', () => {
    // Negative test: when every id in the preset is still live, the
    // intersection is a no-op and the behavior matches pre-fix.
    const preset: FocusPreset = {
      id: 'p-test-live',
      name: 'all-live preset',
      createdAt: '2026-05-30T10:00:00.000Z',
      visibleLanes: ['default', 'qa'],
      focusedLanes: ['default', 'qa'],
      viewModePerLane: { default: 'kanban', qa: 'kanban' },
      laneCollapseState: {},
      stageCollapseState: {},
    };

    buildShell(['default', 'qa']);
    bootControllers();

    applyPreset(PROJECT_KEY, preset);

    const focusRaw = window.localStorage.getItem(`${PREFIX}:focus`);
    const focusParsed: unknown = JSON.parse(focusRaw ?? '[]');
    expect(focusParsed).toEqual(['default', 'qa']);
  });
});
