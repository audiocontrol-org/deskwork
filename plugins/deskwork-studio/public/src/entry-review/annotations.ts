/**
 * Margin-note authoring + load + render for the entry-keyed press-check
 * client (Phase 34a — T11).
 *
 * The composer markup + sidebar shell are server-rendered (see
 * `pages/entry-review/marginalia.ts`); this module wires the behavior:
 *
 *   - Selection in the article body → reveal the floating Mark pencil.
 *   - Mark click (or click in the sidebar) → open the in-margin
 *     composer with the selected quote pre-populated.
 *   - Composer submit → POST to `/api/dev/editorial-review/entry/<uuid>/annotate`,
 *     wrap the range in a `<mark>` element + add a sidebar item.
 *   - Boot → GET `/api/dev/editorial-review/entry/<uuid>/annotations`, render
 *     existing comments by status (current / rebased / unresolved /
 *     resolved).
 *   - Per-comment Resolve / Re-open round-trips through the same endpoint
 *     with `type: 'resolve'`.
 *
 * The `workflowId` field on every persisted annotation is set to the
 * entry UUID. The field is structurally required by `DraftAnnotation`
 * for type compatibility; entry-keyed clients reuse the entry UUID as
 * a unique identifier — this convention is documented at the call site
 * where the client constructs the annotation body.
 *
 * Sidebar markup is built by helpers in `sidebar-render.ts`; this
 * module owns the controller wiring + state.
 */

import {
  computeOffsetFromRange,
  extractQuote,
  rebaseAnchor,
  removeHighlight,
  wrapRange,
} from './range-utils.ts';
import {
  buildSidebarItem,
  buildResolvedItem,
} from './sidebar-render.ts';
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
  const { state, dom, showToast } = opts;
  const { draftBody, addBtn, composer, composerQuote, categorySel, textArea, sidebarList, sidebarEmpty, sidebar } = dom;
  const entryId = state.entryId;
  const versionNum = state.currentVersion ?? 1;
  const sidebarIndex = new Map<string, HTMLElement>();
  const resolvedHistory: { ann: CommentAnnotation; status: AnnotationStatus }[] = [];
  const addressByCommentId = new Map<string, AddressAnnotation>();
  let pendingRange: DraftRange | null = null;
  let commentFocusIndex = -1;

  const annotationsUrl = (): string =>
    `${ENTRY_API}/${encodeURIComponent(entryId)}/annotations`;
  const annotateUrl = (): string =>
    `${ENTRY_API}/${encodeURIComponent(entryId)}/annotate`;

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
    composerQuote.textContent = extractQuote(draftBody, pendingRange);
    textArea.value = '';
    categorySel.value = 'other';
    composer.hidden = false;
    composer.classList.add('er-marginalia-composer--entering');
    void composer.offsetWidth;
    composer.classList.remove('er-marginalia-composer--entering');
    addBtn.hidden = true;
    textArea.focus();
  }

  function closeComposer(): void {
    composer.hidden = true;
    pendingRange = null;
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

  function computeResolvedSet(all: ResolveAnnotation[]): Set<string> {
    const byCreatedAt = [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const map = new Map<string, boolean>();
    for (const r of byCreatedAt) map.set(r.commentId, r.resolved);
    const resolved = new Set<string>();
    for (const [commentId, isResolved] of map) {
      if (isResolved) resolved.add(commentId);
    }
    return resolved;
  }

  function computeLatestAddresses(all: AddressAnnotation[]): Map<string, AddressAnnotation> {
    const byCreatedAt = [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const map = new Map<string, AddressAnnotation>();
    for (const a of byCreatedAt) map.set(a.commentId, a);
    return map;
  }

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
      const resolvedIds = computeResolvedSet(resolves);
      addressByCommentId.clear();
      for (const [id, ann] of computeLatestAddresses(addresses)) {
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
      showToast(`Network error: ${e instanceof Error ? e.message : String(e)}`, true);
      return false;
    }
  }

  async function resolveComment(annotation: CommentAnnotation, status: AnnotationStatus): Promise<void> {
    const ok = await postResolve(annotation.id, true);
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
    const ok = await postResolve(annotation.id, false);
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
    let footer = sidebar.querySelector<HTMLElement>('[data-resolved-footer]');
    if (resolvedHistory.length === 0) {
      if (footer) footer.remove();
      return;
    }
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'er-marginalia-resolved';
      footer.dataset.resolvedFooter = '';
      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'er-marginalia-resolved-header';
      header.dataset.resolvedToggle = '';
      header.setAttribute('aria-expanded', 'false');
      const list = document.createElement('ol');
      list.className = 'er-marginalia-resolved-list';
      list.dataset.resolvedList = '';
      list.hidden = true;
      footer.appendChild(header);
      footer.appendChild(list);
      sidebar.appendChild(footer);
      header.addEventListener('click', () => {
        const open = list.hidden;
        list.hidden = !open;
        header.setAttribute('aria-expanded', String(open));
      });
    }
    const headerBtn = footer.querySelector<HTMLButtonElement>('[data-resolved-toggle]');
    const list = footer.querySelector<HTMLElement>('[data-resolved-list]');
    if (!headerBtn || !list) return;
    headerBtn.textContent = `Resolved (${resolvedHistory.length}) ▾`;
    list.innerHTML = '';
    for (const { ann, status } of resolvedHistory) {
      list.appendChild(buildResolvedItem(ann, status, {
        draftBody,
        addressByCommentId,
        onReopen: (a, s) => { void reopenComment(a, s); },
      }));
    }
  }

  // ---- Selection -> Mark pencil ----

  document.addEventListener('selectionchange', () => {
    if (draftBody.classList.contains('hidden')) {
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
