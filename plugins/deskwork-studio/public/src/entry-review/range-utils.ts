/**
 * Range / DOM-walking utilities for the entry-keyed press-check client.
 *
 * Same coordinate model as the legacy longform client: comment ranges
 * are character offsets against the rendered plain text of the current
 * version's draft body (text-node concatenation, NOT innerText —
 * innerText collapses inter-block whitespace differently).
 */

import { diff_match_patch } from 'diff-match-patch';
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
 * suffix), with diff-match-patch Bitap as a fuzzy fallback for the
 * case where the anchor text itself was minimally edited by an
 * iteration. Returns a current-body range when disambiguation
 * succeeds, null otherwise.
 *
 * Algorithm (per #200's design decision; reference:
 * https://www.w3.org/TR/annotation-model/#text-quote-selector
 * and Hypothesis's `dom-anchor-text-quote`):
 *
 *   1. Find all occurrences of `anchor` in the current text.
 *      - Zero matches AND originalStart provided → fall through to
 *        fuzzy fallback (the anchor text was edited).
 *      - Zero matches AND no originalStart → null.
 *      - Exactly one match → return that range. Single-match is
 *        unambiguous; prefix/suffix add no signal. Back-compat
 *        path for legacy comments without context.
 *      - 2+ matches → score each candidate by character-boundary
 *        match count against the captured prefix+suffix. Score the
 *        prefix from the right edge backward (chars closer to the
 *        anchor matter most) and the suffix from the left edge
 *        forward. Return the highest-scoring candidate. Null on
 *        score-of-zero, sub-threshold, or tie.
 *
 *   2. Fuzzy fallback (when exact returns null AND originalStart is
 *      provided): use diff-match-patch's Bitap-based `match_main`
 *      to find the closest approximate match near the original
 *      position. Threshold tuned to permit single-word edits but
 *      reject unrelated text. Returns approximate range —
 *      anchor.length applied to the matched start position (the
 *      end may drift slightly if the quote was edited; operator
 *      can correct via edit-comment if needed).
 *
 * Pass `originalStart` (the comment's `range.start` from when it
 * was authored) to enable the fuzzy fallback. Omit it for legacy
 * back-compat behavior (exact + prefix/suffix only).
 */
export function rebaseAnchor(
  root: HTMLElement,
  anchor: string | undefined,
  anchorPrefix?: string,
  anchorSuffix?: string,
  originalStart?: number,
): DraftRange | null {
  if (!anchor || anchor.length === 0) return null;
  const text = plainText(root);

  // Collect every occurrence of the anchor.
  const candidates: number[] = [];
  let i = -1;
  while ((i = text.indexOf(anchor, i + 1)) !== -1) candidates.push(i);

  if (candidates.length === 0) return fuzzyFallback(text, anchor, originalStart);
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
  if (!top || top.score < MIN_MEANINGFUL_SCORE) {
    return fuzzyFallback(text, anchor, originalStart);
  }
  const second = scored[1];
  if (second && second.score === top.score) {
    return fuzzyFallback(text, anchor, originalStart); // tie → try fuzzy
  }
  return { start: top.pos, end: top.pos + anchor.length };
}

/**
 * diff-match-patch Bitap fuzzy fallback. Returns a current-body range
 * when the anchor approximately matches near `originalStart`, null
 * otherwise. Returns null when `originalStart` is undefined (legacy
 * call path that opts out of fuzzy match).
 *
 * Threshold/distance tuned conservatively to avoid false-positive
 * matches against unrelated text:
 *   - Match_Threshold = 0.4 → accept ~40% similarity (Hypothesis
 *     default is 0.5; we tighten slightly because false positives
 *     on iterations are worse than missing a few real matches —
 *     the operator can re-anchor manually).
 *   - Match_Distance = 1000 → location-distance weight; matches
 *     within 1000 chars of the original position get a similarity
 *     bonus.
 */
function fuzzyFallback(
  text: string,
  anchor: string,
  originalStart: number | undefined,
): DraftRange | null {
  if (typeof originalStart !== 'number') return null;
  const dmp = new diff_match_patch();
  dmp.Match_Threshold = 0.4;
  dmp.Match_Distance = 1000;
  const pos = dmp.match_main(text, anchor, originalStart);
  if (pos === -1) return null;
  // End-position is approximate; uses the original anchor.length. If
  // the quote was edited, the highlighted text may not align exactly
  // with the actual matched substring. Acceptable trade-off — the
  // operator sees the comment near the right location and can adjust
  // via edit-comment if needed.
  return { start: pos, end: pos + anchor.length };
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
