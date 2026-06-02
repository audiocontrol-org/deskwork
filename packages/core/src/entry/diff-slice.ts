/**
 * Per-comment inline diff-slicing for the "addressed" badge expansion
 * (Phase 8 Step 8.6.2).
 *
 * Computes the unified diff between iteration revision N-1 and revision
 * N for an entry, then returns only the hunks that intersect a specific
 * comment's anchor region. The studio's `er-marginalia-stamp` (the
 * "addressed" badge) calls this via the `/diff-slice` HTTP route so the
 * inline expansion can show the slice of the diff that addresses the
 * comment alongside the disposition reason.
 *
 * The disposition `reason` field becomes the header line; this module
 * provides the diff body. Empty slice (no intersecting hunks) tells the
 * client to render the "addressed without local diff — see the
 * disposition reason" fallback (Step 8.6.4).
 *
 * Anchor model:
 *   - Markdown comments carry `range: { start, end }` as CHARACTER
 *     offsets into the entry body's plainText. The slicer converts the
 *     character range to a line range against revision N's markdown
 *     (count `\n` before each offset) and intersects with each hunk's
 *     `newStart .. newStart + newLines - 1` line range.
 *   - Graphical comments carry `spatialAnchor` (pixel / dom-selector /
 *     svg-element). Spatial-anchor slicing lands when the graphical
 *     review surface ships (Phase 10/11); for this task the module
 *     returns an empty slice with the `notes` field set so the client
 *     can render the same Step 8.6.4 fallback for the graphical case.
 *
 * The hunks returned are the `Hunk` shape from `diff`'s
 * `structuredPatch` — `{ oldStart, oldLines, newStart, newLines, lines:
 * string[] }`. Lines are prefixed with `' '` / `'-'` / `'+'` per the
 * unified-diff convention so the client can render side-by-side
 * without re-parsing.
 */

import { structuredPatch, type Hunk } from 'diff';
import { getEntryIteration } from '../iterate/history.ts';
import { listEntryAnnotations } from './annotations.ts';
import type { CommentAnnotation, SpatialAnchor } from '../review/types.ts';

export interface DiffSliceResult {
  /**
   * The subset of unified-diff hunks that intersect the comment's
   * anchor region in revision `revision`. Empty array when the diff
   * computes successfully but no hunk overlaps the anchor (Step 8.6.4
   * fallback case) — distinct from a `notes` value that surfaces an
   * explanation (e.g. graphical anchor not yet slice-able).
   */
  readonly hunks: readonly Hunk[];

  /**
   * The disposition reason captured at iterate time (Step 8.1.2). The
   * client renders this as the header line above the diff hunks. When
   * the comment has no matching `address` annotation with disposition
   * `addressed` on `revision`, the resolver returns null (route maps
   * to 404).
   */
  readonly reason: string;

  /**
   * Non-empty when an operator-visible note explains an empty `hunks`
   * array beyond "no overlap" (e.g. `'spatial-anchor slicing lands when
   * the graphical review surface ships'` — see graphical comment
   * branch). The client renders this in place of the empty-slice
   * fallback when present.
   */
  readonly notes?: string;
}

/**
 * Convert character offsets `start`/`end` (into `text`'s plainText) to
 * inclusive 1-based line numbers. Mirrors the line-number basis the
 * `diff` library uses for unified-patch hunks (`newStart` is 1-based).
 *
 * Walks `text` once counting `\n` characters. Offsets past the end of
 * `text` clamp to the last line; offsets at exactly `text.length` map
 * to the same line as the final character.
 */
function charOffsetsToLines(
  text: string,
  start: number,
  end: number,
): { startLine: number; endLine: number } {
  let startLine = 1;
  let endLine = 1;
  let currentLine = 1;
  for (let i = 0; i < text.length; i++) {
    if (i === start) startLine = currentLine;
    if (i === end) endLine = currentLine;
    if (text[i] === '\n') currentLine++;
  }
  // If start/end land at or past text.length, they fall through the
  // loop without an assignment — clamp them to the final line.
  if (start >= text.length) startLine = currentLine;
  if (end >= text.length) endLine = currentLine;
  // start <= end is the contract; if a malformed annotation reverses
  // them, swap to keep the intersection well-defined.
  if (startLine > endLine) {
    return { startLine: endLine, endLine: startLine };
  }
  return { startLine, endLine };
}

/**
 * True when `[a, b]` and `[c, d]` overlap (inclusive endpoints). Used
 * to intersect a comment's converted line range with a hunk's
 * `newStart .. newStart + newLines - 1` range.
 */
function rangesOverlap(a: number, b: number, c: number, d: number): boolean {
  return a <= d && c <= b;
}

/**
 * Return the subset of `hunks` whose `newStart` line range intersects
 * `[startLine, endLine]`. Pure function — exported for direct unit
 * testing of the intersection logic without driving the full
 * `listEntryAnnotations` + `getEntryIteration` plumbing.
 */
