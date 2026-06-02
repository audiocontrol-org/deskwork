# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface bugs, design issues, missed edge cases, and code-quality concerns in the work product captured in the diff below.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

graphical-entries

## Feature scope (workplan / PRD summary)

Tasks 0.71+0.72+0.73 of graphical-entries Phase 0 (audit-barrage cleanup queue), bundled because all three findings share the same test file and the 0.71/0.72 split was natural along production-code vs test-strengthening lines. Closes AUDIT-20260531-01 (medium, cross-model claude+codex): renderSwimCompact dropped bucket.unbucketed entries — same defect AUDIT-25 closed on the kanban + list surfaces, missed on the collapsed compact strip. Fix mirrors the existing swimlane-unbucketed.ts pattern with a new renderUnbucketedCompactCell export consumed by renderSwimCompact. Closes AUDIT-20260531-02 (medium): count-consistency test strengthened to actually count data-row-shell + lb-row markers against bucket.entryCount, fulfilling the test's stated reconciliation contract per the spec-compliance-probe rule. Closes AUDIT-20260531-03 (informational): clean-check log acknowledged without code change. TDD discipline: new test for 0.71 failed pre-fix, passed post-fix; strengthened assertions for 0.72 verified-falsifiable via temporary code mutation. Full studio suite (954 passed, 11 skipped) green before each commit.

## Commit subjects in the audited range

d6162be66d56b041ad1f8c2688d972f863a7d462 docs(graphical-entries): close AUDIT-20260531-01..03 — Tasks 0.71..0.73
f9b588825c67fa739c7b987bd9883ecf1d9ec8b0 test(graphical-entries): strengthen count-consistency test — AUDIT-20260531-02
5cd5294b9f2e7e8bc29d399bc05a9bd328a5ad5a fix(graphical-entries): swim-compact unbucketed cell — AUDIT-20260531-01


## Recent audit-log excerpt (prior findings on this feature)

Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.


### AUDIT-20260530-95 — [P7T7.2 codex] Group skill documentation still describes the superseded empty-members doctor rule and stale refusal text

Finding-ID: AUDIT-20260530-95 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)
Status:     open
Severity:   low
Surface:    `plugins/deskwork/skills/group/SKILL.md:53`, `plugins/deskwork/skills/group/SKILL.md:58-66`

The skill header and workplan now define `members: []` as the canonical declared-empty group state, and the workplan renames Task 7.5.5 to `group-stale-empty-members`. But the group skill default section still says Doctor’s `group-empty-members-array` rule surfaces the “dual representation” for normalization. Its error catalog also says non-group `show` / `update` refusals use the old “entry has no members” / “non-empty members[]” wording, while the implementation now refuses on absence of the `members` field.

This is documentation drift on the operator-facing skill. The fix is to align the skill with the implemented semantics: `members: []` is not a normalization target, and non-group refusal text should mention “no `members` field” rather than “no members” or “non-empty members[]”.

Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). Run-dir at `.dw-lifecycle/scope-discovery/audit-runs/20260530T121000611Z-graphical-entries/codex.md`.

## 2026-05-31 — audit-barrage lift (20260531T061519667Z-graphical-entries)

### AUDIT-20260531-01 — Collapsed compact strip (`renderSwimCompact`) still drops unbucketed entries — the same count-vs-visible defect AUDIT-25 set out to close, on a third surface the fix didn't touch

Finding-ID: AUDIT-20260531-01 (claude-01 + claude-03 + codex-01 + codex-02; cross-model)
Status:     fixed-5cd5294
Severity:   medium
Surface:    `packages/studio/src/pages/dashboard/swimlane-card.ts:358-382` (`renderSwimCompact`), called unconditionally at `:476`

