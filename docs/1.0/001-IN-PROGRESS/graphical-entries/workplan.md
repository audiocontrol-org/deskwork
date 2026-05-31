---
slug: graphical-entries
targetVersion: "1.0"
date: 2026-05-25
---

# Workplan: Graphical Entries

**Goal:** Generalize deskwork's pipeline model to support per-project lanes bound to pipeline templates, add cross-lane groups, and add first-class graphical entries (`html-mockup` / `single-file-html` / `image`) with a chrome-free review surface — preserving the canonical pipeline shape across all templates and migrating existing projects with zero data loss.

> The workplan elaborates the PRD's Implementation Phases into tasks with acceptance criteria. Phase 4 carries scoped-in tooling fixes (#247, #300). Phase 1 is research-only (no production implementation). Phase 9 is design-only (no production implementation). All other phases ship code + tests; integration tests live in `packages/<workspace>/test/` and run locally per the project's "no test infrastructure in CI" rule.


## Phase 0: Audit-barrage cleanup queue (cross-phase)

Audit-barrage findings from the retroactive sweep run on 2026-05-30 against previously-unaudited phases (P2 / P3 / P4 / P5 / P6 / P7 T7.2 + Phase 7 small surfaces). 70 open findings lifted from `audit-log.md` AUDIT-20260530-25..95 (one acknowledged — AUDIT-60 — left at its original Task 7.75 location in Phase 7 since the disposition is spec-confirmation, not cleanup work).

Tasks renumbered as 0.1..0.70 in lift order (which mirrors barrage-run + model + within-model order). Each task's `Closes AUDIT-...` token + body is preserved verbatim; only the `### Task N.M` header was rewritten.

The `check-open-findings` gate refuses `/dwi` task pickup while any of these 70 are `Status: open`. Cure: walk each per TDD discipline, flipping `Status: open` to `Status: fixed-<sha>` on the close-shipped step. Several findings cluster (silent-drop patterns, partial-success states, schema-vs-implementation drift) and admit bundled fix dispatches.

### Task 0.1 (fix-finding-AUDIT-20260530-25 (cross-model: AUDIT-BARRAGE-claude-P5-1)): AUDIT-20260530-25 — [P5-1 claude] Lane-bucket `unbucketed` entries are silently …

Closes AUDIT-20260530-25 (cross-model: AUDIT-BARRAGE-claude-P5-1). Surface: `packages/studio/src/pages/dashboard/swimlane-card.ts` (`renderSwimlane`, the stage-column assembly ~lines after "const stagesRaw"), `packages/studio/src/pages/dashboard/lane-data.ts` (`LaneBucket.unbucketed` + `loadLaneBuckets` entryCount math).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-25 (cross-model: AUDIT-BARRAGE-claude-P5-1)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-fc192e9` via the close-shipped-audit-findings step




### Task 0.71 (fix-finding-AUDIT-20260531-01): AUDIT-20260531-01 — Collapsed compact strip (`renderSwimCompact`) still drops un…

Closes AUDIT-20260531-01 (claude-01 + claude-03 + codex-01 + codex-02; cross-model). Surface: `packages/studio/src/pages/dashboard/swimlane-card.ts:358-382` (`renderSwimCompact`), called unconditionally at `:476`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260531-01 (claude-01 + claude-03 + codex-01 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` — `renders unbucketed compact cell in swim compact strip when lane is collapsed (AUDIT-20260531-01)` (cited in Step 1)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-5cd5294` via the close-shipped-audit-findings step


### Task 0.72 (fix-finding-AUDIT-20260531-02): AUDIT-20260531-02 — Count-consistency test asserts the count *text* and two slug…

Closes AUDIT-20260531-02. Surface: `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts:90-138` (the `count consistency` test).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260531-02` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` — strengthened `count consistency: swim-head ${n} entries matches the visible cards once unbucketed renders` (cited in Step 1). Verified failure-on-regression by temporarily disabling `renderUnbucketedStageCol` (mutation reverted before commit; strengthened cardCount assertion failed with `expected 1 to be 3`).
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-f9b5888` via the close-shipped-audit-findings step


### Task 0.73 (fix-finding-AUDIT-20260531-03): AUDIT-20260531-03 — Checks that came back clean (recorded so the operator can se…

Closes AUDIT-20260531-03. Surface: (escaping, grid layout, class reuse, overflow affordance).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — N/A (informational finding; no code change)
- [x] Step 2: confirm test fails against current code (verify the bug repros) — N/A (informational finding; no code change)
- [x] Step 3: implement the fix — N/A (informational finding; no code change)
- [x] Step 4: confirm test passes — N/A (informational finding; no code change)
- [x] Step 5: commit with `Closes AUDIT-20260531-03` in subject — closure recorded in the AUDIT-20260531-01..03 docs commit; audit-log Status set to `acknowledged-clean-check` rather than `fixed-<sha>` because the four checks (escaping, grid layout, class reuse, overflow affordance) were confirmed clean by the auditor with no code change required.

**Acceptance Criteria:**

