/**
 * Sidebar rendering helpers for the entry-keyed press-check client
 * (Phase 34a — T11 client wiring).
 *
 * Pure DOM-construction functions extracted from the annotations
 * controller so the controller stays under the project's 500-line cap.
 * Each helper builds the markup; the controller wires the events.
 */

import { extractQuote } from './range-utils.ts';
import type {
  AddressAnnotation,
  AnnotationStatus,
  CommentAnnotation,
} from './state.ts';

/**
 * Phase 8 Step 8.6.1 — fetcher contract for the inline diff
 * expansion. The sidebar render helper wires the click handler on the
 * "addressed" badge; the controller injects the actual fetch + JSON
 * parse via this callback. Keeping the fetch out of `sidebar-render.ts`
 * keeps that module pure-DOM (no network coupling), matches the
 * pattern used by `onResolve` / `onEdit` / `onDelete`, and lets the
 * jsdom tests inject a stubbed fetcher.
 *
 * Returns the parsed `{ reason, hunks, notes? }` payload from the
 * studio's `/entry/:entryId/diff-slice` route. Throws on network
 * error or non-200 response — the click handler renders an inline
 * error marker in that case.
 */
export interface DiffHunk {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly lines: readonly string[];
}
export interface DiffSlicePayload {
  readonly reason: string;
  readonly hunks: readonly DiffHunk[];
  readonly notes?: string;
}
export type DiffSliceFetcher = (
  commentId: string,
  revision: number,
) => Promise<DiffSlicePayload>;

export interface SidebarRenderDeps {
  draftBody: HTMLElement;
  addressByCommentId: ReadonlyMap<string, AddressAnnotation>;
  /**
   * Phase 8 Step 8.6.1 — when present, the "addressed" badge becomes
   * click-interactive (cursor:pointer, role="button",
   * aria-pressed="false"). Clicking expands an inline panel below the
   * badge with the disposition reason as a header and the diff slice
   * (or the Step 8.6.4 fallback when empty) as the body. Clicking
   * again collapses. Omit to keep the legacy non-interactive
   * behavior — tests that don't care about the diff toggle continue
   * working unchanged.
   */
  fetchDiffSlice?: DiffSliceFetcher;
}

export function buildAddressStamp(
  commentId: string,
  addressByCommentId: ReadonlyMap<string, AddressAnnotation>,
  fetchDiffSlice?: DiffSliceFetcher,
): HTMLElement | null {
  const addr = addressByCommentId.get(commentId);
  if (!addr) return null;
  const stamp = document.createElement('div');
  stamp.className = `er-marginalia-stamp er-marginalia-stamp--${addr.disposition}`;
  stamp.dataset.disposition = addr.disposition;
  const mark = document.createElement('span');
  mark.className = 'er-marginalia-stamp-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent =
    addr.disposition === 'addressed' ? '◆' :
    addr.disposition === 'deferred' ? '◇' : '✕';
  const label = document.createElement('span');
  label.className = 'er-marginalia-stamp-label';
  label.textContent =
    addr.disposition === 'addressed' ? `addressed in v${addr.version}` :
    addr.disposition === 'deferred' ? `deferred in v${addr.version}` :
    `won't fix · v${addr.version}`;
  stamp.appendChild(mark);
  stamp.appendChild(label);
  // Phase 8 Step 8.5.3 — back-compat read path for addressed
  // annotations that lack a `reason` field (legacy data
  // pre-Step-8.1.2). Per the Step 8.1.2 schema tightening (commit
  // 91954561) every NEW addressed annotation must carry a non-empty
  // reason; the CLI-parse-time gate (Step 8.5.2) refuses
  // addressed-without-reason BEFORE the journal-write. The only path
  // that reaches the read side with a missing/empty reason on an
  // addressed annotation is legacy data already on disk; surface the
  // legacy-data marker explicitly so the operator sees the gap during
  // triage rather than a silent omission. `deferred` and `wontfix`
  // have always had optional reason, so this marker is scoped to
  // `addressed`.
  const hasReason = typeof addr.reason === 'string' && addr.reason.length > 0;
  if (hasReason) {
    const reason = document.createElement('span');
    reason.className = 'er-marginalia-stamp-reason';
    reason.textContent = addr.reason ?? '';
    stamp.appendChild(reason);
  } else if (addr.disposition === 'addressed') {
    const reason = document.createElement('span');
    reason.className = 'er-marginalia-stamp-reason';
    reason.dataset.legacyMissingReason = 'true';
    reason.textContent = 'no reason recorded';
    stamp.appendChild(reason);
  }
  // Phase 8 Step 8.6.1 — click-to-expand only on `addressed` stamps,
  // and only when a fetcher is wired by the controller. The diff
  // slice is the THING the badge addresses; surfacing it inline on
  // the badge itself is the canonical affordance-placement pattern
  // (`.claude/rules/affordance-placement.md` — controls live ON the
  // component they affect, not in a toolbar). `deferred` and
  // `wontfix` stamps stay non-interactive — there's no diff to show
  // for those dispositions.
  if (addr.disposition === 'addressed' && fetchDiffSlice !== undefined) {
    attachDiffToggle(stamp, addr, fetchDiffSlice);
  }
  return stamp;
}

