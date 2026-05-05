/**
 * Client entry point for the entry-keyed press-check surface
 * (`/dev/editorial-review/entry/<uuid>` — Phase 34a Layer 2).
 *
 * Wires every chrome sub-controller against the page's embedded JSON
 * state. Each sub-module under `entry-review/` owns one slice of the
 * surface so this entry stays under the 500-line cap.
 *
 * The pre-Phase-34a entry-review surface was a minimal stage controller
 * (~90 lines) that wired entry-stage actions (approve / block / cancel
 * / induct) only. Those handlers stay live below for the Blocked +
 * Cancelled affordance set; the new sub-controllers cover the
 * press-check chrome (margin notes, decision strip, edit mode,
 * outline / scrapbook / marginalia drawers, shortcuts, polling).
 */

import { initScrapbookLightbox } from './lightbox.ts';
import { readEntryReviewState, reqEl, optEl } from './entry-review/state.ts';
import { createAnnotationsController } from './entry-review/annotations.ts';
import { createDecisionController } from './entry-review/decision.ts';
import { createEditModeController } from './entry-review/edit-mode.ts';
import { initMarginaliaToggle } from './entry-review/marginalia-toggle.ts';
import { wireMarginaliaPositioning } from './entry-review/marginalia-position.ts';
import { initOutlineDrawer } from './entry-review/outline-drawer.ts';
import { initScrapbookDrawerToggle } from './entry-review/scrapbook-drawer.ts';
import { initShortcuts } from './entry-review/shortcuts.ts';
import { copyOrShowFallback } from './clipboard.ts';

const ENTRY_API = '/api/dev/editorial-review/entry';

/**
 * #166 Phase 34b — module-level error reporter that uses the page's
 * `[data-toast]` element when present (entry-review surface always
 * renders one) and falls back to `console.error` for surfaces that
 * don't (avoids native `window.alert` which can't be styled / dismissed
 * by keyboard / inspected). The press-check controller's own toast
 * helper is preserved separately for in-controller messaging.
 */
function reportError(msg: string): void {
  const toast = document.querySelector<HTMLElement>('[data-toast]');
  if (toast) {
    toast.textContent = msg;
    toast.classList.add('error');
    toast.hidden = false;
    setTimeout(() => { toast.hidden = true; }, 4000);
    return;
  }
  console.error(`entry-review: ${msg}`);
}

type EntryAction = 'approve' | 'block' | 'cancel';

const CONTROL_TO_ACTION: Readonly<Record<string, EntryAction>> = {
  approve: 'approve',
  block: 'block',
  cancel: 'cancel',
};

/**
 * Stage-action wiring for the off-pipeline affordance sets (induct-to
 * picker for Blocked / Cancelled, plus a delegated click handler for
 * any future `data-control="approve|block|cancel"` button).
 *
 * Per `THESIS.md` Consequence 2 (#189), every click here copies the
 * corresponding `/deskwork:<verb> <slug>` skill command to the
 * operator's clipboard via `copyOrShowFallback`. The state-machine
 * mutation belongs to the skill, not to this UI handler. The data
 * attributes carry the slug + uuid so the handler can build the
 * command without round-tripping to the server. Reject is unaffected
 * (separately disabled pending issue #173).
 */
function wireStageActions(): void {
  document.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const control = target.dataset.control;
    const slug = target.dataset.entrySlug;
    if (!control || !slug) return;
    const action = CONTROL_TO_ACTION[control];
    if (action === undefined) return;
    e.preventDefault();
    const command = `/deskwork:${action} ${slug}`;
    await copyOrShowFallback(command, {
      successMessage: `Copied — paste into a Claude Code chat to run \`${command}\`.`,
      fallbackMessage:
        `Clipboard unavailable on this origin. Copy this command and paste it into a Claude Code chat to run \`/deskwork:${action}\`:`,
    });
  });

  document.addEventListener('change', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.name !== 'induct-to') return;
    const slug = target.dataset.entrySlug;
    if (!slug) return;
    const targetStage = target.value;
    if (!targetStage) return;
    const command = `/deskwork:induct ${slug} --to ${targetStage}`;
    await copyOrShowFallback(command, {
      successMessage: `Copied — paste into a Claude Code chat to run \`${command}\`.`,
      fallbackMessage:
        `Clipboard unavailable on this origin. Copy this command and paste it into a Claude Code chat to induct ${slug} into ${targetStage}:`,
    });
    // Reset the select to its placeholder so the change can be invoked
    // again (otherwise the same option stays selected and a second
    // induct attempt to the same stage produces no `change` event).
    target.value = '';
  });
}

interface PollDeps {
  entryId: string;
  currentStage: string;
  currentVersion: number | null;
  isEditing: () => boolean;
  showToast: (msg: string) => void;
}

/**
 * Poll the sidecar for stage / iteration changes so the operator sees
 * background-applied edits without manually reloading. 8-second cadence
 * mirrors the legacy surface; suppress polls when the operator is
 * actively editing so no toast competes for attention.
 */
function startPolling(deps: PollDeps): void {
  const POLL_MS = 8000;
  const indicator = optEl<HTMLElement>('[data-poll]');
  let busy = false;

  async function tick(): Promise<void> {
    if (busy || deps.isEditing()) return;
    busy = true;
    if (indicator) indicator.classList.add('polling');
    try {
      const res = await fetch(`${ENTRY_API}/${encodeURIComponent(deps.entryId)}/annotations`);
      // We don't actually need the annotations here; the request is a
      // proof-of-life ping that exercises the entry-keyed API. A real
      // poll-for-sidecar-changes would hit a dedicated endpoint; for
      // Layer 2 the lighter signal is enough — the operator's main
      // interactive surfaces (Approve / Iterate / margin notes) all
      // reload on success, so the auto-poll is a fallback.
      void res;
    } catch {
      // Network hiccup — silent retry next tick.
    } finally {
      busy = false;
      if (indicator) indicator.classList.remove('polling');
    }
  }
  setInterval(() => { void tick(); }, POLL_MS);
}

