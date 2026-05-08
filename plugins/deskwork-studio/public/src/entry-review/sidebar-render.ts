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

export interface SidebarRenderDeps {
  draftBody: HTMLElement;
  addressByCommentId: ReadonlyMap<string, AddressAnnotation>;
}

export function buildAddressStamp(
  commentId: string,
  addressByCommentId: ReadonlyMap<string, AddressAnnotation>,
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
  if (addr.reason) {
    const reason = document.createElement('span');
    reason.className = 'er-marginalia-stamp-reason';
    reason.textContent = addr.reason;
    stamp.appendChild(reason);
  }
  return stamp;
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
  const stamp = buildAddressStamp(annotation.id, deps.addressByCommentId);
  if (stamp) li.appendChild(stamp);
  li.appendChild(text);

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
  const stamp = buildAddressStamp(ann.id, deps.addressByCommentId);

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
  li.appendChild(actions);
  return li;
}
