/**
 * Client-side annotation UI for the editorial-review dev route.
 *
 * Range semantics: comment ranges are character offsets against the rendered
 * plain text of the current version's draft body (innerText of #draft-body).
 * A raw-markdown offset scheme would require a source-map from remark/rehype
 * that hasn't been plumbed through; plain-text offsets are pragmatic for a
 * dev tool and let us persist highlights across reloads via a text-walker.
 *
 * Both dev routes (audiocontrol and editorialcontrol) bundle this module via
 * a non-inline <script> tag; Astro/Vite dedupe it across entry points.
 */

interface DraftRange {
  start: number;
  end: number;
}

interface DraftVersion {
  version: number;
  markdown: string;
  createdAt: string;
  originatedBy: 'agent' | 'operator';
}

interface DraftWorkflow {
  id: string;
  site: string;
  slug: string;
  state: string;
  currentVersion: number;
  contentKind: 'longform' | 'shortform' | 'outline';
}

interface CommentAnnotation {
  id: string;
  type: 'comment';
  workflowId: string;
  version: number;
  range: DraftRange;
  text: string;
  category?: string;
  createdAt: string;
  /** Quote text captured at comment time against the original version. */
  anchor?: string;
}

interface ResolveAnnotation {
  id: string;
  type: 'resolve';
  workflowId: string;
  commentId: string;
  resolved: boolean;
  createdAt: string;
}

/**
 * Agent-written per-iteration disposition. The sidebar reads the
 * most recent address annotation per comment and stamps it with
 * "Addressed in v{N}" / "Deferred in v{N}" / "Won't fix (v{N})"
 * so the operator can see which comments the latest iterate touched.
 */
interface AddressAnnotation {
  id: string;
  type: 'address';
  workflowId: string;
  commentId: string;
  version: number;
  disposition: 'addressed' | 'deferred' | 'wontfix';
  reason?: string;
  createdAt: string;
}

/**
 * Classification applied to every comment annotation when the page
 * renders. Determines how the comment shows up in the UI:
 *   - `current`: anchor belongs to the version being viewed; render
 *     body highlight + sidebar item like before.
 *   - `rebased`: anchor appears exactly once in the current body
 *     text; compute a new range against current text and render the
 *     highlight + a "from v{N}" pill in the sidebar.
 *   - `unresolved`: anchor is missing, absent from the current body,
 *     or appears more than once (ambiguous). Sidebar-only; no body
 *     highlight; labeled "from v{N} · unresolved" so the operator
 *     sees the comment and can re-anchor manually if they want.
 */
type AnnotationStatus = 'current' | 'rebased' | 'unresolved';

interface DraftState {
  workflow: DraftWorkflow;
  currentVersion: DraftVersion;
  versions: DraftVersion[];
}

function q<T extends Element = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`editorial-review: missing required element ${selector}`);
  return el;
}

function qn<T extends Element = HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

