# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

graphical-entries

## Feature scope (workplan / PRD summary)

- [ ] Step 12.3.1: "Save markup" exports the composed canvas (base + markup) as PNG to `<entryDir>/scrapbook/screenshots/<comment-id>-<timestamp>-marked.png`.
- [ ] Step 12.3.2: The raw capture stays at `<comment-id>-<timestamp>.png` (untouched).
- [ ] Step 12.3.3: Comment annotation's `attachments[]` array updated to reference the marked file path.
- [ ] Step 12.3.4: Attachment metadata gains `originalAttachment: <raw-file-path>` so the operator can re-mark the raw or compare versions.

### Task 12.4: Studio rendering of marked attachments

- [ ] Step 12.4.1: Comment renders the marked version by default with a small "original" toggle in the chrome.
- [ ] Step 12.4.2: Clicking the marked version opens a full-size lightbox; clicking the toggle in the lightbox swaps to raw.

### Task 12.5: Re-mark workflow

- [ ] Step 12.5.1: Operator can re-mark an existing screenshot: opens the markup editor pre-loaded with the raw + prior markup (loaded as separate layer for further editing).
- [ ] Step 12.5.2: Save creates a new file (e.g. `<comment-id>-<timestamp>-marked-v2.png`); the comment's `attachments[]` updates to the new version; prior versions preserved in the journal.

### Task 12.6: Integration test + mobile verification

- [ ] Step 12.6.1: Tmp-fixture: capture a fixture screenshot; mark with each of the 5 tools; save; verify the marked file persists alongside raw; verify the comment renders both versions.
- [ ] Step 12.6.2: Touch-screen verification: run a Playwright test against an iPhone-class viewport; assert each tool works with touch input (no hover-only interaction).

**Acceptance Criteria:**

- [ ] Markup editor supports all five tools (arrow / box / freehand / text-label / blur-region) + undo / redo.
- [ ] Marked screenshot persists alongside the raw capture; comment annotation references both via `attachments[]` + `originalAttachment`.
- [ ] Re-mark workflow preserves prior markup versions in the journal.
- [ ] Touch-screen markup works without hover-only interactions.

## Closing milestone: scope-discovery v1 dogfood TF summary + audit handoff

