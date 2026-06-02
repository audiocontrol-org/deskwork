/**
 * @vitest-environment jsdom
 *
 * AUDIT-20260530-44 (cross-model: AUDIT-BARRAGE-claude-P5-3) regression
 * — Save button must NOT flash success when preset persistence fails.
 *
 * Bug-shape: `writePresets` swallowed every `localStorage.setItem`
 * failure under a no-op catch labeled "localStorage unavailable";
 * `savePresetFromCurrent` returned the constructed preset
 * unconditionally; `handleSaveClick` then called `flashSaveConfirm`
 * (green success flash) and `renderPresetList` (re-reading storage
 * that never received the new preset). Operator saw success + empty
 * list — two signals contradicting each other.
 *
 * This test exercises the contradiction via a `QuotaExceededError`
 * thrown from `localStorage.setItem` for the presets storage key:
 *
 *   1. `savePresetFromCurrent` must signal failure on its return
 *      value (the discriminated `{ ok: false, reason }` shape).
 *   2. After the Save click flow runs against the same failing
 *      setItem, the Save button must NOT carry the `is-flashing`
 *      success class — it must carry the `is-error` failure class
 *      instead.
 *   3. The preset list must remain empty (no row rendered).
 *
 * Surface under test:
 *   - `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts`
 *     (`writePresets`, `savePresetFromCurrent`)
 *   - `plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts`
 *     (`handleSaveClick` via the Save button click binding)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initSwimlanePresets,
} from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-presets';
import {
  presetsKey,
  savePresetFromCurrent,
} from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store';
import {
  PROJECT_KEY,
  buildShell,
  bootControllers,
  makeHooks,
  setMatchMediaMatches,
} from './__helpers/dashboard-swimlane-presets-fixture.ts';

/**
 * Wrap `Storage.prototype.setItem` so writes to the presets storage
 * key throw a `QuotaExceededError`. Returns a restore function the
 * `afterEach` hook calls to drop the wrap. Targeted at the presets
 * key only so the constituent controllers' own `setItem` calls
 * (focus / visibility / view-mode / collapse) still succeed.
 *
 * Spying on `Storage.prototype.setItem` (rather than the instance)
 * matches the pattern used in
 * `dashboard-swimlane-idempotent-init.test.ts` — the jsdom Storage
 * instance proxies through to the prototype, so a per-instance spy
 * is not invoked on the actual write path.
 */
function failPresetWrites(): () => void {
  const targetKey = presetsKey(PROJECT_KEY);
  const original = Storage.prototype.setItem;
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
    function (this: Storage, key: string, value: string): void {
      if (key === targetKey) {
        // The shape Safari private-mode + quota-exceeded both throw.
        // `Error.prototype.name` is writable per the language spec, so
        // no cast is needed to set it.
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      original.call(this, key, value);
    },
  );
  return () => {
    spy.mockRestore();
  };
}

describe('AUDIT-20260530-44 — preset save surfaces persistence failures', () => {
  let restore: () => void = () => {};

  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dev/editorial-studio');
    setMatchMediaMatches(false);
  });

  afterEach(() => {
    restore();
    restore = () => {};
  });

  it('savePresetFromCurrent returns { ok: false } when localStorage.setItem throws', () => {
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();
    restore = failPresetWrites();

    const result = savePresetFromCurrent(PROJECT_KEY, 'QuotaTest');

    // The discriminated-union shape signals failure rather than
    // returning a constructed-but-unpersisted preset. Per the audit
    // finding, the silent success was the bug.
    expect(result.ok).toBe(false);
  });

  it('handleSaveClick paints the error class — NOT the success flash — when persistence fails', async () => {
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();
    restore = failPresetWrites();

    // Hook returns "PersistMe" as the preset name — drive Save end-
    // to-end via the wired click handler.
    initSwimlanePresets(makeHooks('PersistMe'));

    const saveBtn = document.querySelector<HTMLButtonElement>(
      '[data-preset-save]',
    );
    expect(saveBtn).not.toBeNull();
    if (saveBtn === null) return;

    saveBtn.click();
    // The handler's await chain (promptForName → savePresetFromCurrent
    // → DOM updates) all resolve on the microtask queue under jsdom.
    // One pass of the microtask queue suffices.
    await Promise.resolve();
    await Promise.resolve();

    // Bug repro: was `is-flashing` (success). Fix: error class.
    expect(saveBtn.classList.contains('is-flashing')).toBe(false);
    expect(saveBtn.classList.contains('is-error')).toBe(true);

    // Bug repro: handler called renderPresetList anyway. Fix: list
    // stays empty because no row should advertise a persisted preset
    // that never made it to disk.
    const listContainer = document.querySelector<HTMLElement>(
      '[data-preset-list]',
    );
    expect(listContainer).not.toBeNull();
    if (listContainer === null) return;
    const presetRows = listContainer.querySelectorAll('[data-preset-row]');
    expect(presetRows.length).toBe(0);
  });

  it('handleSaveClick still flashes success when persistence succeeds (control)', async () => {
    buildShell(['default', 'mockups', 'qa']);
    bootControllers();
    // No failure wrap installed — setItem works normally.

    initSwimlanePresets(makeHooks('Happy path'));

    const saveBtn = document.querySelector<HTMLButtonElement>(
      '[data-preset-save]',
    );
    expect(saveBtn).not.toBeNull();
    if (saveBtn === null) return;

    saveBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(saveBtn.classList.contains('is-flashing')).toBe(true);
    expect(saveBtn.classList.contains('is-error')).toBe(false);

    const listContainer = document.querySelector<HTMLElement>(
      '[data-preset-list]',
    );
    if (listContainer === null) return;
    const presetRows = listContainer.querySelectorAll('[data-preset-row]');
    expect(presetRows.length).toBe(1);
  });
});
