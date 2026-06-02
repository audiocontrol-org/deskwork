I verified the cross-surface questions against source. Several initially-suspected issues turned out clean (the `.stage-grid` is flexbox not CSS-grid, so the appended column needs no `stageCount` bump; the `er-calendar-*` classes are the dashboard's own row classes per `section.ts`; the `lb-overflow` span is currently inert decoration). One real missed-surface defect surfaced, plus a test-contract gap and a hygiene note.

---

### Collapsed compact strip (`renderSwimCompact`) still drops unbucketed entries — the same count-vs-visible defect AUDIT-25 set out to close, on a third surface the fix didn't touch

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/dashboard/swimlane-card.ts:358-382` (`renderSwimCompact`), called unconditionally at `:476`

The fix updates the kanban grid (`renderSwimlane` → `renderUnbucketedStageCol`, `:427`) and the list-body (`renderListBody` → `renderUnbucketedListGroup`) so `bucket.unbucketed` renders. But `renderSwimCompact` — the per-stage compact strip emitted on every swim at `:476` and revealed by CSS when the lane is `.collapsed` (docstring `:48-50`) — was not updated. It iterates **only** `template.linearStages` + `template.offPipelineStages` (`:359-362`) and sums `bucket.byStage.get(stage)` per cell (`:370`). `bucket.unbucketed` is never read.

Consequence: for a lane with unbucketed entries in collapsed view, the swim-head `quick-meta` reads `${bucket.entryCount} entries` (which the docstring confirms folds unbucketed in), while the sum of the visible `.sc-count` cells is `entryCount − unbucketed.length`, and the unbucketed entries have **no** representation in the compact strip at all. This is the identical "count inflated while entries silently dropped" shape the HIGH AUDIT-20260530-25 finding named — the fix closed it on two of three surfaces and the `lane-data.ts` docstring's claim that "the swim-head count reconciles with the visible cards" is false on the collapsed compact view. The new test file does not exercise the compact strip, so the gap is unguarded. Fix: append an unbucketed compact cell in `renderSwimCompact` (e.g. when `bucket.unbucketed.length > 0`, emit a trailing `.sc-stage.is-unbucketed` cell with the `⊘` glyph and `bucket.unbucketed.length`), mirroring the two surfaces already fixed, and add a collapsed-view assertion to the test.

---

### Count-consistency test asserts the count *text* and two slugs but never counts the rendered cards — it does not verify the reconciliation it claims

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts:90-138` (the `count consistency` test)

The test's stated contract (header `:91-94`) is *"swim-head `${n} entries` matches the visible cards once unbucketed renders"* and the inline comment `:91-96` says the block *"must contain 3 row-shell / lb-row markers (1 template-bucketed + 2 unbucketed)."* But the assertions only check (a) the literal text `<span class="quick-meta">3 entries</span>` (`:126`), and (b) that the two unbucketed slugs and their raw stages appear (`:130-137`). Nothing counts the actual rendered `data-row-shell` / `.lb-row` elements. Per `.claude/rules/ui-verification.md` § "spec-compliance probes," this is exactly the trap where a probe verifies the mechanism it imagines rather than the contract it names: the `quick-meta` text is computed from `bucket.entryCount`, **independent** of how many cards render — so a regression where the template-bucketed `a-draft` card vanished (count still 3, only 2 cards visible) would pass this test green. The number "3" and "the cards actually present" are never compared.

Fix: assert the rendered card count directly — e.g. `(stageGrid.match(/data-row-shell/g) ?? []).length === 3` (or count `.lb-row` in the list body) — so the test fails if the visible-card count diverges from the displayed entry count. That is the falsifiable form of the reconciliation claim.

---

### `renderUnbucketedListGroup` discards its `laneId` param via `void laneId`, leaving the list group with no lane-scoped identifier while the kanban column has one — asymmetric and a dead parameter

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   low
Surface:    `packages/studio/src/pages/dashboard/swimlane-unbucketed.ts:114-152` (`renderUnbucketedListGroup`, esp. `:115` `void laneId;`)

`renderUnbucketedStageCol` consumes `laneId` to build a lane-scoped `id="${stageId}"` (`:84-86`, `lane-${laneIdSlug}-stage-unbucketed`), but `renderUnbucketedListGroup` takes the same `laneId` parameter and immediately discards it with `void laneId;` (`:115`). The emitted `.lb-group.is-unbucketed` carries only `data-lb-group="unbucketed"` and `data-unbucketed` (`:144-146`) — no lane scoping. When two lanes each render an unbucketed list group, their group-level markup is byte-identical, so any future selector that needs to target "the unbucketed group of lane X" in the list view cannot, whereas it can in the kanban view. The `void laneId` is a code smell signalling the parameter exists only for signature symmetry; either use it (emit a lane-scoped `id`/`data-lane-id` parallel to the kanban column, which also makes the two surfaces symmetric) or drop the parameter from the signature so the asymmetry is explicit rather than silently voided.

---

### Checks that came back clean (recorded so the operator can see what was ruled out)

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   informational
Surface:    (escaping, grid layout, class reuse, overflow affordance)

I checked four things that looked suspect from the diff and confirmed each is fine: (1) **Escaping** — `entry.currentStage` is a drift-controlled/unvalidated value now rendered into text and `data-*` attributes, but it flows through the project's `html` escaping tag (same path as every other row), so no XSS surface. (2) **Grid layout** — `.stage-grid` is `display:flex` with `.stage-col{flex:1 1 0}` (`dashboard-swimlane-shell.css:253-272`), so the appended unbucketed column flows naturally and needs no `stageCount` increment; the `${stageCount} stages` tag correctly excludes it. (3) **Class reuse** — the hand-rolled kanban row's `er-calendar-row`/`er-calendar-body`/`er-row-slug` classes are the dashboard's own row classes (`section.ts`, `affordances.ts`), not borrowed cross-surface. (4) **List overflow `⋮`** — the `data-lb-overflow` span is currently inert decoration (`swimlane-list-body.ts:78-85` confirms no verb wiring), so reusing it on the unbucketed row does not reintroduce the `verbsForStage`-throws hazard the kanban row deliberately avoids. Had any of these been live (unescaped stage, count-based grid template, a wired overflow dispatching verbs for the unknown stage) it would have been a high finding.