**Deliverable:** Final TF entry in `tooling-feedback.md` summarizing the dogfood result (what worked / what didn't / what needs follow-up); closing comment on the feature PR linking the log; handoff to the scope-discovery team to import as `AUDIT-<date>-<NN>` entries in their audit log. Per PRD § Secondary deliverable.

### Task C.1: Aggregate TF entries + identify patterns

- [ ] Step C.1.1: Walk every TF-NNN entry in `tooling-feedback.md`; tabulate by category (A / AM / CL / GATE / DSC / MISC) + severity (high / medium / low).
- [ ] Step C.1.2: Identify recurring patterns — same root cause surfacing in multiple TF entries; promote those to GH issues if not already filed.
- [ ] Step C.1.3: Tabulate dispositions: how many TF entries closed by an in-flight fix during this feature vs how many remain open at feature-close.

### Task C.2: Write final TF summary

- [ ] Step C.2.1: Append the closure entry to `tooling-feedback.md` (next TF-NNN id) with title shape `TF-NNN · MISC · n/a · Dogfood closure summary`.
- [ ] Step C.2.2: Body: what worked (which protocol layers caught friction proactively); what didn't (which surfaces fell through to operator catch); what needs follow-up (recurring patterns justifying a v1.1 audit cycle).
- [ ] Step C.2.3: Include a one-line summary per still-open TF entry naming the gap; list closed TF entries with their closing-commit SHAs.

### Task C.3: Closing comment on the feature PR

- [ ] Step C.3.1: Comment on the graphical-entries PR linking `tooling-feedback.md` + naming the total TF count + how many promoted to GH issues.
- [ ] Step C.3.2: Tag the deskwork team for the audit-log import.

### Task C.4: Audit-log handoff

- [ ] Step C.4.1: The deskwork team imports the closure into `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` as `AUDIT-<date>-<NN>` entries — mirror of how the audiocontrol pilot's TF-001..TF-016 imported into AUDIT-20260525-05..09.
- [ ] Step C.4.2: Each AUDIT entry references its source TF entry + summarizes the friction shape + the suggested fix.
- [ ] Step C.4.3: The aggregated audit-log entries become the v1.1 workplan input for scope-discovery.

**Acceptance Criteria:**

- [ ] `tooling-feedback.md` carries a TF closure summary entry.
- [ ] The feature PR has a closing comment with TF count + promoted-issue count.
- [ ] The scope-discovery team has imported AUDIT entries derived from this feature's TF log.


## Commit subjects in the audited range

feat(graphical-entries): extend CommentAnnotation schema — replyTo + attachments + spatialAnchor — Step 8.1.1


## Recent audit-log excerpt (prior findings on this feature)

Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.

---

I walked the production change (`renderSwimCompact` + `renderUnbucketedCompactCell`), the reconciliation invariant, escaping, the CSS layout, and the strengthened count-consistency test. The core fix is **correct**: the compact cell is count-only (the right shape for a summary strip), the `data-row-shell` counts the strengthened test relies on are genuinely emitted by both the kanban (`swimlane-unbucketed.ts:58`) and list (`:163`) unbucketed rows, the empty-input guard returns `unsafe('')` so callers append unconditionally, no `currentStage` value reaches the compact cell so there's no new escaping surface, and the `.swim-compact` flex layout absorbs the trailing cell as the docstring claims. The three findings above are hygiene/informational, not correctness defects.

## 2026-06-01 — audit-barrage lift (20260601T024506665Z-graphical-entries)

### AUDIT-20260601-01 — `group list` is the sole verb left unguarded against extra positionals — silently swallows typos that every sibling verb (including read-only `show`) now refuses

Finding-ID: AUDIT-20260601-01 (claude-01 + claude-02 + codex-01; cross-model)
Status:     acknowledged-slush-pile-2026-06-01
Severity:   medium
Surface:    `packages/cli/src/commands/group.ts:127-128` (dispatch) and `:161-184` (`handleList`)

The AUDIT-20260530-94 fix added `assertExactPositional` to seven verbs (show, create, update, add-member, remove-member, archive, restore) but `handleList` was not touched: `run` dispatches `case 'list'` with only `booleans.has('include-archived')` (`:127-128`) and `handleList` never receives or inspects `rest` (`:161-166`). So `deskwork group <root> list garbage` silently discards `garbage` and lists all groups — exactly the "quiet partial-effect / operator typo swallowed" shape the fix set out to close.

The new function's own docstring (`:88-93`) frames the rationale as *"for state-mutating verbs the project convention is to refuse loudly,"* which would arguably exempt `list`. But that rationale doesn't match what was implemented: `handleShow` is read-only and **was** guarded (`:191`). So the line drawn is not "mutating vs read" — it's "every verb except `list`." That asymmetry is the defect: a user who fat-fingers `group list mygroup` (meaning `group show mygroup`) gets a full list with no error, while the same stray positional on any other verb exits 2. The new `extra-positional-refused.test.ts` covers all seven guarded verbs but not `list`, so the gap is unguarded by tests too. Fix: either call `assertExactPositional(rest, 0, 'list')` (threading `rest` into `handleList`), or correct the docstring to state that `list` is intentionally exempt and why — the current docstring asserts a "state-mutating" boundary the code doesn't actually follow.

---

### AUDIT-20260601-02 — `withJournalRollback` rolls back the sidecar but never the journal — a non-atomic / partial journal-append failure leaves a corrupt journal fragment with the sidecar reverted, the inverse of the inconsistency it set out to fix

Finding-ID: AUDIT-20260601-02
Status:     acknowledged-slush-pile-2026-06-01
Severity:   medium
Surface:    `packages/core/src/sidecar/with-journal-rollback.ts:91-116` (helper) + the six mutator call sites

The helper's contract is "snapshot the sidecar, run mutate (sidecar-write + journal-append), restore the sidecar on throw." The only failure path it compensates is one where the sidecar write succeeded and the journal append failed *before mutating the journal* — which is precisely the failure mode the regression test induces (`mutator-rollback-on-journal-fail.test.ts:103-113` pre-creates `review-journal/history` as a file so the journal's `mkdir` throws ENOTDIR with nothing written). But the name `withJournalRollback` and the header's framing ("compensating-write helper for the sidecar-write + journal-append sequence") imply the *journal* is what gets rolled back. It isn't — the journal file is never snapshotted or touched. If `appendJournalEvent` fails *after* writing partial bytes (disk-full mid-write, interrupted append, a serializer that writes-then-throws), the journal retains a corrupt/partial line that nothing cleans up, while the sidecar is reverted to its pre-mutation state. That is sidecar-says-unchanged / journal-says-partially-mutated — an inconsistency in the opposite direction from the one being closed, and it is entirely unguarded by the test (which only exercises the pre-write mkdir failure).

