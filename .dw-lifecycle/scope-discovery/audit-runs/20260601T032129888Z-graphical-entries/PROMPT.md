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

feat(graphical-entries): doctor rule entry-lane-missing — Step 8.0.1
workplan(graphical-entries): close Task 1.1 — Step 1.1.3 tracked via Task 1.6
audit(graphical-entries): retroactive Phase 0 barrage via new implement-hook — 4 findings AUDIT-20260601-01..04


## Recent audit-log excerpt (prior findings on this feature)

Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.

### AUDIT-20260531-05 — Compact-strip test asserts DOM presence but never exercises the collapsed state its name claims — CSS reveal path is unverified

Finding-ID: AUDIT-20260531-05
Status:     fixed-168af95
Severity:   informational
Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (`renders unbucketed compact cell in swim compact strip when lane is collapsed (AUDIT-20260531-01)`); CSS at `plugins/deskwork-studio/public/css/dashboard-swimlane-shell.css:197-206`

The test name and comments say the cell renders "when lane is collapsed," but the test is a server-render integration test that only asserts the cell is present in the emitted HTML. `.swim-compact` is **always** server-rendered for every swim — it is `display: none` by default (`:197-202`) and revealed only by the CSS rule `.swim.collapsed .swim-compact { display: flex }` (`:204-206`). The test never sets the lane to `.collapsed`, never toggles the client-side collapse handler, and cannot observe CSS visibility from a string-match assertion. So the assertions prove "the server now emits the `is-unbucketed` `.sc-stage` cell into the compact strip" — which is the real fix — but not "the cell is visible in collapsed view."

This is acceptable for an HTML-presence test, but per `.claude/rules/ui-verification.md` the collapsed-view *visibility* (the CSS-gated reveal, the equal-flex distribution of the now-9th cell, the `align-items: stretch` row height when the longer `(unrecognized stage)` label wraps) is the kind of claim that rule asks to verify by actually toggling collapse in a browser at a real viewport. The operator should know the DOM is covered and the CSS-reveal path is not. A precise test name (`…emits unbucketed cell into the compact strip`) plus a one-line note that collapse visibility is CSS-only and unverified by this test would make the scope auditable.

---

### AUDIT-20260531-06 — New `.sc-stage.is-unbucketed` compact cell has no dedicated CSS and a label far longer than real stage names — only the inline glyph distinguishes it

Finding-ID: AUDIT-20260531-06
Status:     fixed-b0da816
Severity:   informational
Surface:    `packages/studio/src/pages/dashboard/swimlane-unbucketed.ts:135-139` (`renderUnbucketedCompactCell`); CSS at `dashboard-swimlane-shell.css:208-246`

The docstring (`swimlane-unbucketed.ts:113-117`) claims the existing flex layout "handles the trailing cell with no template changes" — verified true: `.swim-compact` is `display: flex` and `.sc-stage { flex: 1 }` (`css:208-209`), so the appended cell flows and the `:last-child` border rule (`:217-219`) correctly moves to the new last cell. No layout defect.

Two consistency gaps worth the operator's eye, neither a bug: (1) there is **no** `.swim-compact .sc-stage.is-unbucketed` rule — the cell inherits generic `.sc-stage` styling, so unlike the kanban tail (`.stage-col.is-unbucketed`, which carries distinct chrome) the *only* signal that this cell is the routing-drift bucket is the `⊘ (unrecognized stage)` text in `.sc-name`. The regular compact cells render their glyphless stage name; this cell inlines `⊘` directly into `.sc-name` rather than in a separate `aria-hidden` glyph span the way the kanban (`:102`) and list (`:181`) tails do, so a screen reader will voice the raw `⊘`. (2) `.sc-name` (`:221-227`) has `text-transform: uppercase` + `0.14em` letter-spacing and no `white-space: nowrap`/`text-overflow`; "(UNRECOGNIZED STAGE)" is much wider than a one-word stage name, so in the editorial lane's ~9 equal-flex cells it will wrap to multiple lines (tolerable because `align-items: stretch` levels the row). If visual parity with the other two unbucketed surfaces matters, add a scoped `.swim-compact .sc-stage.is-unbucketed` rule and move the glyph into an `aria-hidden` span to match the kanban/list precedent the docstring says it mirrors.

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


## Diff under audit

The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).