/**
 * Wires the click-to-expand affordance on an addressed-disposition
 * stamp. The toggle inserts a `.er-marginalia-diff-expansion` element
 * directly after the stamp inside the sidebar item; the next click
 * collapses it. State lives on the DOM (`aria-pressed` + the
 * adjacent expansion's presence) so the controller doesn't need to
 * track per-stamp toggle state in script-scope variables.
 *
 * The fetch is lazy — the first click triggers the fetch + render;
 * subsequent toggles re-use the rendered expansion. A pending fetch
 * is debounced via `dataset.fetching = '1'` so rapid double-clicks
 * don't fire duplicate network calls.
 */
function attachDiffToggle(
  stamp: HTMLElement,
  addr: AddressAnnotation,
  fetchDiffSlice: DiffSliceFetcher,
): void {
  stamp.setAttribute('role', 'button');
  stamp.setAttribute('tabindex', '0');
  stamp.setAttribute('aria-pressed', 'false');
  stamp.dataset.expandable = 'true';
  stamp.style.cursor = 'pointer';
  const onActivate = async (ev: Event): Promise<void> => {
    ev.stopPropagation();
    const existing = stamp.nextElementSibling;
    const isExpansion =
      existing instanceof HTMLElement &&
      existing.classList.contains('er-marginalia-diff-expansion');
    if (isExpansion) {
      existing.remove();
      stamp.setAttribute('aria-pressed', 'false');
      return;
    }
    if (stamp.dataset.fetching === '1') return;
    stamp.dataset.fetching = '1';
    stamp.setAttribute('aria-pressed', 'true');
    try {
      const payload = await fetchDiffSlice(addr.commentId, addr.version);
      const expansion = renderDiffExpansion(payload);
      stamp.insertAdjacentElement('afterend', expansion);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errEl = document.createElement('div');
      errEl.className =
        'er-marginalia-diff-expansion er-marginalia-diff-expansion--error';
      errEl.textContent = `Could not load diff slice: ${errMsg}`;
      stamp.insertAdjacentElement('afterend', errEl);
    } finally {
      delete stamp.dataset.fetching;
    }
  };
  stamp.addEventListener('click', (ev) => {
    void onActivate(ev);
  });
  // Keyboard activation — Space and Enter both fire on a role=button
  // element; jsdom doesn't synthesize a click for these so wire them
  // explicitly. Matches the existing er-marginalia-action button
  // pattern (those use native <button>; this is a div-as-button by
  // necessity since the stamp's chrome is a div).
  stamp.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      void onActivate(ev);
    }
  });
}

