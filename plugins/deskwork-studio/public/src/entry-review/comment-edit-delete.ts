/**
 * Phase 35 (issue #199) — client-side edit + delete affordances for
 * margin-note comments.
 *
 * Affordance placement: Edit + Delete buttons live ON each comment
 * card, alongside the existing Resolve button (per
 * `.claude/rules/affordance-placement.md` — component-attached, not
 * toolbar-attached). Both round-trip the new endpoints under
 * `/api/dev/editorial-review/entry/:entryId/comments/:commentId`.
 *
 * Edit:    PATCH the endpoint with { text } once the operator hits
 *          Save; controller re-renders the card from the returned
 *          (folded) view.
 * Delete:  DELETE the endpoint after an inline confirm. Controller
 *          removes the card from the live sidebar; the original
 *          `comment` annotation stays on disk as audit trail.
 *
 * Range / category / anchor edits are NOT exposed in this iteration —
 * those need richer interaction (drag-to-resize, category dropdown
 * inline) and are tracked separately. The PATCH endpoint accepts
 * those fields for future use; this module only wires text-edit.
 */

import { inlineConfirm } from './inline-prompt.ts';
import type { CommentAnnotation } from './state.ts';

const ENTRY_API = '/api/dev/editorial-review/entry';

interface CommentEditApi {
  /** Persist a text edit. Returns the minted edit-comment annotation
   *  (with id + createdAt) on success, or null on failure (toast was
   *  shown). */
  saveEdit: (commentId: string, text: string) => Promise<boolean>;
  /** Persist a delete. Returns true on success. */
  deleteComment: (commentId: string) => Promise<boolean>;
  /** Persist a resolve / re-open. Returns true on success. */
  postResolve: (commentId: string, resolved: boolean) => Promise<boolean>;
}

export function createCommentEditApi(
  entryId: string,
  showToast: (msg: string, isError?: boolean) => void,
): CommentEditApi {
  const commentUrl = (commentId: string): string =>
    `${ENTRY_API}/${encodeURIComponent(entryId)}/comments/${encodeURIComponent(commentId)}`;
  const annotateUrl = (): string =>
    `${ENTRY_API}/${encodeURIComponent(entryId)}/annotate`;

  async function saveEdit(commentId: string, text: string): Promise<boolean> {
    try {
      const res = await fetch(commentUrl(commentId), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        const reason = (body as { error?: string }).error ?? `${res.status}`;
        showToast(`Edit failed: ${reason}`, true);
        return false;
      }
      return true;
    } catch (e) {
      showToast(
        `Network error: ${e instanceof Error ? e.message : String(e)}`,
        true,
      );
      return false;
    }
  }

  async function deleteComment(commentId: string): Promise<boolean> {
    try {
      const res = await fetch(commentUrl(commentId), { method: 'DELETE' });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        const reason = (body as { error?: string }).error ?? `${res.status}`;
        showToast(`Delete failed: ${reason}`, true);
        return false;
      }
      return true;
    } catch (e) {
      showToast(
        `Network error: ${e instanceof Error ? e.message : String(e)}`,
        true,
      );
      return false;
    }
  }

  async function postResolve(commentId: string, resolved: boolean): Promise<boolean> {
    try {
      const res = await fetch(annotateUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // Phase 34a: entry-keyed annotations reuse entryId as workflowId
          // for type compatibility; field retired in shortform-migration phase.
          type: 'resolve',
          workflowId: entryId,
          commentId,
          resolved,
        }),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        const reason = (body as { error?: string }).error ?? `${res.status}`;
        showToast(`Resolve failed: ${reason}`, true);
        return false;
      }
      return true;
    } catch (e) {
      showToast(
        `Network error: ${e instanceof Error ? e.message : String(e)}`,
        true,
      );
      return false;
    }
  }

  return { saveEdit, deleteComment, postResolve };
}

export interface EnterEditModeArgs {
  /** The text-paragraph element inside the card that holds the
   *  comment text. Replaced with a textarea + Save / Cancel buttons. */
  noteEl: HTMLElement;
  /** Initial text (the un-edited value the textarea opens with). */
  initialText: string;
  /** Called when the operator clicks Save (or Cmd/Ctrl-Enters) with
   *  the trimmed new text. */
  onSave: (newText: string) => Promise<void>;
}

/**
 * Replace the text paragraph inside a comment card with an inline
 * textarea + Save/Cancel buttons. Cmd/Ctrl-Enter saves; Esc cancels.
 *
 * Returns a function that exits edit mode without saving (used by the
 * Cancel button and the keyboard handler).
 */
