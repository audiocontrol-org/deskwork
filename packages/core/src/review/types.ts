/**
 * Editorial review pipeline — data model.
 *
 * Ported from audiocontrol.org's scripts/lib/editorial-review/types.ts.
 * The `Site` type was replaced with `string` since deskwork makes sites
 * config-driven rather than a hardcoded enum. Platform stays typed —
 * it's a bounded set in deskwork's editorial types.
 *
 * The review pipeline is a journal-backed workflow system: each post
 * draft gets a workflow, each iteration produces a new version, and
 * every event (version, annotation, state transition) is an append-only
 * history entry. Callers reconstruct state by reading the journal.
 */

import type { Platform } from '../types.ts';

export type DraftWorkflowState =
  | 'open'
  | 'in-review'
  | 'iterating'
  | 'approved'
  | 'applied'
  | 'cancelled';

export type ContentKind = 'longform' | 'shortform' | 'outline';

export type OriginatedBy = 'agent' | 'operator';

/**
 * Annotation category for comments — used by the voice-drift report to
 * aggregate which skill principles produce the most corrections. `other`
 * is the catch-all.
 */
export type AnnotationCategory =
  | 'voice-drift'
  | 'missing-receipt'
  | 'tutorial-framing'
  | 'saas-vocabulary'
  | 'fake-authority'
  | 'structural'
  | 'other';

/** Character-offset range against the raw markdown source. */
export interface DraftRange {
  start: number;
  end: number;
}

/**
 * Spatial anchor for graphical-entry comments (Phase 8 Step 8.1.1).
 *
 * Where a textual comment's `range` + `anchor` locates the comment in
 * the raw markdown source, a `spatialAnchor` locates the comment on
 * the entry's primary visual surface — a mockup, an image, an SVG
 * diagram, anything rendered as the entry's content. The three `kind`s
 * are mutually exclusive in interpretation AND in shape — each variant
 * declares only the fields its kind requires, and the runtime
 * `SpatialAnchorSchema` in `schema/draft-annotation.ts` enforces the
 * per-kind shape at parse time (AUDIT-20260601-07):
 *
 *   - `pixel` — `x`/`y` are pixel coordinates against the rendered
 *     visual's intrinsic dimensions. Used for image-style entries
 *     where DOM selectors are not meaningful. No `selector` field.
 *   - `dom-selector` — `selector` is a CSS selector that identifies
 *     the anchored element within the rendered HTML mockup. No
 *     `x`/`y` fields.
 *   - `svg-element` — `selector` is a CSS selector that resolves to
 *     an SVG element (e.g. `g.layer-2 > rect[id="logo"]`). No `x`/`y`
 *     fields.
 *
 * The TS type is a discriminated union over `kind` so consumers narrow
 * structurally and the compiler refuses access to fields that don't
 * belong to the narrowed variant.
 */
export interface SpatialAnchorPixel {
  kind: 'pixel';
  x: number;
  y: number;
}

export interface SpatialAnchorDomSelector {
  kind: 'dom-selector';
  selector: string;
}

export interface SpatialAnchorSvgElement {
  kind: 'svg-element';
  selector: string;
}

export type SpatialAnchor =
  | SpatialAnchorPixel
  | SpatialAnchorDomSelector
  | SpatialAnchorSvgElement;

interface AnnotationBase {
  /** ISO-8601 timestamp when the annotation was recorded. */
  createdAt: string;
  /** Workflow the annotation belongs to. */
  workflowId: string;
  /** Monotonic id within the workflow (server-assigned). */
  id: string;
}

