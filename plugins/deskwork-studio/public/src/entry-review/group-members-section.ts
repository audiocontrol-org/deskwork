/**
 * Client controller for the Members section on the entry-keyed
 * press-check surface (Phase 7 Tasks 7.3 + 7.4 — Direction B).
 *
 * Wires three behaviors:
 *
 *   1. View-mode toggle (composed ↔ list) — clicking either segmented
 *      cell flips the section's `data-view-mode` attribute + toggles
 *      `hidden` on the two body containers. Persists the operator's
 *      choice per-group via `localStorage` keyed on the group UUID.
 *      On page boot, the controller restores the stored preference
 *      (taking precedence over the server-rendered default).
 *   2. Empty-state CTA — clicking the "Add member" button copies the
 *      `/deskwork:group add-member <group-slug> <MEMBER-SLUG>` command
 *      to the operator's clipboard via `copyOrShowFallback`.
 *   3. Member row clipboard-copy — clicking a member row's link
 *      navigates to the member's review surface AND copies the URL
 *      so the operator can share it.
 *
 * Per `.claude/rules/affordance-placement.md` — every affordance is
 * component-attached (on the section's chrome), no toolbar
 * duplication.
 *
 * No mock data, no fallbacks: the controller is a no-op when the page
 * has no `[data-members-section]` element (non-group entries skip the
 * section entirely server-side).
 */

import { copyOrShowFallback } from '../clipboard.ts';

const STORAGE_KEY_PREFIX = 'er.members.viewMode.';

type ViewMode = 'composed' | 'list';

function storageKey(groupUuid: string): string {
  return `${STORAGE_KEY_PREFIX}${groupUuid}`;
}

function readStoredMode(groupUuid: string): ViewMode | null {
  try {
    const raw = window.localStorage.getItem(storageKey(groupUuid));
    if (raw === 'composed' || raw === 'list') return raw;
  } catch {
    // localStorage may throw in private-browsing modes; treat as no-op.
  }
  return null;
}

function writeStoredMode(groupUuid: string, mode: ViewMode): void {
  try {
    window.localStorage.setItem(storageKey(groupUuid), mode);
  } catch {
    // Best-effort persistence; ignore write failures.
  }
}

function applyMode(section: HTMLElement, mode: ViewMode): void {
  section.dataset.viewMode = mode;
  const composedBody = section.querySelector<HTMLElement>('[data-body-composed]');
  const listBody = section.querySelector<HTMLElement>('[data-body-list]');
  if (composedBody !== null) composedBody.hidden = mode !== 'composed';
  if (listBody !== null) listBody.hidden = mode !== 'list';

  const cells = section.querySelectorAll<HTMLButtonElement>('[data-view-mode]');
  cells.forEach((cell) => {
    const cellMode = cell.dataset.viewMode;
    const active = cellMode === mode;
    cell.classList.toggle('is-active', active);
    cell.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

function wireToggle(section: HTMLElement, groupUuid: string): void {
  const toggle = section.querySelector<HTMLElement>('[data-members-toggle]');
  if (toggle === null) return;
  toggle.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const cell = target.closest<HTMLButtonElement>('[data-view-mode]');
    if (cell === null) return;
    const mode = cell.dataset.viewMode;
    if (mode !== 'composed' && mode !== 'list') return;
    applyMode(section, mode);
    writeStoredMode(groupUuid, mode);
  });
}

function wireEmptyStateCta(section: HTMLElement): void {
  const cta = section.querySelector<HTMLButtonElement>('[data-empty-cta]');
  if (cta === null) return;
  cta.addEventListener('click', async (event) => {
    event.preventDefault();
    const copyText = cta.dataset.copyText;
    if (copyText === undefined || copyText.length === 0) return;
    await copyOrShowFallback(copyText, {
      successMessage: `Copied — paste into a Claude Code chat to add a member.`,
      fallbackMessage:
        'Clipboard unavailable on this origin. Copy this command and paste it into a Claude Code chat to add a member to this group:',
    });
  });
}

function wireMemberRowCopy(section: HTMLElement): void {
  section.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const link = target.closest<HTMLAnchorElement>('[data-member-copy]');
    if (link === null) return;
    const href = link.dataset.memberHref;
    if (href === undefined || href.length === 0) return;
    // Best-effort: copy the URL alongside the navigation. Don't block
    // navigation if the clipboard write fails — the operator clicked
    // the link, navigation is the primary action.
    try {
      const absolute = new URL(href, window.location.origin).toString();
      await copyOrShowFallback(absolute, {
        successMessage: `Copied member URL — sharing-ready.`,
        fallbackMessage: 'Clipboard unavailable; here is the member URL:',
      });
    } catch {
      // URL parse failed for unexpected href shape; fall through.
    }
  });
}

/**
 * Initialize the Members section on page load. Idempotent — calling
 * twice is a true no-op for listener attachment because of the
 * module-level `wired` guard below.
 *
 * Per AUDIT-20260529-42: pre-fix the three `wire*` helpers called
 * `addEventListener` unconditionally on every invocation. The
 * docstring's "calling twice has no visible effect" claim was true
 * for `applyMode` (it reads current state) but FALSE for the wire
 * helpers — a second call accumulated duplicate listeners, so a
 * single click would fire each handler twice. The fix mirrors the
 * sibling `row-member-tab.ts` precedent: a module-level
 * `let wired = false` guard short-circuits the second invocation.
 */
let wired = false;

export function initGroupMembersSection(): void {
  if (wired) return;
  const section = document.querySelector<HTMLElement>('[data-members-section]');
  if (section === null) return;
  const groupUuid = section.dataset.groupUuid;
  if (groupUuid === undefined || groupUuid.length === 0) return;

  // Restore stored mode (takes precedence over server-rendered default)
  // only when the section is in a populated state — the "empty"
  // view-mode signals no toggle is rendered.
  const serverMode = section.dataset.viewMode;
  if (serverMode !== 'empty') {
    const stored = readStoredMode(groupUuid);
    const initial: ViewMode = stored ?? (serverMode === 'list' ? 'list' : 'composed');
    applyMode(section, initial);
  }

  wireToggle(section, groupUuid);
  wireEmptyStateCta(section);
  wireMemberRowCopy(section);
  // Flip the guard ONLY after every wire-helper has attached its
  // listener — early-flipping risks leaving the surface half-wired
  // if a wire-helper throws. The current helpers don't throw, but
  // the post-flip ordering keeps the guard robust to future changes.
  wired = true;
}