The fix as shipped is correct for the tested failure mode and is a reasonable generalization of the AUDIT-79 lane pattern, so this is not a blocking defect. But the operator should know the protection is one-sided: it assumes journal-append is all-or-nothing. Two reasonable hardenings: (a) rename to something like `withSidecarRollbackOnJournalFailure` so the name states what is actually restored (the journal-rollback name is an over-claim per the project's naming-reveals-intent guidance), and (b) if journal-append is in fact non-atomic, the helper should also capture and restore the journal-history file, or document in the header that journal atomicity is a precondition. As written, the docstring's "best-effort" caveat applies only to the *restore* side, not to the unaddressed partial-journal-write case.

---

### AUDIT-20260601-03 — `withJournalRollback`'s snapshot/restore clobbers a concurrent successful write to the same sidecar

Finding-ID: AUDIT-20260601-03
Status:     acknowledged-slush-pile-2026-06-01
Severity:   informational
Surface:    `packages/core/src/sidecar/with-journal-rollback.ts:108-116`

The helper reads the sidecar body synchronously into `snapshot` (`:113`), then `await`s `mutate()`. On failure it overwrites the file with the captured `snapshot.body` (`restoreSidecar`, `:71-83`). If a second mutation against the same group UUID interleaves — snapshots the same original body, writes its own update successfully, and the first mutation's journal append *then* fails — the first mutation's rollback restores the stale original body, silently discarding the second mutation's committed write. The same race applies to the `create` rollback's `unlinkSync` (`:75`), which could delete a file a concurrent create just wrote.

deskwork is a single-operator CLI with no documented concurrent-invocation model, so the practical likelihood is low and I would not block on it. I surface it because the helper is now a shared primitive (`packages/core/src/sidecar/`) that the header invites other entry mutators to adopt ("any sidecar-write-followed-by-journal-append call site"); a future caller in a server context (the studio writes to the same tree) could hit this. If the studio ever performs group mutations in-process, this becomes a real lost-update window. Worth a one-line note in the header that the helper assumes no concurrent mutation of the same UUID.

---

### AUDIT-20260601-04 — clones.yaml regeneration replaced operator-authored "why not extract" rationales with terse one-liners, weakening the audit trail for future revisit decisions

Finding-ID: AUDIT-20260601-04
Status:     acknowledged-slush-pile-2026-06-01
Severity:   informational
Surface:    `.dw-lifecycle/scope-discovery/clones.yaml:116-127` (ids `7fd4d02355a8`, `40b2115a7171`)

Two `keep-with-reason` dispositions lost their substantive justification in this refresh. The prior reason for the group/pipeline and group/lane dispatcher clones was a specific paragraph — *"Extracting these into a shared helper would lose per-verb-family argument validation specificity (each verb's flag set differs in non-trivial ways), and the verb-family boundary is the operator-facing unit"* — which records the actual engineering reason the clone is intentional. The replacements are *"Sibling verb-dispatch convention across group/lane/pipeline CRUD modules; shared shape is deliberate, not duplication"* and *"Sibling per-verb update-handler shape … parallel emit/fail handling is deliberate, not duplication."* These assert the conclusion ("deliberate, not duplication") but drop the *why-not-extract* argument that lets a future reader decide whether the disposition still holds as the code evolves.

This isn't a disposition-survivor violation (no `keep-with-reason → pending` transition, so the gate is satisfied) and it's a curation call, not a bug. But per the project's "no IOU / preserve the rationale" posture, the terser reasons are a small regression in the durable record: the next contributor evaluating whether to finally extract a shared dispatcher helper now has less of the original reasoning to push against. Consider retaining the per-verb-family specificity sentence in at least one of the two reasons so the rationale survives the line-number churn that triggered the re-hash.

## 2026-06-01 — audit-barrage lift (20260601T032129888Z-graphical-entries)

### AUDIT-20260601-05 — `entry-lane-missing.audit()` swallows every non-ENOENT read failure and returns `[]`, making a schema-tightening GATE report false-clean

Finding-ID: AUDIT-20260601-05 (claude-01 + claude-02 + claude-03 + codex-01; cross-model)
Status:     acknowledged-slush-pile-2026-06-01
Severity:   medium
Surface:    `packages/core/src/doctor/rules/entry-lane-missing.ts` (the `audit()` try/catch around `readAllSidecarsPartitioned`, ~lines 76-86)

The rule's whole purpose, per its own header, is to be the GATE that lets Step 8.0.2 tighten `resolveEntryTemplate` to throw on a missing `lane`: *"until canary projects report zero `entry-lane-missing` findings, the resolver retains its migration-window default."* That makes a **false-zero the dangerous direction** — a zero count is read as "safe to tighten." But the audit wraps the sidecar read in `try { … } catch { return []; }`. The comment frames the catch as benign ("Nothing useful this rule can say — leave the report empty"), yet any genuine failure (permission error on `.deskwork/entries/`, an I/O fault, a future change in the reader's error contract) is silently converted to "no findings." An operator (or the 8.0.2 implementer) reading a green `entry-lane-missing` cannot distinguish "every entry has a lane" from "the rule couldn't read the directory."

