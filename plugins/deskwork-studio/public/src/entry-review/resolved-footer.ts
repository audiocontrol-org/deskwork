/**
 * Resolved-comments footer — shell + render for the marginalia rail's
 * "Resolved (N)" disclosure. Extracted from annotations.ts so that
 * controller stays under the project's 500-line cap.
 *
 * The footer lives at the bottom of the `.er-marginalia` aside (NOT
 * inside `.er-marginalia-list`). It collapses by default; clicking the
 * header toggles disclosure. Each resolved item carries a Re-open
 * button whose click is forwarded to the controller's `onReopen`.
 */

import { buildResolvedItem } from './sidebar-render.ts';
import type {
  AddressAnnotation,
  AnnotationStatus,
  CommentAnnotation,
} from './state.ts';

export interface ResolvedHistoryEntry {
  ann: CommentAnnotation;
  status: AnnotationStatus;
}

export interface RenderResolvedFooterDeps {
  /** Aside element that hosts the footer. The footer is appended once
   *  on first render; subsequent renders update its contents in place. */
  sidebar: HTMLElement;
  /** Article body the resolved-item builder reads to derive quote text
   *  for legacy comments without an `anchor` field. */
  draftBody: HTMLElement;
  /** Latest address dispositions per commentId so the resolved view
   *  shows the same `addressed/deferred/wontfix` stamp as the live list. */
  addressByCommentId: ReadonlyMap<string, AddressAnnotation>;
  /** History of resolved comments, newest at the end. */
  resolvedHistory: readonly ResolvedHistoryEntry[];
  /** Re-open button click handler. The controller owns the round-trip
   *  to the annotate endpoint + the sidebar mutation; this module just
   *  wires the click. */
  onReopen: (annotation: CommentAnnotation, status: AnnotationStatus) => void;
}

/**
 * Render or update the resolved-comments footer. Idempotent — safe to
 * call repeatedly. Removes the footer entirely when history is empty.
 */
export function renderResolvedFooter(deps: RenderResolvedFooterDeps): void {
  const { sidebar, draftBody, addressByCommentId, resolvedHistory, onReopen } = deps;
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
      onReopen,
    }));
  }
}