The fix updates the kanban grid (`renderSwimlane` → `renderUnbucketedStageCol`, `:427`) and the list-body (`renderListBody` → `renderUnbucketedListGroup`) so `bucket.unbucketed` renders. But `renderSwimCompact` — the per-stage compact strip emitted on every swim at `:476` and revealed by CSS when the lane is `.collapsed` (docstring `:48-50`) — was not updated. It iterates **only** `template.linearStages` + `template.offPipelineStages` (`:359-362`) and sums `bucket.byStage.get(stage)` per cell (`:370`). `bucket.unbucketed` is never read.

Consequence: for a lane with unbucketed entries in collapsed view, the swim-head `quick-meta` reads `${bucket.entryCount} entries` (which the docstring confirms folds unbucketed in), while the sum of the visible `.sc-count` cells is `entryCount − unbucketed.length`, and the unbucketed entries have **no** representation in the compact strip at all. This is the identical "count inflated while entries silently dropped" shape the HIGH AUDIT-20260530-25 finding named — the fix closed it on two of three surfaces and the `lane-data.ts` docstring's claim that "the swim-head count reconciles with the visible cards" is false on the collapsed compact view. The new test file does not exercise the compact strip, so the gap is unguarded. Fix: append an unbucketed compact cell in `renderSwimCompact` (e.g. when `bucket.unbucketed.length > 0`, emit a trailing `.sc-stage.is-unbucketed` cell with the `⊘` glyph and `bucket.unbucketed.length`), mirroring the two surfaces already fixed, and add a collapsed-view assertion to the test.

---

### AUDIT-20260531-02 — Count-consistency test asserts the count *text* and two slugs but never counts the rendered cards — it does not verify the reconciliation it claims

Finding-ID: AUDIT-20260531-02
Status:     fixed-f9b5888
Severity:   medium
Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts:90-138` (the `count consistency` test)

The test's stated contract (header `:91-94`) is *"swim-head `${n} entries` matches the visible cards once unbucketed renders"* and the inline comment `:91-96` says the block *"must contain 3 row-shell / lb-row markers (1 template-bucketed + 2 unbucketed)."* But the assertions only check (a) the literal text `<span class="quick-meta">3 entries</span>` (`:126`), and (b) that the two unbucketed slugs and their raw stages appear (`:130-137`). Nothing counts the actual rendered `data-row-shell` / `.lb-row` elements. Per `.claude/rules/ui-verification.md` § "spec-compliance probes," this is exactly the trap where a probe verifies the mechanism it imagines rather than the contract it names: the `quick-meta` text is computed from `bucket.entryCount`, **independent** of how many cards render — so a regression where the template-bucketed `a-draft` card vanished (count still 3, only 2 cards visible) would pass this test green. The number "3" and "the cards actually present" are never compared.

Fix: assert the rendered card count directly — e.g. `(stageGrid.match(/data-row-shell/g) ?? []).length === 3` (or count `.lb-row` in the list body) — so the test fails if the visible-card count diverges from the displayed entry count. That is the falsifiable form of the reconciliation claim.

---

### AUDIT-20260531-03 — Checks that came back clean (recorded so the operator can see what was ruled out)

Finding-ID: AUDIT-20260531-03
Status:     acknowledged-clean-check
Severity:   informational
Surface:    (escaping, grid layout, class reuse, overflow affordance)

I checked four things that looked suspect from the diff and confirmed each is fine: (1) **Escaping** — `entry.currentStage` is a drift-controlled/unvalidated value now rendered into text and `data-*` attributes, but it flows through the project's `html` escaping tag (same path as every other row), so no XSS surface. (2) **Grid layout** — `.stage-grid` is `display:flex` with `.stage-col{flex:1 1 0}` (`dashboard-swimlane-shell.css:253-272`), so the appended unbucketed column flows naturally and needs no `stageCount` increment; the `${stageCount} stages` tag correctly excludes it. (3) **Class reuse** — the hand-rolled kanban row's `er-calendar-row`/`er-calendar-body`/`er-row-slug` classes are the dashboard's own row classes (`section.ts`, `affordances.ts`), not borrowed cross-surface. (4) **List overflow `⋮`** — the `data-lb-overflow` span is currently inert decoration (`swimlane-list-body.ts:78-85` confirms no verb wiring), so reusing it on the unbucketed row does not reintroduce the `verbsForStage`-throws hazard the kanban row deliberately avoids. Had any of these been live (unescaped stage, count-based grid template, a wired overflow dispatching verbs for the unknown stage) it would have been a high finding.


## Diff under audit

The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).

diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
index ac2e18e..64fe9af 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
@@ -4385,7 +4385,7 @@ Surfaced by audit-barrage run `20260530T121000611Z-graphical-entries` (codex). R
 ### AUDIT-20260531-01 — Collapsed compact strip (`renderSwimCompact`) still drops unbucketed entries — the same count-vs-visible defect AUDIT-25 set out to close, on a third surface the fix didn't touch
 
 Finding-ID: AUDIT-20260531-01 (claude-01 + claude-03 + codex-01 + codex-02; cross-model)
-Status:     open
+Status:     fixed-5cd5294
 Severity:   medium
 Surface:    `packages/studio/src/pages/dashboard/swimlane-card.ts:358-382` (`renderSwimCompact`), called unconditionally at `:476`
 
@@ -4398,7 +4398,7 @@ Consequence: for a lane with unbucketed entries in collapsed view, the swim-head
 ### AUDIT-20260531-02 — Count-consistency test asserts the count *text* and two slugs but never counts the rendered cards — it does not verify the reconciliation it claims
 
 Finding-ID: AUDIT-20260531-02
-Status:     open
+Status:     fixed-f9b5888
 Severity:   medium
 Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts:90-138` (the `count consistency` test)
 
