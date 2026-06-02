/**
 * Zod schema mirror of `DraftAnnotation` from `../review/types.ts`.
 *
 * The TS interface union in `review/types.ts` is the source of truth for
 * the *shape*. This file provides a runtime validator for the same shape
 * so journal events carrying a `DraftAnnotation` payload can be parsed
 * via `JournalEventSchema.safeParse` at the read boundary.
 *
 * The union variants here mirror `CommentAnnotation | EditAnnotation |
 * ApproveAnnotation | RejectAnnotation | ResolveAnnotation |
 * AddressAnnotation`. If a new variant is added there, mirror it here.
 */

import { z } from 'zod';

const AnnotationCategoryEnum = z.enum([
  'voice-drift',
  'missing-receipt',
  'tutorial-framing',
  'saas-vocabulary',
  'fake-authority',
  'structural',
  'other',
]);

const RangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

/**
 * Phase 8 Step 8.1.1 — spatial anchor for graphical-entry comments.
 * Mirror of {@link import('../review/types.ts').SpatialAnchor}.
 *
 * Three `kind`s — `pixel`, `dom-selector`, `svg-element` — capture
 * which surface the anchor lives on. The schema enforces the per-kind
 * shape via `z.discriminatedUnion('kind', [...])` at parse time
 * (AUDIT-20260601-07): each variant requires exactly the fields its
 * kind needs and forbids the others.
 *
 *   - `pixel` — `{ x, y }` REQUIRED; `selector` is not declared on this
 *     variant (z.object's strict-on-unknown behavior rejects it).
 *   - `dom-selector` — `{ selector }` REQUIRED; `x`/`y` are not declared
 *     on this variant.
 *   - `svg-element` — `{ selector }` REQUIRED; `x`/`y` are not declared
 *     on this variant.
 *
 * Bad shapes — `{kind:'pixel'}` (no coords), `{kind:'dom-selector'}`
 * (no selector), `{kind:'pixel', selector:'#x'}` (selector on pixel),
 * `{kind:'svg-element', x, y}` (coords on selector kind) — all fail
 * `safeParse`. Annotations land in the append-only journal where bad
 * data is permanent; per-kind enforcement at the schema is the only
 * place to keep that data sane.
 *
 * Adding `kind` values requires updating both this schema and the TS
 * discriminated union in `review/types.ts` in lockstep.
 */
// Each variant uses `.strict()` so unknown fields are REJECTED at
// parse time, not silently stripped (zod's `z.object` default).
// Without `.strict()`, `{kind:'pixel', selector:'#x'}` would parse —
// the selector field would be stripped — and the bug-factory pattern
// would persist for fields-on-the-wrong-kind cases. `.strict()` is the
// hard wall that makes the per-kind shape contract truly enforced.
const SpatialAnchorPixelSchema = z
  .object({
    kind: z.literal('pixel'),
    x: z.number(),
    y: z.number(),
  })
  .strict();

const SpatialAnchorDomSelectorSchema = z
  .object({
    kind: z.literal('dom-selector'),
    selector: z.string(),
  })
  .strict();

const SpatialAnchorSvgElementSchema = z
  .object({
    kind: z.literal('svg-element'),
    selector: z.string(),
  })
  .strict();

/**
 * AUDIT-20260601-08 — exported so the `entry-anchor-shape` doctor rule
 * (`doctor/rules/entry-anchor-shape.ts`) can validate spatial anchors
 * on legacy journal events that bypass the full `DraftAnnotationSchema`
 * read path. The rule reads raw journal JSON, isolates each comment
 * annotation's `spatialAnchor`, and `safeParse`s against this schema
 * specifically so it can surface malformed legacy shapes (the strict
 * `JournalEventSchema.safeParse` in `journal/read.ts` silently SKIPS
 * such events; the doctor rule needs to SURFACE them).
 */
export const SpatialAnchorSchema = z.discriminatedUnion('kind', [
  SpatialAnchorPixelSchema,
  SpatialAnchorDomSelectorSchema,
  SpatialAnchorSvgElementSchema,
]);

const BaseFields = {
  /** ISO-8601 timestamp when the annotation was recorded. */
  createdAt: z.string().datetime(),
  /** Workflow the annotation belongs to (legacy field; entry-keyed
   * annotations still carry it for type compatibility with the
   * workflow-keyed `DraftAnnotation` union, but the entry-store does
   * not key off it). */
  workflowId: z.string(),
  /** Server-assigned id. */
  id: z.string(),
} as const;

