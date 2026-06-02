/**
 * @vitest-environment jsdom
 *
 * AUDIT-20260530-75 (cross-model: AUDIT-BARRAGE-codex-P6-2) —
 * `initPipelinesPage` is documented as idempotent, but every inner
 * init step (`initNewForm`, `initEditPanels` → `initEditOpForm` +
 * `initEditSubAccordion`, `initRowToggles`, `initRowCopyButtons`)
 * binds `addEventListener` unconditionally. A second invocation
 * against the same DOM stacks duplicate handlers. The operator's
 * single click on a Delete button can fire two clipboard writes; one
 * row-toggle click can fire two open-then-close transitions.
 *
 * Fix mirrors the swimlane shell-attribute pattern (Task 0.6, AUDIT-
 * 20260530-30): a `data-pipelines-wired="true"` attribute on the
 * pipelines container guards re-init. Container-attribute over module-
 * level boolean is required for test isolation: client-test fixtures
 * rebuild the container in `beforeEach`; a fresh container element
 * naturally resets the sentinel.
 *
 * The observable signal in this test:
 *
 *   1. Build a pipelines container with a row carrying a delete
 *      button (`data-pipeline-copy`).
 *   2. Call `initPipelinesPage()` twice.
 *   3. Click the delete button once. Pre-fix: two click handlers are
 *      stacked; observable is two clipboard writes per click. Post-
 *      fix: the second `initPipelinesPage()` no-ops; one write.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initPipelinesPage } from '../../../../plugins/deskwork-studio/public/src/pipelines/pipelines-page';
import {
  buildContainer,
  buildRow,
  installClipboardStub,
} from './test-helpers.ts';

function uninstallClipboard(): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

describe('initPipelinesPage — DOM-attribute wired guard (AUDIT-20260530-75)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    uninstallClipboard();
  });

  it('second initPipelinesPage() does NOT stack delete-button handlers — one click => one clipboard write', async () => {
    const container = buildContainer();
    const { deleteBtn } = buildRow(container, 'orphan-custom', {
      withDelete: true,
    });
    expect(deleteBtn, 'delete button must exist for this test').toBeDefined();
    const { calls } = installClipboardStub();
    initPipelinesPage();
    initPipelinesPage(); // second call MUST be a no-op (DOM-attribute sentinel).

    deleteBtn!.click();
    await Promise.resolve();
    await Promise.resolve();

    // Pre-fix: two click handlers => two writeText calls.
    // Post-fix: one handler => one call.
    expect(calls.length).toBe(1);
    expect(calls[0]).toBe('/deskwork:pipeline delete orphan-custom');
  });

  it('sanity — single initPipelinesPage() wires exactly one delete-button handler', async () => {
    const container = buildContainer();
    const { deleteBtn } = buildRow(container, 'orphan-custom', {
      withDelete: true,
    });
    const { calls } = installClipboardStub();
    initPipelinesPage();

    deleteBtn!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls.length).toBe(1);
  });

  it('second initPipelinesPage() does NOT stack row-toggle handlers — one click => one open/close', async () => {
    const container = buildContainer();
    const { toggleView, viewRow } = buildRow(container, 'editorial');
    initPipelinesPage();
    initPipelinesPage();

    // Pre-fix: two click handlers stacked. The toggle logic reads
    // `target.hidden` to decide direction, so the first handler opens
    // (hidden: true => false), the second handler immediately re-reads
    // (hidden: false) and closes back. Net: a single user-click ends
    // with the row hidden — the operator's intent (open) is silently
    // undone.
    //
    // Post-fix: one handler. One click opens the row and leaves it
    // open. The observable is `viewRow.hidden === false`.
    expect(viewRow.hidden).toBe(true);
    toggleView.click();
    expect(viewRow.hidden).toBe(false);
    expect(toggleView.getAttribute('aria-expanded')).toBe('true');
  });
});
