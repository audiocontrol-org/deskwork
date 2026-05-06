/**
 * Edit-mode controller for the entry-keyed press-check client
 * (Phase 34a — T7/T8 client wiring).
 *
 * Mounts a CodeMirror editor inside `[data-edit-source]` and feeds the
 * preview pane via the existing `/api/dev/editorial-review/render`
 * endpoint. Save (#174) is a dumb file write: the click POSTs the
 * editor text to `PUT /api/dev/editorial-review/entry/:entryId/body`,
 * which writes to the entry's canonical document file on disk. NO
 * version bump, NO journal record, NO state-machine mutation —
 * `/deskwork:iterate` owns those.
 *
 *   - `Edit` button → `enterEdit` mounts the editor with the current
 *     artifact body.
 *   - `Cancel` → discard local edits + exit.
 *   - `Save` → write the current text to disk.
 *
 * The CodeMirror module is dynamically imported so the bundle only
 * loads when the operator actually enters edit mode.
 *
 * Historical-version mode: when `state.historical` is true, edit mode
 * is disabled (entering edit shows a toast).
 */

import type { EntryReviewState } from './state.ts';
import { inlineConfirm } from './inline-prompt.ts';

const RENDER_API = '/api/dev/editorial-review/render';
const ENTRY_API = '/api/dev/editorial-review/entry';

interface EditDom {
  draftBody: HTMLElement;
  draftEdit: HTMLTextAreaElement;
  editToolbar: HTMLElement;
  editPanesHost: HTMLElement;
  editPanes: HTMLElement;
  editSourceHost: HTMLElement;
  editPreviewHost: HTMLElement;
  toggleBtn: HTMLButtonElement | null;
  cancelEditBtn: HTMLButtonElement | null;
  saveVersionBtn: HTMLButtonElement | null;
  editHint: HTMLElement;
  editModeBtns: HTMLButtonElement[];
  editModeLabel: HTMLElement | null;
  focusBtn: HTMLButtonElement | null;
  exitFocusBtn: HTMLButtonElement | null;
  focusSaveHint: HTMLElement | null;
}

export interface EditModeControllerOptions {
  state: EntryReviewState;
  dom: EditDom;
  showToast: (msg: string, isError?: boolean) => void;
}

export interface EditModeController {
  enter: () => Promise<void>;
  exit: () => void;
  isEditing: () => boolean;
  isFocused: () => boolean;
  enterFocus: () => void;
  exitFocus: () => void;
  hasUnsavedChanges: () => boolean;
  setEditView: (view: 'source' | 'split' | 'preview') => void;
}

interface EditorHandle {
  view: { scrollDOM: HTMLElement; state: { doc: { toString: () => string } } };
  destroy: () => void;
  focus: () => void;
  getValue: () => string;
  setCursor: (pos: number) => void;
}