/**
 * W3C Web Annotation Data Model alignment (Phase 8 Step 8.1.3).
 *
 * Per Phase 1's decision-doc (`docs/studio-design/ACCEPTED/2026-05-26-graphical-review-prior-art/brief.md`)
 * the project adopts `@recogito/text-annotator` + `W3CTextFormat` for
 * text-range pins. The W3C Web Annotation Data Model is the structural
 * base; the deskwork-namespaced fields below are the extension.
 *
 * Field-by-field mapping to the W3C model:
 *
 *   - `CommentAnnotation` (this schema) ≡ W3C `Annotation` with
 *     `bodyValue: <text>` plus a selector chosen by the kind of pin
 *     being recorded (TextQuoteSelector / TextPositionSelector for
 *     markdown character ranges; FragmentSelector or XPathSelector for
 *     DOM-keyed pins; SvgSelector for free-form region pins).
 *
 *   - `range` (`RangeSchema`) ≡ W3C `TextPositionSelector` /
 *     `TextQuoteSelector`. The recogito library emits both selectors
 *     for the same annotation; the deskwork schema currently persists
 *     only the position form, with the quote shape recoverable from
 *     the underlying markdown bytes at read time.
 *
 *   - `text` (this schema) ≡ W3C `bodyValue` (a plain-text comment
 *     body). The W3C model also supports a structured `Body` with its
 *     own type / value / purpose; deskwork's v1 single-string `text`
 *     maps to the simpler `bodyValue` shape. Future thread / disposition
 *     fields are layered as additional bodies with their own purpose.
 *
 *   - `replyTo` (Step 8.1.1) ≡ W3C single-level reply via a
 *     `motivation: 'replying'` annotation whose `target` points at
 *     another annotation. deskwork's reply model is one level deep
 *     (root + replies; no nested reply-to-reply); this matches the
 *     `replying` motivation cleanly and avoids the JSON-LD graph
 *     traversal cost of nested-reply models.
 *
 *   - `attachments` (Step 8.1.1) ≡ W3C `body` of type `Image`. The
 *     deskwork schema stores attachments as a `string[]` of relative
 *     paths under `<entryDir>/scrapbook/screenshots/` rather than the
 *     verbose JSON-LD body shape; the path-only form is the smallest
 *     persistent representation that the studio can resolve to an
 *     `<img>` src + a server can resolve to a file on disk.
 *
 *   - `spatialAnchor` (Step 8.1.1, discriminated union over `kind`)
 *     ≡ W3C selectors:
 *       - `kind: 'pixel'` (with `x` + `y` numbers) ≡ W3C
 *         `FragmentSelector` with a pixel-fragment value (or an
 *         `SvgSelector` describing a point primitive).
 *       - `kind: 'dom-selector'` (with `selector` CSS string) ≡ W3C
 *         `XPathSelector` (CSS-selector form is a deskwork variant).
 *       - `kind: 'svg-element'` (with `selector` id-or-path string)
 *         ≡ W3C `FragmentSelector` keyed by an SVG element id (the
 *         W3C `SvgSelector` shape would carry an inline SVG fragment;
 *         deskwork references the element by id instead).
 *
 *   - `category` ≡ W3C `purpose` on a non-comment body (e.g.
 *     `motivation: 'tagging'` with a body whose `purpose` carries
 *     the category label). deskwork v1 inlines the category on the
 *     comment annotation itself; W3C alignment is a render-side
 *     translation when serializing for export.
 *
 *   - `anchor` ≡ W3C selector hint (an opaque string that callers
 *     resolved to a DOM element prior to recogito adoption). New
 *     pins are recorded via the recogito-emitted W3C selectors; the
 *     legacy `anchor` field is retained for read compatibility.
 *
 * The additive Phase 8 fields (`replyTo`, `attachments`,
 * `spatialAnchor`) are independently optional, so legacy single-
 * comment annotations parse unchanged (Step 8.1.4 invariant).
 *
 * The TS source-of-truth for the runtime shape lives at
 * `review/types.ts:CommentAnnotation`.
 */
const CommentAnnotation = z.object({
  ...BaseFields,
  type: z.literal('comment'),
  version: z.number().int(),
  range: RangeSchema,
  text: z.string(),
  category: AnnotationCategoryEnum.optional(),
  anchor: z.string().optional(),
  // Phase 8 Step 8.1.1 — additive fields. Existing single-comment
  // annotations without any of these continue to parse unchanged.
  // The TS source-of-truth lives at `review/types.ts:CommentAnnotation`.
  // W3C Web Annotation mapping for each of these fields is documented
  // in the schema-level docstring above (Step 8.1.3).
  replyTo: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  spatialAnchor: SpatialAnchorSchema.optional(),
});

const EditAnnotation = z.object({
  ...BaseFields,
  type: z.literal('edit'),
  beforeVersion: z.number().int(),
  afterMarkdown: z.string(),
  diff: z.string(),
});

const ApproveAnnotation = z.object({
  ...BaseFields,
  type: z.literal('approve'),
  version: z.number().int(),
});

const RejectAnnotation = z.object({
  ...BaseFields,
  type: z.literal('reject'),
  version: z.number().int(),
  reason: z.string().optional(),
});

