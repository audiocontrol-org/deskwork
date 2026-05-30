I walked the diff for Phase 5 Tasks 5.2 + 5.3 — the template-aware verb dispatch (`affordances.ts`, `section.ts`, `swimlane-card.ts`), the empty-lane CTA (`swimlane-compose.ts`), the mobile lane-sheet (`swimlane-mobile-sheet.ts`, `swimlane.ts`, CSS), and the new test files. Findings below.

### Template-aware verb dispatch recomputes `classifyStage` + rebuilds the full verb set 4× per row

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   low
Surface:    `packages/studio/src/pages/dashboard/affordances.ts:178` (`verbsForStage`), `:370` (`renderMenu`), `:419-475` (`renderRowActions` / `renderRowDrawer` / `renderRowMenu`)

`renderRow` (`section.ts:62-78`) calls `renderRowDrawer`, `renderRowActions`, and `renderRowMenu` for every entry. Each of those calls `verbsForStage`, which (a) calls `classifyStage` and (b) constructs the *entire* verb object set (`iterate`, `approve`, `block`, `induct`, `cancel`, `view`, `scrapbook`, `inductForward`) from scratch — even though each caller consumes only one of the three returned views. `renderRowMenu` is worse: it calls `verbsForStage` (one `classifyStage`) and then `renderMenu` (a second `classifyStage` on the same stage+template). Net per row: `classifyStage` runs ~4×, `verbsForStage` rebuilds ~7 verb objects 3×.

This is wasted allocation that scales linearly with entry count (a 100-entry dashboard does ~300 `verbsForStage` invocations) and, more importantly, spreads the categorization decision across two functions that must agree. A reasonable fix: classify once in `renderRow`, thread the `StageCategory` (or the resolved verb set) into the three sub-renderers, and have `renderMenu` accept the already-computed category rather than re-deriving it. Low severity — correctness is unaffected — but it's a duplicated-source-of-truth + redundant-work pattern worth collapsing before more renderers consume the verb set.

### `classifyStage` throw converts a single out-of-template entry into a whole-dashboard 500

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/dashboard/affordances.ts:99-107` (throw), `packages/studio/src/pages/dashboard/swimlane-card.ts:186-193` (`renderStageCol` body map)

`classifyStage` throws when a stage is absent from both `linearStages` and `offPipelineStages`. That throw now propagates through `renderRow`, which is invoked inside `entries.map((e, i) => renderRow(e, i, template, defaultSite).__raw).join('')` in `renderStageCol`. A throw on any single entry aborts the entire `.map`, the whole `renderSwimlane`, and therefore the whole `/dev/editorial-studio` page render (HTTP 500) — not just the offending row.

Pre-5.2, `renderRowActions`/`renderRowDrawer`/`renderRowMenu` early-returned `unsafe('')` for non-editorial stages (the `isLegacyEditorialStage` guard), so an unknown stage produced an empty-chrome row, never a crash. The new dispatch removes that guard and replaces "render nothing" with "throw." Whether an out-of-template `currentStage` can actually reach `renderStageCol` depends on `loadLaneBuckets`/`bucketize` (not in this diff) filtering entries to template stages — but this is exactly the AUDIT-20260530-14 shape (entries carrying a `currentStage` not in their lane's template) on the dashboard surface. If that data-layer filtering is the only thing standing between a stale sidecar and a 500, the coupling is fragile. The no-fallback rule wants a loud failure, but a loud *per-entry* failure (skip the row, surface a diagnostic) is preferable to taking down the operator's entire dashboard. Recommend catching at the `renderStageCol` map boundary and rendering an explicit "unrecognized stage" row, mirroring the calendar renderer's `(unrecognized stage)` tail from AUDIT-14's fix. There is no test seeding an entry whose stage is outside its lane template to pin this path.

### Mobile lane-sheet focus-trap contract is unverified — no test asserts Tab is contained

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet.ts:60-90`, `packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts:1-30` (coverage docblock)