export interface CommentAnnotation extends AnnotationBase {
  type: 'comment';
  /** Draft version the comment was attached to. */
  version: number;
  /** Character range against the raw markdown of that version. */
  range: DraftRange;
  /** Free-text operator comment. */
  text: string;
  /** Optional category for review-report aggregation. */
  category?: AnnotationCategory;
  /**
   * The displayed text the operator selected when making the comment.
   * On later versions, the client re-locates the anchor per the W3C
   * Web Annotation TextQuoteSelector algorithm (see `rebaseAnchor` in
   * `plugins/deskwork-studio/public/src/entry-review/range-utils.ts`):
   *
   *   1. Single match of `anchor` in the current text → rebase to that
   *      position. Back-compat path; works for legacy comments that
   *      pre-date the prefix/suffix fields.
   *   2. Multiple matches with `anchorPrefix`/`anchorSuffix` → score
   *      each candidate by boundary character match against the
   *      captured surrounding context; highest non-zero non-tied score
   *      wins.
   *   3. Otherwise → unresolved-from-v{N}.
   */
  anchor?: string;
  /**
   * Up to ~64 characters of the displayed text *immediately before*
   * the anchor at capture time. Used by `rebaseAnchor` to
   * disambiguate when the anchor quote appears multiple times in a
   * later version (see `anchor` JSDoc). W3C Web Annotation Model
   * TextQuoteSelector's `prefix` field
   * (https://www.w3.org/TR/annotation-model/#text-quote-selector).
   * Optional for back-compat with legacy comments.
   */
  anchorPrefix?: string;
  /**
   * Up to ~64 characters of the displayed text *immediately after*
   * the anchor at capture time. W3C TextQuoteSelector's `suffix`
   * field. Optional for back-compat.
   */
  anchorSuffix?: string;
  /**
   * Phase 8 Step 8.1.1 — threading. The id of the root `comment`
   * annotation this comment replies to. Absent when the comment is
   * itself a root (top-level) comment. Threading is single-level:
   * a reply's `replyTo` always points at a root comment, never at
   * another reply.
   */
  replyTo?: string;
  /**
   * Phase 8 Step 8.1.1 — screenshot attachments. Relative paths under
   * `<entryDir>/scrapbook/screenshots/`, each pointing at an
   * operator-attached screenshot bound to this comment. Stored as
   * relative paths so the entry tree is portable. Empty / absent
   * when the comment has no attachments.
   */
  attachments?: string[];
  /**
   * Phase 8 Step 8.1.1 — spatial anchor for graphical entries. When
   * present, the comment is anchored on the entry's primary visual
   * (mockup, image, SVG) per the {@link SpatialAnchor} contract.
   * Independent of `range` — a comment may carry both (a markdown
   * range AND a spatial pin) or neither.
   */
  spatialAnchor?: SpatialAnchor;
}

export interface EditAnnotation extends AnnotationBase {
  type: 'edit';
  /** Version that was edited (the source of the edit). */
  beforeVersion: number;
  /** Full markdown of the new version the edit produced. */
  afterMarkdown: string;
  /** Unified diff of afterMarkdown against the beforeVersion's markdown. */
  diff: string;
}

export interface ApproveAnnotation extends AnnotationBase {
  type: 'approve';
  /** Version the operator approved. */
  version: number;
}

export interface RejectAnnotation extends AnnotationBase {
  type: 'reject';
  /** Version the operator rejected. */
  version: number;
  /** Optional reason free-text. */
  reason?: string;
}

/**
 * Marks a comment annotation as resolved. Emitted separately rather than
 * mutating the comment because the journal is append-only — readers
 * reconstruct resolved state by scanning for the most recent resolve
 * annotation per commentId. `resolved: false` re-opens.
 */
export interface ResolveAnnotation extends AnnotationBase {
  type: 'resolve';
  commentId: string;
  resolved: boolean;
}

/**
 * Per-iteration agent disposition for a comment. Written when a new
 * version addresses (or defers) an operator comment. Latest-wins when
 * rendering the sidebar badge.
 *
 * Phase 8 Step 8.1.2 (Part 2) — `reason` is REQUIRED (non-empty) on every
 * `disposition === 'addressed'` instance, per the PRD acceptance
 * criterion ("required free-text disposition reason captured at iterate
 * time"). `deferred` / `wontfix` continue to accept an optional reason.
 *
 * Modeled as a discriminated union on `disposition`. The runtime schema
 * (`DraftAnnotationSchema` in `schema/draft-annotation.ts`) enforces the
 * non-empty-`reason`-when-`addressed` constraint via a top-level
 * `superRefine` (a nested discriminated union would collide with the
 * outer `type` discriminator); the TS type achieves the same
 * compile-time discrimination via the three-variant union below.
 */
interface AddressAnnotationAddressed extends AnnotationBase {
  type: 'address';
  commentId: string;
  /** Version the disposition was recorded against (the just-produced version). */
  version: number;
  disposition: 'addressed';
  /** Required non-empty free-text reason — Phase 8 Step 8.1.2 contract. */
  reason: string;
}

interface AddressAnnotationDeferred extends AnnotationBase {
  type: 'address';
  commentId: string;
  version: number;
  disposition: 'deferred';
  reason?: string;
}

interface AddressAnnotationWontfix extends AnnotationBase {
  type: 'address';
  commentId: string;
  version: number;
  disposition: 'wontfix';
  reason?: string;
}

export type AddressAnnotation =
  | AddressAnnotationAddressed
  | AddressAnnotationDeferred
  | AddressAnnotationWontfix;

/**
 * Edit a previously-recorded `comment` annotation. Append-only: the
 * original comment annotation is preserved on disk; the folded view
 * (returned by `listEntryAnnotations`) replaces the named comment's
 * mutable fields with the latest edit-comment payload, in journal
 * order.
 *
 * Each field is optional — a partial payload preserves prior values
 * (text-only edit, range-only edit, etc.). At least one of `text` /
 * `range` / `category` / `anchor` must be present at write time
 * (validated by the route + the writer).
 */