@@ -4411,7 +4411,7 @@ Fix: assert the rendered card count directly — e.g. `(stageGrid.match(/data-ro
 ### AUDIT-20260531-03 — Checks that came back clean (recorded so the operator can see what was ruled out)
 
 Finding-ID: AUDIT-20260531-03
-Status:     open
+Status:     acknowledged-clean-check
 Severity:   informational
 Surface:    (escaping, grid layout, class reuse, overflow affordance)
 
diff --git a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
index bc308a4..f692d50 100644
--- a/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
+++ b/docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md
@@ -42,51 +42,51 @@ Closes AUDIT-20260530-25 (cross-model: AUDIT-BARRAGE-claude-P5-1). Surface: `pac
 
 Closes AUDIT-20260531-01 (claude-01 + claude-03 + codex-01 + codex-02; cross-model). Surface: `packages/studio/src/pages/dashboard/swimlane-card.ts:358-382` (`renderSwimCompact`), called unconditionally at `:476`.
 
-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
-- [ ] Step 3: implement the fix
-- [ ] Step 4: confirm test passes
-- [ ] Step 5: commit with `Closes AUDIT-20260531-01 (claude-01 + claude-03 + codex-01 + codex-02; cross-model)` in subject
+- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+- [x] Step 2: confirm test fails against current code (verify the bug repros)
+- [x] Step 3: implement the fix
+- [x] Step 4: confirm test passes
+- [x] Step 5: commit with `Closes AUDIT-20260531-01 (claude-01 + claude-03 + codex-01 + codex-02; cross-model)` in subject
 
 **Acceptance Criteria:**
 
