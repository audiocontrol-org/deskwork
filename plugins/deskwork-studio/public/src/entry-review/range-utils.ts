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
 * Try to re-locate a prior-version anchor in the current body using
 * the W3C Web Annotation TextQuoteSelector model (exact + prefix +
 * suffix). Returns a current-body range when disambiguation succeeds,
 * null otherwise.
 *
 * Algorithm (per #200's design decision; reference:
 * https://www.w3.org/TR/annotation-model/#text-quote-selector):
 *
 *   1. Find all occurrences of `anchor` in the current text.
 *   2. Zero matches → null. Anchor was deleted or rewritten beyond
 *      recognition.
 *   3. Exactly one match → return that range. Single-match is
 *      unambiguous; prefix/suffix add no signal. This is the
 *      back-compat path for legacy comments without context.
 *   4. Multiple matches → score each candidate by character-boundary
 *      match count against the captured prefix+suffix. Score the
 *      prefix from the right edge backward (chars closer to the
 *      anchor matter most) and the suffix from the left edge forward.
 *      Return the highest-scoring candidate. Null on score-of-zero
 *      (no context provided or context matches none of the
 *      candidates) or tie (two candidates equally good — refuse to
 *      guess between them).
 *
 * #271 will add a diff-match-patch fuzzy fallback for the case where
 * the anchor text itself was minimally edited.
 */
export function rebaseAnchor(
  root: HTMLElement,
  anchor: string | undefined,
  anchorPrefix?: string,
  anchorSuffix?: string,
): DraftRange | null {
  if (!anchor || anchor.length === 0) return null;
  const text = plainText(root);

  // Collect every occurrence of the anchor.
  const candidates: number[] = [];
  let i = -1;
  while ((i = text.indexOf(anchor, i + 1)) !== -1) candidates.push(i);

  if (candidates.length === 0) return null;
  // Always-trust path for single matches preserves legacy behavior and
  // covers comments without captured prefix/suffix.
  const first = candidates[0];
  if (candidates.length === 1 && first !== undefined) {
    return { start: first, end: first + anchor.length };
  }

  // Multiple matches; without context we cannot disambiguate.
  const hasContext = (anchorPrefix && anchorPrefix.length > 0)
    || (anchorSuffix && anchorSuffix.length > 0);
  if (!hasContext) return null;

  function scoreAt(pos: number): number {
    let score = 0;
    if (anchorPrefix && anchorPrefix.length > 0) {
      // Match chars from the boundary backward (chars closer to the
      // anchor weighted equally; stop at first mismatch).
      const actualPrefix = text.slice(Math.max(0, pos - anchorPrefix.length), pos);
      const k = Math.min(anchorPrefix.length, actualPrefix.length);
      for (let n = 1; n <= k; n++) {
        if (anchorPrefix[anchorPrefix.length - n] === actualPrefix[actualPrefix.length - n]) {
          score++;
        } else {
          break;
        }
      }
    }
    if (anchorSuffix && anchorSuffix.length > 0) {
      const sliceEnd = pos + anchor!.length + anchorSuffix.length;
      const actualSuffix = text.slice(pos + anchor!.length, sliceEnd);
      const k = Math.min(anchorSuffix.length, actualSuffix.length);
      for (let n = 0; n < k; n++) {
        if (anchorSuffix[n] === actualSuffix[n]) {
          score++;
        } else {
          break;
        }
      }
    }
    return score;
  }

  const scored = candidates.map((pos) => ({ pos, score: scoreAt(pos) }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  // Minimum meaningful score: a single boundary-character match (e.g.
  // the trailing space of the prefix coincidentally aligns with a
  // word boundary in the candidate's surroundings) is noise. Require
  // ≥3 chars of cumulative boundary match — enough that the operator
  // can trust the disambiguation. Tunable if iPhone-walk surfaces
  // false negatives.
  const MIN_MEANINGFUL_SCORE = 3;
  if (!top || top.score < MIN_MEANINGFUL_SCORE) return null;
  const second = scored[1];
  if (second && second.score === top.score) return null; // tie — refuse to guess
  return { start: top.pos, end: top.pos + anchor.length };
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
