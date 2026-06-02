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

docs(graphical-entries): tick Task 8.8 acceptance criteria
test(graphical-entries): Phase 8 end-to-end integration — Task 8.8
docs(graphical-entries): document W3C Web Annotation mapping on CommentAnnotation — Step 8.1.3
docs(graphical-entries): tighten @deprecated tags on legacy editorial helpers — Step 8.0.3
docs(graphical-entries): tick-sync Phase 8 shipped steps — closeout Part 1
docs(graphical-entries): tick Task 8.4 acceptance criteria
feat(graphical-entries): render attached screenshots as thumbnails in marginalia — Step 8.4 render
feat(graphical-entries): paste/drag-drop image attachment handlers — Step 8.4.3
feat(graphical-entries): screenshot attach + orphan-promote server routes — Step 8.4.1+8.4.2 (server)
feat(graphical-entries): screenshot attach-to-comment client flow — Step 8.4.1 (client)


## Recent audit-log excerpt (prior findings on this feature)

Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.

Status:     fixed-5bb84926 (switch now has `default: return assertNever(input, 'cloneSpatialAnchor')`. `assertNever`'s parameter is typed `never`, so the call site only type-checks when every variant of `SpatialAnchor` is handled by the cases above. A future 4th variant added to the union without updating the switch becomes a compile error at the call site — exactly the hard compile-time enforcement the finding asked for, replacing the prior implicit lockstep contract. Companion test at `packages/core/test/entry/clone-spatial-anchor-exhaustiveness.test.ts` round-trips every existing variant through the public `addEntryAnnotation` / `listEntryAnnotationsRaw` API and pins a TS-level synthetic dispatch function whose `default` arm hands the narrowed `never` to a local `assertNever`, proving the `SpatialAnchor` union is fully enumerated by three kinds.)
Severity:   low
Surface:    `packages/core/src/entry/annotations.ts:67-79` (`cloneSpatialAnchor`)

The rewritten switch returns from each of the three `case` arms with no `default` and no trailing `return` / `assertNever(input)`:

```ts
switch (input.kind) {
  case 'pixel':        return { kind: 'pixel', x: input.x, y: input.y };
  case 'dom-selector': return { kind: 'dom-selector', selector: input.selector };
  case 'svg-element':  return { kind: 'svg-element', selector: input.selector };
}
```

This compiles today only because the inferred `StoredSpatialAnchor` union is exhaustive. The header comment and the schema docstring both say adding a `kind` "requires updating both this schema and the TS union in lockstep" — but this function is a *third* site that must change, and nothing forces it. Whether a future 4th `kind` is caught here depends entirely on `noImplicitReturns` being enabled; if it is off (or the union is widened by hand), the switch falls through and returns `undefined` typed as `SpatialAnchor`, a silent corruption on the read bridge. A `default: assertNever(input)` makes the lockstep contract a hard compile error at this site instead of a flag-dependent accident, matching the "names/structure reveal intent" posture the rest of the change adopts.

### AUDIT-20260601-10 — Negative tests assert `success === false` without pinning the failure to the anchor, so they can pass for the wrong reason

Finding-ID: AUDIT-20260601-10
Status:     fixed-b7446c19 (each of the six `rejects spatialAnchor ...` cases now goes through a local `expectSpatialAnchorFailure(parsed)` helper that asserts BOTH `parsed.success === false` AND that at least one issue in `parsed.error.issues` has `spatialAnchor` in its `path`. Path-based pinning is more resilient than code-based pinning because the specific issue code varies by the kind of corruption — missing-coords yields `invalid_type` on `x`/`y`; extra fields yields `unrecognized_keys` on the parent; wrong kind yields `invalid_union_discriminator` — but the path always names `spatialAnchor` when the failure is anchor-shape related. Sanity-checked via a one-off probe that confirmed each malformed-anchor case surfaces ≥1 issue with `spatialAnchor` in the path; a wrong-reason failure (omitting `type` on the base annotation) surfaces 0 spatialAnchor-path issues, which would cause the helper to throw — exactly the resilience the original tests lacked.)
Severity:   low
Surface:    `packages/core/test/schema/draft-annotation-thread-anchor.test.ts:138-194` (six new `rejects spatialAnchor …` cases)

Each new negative case spreads `COMMENT_BASE`, overrides `spatialAnchor`, and asserts only `expect(parsed.success).toBe(false)`. None inspect *why* the parse failed (e.g. `parsed.error.issues[0].path` containing `spatialAnchor`, or the discriminator/strict issue code). Because the assertion is "the whole annotation failed to validate," any unrelated future change that makes `COMMENT_BASE` itself invalid — a newly-required sibling field, a renamed key — would keep all six green while silently no longer exercising the anchor enforcement they claim to cover. The probe would then assert the *mechanism it imagines* rather than the contract (the exact failure mode the project's `ui-verification.md` spec-compliance section names).

The fix is one line per case: assert the error path includes `spatialAnchor` (and ideally the issue code — `invalid_union_discriminator` for bad `kind`, `unrecognized_keys` for the strict forbidden-field cases). That ties each test to the per-kind contract it is named for, so a regression in the anchor schema specifically — not just "the comment is invalid" — is what turns the test red.

### AUDIT-20260601-11 — AUDIT-20260601-07 remains open in the durable audit log even though the workplan records it as closed

Finding-ID: AUDIT-20260601-11
Status:     fixed-2fb0bac9 (Status flip landed in 2fb0bac9 immediately after the gate surfaced this finding; AUDIT-07's audit-log entry now correctly carries `fixed-c708ab27`)
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md:4537-4544`; `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:1482-1497`

The workplan entry says “Closes AUDIT-20260601-07” and records the schema/type/test fix as complete, but the audit log entry added in the same diff still has `Status:     open`. The workplan acceptance criteria also leaves “Audit-log Status flipped to fixed-<sha>” unchecked, so the durable state now says both “closed by implementation” and “still open” depending on which project record is read.

This matters because the audit log is the source later barrage/import tooling will scan for unresolved findings. Leaving `AUDIT-20260601-07` open after committing the fix means the same issue can be re-triaged as active despite the code and tests having moved. A reasonable fix is to update the audit-log status to the actual fixed commit SHA once known, or avoid wording the workplan as “Closes” until the audit record is updated in the same close-shipped step.

## 2026-06-01 — audit-barrage lift (20260601T052715681Z-graphical-entries)

### AUDIT-20260601-12 — Workplan Task 1.11 is an all-unchecked stub that contradicts its own audit-log `fixed-2fb0bac9` status

Finding-ID: AUDIT-20260601-12 (claude-01 + codex-01; cross-model)
Status:     acknowledged-slush-pile-2026-06-01
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md` (new Task 1.11 block) vs `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md` (AUDIT-20260601-11 entry)

The same diff that marks the audit-log entry `Status: fixed-2fb0bac9 (Status flip landed in 2fb0bac9 …)` also adds Task 1.11 to the workplan with **every checkbox unchecked** — all five steps are `- [ ]`, and the acceptance criteria still carry the literal template placeholder `Failing test exists at \`(to be filled in by Step 1 implementer)\``. So the durable state again says two contradictory things: the audit log says AUDIT-20260601-11 is fixed-and-closed, the workplan says it is an untouched stub. This is *precisely* the workplan-vs-audit-log inconsistency that AUDIT-20260601-11 was itself filed about (AUDIT-07 closed in the workplan while open in the log) — now regressed in the inverse direction for the meta-finding's own task.

Compounding this: Task 1.11's template ("Step 1: write failing test exercising the bug … Step 2: confirm test fails against current code") was generated mechanically and never adapted. AUDIT-20260601-11 is a docs-only status-line flip — there is no code bug to write a failing test against, and indeed no test was written (the fix was the one-line status edit in 2fb0bac9). The unchecked TDD template is therefore both internally incoherent and unfollowable as written.

A reasonable fix: either check off Task 1.11's steps and rewrite its acceptance criteria to reflect what AUDIT-11 actually required (a docs status-flip, verified by reading the audit-log line — not a vitest run), or mark it explicitly as a docs-only finding that the TDD task shape does not apply to. Leaving it as a placeholder stub means the next barrage/import pass that scans the workplan for incomplete tasks will re-flag AUDIT-11 as active while the log says it is closed — the exact re-triage failure AUDIT-11 warned about.

---

### AUDIT-20260601-13 — `entry-anchor-shape` swallows non-ENOENT directory-read errors and reports "clean", diverging from the sibling read path that throws

Finding-ID: AUDIT-20260601-13 (claude-02 + claude-03 + claude-04 + codex-02; cross-model)
Status:     acknowledged-slush-pile-2026-06-01
Severity:   medium
Surface:    `packages/core/src/doctor/rules/entry-anchor-shape.ts:97-117` (the `readdir` try/catch)

The rule's directory read catches every error and returns an empty findings array:

```ts
try { names = await readdir(journalDir); }
catch (err) {
  const error = err as NodeJS.ErrnoException;
  if (error.code === 'ENOENT') return [];
  // Directory-level read failure — nothing useful this rule can say.
  return [];   // <-- swallows EACCES, ENOTDIR, EIO, etc.
}
```

The sibling reader `packages/core/src/journal/read.ts:14-20` handles the identical situation by re-throwing anything that is not ENOENT. So a permission error (EACCES) or an I/O fault on the journal directory makes `readJournalEvents` fail loudly, but makes this *safety-net data-integrity rule* report zero findings — i.e. "no malformed anchors found." For a rule whose entire stated purpose is to be the durable safety net that surfaces unreadable legacy data the operator can't otherwise see, silently reporting "clean" on an IO failure is the fallback-hides-failure shape the project guidelines forbid ("Never implement fallbacks … throw … Errors let us know that something isn't implemented"). It is also self-inconsistent: a transient permission glitch produces a green doctor run that the operator will trust.

A reasonable fix is to mirror `read.ts`: return `[]` only on ENOENT, and either re-throw the non-ENOENT error or emit it as an `error`-severity finding ("could not read journal directory: …") so the operator sees that the check could not run rather than that it ran and found nothing.

---


## Diff under audit

The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).

diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
index 6f9dc7b2..716c7a36 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
@@ -2486,16 +2486,16 @@ Closes AUDIT-20260530-60 (cross-model: AUDIT-BARRAGE-codex-P6-1) via acknowledge
 
 > **Phase 4 follow-up (from code-quality review 2026-05-27, M-5):** `packages/core/src/lanes/resolve.ts:60-64` carries a migration-window default that resolves `entry.lane === undefined` to the editorial template. Once doctor's `lane-migration` step (Phase 4 Task 4.4) has run across the canary repos (this project + audiocontrol + writingcontrol) AND reports zero un-migrated entries, the resolver should tighten to throw on missing-lane. `packages/core/src/calendar/render.ts:130-141` similarly carries an `EDITORIAL_FALLBACK` constant that becomes unreachable once doctor enforces lane presence; remove it in the same change.
 
-- [ ] Step 8.0.1: Add a doctor rule `entry-lane-missing` that surfaces every sidecar without a `lane` field as a finding. Repair flow: run `migrateLaneMembership` to back-fill `default`, OR have the operator explicitly assign a lane via `/deskwork:lane move <slug> --to <lane-id>` once Phase 6's lane CRUD ships.
+- [x] Step 8.0.1: Add a doctor rule `entry-lane-missing` that surfaces every sidecar without a `lane` field as a finding. Repair flow: run `migrateLaneMembership` to back-fill `default`, OR have the operator explicitly assign a lane via `/deskwork:lane move <slug> --to <lane-id>` once Phase 6's lane CRUD ships. Landed in commit `afa9413d` — `packages/core/src/doctor/rules/entry-lane-missing.ts` surfaces each sidecar missing the `lane` field as a finding and provides a `migrate-lane-membership` repair that back-fills `default` via the existing migration helper.
 - [ ] Step 8.0.2: Once the canary projects report zero `entry-lane-missing` findings, tighten `resolveEntryTemplate` in `packages/core/src/lanes/resolve.ts:60-64` to throw on missing-lane. Delete the `EDITORIAL_FALLBACK` constant in `packages/core/src/calendar/render.ts` and pipe the renderer through `loadPipelineTemplate` always.
-- [ ] Step 8.0.3: Update the `@deprecated` tags in `packages/core/src/schema/entry.ts` to remove the "kept for back-compat" caveat; the legacy editorial helpers can be deleted in a future cleanup once their last callers (legacy calendar migration parser) are themselves removed.
+- [x] Step 8.0.3: Update the `@deprecated` tags in `packages/core/src/schema/entry.ts` to remove the "kept for back-compat" caveat; the legacy editorial helpers can be deleted in a future cleanup once their last callers (legacy calendar migration parser) are themselves removed. Rewrote the three deprecation tags on `isLinearPipelineStage`, `isOffPipelineStage`, and `nextStage` to drop the "kept for non-verb callers" caveat and instead frame the helpers as scheduled-for-deletion once the legacy calendar migration parser's callers are removed.
 
 ### Task 8.1: Annotation schema extension
 
-- [ ] Step 8.1.1: Extend `CommentAnnotation` (`packages/core/src/annotations/types.ts` or equivalent) with: `replyTo?: string` (root comment id for reply comments); `attachments?: string[]` (relative paths under `<entryDir>/scrapbook/screenshots/`); `spatialAnchor?: { kind: 'pixel' | 'dom-selector' | 'svg-element'; selector?: string; x?: number; y?: number }`.
+- [x] Step 8.1.1: Extend `CommentAnnotation` (`packages/core/src/annotations/types.ts` or equivalent) with: `replyTo?: string` (root comment id for reply comments); `attachments?: string[]` (relative paths under `<entryDir>/scrapbook/screenshots/`); `spatialAnchor?: { kind: 'pixel' | 'dom-selector' | 'svg-element'; selector?: string; x?: number; y?: number }`. Landed in commit `deea28fd` — schema lives in `packages/core/src/schema/draft-annotation.ts`. `spatialAnchor` was subsequently tightened into a discriminated union over `kind` (commit `c708ab27` per AUDIT-20260601-07) so each kind enforces its own required shape: `pixel` requires `x` + `y` numbers, `dom-selector` + `svg-element` require a `selector` string. Additive-and-optional on `CommentAnnotation` so legacy comments continue to parse (Step 8.1.4 invariant).
 - [x] Step 8.1.2: Extend the disposition annotation type with a **required** `reason: string` field (per PRD acceptance criterion: "required free-text disposition reason captured at iterate time"). Landed in two commits per the AUDIT-20260601-08 sibling-rule pattern: Part 1 (`2f07f777`) adds the `entry-address-reason-missing` doctor rule that surfaces legacy reasonless `addressed` annotations BEFORE the schema cutover silently skips them on the read side; Part 2 (`91954561`) tightens `AddressAnnotation` so `reason` is REQUIRED (non-empty) when `disposition === 'addressed'` via a top-level `.superRefine` on `DraftAnnotationSchema`, refactors the TS type into a discriminated union over `disposition`, and narrows every call site that constructs an `address` annotation (HTTP shortform handler, read fold, CLI longform + shortform paths, studio route helper). `deferred` and `wontfix` continue to accept an optional `reason`; the contract is scoped to `addressed` per the PRD criterion. Step 8.5.2 (CLI-parse-time refusal of dispositions files missing `reason` for `addressed` entries) is sibling-scoped and forward-pointed by the `--auto-dispositions=addressed` test now asserting the post-Step-8.1.2 contract-violation shape (non-zero exit, stderr surfaces the contract).
-- [ ] Step 8.1.3: Adopt or align with W3C Web Annotation Data Model per Phase 1's decision; if adopting, the migration sketch from current `comment` is documented in the Phase 1 doc + applied here.
-- [ ] Step 8.1.4: Schema validation: existing single-comment annotations (no new fields) keep working unchanged — additive schema delta.
+- [x] Step 8.1.3: Adopt or align with W3C Web Annotation Data Model per Phase 1's decision; if adopting, the migration sketch from current `comment` is documented in the Phase 1 doc + applied here. Per Phase 1's accepted brief (`docs/studio-design/ACCEPTED/2026-05-26-graphical-review-prior-art/brief.md`) the project adopts `@recogito/text-annotator` + `W3CTextFormat`; this step adds a schema-level docstring block above `CommentAnnotation` in `packages/core/src/schema/draft-annotation.ts` documenting the field-by-field mapping (`text` ≡ `bodyValue`; `range` ≡ `TextPositionSelector`; `replyTo` ≡ `motivation: 'replying'` annotation targeting another annotation; `attachments` ≡ W3C `Image` body; `spatialAnchor` variants ≡ `FragmentSelector` / `XPathSelector` / `SvgSelector`; `category` ≡ `purpose`; legacy `anchor` retained for read-compat). No code change — the schema shape is already W3C-compatible as documented; the docstring records the invariant so future maintainers can serialize to W3C JSON-LD without re-deriving the mapping.
+- [x] Step 8.1.4: Schema validation: existing single-comment annotations (no new fields) keep working unchanged — additive schema delta. Covered by Step 8.1.1's commit (`deea28fd`) test suite — `packages/core/test/schema/draft-annotation-thread-anchor.test.ts` pins the legacy-shape-survives invariant across `replyTo`, `attachments`, and `spatialAnchor` (all three fields independently optional; absent → parse-clean; present → parsed-typed). Step 8.1.2's discriminated-union refactor preserved the additive contract on the disposition side as well (legacy address annotations without `reason` parse on the read path; only the write path tightens; the legacy render fallback is Step 8.5.3 commit `2afffa1c`).
 
 ### Task 8.2: Threaded replies rendering
 
@@ -2511,9 +2511,9 @@ Closes AUDIT-20260530-60 (cross-model: AUDIT-BARRAGE-codex-P6-1) via acknowledge
 
 ### Task 8.4: Screenshot attachment workflow
 
-- [ ] Step 8.4.1: After capture, operator can attach the screenshot to an existing comment (sets `attachments[]` on the comment) or create a new comment with the screenshot pre-attached.
-- [ ] Step 8.4.2: Cross-entry attachment: operator attaches screenshot from entry A to a comment on entry B; the screenshot lives in entry B's scrapbook with a `sourceEntry` field on the attachment metadata.
-- [ ] Step 8.4.3: External-image attachment: operator pastes from clipboard or drag-drops any image file from filesystem onto a comment.
+- [x] Step 8.4.1: After capture, operator can attach the screenshot to an existing comment (sets `attachments[]` on the comment) or create a new comment with the screenshot pre-attached. Landed across four commits: (a) `0eca201e` schema delta — `EditCommentAnnotation` accepts an optional `attachments: z.array(z.string()).optional()` patch field with full-replacement semantics matching every other field on this annotation; the TS source-of-truth (`packages/core/src/review/types.ts:EditCommentAnnotation`) gets the same field; `applyEdits` in `entry/annotations.ts` mutates the running attachments pointer when an edit carries the field; new tests at `packages/core/test/schema/draft-annotation-edit-comment-attachments.test.ts` (6 parse shapes: legacy / attachments-only / combined / explicit-clear / non-array reject / non-string-member reject) and `packages/core/test/entry-annotations-edit-attachments.test.ts` (5 fold shapes: present replaces / absent preserves / empty clears / multi-edit latest-wins / read-side defensive copy). (b) `f47b399f` client — `plugins/deskwork-studio/public/src/entry-review/screenshot-attach.ts` exports `attachScreenshotToComment(entryId, commentId, priorAttachments, newRelativePath)` (PATCHes the existing comment with `[...prior, newRelativePath]`) and `createCommentWithAttachment(entryId, draft, relativePath)` (POSTs a new comment annotation with the screenshot pre-attached); hand-rolled response parsing with no `as` casts; 9 jsdom tests at `packages/studio/test/entry-review/screenshot-attach.test.ts` cover URL shape, prior-attachments concatenation, empty-prior case, optional-field composition, replyTo threading on new comments, error surfacing on 4xx, status-only on non-JSON 5xx. The body parser in `packages/studio/src/routes/entry-annotation-body.ts` extends the `comment` and `edit-comment` branches to validate the new `attachments` field with string-only entries and an array-or-reject shape; the "at least one field is required" rule extends to count attachments. (c) `cd80bbe2` server route — `POST /api/dev/editorial-review/entry/:entryId/comment/:commentId/attach` binds a persisted screenshot path to an existing comment via a journal-write; backed by `packages/studio/src/lib/screenshot-attach.ts`'s `attachScreenshotToCommentServer`; 9 integration tests at `packages/studio/test/screenshot-attach-route.test.ts` cover 200 / 400 (malformed ids, missing/empty relativePath, bad JSON) / 404 (unknown entry, unknown commentId). The same commit lifted `readJsonObjectBody` + `mapAnnotationWriteError` helpers to keep the new routes under the clone-detection gate. (d) `4ff13351` render — `buildAttachmentStrip` in `plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts` renders attachments as `<img class="er-marginalia-attachment-thumb">` with verbatim src (via setAttribute) + lazy-loading + alt text, inside a `.er-marginalia-attachments` container appended below the comment text. Both active and resolved comment cards surface attachments. Empty / missing attachments return null so the caller doesn't append an empty container. The cross-cutting `markdown-benefits-phase-8.test.ts` updated to assert the render-side AND a no-attachment-no-empty-strip case; the docblock's support-state table flips `attachments | YES | YES (Task 8.4 render)`.
+- [x] Step 8.4.2: Cross-entry attachment: operator attaches screenshot from entry A to a comment on entry B; the screenshot lives in entry B's scrapbook with a `sourceEntry` field on the attachment metadata. Landed in commit `cd80bbe2` alongside Step 8.4.1's server work. New server route `POST /api/dev/editorial-review/screenshots/orphan/:filename/promote-to-entry/:entryId/comment/:commentId` moves an orphan-path file to the entry-anchored path AND attaches to the named comment in one call; optional JSON body `{ sourceEntry?: string }` triggers a `<filename>.meta.json` sidecar next to the moved file naming the source entry when it differs from the destination entry. Per Task 8.4.2's workplan prose, the v1 surface uses the sidecar shape rather than embedding `sourceEntry` directly in the `attachments[]` array elements (which would require changing the type from `string[]` to `Array<string | { path: string; sourceEntry?: string }>` — a future schema delta). 9 integration tests at `packages/studio/test/screenshot-promote-route.test.ts` cover the move + attach end-to-end (file moves to entry dir, orphan cleaned up, folded view shows attachment), cross-entry sidecar with correct sourceEntry, same-entry case omits the sidecar, 400 on malformed filename / sourceEntry, 404 on missing orphan / unknown entry / unknown commentId, 409 on destination collision. `packages/studio/src/lib/screenshot-attach.ts:promoteOrphanToEntry` is the helper backing the route; it uses `rename` with EXDEV fallback to copy+unlink for cross-filesystem moves.
+- [x] Step 8.4.3: External-image attachment: operator pastes from clipboard or drag-drops any image file from filesystem onto a comment. Landed in commit `786729f3` — `plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts` exports `bindPasteHandler(element, options)` for paste interception on the comment input AND `bindDragDropHandler(element, options)` for drag-drop interception on the composer container. Both reuse the same pipeline: extract image bytes via `extractImageFromClipboard` / `extractImageFromDrop` (which narrow on `clipboardData.files` / `dataTransfer.files` shape rather than `instanceof ClipboardEvent` / `instanceof DragEvent` — jsdom doesn't expose those globals symmetrically), persist to the orphan endpoint via `persistAsOrphan` (which synthesizes a safe filename via the existing `screenshot-capture.ts` helpers and POSTs via `screenshot-persist.ts`), then fire the `onScreenshotAttached(ev)` callback so the caller renders a pending thumbnail. Image MIME-type allowlist (png / jpeg / gif / webp); other types fall through silently. Filename safety: the synthesized server-side `<timestamp>-<hash>.png` form ignores the OS-supplied `File.name`. Both handlers return an unsubscribe function. 15 jsdom tests at `packages/studio/test/entry-review/screenshot-paste-drop.test.ts` cover image-extracted + persist + callback; plain-text paste bypasses; preventDefault on image-paste; onError surfaces persist failures; unsubscribe removes listeners; dragover preventDefault enables drop; non-image drop ignored.
 
 ### Task 8.5: Iterate skill — required disposition reason
 
@@ -2535,17 +2535,17 @@ Closes AUDIT-20260530-60 (cross-model: AUDIT-BARRAGE-codex-P6-1) via acknowledge
 
 ### Task 8.8: Tests
 
-- [ ] Step 8.8.1: Unit tests for schema validation, diff-slicing logic, screenshot path resolution, dispositions reason-required gate.
-- [ ] Step 8.8.2: Integration test against a markdown entry + a (placeholder) graphical entry: thread, attach screenshot, iterate, verify diff expansion works.
+- [x] Step 8.8.1: Unit tests for schema validation, diff-slicing logic, screenshot path resolution, dispositions reason-required gate. Coverage shipped alongside each step: schema validation in `packages/core/test/schema/draft-annotation-thread-anchor.test.ts` + `draft-annotation-edit-comment-attachments.test.ts`; diff-slicing logic in `packages/core/test/entry-diff-slice.test.ts` (Step 8.6.2); screenshot path resolution in `packages/studio/test/screenshot-persistence.test.ts` + `screenshot-upload-helper.test.ts` (Step 8.3.3); dispositions reason-required gate in `packages/cli/test/iterate/disposition-reason-required.test.ts` (Step 8.5.2) + `packages/core/test/schema/draft-annotation-address-reason.test.ts` (Step 8.1.2 write-side schema gate).
+- [x] Step 8.8.2: Integration test against a markdown entry + a (placeholder) graphical entry: thread, attach screenshot, iterate, verify diff expansion works. Landed in commit `2ce21fe3` — `packages/studio/test/entry-review/phase-8-integration.test.ts` drives the end-to-end Phase 8 flow against a real tmp project tree: create a markdown entry with sidecar + index.md, iterate to revision 1, add a root comment with attachment + 2 reply comments via `replyTo`, rewrite the markdown + iterate to revision 2, record an addressed disposition with non-empty reason, then verify (a) journal captures both iteration events with the correct markdown via `getEntryIteration`, (b) `listEntryAnnotations` folds the events into the expected `CommentAnnotation` + `AddressAnnotation` shapes (root carries `attachments`; replies carry `replyTo`; address carries `reason`), (c) `computeDiffSlice` returns a non-empty hunk set intersecting the comment's range against the revision-1 → revision-2 diff (asserts the deletion of "obviously" + the corresponding addition), and (d) the marginalia sidebar render (`groupCommentsIntoThreads` + `buildSidebarThread`) surfaces the reply-count badge ("2 replies"), the addressed badge + reason, the inline diff expansion with `data-kind="add"` / `data-kind="del"` lines, and the attached screenshot thumbnail. The graphical-entry shape is not separately driven — Phase 10/11 ships the graphical-render branch; the markdown branch's coverage exercises the full additive schema + journal + diff-slice + render flow that the graphical branch will inherit.
 
 **Acceptance Criteria:**
 
-- [ ] Annotation schema supports `replyTo`, `attachments`, `spatialAnchor`, and required-`reason` disposition fields; additive change preserves existing single-comment annotations.
-- [ ] Threads render expandable in the marginalia sidebar with reply-count badges.
-- [ ] Screenshots can be captured, attached to comments / replies, and persist at the documented sidecar path.
-- [ ] Per-comment "addressed" badge expands inline to show the disposition reason + the diff slice intersecting the comment's anchor.
-- [ ] Markdown review benefits from threads + attachments + inline diff for free (no additional render-layer work).
-- [ ] Issue #299 closes.
+- [x] Annotation schema supports `replyTo`, `attachments`, `spatialAnchor`, and required-`reason` disposition fields; additive change preserves existing single-comment annotations. Schema in `deea28fd` + `91954561` + `c708ab27`; additive invariant pinned by Step 8.1.4 tests.
+- [x] Threads render expandable in the marginalia sidebar with reply-count badges. Landed via Task 8.2 (`cb5ce372`); collapsed-by-default with `aria-pressed` toggle.
+- [x] Screenshots can be captured, attached to comments / replies, and persist at the documented sidecar path. Landed via Task 8.3 (`1112bf12`, `21b5de14`, `a461206d`) + Task 8.4 (`0eca201e`, `f47b399f`, `cd80bbe2`, `786729f3`, `4ff13351`).
+- [x] Per-comment "addressed" badge expands inline to show the disposition reason + the diff slice intersecting the comment's anchor. Landed via Task 8.6 (`b7aa3a63`, `39be53ab`, `dd00ec75`).
+- [x] Markdown review benefits from threads + attachments + inline diff for free (no additional render-layer work). Landed via Task 8.7 (`221f30e3`); end-to-end integration test added under Task 8.8.
+- [ ] Issue #299 closes. Pending post-release verification per `.claude/rules/agent-discipline.md` § Issue closure requires verification in a formally-installed release.
 
 ## Phase 9: `/frontend-design` pass for the graphical review surface + screenshot markup co-design  ·  [#310](https://github.com/audiocontrol-org/deskwork/issues/310)
 
diff --git a/packages/core/src/schema/draft-annotation.ts b/packages/core/src/schema/draft-annotation.ts
index 8aff99f4..6a1e6ef8 100644
--- a/packages/core/src/schema/draft-annotation.ts
+++ b/packages/core/src/schema/draft-annotation.ts
@@ -111,6 +111,78 @@ const BaseFields = {
   id: z.string(),
 } as const;
 
+/**
+ * W3C Web Annotation Data Model alignment (Phase 8 Step 8.1.3).
+ *
+ * Per Phase 1's decision-doc (`docs/studio-design/ACCEPTED/2026-05-26-graphical-review-prior-art/brief.md`)
+ * the project adopts `@recogito/text-annotator` + `W3CTextFormat` for
+ * text-range pins. The W3C Web Annotation Data Model is the structural
+ * base; the deskwork-namespaced fields below are the extension.
+ *
+ * Field-by-field mapping to the W3C model:
+ *
+ *   - `CommentAnnotation` (this schema) ≡ W3C `Annotation` with
+ *     `bodyValue: <text>` plus a selector chosen by the kind of pin
+ *     being recorded (TextQuoteSelector / TextPositionSelector for
+ *     markdown character ranges; FragmentSelector or XPathSelector for
+ *     DOM-keyed pins; SvgSelector for free-form region pins).
+ *
+ *   - `range` (`RangeSchema`) ≡ W3C `TextPositionSelector` /
+ *     `TextQuoteSelector`. The recogito library emits both selectors
+ *     for the same annotation; the deskwork schema currently persists
+ *     only the position form, with the quote shape recoverable from
+ *     the underlying markdown bytes at read time.
+ *
+ *   - `text` (this schema) ≡ W3C `bodyValue` (a plain-text comment
+ *     body). The W3C model also supports a structured `Body` with its
+ *     own type / value / purpose; deskwork's v1 single-string `text`
+ *     maps to the simpler `bodyValue` shape. Future thread / disposition
+ *     fields are layered as additional bodies with their own purpose.
+ *
+ *   - `replyTo` (Step 8.1.1) ≡ W3C single-level reply via a
+ *     `motivation: 'replying'` annotation whose `target` points at
+ *     another annotation. deskwork's reply model is one level deep
+ *     (root + replies; no nested reply-to-reply); this matches the
+ *     `replying` motivation cleanly and avoids the JSON-LD graph
+ *     traversal cost of nested-reply models.
+ *
+ *   - `attachments` (Step 8.1.1) ≡ W3C `body` of type `Image`. The
+ *     deskwork schema stores attachments as a `string[]` of relative
+ *     paths under `<entryDir>/scrapbook/screenshots/` rather than the
+ *     verbose JSON-LD body shape; the path-only form is the smallest
+ *     persistent representation that the studio can resolve to an
+ *     `<img>` src + a server can resolve to a file on disk.
+ *
+ *   - `spatialAnchor` (Step 8.1.1, discriminated union over `kind`)
+ *     ≡ W3C selectors:
+ *       - `kind: 'pixel'` (with `x` + `y` numbers) ≡ W3C
+ *         `FragmentSelector` with a pixel-fragment value (or an
+ *         `SvgSelector` describing a point primitive).
+ *       - `kind: 'dom-selector'` (with `selector` CSS string) ≡ W3C
+ *         `XPathSelector` (CSS-selector form is a deskwork variant).
+ *       - `kind: 'svg-element'` (with `selector` id-or-path string)
+ *         ≡ W3C `FragmentSelector` keyed by an SVG element id (the
+ *         W3C `SvgSelector` shape would carry an inline SVG fragment;
+ *         deskwork references the element by id instead).
+ *
+ *   - `category` ≡ W3C `purpose` on a non-comment body (e.g.
+ *     `motivation: 'tagging'` with a body whose `purpose` carries
+ *     the category label). deskwork v1 inlines the category on the
+ *     comment annotation itself; W3C alignment is a render-side
+ *     translation when serializing for export.
+ *
+ *   - `anchor` ≡ W3C selector hint (an opaque string that callers
+ *     resolved to a DOM element prior to recogito adoption). New
+ *     pins are recorded via the recogito-emitted W3C selectors; the
+ *     legacy `anchor` field is retained for read compatibility.
+ *
+ * The additive Phase 8 fields (`replyTo`, `attachments`,
+ * `spatialAnchor`) are independently optional, so legacy single-
+ * comment annotations parse unchanged (Step 8.1.4 invariant).
+ *
+ * The TS source-of-truth for the runtime shape lives at
+ * `review/types.ts:CommentAnnotation`.
+ */
 const CommentAnnotation = z.object({
   ...BaseFields,
   type: z.literal('comment'),
@@ -122,6 +194,8 @@ const CommentAnnotation = z.object({
   // Phase 8 Step 8.1.1 — additive fields. Existing single-comment
   // annotations without any of these continue to parse unchanged.
   // The TS source-of-truth lives at `review/types.ts:CommentAnnotation`.
+  // W3C Web Annotation mapping for each of these fields is documented
+  // in the schema-level docstring above (Step 8.1.3).
   replyTo: z.string().optional(),
   attachments: z.array(z.string()).optional(),
   spatialAnchor: SpatialAnchorSchema.optional(),
diff --git a/packages/core/src/schema/entry.ts b/packages/core/src/schema/entry.ts
index 3ef28da6..7b6c118a 100644
--- a/packages/core/src/schema/entry.ts
+++ b/packages/core/src/schema/entry.ts
@@ -62,10 +62,9 @@ const OFF_PIPELINE: readonly Stage[] = ['Blocked', 'Cancelled'] as const;
  * @deprecated Use `isLinearPipelineStageInTemplate(template, stage)` from
  *   `@deskwork/core/pipelines`. Resolve `template` via
  *   `resolveEntryStrictTemplate(entry, projectRoot)` from
- *   `@deskwork/core/lanes`. The editorial-narrow form here is kept for
- *   non-verb callers that operate on the editorial vocabulary
- *   specifically (e.g. the legacy calendar migration parser); new code
- *   should use the template-aware helper.
+ *   `@deskwork/core/lanes`. The legacy editorial helpers will be
+ *   deleted in a future cleanup once their last callers (legacy
+ *   calendar migration parser) are themselves removed.
  */
 export function isLinearPipelineStage(s: string): boolean {
   return (LINEAR_PIPELINE as readonly string[]).includes(s);
@@ -75,7 +74,9 @@ export function isLinearPipelineStage(s: string): boolean {
  * @deprecated Use `isOffPipelineStageInTemplate(template, stage)` from
  *   `@deskwork/core/pipelines`. Resolve `template` via
  *   `resolveEntryStrictTemplate(entry, projectRoot)` from
- *   `@deskwork/core/lanes`.
+ *   `@deskwork/core/lanes`. The legacy editorial helpers will be
+ *   deleted in a future cleanup once their last callers (legacy
+ *   calendar migration parser) are themselves removed.
  */
 export function isOffPipelineStage(s: string): boolean {
   return (OFF_PIPELINE as readonly string[]).includes(s);
@@ -102,9 +103,9 @@ const SUCCESSOR: Record<Stage, Stage | null> = {
  * @deprecated Use `nextStageInTemplate(template, stage)` from
  *   `@deskwork/core/pipelines`. Resolve `template` via
  *   `resolveEntryStrictTemplate(entry, projectRoot)` from
- *   `@deskwork/core/lanes`. The editorial-narrow form here is kept for
- *   non-verb callers that operate on the editorial vocabulary
- *   specifically (e.g. the legacy calendar migration parser).
+ *   `@deskwork/core/lanes`. The legacy editorial helpers will be
+ *   deleted in a future cleanup once their last callers (legacy
+ *   calendar migration parser) are themselves removed.
  */
 export function nextStage(s: string): Stage | null {
   if (
diff --git a/packages/studio/src/lib/screenshot-attach.ts b/packages/studio/src/lib/screenshot-attach.ts
new file mode 100644
index 00000000..cc17c143
--- /dev/null
+++ b/packages/studio/src/lib/screenshot-attach.ts
@@ -0,0 +1,257 @@
+/**
+ * Phase 8 Step 8.4.1 + 8.4.2 — server-side helpers for the screenshot
+ * attach-to-comment workflow + the orphan / cross-entry promotion path.
+ *
+ * Two responsibilities, kept separate from `screenshot-persistence.ts`:
+ *
+ *   1. Bind a previously-persisted screenshot file to a comment's
+ *      `attachments[]` field by appending an `edit-comment` journal
+ *      event whose `attachments` is the FULL intended list (prior
+ *      attachments + the new path). Full-replacement semantics match
+ *      the schema's `EditCommentAnnotation.attachments` contract.
+ *
+ *   2. Promote an orphan-path screenshot (under
+ *      `<projectRoot>/.deskwork/screenshots-orphan/<filename>`) to an
+ *      entry-anchored path (under `<entryDir>/scrapbook/screenshots/`).
+ *      The promotion is a move (atomic rename when on the same
+ *      filesystem; fall back to copy+unlink otherwise). When the
+ *      operator promotes from entry A to a comment on entry B (the
+ *      Task 8.4.2 cross-entry case), the destination dir is entry B's
+ *      scrapbook and a sidecar `<filename>.meta.json` lands next to
+ *      the moved file naming the source entry. The sidecar is
+ *      operator-visible context — the schema's `attachments[]` stays
+ *      a plain `string[]` for the v1 surface; a follow-up schema
+ *      delta could embed `sourceEntry` directly.
+ *
+ * The helpers do NOT decide the rendering of the attached screenshot
+ * — that's the sidebar-render module's concern. Their contract is
+ * journal-write + file-move only.
+ */
+
+import { existsSync } from 'node:fs';
+import { mkdir, rename, copyFile, unlink, writeFile } from 'node:fs/promises';
+import { dirname, join, relative, isAbsolute } from 'node:path';
+import { readSidecar } from '@deskwork/core/sidecar';
+import {
+  addEntryAnnotation,
+  listEntryAnnotations,
+  mintEntryAnnotation,
+} from '@deskwork/core/entry/annotations';
+import type {
+  CommentAnnotation,
+  DraftAnnotation,
+} from '@deskwork/core/review/types';
+import {
+  assertSafeScreenshotFilename,
+  entryScreenshotsDir,
+  orphanScreenshotsDir,
+} from './screenshot-persistence.ts';
+
+const UUID_RE =
+  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
+
+export interface AttachResult {
+  /**
+   * The `edit-comment` annotation that was minted + appended. The
+   * caller serialises this back to the client so the live sidebar
+   * can fold it without re-fetching.
+   */
+  readonly annotation: DraftAnnotation;
+  /**
+   * The full attachments[] list AFTER the attach. Convenience field
+   * for callers that want to update an in-memory cache directly.
+   */
+  readonly attachments: readonly string[];
+}
+
+export interface PromoteResult extends AttachResult {
+  /** Absolute path the orphan file was moved to. */
+  readonly writtenPath: string;
+  /** Same path relative to the project root (or absolute if the
+   *  resolved path lies outside the project — atypical). */
+  readonly relativeWrittenPath: string;
+  /**
+   * Absolute path to the sidecar metadata file (`<filename>.meta.json`)
+   * when one was written (cross-entry promotion case), or null when
+   * the orphan came from the same entry context as the target
+   * (sidecar is informational; no source-entry distinction to record).
+   */
+  readonly sidecarMetaPath: string | null;
+}
+
+/**
+ * Look up a comment annotation by id in the FOLDED entry-keyed
+ * annotation list. Returns the comment when found, null otherwise.
+ * The fold path applies prior edit-comment events, so the returned
+ * attachments[] reflects the latest committed state — which is
+ * exactly what the attach flow needs to compose `[...prior, new]`.
+ */
+async function findCommentByIdFolded(
+  projectRoot: string,
+  entryId: string,
+  commentId: string,
+): Promise<CommentAnnotation | null> {
+  const list = await listEntryAnnotations(projectRoot, entryId);
+  for (const ann of list) {
+    if (ann.type === 'comment' && ann.id === commentId) {
+      return ann;
+    }
+  }
+  return null;
+}
+
+/**
+ * Append an `edit-comment` annotation that mutates the comment's
+ * attachments[] to `[...prior, newRelativePath]`. The comment must
+ * already exist in the entry's stream (the writer's commentId-
+ * exists check will throw if not).
+ *
+ * `newRelativePath` is taken verbatim — callers are responsible for
+ * passing the project-root-relative path the screenshot was
+ * persisted at (matches the `relativeWrittenPath` shape returned by
+ * `persistEntryScreenshot`).
+ */
+export async function attachScreenshotToCommentServer(
+  projectRoot: string,
+  entryId: string,
+  commentId: string,
+  newRelativePath: string,
+): Promise<AttachResult> {
+  if (!UUID_RE.test(entryId)) {
+    throw new Error(`malformed entryId: ${entryId}`);
+  }
+  if (!UUID_RE.test(commentId)) {
+    throw new Error(`malformed commentId: ${commentId}`);
+  }
+  if (typeof newRelativePath !== 'string' || newRelativePath.length === 0) {
+    throw new Error('newRelativePath is required');
+  }
+  const comment = await findCommentByIdFolded(projectRoot, entryId, commentId);
+  if (comment === null) {
+    throw new Error(`unknown commentId ${commentId} on entry ${entryId}`);
+  }
+  const prior = comment.attachments ?? [];
+  const next = [...prior, newRelativePath];
+  const minted: DraftAnnotation = mintEntryAnnotation({
+    type: 'edit-comment',
+    workflowId: entryId,
+    commentId,
+    attachments: next,
+  });
+  await addEntryAnnotation(projectRoot, entryId, minted);
+  return { annotation: minted, attachments: next };
+}
+
+export interface PromoteOptions {
+  /**
+   * UUID of the entry the orphan ORIGINATED from, if known. When this
+   * differs from the destination entry, the helper writes a
+   * `<filename>.meta.json` sidecar next to the moved file naming
+   * the source entry — operator-visible context for the cross-entry
+   * case (Task 8.4.2). When this matches the destination entry or
+   * is omitted, no sidecar is written.
+   */
+  readonly sourceEntry?: string;
+}
+
+/**
+ * Move an orphan-path screenshot to an entry-anchored path AND
+ * append an `edit-comment` annotation binding it to the named
+ * comment's attachments[].
+ *
+ * The move is `rename` when possible; falls back to copy+unlink for
+ * cross-filesystem cases (atypical — orphan and entry scrapbook live
+ * under the same project root). Refuses to overwrite an existing
+ * file at the destination.
+ *
+ * `options.sourceEntry` records the originating entry when set AND
+ * different from `entryId` (the cross-entry case). The sidecar
+ * `<filename>.meta.json` carries `{ sourceEntry: '<uuid>' }` so the
+ * provenance is preserved without a schema delta.
+ */
+export async function promoteOrphanToEntry(
+  projectRoot: string,
+  filename: string,
+  entryId: string,
+  commentId: string,
+  options: PromoteOptions = {},
+): Promise<PromoteResult> {
+  if (!UUID_RE.test(entryId)) {
+    throw new Error(`malformed entryId: ${entryId}`);
+  }
+  if (!UUID_RE.test(commentId)) {
+    throw new Error(`malformed commentId: ${commentId}`);
+  }
+  assertSafeScreenshotFilename(filename);
+  if (options.sourceEntry !== undefined && !UUID_RE.test(options.sourceEntry)) {
+    throw new Error(`malformed sourceEntry: ${options.sourceEntry}`);
+  }
+  const orphanPath = join(orphanScreenshotsDir(projectRoot), filename);
+  if (!existsSync(orphanPath)) {
+    throw new Error(`orphan screenshot not found at ${orphanPath}`);
+  }
+  const entry = await readSidecar(projectRoot, entryId);
+  const destDir = entryScreenshotsDir(projectRoot, entry);
+  await mkdir(destDir, { recursive: true });
+  const writtenPath = join(destDir, filename);
+  if (existsSync(writtenPath)) {
+    throw new Error(`screenshot already exists at ${writtenPath}`);
+  }
+  await moveFile(orphanPath, writtenPath);
+  const rel = relative(projectRoot, writtenPath);
+  const relativeWrittenPath =
+    rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
+      ? rel
+      : writtenPath;
+  // Cross-entry sidecar — record source only when distinct from
+  // destination. Mirrors the Task 8.4.2 sidecar shape spec'd in the
+  // workplan prose: `<filename>.meta.json` carries
+  // `{ sourceEntry: '<uuid>' }`.
+  let sidecarMetaPath: string | null = null;
+  if (
+    options.sourceEntry !== undefined &&
+    options.sourceEntry !== entryId
+  ) {
+    sidecarMetaPath = `${writtenPath}.meta.json`;
+    if (existsSync(sidecarMetaPath)) {
+      throw new Error(
+        `screenshot sidecar metadata already exists at ${sidecarMetaPath}`,
+      );
+    }
+    await writeFile(
+      sidecarMetaPath,
+      JSON.stringify({ sourceEntry: options.sourceEntry }, null, 2) + '\n',
+      'utf-8',
+    );
+  }
+  const attached = await attachScreenshotToCommentServer(
+    projectRoot,
+    entryId,
+    commentId,
+    relativeWrittenPath,
+  );
+  return {
+    ...attached,
+    writtenPath,
+    relativeWrittenPath,
+    sidecarMetaPath,
+  };
+}
+
+async function moveFile(src: string, dest: string): Promise<void> {
+  const destDir = dirname(dest);
+  await mkdir(destDir, { recursive: true });
+  try {
+    await rename(src, dest);
+    return;
+  } catch (err) {
+    // EXDEV (cross-device link) — fall back to copy + unlink.
+    const code =
+      err instanceof Error && 'code' in err
+        ? Reflect.get(err, 'code')
+        : undefined;
+    if (code !== 'EXDEV') throw err;
+    await copyFile(src, dest);
+    await unlink(src);
+  }
+}
diff --git a/packages/studio/src/routes/api.ts b/packages/studio/src/routes/api.ts
index 63520c67..02997d1f 100644
--- a/packages/studio/src/routes/api.ts
+++ b/packages/studio/src/routes/api.ts
@@ -48,6 +48,10 @@ import {
   persistEntryScreenshot,
   persistOrphanScreenshot,
 } from '../lib/screenshot-persistence.ts';
+import {
+  attachScreenshotToCommentServer,
+  promoteOrphanToEntry,
+} from '../lib/screenshot-attach.ts';
 import {
   extractScreenshotUploadFile,
   mapScreenshotErrorToResponse,
@@ -113,6 +117,47 @@ function readValidEntryAndCommentIds(
   return { entryId: idResult.entryId, commentId: cidResult.commentId };
 }
 
+/**
+ * Read the request body as a JSON object. Returns the parsed object,
+ * or a fully-formed `Response` the caller should return immediately
+ * when the parse fails (400 invalid JSON body) OR the parsed value
+ * is not a plain object (400 expected JSON object body).
+ *
+ * Pulled up to a shared helper after the Phase 8 Step 8.4 routes
+ * tripped the clone-detection gate on the let-body-try-catch-typeof
+ * shape that previously lived inline at five+ call sites.
+ */
+/**
+ * Map an annotation-write exception to an HTTP response. The append
+ * path (`addEntryAnnotation` / `attachScreenshotToCommentServer`)
+ * surfaces "unknown commentId ..." as 404 — every other error is
+ * 500. Pulled up after the Phase 8 Step 8.4 attach route tripped
+ * the clone-detection gate against the four+ existing catch-blocks
+ * with this exact shape.
+ */
+function mapAnnotationWriteError(c: Context, err: unknown): Response {
+  const msg = err instanceof Error ? err.message : String(err);
+  if (msg.includes('unknown commentId')) {
+    return c.json({ error: msg }, 404);
+  }
+  return c.json({ error: msg }, 500);
+}
+
+async function readJsonObjectBody(
+  c: Context,
+): Promise<Record<string, unknown> | Response> {
+  let parsed: unknown;
+  try {
+    parsed = await c.req.json();
+  } catch {
+    return c.json({ error: 'invalid JSON body' }, 400);
+  }
+  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
+    return c.json({ error: 'expected JSON object body' }, 400);
+  }
+  return parsed as Record<string, unknown>;
+}
+
 /**
  * Look up the entry's sidecar on disk; returns `null` on success.
  * Returns a fully-formed `Response` when the sidecar lookup fails —
@@ -348,13 +393,10 @@ export function createApiRouter(ctx: StudioContext): Hono {
     try {
       await addEntryAnnotation(ctx.projectRoot, entryId, minted);
     } catch (err) {
-      const msg = err instanceof Error ? err.message : String(err);
       // edit-comment / delete-comment writes that reference an unknown
-      // commentId surface here as a 404; everything else is a 500.
-      if (msg.includes('unknown commentId')) {
-        return c.json({ error: msg }, 404);
-      }
-      return c.json({ error: msg }, 500);
+      // commentId surface as 404 via mapAnnotationWriteError; everything
+      // else is a 500.
+      return mapAnnotationWriteError(c, err);
     }
     return c.json({ annotation: minted });
   });
@@ -506,6 +548,150 @@ export function createApiRouter(ctx: StudioContext): Hono {
     }
   });
 
+  // POST /api/dev/editorial-review/entry/:entryId/comment/:commentId/attach
+  //
+  // Phase 8 Step 8.4.1 — bind a previously-persisted screenshot path
+  // to an existing comment's `attachments[]` field. Request body:
+  // JSON object with `{ relativePath: string }` — the project-root-
+  // relative path the screenshot was persisted at (matches the
+  // `relativeWrittenPath` field returned by the Step 8.3.3
+  // entry-screenshot endpoint).
+  //
+  // The server reads the comment's current attachments via the
+  // folded annotation list, composes `[...prior, relativePath]`,
+  // mints an `edit-comment` annotation carrying the full intended
+  // list, and appends it to the journal. Returns the minted
+  // annotation + the post-attach attachments[] so the client can
+  // patch its in-memory cache without re-fetching.
+  //
+  // Status codes:
+  //   400 — malformed entryId / commentId; missing or non-string
+  //         relativePath; empty relativePath.
+  //   404 — unknown entry sidecar; OR commentId not present in the
+  //         entry's stream.
+  //   200 — `{ annotation, attachments }`.
+  app.post('/entry/:entryId/comment/:commentId/attach', async (c) => {
+    const idsResult = readValidEntryAndCommentIds(c);
+    if (idsResult instanceof Response) return idsResult;
+    const { entryId, commentId } = idsResult;
+    const body = await readJsonObjectBody(c);
+    if (body instanceof Response) return body;
+    const relativePath = Reflect.get(body, 'relativePath');
+    if (typeof relativePath !== 'string' || relativePath.length === 0) {
+      return c.json(
+        { error: 'relativePath (non-empty string) is required' },
+        400,
+      );
+    }
+    const sidecarErr = await lookupEntrySidecar(c, ctx.projectRoot, entryId);
+    if (sidecarErr !== null) return sidecarErr;
+    try {
+      const result = await attachScreenshotToCommentServer(
+        ctx.projectRoot,
+        entryId,
+        commentId,
+        relativePath,
+      );
+      return c.json(
+        {
+          annotation: result.annotation,
+          attachments: result.attachments,
+        },
+        200,
+      );
+    } catch (err) {
+      return mapAnnotationWriteError(c, err);
+    }
+  });
+
+  // POST /api/dev/editorial-review/screenshots/orphan/:filename/promote-to-entry/:entryId/comment/:commentId
+  //
+  // Phase 8 Step 8.4.1 + 8.4.2 — move an orphan-path screenshot to
+  // an entry-anchored path AND attach it to the named comment. Request
+  // body is OPTIONAL JSON `{ sourceEntry?: string }`: when present and
+  // different from `:entryId`, a `<filename>.meta.json` sidecar lands
+  // next to the moved file naming the source entry (the cross-entry
+  // case).
+  //
+  // Status codes:
+  //   400 — malformed entryId / commentId / filename / sourceEntry.
+  //   404 — entry sidecar not found; OR commentId not in entry stream;
+  //         OR orphan file not present.
+  //   409 — file already exists at the destination path.
+  //   200 — `{ annotation, attachments, writtenPath, relativeWrittenPath, sidecarMetaPath }`.
+  app.post(
+    '/screenshots/orphan/:filename/promote-to-entry/:entryId/comment/:commentId',
+    async (c) => {
+      const filename = c.req.param('filename');
+      const idsResult = readValidEntryAndCommentIds(c);
+      if (idsResult instanceof Response) return idsResult;
+      const { entryId, commentId } = idsResult;
+      let body: unknown = {};
+      // Body is optional. Only attempt JSON parse when content-type
+      // hints at it — a bare POST without a body is the in-entry
+      // (non-cross-entry) common case.
+      const contentType = c.req.header('content-type') ?? '';
+      if (contentType.toLowerCase().includes('application/json')) {
+        try {
+          body = await c.req.json();
+        } catch {
+          return c.json({ error: 'invalid JSON body' }, 400);
+        }
+        if (typeof body !== 'object' || body === null) {
+          return c.json({ error: 'expected JSON object body' }, 400);
+        }
+      }
+      const sourceRaw = Reflect.get(body, 'sourceEntry');
+      const sourceEntry =
+        typeof sourceRaw === 'string' && sourceRaw.length > 0
+          ? sourceRaw
+          : undefined;
+      try {
+        const result = await promoteOrphanToEntry(
+          ctx.projectRoot,
+          filename,
+          entryId,
+          commentId,
+          sourceEntry !== undefined ? { sourceEntry } : {},
+        );
+        return c.json(
+          {
+            annotation: result.annotation,
+            attachments: result.attachments,
+            writtenPath: result.writtenPath,
+            relativeWrittenPath: result.relativeWrittenPath,
+            sidecarMetaPath: result.sidecarMetaPath,
+          },
+          200,
+        );
+      } catch (err) {
+        const msg = err instanceof Error ? err.message : String(err);
+        if (msg.startsWith('malformed ')) {
+          return c.json({ error: msg }, 400);
+        }
+        if (msg.startsWith('screenshot filename') || msg === 'screenshot filename is required') {
+          return c.json({ error: msg }, 400);
+        }
+        if (msg.startsWith('orphan screenshot not found')) {
+          return c.json({ error: msg }, 404);
+        }
+        if (msg.startsWith('sidecar not found')) {
+          return c.json({ error: `unknown entry: ${entryId}` }, 404);
+        }
+        if (msg.includes('unknown commentId')) {
+          return c.json({ error: msg }, 404);
+        }
+        if (msg.startsWith('screenshot already exists at ')) {
+          return c.json({ error: msg }, 409);
+        }
+        if (msg.startsWith('screenshot sidecar metadata already exists at ')) {
+          return c.json({ error: msg }, 409);
+        }
+        return c.json({ error: msg }, 500);
+      }
+    },
+  );
+
   // PATCH /api/dev/editorial-review/entry/:entryId/comments/:commentId
   app.patch('/entry/:entryId/comments/:commentId', async (c) => {
     const idsResult = readValidEntryAndCommentIds(c);
@@ -538,11 +724,7 @@ export function createApiRouter(ctx: StudioContext): Hono {
     try {
       await addEntryAnnotation(ctx.projectRoot, entryId, minted);
     } catch (err) {
-      const msg = err instanceof Error ? err.message : String(err);
-      if (msg.includes('unknown commentId')) {
-        return c.json({ error: msg }, 404);
-      }
-      return c.json({ error: msg }, 500);
+      return mapAnnotationWriteError(c, err);
     }
     return c.json({ annotation: minted });
   });
@@ -562,11 +744,7 @@ export function createApiRouter(ctx: StudioContext): Hono {
     try {
       await addEntryAnnotation(ctx.projectRoot, entryId, minted);
     } catch (err) {
-      const msg = err instanceof Error ? err.message : String(err);
-      if (msg.includes('unknown commentId')) {
-        return c.json({ error: msg }, 404);
-      }
-      return c.json({ error: msg }, 500);
+      return mapAnnotationWriteError(c, err);
     }
     return c.json({ annotation: minted });
   });
@@ -595,15 +773,8 @@ export function createApiRouter(ctx: StudioContext): Hono {
         400,
       );
     }
-    let body: unknown;
-    try {
-      body = await c.req.json();
-    } catch {
-      return c.json({ error: 'invalid JSON body' }, 400);
-    }
-    if (typeof body !== 'object' || body === null) {
-      return c.json({ error: 'expected JSON object body' }, 400);
-    }
+    const body = await readJsonObjectBody(c);
+    if (body instanceof Response) return body;
     const markdown = Reflect.get(body, 'markdown');
     if (typeof markdown !== 'string') {
       return c.json({ error: 'markdown (string) is required' }, 400);
diff --git a/packages/studio/src/routes/entry-annotation-body.ts b/packages/studio/src/routes/entry-annotation-body.ts
index 08b38ccc..c0b872eb 100644
--- a/packages/studio/src/routes/entry-annotation-body.ts
+++ b/packages/studio/src/routes/entry-annotation-body.ts
@@ -82,6 +82,29 @@ export function parseEntryAnnotationBody(body: unknown): ParseResult {
       }
       if (typeof text !== 'string') return err('comment.text is required');
       const category = asCategory(obj.category);
+      // Phase 8 Step 8.4.1 — a brand-new `comment` annotation may
+      // carry `attachments[]` if it was created via the
+      // capture-then-create flow (the screenshot is pre-attached at
+      // POST time, not via a follow-up edit-comment). Validate the
+      // shape identically to the edit-comment patch.
+      let attachments: string[] | undefined;
+      if (obj.attachments !== undefined) {
+        if (!Array.isArray(obj.attachments)) {
+          return err('comment.attachments must be an array of strings');
+        }
+        const arr: string[] = [];
+        for (const item of obj.attachments) {
+          if (typeof item !== 'string') {
+            return err('comment.attachments entries must be strings');
+          }
+          arr.push(item);
+        }
+        attachments = arr;
+      }
+      const replyTo =
+        typeof obj.replyTo === 'string' && obj.replyTo.length > 0
+          ? obj.replyTo
+          : undefined;
       const draft: AnnotationDraftFromBody = {
         type: 'comment',
         workflowId,
@@ -90,6 +113,8 @@ export function parseEntryAnnotationBody(body: unknown): ParseResult {
         text,
         ...(category !== null ? { category } : {}),
         ...(typeof obj.anchor === 'string' ? { anchor: obj.anchor } : {}),
+        ...(attachments !== undefined ? { attachments } : {}),
+        ...(replyTo !== undefined ? { replyTo } : {}),
       };
       return { kind: 'ok', draft };
     }
diff --git a/packages/studio/test/entry-review/markdown-benefits-phase-8.test.ts b/packages/studio/test/entry-review/markdown-benefits-phase-8.test.ts
index 96d314fc..5fd9323b 100644
--- a/packages/studio/test/entry-review/markdown-benefits-phase-8.test.ts
+++ b/packages/studio/test/entry-review/markdown-benefits-phase-8.test.ts
@@ -22,23 +22,22 @@
  * to catch any cross-cutting regression that a per-step test would
  * miss.
  *
- * Render-side support state as of Phase 8 Task 8.7 (per pre-flight
- * audit in `plugins/deskwork-studio/public/src/entry-review/`):
+ * Render-side support state as of Phase 8 Task 8.4:
  *
  *   Field                         | Schema | Render
  *   ------------------------------|--------|-----------------------
  *   replyTo                       |  YES   | YES (Task 8.2)
  *   addressed reason              |  YES   | YES (Step 8.5.3)
  *   inline diff expansion         |  YES   | YES (Task 8.6)
- *   attachments                   |  YES   | NO (Task 8.3 / 8.4 future)
+ *   attachments                   |  YES   | YES (Task 8.4 render)
  *   spatialAnchor                 |  YES   | NO (Phase 10 / 11 future)
  *
  * For fields whose render-side has shipped, the assertion form is
  * "the rendered DOM surfaces the field correctly." For fields whose
  * render-side has NOT shipped, the assertion form is "the field
  * survives into the parsed `CommentAnnotation` object so a future
- * Phase 10/11 + Task 8.3/8.4 render pass can read it without a
- * schema-shape migration."
+ * Phase 10/11 render pass can read it without a schema-shape
+ * migration."
  */
 
 import { describe, it, expect, beforeEach, vi } from 'vitest';
@@ -267,49 +266,73 @@ describe('Phase 8 cross-cutting markdown review benefit (Task 8.7)', () => {
   );
 
   it(
-    'parsed CommentAnnotation surfaces the attachments field on a markdown ' +
-      'entry — schema integration works even though Task 8.3/8.4 has not ' +
-      'shipped the render-side',
+    'attachments render as <img> thumbnails in the marginalia strip ' +
+      '(Phase 8 Step 8.4 render-side)',
     () => {
-      // Task 8.7's pre-flight audit found that `sidebar-render.ts`
-      // does NOT currently surface `attachments` in the rendered DOM.
-      // Task 8.3 (capture) + Task 8.4 (rendering) are the future
-      // dispatches that close that gap. This test pins the SCHEMA
-      // integration: the field reaches the parsed `CommentAnnotation`
-      // object and is available for the future renderer to read.
+      // Phase 8 Step 8.4 added the render-side for `attachments[]`:
+      // each path becomes an `<img>` inside an
+      // `.er-marginalia-attachments` container appended below the
+      // comment text. The assertion form is full DOM verification —
+      // every attachment path renders as a thumbnail with the same
+      // `src` value and the lazy-loading attribute set.
       //
-      // The assertion form is shape-only — we DO NOT assert against
-      // rendered DOM because no render-side exists. If a future task
-      // adds attachment-rendering, the additional DOM assertions
-      // land in the per-task test (`packages/studio/test/entry-review/
-      // attachment-render.test.ts` or similar); this test continues
-      // to guard the schema-integration baseline.
+      // Future work (Phase 9/10/11) wraps the `<img>` in a
+      // click-to-lightbox container; that change will not touch
+      // this test's invariants because the lightbox-trigger
+      // attaches to the existing `<img>` tags rather than
+      // restructuring the strip.
       const withAttachment = comment({
         id: 'c-with-attachment',
         text: 'see the screenshot — the misalignment is on the right edge',
         attachments: [
-          'scrapbook/screenshots/comment-c-with-attachment-12345.png',
+          'docs/foo/scrapbook/screenshots/comment-c-with-attachment-A.png',
+          'docs/foo/scrapbook/screenshots/comment-c-with-attachment-B.png',
         ],
       });
 
-      // The TS type allows the field through (declared as
-      // `attachments?: string[]` on the client-side
-      // CommentAnnotation). The runtime preserves it on round-trip
-      // through `groupCommentsIntoThreads` — single-comment input
-      // emits a single-root thread whose `root` IS the input object.
       const threads = groupCommentsIntoThreads([withAttachment]);
       expect(threads).toHaveLength(1);
       expect(threads[0].root.id).toBe('c-with-attachment');
       expect(threads[0].root.attachments).toEqual([
-        'scrapbook/screenshots/comment-c-with-attachment-12345.png',
+        'docs/foo/scrapbook/screenshots/comment-c-with-attachment-A.png',
+        'docs/foo/scrapbook/screenshots/comment-c-with-attachment-B.png',
       ]);
 
-      // Render the comment — confirm no crash and the DOM contains
-      // the comment card (the field is silently carried, not
-      // surfaced, until Task 8.3/8.4 adds the render branch).
       const li = buildSidebarThread(threads[0], 'current', makeDeps());
       document.body.appendChild(li);
       expect(li.dataset.annotationId).toBe('c-with-attachment');
+
+      // Render-side: the attachment strip is appended on the root
+      // card. Two thumbnails, one per attachment, each with src
+      // matching the input verbatim and the lazy-loading attribute.
+      const strip = li.querySelector<HTMLElement>(
+        '.er-marginalia-attachments',
+      );
+      expect(strip).not.toBeNull();
+      const thumbs = strip?.querySelectorAll<HTMLImageElement>(
+        '.er-marginalia-attachment-thumb',
+      );
+      expect(thumbs?.length).toBe(2);
+      expect(thumbs?.[0]?.getAttribute('src')).toBe(
+        'docs/foo/scrapbook/screenshots/comment-c-with-attachment-A.png',
+      );
+      expect(thumbs?.[1]?.getAttribute('src')).toBe(
+        'docs/foo/scrapbook/screenshots/comment-c-with-attachment-B.png',
+      );
+      expect(thumbs?.[0]?.getAttribute('loading')).toBe('lazy');
+      expect(thumbs?.[0]?.getAttribute('alt')).toBe('attached screenshot');
+    },
+  );
+
+  it(
+    'comment with no attachments does NOT render an empty marginalia strip',
+    () => {
+      const plain = comment({ id: 'c-plain', text: 'plain comment' });
+      const threads = groupCommentsIntoThreads([plain]);
+      const li = buildSidebarThread(threads[0], 'current', makeDeps());
+      document.body.appendChild(li);
+      const strip = li.querySelector('.er-marginalia-attachments');
+      expect(strip).toBeNull();
     },
   );
 
diff --git a/packages/studio/test/entry-review/phase-8-integration.test.ts b/packages/studio/test/entry-review/phase-8-integration.test.ts
new file mode 100644
index 00000000..54a317f9
--- /dev/null
+++ b/packages/studio/test/entry-review/phase-8-integration.test.ts
@@ -0,0 +1,445 @@
+/**
+ * @vitest-environment jsdom
+ *
+ * Phase 8 Task 8.8 — end-to-end integration test.
+ *
+ * The per-step Phase 8 tests cover each surface in isolation:
+ *
+ *   - `addressed-badge-expand.test.ts`     — Task 8.6 click toggle.
+ *   - `addressed-badge-empty-diff.test.ts` — Step 8.6.4 fallback.
+ *   - `addressed-badge-legacy.test.ts`     — Step 8.5.3 legacy marker.
+ *   - `thread-render.test.ts`              — Task 8.2 reply rendering.
+ *   - `threads-grouping.test.ts`           — Task 8.2 grouping helper.
+ *   - `thread-permalink.test.ts`           — Step 8.2.3 hash permalinks.
+ *   - `screenshot-attach.test.ts`          — Step 8.4.1 client attach.
+ *   - `screenshot-attach-route.test.ts`    — Step 8.4.1 server attach.
+ *   - `screenshot-promote-route.test.ts`   — Step 8.4.2 promote-to-entry.
+ *   - `markdown-benefits-phase-8.test.ts`  — Task 8.7 cross-cutting render.
+ *
+ * Those tests pin individual contracts. This test drives the FULL
+ * Phase 8 flow against a real project tree on disk — sidecar, journal,
+ * markdown file, real `iterateEntry` writing a real iteration event,
+ * real `addEntryAnnotation` writing real comment + address annotations,
+ * real `listEntryAnnotations` folding the journal back into the
+ * displayable annotation stream, real `computeDiffSlice` deriving the
+ * diff-slice payload from the journal's two recorded revisions, and
+ * the marginalia sidebar render reproducing what the operator sees.
+ *
+ * Scope:
+ *   1. Create a markdown entry with a real sidecar + index.md.
+ *   2. Iterate to revision 1 (the prior-version baseline).
+ *   3. Add a root comment with `attachments: [screenshot.png]`
+ *      (Step 8.1.1 + Step 8.4 schema field).
+ *   4. Add 2 reply comments with `replyTo` pointing at the root
+ *      (Step 8.2 threading + Step 8.1.1 schema field).
+ *   5. Modify the markdown + iterate to revision 2 (the addressed
+ *      version that the diff-slice fires against).
+ *   6. Record an `addressed` disposition on the root with a non-empty
+ *      `reason` (Step 8.1.2 required-reason gate + Step 8.5 contract).
+ *   7. Verify the journal contains every expected event.
+ *   8. Verify `listEntryAnnotations` folds the events into the expected
+ *      `CommentAnnotation` + `AddressAnnotation` shapes.
+ *   9. Verify `computeDiffSlice` returns a non-empty hunk set
+ *      intersecting the root comment's range against the revision-1 vs.
+ *      revision-2 diff.
+ *  10. Drive the marginalia sidebar render (`groupCommentsIntoThreads`
+ *      + `buildSidebarThread`) with the same data + a fetcher that
+ *      returns the real `computeDiffSlice` output. Assert:
+ *        - The thread renders with a reply-count badge ("2 replies").
+ *        - The addressed badge surfaces the reason + the diff
+ *          expansion fires on click with the hunk lines marked
+ *          `data-kind="add"` / `data-kind="del"`.
+ *        - The attached screenshot path renders as a thumbnail.
+ *
+ * The cross-cutting assertion that ties this test to Task 8.7 is the
+ * markdown-surface inheritance: NONE of the Phase 8 affordances
+ * required a separate markdown render path; everything renders against
+ * the existing sidebar by virtue of the additive schema delta.
+ */
+
+import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
+import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { writeSidecar } from '@deskwork/core/sidecar';
+import {
+  addEntryAnnotation,
+  listEntryAnnotations,
+  mintEntryAnnotation,
+} from '@deskwork/core/entry/annotations';
+import { iterateEntry } from '@deskwork/core/iterate';
+import { getEntryIteration } from '@deskwork/core/iterate/history';
+import { computeDiffSlice } from '@deskwork/core/entry/diff-slice';
+import type { DraftAnnotation } from '@deskwork/core/review/types';
+import type { Entry } from '@deskwork/core/schema/entry';
+import type { DeskworkConfig } from '@deskwork/core/config';
+import { groupCommentsIntoThreads } from '../../../../plugins/deskwork-studio/public/src/entry-review/threads.ts';
+import { buildSidebarThread } from '../../../../plugins/deskwork-studio/public/src/entry-review/thread-render.ts';
+import {
+  type DiffSliceFetcher,
+  type DiffSlicePayload,
+} from '../../../../plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts';
+import type {
+  AddressAnnotation as ClientAddressAnnotation,
+  CommentAnnotation as ClientCommentAnnotation,
+} from '../../../../plugins/deskwork-studio/public/src/entry-review/state.ts';
+
+type CommentDraft = Omit<
+  Extract<DraftAnnotation, { type: 'comment' }>,
+  'id' | 'createdAt'
+>;
+
+type AddressDraft = Omit<
+  Extract<DraftAnnotation, { type: 'address' }>,
+  'id' | 'createdAt'
+>;
+
+const ENTRY_UUID = '22222222-2222-4222-8222-222222222222';
+const ATTACHMENT_PATH =
+  'docs/phase8/scrapbook/screenshots/22222222-2222-4222-8222-222222222222-A.png';
+
+function makeConfig(): DeskworkConfig {
+  return {
+    version: 1,
+    sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/cal.md' } },
+    defaultSite: 'main',
+  };
+}
+
+function entryFixture(): Entry {
+  return {
+    uuid: ENTRY_UUID,
+    slug: 'phase8',
+    title: 'Phase 8 Integration Entry',
+    keywords: [],
+    source: 'manual',
+    currentStage: 'Drafting',
+    iterationByStage: { Ideas: 1, Planned: 1, Outlining: 1 },
+    artifactPath: 'docs/phase8/index.md',
+    createdAt: '2026-05-31T10:00:00.000Z',
+    updatedAt: '2026-05-31T10:00:00.000Z',
+  };
+}
+
+async function appendComment(
+  projectRoot: string,
+  draft: CommentDraft,
+): Promise<string> {
+  const minted = mintEntryAnnotation(draft);
+  await addEntryAnnotation(projectRoot, ENTRY_UUID, minted);
+  return minted.id;
+}
+
+async function appendAddressed(
+  projectRoot: string,
+  draft: AddressDraft,
+): Promise<string> {
+  const minted = mintEntryAnnotation(draft);
+  await addEntryAnnotation(projectRoot, ENTRY_UUID, minted);
+  return minted.id;
+}
+
+/**
+ * Convert a folded `DraftAnnotation` (server-source-of-truth shape) into
+ * the client-side `CommentAnnotation` type the renderer accepts. The
+ * client and server share the same wire-shape; this helper exists
+ * because the test imports the client-side type from `state.ts`
+ * (renderer's input contract) but produces folded annotations from
+ * `listEntryAnnotations` (server-side type). The helper validates the
+ * type-narrowing without an `as` cast: it throws if the input is not a
+ * `comment`.
+ */
+function asClientComment(draft: DraftAnnotation): ClientCommentAnnotation {
+  if (draft.type !== 'comment') throw new Error('expected comment annotation');
+  return {
+    id: draft.id,
+    type: 'comment',
+    workflowId: draft.workflowId,
+    version: draft.version,
+    range: draft.range,
+    text: draft.text,
+    createdAt: draft.createdAt,
+    ...(draft.category !== undefined ? { category: draft.category } : {}),
+    ...(draft.anchor !== undefined ? { anchor: draft.anchor } : {}),
+    ...(draft.replyTo !== undefined ? { replyTo: draft.replyTo } : {}),
+    ...(draft.attachments !== undefined ? { attachments: draft.attachments } : {}),
+    ...(draft.spatialAnchor !== undefined ? { spatialAnchor: draft.spatialAnchor } : {}),
+  };
+}
+
+function asClientAddress(draft: DraftAnnotation): ClientAddressAnnotation {
+  if (draft.type !== 'address') throw new Error('expected address annotation');
+  return {
+    id: draft.id,
+    type: 'address',
+    workflowId: draft.workflowId,
+    commentId: draft.commentId,
+    version: draft.version,
+    disposition: draft.disposition,
+    createdAt: draft.createdAt,
+    ...(draft.reason !== undefined ? { reason: draft.reason } : {}),
+  };
+}
+
+describe('Phase 8 end-to-end integration (Task 8.8)', () => {
+  let projectRoot: string;
+  let cfg: DeskworkConfig;
+  const revision1Markdown =
+    '# Phase 8\n\nfirst paragraph stays unchanged\n\nobviously, the answer is unambiguous\n\ntail paragraph stays unchanged\n';
+  const revision2Markdown =
+    '# Phase 8\n\nfirst paragraph stays unchanged\n\nthe answer is unambiguous\n\ntail paragraph stays unchanged\n';
+
+  beforeEach(async () => {
+    projectRoot = await mkdtemp(join(tmpdir(), 'dw-phase8-int-'));
+    cfg = makeConfig();
+    await mkdir(join(projectRoot, '.deskwork', 'review-journal', 'history'), {
+      recursive: true,
+    });
+    await mkdir(join(projectRoot, 'docs', 'phase8'), { recursive: true });
+    await writeFile(
+      join(projectRoot, '.deskwork', 'config.json'),
+      JSON.stringify(cfg),
+    );
+    // Revision-1 baseline — iterate will read this for revision 1.
+    await writeFile(
+      join(projectRoot, 'docs', 'phase8', 'index.md'),
+      revision1Markdown,
+    );
+    await writeSidecar(projectRoot, entryFixture());
+    document.body.innerHTML = '';
+  });
+
+  afterEach(async () => {
+    await rm(projectRoot, { recursive: true, force: true });
+    document.body.innerHTML = '';
+  });
+
+  it('threads + attachments + iterate + addressed + diff-slice flow on a markdown entry', async () => {
+    // Step (2): iterate to revision 1 — captures the baseline markdown
+    // into the journal so the diff-slice on revision 2 has a prior to
+    // diff against.
+    const r1 = await iterateEntry(projectRoot, { uuid: ENTRY_UUID });
+    expect(r1.version).toBe(1);
+    expect(r1.stage).toBe('Drafting');
+
+    // Step (3): root comment with attachment. The character range
+    // [56, 86] in revision-2 markdown spans the "the answer is
+    // unambiguous" line — overlapping the diff hunk so the slice
+    // intersects.
+    const rootId = await appendComment(projectRoot, {
+      type: 'comment',
+      workflowId: ENTRY_UUID,
+      version: 1,
+      range: { start: 56, end: 86 },
+      text: 'this paragraph still drifts from the voice guide',
+      attachments: [ATTACHMENT_PATH],
+    });
+
+    // Step (4): two replies pointing at the root.
+    const reply1Id = await appendComment(projectRoot, {
+      type: 'comment',
+      workflowId: ENTRY_UUID,
+      version: 1,
+      range: { start: 56, end: 86 },
+      text: 'agreed — paragraph three is the worst offender',
+      replyTo: rootId,
+    });
+    const reply2Id = await appendComment(projectRoot, {
+      type: 'comment',
+      workflowId: ENTRY_UUID,
+      version: 1,
+      range: { start: 56, end: 86 },
+      text: 'lifted the "obviously" — cleaner now',
+      replyTo: rootId,
+    });
+
+    // Step (5): rewrite the markdown (removing "obviously, ") and
+    // iterate to revision 2.
+    await writeFile(
+      join(projectRoot, 'docs', 'phase8', 'index.md'),
+      revision2Markdown,
+    );
+    const r2 = await iterateEntry(projectRoot, { uuid: ENTRY_UUID });
+    expect(r2.version).toBe(2);
+
+    // Step (6): addressed disposition on the root with a non-empty
+    // reason (Step 8.1.2 schema gate requires non-empty `reason` on
+    // `addressed`). Recording against revision 2 — the diff is
+    // revision 1 → revision 2.
+    const addressedReason =
+      'tightened paragraph three — removed the redundant "obviously"';
+    await appendAddressed(projectRoot, {
+      type: 'address',
+      workflowId: ENTRY_UUID,
+      commentId: rootId,
+      version: 2,
+      disposition: 'addressed',
+      reason: addressedReason,
+    });
+
+    // Step (7): verify the journal contains both iteration events
+    // (via `getEntryIteration` lookup), with the right markdown
+    // captured per revision. The annotation events are verified
+    // implicitly by Step (8)'s `listEntryAnnotations` fold below
+    // (it reads the journal stream and folds it back into the
+    // displayable annotation set).
+    const iter1 = await getEntryIteration(projectRoot, ENTRY_UUID, 1);
+    expect(iter1).not.toBeNull();
+    if (!iter1) throw new Error('iter1 expected');
+    expect(iter1.markdown).toBe(revision1Markdown);
+    expect(iter1.stage).toBe('Drafting');
+    const iter2 = await getEntryIteration(projectRoot, ENTRY_UUID, 2);
+    expect(iter2).not.toBeNull();
+    if (!iter2) throw new Error('iter2 expected');
+    expect(iter2.markdown).toBe(revision2Markdown);
+    expect(iter2.stage).toBe('Drafting');
+
+    // Step (8): verify `listEntryAnnotations` folds the events into
+    // the expected `CommentAnnotation` + `AddressAnnotation` shapes.
+    const folded = await listEntryAnnotations(projectRoot, ENTRY_UUID);
+    expect(folded).toHaveLength(4);
+    const foldedComments = folded.filter((a) => a.type === 'comment');
+    expect(foldedComments).toHaveLength(3);
+    const foldedRoot = foldedComments.find((c) => c.id === rootId);
+    if (!foldedRoot || foldedRoot.type !== 'comment') {
+      throw new Error('expected folded root');
+    }
+    expect(foldedRoot.attachments).toEqual([ATTACHMENT_PATH]);
+    expect(foldedRoot.replyTo).toBeUndefined();
+    const foldedReplies = foldedComments.filter((c) => c.id !== rootId);
+    expect(foldedReplies).toHaveLength(2);
+    const replyIds = new Set<string>();
+    for (const r of foldedReplies) {
+      if (r.type !== 'comment') throw new Error('expected comment');
+      expect(r.replyTo).toBe(rootId);
+      replyIds.add(r.id);
+    }
+    expect(replyIds.has(reply1Id)).toBe(true);
+    expect(replyIds.has(reply2Id)).toBe(true);
+    const foldedAddress = folded.find((a) => a.type === 'address');
+    if (!foldedAddress || foldedAddress.type !== 'address') {
+      throw new Error('expected folded address');
+    }
+    expect(foldedAddress.disposition).toBe('addressed');
+    expect(foldedAddress.reason).toBe(addressedReason);
+    expect(foldedAddress.commentId).toBe(rootId);
+    expect(foldedAddress.version).toBe(2);
+
+    // Step (9): verify `computeDiffSlice` returns a non-empty hunk set
+    // intersecting the root comment's range against the revision-1 vs.
+    // revision-2 diff. The diff is the single "obviously, " removal +
+    // its line replacement.
+    const slice = await computeDiffSlice(projectRoot, ENTRY_UUID, rootId, 2);
+    expect(slice).not.toBeNull();
+    if (!slice) throw new Error('diff slice expected');
+    expect(slice.reason).toBe(addressedReason);
+    expect(slice.notes).toBeUndefined();
+    expect(slice.hunks.length).toBeGreaterThan(0);
+    const allLines = slice.hunks.flatMap((h) => h.lines);
+    expect(allLines.some((l) => l.startsWith('-obviously'))).toBe(true);
+    expect(allLines.some((l) => l.startsWith('+the answer'))).toBe(true);
+
+    // Step (10): drive the marginalia sidebar render with the same
+    // data + a fetcher that returns the real diff-slice payload. This
+    // closes the cross-cutting loop: a real journal-on-disk → real
+    // folded annotations → real diff-slice → real DOM render.
+    const clientComments = foldedComments.map(asClientComment);
+    const clientAddress = asClientAddress(foldedAddress);
+
+    const threads = groupCommentsIntoThreads(clientComments);
+    expect(threads).toHaveLength(1);
+    expect(threads[0].root.id).toBe(rootId);
+    expect(threads[0].replies).toHaveLength(2);
+    expect(threads[0].isOrphan).toBe(false);
+
+    // The fetcher closes over the real `computeDiffSlice` result so
+    // the click-to-expand path uses the same payload the server route
+    // would have served. The shape alignment between `DiffSliceResult`
+    // (server) and `DiffSlicePayload` (client) is the cross-cutting
+    // invariant.
+    const diffPayload: DiffSlicePayload = {
+      reason: slice.reason,
+      hunks: slice.hunks.map((h) => ({
+        oldStart: h.oldStart,
+        oldLines: h.oldLines,
+        newStart: h.newStart,
+        newLines: h.newLines,
+        lines: [...h.lines],
+      })),
+    };
+    const fetchDiffSlice: DiffSliceFetcher = vi.fn(() => Promise.resolve(diffPayload));
+
+    const addressByCommentId = new Map<string, ClientAddressAnnotation>([
+      [rootId, clientAddress],
+    ]);
+
+    const draftBody = document.createElement('div');
+    draftBody.textContent = revision2Markdown;
+    document.body.appendChild(draftBody);
+    const li = buildSidebarThread(threads[0], 'current', {
+      draftBody,
+      addressByCommentId,
+      onResolve: vi.fn(),
+      onEdit: vi.fn(),
+      onDelete: vi.fn(),
+      onHoverEnter: vi.fn(),
+      onHoverLeave: vi.fn(),
+      onScrollTo: vi.fn(),
+      fetchDiffSlice,
+    });
+    document.body.appendChild(li);
+
+    // ---- Threads + reply-count badge (Task 8.2) ----
+    const badge = li.querySelector<HTMLButtonElement>(
+      '.er-marginalia-thread-toggle',
+    );
+    expect(badge).not.toBeNull();
+    expect(badge?.textContent).toBe('2 replies');
+    expect(badge?.getAttribute('aria-pressed')).toBe('false');
+    expect(li.dataset.hasReplies).toBe('true');
+    expect(li.dataset.replyCount).toBe('2');
+
+    // ---- Addressed badge with reason (Step 8.5.3) ----
+    const stamp = li.querySelector<HTMLElement>('.er-marginalia-stamp');
+    expect(stamp).not.toBeNull();
+    expect(stamp?.dataset.disposition).toBe('addressed');
+    const reasonNode = stamp?.querySelector<HTMLElement>(
+      '.er-marginalia-stamp-reason',
+    );
+    expect(reasonNode).not.toBeNull();
+    expect(reasonNode?.textContent).toBe(addressedReason);
+    expect(reasonNode?.dataset.legacyMissingReason).toBeUndefined();
+
+    // ---- Inline diff expansion (Task 8.6) ----
+    expect(stamp?.getAttribute('role')).toBe('button');
+    stamp?.click();
+    await new Promise((r) => setTimeout(r, 0));
+    expect(fetchDiffSlice).toHaveBeenCalledTimes(1);
+    expect(fetchDiffSlice).toHaveBeenCalledWith(rootId, 2);
+
+    const expansion = li.querySelector<HTMLElement>(
+      '.er-marginalia-diff-expansion',
+    );
+    expect(expansion).not.toBeNull();
+    expect(stamp?.getAttribute('aria-pressed')).toBe('true');
+    const expansionReason = expansion?.querySelector('.er-marginalia-diff-reason');
+    expect(expansionReason?.textContent).toBe(addressedReason);
+    const diffLines = expansion?.querySelectorAll<HTMLElement>(
+      '.er-marginalia-diff-line',
+    );
+    expect(diffLines?.length ?? 0).toBeGreaterThan(0);
+    const kinds = Array.from(diffLines ?? []).map((el) => el.dataset.kind);
+    expect(kinds).toContain('del');
+    expect(kinds).toContain('add');
+
+    // ---- Attached screenshot (Task 8.4 render) ----
+    const strip = li.querySelector<HTMLElement>('.er-marginalia-attachments');
+    expect(strip).not.toBeNull();
+    const thumb = strip?.querySelector<HTMLImageElement>(
+      '.er-marginalia-attachment-thumb',
+    );
+    expect(thumb).not.toBeNull();
+    expect(thumb?.getAttribute('src')).toBe(ATTACHMENT_PATH);
+    expect(thumb?.getAttribute('loading')).toBe('lazy');
+  });
+});
diff --git a/packages/studio/test/entry-review/screenshot-attach.test.ts b/packages/studio/test/entry-review/screenshot-attach.test.ts
new file mode 100644
index 00000000..9c2f5d74
--- /dev/null
+++ b/packages/studio/test/entry-review/screenshot-attach.test.ts
@@ -0,0 +1,221 @@
+/**
+ * @vitest-environment jsdom
+ *
+ * Phase 8 Step 8.4.1 — client-side attach-to-comment workflow tests.
+ *
+ * Two flows under test:
+ *   - `attachScreenshotToComment` — PATCHes an existing comment's
+ *     attachments[] with the full intended list (prior + new path).
+ *   - `createCommentWithAttachment` — POSTs a new comment annotation
+ *     pre-attached to the screenshot.
+ *
+ * `fetch` is mocked globally; assertions cover URL shape, method,
+ * payload composition, and error surfacing.
+ */
+
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import {
+  attachScreenshotToComment,
+  createCommentWithAttachment,
+} from '../../../../plugins/deskwork-studio/public/src/entry-review/screenshot-attach.ts';
+
+const ENTRY_UUID = '11111111-1111-4111-8111-111111111111';
+const COMMENT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
+const SCREENSHOT_PATH =
+  'docs/foo/scrapbook/screenshots/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-2026-05-31T15-32-04-500Z.png';
+
+function mockResponse(status: number, body: unknown): Response {
+  return new Response(JSON.stringify(body), {
+    status,
+    headers: { 'Content-Type': 'application/json' },
+  });
+}
+
+function getCallInit(fetchSpy: ReturnType<typeof vi.spyOn>): RequestInit {
+  const calls = fetchSpy.mock.calls;
+  if (calls.length === 0) throw new Error('fetch never called');
+  const init = calls[0][1];
+  if (!init) throw new Error('fetch called without init arg');
+  return init as RequestInit;
+}
+
+function bodyAsJson(init: RequestInit): Record<string, unknown> {
+  const body = init.body;
+  if (typeof body !== 'string') throw new Error('expected JSON-string body');
+  const parsed: unknown = JSON.parse(body);
+  if (typeof parsed !== 'object' || parsed === null) {
+    throw new Error('expected JSON object body');
+  }
+  return parsed as Record<string, unknown>;
+}
+
+describe('attachScreenshotToComment', () => {
+  beforeEach(() => {
+    vi.restoreAllMocks();
+  });
+
+  it('PATCHes the comment endpoint with the prior attachments + new path concatenated', async () => {
+    const fetchSpy = vi
+      .spyOn(globalThis, 'fetch')
+      .mockResolvedValue(
+        mockResponse(200, { annotation: { id: 'edit-id', type: 'edit-comment' } }),
+      );
+    const result = await attachScreenshotToComment(
+      ENTRY_UUID,
+      COMMENT_UUID,
+      ['scrapbook/screenshots/existing.png'],
+      SCREENSHOT_PATH,
+    );
+    expect(result).toBe(true);
+    expect(fetchSpy).toHaveBeenCalledTimes(1);
+    const firstCall = fetchSpy.mock.calls[0];
+    expect(firstCall[0]).toBe(
+      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${COMMENT_UUID}`,
+    );
+    const init = getCallInit(fetchSpy);
+    expect(init.method).toBe('PATCH');
+    const body = bodyAsJson(init);
+    expect(body.attachments).toEqual([
+      'scrapbook/screenshots/existing.png',
+      SCREENSHOT_PATH,
+    ]);
+  });
+
+  it('sends just the new path when the comment has no prior attachments', async () => {
+    const fetchSpy = vi
+      .spyOn(globalThis, 'fetch')
+      .mockResolvedValue(
+        mockResponse(200, { annotation: { id: 'x', type: 'edit-comment' } }),
+      );
+    await attachScreenshotToComment(ENTRY_UUID, COMMENT_UUID, [], SCREENSHOT_PATH);
+    const init = getCallInit(fetchSpy);
+    const body = bodyAsJson(init);
+    expect(body.attachments).toEqual([SCREENSHOT_PATH]);
+  });
+
+  it('throws with the server-supplied error reason on non-2xx', async () => {
+    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
+      mockResponse(404, { error: 'unknown commentId' }),
+    );
+    await expect(
+      attachScreenshotToComment(ENTRY_UUID, COMMENT_UUID, [], SCREENSHOT_PATH),
+    ).rejects.toThrow(/404.*unknown commentId/);
+  });
+
+  it('throws on a non-JSON error response (status only)', async () => {
+    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
+      new Response('not json', { status: 500 }),
+    );
+    await expect(
+      attachScreenshotToComment(ENTRY_UUID, COMMENT_UUID, [], SCREENSHOT_PATH),
+    ).rejects.toThrow(/500/);
+  });
+});
+
+describe('createCommentWithAttachment', () => {
+  beforeEach(() => {
+    vi.restoreAllMocks();
+  });
+
+  it('POSTs a new comment annotation with the screenshot pre-attached', async () => {
+    const fetchSpy = vi
+      .spyOn(globalThis, 'fetch')
+      .mockResolvedValue(
+        mockResponse(200, {
+          annotation: { id: 'new-ann-id', type: 'comment' },
+        }),
+      );
+    const { annotationId } = await createCommentWithAttachment(
+      ENTRY_UUID,
+      {
+        text: 'see screenshot — alignment is off on the right',
+        version: 3,
+        range: { start: 0, end: 10 },
+        category: 'structural',
+      },
+      SCREENSHOT_PATH,
+    );
+    expect(annotationId).toBe('new-ann-id');
+    expect(fetchSpy).toHaveBeenCalledTimes(1);
+    const firstCall = fetchSpy.mock.calls[0];
+    expect(firstCall[0]).toBe(
+      `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`,
+    );
+    const init = getCallInit(fetchSpy);
+    expect(init.method).toBe('POST');
+    const body = bodyAsJson(init);
+    expect(body.type).toBe('comment');
+    expect(body.workflowId).toBe(ENTRY_UUID);
+    expect(body.version).toBe(3);
+    expect(body.text).toBe('see screenshot — alignment is off on the right');
+    expect(body.range).toEqual({ start: 0, end: 10 });
+    expect(body.category).toBe('structural');
+    expect(body.attachments).toEqual([SCREENSHOT_PATH]);
+  });
+
+  it('omits optional fields (category / anchor / replyTo) when not provided', async () => {
+    const fetchSpy = vi
+      .spyOn(globalThis, 'fetch')
+      .mockResolvedValue(
+        mockResponse(200, { annotation: { id: 'ann-id', type: 'comment' } }),
+      );
+    await createCommentWithAttachment(
+      ENTRY_UUID,
+      { text: 'plain', version: 1, range: { start: 0, end: 1 } },
+      SCREENSHOT_PATH,
+    );
+    const init = getCallInit(fetchSpy);
+    const body = bodyAsJson(init);
+    expect(body.category).toBeUndefined();
+    expect(body.anchor).toBeUndefined();
+    expect(body.replyTo).toBeUndefined();
+    expect(body.attachments).toEqual([SCREENSHOT_PATH]);
+  });
+
+  it('threads the replyTo field when supplied (new threaded reply with attachment)', async () => {
+    const fetchSpy = vi
+      .spyOn(globalThis, 'fetch')
+      .mockResolvedValue(
+        mockResponse(200, { annotation: { id: 'ann-id', type: 'comment' } }),
+      );
+    await createCommentWithAttachment(
+      ENTRY_UUID,
+      {
+        text: 'reply with screenshot',
+        version: 1,
+        range: { start: 0, end: 1 },
+        replyTo: COMMENT_UUID,
+      },
+      SCREENSHOT_PATH,
+    );
+    const init = getCallInit(fetchSpy);
+    const body = bodyAsJson(init);
+    expect(body.replyTo).toBe(COMMENT_UUID);
+  });
+
+  it('throws when the success response is missing annotation.id', async () => {
+    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
+      mockResponse(200, { annotation: { type: 'comment' } }),
+    );
+    await expect(
+      createCommentWithAttachment(
+        ENTRY_UUID,
+        { text: 'x', version: 1, range: { start: 0, end: 1 } },
+        SCREENSHOT_PATH,
+      ),
+    ).rejects.toThrow(/missing annotation\.id/);
+  });
+
+  it('throws with the server-supplied error reason on non-2xx', async () => {
+    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
+      mockResponse(404, { error: 'unknown entry' }),
+    );
+    await expect(
+      createCommentWithAttachment(
+        ENTRY_UUID,
+        { text: 'x', version: 1, range: { start: 0, end: 1 } },
+        SCREENSHOT_PATH,
+      ),
+    ).rejects.toThrow(/404.*unknown entry/);
+  });
+});
diff --git a/packages/studio/test/entry-review/screenshot-paste-drop.test.ts b/packages/studio/test/entry-review/screenshot-paste-drop.test.ts
new file mode 100644
index 00000000..867d5005
--- /dev/null
+++ b/packages/studio/test/entry-review/screenshot-paste-drop.test.ts
@@ -0,0 +1,335 @@
+/**
+ * @vitest-environment jsdom
+ *
+ * Phase 8 Step 8.4.3 — paste / drag-drop handler tests.
+ *
+ * Verifies the two surface affordances:
+ *   - bindPasteHandler — intercepts ClipboardEvent with image bytes,
+ *     persists to the orphan endpoint, fires onScreenshotAttached.
+ *     Plain-text pastes pass through (no preventDefault, no callback).
+ *   - bindDragDropHandler — intercepts DragEvent with image File,
+ *     persists, fires onScreenshotAttached. Non-image drags pass
+ *     through.
+ *
+ * `fetch` is mocked globally so the orphan-screenshot POST is
+ * observable; the helper modules are exercised end-to-end (extract +
+ * persist + callback wire-up).
+ */
+
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import {
+  bindPasteHandler,
+  bindDragDropHandler,
+  extractImageFromClipboard,
+  extractImageFromDrop,
+} from '../../../../plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts';
+
+function mockResponse(status: number, body: unknown): Response {
+  return new Response(JSON.stringify(body), {
+    status,
+    headers: { 'Content-Type': 'application/json' },
+  });
+}
+
+function mockOrphanSuccess(): ReturnType<typeof vi.spyOn> {
+  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
+    mockResponse(200, {
+      writtenPath:
+        '/proj/.deskwork/screenshots-orphan/2026-06-01T00-00-00-000Z-deadbeef.png',
+      relativeWrittenPath:
+        '.deskwork/screenshots-orphan/2026-06-01T00-00-00-000Z-deadbeef.png',
+    }),
+  );
+}
+
+function pngBlob(): Blob {
+  return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
+    type: 'image/png',
+  });
+}
+
+/**
+ * jsdom does NOT expose `ClipboardEvent` as a global, so we build a
+ * synthetic Event of type 'paste' with a fake `clipboardData`
+ * accessor. The handler narrows on the field shape, not on
+ * `instanceof ClipboardEvent`, so this is sufficient.
+ */
+function makeClipboardEvent(file: File | null): Event {
+  const ev = new Event('paste', { bubbles: true, cancelable: true });
+  const items: DataTransferItem[] = [];
+  const files: File[] = [];
+  if (file !== null) {
+    files.push(file);
+    items.push({
+      kind: 'file',
+      type: file.type,
+      getAsFile: () => file,
+      getAsString: () => undefined,
+      webkitGetAsEntry: () => null,
+    } as unknown as DataTransferItem);
+  }
+  const data = {
+    items: { length: items.length, ...items } as unknown as DataTransferItemList,
+    files: { length: files.length, ...files } as unknown as FileList,
+    types: file !== null ? ['Files'] : [],
+    getData: () => '',
+    setData: () => undefined,
+    clearData: () => undefined,
+    dropEffect: 'copy' as const,
+    effectAllowed: 'all' as const,
+  } as unknown as DataTransfer;
+  Object.defineProperty(ev, 'clipboardData', { value: data });
+  return ev;
+}
+
+/**
+ * jsdom does NOT expose `DragEvent` as a global, so we build a
+ * synthetic event of type 'drop' with a fake `dataTransfer` accessor
+ * — the handler narrows on the shape (`dataTransfer.files`), not on
+ * `instanceof DragEvent`, so this is sufficient.
+ */
+function makeDragEvent(file: File | null, type: string = 'drop'): Event {
+  const ev = new Event(type, { bubbles: true, cancelable: true });
+  const files: File[] = file !== null ? [file] : [];
+  const data = {
+    files: { length: files.length, ...files } as unknown as FileList,
+    items: { length: 0 } as unknown as DataTransferItemList,
+    types: file !== null ? ['Files'] : [],
+    getData: () => '',
+    setData: () => undefined,
+    clearData: () => undefined,
+    dropEffect: 'copy' as const,
+    effectAllowed: 'all' as const,
+  } as unknown as DataTransfer;
+  Object.defineProperty(ev, 'dataTransfer', { value: data });
+  return ev;
+}
+
+describe('extractImageFromClipboard', () => {
+  it('returns the file when clipboardData has an image item', () => {
+    const file = new File([pngBlob()], 'unused.png', { type: 'image/png' });
+    const ev = makeClipboardEvent(file);
+    expect(extractImageFromClipboard(ev)).not.toBeNull();
+  });
+
+  it('returns null when clipboardData carries no image (plain text paste)', () => {
+    const ev = makeClipboardEvent(null);
+    expect(extractImageFromClipboard(ev)).toBeNull();
+  });
+
+  it('returns null when the event has no clipboardData shape', () => {
+    // Plain Event (no `clipboardData` accessor) — handler's
+    // type-guard narrows it out before touching the field.
+    const ev = new Event('paste');
+    expect(extractImageFromClipboard(ev)).toBeNull();
+  });
+});
+
+describe('extractImageFromDrop', () => {
+  it('returns the file when dataTransfer carries an image', () => {
+    const file = new File([pngBlob()], 'pic.png', { type: 'image/png' });
+    const ev = makeDragEvent(file);
+    expect(extractImageFromDrop(ev)).not.toBeNull();
+  });
+
+  it('returns null when no image was dropped', () => {
+    const ev = makeDragEvent(null);
+    expect(extractImageFromDrop(ev)).toBeNull();
+  });
+
+  it('returns null when the drop carried a non-image file', () => {
+    const file = new File(['text'], 'doc.txt', { type: 'text/plain' });
+    const ev = makeDragEvent(file);
+    expect(extractImageFromDrop(ev)).toBeNull();
+  });
+});
+
+describe('bindPasteHandler', () => {
+  beforeEach(() => {
+    vi.restoreAllMocks();
+  });
+
+  it('persists the pasted image and fires onScreenshotAttached', async () => {
+    const fetchSpy = mockOrphanSuccess();
+    const target = document.createElement('textarea');
+    document.body.appendChild(target);
+    const onScreenshotAttached = vi.fn();
+    const onError = vi.fn();
+    bindPasteHandler(target, {
+      onScreenshotAttached,
+      onError,
+      now: () => new Date('2026-06-01T00:00:00.000Z'),
+    });
+    const file = new File([pngBlob()], 'paste.png', { type: 'image/png' });
+    const ev = makeClipboardEvent(file);
+    target.dispatchEvent(ev);
+    // Let the async persist promise resolve.
+    // Allow microtasks to flush — the paste handler chains
+    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
+    // single tick isn't enough; 5 ticks lets all the awaits resolve
+    // before the assertion runs.
+    for (let i = 0; i < 5; i += 1) {
+      await new Promise((r) => setTimeout(r, 0));
+    }
+    expect(fetchSpy).toHaveBeenCalledTimes(1);
+    expect(onScreenshotAttached).toHaveBeenCalledTimes(1);
+    const call = onScreenshotAttached.mock.calls[0][0];
+    expect(call.relativeWrittenPath).toMatch(/screenshots-orphan/);
+    expect(call.filename).toMatch(/\.png$/);
+    expect(onError).not.toHaveBeenCalled();
+  });
+
+  it('does not call onScreenshotAttached for a plain-text paste', async () => {
+    const fetchSpy = mockOrphanSuccess();
+    const target = document.createElement('textarea');
+    document.body.appendChild(target);
+    const onScreenshotAttached = vi.fn();
+    bindPasteHandler(target, { onScreenshotAttached });
+    const ev = makeClipboardEvent(null); // no file
+    target.dispatchEvent(ev);
+    // Allow microtasks to flush — the paste handler chains
+    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
+    // single tick isn't enough; 5 ticks lets all the awaits resolve
+    // before the assertion runs.
+    for (let i = 0; i < 5; i += 1) {
+      await new Promise((r) => setTimeout(r, 0));
+    }
+    expect(fetchSpy).not.toHaveBeenCalled();
+    expect(onScreenshotAttached).not.toHaveBeenCalled();
+  });
+
+  it('preventDefaults the event when an image is intercepted', async () => {
+    mockOrphanSuccess();
+    const target = document.createElement('textarea');
+    document.body.appendChild(target);
+    bindPasteHandler(target, { onScreenshotAttached: vi.fn() });
+    const file = new File([pngBlob()], 'p.png', { type: 'image/png' });
+    const ev = makeClipboardEvent(file);
+    const pdSpy = vi.spyOn(ev, 'preventDefault');
+    target.dispatchEvent(ev);
+    expect(pdSpy).toHaveBeenCalled();
+  });
+
+  it('calls onError on a persist failure', async () => {
+    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
+      mockResponse(500, { error: 'disk full' }),
+    );
+    const target = document.createElement('textarea');
+    document.body.appendChild(target);
+    const onError = vi.fn();
+    bindPasteHandler(target, {
+      onScreenshotAttached: vi.fn(),
+      onError,
+    });
+    const file = new File([pngBlob()], 'p.png', { type: 'image/png' });
+    target.dispatchEvent(makeClipboardEvent(file));
+    // Allow microtasks to flush — the paste handler chains
+    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
+    // single tick isn't enough; 5 ticks lets all the awaits resolve
+    // before the assertion runs.
+    for (let i = 0; i < 5; i += 1) {
+      await new Promise((r) => setTimeout(r, 0));
+    }
+    expect(onError).toHaveBeenCalledTimes(1);
+    expect(onError.mock.calls[0][0].message).toMatch(/disk full|500/);
+  });
+
+  it('returns an unsubscribe function that removes the listener', async () => {
+    const fetchSpy = mockOrphanSuccess();
+    const target = document.createElement('textarea');
+    document.body.appendChild(target);
+    const onScreenshotAttached = vi.fn();
+    const unsubscribe = bindPasteHandler(target, { onScreenshotAttached });
+    unsubscribe();
+    const file = new File([pngBlob()], 'p.png', { type: 'image/png' });
+    target.dispatchEvent(makeClipboardEvent(file));
+    // Allow microtasks to flush — the paste handler chains
+    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
+    // single tick isn't enough; 5 ticks lets all the awaits resolve
+    // before the assertion runs.
+    for (let i = 0; i < 5; i += 1) {
+      await new Promise((r) => setTimeout(r, 0));
+    }
+    expect(fetchSpy).not.toHaveBeenCalled();
+    expect(onScreenshotAttached).not.toHaveBeenCalled();
+  });
+});
+
+describe('bindDragDropHandler', () => {
+  beforeEach(() => {
+    vi.restoreAllMocks();
+  });
+
+  it('persists the dropped image and fires onScreenshotAttached', async () => {
+    const fetchSpy = mockOrphanSuccess();
+    const target = document.createElement('div');
+    document.body.appendChild(target);
+    const onScreenshotAttached = vi.fn();
+    bindDragDropHandler(target, { onScreenshotAttached });
+    const file = new File([pngBlob()], 'drop.png', { type: 'image/png' });
+    target.dispatchEvent(makeDragEvent(file));
+    // Allow microtasks to flush — the paste handler chains
+    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
+    // single tick isn't enough; 5 ticks lets all the awaits resolve
+    // before the assertion runs.
+    for (let i = 0; i < 5; i += 1) {
+      await new Promise((r) => setTimeout(r, 0));
+    }
+    expect(fetchSpy).toHaveBeenCalledTimes(1);
+    expect(onScreenshotAttached).toHaveBeenCalledTimes(1);
+  });
+
+  it('preventDefault on dragover so the drop is enabled', () => {
+    const target = document.createElement('div');
+    document.body.appendChild(target);
+    bindDragDropHandler(target, { onScreenshotAttached: vi.fn() });
+    const ev = new Event('dragover', { bubbles: true, cancelable: true });
+    const pdSpy = vi.spyOn(ev, 'preventDefault');
+    target.dispatchEvent(ev);
+    expect(pdSpy).toHaveBeenCalled();
+  });
+
+  it('does not fire the callback for a non-image drop', async () => {
+    const fetchSpy = mockOrphanSuccess();
+    const target = document.createElement('div');
+    document.body.appendChild(target);
+    const onScreenshotAttached = vi.fn();
+    bindDragDropHandler(target, { onScreenshotAttached });
+    const file = new File(['hi'], 'doc.txt', { type: 'text/plain' });
+    target.dispatchEvent(makeDragEvent(file));
+    // Allow microtasks to flush — the paste handler chains
+    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
+    // single tick isn't enough; 5 ticks lets all the awaits resolve
+    // before the assertion runs.
+    for (let i = 0; i < 5; i += 1) {
+      await new Promise((r) => setTimeout(r, 0));
+    }
+    expect(fetchSpy).not.toHaveBeenCalled();
+    expect(onScreenshotAttached).not.toHaveBeenCalled();
+  });
+
+  it('returns an unsubscribe function that removes both listeners', async () => {
+    const fetchSpy = mockOrphanSuccess();
+    const target = document.createElement('div');
+    document.body.appendChild(target);
+    const unsubscribe = bindDragDropHandler(target, {
+      onScreenshotAttached: vi.fn(),
+    });
+    unsubscribe();
+    const file = new File([pngBlob()], 'd.png', { type: 'image/png' });
+    target.dispatchEvent(makeDragEvent(file));
+    // Allow microtasks to flush — the paste handler chains
+    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
+    // single tick isn't enough; 5 ticks lets all the awaits resolve
+    // before the assertion runs.
+    for (let i = 0; i < 5; i += 1) {
+      await new Promise((r) => setTimeout(r, 0));
+    }
+    expect(fetchSpy).not.toHaveBeenCalled();
+    // After unsubscribe, dragover preventDefault no longer fires.
+    const ev = new Event('dragover', { bubbles: true, cancelable: true });
+    const pdSpy = vi.spyOn(ev, 'preventDefault');
+    target.dispatchEvent(ev);
+    expect(pdSpy).not.toHaveBeenCalled();
+  });
+});
diff --git a/packages/studio/test/screenshot-attach-route.test.ts b/packages/studio/test/screenshot-attach-route.test.ts
new file mode 100644
index 00000000..9459ebac
--- /dev/null
+++ b/packages/studio/test/screenshot-attach-route.test.ts
@@ -0,0 +1,231 @@
+/**
+ * Phase 8 Step 8.4.1 — integration test for the attach-to-comment
+ * server route (`POST /api/dev/editorial-review/entry/:entryId/
+ * comment/:commentId/attach`).
+ *
+ * Drives the route against a real tmp project tree:
+ *   - 200 success: an `edit-comment` annotation is appended with the
+ *     full intended attachments[] list, and the folded read shows the
+ *     comment's updated attachments.
+ *   - Empty-prior case: a comment with no prior attachments yields a
+ *     single-element attachments[] after attach.
+ *   - Append-on-existing case: prior attachments are preserved + the
+ *     new path appended.
+ *   - 400 on malformed entryId / commentId / missing or empty
+ *     relativePath / non-JSON body.
+ *   - 404 on unknown entry sidecar.
+ *   - 404 on unknown commentId.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { writeSidecar } from '@deskwork/core/sidecar';
+import {
+  addEntryAnnotation,
+  listEntryAnnotations,
+  mintEntryAnnotation,
+} from '@deskwork/core/entry/annotations';
+import type { DraftAnnotation } from '@deskwork/core/review/types';
+import type { Entry } from '@deskwork/core/schema/entry';
+import type { DeskworkConfig } from '@deskwork/core/config';
+import { createApp } from '../src/server.ts';
+
+const ENTRY_UUID = '11111111-1111-4111-8111-111111111111';
+const UNKNOWN_ENTRY = '99999999-9999-4999-8999-999999999999';
+const SCREENSHOT_PATH =
+  'docs/foo/scrapbook/screenshots/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-A.png';
+
+function makeConfig(): DeskworkConfig {
+  return {
+    version: 1,
+    sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/cal.md' } },
+    defaultSite: 'main',
+  };
+}
+
+function entryFixture(): Entry {
+  return {
+    uuid: ENTRY_UUID,
+    slug: 'foo',
+    title: 'foo',
+    keywords: [],
+    source: 'manual',
+    currentStage: 'Drafting',
+    iterationByStage: { Ideas: 1, Planned: 1, Outlining: 1 },
+    artifactPath: 'docs/foo/index.md',
+    createdAt: '2026-04-30T10:00:00.000Z',
+    updatedAt: '2026-04-30T10:00:00.000Z',
+  };
+}
+
+async function seedComment(
+  projectRoot: string,
+  text: string,
+  attachments?: string[],
+): Promise<string> {
+  const draft: Parameters<typeof mintEntryAnnotation>[0] = {
+    type: 'comment',
+    workflowId: ENTRY_UUID,
+    version: 1,
+    range: { start: 0, end: 4 },
+    text,
+    ...(attachments !== undefined ? { attachments } : {}),
+  };
+  const minted = mintEntryAnnotation(draft);
+  await addEntryAnnotation(projectRoot, ENTRY_UUID, minted as DraftAnnotation);
+  return minted.id;
+}
+
+async function postAttach(
+  app: ReturnType<typeof createApp>,
+  entryId: string,
+  commentId: string,
+  body: unknown,
+): Promise<{ status: number; body: unknown }> {
+  const res = await app.fetch(
+    new Request(
+      `http://x/api/dev/editorial-review/entry/${entryId}/comment/${commentId}/attach`,
+      {
+        method: 'POST',
+        headers: { 'content-type': 'application/json' },
+        body: typeof body === 'string' ? body : JSON.stringify(body),
+      },
+    ),
+  );
+  return { status: res.status, body: await res.json() };
+}
+
+function asObj(v: unknown): Record<string, unknown> {
+  if (!v || typeof v !== 'object') throw new Error('expected object response');
+  return v as Record<string, unknown>;
+}
+
+describe('POST /api/dev/editorial-review/entry/:entryId/comment/:commentId/attach', () => {
+  let projectRoot: string;
+  let cfg: DeskworkConfig;
+
+  beforeEach(async () => {
+    projectRoot = await mkdtemp(join(tmpdir(), 'dw-attach-route-'));
+    cfg = makeConfig();
+    await mkdir(join(projectRoot, '.deskwork', 'review-journal', 'history'), {
+      recursive: true,
+    });
+    await mkdir(join(projectRoot, 'docs', 'foo'), { recursive: true });
+    await writeFile(
+      join(projectRoot, '.deskwork', 'config.json'),
+      JSON.stringify(cfg),
+    );
+    await writeFile(join(projectRoot, 'docs', 'foo', 'index.md'), '# foo\n');
+    await writeSidecar(projectRoot, entryFixture());
+  });
+
+  afterEach(async () => {
+    await rm(projectRoot, { recursive: true, force: true });
+  });
+
+  it('attaches a screenshot path to a comment without prior attachments', async () => {
+    const commentId = await seedComment(projectRoot, 'note');
+    const app = createApp({ projectRoot, config: cfg });
+    const { status, body } = await postAttach(app, ENTRY_UUID, commentId, {
+      relativePath: SCREENSHOT_PATH,
+    });
+    expect(status).toBe(200);
+    const obj = asObj(body);
+    expect(obj.attachments).toEqual([SCREENSHOT_PATH]);
+    const ann = asObj(obj.annotation);
+    expect(ann.type).toBe('edit-comment');
+    expect(ann.commentId).toBe(commentId);
+    // Folded view reflects the new attachment list on the comment.
+    const folded = await listEntryAnnotations(projectRoot, ENTRY_UUID);
+    expect(folded).toHaveLength(1);
+    const c = folded[0];
+    if (c.type !== 'comment') throw new Error('expected comment');
+    expect(c.attachments).toEqual([SCREENSHOT_PATH]);
+  });
+
+  it('appends to existing attachments instead of replacing', async () => {
+    const commentId = await seedComment(projectRoot, 'note', [
+      'docs/foo/scrapbook/screenshots/existing.png',
+    ]);
+    const app = createApp({ projectRoot, config: cfg });
+    const { status, body } = await postAttach(app, ENTRY_UUID, commentId, {
+      relativePath: SCREENSHOT_PATH,
+    });
+    expect(status).toBe(200);
+    const obj = asObj(body);
+    expect(obj.attachments).toEqual([
+      'docs/foo/scrapbook/screenshots/existing.png',
+      SCREENSHOT_PATH,
+    ]);
+    const folded = await listEntryAnnotations(projectRoot, ENTRY_UUID);
+    const c = folded[0];
+    if (c.type !== 'comment') throw new Error('expected comment');
+    expect(c.attachments).toEqual([
+      'docs/foo/scrapbook/screenshots/existing.png',
+      SCREENSHOT_PATH,
+    ]);
+  });
+
+  it('returns 400 on malformed entryId', async () => {
+    const commentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
+    const app = createApp({ projectRoot, config: cfg });
+    const { status } = await postAttach(app, 'not-a-uuid', commentId, {
+      relativePath: SCREENSHOT_PATH,
+    });
+    expect(status).toBe(400);
+  });
+
+  it('returns 400 on malformed commentId', async () => {
+    const app = createApp({ projectRoot, config: cfg });
+    const { status } = await postAttach(app, ENTRY_UUID, 'not-a-uuid', {
+      relativePath: SCREENSHOT_PATH,
+    });
+    expect(status).toBe(400);
+  });
+
+  it('returns 400 on missing relativePath', async () => {
+    const commentId = await seedComment(projectRoot, 'note');
+    const app = createApp({ projectRoot, config: cfg });
+    const { status, body } = await postAttach(app, ENTRY_UUID, commentId, {});
+    expect(status).toBe(400);
+    expect(asObj(body).error).toMatch(/relativePath/);
+  });
+
+  it('returns 400 on empty relativePath', async () => {
+    const commentId = await seedComment(projectRoot, 'note');
+    const app = createApp({ projectRoot, config: cfg });
+    const { status } = await postAttach(app, ENTRY_UUID, commentId, {
+      relativePath: '',
+    });
+    expect(status).toBe(400);
+  });
+
+  it('returns 400 on a non-JSON body', async () => {
+    const commentId = await seedComment(projectRoot, 'note');
+    const app = createApp({ projectRoot, config: cfg });
+    const { status } = await postAttach(app, ENTRY_UUID, commentId, 'not json');
+    expect(status).toBe(400);
+  });
+
+  it('returns 404 on unknown entry sidecar', async () => {
+    const commentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
+    const app = createApp({ projectRoot, config: cfg });
+    const { status, body } = await postAttach(app, UNKNOWN_ENTRY, commentId, {
+      relativePath: SCREENSHOT_PATH,
+    });
+    expect(status).toBe(404);
+    expect(asObj(body).error).toMatch(/unknown entry/);
+  });
+
+  it('returns 404 when commentId is not in the entry stream', async () => {
+    const app = createApp({ projectRoot, config: cfg });
+    const missingComment = 'cccccccc-cccc-4ccc-8ccc-ccccccccccccc'.slice(0, 36);
+    const { status, body } = await postAttach(app, ENTRY_UUID, missingComment, {
+      relativePath: SCREENSHOT_PATH,
+    });
+    expect(status).toBe(404);
+    expect(asObj(body).error).toMatch(/unknown commentId/);
+  });
+});
diff --git a/packages/studio/test/screenshot-promote-route.test.ts b/packages/studio/test/screenshot-promote-route.test.ts
new file mode 100644
index 00000000..4700d688
--- /dev/null
+++ b/packages/studio/test/screenshot-promote-route.test.ts
@@ -0,0 +1,297 @@
+/**
+ * Phase 8 Step 8.4.1 + 8.4.2 — integration test for the orphan-promote
+ * server route (`POST /api/dev/editorial-review/screenshots/orphan/
+ * :filename/promote-to-entry/:entryId/comment/:commentId`).
+ *
+ * Drives the route against a real tmp project tree:
+ *   - 200 success: orphan file moved to entry-anchored path; comment's
+ *     attachments[] updated with the new relative path; folded read
+ *     reflects the attachment.
+ *   - Cross-entry case (Task 8.4.2): `sourceEntry` body field triggers
+ *     a `<filename>.meta.json` sidecar next to the moved file.
+ *   - Same-entry case: no sidecar written when sourceEntry == entryId.
+ *   - 400 on malformed entryId / commentId / filename / sourceEntry.
+ *   - 404 on missing orphan / unknown entry sidecar / unknown
+ *     commentId.
+ *   - 409 on collision at the destination path.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { writeSidecar } from '@deskwork/core/sidecar';
+import {
+  addEntryAnnotation,
+  listEntryAnnotations,
+  mintEntryAnnotation,
+} from '@deskwork/core/entry/annotations';
+import type { DraftAnnotation } from '@deskwork/core/review/types';
+import type { Entry } from '@deskwork/core/schema/entry';
+import type { DeskworkConfig } from '@deskwork/core/config';
+import { createApp } from '../src/server.ts';
+
+const ENTRY_UUID = '11111111-1111-4111-8111-111111111111';
+const SOURCE_ENTRY = '22222222-2222-4222-8222-222222222222';
+const UNKNOWN_ENTRY = '99999999-9999-4999-8999-999999999999';
+const FILENAME = '2026-05-31T15-32-04-500Z-deadbeef.png';
+
+const PNG_MAGIC = new Uint8Array([
+  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
+]);
+
+function makeConfig(): DeskworkConfig {
+  return {
+    version: 1,
+    sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/cal.md' } },
+    defaultSite: 'main',
+  };
+}
+
+function entryFixture(): Entry {
+  return {
+    uuid: ENTRY_UUID,
+    slug: 'foo',
+    title: 'foo',
+    keywords: [],
+    source: 'manual',
+    currentStage: 'Drafting',
+    iterationByStage: { Ideas: 1, Planned: 1, Outlining: 1 },
+    artifactPath: 'docs/foo/index.md',
+    createdAt: '2026-04-30T10:00:00.000Z',
+    updatedAt: '2026-04-30T10:00:00.000Z',
+  };
+}
+
+async function seedComment(projectRoot: string): Promise<string> {
+  const minted = mintEntryAnnotation({
+    type: 'comment',
+    workflowId: ENTRY_UUID,
+    version: 1,
+    range: { start: 0, end: 4 },
+    text: 'note',
+  });
+  await addEntryAnnotation(projectRoot, ENTRY_UUID, minted as DraftAnnotation);
+  return minted.id;
+}
+
+async function seedOrphan(projectRoot: string, filename: string): Promise<void> {
+  const dir = join(projectRoot, '.deskwork', 'screenshots-orphan');
+  await mkdir(dir, { recursive: true });
+  await writeFile(join(dir, filename), PNG_MAGIC);
+}
+
+async function postPromote(
+  app: ReturnType<typeof createApp>,
+  filename: string,
+  entryId: string,
+  commentId: string,
+  body?: unknown,
+): Promise<{ status: number; body: unknown }> {
+  const url = `http://x/api/dev/editorial-review/screenshots/orphan/${encodeURIComponent(filename)}/promote-to-entry/${entryId}/comment/${commentId}`;
+  const init: RequestInit =
+    body !== undefined
+      ? {
+          method: 'POST',
+          headers: { 'content-type': 'application/json' },
+          body: JSON.stringify(body),
+        }
+      : { method: 'POST' };
+  const res = await app.fetch(new Request(url, init));
+  const contentType = res.headers.get('content-type') ?? '';
+  if (!contentType.toLowerCase().includes('application/json')) {
+    return { status: res.status, body: { error: await res.text() } };
+  }
+  return { status: res.status, body: await res.json() };
+}
+
+function asObj(v: unknown): Record<string, unknown> {
+  if (!v || typeof v !== 'object') throw new Error('expected object response');
+  return v as Record<string, unknown>;
+}
+
+describe('POST /api/dev/editorial-review/screenshots/orphan/:filename/promote-to-entry/:entryId/comment/:commentId', () => {
+  let projectRoot: string;
+  let cfg: DeskworkConfig;
+
+  beforeEach(async () => {
+    projectRoot = await mkdtemp(join(tmpdir(), 'dw-promote-route-'));
+    cfg = makeConfig();
+    await mkdir(join(projectRoot, '.deskwork', 'review-journal', 'history'), {
+      recursive: true,
+    });
+    await mkdir(join(projectRoot, 'docs', 'foo'), { recursive: true });
+    await writeFile(
+      join(projectRoot, '.deskwork', 'config.json'),
+      JSON.stringify(cfg),
+    );
+    await writeFile(join(projectRoot, 'docs', 'foo', 'index.md'), '# foo\n');
+    await writeSidecar(projectRoot, entryFixture());
+  });
+
+  afterEach(async () => {
+    await rm(projectRoot, { recursive: true, force: true });
+  });
+
+  it('moves an orphan file to the entry-anchored path and attaches to the comment', async () => {
+    const commentId = await seedComment(projectRoot);
+    await seedOrphan(projectRoot, FILENAME);
+    const app = createApp({ projectRoot, config: cfg });
+    const { status, body } = await postPromote(
+      app,
+      FILENAME,
+      ENTRY_UUID,
+      commentId,
+    );
+    expect(status).toBe(200);
+    const obj = asObj(body);
+    expect(obj.relativeWrittenPath).toBe(
+      `docs/foo/scrapbook/screenshots/${FILENAME}`,
+    );
+    expect(obj.attachments).toEqual([
+      `docs/foo/scrapbook/screenshots/${FILENAME}`,
+    ]);
+    expect(obj.sidecarMetaPath).toBeNull();
+    // The file moved (orphan path is gone, dest exists).
+    const destInfo = await stat(
+      join(projectRoot, 'docs', 'foo', 'scrapbook', 'screenshots', FILENAME),
+    );
+    expect(destInfo.size).toBe(PNG_MAGIC.length);
+    await expect(
+      stat(join(projectRoot, '.deskwork', 'screenshots-orphan', FILENAME)),
+    ).rejects.toThrow();
+    // Folded annotation list shows the attachment.
+    const folded = await listEntryAnnotations(projectRoot, ENTRY_UUID);
+    if (folded[0].type !== 'comment') throw new Error('expected comment');
+    expect(folded[0].attachments).toEqual([
+      `docs/foo/scrapbook/screenshots/${FILENAME}`,
+    ]);
+  });
+
+  it('writes a sidecar .meta.json when sourceEntry differs (cross-entry case)', async () => {
+    const commentId = await seedComment(projectRoot);
+    await seedOrphan(projectRoot, FILENAME);
+    const app = createApp({ projectRoot, config: cfg });
+    const { status, body } = await postPromote(
+      app,
+      FILENAME,
+      ENTRY_UUID,
+      commentId,
+      { sourceEntry: SOURCE_ENTRY },
+    );
+    expect(status).toBe(200);
+    const obj = asObj(body);
+    const sidecar = obj.sidecarMetaPath;
+    if (typeof sidecar !== 'string') {
+      throw new Error('expected sidecarMetaPath to be a string');
+    }
+    expect(sidecar.endsWith(`${FILENAME}.meta.json`)).toBe(true);
+    const sidecarBody = JSON.parse(await readFile(sidecar, 'utf-8')) as Record<
+      string,
+      unknown
+    >;
+    expect(sidecarBody.sourceEntry).toBe(SOURCE_ENTRY);
+  });
+
+  it('omits the sidecar when sourceEntry == entryId (same-entry case)', async () => {
+    const commentId = await seedComment(projectRoot);
+    await seedOrphan(projectRoot, FILENAME);
+    const app = createApp({ projectRoot, config: cfg });
+    const { status, body } = await postPromote(
+      app,
+      FILENAME,
+      ENTRY_UUID,
+      commentId,
+      { sourceEntry: ENTRY_UUID },
+    );
+    expect(status).toBe(200);
+    const obj = asObj(body);
+    expect(obj.sidecarMetaPath).toBeNull();
+  });
+
+  it('returns 400 on malformed filename', async () => {
+    const commentId = await seedComment(projectRoot);
+    const app = createApp({ projectRoot, config: cfg });
+    const { status, body } = await postPromote(
+      app,
+      '../escape.png',
+      ENTRY_UUID,
+      commentId,
+    );
+    expect(status).toBe(400);
+    expect(asObj(body).error).toMatch(/filename/);
+  });
+
+  it('returns 400 on malformed sourceEntry', async () => {
+    const commentId = await seedComment(projectRoot);
+    await seedOrphan(projectRoot, FILENAME);
+    const app = createApp({ projectRoot, config: cfg });
+    const { status } = await postPromote(
+      app,
+      FILENAME,
+      ENTRY_UUID,
+      commentId,
+      { sourceEntry: 'not-a-uuid' },
+    );
+    expect(status).toBe(400);
+  });
+
+  it('returns 404 when the orphan file does not exist', async () => {
+    const commentId = await seedComment(projectRoot);
+    const app = createApp({ projectRoot, config: cfg });
+    const { status, body } = await postPromote(
+      app,
+      FILENAME,
+      ENTRY_UUID,
+      commentId,
+    );
+    expect(status).toBe(404);
+    expect(asObj(body).error).toMatch(/orphan screenshot not found/);
+  });
+
+  it('returns 404 on unknown entry sidecar', async () => {
+    const commentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
+    await seedOrphan(projectRoot, FILENAME);
+    const app = createApp({ projectRoot, config: cfg });
+    const { status, body } = await postPromote(
+      app,
+      FILENAME,
+      UNKNOWN_ENTRY,
+      commentId,
+    );
+    expect(status).toBe(404);
+    expect(asObj(body).error).toMatch(/unknown entry/);
+  });
+
+  it('returns 404 when the commentId is not present in the entry stream', async () => {
+    await seedOrphan(projectRoot, FILENAME);
+    const app = createApp({ projectRoot, config: cfg });
+    const missingComment = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
+    const { status, body } = await postPromote(
+      app,
+      FILENAME,
+      ENTRY_UUID,
+      missingComment,
+    );
+    expect(status).toBe(404);
+    expect(asObj(body).error).toMatch(/unknown commentId/);
+  });
+
+  it('returns 409 when an entry-anchored file of the same name already exists', async () => {
+    const commentId = await seedComment(projectRoot);
+    await seedOrphan(projectRoot, FILENAME);
+    // Pre-create the dest file.
+    const destDir = join(projectRoot, 'docs', 'foo', 'scrapbook', 'screenshots');
+    await mkdir(destDir, { recursive: true });
+    await writeFile(join(destDir, FILENAME), PNG_MAGIC);
+    const app = createApp({ projectRoot, config: cfg });
+    const { status, body } = await postPromote(
+      app,
+      FILENAME,
+      ENTRY_UUID,
+      commentId,
+    );
+    expect(status).toBe(409);
+    expect(asObj(body).error).toMatch(/already exists/);
+  });
+});
diff --git a/plugins/deskwork-studio/public/src/entry-review/screenshot-attach.ts b/plugins/deskwork-studio/public/src/entry-review/screenshot-attach.ts
new file mode 100644
index 00000000..ecf83ade
--- /dev/null
+++ b/plugins/deskwork-studio/public/src/entry-review/screenshot-attach.ts
@@ -0,0 +1,151 @@
+/**
+ * Phase 8 Step 8.4.1 — client-side attach-to-comment workflow.
+ *
+ * After a screenshot is captured (Step 8.3.1 + 8.3.2) and persisted
+ * (Step 8.3.3), the operator can either:
+ *
+ *   1. Attach the screenshot to an EXISTING comment — appends the
+ *      persisted relative path to the comment's `attachments[]` field
+ *      via a PATCH that records the FULL intended attachment list
+ *      (the schema is full-replacement; an "append" client-side
+ *      becomes "send [...prior, newPath]" on the wire — see
+ *      `packages/core/src/schema/draft-annotation.ts`'s
+ *      `EditCommentAnnotation.attachments` JSDoc).
+ *
+ *   2. Create a NEW comment with the screenshot pre-attached —
+ *      POSTs an annotation of `type: 'comment'` whose
+ *      `attachments[]` is the path. Same field, different journal
+ *      event type.
+ *
+ * Both flows are pure HTTP wrappers. The capture / persist /
+ * comment-creation calls happen UPSTREAM of this module; this module
+ * is the binding step from a persisted path into the comment's field.
+ *
+ * Composition contract: the controller (annotations.ts) drives the
+ * round-trip:
+ *
+ *   - operator picks "attach screenshot to this comment" → capture +
+ *     persist → call `attachScreenshotToComment(entryId, commentId,
+ *     priorAttachments, newPath)`.
+ *   - operator picks "new comment with screenshot" → capture +
+ *     persist → call `createCommentWithAttachment(entryId, draft,
+ *     newPath)`.
+ *
+ * Response parsing is hand-rolled (no `as` casts) — same shape as
+ * `screenshot-persist.ts`.
+ */
+
+const ENTRY_BASE = '/api/dev/editorial-review/entry';
+
+/**
+ * Minimal subset of `CommentAnnotation` the new-comment-with-
+ * attachment flow needs to compose with the EXISTING annotate-route
+ * body. Caller supplies the comment's prose, range, version, and
+ * (optional) category / anchor; the attachment list is supplied
+ * separately so the call site doesn't have to manually compose it.
+ */
+export interface NewCommentDraft {
+  readonly text: string;
+  readonly version: number;
+  readonly range: { readonly start: number; readonly end: number };
+  readonly category?: string;
+  readonly anchor?: string;
+  readonly replyTo?: string;
+}
+
+/**
+ * Attach a persisted screenshot path to an EXISTING comment. The
+ * caller supplies the comment's current attachment list (from the
+ * folded read) so the wire payload carries the full intended state
+ * — the edit-comment schema's attachments field is full-replacement.
+ *
+ * Returns true on success (HTTP 200). Throws a descriptive error on
+ * non-200 or network failure so the caller can surface the error to
+ * the operator (toast / inline error).
+ */
+export async function attachScreenshotToComment(
+  entryId: string,
+  commentId: string,
+  priorAttachments: readonly string[],
+  newRelativePath: string,
+): Promise<true> {
+  const next = [...priorAttachments, newRelativePath];
+  const url = `${ENTRY_BASE}/${encodeURIComponent(entryId)}/comments/${encodeURIComponent(commentId)}`;
+  const res = await fetch(url, {
+    method: 'PATCH',
+    headers: { 'content-type': 'application/json' },
+    body: JSON.stringify({ attachments: next }),
+  });
+  if (!res.ok) {
+    const reason = await extractErrorReason(res);
+    throw new Error(
+      `attach-screenshot PATCH failed (status ${res.status}): ${reason}`,
+    );
+  }
+  return true;
+}
+
+/**
+ * Create a NEW comment with the screenshot pre-attached. POSTs a
+ * `type: 'comment'` annotation whose `attachments[]` carries the
+ * given relative path. Returns the minted annotation id on success;
+ * throws on failure.
+ */
+export async function createCommentWithAttachment(
+  entryId: string,
+  draft: NewCommentDraft,
+  relativePath: string,
+): Promise<{ readonly annotationId: string }> {
+  const url = `${ENTRY_BASE}/${encodeURIComponent(entryId)}/annotate`;
+  const body: Record<string, unknown> = {
+    type: 'comment',
+    workflowId: entryId,
+    version: draft.version,
+    range: { start: draft.range.start, end: draft.range.end },
+    text: draft.text,
+    attachments: [relativePath],
+  };
+  if (draft.category !== undefined) body.category = draft.category;
+  if (draft.anchor !== undefined) body.anchor = draft.anchor;
+  if (draft.replyTo !== undefined) body.replyTo = draft.replyTo;
+  const res = await fetch(url, {
+    method: 'POST',
+    headers: { 'content-type': 'application/json' },
+    body: JSON.stringify(body),
+  });
+  if (!res.ok) {
+    const reason = await extractErrorReason(res);
+    throw new Error(
+      `create-comment-with-attachment POST failed (status ${res.status}): ${reason}`,
+    );
+  }
+  const parsed: unknown = await res.json();
+  const annotationId = extractAnnotationId(parsed);
+  if (annotationId === null) {
+    throw new Error(
+      'create-comment-with-attachment: success response missing annotation.id',
+    );
+  }
+  return { annotationId };
+}
+
+async function extractErrorReason(res: Response): Promise<string> {
+  try {
+    const body: unknown = await res.json();
+    if (typeof body === 'object' && body !== null) {
+      const err = Reflect.get(body, 'error');
+      if (typeof err === 'string' && err.length > 0) return err;
+    }
+  } catch {
+    // fall through to status-only
+  }
+  return `${res.status}`;
+}
+
+function extractAnnotationId(body: unknown): string | null {
+  if (typeof body !== 'object' || body === null) return null;
+  const ann = Reflect.get(body, 'annotation');
+  if (typeof ann !== 'object' || ann === null) return null;
+  const id = Reflect.get(ann, 'id');
+  return typeof id === 'string' && id.length > 0 ? id : null;
+}
diff --git a/plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts b/plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts
new file mode 100644
index 00000000..a03d388d
--- /dev/null
+++ b/plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts
@@ -0,0 +1,253 @@
+/**
+ * Phase 8 Step 8.4.3 — paste / drag-drop handlers for the comment
+ * input field.
+ *
+ * The two surface affordances reuse a single internal pipeline:
+ *
+ *   1. Extract an image file from the event (ClipboardEvent or
+ *      DragEvent).
+ *   2. POST the bytes to the orphan-screenshot endpoint (the
+ *      capture-then-attach pipeline from Step 8.3.3). The orphan
+ *      path is the right destination because the comment in flight
+ *      doesn't have a commentId yet — when the operator submits, the
+ *      controller calls the promote endpoint to move the orphan
+ *      into the entry-anchored path AND bind it to the new comment.
+ *   3. Notify the caller via the supplied `onScreenshotAttached`
+ *      callback so it can show a thumbnail / preview / pending
+ *      marker on the comment input UI.
+ *
+ * The handlers do NOT touch the comment input's DOM directly — they
+ * are pure event-to-callback pipes. The caller wires them onto the
+ * input element + composer container and reacts to the callback by
+ * surfacing the operator-visible state.
+ *
+ * Filename rules: pasted clipboard image bytes typically have no
+ * sensible name attached, so we synthesize one with the orphan
+ * convention (`<ISO-timestamp>-<hash>.png`). Drag-drop files DO
+ * have names but we ignore them — security boundary against
+ * operator-supplied path-traversal characters. The synthesized name
+ * matches the orphan filename regex on the server side.
+ *
+ * Affordance scope: the paste handler attaches to the comment input
+ * element (where the operator's typing focus is); the drag-drop
+ * handler attaches to the comment composer container (a larger drop
+ * target). Both fire the same callback so the caller's state machine
+ * stays simple.
+ */
+
+import { postOrphanScreenshot } from './screenshot-persist.ts';
+import {
+  filesystemSafeIsoTimestamp,
+  shortHashOfBlob,
+} from './screenshot-capture.ts';
+
+const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
+
+export interface AttachmentEvent {
+  /** Relative path the orphan-screenshot endpoint persisted to. */
+  readonly relativeWrittenPath: string;
+  /** The filename (without directory) the endpoint wrote. */
+  readonly filename: string;
+}
+
+export interface AttachmentError {
+  readonly message: string;
+}
+
+export interface PasteDropOptions {
+  /**
+   * Callback invoked when an image was successfully extracted from the
+   * event, persisted to the orphan path, and is ready for the caller
+   * to display as a pending attachment on the comment input.
+   */
+  readonly onScreenshotAttached: (ev: AttachmentEvent) => void;
+  /**
+   * Callback invoked when extraction OR persistence fails. Caller is
+   * responsible for surfacing the error to the operator (toast / inline
+   * error). Optional — when omitted, errors are silently swallowed
+   * after preventing default (typical for the typing-paste-of-text
+   * fallthrough case).
+   */
+  readonly onError?: (err: AttachmentError) => void;
+  /**
+   * Clock injection point for tests. Defaults to `() => new Date()`.
+   */
+  readonly now?: () => Date;
+}
+
+/**
+ * Clipboard-event shape we care about. Same approach as the
+ * `DragEventLike` shape — narrow on the runtime-present field rather
+ * than `instanceof ClipboardEvent`, which jsdom may not expose
+ * symmetrically across versions.
+ */
+interface ClipboardEventLike extends Event {
+  readonly clipboardData: DataTransfer | null;
+}
+
+function isClipboardEventLike(ev: Event): ev is ClipboardEventLike {
+  return 'clipboardData' in ev;
+}
+
+/**
+ * Extract image bytes from a ClipboardEvent's `clipboardData`. Returns
+ * the Blob when a recognised image MIME-type is present, or null
+ * otherwise (the operator pasted plain text — the handler should let
+ * the event propagate normally).
+ */
+export function extractImageFromClipboard(event: Event): Blob | null {
+  if (!isClipboardEventLike(event)) return null;
+  const data = event.clipboardData;
+  if (!data) return null;
+  for (let i = 0; i < data.items.length; i += 1) {
+    const item = data.items[i];
+    if (item.kind !== 'file') continue;
+    if (!IMAGE_TYPES.includes(item.type)) continue;
+    const file = item.getAsFile();
+    if (file !== null) return file;
+  }
+  // Fallback: `clipboardData.files` may carry the image on some
+  // browsers (notably Firefox handles screenshot-paste this way).
+  for (let i = 0; i < data.files.length; i += 1) {
+    const file = data.files[i];
+    if (IMAGE_TYPES.includes(file.type)) return file;
+  }
+  return null;
+}
+
+/**
+ * Drag-event shape we care about. jsdom does NOT ship the
+ * `DragEvent` global by default, so we narrow on the runtime-present
+ * `dataTransfer` field rather than `instanceof DragEvent`. The shape
+ * is identical to the DOM spec.
+ */
+interface DragEventLike extends Event {
+  readonly dataTransfer: DataTransfer | null;
+}
+
+function isDragEventLike(ev: Event): ev is DragEventLike {
+  // `dataTransfer` is a defined accessor on real DragEvent instances
+  // (and on the test-shape we construct in jsdom via
+  // Object.defineProperty). Guard against the field being missing
+  // (a plain Event dispatched on the same target).
+  return 'dataTransfer' in ev;
+}
+
+/**
+ * Extract image bytes from a DragEvent's `dataTransfer.files`. Returns
+ * the Blob when a recognised image file was dropped, or null when the
+ * drop carried no image (text drag, link drag, etc.).
+ */
+export function extractImageFromDrop(event: Event): Blob | null {
+  if (!isDragEventLike(event)) return null;
+  const data = event.dataTransfer;
+  if (!data) return null;
+  for (let i = 0; i < data.files.length; i += 1) {
+    const file = data.files[i];
+    if (IMAGE_TYPES.includes(file.type)) return file;
+  }
+  return null;
+}
+
+/**
+ * Persist the given blob to the orphan-screenshot endpoint with a
+ * synthesized filename. Returns the {writtenPath, relativeWrittenPath,
+ * filename} on success; rejects on network / server error so the
+ * caller's onError handler fires.
+ */
+export async function persistAsOrphan(
+  blob: Blob,
+  now: () => Date = () => new Date(),
+): Promise<AttachmentEvent> {
+  const timestamp = filesystemSafeIsoTimestamp(now());
+  const hash = await shortHashOfBlob(blob);
+  const filename = `${timestamp}-${hash}.png`;
+  const result = await postOrphanScreenshot(blob, filename);
+  return { relativeWrittenPath: result.relativeWrittenPath, filename };
+}
+
+/**
+ * Attach a `paste` listener to `element` that intercepts image-bearing
+ * paste events and persists them to the orphan endpoint. Returns an
+ * unsubscribe function that removes the listener.
+ *
+ * The handler calls `event.preventDefault()` when an image is detected
+ * AND extraction succeeds — this prevents the browser's default
+ * "paste image as a data: URL in the textarea" behavior, which would
+ * leak the bytes inline into the comment text. Plain text pastes are
+ * passed through unchanged.
+ */
+/**
+ * Shared "image bytes were extracted from the event — persist them
+ * and notify the caller" tail. Extracted so the paste + drop
+ * handlers don't trip the clone-detection gate on the
+ * preventDefault + try/await/catch shape.
+ */
+async function persistAndNotify(
+  ev: Event,
+  blob: Blob,
+  options: PasteDropOptions,
+): Promise<void> {
+  ev.preventDefault();
+  try {
+    const attached = await persistAsOrphan(blob, options.now);
+    options.onScreenshotAttached(attached);
+  } catch (err) {
+    if (options.onError) {
+      options.onError({
+        message: err instanceof Error ? err.message : String(err),
+      });
+    }
+  }
+}
+
+export function bindPasteHandler(
+  element: HTMLElement,
+  options: PasteDropOptions,
+): () => void {
+  const handler = async (ev: Event): Promise<void> => {
+    // No `instanceof ClipboardEvent` — jsdom isn't fully symmetric on
+    // the global. `extractImageFromClipboard` narrows on the
+    // `clipboardData` accessor and the items / files shape it reads.
+    const blob = extractImageFromClipboard(ev);
+    if (blob === null) return; // plain text paste — let it through
+    await persistAndNotify(ev, blob, options);
+  };
+  element.addEventListener('paste', handler);
+  return () => element.removeEventListener('paste', handler);
+}
+
+/**
+ * Attach `dragover` + `drop` listeners to `element` so the operator
+ * can drag-drop an image file from the OS filesystem onto the comment
+ * composer. `dragover` MUST be intercepted to enable the drop (the
+ * browser's default behavior rejects drops on most elements).
+ *
+ * The same caveat about `preventDefault` applies: when an image is
+ * dropped AND extracted, we prevent default so the browser doesn't
+ * navigate to the dropped file URL (the legacy fallback).
+ */
+export function bindDragDropHandler(
+  element: HTMLElement,
+  options: PasteDropOptions,
+): () => void {
+  const onDragOver = (ev: Event): void => {
+    // Required to enable a drop on this element.
+    ev.preventDefault();
+  };
+  const onDrop = async (ev: Event): Promise<void> => {
+    // No `instanceof DragEvent` — jsdom doesn't expose the global in
+    // every config. `extractImageFromDrop` narrows on the shape it
+    // needs (`dataTransfer.files`) — that's the only field this
+    // module actually reads.
+    const blob = extractImageFromDrop(ev);
+    if (blob === null) return;
+    await persistAndNotify(ev, blob, options);
+  };
+  element.addEventListener('dragover', onDragOver);
+  element.addEventListener('drop', onDrop);
+  return () => {
+    element.removeEventListener('dragover', onDragOver);
+    element.removeEventListener('drop', onDrop);
+  };
+}
diff --git a/plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts b/plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts
index 133744a0..3ce0cc17 100644
--- a/plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts
+++ b/plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts
@@ -276,6 +276,52 @@ function renderDiffExpansion(payload: DiffSlicePayload): HTMLElement {
   return expansion;
 }
 
+/**
+ * Phase 8 Step 8.4 — render attached screenshots as a thumbnail strip.
+ * Returns a container `<div class="er-marginalia-attachments">` with
+ * one `<img>` per attachment path, or null when the comment has no
+ * attachments (so the caller doesn't append an empty div).
+ *
+ * Paths are taken VERBATIM as the `src` attribute. Per Phase 8 the
+ * attachment paths are project-root-relative (e.g.
+ * `docs/foo/scrapbook/screenshots/<filename>.png`), which serves
+ * directly from the studio's static-file handler. The renderer does
+ * NOT URL-encode the path; the persistence layer's filename regex
+ * (`screenshot-persistence.ts`) is the security boundary against
+ * malformed filenames, AND the schema-level `z.array(z.string())`
+ * is the type-safety boundary against non-string entries.
+ *
+ * The strip is intentionally minimal — a click-to-lightbox surface
+ * lands in Phase 9/10/11 design work. The shape stays stable so the
+ * lightbox can attach to the existing `<img>` tags without changing
+ * the strip's outer structure.
+ */
+function buildAttachmentStrip(
+  attachments: readonly string[] | undefined,
+): HTMLElement | null {
+  if (!attachments || attachments.length === 0) return null;
+  const strip = document.createElement('div');
+  strip.className = 'er-marginalia-attachments';
+  for (const path of attachments) {
+    if (typeof path !== 'string' || path.length === 0) continue;
+    const img = document.createElement('img');
+    img.className = 'er-marginalia-attachment-thumb';
+    // setAttribute (instead of img.src = path) so the assertion
+    // `getAttribute('src')` returns the verbatim string the caller
+    // passed — `img.src` resolves to an absolute URL via the
+    // browser's URL resolver, which would break tests that assert
+    // the literal relative path.
+    img.setAttribute('src', path);
+    img.setAttribute('alt', 'attached screenshot');
+    img.setAttribute('loading', 'lazy');
+    strip.appendChild(img);
+  }
+  // If every entry was a falsy string the strip ends up empty;
+  // return null so the caller doesn't render an empty container.
+  if (strip.children.length === 0) return null;
+  return strip;
+}
+
 export interface BuildSidebarItemDeps extends SidebarRenderDeps {
   /** Click on the Resolve button — the controller handles the
    *  POST + sidebar-list mutation. */
@@ -344,6 +390,13 @@ export function buildSidebarItem(
   );
   if (stamp) li.appendChild(stamp);
   li.appendChild(text);
+  // Phase 8 Step 8.4 render — attached screenshots surface as a
+  // thumbnail strip below the comment text. The strip is plain
+  // `<img>` tags; a click-through to a fullsize lightbox lands in
+  // Phase 9/10/11 design work. The strip's container has
+  // `.er-marginalia-attachments` so CSS can style the row.
+  const attachmentStrip = buildAttachmentStrip(annotation.attachments);
+  if (attachmentStrip) li.appendChild(attachmentStrip);
 
   const actions = document.createElement('div');
   actions.className = 'er-marginalia-actions';
@@ -444,6 +497,8 @@ export function buildResolvedItem(
   li.appendChild(quote);
   if (stamp) li.appendChild(stamp);
   li.appendChild(text);
+  const attachmentStrip = buildAttachmentStrip(ann.attachments);
+  if (attachmentStrip) li.appendChild(attachmentStrip);
   li.appendChild(actions);
   return li;
 }


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
