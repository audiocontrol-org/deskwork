/**
 * Range / DOM-walking utilities for the entry-keyed press-check client.
 *
 * Same coordinate model as the legacy longform client: comment ranges
 * are character offsets against the rendered plain text of the current
 * version's draft body (text-node concatenation, NOT innerText —
 * innerText collapses inter-block whitespace differently).
 */

import type { DraftRange } from './state.ts';

export function computeOffsetFromRange(
  root: HTMLElement,
  range: Range,
): DraftRange | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }
  let start = -1;
  let end = -1;
  let acc = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const len = node.nodeValue?.length ?? 0;
    if (node === range.startContainer) start = acc + range.startOffset;
    if (node === range.endContainer) {
      end = acc + range.endOffset;
      break;
    }
    acc += len;
    node = walker.nextNode();
  }
  if (start < 0 || end < 0 || end <= start) return null;
  return { start, end };
}

/**
 * Wrap the substring `[offsets.start, offsets.end)` of `root`'s
 * concatenated text-node values in a `<mark>` carrying
 * `data-annotation-id`. Walks segment-by-segment so the wrap survives
 * inline elements (em, strong, code).
 */
export function wrapRange(
  root: HTMLElement,
  offsets: DraftRange,
  annotationId: string,
): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const segments: { node: Text; localStart: number; localEnd: number }[] = [];
  let acc = 0;
  // SHOW_TEXT guarantees Text nodes; the DOM API types nextNode as
  // `Node | null`, so narrow with instanceof rather than a cast.
  let raw = walker.nextNode();
  while (raw !== null) {
    if (!(raw instanceof Text)) {
      raw = walker.nextNode();
      continue;
    }
    const node = raw;
    const nodeStart = acc;
    const nodeEnd = acc + (node.nodeValue?.length ?? 0);
    const segStart = Math.max(offsets.start, nodeStart);
    const segEnd = Math.min(offsets.end, nodeEnd);
    if (segEnd > segStart) {
      segments.push({
        node,
        localStart: segStart - nodeStart,
        localEnd: segEnd - nodeStart,
      });
    }
    acc = nodeEnd;
    raw = walker.nextNode();
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
 * Concatenate the raw text-node values of `root` in the same order
 * `computeOffsetFromRange` and `wrapRange` walk them. Don't substitute
 * `innerText` — it collapses source whitespace, which makes the offset
 * coordinate space disagree with the stored ranges.
 */
export function plainText(root: HTMLElement): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = '';
  let node = walker.nextNode();
  while (node) {
    text += node.nodeValue ?? '';
    node = walker.nextNode();
  }
  return text;
}

export function extractQuote(root: HTMLElement, offsets: DraftRange): string {
  return plainText(root).slice(offsets.start, offsets.end);
}

/**
 * Try to re-locate a prior-version anchor in the current body. Returns
 * a current-body range when the anchor appears exactly once, null
 * otherwise. Missing anchors return null.
 */
export function rebaseAnchor(
  root: HTMLElement,
  anchor: string | undefined,
): DraftRange | null {
  if (!anchor || anchor.length === 0) return null;
  const text = plainText(root);
  const first = text.indexOf(anchor);
  if (first < 0) return null;
  const next = text.indexOf(anchor, first + 1);
  if (next >= 0) return null; // ambiguous — refuse to guess.
  return { start: first, end: first + anchor.length };
}

/**
 * Remove every `<mark data-annotation-id="...">` wrapping for an
 * annotation, replacing each with a plain text node carrying the same
 * content. Sibling text nodes will merge on next render — fine for dev.
 */
export function removeHighlight(
  root: HTMLElement,
  annotationId: string,
): void {
  root
    .querySelectorAll<HTMLElement>(`mark[data-annotation-id="${annotationId}"]`)
    .forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(m.textContent ?? ''), m);
    });
}