/**
 * Build the inline diff-expansion DOM under an "addressed" stamp.
 * The expansion is structured as:
 *   .er-marginalia-diff-expansion
 *     .er-marginalia-diff-reason        (header — the disposition reason)
 *     .er-marginalia-diff-body          (the slice — hunks or fallback)
 *
 * Hunks render as a side-by-side `<pre>` block: each `Hunk.lines`
 * entry is prefixed by `' '` / `'-'` / `'+'` per unified-diff
 * convention; the renderer wraps each line in a `<span>` carrying a
 * `data-kind` so CSS can color the deletion/insertion sides
 * differently. The full side-by-side layout (two columns, old | new)
 * lands when the studio CSS picks up the per-line `data-kind` —
 * the markup is shape-stable so CSS can evolve independently.
 *
 * Step 8.6.4 empty-diff-slice fallback: when the server returns
 * `hunks: []` AND no `notes` value, the body renders the inline
 * message `"addressed without local diff — see the disposition
 * reason"`. This case happens when the operator addressed a comment
 * on a region the new revision didn't change (e.g. a comment about
 * voice on paragraph 2 that got addressed by rewriting paragraph 5
 * — there's no local diff at the anchor, but the reason names where
 * the fix landed). The fallback marker carries the
 * `er-marginalia-diff-empty` class so CSS can style it distinctly
 * from the populated-hunk view; a `data-empty-slice="true"`
 * attribute makes the case scriptable for diagnostic tools.
 */
function renderDiffExpansion(payload: DiffSlicePayload): HTMLElement {
  const expansion = document.createElement('div');
  expansion.className = 'er-marginalia-diff-expansion';
  const reasonHeader = document.createElement('div');
  reasonHeader.className = 'er-marginalia-diff-reason';
  reasonHeader.textContent = payload.reason || 'no reason recorded';
  if (!payload.reason) {
    reasonHeader.dataset.legacyMissingReason = 'true';
  }
  expansion.appendChild(reasonHeader);
  const body = document.createElement('div');
  body.className = 'er-marginalia-diff-body';
  if (payload.notes !== undefined && payload.hunks.length === 0) {
    // Server explicitly explained the empty slice (first revision,
    // spatial-anchor not-yet-supported, etc.) — render the note.
    const notes = document.createElement('div');
    notes.className = 'er-marginalia-diff-notes';
    notes.textContent = payload.notes;
    body.appendChild(notes);
  } else if (payload.hunks.length === 0) {
    // Step 8.6.4 — addressed without local diff. The comment was
    // anchored on a region the new revision didn't touch; the
    // disposition reason names where the fix actually landed.
    const fallback = document.createElement('div');
    fallback.className = 'er-marginalia-diff-empty';
    fallback.dataset.emptySlice = 'true';
    fallback.textContent =
      'addressed without local diff — see the disposition reason';
    body.appendChild(fallback);
  } else {
    for (const hunk of payload.hunks) {
      const block = document.createElement('pre');
      block.className = 'er-marginalia-diff-hunk';
      block.dataset.oldStart = String(hunk.oldStart);
      block.dataset.newStart = String(hunk.newStart);
      for (const line of hunk.lines) {
        const lineEl = document.createElement('span');
        lineEl.className = 'er-marginalia-diff-line';
        const kind = line.startsWith('+')
          ? 'add'
          : line.startsWith('-')
            ? 'del'
            : 'ctx';
        lineEl.dataset.kind = kind;
        // Render the line including its leading +/-/' ' prefix so
        // the operator's mental model lines up with the unified-diff
        // convention they already know.
        lineEl.textContent = line + '\n';
        block.appendChild(lineEl);
      }
      body.appendChild(block);
    }
  }
  expansion.appendChild(body);
  return expansion;
}

