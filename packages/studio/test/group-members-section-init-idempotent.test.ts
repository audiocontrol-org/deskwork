/**
 * @vitest-environment jsdom
 *
 * AUDIT-20260529-42 — `initGroupMembersSection` must be idempotent across
 * multiple calls. The docstring asserts the property; the pre-fix
 * implementation does not honor it. `wireToggle`, `wireEmptyStateCta`,
 * and `wireMemberRowCopy` each call `addEventListener` unconditionally
 * on every invocation. A second `initGroupMembersSection()` call
 * accumulates duplicate listeners — clicking the toggle pill fires the
 * click handler twice (two `writeStoredMode` calls + two `applyMode`
 * calls), and clicking a member row fires `copyOrShowFallback` twice.
 *
 * This test calls `initGroupMembersSection()` twice against the same
 * DOM, dispatches a click on the toggle pill, and asserts the click
 * handler fired exactly once. The toggle handler's observable side
 * effect (calling `writeStoredMode`) is what we measure: the spy
 * counts `localStorage.setItem` invocations for the keyed storage
 * slot. Pre-fix: 2. Post-fix: 1.
 *
 * The sibling `row-member-tab.ts` is the canonical precedent — it
 * uses a module-level `let wired = false` guard. The fix mirrors
 * that pattern.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const GROUP_UUID = '11111111-1111-4111-8111-111111111111';

function buildSectionMarkup(): HTMLElement {
  // Mirror the server-rendered shape from `renderPopulatedSection`:
  // a `.er-members-section` element with `data-members-toggle` head,
  // two body containers, and a member-row link inside the list body.
  // We don't need the full composed view — just enough chrome for the
  // wired event handlers to find their selectors.
  const section = document.createElement('section');
  section.className = 'er-members-section';
  section.dataset.membersSection = '';
  section.dataset.groupUuid = GROUP_UUID;
  section.dataset.viewMode = 'composed';

  const head = document.createElement('header');
  head.className = 'er-members-head';
  const toggle = document.createElement('div');
  toggle.className = 'er-members-toggle';
  toggle.dataset.membersToggle = '';
  toggle.setAttribute('role', 'radiogroup');
  const composedCell = document.createElement('button');
  composedCell.type = 'button';
  composedCell.className = 'er-members-toggle-cell is-active';
  composedCell.setAttribute('role', 'radio');
  composedCell.setAttribute('aria-checked', 'true');
  composedCell.dataset.viewMode = 'composed';
  const listCell = document.createElement('button');
  listCell.type = 'button';
  listCell.className = 'er-members-toggle-cell';
  listCell.setAttribute('role', 'radio');
  listCell.setAttribute('aria-checked', 'false');
  listCell.dataset.viewMode = 'list';
  toggle.appendChild(composedCell);
  toggle.appendChild(listCell);
  head.appendChild(toggle);

  const bodyComposed = document.createElement('div');
  bodyComposed.className = 'er-members-body-composed';
  bodyComposed.dataset.bodyComposed = '';

  const bodyList = document.createElement('div');
  bodyList.className = 'er-members-body-list';
  bodyList.dataset.bodyList = '';
  bodyList.hidden = true;

  section.appendChild(head);
  section.appendChild(bodyComposed);
  section.appendChild(bodyList);
  return section;
}

describe('initGroupMembersSection — idempotency (AUDIT-20260529-42)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Reset module-level wiring state between tests by reloading the
    // module — vitest's `vi.resetModules()` clears the registry so
    // the next dynamic import re-evaluates the module with a fresh
    // `wired = false` closure. This keeps each test independent
    // regardless of the module-level guard implementation.
    vi.resetModules();
    // Reset spy invocation history between tests; vitest does NOT do
    // this automatically and we count toggle writes per-test.
    vi.restoreAllMocks();
    // localStorage values bleed across tests because jsdom shares the
    // Storage instance — clear so `writeStoredMode` always fires (the
    // controller short-circuits when the stored value already matches).
    window.localStorage.clear();
  });

  it('calling initGroupMembersSection twice attaches the toggle click handler exactly once', async () => {
    // Re-import after resetModules so the module's `wired` guard is
    // a fresh `false` for this test.
    const { initGroupMembersSection: init } = await import(
      '../../../plugins/deskwork-studio/public/src/entry-review/group-members-section.ts'
    );
    const section = buildSectionMarkup();
    document.body.appendChild(section);

    // Spy on localStorage.setItem — `writeStoredMode` calls it once
    // per toggle click. Two listeners = two calls; one listener = one.
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    init();
    init(); // Second call must NOT duplicate the listener.

    const listCell = section.querySelector<HTMLButtonElement>(
      '[data-view-mode="list"]',
    );
    expect(listCell, 'list cell should exist').not.toBeNull();
    listCell!.click();

    // Filter to the storage key written by the toggle (other
    // localStorage activity from unrelated modules would otherwise
    // bleed in).
    const toggleWrites = setItemSpy.mock.calls.filter(
      ([key]) => typeof key === 'string' && key.startsWith('er.members.viewMode.'),
    );
    expect(toggleWrites.length).toBe(1);
  });

  it('first init() with a fresh module attaches exactly one toggle click handler', async () => {
    // Sanity pair to the main test: a single init() with a freshly-
    // reloaded module should also produce exactly one click handler.
    // Pre-fix this passes (the bug is only triggered by the second
    // call). Post-fix it stays passing — the module-level guard
    // doesn't change first-call behavior.
    const { initGroupMembersSection: init } = await import(
      '../../../plugins/deskwork-studio/public/src/entry-review/group-members-section.ts'
    );
    const section = buildSectionMarkup();
    document.body.appendChild(section);

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    init();

    const listCell = section.querySelector<HTMLButtonElement>(
      '[data-view-mode="list"]',
    );
    expect(listCell, 'list cell should exist').not.toBeNull();
    listCell!.click();

    const toggleWrites = setItemSpy.mock.calls.filter(
      ([key]) => typeof key === 'string' && key.startsWith('er.members.viewMode.'),
    );
    expect(toggleWrites.length).toBe(1);
  });
});