const ResolveAnnotation = z.object({
  ...BaseFields,
  type: z.literal('resolve'),
  commentId: z.string(),
  resolved: z.boolean(),
});

const AddressAnnotation = z.object({
  ...BaseFields,
  type: z.literal('address'),
  commentId: z.string(),
  version: z.number().int(),
  disposition: z.enum(['addressed', 'deferred', 'wontfix']),
  /**
   * Phase 8 Step 8.1.2 (Part 2) — `reason` becomes REQUIRED (non-empty)
   * when `disposition === 'addressed'`. The base shape keeps `reason`
   * declared as `z.string().optional()` so this ZodObject remains a
   * valid member of `DraftAnnotationSchema`'s outer
   * `z.discriminatedUnion('type', ...)` (which requires plain
   * `ZodObject` members — `.superRefine` returns `ZodEffects`, which
   * the outer union cannot accept as a direct member). The conditional
   * required-ness is enforced via the top-level `superRefine` chained
   * on `DraftAnnotationSchema` below — same place every
   * `address`-typed value passes through during `safeParse`.
   */
  reason: z.string().optional(),
});

const EditCommentAnnotation = z.object({
  ...BaseFields,
  type: z.literal('edit-comment'),
  commentId: z.string(),
  text: z.string().optional(),
  range: RangeSchema.optional(),
  category: AnnotationCategoryEnum.optional(),
  anchor: z.string().optional(),
  // Phase 8 Step 8.4.1 — attaching a screenshot to an existing comment
  // mutates `attachments[]` via this patch shape. The full-replacement
  // semantics mirror every other field on this annotation: a present
  // `attachments` array REPLACES the prior value in the folded view
  // (`applyEdits` in `entry/annotations.ts`); an absent `attachments`
  // preserves the prior value. Callers wishing to APPEND a screenshot
  // pass `[...priorAttachments, newPath]` and the writer records the
  // full intended state — keeps the journal events self-contained
  // without forcing a fold-time append heuristic.
  attachments: z.array(z.string()).optional(),
});

const DeleteCommentAnnotation = z.object({
  ...BaseFields,
  type: z.literal('delete-comment'),
  commentId: z.string(),
});

const ArchiveCommentAnnotation = z.object({
  ...BaseFields,
  type: z.literal('archive-comment'),
  commentId: z.string(),
  priorStage: z.string().optional(),
});

/**
 * Phase 8 Step 8.1.2 (Part 2) — `reason` is REQUIRED (non-empty) on every
 * `address` annotation whose `disposition === 'addressed'`. Per the PRD
 * acceptance criterion ("required free-text disposition reason captured
 * at iterate time"), the studio's disposition-trace affordance (Task
 * 8.6) renders the reason as the header line on the inline diff
 * expansion — an `addressed` claim without a reason has no operator-
 * readable label to show next to the diff slice.
 *
 * `deferred` and `wontfix` continue to accept an OPTIONAL `reason`. The
 * contract is intentionally scoped to `addressed` only.
 *
 * Why a top-level `.superRefine` rather than nesting a
 * `z.discriminatedUnion('disposition', ...)` inside the `address`
 * variant: zod's `discriminatedUnion` requires plain `ZodObject`
 * members; a nested discriminated union would collapse three
 * `type: 'address'` variants into the outer discriminator and collide,
 * AND wrapping the inner `AddressAnnotation` with `.superRefine`
 * would return `ZodEffects` (also disallowed as a direct member of
 * the outer discriminated union). Pulling the refinement up to the
 * top-level schema is the idiomatic zod escape hatch and keeps every
 * variant a plain object — same shape every consumer expects.
 *
 * Legacy data (annotations on disk that pre-date this tightening)
 * fails `safeParse` and is silently SKIPPED by
 * `JournalEventSchema.safeParse` in `journal/read.ts` — same shape as
 * the AUDIT-20260601-07 cutover. The companion doctor rule
 * `entry-address-reason-missing` (Part 1 of this step) SURFACES the
 * legacy data BEFORE it disappears from the read stream.
 */
export const DraftAnnotationSchema = z
  .discriminatedUnion('type', [
    CommentAnnotation,
    EditAnnotation,
    ApproveAnnotation,
    RejectAnnotation,
    ResolveAnnotation,
    AddressAnnotation,
    EditCommentAnnotation,
    DeleteCommentAnnotation,
    ArchiveCommentAnnotation,
  ])
  .superRefine((val, ctx) => {
    if (val.type !== 'address') return;
    if (val.disposition !== 'addressed') return;
    if (typeof val.reason !== 'string' || val.reason.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message:
          "`reason` is required (non-empty) when `disposition === 'addressed'` " +
          '(Phase 8 Step 8.1.2 contract)',
      });
    }
  });