/**
 * Phase 8 Step 8.4 — render attached screenshots as a thumbnail strip.
 * Returns a container `<div class="er-marginalia-attachments">` with
 * one `<img>` per attachment path, or null when the comment has no
 * attachments (so the caller doesn't append an empty div).
 *
 * Paths are taken VERBATIM as the `src` attribute. Per Phase 8 the
 * attachment paths are project-root-relative (e.g.
 * `docs/foo/scrapbook/screenshots/<filename>.png`), which serves
 * directly from the studio's static-file handler. The renderer does
 * NOT URL-encode the path; the persistence layer's filename regex
 * (`screenshot-persistence.ts`) is the security boundary against
 * malformed filenames, AND the schema-level `z.array(z.string())`
 * is the type-safety boundary against non-string entries.
 *
 * The strip is intentionally minimal — a click-to-lightbox surface
 * lands in Phase 9/10/11 design work. The shape stays stable so the
 * lightbox can attach to the existing `<img>` tags without changing
 * the strip's outer structure.
 */
function buildAttachmentStrip(
  attachments: readonly string[] | undefined,
): HTMLElement | null {
  if (!attachments || attachments.length === 0) return null;
  const strip = document.createElement('div');
  strip.className = 'er-marginalia-attachments';
  for (const path of attachments) {
    if (typeof path !== 'string' || path.length === 0) continue;
    const img = document.createElement('img');
    img.className = 'er-marginalia-attachment-thumb';
    // setAttribute (instead of img.src = path) so the assertion
    // `getAttribute('src')` returns the verbatim string the caller
    // passed — `img.src` resolves to an absolute URL via the
    // browser's URL resolver, which would break tests that assert
    // the literal relative path.
    img.setAttribute('src', path);
    img.setAttribute('alt', 'attached screenshot');
    img.setAttribute('loading', 'lazy');
    strip.appendChild(img);
  }
  // If every entry was a falsy string the strip ends up empty;
  // return null so the caller doesn't render an empty container.
  if (strip.children.length === 0) return null;
  return strip;
}

export interface BuildSidebarItemDeps extends SidebarRenderDeps {
  /** Click on the Resolve button — the controller handles the
   *  POST + sidebar-list mutation. */
  onResolve: (annotation: CommentAnnotation, status: AnnotationStatus) => void;
  /** Click on the Edit button — controller flips the card into the
   *  inline-edit affordance and PATCHes the new text on save. */
  onEdit: (
    annotation: CommentAnnotation,
    card: HTMLElement,
    noteEl: HTMLElement,
  ) => void;
  /** Click on the Delete button — controller asks the operator to
   *  confirm and DELETEs on yes. */
  onDelete: (
    annotation: CommentAnnotation,
    card: HTMLElement,
    deleteBtn: HTMLElement,
  ) => void;
  /** Hover-on-item → highlight in the article body. */
  onHoverEnter: (annotationId: string) => void;
  onHoverLeave: (annotationId: string) => void;
  /** Click-on-item → scroll the article body to the highlight. */
  onScrollTo: (annotationId: string) => void;
}

