/**
 * @vitest-environment jsdom
 *
 * Phase 5 Task 5.5 — saveable focus presets UI / controller tests.
 *
 * Covers the deep-link `?preset=<id>` apply path + the Save / Load /
 * Delete affordance bindings. The five store-and-apply tests
 * (snapshot, AUDIT-38 round-trip, save+persist+list, applyPreset
 * storage + controllers) live in the sibling
 * `dashboard-swimlane-presets-store-client.test.ts`. Per
 * AUDIT-20260528-14 this split brings each file under the 300-500
 * line cap.
 *
 * Shared fixture + helpers live in
 * `__helpers/dashboard-swimlane-presets-fixture.ts`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initSwimlanePresets,
  type PresetControllerHooks,
} from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-presets';
import {
  listPresets,
  type FocusPreset,
} from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store';
import {
  PROJECT_KEY,
  PREFIX,
  buildShell,
  bootControllers,
  makeHooks,
  setMatchMediaMatches,
} from './__helpers/dashboard-swimlane-presets-fixture.ts';

describe('Task 5.5 — saveable focus presets UI affordances', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dev/editorial-studio');
    setMatchMediaMatches(false);
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

  // Per AUDIT-20260530-47 (cross-model: AUDIT-BARRAGE-claude-P5-3):
  // when `?preset=<id>` resolves to nothing in the local browser the
  // controller MUST surface a visible "preset not found" affordance
  // instead of returning silently. Architectural per-browser-id scope
  // is left for a separate operator decision; this test fixes the UX
  // half of the finding: cache miss => visible notice (DOM-mounted,
  // text contains the missing id), and the `?preset=` param is
  // stripped from the URL so a refresh doesn't re-trigger the notice.
  it('deep-link with unknown preset id surfaces a visible notice and strips the param (AUDIT-20260530-47)', () => {
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();
    window.history.replaceState(
      {},
      '',
      '/dev/editorial-studio?preset=p-missing-xyz',
    );
    initSwimlanePresets(makeHooks(''));

    // The notice element is mounted inside the bay shell and carries
    // the operator-readable message. Both the class hook and the
    // dataset attribute are part of the contract so styling +
    // behavior tests can both query for it.
    const notice = document.querySelector<HTMLElement>(
      '[data-preset-deep-link-notice]',
    );
    expect(notice).not.toBeNull();
    expect(notice?.textContent ?? '').toContain('p-missing-xyz');
    expect(notice?.textContent ?? '').toContain('not found in this browser');
    expect(notice?.classList.contains('preset-deep-link-notice')).toBe(true);
    expect(notice?.getAttribute('role')).toBe('status');

    // The `?preset=` param is stripped on miss too — a refresh
    // shouldn't re-trigger the notice for a stale URL.
    expect(window.location.search).not.toContain('preset=');
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
