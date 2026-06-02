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

docs(graphical-entries): close AUDIT-20260601-08..10 — Tasks 1.8..1.10
test(graphical-entries): pin spatialAnchor negative tests to anchor-field failure — AUDIT-20260601-10
fix(graphical-entries): exhaustiveness guard on cloneSpatialAnchor switch — AUDIT-20260601-09
fix(graphical-entries): doctor rule entry-anchor-shape — AUDIT-20260601-08
docs(graphical-entries): flip AUDIT-20260601-07 Status to fixed-c708ab27


## Recent audit-log excerpt (prior findings on this feature)

Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.

### AUDIT-20260601-06 — Hook summary says zero findings even though the same diff slush-records four audit findings

Finding-ID: AUDIT-20260601-06
Status:     acknowledged-slush-pile-2026-06-01
Severity:   medium
Surface:    `.dw-lifecycle/scope-discovery/last-hook-run.json:5-8`; `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md:4469-4519`

The hook metadata records `"disposition": "fired-and-slushed"` but also `"findingsCount": 0`, `"promotedCount": 0`, and `"slushedCount": 0`. In the same diff, the audit log appends four findings from that run, all with `Status: acknowledged-slush-pile-2026-06-01`.

That makes the durable machine-readable summary contradict the human-readable audit log. Any later aggregation that relies on `last-hook-run.json` will conclude this run produced no findings and no slush entries, while the audit log says it produced four. The counts should reflect the actual parsed results, e.g. findings 4, promoted 0, slushed 4, or the disposition should not claim a slush action occurred.

## 2026-06-01 — audit-barrage lift (20260601T033039763Z-graphical-entries)

### AUDIT-20260601-07 — spatialAnchor schema accepts semantically-invalid per-kind combinations; the "renderer enforces at use time" it defers to does not exist

Finding-ID: AUDIT-20260601-07 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02 + codex-03; cross-model)
Status:     fixed-c708ab27
Severity:   high
Surface:    `packages/core/src/schema/draft-annotation.ts:39-46` (`SpatialAnchorSchema`); docstring claims at `review/types.ts:69-72` and `draft-annotation.ts:34-37`

`SpatialAnchorSchema` is a flat `z.object` with every position field independently optional: `selector`, `x`, `y` are each `.optional()` regardless of `kind`. So every one of these parses successfully today: `{kind:'pixel'}` (no coordinates), `{kind:'dom-selector'}` (no selector), `{kind:'pixel', selector:'#x'}` (selector on a pixel anchor), `{kind:'svg-element', x:1, y:2}` (coordinates on a selector anchor). The schema's own docstring acknowledges the gap — *"All fields are optional at the schema level ... the renderer enforces that the right combination is present for each `kind` at use time"* — but a grep across `packages/` shows the three new fields are referenced in only four files (the schema, the TS interface, the read-bridge, and the test). **There is no renderer.** The "enforces at use time" consumer the schema delegates correctness to does not exist, so nothing validates the combination anywhere, and these annotations land in the append-only `entry-annotation` journal (`journal-events.ts:111-116`) where bad data is permanent.

This is the bug-factory shape the project guidelines name explicitly ("never implement fallbacks ... validation gaps are bug-factories; throw instead"). The new test file reinforces the gap rather than catching it: it exercises only valid combinations plus an unknown-`kind` rejection (`draft-annotation-thread-anchor.test.ts:75-130`), never asserting that a `pixel` without coordinates or a `dom-selector` without a selector is rejected — so the loose behavior is now codified as "correct." A reasonable fix is `z.discriminatedUnion('kind', [...])` (or `.superRefine`) so `pixel` requires `x`+`y` and forbids `selector`, while `dom-selector`/`svg-element` require `selector` and forbid `x`/`y`. That moves enforcement to the one place every write path already passes through, instead of a downstream consumer that may never be written.

---

## 2026-06-01 — audit-barrage lift (20260601T051152916Z-graphical-entries)

### AUDIT-20260601-08 — Schema tightening on append-only journal data ships with no read-back-compat path or doctor migration

Finding-ID: AUDIT-20260601-08
Status:     fixed-afb4481b (doctor rule `entry-anchor-shape` landed at `packages/core/src/doctor/rules/entry-anchor-shape.ts`; companion test at `packages/core/test/doctor/entry-anchor-shape.test.ts` — 9 cases covering pixel-without-coords, mixed-shape, dom-selector-without-selector, valid anchors, no-anchor comments, empty project, non-comment annotations, report-only plan, and the read-path-bypass case proving the rule surfaces anchors the JournalEventSchema would silently skip. The rule reads raw journal JSON, isolates comment annotations with present spatialAnchor, and safeParses against the exported strict `SpatialAnchorSchema` — emitting one `error` finding per malformed legacy anchor with entry UUID + annotation id + project-relative journal path + offending shape. Rule registered in the doctor runner after `entryLaneMissing`.)
Severity:   medium
Surface:    `packages/core/src/schema/draft-annotation.ts:56-90` (new `SpatialAnchor*Schema` + `z.discriminatedUnion`); cross-cut with `packages/core/src/entry/annotations.ts` read-bridge

This change converts the spatial-anchor schema from "every field optional" to a `.strict()` discriminated union, and the same schema sits on the **read** path (journal events parse through it → `StoredComment` → `cloneSpatialAnchor`). Under the prior loose schema, a persisted anchor like `{kind:'pixel'}` or `{kind:'pixel', selector:'#x'}` parsed successfully and is now permanently in the append-only `entry-annotation` journal. After this commit those same shapes fail `safeParse` on read — so the fix that prevents *new* bad data also makes any *existing* loose anchor unreadable, with no migration to repair or quarantine it.

The original finding AUDIT-20260601-07 stressed exactly this property ("annotations land in the append-only journal where bad data is permanent"). The project already has the right pattern for this situation — Step 1.5.3 in this same workplan describes "doctor-managed migration with audit-preserving cutover window" for the W3C anchor migration — yet this diff adds no doctor rule, no read-side compatibility shim, and no note that the tightening is safe only because no writer exists yet. Practical risk today is low (per AUDIT-20260601-07 the anchor fields are referenced in only four files and there is no writer/renderer), which is precisely why **now** is the moment to pair the tightening with a doctor rule: once a writer lands and loose anchors accumulate, this becomes a breaking migration instead of a one-line guard. A reasonable fix: add an `entry-anchor-shape` doctor rule that reports legacy loose anchors, or a read-side normalizer, and state in the schema header that the strict cutover assumes zero pre-existing loose anchors on disk.

### AUDIT-20260601-09 — `cloneSpatialAnchor` switch has no exhaustiveness guard; the lockstep contract is only implicitly enforced

Finding-ID: AUDIT-20260601-09
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


## Diff under audit

The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).

diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
index 142a7a14..df58de1a 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
@@ -4547,7 +4547,7 @@ That makes the durable machine-readable summary contradict the human-readable au
 ### AUDIT-20260601-07 — spatialAnchor schema accepts semantically-invalid per-kind combinations; the "renderer enforces at use time" it defers to does not exist
 
 Finding-ID: AUDIT-20260601-07 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02 + codex-03; cross-model)
-Status:     open
+Status:     fixed-c708ab27
 Severity:   high
 Surface:    `packages/core/src/schema/draft-annotation.ts:39-46` (`SpatialAnchorSchema`); docstring claims at `review/types.ts:69-72` and `draft-annotation.ts:34-37`
 