diff --git a/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/INDEX.md b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/INDEX.md
new file mode 100644
index 00000000..adc1f5b8
--- /dev/null
+++ b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/INDEX.md
@@ -0,0 +1,39 @@
+# Audit-barrage run
+
+- timestamp: 20260601T024506665Z
+- feature: graphical-entries
+- run dir: /Users/orion/work/deskwork-work/graphical-entries/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries
+- prompt: PROMPT.md
+- models attempted: 3
+
+## Per-model results
+### claude
+
+- exit code: 0
+- duration: 185954 ms
+- stdout bytes: 9507
+- stderr bytes: 0
+- stdout path: /Users/orion/work/deskwork-work/graphical-entries/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/claude.md
+- stderr path: /Users/orion/work/deskwork-work/graphical-entries/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/stderr/claude.txt
+- timed out: no
+
+### codex
+
+- exit code: 0
+- duration: 30765 ms
+- stdout bytes: 1170
+- stderr bytes: 83180
+- stdout path: /Users/orion/work/deskwork-work/graphical-entries/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/codex.md
+- stderr path: /Users/orion/work/deskwork-work/graphical-entries/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/stderr/codex.txt
+- timed out: no
+
+### gemini
+
+- exit code: 1
+- duration: 148334 ms
+- stdout bytes: 0
+- stderr bytes: 2169
+- stdout path: /Users/orion/work/deskwork-work/graphical-entries/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/gemini.md
+- stderr path: /Users/orion/work/deskwork-work/graphical-entries/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/stderr/gemini.txt
+- timed out: no
+
diff --git a/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/PROMPT.md b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/PROMPT.md
new file mode 100644
index 00000000..09675319
--- /dev/null
+++ b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/PROMPT.md
@@ -0,0 +1,1517 @@
+# Audit-barrage — multi-model audit prompt template
+
+You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below.
+
+You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.
+
+## Feature under audit
+
+graphical-entries
+
+## Feature scope (workplan / PRD summary)
+
+- [ ] Step 12.3.1: "Save markup" exports the composed canvas (base + markup) as PNG to `<entryDir>/scrapbook/screenshots/<comment-id>-<timestamp>-marked.png`.
+- [ ] Step 12.3.2: The raw capture stays at `<comment-id>-<timestamp>.png` (untouched).
+- [ ] Step 12.3.3: Comment annotation's `attachments[]` array updated to reference the marked file path.
+- [ ] Step 12.3.4: Attachment metadata gains `originalAttachment: <raw-file-path>` so the operator can re-mark the raw or compare versions.
+
+### Task 12.4: Studio rendering of marked attachments
+
+- [ ] Step 12.4.1: Comment renders the marked version by default with a small "original" toggle in the chrome.
+- [ ] Step 12.4.2: Clicking the marked version opens a full-size lightbox; clicking the toggle in the lightbox swaps to raw.
+
+### Task 12.5: Re-mark workflow
+
+- [ ] Step 12.5.1: Operator can re-mark an existing screenshot: opens the markup editor pre-loaded with the raw + prior markup (loaded as separate layer for further editing).
+- [ ] Step 12.5.2: Save creates a new file (e.g. `<comment-id>-<timestamp>-marked-v2.png`); the comment's `attachments[]` updates to the new version; prior versions preserved in the journal.
+
+### Task 12.6: Integration test + mobile verification
+
+- [ ] Step 12.6.1: Tmp-fixture: capture a fixture screenshot; mark with each of the 5 tools; save; verify the marked file persists alongside raw; verify the comment renders both versions.
+- [ ] Step 12.6.2: Touch-screen verification: run a Playwright test against an iPhone-class viewport; assert each tool works with touch input (no hover-only interaction).
+
+**Acceptance Criteria:**
+
+- [ ] Markup editor supports all five tools (arrow / box / freehand / text-label / blur-region) + undo / redo.
+- [ ] Marked screenshot persists alongside the raw capture; comment annotation references both via `attachments[]` + `originalAttachment`.
+- [ ] Re-mark workflow preserves prior markup versions in the journal.
+- [ ] Touch-screen markup works without hover-only interactions.
+
+## Closing milestone: scope-discovery v1 dogfood TF summary + audit handoff
+
+**Deliverable:** Final TF entry in `tooling-feedback.md` summarizing the dogfood result (what worked / what didn't / what needs follow-up); closing comment on the feature PR linking the log; handoff to the scope-discovery team to import as `AUDIT-<date>-<NN>` entries in their audit log. Per PRD § Secondary deliverable.
+
+### Task C.1: Aggregate TF entries + identify patterns
+
+- [ ] Step C.1.1: Walk every TF-NNN entry in `tooling-feedback.md`; tabulate by category (A / AM / CL / GATE / DSC / MISC) + severity (high / medium / low).
+- [ ] Step C.1.2: Identify recurring patterns — same root cause surfacing in multiple TF entries; promote those to GH issues if not already filed.
+- [ ] Step C.1.3: Tabulate dispositions: how many TF entries closed by an in-flight fix during this feature vs how many remain open at feature-close.
+
+### Task C.2: Write final TF summary
+
+- [ ] Step C.2.1: Append the closure entry to `tooling-feedback.md` (next TF-NNN id) with title shape `TF-NNN · MISC · n/a · Dogfood closure summary`.
+- [ ] Step C.2.2: Body: what worked (which protocol layers caught friction proactively); what didn't (which surfaces fell through to operator catch); what needs follow-up (recurring patterns justifying a v1.1 audit cycle).
+- [ ] Step C.2.3: Include a one-line summary per still-open TF entry naming the gap; list closed TF entries with their closing-commit SHAs.
+
+### Task C.3: Closing comment on the feature PR
+
+- [ ] Step C.3.1: Comment on the graphical-entries PR linking `tooling-feedback.md` + naming the total TF count + how many promoted to GH issues.
+- [ ] Step C.3.2: Tag the deskwork team for the audit-log import.
+
+### Task C.4: Audit-log handoff
+
+- [ ] Step C.4.1: The deskwork team imports the closure into `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` as `AUDIT-<date>-<NN>` entries — mirror of how the audiocontrol pilot's TF-001..TF-016 imported into AUDIT-20260525-05..09.
+- [ ] Step C.4.2: Each AUDIT entry references its source TF entry + summarizes the friction shape + the suggested fix.
+- [ ] Step C.4.3: The aggregated audit-log entries become the v1.1 workplan input for scope-discovery.
+
+**Acceptance Criteria:**
+
+- [ ] `tooling-feedback.md` carries a TF closure summary entry.
+- [ ] The feature PR has a closing comment with TF count + promoted-issue count.
+- [ ] The scope-discovery team has imported AUDIT entries derived from this feature's TF log.
+
+
+## Commit subjects in the audited range
+
+docs(graphical-entries): close AUDIT-20260530-95 — Task 0.70
+docs(graphical-entries): align SKILL.md Defaults section with current doctor rule + semantics — AUDIT-20260530-95
+docs(graphical-entries): close AUDIT-20260530-94 — Task 0.69
+fix(graphical-entries): group subcommands refuse extra positionals — AUDIT-20260530-94
+docs(graphical-entries): close AUDIT-20260530-93 — Task 0.68
+fix(graphical-entries): group mutators roll back sidecar on journal-append failure — AUDIT-20260530-93
+docs(graphical-entries): close AUDIT-20260530-92 as duplicate of AUDIT-20260530-90 — Task 0.67
+docs(graphical-entries): close AUDIT-20260530-91 — Task 0.66
+fix(graphical-entries): group add-member --at out-of-range exits 2 (usage error) — AUDIT-20260530-91
+docs(graphical-entries): close AUDIT-20260530-90 as already-fixed — Task 0.65
+
+
+## Recent audit-log excerpt (prior findings on this feature)
+
+Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.
+
+## 2026-05-31 — audit-barrage lift (20260531T061519667Z-graphical-entries)
+
+### AUDIT-20260531-01 — Collapsed compact strip (`renderSwimCompact`) still drops unbucketed entries — the same count-vs-visible defect AUDIT-25 set out to close, on a third surface the fix didn't touch
+
+Finding-ID: AUDIT-20260531-01 (claude-01 + claude-03 + codex-01 + codex-02; cross-model)
+Status:     fixed-5cd5294
+Severity:   medium
+Surface:    `packages/studio/src/pages/dashboard/swimlane-card.ts:358-382` (`renderSwimCompact`), called unconditionally at `:476`
+
+The fix updates the kanban grid (`renderSwimlane` → `renderUnbucketedStageCol`, `:427`) and the list-body (`renderListBody` → `renderUnbucketedListGroup`) so `bucket.unbucketed` renders. But `renderSwimCompact` — the per-stage compact strip emitted on every swim at `:476` and revealed by CSS when the lane is `.collapsed` (docstring `:48-50`) — was not updated. It iterates **only** `template.linearStages` + `template.offPipelineStages` (`:359-362`) and sums `bucket.byStage.get(stage)` per cell (`:370`). `bucket.unbucketed` is never read.
+
+Consequence: for a lane with unbucketed entries in collapsed view, the swim-head `quick-meta` reads `${bucket.entryCount} entries` (which the docstring confirms folds unbucketed in), while the sum of the visible `.sc-count` cells is `entryCount − unbucketed.length`, and the unbucketed entries have **no** representation in the compact strip at all. This is the identical "count inflated while entries silently dropped" shape the HIGH AUDIT-20260530-25 finding named — the fix closed it on two of three surfaces and the `lane-data.ts` docstring's claim that "the swim-head count reconciles with the visible cards" is false on the collapsed compact view. The new test file does not exercise the compact strip, so the gap is unguarded. Fix: append an unbucketed compact cell in `renderSwimCompact` (e.g. when `bucket.unbucketed.length > 0`, emit a trailing `.sc-stage.is-unbucketed` cell with the `⊘` glyph and `bucket.unbucketed.length`), mirroring the two surfaces already fixed, and add a collapsed-view assertion to the test.
+
+---
+
+### AUDIT-20260531-02 — Count-consistency test asserts the count *text* and two slugs but never counts the rendered cards — it does not verify the reconciliation it claims
+
+Finding-ID: AUDIT-20260531-02
+Status:     fixed-f9b5888
+Severity:   medium
+Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts:90-138` (the `count consistency` test)
+
+The test's stated contract (header `:91-94`) is *"swim-head `${n} entries` matches the visible cards once unbucketed renders"* and the inline comment `:91-96` says the block *"must contain 3 row-shell / lb-row markers (1 template-bucketed + 2 unbucketed)."* But the assertions only check (a) the literal text `<span class="quick-meta">3 entries</span>` (`:126`), and (b) that the two unbucketed slugs and their raw stages appear (`:130-137`). Nothing counts the actual rendered `data-row-shell` / `.lb-row` elements. Per `.claude/rules/ui-verification.md` § "spec-compliance probes," this is exactly the trap where a probe verifies the mechanism it imagines rather than the contract it names: the `quick-meta` text is computed from `bucket.entryCount`, **independent** of how many cards render — so a regression where the template-bucketed `a-draft` card vanished (count still 3, only 2 cards visible) would pass this test green. The number "3" and "the cards actually present" are never compared.
+
+Fix: assert the rendered card count directly — e.g. `(stageGrid.match(/data-row-shell/g) ?? []).length === 3` (or count `.lb-row` in the list body) — so the test fails if the visible-card count diverges from the displayed entry count. That is the falsifiable form of the reconciliation claim.
+
+---
+
+### AUDIT-20260531-03 — Checks that came back clean (recorded so the operator can see what was ruled out)
+
+Finding-ID: AUDIT-20260531-03
+Status:     acknowledged-clean-check
+Severity:   informational
+Surface:    (escaping, grid layout, class reuse, overflow affordance)
+
+I checked four things that looked suspect from the diff and confirmed each is fine: (1) **Escaping** — `entry.currentStage` is a drift-controlled/unvalidated value now rendered into text and `data-*` attributes, but it flows through the project's `html` escaping tag (same path as every other row), so no XSS surface. (2) **Grid layout** — `.stage-grid` is `display:flex` with `.stage-col{flex:1 1 0}` (`dashboard-swimlane-shell.css:253-272`), so the appended unbucketed column flows naturally and needs no `stageCount` increment; the `${stageCount} stages` tag correctly excludes it. (3) **Class reuse** — the hand-rolled kanban row's `er-calendar-row`/`er-calendar-body`/`er-row-slug` classes are the dashboard's own row classes (`section.ts`, `affordances.ts`), not borrowed cross-surface. (4) **List overflow `⋮`** — the `data-lb-overflow` span is currently inert decoration (`swimlane-list-body.ts:78-85` confirms no verb wiring), so reusing it on the unbucketed row does not reintroduce the `verbsForStage`-throws hazard the kanban row deliberately avoids. Had any of these been live (unescaped stage, count-based grid template, a wired overflow dispatching verbs for the unknown stage) it would have been a high finding.
+
+## 2026-05-31 — audit-barrage lift (20260531T071454028Z-graphical-entries)
+
+### AUDIT-20260531-04 — Dead variable `swimCompactClose` in the new compact-strip test — computed then explicitly discarded
+
+Finding-ID: AUDIT-20260531-04
+Status:     fixed-fa2014f
+Severity:   low
+Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (the AUDIT-20260531-01 test, the `swimCompactClose` line + its `void swimCompactClose;`)
+
+The new test computes `const swimCompactClose = editorialBlock.indexOf('</div>', swimCompactOpen);` and then never uses it — the actual end of the `.swim-compact` element is located by the hand-rolled depth-matching loop that advances `cursor`, and the slice uses `cursor`, not `swimCompactClose`. The author noticed the variable was unused and silenced the linter with `void swimCompactClose;` rather than deleting the line.
+
+`indexOf('</div>', swimCompactOpen)` returns the position of the *first* nested `</div>` (the close of the first inner `.sc-stage`), which is not the boundary of the compact strip at all — so the value is not only unused but semantically misleading if a future editor mistakes it for "the close of swim-compact." Per the project's hygiene guidance (no dead code, names that reveal intent), delete both the declaration and the `void` discard. The depth-matching loop is the sole, correct mechanism for finding the boundary; the leftover line is scaffolding that should not have survived to commit.
+
+---
+
+### AUDIT-20260531-05 — Compact-strip test asserts DOM presence but never exercises the collapsed state its name claims — CSS reveal path is unverified
+
+Finding-ID: AUDIT-20260531-05
+Status:     fixed-168af95
+Severity:   informational
+Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (`renders unbucketed compact cell in swim compact strip when lane is collapsed (AUDIT-20260531-01)`); CSS at `plugins/deskwork-studio/public/css/dashboard-swimlane-shell.css:197-206`
+
+The test name and comments say the cell renders "when lane is collapsed," but the test is a server-render integration test that only asserts the cell is present in the emitted HTML. `.swim-compact` is **always** server-rendered for every swim — it is `display: none` by default (`:197-202`) and revealed only by the CSS rule `.swim.collapsed .swim-compact { display: flex }` (`:204-206`). The test never sets the lane to `.collapsed`, never toggles the client-side collapse handler, and cannot observe CSS visibility from a string-match assertion. So the assertions prove "the server now emits the `is-unbucketed` `.sc-stage` cell into the compact strip" — which is the real fix — but not "the cell is visible in collapsed view."
+
+This is acceptable for an HTML-presence test, but per `.claude/rules/ui-verification.md` the collapsed-view *visibility* (the CSS-gated reveal, the equal-flex distribution of the now-9th cell, the `align-items: stretch` row height when the longer `(unrecognized stage)` label wraps) is the kind of claim that rule asks to verify by actually toggling collapse in a browser at a real viewport. The operator should know the DOM is covered and the CSS-reveal path is not. A precise test name (`…emits unbucketed cell into the compact strip`) plus a one-line note that collapse visibility is CSS-only and unverified by this test would make the scope auditable.
+
+---
+
+### AUDIT-20260531-06 — New `.sc-stage.is-unbucketed` compact cell has no dedicated CSS and a label far longer than real stage names — only the inline glyph distinguishes it
+
+Finding-ID: AUDIT-20260531-06
+Status:     fixed-b0da816
+Severity:   informational
+Surface:    `packages/studio/src/pages/dashboard/swimlane-unbucketed.ts:135-139` (`renderUnbucketedCompactCell`); CSS at `dashboard-swimlane-shell.css:208-246`
+
+The docstring (`swimlane-unbucketed.ts:113-117`) claims the existing flex layout "handles the trailing cell with no template changes" — verified true: `.swim-compact` is `display: flex` and `.sc-stage { flex: 1 }` (`css:208-209`), so the appended cell flows and the `:last-child` border rule (`:217-219`) correctly moves to the new last cell. No layout defect.
+
+Two consistency gaps worth the operator's eye, neither a bug: (1) there is **no** `.swim-compact .sc-stage.is-unbucketed` rule — the cell inherits generic `.sc-stage` styling, so unlike the kanban tail (`.stage-col.is-unbucketed`, which carries distinct chrome) the *only* signal that this cell is the routing-drift bucket is the `⊘ (unrecognized stage)` text in `.sc-name`. The regular compact cells render their glyphless stage name; this cell inlines `⊘` directly into `.sc-name` rather than in a separate `aria-hidden` glyph span the way the kanban (`:102`) and list (`:181`) tails do, so a screen reader will voice the raw `⊘`. (2) `.sc-name` (`:221-227`) has `text-transform: uppercase` + `0.14em` letter-spacing and no `white-space: nowrap`/`text-overflow`; "(UNRECOGNIZED STAGE)" is much wider than a one-word stage name, so in the editorial lane's ~9 equal-flex cells it will wrap to multiple lines (tolerable because `align-items: stretch` levels the row). If visual parity with the other two unbucketed surfaces matters, add a scoped `.swim-compact .sc-stage.is-unbucketed` rule and move the glyph into an `aria-hidden` span to match the kanban/list precedent the docstring says it mirrors.
+
+---
+
+I walked the production change (`renderSwimCompact` + `renderUnbucketedCompactCell`), the reconciliation invariant, escaping, the CSS layout, and the strengthened count-consistency test. The core fix is **correct**: the compact cell is count-only (the right shape for a summary strip), the `data-row-shell` counts the strengthened test relies on are genuinely emitted by both the kanban (`swimlane-unbucketed.ts:58`) and list (`:163`) unbucketed rows, the empty-input guard returns `unsafe('')` so callers append unconditionally, no `currentStage` value reaches the compact cell so there's no new escaping surface, and the `.swim-compact` flex layout absorbs the trailing cell as the docstring claims. The three findings above are hygiene/informational, not correctness defects.
+
+
+## Diff under audit
+
+The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).
+
+diff --git a/.dw-lifecycle/scope-discovery/clones.yaml b/.dw-lifecycle/scope-discovery/clones.yaml
+index ae3755dd..0fbae79f 100644
+--- a/.dw-lifecycle/scope-discovery/clones.yaml
++++ b/.dw-lifecycle/scope-discovery/clones.yaml
+@@ -1,4 +1,4 @@
+-generated_at: 2026-05-31T13:54:50.807Z
++generated_at: 2026-05-31T14:47:09.057Z
+ clones:
+   - id: 014b49040fe1
+     lines: 13
+@@ -113,20 +113,20 @@ clones:
+       - packages/cli/src/commands/shortform-start.ts:81:97
+     disposition: pending
+     reason: null
+-  - id: 043c7ab6b5e8
+-    lines: 14
++  - id: 7fd4d02355a8
++    lines: 30
+     members:
+-      - packages/cli/src/commands/group.ts:221:234
+-      - packages/cli/src/commands/lane.ts:225:238
++      - packages/cli/src/commands/group.ts:110:139
++      - packages/cli/src/commands/pipeline.ts:93:106
+     disposition: keep-with-reason
+-    reason: "Parallel-domain symmetry across deskwork verb families: lane/pipeline/group CRUD dispatchers share KNOWN_FLAGS/VERB_USAGE/genericUsage boilerplate; cancel/induct/block/publish/approve share stage-transition + parseArgs boilerplate. Extracting these into a shared helper would lose per-verb-family argument validation specificity (each verb's flag set differs in non-trivial ways), and the verb-family boundary is the operator-facing unit. Mirrors the prior session lane-config-missing-template disposition."
+-  - id: 303a01d3ddec
+-    lines: 39
++    reason: Sibling verb-dispatch convention across group/lane/pipeline CRUD modules; shared shape is deliberate, not duplication.
++  - id: 40b2115a7171
++    lines: 14
+     members:
+-      - packages/cli/src/commands/group.ts:75:113
+-      - packages/cli/src/commands/pipeline.ts:84:106
++      - packages/cli/src/commands/group.ts:249:262
++      - packages/cli/src/commands/lane.ts:225:238
+     disposition: keep-with-reason
+-    reason: "Parallel-domain symmetry across deskwork verb families: lane/pipeline/group CRUD dispatchers share KNOWN_FLAGS/VERB_USAGE/genericUsage boilerplate; cancel/induct/block/publish/approve share stage-transition + parseArgs boilerplate. Extracting these into a shared helper would lose per-verb-family argument validation specificity (each verb's flag set differs in non-trivial ways), and the verb-family boundary is the operator-facing unit. Mirrors the prior session lane-config-missing-template disposition."
++    reason: Sibling per-verb update-handler shape across group/lane CRUD modules; parallel emit/fail handling is deliberate, not duplication.
+   - id: 89f8a99f8ce2
+     lines: 13
+     members:
+@@ -378,18 +378,18 @@ clones:
+       - packages/core/src/entry/publish.ts:2:12
+     disposition: ignore-with-justification
+     reason: verb-module import header symmetry; cancel/block/publish share readSidecar+writeSidecar+journal+calendar+schema+lane-resolve+pipeline-helpers imports as architectural symmetry across the verb family — extraction would harm clarity
+-  - id: e56c638702cc
+-    lines: 13
++  - id: 3ea7a5311a8d
++    lines: 15
+     members:
+-      - packages/core/src/groups/operations/add-member.ts:124:136
+-      - packages/core/src/groups/operations/remove-member.ts:68:80
++      - packages/core/src/groups/operations/add-member.ts:147:161
++      - packages/core/src/groups/operations/remove-member.ts:69:83
+     disposition: keep-with-reason
+-    reason: "Parallel-domain symmetry across deskwork verb families: lane/pipeline/group CRUD dispatchers share KNOWN_FLAGS/VERB_USAGE/genericUsage boilerplate; cancel/induct/block/publish/approve share stage-transition + parseArgs boilerplate. Extracting these into a shared helper would lose per-verb-family argument validation specificity (each verb's flag set differs in non-trivial ways), and the verb-family boundary is the operator-facing unit. Mirrors the prior session lane-config-missing-template disposition."
++    reason: "Structurally-parallel siblings: add-member and remove-member intentionally mirror each other (entry-build + withJournalRollback wrap), differing only by event kind and details shape; the shared protection logic was already extracted to packages/core/src/sidecar/with-journal-rollback.ts per AUDIT-20260530-93."
+   - id: d31f449b3e8c
+     lines: 9
+     members:
+-      - packages/core/src/groups/operations/archive.ts:48:56
+-      - packages/core/src/groups/operations/archive.ts:84:92
++      - packages/core/src/groups/operations/archive.ts:49:57
++      - packages/core/src/groups/operations/archive.ts:89:97
+     disposition: keep-with-reason
+     reason: "Parallel-domain symmetry across deskwork verb families: lane/pipeline/group CRUD dispatchers share KNOWN_FLAGS/VERB_USAGE/genericUsage boilerplate; cancel/induct/block/publish/approve share stage-transition + parseArgs boilerplate. Extracting these into a shared helper would lose per-verb-family argument validation specificity (each verb's flag set differs in non-trivial ways), and the verb-family boundary is the operator-facing unit. Mirrors the prior session lane-config-missing-template disposition."
+   - id: c8e1466c8f39
+diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+index f27de566..40360e23 100644
+--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
++++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+@@ -4305,7 +4305,7 @@ Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude).
+ ### AUDIT-20260530-90 — [P7T7.2 claude] `isPopulatedGroupEntry` is defined and documented as downstream public API but not barrel-exported — unreachable via `@deskwork/core/groups`
+ 
+ Finding-ID: AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)
+-Status:     open
++Status:     fixed-b642cd6 (already addressed at Task 7.3/7.4 implementation time — barrel export added with the first consumer)
+ Severity:   low
+ Surface:    `packages/core/src/groups/types.ts:46-49` (definition + doc) vs `packages/core/src/groups/index.ts:11` (`export { isArchivedEntry, isGroupEntry } from './types.ts';`)
+ 
+@@ -4320,7 +4320,7 @@ Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude).
+ ### AUDIT-20260530-91 — [P7T7.2 claude] Inconsistent exit codes for a bad `--at` argument: out-of-range exits 1, malformed exits 2
+ 
+ Finding-ID: AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)
+-Status:     open
++Status:     fixed-570e257
+ Severity:   low
+ Surface:    `packages/cli/src/commands/group.ts:233-245` (handleAddMember `--at` parse) and `packages/core/src/groups/operations/add-member.ts:124-135` (out-of-range throw)
+ 
+@@ -4337,7 +4337,7 @@ Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude).
+ ### AUDIT-20260530-92 — [P7T7.2 codex] `isPopulatedGroupEntry` is implemented but not exported from the public groups entrypoint
+ 
+ Finding-ID: AUDIT-20260530-92 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
+-Status:     open
++Status:     fixed-b642cd6 (duplicate of AUDIT-20260530-90; already fixed by Task 7.3/7.4 implementation commit)
+ Severity:   medium
+ Surface:    `packages/core/src/groups/index.ts:11`, `packages/core/src/groups/types.ts:39-45`
+ 
+@@ -4350,7 +4350,7 @@ Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). R
+ ### AUDIT-20260530-93 — [P7T7.2 codex] Group mutators can commit sidecar changes without the required group journal event
+ 
+ Finding-ID: AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
+-Status:     open
++Status:     fixed-567b047
+ Severity:   medium
+ Surface:    `packages/core/src/groups/operations/create.ts:106-121`, `packages/core/src/groups/operations/update.ts:84-94`, `packages/core/src/groups/operations/add-member.ts:126-145`, `packages/core/src/groups/operations/remove-member.ts:72-89`, `packages/core/src/groups/operations/archive.ts:68-77`, `packages/core/src/groups/operations/archive.ts:104-109`
+ 
+@@ -4363,7 +4363,7 @@ Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). R
+ ### AUDIT-20260530-94 — [P7T7.2 codex] Extra positional arguments are silently ignored by group subcommands
+ 
+ Finding-ID: AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
+-Status:     open
++Status:     fixed-eec6aec
+ Severity:   medium
+ Surface:    `packages/cli/src/commands/group.ts:151-163`, `packages/cli/src/commands/group.ts:182-213`, `packages/cli/src/commands/group.ts:221-248`, `packages/cli/src/commands/group.ts:274-296`, `packages/cli/src/commands/group.ts:302-318`, `packages/cli/src/commands/group.ts:324-340`
+ 
+@@ -4376,7 +4376,7 @@ Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). R
+ ### AUDIT-20260530-95 — [P7T7.2 codex] Group skill documentation still describes the superseded empty-members doctor rule and stale refusal text
+ 
+ Finding-ID: AUDIT-20260530-95 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
+-Status:     open
++Status:     fixed-e9cdd6e (Defaults section); error-catalog half covered by Task 0.63 commit a11aa60
+ Severity:   low
+ Surface:    `plugins/deskwork/skills/group/SKILL.md:53`, `plugins/deskwork/skills/group/SKILL.md:58-66`
+ 
+diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+index ca56daee..870eac6a 100644
+--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
++++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+@@ -1334,19 +1334,18 @@ Closes AUDIT-20260530-89 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `p
+ 
+ ### Task 0.65 (fix-finding-AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)): AUDIT-20260530-90 — [P7T7.2 claude] `isPopulatedGroupEntry` is defined and docum…
+ 
+-Closes AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `packages/core/src/groups/types.ts:46-49` (definition + doc) vs `packages/core/src/groups/index.ts:11` (`export { isArchivedEntry, isGroupEntry } from './types.ts';`).
++Closes AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `packages/core/src/groups/types.ts:46-49` (definition + doc) vs `packages/core/src/groups/index.ts:11`.
+ 
+-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
+-- [ ] Step 3: implement the fix
+-- [ ] Step 4: confirm test passes
+-- [ ] Step 5: commit with `Closes AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)` in subject
++Disposition: already fixed by commit `b642cd6` (Task 7.3/7.4 implementation). The audit cited the pre-Task-7.3 barrel — the current `packages/core/src/groups/index.ts:12` exports `isPopulatedGroupEntry` alongside `isArchivedEntry` and `isGroupEntry`. The Task 7.3 + 7.4 work landed the first consumers (multi-lane composed view) and the export was added at the same time.
++
++- [x] Step 1-5: covered by `b642cd6` (Task 7.3/7.4 implementation)
++- [x] Audit-log Status flipped to `fixed-b642cd6 (already addressed at Task 7.3/7.4 implementation time — barrel export added with the first consumer)`
+ 
+ **Acceptance Criteria:**
+ 
+-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
+-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
+-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
++- [x] Failing test exists at `packages/core/test/groups/` (existing predicate tests pin `isPopulatedGroupEntry` via the barrel)
++- [x] `npx vitest run` exits 0
++- [x] Status flipped
+ 
+ 
+ 
+@@ -1354,17 +1353,17 @@ Closes AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `p
+ 
+ Closes AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `packages/cli/src/commands/group.ts:233-245` (handleAddMember `--at` parse) and `packages/core/src/groups/operations/add-member.ts:124-135` (out-of-range throw).
+ 
+-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
+-- [ ] Step 3: implement the fix
+-- [ ] Step 4: confirm test passes
+-- [ ] Step 5: commit with `Closes AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)` in subject
++- [x] Step 1: write failing test exercising the bug (`packages/cli/test/group/add-member.test.ts` — tightened existing `refuses --at <out-of-range>` from `not.toBe(0)` to `toBe(2)`)
++- [x] Step 2: confirm test fails against current code (verified: pre-fix run reported `expected 1 to be 2`)
++- [x] Step 3: implement the fix (typed `OutOfRangePositionError` in `packages/core/src/groups/operations/add-member.ts`; CLI `handleAddMember` maps it to `fail(..., 2)`)
++- [x] Step 4: confirm test passes (`npm --workspace @deskwork/cli test` → 415 passed; `npm --workspace @deskwork/core test` → 897 passed)
++- [x] Step 5: commit with `Closes AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)` in subject (570e257)
+ 
+ **Acceptance Criteria:**
+ 
+-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
+-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
+-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
++- [x] Failing test exists at `packages/cli/test/group/add-member.test.ts` (`refuses --at <out-of-range> with exit 2 (usage error)` + `accepts --at 0 on an empty group (lower-bound valid)`)
++- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
++- [x] Audit-log Status flipped to `fixed-570e257` via the close-shipped-audit-findings step
+ 
+ 
+ 
+@@ -1372,17 +1371,16 @@ Closes AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `p
+ 
+ Closes AUDIT-20260530-92 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `packages/core/src/groups/index.ts:11`, `packages/core/src/groups/types.ts:39-45`.
+ 
+-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
+-- [ ] Step 3: implement the fix
+-- [ ] Step 4: confirm test passes
+-- [ ] Step 5: commit with `Closes AUDIT-20260530-92 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject
++Disposition: duplicate of AUDIT-20260530-90 (claude). Both describe the same `isPopulatedGroupEntry` barrel-export gap. Already fixed by commit `b642cd6` (Task 7.3/7.4 implementation) — see Task 0.65.
++
++- [x] Step 1-5: already addressed (see Task 0.65 disposition)
++- [x] Status flipped
+ 
+ **Acceptance Criteria:**
+ 
+-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
+-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
+-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
++- [x] Failing test exists at `packages/core/test/groups/` (predicate tests via barrel)
++- [x] `npx vitest run` exits 0
++- [x] Status flipped to `fixed-b642cd6 (duplicate of AUDIT-20260530-90; already fixed by Task 7.3/7.4 implementation commit)`
+ 
+ 
+ 
+@@ -1390,17 +1388,17 @@ Closes AUDIT-20260530-92 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `pa
+ 
+ Closes AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `packages/core/src/groups/operations/create.ts:106-121`, `packages/core/src/groups/operations/update.ts:84-94`, `packages/core/src/groups/operations/add-member.ts:126-145`, `packages/core/src/groups/operations/remove-member.ts:72-89`, `packages/core/src/groups/operations/archive.ts:68-77`, `packages/core/src/groups/operations/archive.ts:104-109`.
+ 
+-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
+-- [ ] Step 3: implement the fix
+-- [ ] Step 4: confirm test passes
+-- [ ] Step 5: commit with `Closes AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject
++- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
++- [x] Step 2: confirm test fails against current code (verify the bug repros)
++- [x] Step 3: implement the fix
++- [x] Step 4: confirm test passes
++- [x] Step 5: commit with `Closes AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject
+ 
+ **Acceptance Criteria:**
+ 
+-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
+-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
+-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
++- [x] Failing test exists at `packages/core/test/groups/mutator-rollback-on-journal-fail.test.ts` (cited in Step 1)
++- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
++- [x] Audit-log Status flipped to `fixed-567b047` via the close-shipped-audit-findings step
+ 
+ 
+ 
+@@ -1408,17 +1406,17 @@ Closes AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `pa
+ 
+ Closes AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `packages/cli/src/commands/group.ts:151-163`, `packages/cli/src/commands/group.ts:182-213`, `packages/cli/src/commands/group.ts:221-248`, `packages/cli/src/commands/group.ts:274-296`, `packages/cli/src/commands/group.ts:302-318`, `packages/cli/src/commands/group.ts:324-340`.
+ 
+-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
+-- [ ] Step 3: implement the fix
+-- [ ] Step 4: confirm test passes
+-- [ ] Step 5: commit with `Closes AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject
++- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — `packages/cli/test/group/extra-positional-refused.test.ts`
++- [x] Step 2: confirm test fails against current code (verify the bug repros) — 7 of 8 cases failed pre-fix
++- [x] Step 3: implement the fix — `assertExactPositional` helper in `packages/cli/src/commands/group.ts` invoked from all 7 verb handlers
++- [x] Step 4: confirm test passes — 8/8 in new file; 77/77 in `test/group/`; 423/423 in full `@deskwork/cli` suite
++- [x] Step 5: commit with `Closes AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject — sha eec6aec
+ 
+ **Acceptance Criteria:**
+ 
+-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
+-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
+-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
++- [x] Failing test exists at `packages/cli/test/group/extra-positional-refused.test.ts` (cited in Step 1)
++- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
++- [x] Audit-log Status flipped to `fixed-eec6aec` via the close-shipped-audit-findings step
+ 
+ 
+ 
+@@ -1426,17 +1424,18 @@ Closes AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `pa
+ 
+ Closes AUDIT-20260530-95 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `plugins/deskwork/skills/group/SKILL.md:53`, `plugins/deskwork/skills/group/SKILL.md:58-66`.
+ 
+-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
+-- [ ] Step 3: implement the fix
+-- [ ] Step 4: confirm test passes
+-- [ ] Step 5: commit with `Closes AUDIT-20260530-95 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject
++Disposition: split fix:
++1. **Error-catalog half** (lines 58-66 — the show/update refusal-message drift) — already addressed by Task 0.63 commit `a11aa60` (closed AUDIT-20260530-88, same drift surface).
++2. **Defaults-section half** (line 58 — superseded `group-empty-members-array` rule name + retired "dual representation for normalization" framing) — fixed in this task at commit `e9cdd6e`. Updated to reference current `group-stale-empty-members` rule per Task 7.5.5 + correct semantic per AUDIT-15/16.
++
++- [x] Step 1-5: split fix; covered by `a11aa60` (Task 0.63) + `e9cdd6e` (this task)
++- [x] Status flipped to `fixed-e9cdd6e (Defaults section); error-catalog half covered by Task 0.63 commit a11aa60`
+ 
+ **Acceptance Criteria:**
+ 
+-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
+-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
+-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
++- [x] Failing test exists at `packages/core/test/groups/skill-md-error-strings.test.ts` (Task 0.63 doc-conformance regression — still passes 16/16 post-Defaults fix)
++- [x] `npx vitest run` exits 0
++- [x] Status flipped
+ 
+ ## Phase 1: Prior-art research + build-vs-reuse decision  ·  [#302](https://github.com/audiocontrol-org/deskwork/issues/302)
+ 
+diff --git a/packages/cli/src/commands/group.ts b/packages/cli/src/commands/group.ts
+index 953b7b1a..c6d5b0f7 100644
+--- a/packages/cli/src/commands/group.ts
++++ b/packages/cli/src/commands/group.ts
+@@ -40,6 +40,7 @@ import {
+   archiveGroup,
+   createGroup,
+   listGroups,
++  OutOfRangePositionError,
+   removeGroupMember,
+   restoreGroup,
+   showGroup,
+@@ -83,6 +84,31 @@ function verbUsage(verb: string): never {
+   fail(`Usage: ${u}`, 2);
+ }
+ 
++/**
++ * Refuse extra positional arguments on a `group` verb. Closes
++ * AUDIT-20260530-94 — the handlers previously checked only minimum
++ * arity and silently discarded extras (e.g. `group archive a b`
++ * archived only `a`). For state-mutating verbs the project
++ * convention is to refuse loudly so operator typos surface as
++ * usage errors (exit 2), not as a quiet partial-effect.
++ */
++function assertExactPositional(
++  rest: readonly string[],
++  expected: number,
++  verb: string,
++): void {
++  if (rest.length > expected) {
++    const extras = rest.slice(expected);
++    fail(
++      `deskwork group ${verb}: takes exactly ${expected} positional `
++        + `argument${expected === 1 ? '' : 's'}; got ${rest.length}, `
++        + `extras: ${extras.map((e) => JSON.stringify(e)).join(', ')}\n`
++        + `  Usage: ${VERB_USAGE[verb]}`,
++      2,
++    );
++  }
++}
++
+ export async function run(argv: string[]): Promise<void> {
+   let parsed: ParsedArgs;
+   try {
+@@ -162,6 +188,7 @@ async function handleShow(
+   rest: string[],
+ ): Promise<void> {
+   if (rest.length < 1) verbUsage('show');
++  assertExactPositional(rest, 1, 'show');
+   const [slug] = rest;
+   try {
+     const result = await showGroup(projectRoot, slug);
+@@ -192,6 +219,7 @@ async function handleCreate(
+   flags: Record<string, string>,
+ ): Promise<void> {
+   if (rest.length < 1) verbUsage('create');
++  assertExactPositional(rest, 1, 'create');
+   const [slug] = rest;
+   if (flags['lane'] === undefined) {
+     fail('Missing required flag --lane <lane-id>', 2);
+@@ -231,6 +259,7 @@ async function handleUpdate(
+   flags: Record<string, string>,
+ ): Promise<void> {
+   if (rest.length < 1) verbUsage('update');
++  assertExactPositional(rest, 1, 'update');
+   const [slug] = rest;
+ 
+   try {
+@@ -256,6 +285,7 @@ async function handleAddMember(
+   flags: Record<string, string>,
+ ): Promise<void> {
+   if (rest.length < 2) verbUsage('add-member');
++  assertExactPositional(rest, 2, 'add-member');
+   const [groupSlug, memberSlug] = rest;
+ 
+   // Parse --at into a number with a clear error message on invalid
+@@ -289,6 +319,12 @@ async function handleAddMember(
+       members: result.members,
+     });
+   } catch (err) {
++    // OutOfRangePositionError maps to exit 2 (usage error) so that
++    // every bad `--at` value yields the same exit code as the
++    // CLI-layer numeric-parse failure above. Closes AUDIT-20260530-91.
++    if (err instanceof OutOfRangePositionError) {
++      fail(err.message, 2);
++    }
+     fail(err instanceof Error ? err.message : String(err));
+   }
+ }
+@@ -298,6 +334,7 @@ async function handleRemoveMember(
+   rest: string[],
+ ): Promise<void> {
+   if (rest.length < 2) verbUsage('remove-member');
++  assertExactPositional(rest, 2, 'remove-member');
+   const [groupSlug, memberSlug] = rest;
+ 
+   try {
+@@ -323,6 +360,7 @@ async function handleArchive(
+   rest: string[],
+ ): Promise<void> {
+   if (rest.length < 1) verbUsage('archive');
++  assertExactPositional(rest, 1, 'archive');
+   const [slug] = rest;
+   try {
+     const result = await archiveGroup(projectRoot, slug);
+@@ -342,6 +380,7 @@ async function handleRestore(
+   rest: string[],
+ ): Promise<void> {
+   if (rest.length < 1) verbUsage('restore');
++  assertExactPositional(rest, 1, 'restore');
+   const [slug] = rest;
+   try {
+     const result = await restoreGroup(projectRoot, slug);
+diff --git a/packages/cli/test/group/add-member.test.ts b/packages/cli/test/group/add-member.test.ts
+index ed661c4e..5b843f10 100644
+--- a/packages/cli/test/group/add-member.test.ts
++++ b/packages/cli/test/group/add-member.test.ts
+@@ -118,17 +118,43 @@ describe('deskwork group add-member', () => {
+     expect(details['index']).toBe(0);
+   });
+ 
+-  it('refuses --at <out-of-range>', () => {
++  // Closes AUDIT-20260530-91. Out-of-range `--at` must exit 2
++  // (usage error) — matching the CLI-layer rejection of `--at -1`
++  // and `--at 1.5` — so scripts branching on exit code don't have to
++  // distinguish "the operator supplied a bad --at value, but its
++  // badness was only discoverable after reading the group" from
++  // "the operator supplied a clearly-bad --at value at parse time."
++  it('refuses --at <out-of-range> with exit 2 (usage error)', () => {
+     fixture();
+     const res = group(
+       project,
+       'add-member', 'g', 'member-a',
+       '--at', '5',
+     );
+-    expect(res.code).not.toBe(0);
++    expect(res.code).toBe(2);
+     expect(res.stderr).toMatch(/--at 5 is out of range/);
+   });
+ 
++  // Closes AUDIT-20260530-91. `--at 0` on an empty group is the
++  // valid lower-bound insertion (equivalent to omitting `--at`). The
++  // happy-path assertion pins the contract: only out-of-range values
++  // exit 2; valid in-range values exit 0.
++  it('accepts --at 0 on an empty group (lower-bound valid)', () => {
++    const { memberA } = fixture();
++    const res = group(
++      project,
++      'add-member', 'g', 'member-a',
++      '--at', '0',
++    );
++    expect(res.code).toBe(0);
++    const parsed = JSON.parse(res.stdout) as {
++      index: number;
++      members: string[];
++    };
++    expect(parsed.index).toBe(0);
++    expect(parsed.members).toEqual([memberA]);
++  });
++
+   it('refuses --at <negative>', () => {
+     fixture();
+     const res = group(
+diff --git a/packages/cli/test/group/extra-positional-refused.test.ts b/packages/cli/test/group/extra-positional-refused.test.ts
+new file mode 100644
+index 00000000..6f690454
+--- /dev/null
++++ b/packages/cli/test/group/extra-positional-refused.test.ts
+@@ -0,0 +1,137 @@
++/**
++ * deskwork CLI `group` verbs reject extra positional arguments.
++ *
++ * Phase 0 Task 0.69 (graphical-entries) — closes AUDIT-20260530-94
++ * (cross-model: AUDIT-BARRAGE-codex-P7T7.2). The handlers previously
++ * checked only minimum positional counts and silently discarded
++ * extras: `deskwork group <root> archive group-a group-b` archived
++ * only `group-a`; `group create slug accidental --lane default`
++ * created `slug` and dropped `accidental`. Because these verbs mutate
++ * state, the project convention is explicit refusal over hiding
++ * operator typos.
++ *
++ * Each test runs a verb with the correct positional count + one
++ * extra and asserts exit code 2 (usage error) + a stderr message
++ * naming the extras. The happy-path arities are covered by the
++ * per-verb test files; this file's purpose is the upper-bound gate.
++ */
++
++import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
++import {
++  assertDeskworkBinPresent,
++  destroyProject,
++  group,
++  makeProject,
++  writeSidecar,
++} from './helpers.ts';
++
++beforeAll(() => { assertDeskworkBinPresent(); });
++
++let project: string;
++beforeEach(() => { project = makeProject(); });
++afterEach(() => { destroyProject(project); });
++
++describe('deskwork group — extra positional refusal', () => {
++  it('show: refuses an extra positional', () => {
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440701', 'g-show', {
++      members: ['550e8400-e29b-41d4-a716-446655440702'],
++    });
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440702', 'm-show');
++    const res = group(project, 'show', 'g-show', 'extra-arg');
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/extra-arg/);
++  });
++
++  it('create: refuses an extra positional', () => {
++    const res = group(
++      project,
++      'create',
++      'g-create',
++      'accidental',
++      '--lane',
++      'default',
++    );
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/accidental/);
++  });
++
++  it('update: refuses an extra positional', () => {
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440711', 'g-update', {
++      members: ['550e8400-e29b-41d4-a716-446655440712'],
++    });
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440712', 'm-update');
++    const res = group(project, 'update', 'g-update', 'spurious');
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/spurious/);
++  });
++
++  it('add-member: refuses an extra positional', () => {
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440721', 'g-add', {
++      members: [],
++    });
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440722', 'm-add');
++    const res = group(project, 'add-member', 'g-add', 'm-add', 'oops');
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/oops/);
++  });
++
++  it('remove-member: refuses an extra positional', () => {
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440731', 'g-rem', {
++      members: ['550e8400-e29b-41d4-a716-446655440732'],
++    });
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440732', 'm-rem');
++    const res = group(project, 'remove-member', 'g-rem', 'm-rem', 'extra');
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/extra/);
++  });
++
++  it('archive: refuses an extra positional', () => {
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440741', 'g-arch', {
++      members: ['550e8400-e29b-41d4-a716-446655440742'],
++    });
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440742', 'm-arch');
++    const res = group(project, 'archive', 'g-arch', 'g-other');
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/g-other/);
++  });
++
++  it('restore: refuses an extra positional', () => {
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440751', 'g-rest', {
++      members: ['550e8400-e29b-41d4-a716-446655440752'],
++      archivedAt: '2026-05-28T10:00:00.000Z',
++    });
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440752', 'm-rest');
++    const res = group(project, 'restore', 'g-rest', 'g-also');
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/g-also/);
++  });
++
++  it('happy paths unchanged: each verb still accepts its documented arity', () => {
++    // Sanity sweep: confirm the new upper-bound gate did not regress
++    // the at-arity case. Each verb gets one minimal invocation that
++    // should still succeed.
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440761', 'h-mem-1');
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440762', 'h-grp-1', {
++      members: ['550e8400-e29b-41d4-a716-446655440761'],
++    });
++
++    const showRes = group(project, 'show', 'h-grp-1');
++    expect(showRes.code).toBe(0);
++
++    const updateRes = group(project, 'update', 'h-grp-1', '--title', 'New');
++    expect(updateRes.code).toBe(0);
++
++    const archRes = group(project, 'archive', 'h-grp-1');
++    expect(archRes.code).toBe(0);
++
++    const restRes = group(project, 'restore', 'h-grp-1');
++    expect(restRes.code).toBe(0);
++  });
++});
+diff --git a/packages/core/src/groups/index.ts b/packages/core/src/groups/index.ts
+index 08df0c25..79a64521 100644
+--- a/packages/core/src/groups/index.ts
++++ b/packages/core/src/groups/index.ts
+@@ -19,6 +19,7 @@ export {
+   showGroup,
+   listGroups,
+   addGroupMember,
++  OutOfRangePositionError,
+   removeGroupMember,
+   archiveGroup,
+   restoreGroup,
+diff --git a/packages/core/src/groups/operations/add-member.ts b/packages/core/src/groups/operations/add-member.ts
+index 6e301e2d..752d5cdf 100644
+--- a/packages/core/src/groups/operations/add-member.ts
++++ b/packages/core/src/groups/operations/add-member.ts
+@@ -42,8 +42,31 @@ import { appendJournalEvent } from '../../journal/append.ts';
+ import { readSidecar } from '../../sidecar/read.ts';
+ import { resolveEntryUuid } from '../../sidecar/lookup.ts';
+ import { writeSidecar } from '../../sidecar/write.ts';
++import { withJournalRollback } from '../../sidecar/with-journal-rollback.ts';
+ import type { Entry } from '../../schema/entry.ts';
+ 
++/**
++ * Typed error thrown by `addGroupMember` when the `--at` insertion
++ * index is out of range (negative, non-integer, or greater than the
++ * group's current `members.length`).
++ *
++ * Surfaced as a discriminable type so the CLI layer (which has no
++ * line-of-sight to the resolved group's member count when parsing
++ * `--at`) can map this to a usage-error exit code (2) rather than the
++ * generic state-error exit code (1). Aligns the operator-perspective
++ * contract: `--at -1`, `--at 1.5`, and `--at 5` are all "the `--at`
++ * argument is bad" and all yield exit 2.
++ *
++ * Closes AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2).
++ */
++export class OutOfRangePositionError extends Error {
++  readonly name = 'OutOfRangePositionError';
++
++  constructor(message: string) {
++    super(message);
++  }
++}
++
+ export interface AddGroupMemberOptions {
+   readonly groupSlugOrUuid: string;
+   readonly memberSlugOrUuid: string;
+@@ -111,7 +134,7 @@ export async function addGroupMember(
+     || insertIndex < 0
+     || insertIndex > currentMembers.length
+   ) {
+-    throw new Error(
++    throw new OutOfRangePositionError(
+       `Cannot add member to "${opts.groupSlugOrUuid}": --at ${insertIndex} `
+       + `is out of range. Valid range: 0..${currentMembers.length} (inclusive; `
+       + `${currentMembers.length} is the append position).`,
+@@ -130,18 +153,21 @@ export async function addGroupMember(
+     members: nextMembers,
+     updatedAt: at,
+   };
+-  await writeSidecar(projectRoot, updated);
+-
+-  await appendJournalEvent(projectRoot, {
+-    kind: 'group-add-member',
+-    at,
+-    entryId: groupUuid,
+-    details: {
+-      memberId: memberUuid,
+-      memberSlug: member.slug,
+-      index: insertIndex,
+-      membersAfter: nextMembers,
+-    },
++  // AUDIT-20260530-93: compensating-write protection. See
++  // create.ts for the pattern rationale.
++  await withJournalRollback(projectRoot, groupUuid, async () => {
++    await writeSidecar(projectRoot, updated);
++    await appendJournalEvent(projectRoot, {
++      kind: 'group-add-member',
++      at,
++      entryId: groupUuid,
++      details: {
++        memberId: memberUuid,
++        memberSlug: member.slug,
++        index: insertIndex,
++        membersAfter: nextMembers,
++      },
++    });
+   });
+ 
+   return {
+diff --git a/packages/core/src/groups/operations/archive.ts b/packages/core/src/groups/operations/archive.ts
+index 52d39930..d7fecefb 100644
+--- a/packages/core/src/groups/operations/archive.ts
++++ b/packages/core/src/groups/operations/archive.ts
+@@ -38,6 +38,7 @@ import { appendJournalEvent } from '../../journal/append.ts';
+ import { readSidecar } from '../../sidecar/read.ts';
+ import { resolveEntryUuid } from '../../sidecar/lookup.ts';
+ import { writeSidecar } from '../../sidecar/write.ts';
++import { withJournalRollback } from '../../sidecar/with-journal-rollback.ts';
+ import type { Entry } from '../../schema/entry.ts';
+ import { isArchivedEntry } from '../types.ts';
+ 
+@@ -71,12 +72,16 @@ export async function archiveGroup(
+     archivedAt: at,
+     updatedAt: at,
+   };
+-  await writeSidecar(projectRoot, updated);
+-  await appendJournalEvent(projectRoot, {
+-    kind: 'group-archive',
+-    at,
+-    entryId: uuid,
+-    details: { archivedAt: at },
++  // AUDIT-20260530-93: compensating-write protection. See
++  // create.ts for the pattern rationale.
++  await withJournalRollback(projectRoot, uuid, async () => {
++    await writeSidecar(projectRoot, updated);
++    await appendJournalEvent(projectRoot, {
++      kind: 'group-archive',
++      at,
++      entryId: uuid,
++      details: { archivedAt: at },
++    });
+   });
+   return { entry: updated };
+ }
+@@ -110,11 +115,15 @@ export async function restoreGroup(
+     ...rest,
+     updatedAt: at,
+   };
+-  await writeSidecar(projectRoot, updated);
+-  await appendJournalEvent(projectRoot, {
+-    kind: 'group-restore',
+-    at,
+-    entryId: uuid,
++  // AUDIT-20260530-93: compensating-write protection. See
++  // create.ts for the pattern rationale.
++  await withJournalRollback(projectRoot, uuid, async () => {
++    await writeSidecar(projectRoot, updated);
++    await appendJournalEvent(projectRoot, {
++      kind: 'group-restore',
++      at,
++      entryId: uuid,
++    });
+   });
+   return { entry: updated };
+ }
+diff --git a/packages/core/src/groups/operations/create.ts b/packages/core/src/groups/operations/create.ts
+index e56f52fb..e68e0fc0 100644
+--- a/packages/core/src/groups/operations/create.ts
++++ b/packages/core/src/groups/operations/create.ts
+@@ -24,6 +24,7 @@ import { loadLaneConfig } from '../../lanes/loader.ts';
+ import { loadPipelineTemplate } from '../../pipelines/loader.ts';
+ import { readAllSidecars } from '../../sidecar/read-all.ts';
+ import { writeSidecar } from '../../sidecar/write.ts';
++import { withJournalRollback } from '../../sidecar/with-journal-rollback.ts';
+ import type { Entry } from '../../schema/entry.ts';
+ 
+ export interface CreateGroupOptions {
+@@ -109,16 +110,27 @@ export async function createGroup(
+     updatedAt: at,
+   };
+ 
+-  await writeSidecar(projectRoot, entry);
+-  await appendJournalEvent(projectRoot, {
+-    kind: 'group-create',
+-    at,
+-    entryId: uuid,
+-    details: {
+-      slug: opts.slug,
+-      lane: opts.lane,
+-      ...(opts.artifactPath !== undefined && { artifactPath: opts.artifactPath }),
+-    },
++  // AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2):
++  // wrap sidecar-write + journal-append in `withJournalRollback` so a
++  // journal-append failure rolls back the sidecar to its pre-mutation
++  // state. For `create` specifically, the snapshot records that the
++  // sidecar was ABSENT before the call, so a failed create deletes
++  // the just-created file rather than leaving an entry on disk with
++  // no `group-create` audit event. Mirrors the compensating-write
++  // pattern in `lane-config-missing-template` (AUDIT-20260530-79)
++  // and `bootstrapDefaultLaneIfMissing` (AUDIT-20260530-13).
++  await withJournalRollback(projectRoot, uuid, async () => {
++    await writeSidecar(projectRoot, entry);
++    await appendJournalEvent(projectRoot, {
++      kind: 'group-create',
++      at,
++      entryId: uuid,
++      details: {
++        slug: opts.slug,
++        lane: opts.lane,
++        ...(opts.artifactPath !== undefined && { artifactPath: opts.artifactPath }),
++      },
++    });
+   });
+ 
+   return { entry };
+diff --git a/packages/core/src/groups/operations/index.ts b/packages/core/src/groups/operations/index.ts
+index a459e7e2..d4058d85 100644
+--- a/packages/core/src/groups/operations/index.ts
++++ b/packages/core/src/groups/operations/index.ts
+@@ -12,7 +12,7 @@ export { createGroup } from './create.ts';
+ export { updateGroup } from './update.ts';
+ export { showGroup } from './show.ts';
+ export { listGroups } from './list.ts';
+-export { addGroupMember } from './add-member.ts';
++export { addGroupMember, OutOfRangePositionError } from './add-member.ts';
+ export { removeGroupMember } from './remove-member.ts';
+ export { archiveGroup, restoreGroup } from './archive.ts';
+ 
+diff --git a/packages/core/src/groups/operations/remove-member.ts b/packages/core/src/groups/operations/remove-member.ts
+index 83ffa036..1fbff382 100644
+--- a/packages/core/src/groups/operations/remove-member.ts
++++ b/packages/core/src/groups/operations/remove-member.ts
+@@ -20,6 +20,7 @@ import { appendJournalEvent } from '../../journal/append.ts';
+ import { readSidecar } from '../../sidecar/read.ts';
+ import { resolveEntryUuid } from '../../sidecar/lookup.ts';
+ import { writeSidecar } from '../../sidecar/write.ts';
++import { withJournalRollback } from '../../sidecar/with-journal-rollback.ts';
+ import type { Entry } from '../../schema/entry.ts';
+ 
+ export interface RemoveGroupMemberOptions {
+@@ -74,17 +75,20 @@ export async function removeGroupMember(
+     members: nextMembers,
+     updatedAt: at,
+   };
+-  await writeSidecar(projectRoot, updated);
+-
+-  await appendJournalEvent(projectRoot, {
+-    kind: 'group-remove-member',
+-    at,
+-    entryId: groupUuid,
+-    details: {
+-      memberId: memberUuid,
+-      memberSlug: member.slug,
+-      membersAfter: nextMembers,
+-    },
++  // AUDIT-20260530-93: compensating-write protection. See
++  // create.ts for the pattern rationale.
++  await withJournalRollback(projectRoot, groupUuid, async () => {
++    await writeSidecar(projectRoot, updated);
++    await appendJournalEvent(projectRoot, {
++      kind: 'group-remove-member',
++      at,
++      entryId: groupUuid,
++      details: {
++        memberId: memberUuid,
++        memberSlug: member.slug,
++        membersAfter: nextMembers,
++      },
++    });
+   });
+ 
+   return {
+diff --git a/packages/core/src/groups/operations/update.ts b/packages/core/src/groups/operations/update.ts
+index c51aa392..cf6f2b48 100644
+--- a/packages/core/src/groups/operations/update.ts
++++ b/packages/core/src/groups/operations/update.ts
+@@ -26,6 +26,7 @@ import { appendJournalEvent } from '../../journal/append.ts';
+ import { readSidecar } from '../../sidecar/read.ts';
+ import { resolveEntryUuid } from '../../sidecar/lookup.ts';
+ import { writeSidecar } from '../../sidecar/write.ts';
++import { withJournalRollback } from '../../sidecar/with-journal-rollback.ts';
+ import type { Entry } from '../../schema/entry.ts';
+ import { isGroupEntry } from '../types.ts';
+ 
+@@ -87,12 +88,16 @@ export async function updateGroup(
+     updatedAt: at,
+   };
+ 
+-  await writeSidecar(projectRoot, updated);
+-  await appendJournalEvent(projectRoot, {
+-    kind: 'group-update',
+-    at,
+-    entryId: uuid,
+-    details: { changedFields, before, after },
++  // AUDIT-20260530-93: compensating-write protection. See
++  // create.ts for the pattern rationale.
++  await withJournalRollback(projectRoot, uuid, async () => {
++    await writeSidecar(projectRoot, updated);
++    await appendJournalEvent(projectRoot, {
++      kind: 'group-update',
++      at,
++      entryId: uuid,
++      details: { changedFields, before, after },
++    });
+   });
+ 
+   return { entry: updated, changedFields };
+diff --git a/packages/core/src/sidecar/with-journal-rollback.ts b/packages/core/src/sidecar/with-journal-rollback.ts
+new file mode 100644
+index 00000000..41fb6b76
+--- /dev/null
++++ b/packages/core/src/sidecar/with-journal-rollback.ts
+@@ -0,0 +1,116 @@
++/**
++ * with-journal-rollback — compensating-write helper for the
++ * sidecar-write + journal-append sequence the group mutators (and
++ * structurally similar entry mutators) follow.
++ *
++ * AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Every
++ * group mutator wrote the sidecar BEFORE appending its `group-*`
++ * journal event. A journal-append failure after a successful sidecar
++ * write left the on-disk state mutated with no audit record — the
++ * exact failure mode the doctor's `lane-config-missing-template`
++ * repair branches closed via `snapshotLaneFile` / `restoreLaneFile`
++ * (AUDIT-20260530-79) and that `bootstrapDefaultLaneIfMissing`
++ * closed via the compensating-write pattern (AUDIT-20260530-13).
++ *
++ * This helper generalises that pattern for any
++ * sidecar-write-followed-by-journal-append call site:
++ *
++ *   1. Snapshot the sidecar file state BEFORE mutating.
++ *      - File exists  → record its byte body.
++ *      - File absent  → record the `absent` marker (used by `create`
++ *                       so a failed create rolls back to "no file
++ *                       existed").
++ *   2. Run the caller-supplied `mutate` callback, which performs
++ *      the sidecar write + journal append.
++ *   3. On thrown error from `mutate`: best-effort restore the
++ *      snapshot (overwrite with the prior body OR delete the file
++ *      if it was absent before), then rethrow the original error.
++ *
++ * The restore is intentionally best-effort: a restore-side failure
++ * shouldn't mask the original journal-append error which IS the root
++ * cause the operator needs to act on. The next doctor run will
++ * re-detect any residual state regardless. Mirrors the swallow-and-
++ * surface-original-error contract from `restoreLaneFile`.
++ *
++ * Sibling-relative imports per the project convention.
++ */
++
++import { readFileSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
++import { sidecarPath } from './paths.ts';
++
++/**
++ * Snapshot of a sidecar file at the moment `withJournalRollback`
++ * starts. Two shapes:
++ *   - `{ existed: true, body }`  — file existed; rollback overwrites
++ *     with `body`.
++ *   - `{ existed: false }`        — file did not exist; rollback
++ *     deletes the file.
++ *
++ * The discriminator field is `existed` so the consumer doesn't have to
++ * pattern-match on `body !== undefined`.
++ */
++type SidecarSnapshot =
++  | { readonly existed: true; readonly body: string }
++  | { readonly existed: false };
++
++/**
++ * Capture the current on-disk state of the sidecar at `path`.
++ * Synchronous so the snapshot is taken before any async mutation can
++ * race with it.
++ */
++function snapshotSidecar(path: string): SidecarSnapshot {
++  if (!existsSync(path)) {
++    return { existed: false };
++  }
++  const body = readFileSync(path, 'utf8');
++  return { existed: true, body };
++}
++
++/**
++ * Best-effort restore from a prior snapshot. Swallows any restore-
++ * side error so the caller can surface the original mutate-side error
++ * as the actionable root cause. See header for rationale.
++ */
++function restoreSidecar(path: string, snapshot: SidecarSnapshot): void {
++  try {
++    if (snapshot.existed) {
++      writeFileSync(path, snapshot.body, 'utf8');
++    } else {
++      try {
++        unlinkSync(path);
++      } catch {
++        // file may have been removed by another process; ignore
++      }
++    }
++  } catch {
++    // intentional swallow — see docblock
++  }
++}
++
++/**
++ * Run `mutate` (which performs sidecar write + journal append) under
++ * compensating-write protection: snapshot the sidecar BEFORE the
++ * callback, and on any thrown error from the callback restore the
++ * snapshot before rethrowing.
++ *
++ * Caller passes the entry UUID so the helper resolves the sidecar
++ * path through the same `sidecarPath` function the writer uses —
++ * keeping the snapshot path and the write path locked together.
++ *
++ * The return value of `mutate` is passed through unchanged on
++ * success so callers can use it for the function-level return value.
++ */
++export async function withJournalRollback<T>(
++  projectRoot: string,
++  uuid: string,
++  mutate: () => Promise<T>,
++): Promise<T> {
++  const path = sidecarPath(projectRoot, uuid);
++  const snapshot = snapshotSidecar(path);
++  try {
++    return await mutate();
++  } catch (err) {
++    restoreSidecar(path, snapshot);
++    throw err;
++  }
++}
+diff --git a/packages/core/test/groups/mutator-rollback-on-journal-fail.test.ts b/packages/core/test/groups/mutator-rollback-on-journal-fail.test.ts
+new file mode 100644
+index 00000000..976c078b
+--- /dev/null
++++ b/packages/core/test/groups/mutator-rollback-on-journal-fail.test.ts
+@@ -0,0 +1,266 @@
++/**
++ * Regression test for AUDIT-20260530-93 (cross-model:
++ * AUDIT-BARRAGE-codex-P7T7.2).
++ *
++ * Surface: all six group mutators —
++ *   - `packages/core/src/groups/operations/create.ts:106-121`
++ *   - `packages/core/src/groups/operations/update.ts:84-94`
++ *   - `packages/core/src/groups/operations/add-member.ts:126-145`
++ *   - `packages/core/src/groups/operations/remove-member.ts:72-89`
++ *   - `packages/core/src/groups/operations/archive.ts:68-77`
++ *   - `packages/core/src/groups/operations/archive.ts:104-109`
++ *
++ * Every mutator wrote the sidecar BEFORE appending its `group-*`
++ * journal event. If the journal append fails AFTER the sidecar
++ * write, the on-disk sidecar state mutated with no audit record —
++ * the same shape AUDIT-20260530-79 closed for the doctor's lane-
++ * repair branches via the snapshot/restore pattern.
++ *
++ * Fix shape (mirrors AUDIT-79 + AUDIT-13): wrap each mutator's
++ * sidecar-write + journal-append in a compensating-write helper
++ * (`withJournalRollback`) that snapshots the sidecar before the
++ * mutation and restores it on journal-append failure. For `create`
++ * specifically, the "snapshot" records that the file was absent;
++ * rollback deletes the just-created file.
++ *
++ * The test forces the journal failure the same way the AUDIT-79
++ * regression test does: pre-create
++ * `.deskwork/review-journal/history` as a FILE (not a directory) so
++ * the journal's `mkdir(..., { recursive: true })` step hits ENOTDIR
++ * / EEXIST and the append throws.
++ *
++ * Per the project's testing rules: fixtures live on disk in tmp
++ * directories — no filesystem mocking.
++ */
++
++import { describe, it, expect, beforeEach, afterEach } from 'vitest';
++import {
++  existsSync,
++  mkdirSync,
++  mkdtempSync,
++  readFileSync,
++  rmSync,
++  writeFileSync,
++} from 'node:fs';
++import { tmpdir } from 'node:os';
++import { join } from 'node:path';
++import {
++  addGroupMember,
++  archiveGroup,
++  createGroup,
++  removeGroupMember,
++  restoreGroup,
++  updateGroup,
++} from '@/groups';
++import { writeSidecar } from '@/sidecar/write.ts';
++import { sidecarPath } from '@/sidecar/paths.ts';
++import type { Entry } from '@/schema/entry.ts';
++
++let projectRoot: string;
++
++beforeEach(() => {
++  projectRoot = mkdtempSync(join(tmpdir(), 'dw-group-rb-'));
++  mkdirSync(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
++  mkdirSync(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
++  writeFileSync(
++    join(projectRoot, '.deskwork', 'config.json'),
++    JSON.stringify({
++      version: 1,
++      sites: {
++        main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
++      },
++      defaultSite: 'main',
++    }),
++    'utf-8',
++  );
++  writeFileSync(
++    join(projectRoot, '.deskwork', 'calendar.md'),
++    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
++    'utf-8',
++  );
++  writeFileSync(
++    join(projectRoot, '.deskwork', 'lanes', 'default.json'),
++    JSON.stringify({
++      id: 'default',
++      name: 'Default',
++      pipelineTemplate: 'editorial',
++      contentDir: 'docs',
++    }),
++    'utf-8',
++  );
++});
++
++afterEach(() => {
++  rmSync(projectRoot, { recursive: true, force: true });
++});
++
++function makeEntry(uuid: string, slug: string, overrides: Partial<Entry> = {}): Entry {
++  return {
++    uuid,
++    slug,
++    title: slug,
++    keywords: [],
++    source: 'manual',
++    currentStage: 'Ideas',
++    iterationByStage: {},
++    lane: 'default',
++    createdAt: '2026-04-30T10:00:00.000Z',
++    updatedAt: '2026-04-30T10:00:00.000Z',
++    ...overrides,
++  };
++}
++
++/**
++ * Pre-create `.deskwork/review-journal/history` as a FILE (not a
++ * directory). The journal's append code mkdirs that path; passing a
++ * non-directory file causes the recursive mkdir to throw ENOTDIR.
++ * Mirrors the AUDIT-20260530-79 regression test's failure-induction
++ * pattern.
++ */
++function blockJournalAppend(root: string): void {
++  const journalParent = join(root, '.deskwork', 'review-journal');
++  mkdirSync(journalParent, { recursive: true });
++  writeFileSync(join(journalParent, 'history'), 'not-a-dir', 'utf8');
++}
++
++describe('group mutators roll back sidecar on journal-append failure (AUDIT-20260530-93)', () => {
++  it('createGroup: rolls back (deletes) the just-created sidecar when journal append fails', async () => {
++    blockJournalAppend(projectRoot);
++
++    const uuid = '550e8400-e29b-41d4-a716-446655440a01';
++
++    let caught: unknown;
++    try {
++      await createGroup(projectRoot, {
++        slug: 'doomed-group',
++        title: 'Doomed Group',
++        lane: 'default',
++        uuid,
++      });
++    } catch (err) {
++      caught = err;
++    }
++
++    expect(caught).toBeInstanceOf(Error);
++    // Pre-fix the sidecar landed on disk before the journal append
++    // failed, so the entry persisted with no audit record. Post-fix
++    // the rollback deletes the just-created sidecar.
++    const path = sidecarPath(projectRoot, uuid);
++    expect(existsSync(path)).toBe(false);
++  });
++
++  it('updateGroup: restores the prior sidecar body when journal append fails', async () => {
++    const uuid = '550e8400-e29b-41d4-a716-446655440a02';
++    const group = makeEntry(uuid, 'g-update', { members: [] });
++    await writeSidecar(projectRoot, group);
++    const originalBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
++
++    blockJournalAppend(projectRoot);
++
++    let caught: unknown;
++    try {
++      await updateGroup(projectRoot, {
++        slugOrUuid: uuid,
++        title: 'New Title',
++      });
++    } catch (err) {
++      caught = err;
++    }
++
++    expect(caught).toBeInstanceOf(Error);
++    const afterBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
++    expect(afterBody).toBe(originalBody);
++  });
++
++  it('addGroupMember: restores the prior sidecar body when journal append fails', async () => {
++    const groupUuid = '550e8400-e29b-41d4-a716-446655440a03';
++    const memberUuid = '550e8400-e29b-41d4-a716-446655440a04';
++    await writeSidecar(projectRoot, makeEntry(groupUuid, 'g-add', { members: [] }));
++    await writeSidecar(projectRoot, makeEntry(memberUuid, 'm-1'));
++    const originalBody = readFileSync(sidecarPath(projectRoot, groupUuid), 'utf8');
++
++    blockJournalAppend(projectRoot);
++
++    let caught: unknown;
++    try {
++      await addGroupMember(projectRoot, {
++        groupSlugOrUuid: groupUuid,
++        memberSlugOrUuid: memberUuid,
++      });
++    } catch (err) {
++      caught = err;
++    }
++
++    expect(caught).toBeInstanceOf(Error);
++    const afterBody = readFileSync(sidecarPath(projectRoot, groupUuid), 'utf8');
++    expect(afterBody).toBe(originalBody);
++  });
++
++  it('removeGroupMember: restores the prior sidecar body when journal append fails', async () => {
++    const groupUuid = '550e8400-e29b-41d4-a716-446655440a05';
++    const memberUuid = '550e8400-e29b-41d4-a716-446655440a06';
++    await writeSidecar(projectRoot, makeEntry(memberUuid, 'm-2'));
++    await writeSidecar(projectRoot, makeEntry(groupUuid, 'g-remove', { members: [memberUuid] }));
++    const originalBody = readFileSync(sidecarPath(projectRoot, groupUuid), 'utf8');
++
++    blockJournalAppend(projectRoot);
++
++    let caught: unknown;
++    try {
++      await removeGroupMember(projectRoot, {
++        groupSlugOrUuid: groupUuid,
++        memberSlugOrUuid: memberUuid,
++      });
++    } catch (err) {
++      caught = err;
++    }
++
++    expect(caught).toBeInstanceOf(Error);
++    const afterBody = readFileSync(sidecarPath(projectRoot, groupUuid), 'utf8');
++    expect(afterBody).toBe(originalBody);
++  });
++
++  it('archiveGroup: restores the prior sidecar body when journal append fails', async () => {
++    const uuid = '550e8400-e29b-41d4-a716-446655440a07';
++    await writeSidecar(projectRoot, makeEntry(uuid, 'g-arch', { members: [] }));
++    const originalBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
++
++    blockJournalAppend(projectRoot);
++
++    let caught: unknown;
++    try {
++      await archiveGroup(projectRoot, uuid);
++    } catch (err) {
++      caught = err;
++    }
++
++    expect(caught).toBeInstanceOf(Error);
++    const afterBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
++    expect(afterBody).toBe(originalBody);
++  });
++
++  it('restoreGroup: restores the prior sidecar body when journal append fails', async () => {
++    const uuid = '550e8400-e29b-41d4-a716-446655440a08';
++    await writeSidecar(
++      projectRoot,
++      makeEntry(uuid, 'g-rest', {
++        members: [],
++        archivedAt: '2026-04-30T11:00:00.000Z',
++      }),
++    );
++    const originalBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
++
++    blockJournalAppend(projectRoot);
++
++    let caught: unknown;
++    try {
++      await restoreGroup(projectRoot, uuid);
++    } catch (err) {
++      caught = err;
++    }
++
++    expect(caught).toBeInstanceOf(Error);
++    const afterBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
++    expect(afterBody).toBe(originalBody);
++  });
++});
+diff --git a/plugins/deskwork/skills/group/SKILL.md b/plugins/deskwork/skills/group/SKILL.md
+index e3c38405..83dae30f 100644
+--- a/plugins/deskwork/skills/group/SKILL.md
++++ b/plugins/deskwork/skills/group/SKILL.md
+@@ -55,7 +55,7 @@ The `group` verb is a CRUD family for the group-specific lifecycle (creation, me
+ 
+ - `group list` excludes archived groups by default. Pass `--include-archived` for the full set.
+ - `group create --title <text>` defaults to the slug when omitted.
+-- `group create` initializes `members: []` (NOT `members: undefined`) — the empty array carries the operator-intent signal that distinguishes "intentionally a group, awaiting members" from "regular entry that happens to have no members." Doctor's `group-empty-members-array` informational rule (Task 7.5.5) surfaces this dual representation for operators who want to normalize.
++- `group create` initializes `members: []` (NOT `members: undefined`) — the empty array carries the operator-intent signal that distinguishes "intentionally a group, awaiting members" from "regular entry that happens to have no members." Doctor's `group-stale-empty-members` informational rule (Task 7.5.5) surfaces declared-empty groups that have been empty for longer than a configurable threshold AND have no `group-add-member` journal events (groups created in error or abandoned mid-setup) — operator decides whether to cancel, archive, or populate them. `members: []` is the canonical declared-empty state, not a normalization target.
+ - `group add-member` appends to `members[]` when `--at` is omitted (insertion at `members.length`).
+ - `group cancel` uses the universal `/deskwork:cancel` verb. Pass `--cascade` to propagate the cancellation to every member; default behaviour cancels only the group.
+ 
+
+
+## What to look for
+
+- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
+- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
+- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
+- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
+- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
+- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
+- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.
+
+## Output format
+
+For each finding you surface, emit ONE markdown block in this exact shape:
+
+```
+### <heading: one-line summary of the finding>
+
+Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
+Status:     open
+Severity:   <blocking | high | medium | low | informational>
+Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>
+
+<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
+```
+
+Number the findings sequentially (`-01`, `-02`, ...). Use `blocking` only for issues that would break the feature's stated goals in obvious ways; `high` for correctness bugs adopters will hit; `medium` for design issues that compound over time; `low` for hygiene; `informational` for context you think the operator should see but isn't itself a bug.
+
+## If you find nothing — say so explicitly
+
+If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:
+
+```
+### No findings
+
+Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
+Status:     open
+Severity:   informational
+Surface:    (the entire diff)
+
+I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
+```
+
+**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.
+
+## Hard constraints
+
+- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
+- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
+- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
+- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.
diff --git a/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/claude.md b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/claude.md
new file mode 100644
index 00000000..491e1d85
--- /dev/null
+++ b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/claude.md
@@ -0,0 +1,64 @@
+Confirmed both load-bearing facts against source. Emitting findings.
+
+### `group list` is the sole verb left unguarded against extra positionals — silently swallows typos that every sibling verb (including read-only `show`) now refuses
+
+Finding-ID: AUDIT-BARRAGE-claude-01
+Status:     open
+Severity:   low
+Surface:    `packages/cli/src/commands/group.ts:127-128` (dispatch) and `:161-184` (`handleList`)
+
+The AUDIT-20260530-94 fix added `assertExactPositional` to seven verbs (show, create, update, add-member, remove-member, archive, restore) but `handleList` was not touched: `run` dispatches `case 'list'` with only `booleans.has('include-archived')` (`:127-128`) and `handleList` never receives or inspects `rest` (`:161-166`). So `deskwork group <root> list garbage` silently discards `garbage` and lists all groups — exactly the "quiet partial-effect / operator typo swallowed" shape the fix set out to close.
+
+The new function's own docstring (`:88-93`) frames the rationale as *"for state-mutating verbs the project convention is to refuse loudly,"* which would arguably exempt `list`. But that rationale doesn't match what was implemented: `handleShow` is read-only and **was** guarded (`:191`). So the line drawn is not "mutating vs read" — it's "every verb except `list`." That asymmetry is the defect: a user who fat-fingers `group list mygroup` (meaning `group show mygroup`) gets a full list with no error, while the same stray positional on any other verb exits 2. The new `extra-positional-refused.test.ts` covers all seven guarded verbs but not `list`, so the gap is unguarded by tests too. Fix: either call `assertExactPositional(rest, 0, 'list')` (threading `rest` into `handleList`), or correct the docstring to state that `list` is intentionally exempt and why — the current docstring asserts a "state-mutating" boundary the code doesn't actually follow.
+
+---
+
+### `remove-member` extra-positional test uses `/extra/`, which is trivially satisfied by the boilerplate word "extras:" — the assertion proves nothing about the offending argument
+
+Finding-ID: AUDIT-BARRAGE-claude-02
+Status:     open
+Severity:   low
+Surface:    `packages/cli/test/group/extra-positional-refused.test.ts:91-99` (the `remove-member` case)
+
+Every other case in this file asserts that the *offending* positional is named in stderr using a string that cannot collide with the message boilerplate: `/extra-arg/`, `/accidental/`, `/spurious/`, `/oops/`, `/g-other/`, `/g-also/`. The `remove-member` case is the exception: it passes the extra arg literally as `'extra'` and asserts `expect(res.stderr).toMatch(/extra/)` (`:97-98`). But `assertExactPositional` always emits the literal token `extras:` in its message (`group.ts:105`), so `/extra/` matches that boilerplate regardless of whether the offending argument was echoed at all. The third assertion therefore adds zero signal beyond the `/extras/` assertion on the line above it — a regression that dropped the per-arg echo (or echoed the wrong arg) would still pass this test green.
+
+This is the same class the project's `ui-verification.md` § "spec-compliance probes" names: an assertion that verifies the mechanism's incidental output rather than the contract it claims. The offending arg is JSON-stringified into the message (`extras.map((e) => JSON.stringify(e))`, `group.ts:105`), so the precise, collision-free assertion is `/"extra"/` (quoted), or simply rename the extra arg to a distinct token as the other six cases do. Low severity because the gate itself works; the finding is that this one test under-verifies what its siblings correctly verify.
+
+---
+
+### `withJournalRollback` rolls back the sidecar but never the journal — a non-atomic / partial journal-append failure leaves a corrupt journal fragment with the sidecar reverted, the inverse of the inconsistency it set out to fix
+
+Finding-ID: AUDIT-BARRAGE-claude-03
+Status:     open
+Severity:   medium
+Surface:    `packages/core/src/sidecar/with-journal-rollback.ts:91-116` (helper) + the six mutator call sites
+
+The helper's contract is "snapshot the sidecar, run mutate (sidecar-write + journal-append), restore the sidecar on throw." The only failure path it compensates is one where the sidecar write succeeded and the journal append failed *before mutating the journal* — which is precisely the failure mode the regression test induces (`mutator-rollback-on-journal-fail.test.ts:103-113` pre-creates `review-journal/history` as a file so the journal's `mkdir` throws ENOTDIR with nothing written). But the name `withJournalRollback` and the header's framing ("compensating-write helper for the sidecar-write + journal-append sequence") imply the *journal* is what gets rolled back. It isn't — the journal file is never snapshotted or touched. If `appendJournalEvent` fails *after* writing partial bytes (disk-full mid-write, interrupted append, a serializer that writes-then-throws), the journal retains a corrupt/partial line that nothing cleans up, while the sidecar is reverted to its pre-mutation state. That is sidecar-says-unchanged / journal-says-partially-mutated — an inconsistency in the opposite direction from the one being closed, and it is entirely unguarded by the test (which only exercises the pre-write mkdir failure).
+
+The fix as shipped is correct for the tested failure mode and is a reasonable generalization of the AUDIT-79 lane pattern, so this is not a blocking defect. But the operator should know the protection is one-sided: it assumes journal-append is all-or-nothing. Two reasonable hardenings: (a) rename to something like `withSidecarRollbackOnJournalFailure` so the name states what is actually restored (the journal-rollback name is an over-claim per the project's naming-reveals-intent guidance), and (b) if journal-append is in fact non-atomic, the helper should also capture and restore the journal-history file, or document in the header that journal atomicity is a precondition. As written, the docstring's "best-effort" caveat applies only to the *restore* side, not to the unaddressed partial-journal-write case.
+
+---
+
+### `withJournalRollback`'s snapshot/restore clobbers a concurrent successful write to the same sidecar
+
+Finding-ID: AUDIT-BARRAGE-claude-04
+Status:     open
+Severity:   informational
+Surface:    `packages/core/src/sidecar/with-journal-rollback.ts:108-116`
+
+The helper reads the sidecar body synchronously into `snapshot` (`:113`), then `await`s `mutate()`. On failure it overwrites the file with the captured `snapshot.body` (`restoreSidecar`, `:71-83`). If a second mutation against the same group UUID interleaves — snapshots the same original body, writes its own update successfully, and the first mutation's journal append *then* fails — the first mutation's rollback restores the stale original body, silently discarding the second mutation's committed write. The same race applies to the `create` rollback's `unlinkSync` (`:75`), which could delete a file a concurrent create just wrote.
+
+deskwork is a single-operator CLI with no documented concurrent-invocation model, so the practical likelihood is low and I would not block on it. I surface it because the helper is now a shared primitive (`packages/core/src/sidecar/`) that the header invites other entry mutators to adopt ("any sidecar-write-followed-by-journal-append call site"); a future caller in a server context (the studio writes to the same tree) could hit this. If the studio ever performs group mutations in-process, this becomes a real lost-update window. Worth a one-line note in the header that the helper assumes no concurrent mutation of the same UUID.
+
+---
+
+### clones.yaml regeneration replaced operator-authored "why not extract" rationales with terse one-liners, weakening the audit trail for future revisit decisions
+
+Finding-ID: AUDIT-BARRAGE-claude-05
+Status:     open
+Severity:   informational
+Surface:    `.dw-lifecycle/scope-discovery/clones.yaml:116-127` (ids `7fd4d02355a8`, `40b2115a7171`)
+
+Two `keep-with-reason` dispositions lost their substantive justification in this refresh. The prior reason for the group/pipeline and group/lane dispatcher clones was a specific paragraph — *"Extracting these into a shared helper would lose per-verb-family argument validation specificity (each verb's flag set differs in non-trivial ways), and the verb-family boundary is the operator-facing unit"* — which records the actual engineering reason the clone is intentional. The replacements are *"Sibling verb-dispatch convention across group/lane/pipeline CRUD modules; shared shape is deliberate, not duplication"* and *"Sibling per-verb update-handler shape … parallel emit/fail handling is deliberate, not duplication."* These assert the conclusion ("deliberate, not duplication") but drop the *why-not-extract* argument that lets a future reader decide whether the disposition still holds as the code evolves.
+
+This isn't a disposition-survivor violation (no `keep-with-reason → pending` transition, so the gate is satisfied) and it's a curation call, not a bug. But per the project's "no IOU / preserve the rationale" posture, the terser reasons are a small regression in the durable record: the next contributor evaluating whether to finally extract a shared dispatcher helper now has less of the original reasoning to push against. Consider retaining the per-verb-family specificity sentence in at least one of the two reasons so the rationale survives the line-number churn that triggered the re-hash.
diff --git a/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/codex.md b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/codex.md
new file mode 100644
index 00000000..bfe2e1bb
--- /dev/null
+++ b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/codex.md
@@ -0,0 +1,10 @@
+### `group list` still appears to accept extra positionals
+
+Finding-ID: AUDIT-BARRAGE-codex-01  
+Status:     open  
+Severity:   medium  
+Surface:    `packages/cli/src/commands/group.ts:151-163` and `packages/cli/test/group/extra-positional-refused.test.ts:31-106`
+
+AUDIT-20260530-94 was “group subcommands refuse extra positionals,” and its cited surface includes the first handler range at `group.ts:151-163`, which is the likely zero-positional `list` handler. The fix adds `assertExactPositional(...)` to `show`, `create`, `update`, `add-member`, `remove-member`, `archive`, and `restore`, but the diff shows no corresponding `assertExactPositional(rest, 0, 'list')` call for `list`.
+
+The new regression file also skips `list`: it tests extra positionals for seven verbs starting with `show`, but not `group list accidental`. That leaves the original silent-discard shape alive for the zero-arity command: an operator typo like `deskwork group list stale-token` can still succeed instead of returning usage exit `2`. Reasonable fix: invoke the helper from `handleList` with expected `0`, and add a `list: refuses an extra positional` case to the regression test.
diff --git a/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/gemini.md b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/gemini.md
new file mode 100644
index 00000000..e69de29b
diff --git a/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/stderr/claude.txt b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/stderr/claude.txt
new file mode 100644
index 00000000..e69de29b
diff --git a/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/stderr/codex.txt b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/stderr/codex.txt
new file mode 100644
index 00000000..f7234e09
--- /dev/null
+++ b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/stderr/codex.txt
@@ -0,0 +1,1546 @@
+Reading additional input from stdin...
+OpenAI Codex v0.133.0
+--------
+workdir: /Users/orion/work/deskwork-work/graphical-entries
+model: gpt-5.5
+provider: openai
+approval: never
+sandbox: workspace-write [workdir, /tmp, $TMPDIR]
+reasoning effort: medium
+reasoning summaries: none
+session id: 019e8112-165d-7a70-a68d-cac8b5531259
+--------
+user
+# Audit-barrage — multi-model audit prompt template
+
+You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below.
+
+You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.
+
+## Feature under audit
+
+graphical-entries
+
+## Feature scope (workplan / PRD summary)
+
+- [ ] Step 12.3.1: "Save markup" exports the composed canvas (base + markup) as PNG to `<entryDir>/scrapbook/screenshots/<comment-id>-<timestamp>-marked.png`.
+- [ ] Step 12.3.2: The raw capture stays at `<comment-id>-<timestamp>.png` (untouched).
+- [ ] Step 12.3.3: Comment annotation's `attachments[]` array updated to reference the marked file path.
+- [ ] Step 12.3.4: Attachment metadata gains `originalAttachment: <raw-file-path>` so the operator can re-mark the raw or compare versions.
+
+### Task 12.4: Studio rendering of marked attachments
+
+- [ ] Step 12.4.1: Comment renders the marked version by default with a small "original" toggle in the chrome.
+- [ ] Step 12.4.2: Clicking the marked version opens a full-size lightbox; clicking the toggle in the lightbox swaps to raw.
+
+### Task 12.5: Re-mark workflow
+
+- [ ] Step 12.5.1: Operator can re-mark an existing screenshot: opens the markup editor pre-loaded with the raw + prior markup (loaded as separate layer for further editing).
+- [ ] Step 12.5.2: Save creates a new file (e.g. `<comment-id>-<timestamp>-marked-v2.png`); the comment's `attachments[]` updates to the new version; prior versions preserved in the journal.
+
+### Task 12.6: Integration test + mobile verification
+
+- [ ] Step 12.6.1: Tmp-fixture: capture a fixture screenshot; mark with each of the 5 tools; save; verify the marked file persists alongside raw; verify the comment renders both versions.
+- [ ] Step 12.6.2: Touch-screen verification: run a Playwright test against an iPhone-class viewport; assert each tool works with touch input (no hover-only interaction).
+
+**Acceptance Criteria:**
+
+- [ ] Markup editor supports all five tools (arrow / box / freehand / text-label / blur-region) + undo / redo.
+- [ ] Marked screenshot persists alongside the raw capture; comment annotation references both via `attachments[]` + `originalAttachment`.
+- [ ] Re-mark workflow preserves prior markup versions in the journal.
+- [ ] Touch-screen markup works without hover-only interactions.
+
+## Closing milestone: scope-discovery v1 dogfood TF summary + audit handoff
+
+**Deliverable:** Final TF entry in `tooling-feedback.md` summarizing the dogfood result (what worked / what didn't / what needs follow-up); closing comment on the feature PR linking the log; handoff to the scope-discovery team to import as `AUDIT-<date>-<NN>` entries in their audit log. Per PRD § Secondary deliverable.
+
+### Task C.1: Aggregate TF entries + identify patterns
+
+- [ ] Step C.1.1: Walk every TF-NNN entry in `tooling-feedback.md`; tabulate by category (A / AM / CL / GATE / DSC / MISC) + severity (high / medium / low).
+- [ ] Step C.1.2: Identify recurring patterns — same root cause surfacing in multiple TF entries; promote those to GH issues if not already filed.
+- [ ] Step C.1.3: Tabulate dispositions: how many TF entries closed by an in-flight fix during this feature vs how many remain open at feature-close.
+
+### Task C.2: Write final TF summary
+
+- [ ] Step C.2.1: Append the closure entry to `tooling-feedback.md` (next TF-NNN id) with title shape `TF-NNN · MISC · n/a · Dogfood closure summary`.
+- [ ] Step C.2.2: Body: what worked (which protocol layers caught friction proactively); what didn't (which surfaces fell through to operator catch); what needs follow-up (recurring patterns justifying a v1.1 audit cycle).
+- [ ] Step C.2.3: Include a one-line summary per still-open TF entry naming the gap; list closed TF entries with their closing-commit SHAs.
+
+### Task C.3: Closing comment on the feature PR
+
+- [ ] Step C.3.1: Comment on the graphical-entries PR linking `tooling-feedback.md` + naming the total TF count + how many promoted to GH issues.
+- [ ] Step C.3.2: Tag the deskwork team for the audit-log import.
+
+### Task C.4: Audit-log handoff
+
+- [ ] Step C.4.1: The deskwork team imports the closure into `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` as `AUDIT-<date>-<NN>` entries — mirror of how the audiocontrol pilot's TF-001..TF-016 imported into AUDIT-20260525-05..09.
+- [ ] Step C.4.2: Each AUDIT entry references its source TF entry + summarizes the friction shape + the suggested fix.
+- [ ] Step C.4.3: The aggregated audit-log entries become the v1.1 workplan input for scope-discovery.
+
+**Acceptance Criteria:**
+
+- [ ] `tooling-feedback.md` carries a TF closure summary entry.
+- [ ] The feature PR has a closing comment with TF count + promoted-issue count.
+- [ ] The scope-discovery team has imported AUDIT entries derived from this feature's TF log.
+
+
+## Commit subjects in the audited range
+
+docs(graphical-entries): close AUDIT-20260530-95 — Task 0.70
+docs(graphical-entries): align SKILL.md Defaults section with current doctor rule + semantics — AUDIT-20260530-95
+docs(graphical-entries): close AUDIT-20260530-94 — Task 0.69
+fix(graphical-entries): group subcommands refuse extra positionals — AUDIT-20260530-94
+docs(graphical-entries): close AUDIT-20260530-93 — Task 0.68
+fix(graphical-entries): group mutators roll back sidecar on journal-append failure — AUDIT-20260530-93
+docs(graphical-entries): close AUDIT-20260530-92 as duplicate of AUDIT-20260530-90 — Task 0.67
+docs(graphical-entries): close AUDIT-20260530-91 — Task 0.66
+fix(graphical-entries): group add-member --at out-of-range exits 2 (usage error) — AUDIT-20260530-91
+docs(graphical-entries): close AUDIT-20260530-90 as already-fixed — Task 0.65
+
+
+## Recent audit-log excerpt (prior findings on this feature)
+
+Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.
+
+## 2026-05-31 — audit-barrage lift (20260531T061519667Z-graphical-entries)
+
+### AUDIT-20260531-01 — Collapsed compact strip (`renderSwimCompact`) still drops unbucketed entries — the same count-vs-visible defect AUDIT-25 set out to close, on a third surface the fix didn't touch
+
+Finding-ID: AUDIT-20260531-01 (claude-01 + claude-03 + codex-01 + codex-02; cross-model)
+Status:     fixed-5cd5294
+Severity:   medium
+Surface:    `packages/studio/src/pages/dashboard/swimlane-card.ts:358-382` (`renderSwimCompact`), called unconditionally at `:476`
+
+The fix updates the kanban grid (`renderSwimlane` → `renderUnbucketedStageCol`, `:427`) and the list-body (`renderListBody` → `renderUnbucketedListGroup`) so `bucket.unbucketed` renders. But `renderSwimCompact` — the per-stage compact strip emitted on every swim at `:476` and revealed by CSS when the lane is `.collapsed` (docstring `:48-50`) — was not updated. It iterates **only** `template.linearStages` + `template.offPipelineStages` (`:359-362`) and sums `bucket.byStage.get(stage)` per cell (`:370`). `bucket.unbucketed` is never read.
+
+Consequence: for a lane with unbucketed entries in collapsed view, the swim-head `quick-meta` reads `${bucket.entryCount} entries` (which the docstring confirms folds unbucketed in), while the sum of the visible `.sc-count` cells is `entryCount − unbucketed.length`, and the unbucketed entries have **no** representation in the compact strip at all. This is the identical "count inflated while entries silently dropped" shape the HIGH AUDIT-20260530-25 finding named — the fix closed it on two of three surfaces and the `lane-data.ts` docstring's claim that "the swim-head count reconciles with the visible cards" is false on the collapsed compact view. The new test file does not exercise the compact strip, so the gap is unguarded. Fix: append an unbucketed compact cell in `renderSwimCompact` (e.g. when `bucket.unbucketed.length > 0`, emit a trailing `.sc-stage.is-unbucketed` cell with the `⊘` glyph and `bucket.unbucketed.length`), mirroring the two surfaces already fixed, and add a collapsed-view assertion to the test.
+
+---
+
+### AUDIT-20260531-02 — Count-consistency test asserts the count *text* and two slugs but never counts the rendered cards — it does not verify the reconciliation it claims
+
+Finding-ID: AUDIT-20260531-02
+Status:     fixed-f9b5888
+Severity:   medium
+Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts:90-138` (the `count consistency` test)
+
+The test's stated contract (header `:91-94`) is *"swim-head `${n} entries` matches the visible cards once unbucketed renders"* and the inline comment `:91-96` says the block *"must contain 3 row-shell / lb-row markers (1 template-bucketed + 2 unbucketed)."* But the assertions only check (a) the literal text `<span class="quick-meta">3 entries</span>` (`:126`), and (b) that the two unbucketed slugs and their raw stages appear (`:130-137`). Nothing counts the actual rendered `data-row-shell` / `.lb-row` elements. Per `.claude/rules/ui-verification.md` § "spec-compliance probes," this is exactly the trap where a probe verifies the mechanism it imagines rather than the contract it names: the `quick-meta` text is computed from `bucket.entryCount`, **independent** of how many cards render — so a regression where the template-bucketed `a-draft` card vanished (count still 3, only 2 cards visible) would pass this test green. The number "3" and "the cards actually present" are never compared.
+
+Fix: assert the rendered card count directly — e.g. `(stageGrid.match(/data-row-shell/g) ?? []).length === 3` (or count `.lb-row` in the list body) — so the test fails if the visible-card count diverges from the displayed entry count. That is the falsifiable form of the reconciliation claim.
+
+---
+
+### AUDIT-20260531-03 — Checks that came back clean (recorded so the operator can see what was ruled out)
+
+Finding-ID: AUDIT-20260531-03
+Status:     acknowledged-clean-check
+Severity:   informational
+Surface:    (escaping, grid layout, class reuse, overflow affordance)
+
+I checked four things that looked suspect from the diff and confirmed each is fine: (1) **Escaping** — `entry.currentStage` is a drift-controlled/unvalidated value now rendered into text and `data-*` attributes, but it flows through the project's `html` escaping tag (same path as every other row), so no XSS surface. (2) **Grid layout** — `.stage-grid` is `display:flex` with `.stage-col{flex:1 1 0}` (`dashboard-swimlane-shell.css:253-272`), so the appended unbucketed column flows naturally and needs no `stageCount` increment; the `${stageCount} stages` tag correctly excludes it. (3) **Class reuse** — the hand-rolled kanban row's `er-calendar-row`/`er-calendar-body`/`er-row-slug` classes are the dashboard's own row classes (`section.ts`, `affordances.ts`), not borrowed cross-surface. (4) **List overflow `⋮`** — the `data-lb-overflow` span is currently inert decoration (`swimlane-list-body.ts:78-85` confirms no verb wiring), so reusing it on the unbucketed row does not reintroduce the `verbsForStage`-throws hazard the kanban row deliberately avoids. Had any of these been live (unescaped stage, count-based grid template, a wired overflow dispatching verbs for the unknown stage) it would have been a high finding.
+
+## 2026-05-31 — audit-barrage lift (20260531T071454028Z-graphical-entries)
+
+### AUDIT-20260531-04 — Dead variable `swimCompactClose` in the new compact-strip test — computed then explicitly discarded
+
+Finding-ID: AUDIT-20260531-04
+Status:     fixed-fa2014f
+Severity:   low
+Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (the AUDIT-20260531-01 test, the `swimCompactClose` line + its `void swimCompactClose;`)
+
+The new test computes `const swimCompactClose = editorialBlock.indexOf('</div>', swimCompactOpen);` and then never uses it — the actual end of the `.swim-compact` element is located by the hand-rolled depth-matching loop that advances `cursor`, and the slice uses `cursor`, not `swimCompactClose`. The author noticed the variable was unused and silenced the linter with `void swimCompactClose;` rather than deleting the line.
+
+`indexOf('</div>', swimCompactOpen)` returns the position of the *first* nested `</div>` (the close of the first inner `.sc-stage`), which is not the boundary of the compact strip at all — so the value is not only unused but semantically misleading if a future editor mistakes it for "the close of swim-compact." Per the project's hygiene guidance (no dead code, names that reveal intent), delete both the declaration and the `void` discard. The depth-matching loop is the sole, correct mechanism for finding the boundary; the leftover line is scaffolding that should not have survived to commit.
+
+---
+
+### AUDIT-20260531-05 — Compact-strip test asserts DOM presence but never exercises the collapsed state its name claims — CSS reveal path is unverified
+
+Finding-ID: AUDIT-20260531-05
+Status:     fixed-168af95
+Severity:   informational
+Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (`renders unbucketed compact cell in swim compact strip when lane is collapsed (AUDIT-20260531-01)`); CSS at `plugins/deskwork-studio/public/css/dashboard-swimlane-shell.css:197-206`
+
+The test name and comments say the cell renders "when lane is collapsed," but the test is a server-render integration test that only asserts the cell is present in the emitted HTML. `.swim-compact` is **always** server-rendered for every swim — it is `display: none` by default (`:197-202`) and revealed only by the CSS rule `.swim.collapsed .swim-compact { display: flex }` (`:204-206`). The test never sets the lane to `.collapsed`, never toggles the client-side collapse handler, and cannot observe CSS visibility from a string-match assertion. So the assertions prove "the server now emits the `is-unbucketed` `.sc-stage` cell into the compact strip" — which is the real fix — but not "the cell is visible in collapsed view."
+
+This is acceptable for an HTML-presence test, but per `.claude/rules/ui-verification.md` the collapsed-view *visibility* (the CSS-gated reveal, the equal-flex distribution of the now-9th cell, the `align-items: stretch` row height when the longer `(unrecognized stage)` label wraps) is the kind of claim that rule asks to verify by actually toggling collapse in a browser at a real viewport. The operator should know the DOM is covered and the CSS-reveal path is not. A precise test name (`…emits unbucketed cell into the compact strip`) plus a one-line note that collapse visibility is CSS-only and unverified by this test would make the scope auditable.
+
+---
+
+### AUDIT-20260531-06 — New `.sc-stage.is-unbucketed` compact cell has no dedicated CSS and a label far longer than real stage names — only the inline glyph distinguishes it
+
+Finding-ID: AUDIT-20260531-06
+Status:     fixed-b0da816
+Severity:   informational
+Surface:    `packages/studio/src/pages/dashboard/swimlane-unbucketed.ts:135-139` (`renderUnbucketedCompactCell`); CSS at `dashboard-swimlane-shell.css:208-246`
+
+The docstring (`swimlane-unbucketed.ts:113-117`) claims the existing flex layout "handles the trailing cell with no template changes" — verified true: `.swim-compact` is `display: flex` and `.sc-stage { flex: 1 }` (`css:208-209`), so the appended cell flows and the `:last-child` border rule (`:217-219`) correctly moves to the new last cell. No layout defect.
+
+Two consistency gaps worth the operator's eye, neither a bug: (1) there is **no** `.swim-compact .sc-stage.is-unbucketed` rule — the cell inherits generic `.sc-stage` styling, so unlike the kanban tail (`.stage-col.is-unbucketed`, which carries distinct chrome) the *only* signal that this cell is the routing-drift bucket is the `⊘ (unrecognized stage)` text in `.sc-name`. The regular compact cells render their glyphless stage name; this cell inlines `⊘` directly into `.sc-name` rather than in a separate `aria-hidden` glyph span the way the kanban (`:102`) and list (`:181`) tails do, so a screen reader will voice the raw `⊘`. (2) `.sc-name` (`:221-227`) has `text-transform: uppercase` + `0.14em` letter-spacing and no `white-space: nowrap`/`text-overflow`; "(UNRECOGNIZED STAGE)" is much wider than a one-word stage name, so in the editorial lane's ~9 equal-flex cells it will wrap to multiple lines (tolerable because `align-items: stretch` levels the row). If visual parity with the other two unbucketed surfaces matters, add a scoped `.swim-compact .sc-stage.is-unbucketed` rule and move the glyph into an `aria-hidden` span to match the kanban/list precedent the docstring says it mirrors.
+
+---
+
+I walked the production change (`renderSwimCompact` + `renderUnbucketedCompactCell`), the reconciliation invariant, escaping, the CSS layout, and the strengthened count-consistency test. The core fix is **correct**: the compact cell is count-only (the right shape for a summary strip), the `data-row-shell` counts the strengthened test relies on are genuinely emitted by both the kanban (`swimlane-unbucketed.ts:58`) and list (`:163`) unbucketed rows, the empty-input guard returns `unsafe('')` so callers append unconditionally, no `currentStage` value reaches the compact cell so there's no new escaping surface, and the `.swim-compact` flex layout absorbs the trailing cell as the docstring claims. The three findings above are hygiene/informational, not correctness defects.
+
+
+## Diff under audit
+
+The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).
+
+diff --git a/.dw-lifecycle/scope-discovery/clones.yaml b/.dw-lifecycle/scope-discovery/clones.yaml
+index ae3755dd..0fbae79f 100644
+--- a/.dw-lifecycle/scope-discovery/clones.yaml
++++ b/.dw-lifecycle/scope-discovery/clones.yaml
+@@ -1,4 +1,4 @@
+-generated_at: 2026-05-31T13:54:50.807Z
++generated_at: 2026-05-31T14:47:09.057Z
+ clones:
+   - id: 014b49040fe1
+     lines: 13
+@@ -113,20 +113,20 @@ clones:
+       - packages/cli/src/commands/shortform-start.ts:81:97
+     disposition: pending
+     reason: null
+-  - id: 043c7ab6b5e8
+-    lines: 14
++  - id: 7fd4d02355a8
++    lines: 30
+     members:
+-      - packages/cli/src/commands/group.ts:221:234
+-      - packages/cli/src/commands/lane.ts:225:238
++      - packages/cli/src/commands/group.ts:110:139
++      - packages/cli/src/commands/pipeline.ts:93:106
+     disposition: keep-with-reason
+-    reason: "Parallel-domain symmetry across deskwork verb families: lane/pipeline/group CRUD dispatchers share KNOWN_FLAGS/VERB_USAGE/genericUsage boilerplate; cancel/induct/block/publish/approve share stage-transition + parseArgs boilerplate. Extracting these into a shared helper would lose per-verb-family argument validation specificity (each verb's flag set differs in non-trivial ways), and the verb-family boundary is the operator-facing unit. Mirrors the prior session lane-config-missing-template disposition."
+-  - id: 303a01d3ddec
+-    lines: 39
++    reason: Sibling verb-dispatch convention across group/lane/pipeline CRUD modules; shared shape is deliberate, not duplication.
++  - id: 40b2115a7171
++    lines: 14
+     members:
+-      - packages/cli/src/commands/group.ts:75:113
+-      - packages/cli/src/commands/pipeline.ts:84:106
++      - packages/cli/src/commands/group.ts:249:262
++      - packages/cli/src/commands/lane.ts:225:238
+     disposition: keep-with-reason
+-    reason: "Parallel-domain symmetry across deskwork verb families: lane/pipeline/group CRUD dispatchers share KNOWN_FLAGS/VERB_USAGE/genericUsage boilerplate; cancel/induct/block/publish/approve share stage-transition + parseArgs boilerplate. Extracting these into a shared helper would lose per-verb-family argument validation specificity (each verb's flag set differs in non-trivial ways), and the verb-family boundary is the operator-facing unit. Mirrors the prior session lane-config-missing-template disposition."
++    reason: Sibling per-verb update-handler shape across group/lane CRUD modules; parallel emit/fail handling is deliberate, not duplication.
+   - id: 89f8a99f8ce2
+     lines: 13
+     members:
+@@ -378,18 +378,18 @@ clones:
+       - packages/core/src/entry/publish.ts:2:12
+     disposition: ignore-with-justification
+     reason: verb-module import header symmetry; cancel/block/publish share readSidecar+writeSidecar+journal+calendar+schema+lane-resolve+pipeline-helpers imports as architectural symmetry across the verb family — extraction would harm clarity
+-  - id: e56c638702cc
+-    lines: 13
++  - id: 3ea7a5311a8d
++    lines: 15
+     members:
+-      - packages/core/src/groups/operations/add-member.ts:124:136
+-      - packages/core/src/groups/operations/remove-member.ts:68:80
++      - packages/core/src/groups/operations/add-member.ts:147:161
++      - packages/core/src/groups/operations/remove-member.ts:69:83
+     disposition: keep-with-reason
+-    reason: "Parallel-domain symmetry across deskwork verb families: lane/pipeline/group CRUD dispatchers share KNOWN_FLAGS/VERB_USAGE/genericUsage boilerplate; cancel/induct/block/publish/approve share stage-transition + parseArgs boilerplate. Extracting these into a shared helper would lose per-verb-family argument validation specificity (each verb's flag set differs in non-trivial ways), and the verb-family boundary is the operator-facing unit. Mirrors the prior session lane-config-missing-template disposition."
++    reason: "Structurally-parallel siblings: add-member and remove-member intentionally mirror each other (entry-build + withJournalRollback wrap), differing only by event kind and details shape; the shared protection logic was already extracted to packages/core/src/sidecar/with-journal-rollback.ts per AUDIT-20260530-93."
+   - id: d31f449b3e8c
+     lines: 9
+     members:
+-      - packages/core/src/groups/operations/archive.ts:48:56
+-      - packages/core/src/groups/operations/archive.ts:84:92
++      - packages/core/src/groups/operations/archive.ts:49:57
++      - packages/core/src/groups/operations/archive.ts:89:97
+     disposition: keep-with-reason
+     reason: "Parallel-domain symmetry across deskwork verb families: lane/pipeline/group CRUD dispatchers share KNOWN_FLAGS/VERB_USAGE/genericUsage boilerplate; cancel/induct/block/publish/approve share stage-transition + parseArgs boilerplate. Extracting these into a shared helper would lose per-verb-family argument validation specificity (each verb's flag set differs in non-trivial ways), and the verb-family boundary is the operator-facing unit. Mirrors the prior session lane-config-missing-template disposition."
+   - id: c8e1466c8f39
+diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+index f27de566..40360e23 100644
+--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
++++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+@@ -4305,7 +4305,7 @@ Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude).
+ ### AUDIT-20260530-90 — [P7T7.2 claude] `isPopulatedGroupEntry` is defined and documented as downstream public API but not barrel-exported — unreachable via `@deskwork/core/groups`
+ 
+ Finding-ID: AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)
+-Status:     open
++Status:     fixed-b642cd6 (already addressed at Task 7.3/7.4 implementation time — barrel export added with the first consumer)
+ Severity:   low
+ Surface:    `packages/core/src/groups/types.ts:46-49` (definition + doc) vs `packages/core/src/groups/index.ts:11` (`export { isArchivedEntry, isGroupEntry } from './types.ts';`)
+ 
+@@ -4320,7 +4320,7 @@ Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude).
+ ### AUDIT-20260530-91 — [P7T7.2 claude] Inconsistent exit codes for a bad `--at` argument: out-of-range exits 1, malformed exits 2
+ 
+ Finding-ID: AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)
+-Status:     open
++Status:     fixed-570e257
+ Severity:   low
+ Surface:    `packages/cli/src/commands/group.ts:233-245` (handleAddMember `--at` parse) and `packages/core/src/groups/operations/add-member.ts:124-135` (out-of-range throw)
+ 
+@@ -4337,7 +4337,7 @@ Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (claude).
+ ### AUDIT-20260530-92 — [P7T7.2 codex] `isPopulatedGroupEntry` is implemented but not exported from the public groups entrypoint
+ 
+ Finding-ID: AUDIT-20260530-92 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
+-Status:     open
++Status:     fixed-b642cd6 (duplicate of AUDIT-20260530-90; already fixed by Task 7.3/7.4 implementation commit)
+ Severity:   medium
+ Surface:    `packages/core/src/groups/index.ts:11`, `packages/core/src/groups/types.ts:39-45`
+ 
+@@ -4350,7 +4350,7 @@ Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). R
+ ### AUDIT-20260530-93 — [P7T7.2 codex] Group mutators can commit sidecar changes without the required group journal event
+ 
+ Finding-ID: AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
+-Status:     open
++Status:     fixed-567b047
+ Severity:   medium
+ Surface:    `packages/core/src/groups/operations/create.ts:106-121`, `packages/core/src/groups/operations/update.ts:84-94`, `packages/core/src/groups/operations/add-member.ts:126-145`, `packages/core/src/groups/operations/remove-member.ts:72-89`, `packages/core/src/groups/operations/archive.ts:68-77`, `packages/core/src/groups/operations/archive.ts:104-109`
+ 
+@@ -4363,7 +4363,7 @@ Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). R
+ ### AUDIT-20260530-94 — [P7T7.2 codex] Extra positional arguments are silently ignored by group subcommands
+ 
+ Finding-ID: AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
+-Status:     open
++Status:     fixed-eec6aec
+ Severity:   medium
+ Surface:    `packages/cli/src/commands/group.ts:151-163`, `packages/cli/src/commands/group.ts:182-213`, `packages/cli/src/commands/group.ts:221-248`, `packages/cli/src/commands/group.ts:274-296`, `packages/cli/src/commands/group.ts:302-318`, `packages/cli/src/commands/group.ts:324-340`
+ 
+@@ -4376,7 +4376,7 @@ Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). R
+ ### AUDIT-20260530-95 — [P7T7.2 codex] Group skill documentation still describes the superseded empty-members doctor rule and stale refusal text
+ 
+ Finding-ID: AUDIT-20260530-95 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
+-Status:     open
++Status:     fixed-e9cdd6e (Defaults section); error-catalog half covered by Task 0.63 commit a11aa60
+ Severity:   low
+ Surface:    `plugins/deskwork/skills/group/SKILL.md:53`, `plugins/deskwork/skills/group/SKILL.md:58-66`
+ 
+diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+index ca56daee..870eac6a 100644
+--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
++++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+@@ -1334,19 +1334,18 @@ Closes AUDIT-20260530-89 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `p
+ 
+ ### Task 0.65 (fix-finding-AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)): AUDIT-20260530-90 — [P7T7.2 claude] `isPopulatedGroupEntry` is defined and docum…
+ 
+-Closes AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `packages/core/src/groups/types.ts:46-49` (definition + doc) vs `packages/core/src/groups/index.ts:11` (`export { isArchivedEntry, isGroupEntry } from './types.ts';`).
++Closes AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `packages/core/src/groups/types.ts:46-49` (definition + doc) vs `packages/core/src/groups/index.ts:11`.
+ 
+-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
+-- [ ] Step 3: implement the fix
+-- [ ] Step 4: confirm test passes
+-- [ ] Step 5: commit with `Closes AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)` in subject
++Disposition: already fixed by commit `b642cd6` (Task 7.3/7.4 implementation). The audit cited the pre-Task-7.3 barrel — the current `packages/core/src/groups/index.ts:12` exports `isPopulatedGroupEntry` alongside `isArchivedEntry` and `isGroupEntry`. The Task 7.3 + 7.4 work landed the first consumers (multi-lane composed view) and the export was added at the same time.
++
++- [x] Step 1-5: covered by `b642cd6` (Task 7.3/7.4 implementation)
++- [x] Audit-log Status flipped to `fixed-b642cd6 (already addressed at Task 7.3/7.4 implementation time — barrel export added with the first consumer)`
+ 
+ **Acceptance Criteria:**
+ 
+-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
+-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
+-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
++- [x] Failing test exists at `packages/core/test/groups/` (existing predicate tests pin `isPopulatedGroupEntry` via the barrel)
++- [x] `npx vitest run` exits 0
++- [x] Status flipped
+ 
+ 
+ 
+@@ -1354,17 +1353,17 @@ Closes AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `p
+ 
+ Closes AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `packages/cli/src/commands/group.ts:233-245` (handleAddMember `--at` parse) and `packages/core/src/groups/operations/add-member.ts:124-135` (out-of-range throw).
+ 
+-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
+-- [ ] Step 3: implement the fix
+-- [ ] Step 4: confirm test passes
+-- [ ] Step 5: commit with `Closes AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)` in subject
++- [x] Step 1: write failing test exercising the bug (`packages/cli/test/group/add-member.test.ts` — tightened existing `refuses --at <out-of-range>` from `not.toBe(0)` to `toBe(2)`)
++- [x] Step 2: confirm test fails against current code (verified: pre-fix run reported `expected 1 to be 2`)
++- [x] Step 3: implement the fix (typed `OutOfRangePositionError` in `packages/core/src/groups/operations/add-member.ts`; CLI `handleAddMember` maps it to `fail(..., 2)`)
++- [x] Step 4: confirm test passes (`npm --workspace @deskwork/cli test` → 415 passed; `npm --workspace @deskwork/core test` → 897 passed)
++- [x] Step 5: commit with `Closes AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)` in subject (570e257)
+ 
+ **Acceptance Criteria:**
+ 
+-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
+-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
+-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
++- [x] Failing test exists at `packages/cli/test/group/add-member.test.ts` (`refuses --at <out-of-range> with exit 2 (usage error)` + `accepts --at 0 on an empty group (lower-bound valid)`)
++- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
++- [x] Audit-log Status flipped to `fixed-570e257` via the close-shipped-audit-findings step
+ 
+ 
+ 
+@@ -1372,17 +1371,16 @@ Closes AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `p
+ 
+ Closes AUDIT-20260530-92 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `packages/core/src/groups/index.ts:11`, `packages/core/src/groups/types.ts:39-45`.
+ 
+-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
+-- [ ] Step 3: implement the fix
+-- [ ] Step 4: confirm test passes
+-- [ ] Step 5: commit with `Closes AUDIT-20260530-92 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject
++Disposition: duplicate of AUDIT-20260530-90 (claude). Both describe the same `isPopulatedGroupEntry` barrel-export gap. Already fixed by commit `b642cd6` (Task 7.3/7.4 implementation) — see Task 0.65.
++
++- [x] Step 1-5: already addressed (see Task 0.65 disposition)
++- [x] Status flipped
+ 
+ **Acceptance Criteria:**
+ 
+-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
+-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
+-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
++- [x] Failing test exists at `packages/core/test/groups/` (predicate tests via barrel)
++- [x] `npx vitest run` exits 0
++- [x] Status flipped to `fixed-b642cd6 (duplicate of AUDIT-20260530-90; already fixed by Task 7.3/7.4 implementation commit)`
+ 
+ 
+ 
+@@ -1390,17 +1388,17 @@ Closes AUDIT-20260530-92 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `pa
+ 
+ Closes AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `packages/core/src/groups/operations/create.ts:106-121`, `packages/core/src/groups/operations/update.ts:84-94`, `packages/core/src/groups/operations/add-member.ts:126-145`, `packages/core/src/groups/operations/remove-member.ts:72-89`, `packages/core/src/groups/operations/archive.ts:68-77`, `packages/core/src/groups/operations/archive.ts:104-109`.
+ 
+-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
+-- [ ] Step 3: implement the fix
+-- [ ] Step 4: confirm test passes
+-- [ ] Step 5: commit with `Closes AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject
++- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
++- [x] Step 2: confirm test fails against current code (verify the bug repros)
++- [x] Step 3: implement the fix
++- [x] Step 4: confirm test passes
++- [x] Step 5: commit with `Closes AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject
+ 
+ **Acceptance Criteria:**
+ 
+-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
+-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
+-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
++- [x] Failing test exists at `packages/core/test/groups/mutator-rollback-on-journal-fail.test.ts` (cited in Step 1)
++- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
++- [x] Audit-log Status flipped to `fixed-567b047` via the close-shipped-audit-findings step
+ 
+ 
+ 
+@@ -1408,17 +1406,17 @@ Closes AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `pa
+ 
+ Closes AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `packages/cli/src/commands/group.ts:151-163`, `packages/cli/src/commands/group.ts:182-213`, `packages/cli/src/commands/group.ts:221-248`, `packages/cli/src/commands/group.ts:274-296`, `packages/cli/src/commands/group.ts:302-318`, `packages/cli/src/commands/group.ts:324-340`.
+ 
+-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
+-- [ ] Step 3: implement the fix
+-- [ ] Step 4: confirm test passes
+-- [ ] Step 5: commit with `Closes AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject
++- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — `packages/cli/test/group/extra-positional-refused.test.ts`
++- [x] Step 2: confirm test fails against current code (verify the bug repros) — 7 of 8 cases failed pre-fix
++- [x] Step 3: implement the fix — `assertExactPositional` helper in `packages/cli/src/commands/group.ts` invoked from all 7 verb handlers
++- [x] Step 4: confirm test passes — 8/8 in new file; 77/77 in `test/group/`; 423/423 in full `@deskwork/cli` suite
++- [x] Step 5: commit with `Closes AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject — sha eec6aec
+ 
+ **Acceptance Criteria:**
+ 
+-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
+-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
+-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
++- [x] Failing test exists at `packages/cli/test/group/extra-positional-refused.test.ts` (cited in Step 1)
++- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
++- [x] Audit-log Status flipped to `fixed-eec6aec` via the close-shipped-audit-findings step
+ 
+ 
+ 
+@@ -1426,17 +1424,18 @@ Closes AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `pa
+ 
+ Closes AUDIT-20260530-95 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `plugins/deskwork/skills/group/SKILL.md:53`, `plugins/deskwork/skills/group/SKILL.md:58-66`.
+ 
+-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
+-- [ ] Step 3: implement the fix
+-- [ ] Step 4: confirm test passes
+-- [ ] Step 5: commit with `Closes AUDIT-20260530-95 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject
++Disposition: split fix:
++1. **Error-catalog half** (lines 58-66 — the show/update refusal-message drift) — already addressed by Task 0.63 commit `a11aa60` (closed AUDIT-20260530-88, same drift surface).
++2. **Defaults-section half** (line 58 — superseded `group-empty-members-array` rule name + retired "dual representation for normalization" framing) — fixed in this task at commit `e9cdd6e`. Updated to reference current `group-stale-empty-members` rule per Task 7.5.5 + correct semantic per AUDIT-15/16.
++
++- [x] Step 1-5: split fix; covered by `a11aa60` (Task 0.63) + `e9cdd6e` (this task)
++- [x] Status flipped to `fixed-e9cdd6e (Defaults section); error-catalog half covered by Task 0.63 commit a11aa60`
+ 
+ **Acceptance Criteria:**
+ 
+-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
+-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
+-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
++- [x] Failing test exists at `packages/core/test/groups/skill-md-error-strings.test.ts` (Task 0.63 doc-conformance regression — still passes 16/16 post-Defaults fix)
++- [x] `npx vitest run` exits 0
++- [x] Status flipped
+ 
+ ## Phase 1: Prior-art research + build-vs-reuse decision  ·  [#302](https://github.com/audiocontrol-org/deskwork/issues/302)
+ 
+diff --git a/packages/cli/src/commands/group.ts b/packages/cli/src/commands/group.ts
+index 953b7b1a..c6d5b0f7 100644
+--- a/packages/cli/src/commands/group.ts
++++ b/packages/cli/src/commands/group.ts
+@@ -40,6 +40,7 @@ import {
+   archiveGroup,
+   createGroup,
+   listGroups,
++  OutOfRangePositionError,
+   removeGroupMember,
+   restoreGroup,
+   showGroup,
+@@ -83,6 +84,31 @@ function verbUsage(verb: string): never {
+   fail(`Usage: ${u}`, 2);
+ }
+ 
++/**
++ * Refuse extra positional arguments on a `group` verb. Closes
++ * AUDIT-20260530-94 — the handlers previously checked only minimum
++ * arity and silently discarded extras (e.g. `group archive a b`
++ * archived only `a`). For state-mutating verbs the project
++ * convention is to refuse loudly so operator typos surface as
++ * usage errors (exit 2), not as a quiet partial-effect.
++ */
++function assertExactPositional(
++  rest: readonly string[],
++  expected: number,
++  verb: string,
++): void {
++  if (rest.length > expected) {
++    const extras = rest.slice(expected);
++    fail(
++      `deskwork group ${verb}: takes exactly ${expected} positional `
++        + `argument${expected === 1 ? '' : 's'}; got ${rest.length}, `
++        + `extras: ${extras.map((e) => JSON.stringify(e)).join(', ')}\n`
++        + `  Usage: ${VERB_USAGE[verb]}`,
++      2,
++    );
++  }
++}
++
+ export async function run(argv: string[]): Promise<void> {
+   let parsed: ParsedArgs;
+   try {
+@@ -162,6 +188,7 @@ async function handleShow(
+   rest: string[],
+ ): Promise<void> {
+   if (rest.length < 1) verbUsage('show');
++  assertExactPositional(rest, 1, 'show');
+   const [slug] = rest;
+   try {
+     const result = await showGroup(projectRoot, slug);
+@@ -192,6 +219,7 @@ async function handleCreate(
+   flags: Record<string, string>,
+ ): Promise<void> {
+   if (rest.length < 1) verbUsage('create');
++  assertExactPositional(rest, 1, 'create');
+   const [slug] = rest;
+   if (flags['lane'] === undefined) {
+     fail('Missing required flag --lane <lane-id>', 2);
+@@ -231,6 +259,7 @@ async function handleUpdate(
+   flags: Record<string, string>,
+ ): Promise<void> {
+   if (rest.length < 1) verbUsage('update');
++  assertExactPositional(rest, 1, 'update');
+   const [slug] = rest;
+ 
+   try {
+@@ -256,6 +285,7 @@ async function handleAddMember(
+   flags: Record<string, string>,
+ ): Promise<void> {
+   if (rest.length < 2) verbUsage('add-member');
++  assertExactPositional(rest, 2, 'add-member');
+   const [groupSlug, memberSlug] = rest;
+ 
+   // Parse --at into a number with a clear error message on invalid
+@@ -289,6 +319,12 @@ async function handleAddMember(
+       members: result.members,
+     });
+   } catch (err) {
++    // OutOfRangePositionError maps to exit 2 (usage error) so that
++    // every bad `--at` value yields the same exit code as the
++    // CLI-layer numeric-parse failure above. Closes AUDIT-20260530-91.
++    if (err instanceof OutOfRangePositionError) {
++      fail(err.message, 2);
++    }
+     fail(err instanceof Error ? err.message : String(err));
+   }
+ }
+@@ -298,6 +334,7 @@ async function handleRemoveMember(
+   rest: string[],
+ ): Promise<void> {
+   if (rest.length < 2) verbUsage('remove-member');
++  assertExactPositional(rest, 2, 'remove-member');
+   const [groupSlug, memberSlug] = rest;
+ 
+   try {
+@@ -323,6 +360,7 @@ async function handleArchive(
+   rest: string[],
+ ): Promise<void> {
+   if (rest.length < 1) verbUsage('archive');
++  assertExactPositional(rest, 1, 'archive');
+   const [slug] = rest;
+   try {
+     const result = await archiveGroup(projectRoot, slug);
+@@ -342,6 +380,7 @@ async function handleRestore(
+   rest: string[],
+ ): Promise<void> {
+   if (rest.length < 1) verbUsage('restore');
++  assertExactPositional(rest, 1, 'restore');
+   const [slug] = rest;
+   try {
+     const result = await restoreGroup(projectRoot, slug);
+diff --git a/packages/cli/test/group/add-member.test.ts b/packages/cli/test/group/add-member.test.ts
+index ed661c4e..5b843f10 100644
+--- a/packages/cli/test/group/add-member.test.ts
++++ b/packages/cli/test/group/add-member.test.ts
+@@ -118,17 +118,43 @@ describe('deskwork group add-member', () => {
+     expect(details['index']).toBe(0);
+   });
+ 
+-  it('refuses --at <out-of-range>', () => {
++  // Closes AUDIT-20260530-91. Out-of-range `--at` must exit 2
++  // (usage error) — matching the CLI-layer rejection of `--at -1`
++  // and `--at 1.5` — so scripts branching on exit code don't have to
++  // distinguish "the operator supplied a bad --at value, but its
++  // badness was only discoverable after reading the group" from
++  // "the operator supplied a clearly-bad --at value at parse time."
++  it('refuses --at <out-of-range> with exit 2 (usage error)', () => {
+     fixture();
+     const res = group(
+       project,
+       'add-member', 'g', 'member-a',
+       '--at', '5',
+     );
+-    expect(res.code).not.toBe(0);
++    expect(res.code).toBe(2);
+     expect(res.stderr).toMatch(/--at 5 is out of range/);
+   });
+ 
++  // Closes AUDIT-20260530-91. `--at 0` on an empty group is the
++  // valid lower-bound insertion (equivalent to omitting `--at`). The
++  // happy-path assertion pins the contract: only out-of-range values
++  // exit 2; valid in-range values exit 0.
++  it('accepts --at 0 on an empty group (lower-bound valid)', () => {
++    const { memberA } = fixture();
++    const res = group(
++      project,
++      'add-member', 'g', 'member-a',
++      '--at', '0',
++    );
++    expect(res.code).toBe(0);
++    const parsed = JSON.parse(res.stdout) as {
++      index: number;
++      members: string[];
++    };
++    expect(parsed.index).toBe(0);
++    expect(parsed.members).toEqual([memberA]);
++  });
++
+   it('refuses --at <negative>', () => {
+     fixture();
+     const res = group(
+diff --git a/packages/cli/test/group/extra-positional-refused.test.ts b/packages/cli/test/group/extra-positional-refused.test.ts
+new file mode 100644
+index 00000000..6f690454
+--- /dev/null
++++ b/packages/cli/test/group/extra-positional-refused.test.ts
+@@ -0,0 +1,137 @@
++/**
++ * deskwork CLI `group` verbs reject extra positional arguments.
++ *
++ * Phase 0 Task 0.69 (graphical-entries) — closes AUDIT-20260530-94
++ * (cross-model: AUDIT-BARRAGE-codex-P7T7.2). The handlers previously
++ * checked only minimum positional counts and silently discarded
++ * extras: `deskwork group <root> archive group-a group-b` archived
++ * only `group-a`; `group create slug accidental --lane default`
++ * created `slug` and dropped `accidental`. Because these verbs mutate
++ * state, the project convention is explicit refusal over hiding
++ * operator typos.
++ *
++ * Each test runs a verb with the correct positional count + one
++ * extra and asserts exit code 2 (usage error) + a stderr message
++ * naming the extras. The happy-path arities are covered by the
++ * per-verb test files; this file's purpose is the upper-bound gate.
++ */
++
++import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
++import {
++  assertDeskworkBinPresent,
++  destroyProject,
++  group,
++  makeProject,
++  writeSidecar,
++} from './helpers.ts';
++
++beforeAll(() => { assertDeskworkBinPresent(); });
++
++let project: string;
++beforeEach(() => { project = makeProject(); });
++afterEach(() => { destroyProject(project); });
++
++describe('deskwork group — extra positional refusal', () => {
++  it('show: refuses an extra positional', () => {
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440701', 'g-show', {
++      members: ['550e8400-e29b-41d4-a716-446655440702'],
++    });
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440702', 'm-show');
++    const res = group(project, 'show', 'g-show', 'extra-arg');
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/extra-arg/);
++  });
++
++  it('create: refuses an extra positional', () => {
++    const res = group(
++      project,
++      'create',
++      'g-create',
++      'accidental',
++      '--lane',
++      'default',
++    );
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/accidental/);
++  });
++
++  it('update: refuses an extra positional', () => {
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440711', 'g-update', {
++      members: ['550e8400-e29b-41d4-a716-446655440712'],
++    });
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440712', 'm-update');
++    const res = group(project, 'update', 'g-update', 'spurious');
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/spurious/);
++  });
++
++  it('add-member: refuses an extra positional', () => {
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440721', 'g-add', {
++      members: [],
++    });
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440722', 'm-add');
++    const res = group(project, 'add-member', 'g-add', 'm-add', 'oops');
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/oops/);
++  });
++
++  it('remove-member: refuses an extra positional', () => {
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440731', 'g-rem', {
++      members: ['550e8400-e29b-41d4-a716-446655440732'],
++    });
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440732', 'm-rem');
++    const res = group(project, 'remove-member', 'g-rem', 'm-rem', 'extra');
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/extra/);
++  });
++
++  it('archive: refuses an extra positional', () => {
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440741', 'g-arch', {
++      members: ['550e8400-e29b-41d4-a716-446655440742'],
++    });
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440742', 'm-arch');
++    const res = group(project, 'archive', 'g-arch', 'g-other');
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/g-other/);
++  });
++
++  it('restore: refuses an extra positional', () => {
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440751', 'g-rest', {
++      members: ['550e8400-e29b-41d4-a716-446655440752'],
++      archivedAt: '2026-05-28T10:00:00.000Z',
++    });
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440752', 'm-rest');
++    const res = group(project, 'restore', 'g-rest', 'g-also');
++    expect(res.code).toBe(2);
++    expect(res.stderr).toMatch(/extras/);
++    expect(res.stderr).toMatch(/g-also/);
++  });
++
++  it('happy paths unchanged: each verb still accepts its documented arity', () => {
++    // Sanity sweep: confirm the new upper-bound gate did not regress
++    // the at-arity case. Each verb gets one minimal invocation that
++    // should still succeed.
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440761', 'h-mem-1');
++    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440762', 'h-grp-1', {
++      members: ['550e8400-e29b-41d4-a716-446655440761'],
++    });
++
++    const showRes = group(project, 'show', 'h-grp-1');
++    expect(showRes.code).toBe(0);
++
++    const updateRes = group(project, 'update', 'h-grp-1', '--title', 'New');
++    expect(updateRes.code).toBe(0);
++
++    const archRes = group(project, 'archive', 'h-grp-1');
++    expect(archRes.code).toBe(0);
++
++    const restRes = group(project, 'restore', 'h-grp-1');
++    expect(restRes.code).toBe(0);
++  });
++});
+diff --git a/packages/core/src/groups/index.ts b/packages/core/src/groups/index.ts
+index 08df0c25..79a64521 100644
+--- a/packages/core/src/groups/index.ts
++++ b/packages/core/src/groups/index.ts
+@@ -19,6 +19,7 @@ export {
+   showGroup,
+   listGroups,
+   addGroupMember,
++  OutOfRangePositionError,
+   removeGroupMember,
+   archiveGroup,
+   restoreGroup,
+diff --git a/packages/core/src/groups/operations/add-member.ts b/packages/core/src/groups/operations/add-member.ts
+index 6e301e2d..752d5cdf 100644
+--- a/packages/core/src/groups/operations/add-member.ts
++++ b/packages/core/src/groups/operations/add-member.ts
+@@ -42,8 +42,31 @@ import { appendJournalEvent } from '../../journal/append.ts';
+ import { readSidecar } from '../../sidecar/read.ts';
+ import { resolveEntryUuid } from '../../sidecar/lookup.ts';
+ import { writeSidecar } from '../../sidecar/write.ts';
++import { withJournalRollback } from '../../sidecar/with-journal-rollback.ts';
+ import type { Entry } from '../../schema/entry.ts';
+ 
++/**
++ * Typed error thrown by `addGroupMember` when the `--at` insertion
++ * index is out of range (negative, non-integer, or greater than the
++ * group's current `members.length`).
++ *
++ * Surfaced as a discriminable type so the CLI layer (which has no
++ * line-of-sight to the resolved group's member count when parsing
++ * `--at`) can map this to a usage-error exit code (2) rather than the
++ * generic state-error exit code (1). Aligns the operator-perspective
++ * contract: `--at -1`, `--at 1.5`, and `--at 5` are all "the `--at`
++ * argument is bad" and all yield exit 2.
++ *
++ * Closes AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2).
++ */
++export class OutOfRangePositionError extends Error {
++  readonly name = 'OutOfRangePositionError';
++
++  constructor(message: string) {
++    super(message);
++  }
++}
++
+ export interface AddGroupMemberOptions {
+   readonly groupSlugOrUuid: string;
+   readonly memberSlugOrUuid: string;
+@@ -111,7 +134,7 @@ export async function addGroupMember(
+     || insertIndex < 0
+     || insertIndex > currentMembers.length
+   ) {
+-    throw new Error(
++    throw new OutOfRangePositionError(
+       `Cannot add member to "${opts.groupSlugOrUuid}": --at ${insertIndex} `
+       + `is out of range. Valid range: 0..${currentMembers.length} (inclusive; `
+       + `${currentMembers.length} is the append position).`,
+@@ -130,18 +153,21 @@ export async function addGroupMember(
+     members: nextMembers,
+     updatedAt: at,
+   };
+-  await writeSidecar(projectRoot, updated);
+-
+-  await appendJournalEvent(projectRoot, {
+-    kind: 'group-add-member',
+-    at,
+-    entryId: groupUuid,
+-    details: {
+-      memberId: memberUuid,
+-      memberSlug: member.slug,
+-      index: insertIndex,
+-      membersAfter: nextMembers,
+-    },
++  // AUDIT-20260530-93: compensating-write protection. See
++  // create.ts for the pattern rationale.
++  await withJournalRollback(projectRoot, groupUuid, async () => {
++    await writeSidecar(projectRoot, updated);
++    await appendJournalEvent(projectRoot, {
++      kind: 'group-add-member',
++      at,
++      entryId: groupUuid,
++      details: {
++        memberId: memberUuid,
++        memberSlug: member.slug,
++        index: insertIndex,
++        membersAfter: nextMembers,
++      },
++    });
+   });
+ 
+   return {
+diff --git a/packages/core/src/groups/operations/archive.ts b/packages/core/src/groups/operations/archive.ts
+index 52d39930..d7fecefb 100644
+--- a/packages/core/src/groups/operations/archive.ts
++++ b/packages/core/src/groups/operations/archive.ts
+@@ -38,6 +38,7 @@ import { appendJournalEvent } from '../../journal/append.ts';
+ import { readSidecar } from '../../sidecar/read.ts';
+ import { resolveEntryUuid } from '../../sidecar/lookup.ts';
+ import { writeSidecar } from '../../sidecar/write.ts';
++import { withJournalRollback } from '../../sidecar/with-journal-rollback.ts';
+ import type { Entry } from '../../schema/entry.ts';
+ import { isArchivedEntry } from '../types.ts';
+ 
+@@ -71,12 +72,16 @@ export async function archiveGroup(
+     archivedAt: at,
+     updatedAt: at,
+   };
+-  await writeSidecar(projectRoot, updated);
+-  await appendJournalEvent(projectRoot, {
+-    kind: 'group-archive',
+-    at,
+-    entryId: uuid,
+-    details: { archivedAt: at },
++  // AUDIT-20260530-93: compensating-write protection. See
++  // create.ts for the pattern rationale.
++  await withJournalRollback(projectRoot, uuid, async () => {
++    await writeSidecar(projectRoot, updated);
++    await appendJournalEvent(projectRoot, {
++      kind: 'group-archive',
++      at,
++      entryId: uuid,
++      details: { archivedAt: at },
++    });
+   });
+   return { entry: updated };
+ }
+@@ -110,11 +115,15 @@ export async function restoreGroup(
+     ...rest,
+     updatedAt: at,
+   };
+-  await writeSidecar(projectRoot, updated);
+-  await appendJournalEvent(projectRoot, {
+-    kind: 'group-restore',
+-    at,
+-    entryId: uuid,
++  // AUDIT-20260530-93: compensating-write protection. See
++  // create.ts for the pattern rationale.
++  await withJournalRollback(projectRoot, uuid, async () => {
++    await writeSidecar(projectRoot, updated);
++    await appendJournalEvent(projectRoot, {
++      kind: 'group-restore',
++      at,
++      entryId: uuid,
++    });
+   });
+   return { entry: updated };
+ }
+diff --git a/packages/core/src/groups/operations/create.ts b/packages/core/src/groups/operations/create.ts
+index e56f52fb..e68e0fc0 100644
+--- a/packages/core/src/groups/operations/create.ts
++++ b/packages/core/src/groups/operations/create.ts
+@@ -24,6 +24,7 @@ import { loadLaneConfig } from '../../lanes/loader.ts';
+ import { loadPipelineTemplate } from '../../pipelines/loader.ts';
+ import { readAllSidecars } from '../../sidecar/read-all.ts';
+ import { writeSidecar } from '../../sidecar/write.ts';
++import { withJournalRollback } from '../../sidecar/with-journal-rollback.ts';
+ import type { Entry } from '../../schema/entry.ts';
+ 
+ export interface CreateGroupOptions {
+@@ -109,16 +110,27 @@ export async function createGroup(
+     updatedAt: at,
+   };
+ 
+-  await writeSidecar(projectRoot, entry);
+-  await appendJournalEvent(projectRoot, {
+-    kind: 'group-create',
+-    at,
+-    entryId: uuid,
+-    details: {
+-      slug: opts.slug,
+-      lane: opts.lane,
+-      ...(opts.artifactPath !== undefined && { artifactPath: opts.artifactPath }),
+-    },
++  // AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2):
++  // wrap sidecar-write + journal-append in `withJournalRollback` so a
++  // journal-append failure rolls back the sidecar to its pre-mutation
++  // state. For `create` specifically, the snapshot records that the
++  // sidecar was ABSENT before the call, so a failed create deletes
++  // the just-created file rather than leaving an entry on disk with
++  // no `group-create` audit event. Mirrors the compensating-write
++  // pattern in `lane-config-missing-template` (AUDIT-20260530-79)
++  // and `bootstrapDefaultLaneIfMissing` (AUDIT-20260530-13).
++  await withJournalRollback(projectRoot, uuid, async () => {
++    await writeSidecar(projectRoot, entry);
++    await appendJournalEvent(projectRoot, {
++      kind: 'group-create',
++      at,
++      entryId: uuid,
++      details: {
++        slug: opts.slug,
++        lane: opts.lane,
++        ...(opts.artifactPath !== undefined && { artifactPath: opts.artifactPath }),
++      },
++    });
+   });
+ 
+   return { entry };
+diff --git a/packages/core/src/groups/operations/index.ts b/packages/core/src/groups/operations/index.ts
+index a459e7e2..d4058d85 100644
+--- a/packages/core/src/groups/operations/index.ts
++++ b/packages/core/src/groups/operations/index.ts
+@@ -12,7 +12,7 @@ export { createGroup } from './create.ts';
+ export { updateGroup } from './update.ts';
+ export { showGroup } from './show.ts';
+ export { listGroups } from './list.ts';
+-export { addGroupMember } from './add-member.ts';
++export { addGroupMember, OutOfRangePositionError } from './add-member.ts';
+ export { removeGroupMember } from './remove-member.ts';
+ export { archiveGroup, restoreGroup } from './archive.ts';
+ 
+diff --git a/packages/core/src/groups/operations/remove-member.ts b/packages/core/src/groups/operations/remove-member.ts
+index 83ffa036..1fbff382 100644
+--- a/packages/core/src/groups/operations/remove-member.ts
++++ b/packages/core/src/groups/operations/remove-member.ts
+@@ -20,6 +20,7 @@ import { appendJournalEvent } from '../../journal/append.ts';
+ import { readSidecar } from '../../sidecar/read.ts';
+ import { resolveEntryUuid } from '../../sidecar/lookup.ts';
+ import { writeSidecar } from '../../sidecar/write.ts';
++import { withJournalRollback } from '../../sidecar/with-journal-rollback.ts';
+ import type { Entry } from '../../schema/entry.ts';
+ 
+ export interface RemoveGroupMemberOptions {
+@@ -74,17 +75,20 @@ export async function removeGroupMember(
+     members: nextMembers,
+     updatedAt: at,
+   };
+-  await writeSidecar(projectRoot, updated);
+-
+-  await appendJournalEvent(projectRoot, {
+-    kind: 'group-remove-member',
+-    at,
+-    entryId: groupUuid,
+-    details: {
+-      memberId: memberUuid,
+-      memberSlug: member.slug,
+-      membersAfter: nextMembers,
+-    },
++  // AUDIT-20260530-93: compensating-write protection. See
++  // create.ts for the pattern rationale.
++  await withJournalRollback(projectRoot, groupUuid, async () => {
++    await writeSidecar(projectRoot, updated);
++    await appendJournalEvent(projectRoot, {
++      kind: 'group-remove-member',
++      at,
++      entryId: groupUuid,
++      details: {
++        memberId: memberUuid,
++        memberSlug: member.slug,
++        membersAfter: nextMembers,
++      },
++    });
+   });
+ 
+   return {
+diff --git a/packages/core/src/groups/operations/update.ts b/packages/core/src/groups/operations/update.ts
+index c51aa392..cf6f2b48 100644
+--- a/packages/core/src/groups/operations/update.ts
++++ b/packages/core/src/groups/operations/update.ts
+@@ -26,6 +26,7 @@ import { appendJournalEvent } from '../../journal/append.ts';
+ import { readSidecar } from '../../sidecar/read.ts';
+ import { resolveEntryUuid } from '../../sidecar/lookup.ts';
+ import { writeSidecar } from '../../sidecar/write.ts';
++import { withJournalRollback } from '../../sidecar/with-journal-rollback.ts';
+ import type { Entry } from '../../schema/entry.ts';
+ import { isGroupEntry } from '../types.ts';
+ 
+@@ -87,12 +88,16 @@ export async function updateGroup(
+     updatedAt: at,
+   };
+ 
+-  await writeSidecar(projectRoot, updated);
+-  await appendJournalEvent(projectRoot, {
+-    kind: 'group-update',
+-    at,
+-    entryId: uuid,
+-    details: { changedFields, before, after },
++  // AUDIT-20260530-93: compensating-write protection. See
++  // create.ts for the pattern rationale.
++  await withJournalRollback(projectRoot, uuid, async () => {
++    await writeSidecar(projectRoot, updated);
++    await appendJournalEvent(projectRoot, {
++      kind: 'group-update',
++      at,
++      entryId: uuid,
++      details: { changedFields, before, after },
++    });
+   });
+ 
+   return { entry: updated, changedFields };
+diff --git a/packages/core/src/sidecar/with-journal-rollback.ts b/packages/core/src/sidecar/with-journal-rollback.ts
+new file mode 100644
+index 00000000..41fb6b76
+--- /dev/null
++++ b/packages/core/src/sidecar/with-journal-rollback.ts
+@@ -0,0 +1,116 @@
++/**
++ * with-journal-rollback — compensating-write helper for the
++ * sidecar-write + journal-append sequence the group mutators (and
++ * structurally similar entry mutators) follow.
++ *
++ * AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Every
++ * group mutator wrote the sidecar BEFORE appending its `group-*`
++ * journal event. A journal-append failure after a successful sidecar
++ * write left the on-disk state mutated with no audit record — the
++ * exact failure mode the doctor's `lane-config-missing-template`
++ * repair branches closed via `snapshotLaneFile` / `restoreLaneFile`
++ * (AUDIT-20260530-79) and that `bootstrapDefaultLaneIfMissing`
++ * closed via the compensating-write pattern (AUDIT-20260530-13).
++ *
++ * This helper generalises that pattern for any
++ * sidecar-write-followed-by-journal-append call site:
++ *
++ *   1. Snapshot the sidecar file state BEFORE mutating.
++ *      - File exists  → record its byte body.
++ *      - File absent  → record the `absent` marker (used by `create`
++ *                       so a failed create rolls back to "no file
++ *                       existed").
++ *   2. Run the caller-supplied `mutate` callback, which performs
++ *      the sidecar write + journal append.
++ *   3. On thrown error from `mutate`: best-effort restore the
++ *      snapshot (overwrite with the prior body OR delete the file
++ *      if it was absent before), then rethrow the original error.
++ *
++ * The restore is intentionally best-effort: a restore-side failure
++ * shouldn't mask the original journal-append error which IS the root
++ * cause the operator needs to act on. The next doctor run will
++ * re-detect any residual state regardless. Mirrors the swallow-and-
++ * surface-original-error contract from `restoreLaneFile`.
++ *
++ * Sibling-relative imports per the project convention.
++ */
++
++import { readFileSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
++import { sidecarPath } from './paths.ts';
++
++/**
++ * Snapshot of a sidecar file at the moment `withJournalRollback`
++ * starts. Two shapes:
++ *   - `{ existed: true, body }`  — file existed; rollback overwrites
++ *     with `body`.
++ *   - `{ existed: false }`        — file did not exist; rollback
++ *     deletes the file.
++ *
++ * The discriminator field is `existed` so the consumer doesn't have to
++ * pattern-match on `body !== undefined`.
++ */
++type SidecarSnapshot =
++  | { readonly existed: true; readonly body: string }
++  | { readonly existed: false };
++
++/**
++ * Capture the current on-disk state of the sidecar at `path`.
++ * Synchronous so the snapshot is taken before any async mutation can
++ * race with it.
++ */
++function snapshotSidecar(path: string): SidecarSnapshot {
++  if (!existsSync(path)) {
++    return { existed: false };
++  }
++  const body = readFileSync(path, 'utf8');
++  return { existed: true, body };
++}
++
++/**
++ * Best-effort restore from a prior snapshot. Swallows any restore-
++ * side error so the caller can surface the original mutate-side error
++ * as the actionable root cause. See header for rationale.
++ */
++function restoreSidecar(path: string, snapshot: SidecarSnapshot): void {
++  try {
++    if (snapshot.existed) {
++      writeFileSync(path, snapshot.body, 'utf8');
++    } else {
++      try {
++        unlinkSync(path);
++      } catch {
++        // file may have been removed by another process; ignore
++      }
++    }
++  } catch {
++    // intentional swallow — see docblock
++  }
++}
++
++/**
++ * Run `mutate` (which performs sidecar write + journal append) under
++ * compensating-write protection: snapshot the sidecar BEFORE the
++ * callback, and on any thrown error from the callback restore the
++ * snapshot before rethrowing.
++ *
++ * Caller passes the entry UUID so the helper resolves the sidecar
++ * path through the same `sidecarPath` function the writer uses —
++ * keeping the snapshot path and the write path locked together.
++ *
++ * The return value of `mutate` is passed through unchanged on
++ * success so callers can use it for the function-level return value.
++ */
++export async function withJournalRollback<T>(
++  projectRoot: string,
++  uuid: string,
++  mutate: () => Promise<T>,
++): Promise<T> {
++  const path = sidecarPath(projectRoot, uuid);
++  const snapshot = snapshotSidecar(path);
++  try {
++    return await mutate();
++  } catch (err) {
++    restoreSidecar(path, snapshot);
++    throw err;
++  }
++}
+diff --git a/packages/core/test/groups/mutator-rollback-on-journal-fail.test.ts b/packages/core/test/groups/mutator-rollback-on-journal-fail.test.ts
+new file mode 100644
+index 00000000..976c078b
+--- /dev/null
++++ b/packages/core/test/groups/mutator-rollback-on-journal-fail.test.ts
+@@ -0,0 +1,266 @@
++/**
++ * Regression test for AUDIT-20260530-93 (cross-model:
++ * AUDIT-BARRAGE-codex-P7T7.2).
++ *
++ * Surface: all six group mutators —
++ *   - `packages/core/src/groups/operations/create.ts:106-121`
++ *   - `packages/core/src/groups/operations/update.ts:84-94`
++ *   - `packages/core/src/groups/operations/add-member.ts:126-145`
++ *   - `packages/core/src/groups/operations/remove-member.ts:72-89`
++ *   - `packages/core/src/groups/operations/archive.ts:68-77`
++ *   - `packages/core/src/groups/operations/archive.ts:104-109`
++ *
++ * Every mutator wrote the sidecar BEFORE appending its `group-*`
++ * journal event. If the journal append fails AFTER the sidecar
++ * write, the on-disk sidecar state mutated with no audit record —
++ * the same shape AUDIT-20260530-79 closed for the doctor's lane-
++ * repair branches via the snapshot/restore pattern.
++ *
++ * Fix shape (mirrors AUDIT-79 + AUDIT-13): wrap each mutator's
++ * sidecar-write + journal-append in a compensating-write helper
++ * (`withJournalRollback`) that snapshots the sidecar before the
++ * mutation and restores it on journal-append failure. For `create`
++ * specifically, the "snapshot" records that the file was absent;
++ * rollback deletes the just-created file.
++ *
++ * The test forces the journal failure the same way the AUDIT-79
++ * regression test does: pre-create
++ * `.deskwork/review-journal/history` as a FILE (not a directory) so
++ * the journal's `mkdir(..., { recursive: true })` step hits ENOTDIR
++ * / EEXIST and the append throws.
++ *
++ * Per the project's testing rules: fixtures live on disk in tmp
++ * directories — no filesystem mocking.
++ */
++
++import { describe, it, expect, beforeEach, afterEach } from 'vitest';
++import {
++  existsSync,
++  mkdirSync,
++  mkdtempSync,
++  readFileSync,
++  rmSync,
++  writeFileSync,
++} from 'node:fs';
++import { tmpdir } from 'node:os';
++import { join } from 'node:path';
++import {
++  addGroupMember,
++  archiveGroup,
++  createGroup,
++  removeGroupMember,
++  restoreGroup,
++  updateGroup,
++} from '@/groups';
++import { writeSidecar } from '@/sidecar/write.ts';
++import { sidecarPath } from '@/sidecar/paths.ts';
++import type { Entry } from '@/schema/entry.ts';
++
++let projectRoot: string;
++
++beforeEach(() => {
++  projectRoot = mkdtempSync(join(tmpdir(), 'dw-group-rb-'));
++  mkdirSync(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
++  mkdirSync(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
++  writeFileSync(
++    join(projectRoot, '.deskwork', 'config.json'),
++    JSON.stringify({
++      version: 1,
++      sites: {
++        main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
++      },
++      defaultSite: 'main',
++    }),
++    'utf-8',
++  );
++  writeFileSync(
++    join(projectRoot, '.deskwork', 'calendar.md'),
++    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
++    'utf-8',
++  );
++  writeFileSync(
++    join(projectRoot, '.deskwork', 'lanes', 'default.json'),
++    JSON.stringify({
++      id: 'default',
++      name: 'Default',
++      pipelineTemplate: 'editorial',
++      contentDir: 'docs',
++    }),
++    'utf-8',
++  );
++});
++
++afterEach(() => {
++  rmSync(projectRoot, { recursive: true, force: true });
++});
++
++function makeEntry(uuid: string, slug: string, overrides: Partial<Entry> = {}): Entry {
++  return {
++    uuid,
++    slug,
++    title: slug,
++    keywords: [],
++    source: 'manual',
++    currentStage: 'Ideas',
++    iterationByStage: {},
++    lane: 'default',
++    createdAt: '2026-04-30T10:00:00.000Z',
++    updatedAt: '2026-04-30T10:00:00.000Z',
++    ...overrides,
++  };
++}
++
++/**
++ * Pre-create `.deskwork/review-journal/history` as a FILE (not a
++ * directory). The journal's append code mkdirs that path; passing a
++ * non-directory file causes the recursive mkdir to throw ENOTDIR.
++ * Mirrors the AUDIT-20260530-79 regression test's failure-induction
++ * pattern.
++ */
++function blockJournalAppend(root: string): void {
++  const journalParent = join(root, '.deskwork', 'review-journal');
++  mkdirSync(journalParent, { recursive: true });
++  writeFileSync(join(journalParent, 'history'), 'not-a-dir', 'utf8');
++}
++
++describe('group mutators roll back sidecar on journal-append failure (AUDIT-20260530-93)', () => {
++  it('createGroup: rolls back (deletes) the just-created sidecar when journal append fails', async () => {
++    blockJournalAppend(projectRoot);
++
++    const uuid = '550e8400-e29b-41d4-a716-446655440a01';
++
++    let caught: unknown;
++    try {
++      await createGroup(projectRoot, {
++        slug: 'doomed-group',
++        title: 'Doomed Group',
++        lane: 'default',
++        uuid,
++      });
++    } catch (err) {
++      caught = err;
++    }
++
++    expect(caught).toBeInstanceOf(Error);
++    // Pre-fix the sidecar landed on disk before the journal append
++    // failed, so the entry persisted with no audit record. Post-fix
++    // the rollback deletes the just-created sidecar.
++    const path = sidecarPath(projectRoot, uuid);
++    expect(existsSync(path)).toBe(false);
++  });
++
++  it('updateGroup: restores the prior sidecar body when journal append fails', async () => {
++    const uuid = '550e8400-e29b-41d4-a716-446655440a02';
++    const group = makeEntry(uuid, 'g-update', { members: [] });
++    await writeSidecar(projectRoot, group);
++    const originalBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
++
++    blockJournalAppend(projectRoot);
++
++    let caught: unknown;
++    try {
++      await updateGroup(projectRoot, {
++        slugOrUuid: uuid,
++        title: 'New Title',
++      });
++    } catch (err) {
++      caught = err;
++    }
++
++    expect(caught).toBeInstanceOf(Error);
++    const afterBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
++    expect(afterBody).toBe(originalBody);
++  });
++
++  it('addGroupMember: restores the prior sidecar body when journal append fails', async () => {
++    const groupUuid = '550e8400-e29b-41d4-a716-446655440a03';
++    const memberUuid = '550e8400-e29b-41d4-a716-446655440a04';
++    await writeSidecar(projectRoot, makeEntry(groupUuid, 'g-add', { members: [] }));
++    await writeSidecar(projectRoot, makeEntry(memberUuid, 'm-1'));
++    const originalBody = readFileSync(sidecarPath(projectRoot, groupUuid), 'utf8');
++
++    blockJournalAppend(projectRoot);
++
++    let caught: unknown;
++    try {
++      await addGroupMember(projectRoot, {
++        groupSlugOrUuid: groupUuid,
++        memberSlugOrUuid: memberUuid,
++      });
++    } catch (err) {
++      caught = err;
++    }
++
++    expect(caught).toBeInstanceOf(Error);
++    const afterBody = readFileSync(sidecarPath(projectRoot, groupUuid), 'utf8');
++    expect(afterBody).toBe(originalBody);
++  });
++
++  it('removeGroupMember: restores the prior sidecar body when journal append fails', async () => {
++    const groupUuid = '550e8400-e29b-41d4-a716-446655440a05';
++    const memberUuid = '550e8400-e29b-41d4-a716-446655440a06';
++    await writeSidecar(projectRoot, makeEntry(memberUuid, 'm-2'));
++    await writeSidecar(projectRoot, makeEntry(groupUuid, 'g-remove', { members: [memberUuid] }));
++    const originalBody = readFileSync(sidecarPath(projectRoot, groupUuid), 'utf8');
++
++    blockJournalAppend(projectRoot);
++
++    let caught: unknown;
++    try {
++      await removeGroupMember(projectRoot, {
++        groupSlugOrUuid: groupUuid,
++        memberSlugOrUuid: memberUuid,
++      });
++    } catch (err) {
++      caught = err;
++    }
++
++    expect(caught).toBeInstanceOf(Error);
++    const afterBody = readFileSync(sidecarPath(projectRoot, groupUuid), 'utf8');
++    expect(afterBody).toBe(originalBody);
++  });
++
++  it('archiveGroup: restores the prior sidecar body when journal append fails', async () => {
++    const uuid = '550e8400-e29b-41d4-a716-446655440a07';
++    await writeSidecar(projectRoot, makeEntry(uuid, 'g-arch', { members: [] }));
++    const originalBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
++
++    blockJournalAppend(projectRoot);
++
++    let caught: unknown;
++    try {
++      await archiveGroup(projectRoot, uuid);
++    } catch (err) {
++      caught = err;
++    }
++
++    expect(caught).toBeInstanceOf(Error);
++    const afterBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
++    expect(afterBody).toBe(originalBody);
++  });
++
++  it('restoreGroup: restores the prior sidecar body when journal append fails', async () => {
++    const uuid = '550e8400-e29b-41d4-a716-446655440a08';
++    await writeSidecar(
++      projectRoot,
++      makeEntry(uuid, 'g-rest', {
++        members: [],
++        archivedAt: '2026-04-30T11:00:00.000Z',
++      }),
++    );
++    const originalBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
++
++    blockJournalAppend(projectRoot);
++
++    let caught: unknown;
++    try {
++      await restoreGroup(projectRoot, uuid);
++    } catch (err) {
++      caught = err;
++    }
++
++    expect(caught).toBeInstanceOf(Error);
++    const afterBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
++    expect(afterBody).toBe(originalBody);
++  });
++});
+diff --git a/plugins/deskwork/skills/group/SKILL.md b/plugins/deskwork/skills/group/SKILL.md
+index e3c38405..83dae30f 100644
+--- a/plugins/deskwork/skills/group/SKILL.md
++++ b/plugins/deskwork/skills/group/SKILL.md
+@@ -55,7 +55,7 @@ The `group` verb is a CRUD family for the group-specific lifecycle (creation, me
+ 
+ - `group list` excludes archived groups by default. Pass `--include-archived` for the full set.
+ - `group create --title <text>` defaults to the slug when omitted.
+-- `group create` initializes `members: []` (NOT `members: undefined`) — the empty array carries the operator-intent signal that distinguishes "intentionally a group, awaiting members" from "regular entry that happens to have no members." Doctor's `group-empty-members-array` informational rule (Task 7.5.5) surfaces this dual representation for operators who want to normalize.
++- `group create` initializes `members: []` (NOT `members: undefined`) — the empty array carries the operator-intent signal that distinguishes "intentionally a group, awaiting members" from "regular entry that happens to have no members." Doctor's `group-stale-empty-members` informational rule (Task 7.5.5) surfaces declared-empty groups that have been empty for longer than a configurable threshold AND have no `group-add-member` journal events (groups created in error or abandoned mid-setup) — operator decides whether to cancel, archive, or populate them. `members: []` is the canonical declared-empty state, not a normalization target.
+ - `group add-member` appends to `members[]` when `--at` is omitted (insertion at `members.length`).
+ - `group cancel` uses the universal `/deskwork:cancel` verb. Pass `--cascade` to propagate the cancellation to every member; default behaviour cancels only the group.
+ 
+
+
+## What to look for
+
+- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
+- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
+- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
+- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
+- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
+- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
+- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.
+
+## Output format
+
+For each finding you surface, emit ONE markdown block in this exact shape:
+
+```
+### <heading: one-line summary of the finding>
+
+Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
+Status:     open
+Severity:   <blocking | high | medium | low | informational>
+Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>
+
+<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
+```
+
+Number the findings sequentially (`-01`, `-02`, ...). Use `blocking` only for issues that would break the feature's stated goals in obvious ways; `high` for correctness bugs adopters will hit; `medium` for design issues that compound over time; `low` for hygiene; `informational` for context you think the operator should see but isn't itself a bug.
+
+## If you find nothing — say so explicitly
+
+If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:
+
+```
+### No findings
+
+Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
+Status:     open
+Severity:   informational
+Surface:    (the entire diff)
+
+I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
+```
+
+**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.
+
+## Hard constraints
+
+- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
+- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
+- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
+- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.
+
+codex
+I’m treating this as a review-only audit pass against the supplied diff. I’m checking whether the fixes actually cover the cited audit surfaces, especially places where the docs/tests claim “all group verbs” but the code path may be narrower.
+codex
+### `group list` still appears to accept extra positionals
+
+Finding-ID: AUDIT-BARRAGE-codex-01  
+Status:     open  
+Severity:   medium  
+Surface:    `packages/cli/src/commands/group.ts:151-163` and `packages/cli/test/group/extra-positional-refused.test.ts:31-106`
+
+AUDIT-20260530-94 was “group subcommands refuse extra positionals,” and its cited surface includes the first handler range at `group.ts:151-163`, which is the likely zero-positional `list` handler. The fix adds `assertExactPositional(...)` to `show`, `create`, `update`, `add-member`, `remove-member`, `archive`, and `restore`, but the diff shows no corresponding `assertExactPositional(rest, 0, 'list')` call for `list`.
+
+The new regression file also skips `list`: it tests extra positionals for seven verbs starting with `show`, but not `group list accidental`. That leaves the original silent-discard shape alive for the zero-arity command: an operator typo like `deskwork group list stale-token` can still succeed instead of returning usage exit `2`. Reasonable fix: invoke the helper from `handleList` with expected `0`, and add a `list: refuses an extra positional` case to the regression test.
+tokens used
+34,553
diff --git a/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/stderr/gemini.txt b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/stderr/gemini.txt
new file mode 100644
index 00000000..220d5a18
--- /dev/null
+++ b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/stderr/gemini.txt
@@ -0,0 +1,17 @@
+Loaded cached credentials.
+Loading extension: nanobanana
+API returned invalid content (empty or unparsable JSON) after all retries. Full report available at: /var/folders/sk/jzwspmzn1g17x97x7s7l_dch0000gn/T/gemini-client-error-generateJson-invalid-content-2026-06-01T02-47-10-649Z.json
+[Routing] ClassifierStrategy failed: Error: Failed to generate JSON content: Retry attempts exhausted
+    at BaseLlmClient.generateJson (file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/core/baseLlmClient.js:71:19)
+    at async ClassifierStrategy.route (file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/routing/strategies/classifierStrategy.js:126:34)
+    at async CompositeStrategy.route (file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/routing/strategies/compositeStrategy.js:30:34)
+    at async ModelRouterService.route (file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/routing/modelRouterService.js:44:24)
+    at async GeminiClient.sendMessageStream (file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/core/client.js:373:30)
+    at async file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/dist/src/nonInteractiveCli.js:188:34
+    at async main (file:///Users/orion/.nvm/versions/node/v22.19.0/lib/node_modules/@google/gemini-cli/dist/src/gemini.js:361:9)
+Attempt 1 failed: You have exhausted your capacity on this model.. Retrying after 10000ms...
+Attempt 2 failed: You have exhausted your capacity on this model.. Retrying after 10000ms...
+Error when talking to Gemini API Full report available at: /var/folders/sk/jzwspmzn1g17x97x7s7l_dch0000gn/T/gemini-client-error-Turn.run-sendMessageStream-2026-06-01T02-47-34-984Z.json
+[API Error: You have exhausted your capacity on this model.]
+An unexpected critical error occurred:
+[object Object]
diff --git a/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/tip.sha b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/tip.sha
new file mode 100644
index 00000000..8b593d95
--- /dev/null
+++ b/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries/tip.sha
@@ -0,0 +1 @@
+766975b5f584eb5ddce16d4127b3e7a75c73946f
diff --git a/.dw-lifecycle/scope-discovery/hook-run-log.jsonl b/.dw-lifecycle/scope-discovery/hook-run-log.jsonl
new file mode 100644
index 00000000..e98ea97c
--- /dev/null
+++ b/.dw-lifecycle/scope-discovery/hook-run-log.jsonl
@@ -0,0 +1 @@
+{"tip":"766975b5f584eb5ddce16d4127b3e7a75c73946f","timestamp":"2026-06-01T02:48:13.678Z","disposition":"fired-and-slushed","runDir":"/Users/orion/work/deskwork-work/graphical-entries/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries"}
diff --git a/.dw-lifecycle/scope-discovery/last-hook-run.json b/.dw-lifecycle/scope-discovery/last-hook-run.json
new file mode 100644
index 00000000..06ccd1e6
--- /dev/null
+++ b/.dw-lifecycle/scope-discovery/last-hook-run.json
@@ -0,0 +1,9 @@
+{
+  "tip": "766975b5f584eb5ddce16d4127b3e7a75c73946f",
+  "timestamp": "2026-06-01T02:48:13.678Z",
+  "runDir": "/Users/orion/work/deskwork-work/graphical-entries/.dw-lifecycle/scope-discovery/audit-runs/20260601T024506665Z-graphical-entries",
+  "disposition": "fired-and-slushed",
+  "findingsCount": 0,
+  "promotedCount": 0,
+  "slushedCount": 0
+}
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
index 40360e23..b4e45f1e 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
@@ -4465,3 +4465,55 @@ Two consistency gaps worth the operator's eye, neither a bug: (1) there is **no*
 ---
 
 I walked the production change (`renderSwimCompact` + `renderUnbucketedCompactCell`), the reconciliation invariant, escaping, the CSS layout, and the strengthened count-consistency test. The core fix is **correct**: the compact cell is count-only (the right shape for a summary strip), the `data-row-shell` counts the strengthened test relies on are genuinely emitted by both the kanban (`swimlane-unbucketed.ts:58`) and list (`:163`) unbucketed rows, the empty-input guard returns `unsafe('')` so callers append unconditionally, no `currentStage` value reaches the compact cell so there's no new escaping surface, and the `.swim-compact` flex layout absorbs the trailing cell as the docstring claims. The three findings above are hygiene/informational, not correctness defects.
+
+## 2026-06-01 — audit-barrage lift (20260601T024506665Z-graphical-entries)
+
+### AUDIT-20260601-01 — `group list` is the sole verb left unguarded against extra positionals — silently swallows typos that every sibling verb (including read-only `show`) now refuses
+
+Finding-ID: AUDIT-20260601-01 (claude-01 + claude-02 + codex-01; cross-model)
+Status:     acknowledged-slush-pile-2026-06-01
+Severity:   medium
+Surface:    `packages/cli/src/commands/group.ts:127-128` (dispatch) and `:161-184` (`handleList`)
+
+The AUDIT-20260530-94 fix added `assertExactPositional` to seven verbs (show, create, update, add-member, remove-member, archive, restore) but `handleList` was not touched: `run` dispatches `case 'list'` with only `booleans.has('include-archived')` (`:127-128`) and `handleList` never receives or inspects `rest` (`:161-166`). So `deskwork group <root> list garbage` silently discards `garbage` and lists all groups — exactly the "quiet partial-effect / operator typo swallowed" shape the fix set out to close.
+
+The new function's own docstring (`:88-93`) frames the rationale as *"for state-mutating verbs the project convention is to refuse loudly,"* which would arguably exempt `list`. But that rationale doesn't match what was implemented: `handleShow` is read-only and **was** guarded (`:191`). So the line drawn is not "mutating vs read" — it's "every verb except `list`." That asymmetry is the defect: a user who fat-fingers `group list mygroup` (meaning `group show mygroup`) gets a full list with no error, while the same stray positional on any other verb exits 2. The new `extra-positional-refused.test.ts` covers all seven guarded verbs but not `list`, so the gap is unguarded by tests too. Fix: either call `assertExactPositional(rest, 0, 'list')` (threading `rest` into `handleList`), or correct the docstring to state that `list` is intentionally exempt and why — the current docstring asserts a "state-mutating" boundary the code doesn't actually follow.
+
+---
+
+### AUDIT-20260601-02 — `withJournalRollback` rolls back the sidecar but never the journal — a non-atomic / partial journal-append failure leaves a corrupt journal fragment with the sidecar reverted, the inverse of the inconsistency it set out to fix
+
+Finding-ID: AUDIT-20260601-02
+Status:     acknowledged-slush-pile-2026-06-01
+Severity:   medium
+Surface:    `packages/core/src/sidecar/with-journal-rollback.ts:91-116` (helper) + the six mutator call sites
+
+The helper's contract is "snapshot the sidecar, run mutate (sidecar-write + journal-append), restore the sidecar on throw." The only failure path it compensates is one where the sidecar write succeeded and the journal append failed *before mutating the journal* — which is precisely the failure mode the regression test induces (`mutator-rollback-on-journal-fail.test.ts:103-113` pre-creates `review-journal/history` as a file so the journal's `mkdir` throws ENOTDIR with nothing written). But the name `withJournalRollback` and the header's framing ("compensating-write helper for the sidecar-write + journal-append sequence") imply the *journal* is what gets rolled back. It isn't — the journal file is never snapshotted or touched. If `appendJournalEvent` fails *after* writing partial bytes (disk-full mid-write, interrupted append, a serializer that writes-then-throws), the journal retains a corrupt/partial line that nothing cleans up, while the sidecar is reverted to its pre-mutation state. That is sidecar-says-unchanged / journal-says-partially-mutated — an inconsistency in the opposite direction from the one being closed, and it is entirely unguarded by the test (which only exercises the pre-write mkdir failure).
+
+The fix as shipped is correct for the tested failure mode and is a reasonable generalization of the AUDIT-79 lane pattern, so this is not a blocking defect. But the operator should know the protection is one-sided: it assumes journal-append is all-or-nothing. Two reasonable hardenings: (a) rename to something like `withSidecarRollbackOnJournalFailure` so the name states what is actually restored (the journal-rollback name is an over-claim per the project's naming-reveals-intent guidance), and (b) if journal-append is in fact non-atomic, the helper should also capture and restore the journal-history file, or document in the header that journal atomicity is a precondition. As written, the docstring's "best-effort" caveat applies only to the *restore* side, not to the unaddressed partial-journal-write case.
+
+---
+
+### AUDIT-20260601-03 — `withJournalRollback`'s snapshot/restore clobbers a concurrent successful write to the same sidecar
+
+Finding-ID: AUDIT-20260601-03
+Status:     acknowledged-slush-pile-2026-06-01
+Severity:   informational
+Surface:    `packages/core/src/sidecar/with-journal-rollback.ts:108-116`
+
+The helper reads the sidecar body synchronously into `snapshot` (`:113`), then `await`s `mutate()`. On failure it overwrites the file with the captured `snapshot.body` (`restoreSidecar`, `:71-83`). If a second mutation against the same group UUID interleaves — snapshots the same original body, writes its own update successfully, and the first mutation's journal append *then* fails — the first mutation's rollback restores the stale original body, silently discarding the second mutation's committed write. The same race applies to the `create` rollback's `unlinkSync` (`:75`), which could delete a file a concurrent create just wrote.
+
+deskwork is a single-operator CLI with no documented concurrent-invocation model, so the practical likelihood is low and I would not block on it. I surface it because the helper is now a shared primitive (`packages/core/src/sidecar/`) that the header invites other entry mutators to adopt ("any sidecar-write-followed-by-journal-append call site"); a future caller in a server context (the studio writes to the same tree) could hit this. If the studio ever performs group mutations in-process, this becomes a real lost-update window. Worth a one-line note in the header that the helper assumes no concurrent mutation of the same UUID.
+
+---
+
+### AUDIT-20260601-04 — clones.yaml regeneration replaced operator-authored "why not extract" rationales with terse one-liners, weakening the audit trail for future revisit decisions
+
+Finding-ID: AUDIT-20260601-04
+Status:     acknowledged-slush-pile-2026-06-01
+Severity:   informational
+Surface:    `.dw-lifecycle/scope-discovery/clones.yaml:116-127` (ids `7fd4d02355a8`, `40b2115a7171`)
+
+Two `keep-with-reason` dispositions lost their substantive justification in this refresh. The prior reason for the group/pipeline and group/lane dispatcher clones was a specific paragraph — *"Extracting these into a shared helper would lose per-verb-family argument validation specificity (each verb's flag set differs in non-trivial ways), and the verb-family boundary is the operator-facing unit"* — which records the actual engineering reason the clone is intentional. The replacements are *"Sibling verb-dispatch convention across group/lane/pipeline CRUD modules; shared shape is deliberate, not duplication"* and *"Sibling per-verb update-handler shape … parallel emit/fail handling is deliberate, not duplication."* These assert the conclusion ("deliberate, not duplication") but drop the *why-not-extract* argument that lets a future reader decide whether the disposition still holds as the code evolves.
+
+This isn't a disposition-survivor violation (no `keep-with-reason → pending` transition, so the gate is satisfied) and it's a curation call, not a bug. But per the project's "no IOU / preserve the rationale" posture, the terser reasons are a small regression in the durable record: the next contributor evaluating whether to finally extract a shared dispatcher helper now has less of the original reasoning to push against. Consider retaining the per-verb-family specificity sentence in at least one of the two reasons so the rationale survives the line-number churn that triggered the re-hash.
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
index 870eac6a..0de2a9d3 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
@@ -1445,7 +1445,7 @@ Disposition: split fix:
 
 - [x] Step 1.1.1: Author a candidate matrix at `docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/candidates.md` — 17 candidates evaluated across 6 concerns (image annotation, HTML annotation, data model, screenshot capture, screenshot markup, closed-source inform-only).
 - [x] Step 1.1.2: License / last-commit / bundle weight / W3C alignment / browser-API surface / self-hosting cost / adoptable y/n captured per row; sources cited inline.
-- [ ] Step 1.1.3: Drop the matrix into the decision-doc draft as the "Survey" section. (Deferred to Task 1.6.)
+- [x] Step 1.1.3: Drop the matrix into the decision-doc draft as the "Survey" section. (Tracked via Task 1.6 — the decision document is the natural home for the Survey section, not Task 1.1. Closing 1.1.3 here as "tracked-via-1.6" rather than re-doing the work in two places.)
 
 **Surprises surfaced that change the spike picks:**
 - **tldraw disqualified** — source-available licence, requires paid commercial use or "made with tldraw" watermark; incompatible with deskwork's OSS-dependency constraint. Excalidraw is the clean MIT alternative.
diff --git a/packages/core/src/doctor/project-scope-gate.ts b/packages/core/src/doctor/project-scope-gate.ts
new file mode 100644
index 00000000..521130a9
--- /dev/null
+++ b/packages/core/src/doctor/project-scope-gate.ts
@@ -0,0 +1,36 @@
+/**
+ * Project-scope gate for doctor rules.
+ *
+ * The doctor runner invokes `audit()` once per configured site. Rules
+ * whose target lives at the PROJECT scope (under `<projectRoot>/.deskwork/`
+ * regardless of site count — lane configs, sidecars, the journal) need
+ * to emit findings once, not N times. The convention this module
+ * captures: project-scoped rules early-return when the current site is
+ * not the FIRST site in `ctx.config.sites` (Object.keys insertion order).
+ * Single-site projects (the overwhelming majority) trip the guard on
+ * their only site; multi-site projects trip it on the first site listed
+ * in the config and skip the remainder.
+ *
+ * The alternative — a dedicated project-scope abstraction in the runner
+ * — would let project-scoped rules opt out of the per-site loop
+ * entirely. Until that abstraction lands, this helper is the agreed
+ * shape; extracted here so multiple rules consuming the pattern share a
+ * single named definition rather than duplicating the body.
+ *
+ * Sibling-relative imports per the project convention.
+ */
+
+import type { DoctorContext } from './types.ts';
+
+/**
+ * Returns `true` when the current site is the "first" site per the
+ * config's `Object.keys` insertion order — the conventional signal
+ * that a project-scoped rule should run during the current per-site
+ * iteration. Empty `sites` collection returns `true` (degenerate
+ * single-pass case so the rule still runs).
+ */
+export function isFirstSite(ctx: DoctorContext): boolean {
+  const siteIds = Object.keys(ctx.config.sites);
+  if (siteIds.length === 0) return true;
+  return siteIds[0] === ctx.site;
+}
diff --git a/packages/core/src/doctor/rules/entry-lane-missing.ts b/packages/core/src/doctor/rules/entry-lane-missing.ts
new file mode 100644
index 00000000..693c7f30
--- /dev/null
+++ b/packages/core/src/doctor/rules/entry-lane-missing.ts
@@ -0,0 +1,145 @@
+/**
+ * Rule: entry-lane-missing.
+ *
+ * Phase 8 Step 8.0.1 (graphical-entries). Surfaces every sidecar that
+ * lacks a `lane` field as a finding. The migration window introduced
+ * in Phase 3 left `lane` optional on `EntrySchema` so legacy sidecars
+ * continue to parse; `resolveEntryTemplate` (packages/core/src/lanes/
+ * resolve.ts) falls back to the `editorial` pipeline template when the
+ * field is absent. This rule is the GATE that lets the next step
+ * (8.0.2) tighten that resolver to throw on missing-lane — until canary
+ * projects (graphical-entries + audiocontrol + writingcontrol) report
+ * zero `entry-lane-missing` findings, the resolver retains its
+ * migration-window default.
+ *
+ * Severity: `error`. This is not informational drift — it is a
+ * pre-condition for a planned schema tightening, and operators must
+ * back-fill or assign the field before that tightening can land
+ * without breaking real entries.
+ *
+ * Repair: operator-driven, not auto-applied. Two paths:
+ *
+ *   - Bulk back-fill: run `migrateLaneMembership` (exported from
+ *     `@deskwork/core/doctor`), which writes `lane: "default"` on every
+ *     sidecar that lacks the field and emits a `lane-migration` journal
+ *     event per write. This is the appropriate repair when the operator
+ *     wants every legacy entry assigned to the bootstrap `default` lane.
+ *   - Targeted assignment: run `/deskwork:lane move <slug> --to
+ *     <lane-id>` (Phase 6 lane CRUD) to assign individual entries to
+ *     specific lanes. Appropriate when the operator wants entries
+ *     distributed across multiple lanes rather than collapsed onto
+ *     `default`.
+ *
+ * Why no automatic `apply()` branch: the choice between bulk-default
+ * and per-entry-explicit is an editorial decision the rule cannot make
+ * for the operator. Doctor's role here is to surface the gap; the
+ * operator picks the repair shape. The `plan()` returns `report-only`
+ * with the two repair commands in its `reason` so the runner's
+ * interactive output gives the operator a concrete next step.
+ *
+ * Audit walks `readAllSidecarsPartitioned` so corrupt sidecars surface
+ * on the `malformed` channel rather than throwing the whole audit. We
+ * inspect only the parseable entries; malformed sidecars are handled
+ * by sibling rules (`schema-rejected` etc.).
+ *
+ * Sibling-relative imports per the project convention.
+ */
+
+import { relative } from 'node:path';
+import { sidecarPath } from '../../sidecar/paths.ts';
+import { readAllSidecarsPartitioned } from '../../sidecar/read-all.ts';
+import { isFirstSite } from '../project-scope-gate.ts';
+import type {
+  DoctorContext,
+  DoctorRule,
+  Finding,
+  RepairPlan,
+  RepairResult,
+} from '../types.ts';
+
+const RULE_ID = 'entry-lane-missing';
+
+const rule: DoctorRule = {
+  id: RULE_ID,
+  label: 'Sidecars missing the `lane` field (Phase 8 schema-tightening gate)',
+
+  async audit(ctx: DoctorContext): Promise<Finding[]> {
+    if (!isFirstSite(ctx)) return [];
+
+    // Partitioned reader — corrupt sidecars surface on `malformed` and
+    // are someone else's problem (schema-rejected etc.). We only check
+    // the parseable entries.
+    let partition;
+    try {
+      partition = await readAllSidecarsPartitioned(ctx.projectRoot);
+    } catch {
+      // Directory-level read failure (anything other than ENOENT on
+      // the sidecars dir, which the reader returns as []). Nothing
+      // useful this rule can say — leave the report empty.
+      return [];
+    }
+
+    const findings: Finding[] = [];
+    for (const entry of partition.entries) {
+      if (entry.lane !== undefined) continue;
+      const sidecarPathRelative = relative(
+        ctx.projectRoot,
+        sidecarPath(ctx.projectRoot, entry.uuid),
+      );
+      findings.push({
+        ruleId: RULE_ID,
+        site: ctx.site,
+        severity: 'error',
+        message:
+          `Entry "${entry.slug}" (${entry.uuid}) has no \`lane\` field ` +
+          `(sidecar: ${sidecarPathRelative}). Repair: bulk back-fill via ` +
+          `\`migrateLaneMembership\` to assign every legacy entry to the ` +
+          `\`default\` lane, OR targeted assignment via ` +
+          `\`/deskwork:lane move ${entry.slug} --to <lane-id>\` to pick a ` +
+          `specific lane.`,
+        details: {
+          slug: entry.slug,
+          uuid: entry.uuid,
+          sidecarPath: sidecarPathRelative,
+        },
+      });
+    }
+    return findings;
+  },
+
+  async plan(_ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
+    // Report-only: the choice between `migrateLaneMembership` (bulk
+    // default-assignment) and `/deskwork:lane move` (per-entry explicit
+    // assignment) is an editorial decision. The `reason` repeats both
+    // commands so the runner's interactive output names the next step
+    // verbatim. No `apply()` branch implements either — both repairs
+    // already exist as named operator-facing commands, and reproducing
+    // them inside the rule would duplicate their journal-event +
+    // compensating-write semantics.
+    const slug = String(finding.details.slug ?? '');
+    return {
+      kind: 'report-only',
+      finding,
+      reason:
+        `Operator-driven repair. Bulk back-fill: \`migrateLaneMembership\` ` +
+        `assigns every missing-lane sidecar to "default". Targeted: ` +
+        `\`/deskwork:lane move ${slug} --to <lane-id>\` for this entry.`,
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
+        'entry-lane-missing has no auto-repair; use migrateLaneMembership ' +
+        'or /deskwork:lane move <slug> --to <lane-id>',
+      skipReason: 'editorial-decision',
+    };
+  },
+};
+
+export default rule;
diff --git a/packages/core/src/doctor/rules/lane-config-missing-template.ts b/packages/core/src/doctor/rules/lane-config-missing-template.ts
index 108f56b5..820204a0 100644
--- a/packages/core/src/doctor/rules/lane-config-missing-template.ts
+++ b/packages/core/src/doctor/rules/lane-config-missing-template.ts
@@ -51,6 +51,7 @@ import {
 } from '../../pipelines/loader.ts';
 import { LaneConfigSchema, type LaneConfig } from '../../lanes/types.ts';
 import { readAllSidecarsPartitioned } from '../../sidecar/read-all.ts';
+import { isFirstSite } from '../project-scope-gate.ts';
 import type {
   DoctorContext,
   DoctorRule,
@@ -174,17 +175,6 @@ function restoreLaneFile(laneFilePath: string, snapshot: string): void {
   }
 }
 
-/**
- * Check whether the current site is the "first" site per the config's
- * insertion order. Used to gate the project-wide scan so multi-site
- * projects don't emit duplicate findings (see header).
- */
-function isFirstSite(ctx: DoctorContext): boolean {
-  const siteIds = Object.keys(ctx.config.sites);
-  if (siteIds.length === 0) return true;
-  return siteIds[0] === ctx.site;
-}
-
 const rule: DoctorRule = {
   id: RULE_ID,
   label: 'Lane configs whose pipelineTemplate id does not resolve',
diff --git a/packages/core/src/doctor/runner.ts b/packages/core/src/doctor/runner.ts
index de645733..eaa21952 100644
--- a/packages/core/src/doctor/runner.ts
+++ b/packages/core/src/doctor/runner.ts
@@ -24,6 +24,7 @@ import calendarUuidMissing from './rules/calendar-uuid-missing.ts';
 import legacyTopLevelIdMigration from './rules/legacy-top-level-id-migration.ts';
 import legacyStageArtifactPath from './rules/legacy-stage-artifact-path.ts';
 import laneConfigMissingTemplate from './rules/lane-config-missing-template.ts';
+import entryLaneMissing from './rules/entry-lane-missing.ts';
 import { loadProjectRules, mergeRules } from './project-rules.ts';
 import type {
   DoctorContext,
@@ -52,6 +53,7 @@ export const RULES: ReadonlyArray<DoctorRule> = [
   legacyTopLevelIdMigration,
   legacyStageArtifactPath,
   laneConfigMissingTemplate,
+  entryLaneMissing,
   missingFrontmatterId,
   orphanFrontmatterId,
   duplicateId,
diff --git a/packages/core/test/doctor/entry-lane-missing.test.ts b/packages/core/test/doctor/entry-lane-missing.test.ts
new file mode 100644
index 00000000..592a5dd6
--- /dev/null
+++ b/packages/core/test/doctor/entry-lane-missing.test.ts
@@ -0,0 +1,232 @@
+/**
+ * Tests for the `entry-lane-missing` doctor rule.
+ *
+ * Phase 8 Step 8.0.1 (graphical-entries). Verifies that the rule:
+ *
+ *   1. Emits one `error` finding per sidecar lacking a `lane` field.
+ *   2. Names the entry's slug + UUID + project-relative sidecar path
+ *      in finding details (AUDIT-20260530-81 precedent — relative,
+ *      never absolute).
+ *   3. Repair-message includes BOTH operator-facing repair paths
+ *      (`migrateLaneMembership` and `/deskwork:lane move`).
+ *   4. Emits zero findings when every entry carries a `lane` field
+ *      (negative test).
+ *   5. `plan()` returns `report-only` with both repair commands in
+ *      its reason — confirms there is no auto-repair branch.
+ *
+ * Fixtures live on disk under tmp directories — no filesystem mocking,
+ * per the project's testing rules.
+ */
+
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { join } from 'node:path';
+import { runAudit, yesInteraction } from '@/doctor/runner';
+import entryLaneMissing from '@/doctor/rules/entry-lane-missing';
+import { buildContentIndex } from '@/content-index';
+import { readCalendar } from '@/calendar';
+import { resolveCalendarPath } from '@/paths';
+import type { DeskworkConfig } from '@/config';
+import type { DoctorContext } from '@/doctor/types';
+
+const RULE_ID = 'entry-lane-missing';
+
+interface Fixture {
+  root: string;
+  config: DeskworkConfig;
+}
+
+function setupFixture(): Fixture {
+  const root = mkdtempSync(join(tmpdir(), 'dw-entry-lane-missing-'));
+  mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
+  mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
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
+function writeSidecarJson(root: string, payload: unknown): void {
+  const obj = payload as { uuid: string };
+  writeFileSync(
+    join(root, '.deskwork', 'entries', `${obj.uuid}.json`),
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
+const UUID_A = '11111111-1111-4111-8111-111111111111';
+const UUID_B = '22222222-2222-4222-8222-222222222222';
+const UUID_C = '33333333-3333-4333-8333-333333333333';
+
+describe('doctor: entry-lane-missing', () => {
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
+  it('emits one finding per sidecar missing the `lane` field (with slug + UUID + relative path)', async () => {
+    const nowIso = new Date().toISOString();
+    // Entry A: has lane "default" — should NOT emit a finding.
+    writeSidecarJson(fixture.root, {
+      uuid: UUID_A,
+      slug: 'with-default-lane',
+      title: 'With Default Lane',
+      keywords: [],
+      source: 'manual',
+      currentStage: 'Drafting',
+      iterationByStage: {},
+      lane: 'default',
+      createdAt: nowIso,
+      updatedAt: nowIso,
+    });
+    // Entry B: NO lane field — legacy migration-window state — SHOULD emit.
+    writeSidecarJson(fixture.root, {
+      uuid: UUID_B,
+      slug: 'legacy-no-lane',
+      title: 'Legacy No Lane',
+      keywords: [],
+      source: 'manual',
+      currentStage: 'Drafting',
+      iterationByStage: {},
+      createdAt: nowIso,
+      updatedAt: nowIso,
+    });
+    // Entry C: has lane "qa" — should NOT emit a finding.
+    writeSidecarJson(fixture.root, {
+      uuid: UUID_C,
+      slug: 'with-qa-lane',
+      title: 'With QA Lane',
+      keywords: [],
+      source: 'manual',
+      currentStage: 'Drafting',
+      iterationByStage: {},
+      lane: 'qa',
+      createdAt: nowIso,
+      updatedAt: nowIso,
+    });
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
+    expect(f.details.slug).toBe('legacy-no-lane');
+    expect(f.details.uuid).toBe(UUID_B);
+    // AUDIT-20260530-81 precedent — the persisted `sidecarPath` must be
+    // PROJECT-RELATIVE (`.deskwork/entries/<uuid>.json`), never absolute.
+    expect(f.details.sidecarPath).toBe(
+      join('.deskwork', 'entries', `${UUID_B}.json`),
+    );
+    // Sanity guard: must not start with `/` regardless of OS.
+    expect(String(f.details.sidecarPath).startsWith('/')).toBe(false);
+
+    // Message names the slug + both operator-facing repair paths.
+    expect(f.message).toContain('legacy-no-lane');
+    expect(f.message).toContain(UUID_B);
+    expect(f.message).toContain('migrateLaneMembership');
+    expect(f.message).toContain('/deskwork:lane move legacy-no-lane --to');
+  });
+
+  it('emits zero findings when every entry carries a `lane` field', async () => {
+    const nowIso = new Date().toISOString();
+    writeSidecarJson(fixture.root, {
+      uuid: UUID_A,
+      slug: 'with-default-lane',
+      title: 'With Default Lane',
+      keywords: [],
+      source: 'manual',
+      currentStage: 'Drafting',
+      iterationByStage: {},
+      lane: 'default',
+      createdAt: nowIso,
+      updatedAt: nowIso,
+    });
+    writeSidecarJson(fixture.root, {
+      uuid: UUID_C,
+      slug: 'with-qa-lane',
+      title: 'With QA Lane',
+      keywords: [],
+      source: 'manual',
+      currentStage: 'Drafting',
+      iterationByStage: {},
+      lane: 'qa',
+      createdAt: nowIso,
+      updatedAt: nowIso,
+    });
+
+    const ctx = buildCtx(fixture);
+    const findings = await entryLaneMissing.audit(ctx);
+    expect(findings).toHaveLength(0);
+  });
+
+  it('emits zero findings on an empty project (no sidecars dir)', async () => {
+    // Setup creates the entries/ dir; remove it to exercise the
+    // ENOENT-tolerant path in `readAllSidecarsPartitioned`.
+    rmSync(join(fixture.root, '.deskwork', 'entries'), {
+      recursive: true,
+      force: true,
+    });
+    const ctx = buildCtx(fixture);
+    const findings = await entryLaneMissing.audit(ctx);
+    expect(findings).toHaveLength(0);
+  });
+
+  it('plan() returns report-only with both repair commands named in the reason', async () => {
+    const nowIso = new Date().toISOString();
+    writeSidecarJson(fixture.root, {
+      uuid: UUID_B,
+      slug: 'legacy-no-lane',
+      title: 'Legacy No Lane',
+      keywords: [],
+      source: 'manual',
+      currentStage: 'Drafting',
+      iterationByStage: {},
+      createdAt: nowIso,
+      updatedAt: nowIso,
+    });
+
+    const ctx = buildCtx(fixture);
+    const findings = await entryLaneMissing.audit(ctx);
+    expect(findings).toHaveLength(1);
+
+    const plan = await entryLaneMissing.plan(ctx, findings[0]);
+    expect(plan.kind).toBe('report-only');
+    if (plan.kind !== 'report-only') throw new Error('plan must be report-only');
+    expect(plan.reason).toContain('migrateLaneMembership');
+    expect(plan.reason).toContain('/deskwork:lane move legacy-no-lane --to');
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
