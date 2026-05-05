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
 * Edit:    PATCH the endpoint with { text?, category? } once the
 *          operator hits Save; payload is minimised to only the fields
 *          that actually changed (no-op edits don't fire a network
 *          round-trip at all). Range / anchor edits remain server-side
 *          only — see #203 (range-edit wontfix) and the schema's
 *          defense-in-depth acceptance of those fields.
 * Delete:  DELETE the endpoint after an inline confirm. Controller
 *          removes the card from the live sidebar; the original
 *          `comment` annotation stays on disk as audit trail.
 *
 * Phase 7 extension (issue #204): the inline edit form now exposes a
 * category dropdown alongside the text textarea so the operator can
 * re-categorise without delete-and-recreate.
 */

import { inlineConfirm } from './inline-prompt.ts';
import type { CommentAnnotation } from './state.ts';

const ENTRY_API = '/api/dev/editorial-review/entry';

/**
 * Annotation categories the comment composer + edit dropdown expose.
 * Mirrors the server schema's `AnnotationCategoryEnum`
 * (`packages/core/src/schema/draft-annotation.ts`) and the composer
 * `<select>` rendered server-side in
 * `packages/studio/src/pages/entry-review/marginalia.ts`. Keep the
 * three in lockstep — the composer is the visual canon (`other` first,
 * the rest in disclosure order).
 */
export const ANNOTATION_CATEGORIES: readonly string[] = [
  'other',
  'voice-drift',
  'missing-receipt',
  'tutorial-framing',
  'saas-vocabulary',
  'fake-authority',
  'structural',
];

/** Editable subset of an `edit-comment` payload from the client. */
export interface EditCommentPatch {
  text?: string;
  category?: string;
}

interface CommentEditApi {
  /** Persist an edit. Empty `patch` is a no-op (returns true without
   *  hitting the network). Returns true on success / no-op, or false
   *  on failure (toast was shown). */
  saveEdit: (commentId: string, patch: EditCommentPatch) => Promise<boolean>;
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

  async function saveEdit(
    commentId: string,
    patch: EditCommentPatch,
  ): Promise<boolean> {
    // No-op: nothing to send. Treat as success so the caller exits
    // edit mode cleanly without a wasted server round-trip.
    if (patch.text === undefined && patch.category === undefined) {
      return true;
    }
    const payload: EditCommentPatch = {};
    if (patch.text !== undefined) payload.text = patch.text;
    if (patch.category !== undefined) payload.category = patch.category;
    try {
      const res = await fetch(commentUrl(commentId), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
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
  /** Initial category (drives the pre-selected dropdown option).
   *  Comments minted before category was a required composer field
   *  may have undefined here; the dropdown defaults to `other`. */
  initialCategory?: string;
  /** Called when the operator clicks Save (or Cmd/Ctrl-Enters) with
   *  the diff payload. Empty patch indicates no change. */
  onSave: (patch: EditCommentPatch) => Promise<void>;
}

/**
 * Replace the text paragraph inside a comment card with an inline
 * textarea + category dropdown + Save/Cancel buttons. Cmd/Ctrl-Enter
 * saves; Esc cancels.
 */
export function enterEditMode(args: EnterEditModeArgs): void {
  const { noteEl, initialText, initialCategory, onSave } = args;
  // If a previous edit-mode is open in this card, bail — no stacking.
  const card = noteEl.parentElement;
  if (!card) return;
  if (card.querySelector('[data-comment-edit-form]')) return;

  const form = document.createElement('div');
  form.className = 'er-marginalia-edit';
  form.dataset.commentEditForm = 'true';

  // Category dropdown — Phase 7 / issue #204. Pinned ABOVE the
  // textarea so the picker is visually adjacent to the existing
  // category-pill at the top of the card (the operator's eye is
  // already there when they decide to re-categorise).
  const categorySel = document.createElement('select');
  categorySel.className = 'er-marginalia-edit-category';
  categorySel.dataset.action = 'edit-category';
  categorySel.setAttribute('aria-label', 'Comment category');
  const initialCat = normaliseCategory(initialCategory);
  for (const value of ANNOTATION_CATEGORIES) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    if (value === initialCat) opt.selected = true;
    categorySel.appendChild(opt);
  }

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
  form.appendChild(categorySel);
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
    const nextCat = categorySel.value;
    const patch: EditCommentPatch = {};
    if (next !== initialText) patch.text = next;
    if (nextCat !== initialCat) patch.category = nextCat;
    if (patch.text === undefined && patch.category === undefined) {
      // No-op edit — exit cleanly without a network round-trip.
      exit();
      return;
    }
    save.disabled = true;
    cancel.disabled = true;
    try {
      await onSave(patch);
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
 * Coerce an arbitrary string (or undefined) into one of the known
 * categories. Unknown values fall back to `other` — same shape as the
 * server-rendered composer's default.
 */
function normaliseCategory(value: string | undefined): string {
  if (!value) return 'other';
  return ANNOTATION_CATEGORIES.includes(value) ? value : 'other';
}

export interface ApplyEditPatchToCardArgs {
  /** New comment text — undefined means "leave unchanged". */
  text?: string;
  /** New category — undefined means "leave unchanged". The card's
   *  category pill is rendered as `cat.textContent`; we replace its
   *  trailing token (after the last ` · `) so the version-prefix /
   *  rebased-prefix is preserved. */
  category?: string;
}

/**
 * Annotate a comment card by mutating its DOM in place after a
 * successful edit. Used by the controller after the PATCH round-trip
 * lands so we don't need a full sidebar re-render for a single edit.
 */
export function applyEditPatchToCard(
  card: HTMLElement,
  patch: ApplyEditPatchToCardArgs,
): void {
  if (patch.text !== undefined) {
    const note = card.querySelector<HTMLElement>('p.note');
    if (note) {
      note.textContent = patch.text;
      note.hidden = false;
    }
  }
  if (patch.category !== undefined) {
    const cat = card.querySelector<HTMLElement>('.cat');
    if (cat) {
      const current = cat.textContent ?? '';
      const sep = ' · ';
      const idx = current.lastIndexOf(sep);
      cat.textContent = idx >= 0
        ? `${current.slice(0, idx + sep.length)}${patch.category}`
        : patch.category;
    }
  }
  const form = card.querySelector<HTMLElement>('[data-comment-edit-form]');
  if (form) form.remove();
  const note = card.querySelector<HTMLElement>('p.note');
  if (note) note.hidden = false;
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
        ...(a.category !== undefined ? { initialCategory: a.category } : {}),
        onSave: async (patch) => {
          const ok = await deps.api.saveEdit(a.id, patch);
          if (!ok) return;
          // Mutate the in-memory annotation so a subsequent edit
          // reads from the new values.
          if (patch.text !== undefined) a.text = patch.text;
          if (patch.category !== undefined) a.category = patch.category;
          applyEditPatchToCard(card, patch);
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