The ENOENT case is already handled by the reader returning `[]` (the empty-project test exercises that), so this catch only ever fires on *unexpected* errors — exactly the ones a gate rule should surface, not bury. Per the project's "fallbacks/swallowed errors are bug-factories" guidance, this should emit a finding (e.g. severity `error`, message naming the read failure) rather than return `[]`, so a read fault blocks the gate instead of opening it. The swallow is also untested — the "empty project" test removes the dir (ENOENT path), never the non-ENOENT path.

### AUDIT-20260601-06 — Hook summary says zero findings even though the same diff slush-records four audit findings

Finding-ID: AUDIT-20260601-06
Status:     acknowledged-slush-pile-2026-06-01
Severity:   medium
Surface:    `.dw-lifecycle/scope-discovery/last-hook-run.json:5-8`; `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md:4469-4519`

The hook metadata records `"disposition": "fired-and-slushed"` but also `"findingsCount": 0`, `"promotedCount": 0`, and `"slushedCount": 0`. In the same diff, the audit log appends four findings from that run, all with `Status: acknowledged-slush-pile-2026-06-01`.

That makes the durable machine-readable summary contradict the human-readable audit log. Any later aggregation that relies on `last-hook-run.json` will conclude this run produced no findings and no slush entries, while the audit log says it produced four. The counts should reflect the actual parsed results, e.g. findings 4, promoted 0, slushed 4, or the disposition should not claim a slush action occurred.


## Diff under audit

The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).

diff --git a/packages/core/src/entry/annotations.ts b/packages/core/src/entry/annotations.ts
index 2e917ec5..b97dbcd1 100644
--- a/packages/core/src/entry/annotations.ts
+++ b/packages/core/src/entry/annotations.ts
@@ -35,6 +35,7 @@ import type { JournalEvent } from '../schema/journal-events.ts';
 import type {
   CommentAnnotation,
   DraftAnnotation,
+  SpatialAnchor,
 } from '../review/types.ts';
 
 /**
@@ -51,6 +52,27 @@ import type {
  * casts; no `any`.
  */
 type StoredAnnotation = Extract<JournalEvent, { kind: 'entry-annotation' }>['annotation'];
