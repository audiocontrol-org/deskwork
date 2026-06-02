/**
 * @vitest-environment jsdom
 *
 * AUDIT-20260530-75 (cross-model: AUDIT-BARRAGE-codex-P6-2) —
 * `initLanesPage` is documented as idempotent ("calling twice merely
 * re-binds the same delegated handlers"), but every inner init step
 * (`initNewForm`, `initEditForms`, `initEditToggles`,
 * `initRowCopyButtons`, `initArchivedSection`, `initEmptyStateCta`)
 * binds `addEventListener` unconditionally. A second invocation against
 * the same DOM stacks duplicate handlers. The operator's single click
 * on a Copy button can fire two clipboard writes; one toggle-click
 * can fire two open-then-close transitions and end up where it started.
 *
 * The fix mirrors the swimlane shell-attribute pattern (Task 0.6,
 * AUDIT-20260530-30): a `data-lanes-wired="true"` attribute on the
 * lanes container element guards re-init. Container-attribute over
 * module-level boolean is required for test isolation: this suite's
 * ~80 client-test invocations rebuild the container in `beforeEach`,
 * and a fresh container element naturally resets the sentinel; a
 * module-level boolean would latch true and turn every subsequent
 * test's `initLanesPage()` call into a silent no-op.
 *
 * The observable signal in this test:
 *
 *   1. Build a lanes container with a New form + a copy button.
 *   2. Spy on the copy button's `addEventListener`.
 *   3. Call `initLanesPage()` twice.
 *   4. Click the copy button once. Pre-fix: two click handlers are
 *      stacked; the observable is two clipboard writes per click.
 *      Post-fix: the second `initLanesPage()` no-ops and only one
 *      handler fires.
 *
 * Per .claude/rules/agent-discipline.md (capture-mode rule): the
 * fixture mirrors what the server emits, no scope-narrowing on edge
 * cases. The test asserts on the user-visible consequence (clipboard
 * call count), not on the internal `wiredLanes` boolean.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initLanesPage } from '../../../../plugins/deskwork-studio/public/src/lanes/lanes-page';

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
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    writable: true,
    value: true,
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
 * Build a minimal lanes container whose New form has every required
 * field filled in, so the Copy button is enabled (not the disabled-
 * required-fields path). The Copy button is the observable surface.
 */
function buildContainerWithFilledNewForm(): { container: HTMLElement; copy: HTMLButtonElement } {
  document.body.innerHTML = '';
  const container = document.createElement('main');
  container.dataset.lanesContainer = '';
  container.dataset.projectKey = 'test-proj-idempotent';
  document.body.appendChild(container);

  const form = document.createElement('section');
  form.dataset.lanesNewForm = '';

  const idInput = document.createElement('input');
  idInput.dataset.lanesField = 'id';
  idInput.value = 'lane-id';
  form.appendChild(idInput);

  const nameInput = document.createElement('input');
  nameInput.dataset.lanesField = 'name';
  nameInput.value = 'Lane Name';
  form.appendChild(nameInput);

  const select = document.createElement('select');
  select.dataset.lanesField = 'template';
  const blank = document.createElement('option');
  blank.value = '';
  select.appendChild(blank);
  const opt = document.createElement('option');
  opt.value = 'linear-default';
  opt.textContent = 'linear-default';
  opt.selected = true;
  select.appendChild(opt);
  form.appendChild(select);

  const contentDir = document.createElement('input');
  contentDir.dataset.lanesField = 'contentDir';
  contentDir.value = 'content/lanes/lane-id';
  form.appendChild(contentDir);

  const preview = document.createElement('code');
  preview.dataset.lanesPreview = '';
  form.appendChild(preview);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.dataset.lanesCopyButton = 'new';
  copy.textContent = 'Copy command';
  form.appendChild(copy);

  // Notice element so applyResultToCopy can clear the slot without
  // touching the document fallback (cleaner test surface).
  const notice = document.createElement('div');
  notice.dataset.lanesCopyNotice = '';
  form.appendChild(notice);

  container.appendChild(form);
  return { container, copy };
}

describe('initLanesPage — DOM-attribute wired guard (AUDIT-20260530-75)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    uninstallClipboard();
  });

  it('second initLanesPage() does NOT stack copy-button handlers — one click => one clipboard write', async () => {
    const { copy } = buildContainerWithFilledNewForm();
    const { calls } = installClipboard();
    initLanesPage();
    initLanesPage(); // second call MUST be a no-op (DOM-attribute sentinel).

    copy.click();
    // Yield once for the async clipboard write (handler awaits
    // copyAndFlash which awaits navigator.clipboard.writeText).
    await Promise.resolve();
    await Promise.resolve();

    // Pre-fix: two click handlers => two writeText calls.
    // Post-fix: one handler => one call.
    expect(calls.length).toBe(1);
  });

  it('sanity — single initLanesPage() wires exactly one copy-button handler', async () => {
    const { copy } = buildContainerWithFilledNewForm();
    const { calls } = installClipboard();
    initLanesPage();

    copy.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls.length).toBe(1);
  });

  it('second initLanesPage() does NOT stack input rebuild handlers — one input event => one preview rebuild', async () => {
    const { container } = buildContainerWithFilledNewForm();
    initLanesPage();
    initLanesPage();

    const preview = container.querySelector<HTMLElement>('[data-lanes-preview]');
    expect(preview, 'preview should exist').not.toBeNull();
    const idInput = container.querySelector<HTMLInputElement>('[data-lanes-field="id"]');
    expect(idInput, 'id input should exist').not.toBeNull();

    // Mutate the value then fire an input event. Pre-fix two handlers
    // fire and rebuild the preview twice (same content; observable
    // via spying on textContent assignment). Post-fix one handler
    // fires once. We assert via a textContent-set spy proxy.
    let writeCount = 0;
    const original = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    expect(original, 'textContent descriptor must exist').toBeDefined();
    Object.defineProperty(preview!, 'textContent', {
      configurable: true,
      set(value: string): void {
        writeCount += 1;
        original!.set!.call(this, value);
      },
      get(): string | null {
        return original!.get!.call(this);
      },
    });

    idInput!.value = 'changed-id';
    idInput!.dispatchEvent(new Event('input', { bubbles: true }));

    // Post-fix: 1 handler bound => 1 textContent write per input.
    // Pre-fix: 2 handlers bound => 2 writes per input.
    expect(writeCount).toBe(1);
  });
});