export function enterEditMode(args: EnterEditModeArgs): void {
  const { noteEl, initialText, onSave } = args;
  // If a previous edit-mode is open in this card, bail — no stacking.
  const card = noteEl.parentElement;
  if (!card) return;
  if (card.querySelector('[data-comment-edit-form]')) return;

  const form = document.createElement('div');
  form.className = 'er-marginalia-edit';
  form.dataset.commentEditForm = 'true';

  const ta = document.createElement('textarea');
  ta.className = 'er-marginalia-edit-textarea';
  ta.value = initialText;
  ta.rows = Math.max(2, Math.min(8, initialText.split('\n').length + 1));

  const actions = document.createElement('div');
  actions.className = 'er-marginalia-edit-actions';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'er-btn er-btn-small';
  cancel.textContent = 'Cancel';

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'er-btn er-btn-small er-btn-primary';
  save.textContent = 'Save';

  actions.appendChild(cancel);
  actions.appendChild(save);
  form.appendChild(ta);
  form.appendChild(actions);

  noteEl.hidden = true;
  noteEl.insertAdjacentElement('afterend', form);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  function exit(): void {
    form.remove();
    noteEl.hidden = false;
  }

  async function commit(): Promise<void> {
    const next = ta.value.trim();
    if (!next) return;
    if (next === initialText) {
      exit();
      return;
    }
    save.disabled = true;
    cancel.disabled = true;
    try {
      await onSave(next);
    } finally {
      save.disabled = false;
      cancel.disabled = false;
    }
  }

  cancel.addEventListener('click', (ev) => {
    ev.stopPropagation();
    exit();
  });
  save.addEventListener('click', (ev) => {
    ev.stopPropagation();
    void commit();
  });
  ta.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      exit();
      return;
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      void commit();
    }
  });
  // Stop click propagation on the form so the sidebar's
  // click-to-scroll handler doesn't fire while editing.
  form.addEventListener('click', (ev) => ev.stopPropagation());
}

export interface ConfirmDeleteArgs {
  /** The Delete button on the comment card. The inline confirm
   *  anchors itself just after this button. */
  anchor: HTMLElement;
  /** Quote-snippet of the comment being deleted, included in the
   *  confirm message so the operator knows which comment they're
   *  about to remove. */
  quote: string;
}

export function confirmDelete(args: ConfirmDeleteArgs): Promise<boolean> {
  return inlineConfirm({
    label: 'Delete this margin note?',
    message: args.quote
      ? `"${truncate(args.quote, 60)}" will be removed from the sidebar.`
      : 'The note will be removed from the sidebar.',
    confirm: 'Delete',
    cancel: 'Cancel',
    anchor: args.anchor,
  });
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n).trimEnd()}…`;
}

/**
 * Annotate a comment card by mutating its DOM in place after a
 * successful edit. Used by the controller after the PATCH round-trip
 * lands so we don't need a full sidebar re-render for a single text
 * change.
 */
export function applyEditedTextToCard(
  card: HTMLElement,
  newText: string,
): void {
  const note = card.querySelector<HTMLElement>('p.note');
  if (!note) return;
  note.textContent = newText;
  note.hidden = false;
  const form = card.querySelector<HTMLElement>('[data-comment-edit-form]');
  if (form) form.remove();
}

export interface EditDeleteHandlerDeps {
  api: CommentEditApi;
  showToast: (msg: string, isError?: boolean) => void;
  /** Resolve the highlight quote for a comment when its anchor is
   *  missing — used in the delete-confirm message. */
  quoteFor: (annotation: CommentAnnotation) => string;
  /** Remove the article-body highlight when a comment is deleted. */
  removeHighlight: (commentId: string) => void;
  /** Maintenance hook the sidebar controller calls when a card
   *  disappears (re-checks the empty state). */
  onCardRemoved: (commentId: string) => void;
}

export interface EditDeleteHandlers {
  onEdit: (
    a: CommentAnnotation,
    card: HTMLElement,
    noteEl: HTMLElement,
  ) => void;
  onDelete: (
    a: CommentAnnotation,
    card: HTMLElement,
    deleteBtn: HTMLElement,
  ) => void;
}

/**
 * Wire the Edit + Delete affordances on a comment card. Returned
 * handlers match the `BuildSidebarItemDeps` shape from
 * `sidebar-render.ts`.
 */
export function createEditDeleteHandlers(
  deps: EditDeleteHandlerDeps,
): EditDeleteHandlers {
  return {
    onEdit: (a, card, noteEl) => {
      enterEditMode({
        noteEl,
        initialText: a.text,
        onSave: async (next) => {
          const ok = await deps.api.saveEdit(a.id, next);
          if (!ok) return;
          // Mutate the in-memory annotation so a subsequent edit
          // reads from the new value.
          a.text = next;
          applyEditedTextToCard(card, next);
          deps.showToast('Comment updated');
        },
      });
    },
    onDelete: (a, card, deleteBtn) => {
      const quote = deps.quoteFor(a);
      void (async () => {
        const ok = await confirmDelete({ anchor: deleteBtn, quote });
        if (!ok) return;
        const persisted = await deps.api.deleteComment(a.id);
        if (!persisted) return;
        deps.removeHighlight(a.id);
        card.remove();
        deps.onCardRemoved(a.id);
        deps.showToast('Comment deleted');
      })();
    },
  };
}