export function buildSidebarItem(
  annotation: CommentAnnotation,
  status: AnnotationStatus,
  deps: BuildSidebarItemDeps,
): HTMLElement {
  const li = document.createElement('li');
  li.className = `er-marginalia-item er-marginalia-item--${status}`;
  li.dataset.annotationId = annotation.id;
  li.dataset.status = status;

  const cat = document.createElement('div');
  cat.className = 'cat';
  if (status === 'rebased') {
    cat.textContent = `from v${annotation.version} · ${annotation.category || 'other'}`;
  } else if (status === 'unresolved') {
    cat.textContent = `from v${annotation.version} · unresolved`;
  } else {
    cat.textContent = annotation.category || 'other';
  }

  const quote = document.createElement('div');
  quote.className = 'quote';
  if (annotation.anchor) {
    quote.textContent = annotation.anchor;
  } else if (status === 'current') {
    quote.textContent = extractQuote(deps.draftBody, annotation.range);
  } else {
    quote.textContent = '(legacy comment — no anchor captured)';
  }

  const text = document.createElement('p');
  text.className = 'note';
  text.textContent = annotation.text;

  li.appendChild(cat);
  li.appendChild(quote);
  const stamp = buildAddressStamp(
    annotation.id,
    deps.addressByCommentId,
    deps.fetchDiffSlice,
  );
  if (stamp) li.appendChild(stamp);
  li.appendChild(text);
  // Phase 8 Step 8.4 render — attached screenshots surface as a
  // thumbnail strip below the comment text. The strip is plain
  // `<img>` tags; a click-through to a fullsize lightbox lands in
  // Phase 9/10/11 design work. The strip's container has
  // `.er-marginalia-attachments` so CSS can style the row.
  const attachmentStrip = buildAttachmentStrip(annotation.attachments);
  if (attachmentStrip) li.appendChild(attachmentStrip);

  const actions = document.createElement('div');
  actions.className = 'er-marginalia-actions';
  const resolveBtn = document.createElement('button');
  resolveBtn.type = 'button';
  resolveBtn.className = 'er-marginalia-action';
  resolveBtn.textContent = 'Resolve';
  resolveBtn.dataset.action = 'resolve-comment';
  resolveBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    deps.onResolve(annotation, status);
  });
  // Phase 35 (issue #199) — Edit + Delete affordances live ON the
  // card itself per `.claude/rules/affordance-placement.md`. Editing
  // a margin note's text is the typo-fix path; deleting is distinct
  // from Resolve (resolve says "this was addressed", delete says
  // "this was a mistake").
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'er-marginalia-action';
  editBtn.textContent = 'Edit';
  editBtn.dataset.action = 'edit-comment';
  editBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    deps.onEdit(annotation, li, text);
  });
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'er-marginalia-action er-marginalia-action--destructive';
  deleteBtn.textContent = 'Delete';
  deleteBtn.dataset.action = 'delete-comment';
  deleteBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    deps.onDelete(annotation, li, deleteBtn);
  });
  actions.appendChild(editBtn);
  actions.appendChild(resolveBtn);
  actions.appendChild(deleteBtn);
  li.appendChild(actions);

  if (status !== 'unresolved') {
    li.addEventListener('mouseenter', () => deps.onHoverEnter(annotation.id));
    li.addEventListener('mouseleave', () => deps.onHoverLeave(annotation.id));
    li.addEventListener('click', () => deps.onScrollTo(annotation.id));
  }

  return li;
}

export interface BuildResolvedItemDeps extends SidebarRenderDeps {
  onReopen: (annotation: CommentAnnotation, status: AnnotationStatus) => void;
}

export function buildResolvedItem(
  ann: CommentAnnotation,
  status: AnnotationStatus,
  deps: BuildResolvedItemDeps,
): HTMLElement {
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
      : extractQuote(deps.draftBody, ann.range);

  const text = document.createElement('p');
  text.className = 'note';
  text.textContent = ann.text;
  const stamp = buildAddressStamp(
    ann.id,
    deps.addressByCommentId,
    deps.fetchDiffSlice,
  );

  const actions = document.createElement('div');
  actions.className = 'er-marginalia-actions';
  const reopenBtn = document.createElement('button');
  reopenBtn.type = 'button';
  reopenBtn.className = 'er-marginalia-action';
  reopenBtn.textContent = 'Re-open';
  reopenBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    deps.onReopen(ann, status);
  });
  actions.appendChild(reopenBtn);

  li.appendChild(cat);
  li.appendChild(quote);
  if (stamp) li.appendChild(stamp);
  li.appendChild(text);
  const attachmentStrip = buildAttachmentStrip(ann.attachments);
  if (attachmentStrip) li.appendChild(attachmentStrip);
  li.appendChild(actions);
  return li;
}