export function intersectHunksWithLineRange(
  hunks: readonly Hunk[],
  startLine: number,
  endLine: number,
): Hunk[] {
  const out: Hunk[] = [];
  for (const hunk of hunks) {
    // A hunk with `newLines === 0` is a pure deletion; its line range
    // collapses to `[newStart, newStart - 1]` — treat as a zero-width
    // anchor at `newStart` so deletions at exactly the comment line
    // still register as overlapping.
    const hunkEnd = hunk.newLines > 0 ? hunk.newStart + hunk.newLines - 1 : hunk.newStart;
    if (rangesOverlap(hunk.newStart, hunkEnd, startLine, endLine)) {
      out.push(hunk);
    }
  }
  return out;
}

/**
 * Markdown-comment anchor slice. Converts character offsets to line
 * numbers against the revision-N body, then intersects with the
 * unified-diff hunks. Returns the subset.
 */
function sliceForMarkdownComment(
  comment: CommentAnnotation,
  oldMarkdown: string,
  newMarkdown: string,
): Hunk[] {
  if (!comment.range) return [];
  // `context: 0` gives tight hunks (no surrounding unchanged context
  // lines). The default `context: 3` would bleed three lines of
  // surrounding-but-unchanged content into each hunk's line range,
  // producing false positives during anchor intersection (a comment
  // anchored on an unchanged paragraph next to a changed one would
  // intersect the context-bleed range). The client renders both old
  // and new lines from the hunk's `lines` array anyway — the context
  // value affects which lines the hunk REPORTS, not the diff itself.
  const patch = structuredPatch(
    'old.md',
    'new.md',
    oldMarkdown,
    newMarkdown,
    '',
    '',
    { context: 0 },
  );
  const { startLine, endLine } = charOffsetsToLines(
    newMarkdown,
    comment.range.start,
    comment.range.end,
  );
  return intersectHunksWithLineRange(patch.hunks, startLine, endLine);
}

/**
 * Spatial-anchor slice. Graphical comments carry `spatialAnchor` (one
 * of `pixel` / `dom-selector` / `svg-element` — see
 * `schema/draft-annotation.ts`). Intersecting a spatial region with a
 * text-diff requires the graphical review surface's rendered layout
 * (pixel offsets resolve against the canvas; selectors against the
 * rendered DOM). That surface ships in Phase 10/11 (graphical-entries
 * Task 8.1.4 etc.); until then the module returns an empty slice with
 * a `notes` value naming the gap so the client renders the Step 8.6.4
 * fallback ("addressed without local diff — see the disposition
 * reason") rather than nothing at all.
 *
 * The function takes `_anchor` so the per-kind switch is local to
 * this module — when the graphical surface ships, this function
 * becomes the slicing implementation, not a deletion.
 */
function sliceForSpatialAnchor(
  _anchor: SpatialAnchor,
): { hunks: Hunk[]; notes: string } {
  return {
    hunks: [],
    notes: 'spatial-anchor slicing lands when the graphical review surface ships',
  };
}

/**
 * Compute the diff-slice for `commentId` on iteration revision
 * `revision`. Returns:
 *   - `{ hunks, reason }` on success.
 *   - `null` when the comment id doesn't resolve to a comment, OR when
 *     there is no `address` annotation with disposition `addressed`
 *     for `commentId` on `revision`. The route maps `null` to 404.
 *
 * The diff is computed between revisions `revision - 1` and `revision`.
 * `revision === 1` has no prior revision — the function returns
 * `{ hunks: [], reason, notes: 'no prior revision to diff against' }`.
 *
 * The disposition `reason` becomes the header line in the client's
 * render (Step 8.6.3). Legacy `addressed` annotations missing a
 * `reason` (pre-Step 8.1.2 schema tightening) read as an empty string
 * — the client renders Step 8.5.3's "no reason recorded" marker. New
 * data carries a non-empty `reason` (Step 8.1.2 schema gate +
 * Step 8.5.2 CLI gate).
 */
export async function computeDiffSlice(
  projectRoot: string,
  entryId: string,
  commentId: string,
  revision: number,
): Promise<DiffSliceResult | null> {
  const annotations = await listEntryAnnotations(projectRoot, entryId);
  const comment = annotations.find(
    (a): a is CommentAnnotation => a.type === 'comment' && a.id === commentId,
  );
  if (!comment) return null;
  const addressed = annotations.find(
    (a) =>
      a.type === 'address' &&
      a.commentId === commentId &&
      a.version === revision &&
      a.disposition === 'addressed',
  );
  if (!addressed || addressed.type !== 'address') return null;
  const reason = typeof addressed.reason === 'string' ? addressed.reason : '';

  if (revision <= 1) {
    return {
      hunks: [],
      reason,
      notes: 'no prior revision to diff against',
    };
  }
  const newRev = await getEntryIteration(projectRoot, entryId, revision);
  const oldRev = await getEntryIteration(projectRoot, entryId, revision - 1);
  if (!newRev || !oldRev) {
    return {
      hunks: [],
      reason,
      notes: `iteration revision ${!newRev ? revision : revision - 1} not found in journal`,
    };
  }

  // Spatial-anchor comments take the graphical branch even if they
  // also carry a `range` — the surface they were authored on is the
  // discriminator, and `spatialAnchor` is graphical-surface-specific.
  if (comment.spatialAnchor !== undefined) {
    const { hunks, notes } = sliceForSpatialAnchor(comment.spatialAnchor);
    return { hunks, reason, notes };
  }
  const hunks = sliceForMarkdownComment(comment, oldRev.markdown, newRev.markdown);
  return { hunks, reason };
}