-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
+- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` — `renders unbucketed compact cell in swim compact strip when lane is collapsed (AUDIT-20260531-01)` (cited in Step 1)
+- [x] `npx vitest run packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` exits 0 (passes against the fix)
+- [x] Audit-log Status flipped to `fixed-5cd5294` via the close-shipped-audit-findings step
 
 
 ### Task 0.72 (fix-finding-AUDIT-20260531-02): AUDIT-20260531-02 — Count-consistency test asserts the count *text* and two slug…
 
 Closes AUDIT-20260531-02. Surface: `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts:90-138` (the `count consistency` test).
 
-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
-- [ ] Step 3: implement the fix
-- [ ] Step 4: confirm test passes
-- [ ] Step 5: commit with `Closes AUDIT-20260531-02` in subject
+- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
+- [x] Step 2: confirm test fails against current code (verify the bug repros)
+- [x] Step 3: implement the fix
+- [x] Step 4: confirm test passes
+- [x] Step 5: commit with `Closes AUDIT-20260531-02` in subject
 
 **Acceptance Criteria:**
 
-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
+- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` — strengthened `count consistency: swim-head ${n} entries matches the visible cards once unbucketed renders` (cited in Step 1). Verified failure-on-regression by temporarily disabling `renderUnbucketedStageCol` (mutation reverted before commit; strengthened cardCount assertion failed with `expected 1 to be 3`).
+- [x] `npx vitest run packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` exits 0 (passes against the fix)
+- [x] Audit-log Status flipped to `fixed-f9b5888` via the close-shipped-audit-findings step
 
 
 ### Task 0.73 (fix-finding-AUDIT-20260531-03): AUDIT-20260531-03 — Checks that came back clean (recorded so the operator can se…
 
 Closes AUDIT-20260531-03. Surface: (escaping, grid layout, class reuse, overflow affordance).
 
-- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
-- [ ] Step 2: confirm test fails against current code (verify the bug repros)
-- [ ] Step 3: implement the fix
-- [ ] Step 4: confirm test passes
-- [ ] Step 5: commit with `Closes AUDIT-20260531-03` in subject
+- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — N/A (informational finding; no code change)
+- [x] Step 2: confirm test fails against current code (verify the bug repros) — N/A (informational finding; no code change)
+- [x] Step 3: implement the fix — N/A (informational finding; no code change)
+- [x] Step 4: confirm test passes — N/A (informational finding; no code change)
+- [x] Step 5: commit with `Closes AUDIT-20260531-03` in subject — closure recorded in the AUDIT-20260531-01..03 docs commit; audit-log Status set to `acknowledged-clean-check` rather than `fixed-<sha>` because the four checks (escaping, grid layout, class reuse, overflow affordance) were confirmed clean by the auditor with no code change required.
 
 **Acceptance Criteria:**
 
-- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
-- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
-- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
+- [x] Failing test exists at `(N/A — informational finding; auditor confirmed escaping, grid layout, class reuse, overflow affordance all clean. No test required.)` (cited in Step 1)
+- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix) — N/A (informational finding; no code change, no new test)
+- [x] Audit-log Status flipped to `acknowledged-clean-check` via the close-shipped-audit-findings step (informational findings disposition rather than `fixed-<sha>`)
 
 ### Task 0.2 (fix-finding-AUDIT-20260530-26 (cross-model: AUDIT-BARRAGE-claude-P5-1)): AUDIT-20260530-26 — [P5-1 claude] No clear-on-version-bump for swimlane localSto…
 
diff --git a/packages/studio/src/pages/dashboard/swimlane-card.ts b/packages/studio/src/pages/dashboard/swimlane-card.ts
index 5351771..ae6db80 100644
--- a/packages/studio/src/pages/dashboard/swimlane-card.ts
+++ b/packages/studio/src/pages/dashboard/swimlane-card.ts
@@ -71,7 +71,10 @@ import { renderRow } from './section.ts';
 import { stageGlyph, GLYPH_OFF } from './swimlane-stage-glyph.ts';
 import { laneGlyph } from './lane-glyph.ts';
 import { renderListBody } from './swimlane-list-body.ts';
-import { renderUnbucketedStageCol } from './swimlane-unbucketed.ts';
+import {
+  renderUnbucketedStageCol,
+  renderUnbucketedCompactCell,
+} from './swimlane-unbucketed.ts';
 import type { LaneBucket } from './lane-data.ts';
 import type { LaneRailRow } from './swimlane-rail.ts';
 import type { Entry } from '@deskwork/core/schema/entry';