export interface EditCommentAnnotation extends AnnotationBase {
  type: 'edit-comment';
  /** The original `comment` annotation's id. */
  commentId: string;
  /** New comment text — replaces the prior value when present. */
  text?: string;
  /** New character range — replaces the prior value when present. */
  range?: DraftRange;
  /** New category — replaces the prior value when present. */
  category?: AnnotationCategory;
  /** New anchor (selected-text quote) — replaces the prior value when present. */
  anchor?: string;
  /**
   * Phase 8 Step 8.4.1 — new attachment list. Replaces the prior value
   * when present (full-replacement semantics, identical to every other
   * field on this patch). Callers wishing to APPEND a screenshot pass
   * `[...priorAttachments, newRelativePath]`; the writer records the
   * full intended state so the journal event is self-describing.
   */
  attachments?: string[];
}

/**
 * Tombstone a `comment` annotation. Append-only: the original is left
 * in place on disk; the folded view drops it from the active list.
 * Distinct from `resolve` — resolve says "this comment was addressed",
 * delete says "this comment was a mistake".
 */
export interface DeleteCommentAnnotation extends AnnotationBase {
  type: 'delete-comment';
  /** The original `comment` annotation's id. */
  commentId: string;
}

/**
 * Archive a `comment` annotation as part of a stage transition (#200,
 * Issue #222 hybrid refinement). Append-only: the original is left in
 * place on disk; the folded view drops it from the active list. Distinct
 * from `delete-comment` — archive captures "this comment was made
 * against a prior stage's content; the document has since evolved, so
 * range/anchor stability cannot be guaranteed against the new content."
 *
 * The optional `priorStage` field records which stage the comment was
 * archived OUT OF — useful for audit views that group archived comments
 * by stage of origin.
 */
export interface ArchiveCommentAnnotation extends AnnotationBase {
  type: 'archive-comment';
  /** The original `comment` annotation's id. */
  commentId: string;
  /** The stage the document was at when the comment was archived. */
  priorStage?: string;
}

export type DraftAnnotation =
  | CommentAnnotation
  | EditAnnotation
  | ApproveAnnotation
  | RejectAnnotation
  | ResolveAnnotation
  | AddressAnnotation
  | EditCommentAnnotation
  | DeleteCommentAnnotation
  | ArchiveCommentAnnotation;

export interface DraftVersion {
  /** 1-based version number; v1 is the initial draft. */
  version: number;
  /** Full raw markdown of this version. */
  markdown: string;
  /** ISO-8601 when this version was recorded. */
  createdAt: string;
  /** Who produced this version — the agent or the operator (edit mode). */
  originatedBy: OriginatedBy;
}

export interface DraftWorkflowItem {
  /** Stable UUID for this workflow. */
  id: string;
  /**
   * Stable UUID of the target calendar entry. Preferred join key for
   * `matchesKey` / `findOpenByKey` — survives slug renames. Optional
   * for legacy workflows created before entry UUIDs landed; those keep
   * joining via the slug fallback.
   */
  entryId?: string;
  /** Which site this draft belongs to (deskwork config site slug). */
  site: string;
  /** Post slug (blog entry slug for longform; calendar entry slug for shortform). */
  slug: string;
  /** longform / shortform / outline. */
  contentKind: ContentKind;
  /** For shortform only: which distribution platform. */
  platform?: Platform;
  /** For shortform only: channel (e.g. `r/synthdiy`). */
  channel?: string;
  /** Current state in the review pipeline. */
  state: DraftWorkflowState;
  /** Version number of the most recent DraftVersion for this workflow. */
  currentVersion: number;
  /** ISO-8601 when the workflow was first created. */
  createdAt: string;
  /** ISO-8601 when last modified (state transition or new version). */
  updatedAt: string;
}

/**
 * A single entry in the editorial-review history journal. Discriminated by
 * `kind` so versions, annotations, and workflow transitions interleave in
 * one stream.
 */
export type DraftHistoryEntry =
  | { kind: 'workflow-created'; at: string; workflow: DraftWorkflowItem }
  | {
      kind: 'workflow-state';
      at: string;
      workflowId: string;
      from: DraftWorkflowState;
      to: DraftWorkflowState;
    }
  | { kind: 'version'; at: string; workflowId: string; version: DraftVersion }
  | { kind: 'annotation'; at: string; annotation: DraftAnnotation };

/** Allowed state transitions. All others are invalid. */
export const VALID_TRANSITIONS: Readonly<
  Record<DraftWorkflowState, readonly DraftWorkflowState[]>
> = {
  open: ['in-review', 'cancelled'],
  'in-review': ['iterating', 'approved', 'cancelled'],
  iterating: ['in-review', 'cancelled'],
  approved: ['applied', 'cancelled'],
  applied: [],
  cancelled: [],
};

export function isValidTransition(
  from: DraftWorkflowState,
  to: DraftWorkflowState,
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