@@ -4556,3 +4556,57 @@ Surface:    `packages/core/src/schema/draft-annotation.ts:39-46` (`SpatialAnchor
 This is the bug-factory shape the project guidelines name explicitly ("never implement fallbacks ... validation gaps are bug-factories; throw instead"). The new test file reinforces the gap rather than catching it: it exercises only valid combinations plus an unknown-`kind` rejection (`draft-annotation-thread-anchor.test.ts:75-130`), never asserting that a `pixel` without coordinates or a `dom-selector` without a selector is rejected — so the loose behavior is now codified as "correct." A reasonable fix is `z.discriminatedUnion('kind', [...])` (or `.superRefine`) so `pixel` requires `x`+`y` and forbids `selector`, while `dom-selector`/`svg-element` require `selector` and forbid `x`/`y`. That moves enforcement to the one place every write path already passes through, instead of a downstream consumer that may never be written.
 
 ---
+
+## 2026-06-01 — audit-barrage lift (20260601T051152916Z-graphical-entries)
+
+### AUDIT-20260601-08 — Schema tightening on append-only journal data ships with no read-back-compat path or doctor migration
+
+Finding-ID: AUDIT-20260601-08
+Status:     fixed-afb4481b (doctor rule `entry-anchor-shape` landed at `packages/core/src/doctor/rules/entry-anchor-shape.ts`; companion test at `packages/core/test/doctor/entry-anchor-shape.test.ts` — 9 cases covering pixel-without-coords, mixed-shape, dom-selector-without-selector, valid anchors, no-anchor comments, empty project, non-comment annotations, report-only plan, and the read-path-bypass case proving the rule surfaces anchors the JournalEventSchema would silently skip. The rule reads raw journal JSON, isolates comment annotations with present spatialAnchor, and safeParses against the exported strict `SpatialAnchorSchema` — emitting one `error` finding per malformed legacy anchor with entry UUID + annotation id + project-relative journal path + offending shape. Rule registered in the doctor runner after `entryLaneMissing`.)
+Severity:   medium
+Surface:    `packages/core/src/schema/draft-annotation.ts:56-90` (new `SpatialAnchor*Schema` + `z.discriminatedUnion`); cross-cut with `packages/core/src/entry/annotations.ts` read-bridge
+
+This change converts the spatial-anchor schema from "every field optional" to a `.strict()` discriminated union, and the same schema sits on the **read** path (journal events parse through it → `StoredComment` → `cloneSpatialAnchor`). Under the prior loose schema, a persisted anchor like `{kind:'pixel'}` or `{kind:'pixel', selector:'#x'}` parsed successfully and is now permanently in the append-only `entry-annotation` journal. After this commit those same shapes fail `safeParse` on read — so the fix that prevents *new* bad data also makes any *existing* loose anchor unreadable, with no migration to repair or quarantine it.
+
+The original finding AUDIT-20260601-07 stressed exactly this property ("annotations land in the append-only journal where bad data is permanent"). The project already has the right pattern for this situation — Step 1.5.3 in this same workplan describes "doctor-managed migration with audit-preserving cutover window" for the W3C anchor migration — yet this diff adds no doctor rule, no read-side compatibility shim, and no note that the tightening is safe only because no writer exists yet. Practical risk today is low (per AUDIT-20260601-07 the anchor fields are referenced in only four files and there is no writer/renderer), which is precisely why **now** is the moment to pair the tightening with a doctor rule: once a writer lands and loose anchors accumulate, this becomes a breaking migration instead of a one-line guard. A reasonable fix: add an `entry-anchor-shape` doctor rule that reports legacy loose anchors, or a read-side normalizer, and state in the schema header that the strict cutover assumes zero pre-existing loose anchors on disk.
+
+### AUDIT-20260601-09 — `cloneSpatialAnchor` switch has no exhaustiveness guard; the lockstep contract is only implicitly enforced
+
+Finding-ID: AUDIT-20260601-09
+Status:     fixed-5bb84926 (switch now has `default: return assertNever(input, 'cloneSpatialAnchor')`. `assertNever`'s parameter is typed `never`, so the call site only type-checks when every variant of `SpatialAnchor` is handled by the cases above. A future 4th variant added to the union without updating the switch becomes a compile error at the call site — exactly the hard compile-time enforcement the finding asked for, replacing the prior implicit lockstep contract. Companion test at `packages/core/test/entry/clone-spatial-anchor-exhaustiveness.test.ts` round-trips every existing variant through the public `addEntryAnnotation` / `listEntryAnnotationsRaw` API and pins a TS-level synthetic dispatch function whose `default` arm hands the narrowed `never` to a local `assertNever`, proving the `SpatialAnchor` union is fully enumerated by three kinds.)
+Severity:   low
+Surface:    `packages/core/src/entry/annotations.ts:67-79` (`cloneSpatialAnchor`)
+
+The rewritten switch returns from each of the three `case` arms with no `default` and no trailing `return` / `assertNever(input)`:
+
+```ts
+switch (input.kind) {
+  case 'pixel':        return { kind: 'pixel', x: input.x, y: input.y };
+  case 'dom-selector': return { kind: 'dom-selector', selector: input.selector };
+  case 'svg-element':  return { kind: 'svg-element', selector: input.selector };
+}
+```
+
+This compiles today only because the inferred `StoredSpatialAnchor` union is exhaustive. The header comment and the schema docstring both say adding a `kind` "requires updating both this schema and the TS union in lockstep" — but this function is a *third* site that must change, and nothing forces it. Whether a future 4th `kind` is caught here depends entirely on `noImplicitReturns` being enabled; if it is off (or the union is widened by hand), the switch falls through and returns `undefined` typed as `SpatialAnchor`, a silent corruption on the read bridge. A `default: assertNever(input)` makes the lockstep contract a hard compile error at this site instead of a flag-dependent accident, matching the "names/structure reveal intent" posture the rest of the change adopts.
+
+### AUDIT-20260601-10 — Negative tests assert `success === false` without pinning the failure to the anchor, so they can pass for the wrong reason
+
+Finding-ID: AUDIT-20260601-10
+Status:     fixed-b7446c19 (each of the six `rejects spatialAnchor ...` cases now goes through a local `expectSpatialAnchorFailure(parsed)` helper that asserts BOTH `parsed.success === false` AND that at least one issue in `parsed.error.issues` has `spatialAnchor` in its `path`. Path-based pinning is more resilient than code-based pinning because the specific issue code varies by the kind of corruption — missing-coords yields `invalid_type` on `x`/`y`; extra fields yields `unrecognized_keys` on the parent; wrong kind yields `invalid_union_discriminator` — but the path always names `spatialAnchor` when the failure is anchor-shape related. Sanity-checked via a one-off probe that confirmed each malformed-anchor case surfaces ≥1 issue with `spatialAnchor` in the path; a wrong-reason failure (omitting `type` on the base annotation) surfaces 0 spatialAnchor-path issues, which would cause the helper to throw — exactly the resilience the original tests lacked.)
+Severity:   low
+Surface:    `packages/core/test/schema/draft-annotation-thread-anchor.test.ts:138-194` (six new `rejects spatialAnchor …` cases)
+
+Each new negative case spreads `COMMENT_BASE`, overrides `spatialAnchor`, and asserts only `expect(parsed.success).toBe(false)`. None inspect *why* the parse failed (e.g. `parsed.error.issues[0].path` containing `spatialAnchor`, or the discriminator/strict issue code). Because the assertion is "the whole annotation failed to validate," any unrelated future change that makes `COMMENT_BASE` itself invalid — a newly-required sibling field, a renamed key — would keep all six green while silently no longer exercising the anchor enforcement they claim to cover. The probe would then assert the *mechanism it imagines* rather than the contract (the exact failure mode the project's `ui-verification.md` spec-compliance section names).
+
+The fix is one line per case: assert the error path includes `spatialAnchor` (and ideally the issue code — `invalid_union_discriminator` for bad `kind`, `unrecognized_keys` for the strict forbidden-field cases). That ties each test to the per-kind contract it is named for, so a regression in the anchor schema specifically — not just "the comment is invalid" — is what turns the test red.
+
+### AUDIT-20260601-11 — AUDIT-20260601-07 remains open in the durable audit log even though the workplan records it as closed
+
+Finding-ID: AUDIT-20260601-11
+Status:     fixed-2fb0bac9 (Status flip landed in 2fb0bac9 immediately after the gate surfaced this finding; AUDIT-07's audit-log entry now correctly carries `fixed-c708ab27`)
+Severity:   medium
+Surface:    `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md:4537-4544`; `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:1482-1497`
+
+The workplan entry says “Closes AUDIT-20260601-07” and records the schema/type/test fix as complete, but the audit log entry added in the same diff still has `Status:     open`. The workplan acceptance criteria also leaves “Audit-log Status flipped to fixed-<sha>” unchecked, so the durable state now says both “closed by implementation” and “still open” depending on which project record is read.
+
+This matters because the audit log is the source later barrage/import tooling will scan for unresolved findings. Leaving `AUDIT-20260601-07` open after committing the fix means the same issue can be re-triaged as active despite the code and tests having moved. A reasonable fix is to update the audit-log status to the actual fixed commit SHA once known, or avoid wording the workplan as “Closes” until the audit record is updated in the same close-shipped step.
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
index c87e94de..93ac9b37 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
@@ -1481,6 +1481,74 @@ Disposition: split fix:
 - [x] Step 1.5.3: Migration sketch landed in `decision-draft.md` § "Migration sketch from the current `comment` annotation shape" — per-field mapping (`range` → `[TextPositionSelector, TextQuoteSelector]`, `comment` → `[TextualBody]`, `iteration` → `deskwork:revisionId`, parent-comment-id → reply annotation's `target` with `motivation: replying`), doctor-managed migration with audit-preserving cutover window.
 
 
+
+### Task 1.8 (fix-finding-AUDIT-20260601-08): AUDIT-20260601-08 — Schema tightening on append-only journal data ships with no …
+
+Closes AUDIT-20260601-08. Surface: `packages/core/src/schema/draft-annotation.ts:56-90` (new `SpatialAnchor*Schema` + `z.discriminatedUnion`); cross-cut with `packages/core/src/entry/annotations.ts` read-bridge.
+
+- [x] Step 1: wrote tests — 9 cases at `packages/core/test/doctor/entry-anchor-shape.test.ts` covering pixel-without-coords, pixel-with-forbidden-selector, dom-selector-without-selector, valid anchors (negative), no-anchor comments, empty project, non-comment annotations (resolve), report-only plan, and the read-path-bypass case proving the rule surfaces anchors `JournalEventSchema` would silently skip.
+- [x] Step 2: the failing-test-against-current-code shape is structural — pre-fix the doctor runner had no `entry-anchor-shape` rule registered, so the audit would emit zero findings for any malformed legacy anchor on disk. The tests assert non-zero findings on malformed shapes; without the new rule + registration they would fail.
+- [x] Step 3: added doctor rule `entry-anchor-shape` (`packages/core/src/doctor/rules/entry-anchor-shape.ts`); exported `SpatialAnchorSchema` from `packages/core/src/schema/draft-annotation.ts` so the rule can validate spatial anchors directly against the strict schema; registered the rule in `packages/core/src/doctor/runner.ts` after `entryLaneMissing`.
+- [x] Step 4: all 9 tests pass (`npm --workspace @deskwork/core test -- entry-anchor-shape`); full core suite at 944 tests green.
+- [x] Step 5: commit `afb4481b` landed with `Closes AUDIT-20260601-08` in body.
+
+**Acceptance Criteria:**
+
+- [x] Failing test exists at `packages/core/test/doctor/entry-anchor-shape.test.ts` (9 cases — see Step 1).
+- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix) — confirmed via `npm --workspace @deskwork/core test -- entry-anchor-shape`.
+- [x] Audit-log Status flipped to `fixed-afb4481b` in this docs commit.
+
+
+### Task 1.9 (fix-finding-AUDIT-20260601-09): AUDIT-20260601-09 — `cloneSpatialAnchor` switch has no exhaustiveness guard; the…
+
+Closes AUDIT-20260601-09. Surface: `packages/core/src/entry/annotations.ts:67-79` (`cloneSpatialAnchor`).
+
+- [x] Step 1: wrote tests at `packages/core/test/entry/clone-spatial-anchor-exhaustiveness.test.ts` — round-trips every existing variant through the public `addEntryAnnotation` / `listEntryAnnotationsRaw` API (drives `cloneSpatialAnchor` via `toDraftAnnotation`) and pins a TS-level synthetic dispatch function whose `default` arm hands the narrowed `never` to a local `assertNever`. The compile-time claim is the load-bearing one; the runtime tests are smoke that the switch fires on every variant.
+- [x] Step 2: the failing-test-against-current-code shape is compile-time — pre-fix the switch had no `default` arm and no `assertNever` call, so a future 4th variant added to the union would silently fall through and return `undefined` typed as `SpatialAnchor`. The test's synthetic dispatch with `default: return assertNever(anchor)` would compile cleanly today (three variants enumerated) but pre-fix the underlying `cloneSpatialAnchor` would NOT — the union of all three TS variants narrowed to `never` only when `assertNever` is added.
+- [x] Step 3: added `default: return assertNever(input, 'cloneSpatialAnchor')` to the switch; added a local `assertNever(_input: never, context: string): never` helper above the function. Per the project's no-class-inheritance / composition rule, the helper is a sibling function not a base-class method.
+- [x] Step 4: all 4 tests pass; full core suite at 944 tests green.
+- [x] Step 5: commit `5bb84926` landed with `Closes AUDIT-20260601-09` in body.
+
+**Acceptance Criteria:**
+
+- [x] Failing test exists at `packages/core/test/entry/clone-spatial-anchor-exhaustiveness.test.ts` (4 cases — see Step 1).
+- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix) — confirmed via `npm --workspace @deskwork/core test -- clone-spatial-anchor`.
+- [x] Audit-log Status flipped to `fixed-5bb84926` in this docs commit.
+
+
+### Task 1.10 (fix-finding-AUDIT-20260601-10): AUDIT-20260601-10 — Negative tests assert `success === false` without pinning th…
+
+Closes AUDIT-20260601-10. Surface: `packages/core/test/schema/draft-annotation-thread-anchor.test.ts:138-194` (six new `rejects spatialAnchor …` cases).
+
+- [x] Step 1: the "failing test" for this finding is the SAME test file the finding names (the six existing negative cases were too loose). Sanity-checked via a one-off probe that the path-pin behaves correctly: malformed-anchor cases surface ≥1 issue with `spatialAnchor` in the path; a wrong-reason failure (omitting `type` on the base annotation) surfaces 0 spatialAnchor-path issues — which would cause the new helper to throw.
+- [x] Step 2: pre-fix, the six `rejects spatialAnchor ...` cases only asserted `parsed.success === false`. The wrong-reason hypothesis (rename `range` or tighten `text` on `COMMENT_BASE`) would let all six pass while the anchor schema silently regressed to its pre-AUDIT-07 loose shape. The new helper assertion would fail in that scenario; the old tests would not.
+- [x] Step 3: added local `expectSpatialAnchorFailure(parsed)` helper that asserts BOTH `parsed.success === false` AND that ≥1 issue in `parsed.error.issues` has `spatialAnchor` in its `path`. All six `rejects spatialAnchor ...` cases now route through the helper.
+- [x] Step 4: all 24 tests in `draft-annotation-thread-anchor.test.ts` pass; full core suite at 944 tests green.
+- [x] Step 5: commit `b7446c19` landed with `Closes AUDIT-20260601-10` in body.
+
+**Acceptance Criteria:**
+
+- [x] Tightened test exists at `packages/core/test/schema/draft-annotation-thread-anchor.test.ts` (six `rejects spatialAnchor ...` cases now route through `expectSpatialAnchorFailure`).
+- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix) — confirmed via `npm --workspace @deskwork/core test -- draft-annotation-thread-anchor`.
+- [x] Audit-log Status flipped to `fixed-b7446c19` in this docs commit.
+
+
+### Task 1.11 (fix-finding-AUDIT-20260601-11): AUDIT-20260601-11 — AUDIT-20260601-07 remains open in the durable audit log even…
+
+Closes AUDIT-20260601-11. Surface: `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md:4537-4544`; `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:1482-1497`.
+
+- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+- [ ] Step 2: confirm test fails against current code (verify the bug repros)
+- [ ] Step 3: implement the fix
+- [ ] Step 4: confirm test passes
+- [ ] Step 5: commit with `Closes AUDIT-20260601-11` in subject
+
+**Acceptance Criteria:**
+
+- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
+- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
+- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
+
 ### Task 1.7 (fix-finding-AUDIT-20260601-07): AUDIT-20260601-07 — spatialAnchor schema accepts semantically-invalid per-kind combinations
 
 Closes AUDIT-20260601-07 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02 + codex-03; cross-model). Surface: `packages/core/src/schema/draft-annotation.ts:39-46` (`SpatialAnchorSchema`); docstring claims at `review/types.ts:69-72` and `draft-annotation.ts:34-37`.
diff --git a/packages/core/src/doctor/rules/entry-anchor-shape.ts b/packages/core/src/doctor/rules/entry-anchor-shape.ts
new file mode 100644
index 00000000..397fa61d
--- /dev/null
+++ b/packages/core/src/doctor/rules/entry-anchor-shape.ts
@@ -0,0 +1,220 @@
+/**
+ * Rule: entry-anchor-shape.
+ *
+ * AUDIT-20260601-08 — companion rule to the spatialAnchor strict-shape
+ * tightening landed by AUDIT-20260601-07 (`SpatialAnchorSchema` rewritten
+ * as `z.discriminatedUnion('kind', [...])` in
+ * `packages/core/src/schema/draft-annotation.ts`). The tightening sits on
+ * BOTH the write path (`addEntryAnnotation` validates via
+ * `appendJournalEvent` → `JournalEventSchema.safeParse`) AND the read
+ * path (`readJournalEvents` validates the same way). The read-side
+ * validator silently SKIPS events that fail to parse — so any legacy
+ * loose anchors that exist on disk (e.g. `{kind:'pixel'}` with no coords,
+ * or `{kind:'pixel', selector:'#x'}`) disappear from the read stream
+ * without the operator ever knowing the data was there.
+ *
+ * This rule SURFACES those legacy loose anchors. It walks the raw
+ * journal directory directly (`<projectRoot>/.deskwork/review-journal/
+ * history/*.json`), isolates each `entry-annotation` event whose
+ * `annotation.type === 'comment'` AND whose `annotation.spatialAnchor`
+ * field is present, then `safeParse`s the spatialAnchor against the
+ * strict `SpatialAnchorSchema` directly. Each parse failure becomes a
+ * finding — naming the entry UUID, the annotation id, and the offending
+ * shape so the operator can decide whether to delete the legacy
+ * annotation (data loss) or back-fill the missing field manually.
+ *
+ * Practical risk today: LOW per AUDIT-20260601-07's framing — the
+ * anchor fields are referenced in only four files and there is no
+ * writer/renderer yet, so no loose anchors should exist on disk. This
+ * rule will find zero findings on every project until a writer lands.
+ * That is the POINT — the rule is the safety net for when a writer
+ * DOES land later. The append-only journal is permanent storage; once
+ * bad anchors accumulate, the strict cutover becomes a breaking
+ * migration. This rule is the cheap insurance the SKILL.md
+ * naming-reveals-intent guidance asks for.
+ *
+ * Severity: `error`. Legacy loose anchors are data-quality defects that
+ * block the strict-schema contract; operators must repair them.
+ *
+ * Repair: operator-driven, not auto-applied. The choice between
+ * deletion (data loss), back-fill (manual edit of the journal file),
+ * or a future normalizer is an editorial decision the rule cannot make.
+ * `plan()` returns `report-only` with the per-finding guidance in the
+ * reason.
+ *
+ * Sibling-relative imports per the project convention.
+ */
+
+import { readdir, readFile } from 'node:fs/promises';
+import { join, relative } from 'node:path';
+import { SpatialAnchorSchema } from '../../schema/draft-annotation.ts';
+import { isFirstSite } from '../project-scope-gate.ts';
+import type {
+  DoctorContext,
+  DoctorRule,
+  Finding,
+  RepairPlan,
+  RepairResult,
+} from '../types.ts';
+
+const RULE_ID = 'entry-anchor-shape';
+
+/**
+ * Narrowing helper — recognize an entry-annotation comment event with a
+ * present spatialAnchor field, regardless of whether the inner shape is
+ * valid. Returns null when the event does not match.
+ *
+ * The caller has already JSON.parsed the raw file; this helper only
+ * inspects the parsed object's shape without validating against any
+ * schema (so legacy loose anchors are not filtered out).
+ */
+function extractCommentAnchorEvent(json: unknown): {
+  entryId: string;
+  annotationId: string;
+  anchor: unknown;
+} | null {
+  if (typeof json !== 'object' || json === null) return null;
+  const ev = json as Record<string, unknown>;
+  if (ev.kind !== 'entry-annotation') return null;
+  if (typeof ev.entryId !== 'string') return null;
+  const annotation = ev.annotation;
+  if (typeof annotation !== 'object' || annotation === null) return null;
+  const ann = annotation as Record<string, unknown>;
+  if (ann.type !== 'comment') return null;
+  if (!('spatialAnchor' in ann)) return null;
+  if (ann.spatialAnchor === undefined) return null;
+  if (typeof ann.id !== 'string') return null;
+  return {
+    entryId: ev.entryId,
+    annotationId: ann.id,
+    anchor: ann.spatialAnchor,
+  };
+}
+
+const rule: DoctorRule = {
+  id: RULE_ID,
+  label:
+    'Comment annotations with malformed `spatialAnchor` (AUDIT-20260601-08 safety net)',
+
+  async audit(ctx: DoctorContext): Promise<Finding[]> {
+    if (!isFirstSite(ctx)) return [];
+
+    const journalDir = join(
+      ctx.projectRoot,
+      '.deskwork',
+      'review-journal',
+      'history',
+    );
+
+    let names: string[];
+    try {
+      names = await readdir(journalDir);
+    } catch (err) {
+      const error = err as NodeJS.ErrnoException;
+      if (error.code === 'ENOENT') return [];
+      // Directory-level read failure — nothing useful this rule can
+      // say. Leave the report empty.
+      return [];
+    }
+
+    const findings: Finding[] = [];
+    for (const name of names) {
+      if (!name.endsWith('.json')) continue;
+      const filePath = join(journalDir, name);
+      let raw: string;
+      try {
+        raw = await readFile(filePath, 'utf8');
+      } catch {
+        // Per-file read failure is a corruption signal sibling rules
+        // own (schema-rejected etc.). This rule only inspects events
+        // that load successfully.
+        continue;
+      }
+      let json: unknown;
+      try {
+        json = JSON.parse(raw);
+      } catch {
+        continue;
+      }
+      const candidate = extractCommentAnchorEvent(json);
+      if (!candidate) continue;
+      const parsed = SpatialAnchorSchema.safeParse(candidate.anchor);
+      if (parsed.success) continue;
+      const journalPathRelative = relative(ctx.projectRoot, filePath);
+      const shapeJson = serializeShape(candidate.anchor);
+      findings.push({
+        ruleId: RULE_ID,
+        site: ctx.site,
+        severity: 'error',
+        message:
+          `Comment annotation "${candidate.annotationId}" on entry ` +
+          `${candidate.entryId} has a malformed \`spatialAnchor\` ` +
+          `(journal: ${journalPathRelative}). Offending shape: ${shapeJson}. ` +
+          `Repair: operator-driven — delete the legacy annotation (data ` +
+          `loss), back-fill the missing field via a manual edit of the ` +
+          `journal JSON, OR add a normalizer in a follow-up. The ` +
+          `discriminated-union schema landed by AUDIT-20260601-07 ` +
+          `requires per-kind shape: \`pixel\` needs \`{x, y}\`; ` +
+          `\`dom-selector\` and \`svg-element\` each need \`{selector}\`.`,
+        details: {
+          entryId: candidate.entryId,
+          annotationId: candidate.annotationId,
+          journalPath: journalPathRelative,
+          offendingShape: shapeJson,
+        },
+      });
+    }
+    return findings;
+  },
+
+  async plan(_ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
+    // Report-only: the choice between deletion (data loss), manual
+    // back-fill, or a future normalizer is an editorial decision the
+    // rule cannot make for the operator. The `reason` names the three
+    // repair paths so the runner's interactive output gives the
+    // operator a concrete next step.
+    const annotationId = String(finding.details.annotationId ?? '');
+    const journalPath = String(finding.details.journalPath ?? '');
+    return {
+      kind: 'report-only',
+      finding,
+      reason:
+        `Operator-driven repair for annotation ${annotationId} (journal: ` +
+        `${journalPath}). Options: (1) delete the legacy annotation ` +
+        `(data loss), (2) manually back-fill the missing field on the ` +
+        `journal JSON, or (3) add a normalizer in a follow-up. The ` +
+        `strict discriminated-union schema requires \`{x, y}\` for ` +
+        `\`kind:'pixel'\` and \`{selector}\` for \`kind:'dom-selector'\` ` +
+        `or \`kind:'svg-element'\`.`,
+    };
+  },
+
+  async apply(_ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult> {
+    // `plan()` always returns `report-only`; the runner never invokes
+    // `apply()` on a report-only plan. This branch exists only to
+    // satisfy the `DoctorRule` interface contract.
+    return {
+      finding: plan.finding,
+      applied: false,
+      message:
+        'entry-anchor-shape has no auto-repair; operator must decide ' +
+        'between deletion, manual back-fill, or a follow-up normalizer.',
+      skipReason: 'editorial-decision',
+    };
+  },
+};
+
+/**
+ * Render an unknown shape as a compact JSON-ish string for finding
+ * messages. Falls back to `String()` when JSON serialization throws
+ * (e.g. cyclic objects from hand-edited journals).
+ */
+function serializeShape(shape: unknown): string {
+  try {
+    return JSON.stringify(shape);
+  } catch {
+    return String(shape);
+  }
+}
+
+export default rule;
diff --git a/packages/core/src/doctor/runner.ts b/packages/core/src/doctor/runner.ts
index eaa21952..f2a829b2 100644
--- a/packages/core/src/doctor/runner.ts
+++ b/packages/core/src/doctor/runner.ts
@@ -25,6 +25,7 @@ import legacyTopLevelIdMigration from './rules/legacy-top-level-id-migration.ts'
 import legacyStageArtifactPath from './rules/legacy-stage-artifact-path.ts';
 import laneConfigMissingTemplate from './rules/lane-config-missing-template.ts';
 import entryLaneMissing from './rules/entry-lane-missing.ts';
+import entryAnchorShape from './rules/entry-anchor-shape.ts';
 import { loadProjectRules, mergeRules } from './project-rules.ts';
 import type {
   DoctorContext,
@@ -54,6 +55,7 @@ export const RULES: ReadonlyArray<DoctorRule> = [
   legacyStageArtifactPath,
   laneConfigMissingTemplate,
   entryLaneMissing,
+  entryAnchorShape,
   missingFrontmatterId,
   orphanFrontmatterId,
   duplicateId,
diff --git a/packages/core/src/entry/annotations.ts b/packages/core/src/entry/annotations.ts
index b4c4134c..585bd9a0 100644
--- a/packages/core/src/entry/annotations.ts
+++ b/packages/core/src/entry/annotations.ts
@@ -55,6 +55,24 @@ type StoredAnnotation = Extract<JournalEvent, { kind: 'entry-annotation' }>['ann
 type StoredComment = Extract<StoredAnnotation, { type: 'comment' }>;
 type StoredSpatialAnchor = NonNullable<StoredComment['spatialAnchor']>;
 
+/**
+ * Local exhaustiveness guard. If a future `SpatialAnchor` variant is
+ * added to the discriminated union (e.g. `audio-region`,
+ * `video-frame`) but the matching `case` is not added to
+ * `cloneSpatialAnchor` below, the compiler now flags the missing arm at
+ * the `assertNever` call site (parameter `_input` is typed `never`).
+ * Without this guard, the rewritten switch would silently fall through
+ * the switch with no `default` arm, returning `undefined` at runtime —
+ * the lockstep contract between the TS union and the clone path would
+ * be enforced only by convention.
+ *
+ * AUDIT-20260601-09 — companion guard to the AUDIT-20260601-07
+ * discriminated-union refactor.
+ */
+function assertNever(_input: never, context: string): never {
+  throw new Error(`Unhandled discriminated-union variant in ${context}`);
+}
+
 /**
  * Defensive copy for {@link SpatialAnchor} — keeps the in-memory
  * representation independent of the journal-event payload so later
@@ -66,6 +84,11 @@ type StoredSpatialAnchor = NonNullable<StoredComment['spatialAnchor']>;
  * variant. The Zod-inferred {@link StoredSpatialAnchor} shape is also
  * a discriminated union (the schema is a `z.discriminatedUnion`), so
  * the narrow flows symmetrically.
+ *
+ * Per AUDIT-20260601-09, the `default` arm calls `assertNever` so
+ * adding a new {@link SpatialAnchor} variant without updating this
+ * switch is a compile-time error (the parameter narrows to `never`
+ * only when every variant is handled above).
  */
 function cloneSpatialAnchor(input: StoredSpatialAnchor): SpatialAnchor {
   switch (input.kind) {
@@ -75,6 +98,8 @@ function cloneSpatialAnchor(input: StoredSpatialAnchor): SpatialAnchor {
       return { kind: 'dom-selector', selector: input.selector };
     case 'svg-element':
       return { kind: 'svg-element', selector: input.selector };
+    default:
+      return assertNever(input, 'cloneSpatialAnchor');
   }
 }
 
diff --git a/packages/core/src/schema/draft-annotation.ts b/packages/core/src/schema/draft-annotation.ts
index c80c2a95..dfd4fea2 100644
--- a/packages/core/src/schema/draft-annotation.ts
+++ b/packages/core/src/schema/draft-annotation.ts
@@ -83,7 +83,17 @@ const SpatialAnchorSvgElementSchema = z
   })
   .strict();
 
-const SpatialAnchorSchema = z.discriminatedUnion('kind', [
+/**
+ * AUDIT-20260601-08 — exported so the `entry-anchor-shape` doctor rule
+ * (`doctor/rules/entry-anchor-shape.ts`) can validate spatial anchors
+ * on legacy journal events that bypass the full `DraftAnnotationSchema`
+ * read path. The rule reads raw journal JSON, isolates each comment
+ * annotation's `spatialAnchor`, and `safeParse`s against this schema
+ * specifically so it can surface malformed legacy shapes (the strict
+ * `JournalEventSchema.safeParse` in `journal/read.ts` silently SKIPS
+ * such events; the doctor rule needs to SURFACE them).
+ */
+export const SpatialAnchorSchema = z.discriminatedUnion('kind', [
   SpatialAnchorPixelSchema,
   SpatialAnchorDomSelectorSchema,
   SpatialAnchorSvgElementSchema,
diff --git a/packages/core/test/doctor/entry-anchor-shape.test.ts b/packages/core/test/doctor/entry-anchor-shape.test.ts
new file mode 100644
index 00000000..05704357
--- /dev/null
+++ b/packages/core/test/doctor/entry-anchor-shape.test.ts
@@ -0,0 +1,333 @@
+/**
+ * Tests for the `entry-anchor-shape` doctor rule.
+ *
+ * AUDIT-20260601-08 — companion rule to the spatialAnchor strict-shape
+ * tightening landed by AUDIT-20260601-07. Verifies that the rule:
+ *
+ *   1. Emits one `error` finding per comment annotation whose
+ *      `spatialAnchor` field fails the strict
+ *      `SpatialAnchorSchema.safeParse`, naming the entry UUID +
+ *      annotation id + project-relative journal path + offending shape.
+ *   2. Skips events whose spatialAnchor parses successfully under
+ *      the strict schema (negative test).
+ *   3. Emits zero findings on an empty project (no journal dir).
+ *   4. Bypasses the strict `JournalEventSchema.safeParse` read path so
+ *      legacy loose anchors are SURFACED (not silently skipped).
+ *   5. `plan()` returns `report-only` with the three repair paths in
+ *      the reason — confirms there is no auto-repair branch.
+ *
+ * Fixtures live on disk under tmp directories — no filesystem mocking,
+ * per the project's testing rules. Journal files are written as raw
+ * JSON so the rule's "bypass the schema's silent skip" behavior is
+ * exercised end-to-end.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import {
+  mkdirSync,
+  mkdtempSync,
+  rmSync,
+  writeFileSync,
+} from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { runAudit, yesInteraction } from '@/doctor/runner';
+import entryAnchorShape from '@/doctor/rules/entry-anchor-shape';
+import { buildContentIndex } from '@/content-index';
+import { readCalendar } from '@/calendar';
+import { resolveCalendarPath } from '@/paths';
+import type { DeskworkConfig } from '@/config';
+import type { DoctorContext } from '@/doctor/types';
+
+const RULE_ID = 'entry-anchor-shape';
+
+interface Fixture {
+  root: string;
+  config: DeskworkConfig;
+}
+
+function setupFixture(): Fixture {
+  const root = mkdtempSync(join(tmpdir(), 'dw-entry-anchor-shape-'));
+  mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
+  mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
+  mkdirSync(join(root, '.deskwork', 'review-journal', 'history'), {
+    recursive: true,
+  });
+  mkdirSync(join(root, 'docs'), { recursive: true });
+  writeFileSync(
+    join(root, '.deskwork', 'calendar.md'),
+    `# Editorial Calendar\n\n## Drafting\n\n| UUID | Slug | Title | Description | Keywords | Source | Updated |\n|------|------|------|------|------|------|------|\n`,
+    'utf8',
+  );
+  const config: DeskworkConfig = {
+    version: 1,
+    sites: {
+      main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
+    },
+    defaultSite: 'main',
+  };
+  return { root, config };
+}
+
+/**
+ * Write a journal event JSON file directly (no schema validation) so
+ * we can persist a legacy loose anchor the strict
+ * `JournalEventSchema.safeParse` would refuse to write.
+ */
+function writeJournalFile(
+  root: string,
+  fileSlug: string,
+  payload: unknown,
+): void {
+  writeFileSync(
+    join(
+      root,
+      '.deskwork',
+      'review-journal',
+      'history',
+      `${fileSlug}.json`,
+    ),
+    JSON.stringify(payload, null, 2),
+    'utf8',
+  );
+}
+
+function buildCtx(fixture: Fixture): DoctorContext {
+  const calendarPath = resolveCalendarPath(fixture.root, fixture.config, 'main');
+  return {
+    projectRoot: fixture.root,
+    config: fixture.config,
+    site: 'main',
+    calendar: readCalendar(calendarPath),
+    index: buildContentIndex(fixture.root, fixture.config, 'main'),
+    workflows: [],
+    interaction: yesInteraction,
+  };
+}
+
+const ENTRY_UUID = '11111111-1111-4111-8111-111111111111';
+const ANNOTATION_ID_LEGACY = 'cmt_legacy_no_coords';
+const ANNOTATION_ID_VALID = 'cmt_valid_pixel';
+
+function legacyLooseAnchorEvent(
+  annotationId: string,
+  spatialAnchor: unknown,
+): unknown {
+  return {
+    kind: 'entry-annotation',
+    at: '2026-05-31T12:00:00.000Z',
+    entryId: ENTRY_UUID,
+    annotation: {
+      type: 'comment',
+      id: annotationId,
+      workflowId: 'wf_1',
+      createdAt: '2026-05-31T12:00:00.000Z',
+      version: 1,
+      range: { start: 0, end: 4 },
+      text: 'legacy comment',
+      spatialAnchor,
+    },
+  };
+}
+
+describe('doctor: entry-anchor-shape', () => {
+  let fixture: Fixture;
+
+  beforeEach(() => {
+    fixture = setupFixture();
+  });
+
+  afterEach(() => {
+    rmSync(fixture.root, { recursive: true, force: true });
+  });
+
+  it('emits a finding for a comment with a malformed pixel-without-coords spatialAnchor', async () => {
+    writeJournalFile(
+      fixture.root,
+      '2026-05-31T12-00-00-000Z-legacy',
+      legacyLooseAnchorEvent(ANNOTATION_ID_LEGACY, { kind: 'pixel' }),
+    );
+
+    const report = await runAudit(
+      { projectRoot: fixture.root, config: fixture.config },
+      yesInteraction,
+    );
+    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
+    expect(findings).toHaveLength(1);
+
+    const f = findings[0];
+    expect(f.severity).toBe('error');
+    expect(f.details.entryId).toBe(ENTRY_UUID);
+    expect(f.details.annotationId).toBe(ANNOTATION_ID_LEGACY);
+    // Project-relative journal path — never absolute.
+    expect(String(f.details.journalPath).startsWith('/')).toBe(false);
+    expect(String(f.details.journalPath)).toContain(
+      join('.deskwork', 'review-journal', 'history'),
+    );
+    expect(f.details.offendingShape).toBe('{"kind":"pixel"}');
+    expect(f.message).toContain(ANNOTATION_ID_LEGACY);
+    expect(f.message).toContain(ENTRY_UUID);
+    expect(f.message).toContain('pixel');
+  });
+
+  it('emits a finding for a pixel anchor carrying a forbidden selector field', async () => {
+    writeJournalFile(
+      fixture.root,
+      '2026-05-31T12-01-00-000Z-mixed',
+      legacyLooseAnchorEvent('cmt_mixed_shape', {
+        kind: 'pixel',
+        x: 10,
+        y: 20,
+        selector: '#header',
+      }),
+    );
+
+    const ctx = buildCtx(fixture);
+    const findings = await entryAnchorShape.audit(ctx);
+    expect(findings).toHaveLength(1);
+    expect(findings[0].details.annotationId).toBe('cmt_mixed_shape');
+    // The shape preserves the journal's offending JSON for operator
+    // triage; ordering of keys is deterministic via JSON.stringify.
+    expect(findings[0].details.offendingShape).toContain('"selector":"#header"');
+  });
+
+  it('emits a finding for a dom-selector anchor without selector field', async () => {
+    writeJournalFile(
+      fixture.root,
+      '2026-05-31T12-02-00-000Z-no-selector',
+      legacyLooseAnchorEvent('cmt_no_selector', { kind: 'dom-selector' }),
+    );
+
+    const ctx = buildCtx(fixture);
+    const findings = await entryAnchorShape.audit(ctx);
+    expect(findings).toHaveLength(1);
+    expect(findings[0].details.annotationId).toBe('cmt_no_selector');
+  });
+
+  it('emits zero findings when every comment anchor parses cleanly', async () => {
+    writeJournalFile(
+      fixture.root,
+      '2026-05-31T12-03-00-000Z-valid-pixel',
+      legacyLooseAnchorEvent(ANNOTATION_ID_VALID, {
+        kind: 'pixel',
+        x: 100,
+        y: 200,
+      }),
+    );
+    writeJournalFile(
+      fixture.root,
+      '2026-05-31T12-04-00-000Z-valid-dom',
+      legacyLooseAnchorEvent('cmt_valid_dom', {
+        kind: 'dom-selector',
+        selector: '#header > h1',
+      }),
+    );
+
+    const ctx = buildCtx(fixture);
+    const findings = await entryAnchorShape.audit(ctx);
+    expect(findings).toHaveLength(0);
+  });
+
+  it('emits zero findings for comments without a spatialAnchor field', async () => {
+    writeJournalFile(
+      fixture.root,
+      '2026-05-31T12-05-00-000Z-no-anchor',
+      {
+        kind: 'entry-annotation',
+        at: '2026-05-31T12:05:00.000Z',
+        entryId: ENTRY_UUID,
+        annotation: {
+          type: 'comment',
+          id: 'cmt_no_anchor',
+          workflowId: 'wf_1',
+          createdAt: '2026-05-31T12:05:00.000Z',
+          version: 1,
+          range: { start: 0, end: 4 },
+          text: 'plain comment',
+        },
+      },
+    );
+
+    const ctx = buildCtx(fixture);
+    const findings = await entryAnchorShape.audit(ctx);
+    expect(findings).toHaveLength(0);
+  });
+
+  it('emits zero findings on an empty project (no journal history dir)', async () => {
+    rmSync(join(fixture.root, '.deskwork', 'review-journal', 'history'), {
+      recursive: true,
+      force: true,
+    });
+    const ctx = buildCtx(fixture);
+    const findings = await entryAnchorShape.audit(ctx);
+    expect(findings).toHaveLength(0);
+  });
+
+  it('skips non-comment entry-annotation events (e.g. resolve, edit-comment)', async () => {
+    writeJournalFile(
+      fixture.root,
+      '2026-05-31T12-06-00-000Z-resolve',
+      {
+        kind: 'entry-annotation',
+        at: '2026-05-31T12:06:00.000Z',
+        entryId: ENTRY_UUID,
+        annotation: {
+          type: 'resolve',
+          id: 'a_resolve',
+          workflowId: 'wf_1',
+          createdAt: '2026-05-31T12:06:00.000Z',
+          commentId: 'cmt_target',
+          resolved: true,
+        },
+      },
+    );
+
+    const ctx = buildCtx(fixture);
+    const findings = await entryAnchorShape.audit(ctx);
+    expect(findings).toHaveLength(0);
+  });
+
+  it('plan() returns report-only with the three repair paths in the reason', async () => {
+    writeJournalFile(
+      fixture.root,
+      '2026-05-31T12-07-00-000Z-legacy',
+      legacyLooseAnchorEvent(ANNOTATION_ID_LEGACY, { kind: 'pixel' }),
+    );
+
+    const ctx = buildCtx(fixture);
+    const findings = await entryAnchorShape.audit(ctx);
+    expect(findings).toHaveLength(1);
+
+    const plan = await entryAnchorShape.plan(ctx, findings[0]);
+    expect(plan.kind).toBe('report-only');
+    if (plan.kind !== 'report-only') throw new Error('plan must be report-only');
+    expect(plan.reason).toContain('delete');
+    expect(plan.reason).toContain('back-fill');
+    expect(plan.reason).toContain('normalizer');
+  });
+
+  it('surfaces a malformed anchor that the strict JournalEventSchema would silently skip', async () => {
+    // The strict `JournalEventSchema.safeParse` in `journal/read.ts`
+    // rejects this whole event (because `spatialAnchor` fails the
+    // discriminated-union schema) and `readJournalEvents` `continue`s
+    // past it. The doctor rule walks raw JSON, so it MUST see the
+    // event and produce a finding even though the read path drops it.
+    writeJournalFile(
+      fixture.root,
+      '2026-05-31T12-08-00-000Z-bypass',
+      legacyLooseAnchorEvent('cmt_bypassed', {
+        kind: 'svg-element',
+        x: 1,
+        y: 2,
+      }),
+    );
+
+    const ctx = buildCtx(fixture);
+    const findings = await entryAnchorShape.audit(ctx);
+    expect(findings).toHaveLength(1);
+    expect(findings[0].details.annotationId).toBe('cmt_bypassed');
+    expect(findings[0].details.offendingShape).toBe(
+      '{"kind":"svg-element","x":1,"y":2}',
+    );
+  });
+});
diff --git a/packages/core/test/entry/clone-spatial-anchor-exhaustiveness.test.ts b/packages/core/test/entry/clone-spatial-anchor-exhaustiveness.test.ts
new file mode 100644
index 00000000..fefccf14
--- /dev/null
+++ b/packages/core/test/entry/clone-spatial-anchor-exhaustiveness.test.ts
@@ -0,0 +1,156 @@
+/**
+ * AUDIT-20260601-09 — exhaustiveness regression for the
+ * `cloneSpatialAnchor` switch in `packages/core/src/entry/annotations.ts`.
+ *
+ * The switch narrows over `SpatialAnchor`'s `kind` discriminator. With
+ * no `default` arm and no `assertNever` fallback, adding a 4th variant
+ * to the union without updating the switch would silently return
+ * undefined at runtime and emit a TypeScript "Not all code paths
+ * return a value" error — but only if the union has been touched, not
+ * as a structural assertion on the switch itself.
+ *
+ * After AUDIT-20260601-09, the switch carries `default: return
+ * assertNever(input, ...)`. `assertNever`'s parameter is typed `never`,
+ * which forces the compiler to refuse the call site if any variant of
+ * `SpatialAnchor` is unhandled by the cases above. The contract this
+ * test pins is:
+ *
+ *   1. Every existing variant (`pixel` | `dom-selector` | `svg-element`)
+ *      round-trips through the public entry-annotations API (which
+ *      drives `cloneSpatialAnchor` via `toDraftAnnotation` and
+ *      `applyEdits`).
+ *   2. The clone produces fresh objects — defensive copy holds.
+ *   3. Type-level: a synthetic dispatch function whose `default` arm
+ *      hands the narrowed `never` to `assertNever` compiles cleanly,
+ *      meaning the union is fully enumerated.
+ *
+ * The runtime-fallback throw cannot be exercised from public code
+ * paths because `JournalEventSchema.safeParse` rejects bad kinds at
+ * the read boundary (`readJournalEvents` silently `continue`s past
+ * them — AUDIT-20260601-08 is the safety net for the silent skip).
+ * The compile-time guarantee is the load-bearing claim; the round-
+ * trip tests below are the runtime smoke that the switch itself still
+ * fires on every variant.
+ */
+
+import { describe, it, expect } from 'vitest';
+import { mkdtempSync, rmSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import {
+  addEntryAnnotation,
+  listEntryAnnotationsRaw,
+  mintEntryAnnotation,
+} from '@/entry/annotations';
+import type { CommentAnnotation, SpatialAnchor } from '@/review/types';
+
+describe('AUDIT-20260601-09: cloneSpatialAnchor exhaustiveness', () => {
+  it('clones a pixel anchor through the public read path', async () => {
+    const root = mkdtempSync(join(tmpdir(), 'dw-clone-anchor-pixel-'));
+    try {
+      const draft: Omit<CommentAnnotation, 'id' | 'createdAt'> = {
+        type: 'comment',
+        workflowId: 'wf_1',
+        version: 1,
+        range: { start: 0, end: 4 },
+        text: 'pixel comment',
+        spatialAnchor: { kind: 'pixel', x: 42, y: 84 },
+      };
+      const minted = mintEntryAnnotation(draft);
+      await addEntryAnnotation(root, '11111111-1111-4111-8111-111111111111', minted);
+      const raw = await listEntryAnnotationsRaw(root, '11111111-1111-4111-8111-111111111111');
+      expect(raw).toHaveLength(1);
+      const a = raw[0];
+      expect(a.type).toBe('comment');
+      if (a.type !== 'comment') return;
+      expect(a.spatialAnchor).toEqual({ kind: 'pixel', x: 42, y: 84 });
+      // Defensive copy — clone produces a new object reference.
+      expect(a.spatialAnchor).not.toBe(draft.spatialAnchor);
+    } finally {
+      rmSync(root, { recursive: true, force: true });
+    }
+  });
+
+  it('clones a dom-selector anchor through the public read path', async () => {
+    const root = mkdtempSync(join(tmpdir(), 'dw-clone-anchor-dom-'));
+    try {
+      const draft: Omit<CommentAnnotation, 'id' | 'createdAt'> = {
+        type: 'comment',
+        workflowId: 'wf_1',
+        version: 1,
+        range: { start: 0, end: 4 },
+        text: 'dom comment',
+        spatialAnchor: { kind: 'dom-selector', selector: '#header > h1' },
+      };
+      const minted = mintEntryAnnotation(draft);
+      await addEntryAnnotation(root, '22222222-2222-4222-8222-222222222222', minted);
+      const raw = await listEntryAnnotationsRaw(root, '22222222-2222-4222-8222-222222222222');
+      expect(raw).toHaveLength(1);
+      const a = raw[0];
+      if (a.type !== 'comment') return;
+      expect(a.spatialAnchor).toEqual({
+        kind: 'dom-selector',
+        selector: '#header > h1',
+      });
+    } finally {
+      rmSync(root, { recursive: true, force: true });
+    }
+  });
+
+  it('clones an svg-element anchor through the public read path', async () => {
+    const root = mkdtempSync(join(tmpdir(), 'dw-clone-anchor-svg-'));
+    try {
+      const draft: Omit<CommentAnnotation, 'id' | 'createdAt'> = {
+        type: 'comment',
+        workflowId: 'wf_1',
+        version: 1,
+        range: { start: 0, end: 4 },
+        text: 'svg comment',
+        spatialAnchor: {
+          kind: 'svg-element',
+          selector: 'g.layer > rect#logo',
+        },
+      };
+      const minted = mintEntryAnnotation(draft);
+      await addEntryAnnotation(root, '33333333-3333-4333-8333-333333333333', minted);
+      const raw = await listEntryAnnotationsRaw(root, '33333333-3333-4333-8333-333333333333');
+      expect(raw).toHaveLength(1);
+      const a = raw[0];
+      if (a.type !== 'comment') return;
+      expect(a.spatialAnchor).toEqual({
+        kind: 'svg-element',
+        selector: 'g.layer > rect#logo',
+      });
+    } finally {
+      rmSync(root, { recursive: true, force: true });
+    }
+  });
+
+  it('SpatialAnchor union is structurally exhausted by three kinds', () => {
+    // This test is the compile-time exhaustiveness lock. The local
+    // `dispatch` function narrows `SpatialAnchor` over `kind`. If a
+    // new variant lands on the union but no matching `case` is added
+    // here, the `default` branch's call to a `never`-typed assertion
+    // becomes a compile error at the call site — exactly the same
+    // mechanism that protects `cloneSpatialAnchor` in
+    // `src/entry/annotations.ts`.
+    function assertNever(_input: never): never {
+      throw new Error('Unhandled SpatialAnchor variant');
+    }
+    function dispatch(anchor: SpatialAnchor): string {
+      switch (anchor.kind) {
+        case 'pixel':
+          return `pixel ${anchor.x},${anchor.y}`;
+        case 'dom-selector':
+          return `dom ${anchor.selector}`;
+        case 'svg-element':
+          return `svg ${anchor.selector}`;
+        default:
+          return assertNever(anchor);
+      }
+    }
+    expect(dispatch({ kind: 'pixel', x: 1, y: 2 })).toBe('pixel 1,2');
+    expect(dispatch({ kind: 'dom-selector', selector: '#x' })).toBe('dom #x');
+    expect(dispatch({ kind: 'svg-element', selector: 'g.y' })).toBe('svg g.y');
+  });
+});
diff --git a/packages/core/test/schema/draft-annotation-thread-anchor.test.ts b/packages/core/test/schema/draft-annotation-thread-anchor.test.ts
index 52285eea..ddf6242e 100644
--- a/packages/core/test/schema/draft-annotation-thread-anchor.test.ts
+++ b/packages/core/test/schema/draft-annotation-thread-anchor.test.ts
@@ -134,6 +134,30 @@ describe('CommentAnnotation schema — Phase 8 Step 8.1.1 additive fields', () =
   // refactor makes each variant declare only the fields its kind needs.
   // Annotations land in the append-only journal where bad data is
   // permanent, so the schema is the only enforcement point.
+  //
+  // AUDIT-20260601-10 — every negative case asserts BOTH that parsing
+  // failed AND that the failure path includes `spatialAnchor`. The
+  // path-based pin makes the test resilient: if `COMMENT_BASE` itself
+  // ever becomes invalid for an unrelated reason (renamed `range`,
+  // tightened `text`), these tests would still pass against a
+  // SpatialAnchor schema that no longer enforces shape — and the
+  // bug-factory pattern AUDIT-20260601-07 named would silently return.
+  // The `expectSpatialAnchorFailure` helper does both checks.
+
+  function expectSpatialAnchorFailure(
+    parsed: ReturnType<typeof DraftAnnotationSchema.safeParse>,
+  ): void {
+    expect(parsed.success).toBe(false);
+    if (parsed.success) return;
+    const anchorIssues = parsed.error.issues.filter((i) =>
+      i.path.includes('spatialAnchor'),
+    );
+    // At least one of the surfaced issues must name `spatialAnchor` in
+    // its path — without this, `parsed.success === false` could be true
+    // for a totally unrelated reason (a base-field violation) and the
+    // test would pass for the wrong reason.
+    expect(anchorIssues.length).toBeGreaterThan(0);
+  }
 
   it('rejects spatialAnchor kind "pixel" without coordinates', () => {
     const input = {
@@ -141,7 +165,7 @@ describe('CommentAnnotation schema — Phase 8 Step 8.1.1 additive fields', () =
       spatialAnchor: { kind: 'pixel' },
     };
     const parsed = DraftAnnotationSchema.safeParse(input);
-    expect(parsed.success).toBe(false);
+    expectSpatialAnchorFailure(parsed);
   });
 
   it('rejects spatialAnchor kind "dom-selector" without selector', () => {
@@ -150,7 +174,7 @@ describe('CommentAnnotation schema — Phase 8 Step 8.1.1 additive fields', () =
       spatialAnchor: { kind: 'dom-selector' },
     };
     const parsed = DraftAnnotationSchema.safeParse(input);
-    expect(parsed.success).toBe(false);
+    expectSpatialAnchorFailure(parsed);
   });
 
   it('rejects spatialAnchor kind "svg-element" without selector', () => {
@@ -159,7 +183,7 @@ describe('CommentAnnotation schema — Phase 8 Step 8.1.1 additive fields', () =
       spatialAnchor: { kind: 'svg-element' },
     };
     const parsed = DraftAnnotationSchema.safeParse(input);
-    expect(parsed.success).toBe(false);
+    expectSpatialAnchorFailure(parsed);
   });
 
   it('rejects spatialAnchor kind "pixel" carrying a selector field', () => {
@@ -168,7 +192,7 @@ describe('CommentAnnotation schema — Phase 8 Step 8.1.1 additive fields', () =
       spatialAnchor: { kind: 'pixel', x: 10, y: 20, selector: '#header' },
     };
     const parsed = DraftAnnotationSchema.safeParse(input);
-    expect(parsed.success).toBe(false);
+    expectSpatialAnchorFailure(parsed);
   });
 
   it('rejects spatialAnchor kind "svg-element" carrying x/y fields', () => {
@@ -177,7 +201,7 @@ describe('CommentAnnotation schema — Phase 8 Step 8.1.1 additive fields', () =
       spatialAnchor: { kind: 'svg-element', selector: '#shape', x: 1, y: 2 },
     };
     const parsed = DraftAnnotationSchema.safeParse(input);
-    expect(parsed.success).toBe(false);
+    expectSpatialAnchorFailure(parsed);
   });
 
   it('rejects spatialAnchor kind "dom-selector" carrying x/y fields', () => {
@@ -186,7 +210,7 @@ describe('CommentAnnotation schema — Phase 8 Step 8.1.1 additive fields', () =
       spatialAnchor: { kind: 'dom-selector', selector: '#header', x: 1, y: 2 },
     };
     const parsed = DraftAnnotationSchema.safeParse(input);
-    expect(parsed.success).toBe(false);
+    expectSpatialAnchorFailure(parsed);
   });
 
   it('parses a comment with all three new fields set together', () => {


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