The audit scope explicitly names "mobile-sheet a11y (focus trap, scrim, dismiss)." The controller implements scrim (backdrop), three dismiss paths (trigger/backdrop/Escape), focus-into-sheet on open (`focusFirstSheetTarget`), and focus-return-to-trigger on close. It does **not** implement an explicit focus trap, and delegates open/close mechanics to `createSlideUpSheet` (`../mobile-shell/sheet-controller.ts`, not in this diff). The new test suite's own coverage list enumerates open/close/escape/backdrop/row-activation/eye-button/focus-return — but there is no assertion that Tab/Shift+Tab is contained within the sheet while it is open.

A bottom sheet rendered over a dimmed scrim with a `max-height: 70vh` panel is the canonical case where Tab can silently walk focus into the page content behind the scrim — a WCAG 2.4.3 (Focus Order) / 2.1.2 (No Keyboard Trap, inverse) concern. Either the shared `createSlideUpSheet` traps focus (in which case this diff should have a regression test asserting it, since the sheet is a new consumer) or it does not (in which case the sheet ships without the trap the audit scope requires). As-is, the contract is unverified for a surface the audit flags by name. Add a test that opens the sheet, Tabs from the last focusable element, and asserts focus wraps to the first sheet element rather than escaping to `document.body` / background rows — and if the shared controller doesn't trap, add the trap.

### `EDITORIAL_STAGE_EMPTY_HINTS` hardcodes editorial pipeline knowledge in the studio — sibling of AUDIT-20260530-19

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   low
Surface:    `packages/studio/src/pages/dashboard/swimlane-card.ts:84-115` (`EDITORIAL_STAGE_EMPTY_HINTS` + `stageEmptyHint`)

The empty-state copy map gates on `templateId === 'editorial'` and hardcodes the eight editorial stage names (`Ideas`/`Planned`/`Outlining`/`Drafting`/`Final`/`Published`/`Blocked`/`Cancelled`) with bespoke strings, falling through to `Nothing in ${stage.toLowerCase()}.` otherwise. This duplicates the editorial pipeline's stage vocabulary inside the studio layer — the same drift hazard AUDIT-20260530-19 flagged for `EDITORIAL_FALLBACK` duplicating `editorial.json`. If `editorial.json` ever renames or adds a linear stage, this map silently desyncs: the renamed stage gets the generic `Nothing in <stage>.` fallback while the operator (and the `dashboard.test.ts` assertions that pin these verbatim phrasings) expect the editorial copy.

It's low severity because the editorial template is stable and the fallback is benign, but it's a hardcoded coupling between the studio render layer and a core preset that the "collection model is renderer-independent" principle wants to avoid. A cleaner shape would source the per-stage hint from the template definition itself (an optional `emptyHint` per stage in the pipeline JSON) so each template — not just editorial — carries its own empty-state copy without a studio-side special case. At minimum, note the editorial.json ↔ studio-map coupling so a future stage rename touches both.

### Mobile sheet open/closed state is tracked redundantly across a body attribute and a container class that must be kept in sync by hand

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet.ts:62-86`, `plugins/deskwork-studio/public/css/dashboard-swimlane.css` (`body[data-lane-sheet-open] .lane-sheet-backdrop` vs `.lane-sheet-container.is-open .lane-rail`)

The sheet's visual state is driven by two independent flags that the CSS keys off separately: the backdrop reveal uses `body[data-lane-sheet-open]` (set by the shared `createSlideUpSheet` controller), while the rail's slide-up uses `.lane-sheet-container.is-open` (set by the local `openSheet`/`onClose`). Keeping them coherent depends on every state transition going through both: `openSheet` adds `.is-open` *and* calls `sheetController.open()`; `onClose` removes `.is-open` when the controller fires its close. If the shared controller ever closes the sheet through a path that doesn't invoke the supplied `onClose` (e.g. an internal auto-dismiss, a future resize handler, or a second `close()` that early-returns before firing callbacks), the body attribute and the container class diverge — backdrop fades but the panel stays slid-up, or vice-versa, with no single source of truth to reconcile them.

This is a fragility/coupling note, not a confirmed bug (the current callbacks keep them in sync), but routing one piece of state through two mechanisms across two files is the kind of seam that breaks silently on the next change. Preferring a single state signal — e.g. drive both CSS rules off `body[data-lane-sheet-open]`, or off the container class, but not split across both — would remove the hand-sync requirement. The new test suite asserts both the class and the body attribute flip together on the happy paths, but does not exercise any controller-internal close that bypasses `onClose`.