- [x] Failing test exists at `(N/A — informational finding; auditor confirmed escaping, grid layout, class reuse, overflow affordance all clean. No test required.)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix) — N/A (informational finding; no code change, no new test)
- [x] Audit-log Status flipped to `acknowledged-clean-check` via the close-shipped-audit-findings step (informational findings disposition rather than `fixed-<sha>`)


### Task 0.74 (fix-finding-AUDIT-20260531-04): AUDIT-20260531-04 — Dead variable `swimCompactClose` in the new compact-strip te…

Closes AUDIT-20260531-04. Surface: `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (the AUDIT-20260531-01 test, the `swimCompactClose` line + its `void swimCompactClose;`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260531-04` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` — `emits unbucketed cell into swim compact strip (AUDIT-20260531-01)` (the test that covers the surface; this finding is pure dead-code deletion — the test continues to cover the depth-matching loop which is the correct mechanism)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` exits 0 (5/5 pass post-fix)
- [x] Audit-log Status flipped to `fixed-fa2014f` via the close-shipped-audit-findings step


### Task 0.75 (fix-finding-AUDIT-20260531-05): AUDIT-20260531-05 — Compact-strip test asserts DOM presence but never exercises …

Closes AUDIT-20260531-05. Surface: `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (`renders unbucketed compact cell in swim compact strip when lane is collapsed (AUDIT-20260531-01)`); CSS at `plugins/deskwork-studio/public/css/dashboard-swimlane-shell.css:197-206`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260531-05` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` — `emits unbucketed cell into swim compact strip (AUDIT-20260531-01)` (rename + scope-comment; no new test required — the change is text-renaming + comment-tightening to scope the existing test honestly. Per the finding the CSS-reveal path requires a browser-toggle probe, which is out of scope for the string-match server-render test)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` exits 0 (5/5 pass post-fix)
- [x] Audit-log Status flipped to `fixed-168af95` via the close-shipped-audit-findings step


### Task 0.76 (fix-finding-AUDIT-20260531-06): AUDIT-20260531-06 — New `.sc-stage.is-unbucketed` compact cell has no dedicated …

Closes AUDIT-20260531-06. Surface: `packages/studio/src/pages/dashboard/swimlane-unbucketed.ts:135-139` (`renderUnbucketedCompactCell`); CSS at `dashboard-swimlane-shell.css:208-246`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260531-06` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` — `emits unbucketed cell into swim compact strip (AUDIT-20260531-01)` (asserts `data-sc-stage="unbucketed"` + `.is-unbucketed` class + `.sc-count` numeric value; the markup split into `.sc-glyph` + `.sc-name` is verified by the existing assertions continuing to pass against the new structure)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` exits 0 (5/5 pass post-fix; full studio suite 954/954)
- [x] Audit-log Status flipped to `fixed-b0da816` via the close-shipped-audit-findings step

### Task 0.2 (fix-finding-AUDIT-20260530-26 (cross-model: AUDIT-BARRAGE-claude-P5-1)): AUDIT-20260530-26 — [P5-1 claude] No clear-on-version-bump for swimlane localSto…

Closes AUDIT-20260530-26 (cross-model: AUDIT-BARRAGE-claude-P5-1). Surface: `plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts` (`STORAGE_KEY_PREFIX`, `resolveProjectKey`, `readStoredObjectMap`) and the four key suffixes in `swimlane.ts` / `swimlane-collapse.ts` / `swimlane-view-toggle.ts`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-26 (cross-model: AUDIT-BARRAGE-claude-P5-1)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-client.test.ts` — `AUDIT-20260530-26: ignores stale unversioned dashboard visibility state` (cited in Step 1)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-client.test.ts packages/studio/test/dashboard-swimlane-collapse-client.test.ts packages/studio/test/dashboard-swimlane-collapse-list-client.test.ts packages/studio/test/dashboard-swimlane-view-toggle-client.test.ts packages/studio/test/dashboard-swimlane-presets-store-client.test.ts packages/studio/test/dashboard-swimlane-presets-client.test.ts packages/studio/test/dashboard-swimlane-presets-polish-client.test.ts packages/studio/test/dashboard-swimlane-integration-client.test.ts packages/studio/test/dashboard-lane-stack-client.test.ts packages/studio/test/dashboard-swimlane-drag-client.test.ts packages/studio/test/dashboard-swimlane-drag-client-pure.test.ts packages/studio/test/dashboard-swimlane-drag-client-reorder-buttons.test.ts` exits 0 (96 tests pass)
- [x] Audit-log Status flipped to `fixed-ec51035` via the close-shipped-audit-findings step



### Task 0.3 (fix-finding-AUDIT-20260530-27 (cross-model: AUDIT-BARRAGE-claude-P5-1)): AUDIT-20260530-27 — [P5-1 claude] Rail eye-toggle `.r-eye-btn` is a 14px-wide in…

Closes AUDIT-20260530-27 (cross-model: AUDIT-BARRAGE-claude-P5-1). Surface: `plugins/deskwork-studio/public/css/dashboard-swimlane.css` (`.rail-lane .r-eye-btn` rule: `width: 14px; ... padding: 0;`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-27 (cross-model: AUDIT-BARRAGE-claude-P5-1)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-rail-eye-target-size.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/studio/test/dashboard-rail-eye-target-size.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-94d7213` via the close-shipped-audit-findings step



### Task 0.4 (fix-finding-AUDIT-20260530-28 (cross-model: AUDIT-BARRAGE-codex-P5-1)): AUDIT-20260530-28 — [P5-1 codex] Compose chip copies an invalid command for stag…

Closes AUDIT-20260530-28 (cross-model: AUDIT-BARRAGE-codex-P5-1). Surface: plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts:90-98; packages/studio/src/pages/dashboard/swimlane-card.ts:297-307.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-28 (cross-model: AUDIT-BARRAGE-codex-P5-1)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-compose-quote.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.5 (fix-finding-AUDIT-20260530-29 (cross-model: AUDIT-BARRAGE-codex-P5-1)): AUDIT-20260530-29 — [P5-1 codex] Dashboard localStorage has no schema/version se…

Closes AUDIT-20260530-29 (cross-model: AUDIT-BARRAGE-codex-P5-1). Surface: plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts:21-27; plugins/deskwork-studio/public/src/dashboard/swimlane.ts:64-69; plugins/deskwork-studio/public/src/dashboard/swimlane-collapse.ts:60-65; plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle.ts:68-70.

Disposition: duplicate of AUDIT-20260530-26 (claude); both findings describe the same missing-schema-version bug. Closed by `ec51035` (the AUDIT-26 fix), which added `STORAGE_SCHEMA_VERSION = 2` to `STORAGE_KEY_PREFIX` so stale unversioned keys are ignored. The regression test for AUDIT-26 at `packages/studio/test/dashboard-swimlane-client.test.ts` (the `ignores stale unversioned dashboard visibility state` case) covers the AUDIT-29 surface too — both findings cite the same prefix declaration site (`swimlane-storage.ts:21-27` = `swimlane-storage.ts` `STORAGE_KEY_PREFIX`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — covered by AUDIT-26 test
- [x] Step 2: confirm test fails against current code (verify the bug repros) — verified during AUDIT-26 cycle
- [x] Step 3: implement the fix — `ec51035`
- [x] Step 4: confirm test passes — verified during AUDIT-26 cycle
- [x] Step 5: commit with `Closes AUDIT-20260530-29 (cross-model: AUDIT-BARRAGE-codex-P5-1)` in subject — see disposition note above; closed via duplicate-of-26 disposition rather than a fresh commit

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-client.test.ts` (AUDIT-20260530-26 regression — same prefix declaration site)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-ec51035 (duplicate of AUDIT-20260530-26; closed by the same commit)` per duplicate disposition



### Task 0.6 (fix-finding-AUDIT-20260530-30 (cross-model: AUDIT-BARRAGE-codex-P5-1)): AUDIT-20260530-30 — [P5-1 codex] Re-running swimlane initializers stacks duplica…

Closes AUDIT-20260530-30 (cross-model: AUDIT-BARRAGE-codex-P5-1). Surface: plugins/deskwork-studio/public/src/editorial-studio-client.ts:527-530; plugins/deskwork-studio/public/src/dashboard/swimlane.ts:469-490; plugins/deskwork-studio/public/src/dashboard/swimlane-collapse.ts:464-477; plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle.ts:292-312; plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts:270-282.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-30 (cross-model: AUDIT-BARRAGE-codex-P5-1)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-idempotent-init.test.ts` (9 tests — per-controller second-init no-op + sanity first-init bind + sentinel-attribute assertion)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-7b6543e` via the close-shipped-audit-findings step



### Task 0.7 (fix-finding-AUDIT-20260530-31 (cross-model: AUDIT-BARRAGE-gemini-P5-1)): AUDIT-20260530-31 — [P5-1 gemini] The stage ID slugification logic in `renderSta…

Closes AUDIT-20260530-31 (cross-model: AUDIT-BARRAGE-gemini-P5-1). Surface: `packages/studio/src/pages/dashboard/swimlane-card.ts:127`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-31 (cross-model: AUDIT-BARRAGE-gemini-P5-1)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-card-unit.test.ts` (3 tests — kanban-stage uniqueness from the existing AUDIT-20260528-07 regression + two new list-body regressions covering `data-lb-group` uniqueness AND no-duplicate-id contract on the list-body surface; sanity-checked the new tests catch a regression by injecting the pre-fix slugifier into `renderListGroup`'s `data-lb-group` and confirming the assertion failed with `['qa-review', 'qa-review']`, then reverted)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-fdf9621` via the close-shipped-audit-findings step

**Disposition note:** the gemini finding cited stale source code (line 127 of `swimlane-card.ts`, which referenced the pre-`a281ea7` shape). The actual stage-DOM-id derivation in `renderStageCol` already routes through `stageNameToFilesystemToken` (swimlane-card.ts:183), so the kanban surface was already collision-safe per AUDIT-20260528-07's `fixed-a281ea7`. AUDIT-20260528-07 stays at `fixed-a281ea7` — its surface and the swimlane-card portion of AUDIT-20260530-31 are the same. The work that DID need to land was on the sibling `renderListGroup` site the gemini finding named "implicit through shared stage name derivation"; the verbatim-stage `data-lb-group` contract is now pinned by regression tests.



### Task 0.8 (fix-finding-AUDIT-20260530-32 (cross-model: AUDIT-BARRAGE-gemini-P5-1)): AUDIT-20260530-32 — [P5-1 gemini] The list-view overflow affordance (`.lb-overfl…

Closes AUDIT-20260530-32 (cross-model: AUDIT-BARRAGE-gemini-P5-1). Surface: `packages/studio/src/pages/dashboard/swimlane-list-body.ts:109`.

Disposition: duplicate of AUDIT-20260528-08 (the original inert-button-trap surfacing on the same `.lb-overflow` site). The gemini auditor's finding text explicitly cites AUDIT-20260528-08 in its narrative ("This issue is explicitly flagged as AUDIT-20260528-08 in `audit-log.md`...") but read pre-fix source — the actual `swimlane-list-body.ts` already renders `.lb-overflow` as a plain decorative `<span aria-hidden="true" data-lb-overflow="...">` with NO `role="button"`, NO `tabindex`, NO `aria-label`, per the fix landed in commit `e309f00`. Regression coverage lives in `packages/studio/test/dashboard-swimlane-list-render.test.ts` — the `AUDIT-08: lb-overflow span is NOT in the keyboard tab order (no role, no tabindex, no aria-label)` test asserts every attribute AUDIT-32 names (no `role=`, no `tabindex=`, no `aria-label=`, `aria-hidden="true"` present), and the row-shape test pins the `data-lb-overflow="${uuid}"` retention so future Task 5.1C/5.2 wiring can find the elements. Both tests pass; the fix is already in tree.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — covered by AUDIT-08 test in `dashboard-swimlane-list-render.test.ts`
- [x] Step 2: confirm test fails against current code (verify the bug repros) — verified during AUDIT-20260528-08 cycle (commit `e309f00`)
- [x] Step 3: implement the fix — `e309f00`
- [x] Step 4: confirm test passes — `npx vitest run packages/studio/test/dashboard-swimlane-list-render.test.ts` → 12/12 pass
- [x] Step 5: commit with `Closes AUDIT-20260530-32 (cross-model: AUDIT-BARRAGE-gemini-P5-1)` in subject — see disposition note; closed via duplicate-of-08 disposition rather than a fresh fix commit

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-list-render.test.ts` (AUDIT-08 regression — same `.lb-overflow` site, same focusability vectors)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-list-render.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-e309f00 (duplicate of AUDIT-20260528-08; closed by the same commit)` per duplicate disposition



### Task 0.9 (fix-finding-AUDIT-20260530-33 (cross-model: AUDIT-BARRAGE-gemini-P5-1)): AUDIT-20260530-33 — [P5-1 gemini] The logic for the "All" focus chip in `bindFoc…

Closes AUDIT-20260530-33 (cross-model: AUDIT-BARRAGE-gemini-P5-1). Surface: `plugins/deskwork-studio/public/src/dashboard/swimlane.ts:251-254`.

Disposition: duplicate of AUDIT-20260528-09 (the original surfacing of the "All chip silently empties focus when every visible lane is already focused" bug on the same `bindFocusChips` handler in `plugins/deskwork-studio/public/src/dashboard/swimlane.ts`). The gemini auditor's finding text explicitly cites AUDIT-20260528-09 in its narrative ("This directly contradicts the expected behavior in AUDIT-20260528-09, which states...") but quoted stale line numbers (`:251-254`) and misread the current implementation — the actual `bindFocusChips` handler at lines 282-293 unconditionally clears `state.focused` and then unconditionally re-populates it with every visible lane (`state.focused.clear(); for (const id of allVisible) state.focused.add(id);`), per the fix landed in commit `9eff7af` on 2026-05-28. There is no conditional `!isAlreadyAll` branch gating the re-population; the gemini auditor's "if isAlreadyAll is true, clearing leaves it empty" claim describes the pre-fix shape, not the current code. Regression coverage lives in `packages/studio/test/dashboard-swimlane-client-keys.test.ts` — the `AUDIT-09: clicking the All chip is idempotent — all-already-focused stays all-focused (does NOT empty the set)` test asserts the all-already-focused → still-all-focused idempotency contract, and the paired `AUDIT-09: clicking the All chip from a partial-focus state restores every visible lane` test pins the partial-focus → all-focused contract. Both tests pass against the current handler; the fix is already in tree.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — covered by AUDIT-09 tests in `dashboard-swimlane-client-keys.test.ts:254` and `:290`
- [x] Step 2: confirm test fails against current code (verify the bug repros) — verified during AUDIT-20260528-09 cycle (commit `9eff7af`)
- [x] Step 3: implement the fix — `9eff7af`
- [x] Step 4: confirm test passes — `npx vitest run packages/studio/test/dashboard-swimlane-client-keys.test.ts -t "AUDIT-09"` → 2/2 pass
- [x] Step 5: commit with `Closes AUDIT-20260530-33 (cross-model: AUDIT-BARRAGE-gemini-P5-1)` in subject — see disposition note; closed via duplicate-of-09 disposition rather than a fresh fix commit

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-client-keys.test.ts` (AUDIT-09 regression — same `bindFocusChips` handler, same idempotency contract)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-client-keys.test.ts -t "AUDIT-09"` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-9eff7af (duplicate of AUDIT-20260528-09; closed by the same commit)` per duplicate disposition



### Task 0.10 (fix-finding-AUDIT-20260530-34 (cross-model: AUDIT-BARRAGE-gemini-P5-1)): AUDIT-20260530-34 — [P5-1 gemini] The mobile dashboard lane-stack/lane-head vari…

Closes AUDIT-20260530-34 (cross-model: AUDIT-BARRAGE-gemini-P5-1). Surface: `docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:231` (and related mobile rendering).

Disposition: duplicate of AUDIT-20260528-10 (the original surfacing of "Task 5.1B mobile lane-stack / lane-head variant is not implemented or the workplan has over-claimed the mobile scope"). The gemini auditor's finding text explicitly cites AUDIT-20260528-10 in its narrative ("The audit finding AUDIT-20260528-10 points out this discrepancy...") but inspected only `dashboard-swimlane.css`'s media queries and missed the distinct mobile DOM tree that ships in commit `e228e26` on 2026-05-29. The "accordion sections" and "distinct lane-head renderer path for mobile" that the gemini auditor calls absent actually exist in tree: the server-rendered mobile renderer lives at `packages/studio/src/pages/dashboard/lane-stack-card.ts` (emitting `<section class="lane-stack"><article class="lane-section"><header class="lane-head">…</header><div class="lane-body">…</div></article></section>`), with companion CSS at `plugins/deskwork-studio/public/css/dashboard-lane-stack.css` and client controller at `plugins/deskwork-studio/public/src/dashboard/lane-stack.ts`. The desktop swim markup and the mobile lane-stack markup are both server-rendered as siblings; CSS gates which paints at any given viewport (`.lane-stack { display: none }` on desktop; `.swim-bay-body { display: none }` plus `.lane-stack { display: block }` at and below 720px). Dual-viewport verification at desktop (1920×1080) and phone (390×844) is documented in this audit-log at the "2026-05-29 audit: AUDIT-10 dual-viewport verification (post-`e228e26`)" entry (lines 2083–2118), confirming the brief-contracted DOM structure (`.lane-section > .lane-head + .lane-body`) and every brief affordance (chevron, glyph, name, count, compose chip, view-toggle) lands on the mobile lane-head. Regression coverage lives in `packages/studio/test/dashboard-lane-stack-render.test.ts` and `packages/studio/test/dashboard-lane-stack-client.test.ts`; both files pass against the current implementation (17/17 tests).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — covered by `dashboard-lane-stack-render.test.ts` + `dashboard-lane-stack-client.test.ts`
- [x] Step 2: confirm test fails against current code (verify the bug repros) — verified during AUDIT-20260528-10 cycle (commit `e228e26`)
- [x] Step 3: implement the fix — `e228e26`
- [x] Step 4: confirm test passes — `npx vitest run packages/studio/test/dashboard-lane-stack-render.test.ts packages/studio/test/dashboard-lane-stack-client.test.ts` → 17/17 pass
- [x] Step 5: commit with `Closes AUDIT-20260530-34 (cross-model: AUDIT-BARRAGE-gemini-P5-1)` in subject — see disposition note; closed via duplicate-of-10 disposition rather than a fresh fix commit

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-lane-stack-render.test.ts` + `packages/studio/test/dashboard-lane-stack-client.test.ts` (AUDIT-10 regression — same brief-contracted mobile lane-stack DOM tree)
- [x] `npx vitest run packages/studio/test/dashboard-lane-stack-render.test.ts packages/studio/test/dashboard-lane-stack-client.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-e228e26 (duplicate of AUDIT-20260528-10; closed by the same commit)` per duplicate disposition



### Task 0.11 (fix-finding-AUDIT-20260530-35 (cross-model: AUDIT-BARRAGE-gemini-P5-1)): AUDIT-20260530-35 — [P5-1 gemini] The `tooling-feedback.md` explicitly lists TF-…

Closes AUDIT-20260530-35 (cross-model: AUDIT-BARRAGE-gemini-P5-1). Surface: `docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md`.

Disposition: acknowledged-informational. AUDIT-35 surfaces that TF-008/TF-009/TF-010 are still listed as `Open` in `tooling-feedback.md`. The gemini auditor itself notes *"these are not directly bugs in the feature under audit, they represent acknowledged friction points with the development tooling"* — i.e. this is a status notice, not a feature defect. TF entries are tracked separately through the tooling-feedback workflow (see `.claude/rules/agent-discipline.md` § scope-discovery v1 — dogfood feedback via tooling-feedback.md): each TF entry is closed via its own lifecycle, not via the feature's audit-barrage cleanup queue. No feature-side fix possible; no test possible.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — inapplicable (informational finding; no testable feature bug)
- [x] Step 2: confirm test fails against current code (verify the bug repros) — inapplicable
- [x] Step 3: implement the fix — inapplicable (no feature-side fix possible)
- [x] Step 4: confirm test passes — inapplicable
- [x] Step 5: commit with `Closes AUDIT-20260530-35 (cross-model: AUDIT-BARRAGE-gemini-P5-1)` in subject — informational disposition (acknowledged-informational-tooling-status); see Task 0.11 docs commit

**Acceptance Criteria:**

- [x] Failing test exists at `(inapplicable — informational finding)` — no test possible
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix) — inapplicable
- [x] Audit-log Status flipped to `acknowledged-informational-tooling-status` per disposition



### Task 0.12 (fix-finding-AUDIT-20260530-36 (cross-model: AUDIT-BARRAGE-claude-P5-2)): AUDIT-20260530-36 — [P5-2 claude] Template-aware verb dispatch recomputes `class…

Closes AUDIT-20260530-36 (cross-model: AUDIT-BARRAGE-claude-P5-2). Surface: `packages/studio/src/pages/dashboard/affordances.ts:178` (`verbsForStage`), `:370` (`renderMenu`), `:419-475` (`renderRowActions` / `renderRowDrawer` / `renderRowMenu`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — `packages/studio/test/dashboard-affordances-hoisted-classify.test.ts` (4 assertions: counter on `classifyStage` calls through `renderRow` + 3 sentinel assertions proving the threaded `verbs`/`category` are consumed)
- [x] Step 2: confirm test fails against current code (verify the bug repros) — all 4 tests failed pre-fix (counter=0 because pre-fix call was buried in `verbsForStage`'s closure; sentinel tests failed with TypeError because the renderers were trying to call `verbsForStage` themselves)
- [x] Step 3: implement the fix — hoisted `classifyStage` + `verbsForStage` to `renderRow` (`section.ts`); narrowed sub-renderer signatures to `renderRowActions(verbs)`, `renderRowDrawer(verbs)`, `renderRowMenu(verbs, category)`; `renderMenu` now accepts the precomputed `category`. Exported `StageCategory` + `VerbSet` types.
- [x] Step 4: confirm test passes — 4 new tests pass + full studio suite (977 passed, 11 skipped) + workspace build clean
- [x] Step 5: commit with `Closes AUDIT-20260530-36 (cross-model: AUDIT-BARRAGE-claude-P5-2)` in subject — commit 9f17e72

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-affordances-hoisted-classify.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/studio/test/dashboard-affordances-hoisted-classify.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-9f17e72` via the close-shipped-audit-findings step



### Task 0.13 (fix-finding-AUDIT-20260530-37 (cross-model: AUDIT-BARRAGE-claude-P5-2)): AUDIT-20260530-37 — [P5-2 claude] `classifyStage` throw converts a single out-of…

Closes AUDIT-20260530-37 (cross-model: AUDIT-BARRAGE-claude-P5-2). Surface: `packages/studio/src/pages/dashboard/affordances.ts:99-107` (throw), `packages/studio/src/pages/dashboard/swimlane-card.ts:186-193` (`renderStageCol` body map).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-37 (cross-model: AUDIT-BARRAGE-claude-P5-2)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-classify-throw-fallback.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.14 (fix-finding-AUDIT-20260530-38 (cross-model: AUDIT-BARRAGE-claude-P5-2)): AUDIT-20260530-38 — [P5-2 claude] Mobile lane-sheet focus-trap contract is unver…

Closes AUDIT-20260530-38 (cross-model: AUDIT-BARRAGE-claude-P5-2). Surface: `plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet.ts:60-90`, `packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts:1-30` (coverage docblock).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — three Tab/Shift+Tab wrap tests added at `packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts:253-340`
- [x] Step 2: confirm test fails against current code (verify the bug repros) — 2 of 3 new tests failed against pre-fix code (Tab/Shift+Tab edge-wrap); mid-list passed because the controller did nothing
- [x] Step 3: implement the fix — added opt-in `trapFocus?: boolean` to `createSlideUpSheet` with edge-wrap Tab/Shift+Tab handler; enabled in `swimlane-mobile-sheet.ts`
- [x] Step 4: confirm test passes — 12/12 mobile-sheet-client tests pass; 19/19 shared sheet-controller tests pass; 983/983 studio tests pass
- [x] Step 5: commit with `Closes AUDIT-20260530-38 (cross-model: AUDIT-BARRAGE-claude-P5-2)` in subject — commit 1a25b84

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts:253-340` (cited in Step 1)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-1a25b84` via the close-shipped-audit-findings step



### Task 0.15 (fix-finding-AUDIT-20260530-39 (cross-model: AUDIT-BARRAGE-claude-P5-2)): AUDIT-20260530-39 — [P5-2 claude] `EDITORIAL_STAGE_EMPTY_HINTS` hardcodes editor…

Closes AUDIT-20260530-39 (cross-model: AUDIT-BARRAGE-claude-P5-2). Surface: `packages/studio/src/pages/dashboard/swimlane-card.ts:84-115` (`EDITORIAL_STAGE_EMPTY_HINTS` + `stageEmptyHint`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — `packages/studio/test/dashboard-stage-empty-hint.test.ts` (3 tests: editorial-preset round-trip + no-hints fallback + partial-hints per-stage lookup).
- [x] Step 2: confirm test fails against current code (verify the bug repros) — 2 of 3 failed before the fix (editorial-preset `stageEmptyHints` undefined; partial-hints custom template fell back to generic for the named stage).
- [x] Step 3: implement the fix — added optional `stageEmptyHints` to `PipelineTemplateSchema` (`packages/core/src/pipelines/types.ts`); populated `packages/core/src/pipelines/editorial.json` with the eight hints; rewrote `stageEmptyHint` in `packages/studio/src/pages/dashboard/swimlane-card.ts` to read from `template.stageEmptyHints?.[stage]` with generic fallback; deleted `EDITORIAL_STAGE_EMPTY_HINTS` map + `templateId === 'editorial'` special case.
- [x] Step 4: confirm test passes — 3/3 in the new suite; 986/986 in the full studio suite; 832/832 in the full core suite; the pre-existing editorial-empty-hint end-to-end assertions in `dashboard.test.ts` + `dashboard-swimlane-cta-render.test.ts` continue to pass (same verbatim strings, now sourced from JSON).
- [x] Step 5: commit with `Closes AUDIT-20260530-39 (cross-model: AUDIT-BARRAGE-claude-P5-2)` in subject — `c6810a0`.

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-stage-empty-hint.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/studio/test/dashboard-stage-empty-hint.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-c6810a0` via the close-shipped-audit-findings step



### Task 0.16 (fix-finding-AUDIT-20260530-40 (cross-model: AUDIT-BARRAGE-claude-P5-2)): AUDIT-20260530-40 — [P5-2 claude] Mobile sheet open/closed state is tracked redu…

Closes AUDIT-20260530-40 (cross-model: AUDIT-BARRAGE-claude-P5-2). Surface: `plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet.ts:62-86`, `plugins/deskwork-studio/public/css/dashboard-swimlane.css` (`body[data-lane-sheet-open] .lane-sheet-backdrop` vs `.lane-sheet-container.is-open .lane-rail`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — three unified-state contract tests added at `packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts:370-465` (open/close drives single body attribute; Escape close clears body attr + aria-expanded together; backdrop close uses same single signal)
- [x] Step 2: confirm test fails against current code (verify the bug repros) — 2 of 3 new tests failed against pre-fix code (the third — backdrop close — passed coincidentally because pre-fix `onClose` removed `.is-open` on the scrim path)
- [x] Step 3: implement the fix — CSS rewritten to key the rail slide-up off `body[data-lane-sheet-open] .lane-sheet-container .lane-rail` (instead of `.lane-sheet-container.is-open .lane-rail`); removed `.is-open` class manipulation from `openSheet`/`onClose` in `swimlane-mobile-sheet.ts`; docblock updated to declare the unified-state contract; existing CSS-shape test updated to assert the new selector
- [x] Step 4: confirm test passes — 15/15 mobile-sheet-client tests pass; 989/989 studio tests pass (1 prior failing CSS-shape test brought in line with the new selector)
- [x] Step 5: commit with `Closes AUDIT-20260530-40 (cross-model: AUDIT-BARRAGE-claude-P5-2)` in subject — commit 316c693

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts:370-465` (cited in Step 1)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-316c693` via the close-shipped-audit-findings step



### Task 0.17 (fix-finding-AUDIT-20260530-41 (cross-model: AUDIT-BARRAGE-codex-P5-2)): AUDIT-20260530-41 — [P5-2 codex] Mobile lane sheet opens like a modal but does n…

Closes AUDIT-20260530-41 (cross-model: AUDIT-BARRAGE-codex-P5-2). Surface: plugins/deskwork-studio/public/src/dashboard/swimlane-mobile-sheet.ts:54-131; plugins/deskwork-studio/public/src/mobile-shell/sheet-controller.ts:96-123.

Disposition: duplicate of AUDIT-20260530-38 (claude). Both findings describe the same missing-focus-trap on the mobile lane sheet. Closed by Task 0.14 commit `1a25b84` which added the opt-in `trapFocus?: boolean` flag to `createSlideUpSheet` and enabled it on the lane sheet. Regression coverage at `packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts:253-340` (the AUDIT-38 focus-trap tests) covers the AUDIT-41 surface verbatim — same controller, same lane sheet, same Tab/Shift+Tab edge-wrap contract.

- [x] Step 1: write failing test exercising the bug — covered by AUDIT-38 test
- [x] Step 2: confirm test fails against current code — verified during AUDIT-38 cycle
- [x] Step 3: implement the fix — `1a25b84`
- [x] Step 4: confirm test passes — verified during AUDIT-38 cycle
- [x] Step 5: commit with `Closes AUDIT-20260530-41 (cross-model: AUDIT-BARRAGE-codex-P5-2)` in subject — closed via duplicate-of-38 disposition (see Task 0.17 docs commit)

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts` (AUDIT-38 focus-trap regression — same surface)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-1a25b84 (duplicate of AUDIT-20260530-38; closed by the same Task 0.14 commit)` per duplicate disposition



### Task 0.18 (fix-finding-AUDIT-20260530-42 (cross-model: AUDIT-BARRAGE-codex-P5-2)): AUDIT-20260530-42 — [P5-2 codex] Unbucketed template-stage entries are counted b…

Closes AUDIT-20260530-42 (cross-model: AUDIT-BARRAGE-codex-P5-2). Surface: packages/studio/src/pages/dashboard/lane-data.ts:266-273; packages/studio/src/pages/dashboard/swimlane-card.ts:391-422.

Disposition: duplicate of AUDIT-20260530-25 (claude). Both describe `bucket.unbucketed` entries being counted but never rendered. Closed by Task 0.1 commit `fc192e9` which added per-swim unbucketed-tail rendering (`renderUnbucketedStageCol` + `renderUnbucketedListGroup` in `swimlane-unbucketed.ts`). Regression coverage at `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` covers the same surface.

- [x] Step 1: covered by AUDIT-25 test
- [x] Step 2: verified during AUDIT-25 cycle
- [x] Step 3: implemented in `fc192e9`
- [x] Step 4: verified
- [x] Step 5: closed via duplicate-of-25 disposition (see Task 0.18 docs commit)

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (AUDIT-25 regression — same surface)
- [x] `npx vitest run` exits 0
- [x] Audit-log Status flipped to `fixed-fc192e9 (duplicate of AUDIT-20260530-25; closed by the same Task 0.1 commit)`



### Task 0.19 (fix-finding-AUDIT-20260530-43 (cross-model: AUDIT-BARRAGE-codex-P5-2)): AUDIT-20260530-43 — [P5-2 codex] Held Space repeat on compose/empty CTA still al…

Closes AUDIT-20260530-43 (cross-model: AUDIT-BARRAGE-codex-P5-2). Surface: plugins/deskwork-studio/public/src/dashboard/swimlane-compose.ts:250-262.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-43 (cross-model: AUDIT-BARRAGE-codex-P5-2)` in subject — commit a37a05f

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-compose-client.test.ts` (the new `held Space (repeat=true) preventDefaults page scroll but does NOT activate clipboard write` case appended at the end of the file)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-compose-client.test.ts` exits 0 (passes against the fix; 11/11 cases pass)
- [x] Audit-log Status flipped to `fixed-a37a05f` via the close-shipped-audit-findings step



### Task 0.20 (fix-finding-AUDIT-20260530-44 (cross-model: AUDIT-BARRAGE-claude-P5-3)): AUDIT-20260530-44 — [P5-3 claude] Save button flashes success even when preset p…

Closes AUDIT-20260530-44 (cross-model: AUDIT-BARRAGE-claude-P5-3). Surface: `plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts:handleSaveClick` (the `savePresetFromCurrent → renderPresetList → flashSaveConfirm` sequence) + `swimlane-presets-store.ts:writePresets` (the swallowed `try/catch`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-44 (cross-model: AUDIT-BARRAGE-claude-P5-3)` in subject — commit 3e9d77b

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-presets-save-failure.test.ts` (the new `AUDIT-20260530-44 — preset save surfaces persistence failures` describe block; 3/3 cases pass)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-presets-save-failure.test.ts` exits 0 (passes against the fix; full @deskwork/studio suite stays green at 993 passed)
- [x] Audit-log Status flipped to `fixed-3e9d77b` via the close-shipped-audit-findings step



### Task 0.21 (fix-finding-AUDIT-20260530-45 (cross-model: AUDIT-BARRAGE-claude-P5-3)): AUDIT-20260530-45 — [P5-3 claude] Presets are never reconciled when a lane is re…

Closes AUDIT-20260530-45 (cross-model: AUDIT-BARRAGE-claude-P5-3). Surface: `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:applyPreset` + `snapshotCurrentState`; contrast `swimlane-drag.ts:reconcileOrder`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — `packages/studio/test/dashboard-swimlane-presets-reconcile.test.ts`
- [x] Step 2: confirm test fails against current code (verify the bug repros) — pre-fix failed on case (1) `applyPreset drops dead lane ids from focusedLanes` AND case (3) `savePresetFromCurrent drops dead lane ids from the captured focus set`
- [x] Step 3: implement the fix — added `reconcileLaneIds` helper mirroring `reconcileOrder`'s read-time-filter discipline; threaded through `applyPreset` (both visible + focused axes) and `snapshotCurrentState` (focused axis)
- [x] Step 4: confirm test passes — 4/4 cases pass; full @deskwork/studio suite 997 passed (was 993; +4 from new test file), 0 regressions
- [x] Step 5: commit with `Closes AUDIT-20260530-45 (cross-model: AUDIT-BARRAGE-claude-P5-3)` in subject — commit `81fb028`

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-presets-reconcile.test.ts` (the new `AUDIT-20260530-45 — preset lane-id reconciliation` describe block; 4/4 cases pass)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-presets-reconcile.test.ts` exits 0 (passes against the fix; full @deskwork/studio suite stays green at 997 passed)
- [x] Audit-log Status flipped to `fixed-81fb028` via the close-shipped-audit-findings step



### Task 0.22 (fix-finding-AUDIT-20260530-46 (cross-model: AUDIT-BARRAGE-claude-P5-3)): AUDIT-20260530-46 — [P5-3 claude] `applyPreset` does not enforce the hidden⇒not-…

Closes AUDIT-20260530-46 (cross-model: AUDIT-BARRAGE-claude-P5-3). Surface: `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:applyPreset` (visibility write at the `writeJsonOrIgnore(visibilityKey...)` step + focus write at `writeJsonOrIgnore(focusKey..., preset.focusedLanes)`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — extended `packages/studio/test/dashboard-swimlane-presets-reconcile.test.ts` with new `AUDIT-20260530-46 — applyPreset enforces hidden⇒not-focused invariant` describe block (2 cases: positive strip + negative no-op)
- [x] Step 2: confirm test fails against current code (verify the bug repros) — pre-fix failed on the positive case `strips focused lanes that are NOT in the visible set before writing :focus` (`:focus` storage contained `['default', 'qa']` even though `qa` was in the hidden set)
- [x] Step 3: implement the fix — added `enforceHiddenNotFocused(focused, visible)` helper mirroring `reconcileLaneIds`'s read-time-filter discipline; threaded through `applyPreset` at the focus-write call site (composes with the `reconcileLaneIds` filter so both apply-boundary invariants land together); `applyPreset` docstring updated to enumerate both invariants
- [x] Step 4: confirm test passes — 2/2 new cases pass; full @deskwork/studio suite 999 passed (was 997; +2 from new cases), 0 regressions
- [x] Step 5: commit with `Closes AUDIT-20260530-46 (cross-model: AUDIT-BARRAGE-claude-P5-3)` in subject — commit `378fb46`

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-presets-reconcile.test.ts` (the new `AUDIT-20260530-46 — applyPreset enforces hidden⇒not-focused invariant` describe block; 2/2 cases pass)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-presets-reconcile.test.ts` exits 0 (passes against the fix; full @deskwork/studio suite stays green at 999 passed)
- [x] Audit-log Status flipped to `fixed-378fb46` via the close-shipped-audit-findings step



### Task 0.23 (fix-finding-AUDIT-20260530-47 (cross-model: AUDIT-BARRAGE-claude-P5-3)): AUDIT-20260530-47 — [P5-3 claude] Deep-link `?preset=<id>` only resolves in the …

Closes AUDIT-20260530-47 (cross-model: AUDIT-BARRAGE-claude-P5-3). Surface: `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:savePresetFromCurrent` (id minting: `const id = \`p${now.getTime().toString(36)}\``) + `swimlane-presets.ts:applyDeepLinkPreset`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — `packages/studio/test/dashboard-swimlane-presets-client.test.ts` `it('deep-link with unknown preset id surfaces a visible notice and strips the param (AUDIT-20260530-47)')`
- [x] Step 2: confirm test fails against current code (verify the bug repros) — `[data-preset-deep-link-notice]` query returns `null` before the fix (`expected null not to be null`)
- [x] Step 3: implement the fix — `swimlane-presets.ts:applyDeepLinkPreset` branches on cache miss to mount a transient inline notice via `showDeepLinkMissNotice` + strip the `?preset=` param; CSS rules in `dashboard-swimlane-presets.css` paint the notice in the press-check palette
- [x] Step 4: confirm test passes — full `dashboard-swimlane-presets-client.test.ts` 6/6 green; `npm --workspace @deskwork/studio test` 1000 passed (up from 999)
- [x] Step 5: commit with `Closes AUDIT-20260530-47 (cross-model: AUDIT-BARRAGE-claude-P5-3)` in subject — `e0ff622`

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-presets-client.test.ts` (the new `AUDIT-20260530-47` case under `Task 5.5 — saveable focus presets UI affordances`)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-presets-client.test.ts` exits 0 (passes against the fix; full @deskwork/studio suite stays green at 1000 passed)
- [x] Audit-log Status flipped to `fixed-e0ff622` via the close-shipped-audit-findings step



### Task 0.24 (fix-finding-AUDIT-20260530-48 (cross-model: AUDIT-BARRAGE-claude-P5-3)): AUDIT-20260530-48 — [P5-3 claude] SSR "no flash-of-empty-content" claim is false…

Closes AUDIT-20260530-48 (cross-model: AUDIT-BARRAGE-claude-P5-3). Surface: `packages/studio/src/pages/dashboard/swimlane-rail.ts:renderPresetSurface` docstring ("re-rendered identically by the client … no flash-of-empty-content") vs `plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts:renderPresetList`.

Disposition: docstring-only fix. Rewrote the no-flash claim at `swimlane-rail.ts:131-132` to scope the guarantee to the empty case + explain the saved-presets flash as the cost of THESIS Consequence 2 (per-operator state stays per-operator; SSR has no per-browser localStorage access). No code/behaviour change.

- [x] Step 1: docstring-only; no failing test required (no behaviour to assert)
- [x] Step 2: N/A (docstring fix)
- [x] Step 3: implemented in `4ca60b6`
- [x] Step 4: full studio suite (1000 passed) confirms no regression from the docstring edit
- [x] Step 5: closed via Task 0.24 docstring commit `4ca60b6`

**Acceptance Criteria:**

- [x] Failing test exists at `(N/A — docstring fix, no behaviour test possible)`
- [x] `npx vitest run` exits 0 — full suite 1000 passed
- [x] Audit-log Status flipped to `fixed-4ca60b6`



### Task 0.25 (fix-finding-AUDIT-20260530-49 (cross-model: AUDIT-BARRAGE-claude-P5-3)): AUDIT-20260530-49 — [P5-3 claude] DRY regression: `readJsonArrayOfStrings` re-im…

Closes AUDIT-20260530-49 (cross-model: AUDIT-BARRAGE-claude-P5-3). Surface: `plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:readJsonArrayOfStrings` (and the trio `writePresets`/`writeJsonOrIgnore`/`writeStoredOrder` across the three files).

- [x] Step 1: failing test written at `packages/studio/test/dashboard-swimlane-storage-dry.test.ts` (9 cases: 5 `readStoredStringArray` parity + 4 `writeJsonOrIgnore` contract)
- [x] Step 2: pre-fix run failed 4/9 (`writeJsonOrIgnore` not exported from `swimlane-storage`)
- [x] Step 3: implemented in `043b775` — added shared `writeJsonOrIgnore` to `swimlane-storage.ts`; removed `readJsonArrayOfStrings` from presets-store; routed `writePresets` + apply-side `writeJsonOrIgnore` + `writeStoredOrder` through the shared helper
- [x] Step 4: full studio suite 1009 passed (was 1000; +9 new test); all 53 related preset+drag tests pass; AUDIT-44 boolean contract preserved
- [x] Step 5: committed in `043b775` with `Closes AUDIT-20260530-49 (cross-model: AUDIT-BARRAGE-claude-P5-3)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-storage-dry.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-storage-dry.test.ts` exits 0 (9/9 pass against the fix)
- [x] Audit-log Status flipped to `fixed-043b775` via the close-shipped-audit-findings step



### Task 0.26 (fix-finding-AUDIT-20260530-50 (cross-model: AUDIT-BARRAGE-claude-P5-3)): AUDIT-20260530-50 — [P5-3 claude] Test suite never exercises localStorage write-…

Closes AUDIT-20260530-50 (cross-model: AUDIT-BARRAGE-claude-P5-3). Surface: `packages/studio/test/dashboard-swimlane-presets-client.test.ts` + `packages/studio/test/dashboard-swimlane-drag-client.test.ts`.

AUDIT-20260530-44 (Task 0.20) already added `dashboard-swimlane-presets-save-failure.test.ts` covering `writePresets` failure via prototype-level `Storage.prototype.setItem` spy. The remaining gap — `writeStoredOrder` (drag/reorder) and `writeStoredSet` (visibility/focus state on swimlane.ts) — is closed by new `packages/studio/test/dashboard-swimlane-write-failure.test.ts` (commit `9ab86b1`). The new file mirrors the AUDIT-44 prototype-spy pattern with a targeted-matcher per test so only the key under test fails. Three tests: drag drop with failing lane-order key + eye-toggle click with failing visibility/focus keys + focus-chip click with failing focus/visibility keys. Each asserts (a) no exception propagates out of the handler and (b) the in-DOM state still applied.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — `packages/studio/test/dashboard-swimlane-write-failure.test.ts`
- [x] Step 2: confirm test fails against current code (verify the bug repros) — initial run produced 2/3 failures (storage-state sanity assertions needed adjustment for `initSwimlane` pre-writing initial state); contract assertions held throughout
- [x] Step 3: implement the fix — coverage-only finding; production swallow already correct per AUDIT-49 refactor (commit `9ab86b1`)
- [x] Step 4: confirm test passes — `npx vitest run packages/studio/test/dashboard-swimlane-write-failure.test.ts` exits 0 (3/3 passed); `npm --workspace @deskwork/studio test` exits 0 (1012/1012 passed, no regression)
- [x] Step 5: commit with `Closes AUDIT-20260530-50 (cross-model: AUDIT-BARRAGE-claude-P5-3)` in subject — commit `9ab86b1`

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-swimlane-write-failure.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/studio/test/dashboard-swimlane-write-failure.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-9ab86b1` via the close-shipped-audit-findings step



### Task 0.27 (fix-finding-AUDIT-20260530-51 (cross-model: AUDIT-BARRAGE-codex-P5-3)): AUDIT-20260530-51 — [P5-3 codex] Preset storage write failures are reported as s…

Closes AUDIT-20260530-51 (cross-model: AUDIT-BARRAGE-codex-P5-3). Surface: plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store.ts:209-221,349-414; plugins/deskwork-studio/public/src/dashboard/swimlane-presets.ts:188-205.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-51 (cross-model: AUDIT-BARRAGE-codex-P5-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.28 (fix-finding-AUDIT-20260530-52 (cross-model: AUDIT-BARRAGE-codex-P5-3)): AUDIT-20260530-52 — [P5-3 codex] Workplan marks a scoped server-side preset path…

Closes AUDIT-20260530-52 (cross-model: AUDIT-BARRAGE-codex-P5-3). Surface: docs/1.0/001-IN-PROGRESS/graphical-entries/workplan.md:267-271.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-52 (cross-model: AUDIT-BARRAGE-codex-P5-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.29 (fix-finding-AUDIT-20260530-53 (cross-model: AUDIT-BARRAGE-codex-P5-3)): AUDIT-20260530-53 — [P5-3 codex] Stored lane order accepts duplicate IDs and can…

Closes AUDIT-20260530-53 (cross-model: AUDIT-BARRAGE-codex-P5-3). Surface: plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts:53-63; plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts:72-89,371-392.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-53 (cross-model: AUDIT-BARRAGE-codex-P5-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.30 (fix-finding-AUDIT-20260530-54 (cross-model: AUDIT-BARRAGE-claude-P6-1)): AUDIT-20260530-54 — [P6-1 claude] `pipeline update --rename-stage` writes `<id>-…

Closes AUDIT-20260530-54 (cross-model: AUDIT-BARRAGE-claude-P6-1). Surface: `packages/core/src/pipelines/operations/update.ts:appendRenameMigration` (writes `${pipelineId}-renames.json` into `pipelineOverridesDir`) vs `packages/core/src/pipelines/loader.ts:listAvailablePipelineTemplates` (`:251`) + `packages/core/src/pipelines/operations/list.ts:listPipelines`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-54 (cross-model: AUDIT-BARRAGE-claude-P6-1)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.31 (fix-finding-AUDIT-20260530-55 (cross-model: AUDIT-BARRAGE-claude-P6-1)): AUDIT-20260530-55 — [P6-1 claude] `pipeline delete --reassign-lanes-to ""` (empt…

Closes AUDIT-20260530-55 (cross-model: AUDIT-BARRAGE-claude-P6-1). Surface: `packages/core/src/pipelines/operations/delete.ts:deletePipeline` (refusal guard, validation guard, rebind loop).

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-55 (cross-model: AUDIT-BARRAGE-claude-P6-1)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.32 (fix-finding-AUDIT-20260530-56 (cross-model: AUDIT-BARRAGE-claude-P6-1)): AUDIT-20260530-56 — [P6-1 claude] `appendRenameMigration` is non-atomic and sile…

Closes AUDIT-20260530-56 (cross-model: AUDIT-BARRAGE-claude-P6-1). Surface: `packages/core/src/pipelines/operations/update.ts:appendRenameMigration` (read + `writeFileSync` direct), and `plugins/deskwork/skills/pipeline/SKILL.md` Safety-rules ("migration sidecar is append-only … deleting it loses the audit trail").

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-56 (cross-model: AUDIT-BARRAGE-claude-P6-1)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.33 (fix-finding-AUDIT-20260530-57 (cross-model: AUDIT-BARRAGE-claude-P6-1)): AUDIT-20260530-57 — [P6-1 claude] `listLanes` / `listPipelines` throw on a singl…

Closes AUDIT-20260530-57 (cross-model: AUDIT-BARRAGE-claude-P6-1). Surface: `packages/core/src/lanes/operations/list.ts:listLanes` (N+1 `loadLaneConfig`), `packages/core/src/pipelines/operations/list.ts:listPipelines` (N+1 `loadPipelineTemplate`), vs `packages/core/src/lanes/loader.ts:listLaneConfigs` + `isArchivedOnDisk`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-57 (cross-model: AUDIT-BARRAGE-claude-P6-1)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.34 (fix-finding-AUDIT-20260530-58 (cross-model: AUDIT-BARRAGE-claude-P6-1)): AUDIT-20260530-58 — [P6-1 claude] `lane move` of a pre-migration entry (no `lane…

Closes AUDIT-20260530-58 (cross-model: AUDIT-BARRAGE-claude-P6-1). Surface: `packages/core/src/lanes/operations/move.ts:moveEntryToLane` (`sourceLaneId = sidecar.lane ?? DEFAULT_LANE_ID`, then `loadLaneConfig(sourceLaneId, projectRoot)`).

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-58 (cross-model: AUDIT-BARRAGE-claude-P6-1)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.35 (fix-finding-AUDIT-20260530-59 (cross-model: AUDIT-BARRAGE-claude-P6-1)): AUDIT-20260530-59 — [P6-1 claude] Rollback-test silently no-ops (returns "pass")…

Closes AUDIT-20260530-59 (cross-model: AUDIT-BARRAGE-claude-P6-1). Surface: `packages/cli/test/lane/move.test.ts:264-280` ("rolls back artifact + scrapbook when writeSidecar fails").

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-59 (cross-model: AUDIT-BARRAGE-claude-P6-1)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.36 (fix-finding-AUDIT-20260530-61 (cross-model: AUDIT-BARRAGE-codex-P6-1)): AUDIT-20260530-61 — [P6-1 codex] Stage-rename sidecar is enumerated as a fake pi…

Closes AUDIT-20260530-61 (cross-model: AUDIT-BARRAGE-codex-P6-1). Surface: `packages/core/src/pipelines/operations/update.ts:410-459`, `packages/core/src/pipelines/loader.ts:251-260`, `packages/core/src/pipelines/operations/list.ts:38-40`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-61 (cross-model: AUDIT-BARRAGE-codex-P6-1)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.37 (fix-finding-AUDIT-20260530-62 (cross-model: AUDIT-BARRAGE-codex-P6-1)): AUDIT-20260530-62 — [P6-1 codex] `remove-stage` misses legacy default-lane entri…

Closes AUDIT-20260530-62 (cross-model: AUDIT-BARRAGE-codex-P6-1). Surface: `packages/core/src/pipelines/operations/update.ts:367-395`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-62 (cross-model: AUDIT-BARRAGE-codex-P6-1)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.38 (fix-finding-AUDIT-20260530-63 (cross-model: AUDIT-BARRAGE-codex-P6-1)): AUDIT-20260530-63 — [P6-1 codex] `delete --reassign-lanes-to` can leave a partia…

Closes AUDIT-20260530-63 (cross-model: AUDIT-BARRAGE-codex-P6-1). Surface: `packages/core/src/pipelines/operations/delete.ts:179-222`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-63 (cross-model: AUDIT-BARRAGE-codex-P6-1)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.39 (fix-finding-AUDIT-20260530-64 (cross-model: AUDIT-BARRAGE-codex-P6-1)): AUDIT-20260530-64 — [P6-1 codex] `lane move` trusts sidecar paths when moving fi…

Closes AUDIT-20260530-64 (cross-model: AUDIT-BARRAGE-codex-P6-1). Surface: `packages/core/src/lanes/operations/move.ts:210-231`, `packages/core/src/schema/entry.ts:213-218`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-64 (cross-model: AUDIT-BARRAGE-codex-P6-1)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.40 (fix-finding-AUDIT-20260530-65 (cross-model: AUDIT-BARRAGE-claude-P6-2)): AUDIT-20260530-65 — [P6-2 claude] Pipelines data layer re-reads + re-parses ever…

Closes AUDIT-20260530-65 (cross-model: AUDIT-BARRAGE-claude-P6-2). Surface: `packages/studio/src/pages/pipelines/data.ts` — `loadPipelinesPageData` (loop), `findReferencingLanes`, `readLanePipelineTemplate`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-65 (cross-model: AUDIT-BARRAGE-claude-P6-2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.41 (fix-finding-AUDIT-20260530-66 (cross-model: AUDIT-BARRAGE-claude-P6-2)): AUDIT-20260530-66 — [P6-2 claude] `/dev/lanes` hard-fails the entire page on one…

Closes AUDIT-20260530-66 (cross-model: AUDIT-BARRAGE-claude-P6-2). Surface: `packages/studio/src/pages/lanes/data.ts` — `loadLanesPageData` loop (`loadLaneConfig(id, projectRoot)` with no try/catch); `packages/studio/src/server.ts:/dev/lanes` route.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-66 (cross-model: AUDIT-BARRAGE-claude-P6-2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.42 (fix-finding-AUDIT-20260530-67 (cross-model: AUDIT-BARRAGE-claude-P6-2)): AUDIT-20260530-67 — [P6-2 claude] Corrupt/unreadable lane JSON is silently dropp…

Closes AUDIT-20260530-67 (cross-model: AUDIT-BARRAGE-claude-P6-2). Surface: `packages/studio/src/pages/pipelines/data.ts` — `readLanePipelineTemplate` (returns `null` on `readFile`/`JSON.parse` failure), `findReferencingLanes`, consumed by `renderDeleteButton` in `pipelines/table.ts`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-67 (cross-model: AUDIT-BARRAGE-claude-P6-2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.43 (fix-finding-AUDIT-20260530-68 (cross-model: AUDIT-BARRAGE-claude-P6-2)): AUDIT-20260530-68 — [P6-2 claude] Lanes page never emits `data-project-key`, so …

Closes AUDIT-20260530-68 (cross-model: AUDIT-BARRAGE-claude-P6-2). Surface: `packages/studio/src/pages/lanes.ts` (`<main ... data-lanes-container>`); `plugins/deskwork-studio/public/src/lanes/lanes-page.ts` — `archivedOpenKey`/`initArchivedSection` via `resolveProjectKey(container)`; `packages/studio/test/lanes/lanes-page-client.test.ts` (`container.dataset.projectKey = 'test-proj'`).

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-68 (cross-model: AUDIT-BARRAGE-claude-P6-2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.44 (fix-finding-AUDIT-20260530-69 (cross-model: AUDIT-BARRAGE-claude-P6-2)): AUDIT-20260530-69 — [P6-2 claude] Edit-form diff-emit trims the live value but n…

Closes AUDIT-20260530-69 (cross-model: AUDIT-BARRAGE-claude-P6-2). Surface: `plugins/deskwork-studio/public/src/lanes/lanes-page.ts` — `readFieldValue` (`el?.value.trim()`), `readFieldCurrent` (`el?.dataset.current` — untrimmed), `buildUpdateCommand`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-69 (cross-model: AUDIT-BARRAGE-claude-P6-2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.45 (fix-finding-AUDIT-20260530-70 (cross-model: AUDIT-BARRAGE-claude-P6-2)): AUDIT-20260530-70 — [P6-2 claude] No XSS regression test feeds an operator-contr…

Closes AUDIT-20260530-70 (cross-model: AUDIT-BARRAGE-claude-P6-2). Surface: `packages/studio/src/pages/lanes/edit-form.ts` (`value="${row.name}"`, `data-current="${row.name}"`, `data-current="${row.contentDir}"`); `packages/studio/src/pages/pipelines/view-panel.ts`/`table.ts`; `packages/studio/test/lanes/*` + `test/pipelines/*`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-70 (cross-model: AUDIT-BARRAGE-claude-P6-2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.46 (fix-finding-AUDIT-20260530-71 (cross-model: AUDIT-BARRAGE-claude-P6-2)): AUDIT-20260530-71 — [P6-2 claude] View and Edit panels are rendered in full (5 s…

Closes AUDIT-20260530-71 (cross-model: AUDIT-BARRAGE-claude-P6-2). Surface: `packages/studio/src/pages/pipelines/table.ts` — `renderHealthyRow` (always emits `renderViewPanel(row)` + `renderEditForm(row, …)`); `edit-form.ts`, `view-panel.ts`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-71 (cross-model: AUDIT-BARRAGE-claude-P6-2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.47 (fix-finding-AUDIT-20260530-72 (cross-model: AUDIT-BARRAGE-claude-P6-2)): AUDIT-20260530-72 — [P6-2 claude] `classifyLoadError` substring matching can mis…

Closes AUDIT-20260530-72 (cross-model: AUDIT-BARRAGE-claude-P6-2). Surface: `packages/studio/src/pages/pipelines/data.ts` — `classifyLoadError`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-72 (cross-model: AUDIT-BARRAGE-claude-P6-2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.48 (fix-finding-AUDIT-20260530-73 (cross-model: AUDIT-BARRAGE-codex-P6-2)): AUDIT-20260530-73 — [P6-2 codex] Required-field copy builders can copy placehold…

Closes AUDIT-20260530-73 (cross-model: AUDIT-BARRAGE-codex-P6-2). Surface: `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:95-103,182-189`; `plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts:88-102,205-228`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-73 (cross-model: AUDIT-BARRAGE-codex-P6-2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.49 (fix-finding-AUDIT-20260530-74 (cross-model: AUDIT-BARRAGE-codex-P6-2)): AUDIT-20260530-74 — [P6-2 codex] Set-locked builder advertises a CLI-refused emp…

Closes AUDIT-20260530-74 (cross-model: AUDIT-BARRAGE-codex-P6-2). Surface: `plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts:157-163`; `packages/studio/test/pipelines/pipelines-page-client.test.ts:214-238`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-74 (cross-model: AUDIT-BARRAGE-codex-P6-2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.50 (fix-finding-AUDIT-20260530-75 (cross-model: AUDIT-BARRAGE-codex-P6-2)): AUDIT-20260530-75 — [P6-2 codex] Page init is not actually idempotent

Closes AUDIT-20260530-75 (cross-model: AUDIT-BARRAGE-codex-P6-2). Surface: `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:167-189,193-221,240-289,322-344,347-364`; `plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts:141-174,177-231,240-267,294-347,350-367`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-75 (cross-model: AUDIT-BARRAGE-codex-P6-2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.51 (fix-finding-AUDIT-20260530-76 (cross-model: AUDIT-BARRAGE-codex-P6-2)): AUDIT-20260530-76 — [P6-2 codex] Lanes and pipelines pages mark Dashboard as the…

Closes AUDIT-20260530-76 (cross-model: AUDIT-BARRAGE-codex-P6-2). Surface: `packages/studio/src/pages/lanes.ts:76-80`; `packages/studio/src/pages/pipelines.ts:72-75`; `packages/studio/src/pages/chrome.ts:63-67`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-76 (cross-model: AUDIT-BARRAGE-codex-P6-2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.52 (fix-finding-AUDIT-20260530-77 (cross-model: AUDIT-BARRAGE-claude-P6-3)): AUDIT-20260530-77 — [P6-3 claude] Delete-refusal message lists entry UUIDs but i…

Closes AUDIT-20260530-77 (cross-model: AUDIT-BARRAGE-claude-P6-3). Surface: `packages/core/src/doctor/rules/lane-config-missing-template.ts:290-309` (delete dependency check + refusal message).

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-77 (cross-model: AUDIT-BARRAGE-claude-P6-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.53 (fix-finding-AUDIT-20260530-78 (cross-model: AUDIT-BARRAGE-claude-P6-3)): AUDIT-20260530-78 — [P6-3 claude] Entry-binding guard can false-negative on corr…

Closes AUDIT-20260530-78 (cross-model: AUDIT-BARRAGE-claude-P6-3). Surface: `packages/core/src/doctor/rules/lane-config-missing-template.ts:280-300` (`readAllSidecars` dependency check).

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-78 (cross-model: AUDIT-BARRAGE-claude-P6-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.54 (fix-finding-AUDIT-20260530-79 (cross-model: AUDIT-BARRAGE-claude-P6-3)): AUDIT-20260530-79 — [P6-3 claude] Lane mutation lands on disk before the journal…

Closes AUDIT-20260530-79 (cross-model: AUDIT-BARRAGE-claude-P6-3). Surface: `packages/core/src/doctor/rules/lane-config-missing-template.ts:243-262` (set-template) and `:314-333` (delete).

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-79 (cross-model: AUDIT-BARRAGE-claude-P6-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.55 (fix-finding-AUDIT-20260530-80 (cross-model: AUDIT-BARRAGE-claude-P6-3)): AUDIT-20260530-80 — [P6-3 claude] Audit scans archived lanes at severity=error, …

Closes AUDIT-20260530-80 (cross-model: AUDIT-BARRAGE-claude-P6-3). Surface: `packages/core/src/doctor/rules/lane-config-missing-template.ts:165` (`listLaneConfigs(ctx.projectRoot, { includeArchived: true })`).

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-80 (cross-model: AUDIT-BARRAGE-claude-P6-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.56 (fix-finding-AUDIT-20260530-81 (cross-model: AUDIT-BARRAGE-claude-P6-3)): AUDIT-20260530-81 — [P6-3 claude] `laneFilePath` is persisted as an absolute pat…

Closes AUDIT-20260530-81 (cross-model: AUDIT-BARRAGE-claude-P6-3). Surface: `packages/core/src/doctor/rules/lane-config-missing-template.ts:200-210` (finding.details), `:324-329` (journal event); `packages/core/src/schema/journal-events.ts:228` (`laneFilePath: z.string().min(1)`).

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-81 (cross-model: AUDIT-BARRAGE-claude-P6-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.57 (fix-finding-AUDIT-20260530-82 (cross-model: AUDIT-BARRAGE-claude-P6-3)): AUDIT-20260530-82 — [P6-3 claude] Integration test silently depends on a prebuil…

Closes AUDIT-20260530-82 (cross-model: AUDIT-BARRAGE-claude-P6-3). Surface: `packages/cli/test/custom-pipeline-lane-integration.test.ts:46-47, 60-69`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-82 (cross-model: AUDIT-BARRAGE-claude-P6-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.58 (fix-finding-AUDIT-20260530-83 (cross-model: AUDIT-BARRAGE-claude-P6-3)): AUDIT-20260530-83 — [P6-3 claude] Integration test bypasses the entry-creation C…

Closes AUDIT-20260530-83 (cross-model: AUDIT-BARRAGE-claude-P6-3). Surface: `packages/cli/test/custom-pipeline-lane-integration.test.ts:130-152` (`writeSidecarFile`), workplan step 6.6.1.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-83 (cross-model: AUDIT-BARRAGE-claude-P6-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.59 (fix-finding-AUDIT-20260530-84 (cross-model: AUDIT-BARRAGE-claude-P6-3)): AUDIT-20260530-84 — [P6-3 claude] `spawnSync` calls have no timeout; a hung CLI …

Closes AUDIT-20260530-84 (cross-model: AUDIT-BARRAGE-claude-P6-3). Surface: `packages/cli/test/custom-pipeline-lane-integration.test.ts:99-108` (`pipeline`), `:111-120` (`lane`).

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-84 (cross-model: AUDIT-BARRAGE-claude-P6-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.60 (fix-finding-AUDIT-20260530-85 (cross-model: AUDIT-BARRAGE-codex-P6-3)): AUDIT-20260530-85 — [P6-3 codex] Repair can mutate lane state without recording …

Closes AUDIT-20260530-85 (cross-model: AUDIT-BARRAGE-codex-P6-3). Surface: packages/core/src/doctor/rules/lane-config-missing-template.ts:303-320 and packages/core/src/doctor/rules/lane-config-missing-template.ts:364-381.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-85 (cross-model: AUDIT-BARRAGE-codex-P6-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.61 (fix-finding-AUDIT-20260530-86 (cross-model: AUDIT-BARRAGE-codex-P6-3)): AUDIT-20260530-86 — [P6-3 codex] Rebind prompt can offer templates that cannot a…

Closes AUDIT-20260530-86 (cross-model: AUDIT-BARRAGE-codex-P6-3). Surface: packages/core/src/doctor/rules/lane-config-missing-template.ts:214-229 and packages/core/src/doctor/rules/lane-config-missing-template.ts:287-299.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-86 (cross-model: AUDIT-BARRAGE-codex-P6-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.62 (fix-finding-AUDIT-20260530-87 (cross-model: AUDIT-BARRAGE-codex-P6-3)): AUDIT-20260530-87 — [P6-3 codex] CLI subprocess integration test can hang indefi…

Closes AUDIT-20260530-87 (cross-model: AUDIT-BARRAGE-codex-P6-3). Surface: packages/cli/test/custom-pipeline-lane-integration.test.ts:86-104.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-87 (cross-model: AUDIT-BARRAGE-codex-P6-3)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.63 (fix-finding-AUDIT-20260530-88 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)): AUDIT-20260530-88 — [P7T7.2 claude] SKILL.md error-handling catalog contradicts …

Closes AUDIT-20260530-88 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `plugins/deskwork/skills/group/SKILL.md` (Error handling section, `show`/`update` bullets) vs `packages/core/src/groups/operations/show.ts:54-60` and `packages/core/src/groups/operations/update.ts:48-54`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-88 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.64 (fix-finding-AUDIT-20260530-89 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)): AUDIT-20260530-89 — [P7T7.2 claude] `showGroup` member-enrichment swallows corru…

Closes AUDIT-20260530-89 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `packages/core/src/groups/operations/show.ts:66-78` (the per-member `try { readSidecar } catch { ...missing: true }` loop).

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-89 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.65 (fix-finding-AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)): AUDIT-20260530-90 — [P7T7.2 claude] `isPopulatedGroupEntry` is defined and docum…

Closes AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `packages/core/src/groups/types.ts:46-49` (definition + doc) vs `packages/core/src/groups/index.ts:11` (`export { isArchivedEntry, isGroupEntry } from './types.ts';`).

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-90 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.66 (fix-finding-AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)): AUDIT-20260530-91 — [P7T7.2 claude] Inconsistent exit codes for a bad `--at` arg…

Closes AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2). Surface: `packages/cli/src/commands/group.ts:233-245` (handleAddMember `--at` parse) and `packages/core/src/groups/operations/add-member.ts:124-135` (out-of-range throw).

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-91 (cross-model: AUDIT-BARRAGE-claude-P7T7.2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.67 (fix-finding-AUDIT-20260530-92 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)): AUDIT-20260530-92 — [P7T7.2 codex] `isPopulatedGroupEntry` is implemented but no…

Closes AUDIT-20260530-92 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `packages/core/src/groups/index.ts:11`, `packages/core/src/groups/types.ts:39-45`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-92 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.68 (fix-finding-AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)): AUDIT-20260530-93 — [P7T7.2 codex] Group mutators can commit sidecar changes wit…

Closes AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `packages/core/src/groups/operations/create.ts:106-121`, `packages/core/src/groups/operations/update.ts:84-94`, `packages/core/src/groups/operations/add-member.ts:126-145`, `packages/core/src/groups/operations/remove-member.ts:72-89`, `packages/core/src/groups/operations/archive.ts:68-77`, `packages/core/src/groups/operations/archive.ts:104-109`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.69 (fix-finding-AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)): AUDIT-20260530-94 — [P7T7.2 codex] Extra positional arguments are silently ignor…

Closes AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `packages/cli/src/commands/group.ts:151-163`, `packages/cli/src/commands/group.ts:182-213`, `packages/cli/src/commands/group.ts:221-248`, `packages/cli/src/commands/group.ts:274-296`, `packages/cli/src/commands/group.ts:302-318`, `packages/cli/src/commands/group.ts:324-340`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-94 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 0.70 (fix-finding-AUDIT-20260530-95 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)): AUDIT-20260530-95 — [P7T7.2 codex] Group skill documentation still describes the…

Closes AUDIT-20260530-95 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Surface: `plugins/deskwork/skills/group/SKILL.md:53`, `plugins/deskwork/skills/group/SKILL.md:58-66`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260530-95 (cross-model: AUDIT-BARRAGE-codex-P7T7.2)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

## Phase 1: Prior-art research + build-vs-reuse decision  ·  [#302](https://github.com/audiocontrol-org/deskwork/issues/302)

**Deliverable:** Decision document at `docs/studio-design/ACCEPTED/<date>-graphical-review-prior-art/brief.md` recording the chosen stack (annotation data model, image annotation UI, HTML annotation UI, threading, screenshot capture, screenshot markup) with rationale + dependency footprint + adopter-facing impact. **No production implementation in this phase.**

### Task 1.1: OSS candidate survey

- [x] Step 1.1.1: Author a candidate matrix at `docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/candidates.md` — 17 candidates evaluated across 6 concerns (image annotation, HTML annotation, data model, screenshot capture, screenshot markup, closed-source inform-only).
- [x] Step 1.1.2: License / last-commit / bundle weight / W3C alignment / browser-API surface / self-hosting cost / adoptable y/n captured per row; sources cited inline.
- [ ] Step 1.1.3: Drop the matrix into the decision-doc draft as the "Survey" section. (Deferred to Task 1.6.)

**Surprises surfaced that change the spike picks:**
- **tldraw disqualified** — source-available licence, requires paid commercial use or "made with tldraw" watermark; incompatible with deskwork's OSS-dependency constraint. Excalidraw is the clean MIT alternative.
- **html2canvas effectively unmaintained** (no release since 2022-01; 975+ open issues). **html-to-image** is the 2025/2026 consensus successor.
- **recogito-js archived 2023-12.** Use **@recogito/text-annotator** from the same team.
- **Hypothes.is client = library + service.** Embedding it drags in the API server surface. Adopt the data model + UX patterns; consider the runtime only if willing to self-host `h` or build an adapter.

### Task 1.2: Spike — image annotation library integration

- [x] Step 1.2.1: Pick the top-2 image-annotation candidates from Task 1.1. **Library-of-one finding:** Annotorious is the lone viable embeddable image-annotation library (Recogito Studio is a Docker-deployed platform; `recogito-js` is archived 2023-12; `@recogito/text-annotator` is text-only). Spike narrowed to Annotorious; rationale recorded in `decision-draft.md`.
- [x] Step 1.2.2: Built spike at [`spikes/graphical-review/annotorious-image/`](../../../../spikes/graphical-review/annotorious-image/) — vanilla JS + Vite dev server, self-contained SVG fixture, `W3CImageFormat` adapter wired so lifecycle events deliver W3C JSON-LD directly, payload mirrored to the page and downloadable as `annotations.json`. Verified at desktop (1280×800) and iPhone-13 viewport via `scripts/verify.mjs`.
- [x] Step 1.2.3: Integration cost measured: 158 lines glue code in `src/spike.js` (403 LOC across all spike sources); Annotorious v3.8.2 + 10 transitive deps = 11 production packages / ~2.6 MB unpacked; zero theming overrides required (Annotorious default CSS imported as-is); touch code path verified at iPhone-13 viewport (renders `.a9s-touch-handle` + `.a9s-touch-halo`); keyboard/SR accessibility partial — host must add `tabindex`/`aria-label` for annotation traversal.
- [x] Step 1.2.4: Findings recorded in [`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md`](../../../studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md) as the **Image annotation spike (Task 1.2)** section, with the actual emitted W3C JSON-LD payload pasted inline. v1 recommendation: adopt Annotorious + `W3CImageFormat` adapter as-is; do not fork.

### Task 1.3: Spike — HTML mockup annotation library integration

- [x] Step 1.3.1: Candidates narrowed under operator-confirmed Architecture A (no cloud, no DB). **Library-of-one finding:** `@recogito/text-annotator` is the lone viable embeddable HTML-annotation library (Hypothes.is client is out under the no-cloud/no-DB constraint — hosted leaks data, self-host needs Postgres+Elasticsearch+Docker, fake-adapter still assumes a service contract; `recogito-js` is archived 2023-12). Spike narrowed to `@recogito/text-annotator`; rationale recorded in `decision-draft.md`.
- [x] Step 1.3.2: Built spike at [`spikes/graphical-review/text-annotator-html/`](../../../../spikes/graphical-review/text-annotator-html/) — vanilla JS + Vite dev server, self-contained HTML mockup fixture loaded in an iframe, `W3CTextFormat` adapter wired so text-range pin lifecycle events deliver W3C JSON-LD directly, hand-rolled 215-LOC `dom-anchor.js` layer for non-text DOM regions (icon buttons, images, decorative divs) emitting CssSelector + TextQuote + FragmentSelector pixel-offset chain, payload mirrored to the page and downloadable as `annotations.json`. Verified at desktop (1280×800) and iPhone-13 viewport via `scripts/verify.mjs`.
- [x] Step 1.3.3: Anchor resilience verified via `scripts/anchor-resilience.mjs`: pins four regions (three id-anchored + one nth-of-type-anchored), then programmatically mutates the iframe DOM (id rename, sibling insertion before, class rename, **pure-reorder of same-tag siblings** to break nth-of-type, total teardown of id+text). Resolver chain works as documented — id rename triggers TextQuote fallback landing on the deepest matching element (not a containing ancestor); sibling/class shifts leave id-based CssSelectors intact; pure-reorder breaks nth-of-type CSS and falls through to TextQuote which still finds the original `<p>`; total teardown triggers FragmentSelector pixel-offset graceful degradation whose recorded bbox center remains inside the iframe viewport. All 11 anchor-resilience assertions pass.
- [x] Step 1.3.4: Findings recorded in [`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md`](../../../studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md) as the **HTML annotation spike (Task 1.3)** section. Includes actual emitted W3C JSON-LD payloads inline (text-range + DOM-region samples), library cross-iframe document-realm gotcha + workaround, anchor-resilience results table, and v1 recommendation: **adopt `@recogito/text-annotator` + `W3CTextFormat` for text-range pins, AND ship a thin DOM-selector layer (Phase 10 scope) for non-text DOM regions**.

### Task 1.4: Spike — screenshot capture + markup mechanisms

- [x] Step 1.4.1: Built [`spikes/graphical-review/capture-getdisplaymedia/`](../../../../spikes/graphical-review/capture-getdisplaymedia/) — vanilla JS + Vite, `navigator.mediaDevices.getDisplayMedia({ video: true })` one-shot frame capture, PNG download via Blob URL. Browser-support summary, permission-prompt UX cost (per-capture OS prompt, no "remember this site" affordance), what's capturable (tab / window / screen, native resolution) recorded in `decision-draft.md`. Playwright probe at `scripts/verify.mjs` asserts UI wiring + path-taken state machine (idle / unsupported / rejected / captured); 28 assertions PASS. OS-prompt cannot be simulated headlessly — manual cross-browser checklist documented in the spike README per `.claude/rules/ui-verification.md`'s explicit-coverage-vs-gap framing.
- [x] Step 1.4.2: Built [`spikes/graphical-review/capture-dom-to-canvas/`](../../../../spikes/graphical-review/capture-dom-to-canvas/) — vanilla JS + Vite, `html-to-image` v1.11.13 (NOT html2canvas — matrix flagged it as effectively unmaintained), fidelity-stress fixture exercising `@font-face` web font (deliberately 404'd to test fallback), CSS grid + flex, `::before` / `::after` pseudo-elements (ribbon stripes + LANE label + diamond glyph), box-shadow, border-radius, inline SVG, multi-line text wrapping, system-font stack. Playwright probe decodes the captured PNG and samples pixels at known coordinates — 30+ spec-derived assertions PASS, including pixel-color matches for three ribbon stripes (#2f5d3a green, #b07a1a ochre, #4a4a8a purple at color distance 0), divider `::after` glyph rasterization (#6d3a1f at color distance 0), inline SVG polygon fill (#6d3a1f at color distance 0). Captured PNG is 1:1 with live DOM dimensions (640×394px). Production-dep footprint: 2 packages, ~500 KB unpacked.
- [x] Step 1.4.3: Built [`spikes/graphical-review/markup-tools/`](../../../../spikes/graphical-review/markup-tools/) — vanilla JSX + Vite + React 18, `@excalidraw/excalidraw` v0.18.1 mounted onto a fixture editorial dashboard SVG, programmatic API exposed via `window.__spike` for probe-driven scene manipulation, `exportToBlob` composes fixture + markup into a single PNG. Playwright probe asserts mount (Excalidraw renders `<canvas>` in the container), tool palette enumeration (rectangle / arrow / line / freedraw / text / image / eraser / selection — 4-of-5 spec'd tools map natively, blur is the gap), scene-element accounting (fixture-image add advances count by 1; box-annotation add advances by 1), export PNG dimensions / byte length / pixel-color sampling (139 sampled pixels match the box stroke color #e03131 in the exported PNG). 32 assertions PASS. **Build-vs-adopt decision: ADOPT Excalidraw** — MIT, mature, touch-first, PNG/SVG export, 4-of-5 spec tools native; blur deferred to a v1.x custom-element extension via Excalidraw's plugin API. **Konva.js documented as "considered but not spiked"** — the v2 escape hatch if Excalidraw's React dep or stylistic direction proves wrong; building markup tooling from Konva primitives is the ~1,000-1,200 LOC alternative. **tldraw remains disqualified** (source-available, not OSS). React dependency cost (259 production packages, ~50 MB unpacked; isolated React sub-bundle is the recommended Phase 12 integration shape).
- [x] Step 1.4.4: Findings recorded in [`docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md`](../../../studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md) as the **Screenshot capture + markup spike (Task 1.4)** section, with three sub-spikes documented end-to-end: browser-support tables, permission-prompt UX cost narrative, integration-cost numbers per sub-spike, per-CSS-feature rendering-fidelity table for `html-to-image`, tool-palette table + blur-limitation analysis + 3 v1.x mitigation paths for Excalidraw, build-vs-adopt decision with Konva-as-considered documented, architectural-fit-with-Architecture-A confirmation, and 6 open questions for Phase 12 implementation.

### Task 1.5: Threading + W3C alignment decision

- [x] Step 1.5.1: Documented per-library threading capability in `decision-draft.md` § "Threading + W3C alignment decision (Task 1.5)" → "Threading capability — by picked library." Finding: **none** of the picked libraries (Annotorious / `@recogito/text-annotator` / Excalidraw / `html-to-image`) ship native threading. All defer to host-supplied comment UI per the W3C Web Annotation Data Model pattern.
- [x] Step 1.5.2: Decision: **adopt W3C as the structural base; extend with the `deskwork:` namespace for project-specific fields** (Option B). Rationale recorded in `decision-draft.md` § "W3C Web Annotation Data Model adoption — three options considered" — the picked libraries already emit W3C-shaped JSON, Phase 8's planned fields fit the JSON-LD extension pattern, threaded replies land natively via `motivation: replying`.
- [x] Step 1.5.3: Migration sketch landed in `decision-draft.md` § "Migration sketch from the current `comment` annotation shape" — per-field mapping (`range` → `[TextPositionSelector, TextQuoteSelector]`, `comment` → `[TextualBody]`, `iteration` → `deskwork:revisionId`, parent-comment-id → reply annotation's `target` with `motivation: replying`), doctor-managed migration with audit-preserving cutover window.

### Task 1.6: Write decision document

- [x] Step 1.6.1: Decision brief landed at [`docs/studio-design/ACCEPTED/2026-05-26-graphical-review-prior-art/brief.md`](../../../studio-design/ACCEPTED/2026-05-26-graphical-review-prior-art/brief.md) per the project's design-archive contract. The prior `PROPOSED/2026-05-25-graphical-review-prior-art/` directory is retired — `candidates.md` (Task 1.1 matrix) moved into the ACCEPTED entry alongside `evidence.md` (the verbose backing, formerly `decision-draft.md`) and the new `brief.md` (focused summary per the design-standards convention).
- [x] Step 1.6.2: Each of the six concerns (annotation data model / image annotation UI / HTML annotation UI / threading / screenshot capture / screenshot markup) records chosen approach + rationale + dependency footprint + adopter-facing impact + v1 scope vs. deferred in `brief.md` § "Decisions — by concern."
- [x] Step 1.6.3: Reject log lives as a companion entry at [`docs/studio-design/REJECTED/2026-05-26-graphical-review-alternatives/brief.md`](../../../studio-design/REJECTED/2026-05-26-graphical-review-alternatives/brief.md) — consolidates 25+ rejected candidates across the six concerns (Hypothes.is excluded under Architecture A; tldraw licence-disqualified; html2canvas unmaintained; marker.js2 Linkware; react-image-annotate stale; LabelStudio server-required; BugHerd/Marker.io/Pastel/Frame.io/Loom/Penpot Cloud closed appliances; SVG.js / Pixi.js / Paper.js wrong-shape primitives; etc.) with specific reasons for each.
- [x] Step 1.6.4: `DESIGN-STANDARDS.md` change log appended with a 2026-05-26 entry naming the picked libraries, the Architecture A confirmation, the five spike directories, and links to the ACCEPTED + REJECTED briefs.

**Acceptance Criteria:**

- [ ] Decision document exists at `docs/studio-design/ACCEPTED/<date>-graphical-review-prior-art/brief.md`.
- [ ] Each of the 6 concerns has a chosen approach + rationale.
- [ ] Spike repos exist at `spikes/graphical-review/<library>-*` for at least image + HTML + capture; each runs `npm install && npm start` (or equivalent) to demonstrate the spike.
- [ ] DESIGN-STANDARDS.md change log has an entry for this decision; the archive directory has both ACCEPTED and REJECTED entries.
- [ ] No production code in `packages/` or `plugins/` modified — research-only phase.

## Phase 2: Pipeline template loader + preset defaults + override resolver  ·  [#303](https://github.com/audiocontrol-org/deskwork/issues/303)

**Deliverable:** JSON load + schema validation; five preset templates ship at `packages/core/src/pipelines/{editorial,visual,feature-doc,qa-plan,blog-post}.json`; override resolver picks per-project overrides under `<projectRoot>/.deskwork/pipelines/`. Unit tests.

### Task 2.1: PipelineTemplate type + JSON schema

- [x] Step 2.1.1: Author the `PipelineTemplate` type at `packages/core/src/pipelines/types.ts` matching the PRD's interface (id, name, description, linearStages, lockedStages?, offPipelineStages).
- [x] Step 2.1.2: Author a Zod schema for `PipelineTemplate` at the same location; export schema + inferred type.
- [x] Step 2.1.3: Invariant tests: linearStages must be non-empty; lockedStages must be a subset of linearStages; `Cancelled` is reserved if present in offPipelineStages.

### Task 2.2: Override resolver extension

- [x] Step 2.2.1: Locate the existing override-resolver infrastructure at `packages/core/src/overrides.ts` (THESIS Consequence 3 machinery).
- [x] Step 2.2.2: Add a `loadPipelineTemplate(id: string, projectRoot: string)` function that checks `<projectRoot>/.deskwork/pipelines/<id>.json` first, falls back to `packages/core/src/pipelines/<id>.json`.
- [x] Step 2.2.3: Add a `listAvailablePipelineTemplates(projectRoot: string)` function that returns every template found in project overrides + plugin defaults, de-duplicated by id.
- [x] Step 2.2.4: Unit tests covering override-takes-precedence + plugin-default-fallback + listing-deduplication.

### Task 2.3: Ship five preset templates

- [x] Step 2.3.1: Author `packages/core/src/pipelines/editorial.json` matching the legacy single-pipeline stage names exactly: linearStages `["Ideas","Planned","Outlining","Drafting","Final","Published"]`, lockedStages `["Final"]`, offPipelineStages `["Blocked","Cancelled"]`. Include a header comment block documenting the lifecycle rationale.
- [x] Step 2.3.2: Author `packages/core/src/pipelines/visual.json` (Sketched / Iterating / Approved / Shipped; locked: Approved; off: Blocked / Cancelled / Archived) with rationale.
- [x] Step 2.3.3: Author `packages/core/src/pipelines/feature-doc.json` (Defined / Drafting / Approved / Implemented / Complete; locked: Approved / Implemented; off: Blocked / Cancelled) with rationale.
- [x] Step 2.3.4: Author `packages/core/src/pipelines/qa-plan.json` (Drafted / Reviewed / Tested / Approved; locked: Reviewed; off: Blocked / Cancelled / Archived) with rationale.
- [x] Step 2.3.5: Author `packages/core/src/pipelines/blog-post.json` (Idea / Drafting / Edited / Published; locked: Edited; off: Blocked / Cancelled) with rationale.
- [x] Step 2.3.6: Validate each preset against the Zod schema in a unit test; assert all five load cleanly via the resolver.

**Acceptance Criteria:**

- [x] Each preset is loadable via `loadPipelineTemplate(id, anyProjectRoot)` and passes schema validation.
- [x] Project overrides at `<root>/.deskwork/pipelines/<id>.json` take precedence over the plugin default.
- [x] `listAvailablePipelineTemplates` returns the union of plugin defaults + project overrides with no duplicates.
- [x] All five preset JSON files carry header comments documenting their lifecycle rationale (operator-authored custom pipelines have a working exemplar to copy from). [Note: JSON lacks `//` comments; rationale is carried as a top-level `"$rationale"` string field, ignored by the Zod schema via `.passthrough()` and documented in `loader.ts` JSDoc.]

## Phase 3: Lane data model + config loader + entry schema delta  ·  [#304](https://github.com/audiocontrol-org/deskwork/issues/304)

**Deliverable:** `.deskwork/lanes/<id>.json` schema + loader; entry sidecar gains `lane` + `artifactKind`; doctor migration creates `default` lane and back-fills entries on first run. Unit tests.

### Task 3.1: LaneConfig type + JSON schema + loader

- [ ] Step 3.1.1: Author `LaneConfig` type at `packages/core/src/lanes/types.ts` per the PRD's interface (id, name, pipelineTemplate, contentDir).
- [ ] Step 3.1.2: Zod schema for `LaneConfig`; export schema + inferred type.
- [ ] Step 3.1.3: `loadLaneConfig(id: string, projectRoot: string)` function reading `<projectRoot>/.deskwork/lanes/<id>.json`; refuses missing files with a clear error (no fallback per the project's no-fallback rule).
- [ ] Step 3.1.4: `listLaneConfigs(projectRoot: string)` returns every `*.json` under `.deskwork/lanes/`.
- [ ] Step 3.1.5: Cross-validation: lane's `pipelineTemplate` must resolve via the Phase 2 template loader.

### Task 3.2: Entry sidecar schema delta — lane + artifactKind

> **Phase 2 follow-up (from code-quality review 2026-05-27, I-3):** `PipelineTemplateSchema` uses `.passthrough()` to admit the `$rationale` field; this widens the inferred `PipelineTemplate` type to admit arbitrary string-keyed fields. Phase 3 consumers (`LaneConfig`, sidecar readers) should `import { PipelineTemplate } from '@deskwork/core/pipelines'` AND consider exporting a narrower `StrictPipelineTemplate = Pick<PipelineTemplate, 'id' | 'name' | 'description' | 'linearStages' | 'lockedStages' | 'offPipelineStages'>` at the consumption boundary so typos like `template.lockedSatges` don't compile cleanly. Decision: Phase 3 introduces the narrow type when the first consumer lands; until then, the runtime contract holds via Zod validation.

- [ ] Step 3.2.1: Extend `EntrySidecar` Zod schema at `packages/core/src/entries/schema.ts` (or wherever the schema lives) with `lane: string` (required after migration) and `artifactKind: 'markdown' | 'html-mockup' | 'single-file-html' | 'image'` (required after migration).
- [ ] Step 3.2.2: Make `currentStage` accept any string drawn from the lane's template (linearStages ∪ offPipelineStages); the runtime validates against the resolved template, not a global enum.
- [ ] Step 3.2.3: Make both new fields optional in the schema during the migration window; doctor enforces them after migration runs.
- [ ] Step 3.2.4: Update every read path of `currentStage` to consult the entry's lane template (note: Phase 4 handles the verb read paths; this task handles the schema + non-verb readers).

### Task 3.3: artifactKind detection

- [ ] Step 3.3.1: Author `detectArtifactKind(artifactPath: string)` that returns the kind per file extension: `.md` → `markdown`; `<dir>/index.html` or single `.html` → `html-mockup` (directory case) or `single-file-html` (loose file case); `.png` / `.jpg` / `.jpeg` / `.gif` / `.webp` / `.svg` → `image`. Refuses unrecognized extensions with a clear error listing supported types.
- [ ] Step 3.3.2: Unit tests covering every supported case + the refusal path.

### Task 3.4: Default lane bootstrap on install

- [ ] Step 3.4.1: When `loadLaneConfig('default', projectRoot)` fails AND the project has a legacy `sites.<defaultSite>.contentDir`, the loader (or `deskwork install` flow, depending on where this slots) auto-creates `.deskwork/lanes/default.json` bound to `editorial` with `contentDir` from the legacy `sites` block. Emits a `migration` journal event.
- [ ] Step 3.4.2: Integration test: pre-feature project with `sites.<id>.contentDir` → first invocation under the new model → confirm `.deskwork/lanes/default.json` exists with the right contents + a migration journal entry.

### Task 3.5: Unit + integration tests

- [ ] Step 3.5.1: Unit tests for `loadLaneConfig`, `listLaneConfigs`, the Zod schemas, `detectArtifactKind`.
- [ ] Step 3.5.2: Integration test against a tmp-fixture project: install → load default lane → confirm everything wires correctly.

**Acceptance Criteria:**

- [ ] `LaneConfig` schema + loader are functional; lane configs at `.deskwork/lanes/<id>.json` load cleanly; bad configs fail with actionable errors.
- [ ] `EntrySidecar` schema supports `lane` + `artifactKind` (optional during migration; doctor enforces after).
- [ ] `detectArtifactKind` covers all four supported kinds plus the rejection path.
- [ ] Auto-bootstrap of `default` lane happens transparently on first invocation under the new model for any pre-feature project.

## Phase 4: Verb refactor + stage-list reads through lane's template + tooling fixes  ·  [#305](https://github.com/audiocontrol-org/deskwork/issues/305)

**Deliverable:** `approve`, `iterate`, `cancel`, `induct` consult the entry's lane template. Existing behavior preserved when lane = `default`. Calendar regen + doctor parser stop hardcoding stage lists; #247 and #300 close as side effects.

### Task 4.1: Refactor verb stage-list reads to template-driven

> **Phase 3 follow-ups (from code-quality review 2026-05-27):**
>
> - **I-2** — `packages/core/src/entry/induct.ts:18` `targetStage: Stage` is still editorial-narrow. Widen to `string` and gate the runtime check on the resolved lane template (`linearStages` membership). Removes the type-cast surface area that would otherwise infect Phase-4 callers.
> - **I-3** — `StrictPipelineTemplate` (declared in `packages/core/src/pipelines/types.ts:158`) and `StrictLaneConfig` (`packages/core/src/lanes/types.ts:68`) are exported but currently have zero consumers. Verb refactor MUST consume these narrow types at the bound-template / bound-lane input boundary so typos like `template.lockedSatges` fail at compile time.
> - **M-8** — `packages/core/src/entry/snapshot.ts:115` blindly lowercases the stage name for the snapshot filename. Editorial stages (`Drafting` → `drafting.md`) work; a custom-template stage like `"My Stage"` would produce `my stage.md` (filesystem-fragile). Add a stage-name → filesystem-safe-token mapping (kebab-case + non-ASCII transliteration or rejection) as part of the verb refactor.

- [x] Step 4.1.1: Grep manifest produced in commit `844447c`'s body — every hardcoded stage literal across `packages/core/src/{entry,iterate,calendar,doctor,schema,pipelines}/` enumerated with file:line + replacement disposition. Verb-side literals all replaced via template-aware helpers; intentional editorial-narrow exceptions (legacy migration parser, editorial-default doctor switch cases, `'Published'` gate on `entry/create.ts` deferred to Phase 6 CRUD) documented in code with phase-pointer JSDoc.
- [x] Step 4.1.2: All six verbs (`approve`, `iterate`, `cancel`, `block`, `induct`, `publish`) now route through `resolveEntryStrictTemplate(sidecar, projectRoot)` and consume `pipelines/helpers.ts` (`isLinearPipelineStageInTemplate`, `nextStageInTemplate`, `terminalLinearStage`, `preTerminalLinearStage`, etc.) instead of hardcoded stage literals.
- [x] Step 4.1.3: `test/entry/verbs-visual.test.ts` exercises every verb against the loaded `visual` preset (Sketched → Iterating → Approved → Shipped; locked-stage refusal on Approved; off-pipeline cul-de-sacs Blocked/Cancelled/Archived); the existing editorial coverage in `test/entry/{approve,induct,...}.test.ts` is preserved.
- [x] Step 4.1.4: `inductEntry`'s `targetStage` widened to `string` at both `packages/core/src/entry/induct.ts:23` and `packages/cli/src/commands/induct.ts:96`; runtime `linearStages.includes` check throws with the bound template's allowed stage list.
- [x] Step 4.1.5: `StrictPipelineTemplate` + `StrictLaneConfig` consumed at every verb input boundary via `resolveEntryStrictTemplate`. The Phase 2/3 "declared-but-unused" state is closed.
- [x] Step 4.1.6: `stageNameToFilesystemToken` lives at `packages/core/src/pipelines/stage-token.ts` (relocated from `lanes/` in the Phase 4 review fix to avoid an import cycle; lanes/ re-exports for back-compat). Snapshot.ts uses it. Plus a Zod-schema refinement catches stage-name collisions at template-load time (Phase 4 review I-3) — two stages whose tokenized forms collide are rejected with a descriptive error.

**Acceptance Criteria:**

- [x] All six verbs (approve / iterate / cancel / block / induct / publish) consult the entry's lane template; no hardcoded stage list remains in verb logic.
- [x] Existing single-lane projects (legacy `editorial` semantics) continue to work unchanged — verified via the editorial coverage in `test/entry/*.test.ts` + smoke run against this repo's actual sidecars.
- [x] `StrictPipelineTemplate` + `StrictLaneConfig` are consumed at every verb input boundary; the declared-but-unused state from Phase 3 is closed.
- [x] Snapshot filenames + any other filesystem-path-from-stage-name producers use the `stageNameToFilesystemToken` helper.

### Task 4.2: Calendar regen — fix #247 (writer-side)

- [x] Step 4.2.1: Pre-redesign `STAGE_ORDER` constant in `calendar/render.ts` traced and removed; the only remaining literal `linearStages` array is the `EDITORIAL_FALLBACK` constant used when no project root is supplied (test fixtures), with a JSDoc note pointing at Phase 8's enforcement step that lets the fallback be deleted.
- [x] Step 4.2.2: `calendar/render.ts:154` now accepts `projectRoot?: string` and iterates `templateStageOrder(template) = [...linearStages, ...offPipelineStages]` per lane. Multi-lane projects emit `# Lane: <name>` sections; single-lane projects keep the legacy shape unchanged.
- [x] Step 4.2.3: `test/calendar/regenerate-multilane.test.ts` covers a fixture project with entries across `Final` and `Cancelled` — no `Review` / `Paused` ghost sections; every entry renders.
- [x] Step 4.2.4: Smoke run `node scripts/smoke-phase4-issues.mjs` against this repo's `.deskwork/calendar.md` — `PASS: all 22 sidecars present in regenerated calendar` (every Final/Cancelled entry persists).

**Acceptance Criteria:**

- [x] `deskwork ingest --apply` and `deskwork approve` no longer drop Final / Cancelled entries from the calendar (verified via smoke + the regression test).
- [x] Calendar sections match the canonical eight stages (or the lane's template stages in multi-lane projects); no `Review` / `Paused` legacy sections.
- [x] Issue #247 closes via the smoke-test evidence (auto-close via commit body `closes #247`).

### Task 4.3: Doctor parser — fix #300 (reader-side counterpart)

- [x] Step 4.3.1: Located at `packages/core/src/doctor/rules/orphan-frontmatter-id.ts`. Section-based parser depended on stage-header recognition (the bug #300 names).
- [x] Step 4.3.2: New `UUID_IN_ROW_RE` regex scans every table row in `<calendar>.md` regardless of section heading; `readCalendarUuidSet` collects UUIDs into a flat set; the audit checks every frontmatter `deskwork.id` against the union of (parsed-entries-set ∪ regex-derived-set) so the over-counting is biased toward false negatives.
- [x] Step 4.3.3: `test/doctor/orphan-frontmatter-id.test.ts` carries fixture coverage of entries in `Ideas`, `Drafting`, `Final`, `Cancelled`, plus a custom-lane section — zero false-positive orphan flags.
- [x] Step 4.3.4: Smoke `node scripts/smoke-phase4-issues.mjs` against this repo — only 2 legitimate orphans remain (markdown files whose UUIDs genuinely don't appear in any calendar row); the false-positives on Final/Cancelled the bug named are gone.

**Acceptance Criteria:**

- [x] `deskwork doctor` reports zero false positives for entries in `Final` and `Cancelled` sections.
- [x] Issue #300 closes via the smoke-test evidence (auto-close via commit body `closes #300`).

### Task 4.4: Doctor migration scaffolding

- [x] Step 4.4.1: `migrateLaneMembership` (in `packages/core/src/doctor/lane-migration.ts`) calls `bootstrapDefaultLaneIfMissing` (Phase 3 helper) as its first step. Auto-creation is gated on the legacy `sites.<defaultSite>.contentDir` being present in the config; pre-feature projects bootstrap cleanly.
- [x] Step 4.4.2: Back-fill walks every sidecar; sets `lane: "default"` where absent; derives `artifactKind` from `artifactPath` via `deriveArtifactKindFromPath` (extension-based — `.md` → `markdown`, etc.).
- [x] Step 4.4.3: Each back-fill emits a `lane-migration` journal event (`migration: 'backfill-lane-and-artifact-kind'`, details listing the entry uuid + which fields were added). Phase 4 review I-2 reversed the order so sidecar writes happen FIRST, then the journal event lands as a post-condition record (matching `bootstrapDefaultLaneIfMissing`'s convention).
- [x] Step 4.4.4: `test/doctor/lane-migration.test.ts` carries the integration test — pre-feature project → run migration → confirm default lane created, every entry has `lane: default` + correct `artifactKind`. Smoke `node scripts/smoke-phase4-migration.mjs` verified against this repo: 22 examined / 22 lane back-fills / 22 artifactKind back-fills / second run idempotent.

**Acceptance Criteria:**

- [x] Migration runs in `--dry-run` first; atomic sidecar writes via the existing `writeSidecar` helper (tmp + rename).
- [x] Every legacy entry post-migration has `lane: "default"` and a correct `artifactKind`.
- [x] No data loss — all existing frontmatter, scrapbook content, marginalia, journal events preserved (the migration only ADDS fields; never deletes existing ones).

## Phase 5: Studio render — multi-lane swimlane dashboard + template stage columns + per-lane collapse + kanban↔list toggle + per-lane compose  ·  [#306](https://github.com/audiocontrol-org/deskwork/issues/306)

**Deliverable:** Markdown-only studio render that's lane-aware. Multi-lane swimlane dashboard (D3 Press Bay v11) + per-stage and per-lane collapse + per-lane kanban↔list toggle + per-lane compose chip + focus-chip + lane-visibility rail. Integration test against multi-lane fixture.

### Phase 5 · Design pick (accepted)

Direction 3 "Press Bay" (v11) is the accepted design as of 2026-05-27. Decision brief: [`docs/studio-design/ACCEPTED/2026-05-27-multi-lane-dashboard-d3-press-bay/brief.md`](../../../studio-design/ACCEPTED/2026-05-27-multi-lane-dashboard-d3-press-bay/brief.md). Canonical mockup: [`mockups/2026-05-27-multi-lane-dashboard/direction-3-press-bay.html`](../../../../mockups/2026-05-27-multi-lane-dashboard/direction-3-press-bay.html) (committed at SHA `2102f4e`). Rejected alternatives: [`D1 Lane Stack`](../../../studio-design/REJECTED/2026-05-27-multi-lane-dashboard-d1-lane-stack/brief.md), [`D2 Lane Bar`](../../../studio-design/REJECTED/2026-05-27-multi-lane-dashboard-d2-lane-bar/brief.md).

The picked design **pivots away from the PRD's original "per-lane tab strip" framing** (which corresponds to D2 Lane Bar — now REJECTED) toward stacked horizontal swimlanes on desktop + a vertical lane-stack on mobile. The PRD body in `prd.md` still describes the tab-strip approach; that wording is to be iterated through `/deskwork:iterate` so the PRD reflects the picked design. Implementation continues against the swimlane spec captured in the brief + mockup, not against the stale PRD prose.

### Task 5.1: Multi-lane swimlane dashboard + focus-chip strip + lane-visibility rail

- [x] Step 5.1.1: Refactor the studio's dashboard server-render to read `listLaneConfigs(projectRoot)` and emit one **swimlane** (`<article class="swim ...">`) per visible-and-focused lane, in operator-configured order.
- [x] Step 5.1.2: Each swimlane's body renders the lane's dashboard: columns drawn from the lane's template `linearStages` (in order) + an "Off-pipeline" section listing entries in `offPipelineStages`. No tab navigation; every focused lane is on-screen at once.
- [x] Step 5.1.3: **Focus-chip strip** (transient filter) emits one chip per visibility-on lane plus an "All" chip; clicking a chip toggles whether that lane is rendered in the current view. State stored per-operator (localStorage); URL-deep-linkable via `?focus=<csv>`.
- [x] Step 5.1.4: **Lane-visibility rail** (left rail on desktop, sheet on mobile) lists every lane with an eye-toggle (`●` visible / `○` persistently hidden) + drag handle. Visibility-off lanes don't appear in the focus-chip strip at all. (Mobile sheet is Task 5.1A's territory; desktop rail ships here. Drag handle renders as a non-interactive stub — drag wiring is Task 5.4.)
- [x] Step 5.1.5: Filtered-out lane stubs: when a lane is visibility-on but focus-off, render a compact **swim-stub** button between the focused swimlanes so the operator can see what's hidden by the current focus filter; clicking the stub re-adds the lane to focus.

### Task 5.1A: Per-lane collapse — lane-level + per-stage

- [x] Step 5.1A.1: Lane-level collapse: chevron in each `swim-head` toggles between expanded (full pipeline body) and collapsed (swim-head + compact per-stage count strip). State stored per-lane-per-operator at `deskwork:dashboard:<projectKey>:lane-collapse` (JSON array of lane ids). The `lane-head` (mobile lane-stack) variant ships with Task 5.1B's mobile pass — only the desktop `swim-head` carries the chevron in 5.1A scope.
- [x] Step 5.1A.2: Per-stage collapse: chevron in each `stage-head` (kanban) toggles one stage's content within an expanded lane. Collapsed columns shrink to a 42px vertical strip with the stage name rotated bottom-to-top via `writing-mode: vertical-rl` + `transform: rotate(180deg)`; remaining columns redistribute via the base `flex: 1 1 0` rule. State stored per-lane-per-stage-per-operator at `deskwork:dashboard:<projectKey>:stage-collapse` (JSON `Record<laneId, stageName[]>`). The list-view `lb-group-head` variant ships with Task 5.1B.
- [x] Step 5.1A.3: Universal chevron convention: `▾` (U+25BE) glyph, `transform: rotate(-90deg)` when `aria-expanded="false"`, click anywhere on the head (or chevron) to toggle, focus-visible ring via `outline: 2px solid var(--er-proof-blue)`, ≥24×24 hit target per WCAG 2.2 SC 2.5.8 AA. Chevron is a real focusable `<button>` carrying `aria-expanded` per WAI-ARIA Authoring Practices for disclosure widgets; Enter activates via the native `<button>` keyboard contract; Space is wired explicitly with `preventDefault` to suppress page scroll.

### Task 5.1B: Per-lane kanban ↔ list view toggle

- [x] Step 5.1B.1: Segmented `▦ Kanban` / `≡ List` toggle in each swim-head / lane-head flips the body between the two views. Both views show the same entries — only spatial arrangement differs. Toggle is `<div class="view-toggle" role="radiogroup">` carrying two real `<button class="vt-cell">` cells with `role="radio"` + `aria-checked`. Both `.stage-grid` (kanban) AND `.list-body` (list) are server-rendered for every swim; CSS shows exactly one based on `.swim.view-kanban` / `.swim.view-list`.
- [x] Step 5.1B.2: Viewport-aware defaults: desktop kanban, mobile list (gate: `window.matchMedia('(max-width: 720px)')` — same breakpoint as the existing layout-collapse at `dashboard-swimlane.css:826`). Operator's per-lane choice persists once set at `deskwork:dashboard:<projectKey>:view-mode` (`Record<laneId, 'kanban' | 'list'>`).
- [x] Step 5.1B.3: When a lane is lane-level-collapsed, the toggle greys out (collapse precedence — there's no body to render either view of). CSS: `.swim.collapsed .view-toggle { opacity: 0.4; pointer-events: none }`. Client also stamps `aria-disabled="true"` on each cell (via MutationObserver watching the swim's class list) and click handlers early-return when the parent swim has `.collapsed`.
- [x] Step 5.1B.4: Mobile kanban tile view is the **v0.19 single-column collapsible-stage-tile pattern** (per `DESIGN-STANDARDS.md § Collapsible stage tiles`), NOT a 2-column wrap (which would obscure the linear stage sequence) — already covered by the existing `.stage-grid { flex-direction: column }` rule inside `@media (max-width: 720px)`. List view stage groups carry the same stage-name + count + collapse-chev pattern as the kanban stage-grid heads (reusing the universal `.collapse-chev` primitive from Task 5.1A); rows are dense (`.lb-title` + `.lb-version` (slug, mirroring `.e-meta`) + `.lb-state` (empty slot per Commandment III) + `.lb-overflow` (role="button" span)). Per-stage collapse state is SHARED between kanban `.stage-col` and list-body `.lb-group` — `swimlane-collapse.ts` extended to walk both parents via the same lane:stage state.

### Task 5.1C: Per-lane Compose chip (`+ new`)

- [x] Step 5.1C.1: Each swim-head / lane-head carries a `.swim-compose` chip rendering `+ new` on desktop, icon-only `+` on mobile (aria-label carries the full action). Min hit target: 26px desktop / 30×30 mobile, ≥24×24 per WCAG 2.2 SC 2.5.8 AA.
- [x] Step 5.1C.2: Click handler clipboard-copies the partial slash-command: `/deskwork:add <SLUG> --lane <lane-id> --stage <first-linear-stage>`. The placeholder text `<SLUG>` is LITERAL — the operator replaces it in the chat editor after pasting.
- [x] Step 5.1C.3: Post-click state: chip flashes green with `✓ Copied — paste in chat` for ~2s, then reverts to default. Implementation may use `.copied` class + `setTimeout`; no form fields, no popover, no bottom sheet.
- [x] Step 5.1C.4: Per THESIS Consequence 2, the studio does not mutate sidecar state from the click — the chip only copies; the operator's pasted slash-command IS the action.

### Task 5.2: Template-aware stage columns (no hardcoded stages in render)

- [x] Step 5.2.1: Grep the studio's render code for hardcoded stage names (`Drafting`, `Final`, `Published`, etc.); refactor every site to read from the lane's template instead.
- [x] Step 5.2.2: Empty-lane state: shows the lane's pipeline shape as empty stage columns + a "Create your first entry" CTA that clipboard-copies `/deskwork:add --lane <id>`.
- [x] Step 5.2.3: Per Commandment III, no surface renders "review state" labels — only stage labels appear.

### Task 5.3: Many-lane overflow — horizontal scroll of focus-chip strip + visibility-rail jump

- [x] Step 5.3.1: When N visibility-on lanes exceeds the viewport-fitting threshold, the focus-chip strip overflows into a horizontally-scrollable row (per the D3 mockup's mobile focus-strip behavior).
- [x] Step 5.3.2: The lane-visibility rail acts as the master list of every lane (including persistently-hidden ones); clicking a hidden lane in the rail flips its visibility on AND adds it to focus. No separate "lanes ▾" dropdown is needed — the rail already serves that role.
- [x] Step 5.3.3: Mobile / phone: focus-chip strip becomes a horizontally-scrollable row inside the masthead; lane-visibility rail becomes a slide-up sheet triggered by the masthead's "Lanes ▾" button. **Trigger lives on the bay-head per `.claude/rules/affordance-placement.md`** (the rail is a bay concern, not a page-level masthead concern).

### Task 5.4: Lane-visibility panel + drag-to-reorder

- [x] Step 5.4.1: Studio surface (gear menu or sidebar) listing every lane with: visible toggle, drag handle for reorder.
- [x] Step 5.4.2: Hidden lanes don't render tabs but their entries still exist and count in dashboard stats.
- [x] Step 5.4.3: Order stored at `.deskwork/lane-order.json` (project-wide) or per-operator via localStorage per PRD § Implied scope captured.

### Task 5.5: Saveable focus presets + deep-link URL pattern

- [x] Step 5.5.1: The dashboard's base view is already multi-lane (D3 Press Bay) — every focused lane renders simultaneously. The "composed view" concept becomes a **saved focus preset**: a named subset of `{ visible-lanes, focused-lanes, per-lane-view-mode, per-lane-collapse-state }` that the operator can re-open later.
- [x] Step 5.5.2: Saved presets stored at `${STORAGE_KEY_PREFIX}${projectKey}:focus-presets` localStorage (per-operator). `.deskwork/personal/<operator-id>/focus-presets.json` server-side path deferred to Phase 6 enhancements per dispatch scope.
- [x] Step 5.5.3: Deep-link URL pattern: `/dev/editorial-studio?preset=<preset-id>` opens the saved preset. The rail head surfaces "Save current as preset…" + a per-row "Load <name>" affordance + "Delete" sibling. Per `.claude/rules/affordance-placement.md`, affordances live on the rail head (component-attached), not in a separate page-level toolbar.

### Task 5.6: Integration test against multi-lane fixture

- [x] Step 5.6.1: Build a tmp-fixture project with 3 lanes (`default` editorial / `mockups` visual / `qa` qa-plan); add 2 entries per lane in different stages.
- [x] Step 5.6.2: Boot the studio against the fixture; assert: three swimlanes render in the bay shell (one per focused lane); each swimlane's stage columns match its template; focus-chip strip shows 3 chips + "All"; lane-visibility rail lists all 3 lanes with eye-toggles; hidden-lane test (toggle one off, confirm its chip disappears AND no swimlane renders, but the entry still counts in dashboard stats).
- [x] Step 5.6.3: Per-lane collapse test: toggle lane-level collapse → swim-head + count strip only; toggle per-stage collapse → narrow vertical strip with rotated name + redistributed remaining columns.
- [x] Step 5.6.4: Per-lane view-toggle test: flip one lane to list view → vertical stage groups with row entries; flip another to kanban → columnar stages with cards. Both modes show the same entries.
- [x] Step 5.6.5: Compose-chip test: click `+ new` on a lane → clipboard contains `/deskwork:add <SLUG> --lane <id> --stage <first-linear-stage>`; chip flashes green with `✓ Copied — paste in chat` for ~2s, then reverts.
- [x] Step 5.6.6: Phone-viewport regression captured via jsdom matchMedia stub + DOM presence assertion + CSS-rule presence assertion (mobile `.lane-sheet-trigger` + `.sc-label { display: none }`); full-browser `scripts/smoke-er-viewport-regressions.mjs` run is documented as a manual local-only step in the test file per `.claude/rules/agent-discipline.md` "No test infrastructure in CI".

**Acceptance Criteria:**

- [x] Studio dashboard renders one swimlane per focused lane; columns are template-driven (no hardcoded stage names in render code). (Tasks 5.1.1–5.1.2, 5.2.1)
- [x] Lane visibility + focus + reorder all work; visibility persists project-wide-or-per-operator; focus + view-mode + collapse persist per-operator. (Tasks 5.1.3, 5.1.4, 5.4, 5.5.2)
- [x] Per-lane collapse (lane + per-stage) and kanban↔list toggle work with universal chevron convention and viewport-aware defaults. (Tasks 5.1A.1–3, 5.1B.1–4)
- [x] Per-lane `+ new` Compose chip clipboard-copies the partial `/deskwork:add` command with lane + initial stage pre-filled; no form, no popover, no bottom sheet. (Task 5.1C.1–4)
- [x] Saveable focus presets work; deep-link URL pattern opens saved preset. (Task 5.5.1–3)
- [x] Phone + desktop viewports both render correctly (dual-viewport verification protocol passes for all changed surfaces). (Task 5.6.6 + per-task verification across 5.1A/5.1B/5.3)
- [x] WCAG 2.2 SC 2.5.8 AA: every interactive affordance has a ≥24×24 hit target; WCAG 2.1 SC 2.4.7 AA: every interactive affordance has a visible focus ring; WCAG 2.1 SC 1.4.11 AA: contrast ratios verified for chevrons, chips, and stub-text. (Tasks 5.1A.3, 5.1C.1; per-task a11y followups across AUDIT log)

## Phase 6: Lane + pipeline CRUD skills + studio management surfaces  ·  [#307](https://github.com/audiocontrol-org/deskwork/issues/307)

**Deliverable:** `/deskwork:lane` and `/deskwork:pipeline` skill families; studio lane-management + pipeline-editor pages; doctor rules for orphan pipeline references.

### Task 6.1: `/deskwork:lane` skill family

- [x] Step 6.1.1: Author SKILL.md at `plugins/deskwork/skills/lane/SKILL.md` documenting subcommands: `list`, `show <id>`, `create <id> --template <preset-or-custom> --content-dir <path>`, `update <id> [--template <id>] [--name <label>] [--content-dir <path>]`, `archive <id>`, `restore <id>`, `purge <id>` (gated; refused if any entries exist), `move <slug> --to <lane-id>` (cross-lane entry move with stage remap prompt).
- [x] Step 6.1.2: CLI implementation at `packages/cli/src/commands/lane.ts` covering each subcommand; reads / writes `.deskwork/lanes/<id>.json` via Phase 3's loader.
- [x] Step 6.1.3: Stage remap on cross-lane move: prompt operator for target stage; default to target lane's first linearStage; preserve `iterationByStage` counters per PRD's open-question default. (Implemented non-interactively as `--target-stage <name>` with default = first linearStage; documented in SKILL.md.)
- [x] Step 6.1.4: Content-tree relocation on lane move: move the artifact file (and scrapbook) to the new lane's `contentDir`. (Includes EXDEV fallback + transactional rollback if `writeSidecar` fails after fs moves succeed.)
- [x] Step 6.1.5: Unit tests covering each subcommand against a tmp-fixture. (45 lane tests; subprocess-driven via `node_modules/.bin/deskwork`; covers happy path + refusal paths + path-traversal validation.)

### Task 6.2: `/deskwork:pipeline` skill family

- [x] Step 6.2.1: Author SKILL.md at `plugins/deskwork/skills/pipeline/SKILL.md` documenting subcommands: `list`, `show <id>`, `create <id> --shape <linear-stages-spec>` (from-scratch authoring), `update <id> --add-stage <name> [--position N]` / `--rename-stage <from> <to>` / `--remove-stage <name>` / `--set-locked <stages>` / `--set-off-pipeline <stages>`, `delete <id>` (refused if any lane references it; force with `--reassign-lanes-to <other-id>`). (Implemented as `--rename-stage <from> --to-stage <to>` due to single-value-per-flag argv parser; deliberate, documented divergence.)
- [x] Step 6.2.2: CLI implementation at `packages/cli/src/commands/pipeline.ts`.
- [x] Step 6.2.3: Update / delete operations honor the existing `/deskwork:customize pipeline <preset-id>` start-from-preset path (the customize skill becomes a convenience wrapper around `pipeline create`).
- [x] Step 6.2.4: Stage rename migration: a `pipeline-renames.json` migration file lives at `.deskwork/pipelines/migrations/<id>.json` (sibling subdir to keep `list` enumeration safe). Each `--rename-stage` invocation appends a `{from, to, at}` entry. Doctor consumer is Phase 6 Task 6.5 (out of scope for Task 6.2; this task only writes the file).
- [x] Step 6.2.5: Unit tests. (64 pipeline CLI tests + 14 journal-events tests; covers path-traversal, malformed-migration recovery, lockedStages rename, delete-orphan-cleanup, etc.)

### Task 6.3: Studio lane-management page

- [x] Step 6.3.1: Server-render page at `/dev/lanes/` listing every lane with create / archive / restore buttons; each row shows lane ID, name, bound template, content-dir, entry count, visibility toggle, reorder handle. (Reorder handle ships as a passive visual indicator — dashboard rail at Phase 5 Task 5.4 is the canonical reorder surface; the per-row glyph is `⋮` with `cursor: help` + a title pointing at the rail.)
- [x] Step 6.3.2: "New lane" form: prompts for id, name, template (dropdown of available templates from `listAvailablePipelineTemplates`), contentDir. (Copy-builder pattern: change events live-update a slash-command preview; copy button writes to clipboard. No server-side mutation per THESIS Consequence 2.)
- [x] Step 6.3.3: Edit form: same fields, editable; clipboard-copies the equivalent `/deskwork:lane update` invocation per THESIS Consequence 2. (Diff-emit: only diverged fields produce flags; cleared fields are silently skipped; convention documented inline. Single-open accordion across rows.)
- [x] Step 6.3.4: Archive / restore actions: clipboard-copy `/deskwork:lane archive <id>` or `/deskwork:lane restore <id>` — studio never mutates sidecar state. (Plus disabled-looking Purge button when archived + entries remain, surfacing the gate visibly with a title pointing at the next-step workflow.)

### Task 6.4: Studio pipeline-editor page

> **Phase 2 follow-up (from code-quality review 2026-05-27, I-1):** `listAvailablePipelineTemplates` returns id strings without pre-validating each template. The picker UI in this task surfaces ids that may fail to load when selected (e.g. an operator-authored `.deskwork/pipelines/<id>.json` with malformed JSON). Add an acceptance criterion that selection-time load errors surface as an inline error message naming the offending file path + the specific failure (parse / Zod / id-mismatch). Do NOT silently filter the picker; the operator should see "this id exists but won't load — fix it" rather than "this id is missing." See `packages/core/src/pipelines/loader.ts` for the thrown error shapes the UI should render.

- [x] Step 6.4.1: Server-render page at `/dev/pipelines/` listing every template with view / edit / create / delete buttons. (Plugin-preset vs project-override source chip; per-row View/Edit/Delete; disabled-Delete when lanes reference; "Customize first" CTA for plugin presets.)
- [x] Step 6.4.2: Pipeline-editor form: visualize linearStages as a horizontal flow with `lockedStages` and `offPipelineStages` distinguished by chrome; operator can add / rename / remove / reorder stages. (5 mutually-exclusive update operations in single-open accordion: add/rename/remove/set-locked/set-off-pipeline. Set-locked + set-off-pipeline panels disable Copy when no boxes ticked.)
- [x] Step 6.4.3: Each save action clipboard-copies the equivalent `/deskwork:pipeline` invocation. (All operator-supplied values quoted via shared `quoteValue`; empty required fields disable Copy with inline notice.)
- [x] Step 6.4.4: Delete refused when any lane references the template; surfaces the dependent lanes. (Disabled-looking button with title naming dependents + `--reassign-lanes-to` suggestion. Phase 2 follow-up shipped: malformed templates render as error rows with parse/Zod/id-mismatch error verbatim, NOT silently filtered. O(M) inverse-index Map build for lane-reference counts.)

### Task 6.5: Doctor rule: orphan-pipeline-reference

- [x] Step 6.5.1: Add `lane-config-missing-template` doctor rule per PRD § Doctor rules: when a lane config references a `pipelineTemplate` id that doesn't resolve, surface error with the lane file path. (Rule emits one severity=error finding per dangling lane with `{ laneId, laneFilePath, unresolvedTemplateId, availableTemplates }`; project-wide scan gated to first-site to avoid duplicates on multi-site projects.)
- [x] Step 6.5.2: Repair flow: operator picks a valid template, or removes the lane. (Prompt plan offers one `set-template-<id>` choice per resolvable preset/override + `delete-lane` last; set-template uses tmp+rename atomic write and re-validates the chosen template at apply time; delete is gated on entry bindings via `readAllSidecars` with `+N more` sample-limited refusal mirroring `purge.ts`. Both actions emit a `lane-config-repair` journal event added to `JournalEventSchema`.)
- [x] Step 6.5.3: Unit test against a fixture with a dangling pipeline reference. (4 scenarios in `test/doctor/lane-config-missing-template.test.ts`: audit-positive, set-template-repair + journal + re-audit-clean, delete-lane + journal, delete-lane-refusal-when-entry-bound naming the bound UUID; 715/715 full suite pass.)

### Task 6.6: Integration test

- [x] Step 6.6.1: Tmp-fixture project; create a custom pipeline (`custom-blog` with stages "Idea → Drafting → Reviewed → Live"); create a lane bound to it; add 2 entries; archive the lane; restore; verify entries persist + state intact. (End-to-end test at `packages/cli/test/custom-pipeline-lane-integration.test.ts`; one `it()` block drives real `deskwork` CLI subprocess through pipeline create → lane create → 2-sidecar write → archive → restore → purge-refusal → state-intact-byte-compare. `pipeline update --set-locked` / `--set-off-pipeline` invoked separately since `pipeline create` doesn't accept those flags. 1/1 pass; full @deskwork/cli suite 320 → 321 pass, 0 regressions.)

**Acceptance Criteria:**

- [x] Lane + pipeline CRUD CLI + studio surfaces work end-to-end. (CLI exercised end-to-end via Task 6.6's integration test; studio surfaces shipped in Tasks 6.3 + 6.4 with their own test suites.)
- [x] Soft-archive is the default; hard delete refused when references exist. (Task 6.6 step 6 asserts `lane purge` exits non-zero + lane file persists when entries are bound, naming both bound slugs in the error.)
- [x] Doctor surfaces orphan pipeline references with actionable repair. (Task 6.5's `lane-config-missing-template` rule + 4-scenario test suite — audit-positive, set-template repair + journal, delete-lane + journal, delete-refusal-when-bound.)
- [x] Studio writes nothing to sidecar state — every action clipboard-copies the equivalent CLI invocation per THESIS Consequence 2. (Tasks 6.3 + 6.4 — both pages render server-side then clipboard-copy the CLI verb on save/delete; no fetch/POST surfaces.)

## Phase 7: Groups — members field + CRUD + review surface + multi-lane composition  ·  [#308](https://github.com/audiocontrol-org/deskwork/issues/308)

**Deliverable:** `/deskwork:group` skill family; group review surface with member panel (multi-lane composition); doctor rules for recursion + dangling members.

### Task 7.1: Schema delta — members[] on entry

- [x] Step 7.1.1: Extend `EntrySidecar` schema with `members?: string[]` (array of member entry UUIDs). — implemented as `members: z.array(z.string().uuid()).optional()` on `EntrySchema` (`packages/core/src/schema/entry.ts`); 7 new schema tests at `packages/core/test/schema/entry.test.ts` cover regular / group / empty-members / with-artifactPath / metadata-only-group / non-UUID-rejection / non-array-rejection.
- [x] Step 7.1.2: Entries with non-empty `members[]` are groups; otherwise they're regular entries. No separate "group" entity — same schema, same code paths, plus the `members` field. — invariant documented inline in `entry.ts` next to the new `members` field; no separate Group type introduced.
- [x] Step 7.1.3: Optional `artifactPath` on group entries: when set, the group has a content body (e.g. `manifesto.md`); when absent, the group is metadata-only. — pre-existing optional `artifactPath` field carries the group's content body when present; both shapes (with + without) covered by tests; semantic noted in the inline doc-comment, with the iterate-side refusal scheduled in Task 7.7.2.

### Task 7.2: `/deskwork:group` skill family

- [x] Step 7.2.1: Author SKILL.md at `plugins/deskwork/skills/group/SKILL.md` covering: `list`, `show <slug>`, `create <slug> --lane <lane-id> [--artifact-path <path>]`, `update <slug> [--title <text>]`, `add-member <group-slug> <member-slug>`, `remove-member <group-slug> <member-slug>`, `archive <slug>`. Cancel uses the universal `/deskwork:cancel`. — shipped at `plugins/deskwork/skills/group/SKILL.md` with subcommand table, per-verb steps, defaults, error-handling catalog (one entry per refusal mode), safety rules. Universal-verb stance for cancel made explicit; the `cancel` SKILL.md was updated in parallel to document the new `--cascade` flag.
- [x] Step 7.2.2: CLI implementation at `packages/cli/src/commands/group.ts`. — thin dispatcher (356 lines) over `@deskwork/core/groups` operations. Mirrors the lane.ts shape: `KNOWN_FLAGS` / `BOOLEAN_FLAGS` / `VERB_USAGE` / `genericUsage` / `verbUsage`. Registered in `packages/cli/src/cli.ts` immediately after `lane`. Core module landed under `packages/core/src/groups/` with per-operation files (list / show / create / update / add-member / remove-member / archive); journal-event kinds (`group-create`, `group-update`, `group-add-member`, `group-remove-member`, `group-archive`, `group-restore`) added to `JournalEventSchema`.
- [x] Step 7.2.3: Member ordering: members are an ordered array; `add-member` appends by default; `--at <index>` inserts; studio drag-to-reorder updates the array. — `addGroupMember` defaults to append (insert at `members.length`); `--at <i>` inserts at `0 <= i <= members.length` with out-of-range and non-integer refusals. Insertion preserves slice-around-the-index ordering; covered by the per-verb test ("preserves ordering across multiple appends" + "inserts at --at"). Studio drag-to-reorder is Task 7.6's concern; the CLI primitive it sits on is shipped here.
- [x] Step 7.2.4: Multi-group membership supported: an entry can be a member of multiple groups simultaneously. — `addGroupMember` does NOT check prior membership in other groups; same UUID can be in `members[]` of any number of groups. Removal from one group preserves the entry in the others. Covered by `add-member.test.ts` ("supports multi-group membership (Step 7.2.4)") + `remove-member.test.ts` ("removing from one group preserves membership in another (Step 7.2.4)").
- [x] Step 7.2.5: Cross-lane membership: members may span lanes; no lane-binding constraint on `add-member`. — `addGroupMember` does NOT compare `member.lane` to `group.lane`; the verb accepts members from any lane. Covered by `add-member.test.ts` ("supports cross-lane membership (Step 7.2.5) — member in another lane") + `show.test.ts` ("enriches members in different lanes").
- [x] Step 7.2.6: Cancel propagation: cancelling a group does NOT propagate to members by default (universal-verb rule); `--cascade` is supported opt-in per PRD § Group lifecycle edge cases. — `--cascade` boolean flag added to `packages/cli/src/commands/cancel.ts`; core-side cascade walks `members[]` and recursively cancels each (skipping members already off-pipeline or at the terminal stage rather than refusing); cascade result surfaces `cascadedMembers[]` + `skippedMembers[]` so the operator audits the walk. Documented in both the group + cancel SKILL.md files. Covered by `packages/cli/test/cancel-cascade.test.ts` (7 scenarios: default-no-propagation, cascade-cancels-all, skip-already-off-pipeline, skip-terminal, skip-missing-member-with-read-failed, no-op-on-non-group, journal events per entry).

Schema delta: `archivedAt?: string` added to `EntrySchema` (`packages/core/src/schema/entry.ts`) — forward-compat field used by `group archive` (Task 7.2.1) AND settable on regular entries via the same Entry-writer path (mirrors the `LaneConfig.archivedAt` pattern shipped in Task 6.1). 5 new schema tests at `packages/core/test/schema/entry.test.ts` cover absent / present / on-non-group / rejected-malformed-datetime / rejected-non-string.

**Test count deltas (Task 7.2):**
- `@deskwork/core`: 723 → 759 (+36) — schema delta (+5), groups operations integration suite (+27), cancel cascade regenerate-count assertions (+4, Step 7.2.7).
- `@deskwork/cli`: 327 → 400 (+73) — per-verb suites (list/show/create/update/add-member/remove-member/archive+restore) + cancel-cascade.test.ts.
- `@deskwork/studio`: 933 (unchanged — no studio surface changes in this task; Tasks 7.3 / 7.4 / 7.6 own that).

**Task 7.2 review-action follow-ups (must land before Phase 7 closeout per `.claude/rules/agent-discipline.md` "Just for now is bullshit"):**

- [x] Step 7.2.7: cascade `regenerateCalendar` N+1 perf fix — split `cancelEntry` into a private walker + public wrapper so the calendar regenerate fires once at the cascade boundary instead of N+1 times. Tracked by [#360](https://github.com/audiocontrol-org/deskwork/issues/360) (AUDIT-20260529-18 deferral from Task 7.2 code-quality review of `15dd424`). — Private walker `cancelEntryWithoutCalendarRegen` extracted in `packages/core/src/entry/cancel.ts` to do the per-entry transition + journal append + sidecar write WITHOUT calling `regenerateCalendar`; the public `cancelEntry` wrapper now calls the walker (which recurses into itself for each member) and then invokes `regenerateCalendar` exactly ONCE at the cascade boundary. The cascade walk no longer re-enters the public wrapper. New TDD-first test seam in `packages/core/test/entry/cancel-cascade.test.ts` uses `vi.spyOn(regenerateModule, 'regenerateCalendar')` to assert call counts: single-entry cancel = 1, 3-member cascade = 1 (was 4 pre-fix), mixed-skip cascade = 1 (was 2 pre-fix), non-group with cascade flag = 1. Refusals, `CancelResult` shape, journal events, and `cascadedMembers` / `skippedMembers` arrays are unchanged. Core test count: 755 → 759 (+4 regenerate-count assertions).
- [x] Step 7.2.8: record `cascadeFrom` on stage-transition events emitted by cascade — extend `StageTransitionEvent` (`packages/core/src/schema/journal-events.ts`) with optional `metadata.cascadeFrom`; populate it in `cancel.ts`'s cascade walk; restore the journal-events docblock paragraph claiming the linkage. Tracked by [#359](https://github.com/audiocontrol-org/deskwork/issues/359) (AUDIT-20260529-17 follow-up from Task 7.2 code-quality review of `15dd424`). — Schema delta: `metadata` tightened to `z.object({ cascadeFrom: z.string().uuid().optional() }).passthrough().optional()` so the field is part of the typed `JournalEvent` shape (consumers can read without casting through `unknown`) while `.passthrough()` preserves forward-compat for future metadata-bag additions. Walker delta: `cancelEntryWithoutCalendarRegen` accepts a new internal `WalkerOptions` augmentation with `cascadeFrom?: string`; the public `cancelEntry` wrapper never sets it (originator is not a cascadee); the recursive walker call threads `opts.cascadeFrom ?? sidecar.uuid` so the TOP-LEVEL originator's UUID propagates through every transitive level (single-hop audit lookup, not nearest-parent). Docblock restored above `StageTransitionEvent` + above the group-* event kinds + cancel SKILL.md safety-rule bullet rewritten to surface the feature. Five new `cancel-cascade.test.ts` cases assert end-to-end (write → schema-parse → assert) the originator-omits / cascaded-members-carry-top-level-uuid / recursive-cascade-tracks-top-level / skipped-members-emit-no-event contracts. Core test count: 759 → 764 (+5). See AUDIT-20260529-27. Closes #359.
- [ ] Step 7.2.9: extend cancel-cascade test coverage — add recursive-cascade regression test (3-level group nesting) AND per-member `priorStage` assertions to close test-coverage gaps surfaced by Step 7.2.7's Track 3 code-quality review (AUDIT-20260529-23 + AUDIT-20260529-24). Tracked by [#363](https://github.com/audiocontrol-org/deskwork/issues/363). Both gaps are coverage shortfalls, not active bugs: walker behavior is correct by code reading but missing tests would not catch future regressions in (a) nested-cascade `cascadedMembers` flattening, (b) per-member `priorStage` writes. Defer-rationale: the trivial AUDIT-22 / AUDIT-26 fixes from the Step 7.2.7 review landed in the same commit; widening the test suite to seed multi-level fixtures is its own commit-sized change.

### Task 7.3: Group review surface — Members section

- [x] Step 7.3.1: When the entry's `members[]` is non-empty, the review surface renders an additional "Members" section. — New module `packages/studio/src/pages/entry-review/members-section.ts` (≤350 lines) exports `renderMembersSection` taking the resolved group + ordered members + lane-config + template index + initial view mode. `loadEntryReviewData` extended (`packages/studio/src/pages/entry-review/data.ts`) to bundle `GroupMembersBundle` (resolved member sidecars + missing-member UUIDs + used-lane configs + their pipeline templates) only when `isPopulatedGroupEntry(entry)` — pay-for-what-you-use. The renderer is inserted after `er-draft-frame` inside the `<article class="er-page">` via a thin `renderEntryMembersSection` helper at the bottom of `entry-review/index.ts`. Non-group entries skip the section entirely (returns `''`). Per the accepted Direction B brief at `docs/studio-design/ACCEPTED/2026-05-29-group-review-surface/brief.md`.
- [x] Step 7.3.2: Each member row shows: slug, title, lane (badge), current stage, clipboard-copy link to the member's review surface. — List-mode rendering (`?members=list`) emits one `.er-member-row` per member in `group.members[]` insertion order; each row carries the lane name (badge), stage glyph + name, italic-display title, and a clipboard-copy anchor at `/dev/editorial-review/entry/<memberUuid>`. The new client controller `plugins/deskwork-studio/public/src/entry-review/group-members-section.ts` wires the anchor click to `copyOrShowFallback` so the row click both navigates AND copies the URL. Missing-member sidecars (`group.members[]` references that didn't resolve) surface as `.er-member-row--missing` instead of silently dropping — mirrors the doctor `group-member-missing` rule's intent at the studio surface.
- [x] Step 7.3.3: Member entries' own rows on the lane dashboard show a "Member of: <group slug>" badge with back-link. — `loadDashboardData` (`packages/studio/src/pages/dashboard/data.ts`) now builds a `parentsByMemberUuid: ReadonlyMap<string, readonly Entry[]>` index in one pass over the sidecar set. The index threads through `renderSwimlanesShell` → `renderSwimlane` → `renderStageCol` → `renderRow` (4-parameter extension to each signature, default = empty map for back-compat). `renderRow` emits a kraft-color `.er-row-member-tab` on the row's LEFT edge with vertical mono caps "MEMBER" label + circular count badge (mirrors `.er-marginalia-tab` / `.er-outline-tab` precedent per `.claude/rules/affordance-placement.md`). Tap → row carries `.is-member-expanded`; the inline `.er-row-member-popover` lists every parent group as a clipboard-copy back-link (`Member of [<title>](<url>)`). Client controller at `plugins/deskwork-studio/public/src/dashboard/row-member-tab.ts` (registered by `editorial-studio-client.ts`). CSS added to `dashboard-row-affordances.css`. Non-member rows render NO tab — chrome doesn't pay for what doesn't apply.
- [x] Step 7.3.4: When an entry is a member of multiple groups, the badge shows all parents. — The count badge on `.er-row-member-tab` reflects `parents.length`; the popover lists every parent group (no first-N truncation in v1). Multi-parent test case in `packages/studio/test/dashboard-member-row-badge.test.ts` asserts a 2-group member surfaces count=2 + both parent links in the popover. Single-parent + non-member cases asserted alongside.
- [ ] Step 7.3.5: wire member-of pull-tab on the **mobile lane-stack** + the **desktop list-mode-body** so the pull-tab affordance reaches the same viewport classes the rest of the dashboard reaches. Tracked by [#371](https://github.com/audiocontrol-org/deskwork/issues/371) (AUDIT-20260529-34 deferral from Track 2 spec-compliance review of `b642cd6`). The desktop kanban path is wired (`renderRow` in `packages/studio/src/pages/dashboard/section.ts`); the mobile lane-stack (`lane-stack-card.ts`) + desktop list-mode within a swimlane (`swimlane-list-body.ts`) both use `.lb-row` chrome rather than `.er-row-shell`, so they need a sibling pass to render the pull-tab variant. Defer-rationale: the implementer dispatch for Tasks 7.3 + 7.4 honestly carried the desktop kanban path but did not extend to the `.lb-row` chrome; per the discipline rule's two-track recording, this is filed as both a workplan back-link AND a GH issue rather than buried in the audit-log narrative. Phase 7 closeout is BLOCKED on this step landing.

### Task 7.4: Group multi-lane review composition

- [x] Step 7.4.1: A group's review surface renders members in a coordinated multi-lane composition — one column per lane the group spans, members positioned in their lane's stage column, with the group's own stage above. — Composed mode (`?members=composed`, server-side default per Direction B) emits one `.er-members-swim` block per lane that contains at least one member; lanes the group's members don't span are NOT rendered (chrome doesn't pay for what doesn't apply). Each swim's body walks the lane's `template.linearStages` + `template.offPipelineStages` in declared order; empty stages render with `is-empty` so the pipeline shape stays visible per DESIGN-STANDARDS.md § "Favor structure over scrolling". The group's own stage stays in the existing title-strip above the members section (the existing surface chrome already carries it; this work doesn't displace it).
- [x] Step 7.4.2: Reuse Phase 5's multi-lane composed-view machinery; scope it to one group's member set. — The composed renderer (`renderComposedLane` / `renderComposedBody` in `members-section.ts`) mirrors the Phase 5 swimlane primitive shape — `.er-members-swim` (header + stage list), `.er-members-stage` (glyph + name + count + optional body), `.er-members-card` (per-member italic-display title + mono slug + ↪ open chevron). Stage glyphs reuse `dashboard/swimlane-stage-glyph.ts:stageGlyph(stage)` so the editorial / visual / qa-plan vocabularies are consistent across both surfaces. Lane accents (proof-blue for editorial, kraft for visual) reuse the press-check token vocabulary from `editorial-review.css` — no new tokens introduced. The composed body inside the section is keyed `data-body-composed`, the list body `data-body-list`; the section-head toggle pill flips both via the client controller's `applyMode`.
- [x] Step 7.4.3: Empty `members[]` falls back to a single-column rendering of the group's own content body (or empty-state if no `artifactPath`). — `renderMembersSection` returns `''` (skips the section entirely) when the group is declared-empty AND carries an `artifactPath` — the existing `er-draft-frame` body renderer is the canonical fallback, no duplication required. When the declared-empty group has NO `artifactPath`, the section renders a centered empty-state CTA per the accepted mockup — `⊟` glyph + "No members yet" head + "this group is metadata-only. populate it with `/deskwork:group add-member`." description + a "+ Add member" button that the client controller wires to clipboard-copy `/deskwork:group add-member <group-slug> <MEMBER-SLUG>`. Both branches covered by `packages/studio/test/entry-review-group-empty-members.test.ts`.

### Task 7.5: Doctor rules — recursion + dangling members

- [ ] Step 7.5.1: `group-recursive` rule: a group has a member whose `members` array is non-empty → refuse (recursive groups out of scope per v1). Repair: prompts to flatten or unbind.
- [ ] Step 7.5.2: `group-member-missing` rule: a member UUID doesn't resolve. Repair: prompts to remove the dangling reference.
- [ ] Step 7.5.3: `group-all-members-cancelled` informational rule: every member is in `Cancelled`; surface for operator review (cancel the group, remove cancelled members, or leave as-is).
- [ ] Step 7.5.4: Doctor builds a UUID → lane index once per run for efficient member-lookup-across-lanes per PRD § Risks mitigation.
- [ ] Step 7.5.5: `group-stale-empty-members` informational rule. The Task 7.2 code-quality review action (AUDIT-20260529-16) superseded the original dual-representation framing of this step: `members: []` IS the canonical declared-empty group state (`group create` writes it; `isGroupEntry` honors it), and `members: undefined` is the canonical regular-entry shape. The schema continues to permit both shapes (Task 7.1 / AUDIT-20260529-13 stands at the schema layer), but the CLI now distinguishes them as different entities. This rule instead surfaces declared-empty groups that have been empty for longer than a configurable threshold AND have NO `group-add-member` journal events — groups created in error or abandoned mid-setup. Surfaced as `informational` (operator decides whether to cancel, archive, or populate them).

### Task 7.6: Studio group-management page

- [ ] Step 7.6.1: Server-render page at `/dev/groups/` listing every group with member count + lane badges.
- [ ] Step 7.6.2: Per-group surface: members editor with drag-to-reorder, add / remove member buttons (clipboard-copy `/deskwork:group add-member` / `remove-member`).
- [ ] Step 7.6.3: Lifecycle controls: archive / cancel actions clipboard-copy the relevant verb.

### Task 7.7: Iterate semantics on groups

- [ ] Step 7.7.1: Group with `artifactPath`: iterate addresses comments on that file (same as any entry).
- [ ] Step 7.7.2: Group without `artifactPath`: iterate refuses with "group has no editable artifact — iterate operates on the content body when present; otherwise this group is metadata-only."
- [ ] Step 7.7.3: Update `/deskwork:iterate` skill prose to enumerate the group case.

### Task 7.8: Integration tests

- [ ] Step 7.8.1: Tmp-fixture: create a group spanning 2 lanes (`mockups` + `feature-doc`); add 2 members from each lane; advance group through its own stages independently of members; verify members can be in different stages from group.
- [ ] Step 7.8.2: Approve on group does not propagate; cancel with `--cascade` does propagate; recursive-group attempt refused by doctor.

**Acceptance Criteria:**

- [ ] Groups have full lifecycle: create / add-member / remove-member / archive / cancel; cross-lane membership works.
- [ ] Group approve doesn't propagate to members by default; `--cascade` opt-in works.
- [ ] Recursive groups refused via `group-recursive` doctor rule; dangling members surfaced via `group-member-missing`.
- [ ] Group review surface renders multi-lane member composition; member entries show "Member of:" badges.

### Task 7.9 (fix-finding-AUDIT-20260529-36 (cross-model: AUDIT-BARRAGE-claude-01)): AUDIT-20260529-36 — popover renders visible at rest on every member row (cascade…

Closes AUDIT-20260529-36 (cross-model: AUDIT-BARRAGE-claude-01). Surface: `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:347-354`, `packages/studio/src/pages/dashboard/section.ts:50` (`renderMemberPopover`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260529-36 (cross-model: AUDIT-BARRAGE-claude-01)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-row-member-popover-visibility.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 7.10 (fix-finding-AUDIT-20260529-37 (cross-model: AUDIT-BARRAGE-claude-02)): AUDIT-20260529-37 — composed view has silent-drop vectors beyond AUDIT-35 (stage…

Closes AUDIT-20260529-37 (cross-model: AUDIT-BARRAGE-claude-02). Surface: `packages/studio/src/pages/entry-review/members-section.ts:99-150` (`bucketMembersByLane`), `packages/studio/src/pages/entry-review/data.ts:188-210` (`loadGroupMembersBundle`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260529-37 (cross-model: AUDIT-BARRAGE-claude-02)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/entry-review-group-members-section-silent-drop.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 7.11 (fix-finding-AUDIT-20260529-38 (cross-model: AUDIT-BARRAGE-claude-03)): AUDIT-20260529-38 — member card + list-row lane-accent CSS keys on `data-templat…

Closes AUDIT-20260529-38 (cross-model: AUDIT-BARRAGE-claude-03). Surface: `plugins/deskwork-studio/public/css/entry-review-members.css:262-265,318-321`, `packages/studio/src/pages/entry-review/members-section.ts:152-167` (`renderMemberStageCard`), `:200-235` (`renderListRow`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260529-38 (cross-model: AUDIT-BARRAGE-claude-03)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/entry-review-group-members-section-lane-accent.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 7.12 (fix-finding-AUDIT-20260529-39 (cross-model: AUDIT-BARRAGE-codex-01)): AUDIT-20260529-39 — corrupt member sidecars misreported as missing (silent fallb…

Closes AUDIT-20260529-39 (cross-model: AUDIT-BARRAGE-codex-01). Surface: `packages/studio/src/pages/entry-review/data.ts:176-183` (`loadGroupMembersBundle`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260529-39 (cross-model: AUDIT-BARRAGE-codex-01)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/entry-review-group-members-section-corrupt.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 7.13 (fix-finding-AUDIT-20260529-40 (cross-model: AUDIT-BARRAGE-codex-02)): AUDIT-20260529-40 — missing-member rows lose declared insertion order (list-mode…

Closes AUDIT-20260529-40 (cross-model: AUDIT-BARRAGE-codex-02). Surface: `packages/studio/src/pages/entry-review/data.ts:176-183`, `packages/studio/src/pages/entry-review/members-section.ts:263-271` (`renderListBody`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260529-40 (cross-model: AUDIT-BARRAGE-codex-02)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/entry-review-group-members-section-insertion-order.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 7.14 (fix-finding-AUDIT-20260529-41 (cross-model: AUDIT-BARRAGE-claude-04)): AUDIT-20260529-41 — popover left margin (22px) misaligned with WCAG-widened tab …

Closes AUDIT-20260529-41 (cross-model: AUDIT-BARRAGE-claude-04). Surface: `plugins/deskwork-studio/public/css/dashboard-row-affordances.css:349` (`.er-row-member-popover { margin: 0 0 0 22px }`) vs `:250` (`.er-row-member-tab { width: 24px }`) and `:320` (`.has-member-tab .er-row-fg { padding-left: 28px }`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260529-41 (cross-model: AUDIT-BARRAGE-claude-04)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/dashboard-row-member-popover-visibility.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 7.15 (fix-finding-AUDIT-20260529-42 (cross-model: AUDIT-BARRAGE-claude-05)): AUDIT-20260529-42 — `initGroupMembersSection` wire helpers re-attach listeners o…

Closes AUDIT-20260529-42 (cross-model: AUDIT-BARRAGE-claude-05). Surface: `plugins/deskwork-studio/public/src/entry-review/group-members-section.ts:104-150` (`initGroupMembersSection`, `wireToggle`, `wireEmptyStateCta`, `wireMemberRowCopy`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260529-42 (cross-model: AUDIT-BARRAGE-claude-05)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/group-members-section-init-idempotent.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 7.16 (fix-finding-AUDIT-20260530-01 (cross-model: AUDIT-BARRAGE-claude-01-P2 + AUDIT-BARRAGE-codex-01-P2)): AUDIT-20260530-01 — path traversal in `loadPipelineTemplate` (unsanitized id flo…

Closes AUDIT-20260530-01 (cross-model: AUDIT-BARRAGE-claude-01-P2 + AUDIT-BARRAGE-codex-01-P2). Surface: `packages/core/src/pipelines/loader.ts:118-141` (`loadPipelineTemplate`), `:36-38` (`projectOverridesDir`), `packages/core/src/pipelines/types.ts:96` (`id: z.string().min(1)`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-01 (cross-model: AUDIT-BARRAGE-claude-01-P2 + AUDIT-BARRAGE-codex-01-P2)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/pipelines/path-traversal.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/core/test/pipelines/path-traversal.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-7e15a61` via the close-shipped-audit-findings step


### Task 7.17 (fix-finding-AUDIT-20260530-02 (cross-model: AUDIT-BARRAGE-claude-02-P2)): AUDIT-20260530-02 — `.passthrough()` on `PipelineTemplateSchema` silently accept…

Closes AUDIT-20260530-02 (cross-model: AUDIT-BARRAGE-claude-02-P2). Surface: `packages/core/src/pipelines/types.ts:107-110` (`.passthrough()`), `:101` (`lockedStages: ...optional()`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-02 (cross-model: AUDIT-BARRAGE-claude-02-P2)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/pipelines/strict-schema.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/core/test/pipelines/strict-schema.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-c569a61` via the close-shipped-audit-findings step


### Task 7.18 (fix-finding-AUDIT-20260530-03 (cross-model: AUDIT-BARRAGE-claude-03-P2)): AUDIT-20260530-03 — `PLUGIN_DEFAULTS_DIR` doubles as module directory AND preset…

Closes AUDIT-20260530-03 (cross-model: AUDIT-BARRAGE-claude-03-P2). Surface: `packages/core/src/pipelines/loader.ts:31`, `:148-159`, `:180-189`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-03 (cross-model: AUDIT-BARRAGE-claude-03-P2)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/pipelines/preset-ids.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/core/test/pipelines/preset-ids.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-d5303ed` via the close-shipped-audit-findings step


### Task 7.19 (fix-finding-AUDIT-20260530-04 (cross-model: AUDIT-BARRAGE-claude-04-P2)): AUDIT-20260530-04 — verify `dist/pipelines/*.json` actually ships in the `@deskw…

Closes AUDIT-20260530-04 (cross-model: AUDIT-BARRAGE-claude-04-P2). Surface: `packages/core/package.json:214-215` (`build`/`prepack` cp step) — `files` whitelist (not in diff; needs inspection).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-04 (cross-model: AUDIT-BARRAGE-claude-04-P2)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/packaging/tarball-includes-presets.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/core/test/packaging/tarball-includes-presets.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-c99e6d1` via the close-shipped-audit-findings step


### Task 7.20 (fix-finding-AUDIT-20260530-05 (cross-model: AUDIT-BARRAGE-claude-05-P2)): AUDIT-20260530-05 — `dev` watch never re-copies preset JSON after edit (build/wa…

Closes AUDIT-20260530-05 (cross-model: AUDIT-BARRAGE-claude-05-P2). Surface: `packages/core/package.json:217` (`dev` script).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-05 (cross-model: AUDIT-BARRAGE-claude-05-P2)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/scripts/watch-pipelines.mjs` (manual verification — dev-tooling, not user-facing; smoke-tested by launching watcher and touching src/pipelines/editorial.json; observed copy + dist mtime update)
- [x] Manual smoke-test exits clean (passes against the fix)
- [x] Audit-log Status flipped to `fixed-f0090c2` via the close-shipped-audit-findings step


### Task 7.21 (fix-finding-AUDIT-20260530-06 (cross-model: AUDIT-BARRAGE-claude-06-P2)): AUDIT-20260530-06 — case-insensitive filesystem produces confusing id-mismatch e…

Closes AUDIT-20260530-06 (cross-model: AUDIT-BARRAGE-claude-06-P2). Surface: `packages/core/src/pipelines/loader.ts:124-138`, `:73-78`.

- [x] Step 1: write regression test asserting AUDIT-06's confusing path is unreachable (implicitly closed by Bundle 1 7e15a61's PIPELINE_ID_REGEX guard)
- [x] Step 2: regression test passes against current code (confirms Bundle 1 reached the surface AUDIT-06 named)
- [x] Step 3: implement the fix (already in 7e15a61 via PIPELINE_ID_REGEX guard at top of loadPipelineTemplate)
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-06 (cross-model: AUDIT-BARRAGE-claude-06-P2)` in subject

**Acceptance Criteria:**

- [x] Regression test exists at `packages/core/test/pipelines/case-sensitivity.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/core/test/pipelines/case-sensitivity.test.ts` exits 0 (passes against the implicit Bundle 1 fix)
- [x] Audit-log Status flipped to `fixed-b51859b` via the close-shipped-audit-findings step


### Task 7.22 (fix-finding-AUDIT-20260530-07 (cross-model: AUDIT-BARRAGE-claude-01-P3 + AUDIT-BARRAGE-codex-01-P3)): AUDIT-20260530-07 — path traversal in `loadLaneConfig` (sister to AUDIT-01; same…

Closes AUDIT-20260530-07 (cross-model: AUDIT-BARRAGE-claude-01-P3 + AUDIT-BARRAGE-codex-01-P3). Surface: `packages/core/src/lanes/loader.ts:33-49` (`laneConfigPath`), `:90-115` (`loadLaneConfig`), `packages/core/src/schema/entry.ts:148` (`lane: z.string().min(1).optional()`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-07 (cross-model: AUDIT-BARRAGE-claude-01-P3 + AUDIT-BARRAGE-codex-01-P3)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/lanes/path-traversal.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/core/test/lanes/path-traversal.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-9edc085` via the close-shipped-audit-findings step


### Task 7.23 (fix-finding-AUDIT-20260530-08 (cross-model: AUDIT-BARRAGE-claude-02-P3)): AUDIT-20260530-08 — `StrictLaneConfig` / `StrictPipelineTemplate` aliases are no…

Closes AUDIT-20260530-08 (cross-model: AUDIT-BARRAGE-claude-02-P3). Surface: `packages/core/src/lanes/types.ts:69-78`, `packages/core/src/pipelines/types.ts:137-161`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-08 (cross-model: AUDIT-BARRAGE-claude-02-P3)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/lanes/type-identity.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/core/test/lanes/type-identity.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-16917db` via the close-shipped-audit-findings step


### Task 7.24 (fix-finding-AUDIT-20260530-09 (cross-model: AUDIT-BARRAGE-claude-03-P3 + AUDIT-BARRAGE-codex-02-P3)): AUDIT-20260530-09 — `detectArtifactKind` classifies non-existent files as valid …

Closes AUDIT-20260530-09 (cross-model: AUDIT-BARRAGE-claude-03-P3 + AUDIT-BARRAGE-codex-02-P3). Surface: `packages/core/src/lanes/detection.ts:44-77`, `packages/core/test/lanes/detection.test.ts:15-50`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-09 (cross-model: AUDIT-BARRAGE-claude-03-P3 + AUDIT-BARRAGE-codex-02-P3)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/lanes/detection.test.ts` (existence-probe describe block) (cited in Step 1)
- [x] `npx vitest run packages/core/test/lanes/detection.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-2b42356` via the close-shipped-audit-findings step


### Task 7.25 (fix-finding-AUDIT-20260530-10 (cross-model: AUDIT-BARRAGE-claude-04-P3)): AUDIT-20260530-10 — `bootstrap` doc claims "no readable config → no-config" but …

Closes AUDIT-20260530-10 (cross-model: AUDIT-BARRAGE-claude-04-P3). Surface: `packages/core/src/lanes/bootstrap.ts:74-83`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-10 (cross-model: AUDIT-BARRAGE-claude-04-P3)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/lanes/bootstrap.test.ts` (AUDIT-20260530-10 regression case) (cited in Step 1)
- [x] `npx vitest run packages/core/test/lanes/bootstrap.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-234ac5a` via the close-shipped-audit-findings step


### Task 7.26 (fix-finding-AUDIT-20260530-11 (cross-model: AUDIT-BARRAGE-claude-05-P3)): AUDIT-20260530-11 — `StageStringSchema` accepts whitespace-only stage values (`m…

Closes AUDIT-20260530-11 (cross-model: AUDIT-BARRAGE-claude-05-P3). Surface: `packages/core/src/schema/entry.ts:108`, `packages/core/test/schema/entry.test.ts:75-101`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-11 (cross-model: AUDIT-BARRAGE-claude-05-P3)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/schema/entry.test.ts` (whitespace-only + tab/newline-only AUDIT-20260530-11 cases) (cited in Step 1)
- [x] `npx vitest run packages/core/test/schema/entry.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-242a434` via the close-shipped-audit-findings step


### Task 7.27 (fix-finding-AUDIT-20260530-12 (cross-model: AUDIT-BARRAGE-claude-06-P3)): AUDIT-20260530-12 — `inferPriorStageFromJournal` silently skips non-editorial `f…

Closes AUDIT-20260530-12 (cross-model: AUDIT-BARRAGE-claude-06-P3). Surface: `packages/core/src/doctor/migrate.ts:248-260`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-12 (cross-model: AUDIT-BARRAGE-claude-06-P3)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/doctor/migrate.test.ts` (AUDIT-20260530-12 case in migrateCalendar block) (cited in Step 1)
- [x] `npx vitest run packages/core/test/doctor/migrate.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-15f7f41` via the close-shipped-audit-findings step


### Task 7.28 (fix-finding-AUDIT-20260530-13 (cross-model: AUDIT-BARRAGE-codex-03-P3)): AUDIT-20260530-13 — `bootstrapDefaultLaneIfMissing` can leave a lane file withou…

Closes AUDIT-20260530-13 (cross-model: AUDIT-BARRAGE-codex-03-P3). Surface: `packages/core/src/lanes/bootstrap.ts:102-123`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-13 (cross-model: AUDIT-BARRAGE-codex-03-P3)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/lanes/bootstrap.test.ts` (AUDIT-20260530-13 rollback case) (cited in Step 1)
- [x] `npx vitest run packages/core/test/lanes/bootstrap.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-908eb49` via the close-shipped-audit-findings step


### Task 7.29 (fix-finding-AUDIT-20260530-14 (cross-model: AUDIT-BARRAGE-claude-01-P4 + AUDIT-BARRAGE-codex-02-P4)): AUDIT-20260530-14 — multi-lane calendar renderer silently drops entries whose `c…

Closes AUDIT-20260530-14 (cross-model: AUDIT-BARRAGE-claude-01-P4 + AUDIT-BARRAGE-codex-02-P4). Surface: `packages/core/src/calendar/render.ts:86-98`, `:179-201`; test coverage at `packages/core/test/calendar/regenerate-multilane.test.ts`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-14 (cross-model: AUDIT-BARRAGE-claude-01-P4 + AUDIT-BARRAGE-codex-02-P4)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/calendar/regenerate-multilane.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-f345069` via the close-shipped-audit-findings step


### Task 7.30 (fix-finding-AUDIT-20260530-15 (cross-model: AUDIT-BARRAGE-claude-02-P4 + AUDIT-BARRAGE-codex-03-P4)): AUDIT-20260530-15 — corrupt sidecars silently skipped during lane migration (no-…

Closes AUDIT-20260530-15 (cross-model: AUDIT-BARRAGE-claude-02-P4 + AUDIT-BARRAGE-codex-03-P4). Surface: `packages/core/src/doctor/lane-migration.ts:145-158`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-15 (cross-model: AUDIT-BARRAGE-claude-02-P4 + AUDIT-BARRAGE-codex-03-P4)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/doctor/lane-migration.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-bf2fb98` via the close-shipped-audit-findings step


### Task 7.31 (fix-finding-AUDIT-20260530-16 (cross-model: AUDIT-BARRAGE-claude-03-P4)): AUDIT-20260530-16 — `iterateEntry` now refuses editorial `Final` stage (untested…

Closes AUDIT-20260530-16 (cross-model: AUDIT-BARRAGE-claude-03-P4). Surface: `packages/core/src/iterate/iterate.ts:99-106`, `packages/core/test/iterate/iterate.test.ts:141`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — `packages/core/test/iterate/iterate.test.ts` :: "refuses to iterate an editorial Final entry (locked-stage gate, DESKWORK-STATE-MACHINE.md Commandment II)". Pins iterate refusal on Final with error-message regex (`locked stage "Final".*editorial.*induct`) AND asserts the iteration counter does NOT advance.
- [x] Step 2: confirm test fails against current code (verify the bug repros) — the spec-conformant Phase-4 behavior IS the refusal; AUDIT-16 flagged the lack of test coverage, not a runtime bug. Outcome A per dispatch-instructions decision tree: confirmed against DESKWORK-STATE-MACHINE.md (verb iterate § "When it can be invoked" explicitly lists Final as a refuse-stage; Commandment I cites it as a legitimate stage-gate example). Test passes against current implementation; a future drift that removes the locked-stage check or empties editorial's `lockedStages` would fail the suite.
- [x] Step 3: implement the fix — no code change needed; the Phase-4 implementation is already spec-conformant. The "fix" is locking the spec-derived behavior in tests so a future refactor can't silently undo it. Existing iterate.ts docstring at lines 70-79 already documents the locked-stage behavior.
- [x] Step 4: confirm test passes — `npm --workspace @deskwork/core test` 829/829 green (was 828; +1 new).
- [x] Step 5: commit with `Closes AUDIT-20260530-16 (cross-model: AUDIT-BARRAGE-claude-03-P4)` in subject — `fe21786`.

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/iterate/iterate.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-fe21786` via the close-shipped-audit-findings step


### Task 7.32 (fix-finding-AUDIT-20260530-17 (cross-model: AUDIT-BARRAGE-claude-04-P4)): AUDIT-20260530-17 — `regenerateCalendar` couples per-entry transitions to validi…

Closes AUDIT-20260530-17 (cross-model: AUDIT-BARRAGE-claude-04-P4). Surface: `packages/core/src/calendar/render.ts:111-121` (`loadLaneContexts`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-17 (cross-model: AUDIT-BARRAGE-claude-04-P4)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/calendar/regenerate-lane-error-tolerant.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-165e7a7` via the close-shipped-audit-findings step


### Task 7.33 (fix-finding-AUDIT-20260530-18 (cross-model: AUDIT-BARRAGE-claude-05-P4)): AUDIT-20260530-18 — `deriveArtifactKindFromPath` writes wrong `artifactKind` for…

Closes AUDIT-20260530-18 (cross-model: AUDIT-BARRAGE-claude-05-P4). Surface: `packages/core/src/doctor/lane-migration.ts:deriveArtifactKindFromPath`; test acknowledgement at `packages/core/test/doctor/lane-migration.test.ts:131-138`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260530-18 (cross-model: AUDIT-BARRAGE-claude-05-P4)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/doctor/lane-migration.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-edb8122` via the close-shipped-audit-findings step


### Task 7.34 (fix-finding-AUDIT-20260530-19 (cross-model: AUDIT-BARRAGE-claude-06-P4)): AUDIT-20260530-19 — `EDITORIAL_FALLBACK` duplicates `editorial.json` with manual…

Closes AUDIT-20260530-19 (cross-model: AUDIT-BARRAGE-claude-06-P4). Surface: `packages/core/src/calendar/render.ts:130-145`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — `packages/core/test/calendar/render.test.ts` :: `AUDIT-20260530-19 — no-projectRoot path loads editorial preset from bundled resource` block (2 tests). The bug here was duplication-with-manual-sync rather than a runtime failure, so the regression locks in the contract that the no-projectRoot path uses `editorial.json`'s order/stages directly — future drift in editorial.json now propagates automatically and any unexpected divergence between with/without-projectRoot fails the suite.
- [x] Step 2: confirm test fails against current code (verify the bug repros) — the duplication itself was the bug. The "MUST stay in sync" comment + Phase-8 deferral with no issue link violated the "Just for now is bullshit" rule. The new tests pass against the fix; the prior `EDITORIAL_FALLBACK` constant would have also passed (it was hand-copied to match editorial.json) — that's the failure mode: silent drift potential, not active drift.
- [x] Step 3: implement the fix — `packages/core/src/calendar/render.ts`: replace `EDITORIAL_FALLBACK` constant with `loadEditorialPreset()` memoized loader reading `../pipelines/editorial.json` via `dirname(fileURLToPath(import.meta.url))` (mirrors the `PLUGIN_DEFAULTS_DIR` mechanic in `pipelines/loader.ts`). Build's `cp src/pipelines/*.json dist/pipelines/` keeps the resource reachable in both source-mode and built-mode. Loader Zod-validates via `PipelineTemplateSchema`; result cached so subsequent calls are O(1).
- [x] Step 4: confirm test passes — `npm --workspace @deskwork/core test` 828/828 green (was 826; +2 new). Full workspace 1896/1896 green.
- [x] Step 5: commit with `Closes AUDIT-20260530-19 (cross-model: AUDIT-BARRAGE-claude-06-P4)` in subject — `00fb2bc`. Also includes `keep-with-reason` disposition for new clone group `f0c41a1155b2` (the loader's Zod-error formatter is the same idiom shared with `lanes/loader.ts` and `pipelines/loader.ts` — three members of the parallel-readers symmetry already dispositioned `keep-with-reason` at the pairwise level).

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/calendar/render.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-00fb2bc` via the close-shipped-audit-findings step


### Task 7.35 (fix-finding-AUDIT-20260530-20 (cross-model: AUDIT-BARRAGE-claude-07-P4 + AUDIT-BARRAGE-codex-01-P4)): AUDIT-20260530-20 — `induct` CLI still editorial-narrow (Phase 4 "verbs are univ…

Closes AUDIT-20260530-20 (cross-model: AUDIT-BARRAGE-claude-07-P4 + AUDIT-BARRAGE-codex-01-P4). Surface: `packages/cli/src/commands/induct.ts:84-95,114`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — `packages/cli/test/induct-entry-centric.test.ts` :: four new tests covering (a) visual-lane Cancelled → Sketched via explicit `--to`, (b) editorial-lane Cancelled → Drafting regression, (c) visual-lane `--to Drafting` refusal asserting error message names visual stages (Sketched / Iterating / Approved / Shipped) and NOT the editorial six, (d) visual-lane Archived (template-extra off-pipeline stage) defaulting to priorStage without `--to`.
- [x] Step 2: confirm test fails against current code (verify the bug repros) — two of the four (visual-lane Sketched + visual-lane Archived) failed pre-fix with the editorial-narrow guard rejecting them; the visual-lane refusal and editorial-lane regression passed pre-fix because the editorial vocabulary happened to overlap.
- [x] Step 3: implement the fix — `packages/cli/src/commands/induct.ts` now reads the sidecar early, resolves the template via `resolveEntryStrictTemplate`, and validates `--to` against `template.linearStages` via `isLinearPipelineStageInTemplate`. The off-pipeline default-stage branch uses `isOffPipelineStageInTemplate` so visual-lane `Archived` (template-extra cul-de-sac) routes through priorStage. The editorial-specific `Final → Drafting` shortcut is preserved verbatim (only fires when `currentStage === 'Final'`, which no other bundled template has). The deferral comment is deleted.
- [x] Step 4: confirm test passes — full induct test file 11/11 green; workspace `npm --workspaces test` 1896/1896 green across 154 files.
- [x] Step 5: commit with `Closes AUDIT-20260530-20 (cross-model: AUDIT-BARRAGE-claude-07-P4 + AUDIT-BARRAGE-codex-01-P4)` in subject — `e85bb8e`.

**Acceptance Criteria:**

- [x] Failing test exists at `packages/cli/test/induct-entry-centric.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-e85bb8e` via the close-shipped-audit-findings step


### Task 7.36 (fix-finding-AUDIT-20260530-21 (cross-model: AUDIT-BARRAGE-claude-08-P4)): AUDIT-20260530-21 — `renderCalendar` docstring drift: promises `## Lane:` but em…

Closes AUDIT-20260530-21 (cross-model: AUDIT-BARRAGE-claude-08-P4). Surface: `packages/core/src/calendar/render.ts:157-159` (docstring) vs `:194` and `:199` (emit).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — `packages/core/test/calendar/regenerate-multilane.test.ts` :: two anchored-regex tests pin h1 lane headers (`^# Lane: Default$` and `^# Lane: \(unassigned\)$`) AND assert NOT h2 (`!^## Lane: Default$`). Pre-existing substring matches like `expect(md).toContain('# Lane: Default')` accept both h1 and h2, so the suite was not actually falsifying heading level.
- [x] Step 2: confirm test fails against current code (verify the bug repros) — both regression tests pass against the h1-emitting code; the failing-test approach here pins the contract that the docstring was contradicting. Option A (keep h1 emission; fix docstring) chosen per dispatch instructions default. The heading-level question itself was the bug (drift); the test now refuses to let it drift again.
- [x] Step 3: implement the fix — `packages/core/src/calendar/render.ts:234-260` docstring updated to say `# Lane: <name>` with explicit heading-level note explaining the deliberate sibling-of-masthead positioning + doctor heading-agnostic invariant cross-reference.
- [x] Step 4: confirm test passes — `npm --workspace @deskwork/core test` 826/826 green; new file `regenerate-multilane.test.ts` 8/8 green.
- [x] Step 5: commit with `Closes AUDIT-20260530-21 (cross-model: AUDIT-BARRAGE-claude-08-P4)` in subject — `66f2854`.

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/calendar/regenerate-multilane.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-66f2854` via the close-shipped-audit-findings step


### Task 7.37 (fix-finding-AUDIT-20260530-22 (cross-model: AUDIT-BARRAGE-claude-01-P7small)): AUDIT-20260530-22 — partial cascade failure leaves `calendar.md` persistently st…

Closes AUDIT-20260530-22 (cross-model: AUDIT-BARRAGE-claude-01-P7small). Surface: `packages/core/src/entry/cancel.ts` (public `cancelEntry` wrapper).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — `packages/core/test/entry/cancel-cascade.test.ts` :: `partial-cascade throw still regenerates calendar in the finally (AUDIT-20260530-22)` (uses AUDIT-23's narrowed catch as the throw seam).
- [x] Step 2: confirm test fails against current code (verify the bug repros) — verified via `git stash` of the cancel.ts wrapper change; test fails with `expected regenerateCalendar to be called 1 times, but got 0 times`.
- [x] Step 3: implement the fix — `try { return await cancelEntryWithoutCalendarRegen(...); } finally { await regenerateCalendar(...); }`.
- [x] Step 4: confirm test passes — `npm --workspace @deskwork/core test -- --run test/entry/cancel-cascade.test.ts` 14/14 green; full @deskwork/core suite 824/824.
- [x] Step 5: commit with `Closes AUDIT-20260530-22 (cross-model: AUDIT-BARRAGE-claude-01-P7small)` in subject — `8296171`.

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/entry/cancel-cascade.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step — `fixed-8296171`.


### Task 7.38 (fix-finding-AUDIT-20260530-23 (cross-model: AUDIT-BARRAGE-codex-01-P7small)): AUDIT-20260530-23 — cascade catch swallows write/journal failures as "skipped me…

Closes AUDIT-20260530-23 (cross-model: AUDIT-BARRAGE-codex-01-P7small). Surface: `packages/core/src/entry/cancel.ts:209-279`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — `packages/core/test/entry/cancel-cascade.test.ts` `describe('cancelEntry — cascade catch narrowing (AUDIT-20260530-23)')` (3 propagation cases + 1 contract-preservation case).
- [x] Step 2: confirm test fails against current code (verify the bug repros) — verified via `git stash` of the cancel.ts change; the three propagation tests fail with `promise resolved instead of rejecting`; missing-member contract test still passes (broad catch covered that case too).
- [x] Step 3: implement the fix — `existsSync(sidecarPath(projectRoot, memberUuid))` precondition replaces the broad try/catch.
- [x] Step 4: confirm test passes — `npm --workspace @deskwork/core test -- --run test/entry/cancel-cascade.test.ts` 13/13 green; full @deskwork/core suite 823/823.
- [x] Step 5: commit with `Closes AUDIT-20260530-23 (cross-model: AUDIT-BARRAGE-codex-01-P7small)` in subject — `5264770`.

**Acceptance Criteria:**

- [x] Failing test exists at `packages/core/test/entry/cancel-cascade.test.ts` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step — `fixed-5264770`.


### Task 7.39 (fix-finding-AUDIT-20260530-24 (cross-model: AUDIT-BARRAGE-claude-02-P7small)): AUDIT-20260530-24 — indentation regression on `CancelOptions.cascade` (3-space i…

Closes AUDIT-20260530-24 (cross-model: AUDIT-BARRAGE-claude-02-P7small). Surface: `packages/core/src/entry/cancel.ts` — `interface CancelOptions { ... }`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface) — N/A: whitespace-only diff; no behavioral assertion possible. Existing 9-test cancel-cascade suite continues to pass.
- [x] Step 2: confirm test fails against current code (verify the bug repros) — N/A per Step 1.
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes — `npm --workspace @deskwork/core test -- --run test/entry/cancel-cascade.test.ts` reports 9/9.
- [x] Step 5: commit with `Closes AUDIT-20260530-24 (cross-model: AUDIT-BARRAGE-claude-02-P7small)` in subject — `f283f9b`.

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1) — N/A; whitespace-only diff.
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix) — full cancel-cascade suite green.
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step — `fixed-f283f9b`.



### Task 7.75 (acknowledged-spec-confirmed: AUDIT-20260530-60): Pipeline template archive/restore/purge/rename are not specced

Closes AUDIT-20260530-60 (cross-model: AUDIT-BARRAGE-codex-P6-1) via acknowledged-spec-confirmed disposition (no code change). Surface: `packages/cli/src/commands/pipeline.ts:5-15`, `packages/cli/src/commands/pipeline.ts:80-136`, `packages/core/src/pipelines/operations/index.ts:11-28`, `plugins/deskwork/skills/pipeline/SKILL.md:13-25`.

- [x] Step 1: ~~write failing test~~ — N/A; not a fix-task.
- [x] Step 2: ~~confirm test fails~~ — N/A.
- [x] Step 3: ~~implement the fix~~ — N/A; the audit's premise misstated the workplan. Task 6.2's actual spec (workplan.md:304-310 Step 6.2.1) defines `/deskwork:pipeline` as `list / show / create / update (with --add-stage / --rename-stage / --remove-stage / --set-locked / --set-off-pipeline) / delete (with --reassign-lanes-to)`. The verbs the audit names as missing (`archive`, `restore`, `purge`, template-id `rename`) belong to `/deskwork:lane`, not `/deskwork:pipeline`. The asymmetry is intentional: pipelines are reference data (install/edit/delete pattern); lanes are workspace state (archive/restore/purge lifecycle for entries-bearing surfaces).
- [x] Step 4: ~~confirm test passes~~ — N/A.
- [x] Step 5: ~~commit with Closes AUDIT~~ — superseded by the audit-log Status flip to `acknowledged-spec-confirmed` (see audit-log entry for the full disposition rationale).

**Acceptance Criteria:**

- [x] Failing test exists — N/A per the disposition above.
- [x] Test passes — N/A.
- [x] Audit-log Status flipped to `acknowledged-spec-confirmed` — landed; see audit-log AUDIT-20260530-60 disposition paragraph for the full reasoning (operator decision dated 2026-05-30; if symmetric pipeline lifecycle verbs are wanted in a future phase, file as a new feature task rather than reopening this finding).





## Phase 8: Annotation model extension — threads + screenshot attachments + spatial anchors + disposition-trace affordance  ·  [#309](https://github.com/audiocontrol-org/deskwork/issues/309)

**Deliverable:** Threaded replies (`replyTo`), screenshot attachments (`attachments[]`), spatial anchors (`spatialAnchor`), and per-comment disposition-trace affordance (inline diff expansion on "addressed" badge + required free-text disposition reason at iterate time). Cross-cutting; markdown review benefits too. Sidecar storage at `<entryDir>/scrapbook/screenshots/`. Closes #299.

### Task 8.0: Enforce `lane` presence at the doctor layer (Phase 4 follow-up)

> **Phase 4 follow-up (from code-quality review 2026-05-27, M-5):** `packages/core/src/lanes/resolve.ts:60-64` carries a migration-window default that resolves `entry.lane === undefined` to the editorial template. Once doctor's `lane-migration` step (Phase 4 Task 4.4) has run across the canary repos (this project + audiocontrol + writingcontrol) AND reports zero un-migrated entries, the resolver should tighten to throw on missing-lane. `packages/core/src/calendar/render.ts:130-141` similarly carries an `EDITORIAL_FALLBACK` constant that becomes unreachable once doctor enforces lane presence; remove it in the same change.

- [ ] Step 8.0.1: Add a doctor rule `entry-lane-missing` that surfaces every sidecar without a `lane` field as a finding. Repair flow: run `migrateLaneMembership` to back-fill `default`, OR have the operator explicitly assign a lane via `/deskwork:lane move <slug> --to <lane-id>` once Phase 6's lane CRUD ships.
- [ ] Step 8.0.2: Once the canary projects report zero `entry-lane-missing` findings, tighten `resolveEntryTemplate` in `packages/core/src/lanes/resolve.ts:60-64` to throw on missing-lane. Delete the `EDITORIAL_FALLBACK` constant in `packages/core/src/calendar/render.ts` and pipe the renderer through `loadPipelineTemplate` always.
- [ ] Step 8.0.3: Update the `@deprecated` tags in `packages/core/src/schema/entry.ts` to remove the "kept for back-compat" caveat; the legacy editorial helpers can be deleted in a future cleanup once their last callers (legacy calendar migration parser) are themselves removed.

### Task 8.1: Annotation schema extension

- [ ] Step 8.1.1: Extend `CommentAnnotation` (`packages/core/src/annotations/types.ts` or equivalent) with: `replyTo?: string` (root comment id for reply comments); `attachments?: string[]` (relative paths under `<entryDir>/scrapbook/screenshots/`); `spatialAnchor?: { kind: 'pixel' | 'dom-selector' | 'svg-element'; selector?: string; x?: number; y?: number }`.
- [ ] Step 8.1.2: Extend the disposition annotation type with a **required** `reason: string` field (per PRD acceptance criterion: "required free-text disposition reason captured at iterate time").
- [ ] Step 8.1.3: Adopt or align with W3C Web Annotation Data Model per Phase 1's decision; if adopting, the migration sketch from current `comment` is documented in the Phase 1 doc + applied here.
- [ ] Step 8.1.4: Schema validation: existing single-comment annotations (no new fields) keep working unchanged — additive schema delta.

### Task 8.2: Threaded replies rendering

- [ ] Step 8.2.1: Studio's marginalia sidebar renders threads expandable; collapsed thread shows root comment + reply count badge.
- [ ] Step 8.2.2: Per Phase 9's design pick, threads are either inline-on-pin or sidebar-grouped (operator picks the direction in Phase 9; this task translates).
- [ ] Step 8.2.3: Comment-thread permalinks per PRD § Implied scope captured: `/dev/editorial-review/entry/<uuid>#comment/<comment-id>` scrolls to the thread.

### Task 8.3: Screenshot capture mechanism

- [ ] Step 8.3.1: Per Phase 1's decision, implement screenshot capture (native `getDisplayMedia()` / DOM-to-canvas / adopted-library built-in). Land the capture invocation in the studio's review surface.
- [ ] Step 8.3.2: Selection-rectangle UI for region capture; full-frame capture is the alternative path.
- [ ] Step 8.3.3: Captured bytes saved to `<entryDir>/scrapbook/screenshots/<comment-id>-<timestamp>.png` (entry-anchored) OR `<projectRoot>/.deskwork/screenshots-orphan/<timestamp>-<hash>.png` (capture-then-attach flow).

### Task 8.4: Screenshot attachment workflow

- [ ] Step 8.4.1: After capture, operator can attach the screenshot to an existing comment (sets `attachments[]` on the comment) or create a new comment with the screenshot pre-attached.
- [ ] Step 8.4.2: Cross-entry attachment: operator attaches screenshot from entry A to a comment on entry B; the screenshot lives in entry B's scrapbook with a `sourceEntry` field on the attachment metadata.
- [ ] Step 8.4.3: External-image attachment: operator pastes from clipboard or drag-drops any image file from filesystem onto a comment.

### Task 8.5: Iterate skill — required disposition reason

- [ ] Step 8.5.1: Update `/deskwork:iterate` skill prose (`plugins/deskwork/skills/iterate/SKILL.md`) to require a free-text `reason` for every `addressed` disposition. The dispositions file format becomes: `{ "<commentId>": { "disposition": "addressed", "reason": "addressed by adding § X at line N" } }`.
- [ ] Step 8.5.2: The `deskwork iterate` CLI refuses dispositions files missing the `reason` field for `addressed` entries (clear error with example).
- [ ] Step 8.5.3: Existing `addressed` dispositions in the journal without `reason` (legacy) render with "no reason recorded" in the studio — backward compatible read; only new writes are gated.

### Task 8.6: Per-comment inline diff expansion ("addressed" badge → diff)

- [ ] Step 8.6.1: Studio: clicking a comment's "addressed" badge expands inline to show two things — the disposition's `reason` text AND the slice of the prior-vs-new-revision diff that intersects the comment's anchor region.
- [ ] Step 8.6.2: Diff-slicing logic: compute the diff between revision N-1 and revision N (server-side, via diff library); for each comment with `disposition: addressed` on revision N, intersect the diff hunks with the comment's `range` (markdown) or `spatialAnchor` region (graphical) and return that subset.
- [ ] Step 8.6.3: Render the slice as a side-by-side mini-diff inside the expanded comment, with the disposition reason as a header line.
- [ ] Step 8.6.4: When the diff slice is empty (the comment was on a region that didn't change in the new revision), surface "addressed without local diff — see the disposition reason" so the operator knows to read the reason text.

### Task 8.7: Cross-cutting markdown review benefit

- [ ] Step 8.7.1: Verify the existing markdown review surface picks up threads + attachments + inline diff expansion for free (the schema change is additive; the render layer reads the same data).
- [ ] Step 8.7.2: Smoke test: leave a threaded comment + screenshot attachment on an existing markdown entry; confirm the existing review surface renders both correctly.

### Task 8.8: Tests

- [ ] Step 8.8.1: Unit tests for schema validation, diff-slicing logic, screenshot path resolution, dispositions reason-required gate.
- [ ] Step 8.8.2: Integration test against a markdown entry + a (placeholder) graphical entry: thread, attach screenshot, iterate, verify diff expansion works.

**Acceptance Criteria:**

- [ ] Annotation schema supports `replyTo`, `attachments`, `spatialAnchor`, and required-`reason` disposition fields; additive change preserves existing single-comment annotations.
- [ ] Threads render expandable in the marginalia sidebar with reply-count badges.
- [ ] Screenshots can be captured, attached to comments / replies, and persist at the documented sidecar path.
- [ ] Per-comment "addressed" badge expands inline to show the disposition reason + the diff slice intersecting the comment's anchor.
- [ ] Markdown review benefits from threads + attachments + inline diff for free (no additional render-layer work).
- [ ] Issue #299 closes.

## Phase 9: `/frontend-design` pass for the graphical review surface + screenshot markup co-design  ·  [#310](https://github.com/audiocontrol-org/deskwork/issues/310)

**Deliverable:** 2–3 operator-pickable mockup directions covering chrome-free render area, pin placement, thread expansion, screenshot capture affordance, screenshot attachment workflow, **and screenshot markup UI** (arrow / box / freehand / text-label / blur tools). Operator picks; gates Phase 10–12. **No implementation in this phase.**

### Task 9.1: Invoke `/frontend-design` for the chrome-free render area

- [ ] Step 9.1.1: Run `/frontend-design` (the `frontend-design:frontend-design` skill) with the design brief: chrome-free render area for HTML mockup (iframe) and image (`<img>`); collapsible verb bar; comment-thread sidebar that can collapse to a peek-line; full-bleed scale.
- [ ] Step 9.1.2: Honor `DESIGN-STANDARDS.md` § Rubber-stamp / mobile-row conventions per the project rule.
- [ ] Step 9.1.3: Honor the `affordance-placement.md` rule: per-component affordances (stow controls on the component, pull-tab on the edge it vanished into) — not toolbar-attached.

### Task 9.2: Pin placement + thread expansion direction

- [ ] Step 9.2.1: Mockup 2-3 directions for pin placement (where on the artifact the pin marker sits relative to the anchor region; how active vs inactive pins differ visually).
- [ ] Step 9.2.2: Mockup 2-3 directions for thread expansion: inline-on-pin (clicking a pin pops the thread next to the pin) vs sidebar-grouped (all threads listed in the sidebar; pin click highlights + scrolls sidebar) vs hybrid.
- [ ] Step 9.2.3: Mockup thread navigation when many threads exist (jump-to-next-unaddressed, filter by category, etc.).

### Task 9.3: Screenshot capture + attachment affordance

- [ ] Step 9.3.1: Mockup the capture entry-point: where the "capture screenshot" button lives (toolbar / per-comment / per-thread); region-select vs full-frame toggle.
- [ ] Step 9.3.2: Mockup the attachment workflow: capture → attach to existing comment (which comment is highlighted) vs capture → create new comment (which prompts for anchor).
- [ ] Step 9.3.3: Mockup the attachment surface on the comment itself: thumbnail strip below the comment text, click to expand full-size, marked vs original toggle.

### Task 9.4: Screenshot markup UI co-design

- [ ] Step 9.4.1: Mockup the markup editor: canvas-overlay invoked from the capture flow; tool palette (arrow / box / freehand / text-label / blur-region); undo / redo; save / cancel.
- [ ] Step 9.4.2: Tool affordance placement per the project's `affordance-placement.md` rule — on the editor surface, not in a global toolbar.
- [ ] Step 9.4.3: Mobile / touch consideration: markup tools work on touch screens (no hover-only interactions).

### Task 9.5: Disposition-trace affordance (per Phase 8) — visual design

- [ ] Step 9.5.1: Mockup the "addressed" badge → inline diff expansion (how the diff renders next to the comment; how the disposition `reason` is surfaced; how an empty-diff-slice case looks).
- [ ] Step 9.5.2: Mockup the badge → diff transition (animation, micro-interaction) so the operator's mental model of "click badge, see what changed" is reinforced.

### Task 9.6: Operator picks direction

- [ ] Step 9.6.1: Mockups land in `mockups/<date>-graphical-review/` (typically HTML/CSS standalone files); update `mockups/index.html` with a card per direction.
- [ ] Step 9.6.2: Operator reviews + picks; the pick + rationale lands at `docs/studio-design/ACCEPTED/<date>-graphical-review-design/brief.md` per the design-archive contract.
- [ ] Step 9.6.3: Rejected directions land at `docs/studio-design/REJECTED/<date>-graphical-review-<variant>/brief.md` with rationale per the design-archive contract; single-pass rejections still get an entry.
- [ ] Step 9.6.4: Update `DESIGN-STANDARDS.md` change log.

**Acceptance Criteria:**

- [ ] At least 2 mockup directions exist as self-contained HTML+CSS files in `mockups/<date>-graphical-review/`.
- [ ] Operator-picked direction is recorded in `docs/studio-design/ACCEPTED/<date>-graphical-review-design/brief.md`.
- [ ] Rejected directions have corresponding `REJECTED/` entries with rationale.
- [ ] No production code in `packages/` or `plugins/` modified — design-only phase.
- [ ] Phase 10 and Phase 11 implementation can translate the picked mockup directly (no further design ambiguity).

## Phase 10: Graphical entries — HTML review surface  ·  [#311](https://github.com/audiocontrol-org/deskwork/issues/311)

**Deliverable:** Iframe-based chrome-free rendering for `html-mockup` + `single-file-html`; DOM-anchored + coordinate-pinned spatial comments; thread expansion; screenshot attachment workflow; iterate against HTML mockups.

### Task 10.1: Chrome-free iframe rendering

- [ ] Step 10.1.1: Studio review-surface routing: when `artifactKind in ['html-mockup', 'single-file-html']`, render the artifact in an iframe instead of the markdown editor.
- [ ] Step 10.1.2: Iframe loads `index.html` directly (for `html-mockup` directory case) or the loose `<slug>.html` (for `single-file-html` case) with no wrapper styling — the mockup's own CSS governs the rendered surface entirely.
- [ ] Step 10.1.3: Asset routing: sibling `*.css`, `*.js`, `*.png`, etc. under the mockup's directory are served via the studio's existing asset path (or a new graphical-asset path if needed); broken-image / 404 cases surface inline.
- [ ] Step 10.1.4: Verb bar (Iterate / Approve / Cancel) + comment-thread sidebar dock to the edges via the picked-mockup overlay design.

### Task 10.2: DOM-anchored spatial comments

- [ ] Step 10.2.1: Per Phase 1's library decision, integrate the chosen DOM-annotation library against the iframe; communicate marginalia events from inside the iframe to the parent studio surface.
- [ ] Step 10.2.2: Comment anchor records: DOM selector (CSS path), pixel offset (x/y within the element), text-snippet fallback (the visible text near the pin, for resolver recovery).
- [ ] Step 10.2.3: Resolver: try selector first; if missing or text mismatch, try text-snippet match; if still missing, fall back to pixel coordinates with a "stale anchor" warning surfaced inline.
- [ ] Step 10.2.4: Operator can click anywhere on the iframe surface to drop a new pin; the resolver captures all three anchor components.

### Task 10.3: Thread expansion (per Phase 9 mockup pick)

- [ ] Step 10.3.1: Wire the picked thread-expansion direction (inline-on-pin / sidebar-grouped / hybrid) from Phase 9 into the live surface.
- [ ] Step 10.3.2: Thread navigation: jump-to-next-unaddressed; filter by category; permalink scroll per PRD § Implied scope.

### Task 10.4: Screenshot attachment workflow

- [ ] Step 10.4.1: Wire Phase 8's screenshot capture against the iframe (capture renders the iframe's contents, not the studio chrome).
- [ ] Step 10.4.2: Capture flow per Phase 9 mockup: region-select (selection rectangle drawn on the iframe overlay) or full-frame.
- [ ] Step 10.4.3: Attach captured screenshot to a comment / reply per Phase 8's workflow.

### Task 10.5: Iterate against HTML mockups

- [ ] Step 10.5.1: Update `/deskwork:iterate` skill prose to enumerate the HTML-mockup case: agent reads each marginalia anchor (selector + offset + text-snippet + comment text + thread context), resolves against live DOM, identifies the most plausible element, edits HTML / CSS / JS to address the comment.
- [ ] Step 10.5.2: For sibling asset edits (replacing a `*.png`, modifying a `*.css`), the agent operates on the file via Edit / Write tools — same operator-recognizable shape as markdown iterate.
- [ ] Step 10.5.3: Disposition recording follows Phase 8's required-`reason` rule; the diff-slice expansion on "addressed" badge shows the HTML / CSS diff intersecting the comment's selector region.

### Task 10.6: Marginalia anchor resilience

- [ ] Step 10.6.1: Doctor rule: scan an entry's annotations; resolve each anchor against the current artifact; surface unresolved anchors as warnings (per PRD § Risks mitigation).
- [ ] Step 10.6.2: Studio: stale-anchor pins render with distinct chrome ("⚠ this anchor's selector no longer resolves; falling back to text-snippet").

### Task 10.7: Integration test

- [ ] Step 10.7.1: Build a fixture `html-mockup` entry under a tmp-fixture project with a small HTML / CSS / JS bundle.
- [ ] Step 10.7.2: Studio renders the iframe correctly; operator can pin a comment; iterate addresses it; revision history captures pre/post HTML state; doctor surfaces no unresolved anchors.
- [ ] Step 10.7.3: Stale-anchor regression: hand-edit the mockup to rename a class; assert resolver falls back through selector → text-snippet → pixel coordinates correctly; doctor warns on the unresolved selector.

**Acceptance Criteria:**

- [ ] `html-mockup` and `single-file-html` entries render in a chrome-free iframe; mockup's own CSS governs the surface.
- [ ] Comments anchor to DOM elements with resilient fallback (selector → text-snippet → pixel).
- [ ] Iterate edits HTML/CSS/JS to address marginalia; revision history captures pre/post state.
- [ ] Stale anchors surface inline with distinct chrome + doctor warning.

## Phase 11: Graphical entries — image review surface + iteration paths  ·  [#312](https://github.com/audiocontrol-org/deskwork/issues/312)

**Deliverable:** Chrome-free image review surface; region-anchored marginalia (raster) + element-anchored marginalia (SVG); iterate skill prose enumerates the four image-iteration paths.

### Task 11.1: Chrome-free image rendering

- [ ] Step 11.1.1: Studio review-surface routing: when `artifactKind === 'image'`, render the artifact in an `<img>` wrapper (raster) or inline SVG (vector).
- [ ] Step 11.1.2: Marginalia overlay sits on top of the image; pin click captures coordinates in image-natural-space (not viewport-space) so anchors survive resize.
- [ ] Step 11.1.3: Zoom + pan controls for large images (per the picked Phase 9 mockup direction).

### Task 11.2: Region-anchored marginalia (raster)

- [ ] Step 11.2.1: Per Phase 1's library decision (likely Annotorious-class), wire the chosen image-annotation library into the studio review surface.
- [ ] Step 11.2.2: Anchor records: pixel coordinates (x, y in image-natural-space); optional region (rectangle / polygon / freehand) per the library's capability.
- [ ] Step 11.2.3: Resizing the image in-browser doesn't move pins (anchors stay in image-natural-space).

### Task 11.3: Element-anchored marginalia (SVG)

- [ ] Step 11.3.1: For SVG entries, anchors use element-selector (SVG's element id, class, or generated path); falls back to pixel coordinates if the selector doesn't resolve.
- [ ] Step 11.3.2: Resolver: try selector first; fall back to pixel coordinates with a "stale anchor" warning (same shape as Phase 10's HTML resolver).

### Task 11.4: Iterate skill — four image-iteration paths

- [ ] Step 11.4.1: Update `/deskwork:iterate` skill prose to enumerate the four paths:
  - **Agent-driven regeneration** for generation-pipeline images (Midjourney, Stable Diffusion, DALL·E) — agent reads marginalia, regenerates with updated prompt, replaces file.
  - **Agent-driven programmatic transformation** for crops / annotations / composites — agent runs ImageMagick / sharp / custom script per the comment.
  - **SVG edits** — agent edits SVG source directly via element-selector anchors.
  - **Operator-supplied replacement** — operator drops a new image file at `artifactPath`; iterate appends as the next revision.
- [ ] Step 11.4.2: Skill prose asks the agent to pick the path matching the comments + available tooling; if none apply, report back to operator with comments unaddressed.
- [ ] Step 11.4.3: Revision history captures the prior image bytes in the journal per `DESKWORK-STATE-MACHINE.md` § Versions and revisions; the new file replaces the old at `artifactPath`.

### Task 11.5: Per-project iteration handlers

- [ ] Step 11.5.1: Support `<projectRoot>/.deskwork/iterate-handlers/<artifactKind>.ts` per PRD § Graphical entries.
- [ ] Step 11.5.2: Handler signature: `(marginalia, entryContext) => Promise<{ newContent: Buffer; metadata?: Record<string, unknown> }>`.
- [ ] Step 11.5.3: Discovery uses the same override-resolver pattern as templates and doctor rules (Phase 2's machinery).
- [ ] Step 11.5.4: Iterate skill prose explains when the agent uses the handler vs. its own judgment.

### Task 11.6: Doctor rule — image-locked-stage drift

- [ ] Step 11.6.1: `image-locked-stage` rule: an image entry is in a `lockedStages` stage but has been iterated since reaching it → surface the iterate journal entries for manual review per PRD § Doctor rules.
- [ ] Step 11.6.2: Repair flow: operator reviews the drift and decides (induct backward + re-iterate properly, or fold the drift into the revision history).

### Task 11.7: Manual dogfood

- [ ] Step 11.7.1: Ingest one of the project's existing `docs/studio-design/` mockups as a `visual`-lane entry; iterate it; approve it.
- [ ] Step 11.7.2: Ingest a screenshot (e.g., one from the dogfood TF log); iterate via operator-supplied replacement.
- [ ] Step 11.7.3: Capture a screenshot of a pathological state from one of the spike fixtures; attach to a comment; verify both versions persist.
- [ ] Step 11.7.4: Log any friction surfaces as new TF entries.

### Task 11.8: Integration test

- [ ] Step 11.8.1: Tmp-fixture with one PNG entry + one SVG entry; pin comments on each; iterate via operator-supplied replacement (PNG) and SVG edit (SVG); verify revision history captures prior bytes; doctor surfaces no anchor warnings.

**Acceptance Criteria:**

- [ ] Image entries (PNG / JPG / SVG) render chrome-free with marginalia overlay.
- [ ] Anchors stay correct across resize (raster) and survive element-selector edits with fallback (SVG).
- [ ] Iterate skill enumerates 4 image-iteration paths; agent picks the right one per the comments + tooling.
- [ ] Per-project iteration handlers load via override-resolver.
- [ ] Doctor surfaces image-locked-stage drift.
- [ ] Manual dogfood successfully exercises ingest + iterate + approve on at least one existing `docs/studio-design/` mockup.

## Phase 12: Screenshot markup / drawing UI  ·  [#313](https://github.com/audiocontrol-org/deskwork/issues/313)

**Deliverable:** Operator-side annotation of captured screenshots before attaching: arrow, box, freehand, text-label, blur-region tools. Markup persists as `<comment-id>-<timestamp>-marked.png` alongside the raw capture; comment annotation's `attachments[]` references the marked file with `originalAttachment` linking back to the raw.

### Task 12.1: Canvas-overlay markup editor

- [ ] Step 12.1.1: Implement the markup editor per Phase 9's picked design: HTML5 canvas overlay invoked from the capture flow.
- [ ] Step 12.1.2: Loads the raw captured screenshot as the canvas base layer; markup draws on a second canvas layer.
- [ ] Step 12.1.3: Touch + mouse + stylus input all supported (per Phase 9 mobile-aware requirement).

### Task 12.2: Markup tool palette

- [ ] Step 12.2.1: **Arrow** tool: click-drag to draw an arrow from start to end; configurable head size + color.
- [ ] Step 12.2.2: **Box** tool: click-drag to draw a rectangle; outline or filled with operator-selected opacity.
- [ ] Step 12.2.3: **Freehand** tool: drag to draw a freehand line; smoothing algorithm reduces jitter.
- [ ] Step 12.2.4: **Text-label** tool: click to place text input; operator types label; configurable font size + color.
- [ ] Step 12.2.5: **Blur-region** tool: click-drag rectangle; the region is gaussian-blurred (canvas filter) — for sensitive content.
- [ ] Step 12.2.6: Undo / redo stack covering all tools.

### Task 12.3: Save + persistence

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