export function initEditorialReview(): void {
  const stateEl = document.getElementById('draft-state');
  if (!stateEl) return;

  const state = JSON.parse(stateEl.textContent || '{}') as DraftState;
  const workflowId = state.workflow.id;
  const versionNum = state.currentVersion.version;

  const draftBody = q<HTMLElement>('#draft-body');
  const draftEdit = q<HTMLTextAreaElement>('#draft-edit');
  const editToolbar = q<HTMLElement>('[data-edit-toolbar]');
  const editHint = q<HTMLElement>('[data-edit-hint]');
  const addBtn = q<HTMLButtonElement>('[data-add-comment-btn]');
  const composer = q<HTMLElement>('[data-comment-composer]');
  const composerQuote = q<HTMLElement>('[data-composer-quote]');
  const categorySel = q<HTMLSelectElement>('[data-comment-category]');
  const textArea = q<HTMLTextAreaElement>('[data-comment-text]');
  const sidebarList = q<HTMLElement>('[data-sidebar-list]');
  const sidebarEmpty = q<HTMLElement>('[data-sidebar-empty]');
  const toastEl = q<HTMLElement>('[data-toast]');

  let pendingRange: DraftRange | null = null;
  const sidebarIndex = new Map<string, HTMLElement>();

  function showToast(msg: string, isError = false): void {
    toastEl.textContent = msg;
    toastEl.classList.toggle('error', isError);
    toastEl.hidden = false;
    setTimeout(() => { toastEl.hidden = true; }, 4000);
  }

  // ---- Range utilities (plain-text offsets over draftBody) ----

  function computeOffsetFromRange(range: Range): DraftRange | null {
    const root = draftBody;
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    let start = -1;
    let end = -1;
    let acc = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const len = node.nodeValue?.length ?? 0;
      if (node === range.startContainer) start = acc + range.startOffset;
      if (node === range.endContainer) { end = acc + range.endOffset; break; }
      acc += len;
      node = walker.nextNode();
    }
    if (start < 0 || end < 0 || end <= start) return null;
    return { start, end };
  }

  function wrapRange(offsets: DraftRange, annotationId: string): void {
    const walker = document.createTreeWalker(draftBody, NodeFilter.SHOW_TEXT);
    const segments: { node: Text; localStart: number; localEnd: number }[] = [];
    let acc = 0;
    let node = walker.nextNode() as Text | null;
    while (node) {
      const nodeStart = acc;
      const nodeEnd = acc + (node.nodeValue?.length ?? 0);
      const segStart = Math.max(offsets.start, nodeStart);
      const segEnd = Math.min(offsets.end, nodeEnd);
      if (segEnd > segStart) {
        segments.push({ node, localStart: segStart - nodeStart, localEnd: segEnd - nodeStart });
      }
      acc = nodeEnd;
      node = walker.nextNode() as Text | null;
    }
    // Wrap in reverse so earlier splits don't invalidate later indices.
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (!seg) continue;
      const { node, localStart, localEnd } = seg;
      const value = node.nodeValue ?? '';
      const before = value.slice(0, localStart);
      const middle = value.slice(localStart, localEnd);
      const after = value.slice(localEnd);
      const mark = document.createElement('mark');
      mark.className = 'draft-comment-highlight';
      mark.dataset.annotationId = annotationId;
      mark.textContent = middle;
      const parent = node.parentNode;
      if (!parent) continue;
      if (after) parent.insertBefore(document.createTextNode(after), node.nextSibling);
      parent.insertBefore(mark, node.nextSibling);
      if (before) {
        node.nodeValue = before;
      } else {
        parent.removeChild(node);
      }
    }
  }

  /**
   * Concatenate the raw text-node values of draftBody in the same
   * order `computeOffsetFromRange` and `wrapRange` walk them.
   *
   * Don't use `draftBody.innerText` here — innerText collapses
   * source whitespace (newlines and indentation between block
   * elements) the way CSS renders it, but the stored ranges are
   * indexed against the raw concatenation of text-node values. The
   * two coordinate spaces differ by a few chars whenever the
   * markdown renderer produces multi-char whitespace between blocks,
   * which truncates the quote's leading characters.
   */
  function draftPlainText(): string {
    const walker = document.createTreeWalker(draftBody, NodeFilter.SHOW_TEXT);
    let text = '';
    let node = walker.nextNode();
    while (node) {
      text += node.nodeValue ?? '';
      node = walker.nextNode();
    }
    return text;
  }

  function extractQuote(offsets: DraftRange): string {
    return draftPlainText().slice(offsets.start, offsets.end);
  }

  // ---- Sidebar rendering ----

  function addSidebarItem(annotation: CommentAnnotation, status: AnnotationStatus): void {
    sidebarEmpty.hidden = true;
    const li = document.createElement('li');
    li.className = `er-marginalia-item er-marginalia-item--${status}`;
    li.dataset.annotationId = annotation.id;
    li.dataset.status = status;

    const cat = document.createElement('div');
    cat.className = 'cat';
    // Prefix the status for non-current items so the sidebar makes
    // it unambiguous where the comment came from.
    if (status === 'rebased') {
      cat.textContent = `from v${annotation.version} · ${annotation.category || 'other'}`;
    } else if (status === 'unresolved') {
      cat.textContent = `from v${annotation.version} · unresolved`;
    } else {
      cat.textContent = annotation.category || 'other';
    }

    const quote = document.createElement('div');
    quote.className = 'quote';
    // The stored anchor IS the selected text captured at mark time —
    // authoritative regardless of status. Offsets into the text
    // stream are a locator, not the source of truth; they drift with
    // any edit. Only fall back to the range-slice for legacy
    // annotations that predate anchor capture.
    if (annotation.anchor) {
      quote.textContent = annotation.anchor;
    } else if (status === 'current') {
      quote.textContent = extractQuote(annotation.range);
    } else {
      quote.textContent = '(legacy comment — no anchor captured)';
    }

    const text = document.createElement('p');
    text.className = 'note';
    text.textContent = annotation.text;

    li.appendChild(cat);
    li.appendChild(quote);
    // Agent's per-iteration stamp, if any. Sits between the quote
    // and the note — visually close to the comment body so the
    // operator can read "[addressed in v4]" alongside the comment
    // itself rather than as a detached metadata chip.
    const stamp = buildAddressStamp(annotation.id);
    if (stamp) li.appendChild(stamp);
    li.appendChild(text);

    // Every live item gets a Resolve affordance, including unresolved
    // (anchor-missing) prior-version comments — resolving them is how
    // the operator says "the edit already handled this."
    const actions = document.createElement('div');
    actions.className = 'er-marginalia-actions';
    const resolveBtn = document.createElement('button');
    resolveBtn.type = 'button';
    resolveBtn.className = 'er-marginalia-action';
    resolveBtn.textContent = 'Resolve';
    resolveBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      void resolveComment(annotation, status);
    });
    actions.appendChild(resolveBtn);
    li.appendChild(actions);

    if (status !== 'unresolved') {
      li.addEventListener('mouseenter', () => setActiveHighlight(annotation.id, true));
      li.addEventListener('mouseleave', () => setActiveHighlight(annotation.id, false));
      li.addEventListener('click', () => scrollToHighlight(annotation.id));
    }

    sidebarList.appendChild(li);
    sidebarIndex.set(annotation.id, li);
  }

  function scrollToHighlight(annotationId: string): void {
    const mark = draftBody.querySelector<HTMLElement>(
      `mark[data-annotation-id="${annotationId}"]`,
    );
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function setActiveHighlight(annotationId: string, active: boolean): void {
    const marks = draftBody.querySelectorAll<HTMLElement>(
      `mark[data-annotation-id="${annotationId}"]`,
    );
    marks.forEach(m => m.classList.toggle('active', active));
    const item = sidebarIndex.get(annotationId);
    if (item) item.classList.toggle('active', active);
  }

  // ---- Selection -> Add button ----

  document.addEventListener('selectionchange', () => {
    if (draftBody.classList.contains('hidden')) { addBtn.hidden = true; return; }
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { addBtn.hidden = true; return; }
    const range = sel.getRangeAt(0);
    if (!draftBody.contains(range.commonAncestorContainer)) { addBtn.hidden = true; return; }
    const offsets = computeOffsetFromRange(range);
    if (!offsets) { addBtn.hidden = true; return; }
    const rect = range.getBoundingClientRect();
    // The pencil uses `position: absolute`, so `top/left` are relative
    // to the nearest positioned ancestor (the .er-review-shell div).
    // Subtract that ancestor's viewport position from the selection's
    // viewport rect to get the correct offset. Horizontal centering is
    // handled in CSS with `translateX(-50%)` so we don't need to know
    // the pencil's rendered width here.
    // Un-hide FIRST so offsetParent + offsetHeight are measurable.
    addBtn.hidden = false;
    const parent = addBtn.offsetParent instanceof HTMLElement ? addBtn.offsetParent.getBoundingClientRect() : null;
    if (!parent) { addBtn.hidden = true; return; }
    // The pencil uses `position: absolute`, so `top/left` are relative
    // to the nearest positioned ancestor (the .er-review-shell div).
    // Subtract that ancestor's viewport position from the selection's
    // viewport rect to get the correct offset. Horizontal centering
    // is handled in CSS with `translateX(-50%)` so we don't need to
    // know the pencil's rendered width here.
    const PENCIL_GAP = 14; // breathing room (triangle tip + a few px)
    addBtn.style.top = `${rect.top - parent.top - addBtn.offsetHeight - PENCIL_GAP}px`;
    addBtn.style.left = `${rect.left - parent.left + rect.width / 2}px`;
    pendingRange = offsets;
  });

  /**
   * Reveal the in-margin composer at the top of the margin-rail
   * with the selected quote pre-populated. No modal — the composer
   * lives inside the same sidebar that hosts saved marks, so the
   * reading frame never gets pulled out from under the operator.
   */
  function openComposer(): void {
    if (!pendingRange) return;
    composerQuote.textContent = extractQuote(pendingRange);
    textArea.value = '';
    categorySel.value = 'other';
    composer.hidden = false;
    composer.classList.add('er-marginalia-composer--entering');
    // Next frame, strip the entering class so the CSS transition
    // runs. Reading the offsetWidth forces a layout flush which is
    // enough to separate the two class changes into distinct frames.
    void composer.offsetWidth;
    composer.classList.remove('er-marginalia-composer--entering');
    addBtn.hidden = true;
    textArea.focus();
  }

  addBtn.addEventListener('click', openComposer);

  // Operator-friendly second entry: click anywhere in the margin-notes
  // sidebar (but not on an existing note, which has its own scroll-to
  // behavior, and not on the composer itself) to open the composer
  // for the current selection. This honors the natural "I selected
  // text → now I click the margin" instinct that the floating pencil
  // alone doesn't satisfy.
  const sidebar = q<HTMLElement>('[data-comments-sidebar]');
  sidebar.addEventListener('mousedown', (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    // Clicks on an existing note: let that handler run (scroll to highlight).
    if (target?.closest('.er-marginalia-item')) return;
    // Clicks inside the composer: let normal form input behavior run.
    if (target?.closest('[data-comment-composer]')) return;
    // Preserve the selection the browser is about to clear on mouseup.
    // selectionchange already stashed `pendingRange`; just suppress the
    // default mousedown so the selection survives into click.
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

  // ---- Composer submission ----

  q('[data-action="cancel-comment"]').addEventListener('click', closeComposer);
  q('[data-action="submit-comment"]').addEventListener('click', submitComment);
  // Cmd/Ctrl+Enter submits from anywhere inside the composer.
  composer.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submitComment();
    }
  });

  function closeComposer(): void {
    composer.hidden = true;
    pendingRange = null;
  }

  async function submitComment(): Promise<void> {
    if (!pendingRange) { closeComposer(); return; }
    const text = textArea.value.trim();
    if (!text) { showToast('Comment text is required', true); return; }
    // Capture the selected text at comment time so later versions
    // can try to re-locate the anchor by content. This is the
    // difference between "margin notes vanish after an edit" and
    // "margin notes survive edits, possibly with a re-anchor hint."
    const anchor = extractQuote(pendingRange);
    const payload = {
      type: 'comment',
      workflowId,
      version: versionNum,
      range: pendingRange,
      text,
      category: categorySel.value,
      anchor,
    };
    try {
      const res = await fetch('/api/dev/editorial-review/annotate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) { showToast(`Annotate failed: ${body.error || res.status}`, true); return; }
      wrapRange(body.annotation.range, body.annotation.id);
      addSidebarItem(body.annotation, 'current');
      closeComposer();
      showToast('Comment saved');
    } catch (e) {
      showToast(`Network error: ${(e as Error).message}`, true);
    }
  }

  // ---- Load existing annotations ----

  /**
   * Try to re-locate a prior-version anchor in the current body.
   * Returns a current-body range if the anchor appears exactly
   * once, null otherwise. Missing anchors (legacy annotations)
   * also return null — those fall through to "unresolved" in the
   * caller.
   */
  function rebaseAnchor(anchor: string | undefined): DraftRange | null {
    if (!anchor || anchor.length === 0) return null;
    const text = draftPlainText();
    const first = text.indexOf(anchor);
    if (first < 0) return null;
    const next = text.indexOf(anchor, first + 1);
    if (next >= 0) return null; // ambiguous — refuse to guess.
    return { start: first, end: first + anchor.length };
  }

  /**
   * Walk the resolve annotations for this workflow and compute
   * which comments are currently resolved. Resolves are append-only
   * events; the latest event for a given commentId wins. This lets
   * Resolve/Reopen both persist through the same journal shape
   * without mutating past records.
   */
  function computeResolvedSet(all: ResolveAnnotation[]): Set<string> {
    const byCreatedAt = [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const state = new Map<string, boolean>();
    for (const r of byCreatedAt) state.set(r.commentId, r.resolved);
    const resolved = new Set<string>();
    for (const [commentId, isResolved] of state) {
      if (isResolved) resolved.add(commentId);
    }
    return resolved;
  }

  /** Resolved comments kept in memory so the "Show resolved" toggle
   * can render them without a re-fetch. */
  const resolvedHistory: { ann: CommentAnnotation; status: AnnotationStatus }[] = [];

  /**
   * Most recent address annotation per commentId. Populated on
   * `loadAnnotations` and consulted by `addSidebarItem` /
   * `renderResolvedItem` to decorate each comment with its
   * per-version disposition badge. Latest-wins by `createdAt`.
   */
  const addressByCommentId = new Map<string, AddressAnnotation>();

  function computeLatestAddresses(all: AddressAnnotation[]): Map<string, AddressAnnotation> {
    const byCreatedAt = [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const map = new Map<string, AddressAnnotation>();
    for (const a of byCreatedAt) map.set(a.commentId, a);
    return map;
  }

  async function loadAnnotations(): Promise<void> {
    try {
      // Omit `version` — the server returns every annotation for the
      // workflow. The client decides per-annotation how to display
      // it based on whether it belongs to the current version, can
      // be rebased, or is unresolved.
      const url = `/api/dev/editorial-review/annotations?workflowId=${encodeURIComponent(workflowId)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const body = await res.json();
      const all: Array<CommentAnnotation | ResolveAnnotation | AddressAnnotation> =
        body.annotations || [];
      const comments = all.filter((a): a is CommentAnnotation => a.type === 'comment');
      const resolves = all.filter((a): a is ResolveAnnotation => a.type === 'resolve');
      const addresses = all.filter((a): a is AddressAnnotation => a.type === 'address');
      const resolvedIds = computeResolvedSet(resolves);
      // Latest-wins address map, consulted by render helpers below.
      addressByCommentId.clear();
      for (const [id, ann] of computeLatestAddresses(addresses)) {
        addressByCommentId.set(id, ann);
      }

      // Stable render order: current-version first, then rebased
      // (by original version desc), then unresolved (by original
      // version desc). Keeps the natural reading focus on the
      // version actually under review.
      const current: CommentAnnotation[] = [];
      const rebased: { ann: CommentAnnotation; range: DraftRange }[] = [];
      const unanchored: CommentAnnotation[] = [];
      for (const a of comments) {
        if (resolvedIds.has(a.id)) {
          // Resolved — keep in history so the toggle can resurface
          // them, but don't render in the live stream.
          let status: AnnotationStatus = 'current';
          if (a.version !== versionNum) {
            status = rebaseAnchor(a.anchor) ? 'rebased' : 'unresolved';
          }
          resolvedHistory.push({ ann: a, status });
          continue;
        }
        if (a.version === versionNum) {
          current.push(a);
          continue;
        }
        const rebasedRange = rebaseAnchor(a.anchor);
        if (rebasedRange) rebased.push({ ann: a, range: rebasedRange });
        else unanchored.push(a);
      }
      rebased.sort((a, b) => b.ann.version - a.ann.version);
      unanchored.sort((a, b) => b.version - a.version);

      for (const a of current) {
        wrapRange(a.range, a.id);
        addSidebarItem(a, 'current');
      }
      for (const r of rebased) {
        wrapRange(r.range, r.ann.id);
        addSidebarItem(r.ann, 'rebased');
      }
      for (const a of unanchored) {
        // No body highlight; sidebar-only.
        addSidebarItem(a, 'unresolved');
      }
      updateResolvedFooter();
    } catch (e) {
      showToast(`Failed to load annotations: ${(e as Error).message}`, true);
    }
  }

  // ---- Resolve / re-open ----

  async function postResolve(commentId: string, resolved: boolean): Promise<boolean> {
    try {
      const res = await fetch('/api/dev/editorial-review/annotate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'resolve', workflowId, commentId, resolved }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(`Resolve failed: ${body.error || res.status}`, true);
        return false;
      }
      return true;
    } catch (e) {
      showToast(`Network error: ${(e as Error).message}`, true);
      return false;
    }
  }

  async function resolveComment(annotation: CommentAnnotation, status: AnnotationStatus): Promise<void> {
    const ok = await postResolve(annotation.id, true);
    if (!ok) return;
    // Remove highlight + sidebar item; stash in resolvedHistory.
    removeHighlight(annotation.id);
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
    // Pop from history, render back into the live list.
    const idx = resolvedHistory.findIndex(r => r.ann.id === annotation.id);
    if (idx >= 0) resolvedHistory.splice(idx, 1);
    if (status === 'rebased') {
      const r = rebaseAnchor(annotation.anchor);
      if (r) wrapRange(r, annotation.id);
    } else if (status === 'current') {
      wrapRange(annotation.range, annotation.id);
    }
    addSidebarItem(annotation, status);
    updateResolvedFooter();
    showToast('Re-opened');
  }

  function removeHighlight(annotationId: string): void {
    draftBody
      .querySelectorAll<HTMLElement>(`mark[data-annotation-id="${annotationId}"]`)
      .forEach(m => {
        const parent = m.parentNode;
        if (!parent) return;
        // Replace the mark with a plain text node so the draft body
        // reads cleanly after resolve. Adjacent text nodes will be
        // merged on the next re-render; fine for dev.
        parent.replaceChild(document.createTextNode(m.textContent ?? ''), m);
      });
  }

  function maybeShowEmpty(): void {
    const anyLive = sidebarList.querySelector('.er-marginalia-item');
    sidebarEmpty.hidden = !!anyLive;
  }

  /** The collapsible "Resolved" footer at the bottom of the sidebar. */
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
      list.appendChild(renderResolvedItem(ann, status));
    }
  }

  function renderResolvedItem(ann: CommentAnnotation, status: AnnotationStatus): HTMLElement {
    const li = document.createElement('li');
    li.className = 'er-marginalia-item er-marginalia-item--resolved';
    li.dataset.annotationId = ann.id;

    const cat = document.createElement('div');
    cat.className = 'cat';
    const origin = status === 'current' ? `v${ann.version}` : `from v${ann.version}`;
    cat.textContent = `${origin} · ${ann.category || 'other'} · resolved`;

    const quote = document.createElement('div');
    quote.className = 'quote';
    quote.textContent = ann.anchor
      ? ann.anchor
      : status === 'unresolved'
        ? '(legacy — no anchor captured)'
        : extractQuote(ann.range);

    const text = document.createElement('p');
    text.className = 'note';
    text.textContent = ann.text;

    const stamp = buildAddressStamp(ann.id);

    const actions = document.createElement('div');
    actions.className = 'er-marginalia-actions';
    const reopenBtn = document.createElement('button');
    reopenBtn.type = 'button';
    reopenBtn.className = 'er-marginalia-action';
    reopenBtn.textContent = 'Re-open';
    reopenBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      void reopenComment(ann, status);
    });
    actions.appendChild(reopenBtn);

    li.appendChild(cat);
    li.appendChild(quote);
    if (stamp) li.appendChild(stamp);
    li.appendChild(text);
    li.appendChild(actions);
    return li;
  }

  /**
   * Render a copy-editor-style stamp for a comment: "[addressed in v4]"
   * / "[deferred in v4]" / "[won't fix · v4]". Returns null if no
   * address annotation has been written for this comment yet. The
   * stamp includes an optional reason line (the agent's one-sentence
   * explanation) on hover / below the label so the operator can read
   * why something was deferred or rejected.
   */
  function buildAddressStamp(commentId: string): HTMLElement | null {
    const addr = addressByCommentId.get(commentId);
    if (!addr) return null;
    const stamp = document.createElement('div');
    stamp.className = `er-marginalia-stamp er-marginalia-stamp--${addr.disposition}`;
    stamp.dataset.disposition = addr.disposition;

    // Glyph keyed to disposition: filled diamond echoes the
    // editorialcontrol tagline ◆, so "addressed" feels native;
    // hollow ◇ for "deferred" reads as "still open"; ✕ for
    // "won't fix" is final.
    const mark = document.createElement('span');
    mark.className = 'er-marginalia-stamp-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent =
      addr.disposition === 'addressed' ? '◆' :
      addr.disposition === 'deferred' ? '◇' :
      '✕';

    const label = document.createElement('span');
    label.className = 'er-marginalia-stamp-label';
    label.textContent =
      addr.disposition === 'addressed' ? `addressed in v${addr.version}` :
      addr.disposition === 'deferred' ? `deferred in v${addr.version}` :
      `won't fix · v${addr.version}`;

    stamp.appendChild(mark);
    stamp.appendChild(label);

    if (addr.reason) {
      const reason = document.createElement('span');
      reason.className = 'er-marginalia-stamp-reason';
      reason.textContent = addr.reason;
      stamp.appendChild(reason);
    }

    return stamp;
  }

  // ---- Edit mode ----

  const toggleBtn = q<HTMLButtonElement>('[data-action="toggle-edit"]');
  const cancelEditBtn = q<HTMLButtonElement>('[data-action="cancel-edit"]');
  const saveVersionBtn = q<HTMLButtonElement>('[data-action="save-version"]');
  const editSourceHost = q<HTMLElement>('[data-edit-source]');
  const editPreviewHost = q<HTMLElement>('[data-edit-preview]');
  const editPanes = q<HTMLElement>('[data-edit-panes]');
  const editModeBtns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-edit-view]'),
  );
  let editing = false;
  let editorHandle: import('./editorial-review-editor').EditorHandle | null = null;
  let previewDebounce: number | null = null;

  /**
   * Wire heading-anchored scroll sync between the editor and the
   * preview pane, one-way (editor → preview). Only active in split
   * view; in source/preview-only views it's irrelevant.
   *
   * Algorithm:
   *   1. Editor scroll fires (rAF-debounced).
   *   2. Read the topmost visible line in the editor via CodeMirror's
   *      `posAtCoords` on the scroll container's top edge.
   *   3. Walk backward in the source to find the last `## ` heading
   *      at or above that line. That heading is what the operator is
   *      currently reading, from a reader's POV.
   *   4. In the preview DOM, find the matching <h2> by textContent
   *      and scroll it to the top of the preview pane.
   *
   * A suppress flag prevents any incidental scroll event on the preview
   * from ping-ponging back (reserved for future bi-directional sync).
   */
  let scrollSyncSuppress = false;
  let scrollSyncRaf = 0;
  function wireScrollSync(): void {
    if (!editorHandle) return;
    const scrollDOM = editorHandle.view.scrollDOM;
    scrollDOM.addEventListener('scroll', () => {
      if (scrollSyncSuppress) return;
      if (editPanes.dataset.view !== 'split') return;
      if (scrollSyncRaf) return;
      scrollSyncRaf = requestAnimationFrame(() => {
        scrollSyncRaf = 0;
        syncPreviewFromEditor();
      });
    }, { passive: true });
  }

  /** Find the heading the operator is currently reading in the editor
   * and scroll the preview to the matching <h2>. */
  function syncPreviewFromEditor(): void {
    if (!editorHandle) return;
    const view = editorHandle.view;
    const scrollRect = view.scrollDOM.getBoundingClientRect();
    // Bail if the scroll container has no layout yet — happens in a
    // narrow window where the split view is transitioning in.
    // posAtCoords can return stale positions (typically 0) in that
    // state, which would snap the preview back to the top.
    if (scrollRect.height === 0) return;
    // Pick a point a few px below the top edge to avoid landing on a
    // partially-scrolled line.
    const pos = view.posAtCoords({ x: scrollRect.left + 8, y: scrollRect.top + 4 });
    if (pos == null) return;
    const lineInfo = view.state.doc.lineAt(pos);
    const source = view.state.doc.toString();
    const lines = source.split('\n');
    const topLineIdx = lineInfo.number - 1;
    // Walk back through the source to find the last ## heading.
    // Capture the heading text so we can match on the preview side.
    let headingText: string | null = null;
    for (let i = Math.min(topLineIdx, lines.length - 1); i >= 0; i--) {
      const m = lines[i].match(/^##[ \t]+(.+?)\s*$/);
      if (m) { headingText = m[1].trim(); break; }
    }
    // Find matching h2 in preview and scroll to it. If no heading is
    // found (we're above the first one), scroll preview to the top.
    if (!headingText) {
      scrollSyncSuppress = true;
      editPreviewHost.scrollTop = 0;
      requestAnimationFrame(() => { scrollSyncSuppress = false; });
      return;
    }
    const h2s = editPreviewHost.querySelectorAll<HTMLElement>('h2');
    for (const h of h2s) {
      if ((h.textContent || '').trim() === headingText) {
        scrollSyncSuppress = true;
        // offsetTop is relative to the nearest positioned ancestor,
        // which is the preview host. Small nudge so the heading sits
        // below the pane's top padding rather than flush against it.
        editPreviewHost.scrollTop = Math.max(0, h.offsetTop - 8);
        requestAnimationFrame(() => { scrollSyncSuppress = false; });
        return;
      }
    }
  }

  /** Debounced render of the current source into the preview pane.
   *
   * The preview mirrors what a reader will see on `/blog/<slug>/`,
   * which uses the remark-strip-outline plugin to drop the `## Outline`
   * section (planning scaffold, not editorial copy). We strip the
   * same section here before rendering so the dev preview matches
   * the production render — no outline in the preview pane even
   * when the caller passes the rejoined document.
   *
   * EXCEPTION: outline-stage workflows. The outline IS the article
   * during outline review. Skip the strip so the preview shows what
   * the operator is actually editing. */
  function schedulePreview(md: string): void {
    if (previewDebounce !== null) window.clearTimeout(previewDebounce);
    previewDebounce = window.setTimeout(async () => {
      try {
        const [{ renderMarkdownToHtml, parseDraftFrontmatter }, { splitOutline }] = await Promise.all([
          import('../../scripts/lib/editorial-review/render.js'),
          import('./outline-split.ts'),
        ]);
        const parsed = parseDraftFrontmatter(md);
        const isOutlineKind = state.workflow.contentKind === 'outline';
        const bodyForPreview = isOutlineKind
          ? parsed.body
          : splitOutline(parsed.body).body;
        const html = await renderMarkdownToHtml(bodyForPreview);
        editPreviewHost.innerHTML = html;
      } catch (e) {
        editPreviewHost.innerHTML = `<p class="er-edit-preview-error">Preview failed: ${(e as Error).message}</p>`;
      }
    }, 120);
  }

  /** Flip the three-way Source / Split / Preview toggle. */
  function setEditView(view: 'source' | 'split' | 'preview'): void {
    editPanes.dataset.view = view;
    for (const btn of editModeBtns) {
      btn.setAttribute('aria-pressed', String(btn.dataset.editView === view));
    }
    // If the split / preview pane just became visible with stale
    // content, refresh it synchronously so the operator never sees
    // an empty pane.
    if (view !== 'source' && editorHandle) {
      schedulePreview(editorHandle.getValue());
    }
  }

  for (const btn of editModeBtns) {
    btn.addEventListener('click', () => {
      const v = btn.dataset.editView as 'source' | 'split' | 'preview';
      setEditView(v);
    });
  }

  // Outline stashed at enterEdit time so we can rejoin it on save.
  // The editor view shows body only — the outline is a reference
  // surface in the drawer, not editable content.
  let stashedOutline = '';

  /**
   * Options for `enterEdit`. `cursorHint` is a short plain-text
   * snippet captured from the rendered body at the operator's
   * click position. When present, enterEdit tries to locate the
   * snippet in the source markdown and place the cursor there —
   * so double-clicking a word in the rendered prose lands the
   * editor's cursor at that word, not at position 0.
   */
  interface EnterEditOptions {
    cursorHint?: string;
  }

  async function enterEdit(opts: EnterEditOptions = {}): Promise<void> {
    // Load both splitOutline AND joinOutline up front so the onChange
    // handler can rebuild the full document synchronously on every
    // keystroke — no race with a pending dynamic import.
    const outlineMod = await import('./outline-split.ts');
    joinOutlineFn = outlineMod.joinOutline;
    const sourceMarkdown = state.currentVersion.markdown;
    // Outline-stage workflows: the outline IS the article. Don't
    // stash anything — feed the full source to the editor so the
    // operator can edit/annotate the outline directly. joinOutline
    // with an empty stash is a no-op, so the save flow downstream
    // is unchanged.
    const isOutlineKind = state.workflow.contentKind === 'outline';
    const split = isOutlineKind
      ? { outline: '', body: sourceMarkdown, present: false, startLine: -1, endLine: -1 }
      : outlineMod.splitOutline(sourceMarkdown);
    stashedOutline = split.outline;

    draftEdit.value = sourceMarkdown;
    editToolbar.hidden = false;
    draftBody.classList.add('hidden');
    toggleBtn.textContent = 'View';
    editing = true;
    // Lazy-import the editor module so the CodeMirror bundle only
    // loads when the operator actually enters edit mode.
    const { mountEditor } = await import('./editorial-review-editor.ts');
    if (editorHandle) editorHandle.destroy();
    editSourceHost.innerHTML = '';
    editorHandle = mountEditor({
      host: editSourceHost,
      // Feed the editor only the body — outline stays stowed.
      doc: split.body,
      onChange: (bodyMd) => {
        // Backing textarea holds the FULL document (outline rejoined)
        // so the save pipeline doesn't need to know anything about
        // the split.
        draftEdit.value = stashedOutline
          ? joinOutlineIfPossible(stashedOutline, bodyMd)
          : bodyMd;
        updateSaveState();
        if (editPanes.dataset.view !== 'source') schedulePreview(draftEdit.value);
      },
      onSave: () => { saveVersionBtn.click(); },
      onCancel: () => {
        // In focus mode, Esc peels focus off but leaves the edit
        // session alive. In regular edit mode, Esc cancels the edit.
        if (document.body.classList.contains('er-focus-mode')) {
          exitFocus();
        } else {
          cancelEditBtn.click();
        }
      },
    });
    updateSaveState();
    // Default view is split — shows what the source will look like
    // as you type. Operators who want focus switch to Source or Preview.
    setEditView('split');
    // The outline drawer is rendered server-side on page load and
    // lives as a sibling of the edit mode (not inside it), so it's
    // already available. Nothing to do here — the operator can open
    // it via the bookmark tab, the Outline ↗ button, or the O key.
    editToolbar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    editorHandle.focus();
    schedulePreview(state.currentVersion.markdown);
    // Wire editor-scroll → preview-scroll sync. Proportional sync
    // breaks badly here: the editor shows the full source (frontmatter
    // + body) while the preview shows only the rendered body, so top-
    // percentage mapping drifts. Heading-anchored sync works because
    // every `## N Title` heading in source has a matching <h2>Title</h2>
    // in the preview DOM — we find the last heading at-or-above the
    // editor's topmost visible line and scroll the preview to that
    // heading. Guarded against feedback with a suppress flag so the
    // later preview scroll event doesn't loop back.
    wireScrollSync();

    // Land the cursor near where the operator was reading. The hint
    // is a plain-text snippet from the rendered body; markdown source
    // carries extra syntax (headings, emphasis markers, inline code,
    // links) that mostly doesn't interrupt the textual content but
    // can break a verbatim indexOf. Try the full snippet first —
    // most prose hits. If it doesn't uniquely match, fall back to
    // the raw double-clicked word (~3+ chars of plain text, very
    // likely intact in source); if that's still ambiguous, don't
    // jump. Silent failure is correct here — position 0 is a safe
    // default.
    const hint = opts.cursorHint;
    if (hint) {
      const locate = (needle: string): number => {
        if (!needle || needle.length < 3) return -1;
        const first = split.body.indexOf(needle);
        if (first < 0) return -1;
        const second = split.body.indexOf(needle, first + 1);
        return second < 0 ? first : -1;
      };
      let pos = locate(hint);
      if (pos < 0) {
        // Fall back to the last word in the hint — that's the
        // word closest to the click in our expansion scheme.
        const words = hint.split(/\s+/).filter((w) => w.length >= 4);
        for (let i = words.length - 1; i >= 0 && pos < 0; i--) {
          pos = locate(words[i]);
        }
      }
      if (pos >= 0) editorHandle.setCursor(pos);
    }
  }

  /** Thin wrapper around outline-split's joinOutline so the onChange
   * closure doesn't need to await the module every keystroke. The
   * module is loaded eagerly at enterEdit time; once loaded, join
   * is synchronous. */
  let joinOutlineFn: ((outline: string, body: string) => string) | null = null;
  function joinOutlineIfPossible(outline: string, body: string): string {
    if (!joinOutlineFn) return body; // fallback: editor body replaces whole doc until module loads
    return joinOutlineFn(outline, body);
  }

  /** True iff the drawer exists in the DOM AND the tab is present
   * (the Astro page hides the tab when the current version has no
   * outline section). Used to gate the O keyboard shortcut. */
  function outlineDrawerAvailable(): boolean {
    const tab = document.querySelector<HTMLButtonElement>('[data-outline-tab]');
    return !!tab && !tab.hidden;
  }

  function openOutlineDrawer(): void {
    const drawer = document.querySelector<HTMLElement>('[data-outline-drawer]');
    const tab = document.querySelector<HTMLButtonElement>('[data-outline-tab]');
    const btn = document.querySelector<HTMLButtonElement>('[data-action="outline-drawer"]');
    if (!drawer) return;
    drawer.hidden = false;
    drawer.classList.add('er-outline-drawer--open');
    if (tab) tab.classList.add('er-outline-tab--stowed');
    btn?.setAttribute('aria-pressed', 'true');
  }

  function closeOutlineDrawer(): void {
    const drawer = document.querySelector<HTMLElement>('[data-outline-drawer]');
    const tab = document.querySelector<HTMLButtonElement>('[data-outline-tab]');
    const btn = document.querySelector<HTMLButtonElement>('[data-action="outline-drawer"]');
    if (!drawer) return;
    drawer.classList.remove('er-outline-drawer--open');
    if (tab) tab.classList.remove('er-outline-tab--stowed');
    btn?.setAttribute('aria-pressed', 'false');
    // Leave the drawer hidden after the slide-out animation.
    setTimeout(() => { drawer.hidden = true; }, 260);
  }

  function toggleOutlineDrawer(): void {
    const drawer = document.querySelector<HTMLElement>('[data-outline-drawer]');
    if (!drawer) return;
    if (drawer.classList.contains('er-outline-drawer--open')) closeOutlineDrawer();
    else openOutlineDrawer();
  }

  // Wire the drawer's affordances.
  document.querySelector<HTMLButtonElement>('[data-outline-tab]')
    ?.addEventListener('click', openOutlineDrawer);
  document.querySelector<HTMLButtonElement>('[data-outline-close]')
    ?.addEventListener('click', closeOutlineDrawer);
  document.querySelector<HTMLButtonElement>('[data-action="outline-drawer"]')
    ?.addEventListener('click', toggleOutlineDrawer);

  function exitEdit(): void {
    // Exit focus mode first so the chrome comes back before we hide it.
    if (document.body.classList.contains('er-focus-mode')) {
      document.body.classList.remove('er-focus-mode');
      const fb = document.querySelector<HTMLButtonElement>('[data-action="focus-mode"]');
      fb?.setAttribute('aria-pressed', 'false');
    }
    // Close the outline drawer if it's open. The tab stays
    // visible outside edit mode too — the drawer is a review-
    // surface affordance, not an edit-only one. The in-chrome
    // "Outline ↗" button is tied to the edit chrome so it
    // naturally disappears with editToolbar.hidden = true above.
    editToolbar.hidden = true;
    draftBody.classList.remove('hidden');
    toggleBtn.textContent = 'Edit';
    editing = false;
    stashedOutline = '';
    if (editorHandle) {
      editorHandle.destroy();
      editorHandle = null;
    }
    editSourceHost.innerHTML = '';
    editPreviewHost.innerHTML = '';
  }

  /** Single source of truth for the edit-state hint. Updates the
   * toolbar span AND the focus-mode corner indicator so the two
   * never disagree — previously editHint was set directly at
   * save-flow boundaries and the focus-mode label fell out of sync. */
  function setHint(text: string): void {
    editHint.textContent = text;
    if (focusSaveHint) focusSaveHint.textContent = text;
  }

  function updateSaveState(): void {
    const changed = draftEdit.value !== state.currentVersion.markdown;
    saveVersionBtn.disabled = !changed;
    // Also disable the floating focus-mode Save button so it reads
    // as inert when there's nothing to save.
    const focusSaveBtn = document.querySelector<HTMLButtonElement>(
      '[data-focus-save] [data-action="save-version"]',
    );
    if (focusSaveBtn) focusSaveBtn.disabled = !changed;
    setHint(changed ? 'Modified' : 'No changes');
  }

  /** True if the backing draft-edit textarea has unsaved changes
   * relative to the current version's markdown. */
  function hasUnsavedChanges(): boolean {
    return editing && draftEdit.value !== state.currentVersion.markdown;
  }

  /** Native confirm prompt before discarding unsaved edits. Returns
   * true if the operator chose to discard (safe to exitEdit). */
  function confirmDiscard(reason: string): boolean {
    if (!hasUnsavedChanges()) return true;
    return confirm(
      `You have unsaved changes. ${reason}\n\nUnsaved edits will be lost. Continue?`,
    );
  }

  /** Warn before tab close / page reload if edits are pending. The
   * standard beforeunload dance: set returnValue to any non-empty
   * string and the browser prompts. Modern browsers ignore the
   * message text; they show their own generic warning. */
  window.addEventListener('beforeunload', (ev) => {
    if (!hasUnsavedChanges()) return;
    ev.preventDefault();
    ev.returnValue = '';
  });

  toggleBtn.addEventListener('click', () => {
    if (editing) {
      if (!confirmDiscard('Exiting the editor will discard them.')) return;
      exitEdit();
    } else {
      void enterEdit();
    }
  });
  cancelEditBtn.addEventListener('click', () => {
    if (!confirmDiscard('Cancel will discard them.')) return;
    exitEdit();
  });

  // ---- Focus mode ----
  //
  // Full-viewport, single-column, chrome-free editor. The press-check
  // metaphor is "the galley under the lamp" — everything except the
  // page being edited recedes. Exit on Esc, Shift+F, or the floating
  // affordance in the top-left corner.

  const focusBtn = document.querySelector<HTMLButtonElement>('[data-action="focus-mode"]');
  const exitFocusBtn = document.querySelector<HTMLButtonElement>('[data-action="exit-focus"]');
  const focusSaveHint = document.querySelector<HTMLElement>('[data-focus-save-hint]');
  let focusMode = false;

  function enterFocus(): void {
    if (!editing) return;
    document.body.classList.add('er-focus-mode');
    focusBtn?.setAttribute('aria-pressed', 'true');
    focusMode = true;
    // Force source-only; split/preview don't make sense in focus.
    setEditView('source');
    // Sync the save hint into the corner indicator.
    syncFocusSave();
    editorHandle?.focus();
  }

  function exitFocus(): void {
    document.body.classList.remove('er-focus-mode');
    focusBtn?.setAttribute('aria-pressed', 'false');
    focusMode = false;
  }

  function syncFocusSave(): void {
    if (!focusSaveHint) return;
    focusSaveHint.textContent = editHint.textContent ?? '';
  }

  focusBtn?.addEventListener('click', () => {
    if (focusMode) exitFocus();
    else enterFocus();
  });
  exitFocusBtn?.addEventListener('click', exitFocus);

  // Double-click anywhere in the rendered draft enters edit mode. This
  // mirrors the comment gesture (select → Mark) with its own shape so
  // the operator doesn't have to reach for the top strip. Ignore
  // double-clicks inside highlight marks so we don't steal the
  // annotation scroll-to behavior that click handlers attach later.
  draftBody.addEventListener('dblclick', (ev) => {
    if (editing) return;
    const target = ev.target;
    if (target instanceof HTMLElement && target.closest('mark.draft-comment-highlight')) return;
    // Capture the click location BEFORE we clear the browser's auto-
    // selection. Double-click selects the word under the cursor, so
    // we use that word (plus a small context window) as the locator
    // snippet. enterEdit does the indexOf into the source and places
    // the cursor there — saves the operator the context-switch hunt.
    const cursorHint = captureDblclickHint();
    // Clear the double-click text selection the browser made on the way in
    // — otherwise the Mark button reappears alongside the editor.
    window.getSelection()?.removeAllRanges();
    void enterEdit({ cursorHint });
  });

  /**
   * Pull a plain-text locator snippet from the current selection
   * (created by the browser's double-click word-select). We want
   * enough surrounding context that the snippet is likely unique
   * in the document but not so much that any nearby edit will
   * invalidate it. Strategy: the selected word plus a few chars
   * of context on each side, trimmed to word boundaries.
   *
   * Returns undefined when no usable selection exists — enterEdit
   * treats that as "no hint" and lands at position 0 as before.
   */
  function captureDblclickHint(): string | undefined {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return undefined;
    const range = sel.getRangeAt(0);
    const offsets = computeOffsetFromRange(range);
    if (!offsets) return undefined;
    const text = draftPlainText();
    // Expand outward to ~60 chars total, BUT never cross a newline.
    // In rendered plain text a `\n` marks a paragraph boundary; in
    // markdown source the same boundary is `\n\n` (plus any heading
    // prefix or emphasis markers surrounding the next paragraph),
    // so a snippet that crosses the break won't match in source via
    // indexOf. Staying within a single rendered paragraph keeps the
    // snippet intact across the render → source mapping.
    const CONTEXT = 30;
    let start = Math.max(0, offsets.start - CONTEXT);
    let end = Math.min(text.length, offsets.end + CONTEXT);
    // Pull back if we crossed a newline.
    const prevNl = text.lastIndexOf('\n', offsets.start);
    const nextNl = text.indexOf('\n', offsets.end);
    if (prevNl >= 0 && prevNl >= start) start = prevNl + 1;
    if (nextNl >= 0 && nextNl < end) end = nextNl;
    // Snap to whitespace boundaries so the snippet doesn't begin
    // or end mid-word.
    while (start > 0 && !/\s/.test(text[start - 1] || '') && text[start - 1] !== '\n') start--;
    while (end < text.length && !/\s/.test(text[end] || '') && text[end] !== '\n') end++;
    const snippet = text.slice(start, end).trim();
    return snippet.length >= 3 ? snippet : undefined;
  }

  /** Single save handler, shared by every `[data-action="save-version"]`
   * button (toolbar + focus-mode floating). Guards against double
   * submission, updates both hint surfaces, and keeps beforeunload
   * from interrupting the successful post-save navigation. */
  async function performSave(): Promise<void> {
    if (saveVersionBtn.disabled) return;
    saveVersionBtn.disabled = true;
    setHint('Saving…');
    try {
      const res = await fetch('/api/dev/editorial-review/version', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          beforeVersion: state.currentVersion.version,
          afterMarkdown: draftEdit.value,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const msg = `Save failed: ${body.error || res.status}`;
        showToast(msg, true);
        setHint('Save failed');
        // Leave the save button enabled so the operator can retry.
        saveVersionBtn.disabled = false;
        return;
      }
      showToast(`Saved v${body.version.version}`);
      setHint(`Saved v${body.version.version}`);
      // Mark this session as saved so beforeunload doesn't interrupt
      // the navigation into the new version. The backing textarea
      // still holds the just-saved content; zeroing `editing` makes
      // hasUnsavedChanges() return false.
      editing = false;
      window.location.href = `?v=${body.version.version}`;
    } catch (e) {
      const msg = `Network error: ${(e as Error).message}`;
      showToast(msg, true);
      setHint('Save failed');
      saveVersionBtn.disabled = false;
    }
  }

  // Wire EVERY [data-action="save-version"] button to the same save
  // handler — toolbar, focus-mode floating, whatever else surfaces
  // the action. Previously only the toolbar button (captured via
  // querySelector) had the listener, so the focus-mode Save did
  // nothing. querySelectorAll fixes that.
  document.querySelectorAll<HTMLButtonElement>('[data-action="save-version"]').forEach(
    (btn) => btn.addEventListener('click', () => { void performSave(); }),
  );

  // ---- Decision buttons (Approve / Iterate / Reject) ----

  async function postDecision(to: string): Promise<boolean> {
    const res = await fetch('/api/dev/editorial-review/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workflowId, to }),
    });
    const body = await res.json();
    if (!res.ok) { showToast(`Decision failed: ${body.error || res.status}`, true); return false; }
    return true;
  }

  // If the workflow is still in `open`, bridge to `in-review` first so the
  // downstream transition (approved/iterating) is legal per VALID_TRANSITIONS.
  async function ensureInReview(): Promise<boolean> {
    if (state.workflow.state !== 'open') return true;
    return postDecision('in-review');
  }

  async function postApproveAnnotation(): Promise<boolean> {
    const res = await fetch('/api/dev/editorial-review/annotate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'approve', workflowId, version: versionNum }),
    });
    return res.ok;
  }

  async function postRejectAnnotation(reason: string): Promise<boolean> {
    const res = await fetch('/api/dev/editorial-review/annotate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'reject', workflowId, version: versionNum, reason }),
    });
    return res.ok;
  }

  const approveBtn = qn<HTMLButtonElement>('[data-action="approve"]');
  const iterateBtn = qn<HTMLButtonElement>('[data-action="iterate"]');
  const rejectBtn = qn<HTMLButtonElement>('[data-action="reject"]');

  /**
   * Copy the Claude Code command that the operator needs to run next
   * to the clipboard. Studio clicks only transition the workflow state;
   * the actual cognitive work (iterate, approve-and-write, etc.) lives
   * in a skill that must be invoked by the operator. Without the
   * clipboard copy + toast, the operator is left staring at a page
   * that looks like it did something but didn't tell them what's next.
   */
  async function copyAndToast(command: string, hint: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(command);
      showToast(`${hint}  (command copied — paste into Claude Code)`);
    } catch {
      showToast(`${hint}  Run: ${command}`, true);
    }
  }

  approveBtn?.addEventListener('click', async () => {
    approveBtn.disabled = true;
    const bridged = await ensureInReview();
    if (!bridged) { approveBtn.disabled = false; return; }
    await postApproveAnnotation();
    const ok = await postDecision('approved');
    if (!ok) { approveBtn.disabled = false; return; }
    // Approve writes to disk + transitions to applied; both are done
    // by /editorial-approve (longform/shortform) or
    // /editorial-outline-approve (outline) in Claude Code, not by
    // the studio click. Build the command that matches the workflow.
    const site = state.workflow.site;
    const slug = state.workflow.slug;
    const kind = state.workflow.contentKind;
    const approveCmd =
      kind === 'outline'
        ? `/editorial-outline-approve --site ${site} ${slug}`
        : `/editorial-approve --site ${site} ${slug}`;
    const approveHint =
      kind === 'outline'
        ? `Approved outline v${versionNum}. Next: /editorial-outline-approve advances the calendar Outlining → Drafting.`
        : `Approved v${versionNum}. Next: /editorial-approve writes the file and marks the workflow applied.`;
    await copyAndToast(approveCmd, approveHint);
    setTimeout(() => window.location.reload(), 2400);
  });

  iterateBtn?.addEventListener('click', async () => {
    iterateBtn.disabled = true;
    const bridged = await ensureInReview();
    if (!bridged) { iterateBtn.disabled = false; return; }
    const ok = await postDecision('iterating');
    if (!ok) { iterateBtn.disabled = false; return; }
    const site = state.workflow.site;
    const slug = state.workflow.slug;
    const kind = state.workflow.contentKind;
    // /editorial-iterate defaults to --kind longform; outline
    // workflows need the flag so the helper picks the right workflow.
    const iterateCmd =
      kind === 'outline'
        ? `/editorial-iterate --kind outline --site ${site} ${slug}`
        : `/editorial-iterate --site ${site} ${slug}`;
    await copyAndToast(
      iterateCmd,
      `Iterating on v${versionNum}. Next: ${iterateCmd} revises against your comments and appends v${versionNum + 1}.`,
    );
    setTimeout(() => window.location.reload(), 2400);
  });

  rejectBtn?.addEventListener('click', async () => {
    const reason = window.prompt('Optional reason for rejection:') || '';
    rejectBtn.disabled = true;
    if (reason) await postRejectAnnotation(reason);
    const ok = await postDecision('cancelled');
    if (ok) {
      // Reject is terminal; nothing for the operator to run in Claude
      // Code. Just confirm and reload.
      showToast('Workflow cancelled.');
      setTimeout(() => window.location.reload(), 900);
    } else {
      rejectBtn.disabled = false;
    }
  });

  // ---- Keyboard shortcuts ----

  const shortcutsOverlay = qn<HTMLElement>('[data-shortcuts-overlay]');
  const shortcutsBackdrop = qn<HTMLElement>('[data-shortcuts-backdrop]');
  const shortcutsBtn = qn<HTMLButtonElement>('[data-action="shortcuts"]');

  function showShortcuts(show: boolean): void {
    if (!shortcutsOverlay) return;
    shortcutsOverlay.hidden = !show;
  }
  shortcutsBtn?.addEventListener('click', () => showShortcuts(true));
  shortcutsBackdrop?.addEventListener('click', () => showShortcuts(false));

  let commentFocusIndex = -1;
  function focusCommentByIndex(dir: 1 | -1): void {
    const items = Array.from(sidebarList.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    if (items.length === 0) return;
    commentFocusIndex =
      (commentFocusIndex + dir + items.length) % items.length;
    const target = items[commentFocusIndex];
    items.forEach(el => el.classList.remove('active'));
    target.classList.add('active');
    const id = target.dataset.annotationId;
    if (id) {
      scrollToHighlight(id);
      setActiveHighlight(id, true);
      setTimeout(() => setActiveHighlight(id, false), 1800);
    }
  }

  document.addEventListener('keydown', (ev) => {
    // Don't hijack keys while typing
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    const typing = target !== null && (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable
    );
    if (typing) {
      if (ev.key === 'Escape') {
        // In focus mode, Esc exits focus first — the editor itself
        // stays open. Regular edit mode's Esc still blurs + dismisses
        // the composer if that's what the operator was typing in.
        if (focusMode) {
          ev.preventDefault();
          exitFocus();
          return;
        }
        target.blur();
        if (!composer.hidden) closeComposer();
      }
      return;
    }
    // Don't hijack with modifiers
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

    if (ev.key === '?' || (ev.key === '/' && ev.shiftKey)) {
      ev.preventDefault();
      showShortcuts(!shortcutsOverlay || shortcutsOverlay.hidden);
      return;
    }
    if (ev.key === 'Escape') {
      if (shortcutsOverlay && !shortcutsOverlay.hidden) { showShortcuts(false); return; }
      if (!composer.hidden) { closeComposer(); return; }
      // Outline drawer takes Esc before focus mode — if both are
      // open, peeling the drawer first feels natural.
      const drawer = document.querySelector('[data-outline-drawer]');
      if (drawer?.classList.contains('er-outline-drawer--open')) {
        closeOutlineDrawer();
        return;
      }
      if (focusMode) { exitFocus(); return; }
    }
    // Shift+F toggles focus mode from anywhere on the page (as long
    // as the operator isn't typing, which the `typing` branch above
    // already handled).
    if (ev.shiftKey && ev.key === 'F') {
      ev.preventDefault();
      if (!editing) return;
      if (focusMode) exitFocus(); else enterFocus();
      return;
    }
    if (ev.key === 'o' && outlineDrawerAvailable()) {
      ev.preventDefault();
      toggleOutlineDrawer();
      return;
    }
    if (ev.key === 'e') { ev.preventDefault(); toggleBtn.click(); return; }
    if (ev.key === 'a') { ev.preventDefault(); approveBtn?.click(); return; }
    if (ev.key === 'i') { ev.preventDefault(); iterateBtn?.click(); return; }
    if (ev.key === 'r') { ev.preventDefault(); rejectBtn?.click(); return; }
    if (ev.key === 'j') { ev.preventDefault(); focusCommentByIndex(1); return; }
    if (ev.key === 'k') { ev.preventDefault(); focusCommentByIndex(-1); return; }
  });

  // ---- Polling: check for new versions or state changes ----

  const pollIndicator = qn<HTMLElement>('[data-poll]');
  const POLL_MS = 8000;
  let pollingBusy = false;

  async function poll(): Promise<void> {
    if (pollingBusy || editing) return;
    pollingBusy = true;
    try {
      const res = await fetch(
        `/api/dev/editorial-review/workflow?id=${encodeURIComponent(workflowId)}`,
      );
      if (!res.ok) return;
      const body = await res.json();
      const w = body.workflow as { currentVersion: number; state: string } | undefined;
      if (!w) return;
      const currentVersionChanged = w.currentVersion !== state.workflow.currentVersion;
      const stateChanged = w.state !== state.workflow.state;
      if (currentVersionChanged) {
        showToast(`New version v${w.currentVersion} available — reloading…`);
        setTimeout(() => {
          window.location.href = `?v=${w.currentVersion}`;
        }, 1200);
      } else if (stateChanged) {
        showToast(`State changed: ${state.workflow.state} → ${w.state}`);
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      // network hiccup — ignore and try again next tick
    } finally {
      pollingBusy = false;
    }
  }

  async function tick(): Promise<void> {
    if (pollIndicator) pollIndicator.classList.add('polling');
    try {
      await poll();
    } finally {
      if (pollIndicator) pollIndicator.classList.remove('polling');
    }
  }
  setInterval(tick, POLL_MS);

  // ---- Boot ----

  loadAnnotations();
}

initEditorialReview();