@@ -377,8 +380,15 @@ function renderSwimCompact(bucket: LaneBucket): RawHtml {
         </div>`;
     })
     .join('');
+  // Per AUDIT-20260531-01 — trailing unbucketed cell so the per-cell
+  // counts in the collapsed compact strip reconcile with the swim-head
+  // `quick-meta` (`${bucket.entryCount} entries`, which already folds
+  // unbucketed in). Mirrors the kanban + list-body unbucketed-tail
+  // precedents the AUDIT-20260530-25 fix landed on the two other
+  // surfaces.
+  const unbucketedRaw = renderUnbucketedCompactCell(bucket.unbucketed).__raw;
   return unsafe(html`
-    <div class="swim-compact" data-swim-compact>${unsafe(cellsRaw)}</div>`);
+    <div class="swim-compact" data-swim-compact>${unsafe(cellsRaw)}${unsafe(unbucketedRaw)}</div>`);
 }
 
 export function renderSwimlane(
diff --git a/packages/studio/src/pages/dashboard/swimlane-unbucketed.ts b/packages/studio/src/pages/dashboard/swimlane-unbucketed.ts
index fd64af9..5434598 100644
--- a/packages/studio/src/pages/dashboard/swimlane-unbucketed.ts
+++ b/packages/studio/src/pages/dashboard/swimlane-unbucketed.ts
@@ -107,6 +107,38 @@ export function renderUnbucketedStageCol(
     </section>`);
 }
 
+/**
+ * Compact-strip unbucketed cell (AUDIT-20260531-01). Renders a trailing
+ * `.sc-stage.is-unbucketed` cell appended to the per-swim
+ * `.swim-compact` strip (revealed by CSS when the lane is `.collapsed`).
+ * Mirrors the structure of the regular compact cells emitted by
+ * `renderSwimCompact` (`.sc-stage` > `.sc-name` + `.sc-count`) so the
+ * existing flex layout (`dashboard-swimlane-shell.css`) handles the
+ * trailing cell with no template changes.
+ *
+ * Mirrors the AUDIT-20260530-25 precedent on the two other dashboard
+ * surfaces — `renderUnbucketedStageCol` (kanban grid) and
+ * `renderUnbucketedListGroup` (list body) — which already reconcile
+ * `bucket.unbucketed` against the swim-head's `quick-meta` count.
+ * Pre-fix, the collapsed compact strip read `entryCount - unbucketed.length`
+ * while the swim-head's `${entryCount} entries` text included the
+ * unbucketed entries; this cell closes that reconciliation gap.
+ *
+ * Returns the empty string (as `RawHtml`) when there are no unbucketed
+ * entries, so callers can append unconditionally.
+ */
+export function renderUnbucketedCompactCell(
+  unbucketed: readonly Entry[],
+): RawHtml {
+  if (unbucketed.length === 0) return unsafe('');
+
+  return unsafe(html`
+    <div class="sc-stage is-unbucketed" data-sc-stage="unbucketed">
+      <span class="sc-name">${UNBUCKETED_GLYPH} ${UNBUCKETED_STAGE_LABEL}</span>
+      <span class="sc-count">${unbucketed.length}</span>
+    </div>`);
+}
+
 /**
  * List-surface unbucketed tail. Renders a trailing `.lb-group` group
  * carrying `.is-unbucketed`; each entry uses the same `.lb-row` chrome
diff --git a/packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts b/packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts
index aefde65..906332e 100644
--- a/packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts
+++ b/packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts
@@ -129,14 +129,46 @@ describe('dashboard swimlane AUDIT-20260530-25 — unbucketed entries are render
     // entryCount already folds them in).
     expect(editorialBlock).toMatch(/<span class="quick-meta">3 entries<\/span>/);
 
+    // AUDIT-20260531-02 — count the actual rendered cards directly so
+    // the test fails if a regression makes the visible-card count
+    // diverge from the displayed entry count. Pre-strengthening the
+    // assertions only checked the text "3 entries" + slug substrings,
+    // never the rendered card count, so a regression where a
+    // template-bucketed card vanished (count text still "3", only 2
+    // cards visible) would have passed green. The bucket.entryCount
+    // for this fixture is 3 (1 template-bucketed `a-draft` + 2
+    // unbucketed). The kanban surface emits one `data-row-shell` per
+    // entry; the list surface emits one `lb-row` per entry — both
+    // counts must reconcile with bucket.entryCount.
+    const expectedEntryCount = 3;
+    const stageGridHtml = extractStageGridSection(editorialBlock);
+    const cardCount = (stageGridHtml.match(/data-row-shell/g) ?? []).length;
+    expect(cardCount).toBe(expectedEntryCount);
+
+    const listBodyHtml = extractListBodySection(editorialBlock);
+    // Per the AUDIT-20260531-02 finding's regex-tuning note: count
+    // `data-row-shell` attribute occurrences inside the list body
+    // rather than `\blb-row\b`. The list body emits THREE different
+    // `lb-row`-class shapes — real entry rows (`class="lb-row"`),
+    // empty-state placeholders (`class="lb-row empty-state"`, one per
+    // empty template stage), and unbucketed rows (`class="lb-row
+    // lb-row--unbucketed"`). Only the first and third represent
+    // visible entries; `renderEmptyListRow` deliberately omits
+    // `data-row-shell` so the attribute count tracks real cards.
+    // This makes the assertion symmetric with the kanban surface's
+    // `data-row-shell` count above.
+    const lbRowCount = (listBodyHtml.match(/data-row-shell/g) ?? []).length;
+    expect(lbRowCount).toBe(expectedEntryCount);
+
     // Both unbucketed entries are visible in the rendered output
-    // (operator-perceivable — they did not vanish).
+    // (operator-perceivable — they did not vanish). Kept as auxiliary
+    // assertions; the load-bearing reconciliation claim is the
+    // cardCount + lbRowCount comparisons above.
     expect(editorialBlock).toContain('data-slug="mystery-one"');
     expect(editorialBlock).toContain('data-slug="mystery-two"');
     // The raw offending stage values are surfaced for operator diagnosis.
-    const stageGrid = extractStageGridSection(editorialBlock);
-    expect(stageGrid).toContain('NonExistentStage');
-    expect(stageGrid).toContain('AnotherMissingStage');
+    expect(stageGridHtml).toContain('NonExistentStage');
+    expect(stageGridHtml).toContain('AnotherMissingStage');
   });
 
   it('happy-path regression: a swim with every entry at template-known stages emits NO unbucketed column or group', async () => {
@@ -151,6 +183,99 @@ describe('dashboard swimlane AUDIT-20260530-25 — unbucketed entries are render
     expect(r.html).not.toMatch(/class="lb-group[^"]*\bis-unbucketed\b/);
   });
 
