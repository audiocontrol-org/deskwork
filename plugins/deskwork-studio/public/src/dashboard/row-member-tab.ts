/**
 * Client controller for the dashboard row's "Member of: N groups"
 * pull-tab (Phase 7 Task 7.3 — Direction 1).
 *
 * Wires two behaviors:
 *
 *   1. Tap the `.er-row-member-tab` → row carries `.is-member-expanded`;
 *      the inline popover reveals every parent group. Tap again →
 *      collapse. The tab's `aria-expanded` attribute mirrors the state
 *      so screen readers track the toggle.
 *   2. Click a `.er-row-member-link` → copy a markdown back-link
 *      `Member of [<title>](<url>)` to the clipboard via
 *      `copyOrShowFallback`, then open the parent's review surface in
 *      a new tab. The dual behavior gives the operator both navigation
 *      AND share-ready text in one click.
 *
 * Per `.claude/rules/affordance-placement.md`: the tab + popover are
 * BOTH component-attached (on the row's shell). The same handler
 * dispatches the open + close events; the stowed-state affordance
 * (tab visible at-rest with count badge) is the discoverability
 * signal.
 *
 * No-op when the page has no `.er-row-member-tab` elements; mounts
 * a single delegated click handler on `document` so newly-rendered
 * rows participate without per-row binding.
 */

import { copyOrShowFallback } from '../clipboard.ts';

const EXPANDED_CLASS = 'is-member-expanded';

function setRowExpanded(shell: HTMLElement, expanded: boolean): void {
  shell.classList.toggle(EXPANDED_CLASS, expanded);
  const tab = shell.querySelector<HTMLButtonElement>('[data-row-member-tab]');
  const popover = shell.querySelector<HTMLElement>('[data-row-member-popover]');
  if (tab !== null) tab.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (popover !== null) popover.hidden = !expanded;
}

function collapseAll(except?: HTMLElement): void {
  const expanded = document.querySelectorAll<HTMLElement>(
    `.er-row-shell.${EXPANDED_CLASS}`,
  );
  expanded.forEach((shell) => {
    if (except !== undefined && shell === except) return;
    setRowExpanded(shell, false);
  });
}

function handleTabClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const tab = target.closest<HTMLButtonElement>('[data-row-member-tab]');
  if (tab === null) return;
  const shell = tab.closest<HTMLElement>('.er-row-shell');
  if (shell === null) return;
  event.preventDefault();
  event.stopPropagation();
  const wasExpanded = shell.classList.contains(EXPANDED_CLASS);
  // Single-open invariant — collapse any siblings before opening.
  collapseAll(shell);
  setRowExpanded(shell, !wasExpanded);
}

function handleLinkClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const link = target.closest<HTMLAnchorElement>('.er-row-member-link');
  if (link === null) return;
  const backLink = link.dataset.backLink;
  if (backLink === undefined || backLink.length === 0) return;
  // Fire the clipboard write asynchronously; let the anchor's default
  // navigation handle opening the target. We DO NOT preventDefault —
  // the operator's click should result in navigation AND the copy.
  void copyOrShowFallback(backLink, {
    successMessage: 'Copied member-of back-link to clipboard.',
    fallbackMessage: 'Clipboard unavailable; copy this back-link manually:',
  });
}

/**
 * Public entry-point. Idempotent: calling twice merely re-binds the
 * same delegated handlers (browsers dedupe identical listeners on
 * document only when the listener function identity matches; we
 * guard via a module-level boolean to keep wiring single-shot).
 */
let wired = false;

export function initRowMemberTab(): void {
  if (wired) return;
  wired = true;
  document.addEventListener('click', handleTabClick);
  document.addEventListener('click', handleLinkClick);
  // Escape collapses the open row (consistent with the row-menu close
  // semantics in row-actions.ts).
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = document.querySelector<HTMLElement>(`.er-row-shell.${EXPANDED_CLASS}`);
    if (open !== null) {
      setRowExpanded(open, false);
    }
  });
}
