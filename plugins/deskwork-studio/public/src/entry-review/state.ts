/**
 * Shared types + state-parsing for the entry-keyed press-check client.
 *
 * Mirrors the relocated `EntryReviewState` payload emitted by the
 * server-side renderer (`packages/studio/src/pages/entry-review/index.ts`).
 * The state lives in `<script type="application/json" id="entry-review-state">`
 * and gets JSON.parsed once on boot.
 */

export interface DraftRange {
  start: number;
  end: number;
}

export interface EntryReviewState {
  entryId: string;
  slug: string;
  site: string;
  currentStage: string;
  currentVersion: number | null;
  markdown: string;
  historical: boolean;
}

export interface CommentAnnotation {
  id: string;
  type: 'comment';
  workflowId: string;
  version: number;
  range: DraftRange;
  text: string;
  category?: string;
  createdAt: string;
  /** Quote text captured at comment time. */
  anchor?: string;
  /**
   * #200 — W3C TextQuoteSelector context for re-anchoring when the
   * `anchor` quote re-occurs in a later revision. ~64 chars before
   * (`anchorPrefix`) and after (`anchorSuffix`) the quote at capture
   * time. Optional on the wire so legacy comments parse unchanged.
   */
  anchorPrefix?: string;
  anchorSuffix?: string;
  /**
   * Phase 8 Step 8.1.1 — threading. Present on REPLY comments and
   * holds the id of the root comment this is a reply to. Absent on
   * root comments. Threading is single-level (see Task 8.2 — replies
   * to replies flatten under the original root); a value here that
   * doesn't resolve to a known root comment is treated as an orphan
   * reply at render time, not a parse failure.
   */
  replyTo?: string;
  /**
   * Phase 8 Step 8.1.1 — screenshot attachments bound to this
   * comment, stored as relative paths under
   * `<entryDir>/scrapbook/screenshots/`. Empty / absent when none.
   */
  attachments?: string[];
  /**
   * Phase 8 Step 8.1.1 — spatial anchor for graphical entries. When
   * present, the comment is anchored on the entry's primary visual.
   * The renderer in Task 8.2 doesn't yet surface the spatial anchor
   * UI; the field is carried through so the read path can light it
   * up in a later task without a schema-shape migration.
   */
  spatialAnchor?: {
    kind: 'pixel' | 'dom-selector' | 'svg-element';
    selector?: string;
    x?: number;
    y?: number;
  };
}

export interface ResolveAnnotation {
  id: string;
  type: 'resolve';
  workflowId: string;
  commentId: string;
  resolved: boolean;
  createdAt: string;
}

export interface AddressAnnotation {
  id: string;
  type: 'address';
  workflowId: string;
  commentId: string;
  version: number;
  disposition: 'addressed' | 'deferred' | 'wontfix';
  reason?: string;
  createdAt: string;
}

export type AnyAnnotation =
  | CommentAnnotation
  | ResolveAnnotation
  | AddressAnnotation;

export type AnnotationStatus = 'current' | 'rebased' | 'unresolved';

/**
 * Extract the page state from the embedded JSON tag. Returns null when
 * the tag is missing — the entry-review-client boot path treats that as
 * "not on an entry-review page" and exits silently.
 */
export function readEntryReviewState(): EntryReviewState | null {
  const stateEl = document.getElementById('entry-review-state');
  if (!stateEl) return null;
  const raw = stateEl.textContent || '{}';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isEntryReviewState(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isEntryReviewState(v: unknown): v is EntryReviewState {
  if (typeof v !== 'object' || v === null) return false;
  const entryId = Reflect.get(v, 'entryId');
  const slug = Reflect.get(v, 'slug');
  const site = Reflect.get(v, 'site');
  const currentStage = Reflect.get(v, 'currentStage');
  const currentVersion = Reflect.get(v, 'currentVersion');
  const markdown = Reflect.get(v, 'markdown');
  const historical = Reflect.get(v, 'historical');
  return (
    typeof entryId === 'string' &&
    typeof slug === 'string' &&
    typeof site === 'string' &&
    typeof currentStage === 'string' &&
    (currentVersion === null || typeof currentVersion === 'number') &&
    typeof markdown === 'string' &&
    typeof historical === 'boolean'
  );
}

/**
 * Required-element accessor — throws when an expected DOM hook is
 * missing so the failure surfaces loudly during smoke testing.
 */
export function reqEl<T extends Element = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`entry-review: missing required element ${selector}`);
  return el;
}

/**
 * Optional-element accessor for chrome bits that conditionally render
 * (the strip on error pages, focus-mode controls outside edit, etc.).
 */
export function optEl<T extends Element = HTMLElement>(
  selector: string,
): T | null {
  return document.querySelector<T>(selector);
}
