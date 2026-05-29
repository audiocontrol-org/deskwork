/**
 * Masthead popover controller (Step 2.2.7).
 *
 * Wires the masthead `⋮` trigger (`data-er-masthead-menu`) to a
 * dropdown popover (`data-er-masthead-popover`) anchored under the
 * glyph. Mirrors the v0.20 row `⋮` popover idiom but is NOT a
 * slide-up sheet — see DESIGN-STANDARDS.md § Menu reveal pattern.
 *
 * State machine:
 *
 *           +----------- open() -----------+
 *           |                              v
 *      [closed]                        [open]
 *           ^                              |
 *           +---- close() (any path) ------+
 *
 * Close paths (all funnel through `doClose()`):
 *   - Scrim tap.
 *   - Trigger tap-again (the trigger is a toggle).
 *   - Escape key.
 *   - Programmatic `close()`.
 *
 * On open: shows popover + scrim, sets `aria-expanded="true"` on the
 * trigger, focuses the first menu item.
 *
 * On close: hides popover + scrim, restores `aria-expanded="false"`,
 * returns focus to the trigger, fires `onClose`.
 *
 * `destroy()` removes all listeners (including document-level keydown
 * and trigger/scrim click handlers) so the controller doesn't leak
 * across re-init.
 */

export interface MastheadPopoverOpts {
  readonly triggerEl: HTMLElement;
  readonly popoverEl: HTMLElement;
  readonly scrimEl: HTMLElement;
  readonly onClose?: () => void;
}

export interface MastheadPopover {
  readonly open: () => void;
  readonly close: () => void;
  readonly isOpen: () => boolean;
  readonly destroy: () => void;
}

export function createMastheadPopover(opts: MastheadPopoverOpts): MastheadPopover {
  const { triggerEl, popoverEl, scrimEl, onClose } = opts;

  let open = false;

  function doOpen(): void {
    if (open) return;
    open = true;
    popoverEl.hidden = false;
    scrimEl.hidden = false;
    triggerEl.setAttribute('aria-expanded', 'true');
    // Focus first focusable item for keyboard accessibility.
    const firstItem = popoverEl.querySelector<HTMLElement>(
      '.er-masthead-popover-item:not([data-disabled="true"])',
    );
    firstItem?.focus();
  }

  function doClose(): void {
    if (!open) return;
    open = false;
    popoverEl.hidden = true;
    scrimEl.hidden = true;
    triggerEl.setAttribute('aria-expanded', 'false');
    // Restore focus to the trigger so keyboard users don't lose context.
    triggerEl.focus();
    onClose?.();
  }

  function onTriggerClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (open) doClose();
    else doOpen();
  }

  function onScrimClick(): void {
    doClose();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      doClose();
    }
  }

  triggerEl.addEventListener('click', onTriggerClick);
  scrimEl.addEventListener('click', onScrimClick);
  document.addEventListener('keydown', onKeydown);

  function destroy(): void {
    triggerEl.removeEventListener('click', onTriggerClick);
    scrimEl.removeEventListener('click', onScrimClick);
    document.removeEventListener('keydown', onKeydown);
  }

  return {
    open: doOpen,
    close: doClose,
    isOpen: () => open,
    destroy,
  };
}

/**
 * Locate the masthead popover elements in the page and wire them up.
 * Idempotent: returns null if the trigger/popover/scrim aren't present
 * (e.g., on a surface that doesn't include `renderMastheadMenu()`).
 *
 * Also wires the popover's internal action items:
 *   - `Keyboard shortcuts` → dispatches a `studio:show-shortcuts` event
 *     on the document. Entry-review listens for this and opens its
 *     existing shortcuts overlay; other surfaces ignore it.
 *   - `Configure studio` → currently a no-op placeholder (Phase 4).
 *
 * Anchor links (Manual, File an issue, About) are plain `<a href>`
 * elements; the browser handles navigation. They still close the
 * popover on click so the operator doesn't navigate-with-popover-open.
 */
export function initMastheadPopover(): MastheadPopover | null {
  const triggerEl = document.querySelector<HTMLElement>('[data-er-masthead-menu]');
  const popoverEl = document.querySelector<HTMLElement>('[data-er-masthead-popover]');
  const scrimEl = document.querySelector<HTMLElement>(
    '[data-er-masthead-popover-scrim]',
  );
  if (!triggerEl || !popoverEl || !scrimEl) return null;

  // Idempotency guard. The item listeners below aren't tracked by the
  // controller's destroy(), so if init runs twice they'd double-register.
  // The trigger/scrim/document listeners are owned by createMastheadPopover
  // and DO get cleaned up by destroy(); the per-item listeners are init-
  // scoped and don't have a teardown path. A sentinel on the popover
  // element prevents the second wiring pass.
  if (popoverEl.dataset.erPopoverWired === 'true') return null;
  popoverEl.dataset.erPopoverWired = 'true';

  const controller = createMastheadPopover({ triggerEl, popoverEl, scrimEl });

  // Action wiring.
  const items = popoverEl.querySelectorAll<HTMLElement>(
    '.er-masthead-popover-item',
  );
  for (const item of items) {
    item.addEventListener('click', (e) => {
      // Honor data-disabled (Configure studio placeholder).
      if (item.dataset.disabled === 'true') {
        e.preventDefault();
        return;
      }
      const action = item.dataset.erMastheadPopoverAction;
      if (action === 'shortcuts') {
        e.preventDefault();
        controller.close();
        document.dispatchEvent(new CustomEvent('studio:show-shortcuts'));
        return;
      }
      // Plain anchors (Manual, File an issue, About): close the
      // popover; the browser will handle the navigation.
      controller.close();
    });
  }

  return controller;
}