+  it('renders unbucketed compact cell in swim compact strip when lane is collapsed (AUDIT-20260531-01)', async () => {
+    // AUDIT-20260531-01 — `renderSwimCompact` (per-stage compact strip
+    // emitted on every swim and revealed by CSS when the lane is
+    // `.collapsed`) iterates only `template.linearStages +
+    // template.offPipelineStages` and never reads `bucket.unbucketed`.
+    // Result: the sum of visible `.sc-count` values is
+    // `entryCount − unbucketed.length` while the swim-head `quick-meta`
+    // reads `${bucket.entryCount} entries` — count inflated, entries
+    // silently dropped from the compact strip.
+    //
+    // Fix mirrors the kanban + list-body precedents (AUDIT-20260530-25):
+    // append a trailing `.sc-stage.is-unbucketed` cell carrying the
+    // `⊘` glyph + `unbucketed.length` so the per-cell counts reconcile
+    // with the swim-head's `quick-meta`.
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: UUID_EDITORIAL_UNRECOGNIZED,
+        slug: 'compact-mystery-one',
+        title: 'Compact Mystery One',
+        currentStage: 'NonExistentStage',
+        iterationByStage: { NonExistentStage: 0 },
+        lane: 'default',
+      }),
+    );
+    await writeSidecar(
+      root,
+      makeEntry({
+        uuid: UUID_VISUAL_UNRECOGNIZED,
+        slug: 'compact-mystery-two',
+        title: 'Compact Mystery Two',
+        currentStage: 'AnotherMissingStage',
+        iterationByStage: { AnotherMissingStage: 0 },
+        lane: 'default',
+      }),
+    );
+
+    const r = await getHtml(app, '/dev/editorial-studio');
+    expect(r.status).toBe(200);
+
+    const editorialBlock = extractLaneSection(r.html, 'default');
+    expect(editorialBlock).not.toBe('');
+
+    // (a) Locate the `.swim-compact` substring (the per-stage
+    // compact strip revealed when the lane is `.collapsed`).
+    const swimCompactOpen = editorialBlock.indexOf('<div class="swim-compact"');
+    expect(swimCompactOpen).toBeGreaterThanOrEqual(0);
+    const swimCompactClose = editorialBlock.indexOf('</div>', swimCompactOpen);
+    // The compact strip contains nested `.sc-stage` divs; find the
+    // outer closing tag by scanning forward through matched opens.
+    let depth = 1;
+    let cursor = swimCompactOpen + '<div class="swim-compact"'.length;
+    while (depth > 0 && cursor < editorialBlock.length) {
+      const nextOpen = editorialBlock.indexOf('<div', cursor);
+      const nextClose = editorialBlock.indexOf('</div>', cursor);
+      if (nextClose === -1) break;
+      if (nextOpen !== -1 && nextOpen < nextClose) {
+        depth += 1;
+        cursor = nextOpen + '<div'.length;
+      } else {
+        depth -= 1;
+        cursor = nextClose + '</div>'.length;
+      }
+    }
+    const swimCompact = editorialBlock.slice(swimCompactOpen, cursor);
+    expect(swimCompact).toContain('<div class="swim-compact"');
+    void swimCompactClose;
+
+    // (b) An unbucketed cell renders inside `.swim-compact` with
+    // `data-sc-stage="unbucketed"` and the `is-unbucketed` modifier.
+    expect(swimCompact).toMatch(/class="sc-stage[^"]*\bis-unbucketed\b/);
+    expect(swimCompact).toContain('data-sc-stage="unbucketed"');
+
+    // (c) The unbucketed cell's `.sc-count` is 2 (matches
+    // `bucket.unbucketed.length` for this fixture).
+    const unbucketedCellMatch = swimCompact.match(
+      /class="sc-stage[^"]*\bis-unbucketed\b[^"]*"[\s\S]*?<span class="sc-count">(\d+)<\/span>/,
+    );
+    expect(unbucketedCellMatch).not.toBeNull();
+    expect(unbucketedCellMatch?.[1]).toBe('2');
+
+    // (d) The sum of all `.sc-count` numeric values inside
+    // `.swim-compact` reconciles with `bucket.entryCount` (3).
+    const scCountMatches = swimCompact.match(
+      /<span class="sc-count">(\d+)<\/span>/g,
+    ) ?? [];
+    const compactSum = scCountMatches.reduce((acc, raw) => {
+      const m = raw.match(/(\d+)/);
+      return m === null ? acc : acc + Number.parseInt(m[1], 10);
+    }, 0);
+    expect(compactSum).toBe(3);
+  });
+
   it('unbucketed render is scoped per-swim: an unbucketed entry in editorial does NOT leak into the mockups swim', async () => {
     await writeSidecar(
       root,


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
