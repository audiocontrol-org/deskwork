/**
 * Margin-note authoring + load + render for the entry-keyed press-check
 * client. Composer markup + sidebar shell are server-rendered (see
 * `pages/entry-review/marginalia.ts`); this module wires the behavior:
 * selection → Mark pencil → composer; submit → POST + DOM update;
 * boot → GET + render by status (current / rebased / unresolved /
 * resolved); per-comment Resolve / Re-open round-trip the same endpoint.
 *
 * `workflowId` on persisted annotations === entry UUID (structurally
 * required by `DraftAnnotation`; entry-keyed surfaces reuse the UUID
 * as a unique identifier). Sidebar markup lives in `sidebar-render.ts`;
 * resolved-footer rendering lives in `resolved-footer.ts`; pure folds
 * over the journal stream live in `annotation-folding.ts`.
 */

import {
  computeOffsetFromRange,
  extractQuote,
  rebaseAnchor,
  removeHighlight,
  wrapRange,
} from './range-utils.ts';
import { buildSidebarItem } from './sidebar-render.ts';
import {
  createCommentEditApi,
  createEditDeleteHandlers,
} from './comment-edit-delete.ts';
import {
  renderResolvedFooter,
  type ResolvedHistoryEntry,
} from './resolved-footer.ts';
import {
  resolvedCommentIds,
  latestAddressByCommentId,
} from './annotation-folding.ts';
import type {
  AnyAnnotation,
  AnnotationStatus,
  CommentAnnotation,
  DraftRange,
  EntryReviewState,
  ResolveAnnotation,
  AddressAnnotation,
} from './state.ts';

const ENTRY_API = '/api/dev/editorial-review/entry';

interface DomHandles {
  draftBody: HTMLElement;
  addBtn: HTMLButtonElement;
  composer: HTMLElement;
  composerQuote: HTMLElement;
  categorySel: HTMLSelectElement;
  textArea: HTMLTextAreaElement;
  sidebarList: HTMLElement;
  sidebarEmpty: HTMLElement;
  sidebar: HTMLElement;
  toastEl: HTMLElement;
}

export interface AnnotationsControllerOptions {
  state: EntryReviewState;
  dom: DomHandles;
  showToast: (msg: string, isError?: boolean) => void;
  /** #188 — adding marginalia is an implicit ask to open the marginalia
   *  drawer. The composer markup lives INSIDE the drawer, so opening
   *  the composer while the drawer is stowed produces no visible UI.
   *  This callback unstows the drawer just before the composer opens. */
  unstowMarginalia?: () => void;
}

interface AnnotationsController {
  closeComposer: () => void;
  isComposerOpen: () => boolean;
  loadAnnotations: () => Promise<void>;
  focusCommentByIndex: (dir: 1 | -1) => void;
}