export function createEditModeController(
  opts: EditModeControllerOptions,
): EditModeController {
  const { state, dom, showToast } = opts;
  const {
    draftBody, draftEdit, editToolbar, editPanesHost, editPanes,
    editSourceHost, editPreviewHost, toggleBtn, cancelEditBtn, saveVersionBtn,
    editHint, editModeBtns, editModeLabel, focusBtn, exitFocusBtn, focusSaveHint,
  } = dom;
  let editing = false;
  let focusMode = false;
  let editorHandle: EditorHandle | null = null;
  let previewDebounce: number | null = null;

  function setEditModeLabel(mode: 'preview' | 'source'): void {
    if (!editModeLabel) return;
    editModeLabel.dataset.mode = mode;
    editModeLabel.textContent = mode;
  }

  function setHint(text: string): void {
    editHint.textContent = text;
    if (focusSaveHint) focusSaveHint.textContent = text;
  }

  function updateSaveState(): void {
    // #174 — Save is a dumb file write. Always enabled while editing
    // so the operator never has to wonder "why won't this save?". The
    // click handler is idempotent against a no-op edit; intent-to-save
    // trumps any state-management cleverness on the UI side.
    const focusSaveBtn = document.querySelector<HTMLButtonElement>(
      '[data-focus-save] [data-action="save-version"]',
    );
    if (focusSaveBtn) focusSaveBtn.disabled = false;
    if (saveVersionBtn) saveVersionBtn.disabled = false;
    const changed = draftEdit.value !== state.markdown;
    setHint(changed ? 'Modified' : 'No changes');
  }

  function hasUnsavedChanges(): boolean {
    return editing && draftEdit.value !== state.markdown;
  }

  /**
   * #166 Phase 34b — async inline discard confirm replaces the legacy
   * window.confirm. Renders a small dialog anchored to the edit
   * toolbar (or appended to the body when no toolbar is mounted).
   * Resolves true when the operator confirms discard, false when they
   * cancel. Cmd/Ctrl+Enter confirms, Esc cancels.
   */
  async function confirmDiscard(reason: string): Promise<boolean> {
    if (!hasUnsavedChanges()) return true;
    return inlineConfirm({
      label: 'Unsaved changes',
      message: `${reason} Unsaved edits will be lost.`,
      confirm: 'Discard',
      cancel: 'Keep editing',
      anchor: toggleBtn ?? cancelEditBtn ?? document.body,
    });
  }

  async function fetchRenderedHtml(markdown: string): Promise<string> {
    const res = await fetch(RENDER_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ markdown }),
    });
    if (!res.ok) {
      const errBody: unknown = await res.json().catch(() => ({}));
      const message =
        typeof errBody === 'object' && errBody !== null && 'error' in errBody &&
        typeof (errBody as { error: unknown }).error === 'string'
          ? (errBody as { error: string }).error
          : `render endpoint returned ${res.status}`;
      throw new Error(message);
    }
    const json: unknown = await res.json();
    if (
      typeof json !== 'object' || json === null || !('html' in json) ||
      typeof (json as { html: unknown }).html !== 'string'
    ) {
      throw new Error('render endpoint returned malformed body');
    }
    return (json as { html: string }).html;
  }

  function stripFrontmatter(md: string): string {
    if (!md.startsWith('---\n')) return md;
    const end = md.indexOf('\n---', 4);
    if (end < 0) return md;
    const after = md.slice(end + 4);
    return after.startsWith('\n') ? after.slice(1) : after;
  }

  function schedulePreview(md: string): void {
    if (previewDebounce !== null) window.clearTimeout(previewDebounce);
    previewDebounce = window.setTimeout(async () => {
      try {
        const bodyOnly = stripFrontmatter(md);
        const html = await fetchRenderedHtml(bodyOnly);
        editPreviewHost.innerHTML = html;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        editPreviewHost.innerHTML =
          `<p class="er-edit-preview-error">Preview failed: ${reason}</p>`;
      }
    }, 120);
  }

  function setEditView(view: 'source' | 'split' | 'preview'): void {
    editPanes.dataset.view = view;
    for (const btn of editModeBtns) {
      btn.setAttribute('aria-pressed', String(btn.dataset.editView === view));
    }
    if (view !== 'source' && editorHandle) {
      schedulePreview(editorHandle.getValue());
    }
  }

  for (const btn of editModeBtns) {
    btn.addEventListener('click', () => {
      const v = btn.dataset.editView;
      if (v === 'source' || v === 'split' || v === 'preview') {
        setEditView(v);
      }
    });
  }

  async function enterEdit(): Promise<void> {
    if (state.historical) {
      showToast('Historical version is read-only — switch to current to edit.', true);
      return;
    }
    draftEdit.value = state.markdown;
    editToolbar.hidden = false;
    editPanesHost.hidden = false;
    draftBody.classList.add('hidden');
    if (toggleBtn) toggleBtn.textContent = 'View';
    setEditModeLabel('source');
    editing = true;

    const { mountEditor } = await import('../editorial-review-editor.ts');
    if (editorHandle) editorHandle.destroy();
    editSourceHost.innerHTML = '';
    editorHandle = mountEditor({
      host: editSourceHost,
      doc: state.markdown,
      onChange: (bodyMd) => {
        draftEdit.value = bodyMd;
        updateSaveState();
        if (editPanes.dataset.view !== 'source') schedulePreview(bodyMd);
      },
      onSave: () => { saveVersionBtn?.click(); },
      onCancel: () => {
        if (document.body.classList.contains('er-focus-mode')) exitFocus();
        else cancelEditBtn?.click();
      },
    });
    updateSaveState();
    setEditView('split');
    editToolbar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    editorHandle.focus();
    schedulePreview(state.markdown);
  }

  function exitEdit(): void {
    if (document.body.classList.contains('er-focus-mode')) {
      document.body.classList.remove('er-focus-mode');
      focusBtn?.setAttribute('aria-pressed', 'false');
      focusMode = false;
    }
    editToolbar.hidden = true;
    editPanesHost.hidden = true;
    draftBody.classList.remove('hidden');
    if (toggleBtn) toggleBtn.textContent = 'Edit';
    setEditModeLabel('preview');
    editing = false;
    if (editorHandle) {
      editorHandle.destroy();
      editorHandle = null;
    }
    editSourceHost.innerHTML = '';
    editPreviewHost.innerHTML = '';
  }

  // ---- Save (#174) ----
  //
  // POST the current editor text to the entry-keyed body endpoint.
  // Dumb file write: no version bump, no journal record, no
  // state-machine flip. State-machine work belongs to `/deskwork:iterate`.
  //
  // Guards against double-submission via `saving`. On success: refresh
  // `state.markdown` so subsequent dirty-detection compares against the
  // newly-saved content; flash a "Saved" hint. On failure: show a toast
  // and leave the buffer untouched so the operator can retry.
  let saving = false;

  function setSaveButtonsDisabled(disabled: boolean): void {
    document
      .querySelectorAll<HTMLButtonElement>('[data-action="save-version"]')
      .forEach((btn) => {
        btn.disabled = disabled;
      });
  }

  async function performSave(): Promise<void> {
    if (saving) return;
    if (state.historical) {
      showToast('Historical version is read-only — switch to current to save.', true);
      return;
    }
    const value = editorHandle ? editorHandle.getValue() : draftEdit.value;
    saving = true;
    setSaveButtonsDisabled(true);
    setHint('Saving…');
    try {
      const res = await fetch(
        `${ENTRY_API}/${encodeURIComponent(state.entryId)}/body`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ markdown: value }),
        },
      );
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reason =
          typeof json === 'object' && json !== null && 'error' in json &&
          typeof (json as { error: unknown }).error === 'string'
            ? (json as { error: string }).error
            : `save endpoint returned ${res.status}`;
        showToast(`Save failed: ${reason}`, true);
        setHint('Save failed');
        return;
      }
      // Reflect the new on-disk state in our dirty-tracking baseline so
      // a follow-up no-op Save doesn't re-trigger unsaved-change UI.
      state.markdown = value;
      draftEdit.value = value;
      showToast('Saved');
      setHint('Saved');
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      showToast(`Save failed: ${reason}`, true);
      setHint('Save failed');
    } finally {
      saving = false;
      setSaveButtonsDisabled(false);
    }
  }

  document.querySelectorAll<HTMLButtonElement>('[data-action="save-version"]').forEach(
    (btn) => btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      void performSave();
    }),
  );

  // ---- Toggle / Cancel ----

  toggleBtn?.addEventListener('click', () => {
    void (async () => {
      if (editing) {
        if (!(await confirmDiscard('Exiting the editor will discard them.'))) return;
        exitEdit();
      } else {
        await enterEdit();
      }
    })();
  });
  cancelEditBtn?.addEventListener('click', () => {
    void (async () => {
      if (!(await confirmDiscard('Cancel will discard them.'))) return;
      exitEdit();
    })();
  });

  window.addEventListener('beforeunload', (ev) => {
    if (!hasUnsavedChanges()) return;
    ev.preventDefault();
    ev.returnValue = '';
  });

  // ---- Focus mode ----

  function enterFocus(): void {
    if (!editing) return;
    document.body.classList.add('er-focus-mode');
    focusBtn?.setAttribute('aria-pressed', 'true');
    focusMode = true;
    setEditView('source');
    if (focusSaveHint) focusSaveHint.textContent = editHint.textContent ?? '';
    editorHandle?.focus();
  }

  function exitFocus(): void {
    document.body.classList.remove('er-focus-mode');
    focusBtn?.setAttribute('aria-pressed', 'false');
    focusMode = false;
  }

  focusBtn?.addEventListener('click', () => {
    if (focusMode) exitFocus();
    else enterFocus();
  });
  exitFocusBtn?.addEventListener('click', exitFocus);

  // Double-click the rendered body → enter edit (mirrors legacy gesture).
  draftBody.addEventListener('dblclick', (ev) => {
    if (editing) return;
    const target = ev.target;
    if (target instanceof HTMLElement && target.closest('mark.draft-comment-highlight')) return;
    window.getSelection()?.removeAllRanges();
    void enterEdit();
  });

  return {
    enter: enterEdit,
    exit: exitEdit,
    isEditing: () => editing,
    isFocused: () => focusMode,
    enterFocus,
    exitFocus,
    hasUnsavedChanges,
    setEditView,
  };
}
