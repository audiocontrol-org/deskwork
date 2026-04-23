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
   * Used on later versions to re-locate the anchor via `indexOf`: if the
   * quote appears exactly once in the new version the comment rebases,
   * otherwise it renders as unresolved-from-v{N}.
   */
  anchor?: string;
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
 */
export interface AddressAnnotation extends AnnotationBase {
  type: 'address';
  commentId: string;
  /** Version the disposition was recorded against (the just-produced version). */
  version: number;
  disposition: 'addressed' | 'deferred' | 'wontfix';
  reason?: string;
}

export type DraftAnnotation =
  | CommentAnnotation
  | EditAnnotation
  | ApproveAnnotation
  | RejectAnnotation
  | ResolveAnnotation
  | AddressAnnotation;

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