+type StoredComment = Extract<StoredAnnotation, { type: 'comment' }>;
+type StoredSpatialAnchor = NonNullable<StoredComment['spatialAnchor']>;
+
+/**
+ * Defensive copy for {@link SpatialAnchor} — keeps the in-memory
+ * representation independent of the journal-event payload so later
+ * mutations on either side don't leak.
+ *
+ * Accepts the Zod-inferred {@link StoredSpatialAnchor} shape (where
+ * optional fields are `T | undefined`) and emits the canonical TS
+ * {@link SpatialAnchor} shape (where optional fields are `T?` under
+ * `exactOptionalPropertyTypes`). The bridge handles the same shape
+ * mismatch documented above for `toDraftAnnotation`.
+ */
+function cloneSpatialAnchor(input: StoredSpatialAnchor): SpatialAnchor {
+  const out: SpatialAnchor = { kind: input.kind };
+  if (input.selector !== undefined) out.selector = input.selector;
+  if (input.x !== undefined) out.x = input.x;
+  if (input.y !== undefined) out.y = input.y;
+  return out;
+}
 
 function toDraftAnnotation(stored: StoredAnnotation): DraftAnnotation {
   const base = {
@@ -68,6 +90,14 @@ function toDraftAnnotation(stored: StoredAnnotation): DraftAnnotation {
         text: stored.text,
         ...(stored.category !== undefined ? { category: stored.category } : {}),
         ...(stored.anchor !== undefined ? { anchor: stored.anchor } : {}),
+        // Phase 8 Step 8.1.1 — pass new optional fields through.
+        ...(stored.replyTo !== undefined ? { replyTo: stored.replyTo } : {}),
+        ...(stored.attachments !== undefined
+          ? { attachments: [...stored.attachments] }
+          : {}),
+        ...(stored.spatialAnchor !== undefined
+          ? { spatialAnchor: cloneSpatialAnchor(stored.spatialAnchor) }
+          : {}),
       };
       return out;
     }
@@ -295,6 +325,12 @@ function applyEdits(
   // text/category edit unchanged.
   const anchorPrefix = comment.anchorPrefix;
   const anchorSuffix = comment.anchorSuffix;
+  // Phase 8 Step 8.1.1 — replyTo / attachments / spatialAnchor are
+  // immutable through `edit-comment` (the edit schema doesn't expose
+  // them); preserve unchanged the same way prefix/suffix are.
+  const replyTo = comment.replyTo;
+  const attachments = comment.attachments;
+  const spatialAnchor = comment.spatialAnchor;
   for (const e of edits) {
     if (e.type !== 'edit-comment') continue;
     if (e.text !== undefined) text = e.text;
@@ -314,6 +350,11 @@ function applyEdits(
     ...(anchor !== undefined ? { anchor } : {}),
     ...(anchorPrefix !== undefined ? { anchorPrefix } : {}),
     ...(anchorSuffix !== undefined ? { anchorSuffix } : {}),
+    ...(replyTo !== undefined ? { replyTo } : {}),
+    ...(attachments !== undefined ? { attachments: [...attachments] } : {}),
+    ...(spatialAnchor !== undefined
+      ? { spatialAnchor: cloneSpatialAnchor(spatialAnchor) }
+      : {}),
   };
   return out;
 }
diff --git a/packages/core/src/review/types.ts b/packages/core/src/review/types.ts
index d2a568ec..f4168d0e 100644
--- a/packages/core/src/review/types.ts
+++ b/packages/core/src/review/types.ts
@@ -46,6 +46,34 @@ export interface DraftRange {
   end: number;
 }
 
+/**
+ * Spatial anchor for graphical-entry comments (Phase 8 Step 8.1.1).
+ *
+ * Where a textual comment's `range` + `anchor` locates the comment in
+ * the raw markdown source, a `spatialAnchor` locates the comment on
+ * the entry's primary visual surface — a mockup, an image, an SVG
+ * diagram, anything rendered as the entry's content. The three `kind`s
+ * are mutually exclusive in interpretation:
+ *
+ *   - `pixel` — `x`/`y` are pixel coordinates against the rendered
+ *     visual's intrinsic dimensions. Used for image-style entries
+ *     where DOM selectors are not meaningful.
+ *   - `dom-selector` — `selector` is a CSS selector that identifies
+ *     the anchored element within the rendered HTML mockup.
+ *   - `svg-element` — `selector` is a CSS selector that resolves to
+ *     an SVG element (e.g. `g.layer-2 > rect[id="logo"]`).
+ *
+ * All fields are optional at the schema level so legacy comments
+ * without spatial anchors continue to parse; the renderer enforces
+ * that the right combination is present for each `kind` at use time.
+ */
+export interface SpatialAnchor {
+  kind: 'pixel' | 'dom-selector' | 'svg-element';
+  selector?: string;
+  x?: number;
+  y?: number;
+}
+
 interface AnnotationBase {
   /** ISO-8601 timestamp when the annotation was recorded. */
   createdAt: string;
@@ -97,6 +125,30 @@ export interface CommentAnnotation extends AnnotationBase {
    * field. Optional for back-compat.
    */
   anchorSuffix?: string;
+  /**
+   * Phase 8 Step 8.1.1 — threading. The id of the root `comment`
+   * annotation this comment replies to. Absent when the comment is
+   * itself a root (top-level) comment. Threading is single-level:
+   * a reply's `replyTo` always points at a root comment, never at
+   * another reply.
+   */
+  replyTo?: string;
+  /**
+   * Phase 8 Step 8.1.1 — screenshot attachments. Relative paths under
+   * `<entryDir>/scrapbook/screenshots/`, each pointing at an
+   * operator-attached screenshot bound to this comment. Stored as
+   * relative paths so the entry tree is portable. Empty / absent
+   * when the comment has no attachments.
+   */
+  attachments?: string[];
+  /**
+   * Phase 8 Step 8.1.1 — spatial anchor for graphical entries. When
+   * present, the comment is anchored on the entry's primary visual
+   * (mockup, image, SVG) per the {@link SpatialAnchor} contract.
+   * Independent of `range` — a comment may carry both (a markdown
+   * range AND a spatial pin) or neither.
+   */
+  spatialAnchor?: SpatialAnchor;
 }
 
 export interface EditAnnotation extends AnnotationBase {
diff --git a/packages/core/src/schema/draft-annotation.ts b/packages/core/src/schema/draft-annotation.ts
index cd1d822a..6169e2e4 100644
--- a/packages/core/src/schema/draft-annotation.ts
+++ b/packages/core/src/schema/draft-annotation.ts
@@ -28,6 +28,23 @@ const RangeSchema = z.object({
   end: z.number().int().nonnegative(),
 });
 
+/**
+ * Phase 8 Step 8.1.1 — spatial anchor for graphical-entry comments.
+ * Mirror of {@link import('../review/types.ts').SpatialAnchor}.
+ *
+ * Three `kind`s — `pixel`, `dom-selector`, `svg-element` — capture
+ * which surface the anchor lives on. All position fields are optional
+ * at the schema level (the renderer enforces the right combination
+ * per `kind`). Adding `kind` values requires updating both this
+ * schema and the TS interface in lockstep.
+ */
+const SpatialAnchorSchema = z.object({
+  kind: z.enum(['pixel', 'dom-selector', 'svg-element']),
+  selector: z.string().optional(),
+  x: z.number().optional(),
+  y: z.number().optional(),
+});
+
 const BaseFields = {
   /** ISO-8601 timestamp when the annotation was recorded. */
   createdAt: z.string().datetime(),
@@ -48,6 +65,12 @@ const CommentAnnotation = z.object({
   text: z.string(),
   category: AnnotationCategoryEnum.optional(),
   anchor: z.string().optional(),
+  // Phase 8 Step 8.1.1 — additive fields. Existing single-comment
+  // annotations without any of these continue to parse unchanged.
+  // The TS source-of-truth lives at `review/types.ts:CommentAnnotation`.
+  replyTo: z.string().optional(),
+  attachments: z.array(z.string()).optional(),
+  spatialAnchor: SpatialAnchorSchema.optional(),
 });
 
 const EditAnnotation = z.object({
diff --git a/packages/core/test/schema/draft-annotation-thread-anchor.test.ts b/packages/core/test/schema/draft-annotation-thread-anchor.test.ts
new file mode 100644
index 00000000..433bd5ff
--- /dev/null
+++ b/packages/core/test/schema/draft-annotation-thread-anchor.test.ts
@@ -0,0 +1,259 @@
+/**
+ * Phase 8 Step 8.1.1 — CommentAnnotation schema delta.
+ *
+ * Three additive optional fields land on `CommentAnnotation`:
+ *
+ *   - `replyTo?: string` — root comment id for reply comments.
+ *   - `attachments?: string[]` — relative paths under
+ *     `<entryDir>/scrapbook/screenshots/`.
+ *   - `spatialAnchor?: { kind: 'pixel' | 'dom-selector' | 'svg-element';
+ *      selector?: string; x?: number; y?: number }` — spatial pin for
+ *     graphical entries.
+ *
+ * These tests assert the additive shape — existing single-comment
+ * annotations without the new fields continue to parse, each new field
+ * round-trips through `safeParse`, each `spatialAnchor.kind` is
+ * recognized, unknown kinds are rejected, and other annotation types
+ * (edit / approve / reject / resolve / address / edit-comment /
+ * delete-comment / archive-comment) are unaffected by the schema
+ * extension.
+ */
+
+import { describe, it, expect } from 'vitest';
+import { DraftAnnotationSchema } from '@/schema/draft-annotation';
+
+const COMMENT_BASE = {
+  type: 'comment' as const,
+  id: 'cmt_abc123',
+  workflowId: 'wf_1',
+  createdAt: '2026-05-31T10:00:00.000Z',
+  version: 1,
+  range: { start: 0, end: 4 },
+  text: 'sample comment',
+};
+
+describe('CommentAnnotation schema — Phase 8 Step 8.1.1 additive fields', () => {
+  it('parses a legacy comment with none of the new fields', () => {
+    const parsed = DraftAnnotationSchema.safeParse(COMMENT_BASE);
+    expect(parsed.success).toBe(true);
+    if (!parsed.success) return;
+    expect(parsed.data.type).toBe('comment');
+    if (parsed.data.type !== 'comment') return;
+    expect(parsed.data.replyTo).toBeUndefined();
+    expect(parsed.data.attachments).toBeUndefined();
+    expect(parsed.data.spatialAnchor).toBeUndefined();
+  });
+
+  it('parses and preserves replyTo', () => {
+    const input = { ...COMMENT_BASE, replyTo: 'cmt_root_xyz' };
+    const parsed = DraftAnnotationSchema.safeParse(input);
+    expect(parsed.success).toBe(true);
+    if (!parsed.success) return;
+    if (parsed.data.type !== 'comment') return;
+    expect(parsed.data.replyTo).toBe('cmt_root_xyz');
+  });
+
+  it('parses and preserves attachments (array of relative paths)', () => {
+    const input = {
+      ...COMMENT_BASE,
+      attachments: [
+        'scrapbook/screenshots/comment-abc-12345.png',
+        'scrapbook/screenshots/comment-abc-12346.png',
+      ],
+    };
+    const parsed = DraftAnnotationSchema.safeParse(input);
+    expect(parsed.success).toBe(true);
+    if (!parsed.success) return;
+    if (parsed.data.type !== 'comment') return;
+    expect(parsed.data.attachments).toEqual([
+      'scrapbook/screenshots/comment-abc-12345.png',
+      'scrapbook/screenshots/comment-abc-12346.png',
+    ]);
+  });
+
+  it('parses and preserves spatialAnchor of kind "pixel"', () => {
+    const input = {
+      ...COMMENT_BASE,
+      spatialAnchor: { kind: 'pixel' as const, x: 100, y: 200 },
+    };
+    const parsed = DraftAnnotationSchema.safeParse(input);
+    expect(parsed.success).toBe(true);
+    if (!parsed.success) return;
+    if (parsed.data.type !== 'comment') return;
+    expect(parsed.data.spatialAnchor).toEqual({ kind: 'pixel', x: 100, y: 200 });
+  });
+
+  it('parses and preserves spatialAnchor of kind "dom-selector"', () => {
+    const input = {
+      ...COMMENT_BASE,
+      spatialAnchor: {
+        kind: 'dom-selector' as const,
+        selector: '#header > h1',
+      },
+    };
+    const parsed = DraftAnnotationSchema.safeParse(input);
+    expect(parsed.success).toBe(true);
+    if (!parsed.success) return;
+    if (parsed.data.type !== 'comment') return;
+    expect(parsed.data.spatialAnchor).toEqual({
+      kind: 'dom-selector',
+      selector: '#header > h1',
+    });
+  });
+
+  it('parses and preserves spatialAnchor of kind "svg-element"', () => {
+    const input = {
+      ...COMMENT_BASE,
+      spatialAnchor: {
+        kind: 'svg-element' as const,
+        selector: 'g.layer-2 > rect[id="logo"]',
+      },
+    };
+    const parsed = DraftAnnotationSchema.safeParse(input);
+    expect(parsed.success).toBe(true);
+    if (!parsed.success) return;
+    if (parsed.data.type !== 'comment') return;
+    expect(parsed.data.spatialAnchor).toEqual({
+      kind: 'svg-element',
+      selector: 'g.layer-2 > rect[id="logo"]',
+    });
+  });
+
+  it('rejects spatialAnchor with an unknown kind', () => {
+    const input = {
+      ...COMMENT_BASE,
+      spatialAnchor: { kind: 'invalid', x: 1, y: 1 },
+    };
+    const parsed = DraftAnnotationSchema.safeParse(input);
+    expect(parsed.success).toBe(false);
+  });
+
+  it('parses a comment with all three new fields set together', () => {
+    const input = {
+      ...COMMENT_BASE,
+      replyTo: 'cmt_root_xyz',
+      attachments: ['scrapbook/screenshots/comment-abc-12345.png'],
+      spatialAnchor: { kind: 'pixel' as const, x: 42, y: 84 },
+    };
+    const parsed = DraftAnnotationSchema.safeParse(input);
+    expect(parsed.success).toBe(true);
+    if (!parsed.success) return;
+    if (parsed.data.type !== 'comment') return;
+    expect(parsed.data.replyTo).toBe('cmt_root_xyz');
+    expect(parsed.data.attachments).toEqual([
+      'scrapbook/screenshots/comment-abc-12345.png',
+    ]);
+    expect(parsed.data.spatialAnchor).toEqual({ kind: 'pixel', x: 42, y: 84 });
+  });
+
+  it('rejects replyTo when supplied with a non-string value', () => {
+    const input = { ...COMMENT_BASE, replyTo: 42 };
+    const parsed = DraftAnnotationSchema.safeParse(input);
+    expect(parsed.success).toBe(false);
+  });
+
+  it('rejects attachments when supplied with non-array value', () => {
+    const input = {
+      ...COMMENT_BASE,
+      attachments: 'scrapbook/screenshots/comment-abc-12345.png',
+    };
+    const parsed = DraftAnnotationSchema.safeParse(input);
+    expect(parsed.success).toBe(false);
+  });
+});
+
+describe('Other annotation types — unaffected by Phase 8 Step 8.1.1', () => {
+  const BASE = {
+    id: 'a_1',
+    workflowId: 'wf_1',
+    createdAt: '2026-05-31T10:00:00.000Z',
+  };
+
+  it('still parses an edit annotation', () => {
+    const parsed = DraftAnnotationSchema.safeParse({
+      ...BASE,
+      type: 'edit',
+      beforeVersion: 1,
+      afterMarkdown: 'new body',
+      diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n',
+    });
+    expect(parsed.success).toBe(true);
+  });
+
+  it('still parses an approve annotation', () => {
+    const parsed = DraftAnnotationSchema.safeParse({
+      ...BASE,
+      type: 'approve',
+      version: 2,
+    });
+    expect(parsed.success).toBe(true);
+  });
+
+  it('still parses a reject annotation (with and without reason)', () => {
+    expect(
+      DraftAnnotationSchema.safeParse({
+        ...BASE,
+        type: 'reject',
+        version: 2,
+      }).success,
+    ).toBe(true);
+    expect(
+      DraftAnnotationSchema.safeParse({
+        ...BASE,
+        type: 'reject',
+        version: 2,
+        reason: 'needs more receipts',
+      }).success,
+    ).toBe(true);
+  });
+
+  it('still parses a resolve annotation', () => {
+    const parsed = DraftAnnotationSchema.safeParse({
+      ...BASE,
+      type: 'resolve',
+      commentId: 'cmt_abc123',
+      resolved: true,
+    });
+    expect(parsed.success).toBe(true);
+  });
+
+  it('still parses an address annotation', () => {
+    const parsed = DraftAnnotationSchema.safeParse({
+      ...BASE,
+      type: 'address',
+      commentId: 'cmt_abc123',
+      version: 3,
+      disposition: 'addressed',
+    });
+    expect(parsed.success).toBe(true);
+  });
+
+  it('still parses an edit-comment annotation', () => {
+    const parsed = DraftAnnotationSchema.safeParse({
+      ...BASE,
+      type: 'edit-comment',
+      commentId: 'cmt_abc123',
+      text: 'edited text',
+    });
+    expect(parsed.success).toBe(true);
+  });
+
+  it('still parses a delete-comment annotation', () => {
+    const parsed = DraftAnnotationSchema.safeParse({
+      ...BASE,
+      type: 'delete-comment',
+      commentId: 'cmt_abc123',
+    });
+    expect(parsed.success).toBe(true);
+  });
+
+  it('still parses an archive-comment annotation', () => {
+    const parsed = DraftAnnotationSchema.safeParse({
+      ...BASE,
+      type: 'archive-comment',
+      commentId: 'cmt_abc123',
+      priorStage: 'Drafting',
+    });
+    expect(parsed.success).toBe(true);
+  });
+});


## What to look for

- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.

## Output format

For each finding you surface, emit ONE markdown block in this exact shape:

```
### <heading: one-line summary of the finding>

Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
Status:     open
Severity:   <blocking | high | medium | low | informational>
Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>

<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
```

Number the findings sequentially (`-01`, `-02`, ...). Use `blocking` only for issues that would break the feature's stated goals in obvious ways; `high` for correctness bugs adopters will hit; `medium` for design issues that compound over time; `low` for hygiene; `informational` for context you think the operator should see but isn't itself a bug.

## If you find nothing — say so explicitly

If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:

```
### No findings

Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
Status:     open
Severity:   informational
Surface:    (the entire diff)

I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
```

**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.

## Hard constraints

- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.