export function createAnnotationsController(
  opts: AnnotationsControllerOptions,
): AnnotationsController {
  const { state, dom, showToast, unstowMarginalia } = opts;
  const { draftBody, addBtn, composer, composerQuote, categorySel, textArea, sidebarList, sidebarEmpty, sidebar } = dom;
  const entryId = state.entryId;
  const versionNum = state.currentVersion ?? 1;
  const sidebarIndex = new Map<string, HTMLElement>();
  const resolvedHistory: ResolvedHistoryEntry[] = [];
  const addressByCommentId = new Map<string, AddressAnnotation>();
  let pendingRange: DraftRange | null = null;
  /** Page-relative top of the user's selection captured when
   *  `pendingRange` is set. Used by `openComposer` to anchor the
   *  composer next to the selection so the operator stays in their
   *  reading context (#190 follow-up — composer was opening at the
   *  top of the marginalia column, ripping the operator out of scroll
   *  context). Page-coords (rect.top + scrollY) survive scroll between
   *  selection and Mark click. */
  let pendingRangePageTop: number | null = null;
  let commentFocusIndex = -1;

  const annotationsUrl = (): string =>
    `${ENTRY_API}/${encodeURIComponent(entryId)}/annotations`;
  const annotateUrl = (): string =>
    `${ENTRY_API}/${encodeURIComponent(entryId)}/annotate`;
  const editApi = createCommentEditApi(entryId, showToast);
  const editDeleteHandlers = createEditDeleteHandlers({
    api: editApi,
    showToast,
    quoteFor: (a) => a.anchor ?? extractQuote(draftBody, a.range),
    removeHighlight: (id) => removeHighlight(draftBody, id),
    onCardRemoved: (id) => {
      sidebarIndex.delete(id);
      maybeShowEmpty();
    },
  });

  function maybeShowEmpty(): void {
    const anyLive = sidebarList.querySelector('.er-marginalia-item');
    sidebarEmpty.hidden = !!anyLive;
  }

  function setActiveHighlight(annotationId: string, active: boolean): void {
    const marks = draftBody.querySelectorAll<HTMLElement>(
      `mark[data-annotation-id="${annotationId}"]`,
    );
    marks.forEach((m) => m.classList.toggle('active', active));
    const item = sidebarIndex.get(annotationId);
    if (item) item.classList.toggle('active', active);
  }

  function scrollToHighlight(annotationId: string): void {
    const mark = draftBody.querySelector<HTMLElement>(
      `mark[data-annotation-id="${annotationId}"]`,
    );
    if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function addSidebarItem(annotation: CommentAnnotation, status: AnnotationStatus): void {
    sidebarEmpty.hidden = true;
    const li = buildSidebarItem(annotation, status, {
      draftBody,
      addressByCommentId,
      onResolve: (a, s) => { void resolveComment(a, s); },
      onEdit: editDeleteHandlers.onEdit,
      onDelete: editDeleteHandlers.onDelete,
      onHoverEnter: (id) => setActiveHighlight(id, true),
      onHoverLeave: (id) => setActiveHighlight(id, false),
      onScrollTo: (id) => scrollToHighlight(id),
    });
    sidebarList.appendChild(li);
    sidebarIndex.set(annotation.id, li);
  }

  // ---- Composer ----

  function openComposer(): void {
    if (!pendingRange) return;
    // Phase 34a F1 remediation — refuse to open the composer in
    // historical mode (defense-in-depth: the Mark pencil is also
    // hidden in the selection handler above). Toast so the operator
    // gets feedback if they reach this path via keyboard or programmatic
    // dispatch.
    if (state.historical) {
      showToast(
        'Margin notes are disabled while viewing a historical version — switch back to current to leave a mark.',
        true,
      );
      return;
    }
    // #188 — auto-unstow the marginalia drawer so the composer (which
    // lives inside it) is visible when the operator clicks Mark.
    unstowMarginalia?.();
    composerQuote.textContent = extractQuote(draftBody, pendingRange);
    textArea.value = '';
    categorySel.value = 'other';
    composer.hidden = false;
    // Anchor the composer next to the selection so the operator stays
    // in their reading context. Without this the composer renders at
    // the top of the marginalia column, which (when the column is
    // scrolled with the page) lands far above where the operator was
    // reading. Compute relative to the sidebar's page-coords so a
    // scroll between selection and Mark click doesn't desync.
    if (pendingRangePageTop !== null) {
      const sidebarPageTop = sidebar.getBoundingClientRect().top + window.scrollY;
      composer.style.position = 'absolute';
      composer.style.left = '0';
      composer.style.right = '0';
      composer.style.top = `${pendingRangePageTop - sidebarPageTop}px`;
      // The marginalia list (position: relative since #190) is a
      // later DOM sibling of the composer and so paints on top under
      // the default auto z-index. Without this lift, the list's
      // event hit-area covers the composer's Cancel/Submit buttons —
      // programmatic clicks worked, real mouse clicks routed to the
      // list. Lifting the composer above the list fixes that.
      composer.style.zIndex = '2';
    }
    composer.classList.add('er-marginalia-composer--entering');
    void composer.offsetWidth;
    composer.classList.remove('er-marginalia-composer--entering');
    addBtn.hidden = true;
    textArea.focus();
  }

  function closeComposer(): void {
    composer.hidden = true;
    composer.style.position = '';
    composer.style.top = '';
    composer.style.left = '';
    composer.style.right = '';
    composer.style.zIndex = '';
    pendingRange = null;
    pendingRangePageTop = null;
  }

  async function submitComment(): Promise<void> {
    if (!pendingRange) {
      closeComposer();
      return;
    }
    const text = textArea.value.trim();
    if (!text) {
      showToast('Comment text is required', true);
      return;
    }
    const anchor = extractQuote(draftBody, pendingRange);
    // Phase 34a: entry-keyed annotations reuse entryId as workflowId
    // for type compatibility; field retired in shortform-migration phase.
    const payload = {
      type: 'comment',
      workflowId: entryId,
      version: versionNum,
      range: pendingRange,
      text,
      category: categorySel.value,
      anchor,
    };
    try {
      const res = await fetch(annotateUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        const reason = (body as { error?: string }).error ?? `${res.status}`;
        showToast(`Annotate failed: ${reason}`, true);
        return;
      }
      const minted = (body as { annotation: CommentAnnotation }).annotation;
      wrapRange(draftBody, minted.range, minted.id);
      addSidebarItem(minted, 'current');
      closeComposer();
      showToast('Comment saved');
    } catch (e) {
      showToast(`Network error: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  }

  // ---- Loading ----

  async function loadAnnotations(): Promise<void> {
    try {
      const res = await fetch(annotationsUrl());
      if (!res.ok) return;
      const body: unknown = await res.json();
      if (typeof body !== 'object' || body === null) return;
      const all: AnyAnnotation[] = Array.isArray((body as { annotations?: unknown }).annotations)
        ? ((body as { annotations: AnyAnnotation[] }).annotations)
        : [];
      const comments = all.filter((a): a is CommentAnnotation => a.type === 'comment');
      const resolves = all.filter((a): a is ResolveAnnotation => a.type === 'resolve');
      const addresses = all.filter((a): a is AddressAnnotation => a.type === 'address');
      const resolvedIds = resolvedCommentIds(resolves);
      addressByCommentId.clear();
      for (const [id, ann] of latestAddressByCommentId(addresses)) {
        addressByCommentId.set(id, ann);
      }

      const current: CommentAnnotation[] = [];
      const rebased: { ann: CommentAnnotation; range: DraftRange }[] = [];
      const unanchored: CommentAnnotation[] = [];
      for (const a of comments) {
        if (resolvedIds.has(a.id)) {
          let status: AnnotationStatus = 'current';
          if (a.version !== versionNum) {
            status = rebaseAnchor(draftBody, a.anchor) ? 'rebased' : 'unresolved';
          }
          resolvedHistory.push({ ann: a, status });
          continue;
        }
        if (a.version === versionNum) {
          current.push(a);
          continue;
        }
        const rebasedRange = rebaseAnchor(draftBody, a.anchor);
        if (rebasedRange) rebased.push({ ann: a, range: rebasedRange });
        else unanchored.push(a);
      }
      rebased.sort((a, b) => b.ann.version - a.ann.version);
      unanchored.sort((a, b) => b.version - a.version);

      for (const a of current) {
        wrapRange(draftBody, a.range, a.id);
        addSidebarItem(a, 'current');
      }
      for (const r of rebased) {
        wrapRange(draftBody, r.range, r.ann.id);
        addSidebarItem(r.ann, 'rebased');
      }
      for (const a of unanchored) {
        addSidebarItem(a, 'unresolved');
      }
      updateResolvedFooter();
    } catch (e) {
      showToast(`Failed to load annotations: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  }

  // ---- Resolve / re-open ----

  async function resolveComment(annotation: CommentAnnotation, status: AnnotationStatus): Promise<void> {
    const ok = await editApi.postResolve(annotation.id, true);
    if (!ok) return;
    removeHighlight(draftBody, annotation.id);
    const item = sidebarIndex.get(annotation.id);
    if (item) item.remove();
    sidebarIndex.delete(annotation.id);
    resolvedHistory.push({ ann: annotation, status });
    updateResolvedFooter();
    maybeShowEmpty();
    showToast('Marked resolved');
  }

  async function reopenComment(annotation: CommentAnnotation, status: AnnotationStatus): Promise<void> {
    const ok = await editApi.postResolve(annotation.id, false);
    if (!ok) return;
    const idx = resolvedHistory.findIndex((r) => r.ann.id === annotation.id);
    if (idx >= 0) resolvedHistory.splice(idx, 1);
    if (status === 'rebased') {
      const r = rebaseAnchor(draftBody, annotation.anchor);
      if (r) wrapRange(draftBody, r, annotation.id);
    } else if (status === 'current') {
      wrapRange(draftBody, annotation.range, annotation.id);
    }
    addSidebarItem(annotation, status);
    updateResolvedFooter();
    showToast('Re-opened');
  }

  function updateResolvedFooter(): void {
    renderResolvedFooter({
      sidebar,
      draftBody,
      addressByCommentId,
      resolvedHistory,
      onReopen: (a, s) => { void reopenComment(a, s); },
    });
  }

  // ---- Selection -> Mark pencil ----

  document.addEventListener('selectionchange', () => {
    if (draftBody.classList.contains('hidden')) {
      addBtn.hidden = true;
      return;
    }
    // Phase 34a F1 remediation — never surface the Mark pencil in
    // historical mode. Margin notes anchor by character offsets into
    // the LIVE artifact body; an annotation authored against the
    // historical body would be silently re-anchored to wrong content
    // when the operator returns to the current view.
    if (state.historical) {
      addBtn.hidden = true;
      return;
    }
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      addBtn.hidden = true;
      return;
    }
    const range = sel.getRangeAt(0);
    if (!draftBody.contains(range.commonAncestorContainer)) {
      addBtn.hidden = true;
      return;
    }
    const offsets = computeOffsetFromRange(draftBody, range);
    if (!offsets) {
      addBtn.hidden = true;
      return;
    }
    const rect = range.getBoundingClientRect();
    addBtn.hidden = false;
    const parent = addBtn.offsetParent instanceof HTMLElement
      ? addBtn.offsetParent.getBoundingClientRect()
      : null;
    if (!parent) {
      addBtn.hidden = true;
      return;
    }
    const PENCIL_GAP = 14;
    addBtn.style.top = `${rect.top - parent.top - addBtn.offsetHeight - PENCIL_GAP}px`;
    addBtn.style.left = `${rect.left - parent.left + rect.width / 2}px`;
    pendingRange = offsets;
    pendingRangePageTop = rect.top + window.scrollY;
  });

  addBtn.addEventListener('click', openComposer);

  // Sidebar click → composer (same gesture as the legacy surface).
  sidebar.addEventListener('mousedown', (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    if (target?.closest('.er-marginalia-item')) return;
    if (target?.closest('[data-comment-composer]')) return;
    ev.preventDefault();
  });
  sidebar.addEventListener('click', (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    if (target?.closest('.er-marginalia-item')) return;
    if (target?.closest('[data-comment-composer]')) return;
    if (!pendingRange) {
      showToast('Select text in the draft first, then click here to mark it.');
      return;
    }
    openComposer();
  });

  // Composer submission affordances.
  document.querySelector<HTMLButtonElement>('[data-action="cancel-comment"]')
    ?.addEventListener('click', closeComposer);
  document.querySelector<HTMLButtonElement>('[data-action="submit-comment"]')
    ?.addEventListener('click', () => { void submitComment(); });
  composer.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault();
      void submitComment();
    }
  });

  // mark -> note cross-highlight (delegated on draftBody so newly-
  // rendered marks pick up the behavior automatically).
  draftBody.addEventListener('pointerover', (ev) => {
    const evTarget = ev.target instanceof Element ? ev.target : null;
    const target = evTarget?.closest<HTMLElement>('mark[data-annotation-id]') ?? null;
    if (!target) return;
    const id = target.dataset.annotationId;
    if (id) setActiveHighlight(id, true);
  });
  draftBody.addEventListener('pointerout', (ev) => {
    const evTarget = ev.target instanceof Element ? ev.target : null;
    const target = evTarget?.closest<HTMLElement>('mark[data-annotation-id]') ?? null;
    if (!target) return;
    const next = ev.relatedTarget instanceof Element ? ev.relatedTarget : null;
    if (next && target.contains(next)) return;
    const id = target.dataset.annotationId;
    if (id) setActiveHighlight(id, false);
  });

  function focusCommentByIndex(dir: 1 | -1): void {
    const items = Array.from(sidebarList.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    if (items.length === 0) return;
    commentFocusIndex = (commentFocusIndex + dir + items.length) % items.length;
    const target = items[commentFocusIndex];
    items.forEach((el) => el.classList.remove('active'));
    target.classList.add('active');
    const id = target.dataset.annotationId;
    if (id) {
      scrollToHighlight(id);
      setActiveHighlight(id, true);
      setTimeout(() => setActiveHighlight(id, false), 1800);
    }
  }

  return {
    closeComposer,
    isComposerOpen: () => !composer.hidden,
    loadAnnotations,
    focusCommentByIndex,
  };
}