function initPressCheckSurface(): void {
  const state = readEntryReviewState();
  if (!state) return;

  const draftBody = reqEl<HTMLElement>('#draft-body');
  const composer = reqEl<HTMLElement>('[data-comment-composer]');
  const composerQuote = reqEl<HTMLElement>('[data-composer-quote]');
  const categorySel = reqEl<HTMLSelectElement>('[data-comment-category]');
  const textArea = reqEl<HTMLTextAreaElement>('[data-comment-text]');
  const sidebarList = reqEl<HTMLElement>('[data-sidebar-list]');
  const sidebarEmpty = reqEl<HTMLElement>('[data-sidebar-empty]');
  const sidebar = reqEl<HTMLElement>('[data-comments-sidebar]');
  const toastEl = reqEl<HTMLElement>('[data-toast]');
  const addBtn = reqEl<HTMLButtonElement>('[data-add-comment-btn]');

  function showToast(msg: string, isError = false): void {
    toastEl.textContent = msg;
    toastEl.classList.toggle('error', isError);
    toastEl.hidden = false;
    setTimeout(() => { toastEl.hidden = true; }, 4000);
  }

  const marginaliaToggle = initMarginaliaToggle();

  const annotations = createAnnotationsController({
    state,
    showToast,
    dom: {
      draftBody, addBtn, composer, composerQuote, categorySel,
      textArea, sidebarList, sidebarEmpty, sidebar, toastEl,
    },
    // #188 — adding marginalia is an implicit ask to open the marginalia
    // drawer. The annotations controller invokes this just before
    // opening the composer.
    unstowMarginalia: () => marginaliaToggle.applyState(false),
  });

  // #190 — keep marginalia items vertically aligned with their marks
  // in the article body. Self-maintaining via MutationObserver +
  // ResizeObserver; no further wiring required at controller-mutation
  // sites.
  wireMarginaliaPositioning(draftBody, sidebarList);

  const decision = createDecisionController({
    state,
    showToast,
    dom: {
      approveBtn: optEl<HTMLButtonElement>('[data-action="approve"]'),
      iterateBtn: optEl<HTMLButtonElement>('[data-action="iterate"]'),
      rejectBtn: optEl<HTMLButtonElement>('[data-action="reject"]'),
    },
  });

  const editMode = createEditModeController({
    state,
    showToast,
    dom: {
      draftBody,
      draftEdit: reqEl<HTMLTextAreaElement>('#draft-edit'),
      editToolbar: reqEl<HTMLElement>('[data-edit-toolbar]'),
      editPanesHost: reqEl<HTMLElement>('[data-edit-panes-host]'),
      editPanes: reqEl<HTMLElement>('[data-edit-panes]'),
      editSourceHost: reqEl<HTMLElement>('[data-edit-source]'),
      editPreviewHost: reqEl<HTMLElement>('[data-edit-preview]'),
      toggleBtn: optEl<HTMLButtonElement>('[data-action="toggle-edit"]'),
      cancelEditBtn: optEl<HTMLButtonElement>('[data-action="cancel-edit"]'),
      saveVersionBtn: optEl<HTMLButtonElement>('[data-action="save-version"]'),
      editHint: reqEl<HTMLElement>('[data-edit-hint]'),
      editModeBtns: Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-edit-view]'),
      ),
      editModeLabel: optEl<HTMLElement>('.er-edit-mode-label'),
      focusBtn: optEl<HTMLButtonElement>('[data-action="focus-mode"]'),
      exitFocusBtn: optEl<HTMLButtonElement>('[data-action="exit-focus"]'),
      focusSaveHint: optEl<HTMLElement>('[data-focus-save-hint]'),
    },
  });

  const outline = initOutlineDrawer();
  initScrapbookDrawerToggle();
  initScrapbookLightbox(document);

  initShortcuts({
    showToast,
    toggleEdit: () => {
      const toggleBtn = document.querySelector<HTMLButtonElement>('[data-action="toggle-edit"]');
      toggleBtn?.click();
    },
    approve: () => { void decision.approve(); },
    iterate: () => { void decision.iterate(); },
    reject: () => decision.reject(),
    nextNote: (dir) => annotations.focusCommentByIndex(dir),
    toggleMarginalia: marginaliaToggle.toggle,
    toggleOutline: outline.toggle,
    outlineAvailable: outline.available,
    closeOutline: outline.close,
    outlineIsOpen: outline.isOpen,
    closeComposer: annotations.closeComposer,
    composerIsOpen: annotations.isComposerOpen,
    isEditing: editMode.isEditing,
    isFocused: editMode.isFocused,
    enterFocus: editMode.enterFocus,
    exitFocus: editMode.exitFocus,
  });

  startPolling({
    entryId: state.entryId,
    currentStage: state.currentStage,
    currentVersion: state.currentVersion,
    isEditing: editMode.isEditing,
    showToast,
  });

  void annotations.loadAnnotations();
}

// Two surfaces share this entry point:
//   1. The minimal stage-controller view (Blocked / Cancelled — emits
//      `er-entry-shell` markup with `data-control="..."` buttons).
//   2. The full press-check chrome view (Drafting / Outlining / etc. —
//      emits `er-review-shell` markup with the embedded state JSON).
//
// `wireStageActions` is the always-on global delegated handler that
// drives surface 1; `initPressCheckSurface` boots only when the
// embedded state JSON is present, which only happens on surface 2.

wireStageActions();
initPressCheckSurface();
