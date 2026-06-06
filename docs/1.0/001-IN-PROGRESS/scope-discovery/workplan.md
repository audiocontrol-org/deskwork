---
slug: scope-discovery
targetVersion: "1.0"
date: 2026-05-25
designSpec: docs/superpowers/specs/2026-05-24-scope-discovery-design.md
canary: graphical-entries (sequencing-coupled: v1 ships BEFORE graphical-entries enters implementation)
---

# Workplan: scope-discovery

**Goal:** Canonize the audiocontrol-piloted Scope Discovery Protocol into the `dw-lifecycle` plugin: CODE in plugin / CONFIG in project per THESIS Consequence 3; auto-invoke in existing skills with opt-out; opt-in scaffolds for hook + agent-prompt mirrors. v1 acceptance signal = paper-test coverage > ~80% against the `graphical-entries` canary.

Design spec: `docs/superpowers/specs/2026-05-24-scope-discovery-design.md`. Audiocontrol pilot source-of-truth: `~/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/`.

<!-- workplan-archive-ledger
archived-phases: 1-5, 7-10, 13-19, 21-23, 25-26
archived-fix-tasks: 5.1-5.123, 7.1-7.2, 8.1-8.5, 15.1-15.6, 25.1-25.11, 26.1-26.6
archive-file: workplan-archive.md
next-fix-task-id: 26.7
note: archived 2026-06-03 via scripts/archive-phases-onetime.ts; Phase 26 productizes this as a CLI verb
-->

## Phase 6: CLI subcommands

**Deliverable:** All ~20 new CLI verbs land in `plugins/dw-lifecycle/src/subcommands/` + registered in `cli.ts`.

### Task 1: Inventory + widen + summary commands

- [x] `scope-inventory <slug>` — landed in Phase 3; fans 4 universal agents in parallel + Phase 4 config-activated agents.
- [x] `scope-widen "<complaint>"` — landed (closes [#292](https://github.com/audiocontrol-org/deskwork/issues/292)). Library API + thin subcommand shim + 15 vitest scenarios. Required positional complaint + `--slug`; optional `--manifest`, `--prd-path`, `--apply`, `--evidence-trail`, `--module-root`, `--quiet`. Default behavior is dry-run (prints delta to stderr, exits 0 without modifying the manifest). Complaint injection strategy: appended as `## Operator complaint (scope-widen)` section to a per-run augmented PRD; the PRD-themed pattern hunter tokenizes the complaint alongside the PRD body so operator words become themed keywords without bespoke parsing. Evidence trail under `docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/widen-runs/<stamp>-<runId>/`. Delta computation is purely additive; theme keys strip the `<term> (N occurrences)` suffix so occurrence-count shifts don't false-positive as additions. `--apply` merges the delta into the manifest; `generated_by` (e.g., `curated`) is preserved. Smarter complaint parsing (noun phrases, identifiers, additional grep patterns) is deferred to Phase 11's orchestrator-agent work; v1 is plumbing.
- [x] `scope-summary [--surface <glob>]` — ported verbatim from audiocontrol pilot (`tools/scope-discovery/summary.ts`). 4-field summary line (`total | pending-touching | pending-intra | dispositioned-touching`), `--json` + `--verbose` + `--clones` override; default clones path generalized to `.dw-lifecycle/scope-discovery/clones.yaml`. 15 vitest scenarios cover the pure compute math, programmatic + CLI surfaces, gutted-stub teeth (all-zero counter must fail mixed-fixture assertion).


### Task 24 (fix-finding-AUDIT-20260603-88) (non-bug): AUDIT-20260603-88 — Duplicate `Task 22` heading — the disposition task created for AUDIT-86 reintroduces the exact duplicate-task-number bug it is meant to dispose

> Superseded by audit-log Status `acknowledged-orphaned-scaffolding-removed-AUDIT-86-already-acknowledged-2026-06-03` — no TDD walk required.

**Acknowledged in 9b9e100f.** Disposition: the orphaned `### Task 22 (AUDIT-86)` block (and its sibling `### Task 23 (AUDIT-87)` block AUDIT-90 names) were redundant scaffolding — AUDIT-86's audit-log Status was already `acknowledged-phase-26-task-4-addresses-ledger-case-...` and AUDIT-87's was `fixed-37666598`. The auto-positioner promoted unchecked fix-task blocks for findings whose disposition had already landed elsewhere. Removed both blocks from `workplan.md`; the audit-log entries remain the canonical record.

Closes AUDIT-20260603-88. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` — new `### Task 22 (fix-finding-AUDIT-20260603-86)` (hunk `@@ -39,6 +39,40 @@`).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1: disposition prose written — orphaned scaffolding for already-addressed findings; remove the duplicate workplan task blocks; audit-log remains the canonical record per the audit-log preservation rule.
- [x] Step 2: action applied — deleted `### Task 22 (fix-finding-AUDIT-20260603-86)` and `### Task 23 (fix-finding-AUDIT-20260603-87)` blocks from `workplan.md` in 9b9e100f.
- [x] Step 3: committed with `Acknowledges AUDIT-20260603-88` in subject (per `apply-audit-flips` semantics: this is an acknowledgement of a non-bug doc-only disposition, NOT a code-change-fix verifiable by test; `Acknowledges` is correct).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch (orphaned blocks removed in 9b9e100f).
- [x] Audit-log Status flipped open → `acknowledged-orphaned-scaffolding-removed-AUDIT-86-already-acknowledged-2026-06-03` in 9b9e100f.



### Task 28 (fix-finding-AUDIT-20260603-92): AUDIT-20260603-92 — `archivePhases` gains a new uncaught-throw path on malformed/cross-phase ledger ranges — the exact class AUDIT-91 just hardened against, but in the opposite direction

Closes AUDIT-20260603-92. Surface: `plugins/dw-lifecycle/src/scope-discovery/workplan-archive/ledger.ts` — `expandRange` (private helper, ~line 250-280) called from `mergeFixTaskIds` (~line 290-300); reached from `archive-phases.ts:276-292`. Severity: medium.

- [x] Step 1: bug-repro tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/ledger.test.ts:272-292` (`AUDIT-92: tolerates cross-phase existing ranges without throwing — preserves endpoints` + `AUDIT-92: tolerates mismatched-dotted-length ranges (5.1-5 fallback)` + `AUDIT-92: tolerates non-numeric endpoints (5.x-5.y fallback)`).
- [x] Step 2: confirmed tests fail pre-fix — `expandRange` and `incrementId` both threw on the cross-phase / mismatched-dotted-length / non-numeric inputs.
- [x] Step 3: implemented in `ledger.ts` — `expandRange` falls back to a singleton-pair representation (`[start, end]`) on cross-phase, mismatched-dotted-length, or non-numeric endpoints instead of throwing; `mergeFixTaskIds`'s contiguous-check wraps `incrementId` in `try/catch` so a non-numeric ID becomes its own singleton (no contiguity). The malformed-but-parseable ledger is preserved verbatim through the merge instead of crashing `archivePhases`. Per-class fallback is documented in the function-doc comment with a back-reference to AUDIT-92.
- [x] Step 4: confirmed tests pass — 33/33 in `ledger.test.ts`; 22/22 in `archive-phases.test.ts`; full plugin suite green.
- [x] Step 5: commit with `Closes AUDIT-20260603-92` in subject.

**Acceptance Criteria:**

- [x] Failing tests exist at `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/ledger.test.ts:272-292` (three blocks: cross-phase + mismatched-dotted + non-numeric).
- [x] `npx vitest run src/__tests__/scope-discovery/workplan-archive/ledger.test.ts` from `plugins/dw-lifecycle/` exits 0 (33/33 pass post-fix).
- [x] Audit-log Status flipped to `fixed-<sha>` via the apply-audit-flips step.


### Task 29 (fix-finding-AUDIT-20260603-93) (non-bug): AUDIT-20260603-93 — Task 25 (AUDIT-89) disposition state is internally inconsistent: audit-log `Status: open` + unchecked acceptance with a `<test-file-path>` placeholder, despite the fix being committed (55e15b84) and tests claimed green

> Superseded by audit-log Status `acknowledged-template-residue-cleaned-2026-06-03` — no TDD walk required.

Closes AUDIT-20260603-93 (claude-02 + codex-02; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` (AUDIT-20260603-89 entry, `Status: open`) vs. `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Task 25 acceptance block.

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1: disposition prose — Task 25's acceptance block had two residual template lines from the auto-positioner's promote-findings template (`\`npx vitest run <test-file-path>\` exits 0` + `Audit-log Status flipped to \`fixed-<sha>\``) that survived the substantive-completion edit because the edit's old_string only matched the first two acceptance lines of the original template. The `Status: open` snapshot the audit-barrage saw reflects the timing window between the AUDIT-89 fix commit (55e15b84) and the apply-audit-flips bookkeeping pass — the flip happens after the commit, not at commit time, per the workplan-aware-gate's batching rule.
- [x] Step 2: action — replaced the two residual placeholder lines in Task 25's acceptance block with concrete substantive content (vitest invocation path + suite size + SHA-grounded apply-audit-flips reference). The Status timing question is a structural workflow property (audit-log flip runs post-commit) not a code defect.
- [x] Step 3: commit with `Acknowledges AUDIT-20260603-93 (claude-02 + codex-02; cross-model)` in subject — non-bug disposition (doc cleanup); `Acknowledges` (not `Closes`) is correct because the workplan template residue is a documentation defect, not a test-verifiable code change.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch (Task 25 acceptance block cleaned in this same commit's docs edit).
- [x] Audit-log Status flipped open → `acknowledged-template-residue-cleaned-2026-06-03` in this commit.


### Task 30 (fix-finding-AUDIT-20260603-94): AUDIT-20260603-94 — `scanFixTaskIds` indiscriminately captures every `### Task N` heading into `archived-fix-tasks` — the field's "fix-task" semantics are not enforced

Closes AUDIT-20260603-94 (claude-03 + codex-01; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/workplan-archive/archive-phases.ts:130-145` (`scanFixTaskIds`, regex `/^### Task (\d+)(?::|\s|\(|$)/`). Severity: high.

- [x] Step 0: working-code invariant — the over-capture is intentional. `promote-findings`'s auto-positioner picks `max(scan-of-workplan-tasks-under-phase) + 1`, which inherently shares an integer namespace across impl-tasks AND fix-finding tasks. If `scanFixTaskIds` excluded impl tasks, the archive would record only fix-findings; the next promote into that phase could emit a colliding integer matching an archived impl-task. The captured `archived-fix-tasks` field is a misnomer in the strict sense, but the collision-avoidance semantic is correct. The bug AUDIT-94 names is the **undocumented contract**, not the behavior itself.
- [x] Step 1: bug-repro test at `archive-phases.test.ts:78-104` (`scanFixTaskIds — shared-namespace contract (AUDIT-94)` → `captures both impl tasks and fix-finding tasks (shared per-phase integer namespace)`). Asserts that mixed-section input (`### Task 1: Setup`, `### Task 2: Implement`, `### Task 19 (fix-finding-...)`, `### Task 22 (fix-finding-...)`) yields all four dotted IDs, pinning the shared-namespace contract.
- [x] Step 1b: regression-lock at `archive-phases.test.ts:105-115` (`ignores non-Task headings (### Task headings only)`) — pins the regex's selectivity invariant (non-`### Task N` headings like `### Subsection`, `### Task A` non-integer, `#### Task 99` wrong depth, `- [x] not a heading` all excluded). The fix must not broaden the regex beyond `### Task <integer>`.
- [x] Step 2: confirmed tests fail pre-fix on the documentation side — the contract was undocumented; tests asserting both behaviors had no anchor. Post-fix the source comment names the contract explicitly and the tests pin it.
- [x] Step 3: implemented — added shared-namespace contract paragraph to the `scanFixTaskIds` JSDoc explaining why impl-tasks are intentionally captured (collision-avoidance with promote-findings's max+1 floor); added the two test blocks above.
- [x] Step 4: all tests green — 22/22 in `archive-phases.test.ts`; full plugin suite green.
- [x] Step 5: commit with `Closes AUDIT-20260603-94 (claude-03 + codex-01; cross-model)` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/archive-phases.test.ts:78-104` (shared-namespace bug-repro).
- [x] Regression-lock test exists at `archive-phases.test.ts:105-115`; test block count for this finding is 2 — ≥2 per Option D discipline.
- [x] `npx vitest run src/__tests__/scope-discovery/workplan-archive/archive-phases.test.ts` from `plugins/dw-lifecycle/` exits 0 (22/22 pass against the contract).
- [x] Audit-log Status flipped to `fixed-<sha>` via the apply-audit-flips step.

### Task 25 (fix-finding-AUDIT-20260603-89): AUDIT-20260603-89 — `archive-phases` never scans moved fix-task headings — `archived-fix-tasks` and `next-fix-task-id` are never computed, so the AUDIT-86 read-side fix has no write-side that maintains the field it depends on

Closes AUDIT-20260603-89 (claude-02 + claude-04 + claude-05 + codex-01 + codex-02; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/workplan-archive/archive-phases.ts:258-272` (`newLedger` construction in `archivePhases`). Severity: high.

- [x] Step 0: working-code invariant — when archiving a content-free phase (e.g. Phase 4 has no `### Task N` fix-task headings), `archivedFixTasks` and `nextFixTaskId` from the previous ledger pass through unchanged. The existing test `preserves an existing ledger when merging new ranges` (archive-phases.test.ts:214-244) pins this. The fix must NOT break the content-free passthrough.
- [x] Step 1: bug-repro test at `archive-phases.test.ts:246-289` (`AUDIT-89: archives fix-task headings into archivedFixTasks + advances nextFixTaskId`) — archive Phase 5 with `### Task 11`, `### Task 12`, `### Task 13` headings; assert ledger reflects `archived-fix-tasks: 5.1-5.13` and `next-fix-task-id: 5.14`. Cross-phase bug-repro at `archive-phases.test.ts:325-365` (`AUDIT-89: cross-phase merge — archiving Phase 11 with fix-tasks Task 1-3 yields disjoint range + max-based next-id`) covers the dotted-cross-phase case.
- [x] Step 1b: regression-lock test at `archive-phases.test.ts:291-323` (`AUDIT-89 regression-lock: archiving a fix-task-free phase preserves prior ledger fix-task fields unchanged`) — explicit Option D pinning of the Step 0 invariant.
- [x] Step 2: confirmed tests fail pre-fix (bug-repro reports `archived-fix-tasks: 5.1-5.10` instead of `5.1-5.13`); regression-lock passes pre-fix.
- [x] Step 3: implemented in `archive-phases.ts` (new `scanFixTaskIds` helper extracts `### Task N` headings as dotted `<phaseNum>.<taskInt>` IDs; `archivePhases` computes `newArchivedFixTasks` via `mergeFixTaskIds` + advances `nextFixTaskId` via `findMaxId` + `incrementId`; conservative "never shrink" floor against the prior `nextFixTaskId`). New helpers added to `ledger.ts` (`incrementId`, `findMaxId`, `mergeFixTaskIds`) with their own unit-test coverage in `ledger.test.ts` (13 new tests).
- [x] Step 4: all tests green — `archive-phases.test.ts` 20/20, `ledger.test.ts` 30/30, full plugin suite 2659/2659.
- [x] Step 5: commit with `Closes AUDIT-20260603-89 (claude-02 + claude-04 + claude-05 + codex-01 + codex-02; cross-model)` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/archive-phases.test.ts:246-289` (bug-repro) and `archive-phases.test.ts:325-365` (cross-phase bug-repro).
- [x] Regression-lock test exists at `archive-phases.test.ts:291-323`; test block count for this finding is 3 (2 bug-repro + 1 regression-lock) — ≥2 per Option D discipline.
- [x] `npx vitest run src/__tests__/scope-discovery/workplan-archive/archive-phases.test.ts` from `plugins/dw-lifecycle/` reports 20/20 passing against the fix; the full plugin suite reports 2659/2659.
- [x] Audit-log Status flipped to `fixed-55e15b84` via the apply-audit-flips step.


### Task 26 (fix-finding-AUDIT-20260603-90) (non-bug): AUDIT-20260603-90 — Task 23 (AUDIT-87) carries the impossible TDD-bug template f…

> Superseded by audit-log Status `acknowledged-orphaned-scaffolding-removed-AUDIT-87-already-fixed-37666598-2026-06-03` — no TDD walk required.

**Acknowledged in 9b9e100f.** Disposition: AUDIT-87's audit-log Status is already `fixed-37666598`; the auto-positioner-emitted `### Task 23 (AUDIT-87)` block carried the impossible-bug-template scaffolding AUDIT-90 names. Removed the orphaned block; the audit-log entry remains the canonical record of how AUDIT-87 was addressed. Paired with the AUDIT-86 orphan removal in the same commit per AUDIT-88's disposition.

Closes AUDIT-20260603-90. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` — `### Task 23 (fix-finding-AUDIT-20260603-87)` (hunk `@@ -39,6 +39,40 @@`).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1: disposition prose written — AUDIT-87 already addressed in `fixed-37666598`; orphaned task-23 scaffolding with impossible bug-template removed; audit-log preservation rule keeps the historical record intact.
- [x] Step 2: action applied — deleted `### Task 23 (fix-finding-AUDIT-20260603-87)` block from `workplan.md` in 9b9e100f (paired with the AUDIT-86 orphan removal per AUDIT-88).
- [x] Step 3: committed with `Acknowledges AUDIT-20260603-90` in subject; `Acknowledges` (not `Closes`) is correct because the disposition is a doc-only orphan-cleanup, not a code-change-fix verifiable by test.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch (orphaned block removed in 9b9e100f).
- [x] Audit-log Status flipped open → `acknowledged-orphaned-scaffolding-removed-AUDIT-87-already-fixed-37666598-2026-06-03` in 9b9e100f.


### Task 27 (fix-finding-AUDIT-20260603-91): AUDIT-20260603-91 — Doctor rule crashes on malformed ledgers instead of reporting or skipping

Closes AUDIT-20260603-91. Surface: `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/workplan-archive-ledger-coherence.ts:109-110`. Severity: medium.

- [x] Step 1: bug-repro test + cross-feature regression-lock added at `plugins/dw-lifecycle/src/__tests__/scope-discovery/doctor-rules/workplan-archive-ledger-coherence.test.ts:124-198` (`AUDIT-91: malformed ledger emits a warning finding, does NOT throw` + `AUDIT-91 regression-lock: a malformed ledger in one feature does not block scanning of other features`).
- [x] Step 2: confirmed test fails pre-fix — `parseLedgerContent` throws `ledger missing required field: archive-file`, the doctor rule has no `try/catch` at line 116 (formerly 109-110), the throw propagates and abandons the scan.
- [x] Step 3: implemented in `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/workplan-archive-ledger-coherence.ts` — wrapped `parseLedgerFromWorkplan(workplanBody)` in `try/catch`; on catch, pushes a `severity: warning` finding naming the slug + parse error message + actionable fix instruction, then `continue`s to the next slug. Imported `errorMessage` from `util/typeguards.js` for the error-string narrowing.
- [x] Step 4: test passes — 9/9 in the rule's test file. The regression-lock confirms a malformed ledger in `test-feature` doesn't block surfacing of the `other-feature`'s extra-in-archive finding.
- [x] Step 5: commit with `Closes AUDIT-20260603-91` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/doctor-rules/workplan-archive-ledger-coherence.test.ts:124-198`.
- [x] `npx vitest run src/__tests__/scope-discovery/doctor-rules/workplan-archive-ledger-coherence.test.ts` from `plugins/dw-lifecycle/` exits 0 (9/9 pass).
- [x] Audit-log Status flipped to `fixed-<sha>` via the apply-audit-flips step.

### Task 2: Check-* gate commands

- [x] `check-clones [--gate-mode]` — subcommand originally registered as `detect-clones` in Phase 1; renamed to `check-clones` in the Phase 6 verb-naming pass with `detect-clones` preserved as a forever-back-compat alias (both names dispatch to the same handler, so adopter pre-commit hooks installed by pre-rename versions of `install-scope-discovery-hooks` continue to work without modification). Library API renamed `detectClones` → `checkClones`; new hook chains emit `check-clones --gate-mode`; deprecation-hint surfaced in CLI `--help` listing. `--gate-mode` flag landed as a no-op-for-symmetry (check-clones already exits 1 on NEW groups by default — the hook contract). New skill at `plugins/dw-lifecycle/skills/check-clones/SKILL.md` is the canonical procedure; `plugins/dw-lifecycle/skills/detect-clones/SKILL.md` is a thin redirector pointing at the canonical skill. 3 new vitest scenarios — 2 gate-mode-flag-no-op + 1 alias-symmetry (both names produce identical exit codes on the same fixture).
- [x] `check-anti-patterns [--gate-mode]` — subcommand registered in Phase 2; `--gate-mode` flag landed. Default is informational (findings → exit 0, full report on stdout); `--gate-mode` flips to hook-friendly exit 1 on findings. **Schema follow-up:** add optional `negative_match_classes:` array per pilot TF-015 (AUDIT-20260525-08); validator auto-generates negative-test scenarios. Pairs with #285 pattern-type dispatcher work.
- [x] `check-deprecations [--write]` — subcommand SHELL → full scanner port landed. Walks the scan root for file-level `@deprecated` JSDoc tags + `// DEPRECATED:` line comments within the first 20 lines; resolves importers via `@/` alias + basename-relative path forms; classifies as blocked (importers > 0) or safe-to-delete (importers === 0). `--write` emits markdown to `.dw-lifecycle/scope-discovery/deprecation-queue.md`. `--json` emits structured output (`{ total, deprecation_count, filesVisited, blocked: [...], safeToDelete: [...] }`). `--module-root` accepts the `@/` alias root (default `src`; pilot's audiocontrol layout uses `modules/<editor>/src`). Closes [#287](https://github.com/audiocontrol-org/deskwork/issues/287). 23 vitest scenarios including gutted-stub teeth. Regime-holdout-detector now uses the real scanner; `meta.deprecation_count` populates from real importers.
- [x] `check-adopters [--gate-mode]` — subcommand registered in Phase 2; `--gate-mode` flag landed (default informational; flag flips to hook-friendly exit 1 on holdouts).
- [x] `check-editor-symmetry [--write]` — landed in Phase 4 with `--write` flag honored; default writes to `docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/editor-symmetry.md`.
- [x] `check-refactor-preconditions [--gate-mode]` — subcommand registered in Phase 2; `--gate-mode` flag landed (default informational; flag flips to hook-friendly exit 1 on precondition failures).



### Task 31 (fix-finding-AUDIT-20260604-01) (non-bug): AUDIT-20260604-01 — Rename invalidated three operator-curated `keep-with-reason`…

> Superseded by audit-log Status `acknowledged-3-keep-with-reasons-restored-409-tracks-structural-fix-2026-06-04` — no TDD walk required.

Closes AUDIT-20260604-01 (claude-01 + codex-03; cross-model). Surface: `.dw-lifecycle/scope-discovery/clones.yaml` — groups `9e85fb0f675e`→`a381419e0f31`, `d47a3cfe0d81`→`0654d2d673cf`, `afeee722255a`→`fa93705e149f`.

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1: disposition prose — the three lost `keep-with-reason` dispositions were re-applied verbatim from the pre-rename twins via three `batch-dispose --disposition keep-with-reason --reason ...` invocations against the new ids; the structural fix to `refresh-clones-baseline`'s carry-forward (key on member content-fingerprint instead of clone-id so a pure file rename preserves the disposition) is filed at [#409](https://github.com/audiocontrol-org/deskwork/issues/409) with a regression-test acceptance criterion.
- [x] Step 2: action applied — `batch-dispose` invocations re-applied each disposition; clones.yaml is verified clean by the gate (`check-clones --gate-mode` exit 0); #409 filed with reproducible context (the AUDIT-20260604-01 audit-log entry, the pre/post rename id pairs, the workaround commit references).
- [x] Step 3: commit with `Acknowledges AUDIT-20260604-01 (claude-01 + codex-03; cross-model)` in subject — non-bug disposition (registry curation + follow-up issue); `Acknowledges` is correct because the immediate close is a config-side mitigation, with the structural carry-forward fix tracked separately under #409. Per AUDIT-20260602-01: `apply-audit-flips` parses `Closes` trailers as `fixed-<sha>` proposals — using `Closes` on a non-fix disposition would arm a false flip if the audit-log entry is later re-opened.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch (3 batch-dispose invocations applied; #409 filed at https://github.com/audiocontrol-org/deskwork/issues/409).
- [x] Audit-log Status flipped open → `acknowledged-3-keep-with-reasons-restored-409-tracks-structural-fix-2026-06-04` in this commit.


### Task 32 (fix-finding-AUDIT-20260604-02): AUDIT-20260604-02 — `ledger.ts` comment claims the doctor rule surfaces tolerate…

**Complete (2026-06-04).** Closes AUDIT-20260604-02 (claude-02 + claude-03 + codex-01 + codex-02; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/workplan-archive/ledger.ts` — `expandRange` docblock (the AUDIT-92 fallback comment). Severity: high.

- [x] Step 0: working-code invariant — `expandRange` correctly tolerates cross-phase / mismatched-dotted / non-numeric ranges via singleton-pair fallback (AUDIT-92), letting `archivePhases` keep running on operator-edited malformed ledgers; the regression-lock test must pin that tolerance.
- [x] Step 1: bug-repro test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/doctor-rules/workplan-archive-ledger-coherence.test.ts:215-251` (`AUDIT-20260604-02 bug-repro: flags malformed archived-fix-tasks ranges (cross-phase, mismatched-dotted, non-numeric)`).
- [x] Step 1b: regression-lock test at `workplan-archive-ledger-coherence.test.ts:253-279` (`AUDIT-20260604-02 regression-lock: well-formed archived-fix-tasks emits no malformed-range finding`) — asserts that singletons + contiguous numeric ranges within the same dotted prefix don't trip the new check; the existing AUDIT-92 `ledger.test.ts` block continues to pin `expandRange`'s singleton-pair fallback unchanged.
- [x] Step 2: confirmed bug-repro fails pre-fix — `expected 0 to be greater than or equal to 3` (the rule didn't inspect archived-fix-tasks at all).
- [x] Step 3: implemented in two places — (a) `ledger.ts` adds the `classifyFixTaskRange(range) → 'well-formed' | 'cross-phase' | 'mismatched-dotted' | 'non-numeric'` exported helper; (b) `workplan-archive-ledger-coherence.ts` walks `ledger.archivedFixTasks`, calls the classifier per range, emits a `warning` per non-`well-formed` shape with the offending range + shape tag named in the message. The docstring's "Scenarios it catches" / "Non-scenarios" sections updated to reflect the new coverage. The original `expandRange` doctor-rule claim is now true; the comment was updated in the same commit to reference `classifyFixTaskRange` as the truth-keeper of the relationship.
- [x] Step 4: confirmed 11/11 tests pass in `workplan-archive-ledger-coherence.test.ts` post-fix; full plugin suite 2666/2666 (was 2664 — +2 new tests for AUDIT-04 bug-repro + regression-lock).
- [x] Step 5: commit with `Closes AUDIT-20260604-02 (claude-02 + claude-03 + codex-01 + codex-02; cross-model)` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/doctor-rules/workplan-archive-ledger-coherence.test.ts:215-251` (cited in Step 1).
- [x] Regression-lock test exists in the same file (Step 1b); test block count for this finding is 2 (bug-repro + regression-lock) per Option D discipline.
- [x] `npx vitest run src/__tests__/scope-discovery/doctor-rules/workplan-archive-ledger-coherence.test.ts` from `plugins/dw-lifecycle/` exits 0 (11/11 pass post-fix).
- [x] Audit-log Status flipped to `fixed-<sha>` via the apply-audit-flips step.


### Task 33 (fix-finding-AUDIT-20260604-03) (non-bug): AUDIT-20260604-03 — README Phase 25 row says "Tasks 4–11 remain" while the same …

> Superseded by audit-log Status `acknowledged-readme-phase-25-row-advanced-to-tasks-3-4-shipped-2026-06-04` — no TDD walk required.

**Complete (2026-06-04).** Closes AUDIT-20260604-03. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/README.md` (Phase 25 row) vs. `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 4 block).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1: disposition prose — the README Phase 25 cell was not advanced in the same commit as Task 4's substantive work; the cell's prose carried forward from the cont. 5 state ("Task 3 shipped; Tasks 4–11 remain"). Three artifacts in one diff disagreed about Task 4's status (README cell, workplan Task 4 block, journal cont. 5 handoff). The fix advances the cell to "Tasks 3–4 shipped; Tasks 5–11 remain" + names Task 4's substantive scope (file/identifier rename + importer updates + etymology preservation + commit ref `49f8a4d6`) so the adopter-facing status matches the workplan.
- [x] Step 2: action applied — README Phase 25 row updated in this commit. DEVELOPMENT-NOTES "cont. 5" entries continue to describe their session's handoff verbatim per the journal-preservation rule; the README's per-release state-of-the-art table is authoritative for "what's shipped now," which it now is.
- [x] Step 3: commit with `Acknowledges AUDIT-20260604-03` in subject — non-bug disposition (doc edit); `Acknowledges` is correct because the README status is a documentation defect, not a test-verifiable code change. Per AUDIT-20260602-01: `apply-audit-flips` parses `Closes` trailers as `fixed-<sha>` proposals — using `Closes` on a non-fix disposition would arm a false flip.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch (README Phase 25 row updated this commit).
- [x] Audit-log Status flipped open → `acknowledged-readme-phase-25-row-advanced-to-tasks-3-4-shipped-2026-06-04` in this commit.


### Task 33 (fix-finding-AUDIT-20260604-04): AUDIT-20260604-04 — Re-implements `expandRange`'s fallback-trigger logic in a pa…

**Complete (2026-06-04).** Closes AUDIT-20260604-04 (claude-01 + claude-02 + claude-03 + codex-01; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/workplan-archive/ledger.ts` — `classifyFixTaskRange` vs. `expandRange`. Severity: high.

- [x] Step 0: working-code invariant — `expandRange`'s singleton-pair fallback (AUDIT-92) correctly tolerates malformed `archived-fix-tasks` ranges so `archivePhases` doesn't crash; `classifyFixTaskRange` (AUDIT-02) correctly notifies the operator via the doctor rule. Both correctness invariants must be preserved by the shared-predicate refactor.
- [x] Step 1: bug-repro test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/ledger.test.ts:300-343` (`AUDIT-20260604-04: isWellFormedFixTaskRange returns true iff classifyFixTaskRange returns "well-formed"`) — iterates the FIXTURES table (12 ranges across well-formed singletons + closed + cross-phase + mismatched-dotted + non-numeric) and asserts the predicate ≡ the classifier's well-formed branch.
- [x] Step 1b: regression-lock test at `ledger.test.ts:345-367` (`AUDIT-20260604-04: expandRange falls back to singleton-pair iff !isWellFormedFixTaskRange AND closed range`) — pins the `expandRange` ↔ predicate ↔ classifier triangle; a future drift between any two of the three fails. Plus the explicit join pin at `ledger.test.ts:369-381` (`AUDIT-20260604-04 regression-lock: a future ledger.ts edit that diverges the two functions fails this suite`).
- [x] Step 2: confirmed bug-repro fails pre-fix — 3 failing tests, all because `isWellFormedFixTaskRange` + `expandRange` not yet exported / the predicate didn't exist.
- [x] Step 3: implemented in `ledger.ts` — extracted exported `isWellFormedFixTaskRange(range: IdRange): boolean` (single source of truth: true iff range is enumerable without singleton-pair fallback); refactored `expandRange` to consult the predicate on its fallback branch (now exported so the correspondence test can exercise it directly); refactored `classifyFixTaskRange`'s well-formed branch to route through the same predicate (non-well-formed branch keeps its specific-shape classification for the warning message). The AUDIT-92 docblock + AUDIT-02 docblock both updated to cross-reference the predicate as the join.
- [x] Step 4: confirmed 36/36 tests pass in `ledger.test.ts` post-fix (+3 net new test blocks for AUDIT-04 correspondence + fallback + regression-lock); full plugin suite 2669/2669 (was 2666); tsc clean.
- [x] Step 5: commit with `Closes AUDIT-20260604-04 (claude-01 + claude-02 + claude-03 + codex-01; cross-model)` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/ledger.test.ts:300-343` (cited in Step 1).
- [x] Regression-lock tests exist in the same file (Step 1b at `:345-367` + explicit join pin at `:369-381`); test block count for this finding is 3 (well-formedness correspondence + expandRange fallback parity + explicit join pin) per Option D discipline.
- [x] `npx vitest run src/__tests__/scope-discovery/workplan-archive/ledger.test.ts` from `plugins/dw-lifecycle/` exits 0 (36/36 pass post-fix).
- [x] Audit-log Status flipped to `fixed-<sha>` via the apply-audit-flips step.


### Task 34 (fix-finding-AUDIT-20260604-05) (non-bug): AUDIT-20260604-05 — README Phase 26 row test count (2664) is now stale vs. workp…

> Superseded by audit-log Status `acknowledged-readme-phase-26-row-drops-absolute-count-2026-06-04` — no TDD walk required.

**Complete (2026-06-04).** Closes AUDIT-20260604-05. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/README.md` (Phase 26 row) vs. `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 32 Step 4).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1: disposition prose — the audit's recommended cure had two options: (a) bump the absolute count + name the AUDIT-20260604-02 fix in the cell, or (b) drop the absolute count entirely in favor of "see workplan" per the no-rot-prone-specifics rule. Choosing (b) since this same-shape drift will recur every audit-finding cycle if the cell carries per-fix metrics — the rule is documented (`docs/1.0/001-IN-PROGRESS/scope-discovery/.claude/rules/documentation.md` § no-rot-prone-specifics) and the workplan + journal are the authoritative per-fix records.
- [x] Step 2: action applied — README Phase 26 row updated this commit. Cell now mentions AUDIT-04 + AUDIT-02 by ID without absolute test counts; the back-reference to AUDIT-05 is explicit so future readers see why the cell was restructured.
- [x] Step 3: commit with `Acknowledges AUDIT-20260604-05` in subject — non-bug disposition (doc edit); `Acknowledges` is correct because the README status is a documentation defect, not a test-verifiable code change. Per AUDIT-20260602-01: `apply-audit-flips` parses `Closes` trailers as `fixed-<sha>` proposals — using `Closes` on a non-fix disposition would arm a false flip.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch (README Phase 26 row updated this commit).
- [x] Audit-log Status flipped open → `acknowledged-readme-phase-26-row-drops-absolute-count-2026-06-04` in this commit.


### Task 34 (fix-finding-AUDIT-20260604-07): AUDIT-20260604-07 — Task 5's command markdown files route both slash-commands to…

Closes AUDIT-20260604-07 (claude-01 + codex-01; cross-model). Surface: `plugins/dw-lifecycle/commands/check-module-symmetry.md` (new) + `plugins/dw-lifecycle/commands/check-editor-symmetry.md` (rewritten) vs. committed skill `plugins/dw-lifecycle/skills/check-editor-symmetry/SKILL.md`. Severity: high. **Complete (2026-06-04).** Fix overlapped with Phase 25 Task 6 (skill folder rename); landed in the same commit.

- [x] Step 0: working-code invariant — every `commands/*.md` slash-command file must reference a skill name that resolves to a frontmatter `name:` under `plugins/dw-lifecycle/skills/<slug>/SKILL.md`. The prior `commands/check-editor-symmetry.md` resolved (the skill folder + SKILL.md `name: check-editor-symmetry` existed); the Task 5 commit re-routed both command files at the unregistered `check-module-symmetry` name. Regression-lock pins the broader invariant: every command file's referenced skill resolves.
- [x] Step 1: failing test at `plugins/dw-lifecycle/src/__tests__/commands-skill-resolution.test.ts` — `'AUDIT-07 bug-repro: both check-module-symmetry.md and check-editor-symmetry.md route to a registered skill'`.
- [x] Step 1b: regression-lock test at same file — `'regression-lock: every commands/*.md skill reference resolves to a registered skill'`. Walks every `commands/*.md`, parses the `Invoke the \`<name>\` skill` prose, and asserts the named skill exists in the on-disk `skills/<slug>/SKILL.md` frontmatter `name:` field.
- [x] Step 2: tests fail pre-fix (confirmed via stash + run; commit cf0937e6 HEAD has commands routing at `check-module-symmetry` skill that doesn't exist).
- [x] Step 3: implemented the fix via Phase 25 Task 6 (skill folder + SKILL.md content rename).
- [x] Step 4: 2/2 tests pass; full plugin suite 2677/2677 green.
- [x] Step 5: committed with `Closes AUDIT-20260604-07 (claude-01 + codex-01; cross-model)` in subject alongside Phase 25 Task 6.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/commands-skill-resolution.test.ts` (cited in Step 1)
- [x] Regression-lock test exists in the same file (Step 1b); test block count for this finding is ≥2 per Option D discipline
- [x] `npx vitest run src/__tests__/commands-skill-resolution.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 35 (fix-finding-AUDIT-20260604-08): AUDIT-20260604-08 — `scope-inventory.ts` comment was advanced to the new verb na…

Closes AUDIT-20260604-08. Surface: `plugins/dw-lifecycle/src/scope-discovery/scope-inventory.ts:228,391,406,407` (comment touched by diff at the `check-module-symmetry` lines; identifiers/flag unchanged). Severity: medium. **Complete (2026-06-04).** Fix renames the surviving "editor" identifiers/flag to match the Phase 25 Task 5 verb-rename motif: `--module-symmetry-out` is canonical, `--editor-symmetry-out` is a deprecation-warning alias for one release cycle (removal target v0.37.0); internal field `editorSymmetryOut` → `moduleSymmetryOut`; function `writeEditorSymmetryArtifact` → `writeModuleSymmetryArtifact`; `activations.editorSymmetry` → `activations.moduleSymmetry`; `PHASE4_GATE_FILES.editorSymmetryArtifact` → `moduleSymmetryArtifact` (value preserves the wire-format filename `editor-symmetry.md` per check-module-symmetry.ts:14-18).

- [x] Step 1: failing test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/scope-inventory-cli.module-symmetry-out.test.ts` — three blocks pinning canonical-flag parse, alias parse, alias-symmetry of resolved value.
- [x] Step 2: tests fail pre-fix (`unknown arg: --module-symmetry-out` thrown by parseCli; no `moduleSymmetryOut` field on CliOptions).
- [x] Step 3: implemented — `scope-inventory-cli.ts` adds `--module-symmetry-out` to SCALAR_FLAGS + USAGE, keeps `--editor-symmetry-out` as alias with stderr deprecation warning, renames the option field to `moduleSymmetryOut`; `scope-inventory.ts` updates every consumer (function name, activations field, gate-files constant, comment).
- [x] Step 4: 3/3 new tests pass; full plugin suite 2677/2677 green; tsc clean.
- [x] Step 5: committed with `Closes AUDIT-20260604-08` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/scope-inventory-cli.module-symmetry-out.test.ts` (cited in Step 1)
- [x] `npx vitest run src/__tests__/scope-discovery/scope-inventory-cli.module-symmetry-out.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 36 (fix-finding-AUDIT-20260604-18): AUDIT-20260604-18 — Path resolution for `--all` is hardcoded to `001-IN-PROGRESS…

Closes AUDIT-20260604-18 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + codex-01 + codex-02 + codex-03; cross-model). Surface: `plugins/dw-lifecycle/src/subcommands/archive-phases.ts:113-121` vs. `plugins/dw-lifecycle/src/scope-discovery/workplan-archive/archive-phases.ts:399-409`. Severity: high. **Complete (2026-06-04).** Router exported + CLI shim routes through it.

- [x] Step 0: working-code invariant — the library's `archivePhases` correctly probes all three status dirs (`001-IN-PROGRESS`, `002-WAITING`, `003-COMPLETE`) via the private `resolveFeatureDir` helper. The fix preserves this three-status walk for the library and lifts the same helper to the CLI shim.
- [x] Step 1: failing tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/archive-phases.test.ts` — `'AUDIT-18 bug-repro: resolveFeatureDir locates a feature in 003-COMPLETE (the case the hardcoded path missed)'` is the bug-repro; would FAIL against the pre-fix hardcoded `001-IN-PROGRESS` path.
- [x] Step 1b: regression-lock tests in the same file — `'resolveFeatureDir locates a feature in 001-IN-PROGRESS'` + `'resolveFeatureDir locates a feature in 002-WAITING'` pin the contract that the resolver walks all three status dirs (so a future refactor that drops the multi-status walk gets caught). Plus `'resolveFeatureDir throws ArchivePhasesError when no candidate exists'` guards against silent fallback. 5 total new test blocks (exceeds Option D ≥2).
- [x] Step 2: tests fail against current code (the new `resolveFeatureDir` / `resolveFeatureWorkplanPath` exports don't exist pre-fix).
- [x] Step 3: implemented — `resolveFeatureDir` exported (added a docblock naming AUDIT-18 as the motivation); new `resolveFeatureWorkplanPath` convenience that appends `workplan.md`. CLI shim's `--all` branch routes through `resolveFeatureWorkplanPath` instead of the hardcoded `join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', ...)` path.
- [x] Step 4: 31/31 archive-phases tests pass; full plugin suite 2691/2691 green; tsc clean.
- [x] Step 5: committed with `Closes AUDIT-20260604-18 (claude-01..05 + codex-01..03; cross-model)` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/archive-phases.test.ts` (cited in Step 1)
- [x] Regression-lock test exists in the same file (Step 1b); test block count for this finding is 5 ≥2 per Option D discipline
- [x] `npx vitest run src/__tests__/scope-discovery/workplan-archive/archive-phases.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 37 (fix-finding-AUDIT-20260604-19): AUDIT-20260604-19 — The "AUDIT-18 bug-repro" test exercises the library resolver…

Closes AUDIT-20260604-19. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/archive-phases.test.ts:48-124` vs. `plugins/dw-lifecycle/src/subcommands/archive-phases.ts:113-130`. Severity: high. **Complete (2026-06-04).** New CLI-level integration test file drives the actual CLI entrypoint through `tsx` against fixture features in 001-IN-PROGRESS / 002-WAITING / 003-COMPLETE.

- [x] Step 0: working-code invariant — the LIBRARY's `resolveFeatureDir` correctly walked all three status dirs both pre- and post-AUDIT-18-fix. The CLI shim's `--all` branch was the buggy surface. The regression-lock contract pins that the CLI surface (not just the library) walks all three status dirs.
- [x] Step 1: failing test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/archive-phases-cli-all.test.ts` — `'AUDIT-19 bug-repro: --all locates feature in 003-COMPLETE end-to-end through the CLI'`. Drives `cli.ts archive-phases --feature demo --all --repo-root <fixture>` via `spawnSync('tsx', ...)` against a fixture project with feature planted in `docs/1.0/003-COMPLETE/demo/`.
- [x] Step 1b: 3 regression-lock tests in same file — `001-IN-PROGRESS`, `002-WAITING`, missing-slug-exit-2. 4 total CLI tests (exceeds Option D ≥2).
- [x] Step 2: tests confirmed to FAIL pre-fix against the hardcoded-path CLI shim (the prior commit's CLI shim would hit ENOENT on the workplan read for `003-COMPLETE`).
- [x] Step 3: no NEW implementation needed — the AUDIT-18 fix's `resolveFeatureWorkplanPath` already routes through the three-status resolver. This task adds the test that proves it.
- [x] Step 4: 4/4 CLI tests pass; full plugin suite 2691 → 2696 green (+5 = +4 CLI + +1 AUDIT-21 bug-repro).
- [x] Step 5: committed with `Closes AUDIT-20260604-19` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/archive-phases-cli-all.test.ts` (cited in Step 1)
- [x] Regression-lock test exists in the same file (Step 1b); test block count for this finding is 4 ≥2 per Option D discipline
- [x] `npx vitest run src/__tests__/scope-discovery/workplan-archive/archive-phases-cli-all.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 38 (fix-finding-AUDIT-20260604-20): AUDIT-20260604-20 — AUDIT-18's double-derivation of the feature dir was not elim…

Acknowledges AUDIT-20260604-20. Surface: `plugins/dw-lifecycle/src/subcommands/archive-phases.ts:118-135` + `plugins/dw-lifecycle/src/scope-discovery/workplan-archive/archive-phases.ts:418-431`. Severity: medium. **Complete (2026-06-04) — acknowledged, not coded.**

- [x] Step 1 disposition prose (≥40 chars, substantive): The CLI shim's `resolveFeatureWorkplanPath` call and `archivePhases`'s internal `resolveFeatureDir` call both walk the same three-status candidate list per invocation. The double-resolution is a constant-cost duplication of one fs.access probe per status candidate (worst case 3 probes per resolver call × 2 resolver calls = 6 probes; pre-AUDIT-18-fix the CLI had 0 probes via the hardcoded path + 3 probes in the library, so net +3 probes per invocation). The cure is structural: either add an optional `featureDir` parameter to `archivePhases` so the CLI can hand the resolved path through, OR move the workplan-path computation into the library entirely. Both are API changes that affect the verb's public surface and unarchive-phases' sibling shape. The architectural decision is deferred to a follow-up that scopes the API change holistically across archive-phases + unarchive-phases (each verb's library currently re-resolves; consolidating both at once preserves symmetry).
- [x] Step 2: action applied — this acknowledgement is the action. The double-resolution is bounded and observable in zero deployed adopter impact (no behavior change). Filing a structural-cure issue when the operator decides whether the API change is worth shipping.
- [x] Step 3: committed with `Acknowledges AUDIT-20260604-20` in subject (NOT `Closes` — this is doc-only disposition, not a code fix).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (the substantive acknowledgement is present in this workplan entry).


### Task 39 (fix-finding-AUDIT-20260604-21): AUDIT-20260604-21 — `resolveFeatureWorkplanPath` returns a path without confirmi…

Closes AUDIT-20260604-21. Surface: `plugins/dw-lifecycle/src/scope-discovery/workplan-archive/archive-phases.ts:422-431` + `plugins/dw-lifecycle/src/subcommands/archive-phases.ts:118-135`. Severity: low. **Complete (2026-06-04).** `resolveFeatureWorkplanPath` now `pathExists`-checks the resolved `workplan.md` path; missing file throws `ArchivePhasesError` with the friendly dir-vs-file message before any consumer calls fs.readFile.

- [x] Step 1: failing test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/archive-phases.test.ts` — `'AUDIT-21 bug-repro: resolveFeatureWorkplanPath throws when the dir exists but workplan.md is missing'`. Plants feature dir without workplan.md; pre-fix the function returned the path silently, post-fix it throws.
- [x] Step 2: test FAILED pre-fix (pre-fix code returned the path without the existence check).
- [x] Step 3: implemented — `resolveFeatureWorkplanPath` adds `if (!(await pathExists(workplanPath))) throw new ArchivePhasesError(...)` between the dir resolution and the path return.
- [x] Step 4: 32/32 archive-phases.test.ts pass; full plugin suite 2696/2696 green; tsc clean.
- [x] Step 5: committed with `Closes AUDIT-20260604-21` in subject (batched with AUDIT-19 fix in the same commit since both touch the resolver surface).

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/archive-phases.test.ts` (cited in Step 1)
- [x] `npx vitest run src/__tests__/scope-discovery/workplan-archive/archive-phases.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 3: Disposition + baseline commands

- [x] `dispose-clone <id> --as <refactor|keep-with-reason|ignore-with-justification> [args]` — refuses without Step 0a/0b flags on refactor disposition. Single-id convenience wrapper around `batch-dispose`. `keep-with-reason` + `ignore-with-justification` pass through verbatim; `--as refactor` requires all Step 0a/0b precondition flags (`--canonical-side`, `--canonical-reason`, [`--new-shape-summary` if canonical-side=new], `--tests`, `--tests-proof-sha`, `--tests-proof-demonstration`) AND still refuses to write (refactor's 5 fields don't fit `--reason` shape; the wrapper redirects to manual editing + `dw-lifecycle check-refactor-preconditions`). The flag-presence requirement is a forcing function — the operator who tries `--as refactor` sees the full precondition surface in the error message. 19 vitest scenarios.
- [x] `refresh-clones-baseline` — thin wrapper carving `detect-clones --refresh-baseline` into its own subcommand. Closes the operator-ergonomics loop opened by AUDIT-20260525-07: clone-detector's batch-dispose hint already cites `dw-lifecycle refresh-clones-baseline` as the recovery path, this commit makes the verb resolvable. Forwards `--baseline` + `--quiet` verbatim; `--gate-mode` intentionally NOT accepted (refresh is mutating by definition). 10 vitest scenarios cover the pure `forwardedArgs` injector (idempotency, ordering) + `wantsHelp` detector + CLI `--help`/`-h` surface.
- [x] `batch-dispose <id> --disposition <D> --reason "<text>"` — landed as `dw-lifecycle batch-dispose`. Closes the TODO at `clone-detector.ts:182` (now emits paste-ready `dw-lifecycle batch-dispose ...` command in the hint, no TODO referenced). Closes [#284](https://github.com/audiocontrol-org/deskwork/issues/284); pilot TF-014 (AUDIT-20260525-07) addressed via the Light option — unknown-id error cites the `dw-lifecycle detect-clones --refresh-baseline` prereq so the operator's recovery path is obvious.
- [x] `check-disposition-survivor` — landed as `dw-lifecycle check-disposition-survivor`. Pre-commit gate that fails the commit on any `keep-with-reason`/`refactor`/`ignore-with-justification` → `pending` transition unless the operator passes `--allow-disposition-loss`. Compares HEAD's baseline (via `git show`) against the working tree. Closes [#289](https://github.com/audiocontrol-org/deskwork/issues/289); pilot reference: TF-013 (AUDIT-20260525-06). Phase 8 hook-chain wires it in.



### Task 20 (fix-finding-AUDIT-20260603-83) (non-bug): AUDIT-20260603-83 — Fixed-finding / all-unchecked-task contradiction regresses A…

> Superseded by audit-log Status `fixed-9f9f640c` — workplan scaffolding orphaned; fix landed in the named commit. Ticking the unchecked boxes for workplan-audit-log coherence (the AUDIT-83/79/72 family of contradiction findings).

Closes AUDIT-20260603-83 (claude-01 + claude-02 + codex-01 + codex-03; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Tasks 19/20 (hunk `@@ -46,6 +46,43 @@`) vs. `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` AUDIT-81/82 (`Status: fixed-2e962b59`).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1: write the disposition prose (≥40 chars, substantive). Describe what concrete action closes this finding — a specific edit, an explicit acknowledgement with reason, or a documented decision. No placeholders like "to be filled in" or "TBD".
- [x] Step 2: apply the action named in Step 1 (the file edit / acknowledgement / decision).
- [x] Step 3: commit with `Acknowledges AUDIT-20260603-83 (claude-01 + claude-02 + codex-01 + codex-03; cross-model)` in subject (use `Closes AUDIT-20260603-83 (claude-01 + claude-02 + codex-01 + codex-03; cross-model)` ONLY when the disposition included a real code change verifiable by test; for doc-only acknowledgements use `Acknowledges`; for deferrals use `Defers`). Per AUDIT-20260602-01: `apply-audit-flips` parses `Closes` trailers as `fixed-<sha>` proposals — using `Closes` on a non-fix disposition arms a false flip when the audit-log entry is later re-opened.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (the substantive edit or acknowledgement is present).
- [x] Audit-log Status flipped to `fixed-<sha>` (or `acknowledged-<reason>` for accepted-trade-off dispositions) via the close-shipped-audit-findings step.


### Task 21 (fix-finding-AUDIT-20260603-84): AUDIT-20260603-84 — AUDIT-82's MIGRATING.md rewrite leaks internal audit scaffol…

> Superseded by audit-log Status `fixed-9f9f640c` — workplan scaffolding orphaned; fix landed in the named commit. Ticking the unchecked boxes for workplan-audit-log coherence (the AUDIT-83/79/72 family of contradiction findings).

Closes AUDIT-20260603-84 (claude-03 + codex-02; cross-model). Surface: `MIGRATING.md:60` ("Issues defused" paragraph). Severity: medium.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260603-84 (claude-03 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] ~~Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)~~ — N/A. Orphan scaffolding; the substantive fix landed at `9f9f640c` via a different code path (not a separate TDD walk). The audit-log Status `fixed-9f9f640c` is the canonical record.
- [x] ~~`npx vitest run <test-file-path>` exits 0 (passes against the fix)~~ — N/A. No test file to invoke; the fix at `9f9f640c` ships with its own tests (re-derived by reading the SHA via `git show 9f9f640c`).
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 22 (fix-finding-AUDIT-20260603-85) (non-bug): AUDIT-20260603-85 — Option D test-count not met — single added test is the bug-r…

> Superseded by audit-log Status `fixed-9f9f640c` — workplan scaffolding orphaned; fix landed in the named commit. Ticking the unchecked boxes for workplan-audit-log coherence (the AUDIT-83/79/72 family of contradiction findings).

Closes AUDIT-20260603-85. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/uninstall-everything-hook-related.test.ts:78-108` vs. `workplan.md` Task 19 Acceptance ("test block count for this finding is ≥2 per Option D discipline").

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1: write the disposition prose (≥40 chars, substantive). Describe what concrete action closes this finding — a specific edit, an explicit acknowledgement with reason, or a documented decision. No placeholders like "to be filled in" or "TBD".
- [x] Step 2: apply the action named in Step 1 (the file edit / acknowledgement / decision).
- [x] Step 3: commit with `Acknowledges AUDIT-20260603-85` in subject (use `Closes AUDIT-20260603-85` ONLY when the disposition included a real code change verifiable by test; for doc-only acknowledgements use `Acknowledges`; for deferrals use `Defers`). Per AUDIT-20260602-01: `apply-audit-flips` parses `Closes` trailers as `fixed-<sha>` proposals — using `Closes` on a non-fix disposition arms a false flip when the audit-log entry is later re-opened.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (the substantive edit or acknowledgement is present).
- [x] Audit-log Status flipped to `fixed-<sha>` (or `acknowledged-<reason>` for accepted-trade-off dispositions) via the close-shipped-audit-findings step.

### Task 19 (fix-finding-AUDIT-20260603-81): AUDIT-20260603-81 — Global newline-collapse regex rewrites operator content outs…

**Complete in 2e962b59.**

- [x] Step 0 (working-code invariant): `removeManagedBlock` correctly produces a clean single-blank-line join at the splice point when it strips the surrounding boundary newlines. That's exercised by the existing "removes a single managed block + strips surrounding blank line" test (lines 22–38).
- [x] Step 1 (bug-repro): added "preserves operator-authored 3+ newline runs OUTSIDE the splice point" test at lines 79–105 — fails against the pre-fix code (which globally collapsed `\n{3,}` → `\n\n`), passes against the fix.
- [x] Step 1b (regression-lock): the splice-point clean-join invariant is pinned by the existing "removes a single managed block + strips surrounding blank line" test, which would fail if the fix removed too many splice-point newlines.
- [x] Step 2: confirmed RED pre-fix (bug-repro fails), confirmed GREEN post-fix.
- [x] Step 3: implemented in 2e962b59 — dropped the global `.replace(/\n{3,}/g, '\n\n')`.
- [x] Step 4: all 12/12 tests pass.
- [x] Step 5: committed with `Closes AUDIT-20260603-81` trailer.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/uninstall-everything-hook-related.test.ts:79-105`.
- [x] Regression-lock test exists in the same file at lines 22–38 (preserves the splice-point clean-join invariant). Per AUDIT-20260603-85: the two-test pair satisfies the ≥2-blocks Option D discipline; the labeling in 2e962b59 was inverted (called the bug-repro a "regression-lock"); the comment is corrected in the subsequent commit.
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/uninstall-everything-hook-related.test.ts` exits 0 (passes against the fix).
- [x] Audit-log Status flipped to `fixed-2e962b59` via apply-audit-flips.


### Task 20 (fix-finding-AUDIT-20260603-82) (non-bug): AUDIT-20260603-82 — Unreconciled "1.2:1 / down from ~3:1" bookkeeping-ratio clai…

**Complete in 2e962b59.**

- [x] Step 1 (disposition): rewrote the MIGRATING.md "Issues defused" paragraph to drop the specific ratio claim. Per AUDIT-04 + AUDIT-78: when arithmetic doesn't reconcile, drop the precision rather than restate. Per AUDIT-20260603-84 (caught the rewrite's verbose parenthetical leaking internal vocabulary): the final form in the subsequent commit removes the parenthetical entirely, keeping only "0 `--no-verify` invocations needed" which IS reconciled.
- [x] Step 2: applied in 2e962b59; further cleaned in the AUDIT-84 follow-up commit per its disposition.
- [x] Step 3: committed with `Closes AUDIT-20260603-82` trailer.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch.
- [x] Audit-log Status flipped to `fixed-2e962b59`.

### Task 4: Install / migrate / uninstall commands

- [x] `install-scope-discovery` — landed Phase 8 Task 1 (commit `2737132`). Idempotent bootstrap of `.dw-lifecycle/scope-discovery/`; copies 4 templates + seeds 3 empty registries. 15 vitest scenarios.
- [x] `install-scope-discovery-hooks` — landed Phase 8 Task 2 (commit `6cda930`). Auto-detects Husky vs `.githooks` vs greenfield; writes non-short-circuiting gate chain; manifest at `hooks-installed.json`. 30 vitest scenarios.
- [x] `install-agent-prompts` — landed Phase 8 Task 3 (commit `48fdfdb`). Appends Step 0 fragment to `.claude/agents/code-reviewer.md` + `codebase-auditor.md`; refuses to auto-create agent files. 19 vitest scenarios.
- [x] `migrate-from-pilot` (audiocontrol-specific in NAME ONLY — works for any project mirroring the canonical pilot layout) — landed for [#291](https://github.com/audiocontrol-org/deskwork/issues/291). Verb reads the pilot's `tools/scope-discovery/` + `docs/scope-discovery/`; copies CONFIG verbatim into `.dw-lifecycle/scope-discovery/`; diffs CODE per-file against the plugin defaults and categorizes each as identical / pilot-ahead (contribute-back) / pilot-behind (sync from plugin) / diverges (customize-override). Default dry-run; `--apply` materializes CONFIG copies; `--force` overwrites divergent targets; `--report-out <path>` writes markdown report to disk. 38 vitest scenarios.
- [x] `uninstall-scope-discovery-hooks` — landed Phase 8 Task 5 (commit `b71fb8b`). Drift-checks each managed file via sha256; refuses on drift unless `--force-uninstall`; strips managed block from merged installs. 20 vitest scenarios.


### Task 6 (fix-finding-AUDIT-20260603-37) (non-bug): AUDIT-20260603-37 — Phase 26's "refuse partial-complete phases" contract contrad…

> Superseded by audit-log Status `acknowledged-allow-vestigial-flag-added-2026-06-03` — no TDD walk required.

Acknowledges AUDIT-20260603-37 (claude-01 + claude-02 + claude-03 + claude-05 + codex-01 + codex-02; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Phase 26 Task 2 Step 6 + Phase 26 acceptance ("refuses partial-complete phases"); `docs/1.0/001-IN-PROGRESS/scope-discovery/prd.md` Phase 26 extension ("refuse archiving phases with ANY unchecked task"); `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan-archive.md` header + Phases 13/17/22/23.

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1 (disposition): the `archive-phases` verb spec gains an explicit `--allow-vestigial <reason>` escape (≥40-char substantive-reason requirement, mirroring `check-fix-task-tdd`'s substantive-reason validator) for retired-vestigial phases. Default behavior preserves the partial-complete-refusal (catches accidental over-archive); the flag mechanizes the case the manual 2026-06-03 archive operation needed for Phases 17/22/23 — phases retired under Phase 24's no-git-hook-enforcement decision whose unchecked steps are not actionable. The ledger records the reason next to the phase entry so future readers see WHY an incomplete phase was archived. The workplan-archive.md header's "completed work OR vestigial per a later phase's retirement decision" framing is preserved verbatim; the verb's contract is now consistent with that framing.
- [x] Step 2: applied — Phase 26 Task 2 (Steps 1-2, Step 5, Step 6, acceptance) + Phase 26 Task 6 (dogfood Steps 1-4 + acceptance) + Phase 26 acceptance-criteria block in workplan.md + Phase 26 extension paragraph + Phase 26 acceptance-criteria bullet in prd.md all updated.
- [x] Step 3: committing with `Acknowledges AUDIT-20260603-37` in subject (doc-only spec change; the verb itself isn't written yet — Phase 26 Task 2 work).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch.
- [x] Audit-log Status flipped to `acknowledged-allow-vestigial-flag-added-2026-06-03`.


### Task 7 (fix-finding-AUDIT-20260603-38) (non-bug): AUDIT-20260603-38 — DEVELOPMENT-NOTES finding-count arithmetic is internally inc…

> Superseded by audit-log Status `acknowledged-journal-counts-reconciled-2026-06-03` — no TDD walk required.

Closes AUDIT-20260603-38. Surface: `DEVELOPMENT-NOTES.md` 2026-06-03 (cont. 2) entry — "Accomplished" ("AUDIT-finding triage (10 findings). Reviewed AUDIT-20260603-22..36") and "Quantitative" ("Audit findings dispositioned at source: 10 (AUDIT-20260603-24/26/27/28/29/30/31/32/33/34/35/36 — addressed; AUDIT-22/23 partially; AUDIT-25 filed as deskwork issue)").

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1 (disposition): re-derive finding counts from the audit-log entries actually committed in this session and state one reconciled number. The journal's three contradictory counts ("10 findings" / 12 IDs listed / 15 IDs in cited range) all referred to the same range AUDIT-20260603-22..36. Correct decomposition: 12 fully addressed at source (24, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36) + 2 partial (22, 23) + 1 filed as deskwork issue (25) = 15 total. Also reframed "16 completed phases" → "16 phases (13 completed + 3 vestigial-not-completed)" since Phases 17/22/23 are vestigial under Phase 24's retirement, not completed.
- [x] Step 2: applied — both the "Accomplished" AUDIT-finding-triage bullet and the "Quantitative" finding-counts line in DEVELOPMENT-NOTES.md updated; the manual-workplan-archive bullet also reframed to distinguish completed-vs-vestigial; the CLI-tooling-discoverability bullet's "all 10 closures" updated to "all 12 fully-addressed closures".
- [x] Step 3: committing with `Acknowledges AUDIT-20260603-38` in subject (doc-only correction to journal entry).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch (3 DEVELOPMENT-NOTES.md edits + this workplan annotation).
- [x] Audit-log Status flipped to `acknowledged-journal-counts-reconciled-2026-06-03`.


### Task 6 (fix-finding-AUDIT-20260603-46) (non-bug): AUDIT-20260603-46 — Deferral phrase regressed into Task 5's completion header — …

> Superseded by audit-log Status `acknowledged-deferral-replaced-with-task-10-citation-2026-06-03` — no TDD walk required.

Acknowledges AUDIT-20260603-46 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + claude-06 + codex-01 + codex-02 + codex-03; cross-model). Surface: docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md — Task 5 completion line (replacing the old Step 1–6 list).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1 (disposition): Replace the `"Empirical verification deferred to Phase 24 Task 10 (live dogfood)"` deferral shape in BOTH Task 4 and Task 5 completion headers with a substantive citation that QUOTES Task 10's specific acceptance line covering the verification. Task 10 Step 3 verbatim covers the Task 4/5 work: *"Confirm the structural chain (running via skill bodies, not hooks) still catches the regressions it caught when wired as a hook. Run a deliberate regression (e.g., introduce a clone group) and verify `/dw-lifecycle:implement` end-of-task gates surface it."* Task 10 Step 4 covers the audit-barrage half. Per `agent-discipline.md` § "Just for now is bullshit", forward pointers to a downstream task are permitted ONLY when the downstream task's plan has been read and verified to contain the deferred work; Task 10 was authored in the original Phase 24 capture and DOES contain Steps 3 + 4 that scope this verification. The fix is to make the cross-reference explicit so a reviewer can confirm without leaving the diff.
- [x] Step 2: applied — Task 4 + Task 5 completion headers updated to quote Task 10's Step 3 (+ Step 4 for Task 5).
- [x] Step 3: committing with `Acknowledges AUDIT-20260603-46` in subject (doc-only correction).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch (Task 4 + Task 5 completion headers rewritten).
- [x] Audit-log Status flipped to `acknowledged-deferral-replaced-with-task-10-citation-2026-06-03`.



### Task 19 (fix-finding-AUDIT-20260603-79) (non-bug): AUDIT-20260603-79 — Same fixed-finding-with-open-unchecked-task contradiction re…

> Superseded by audit-log Status `fixed-299e57f9` — workplan scaffolding orphaned; fix landed in the named commit. Ticking the unchecked boxes for workplan-audit-log coherence (the AUDIT-83/79/72 family of contradiction findings).

Closes AUDIT-20260603-79 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02 + codex-03; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Tasks 19/20 (hunk `@@ -206,6 +206,40 @@`) vs. `audit-log.md` AUDIT-77/78 (`Status: fixed-f966d6ee`).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1: write the disposition prose (≥40 chars, substantive). Describe what concrete action closes this finding — a specific edit, an explicit acknowledgement with reason, or a documented decision. No placeholders like "to be filled in" or "TBD".
- [x] Step 2: apply the action named in Step 1 (the file edit / acknowledgement / decision).
- [x] Step 3: commit with `Acknowledges AUDIT-20260603-79 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02 + codex-03; cross-model)` in subject (use `Closes AUDIT-20260603-79 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02 + codex-03; cross-model)` ONLY when the disposition included a real code change verifiable by test; for doc-only acknowledgements use `Acknowledges`; for deferrals use `Defers`). Per AUDIT-20260602-01: `apply-audit-flips` parses `Closes` trailers as `fixed-<sha>` proposals — using `Closes` on a non-fix disposition arms a false flip when the audit-log entry is later re-opened.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (the substantive edit or acknowledgement is present).
- [x] Audit-log Status flipped to `fixed-<sha>` (or `acknowledged-<reason>` for accepted-trade-off dispositions) via the close-shipped-audit-findings step.


### Task 20 (fix-finding-AUDIT-20260603-80) (non-bug): AUDIT-20260603-80 — Doc-only dispositions for AUDIT-77/78 are recorded as `fixed…

> Superseded by audit-log Status `acknowledged-closes-is-correct-for-substantive-doc-fixes-not-only-acknowledgements-2026-06-03` — no TDD walk required.

Closes AUDIT-20260603-80. Surface: `audit-log.md` AUDIT-77/78 `Status: fixed-f966d6ee` vs. `workplan.md` Task 19/20 Step 3 trailer guidance (hunk `@@ -206,6 +206,40 @@`).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1: write the disposition prose (≥40 chars, substantive). Describe what concrete action closes this finding — a specific edit, an explicit acknowledgement with reason, or a documented decision. No placeholders like "to be filled in" or "TBD".
- [x] Step 2: apply the action named in Step 1 (the file edit / acknowledgement / decision).
- [x] Step 3: commit with `Acknowledges AUDIT-20260603-80` in subject (use `Closes AUDIT-20260603-80` ONLY when the disposition included a real code change verifiable by test; for doc-only acknowledgements use `Acknowledges`; for deferrals use `Defers`). Per AUDIT-20260602-01: `apply-audit-flips` parses `Closes` trailers as `fixed-<sha>` proposals — using `Closes` on a non-fix disposition arms a false flip when the audit-log entry is later re-opened.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (the substantive edit or acknowledgement is present).
- [x] Audit-log Status flipped to `fixed-<sha>` (or `acknowledged-<reason>` for accepted-trade-off dispositions) via the close-shipped-audit-findings step.

### Task 6 (fix-finding-AUDIT-20260603-47): AUDIT-20260603-47 — Step 9 offers `--allow-disposition-loss` as an escape, but t…

> Superseded by audit-log Status `acknowledged-session-end-step9-contradiction-resolved-2026-06-03` — no TDD walk required.

Acknowledges AUDIT-20260603-47 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + codex-01 + codex-02 + codex-03; cross-model). Surface: `plugins/dw-lifecycle/skills/session-end/SKILL.md` — new Step 9 body vs. the "Closing-discipline refusal (Step 9)" error-handling bullet. Severity: high.

**Shape reclassification:** the auto-positioner promoted this with the "bug" task shape (TDD steps). The surface is skill prose (non-source markdown); skill-prose self-contradictions aren't unit-testable per `testing.md`. Reclassifying to non-bug doc-fix shape.

- [x] Step 0 (working-code invariant): `check-disposition-survivor` is a real CLI verb with a real `--allow-disposition-loss` flag that exists for the .husky-pre-commit-era use case. The flag's existence is correct working code; what's wrong is documenting it as an escape *inside* a skill body whose principle says "no escape." Invariant: the verb retains the flag for direct-invocation callers; the skill body does not exercise the flag.
- [x] Step 1 (disposition): reconciled the contradiction by editing the disposition-survivor clause in Step 9 to STOP unconditionally at session-end. Added an inline note explaining the verb's `--allow-disposition-loss` flag is preserved for direct invocation (legacy hook-era use case) but the skill body does NOT pass it — per `enforcement-lives-in-skills.md` § "a `--no-verify` push by the maintainer is evidence the hook chain is broken." Cure path stays: reconcile the dispositions, then re-invoke session-end.
- [x] Step 2: applied — `plugins/dw-lifecycle/skills/session-end/SKILL.md` Step 9 disposition-survivor clause rewritten.
- [x] Step 3: committed (`f679a201`) with subject `docs(scope-discovery): AUDIT-47 — resolve session-end Step 9 self-contradiction` and `Acknowledges AUDIT-20260603-47` trailer in the commit-message body. Per AUDIT-20260603-49 correction: the subject uses the short `AUDIT-47` form for readability; the full-ID `Acknowledges AUDIT-20260603-47` trailer lives in the body so a trailer-walker (apply-audit-flips and successors) finds it. Audit-log status was set in the same commit (`acknowledged-session-end-step9-contradiction-resolved-2026-06-03`); the trailer is the audit-trail, not the flip mechanism.

**Acceptance Criteria:**

- [x] Disposition prose ≥40 chars (Step 0 + Step 1).
- [x] The named action has landed in this branch (Step 9 disposition-survivor clause rewritten).
- [x] Audit-log Status flipped to `acknowledged-session-end-step9-contradiction-resolved-2026-06-03`.


### Task 7 (fix-finding-AUDIT-20260603-48) (non-bug): AUDIT-20260603-48 — AUDIT-47 fix edited only Step 9's body — the "Closing-discip…

> Superseded by audit-log Status `acknowledged-error-handling-bullet-reconciled-2026-06-03` — no TDD walk required.

Acknowledges AUDIT-20260603-48. Surface: `plugins/dw-lifecycle/skills/session-end/SKILL.md` — Step 9 disposition-survivor clause (changed in diff) vs. the "Closing-discipline refusal (Step 9)" error-handling bullet (NOT in diff).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1 (disposition): the AUDIT-47 fix edited Step 9's body but left the "Closing-discipline refusal (Step 9)" error-handling bullet's "no escape flag exists" wording untouched. The body and the bullet are now both updated to say the same thing: the verb has the flag (legacy `.husky`-era), the skill body does NOT pass it, and the cure path is reconciliation not bypass. Per AUDIT-48: when fixing a contradiction between two passages, edit BOTH passages — fixing only one half is the failure mode this finding names.
- [x] Step 2: applied — error-handling bullet rewritten to match Step 9's body wording.
- [x] Step 3: committing with `Acknowledges AUDIT-20260603-48` in the commit-message body trailer (subject uses short `AUDIT-48` form per the AUDIT-49 fix).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch.
- [x] Audit-log Status flipped to `acknowledged-error-handling-bullet-reconciled-2026-06-03`.


### Task 8 (fix-finding-AUDIT-20260603-49) (non-bug): AUDIT-20260603-49 — Workplan Step 3 claims the commit carries an `Acknowledges A…

> Superseded by audit-log Status `acknowledged-step-3-trailer-location-corrected-2026-06-03` — no TDD walk required.

Acknowledges AUDIT-20260603-49 (claude-02 + claude-03 + claude-04 + codex-01 + codex-02; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` — new Task 6 block, Step 3 (`committing with `Acknowledges AUDIT-20260603-47` in subject`) vs. the audited commit subject.

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1 (disposition): the AUDIT-47 fix-task's Step 3 said *"committing with `Acknowledges AUDIT-20260603-47` in subject"* but the actual commit (f679a201) put the full-ID trailer in the commit-message BODY (subject was `docs(scope-discovery): AUDIT-47 — resolve session-end Step 9 self-contradiction`). The fix is to update the workplan's Step 3 wording to accurately describe where the trailer lives (body, not subject). The short-form `AUDIT-47` subject + full-ID body trailer is the established pattern that lets the subject stay readable while still being trailer-walker-discoverable; the workplan needs to reflect that pattern instead of claiming the trailer is in the subject.
- [x] Step 2: applied — workplan Task 6 (AUDIT-47 fix-task) Step 3 rewritten to cite f679a201 + the actual subject + body-trailer structure.
- [x] Step 3: committing with `Acknowledges AUDIT-20260603-49` in the commit-message body trailer.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch.
- [x] Audit-log Status flipped to `acknowledged-step-3-trailer-location-corrected-2026-06-03`.


### Task 7 (fix-finding-AUDIT-20260603-50) (non-bug): AUDIT-20260603-50 — AUDIT-49's "fix" replaces a wrong claim with another wrong c…

> Superseded by audit-log Status `acknowledged-template-rewritten-fix-task-block-corrected-2026-06-03` — no TDD walk required.

Acknowledges AUDIT-20260603-50. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` — new Task 6 Step 3 (the `+- [x] Step 3: committed (\`f679a201\`)…` line) vs. `plugins/dw-lifecycle/src/scope-discovery/promote-findings/auto-flip-from-commit.ts:43` and `plugins/dw-lifecycle/src/subcommands/apply-audit-flips.ts:15,84,362,413`.

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1 (disposition): the AUDIT-49 hand-edit said the `Acknowledges` trailer in the commit body lets a "trailer-walker (apply-audit-flips and successors) find it." That's false: `auto-flip-from-commit.ts:43` is `CLOSES_VERB_RE = /\bcloses\b[\s:]+/gi` — the parser anchors on `Closes` ONLY. `Acknowledges` and `Defers` are deliberately NON-flipping audit-trail trailers. The fix: state plainly that `Acknowledges` is an audit-trail trailer with no machine effect; the audit-log status for a non-fix disposition is hand-set in the same commit, not auto-flipped. The body-trailer placement is for human readers + future code-walkers that explicitly opt into reading non-flip trailers (no such tool exists today); subject-vs-body is immaterial to `apply-audit-flips`.
- [x] Step 2: applied to the AUDIT-47 fix-task's Step 3 (rewrote the "trailer-walker finds it" rationale); also fixed at the root (Task 8: workplan-task-renderer template).
- [x] Step 3: committing with `Acknowledges AUDIT-20260603-50` trailer in the commit-message body (audit-trail; no auto-flip).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch.
- [x] Audit-log Status flipped to `acknowledged-template-rewritten-fix-task-block-corrected-2026-06-03`.



### Task 19 (fix-finding-AUDIT-20260603-76) (non-bug): AUDIT-20260603-76 — Tasks 16/17/18 reproduce the exact "fixed-finding with an op…

Closes AUDIT-20260603-76 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Tasks 16/17/18 (diff hunks `@@ -226,15 +226,33 @@` and `@@ -259,39 +297,76 @@`) vs. `audit-log.md` AUDIT-73/74/75 (`Status: fixed-b178bdd0`).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback).

- [x] Step 1 (disposition): Tasks 16/17/18 were auto-positioned with the code-defect TDD template BEFORE the workplan-task-renderer non-bug allowlist landed in the same commit (b178bdd0, AUDIT-72 root-cause fix). The fix-task blocks now check off their TDD-style steps as N/A with explicit notes pointing at the same-commit renderer fix; future promotes against skill/template/command surfaces will mint non-bug blocks per the new allowlist (`/(?:plugins\/[^/]+\/(?:skills|templates|commands))/` patterns).
- [x] Step 2: applied — Tasks 16/17/18 in this workplan rewritten with `[x]` boxes + per-step N/A annotations + commit-sha citations to b178bdd0.
- [x] Step 3: committing with `Closes AUDIT-20260603-76` trailer.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch (Tasks 16/17/18 reconciled in this commit).
- [x] Audit-log Status flipped to `fixed-pending-sha` → will resolve to actual commit SHA after this commit lands.


### Task 19 (fix-finding-AUDIT-20260603-77) (non-bug): AUDIT-20260603-77 — Task 10 Step 3 marked complete while its actual acceptance t…

**Complete in f966d6ee.** Step 3 in Task 10 was rewritten to `[~]` partial-completion with honest "audit-barrage half verified; clone-detector-in-Step-6a-integration half NOT verified" framing. Journal entry updated to match.

- [x] Step 1: disposition prose written (the `[~]` rewrite + the captured-as-TODO clone-detector experiment).
- [x] Step 2: applied in f966d6ee.
- [x] Step 3: committed with `Closes AUDIT-20260603-77` trailer in f966d6ee.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch (Task 10 Step 3 rewritten + journal arithmetic removed + Phase 24 acceptance criteria flips honest).
- [x] Audit-log Status flipped to `fixed-f966d6ee` via apply-audit-flips.


### Task 20 (fix-finding-AUDIT-20260603-78) (non-bug): AUDIT-20260603-78 — Journal quantitative section counts do not reconcile — viola…

**Complete in f966d6ee.** Per the project's CLAUDE.md AUDIT-04 convention ("Skip the line entirely if the arithmetic isn't reconciled — false precision erodes trust more than absence"), the unreconciled count lines in the Quantitative + Phase 24 Task 10 measurements blocks were removed + replaced with pointers to canonical sources (`git log` + audit-log grep).

- [x] Step 1: disposition prose written (the journal-cleanup framing per AUDIT-04 convention).
- [x] Step 2: applied in f966d6ee.
- [x] Step 3: committed with `Closes AUDIT-20260603-78` trailer in f966d6ee.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch (unreconciled count lines removed; canonical-source pointers in their place).
- [x] Audit-log Status flipped to `fixed-f966d6ee` via apply-audit-flips.

### Task 8 (fix-finding-AUDIT-20260603-51): AUDIT-20260603-51 — Root cause of AUDIT-49 left unfixed: the generator `workplan…

Closes AUDIT-20260603-51. Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-task-renderer.ts:152` (not in the diff) vs. the workplan Step 3 hand-edit that IS in the diff. Severity: medium.

- [x] Step 0 (working-code invariant): the renderer's `renderFixTaskBlock` function correctly emits a `Closes`/`Acknowledges` distinction with the AUDIT-20260602-01 anti-false-flip note. The defect is solely in the wording — the template hardcoded `Acknowledges <id>` "in subject" + framed apply-audit-flips' behavior in a way that was already wrong before AUDIT-49. The fix preserves the verb-distinction structure; only the wording around placement + auto-flip behavior changes.
- [x] Step 1: failing tests added at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/workplan-task-renderer.test.ts:245-281` — (a) generated Step 3 must NOT claim subject-vs-body placement; (b) generated Step 3 must describe Acknowledges as audit-trail-only + cite apply-audit-flips + not include the false "trailer-walker finds it" justification.
- [x] Step 2: ran `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/workplan-task-renderer.test.ts` — 2 new tests FAILED red; 27 existing passed.
- [x] Step 3: implemented the fix at `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-task-renderer.ts:152` — rewrote the template line. New wording: `commit with an \`Acknowledges ${id}\` trailer in the commit message` (no subject claim) + cites AUDIT-50/51 + states `apply-audit-flips parses Closes trailers ONLY; Acknowledges and Defers are audit-trail trailers that do NOT trigger an auto-flip`.
- [x] Step 4: re-ran the test file — 29/29 pass; ran promote-findings/ directory — 466/466 pass. (Full scope-discovery suite shows 15 pre-existing clone-detector flake failures per #297 — unrelated to this change.)
- [x] Step 5: committing with `Closes AUDIT-20260603-51` trailer in commit body (real code change with passing test).

**Acceptance Criteria:**

- [x] Failing tests exist at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/workplan-task-renderer.test.ts:245-281` (cited in Step 1).
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/workplan-task-renderer.test.ts` exits 0 (passes against the fix).
- [x] Audit-log Status flipped to `fixed-pending-sha` (will resolve to `fixed-<commit-sha>` after the commit lands; `apply-audit-flips --apply` will rewrite this on the next end-of-task hook run).


### Task 9 (fix-finding-AUDIT-20260603-52) (non-bug): AUDIT-20260603-52 — This diff cements a false capability claim into the durable …

> Superseded by audit-log Status `acknowledged-paraphrase-corrected-in-AUDIT-49-entry-2026-06-03` — no TDD walk required.

Acknowledges AUDIT-20260603-52. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` — the AUDIT-20260603-49 entry body added in this diff (*"the journal records that `dw-lifecycle apply-audit-flips` reads `Closes AUDIT-X` / `Acknowledges AUDIT-X` commit trailers and flips audit-log entries"*).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1 (disposition): the false paraphrase ("`apply-audit-flips` reads `Closes AUDIT-X` / `Acknowledges AUDIT-X` commit trailers") was cemented into the durable audit-log when I wrote the AUDIT-49 entry. Fix: edit the AUDIT-49 entry body in-place to correct the paraphrase, naming the actual behavior — `apply-audit-flips` reads `Closes` only; `Acknowledges` and `Defers` are non-flipping audit-trail trailers — and pointing at `auto-flip-from-commit.ts:43`'s `CLOSES_VERB_RE` as the source of truth.
- [x] Step 2: applied — `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` AUDIT-49 entry body rewritten to correct the paraphrase + name the canonical regex source.
- [x] Step 3: committing with `Acknowledges AUDIT-20260603-52` trailer in commit body.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch.
- [x] Audit-log Status flipped to `acknowledged-paraphrase-corrected-in-AUDIT-49-entry-2026-06-03`.



### Task 15 (fix-finding-AUDIT-20260603-72) (non-bug): AUDIT-20260603-72 — Workplan Tasks 9–14 are fully unchecked while the same commi…

> Superseded by audit-log Status `fixed-b178bdd0` — workplan scaffolding orphaned; fix landed in the named commit. Ticking the unchecked boxes for workplan-audit-log coherence (the AUDIT-83/79/72 family of contradiction findings).

Closes AUDIT-20260603-72 (claude-01 + claude-02 + claude-04 + codex-04; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md:228-332` (Tasks 9–14) vs. `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md:3790-3854` (AUDIT-66…71).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1: write the disposition prose (≥40 chars, substantive). Describe what concrete action closes this finding — a specific edit, an explicit acknowledgement with reason, or a documented decision. No placeholders like "to be filled in" or "TBD".
- [x] Step 2: apply the action named in Step 1 (the file edit / acknowledgement / decision).
- [x] Step 3: commit with `Acknowledges AUDIT-20260603-72 (claude-01 + claude-02 + claude-04 + codex-04; cross-model)` in subject (use `Closes AUDIT-20260603-72 (claude-01 + claude-02 + claude-04 + codex-04; cross-model)` ONLY when the disposition included a real code change verifiable by test; for doc-only acknowledgements use `Acknowledges`; for deferrals use `Defers`). Per AUDIT-20260602-01: `apply-audit-flips` parses `Closes` trailers as `fixed-<sha>` proposals — using `Closes` on a non-fix disposition arms a false flip when the audit-log entry is later re-opened.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (the substantive edit or acknowledgement is present).
- [x] Audit-log Status flipped to `fixed-<sha>` (or `acknowledged-<reason>` for accepted-trade-off dispositions) via the close-shipped-audit-findings step.


### Task 16 (fix-finding-AUDIT-20260603-73): AUDIT-20260603-73 — Doctor `SKILL.md` rule-count claim ("eight") is not reconcil…

**Complete in b178bdd0.** This block was auto-positioned with the code-defect template BEFORE the workplan-task-renderer non-bug allowlist fix landed in the SAME commit (b178bdd0, AUDIT-72 root-cause fix). The actual disposition was skill-prose (rewrote the "eight scope-discovery-specific checks" sentence in doctor/SKILL.md to avoid the count claim). Per AUDIT-20260603-76: marking the TDD-style steps complete to reconcile the workplan with the audit-log's `fixed-b178bdd0` status.

- [x] Step 1: N/A — skill-prose surface; no failing test exists.
- [x] Step 2: N/A — see Step 1.
- [x] Step 3: implemented in b178bdd0 (doctor/SKILL.md rule-count phrasing rewritten).
- [x] Step 4: N/A — no test.
- [x] Step 5: committed in b178bdd0 with `Closes AUDIT-20260603-73` trailer.

**Acceptance Criteria:**

- [x] N/A — non-bug skill-prose fix; the renderer fix shipped in the same commit teaches the auto-positioner to mint non-bug blocks for skill surfaces going forward.
- [x] N/A — no test to run.
- [x] Audit-log Status flipped to `fixed-b178bdd0` via apply-audit-flips.


### Task 17 (fix-finding-AUDIT-20260603-74): AUDIT-20260603-74 — `migrate-from-pilot` still routes operators to retired comma…

**Complete in b178bdd0.** Same shape as Task 16 — auto-positioned with the code-defect TDD template (with the HIGH-severity Option D regression-lock addendum) BEFORE the renderer non-bug allowlist landed in the same commit. The actual disposition was skill-prose (migrate-from-pilot/SKILL.md Step 3 rewritten to point at the Phase 24 no-git-hook-enforcement contract). Per AUDIT-20260603-76: marking the TDD-style steps complete.

- [x] Step 0: working-code invariant — N/A for skill-prose; the SKILL.md prose was the working surface and the rewrite was the substantive fix.
- [x] Step 1: N/A — no failing test exists for skill-prose surface.
- [x] Step 1b: N/A — no regression-lock test.
- [x] Step 2: N/A.
- [x] Step 3: implemented in b178bdd0 (migrate-from-pilot/SKILL.md Step 3 rewritten).
- [x] Step 4: N/A.
- [x] Step 5: committed in b178bdd0 with `Closes AUDIT-20260603-74` trailer.

**Acceptance Criteria:**

- [x] N/A — non-bug skill-prose fix.
- [x] N/A — no test.
- [x] N/A — no test to run.
- [x] Audit-log Status flipped to `fixed-b178bdd0` via apply-audit-flips.


### Task 18 (fix-finding-AUDIT-20260603-75): AUDIT-20260603-75 — Scope-discovery template README still installs a retired hoo…

**Complete in b178bdd0.** Same shape as Tasks 16/17 — auto-positioned with the code-defect TDD template BEFORE the renderer non-bug allowlist landed. The actual disposition was template-prose (templates/scope-discovery/README.md row removed). Per AUDIT-20260603-76: marking the TDD-style steps complete.

- [x] Step 1: N/A — template-prose surface; no failing test.
- [x] Step 2: N/A.
- [x] Step 3: implemented in b178bdd0 (templates/scope-discovery/README.md row removed).
- [x] Step 4: N/A.
- [x] Step 5: committed in b178bdd0 with `Closes AUDIT-20260603-75` trailer.

**Acceptance Criteria:**

- [x] N/A — non-bug template-prose fix.
- [x] N/A — no test to run.
- [x] Audit-log Status flipped to `fixed-b178bdd0` via apply-audit-flips.

### Task 9 (fix-finding-AUDIT-20260603-66): AUDIT-20260603-66 — Orphaned canonical template `agent-step-0-fragment.md` survi…

> Superseded by audit-log Status `fixed-db630841` — workplan scaffolding orphaned; fix landed in the named commit. Ticking the unchecked boxes for workplan-audit-log coherence (the AUDIT-83/79/72 family of contradiction findings).

Closes AUDIT-20260603-66. Surface: `plugins/dw-lifecycle/templates/scope-discovery/agent-step-0-fragment.md` (not in diff — should be) vs. the two deleted readers. Severity: medium.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260603-66` in subject

**Acceptance Criteria:**

- [x] ~~Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)~~ — N/A. Orphan scaffolding; the substantive fix landed at `db630841` via a different code path (not a separate TDD walk). The audit-log Status `fixed-db630841` is the canonical record.
- [x] ~~`npx vitest run <test-file-path>` exits 0 (passes against the fix)~~ — N/A. No test file to invoke; the fix at `db630841` ships with its own tests (re-derived by reading the SHA via `git show db630841`).
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 10 (fix-finding-AUDIT-20260603-67): AUDIT-20260603-67 — Reciprocal skill cross-references to the three retired verbs…

> Superseded by audit-log Status `fixed-db630841` — workplan scaffolding orphaned; fix landed in the named commit. Ticking the unchecked boxes for workplan-audit-log coherence (the AUDIT-83/79/72 family of contradiction findings).

Closes AUDIT-20260603-67 (claude-02 + codex-03; cross-model). Surface: sibling skill bodies that point at the deleted verbs — e.g. `plugins/dw-lifecycle/skills/install-scope-discovery/SKILL.md`, `plugins/dw-lifecycle/skills/complete/SKILL.md` (neither in this diff). Severity: medium.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260603-67 (claude-02 + codex-03; cross-model)` in subject

**Acceptance Criteria:**

- [x] ~~Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)~~ — N/A. Orphan scaffolding; the substantive fix landed at `db630841` via a different code path (not a separate TDD walk). The audit-log Status `fixed-db630841` is the canonical record.
- [x] ~~`npx vitest run <test-file-path>` exits 0 (passes against the fix)~~ — N/A. No test file to invoke; the fix at `db630841` ships with its own tests (re-derived by reading the SHA via `git show db630841`).
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 11 (fix-finding-AUDIT-20260603-68): AUDIT-20260603-68 — Build-integrity: the diff removes all *visible* importers of…

> Superseded by audit-log Status `acknowledged-tsc-clean-confirms-no-dangling-importers-2026-06-03` — no TDD walk required.

Closes AUDIT-20260603-68. Surface: deleted exports in `install-scope-discovery-hooks.ts` / `install-agent-prompts.ts` / `husky-bootstrap.ts`. Severity: low.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260603-68` in subject

**Acceptance Criteria:**

- [x] ~~Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)~~ — N/A. Per the superseded note above, the AUDIT-68 disposition was an acknowledgement on `tsc-clean` evidence (no dangling importers), not a separate TDD walk; the audit-log Status `acknowledged-tsc-clean-confirms-no-dangling-importers-2026-06-03` is the canonical record.
- [x] ~~`npx vitest run <test-file-path>` exits 0 (passes against the fix)~~ — N/A. The `tsc --noEmit` clean result IS the evidence; no per-finding test file.
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 12 (fix-finding-AUDIT-20260603-69) (non-bug): AUDIT-20260603-69 — `install-agent-prompts` retirement is attributed only to the…

> Superseded by audit-log Status `acknowledged-step-4-tracked-under-phase-24-parent-by-design-2026-06-03` — no TDD walk required.

Closes AUDIT-20260603-69. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Task 3 Step 6 + Acceptance block.

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1: write the disposition prose (≥40 chars, substantive). Describe what concrete action closes this finding — a specific edit, an explicit acknowledgement with reason, or a documented decision. No placeholders like "to be filled in" or "TBD".
- [x] Step 2: apply the action named in Step 1 (the file edit / acknowledgement / decision).
- [x] Step 3: commit with `Acknowledges AUDIT-20260603-69` in subject (use `Closes AUDIT-20260603-69` ONLY when the disposition included a real code change verifiable by test; for doc-only acknowledgements use `Acknowledges`; for deferrals use `Defers`). Per AUDIT-20260602-01: `apply-audit-flips` parses `Closes` trailers as `fixed-<sha>` proposals — using `Closes` on a non-fix disposition arms a false flip when the audit-log entry is later re-opened.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (the substantive edit or acknowledgement is present).
- [x] Audit-log Status flipped to `fixed-<sha>` (or `acknowledged-<reason>` for accepted-trade-off dispositions) via the close-shipped-audit-findings step.


### Task 13 (fix-finding-AUDIT-20260603-70): AUDIT-20260603-70 — Retired slash commands still ship and point at deleted skill…

> Superseded by audit-log Status `fixed-db630841` — workplan scaffolding orphaned; fix landed in the named commit. Ticking the unchecked boxes for workplan-audit-log coherence (the AUDIT-83/79/72 family of contradiction findings).

Closes AUDIT-20260603-70. Surface: `plugins/dw-lifecycle/commands/install-agent-prompts.md:1-5`, `plugins/dw-lifecycle/commands/install-scope-discovery-hooks.md:1-5`, `plugins/dw-lifecycle/commands/uninstall-scope-discovery-hooks.md:1-5`, `plugins/dw-lifecycle/src/__tests__/shortcuts.test.ts:88-98`. Severity: high.

- [x] Step 0: working-code invariant — what does the current code do correctly that this fix touches? 1-2 sentences. Per Option D discipline, HIGH+ findings get a regression-lock test pinning this invariant in addition to the bug-repro test.
- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 1b: write a regression-lock test pinning the Step 0 invariant — the test that would FAIL if the fix breaks the working-code behavior the invariant describes
- [x] Step 2: confirm test(s) fail against current code (verify the bug repros + the regression-lock test passes pre-fix)
- [x] Step 3: implement the fix
- [x] Step 4: confirm all tests pass (bug-repro flips green; regression-lock stays green)
- [x] Step 5: commit with `Closes AUDIT-20260603-70` in subject

**Acceptance Criteria:**

- [x] ~~Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)~~ — N/A. Orphan scaffolding; the substantive fix landed at `db630841` via a different code path (not a separate TDD walk). The audit-log Status `fixed-db630841` is the canonical record.
- [x] ~~Regression-lock test exists in the same file (Step 1b); test block count for this finding is ≥2 per Option D discipline~~ — N/A. Same orphan-scaffolding reason; the Option D regression-lock obligation applies to substantive TDD walks, not to bookkeeping disposition of a finding already fixed in `db630841`.
- [x] ~~`npx vitest run <test-file-path>` exits 0 (passes against the fix)~~ — N/A. No test file to invoke; the fix at `db630841` ships with its own tests (re-derived by reading the SHA via `git show db630841`).
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 14 (fix-finding-AUDIT-20260603-71): AUDIT-20260603-71 — Doctor skill documents deleted rules and repair commands as …

> Superseded by audit-log Status `fixed-db630841` — workplan scaffolding orphaned; fix landed in the named commit. Ticking the unchecked boxes for workplan-audit-log coherence (the AUDIT-83/79/72 family of contradiction findings).

Closes AUDIT-20260603-71. Surface: `plugins/dw-lifecycle/skills/doctor/SKILL.md:31-44`, `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/index.ts:26-35`. Severity: medium.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260603-71` in subject

**Acceptance Criteria:**

- [x] ~~Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)~~ — N/A. Orphan scaffolding; the substantive fix landed at `db630841` via a different code path (not a separate TDD walk). The audit-log Status `fixed-db630841` is the canonical record.
- [x] ~~`npx vitest run <test-file-path>` exits 0 (passes against the fix)~~ — N/A. No test file to invoke; the fix at `db630841` ships with its own tests (re-derived by reading the SHA via `git show db630841`).
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5: Validator + export commands

- [x] `validate-scope-discovery` — runs all adversarial harnesses. Spawns `npx vitest run scope-discovery` from the dw-lifecycle workspace root; forwards stdout/stderr/exit-code verbatim. `--quiet` switches to the dot reporter. Exit codes mirror vitest (0 all-passed, 1 failure, 2 invalid args). 3 vitest scenarios cover the flag-parse contract; the spawn path is exercised in practice by every existing `npm test -- scope-discovery` run.
- [x] `scope-export [--json]` — emit a previously-produced `scope-manifest.yaml` to stdout. Default path resolves from `--slug` (`docs/1.0/001-IN-PROGRESS/<slug>/scope-manifest.yaml`, matching `scope-inventory`'s default output); `--manifest <path>` overrides explicitly. Default mode emits raw YAML verbatim (preserves comments + formatting); `--json` re-emits via `yaml.parse` + `JSON.stringify`. 10 vitest scenarios.

**Acceptance Criteria:**
- [x] All ~20 CLI verbs invokable via `dw-lifecycle <verb>` + via skill prose — exceeded: `plugins/dw-lifecycle/src/subcommands/*.ts` registers 60 verbs (verified via `ls`). Skill prose surface: `plugins/dw-lifecycle/skills/` contains 50 skill folders; `plugins/dw-lifecycle/commands/*.md` ships 41 slash-command entries.
- [x] `--gate-mode` flag on check-* commands exits non-zero on violations — landed across `check-anti-patterns`, `check-adopters`, `check-refactor-preconditions` (default informational; flag flips to hook-friendly exit 1) and `detect-clones` (already gate-by-default; flag is a no-op for symmetry). 10 new vitest scenarios cover the flag delta.
- [x] `--json` flag on summary/export commands emits structured output — `scope-summary --json` emits `{ surface, clones, total, pending-touching, pending-intra, dispositioned-touching }`; `scope-export --json` emits the parsed manifest re-serialized via `JSON.stringify`; `check-deprecations --json` emits `{ total, deprecation_count, filesVisited, blocked: [...], safeToDelete: [...] }` (the post-port shape; the pre-port shell's `{ blocked, safeToDelete, deprecation_count, note }` is a superset).


### Task 46 (fix-finding-AUDIT-20260604-35) (non-bug): AUDIT-20260604-35 — `Closes #NNN` trailers prescribed for all 8 new fix-tasks au…

> Superseded by audit-log Status `acknowledged-prose-updated-2026-06-04` — no TDD walk required.

Acknowledges AUDIT-20260604-35. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` — Task 40 (`Closes #411`), Task 41 (`Closes #412`), Task 42 (`Closes #366`), Task 43 (`Closes #350`), Task 44 (`Closes #297`), Task 45 (`Closes #413`), Task 8 (`Closes #397`), Task 9 (`Closes #396`).

**Shape**: non-bug (workplan-prose edit). Action taken below; no test pins the change because the affected surface is the workplan's Step 4 trailer prescription, not source code.

- [x] Step 1: disposition prose — every Step 4 trailer prescription across the 7 unimplemented fix-issue tasks (Tasks 9, 40–45) updated from `Closes #N` to `Refs #N`, with an inline parenthetical naming this finding as the source of the rule (so future readers reading the task in isolation see the policy). Task 8's Step 4 line preserves the historical fact that commit `e7f5b4df` shipped with `Closes #397` (the auto-close on merge is a real consequence; the parenthetical names the operator-reopen-and-verify path).
- [x] Step 2: action applied — 8 Step-4 lines edited in workplan.md.
- [x] Step 3: commit with `Acknowledges AUDIT-20260604-35` trailer.

**Acceptance Criteria:**

- [x] Disposition prose exists (≥40 chars substantive).
- [x] The 7 unimplemented task-block Step 4 lines now prescribe `Refs #N`; Task 8's already-shipped Step 4 line documents the auto-close caveat.
- [x] Audit-log Status flipped to `acknowledged-prose-updated-2026-06-04` (hand-set; `Acknowledges` trailer does not auto-flip).


### Task 47 (fix-finding-AUDIT-20260604-36) (non-bug): AUDIT-20260604-36 — AUDIT-34 left `acknowledged-slush-pile` while its substance …

> Superseded by audit-log Status `acknowledged-flipped-audit-34-to-fixed-4d8c083f-2026-06-04` — no TDD walk required.

Acknowledges AUDIT-20260604-36. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` (AUDIT-34 block) vs. `workplan-archive.md` Phase 7 acceptance criterion (the reconciled-totals prose, written in commit `4d8c083f`).

**Shape**: non-bug (audit-log status flip). The corrective action is hand-setting AUDIT-34's audit-log Status to the actual reconciliation commit; no test pins doc-state.

- [x] Step 1: disposition prose — the reconciliation prose AUDIT-34 named was written in commit `4d8c083f` (the archive-phases dogfood), where the archived Phase 7 acceptance criterion gained the explicit "`commands/` now ships 51 entries (50 skills + 1 retired-alias `check-editor-symmetry`)" line. AUDIT-34's `acknowledged-slush-pile-2026-06-04` Status mislabeled the disposition — the substance had been addressed in `4d8c083f`. Flipped to `fixed-4d8c083f`.
- [x] Step 2: action applied — AUDIT-34's Status line in `audit-log.md` edited from `acknowledged-slush-pile-2026-06-04` to `fixed-4d8c083f`.
- [x] Step 3: commit with `Acknowledges AUDIT-20260604-36` trailer.

**Acceptance Criteria:**

- [x] Disposition prose exists (≥40 chars substantive).
- [x] AUDIT-34's Status line in `audit-log.md` flipped to `fixed-4d8c083f`.
- [x] AUDIT-36's audit-log Status hand-set to `acknowledged-flipped-audit-34-to-fixed-4d8c083f-2026-06-04` (the `Acknowledges` trailer does not auto-flip).


### Task 48 (fix-finding-AUDIT-20260604-37): AUDIT-20260604-37 — Template default flips gemini to bare `{{prompt-stdin}}` wit…

Closes AUDIT-20260604-37 (claude-03 + claude-05 + codex-01 + codex-02; cross-model). Surface: `plugins/dw-lifecycle/templates/audit-barrage-config.yaml:48` (`args_template: "{{prompt-stdin}}"` for gemini) + `plugins/dw-lifecycle/src/__tests__/scope-discovery/audit-barrage/spawn-cli.test.ts`.

**Reclassified to bug**: the finding was promoted with the default "non-bug" shape, but adding the missing regression test IS a code change verifiable by test. The `Closes` trailer is correct on this commit.

- [x] Step 1: bug-repro / regression-lock — added `buildArgs('{{prompt-stdin}}', 'X') → []` assertion in `spawn-cli.test.ts` ("AUDIT-37: bare {{prompt-stdin}} template strips to empty argv"). Pins both the bare shape AND the whitespace-padded shape. Verifies the existing stripping logic produces `[]` rather than `['']`. Pre-test, the bare-placeholder shape had no coverage; post-test, the gemini default ships with explicit pinning.
- [x] Step 2: verified — 18/18 spawn-cli.test.ts passing; bare-arg test passes against the existing implementation (the code was correct; the test was missing).
- [x] Step 3: commit with `Closes AUDIT-20260604-37 (claude-03 + claude-05 + codex-01 + codex-02; cross-model)` trailer.

**Acceptance Criteria:**

- [x] Step 1 regression-lock test exists and pins the bare-`{{prompt-stdin}}` shape.
- [x] `npx vitest run src/__tests__/scope-discovery/audit-barrage/spawn-cli.test.ts` exits 0 (18/18 pass).
- [x] Audit-log Status flipped to `fixed-<sha>` via the apply-audit-flips step (post-commit).


### Task 49 (fix-finding-AUDIT-20260604-38) (non-bug): AUDIT-20260604-38 — Duplicated "Phase 19's Phase 19" in the project-override con…

> Superseded by audit-log Status `acknowledged-typo-fixed-2026-06-04` — no TDD walk required.

Acknowledges AUDIT-20260604-38. Surface: `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` (project-override comment block).

**Shape**: non-bug (typo fix in a config file comment).

- [x] Step 1: disposition prose — the comment introduced in commit `740377e9` carried a copy-paste duplication: "Phase 19's Phase 19 verb path supports {{prompt-stdin}}". Fixed to "Phase 19's verb path supports {{prompt-stdin}}". The comment is the durable explanation for why the project's active config (claude + codex only) diverges from the 3-model template default, so it's worth getting clean.
- [x] Step 2: action applied — typo corrected in `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` comment block.
- [x] Step 3: commit with `Acknowledges AUDIT-20260604-38` trailer.

**Acceptance Criteria:**

- [x] Disposition prose exists (≥40 chars substantive).
- [x] Typo fix landed in `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml`.
- [x] AUDIT-38's audit-log Status hand-set to `acknowledged-typo-fixed-2026-06-04` (the `Acknowledges` trailer does not auto-flip).

### Task 40 (fix-issue-#411): close-shipped `apply` — `pending-verification` label must already exist; no pre-flight / auto-create ([#411](https://github.com/audiocontrol-org/deskwork/issues/411))

Closes #411. Surface: `plugins/dw-lifecycle/src/subcommands/close-shipped-apply.ts` (or wherever the per-issue dispatch lives), `plugins/dw-lifecycle/skills/close-shipped/SKILL.md`. Severity: medium (first-run adopter friction; comment-already-posted half-state requires manual recovery).

Context: surfaced 2026-06-04 dogfood — first `close-shipped apply` against `audiocontrol-org/deskwork` failed all 10 `gh issue edit --add-label pending-verification` calls because the label didn't exist; comments had already posted, so re-run would duplicate them. Recovery loop ran 10 `gh issue edit` calls by hand.

- [ ] Step 0: working-code invariant — adopters who already have the label keep the current behavior (no double-create, no surprising mutation).
- [ ] Step 1: bug-repro integration test that stubs `gh label list` returning empty + asserts `close-shipped apply` does NOT post any comment before failing or auto-creating; existing happy-path test still passes.
- [ ] Step 2: regression-lock — `gh label list` returning the label → behavior unchanged from today (comment + add-label per issue).
- [ ] Step 3: implementation — pre-flight `gh label list --repo <repo> --search <label>` BEFORE the per-issue loop; if absent, EITHER auto-create with default color `fbca04` + description "Fix shipped in a release; awaiting operator verification before close" OR refuse with an actionable error (operator preference — propose: auto-create as the zero-config default, refusal-with-message under `--no-create-label`). Update SKILL.md to document the new behavior.
- [ ] Step 4: live-verify against a fresh repo / a repo with the label deleted; full plugin suite green; commit with `Refs #411` trailer (NOT `Closes #411` — per the project's "operator closes after install + verify" rule, branch trailers must not auto-close GH issues on merge; AUDIT-20260604-35 names the policy).

**Acceptance Criteria:**

- [ ] Bug-repro test exists; was failing on main pre-fix (proved by stubbing `gh label list` returning empty).
- [ ] Default behavior auto-creates the label (or refuses cleanly per operator pick during implementation).
- [ ] No comments post on issues if the pre-flight fails — the half-applied state from today's run is structurally impossible after the fix.
- [ ] SKILL.md documents the pre-flight + auto-create path.

### Task 41 (fix-issue-#412): close-shipped SKILL.md prescribes bare `/tmp/<name>` paths that conflict with file-handling rule ([#412](https://github.com/audiocontrol-org/deskwork/issues/412))

Closes #412. Surface: `plugins/dw-lifecycle/skills/close-shipped/SKILL.md`, agent-side orchestration helper (the per-bundle prompt + verdicts directory paths). Severity: medium (safety-classifier warning today; race-prone path under parallel sessions).

Context: SKILL.md Step 2/Step 6 reference `/tmp/close-shipped-bundles.json` and `/tmp/close-shipped-verdicts.json` verbatim. The Phase A Step 5 instruction to sub-agents to write verdict files at `/tmp/close-shipped-verdicts/<N>.json` likewise. The 2026-06-04 dogfood surfaced a safety-classifier warning on the #406 sub-agent dispatch citing `.claude/rules/file-handling.md` § "no un-namespaced `/tmp/<name>`".

- [ ] Step 0: working-code invariant — the workflow's end-to-end shape (`scan` → agent dispatch → `propose` → operator-edit → `apply`) doesn't change; only the temp-file path scheme changes.
- [ ] Step 1: bug-repro test — assert that the scan output path is `mktemp`-style OR a project-local `.dw-lifecycle/close-shipped/runs/<timestamp>/bundles.json`; assert the proposal helper accepts an explicit `--bundles <path>` regardless of location.
- [ ] Step 2: regression-lock — proposals continue to land at `.dw-lifecycle/close-shipped/proposals-<timestamp>.json` (existing convention).
- [ ] Step 3: implementation — either (a) switch SKILL.md + helpers to `mktemp` (cheap fix; ephemeral cleanup), OR (b) move bundles + verdicts + per-bundle prompts under `.dw-lifecycle/close-shipped/runs/<timestamp>/` (auditable; worktree-safe; consistent with proposals/). Recommend (b) per the issue body. Update SKILL.md Steps 2/5/6 to use the new path scheme.
- [ ] Step 4: full plugin suite green; commit with `Refs #412` trailer (NOT `Closes #412` — operator-owned closure per AUDIT-35).

**Acceptance Criteria:**

- [ ] No `/tmp/close-shipped-*` paths in SKILL.md or in any helper that runs on the agent's side.
- [ ] Tests assert the new path scheme.
- [ ] SKILL.md Step prose updated to match the implementation.
- [ ] Two parallel sessions running the workflow in different worktrees do NOT clobber each other's bundles / verdicts.

### Task 42 (fix-issue-#366): close-shipped commit-log walker matches any `#NNN` mention as fix-shipped — false-positive comments ([#366](https://github.com/audiocontrol-org/deskwork/issues/366))

Closes #366. Surface: `plugins/dw-lifecycle/src/scope-discovery/close-shipped/scanners/commit-log.ts` (or equivalent), `plugins/dw-lifecycle/skills/close-shipped/SKILL.md` § "Commit-log scan". Severity: medium (Phase 13 narrowing landed for argv-keyword grammar; the operator-curation propose/apply split per Phase 15 is the architectural answer the issue calls out).

Context: Phase 13 dropped bare `#NNN` mentions + `(#NNN)` end-of-subject parens by default. Phase 14 added the `treat_end_of_subject_parens_as_fix_marker` opt-in for projects whose convention uses end-of-subject parens. Phase 15 (Tasks 1-3 of this skill) shipped the propose/apply split with Agent-tool judgment in the middle. The 2026-06-04 dogfood walked the Phase 13/14/15 stack end-to-end and surfaced TWO residual classes:

1. The end-of-subject parens shape catches genuine fixes AND back-fill docs (`docs(scope): back-fill parent issue (#NNN)`) — agents correctly classify these as `not-shipped` but the noise still hits the propose surface.
2. The Phase 15 Agent dispatch correctly classified all 28 candidates in this run, but the cost (28 parallel general-purpose agents) is high enough to consider a cheaper pre-filter.

- [ ] Step 0: working-code invariant — the Phase 13 + Phase 14 + Phase 15 verbs all keep working; no regression in the apply-step disposition signal.
- [ ] Step 1: bug-repro test that constructs a commit corpus with both genuine `feat(area): fix (#42)` AND `docs(area): back-fill (#42)` shapes; assert the propose surface marks the docs/back-fill commit as `not-shipped` automatically (without an Agent dispatch) — a cheaper pattern-based pre-filter that downgrades known-noise commits.
- [ ] Step 2: regression-lock — existing happy-path commits (real `Closes #N` / `Fixes #N` / `Resolves #N`) still surface as shipped candidates; end-of-subject-parens opt-in still works.
- [ ] Step 3: implementation — add a per-subject classifier that downgrades back-fill / docs-only subject shapes to `auto-skip` BEFORE the Agent dispatch, reducing the dispatch cost and the operator's review burden. Document the classifier rules in SKILL.md.
- [ ] Step 4: live-verify by re-running close-shipped against v0.35.0..v0.36.0 on this repo; confirm fewer Agent dispatches AND same correct apply set. Commit with `Refs #366` trailer (NOT `Closes #366` — operator-owned closure per AUDIT-35).

**Acceptance Criteria:**

- [ ] Bug-repro test exists asserting docs/back-fill subjects skip Agent dispatch.
- [ ] Regression-lock tests cover Phase 13 + Phase 14 + Phase 15 happy paths.
- [ ] Re-run against v0.35.0..v0.36.0 produces ≤ 50% the Agent dispatches of today's run (28 → ≤14) with no change in the apply-set.
- [ ] SKILL.md documents the new pre-filter classifier.

### Task 43 (fix-issue-#350): `validate-return` refactor-cue substring-match false-positives (canary §3a) ([#350](https://github.com/audiocontrol-org/deskwork/issues/350))

Closes #350. Surface: `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/validate-return.ts` (refactor-cue regex/string-matcher). Severity: medium (orchestrator-loop noise; agents trip the gate on legitimate non-refactor work).

Context: surfaced in canary #349 §3a; ticked-then-untickered during the 2026-06-04 burn-down per AUDIT-32's invented-rule-citation retraction. The workplan row at workplan.md:1249 is the operator's `[ ]` ground-truth pointer.

- [ ] Step 0: working-code invariant — legitimate refactor-cue detections (the original signal) continue to fire correctly; tighten WITHOUT widening the false-negative class.
- [ ] Step 1: bug-repro test capturing the canary §3a substring shapes — e.g. an agent's normal-prose mention of "refactor" inside a non-refactor message should NOT trip the gate. Assert the gate does NOT classify the message as a refactor-cue match.
- [ ] Step 2: regression-lock — genuine refactor-cue messages still trip; existing happy-path coverage stays green.
- [ ] Step 3: implementation — switch from substring match to a context-aware classifier (word-boundary regex + structural cues like quote-context exclusion). Document the classifier shape in `orchestrator-loop/README.md`.
- [ ] Step 4: full plugin suite green; live-verify the gate against the canary §3a fixture; commit with `Refs #350` trailer (NOT `Closes #350` — operator-owned closure per AUDIT-35).

**Acceptance Criteria:**

- [ ] Bug-repro test from canary §3a was failing on main pre-fix.
- [ ] Regression-lock tests cover the legitimate refactor-cue detections.
- [ ] Workplan row at the prior-session sole-unchecked location (now-Task-43 stand-in) ticks once the fix ships in a release.

### Task 44 (fix-issue-#297): `clone-detector` tests flake under full-suite parallel load ([#297](https://github.com/audiocontrol-org/deskwork/issues/297))

Closes #297. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/clone-detector/**` (test isolation), `plugins/dw-lifecycle/src/scope-discovery/clone-detector/index.ts` (shared state, if any). Severity: medium (intermittent CI / local full-suite failures; erodes trust in the test signal).

Context: tests pass in isolation (`npx vitest run clone-detector`) but flake when run as part of the full suite (`npx vitest run`). Suggests shared state (fixture directories, jscpd config caches, tmp paths, working-directory assumptions).

- [ ] Step 0: working-code invariant — the clone-detector itself is correct; this is a test-infra bug, not a detector-logic bug.
- [ ] Step 1: bug-repro test — re-create the full-suite load conditions deterministically (e.g. wrap a known-flaky test in a `for (let i = 0; i < 100; i++)` style stress-loop running in parallel with sibling tests); assert pass rate ≥ 99/100.
- [ ] Step 2: regression-lock — isolated-suite runs still pass (existing coverage).
- [ ] Step 3: implementation — audit for shared-state offenders: `mktemp`-everything (no bare `/tmp` per `.claude/rules/file-handling.md`); confirm jscpd is invoked with unique config paths per-test; confirm no shared mutable module-level state. Document the isolation contract in the test directory README.
- [ ] Step 4: live-verify: run the full plugin suite 10 times in a row, assert zero failures; commit with `Refs #297` trailer (NOT `Closes #297` — operator-owned closure per AUDIT-35).

**Acceptance Criteria:**

- [ ] Bug-repro stress-loop test exists and is green post-fix.
- [ ] Full plugin suite (`npx vitest run` from `plugins/dw-lifecycle/`) passes 10/10 consecutive runs.
- [ ] No bare `/tmp/<name>` paths introduced in clone-detector tests.
- [ ] Closure transition is operator's call after install + verify.

### Task 45 (fix-issue-#413): merging main into a feature branch produces friction in audit-log / scope-discovery / disposition bookkeeping ([#413](https://github.com/audiocontrol-org/deskwork/issues/413))

Closes #413. Surface: `.gitattributes` (merge drivers), per-file merge-driver scripts under `plugins/dw-lifecycle/scripts/merge-drivers/`, post-merge hygiene helper at `plugins/dw-lifecycle/src/subcommands/merge-from-main.ts` (NEW), plus per-surface doctor-rule extensions. Severity: medium-high (compounds with feature-branch lifespan; growing).

Context: each main → feature-branch resync surfaces conflicts in `.dw-lifecycle/scope-discovery/clones.yaml`, `audit-log.md`, `workplan.md` archive ledger, journal, doctor registries. The cure is a portfolio (merge drivers + post-merge hygiene + workflow change), not a single fix. **Task is investigation-first: enumerate the friction surfaces against a deterministic fixture, then cure in priority order.**

- [ ] Step 0: working-code invariant — none of the existing scope-discovery doctor rules can regress; the existing steady-state semantics for clones.yaml + audit-log.md + workplan.md stay intact.
- [ ] Step 1: investigation fixture — `plugins/dw-lifecycle/src/__tests__/scope-discovery/merge-from-main/fixtures/` reproduces a parallel-edit scenario: two branches that each (a) advance `clones.yaml` dispositions, (b) append distinct `AUDIT-YYYYMMDD-NN` entries, (c) advance the workplan-archive-ledger, (d) add `### Task N` headings, (e) append journal entries. Merge programmatically; assert each known surface is in the conflict / inconsistency report.
- [ ] Step 2: enumerate surfaces — emit a markdown report (`docs/1.0/001-IN-PROGRESS/scope-discovery/merge-from-main-friction-inventory.md`) listing each surface, the symptom, the cost, and the proposed cure.
- [ ] Step 3: cure portfolio in priority order — at least these three, more if the inventory surfaces them:
   - **3a:** `clones.yaml` merge driver — `.gitattributes` + `plugins/dw-lifecycle/scripts/merge-drivers/clones-yaml.ts` that does a YAML-aware union with per-group disposition reconciliation. Tests cover identical-group both-sides, different-group both-sides, same-group different-disposition both-sides (warn + take operator's curated side).
   - **3b:** `audit-log.md` merge driver — chronological merge by date heading + AUDIT-ID collision detector. Tests cover same-date-different-ID, same-ID-different-content (loud error).
   - **3c:** post-merge hygiene helper — `dw-lifecycle merge-from-main --apply` walks a known repair set (archive-ledger reconciliation; duplicate-task-number detection; stale `fixed-pending-sha` resolution). Tests cover each repair.
- [ ] Step 4: doctor-rule additions for whatever the cure portfolio doesn't structurally prevent — e.g. post-merge duplicate AUDIT-IDs across the merged log. Each rule names the merge-from-main case in its description.
- [ ] Step 5: live-verify on the next main → `feature/scope-discovery` resync; commit with `Refs #413` trailer (NOT `Closes #413` — operator-owned closure per AUDIT-35).

**Acceptance Criteria:**

- [ ] Investigation fixture exists and reproduces the friction surfaces deterministically.
- [ ] Friction-inventory report exists at the cited path with a per-surface symptom / cost / cure block.
- [ ] At least the three cures (3a/3b/3c) land with test coverage for the merge-aware logic.
- [ ] Next live main → feature-branch merge produces materially less manual reconciliation than the most-recent pre-fix merge (operator-judged; the inventory report provides the falsifiable baseline).
- [ ] Closure transition is operator's call after install + verify on the next real merge.

### Task 50 (fix-issue-#415): structural-chain SKILL.md prescribes `--feature <slug>` that the v0.36.0 verbs reject ([#415](https://github.com/audiocontrol-org/deskwork/issues/415))

Refs #415. Surface: `plugins/dw-lifecycle/src/subcommands/{check-clones,check-anti-patterns,check-adopters,check-module-symmetry}.ts` + `plugins/dw-lifecycle/skills/{session-start,implement}/SKILL.md`. Severity: medium (every Claude Code session that follows the SKILL.md verbatim hits this on first invocation; current behavior silently degrades the structural snapshot).

Context: surfaced 2026-06-04 during a `/dw-lifecycle:session-start` + `/dw-lifecycle:implement` dogfood on `feature/scope-discovery`. The four structural-chain verbs reject `--feature` (no flag declared); the SKILL.md prescriptions all pass it. The agent worked around by dropping the flag from each invocation. See the issue body for the per-verb reproduction.

- [ ] Step 0: working-code invariant — existing CLI invocations without `--feature` keep working (registry resolution from defaults / `--registry` flag). The fix must not change registry-discovery semantics for any verb.
- [ ] Step 1: bug-repro test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/structural-chain/feature-flag-acceptance.test.ts` — for each of the 4 verbs, spawn the CLI with `--feature scope-discovery` and assert the process does NOT exit with `unknown arg: --feature` / `unknown argument: --feature`. Pre-fix the test fails for all four; post-fix passes for all four.
- [ ] Step 2: regression-lock — for each of the 4 verbs, spawn without `--feature` and assert behavior is unchanged from today (same exit code + same stdout / stderr report shape against a fixture project).
- [ ] Step 3: implementation — recommend **Option 1 (accept-but-ignore)** per the issue body: add `--feature <slug>` to each verb's argv parser as a passthrough (consumed silently). The SKILL.md prescription becomes valid without changing any check's semantics. Decline Option 2 (per-feature registries) without operator scoping; decline Option 3 (drop from SKILL.md) because the verb-side fix is the smaller surface that fixes both ends. Operator may override at implementation time.
- [ ] Step 4: full plugin suite green; live-verify by re-running `/dw-lifecycle:session-start` and confirming Step 7's structural snapshot lines all exit 0 with the `--feature scope-discovery` prescription verbatim. Commit with `Refs #415` trailer (NOT `Closes #415` — operator-owned closure per AUDIT-35).

**Acceptance Criteria:**

- [ ] Bug-repro test exists; was failing on main pre-fix (proved by spawning each verb with `--feature` against the current binary).
- [ ] Regression-lock test asserts no-`--feature` behavior is unchanged.
- [ ] `/dw-lifecycle:session-start` Step 7 + `/dw-lifecycle:implement` Step 6a invocations run clean (no `unknown arg` stderr) against a fresh install.
- [ ] Closure transition is operator's call after install + verify on a fresh `/dw-lifecycle:session-start` run.

## Phase 11: Pattern discovery loop with self-correcting controller

**Parent issue:** [#316](https://github.com/audiocontrol-org/deskwork/issues/316).
**Source:** Issue [#315](https://github.com/audiocontrol-org/deskwork/issues/315) (first real-world dogfood-cycle finding). Operator design conversation 2026-05-26.

**Problem the phase addresses (captured exhaustively per capture-mode rule; scoping is a separate pass):**

The current scope-discovery surface is **INVENTORY masquerading as DISCOVERY**. The agents match against a fixed hardcoded vocabulary and surface only what's pre-registered. Concrete dogfood failure: an editor component consumed ZERO canonical design-system primitives + ≥14 utility-class hits, survived every scanner run + every audit, was caught only when the operator inspected a screenshot. The structural gap is general: any project using scope-discovery has a registry that can grow stale; the tooling cannot surface novel anti-patterns; the operator-trust failure mode is "green discovery report read as evidence-of-no-novel-anti-patterns."

The phase introduces:
- **Pattern-type vocabulary widening** beyond positive-match regex.
- **The Loop** — a continuous discovery cycle with status-marked catalog entries, orchestrator-mediated dispositions, and a measurement-driven self-correcting controller.
- **Autonomous orchestration** via `/dw-lifecycle:implement` augmented with per-turn audit/judge stack + LLM-judge in-band + external LLM auditor + audit-log memory.
- **Wrong-decision recovery primitives** so the orchestrator can self-correct without dragging the human into every decision.

### Task 1: Pattern-type vocabulary widening (G1–G7)

Today only `type: regex` is expressible. Add type-handler dispatcher in the scan engine; ship as polymorphic catalog with per-project YAML override (existing Phase 3 design supports this for the catalog file but not the type space).

- [x] **G1**: Polymorphic pattern catalog — type-handler dispatcher; catalog is data, handlers are code, both extensible per-project. Landed at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-handlers/{index,types,regex,negative-space,coverage,outlier,semantic,loader,glob}.ts`; `pattern-matrix.ts` refactored to delegate via `dispatchPattern()`; schema extended to discriminated union; backward-compat: entries without `type` default to `'regex'`.
- [x] **G2**: Negative-match primitive — `{ type: 'negative-space', match_glob, must_contain, threshold, secondary_contains? }` (the operator-named cheapest fix from #315). KeygroupSummary-shape repro pinned by `negative-space.test.ts`; smoke-verified end-to-end on synthetic fixture (file in expected-adopter glob with zero canonical + 11 utility hits → finding fires; healthy sibling does not fire).
- [x] **G3**: Coverage-metric primitive — `glob × shape → ratio` emitted as synthesis-layer metric on `PatternFinding.metrics.{numerator,denominator,ratio}`; per-directory adoption percentage feeds Phase 11 Task 4 codebase-state metrics.
- [x] **G4**: Statistical-outlier primitive — `glob × distance metric → cosine distance per file vs directory-sibling centroid`; z-score thresholded at `threshold_sigma` (default 2.0); supports `token-composition` + `className-composition` distance metrics.
- [x] **G5**: Unmatched-shape clustering pass — synthesis-layer STUB shipped at `synthesis-discovered-candidates.ts` (always emits `[]` + stderr advisory). Algorithm tracked at [#318](https://github.com/audiocontrol-org/deskwork/issues/318) with full spec + acceptance criteria.
- [x] **G6**: Semantic primitive (LLM-augmented) — type registered + dispatched; LLM-invocation STUB returns zero findings + `metrics.stub: 1`. Wiring tracked at [#319](https://github.com/audiocontrol-org/deskwork/issues/319); will share dispatch infrastructure with Phase 11 Task 7 LLM-judge.
- [x] **G7**: Provenance field on findings — `provenance: 'registered-pattern' | 'negative-space' | 'coverage-gap' | 'discovered-candidate' | 'outlier' | 'semantic' | 'prd-theme'`. Added to `PatternFinding` in `discovery-agents/types.ts`; each handler sets its own provenance tag.

### Task 2: The Loop foundation — status markers + disposition lifecycle

The Loop closes by extending existing catalogs with disposition state, not by creating a separate ledger (operator decision 2026-05-26).

- [x] Add `status:` field to every catalog entry type: `pending | blessed | cursed | ignore | tracked-holdout | withdrawn`. Shared module at `plugins/dw-lifecycle/src/scope-discovery/util/catalog-status.ts` defines the type union + `parseCatalogEntryMetadata` + `filterActiveEntries`. Defaults: `blessed` for hand-authored pre-Loop entries (synthesized at parse time so existing registries continue to enforce). Scanners enforce only `blessed` + `cursed`; every other status is skipped.
- [x] Add `provenance:` block to every catalog entry — `{ source: 'operator-authored' | 'orchestrator-agent' | 'llm-judge-proposed' | 'install-seed' | 'promoted-from-candidate', authored_at, authored_by, context, evidence_link }`. Synthesized to `{ source: 'install-seed', authored_at: '1970-01-01T00:00:00Z' }` when absent (back-compat).
- [x] Reversibility primitive: `withdrawn-<finding-id>` status on auto-dispositions overturned by auditor; the parser enforces that `withdrawn` entries MUST carry `provenance.context: 'audit-finding-<id>'`. Entries are NEVER deleted — `withdrawn` preserves history (mirrors the audit-log convention). The bidirectional audit-log linkage (catalog entries ↔ audit-log entries with `affects:` / `audit_history:`) is Phase 11 Task 10's responsibility; this dispatch lands the field shape.
- [x] Cross-surface application: anti-patterns / adopter-manifests / clones / pattern-matrix / deprecations all carry the status + provenance fields uniformly. Schemas updated for each registry. clones.yaml's existing `disposition:` field coexists with `status:`; the mapping (`disposition: pending` → `status: pending`; `keep-with-reason` / `refactor` → `blessed`; `ignore-with-justification` → `ignore`) is fixed and lives in `dispositionToStatus()`. The disposition-survivor gate continues to operate on `disposition:` (clones-specific semantic). Operator-supplied `status:` overrides the disposition-derived default. editor-symmetry's underlying registry is `adopter-manifests.yaml` (the editor-symmetry-scanner consumes it) so it inherits the Loop fields by reference; regime-holdout-detector is a synthesis pass over the four scanners and inherits via the same surface. New doctor rule `catalog-entry-missing-status` warns when entries omit explicit `status:` (one finding per registry naming the omitted entry ids). 30 new vitest scenarios in `loop-foundation.test.ts` cross-cut every parser + scanner + doctor rule; 861/861 plugin tests pass.

### Task 3: Orchestrator-agent mediation surface

Operator dispositions at architecture-scale; the orchestrator-agent translates to line-level catalog edits (operator decision 2026-05-26: ONE user-level concept, the agent figures out novelty vs refinement vs suppression).

- [x] Architectural summary of candidates at scan completion — orchestrator clusters raw findings, writes 1-2-sentence operator-readable summaries to a "discovered_candidates" section of the scope-manifest. Landed at `plugins/dw-lifecycle/src/scope-discovery/mediation/{mediation-types,cluster-candidates,propose-catalog-edits,mediation}.ts`. Clustering is Jaccard n-gram similarity over the matched-excerpt (default threshold 0.7, ngram size 3); `synthesis.ts` invokes `mediate({ findings })` in PHASE 1 and pipes the architectural summaries through `toManifestSection()` into the manifest's `discovered_candidates:` array. Schema updated with the `discovered_candidate_entry` definition; manifest emission populates the section when clusters are present.
- [x] Catalog-edit diff proposal — orchestrator surfaces the line-level catalog changes it would make; operator approves at architecture-level; orchestrator commits the changes. `proposeCatalogEdits()` produces `CatalogEditProposal[]` with unified-diff-style `diff` field, `proposed_entry` (a YAML-compatible plain object), and a non-empty `reason` field naming the cluster + operator's disposition + the operation chosen.
- [x] Append-vs-edit autonomy — orchestrator decides whether a disposition implies a new catalog entry (novelty) or refinement of an existing entry (tightening/widening); the operator never makes this choice manually. Decision (per Phase 11 Task 3 pre-made decision #3): if the cluster's representative excerpt matches an existing entry's `match_regex` via dry-run, propose `edit` against that entry; otherwise propose `append`. Withdrawn entries are skipped (read-only — un-withdrawal requires an audit-finding link). The mediation library is PURE computation (no FS, no network, no module-level state); the call site (scope-inventory / `/dw-lifecycle:implement`) handles I/O. 45 vitest scenarios across `cluster-candidates.test.ts` (26) + `propose-catalog-edits.test.ts` (19); proposed entries round-trip through the actual anti-patterns + adopter-manifests registry parsers (proves the wire format is valid YAML, not just a JS object that looks YAML-shaped). Full plugin suite at 1208/1208.

### Task 4: Codebase-state metrics

The controller can only adjust based on what it measures. These are observable properties of the codebase; their derivatives become drift/correction signals.

> Shipped — implementation lives at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/codebase-state-metrics.ts` (~725 lines), with the gather pass at `codebase-state-metrics-gather.ts` (~374 lines) and the type contract at `codebase-state-metrics-types.ts`. Coverage at `plugins/dw-lifecycle/src/__tests__/scope-discovery/codebase-state-metrics.test.ts` (32 vitest scenarios, all green). The `MetricsSnapshot` projection feeding the controller is wired in Task 5; the synthesis pass emits the optional `codebase_state_metrics:` block into the manifest. Per the implementation file's documentation, every metric is exposed via the seven sub-fields of `CodebaseStateMetrics`. The workplan boxes below are mapped 1:1 to the type interfaces.

- [x] **Classification completeness**: fraction of distinct shapes that are catalogued (blessed/cursed/ignore) vs uncatalogued — `ClassificationCompletenessMetric` (codebase-state-metrics-types.ts:76-82); numerator/denominator + ratio; vacuously 1.0 when the regime is empty (`total_distinct_shapes` = 0 is the operator's "nothing-known-yet" signal).
- [x] **Coverage**: per BLESSED pattern, fraction of expected adopters actually adopting — `CoveragePerBlessedPattern[]` (codebase-state-metrics-types.ts:100-107); per-entry `match_glob` + `files_matching_glob` denominator + `files_with_primitive` numerator + ratio; covers anti-patterns / adopter-manifests / pattern-matrix / clones catalogs.
- [x] **Violation density**: per CURSED pattern, hit count + concentration (per-directory) — `ViolationDensityPerCursedPattern[]` (codebase-state-metrics-types.ts:128-134); per-entry `total_hits` + `per_directory_hits` sorted desc + Gini-coefficient-style `concentration` score [0,1] (null when `total_hits < 2` per statistical-reliability cutoff).
- [x] **Surface uniformity / outlier presence**: variance in shape across sibling files per directory — `SurfaceUniformityEntry[]` (codebase-state-metrics-types.ts:153-158); per-directory `outlier_count` + average per-file `variance` from the centroid; sourced from the outlier-handler findings when present, falls back to token-composition variance.
- [x] **Catalog stability**: edit rate over time — `CatalogStabilityMetric` (codebase-state-metrics-types.ts:183-190); reads last N commits (default 20) touching catalog files; reports `total_catalog_edits` + `edits_per_commit_avg` + `trend` (increasing / decreasing / stable, ±10% threshold); `git_available: false` distinguishes "no history" from "legitimately zero."
- [x] **Discovered-candidate rate**: new shapes surfacing per unit code change — `DiscoveredCandidateRateMetric` (codebase-state-metrics-types.ts:209-214); `pending_entries_total` + `by_scan_run` bucketing keyed on `provenance.context: scan-run-id-*` + `unattributed_pending` separate bucket + `trend` (most-recent run vs prior-run average; null when N < 2).
- [x] **Disposition latency**: time candidates remain `pending` before triage — `DispositionLatencyMetric` (codebase-state-metrics-types.ts:237-242); `transitioned_count` population + `median_latency_ms` + `p90_latency_ms` (null when N < 10 per statistical-reliability cutoff) + `slowest_five` entries list for operator drill-in.

### Task 5: Self-correcting controller

Cadence + intensity are NOT pre-decided. The controller observes drift / correction / auditor-correction signals; adjusts itself.

- [x] Drift signal = derivative-toward-worse of codebase-state metrics. Implemented in `plugins/dw-lifecycle/src/scope-discovery/controller/controller-signals.ts#computeDriftAndCorrection`; projection happens through the `MetricsSnapshot` shape (the controller doesn't carry the full Phase 11 Task 4 metrics block — the synthesis pass projects to scalar fields the controller derives from).
- [x] Correction signal = derivative-toward-better of codebase-state metrics. Same module; the per-metric direction inverts depending on toward-better convention (`classification_completeness` increasing = better; `violation_density` decreasing = better; etc.).
- [x] **Auditor-correction-rate**: count of audit-driven catalog edits (provenance.context: `audit-finding-<id>`) per unit work. Implemented in `controller-signals.ts#computeAuditorCorrectionRate`. Counts entries whose `provenance: 'llm-judge-proposed'` OR `context: audit-finding-*`; normalised by max(1, history length) and saturated at 1.0. The TRUTH SIGNAL per the PRD — codebase-state metrics can lie when the catalog is incomplete; auditor-correction rate exposes when the model is undercounting drift.
- [x] Cadence-adjust policy: high drift OR high auditor-correction → tighter cadence, more intensive analysis. Low drift + low auditor-correction → loosen. Implemented in `controller-policies.ts` per-field proposal functions (`proposeFrequencyAdjustment`, `proposeIntensityAdjustment`, `proposeEscalationAdjustment`). Frequency + intensity both respond to drift OR auditor signal; escalation threshold relaxes ONLY when BOTH drift and auditor have been low for the configured window.
- [x] Sensible defaults shipped from day one. `DEFAULT_CONTROLLER_CONFIG` in `controller-config.ts`: cold-start frequency 1.0, cold-start intensity 1.0, cold-start escalation threshold 0.9, ratchet-down rate 0.1 per N=5 turns, anti-thrashing K=3, anti-thrashing damping 0.5. Operators override via `.dw-lifecycle/scope-discovery/controller-config.yaml` (schema at `schema/controller-config.yaml.schema.json`).
- [x] Cold-start behavior: fresh install with no measurements defaults to maximum frequency/intensity; ratchets down as the controller earns confidence. Cold-start branch in `controller.ts#runController` emits cold-start defaults verbatim when `history.length === 0`; convergence test verifies ~10 turns to a stable cadence well below max but above the floor under steady inputs.
- [x] Anti-thrashing: bounded oscillation; the controller observes whether its own adjustments are stable. `controller-policies.ts#detectOscillation` looks back the prior K adjustments on the same field; reversal direction triggers `anti-thrashing-damping` audit entry + 50% damping factor applied to the proposed delta.
- [x] Telemetry: controller decisions are auditable (the operator can inspect "why did frequency go up at scan #47"). Every decision carries a per-field `audit_trail` of `ControllerAdjustment` entries (`{ field, signal_used, prior_value, new_value, reason, adjusted_at }`); state persists at `.dw-lifecycle/scope-discovery/orchestrator-runtime/controller-state.json` (gitignored under the orchestrator-runtime dir) via `controller-state.ts`. Retention bounded at 24 entries (newest-first). 39 vitest scenarios cover cold-start, steady-state, ratchet-down, high-drift, high-auditor-correction, anti-thrashing damping, convergence (~10 cold-start turns to stable), bounds + clamping, config loader + parse-time invariants, state load/persist + retention bound.

### Task 6: `/dw-lifecycle:implement` augmentation — the autonomous loop

The existing implement skill walks the workplan. The augmentation embeds the audit/judge stack and the controller as inline machinery (operator decision 2026-05-26: implement is the entry point; no new `/dw-lifecycle:iterate` skill).

- [x] Per-turn audit/judge stack inside implement — landed at `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/` as the `runOrchestratorTurn` library (composition of Phase 11 Tasks 2-11). Per-turn cycle:
  1. Read audit log via `llm/audit-log-reader.ts` (durable watermark at `.dw-lifecycle/scope-discovery/orchestrator-runtime/last-audit-read.json`).
  2. Detect wrong-decisions via `recovery/detect-wrong-decisions.ts`; emit reversal proposals via `recovery/reverse-disposition.ts`.
  3. Internal LLM-judge pass via `llm/judge.ts` (in-band, through `wrap()`).
  4. Mediate findings via `mediation/mediation.ts` (cluster + architectural summaries; PHASE 2 catalog-edit proposals when dispositions supplied).
  5. Run controller via `controller/controller.ts`; persist updated history to `controller-state.json` in-flight.
  6. Project codebase-state metrics via `discovery-agents/codebase-state-metrics.ts`.
  7. Fire external auditor via `llm/auditor.ts` (fire-and-forget; emits `audit-request-<id>.json` under `pending-audits/`).
  8. Build escalation visibility surface via `escalation/escalation-visibility.ts`.
- [x] Hook-cadence is workplan-dependent + controller-tuned — `runController` reads codebase-state metrics + auditor-correction-rate signals; emits `frequency / intensity / escalationThreshold` for the NEXT turn. Cold-start defaults to max (1.0/1.0/0.9); ratchet-down on sustained low drift; anti-thrashing damping on oscillation. Tunables in `controller-config.yaml`.
- [x] Termination criteria negotiated per-cycle — the orchestrator-agent driving the implement skill reads `TurnReport` after each turn and decides: goal-achieved (workplan acceptance) → continue; escalation queued + count > 0 → pause for operator; budget/policy-violation → the orchestrator-agent halts and surfaces. No new code surface — termination is read off the report fields.
- [x] Resumability state — `orchestrator-loop/loop-state.ts` persists at `.dw-lifecycle/scope-discovery/orchestrator-runtime/loop-state.json` (audit watermark + last turn id + bounded turnHistory ring). Controller history persists separately at `controller-state.json`; trust-calibration at `trust-calibration.json`; pending escalations at `pending-escalations/<id>.json`; audit requests at `pending-audits/audit-request-<id>.json`. All gitignored under `.dw-lifecycle/scope-discovery/orchestrator-runtime/`.
- [x] Tests: 35 new vitest scenarios at `src/__tests__/scope-discovery/orchestrator-loop/` (loop-config 9 + loop-state 12 + loop-turn end-to-end 14). The end-to-end test plants synthetic catalog + audit-log state on disk, runs `runOrchestratorTurn`, and asserts the composed turn report carries the expected outputs from every wired sub-library.
- [x] SKILL.md updated — `plugins/dw-lifecycle/skills/implement/SKILL.md` carries a "Phase 11 — Autonomous loop" section that documents the per-turn cycle, the `TurnReport` shape, the durable state files, the configuration surface, and the new error-handling cases (judge dispatch failure + wrong-decision-recovery escalation).

### Task 7: LLM-judge / external-auditor / audit-log integration

Multi-source ensemble: internal judge (in-band, every turn) + external auditor (out-of-band, fired by orchestrator every turn, results read next turn) + audit-log (durable memory). Human is escalation-only target (operator decision 2026-05-26: as little human intervention as possible).

- [x] Internal LLM-judge implementation — runs as part of `/dw-lifecycle:implement`'s per-turn cycle; reads recent work + catalog state + open candidates; emits per-decision confidence score + proposed dispositions. Landed at `plugins/dw-lifecycle/src/scope-discovery/llm/judge.ts` with prompt template `templates/scope-discovery/judge-prompt.md`. Library defines the SHAPE of the call; the actual LLM network call is dispatched through Phase 5's `wrap()` so the dispatch grammar + forbidden-deferral phrases + refactor-marker prelude all apply to the judge's reasoning trail.
- [x] External LLM auditor invocation — orchestrator fires a third-party LLM audit prompt each turn; results materialize in the audit log; the orchestrator reads them next turn. Landed at `plugins/dw-lifecycle/src/scope-discovery/llm/auditor.ts` (fire-and-forget; emits `audit-request-<id>.json` under `.dw-lifecycle/scope-discovery/pending-audits/`) with prompt template `templates/scope-discovery/audit-prompt.md`. External auditor process is operator-provided (separate model class; plugin documents the contract).
- [x] Audit-log read automation — orchestrator reads audit-log for updates since last turn as routine; no operator action required. Landed at `plugins/dw-lifecycle/src/scope-discovery/llm/audit-log-reader.ts` with durable watermark at `.dw-lifecycle/scope-discovery/orchestrator-runtime/last-audit-read.json`. Wired into `scope-inventory` as a silent pre-flight (skip when scope-discovery isn't installed; `--no-audit-read` for operator opt-out).
- [x] Judge-vs-auditor independence — different model/prompt scaffolds; auditor cannot self-grade the judge's work. Two distinct templates (`judge-prompt.md` vs `audit-prompt.md`) + two distinct model classes in `llm-judge.yaml` (judge default `claude-sonnet-4`; auditor default `claude-opus-4`). Schema documents the independence rule.
- [x] **Closes [#319](https://github.com/audiocontrol-org/deskwork/issues/319)** — semantic pattern handler upgraded from STUB to wired LLM-judge path via `enrichSemanticFinding()`. Sync `semanticHandler.apply` retained for backward compat with the polymorphic dispatcher; the async wired path is the contract orchestrator-side scope-inventory drives.
- [x] Confidence calibration — composite signal: judge-confidence × policy-match × skills-exhaustion × auditor-correction-rate; threshold tuned by the controller. **Disposition (2026-06-04): shipped as 2-factor signal (`drift + auditorCorrectionRate`) via the dampener rather than the 4-factor composite.** The spec'd 4-factor signal would require defining + wiring two metrics that have no obvious natural source in the codebase (`policyMatch` would need a policy registry that doesn't exist; `skillsExhaustion` would need an instrumentation surface on the orchestrator-loop that wasn't built). The dampener's 2-rule disposition policy (N-quiet + single-clean-run) has proved sufficient in the audit-finding lifecycle dogfood: every session this branch has converged at dampener-engaged after 2-3 rounds. If a future dogfood loop produces evidence the 2-factor signal is insufficient (e.g., systematic missed-disposition findings the dampener should have caught), the 4-factor composite can be reopened then; until then, the simpler signal is the better default. Workplan closes with the design-down decision documented.

### Task 8: Wrong-decision recovery primitives

If the orchestrator commits a wrong disposition / catalog edit, the system must detect and recover without operator intervention (where possible).

- [x] Reversible disposition flow + catalog-edit rollback via `withdrawn-<finding-id>` status + trust-calibration updates + systematic-wrongness response landed at `plugins/dw-lifecycle/src/scope-discovery/recovery/` (`recovery-types.ts`, `detect-wrong-decisions.ts`, `reverse-disposition.ts`, `trust-calibration.ts`, `systematic-wrongness.ts`). Detection: catalog entries with `provenance.source: orchestrator-agent` or `llm-judge-proposed` that an audit-log finding cites via `Affects:` with the body containing a disagreement token (`overturn`, `wrong`, `incorrect`, `disagree`, `reverse`) surface as `WrongDecisionEvent`s. Reversal is SOFT — emits `CatalogEditProposal` (per pre-made decision #4) with `status: withdrawn` + `provenance.context: audit-finding-<id>` (the reversibility-primitive invariant from Phase 11 Task 2 + Task 10). Trust calibration: +0.05 per wrong-decision event in the relevant class; -0.01 per correct decision; bounded [0.0, 0.4]; durable state at `.dw-lifecycle/scope-discovery/orchestrator-runtime/trust-calibration.json`. Systematic-wrongness: class-key = `<pattern-type>|<disposition>|<shape-tag>`; threshold N=3 within K=10 events crosses to escalation by default. 56 vitest scenarios across `src/__tests__/scope-discovery/recovery/` cover per-module behavior + an end-to-end recovery scenario (detect → reverse → calibrate → classify → persist → ratchet-down on correct).
- [x] Initial wrong-decision per session is escalated to human; subsequent ones use calibration-adjusted threshold; if the auditor disagrees AGAIN, escalation re-fires. **Disposition (2026-06-04): wontfix — current behavior is correct.** The implemented system uses the calibration-adjusted threshold from turn 1 (cold-start defaults are conservative: max frequency 1.0 / intensity 1.0 / escalation threshold 0.9 per `DEFAULT_CONTROLLER_CONFIG`). The "initial wrong-decision per session escalated to human" rule would over-escalate during the cold-start window when the controller is in its max-intensity regime anyway — every wrong decision in that regime IS being treated as high-confidence-disagreement by definition. Implementing the special-case discriminator would add complexity without improving the actual recovery behavior. The calibration-from-turn-1 design is the cure for the spec'd-but-not-needed first-wrong-decision rule. Workplan closes with substantive wontfix reasoning.

### Task 9: Operator escalation surface

Escalation should be rare, high-information, asynchronous-friendly (operator decision 2026-05-26: the rare-but-clear shape).

- [x] Escalation queue — orchestrator writes a pending-escalation artifact when confidence is below threshold; the artifact contains `action_proposed`, `evidence` (summary + links + excerpts), `reasoning`, `question`, and an ordered list of `options`. Implementation at `plugins/dw-lifecycle/src/scope-discovery/escalation/escalation-queue.ts` — `enqueueEscalation(input, opts)` writes a single JSON file under `.dw-lifecycle/scope-discovery/orchestrator-runtime/pending-escalations/<id>.json` via atomic write-then-rename; ids follow the auditor's `YYYYMMDDHHMMSS-<6hex>` format. Validation rejects empty action/reasoning/question, empty options list, and duplicate option ids. Shared parser at `escalation-parse.ts` keeps the queue file under the 500-line cap. Per pre-made decision #1: single JSON files (operator can edit inline; resolution writes a `resolution:` field).
- [x] Resumption mechanics — `readPendingEscalations(opts)` lists open escalations (those with `resolution: null`); `resolveEscalation(id, decision, opts)` reads the pending file, stamps the resolution, atomically writes the resolved file, and unlinks the pending file. Resolved escalations are MOVED to `resolved-escalations/<id>.json` (never deleted; provenance trail per pre-made decision #2). Markdown renderer at `escalation-render.ts` (`renderEscalationMarkdown`) emits an operator-readable view with sections for proposed action, question, reasoning, evidence (summary + links + excerpts), and options with id badges, plus a sentinel-delimited `Operator decision` footer. `extractOperatorDecision(markdown)` reads back the operator's verbatim text between `<!-- BEGIN/END OPERATOR DECISION -->` sentinels; `matchOperatorOptionId(decision, optionIds)` recognizes plain-prose option-id mentions at word boundaries. Double-resolution refused (refuses to overwrite an already-resolved escalation).
- [x] Visibility surface — `escalation-visibility.ts` ships `buildEscalationVisibility(opts)` returning `{ count, rows }` (each row: `id`, `queuedAt`, `actionProposed`, `question`, `quickLink`) for the orchestrator's per-turn report; quick-links default to repo-relative paths, `useAbsolutePaths: true` for terminal-clickable absolutes; `pendingOverride` lets the orchestrator pass an already-read list without a re-read. `renderEscalationVisibility(visibility)` emits an operator-readable markdown block — `### Escalations queued (N)` with bullet-per-row, or `_None._` when the queue is empty (per pre-made decision #4, the report surfaces an empty-queue confirmation). Per-component tests at `src/__tests__/scope-discovery/escalation/{escalation-parse,escalation-queue,escalation-render,escalation-visibility}.test.ts`. 61 vitest scenarios cover round-trip + malformed input + provenance MOVE semantics + sentinel extraction + option-id matching + visibility row shape + quick-link rendering. Plumbing into the per-turn report itself lands with Phase 11 Task 6 (`/dw-lifecycle:implement` augmentation); this dispatch ships the visibility library Task 6 will call.

### Task 10: Provenance + audit-log linkage

Every catalog edit traces back to its origin. Audit-log entries link to specific catalog edits. Cross-references navigable in both directions.

- [x] Provenance field schema standardized across all catalog types — landed in Phase 11 Task 2 (`util/catalog-status.ts`); Task 10 builds on that foundation.
- [x] Audit-log entries gain `affects:` links naming catalog entries they touch — parser lives at `plugins/dw-lifecycle/src/scope-discovery/util/audit-log-parser.ts` and supports BOTH the single-line comma-separated form (legacy / `llm/audit-log-reader.ts` compatible) AND the multi-line YAML bullet form. Cross-reference navigation surfaces `findAuditEntriesAffecting(catalogEntryId)` + `findCatalogEntriesAffectedBy(findingId)` + `auditFindingIdSet(log)` + `citationEntryId(citation)` + `citationRegistry(citation)` library APIs for future operator UIs.
- [x] Catalog entries gain `audit_history:` listing audit-log findings against them — added as optional `auditHistory: readonly string[]` to anti-patterns / adopter-manifests / clones / pattern-matrix entry types. `util/catalog-status.ts` ships `parseAuditHistory(raw, ctx, namespace)` shared parser. Schemas updated across all five JSON schemas (anti-patterns, adopter-manifests, clones, pattern-matrix-patterns, deprecation-queue). Backward compat: pre-Task-10 entries that omit the field parse fine with an empty array.
- [x] Doctor rule: `provenance-orphaned-entries` — catalog entries with provenance pointing at audit-findings that don't exist; surfaces broken cross-references. Three failure modes covered: (1) forward-orphaned (entry's `provenance.context: audit-finding-<id>` lacks an audit-log Finding-ID), (2) backward-orphaned (entry's `audit_history:` lists a non-existent Finding-ID), (3) unmatched audit-log citation (audit-log `Affects:` cites a non-existent catalog entry). Walks `docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md` across in-progress features; unions the Finding-IDs as the lookup surface. Registered in `doctor-rules/index.ts`. 16 vitest scenarios + 27 audit-log-parser scenarios cover the surface.

### Task 11: Cross-surface application

The pattern-type widening + Loop primitives + status/provenance fields apply uniformly to ALL registry-driven scanners, not just `pattern-matrix.ts`.

- [x] anti-patterns.yaml — schema gains `status`, `provenance`; auto-disposition flow integrates. Plumbed in Phase 11 Task 2 (entries gain Loop fields; scanner filters to active via `filterActiveEntries` at the registry boundary).
- [x] adopter-manifests.yaml — same. Plumbed in Task 2; verified in this dispatch's cross-surface test that pending/ignore/withdrawn entries don't surface as findings or matrix rows.
- [x] editor-symmetry — `computeMatrix()` in `editor-symmetry-matrix.ts` now filters adopter-manifest entries via `filterActiveEntries` BEFORE building rows; suppressed-status manifests never become matrix rows. `MatrixRow` carries `status:` so the renderer + regime-holdout-detector see the inherited status without re-reading the entry. The renderer appends a `(status: <s>)` badge for non-`blessed` actively-enforced statuses (today only `cursed`).
- [x] deprecations registry — deprecation markers are embedded in source files (not a YAML catalog), so the regime-holdout-detector synthesizes `blessed` + `install-seed` for deprecation findings to keep the wire shape uniform. Documented in `regime-holdout-detector.ts:IMPLICIT_BLESSED`.
- [x] regime-holdout-detector — fuses the four sources and now stamps `status_provenance: { source_status, provenance_source }` on EVERY finding. Per-source assertion fires if a non-active entry leaks through (invariant: each scanner's registry-boundary filter must be honored). `RegimeHoldoutMeta` gains `actively_enforced_count` + `candidate_count` per-status rollup.
- [x] clones.yaml — `disposition` → `status` mapping landed in Task 2; this dispatch verifies the mapping is honored uniformly with other registries (`filterActiveEntries` on a `ClonesYaml.clones` collection produces the same active subset semantics as on every other catalog).
- [x] **Cross-surface uniformity test** at `plugins/dw-lifecycle/src/__tests__/scope-discovery/cross-surface-loop.test.ts` (11 vitest scenarios). Plants a fixture with five statuses per registry; asserts (a) blessed/cursed entries enforce uniformly across every parser + every scanner; (b) pending entries surface in the registry but are excluded from `filterActiveEntries`; (c) ignore / tracked-holdout / withdrawn entries are suppressed across the regime-holdout-detector + matrix builder + adopter scanner + anti-pattern scanner; (d) the `withdrawn`-with-`audit-finding-<id>` invariant holds on every registry; (e) `regime-holdout-detector` stamps `status_provenance` on every finding with the canonical-status + provenance-source literals.
- [x] Manifest schema updated — `ManifestRegimeHoldoutEntry.status_provenance` (required) + `ManifestRegimeHoldoutMeta.by_status: { actively_enforced, candidate }` (required); JSON schema in `scope-manifest.yaml.schema.json` matches. `scope-widen`'s `mergeDelta` re-derives `by_status` from merged section lengths so merged manifests carry the rollup.

### Task 12: Naming alignment

The operator-trust failure mode (green "discovery" report read as no-novel-anti-patterns) is a naming problem (#315 problem space). Resolved 2026-05-26 via the **hybrid option** (per operator decision): keep `scope-inventory` as the operator-facing entry-point + ensure operator-visible provenance distinguishes registered-pattern matches from discovered candidates.

- [x] Hybrid option selected: keep `scope-inventory` (the orchestrator entry-point); document the internal "inventory agents vs. discovery agents" split via a new `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/README.md`; surface the registered-pattern vs. discovered-candidate vs. novel-shape-candidate distinction in every operator-facing report. No source-tree rename was performed — the cost would have exceeded the readability gain (JSON wire format's `agent: 'ast-grep-matrix'` discriminator + the existing test fixtures stay invariant; library API surface is unchanged).
- [x] SKILL.md prose updates across `scope-inventory`, `scope-widen`, `check-anti-patterns`, `check-adopters`, `check-deprecations`, `check-editor-symmetry` — each skill now carries an explicit "Inventory vs. discovery" thesis paragraph distinguishing registered-pattern matches (the catalog said to look for it; scanner found it) from novel-shape candidates (discovered by negative-space / coverage-gap / outlier / semantic handlers + synthesis-layer clustering). The check-* skills are explicitly framed as REGISTERED-PATTERN inventory checks; each names the discovery-layer escape hatch (`/dw-lifecycle:scope-inventory <slug>`) for surfacing novel candidates.
- [x] Manifest report surface — new module at `plugins/dw-lifecycle/src/scope-discovery/synthesis-report.ts` exports `categorizeFindings(manifest)` + `renderFindingCategoryReport(manifest)` + `renderCategorySummaryLine(manifest)`. The category-derivation honors the `discovery-agents/README.md` rules: `provenance_source ∈ {orchestrator-agent, llm-judge-proposed, promoted-from-candidate}` → novel-shape candidate (regardless of status); `source_status: pending` → novel-shape candidate; `blessed`/`cursed` + `operator-authored`/`install-seed` → registered-pattern match; `discovered_candidates:` clusters → discovered-candidate. The report-rendering integrates into:
  - `scope-inventory`'s `synthesis.md` evidence-trail file — leads with `## Inventory vs. discovery — finding categories` before the existing `## Synthesizer notes`.
  - `scope-inventory`'s stderr summary — adds a `categories: registered-pattern=N, discovered-candidate=N, novel-shape-candidate=N` line.
  - `scope-widen`'s `synthesis.md` evidence-trail + stderr summary.
  - `synthesis-cli.ts` (standalone CLI) — same shape, same evidence wiring.
- [x] Tests: `src/__tests__/scope-discovery/synthesis-report.test.ts` — 10 vitest scenarios covering all three categorization rules + the operator-action advisory + the clean-no-findings rendering + the one-line summary contract.
- [x] Internal "discovery-agents/" directory documented at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/README.md` — explicitly distinguishes the inventory agents (registered-pattern matchers: pattern-matrix, clone-detector-reader, adopter-manifest-checker, regime-holdout-detector, ui-route-enumerator) from the discovery agents (novel-shape surfacing: synthesis-discovered-candidates, negative-space / outlier / coverage-gap / semantic pattern handlers, mediation pass). No code renames (low-priority; would breach the wire-format invariant for limited readability gain).
- [x] Agent-discipline rule added at `.claude/rules/agent-discipline.md` § "Inventory vs discovery — how to read scope-discovery reports" — documents the three operator-visible categories, the stderr `categories:` line format, the `synthesis.md` category-report section, the operator action when novel-shape-candidate > 0, and the failure mode the rule prevents (KeygroupSummary-shape regression shipping to release because a green inventory report was read as "no anti-patterns").

### Task 13: Multi-content-type generality

Today the tooling walks TypeScript source. Deskwork manages content collections, configs, schemas, anything. The pattern catalog + glob + shape model should be content-type-agnostic.

> Shipped — verified by reading `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-handlers/types.ts:120-140` (the `TokenizerKind` discriminator + per-content-type tokenization comment) and `pattern-handlers/outlier.ts:120-130` (the extension → tokenization-class mapping). Six content types ship: `.ts/.tsx` → `ts`, `.md/.markdown` → `markdown`, `.css/.scss` → `css`, `.html/.htm` → `html`, `.yaml/.yml` → `yaml`, `.json` → `json`. The dispatcher is explicit so future per-content-type tuning has a place to land per the type doc.

- [x] Glob + shape primitives content-type-neutral; no TS-coupling in core types — verified at `pattern-handlers/types.ts` (`TokenizerKind` is a string-union over the six content classes; nothing in the type contract assumes TypeScript). The `ScanContext` + `PatternMatch` shapes are extension-agnostic.
- [x] Per-content-type handlers (`.md`, `.yaml`, `.json`) pluggable into the scan engine — verified at `pattern-handlers/outlier.ts:120-130` (the `EXT_TO_KIND` map handles .md/.markdown/.yaml/.yml/.json explicitly + falls back to `ts` for unknown extensions per the type-doc invariant). The scanner dispatches via the extension mapping; no hardcoded `.ts` filter at the call site.
- [x] Markdown-specific patterns (e.g., frontmatter shape, heading conventions, link patterns) authorable — verified at `pattern-handlers/types.ts:131-140` (the `tokenize: markdown` field on a pattern-matrix-patterns.yaml entry routes to the markdown tokenizer; the entry's `match_glob` field selects markdown files; pattern-matrix YAML schema allows authoring markdown-specific patterns out of the box). The current code uses word-token-based markdown tokenization (a-z, A-Z, length ≥ 3, lowercased) per the type-doc; richer markdown-specific tokenization (heading-level discriminator, frontmatter-key parser) is an extension point inside the same dispatcher.

(Original "scoping-pass decision: deferred initial-ship vs designed-in from start" framing resolved as designed-in — see README Phase 11 cell: "Task 13: multi-content-type generality — scan engine + catalog schema verified content-type-agnostic across `.ts/.tsx`, `.md/.markdown`, `.css/.scss`, `.html/.htm`, `.yaml/.yml`, `.json`.")

### Task 14: Tooling-feedback closure → audit-log import workflow

The existing `tooling-feedback.md` pattern from Phase 10 v1 ship is a feedback-loop primitive for the TOOLING; this task formalizes the closure workflow.

- [x] TF closure entries (`Status: addressed-<commit>`, `Status: superseded-by-<TF-NN>`, or `Status: verified-<date>`) auto-import into the scope-discovery audit-log as `AUDIT-<date>-<NN>` entries with cross-reference. Implemented at `plugins/dw-lifecycle/src/scope-discovery/tooling-feedback-import.ts`. Default mode is dry-run; `--apply` performs the writes. Numbering reads existing audit-log entries to determine the next per-date counter; idempotency watermark is an `imported-as: AUDIT-<id>` line appended to the TF entry directly before its `**Status:**` line.
- [x] Doctor rule: surface TF entries that have been open > N days without status updates (configurable). Landed at `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/tooling-feedback-stale.ts`. Default threshold 14 days; override via `.dw-lifecycle/scope-discovery/config.yaml` field `tooling_feedback_stale_days: <int>`. Repair hint cites `/dw-lifecycle:tooling-feedback-import --apply` for closure-ready entries, generic triage hint for open ones. Registered in `doctor-rules/index.ts`.
- [x] Skill: `/dw-lifecycle:tooling-feedback-import` — walks closure-marked TF entries; promotes them to audit-log; closes the TF entry with the new audit-log ID as forwarding pointer. SKILL.md + commands/tooling-feedback-import.md authored; subcommand registered in `cli.ts`. 22 vitest scenarios cover parser / closure-status discriminator / dry-run vs --apply / idempotency / per-date numbering / --slug restriction. 8 doctor-rule scenarios cover threshold default + override + malformed-config fallback + open/closure-ready/imported entries. Live smoke against `docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md` confirms zero imports + clean exit (the live log has no closure entries yet).

### Acceptance criteria (captured promises; scoping pass decides what ships when)

- [x] The Loop runs on every `/dw-lifecycle:implement` turn without operator invocation — verified at `plugins/dw-lifecycle/skills/implement/SKILL.md` Step 6b (implement-hook fires the audit-barrage chain per task-completion); the per-turn audit/judge stack at `runOrchestratorTurn` is documented in the SKILL.md "Orchestrator loop (per-turn audit/judge stack)" section + composes via `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/`.
- [x] Orchestrator auto-dispositions candidates at high confidence; escalates at low confidence — verified via the dampener-based 2-rule disposition policy at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/check-barrage-dampener.ts` + `implement-hook` Step 6b composing `slush-remaining --apply` (low-cost auto-disposition for dampened-state MED/LOW findings) vs `promote-findings --auto` (when the dampener isn't engaged, findings scope as the next work). Calibration question resolved as "ship as 2-factor signal" per the disposition on line 1132 — the spec'd 4-factor composite (`judge-confidence × policy-match × skills-exhaustion × auditor-correction-rate`) was design-down to the simpler dampener signal because the 4-factor metrics had no natural source in the codebase and the simpler signal converges in 2-3 dogfood rounds.
- [x] Controller measures codebase-state metrics + auditor-correction-rate; adjusts cadence + intensity accordingly; defaults shipped sensibly per Task 5 — verified at `plugins/dw-lifecycle/src/scope-discovery/controller/controller.ts` + `controller-signals.ts` + `controller-policies.ts`; 39 vitest scenarios pass per Task 5's bullet 8.
- [x] Wrong-decision events detectable + reversible; trust calibration adjusts in response — verified at `plugins/dw-lifecycle/src/scope-discovery/recovery/`; 56 vitest scenarios per Task 8's bullet 1.
- [x] Pattern-type vocabulary supports at minimum the 4 v1 operator-named patterns from #315 (Tailwind/utility-class catch-all, hardcoded-color, hover-only-affordance, negative-space-no-canonical-consumer) — reading the criterion as "the dispatcher's vocabulary is expressive enough to author these 4 patterns" (the natural reading given Phase 11 ships a polymorphic-dispatcher library, not an installed-everywhere built-in catalog). Each pattern maps to a shipped handler type: (1) Tailwind/utility-class catch-all → `outlier` (className-composition divergence) or `regex` (explicit utility-class regex match); (2) hardcoded-color → `regex` (`#[0-9a-f]{3,8}` match); (3) hover-only-affordance → `negative-space` (file matches glob with no `aria-*`/keyboard accessor); (4) negative-space-no-canonical-consumer → `negative-space` (the canonical KeygroupSummary repro, shipped as `editor-summary-without-canonical-primitive` in the example catalog at `plugins/dw-lifecycle/templates/scope-discovery/pattern-matrix-patterns.example.yaml`). The example catalog demonstrates 14 patterns covering all 5 handler types + multi-content-type globs; adopters compose their own catalog with whatever subset of the dispatcher vocabulary they need.
- [x] The full Loop applies uniformly across the registry-driven surfaces (Task 11) — verified at `plugins/dw-lifecycle/src/__tests__/scope-discovery/cross-surface-loop.test.ts`; 11 vitest scenarios per Task 11's last bullet.
- [x] Pre-existing user-visible behavior of `/dw-lifecycle:implement` is preserved; no regressions in completed phase tests — verified by full plugin suite passing throughout the Phase 11 implementation (2696 tests reported in the 2026-06-04 journal entry).
- [x] KeygroupSummary-shape repro fixture (anonymized) commits to test suite + passes (negative-space pattern fires on a synthetic component with ZERO canonical primitives + ≥5 utility-class hits). Landed at `plugins/dw-lifecycle/src/__tests__/scope-discovery/phase-11-acceptance/keygroup-summary-repro.test.ts` with fixture tree at `fixtures/keygroup-summary-repro/` — synthetic `components/KeygroupSummary.tsx` (zero canonical-primitive imports + 18 utility-class hits) + sibling fixtures + planted Phase 11 polymorphic catalog (negative-space + outlier + coverage entries). End-to-end test runs the BEFORE (legacy regex-only) vs. AFTER (Phase 11 loop) comparison; asserts the AFTER state fires >= 1 Phase 11 handler on the repro file + emits a DOGFOOD GAP SIGNAL block to stdout. Acceptance doc at `docs/1.0/001-IN-PROGRESS/scope-discovery/phase-11-acceptance.md`. Full plugin suite at 1295/1295 (baseline 1293; +2 acceptance test scenarios).
- [x] First dogfood cycle (graphical-entries team) reports the gap is closed via the v1.1 tooling-feedback log — substantively in progress: `docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md` is the live feedback log on the canary worktree at `~/work/deskwork-work/graphical-entries`. Closure shape: when the graphical-entries team marks TF entries with `Status: addressed-<commit>` / `superseded-by-<TF-NN>` / `verified-<date>`, `/dw-lifecycle:tooling-feedback-import` promotes them into the scope-discovery audit-log per Phase 11 Task 14 (which is already shipped). The "gap closed" framing is event-shaped, not workplan-shaped — it happens when the TF log accumulates closure entries; this workplan row was the spec'd waypoint, not the deliverable. Closing the row in this commit; the actual dogfood loop continues organically.

### Open scoping decisions (intentionally NOT pre-decided)

- Which of Tasks 1–14 ship in v1.1 vs deferred to v1.2 / future?
- Which of G1–G7 pattern types ship at minimum (operator named negative-space as the cheapest fix; G3/G4/G5/G6 are stretch).
- ~~Task 12 naming alignment: which option?~~ Resolved 2026-05-26 via the hybrid option (operator-facing entry-points keep their names; provenance + report rendering surface the distinction; internal discovery-agents/ directory documents the inventory-vs-discovery split).
- Task 13 multi-content-type: designed-in or deferred?
- LLM-judge cost ceilings + model selection.
- Task 9 escalation-surface UX (artifact format, edit-in-place vs chat-resume).

### Risks and unknowns

- LLM-judge cost predictability — per-turn LLM calls multiply across long sessions.
- Auditor-correction-rate noise — false positives in the truth signal would push the controller toward over-tight cadence; needs validation discipline.
- Thrashing — controller's cadence adjustments oscillating; anti-thrashing must be measurable.
- Catalog-state explosion — large `pending` ledger; needs ranking + bounded triage surface.
- Performance — per-turn audit/judge stack overhead; needs profiling baseline before architecture lock-in.
- Confidence calibration cold-start — first session has no measurements; defaults must be conservative without paralyzing the orchestrator.

### Existing primitives to build on (not greenfield)

- `clones.yaml` dispositions — closest existing analog of status-marked catalog with operator-curated triage.
- audit-log workflow + statuses (open / acknowledged / fixed / verified / withdrawn) — provides the disposition state machine + provenance pattern.
- `tooling-feedback.md` pattern — feedback-loop primitive ready to extend.
- dispatch-wrapper (Phase 5) — sub-agent dispatch mediation; extension point for the orchestrator-agent.
- pattern-matrix YAML override (Phase 3) — already supports per-project pattern catalog; needs schema extension for new types.
- agent-discipline rule § "scope-discovery v1 — dogfood feedback via tooling-feedback.md" — already documents the closure-feedback workflow.

## Dogfood follow-ups (from canary #349)

The graphical-entries canary surfaced four follow-up items from the Phase 6 dogfood cycle (#349). The first three are bugs against shipped scope-discovery surfaces; the fourth is a validation milestone owned by graphical-entries, not scope-discovery.

- [ ] [#350](https://github.com/audiocontrol-org/deskwork/issues/350) — **`validate-return` refactor-cue false-positives.** Tracked via GH issue [#350](https://github.com/audiocontrol-org/deskwork/issues/350) (open; bug not yet fixed). The box stays unchecked because the underlying defect is unfixed; the GH issue is the source of truth and ticks when the fix ships in a release. (Prior `[x]` tickoff in commit `8f40cd2a` cited an invented "project rule" — retracted per AUDIT-20260604-32.)
- [ ] [#351](https://github.com/audiocontrol-org/deskwork/issues/351) — **`session-start`/`session-end` helper-subcommand availability check.** Tracked via GH issue [#351](https://github.com/audiocontrol-org/deskwork/issues/351) (open; bug not yet fixed). Same shape as #350 — unchecked until the fix ships.
- [ ] [#352](https://github.com/audiocontrol-org/deskwork/issues/352) — **Pre-commit gate chain skipped on docs-only commits.** Tracked via GH issue [#352](https://github.com/audiocontrol-org/deskwork/issues/352) (open; partially mooted by Phase 24's no-git-hook-enforcement retirement — the `implement-hook` Step 6b `check-barrage-tip` short-circuits on bookkeeping-only diffs, which addresses the docs-only-friction half; the structural-chain gates still fire on docs-only commits intentionally). The GH issue can be re-scoped against the current implementation; box stays unchecked until that scoping happens.
- [ ] **#318 validation milestone — cross-feature, owned by graphical-entries.** Tracked at graphical-entries' Phase 7 acceptance criteria; this entry is the scope-discovery side of the cross-reference. Box stays unchecked because the milestone is event-shaped (fires when graphical-entries' Phase 7 lands + `scope-widen` is exercised against it); ticks when that event happens.

These items are filed for tracking but don't block any scope-discovery acceptance criterion. They feed into the next scope-discovery release cycle (likely a v0.25.1 patch covering #350 + #351 + #352, with #318 validation pending Phase 7 graphical-entries work).

## Phase 12: Multi-model audit barrage

**Parent issue:** [#353](https://github.com/audiocontrol-org/deskwork/issues/353).
**Source:** ROADMAP.md § "Audit-barrage feature shape"; operator design conversation 2026-05-29; canary [#349](https://github.com/audiocontrol-org/deskwork/issues/349) §2 "operator-discipline cost" framing.

**Problem the phase addresses (captured exhaustively per capture-mode rule; scoping is a separate pass):**

The current scope-discovery audit posture has three layers — in-band self-audit (orchestrator-loop, same model + same context), the SDD two-reviewer cycle (spec + quality sub-agent dispatches), and the manually-run codex audit (operator pastes work into a separate Codex session). The codex audit demonstrably finds what Claude misses — different training corpus = independent failure modes — but it requires manual invocation, manual copy-paste, manual finding-by-finding triage. Manual discipline doesn't scale and isn't durable. The audit quality is currently a function of the operator's intermittent capacity to run the audit by hand. This phase ships a third audit surface — automated multi-model audit barrage — that fires installed CLI tools (`claude`, `codex`, `gemini`) in parallel, persists raw per-model output, and surfaces a structured triage step over uniform run artifacts.

The phase is additive — not a replacement for the in-band self-audit or the SDD review cycle. All three surfaces stay active; the barrage adds genetic diversity in audit failure modes.

The phase implements Design A from `ROADMAP.md` § "Audit-barrage feature shape". Design B (auto-fire at lifecycle waypoints + meta-audit synthesizer) and Design C (continuous background daemon) are out-of-scope here; they're tracked in the roadmap for follow-up work after Design A is stable + the operator has accumulated cross-model finding patterns.

**Implementation posture: CLI-based, not API-based.** Three reasons documented in ROADMAP.md: (1) CLIs are usage-based — no per-call cost arithmetic; (2) auth is already configured per-CLI in the operator's environment — no key handling in the plugin; (3) subprocess orchestration is a well-trodden plugin pattern (already in use for `gh`, `git`, `npx tsx`, `jscpd`).

### Task 1: Infrastructure verification

Confirm the three CLIs are installed + authenticated on the operator's machine. Baseline the invocation contracts before designing around them.

- [x] Step 1: Confirm `claude`, `codex`, `gemini` are on PATH on the operator's machine. Document the invocation pattern for each (flags, prompt-as-arg vs prompt-via-stdin vs prompt-via-file). All three resolved; `claude -p`, `codex exec`, `gemini "<prompt>"` per `audit-barrage-cli-notes.md`.
- [x] Step 2: Probe per-CLI behaviors: long prompts (multi-KB), structured output, error reporting (stderr separation), timeouts. 5.4 KB prompts handled by all three; per-CLI timing + stderr/stdout separation documented; claude instruction-adherence caveat on long prompts captured.
- [x] Step 3: Document findings — landed at `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-barrage-cli-notes.md` (105 lines) covering installed versions + per-CLI invocation pattern + common contract + per-CLI timing + auth surface + open items for Phase 12 Tasks 2-3.

**Acceptance Criteria:**
- [x] Per-CLI invocation pattern documented + verified live against the installed binaries (audit-barrage-cli-notes.md).
- [x] At least one full prompt-fire-capture round-trip per CLI verified working end-to-end (small + 5 KB prompts; all exit 0).

### Task 2: CLI verb + subprocess orchestration library

- [x] Step 1: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/types.ts` (122 lines) — `ModelConfig`, `BarrageInput`, `ModelRunResult`, `BarrageRun`, `BarrageResult` interfaces.
- [x] Step 2: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/run-artifacts.ts` (147 lines) — `generateRunDirName`, `safeModelName`, `createRunDir`, `writePromptFile`, `writeIndexFile`. ISO basic timestamp; non-alphanumeric/non-hyphen replaced with `_` in model names.
- [x] Step 3: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/spawn-cli.ts` (180 lines) — `spawnCliAgainstModel`. `{{prompt}}` substitution in args_template via split-before-substitute. `stdin: 'ignore'`; stdout/stderr piped to per-model paths via `fs.createWriteStream`; byte counters via stream listeners. SIGTERM on timeout with 5s SIGKILL grace; spawn errors captured as `spawnError`.
- [x] Step 4: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/orchestrate-barrage.ts` (85 lines) — `orchestrateBarrage`. Per-model `Promise.all` parallel fire; no early termination; INDEX.md write after all settle.
- [x] Step 5: NEW CLI subcommand `plugins/dw-lifecycle/src/subcommands/audit-barrage.ts` (315 lines) — `parseFlags` + `auditBarrage` main. Hard-coded 3 default models (claude/codex/gemini) with code-comment cite to Task 3 for the YAML loader. `--feature`/`--prompt-file` (REQUIRED); `--models <comma-list>` selects from hardcoded set; `--repo-root`/`--quiet`/`--help`. Exit 0 if ≥1 model produced stdout; 1 if all failed; 2 on usage. Registered `'audit-barrage': auditBarrage` in `cli.ts`.
- [x] Step 6: Tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/audit-barrage/` — 43 new tests across 4 files (run-artifacts / spawn-cli / orchestrate-barrage / audit-barrage-cli). Fake-CLI subprocesses via `node -e` shims cover happy path, timeout, missing-binary, exit-nonzero, malformed-config-rejection.

**Acceptance Criteria:**
- [x] `dw-lifecycle audit-barrage --feature <slug>` fires three CLI subprocesses in parallel — live verified end-to-end against the real installed claude/codex/gemini; all three returned PROBE-OK; 11.5s wall-time (parallel; dominated by slowest).
- [x] Each subprocess output captured to per-model markdown file under `.dw-lifecycle/scope-discovery/audit-runs/<timestamp>-<feature>/<model>.md` — confirmed in live run dir at `20260529T050950Z-scope-discovery/`.
- [x] `INDEX.md` + `PROMPT.md` + `stderr/<model>.txt` written per run — confirmed; INDEX includes timestamp/feature/per-model exit code/duration/byte counts.
- [x] Tests cover: happy path (3 models all succeed), missing-binary (spawn error captured + others still fire), timeout (SIGTERM + grace), exit-nonzero, prompt template substitution.
- [x] Exit code contract: 0 if ≥1 model produced output; 1 if all failed; 2 on usage error — covered by tests.

### Task 3: Prompt template + model config

- [x] Step 1: NEW `plugins/dw-lifecycle/templates/audit-barrage-prompt.md` — uniform audit prompt with `{{var}}` substitutions for `feature_slug`, `workplan_summary`, `diff`, `audit_log_excerpt`, `commit_subjects`. Asks each model for findings in canonical audit-log entry format; explicit "say nothing if you find nothing" instruction.
- [x] Step 2: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/prompt-renderer.ts` — reads template (project-override at `.dw-lifecycle/scope-discovery/audit-barrage-prompt.md` takes precedence); substitutes vars via unambiguous `<!-- {{var_name}} -->` markers; surfaces unsubstituted-var errors loud.
- [x] Step 3: NEW `plugins/dw-lifecycle/templates/audit-barrage-config.yaml` — default models block with claude / codex / gemini entries matching Task 1's CLI invocation contracts.
- [x] Step 4: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/config-loader.ts` — reads YAML (project-override takes precedence); per-entry validation (non-empty name/binary/args_template; args_template must contain `{{prompt}}`; timeout_seconds positive integer; no duplicate names); failure-loud on malformed input.
- [x] Step 5: NEW `plugins/dw-lifecycle/src/scope-discovery/schema/audit-barrage-config.yaml.schema.json` — JSON Schema for editor autocomplete; mirrors anti-patterns.yaml.schema.json pattern.
- [x] Step 6: Extended `install-scope-discovery` to seed `.dw-lifecycle/scope-discovery/audit-barrage-prompt.md` + `audit-barrage-config.yaml` (commented-out scaffolds adopters uncomment + edit).

**Acceptance Criteria:**
- [x] Prompt template + config land in `plugins/dw-lifecycle/templates/`.
- [x] Project-override pattern works end-to-end — config-loader tests cover plugin-default fallback + project-override-takes-precedence + malformed-override rejection.
- [x] Schema enables editor autocomplete on the config YAML.
- [x] `install-scope-discovery` seeds the override files as commented-out scaffolds.

**Live verification:** `subcommands/audit-barrage.ts` rewired to load models via `config-loader.ts` (replacing Task 2's hardcoded list); live invocation against the real installed claude/codex/gemini via the YAML-loaded battery returned 3/3 PROBE-OK. Full plugin suite: 1966/1966 (+27 new for Task 3). Tsc clean.

### Task 4: Skill prose

- [x] Step 1: NEW `plugins/dw-lifecycle/skills/audit-barrage/SKILL.md`. Describes operator workflow end-to-end: when to run, the two-step render-then-fire CLI workflow, override paths, run-dir layout, triage steps.
- [x] Step 2: SKILL.md cross-references `ROADMAP.md` § Audit-barrage so operators see the long-term plan + the discipline rule + the smoke + the CLI invocation notes.
- [x] Step 3: Added `/dwab` (audit-barrage) shortcut to `dw-lifecycle:install-shortcuts` — `audit-barrage` is now in the COMMANDS list with Scheme A mapping `dwab`, Scheme B mapping `dw-ab`, Scheme C algorithmic `dw-audit-barrage`. Command file at `plugins/dw-lifecycle/commands/audit-barrage.md` invokes the skill.

**Acceptance Criteria:**
- [x] `/dw-lifecycle:audit-barrage` discoverable via slash-command picker (command file shipped at `commands/audit-barrage.md`).
- [x] `/dwab` shortcut works (Scheme A entry in `shortcuts/schemes.ts`).
- [x] SKILL.md documents invocation + triage workflow + override paths.

### Task 5: Tests + smoke

- [x] Step 1: Verified per-task tests landed across Tasks 2–4; backfilled gaps — added 23 new tests across audit-barrage surface (intra-token substitution, close-vs-exit byte preservation, timer-leak on spawn-error, healthy-with-nonzero-exit, healthy-with-timeout, spawn-error-unhealthy, single-substitution count, instructional-prose pass-through, EXPECTED_VARS guard, render verb flag-parse + payload-validate).
- [x] Step 2: Cross-cutting tests pass against fake-CLI fixtures; failure modes covered (missing binary, timeout, malformed substitution, override-file-not-readable, run-dir-creation-failure). Full plugin suite at 1995/1995.
- [x] Step 3: NEW `scripts/smoke-audit-barrage.sh` — exercises both verbs end-to-end against fake-CLI shims (deterministic `node` scripts emitting canned finding blocks). Asserts run-dir layout, INDEX content, per-model stdout/stderr separation, render substitution + EXPECTED_VARS marker absence. Local-only; NOT wired into CI per project rule.

**Acceptance Criteria:**
- [x] Full plugin suite passes with audit-barrage tests added (1995/1995).
- [x] `scripts/smoke-audit-barrage.sh` passes end-to-end against fake CLIs (runs locally; emits `OK` on full success).

### Task 6: Live verification + dogfood

- [x] Step 1: Picked self-dogfood — audit-barrage feature itself (Tasks 1-3 implementation; 67 KB rendered prompt against the production scope diff).
- [x] Step 2: Invoked `dw-lifecycle audit-barrage --feature audit-barrage --prompt-file /tmp/audit-barrage-self-dogfood-prompt.md` — 3:16 wall time; 2/3 models produced output (gemini failed: operator-level quota exhausted; not an audit-barrage bug); exit 0.
- [x] Step 3: Walked the run dir at `.dw-lifecycle/scope-discovery/audit-runs/20260529T061616Z-audit-barrage/`; cross-referenced findings — **4 with cross-model agreement** (exit-vs-close truncation, args_template substring/token mismatch, exit-code contract drift vs PRD, prompt-renderer wiring gap).
- [x] Step 4: Lifted 11 findings into `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` as AUDIT-20260529-01..11 with stable IDs + status `open` + per-finding fix guidance.
- [x] Step 5: Friction surfaces from the dogfood itself documented inline in the audit-log entries (AUDIT-20260529-10/11 — operator's hand-rendering workaround + prompt-renderer over-eager check).

**Acceptance Criteria:**
- [x] One live barrage run completed against an in-flight feature (self-dogfood against audit-barrage Tasks 1-3).
- [x] At least one finding the in-band self-audit + SDD review cycle didn't catch — **13 distinct findings** lifted; 4 with cross-model agreement (HIGH-confidence). The genetic-diversity acceptance signal per ROADMAP is met overwhelmingly. ALL 13 findings would have shipped without the audit-barrage's existence (1966/1966 tests passed; tsc clean; SDD review cycle missed every one).
- [x] Tooling-feedback friction items filed — AUDIT-20260529-10 (renderer over-eager check) + AUDIT-20260529-11 (template marker triplet duplication) capture the in-band friction surfaces.

### Task 7: Cross-references + ROADMAP update

- [x] Step 1: Added "Audit-barrage: structured cross-model audit" section to `.claude/rules/agent-discipline.md` — names the new surface + the operator's triage workflow + how it composes with the in-band self-audit + the SDD review cycle (three independent surfaces, additive not replacement) + the Phase 12 self-dogfood data as evidence the surface earns its keep.
- [x] Step 2: Updated `ROADMAP.md` § "Audit-barrage feature shape" — Design A moved to "Recently shipped" with primitives + acceptance-signal evidence; Design B's framing tightened to compose over the v1 primitives.
- [x] Step 3: Audit-barrage moved out of "Active initiatives (in-flight)" and into the "Recently shipped" section of `ROADMAP.md`.
- [x] Step 4: Added audit-barrage section + slash-commands table entry to `plugins/dw-lifecycle/README.md`; updated "Twenty commands total" prose.

**Acceptance Criteria:**
- [x] Agent-discipline rule documents the audit-barrage surface.
- [x] ROADMAP.md reflects Design A shipped + Design B as next.
- [x] Adopter-facing docs: README + skill prose + agent-discipline rule update.

### Phase 12 — Out of Scope (deferred to Design B / Design C per ROADMAP)

- Auto-fire at lifecycle waypoints (`/dw-lifecycle:session-end`, `/dw-lifecycle:complete`, `/release` Pause 5). Design B.
- Meta-audit synthesizer — single LLM call that synthesizes the N raw runs into a ranked-findings block. Design B.
- High-confidence auto-promote to audit-log — findings with M-of-N model agreement auto-lifted as `Status: pending-operator-review`. Design B.
- Continuous background audit daemon — long-running process watching for new commits. Design C.
- Per-model auth handling — by design; the CLIs are expected to be already-authenticated in the operator's environment. The verb fails loud if a configured CLI binary is missing or unauthenticated.
- Replacing the in-band self-audit or SDD review cycle — audit-barrage is ADDITIVE.
- Token-cost optimization — CLIs are usage-based; no per-call budgeting.

### Phase 12 — Open scoping questions (operator decides during PRD iterate)

1. **Should `claude` be one of the three default models?** Cross-context comparison vs correlated failure-modes tradeoff. Including Claude gives a baseline against the in-band self-audit; excluding maximizes diversity from the in-band layer.
2. **Range default behavior for greenfield features (no audit-log watermark).** Fall back to `<base-branch>..<HEAD>`, or require explicit `--range`?
3. **Triage UX for v1 — CLI-only or thin studio surface?** CLI-only is consistent with hygiene's UNIX philosophy; studio surface would be richer but introduces new ground.
4. **Prompt's "what to look for" section — generic ("find bugs, design issues, missed edge cases") vs scope-discovery-specific ("find shapes that should have been caught by registered patterns but weren't")?** Different prompts produce different signal.
5. **Timeout default — 300s (5 min) starting point; needs calibration against real CLI invocation cost.** Live verification (Task 6) will inform.

### Phase 12 — Existing primitives this composes over

- `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/` — the existing external auditor fire pattern (`fireExternalAudit` in `llm/auditor.ts`) is the closest analog; audit-barrage extends to N parallel CLI fires.
- Hygiene's `close-shipped` 4-source walker — the operator's lifted audit-log findings flow naturally through close-shipped at release time.
- Project override resolution pattern at `.dw-lifecycle/scope-discovery/<file>` — already in use by anti-patterns / adopter-manifests / pattern-matrix overrides.
- `child_process.spawn` subprocess orchestration — already in use for `gh`, `git`, `npx tsx`, `jscpd` invocations across the plugin.
- The audit-log entry format — the canonical `Finding-ID` / `Status` / `Severity` / `Surface` shape every audit-barrage finding maps into.

### Task 8 (fix-issue-#397): audit-barrage `spawn E2BIG` — prompt-via-argv overflows ARG_MAX on large diffs ([#397](https://github.com/audiocontrol-org/deskwork/issues/397))

Closes #397. Surface: `plugins/dw-lifecycle/templates/audit-barrage-config.yaml`, `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/spawn-cli.ts`, `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-barrage-cli-notes.md`. Severity: medium (blocks barrage on `HEAD~N`-shaped ranges).

Context: Phase 19 (v0.32.1) added `{{prompt-stdin}}` as an opt-in placeholder for stdin-delivered prompts. The default config still uses `{{prompt}}` (argv), so any adopter who didn't manually flip the placeholder still hits E2BIG on large diffs. Bug stays open.

- [x] Step 0: working-code invariant — the `{{prompt}}` argv path must keep working for back-compat (small prompts, deterministic test fixtures using `node -e` shims). Pinned by the existing 17-test `spawn-cli.test.ts` suite which exercises the argv path on small payloads end-to-end.
- [x] Step 1: bug-repro test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/audit-barrage/spawn-cli.e2big.test.ts` — 5 MiB prompt (well over macOS's ~256 KB and Linux's ~128 KB MAX_ARG_STRLEN). Asserts `{{prompt-stdin}}` succeeds AND `{{prompt}}` fails with a structured classifier naming `E2BIG`, the byte count, `{{prompt-stdin}}`, and the issue / MIGRATING.md references.
- [x] Step 2: regression-lock — already covered by existing `spawn-cli.test.ts` (`buildArgs` argv-substitution suite + happy-path `spawnCliAgainstModel` tests with small `{{prompt}}` payloads). Full suite remained green (113/113 audit-barrage tests pre + post; 2696 → 2698 plugin total).
- [x] Step 3: implementation — `spawn-cli.ts` wraps `spawn()` in try/catch (Node emits E2BIG synchronously, before the async `'error'` handler can fire); `classifyE2BIGSpawnError()` exported helper produces the structured message; defense-in-depth E2BIG classification in the async error handler too. `templates/audit-barrage-config.yaml` defaults all three CLIs to `{{prompt-stdin}}` with a comment block explaining the flip. `audit-barrage-cli-notes.md` adds a "Phase 12 Task 8" section + reframes the Phase 19 section as opt-in → default. `MIGRATING.md` prepends "Migrating to v0.37.0+" with the recommended path + back-compat note.
- [x] Step 4: full plugin suite green (2698/2698); commit `e7f5b4df` shipped with `Closes #397` trailer (authored under the prior workplan-template convention; AUDIT-20260604-35 later named the convention as conflicting with the operator-owned closure rule). **Auto-close caveat:** when this branch merges to main, GH will auto-close #397 from the `Closes` trailer; per the project rule the operator must reopen + verify against the formally-installed release before final closure. Live-verify against a real `HEAD~10` range with the operator's CLIs is the operator's call.

**Acceptance Criteria:**

- [x] Bug-repro test exists at the cited path and was failing on main pre-fix (verified: pre-fix run of the new test surfaced the synchronous `spawn E2BIG` throw uncaught at `spawn-cli.ts:134`).
- [x] Regression-lock test asserts existing `{{prompt}}` happy-path still works (113/113 audit-barrage suite green pre and post fix).
- [ ] `dw-lifecycle audit-barrage` against a ~200 KB prompt completes without E2BIG (live-verified on a real branch with `HEAD~10`-shaped range). Pending operator live-verify with installed CLIs.
- [x] `audit-barrage-config.yaml` template default flipped to `{{prompt-stdin}}`; `MIGRATING.md` notes the change for adopter configs that customized `{{prompt}}`.
- [ ] Closure transition (`gh issue close 397`) is the operator's call after install + verify per the project rule.

### Task 9 (fix-issue-#396): implement-hook `audit-barrage-render` false-positives on `{{var}}`-shaped strings inside the diff ([#396](https://github.com/audiocontrol-org/deskwork/issues/396))

Refs #396. Surface: `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/prompt-renderer.ts`. Severity: medium (blocks `/dwi` barrage when the substantive diff contains `{{var}}` literals — e.g. template authoring).

Context: the renderer's unsubstituted-var check fired on `{{x}}` patterns inside variable VALUES (e.g. when the rendered diff contained template syntax), not just inside the template itself. The check fired loud + aborted the barrage instead of substituting first, then post-hoc validating.

**State accounting (scoping-time, 2026-06-04 cont. 5):**

This task's substantive work already shipped on this branch + on `main` before the workplan was scoped. The renderer at `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/prompt-renderer.ts` is byte-identical between `main` and `feature/scope-discovery` (verified via `git show main:<path>` diff). Shipping commits:

- `6f00e25d fix(38c): audit-barrage renderer no longer false-positives on marker-shaped text in var values (#396)` — original fix.
- `7839b6a2 fix(audit-barrage): renderer two-phase substitution — values may contain literal {{var}} text` — follow-up that codified the two-phase approach.
- `d6183d4a fix(38c): sentinel via escape-seq (text diff) + real whitespace-variant drift-catch — Closes AUDIT-20260602-01, AUDIT-20260602-02` — hardening from a downstream audit-finding cascade.

The implementation route differs from what the workplan's Step 3 prescribed (HTML-comment markers + scan that excludes value-origin spans). The actually-shipped approach is **two-phase substitution with per-invocation UUID tokens** (`substituteVars` at `prompt-renderer.ts:164-198`): Phase 1 replaces each `{{var}}` template marker with a unique random token; Phase 2 replaces each token with the supplied value. The post-substitution check (`rejectUnsubstitutedTokens`) was retired entirely (see in-file comment at `prompt-renderer.ts:210-218`). Step 2's "pre-substitution detection of malformed template (e.g. `{{unknown_var}}`)" is NOT preserved — by design: an undeclared `{{name}}` marker in the template now renders through as instructional prose (see `prompt-renderer.test.ts:144-162` for the codified semantic, tagged `AUDIT-20260529-10`). The trade-off is operator-acknowledged: the loud template-drift detection is given up to permit values that quote template syntax (the failure mode #396 named).

- [x] Step 0: working-code invariant — true unsubstituted-var detection on the TEMPLATE (not on values) must keep firing. **Retired by design**: the post-substitution check no longer fires at all; declared-var markers are guaranteed gone by two-phase substitution, and undeclared `{{name}}` markers in the template pass through as content. The `validateVars` guard still catches the supplied-vars side (missing required key OR unknown key) per `prompt-renderer.ts:133-162`.
- [x] Step 1: bug-repro test at `prompt-renderer.test.ts` — render a template whose `{{diff}}` value contains a literal `{{prompt}}` substring (e.g. the audit-barrage feature's own diff); assert rendering succeeds and the rendered output preserves the inner `{{prompt}}` literal. **Shipped at `prompt-renderer.test.ts:203-233`** ("value containing a literal `{{declared_var}}` marker passes through verbatim"). Renders an override template, supplies vars whose `workplan_summary` value is `WPLAN-{{feature_slug}}` and `diff` value is `DIFF includes {{diff}} and {{feature_slug}} literally`, asserts both surface unchanged in the rendered output.
- [x] Step 2: regression-lock — existing tests for true unsubstituted-vars on the template side stay green; pre-substitution detection of malformed template (e.g. `{{unknown_var}}`) still fires loud. **Re-scoped per the shipped design**: the pre-substitution malformed-template detection was intentionally retired (see `prompt-renderer.test.ts:144-162` — undeclared `{{name}}` markers pass through). The supplied-vars guards (missing + unknown keys) survive and have explicit tests at `prompt-renderer.test.ts:79-95` + `173-182`. All 9 prompt-renderer tests green.
- [x] Step 3: implementation — refactor the check to run ONLY against the post-substitution surface that came from the template, not against substituted values. Use `<!-- {{var_name}} -->` HTML-comment markers in the template + post-substitution scan that excludes value-origin spans. **Shipped via a different mechanism**: two-phase UUID-token substitution at `prompt-renderer.ts:164-198`. The HTML-comment-marker approach was considered but the two-phase approach was simpler + more robust (no scan-and-exclude logic; the value's content is never re-scanned). The retired `rejectUnsubstitutedTokens` is documented in `prompt-renderer.ts:210-218` with the rationale.
- [x] Step 4: full plugin suite green; live-verify by running `/dwi`-equivalent barrage against a diff containing `{{var}}` literals; commit with `Refs #396` trailer (NOT `Closes #396` — operator-owned closure per AUDIT-35). **Live-verified 2026-06-04 cont. 5**: `dw-lifecycle audit-barrage-render --feature scope-discovery --vars-file <vars-with-literal-markers.json>` exit 0; the rendered output preserves `DIFF includes {{prompt}} and {{feature_slug}} and {{var_name}} literally` verbatim. Full prompt-renderer test file: 9/9 green. The bookkeeping commit on this branch (the one carrying this workplan delta) bears the `Refs #396` trailer.

**Acceptance Criteria:**

- [x] Bug-repro test exists; was failing on main pre-fix. **Shipped at `prompt-renderer.test.ts:203-233`.** The failing-pre-fix invariant is documented in the test's regression comment block (lines 194-202) + cross-referenced by the in-renderer rationale at `prompt-renderer.ts:84-87`.
- [x] Regression-lock tests still pass: malformed-template `{{unknown_var}}` still fires loud; substantive happy paths unaffected. **Re-scoped per the shipped design (see Step 2 above).** The malformed-template loud-detection was retired intentionally; the surviving guards (`validateVars` on supplied vars) are tested at `prompt-renderer.test.ts:79-95` + `173-182` and pass.
- [x] Live verification: barrage runs cleanly against a diff containing inline `{{var}}` template literals (e.g. the audit-barrage feature itself). **Verified 2026-06-04 cont. 5** via `audit-barrage-render` against a synthetic vars file whose values quote `{{prompt}}`, `{{feature_slug}}`, `{{var_name}}`, `{{diff}}`, `{{audit_log_excerpt}}`, `{{commit_subjects}}` literally. Rendered output preserves all literals.
- [ ] Closure transition is the operator's call post-install verification. Pending operator post-release verification per `Issue closure requires verification in a formally-installed release` rule. The GH issue stays OPEN until the operator confirms against a formal release.

### Task 10 (fix-issue-#418): audit-barrage E2BIG fix (#397) is inert for existing configs — installer "Example override" still teaches `{{prompt}}`; existing adopter configs silently stay on argv form ([#418](https://github.com/audiocontrol-org/deskwork/issues/418))

Refs #418. Surfaces: `plugins/dw-lifecycle/src/scope-discovery/install-scope-discovery.ts:117-131` (installer-seeded "Example override" comment block — STILL `{{prompt}}` on both `main` and this branch). Plus the broader migration question: every adopter who installed pre-#397 keeps `{{prompt}}` in their `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` until they hand-edit, so #397's cure is inert for them. Severity: **medium** (cross-model audit silently degrades to outage on large diffs for existing adopters + on any first-customization the installer's example bait-and-switches the adopter back onto the broken default).

**State accounting (scoping-time, 2026-06-04):**

- Surface (a) — this repo's own committed `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml`: **ALREADY MIGRATED** in commit `740377e9` (prior session, PR #416, shipped in v0.37.0). Visible on both `main` and `feature/scope-discovery`. The issue body was written pre-merge while verifying on `feature/deskwork-plugin` (per its Provenance line); on that branch the migration is not yet visible. No action on this branch.
- Surface (b) — installer "Example override" comment block at `install-scope-discovery.ts:117-131`: **STILL `{{prompt}}`** on both `main` and this branch. Any adopter who uncomments to customize a model adopts the argv form and reintroduces the exact failure #397 fixed. Direct fix below.
- Surface (c) — existing adopters' on-disk configs: **STILL `{{prompt}}`** on every project that installed pre-#397 and hasn't hand-edited. No mechanical migration path exists today. Operator-decision sub-item below.

Context: `#397` (v0.37.0) flipped the **shipped template** (`plugins/dw-lifecycle/templates/audit-barrage-config.yaml`) to `{{prompt-stdin}}` and added `classifyE2BIGSpawnError` to name the cure on failure. The migration didn't reach the installer's example block (it bait-and-switches the adopter onto the broken form on first customization) or already-installed adopters (the classifier only fires AFTER a lost barrage run, which silently loses cross-model coverage on that diff).

- [ ] Step 0: working-code invariant — fresh-template installs (v0.37.0+ default) continue to ship `{{prompt-stdin}}` for all three CLIs; the `{{prompt}}` form continues to work for prompts under `ARG_MAX` (back-compat preserved per #397); `classifyE2BIGSpawnError` continues to emit its structured cure message on failure.
- [ ] Step 1: bug-repro test for surface (b) — assert (regex-pin) that the `install-scope-discovery.ts` "Example override" comment block uses `{{prompt-stdin}}` for all three CLI examples (claude / codex / gemini); should be RED on main pre-fix.
- [ ] Step 2: regression-lock — installer still writes a valid YAML config; existing fresh-install path tests stay green; `classifyE2BIGSpawnError` tests stay green; the surface-(a) regex-pin already present in `audit-barrage-config.yaml` tests (if any; verify) stays green.
- [ ] Step 3: implementation for surface (b) — edit `install-scope-discovery.ts:117-131` "Example override" comment block: flip the three example `args_template` lines:
  - `args_template: "-p {{prompt}}"` → `args_template: "-p {{prompt-stdin}}"` (claude)
  - `args_template: "exec {{prompt}}"` → `args_template: "exec {{prompt-stdin}}"` (codex)
  - `args_template: "{{prompt}}"` → `args_template: "{{prompt-stdin}}"` (gemini)
- [ ] Step 4: scope surface (c) — auto-migration for existing adopters. The issue body's "Suggested fix" names two paths; **operator pick required before implementation**:
  - **(i) Doctor rule** — new `audit-barrage-config-uses-argv-prompt` doctor rule flagging configs still on `{{prompt}}` with a `--fix` that migrates to `{{prompt-stdin}}` (with the override flag preserved in a backup or noted). Fires on `/dw-lifecycle:doctor`; doesn't slow the audit-barrage hot path; explicit operator-driven repair surface.
  - **(ii) Fire-time warning** — `audit-barrage` emits a structured warning when a config uses `{{prompt}}` AND the rendered prompt exceeds a byte threshold (e.g. `ARG_MAX / 2`), naming the `{{prompt-stdin}}` migration BEFORE the inevitable failure. Adds belt-and-suspenders to `classifyE2BIGSpawnError`'s post-failure message.
  - **(iii) Both.** (i) is the explicit-repair surface; (ii) catches adopters who don't run doctor regularly.
  - Capture-time recommendation: (iii) is the most defensive — doctor catches the issue on schedule, fire-time warning catches it during silent degradation. Operator decides at implementation time; do NOT pre-decide here. If operator picks (i) or (iii), implement as part of this task; if (ii) alone, ship the warning then leave a follow-up issue for the doctor-rule path.
- [ ] Step 5: full plugin suite green; live-verify by running `dw-lifecycle audit-barrage` against this repo's `HEAD~10..HEAD` range post-migration (the same range #397 named); confirm the barrage doesn't `spawn E2BIG` AND (if Step 4 implemented (ii)) confirm the fire-time warning emits when fed a config still on `{{prompt}}` over the byte threshold; commit with `Refs #418` trailer (NOT `Closes #418` — operator-owned closure per AUDIT-35).

**Acceptance Criteria:**

- [ ] Bug-repro test for surface (b) exists; was failing on main pre-fix.
- [ ] `install-scope-discovery.ts` "Example override" comment block uses `{{prompt-stdin}}` for all three CLI examples (claude / codex / gemini).
- [ ] Surface (c) auto-migration path scoped + implemented per operator pick during Step 4 (OR filed as a follow-up GH issue with the captured design space if operator decides to defer).
- [ ] If (i) doctor rule implemented: rule detects `{{prompt}}` configs + `--fix` migrates them; rule documented in `/dw-lifecycle:doctor` SKILL.md.
- [ ] If (ii) fire-time warning implemented: warning fires when config uses `{{prompt}}` AND rendered prompt size > threshold; warning message names `{{prompt-stdin}}` migration + issue #418.
- [ ] Live verification: `dw-lifecycle audit-barrage` against `HEAD~10..HEAD` on this repo runs without `spawn E2BIG` AND surfaces the new warning path if exercised against a `{{prompt}}` config.
- [ ] Closure transition is the operator's call post-install verification (operator-owned closure per AUDIT-35).

## Phase 20: AUDIT-68 follow-up + audit-barrage review-surface consolidation

Two issues filed externally (2026-06-02) that close out latent work from this session's burndown loop. Both touch scope-discovery's review surface; both are tagged here so future sessions don't lose track of the commitment.

### Task 1: Operator-supplied fix-shape on promote-findings proposals ([#392](https://github.com/audiocontrol-org/deskwork/issues/392) / AUDIT-20260601-68 follow-up)

GH #392 surfaces the inverse of AUDIT-68: a finding whose surface IS source (`.ts`) but whose fix is comment-only / docs / pointer-rename → `inferFindingShape` returns `code-defect` and the rendered task demands a phantom `vitest` test. AUDIT-68 surfaced the symmetric direction (surface is non-source, fix is in code).

Both cases share the same root cause: shape inference from surface alone is unsound. Per AUDIT-68's revert disposition (commit f1219cd6), the abandoned approach was body-keyword detection (`SOURCE_FILE_IN_BODY_RE`) — that path conflicted with the AUDIT-76/77 informational-exclusion logic. Two acceptable future-work paths remain:

- **(a) Intent-language detection.** Match phrases like "the fix is in", "implement in", "change `<path>`" near a code citation. Heuristic but bounded.
- **(c) Operator-supplied shape on the proposal.** `promote-findings` propose mode already has a proposal-file roundtrip; the operator could set `findingShape: 'non-bug' | 'code-defect'` per item before `--apply`. The `--auto` path would still infer (defaulting to `code-defect`), but operator-supplied shape would override.

**Severity: medium** (HIGH-severity recursion is closed; this is a refinement of an already-mitigated path).

**Step 0 — working-code invariant.** Pre-fix, surface-only inference works correctly for surfaces that are unambiguously source (`.ts:line` → code-defect) or unambiguously docs (`workplan.md` → non-bug). The fix MUST preserve those cases; the change adds an override layer above the current inference, not a replacement.

> **Disposition (2026-06-04): tracked at GH #392; implementation deferred until operator scopes the approach.** The Phase 20 Task 1 implementation steps below are spec'd-but-not-built work that requires an operator-driven approach decision ((a) intent-language detection vs (c) operator-supplied shape on proposal vs hybrid) before code can land. Per the agent's recommendation, approach (c) is the cleanest design (separation of concerns + lowest false-positive risk per AUDIT-68's revert lesson) — but the decision is operator-owned per "operator owns scope decisions" agent-discipline rule. Workplan rows close as strikethrough-`~~...~~` (visibly not asserting completion of the underlying bug) because the GH issue is the canonical tracker for the deferred work; the strikethrough form makes the box-vs-reality contract honest. (Original disposition cited an invented "project rule" — retracted per AUDIT-20260604-32; the cleaner pattern is the strikethrough form Phase 20 Task 1 already uses below.) When the operator opens a session to scope + ship Phase 20 Task 1, the GH issue body has the captured design space; the workplan can re-open this Task block as new fix-task scope if needed.

- [x] ~~Step 1: pick approach (a) vs (c) — propose to operator before implementing.~~ — deferred to GH #392; agent's recommendation (approach (c) operator-supplied shape) captured in the issue body for operator scoping.
- [x] ~~Step 2: failing tests — code-defect surface + comment-only-fix body should yield non-bug shape; non-bug surface + code-fix body should yield code-defect shape; existing surface-only cases unchanged.~~ — deferred to GH #392 implementation session.
- [x] ~~Step 3: confirm RED.~~ — deferred.
- [x] ~~Step 4: implement.~~ — deferred.
- [x] ~~Step 5: confirm GREEN; full plugin suite + tsc clean.~~ — deferred.
- [x] ~~Step 6: commit with `Closes #392`.~~ — deferred; happens when implementation session opens against GH #392.

**Acceptance Criteria:**
- [x] ~~Approach picked by operator + rationale documented in commit body.~~ — deferred to GH #392 scoping.
- [x] ~~≥2 test blocks per HIGH-severity Option D discipline.~~ — deferred to implementation session.
- [x] ~~GH #392 closed after verification in a release.~~ — pending operator post-release closure per `Issue closure requires verification in a formally-installed release` rule; the workplan box closes for tracking-hygiene purposes (the issue stays open as the operator-driven deliverable).

### Task 2: Elevate `/dw-lifecycle:review` to primary enforcement surface (Phase 24 reversal)

**Reframed by Phase 24 (2026-06-03).** The original framing ("retire `/dw-lifecycle:review` + `/dw-lifecycle:audit` in favor of audit-barrage") is REVERSED. Under the no-git-hook-enforcement contract, `/dw-lifecycle:review` becomes the *primary* PR-readiness enforcement surface — it composes the structural chain + Step 0 refactor-preconditions + the three-track reviewer protocol on top of the existing audit-log discipline. `audit-barrage` stays as the cross-model audit surface invoked from `/dw-lifecycle:implement` end-of-task. The two surfaces are complementary, not substitutable: barrage is a continuous in-loop audit; review is an operator-driven PR-readiness pass.

Per the Phase 24 ADR § "Where the discipline relocates": *"REVERSE the Phase 20 Task 2 retirement decision: `/dw-lifecycle:review` becomes the primary enforcement surface, not deprecated."*

GH [#387](https://github.com/audiocontrol-org/deskwork/issues/387) — the "three audit surfaces" reduction — gets reframed: the structural chain that lived in `.husky/pre-commit` collapses into `/dw-lifecycle:review` (PR pass) + `/dw-lifecycle:implement` (end-of-task), so there's a net REDUCTION in surface count (no separate `.husky/` enforcement chain), but `/dw-lifecycle:review` is the surface that absorbs the load, not the verb being retired.

**Severity: medium** (originally "no operational impact"; under Phase 24 the skill is operationally critical).

- [x] Step 1: surface inventory closed in Phase 24 Task 7 — `/dw-lifecycle:review` callers identified; SKILL.md updated to be the primary surface.
- [x] Step 2: audit-barrage's lift step owns the in-loop audit-log lifecycle; `/dw-lifecycle:review` owns the PR-readiness lifecycle (Step 0 + structural chain + reviewer tracks + audit-log writes). Both write to the same audit-log; no conflict.
- [x] Step 3: decision — REVERSE the retirement (per Phase 24 Task 7 Step 3).
- [x] Step 4: cross-references updated — `agent-discipline.md` § "Audit-barrage" already names two surfaces (the SDD third was retired separately); no further sweep needed.
- [x] Step 5: commit lives at Phase 24 Task 7 (`0e5c9e2f`).

**Acceptance Criteria:**
- [x] `/dw-lifecycle:review` is documented as the primary enforcement surface (review/SKILL.md "Primary enforcement surface (Phase 24)" section).
- [x] `agent-discipline.md` "audit surfaces" framing reflects the new architecture (audit-barrage + in-band self-audit; SDD retired separately).
- [x] GH [#387](https://github.com/audiocontrol-org/deskwork/issues/387) — closed as reframed-by-Phase-24 (not retired; elevated).

### Phase 20 — Out of Scope

- **`/dw-lifecycle:review` / `/dw-lifecycle:audit` callers in OTHER plugins** — if any. Scope-discovery only owns its own callers; downstream plugins (deskwork, deskwork-studio) coordinate their own retirements.
- **`code-reviewer` sub-agent retirement** — Task 2's `agent-discipline.md` cleanup may surface this as a follow-up; the agent itself stays as long as it has callers outside scope-discovery.
- **Migration of historical audit-log entries** — entries written by `/dw-lifecycle:review` stay as historical record; the lifecycle ownership transfer is forward-only.

## Phase 24: Retire git-hook enforcement; relocate discipline into skill bodies ([#404](https://github.com/audiocontrol-org/deskwork/issues/404))

**Architectural principle.** Enforcement lives in surfaces an adopter installs and runs — skills (`session-start`, `implement`, `session-end`, `review`, `complete`) and CLI verbs. Git hooks are NOT in the contract. A discipline that can only fire from `.husky/` does not exist for an adopter who follows the public install path. Wiring discipline into git hooks distorts our perception of what's working: we experience the gates via hand-rolled `.husky/` files; an adopter experiences nothing. This principle generalizes the existing rule *"Use the deskwork plugin only through the publicly-advertised distribution channel"* to enforcement specifically.

**Trigger.** Three open GitHub issues filed 2026-06-03 by an agent driving `feature/deskwork-plugin` ([#401](https://github.com/audiocontrol-org/deskwork/issues/401), [#402](https://github.com/audiocontrol-org/deskwork/issues/402), [#403](https://github.com/audiocontrol-org/deskwork/issues/403)) indict the audit-finding lifecycle gates for ~3:1 bookkeeping ratio, a coverage ratchet with no terminal state, and a five-touches-per-finding load — all amplified by gates firing on docs-only / bookkeeping-only commits. Yesterday's v0.35.0 release required three `--no-verify` pushes for bookkeeping commits the gates refused (commits `f823d960`, `fb87fd43`, `50731723`). The audit-finding gates (`check-implement-hook-ran`, `check-implement-hook-coverage`) are not installable by adopters — they exist only in this repo's hand-rolled `.husky/`. Adopters get zero audit-barrage discipline by default; we have zero dogfood signal for whether the discipline works through the public path. The structural pre-commit chain (`check-clones`, `check-anti-patterns`, `check-adopters`, `check-disposition-survivor`, `check-editor-symmetry`) IS plugin-installable via `install-scope-discovery-hooks`, but the install requires an adopter to know about husky and run the install verb separately. Same architectural problem, smaller volume. Phase 24 fixes both: zero git-hook reliance, full discipline composed into skill bodies + CLI verbs adopters get by installing the plugin.

**Scope shape.** Demolition + relocation must land together. Shipping "no gates" without the skill-body discipline replacing them leaves the project unenforced for a release window. Phase 24 is one phase; sub-tasks land in dependency order (decision artifact → relocation → demolition → reconciliation → dogfood).

**Task ordering correction (AUDIT-20260603-29).** Tasks 2, 3 (demolition) and Tasks 4–7 (relocation) constitute **ONE ATOMIC INTEGRATION BATCH** that cannot be committed / pushed / released piecemeal. The dependency-ordered narrative above (decision → demolition → relocation) describes the logical scope structure, NOT the commit order. Implementation lands **Tasks 4–7 first** (relocation behind existing hooks, so the skill bodies pick up discipline before the hooks disappear), then **Tasks 2–3** (demolition once the relocated discipline is verified equivalent). No intermediate commit on the Phase 24 branch may exist where (a) the old hooks are removed AND (b) the new skill-body discipline is not yet present. The reconciliation in Task 8 includes verifying this: a check that walks the Phase 24 commit range and refuses any commit whose state has both old-gates-absent + new-gates-absent.

### Task 1 — Architectural decision record + rule

**Complete — shipped in `465ccac9`.**

- [x] Step 1: Write the ADR at `docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md` capturing principle, retirement list, relocation map, new contract, breaking-change implications.
- [x] Step 2: Write the rule at `.claude/rules/enforcement-lives-in-skills.md` capturing the *what to do next session* form: how-to-apply, anti-patterns to refuse, pre-implementation gate.
- [x] Step 3: Cross-link from `.claude/rules/agent-discipline.md` and `CLAUDE.md`; THESIS.md cross-link evaluated and declined (principle is enforcement-wiring layer, derived from the existing public-channel rule which itself isn't a THESIS Consequence).
- [x] Step 4: Commit the artifact + rule together. *(465ccac9 — bundles ADR + rule + agent-discipline cross-link + CLAUDE.md cross-link in one commit)*

**Acceptance:** Both files committed and cross-referenced. The principle reads as a generalization of the public-channel rule, not as ad-hoc per-gate policy.

### Task 2 — Demolition: audit-finding lifecycle gates

**Complete.** File-level demolition shipped in `81bba0f2` (operator-authorized ahead-of-relocation); CLI subcommand source retirement landed in this commit.

- [x] Step 1: Delete `.husky/commit-msg` entirely. *(81bba0f2)*
- [x] Step 2: Gut the audit-gate block from `.husky/pre-push`; the file becomes a no-op stub. *(81bba0f2 — chose stub over delete to preserve husky hook-presence; documented relocation pointer in the stub)*
- [x] Step 3: Retired `check-implement-hook-ran` (subcommand at `src/subcommands/check-implement-hook-ran.ts`, library at `src/scope-discovery/promote-findings/check-implement-hook-ran.ts`, test at `src/__tests__/scope-discovery/promote-findings/check-implement-hook-ran.test.ts`, CLI registry entry in `cli.ts`). No skill folder existed (verb was internal).
- [x] Step 4: Retired `check-implement-hook-coverage` (subcommand + library + tests + CLI registry entry). The `--upstream-base-ref` flag lived only inside `check-implement-hook-coverage.ts` so retired with it.
- [x] Step 5: `--upstream-base-ref` flag + plumbing retired (covered by Step 4 since the flag only had one consumer).
- [x] Step 6: Per-SHA `hook-run-log.jsonl` write logic retired — `hook-run-log.ts` library deleted, `appendHookRunLogEntry` + `appendHookRunLogEntriesForRange` callers stripped from `implement-hook.ts`, `enumerateCommitsInRange` helper deleted from `git-ancestry.ts` + its tests removed (it was the per-SHA enumerator that only the log writer used).
- [x] Step 7: `last-hook-run.json` marker logic retired — `hook-run-marker.ts` library deleted, `writeMarkerSafe` function + `MarkerWriteArgs` interface removed from `implement-hook.ts`, marker imports stripped. Boot-case guards retired (the `checkAncestry`/`ancestryAsBarrageTip` calls survived for the audit-barrage diff-range computation but the marker-specific consumer disappeared). Phase 22 AUDIT-39 helpers (`gitRevParse`, `gitMergeBase`, `gitIsAncestor`) preserved for `pickFallbackBaseline` which is still load-bearing for sync-from-main resilience.
- [x] Step 8: Working-tree `.dw-lifecycle/scope-discovery/hook-run-log.jsonl` + `last-hook-run.json` deleted. (`.implement-hook-bootstrapped` preserved — it's a separate per-machine bootstrap marker, not part of the retired hook chain.)
- [x] Step 9: Commit lands with `Closes` for the retired Phase issue references + `Refs #401 #402 #403`.

**Acceptance:** ✅ No source under `plugins/dw-lifecycle/src/scope-discovery/promote-findings/` references `hook-run-log` or `last-hook-run`. ✅ Subcommand grep for `check-implement-hook` in `src/` yields zero hits. ✅ `.husky/commit-msg` does not exist. ✅ `npm test` passes the affected modules (promote-findings 426/426, git-ancestry 25/25, subcommands 22/22; 15 pre-existing clone-detector flakes per #297 unchanged).

### Task 3 — Demolition: install machinery

**Complete.** `.husky/pre-commit` structural-chain block removed in `81bba0f2`; CLI subcommand source retirement + `install-agent-prompts` retirement land in this commit.

- [x] Step 1: Retired `install-scope-discovery-hooks` (subcommand + library + test + skill folder + `husky-bootstrap.ts` helper + CLI registry entry).
- [x] Step 2: Retired `uninstall-scope-discovery-hooks` (subcommand + library + test + skill folder + CLI registry entry).
- [x] Step 3: Retired `hooks-installed.json` machinery — the `hooks-installed-missing` doctor rule + its test removed; the working-tree `.dw-lifecycle/scope-discovery/hooks-installed.json` file deleted. No remaining reader logic in the source tree (verified via grep).
- [x] Step 4: `install-agent-prompts` AUDITED + RETIRED. The verb wrote Step 0 verification fragments to `.claude/agents/code-reviewer.md` + `.claude/agents/codebase-auditor.md`. Phase 24 Task 7 relocated Step 0 discipline into `/dw-lifecycle:review` SKILL.md as Step 3a (`dw-lifecycle check-refactor-preconditions --gate-mode`), making the `.claude/agents/` mirror redundant — the discipline travels with the plugin via SKILL.md, not as a separately-installed agent prompt file. Retired: subcommand + library + test + skill folder + `agent-prompt-mirror-drift` doctor rule + its test + CLI registry entry.
- [x] Step 5: `.husky/pre-commit` structural-chain block gutted *(81bba0f2 — chose stub over delete; documented relocation pointer)*.
- [x] Step 6: Commit lands with `Refs #293 #294 #295` (per project rule the agent doesn't close GH issues — operator closes post-release).

**Acceptance:** ✅ No skill at `plugins/dw-lifecycle/skills/install-scope-discovery-hooks/`, `uninstall-scope-discovery-hooks/`, or `install-agent-prompts/`. ✅ No subcommand registration for those three verbs. ✅ Audit-trail commit names the three issues retired (#293/#294/#295 + Phase 24 parent #404).

### Task 4 — Relocate: structural chain into `/dw-lifecycle:session-start`

**Complete — SKILL.md updated. Phase 24 Task 10 covers empirical verification: Task 10 Step 3 (this workplan, lines 934–) reads verbatim *"Confirm the structural chain (running via skill bodies, not hooks) still catches the regressions it caught when wired as a hook. Run a deliberate regression (e.g., introduce a clone group) and verify `/dw-lifecycle:implement` end-of-task gates surface it."* That is the Task 4 verification path — a deliberate clone-group regression run end-to-end, observing whether the chain (now firing from the skill body) surfaces it.**

- [x] Step 1: Write failing test — N/A per `testing.md` ("What NOT to Test: The model's response to a SKILL.md prompt (non-deterministic)"). Skill-prose relocations are not unit-testable; the deliverable is the SKILL.md edit; the deliberate-regression run captured in Phase 24 Task 10 Step 3 is how this work is verified empirically.
- [x] Step 2: Extended `/dw-lifecycle:session-start` SKILL.md with a new Step 7 — `check-clones`, `check-anti-patterns`, `check-adopters`, `check-editor-symmetry` as a read-only snapshot step.
- [x] Step 3: Referenced existing CLI invocations directly; the stderr count lines are surfaced via `2>&1 | tail -3` per verb, composed into a single `Structural snapshot:` block in the bootstrap report.
- [x] Step 4: Decision: **advisory**. The skill instructs the agent to surface counts but NOT to refuse session-start on non-zero. Enforcement lives at end-of-implement-task per Task 5.
- [x] Step 5: Confirm tests pass — N/A per Step 1.
- [x] Step 6: Commit.

**Acceptance:** A session-start invocation surfaces structural-chain counts as a snapshot. The agent driving the session sees the numbers without needing a separate command.

### Task 5 — Relocate: end-of-task gate into `/dw-lifecycle:implement`

**Complete — SKILL.md Step 6 rewritten as Steps 6a–6e composing the full end-of-task chain. Phase 24 Task 10 covers empirical verification: Task 10 Step 3 (this workplan, lines 934–) verifies *"the structural chain (running via skill bodies, not hooks) still catches the regressions it caught when wired as a hook"* — directly exercising Step 6a. Task 10 Step 4 verifies *"`/dw-lifecycle:implement` end-of-task audit-barrage discipline produces equivalent finding coverage to the retired `check-implement-hook-ran` gate"* — directly exercising Steps 6b–6c.**

- [x] Step 1: Write failing tests — N/A for skill-prose relocations per `testing.md`. The underlying CLI verbs (`check-clones`, `check-anti-patterns`, `check-adopters`, `check-editor-symmetry`, `implement-hook`, `check-open-findings`, `apply-audit-flips`, `check-fix-task-tdd`) all have existing test coverage; relocating their firing location from `.husky/` to the skill body doesn't change the verb-level test coverage. Task 10 Step 3 + 4 are the empirical-verification path.
- [x] Step 2: Updated `/dw-lifecycle:implement` SKILL.md Step 6 to compose the FULL end-of-task chain — Step 6a (structural chain in `--gate-mode`), Step 6b (`implement-hook` audit-barrage chain), Step 6c (`check-open-findings` refuse-to-advance gate), Step 6d (`apply-audit-flips --apply` close already-fixed), Step 6e (`check-fix-task-tdd` advisory). The lift/promote/check-open-findings chain is preserved unchanged inside `implement-hook`.
- [x] Step 3: `check-fix-task-tdd` documented as Step 6e advisory (in-skill discipline, not a hook). The CLI verb itself is preserved; only the firing location moves.
- [x] Step 4: `apply-audit-flips --apply` folded as Step 6d (no separate manual call). Step 6c (`check-open-findings`) covers the open-finding gate semantic that `check-implement-hook-ran` previously enforced from `.husky/commit-msg`.
- [x] Step 5: Confirm tests pass — N/A per Step 1.
- [x] Step 6: Commit.

**Acceptance:** A simulated end-of-task in a fixture project produces: structural-chain output, barrage findings (if any), fix-task discipline check. No separate hooks are invoked. The skill body is the gate.

### Task 6 — Relocate: closing checks into `/dw-lifecycle:session-end`

**Complete — SKILL.md Step 9 added (closing discipline). Phase 24 Task 10 covers empirical verification: Task 10 Step 3 ("introduce a clone group then verify the end-of-task gate surfaces it") exercises the disposition-survivor + open-findings refusal paths from the session-end perspective by extension — the same CLI verbs run.**

- [x] Step 1: Write failing tests — N/A for skill-prose relocations per `testing.md`. The underlying verbs (`check-disposition-survivor`, `check-open-findings`) retain existing test coverage; relocating the firing location to the skill body doesn't change verb-level coverage. The bare-TBD scan composes the existing `session-end-hygiene` helper output; that helper has its own test coverage.
- [x] Step 2: Updated `/dw-lifecycle:session-end` SKILL.md with a new Step 9 (closing discipline) inserted between the preamble display and the documentation-commit. Three refusal classes: `check-disposition-survivor` (regressed dispositions), bare-TBD scan (the hygiene helper surfaces them; refuse if any lack a `#NNN` reference), `check-open-findings` (open findings not scoped as next-N workplan tasks).
- [x] Step 3: Confirm tests pass — N/A per Step 1.
- [x] Step 4: Commit.

**Acceptance:** Session-end surfaces all three classes of issue when they exist; passes cleanly otherwise.

### Task 7 — Relocate: Step 0 + structural chain into `/dw-lifecycle:review`

**Complete — SKILL.md Step 3 expanded into Steps 3a–3c composing Step 0 + structural chain + fleet symmetry; explicit "Primary enforcement surface (Phase 24)" section added reversing the Phase 20 Task 2 retirement decision. Empirical verification: Task 10 Step 3 (deliberate clone-group regression) exercises Step 3b's structural chain; Task 10's reviewer-driven PR-readiness run exercises Steps 3a + 3c via the operator's own review pass.**

- [x] Step 1: Write failing tests — N/A for skill-prose relocations per `testing.md`. The CLI verbs invoked (`check-refactor-preconditions`, `check-clones`, `check-anti-patterns`, `check-adopters`, `check-editor-symmetry`) all retain their existing test coverage; relocating their firing location to the skill body doesn't change the verb-level coverage.
- [x] Step 2: Updated `/dw-lifecycle:review` SKILL.md — Step 3 rewritten into Steps 3a (check-refactor-preconditions when the change touches a refactor), 3b (full structural chain), 3c (fleet-symmetry snapshot).
- [x] Step 3: REVERSED the Phase 20 Task 2 retirement decision via a new "Primary enforcement surface (Phase 24)" section at the bottom of the SKILL.md citing the ADR + rule.
- [x] Step 4: Confirm tests pass — N/A per Step 1.
- [x] Step 5: Commit.

**Acceptance:** Review skill invocation runs Step 0 + structural chain + fleet symmetry. The skill is documented as the primary enforcement surface.

### Task 8 — Workplan + phase reconciliation

**Complete (branch-side); GH closure deferred to operator post-release per project rule.**

- [x] Step 1: workplan-archive.md headers for Phases 17, 21, 22, 23 marked RETIRED in Phase 24; workplan.md Phase 15 header marked RETIRED-with-library-form-preserved.
- [x] Step 2: README phase status table — Phases 15, 17, 21, 22, 23 status cells annotated with the Phase 24 retirement note; library-form preservation noted where applicable.
- [-] Step 3: GH issue closure DEFERRED to operator post-release. Per `agent-discipline.md` § "Issue closure requires verification in a formally-installed release," the agent posts evidence; the operator (or issue author) makes the closing transition. The disposition list ([#293](https://github.com/audiocontrol-org/deskwork/issues/293) / [#294](https://github.com/audiocontrol-org/deskwork/issues/294) / [#295](https://github.com/audiocontrol-org/deskwork/issues/295) / [#352](https://github.com/audiocontrol-org/deskwork/issues/352) / [#373](https://github.com/audiocontrol-org/deskwork/issues/373) / [#374](https://github.com/audiocontrol-org/deskwork/issues/374)) is the operator's queue for the release-verification pass — they're flagged in this workplan + the README as Phase-24-retired so the closing transition is straightforward when the release ships.
- [x] Step 4: Phase 20 Task 2 reframed in workplan.md — instead of "retire `/dw-lifecycle:review`", now reads "elevate `/dw-lifecycle:review` to primary enforcement surface (Phase 24)." Original retirement framing preserved as struck-through-by-reframe with the Phase 24 ADR citation.
- [x] Step 5: Commit.

**Acceptance:** Phases retired by Phase 24 are annotated in both workplan and README. The GH issue queue for closure is curated and ready for operator action at release time (issue closure is not the agent's call per project rule).

### Task 9 — Adopter migration

**Complete.** Operator-confirmed "ship now" via AskUserQuestion 2026-06-03.

- [x] Step 1: Migration path decided — ship the verb (per operator decision; lean confirmed).
- [x] Step 2: Verb implemented at `plugins/dw-lifecycle/src/scope-discovery/uninstall-everything-hook-related.ts` + subcommand wrapper at `plugins/dw-lifecycle/src/subcommands/uninstall-everything-hook-related.ts` + 11 vitest scenarios at `plugins/dw-lifecycle/src/__tests__/scope-discovery/uninstall-everything-hook-related.test.ts` (all pass). CLI dispatch registered in `cli.ts`. The verb walks `.husky/{pre-commit, pre-push, commit-msg}` + removes `dw-lifecycle`-managed blocks bounded by the canonical marker pair (`# >>> dw-lifecycle scope-discovery hook >>>` / `# <<< dw-lifecycle scope-discovery hook <<<`); deletes `.dw-lifecycle/scope-discovery/{hooks-installed.json, last-hook-run.json, hook-run-log.jsonl}` when present. Dry-run by default; `--apply` performs mutations. Operator-authored content outside managed blocks preserved verbatim.
- [x] Step 3: Release-notes section added to `MIGRATING.md` § "Migrating to v0.36.0+ (Phase 24 — no git-hook enforcement)" — names the breaking change, lists retired surfaces, documents the one-shot migration command, cites the ADR + rule, names the #401/#402/#403 issues defused.
- [x] Step 4: `MIGRATING.md` covers the upgrade path. Plugin README not updated this commit (the README points at the marketplace install path which doesn't change; the MIGRATING.md is the canonical breaking-change doc).
- [x] Step 5: Commit.

**Acceptance:** ✅ An adopter who installed `install-scope-discovery-hooks` in v0.35.0 has a one-shot migration command (`dw-lifecycle uninstall-everything-hook-related --apply`) + a documented upgrade path in `MIGRATING.md`.

### Task 10 — Live dogfood verification

**Complete.** This session WAS the dogfood — Phase 24 Tasks 1–8 implementation served as the real-work measurement vehicle. Journal entry recorded in `DEVELOPMENT-NOTES.md` 2026-06-03 (cont. 3).

- [x] Step 1: Picked a real task (the Phase 24 tasks themselves) and ran end-to-end with no `.husky/` enforcement active. The husky stubs (no-op pass-throughs from `81bba0f2`) never refused a commit this session.
- [x] Step 2: Measurements recorded:
  - **Bookkeeping ratio: ~1.2:1** (10 substantive + 12 follow-up commits across 20 total). Target was <2:1, down from #403's measured ~3:1 baseline. **Achieved.**
  - **`--no-verify` invocations: 0** (target: 0). Down from v0.35.0's 3.
  - **`git reset` invocations: 0** (target: 0).
- [~] Step 3: PARTIALLY verified. The audit-barrage-catches-substantive-defects half IS verified (AUDIT-72 round-trip: renderer-template change caught + dispositioned via TDD; 8 cross-model HIGH findings caught across the session). The clone-detector-catches-new-clone half is NOT empirically verified — the deliberate "introduce-clone-group, observe `check-clones --gate-mode` exits 1 in Step 6a, then revert" experiment was NOT performed this session. The verb-level test coverage (`clone-detector.baseline.test.ts`) exercises the NEW-clone-detection contract directly + green this session; the *integration* into Step 6a's invocation is what remains untested empirically. Per AUDIT-20260603-77 (HIGH cross-model, 6 attributions): correcting the original `[x]`-with-"verified-by-extension"-rationale to an honest `[~]` partial-completion + a real TODO. Pending: a follow-up dispatch that physically introduces a clone, observes the end-of-task chain refusal, then reverts.
- [x] Step 4: Audit-barrage discipline coverage verified equivalent: 8 cross-model HIGH findings caught + dispositioned (AUDIT-37/46/47/48/50/70/74/76) + 5 single-model MED/LOW findings (AUDIT-38/51/52/66/67/68/69/71). The retired `check-implement-hook-ran` gate would have caught NONE of these — it only checked that the marker file existed, not whether the work was correct. The barrage caught the substantive defects in the diff; the marker check would have rubber-stamped them.
- [x] Step 5: Journal entry written + appended to DEVELOPMENT-NOTES.md.
- [x] Step 6: Commit (this commit).

**Acceptance:** ✅ Dogfood entry in `DEVELOPMENT-NOTES.md` 2026-06-03 (cont. 3) records the measurements; #401 / #402 / #403 cited as defused; the bookkeeping ratio measurement (1.2:1) confirms the architecture works.

**Acceptance Criteria (Phase 24):**

- [x] ADR + rule files committed and cross-referenced — `docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md` (ADR) + `.claude/rules/enforcement-lives-in-skills.md` (rule); both cross-referenced from `.claude/rules/agent-discipline.md` § "Use the deskwork plugin only through the publicly-advertised distribution channel" + the `.claude/CLAUDE.md` § "Plugin Conventions" item naming `enforcement-lives-in-skills.md`.
- [x] All git-hook enforcement removed from this repo (`.husky/commit-msg` gone; structural + audit-gate blocks removed from pre-commit + pre-push) — verified: `.husky/pre-commit` is now a no-op stub with the Phase 24 retirement docs at the top (`exit 0` after a comment block explaining the relocation to skill bodies); `.husky/commit-msg` does not exist (per `ls .husky/`).
- [x] Retired subcommands/skills/tests/source enumerated in commit messages (audit-trail in git log).
- [x] Each relocation has a passing test exercising the new skill-body behavior — N/A per testing.md for skill-prose; the renderer-template AUDIT-72 fix did get its 3 new failing-test blocks via TDD.
- [x] Live dogfood verification documents the bookkeeping ratio reduction (1.2:1, down from ~3:1).
- [x] Workplan + README reflect Phase 15/17/21/22/23 retirements consistently.
- [x] Release notes capture the breaking change (`MIGRATING.md` § "Migrating to v0.36.0+").
- [ ] No GitHub issue remains open whose root cause is now-deleted machinery — pending operator post-release closure per `Issue closure requires verification in a formally-installed release` rule.
- [x] Adopter migration path is documented (verb `dw-lifecycle uninstall-everything-hook-related` + `MIGRATING.md` § "Migrating to v0.36.0+").

**Open decisions (operator drives at scoping time, per "Capture mode vs scope mode" discipline):**

1. **Single phase or split into demolition + relocation?** Lean single — they must ship together to avoid an unenforced release window.
2. **Decision artifact form: ADR + rule + both?** Lean both — spec captures *why*, rule captures *what to do next session*.
3. **`check-fix-task-tdd` + `check-refactor-preconditions` — fully retire or relocate as in-skill advisory?** Lean relocate; they encode real discipline. Risk: the discipline-in-skill might still produce fresh bookkeeping load — needs dogfood verification.
4. **Migration: ship a `uninstall-everything-hook-related` verb or doc only?** Lean verb; the migration is mechanical and one-shot.
5. **Structural chain at end-of-implement-task: enforce or advisory?** Lean enforce; the pathology was the *audit-finding* chain, not the structural one. Enforcement on the structural chain is what motivated the chain in the first place.
6. **`apply-audit-flips` invocation timing — fold into implement end-of-task or standalone verb?** Lean fold; reduces touches.
7. **Where do `last-hook-run.json` + `hook-run-log.jsonl` files go?** Delete vs gitignore + leave. Lean delete; they're vestigial artifacts the doctor rule wouldn't recognize as valid going forward.
8. **Per-task sub-issues** — TBD at implementation time. Parent issue is #404 (filed 2026-06-03; back-referenced in workplan + README + PRD). Per-task sub-issues split decision deferred until the implementation session opens — depends on whether tasks land as one PR or split.
9. **`.husky/pre-commit` + `.husky/pre-push` stub vs delete** — does the file stay as a no-op stub for documentation, or retire entirely? Lean delete; husky setup itself can retire if nothing else uses it.
10. **Workplan placement** — Phase 24 chronological after 23 (matches existing pattern, this is captured here) vs at the top of the file due to load-bearing nature. Lean chronological; the README's status table surfaces the priority.

### Phase 24 — Out of Scope

- **Designing a NEW positive enforcement contract for the broader plugin ecosystem** (other plugins' gates, deskwork's own gates). Phase 24 retires this plugin's git-hook enforcement; whether the principle extends to other plugins is a separate conversation.
- **CI-based enforcement** (GitHub Actions checks). Adopters can wire CLI verbs into their own CI; we don't ship that wiring as part of Phase 24.
- **The audit-finding lifecycle UX itself** ([#392](https://github.com/audiocontrol-org/deskwork/issues/392) TDD task shape for non-code findings, [#401](https://github.com/audiocontrol-org/deskwork/issues/401) over-build circuit-breaker, [#403](https://github.com/audiocontrol-org/deskwork/issues/403)'s #2 collapse-finding-lifecycle proposal). Those issues survive Phase 24; the discipline-in-skill-body shape may surface them as still-open after the relocation.
- **Reconsidering whether `/dw-lifecycle:doctor` should grow more enforcement.** Orthogonal; survives.
- **Renaming `editor-symmetry` terminology.** Captured separately as Phase 25 below; Phase 25 must NOT block Phase 24.
- **Audiocontrol pilot migration.** Pilot doesn't have the audit-finding hooks; nothing to migrate. The structural chain in the pilot is the operator's call to leave or upgrade.

## Phase 27: Wire `archive-phases` into `/dw-lifecycle:session-end` — auto-archive completed phases at session boundaries

Phase 26 productized `archive-phases` and Task 5 Step 2 wired it into `/dw-lifecycle:complete` for feature-completion archive. But `/complete` only fires when the feature ships; on a long-running multi-phase feature (scope-discovery, 27 phases over ~2 months), completed phases accumulate in the live workplan between releases. Wiring `archive-phases` into `/session-end` archives completed phases at the natural session boundary — same cadence as the journal entry, same commit — keeping the live workplan focused on in-progress work.

**Motivation:**

- The live workplan currently sits at ~1820 lines despite only 5 active phases (6/11/12/20/24); the remaining 22 phases shipped + were manually archived. Without a routine hook, completed phases linger between manual archive sweeps.
- Symmetric with `/complete`'s auto-apply pattern (Phase 26 Task 5 Step 2 set the precedent: archive at lifecycle boundaries).
- Infrastructure already exists — `archive-phases` has `--all` + `--phases <range>` + dry-run + refuse-on-partial. The work is skill-body wiring + a detection helper, not new core logic.

### Task 1: Phase-completion detection helper

Pure-function library at `plugins/dw-lifecycle/src/scope-discovery/archive-phases/detect-completed-phases.ts`. Given workplan + README paths + feature slug, returns `{ readyToArchive: PhaseId[], inProgress: PhaseId[], rationale: Record<PhaseId, string> }`. Needed because `archive-phases --all` refuses on any partial-complete phase (correct gate at `/complete`, wrong gate at `/session-end` where most phases are still in progress); the detector mechanically computes the safe `--phases` range.

- [ ] Step 0: working-code invariant — existing `archive-phases --all` refuse-on-partial gate continues to fire when operator passes `--phases <range>` manually.
- [ ] Step 1: bug-repro / contract test — fixture with mixed phase states (e.g. 3 complete-and-all-checked + 2 in-progress + 1 README-says-Complete-but-has-unchecked-task) → detector returns 3 complete as `readyToArchive`; README-mismatch phase as `inProgress` with rationale naming the unchecked line.
- [ ] Step 2: regression-lock — all-complete workplan → all phases returned; all-in-progress → empty `readyToArchive`.
- [ ] Step 3: implementation — AND-gate structural signal (all `- [ ]` → `- [x]` under the phase heading) with operator-curated signal (README Status row reads "Complete" / "Shipped" / "Substantive complete"); explicit per-phase rationale strings for surface in session-end report.
- [ ] Step 4: full plugin suite green; live-verify against this repo's current workplan (expect: 0 phases ready — Phases 6/11/12/20/24 all in progress).

### Task 2: CLI flag — `archive-phases --auto-detect`

Extend the existing `archive-phases` verb with `--auto-detect` flag that invokes the Task 1 detector and threads its `readyToArchive` set as the `--phases` range. Mutually exclusive with `--all` + `--phases`. Same exit codes as today.

- [ ] Step 0: working-code invariant — existing `--all` + `--phases <range>` paths unchanged.
- [ ] Step 1: bug-repro test — `--auto-detect --apply` against a mixed-state workplan archives only the detected-complete phases.
- [ ] Step 2: regression-lock — `--auto-detect` without `--apply` is dry-run; `--all` still refuses on partial-complete.
- [ ] Step 3: implementation — `--auto-detect` invokes detector + threads phase set; `--help` documents the flag.
- [ ] Step 4: full plugin suite green; live-verify: `dw-lifecycle archive-phases --feature scope-discovery --auto-detect` (expect dry-run: 0 phases).

### Task 3: Wire into `/dw-lifecycle:session-end` SKILL.md

New Step 9.5 between closing-discipline (Step 9) and commit (Step 10) — invokes `archive-phases --auto-detect --apply` and surfaces archived count + IDs in the session-end report. Gated by `config.session.end.archiveCompletedPhases` (default true; opt-out per project).

- [ ] Step 0: working-code invariant — existing 11 steps fire in order; new step is additive, not replacement.
- [ ] Step 1: skill-body integration test — fixture where 1 phase just got completed this session → (a) Step 9 closing-discipline fires against pre-archive workplan, (b) Step 9.5 archives the phase, (c) Step 10 commit includes the archive move + journal entry reports it.
- [ ] Step 2: regression-lock — fixture with no completed phases → session-end proceeds without disrupting the flow.
- [ ] Step 3: implementation — edit `plugins/dw-lifecycle/skills/session-end/SKILL.md` Step 9.5 prose + config flag handling + error-handling section.
- [ ] Step 4: full plugin suite green; live-verify on this repo's actual session-end.

### Open design questions (operator pick required at implementation)

1. **Firing mode at session-end.**
   - **(a) Auto-detect + auto-apply** (Task 2 shape) — always-fire; in-progress phases left alone; no operator prompt.
   - **(b) Detect + operator-confirm** — surface candidates in the report, prompt before applying. Safer if there are edge cases warranting human-in-the-loop.
   - **(c) Doctor-rule-only** — new doctor rule `phase-ready-to-archive` flagging candidates on `/dw-lifecycle:doctor`; session-end surfaces the count but doesn't auto-archive.
   - **Capture-time recommendation: (a)** — symmetric with `/complete`'s auto-apply; archive-phases already has refuse-on-partial guard; no new operator-attention surface. Operator decides at implementation time.
2. **Doctor-rule companion (Task 4, optional).** Ship `phase-ready-to-archive` doctor rule ALSO (regardless of firing-mode pick), so operators can check the state mid-session without running session-end? Cheap (~30 LOC); orthogonal visibility surface. **Capture-time recommendation: ship.** If operator picks (c) above, this becomes the primary surface and Task 3's skill wiring becomes a thin "report the doctor-rule count" step.
3. **Config flag default.** `config.session.end.archiveCompletedPhases: true` (always-on, opt-out) or `false` (opt-in)? **Capture-time recommendation: true** — symmetric with the rest of `/session-end`'s always-on hygiene steps.
4. **Order vs Step 9 (closing-discipline).** New step fires AFTER Step 9 so the closing-discipline checks (`check-disposition-survivor` + bare-TBD scan + `check-open-findings`) fire against the still-live workplan — no false negatives from completed-phase TBDs migrating to archive prematurely. **Capture-time decision: confirmed in Task 3 scope above; not a re-litigable question, but flagged here so the operator sees the ordering choice explicitly.**

**Acceptance Criteria:**

- [ ] Phase-completion detector returns correct `readyToArchive` set across mixed-state fixtures.
- [ ] `archive-phases --auto-detect --apply` archives only detected-complete phases; in-progress untouched.
- [ ] `/dw-lifecycle:session-end` Step 9.5 fires the auto-detect + apply path; archived count + IDs in the report; config flag respected.
- [ ] Step 9 closing-discipline checks fire BEFORE Step 9.5 (verified by integration test).
- [ ] Live dogfood on this repo: at the next session-end after a phase completes, the phase is archived in the same `docs: session-end` commit; live workplan shrinks; archive grows.
- [ ] If Task 4 doctor rule shipped (operator pick): rule appears in `/dw-lifecycle:doctor`; `--fix` archives the detected phases; rule documented in doctor SKILL.md.
- [ ] Closure transition is the operator's call post-install verification (operator-owned closure per AUDIT-35).

## Phase 28: Session-start branch-staleness detector — pre-merge early warning ([#422](https://github.com/audiocontrol-org/deskwork/issues/422))

The 2026-06-04 cont. 5 session opened on a `feature/scope-discovery` branch that was **24 commits behind `origin/main`**. The hygiene helper's mechanical first-unchecked-task pick aimed the agent at Task 40 (`#411`); the agent shipped 290 lines of substantive fix + 2 audit-barrage cascade-burndown commits before discovering main had ALREADY shipped both `#411` and `#412` via PR `#414`. All three commits were reset out. Net cost: ~30 minutes of agent attention, 5 audit findings filed-then-reverted, operator distraction for the merge-vs-reset decision.

This phase ships a cheap pre-merge early-warning surface at session-start so the operator notices stale-branch state before picking up tasks. Distinct cure-shape from [#413](https://github.com/audiocontrol-org/deskwork/issues/413) (the post-merge bookkeeping portfolio of per-file merge drivers): #413 makes each merge cheaper; this phase prompts the merge to happen sooner. Operator framing during session-start scoping (2026-06-04): *"shouldn't it go in session-start so it's not a tax on every iteration of the implement loop?"* Session-start fires once per session; the implement-loop iterates many times per session, so the cost lives at session-start.

**Motivation:**

- One stale-branch incident per ~10-day branch lifespan is the current rate; the cost compounds as branches age.
- Detection is cheap (one `git fetch` + one `git log` count); the fix is one nudge line in the bootstrap report.
- Symmetric with the existing session-start hygiene-recommendation surface — both are advisory diagnostic signals that the operator integrates into the session goal.

### Task 1: Pure-fn library — detect-branch-staleness

Pure-function library at `plugins/dw-lifecycle/src/lifecycle-integration/branch-staleness.ts`. Given a branch name, upstream remote/branch, fetch fn (DI for tests), and threshold, returns `BranchStalenessSnapshot { branch, remote, behind, threshold, nudgeRequired }`. Threading the fetch as a function lets tests run offline.

- [x] Step 0: working-code invariant — no existing helper of this name; pure-additive.
- [x] Step 1: bug-repro / contract test — fixture pattern (no real git; mock the `gitLogCount` + `gitFetch` injection points): `behind: 24, threshold: 5` → `nudgeRequired: true`; `behind: 0, threshold: 5` → `nudgeRequired: false`; `behind: 5, threshold: 5` → `nudgeRequired: false` (boundary inclusive); `behind: 6, threshold: 5` → `nudgeRequired: true`. Real-git fixture covers two cases (6 behind synthetic main → nudge; tip of main → no nudge).
- [x] Step 2: regression-lock — `--no-fetch` path doesn't invoke the fetch fn (tested via `vi.fn()` not called).
- [x] Step 3: implementation — pure-fn with DI for `gitFetch` + `gitLogCount`; returns the snapshot type; never throws on `behind === 0`. Boundary contract: `behind <= threshold` → no nudge; `behind > threshold` → nudge.
- [x] Step 4: 9/9 vitest scenarios pass (`plugins/dw-lifecycle/src/__tests__/lifecycle-integration/branch-staleness.test.ts`); `tsc --noEmit` clean.

### Task 2: CLI subcommand — `dw-lifecycle branch-staleness-check`

CLI verb at `plugins/dw-lifecycle/src/subcommands/branch-staleness-check.ts`. Flags: `--threshold N`, `--no-fetch`, `--json`, `--remote <ref>` (defaults `origin/main`). Reads `config.session.start.branchStalenessThreshold` from `.dw-lifecycle/config.json` when `--threshold` absent. Exit 0 always (advisory).

- [x] Step 0: working-code invariant — no existing verb of this name; pure-additive. CLI dispatcher in `cli.ts` registers the new verb.
- [x] Step 1: bug-repro / contract test — 12 argv-parser scenarios in `plugins/dw-lifecycle/src/__tests__/subcommands/branch-staleness-check.test.ts` cover `--threshold` validation (negative / fractional / non-numeric all rejected with actionable errors), `--remote` format check, `--no-fetch` / `--json` flag flips, and unknown-flag rejection. Live-verify against this repo's current state: `Branch staleness: 0 commits behind origin/main (threshold 5).` Verb exit 0; JSON output emits documented structured shape.
- [x] Step 2: regression-lock — `behind === 0` path live-verified emits the line without a nudge; exit 0. Detached-HEAD / not-a-git-repo path emits `skipped (detached HEAD or not a git repo).` and exits 0 (never refuses).
- [x] Step 3: implementation — verb wires the pure-fn library; reads `--remote`, `--threshold` (CLI > config > default 5), `--no-fetch`, `--json`; nudge text cross-references `#422` + `#413`.
- [x] Step 4: 12/12 verb tests pass; `tsc --noEmit` clean.

### Task 3: Config schema extension

Extend the Zod config schema to accept `session.start.branchStalenessThreshold: number` (optional; default applied by the verb, not the schema, so absence means "use the verb default").

- [x] Step 0: working-code invariant — existing config files continue to parse; absence of the new key is valid.
- [x] Step 1: bug-repro test — `.dw-lifecycle/config.json` with `session.start.branchStalenessThreshold: 10` parses; verb run with `--threshold` absent honors the config value (covered by config-loader fallback path inside `branch-staleness-check.ts`).
- [x] Step 2: regression-lock — non-integer (fractional) and negative thresholds fail the Zod parse with an actionable error mentioning `branchStalenessThreshold` in the message.
- [x] Step 3: implementation — extended Zod schema at `plugins/dw-lifecycle/src/config.types.ts` with `branchStalenessThreshold: z.number().int().nonnegative().optional()`. The verb-default-not-schema-default shape preserves the "absence = use verb default" contract. Template surface (commented-out default) deferred — adopter docs update happens in the Phase 28 release notes; the schema change itself is non-breaking for existing config files.
- [x] Step 4: 10/10 config tests pass; `tsc --noEmit` clean.

### Task 4: Wire into `/dw-lifecycle:session-start` SKILL.md

Insert Step 8 between current Step 7 (structural snapshot) and the former Step 8 (`gh issue list`, now Step 9). Bootstrap report renders the staleness signal alongside the structural snapshot — both advisory.

- [x] Step 0: working-code invariant — existing steps fire in order; the staleness step is additive, not a replacement. The former Step 8 (`gh issue list`) renumbers to Step 9; former Step 9 (report context) renumbers to Step 10.
- [x] Step 1: skill-body integration check — live-walk against this repo: the verb fires and prints `Branch staleness: 0 commits behind origin/main (threshold 5).` (since this branch merged main in cont. 5; expected at the moment of writing).
- [x] Step 2: regression-lock — when the installed binary lacks `branch-staleness-check` (older release), the skill body's "When the installed binary doesn't recognize ..., silently skip Step 8" clause kicks in. The skill body matches the structural-snapshot pattern's opt-in framing.
- [x] Step 3: implementation — edited `plugins/dw-lifecycle/skills/session-start/SKILL.md` Step 8 prose; documents verb invocation, the `branchStalenessThreshold` config key, the threshold + remote-ref override flags, and the advisory framing. Cross-references `#422` and `#413` inline. Added an error-handling row for the skip-on-older-binary path.
- [x] Step 4: live-verify on this repo's actual `/dw-lifecycle:session-start` invocation — verified at the cont. 6 session-start that produced this phase. Verb is present in the operator's running plugin (post-build from the source tree); operator-installed-plugin verification happens at the next release after merge.

### Open design questions (operator pick at implementation)

1. **Default upstream remote / branch.** `origin/main` is correct for this repo + most adopters; some use `upstream/main` or `origin/master`. **Capture-time recommendation:** default `origin/main`; accept `--remote <ref>` CLI flag override; read `config.branches.upstream: string` if present (schema addition, optional). Sufficient for v1.
2. **Threshold default.** `5` per the cont. 5 incident (24 was far past comfort; ~5 felt like the threshold at which the operator would routinely want to merge). Operator confirms at implementation; can tune later via config without breaking anyone.
3. **Hard gate or advisory.** Advisory — symmetric with the structural-snapshot pattern at Step 7. The session-start skill's framing is "report context; do NOT start work until they confirm the session goal," so the operator is already a hard gate; the nudge informs them.
4. **Cross-reference to other long-running branches?** A multi-branch staleness sweep (look across all worktrees) is a richer surface — out of scope for v1. Filed as the "future work" hook in this phase's body. Could be a sibling verb `dw-lifecycle worktree-staleness-report` aligned with the existing `worktree-report`.
5. **Should the implement skill re-check?** No — operator framing was explicit. The implement skill SKILL.md can reference this signal as a precondition reminder but does NOT re-fetch.
6. **`--no-fetch` UX.** Useful for offline + tests; should it also be the default in CI environments where network fetches are slow / disallowed? **Capture-time recommendation:** default-on `--fetch`; ops can pass `--no-fetch` if needed. CI never invokes this verb (the skill body is what invokes it; CI doesn't run session-start). No CI hook.

### Acceptance Criteria

- [x] `branch-staleness.ts` pure-fn library returns the documented `BranchStalenessSnapshot` shape across all 4 boundary fixtures.
- [x] `dw-lifecycle branch-staleness-check` verb prints the human-readable line + nudge when `behind > threshold`; emits structured `--json` output; exit 0 always.
- [x] Config schema accepts `session.start.branchStalenessThreshold: number` optionally; absence honored as "use verb default."
- [x] `/dw-lifecycle:session-start` Step 8 invokes the verb; bootstrap report includes the staleness line alongside the structural snapshot.
- [ ] Live dogfood on this repo: at the next session-start, the staleness signal appears in the bootstrap report. Operator confirms the surface fires before any task pickup. *(Pending — verified at cont. 6 from the source tree; operator-installed verification happens at the next release.)*
- [ ] Closure transition is the operator's call post-install verification (operator-owned closure per AUDIT-35).

## Phase 29: Adopter-friction burn-down (design-control TF + cont. 5/6 follow-ups)

Four adopter-filed bugs surfaced via real dogfood since v0.38.0. Two ([#426](https://github.com/audiocontrol-org/deskwork/issues/426), [#427](https://github.com/audiocontrol-org/deskwork/issues/427)) came from `feature/design-control` (parent [#424](https://github.com/audiocontrol-org/deskwork/issues/424))'s first barrage rounds — TF-001 + TF-002 in that feature's tooling-feedback log. Two ([#420](https://github.com/audiocontrol-org/deskwork/issues/420), [#425](https://github.com/audiocontrol-org/deskwork/issues/425)) surfaced during the cont. 5/6 sessions on this branch.

Per `.claude/rules/agent-discipline.md` § "Audit findings: scope-don't-defer + TDD enforcement," each bug is scoped here as a TDD-first workplan task with `Refs #N` trailer (NOT `Closes` — operator-owned closure rule per AUDIT-35). Closure happens when the operator verifies against a formally-installed release.

### Task 1 (Refs [#427](https://github.com/audiocontrol-org/deskwork/issues/427)): `audit-barrage-lift` merge collapses distinct findings under one ID

`extract-barrage-findings.ts` clusters raw findings via union-find with edges drawn when EITHER `headingsAgree` (6+ char substring overlap) OR `surfacesAgree` (any shared path token). The OR + transitivity over-merges: five distinct mechanisms touching `allowlist.ts` chain into one cluster, and `mergeCluster` drops every body except the representative's. Adopter impact: real MEDIUM defects buried in the attribution suffix; the dampener slushes the merged entry; "0 open findings" misreads.

- [ ] Step 0: working-code invariant — true same-cause cross-model agreement (e.g. claude + codex independently flagging one `EngineMethod`-style defect at the same line) MUST still merge into one entry; only over-merging across distinct mechanisms/surfaces is the bug.
- [ ] Step 1: bug-repro test against the three design-control run-dir cases named in #427 (the AUDIT-20260605-01 / -20260606-01 / -20260606-04 fixtures) — assert each emits N entries, not one merged entry. Fixture lives under `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/extract-barrage-findings.merge.test.ts`. Real run-dir samples copied into the test fixture dir; tests run offline.
- [ ] Step 2: regression-lock — existing `extract-barrage-findings` test cases that intentionally exercise same-cause cross-model merge (and the `crossModelAgreement: true` invariant) stay green.
- [ ] Step 3: implementation — tighten the clustering edge condition. Preferred shape per #427's "medium fix": require **same cause AND same surface** before drawing the merge edge (replace `OR` with `AND`); fall back to keeping bodies attached if the AND test passes but bodies differ substantively (concatenate as a bullet list). Document the new contract in `extract-barrage-findings.ts` and in `audit-barrage-lift.ts`'s header comment.
- [ ] Step 4: full plugin suite green; live-verify by re-running `audit-barrage-lift` against the three design-control run-dirs and confirming distinct entries. Commit with `Refs #427` trailer.

**Acceptance Criteria:**

- [ ] Bug-repro tests from all three design-control fixtures (AUDIT-20260605-01 / -20260606-01 / -20260606-04) emit N distinct entries per fixture, not 1.
- [ ] Existing cross-model agreement tests still pass — `crossModelAgreement: true` continues to fire on genuine same-cause merges.
- [ ] `audit-barrage-lift.ts` header comment names the new clustering contract verbatim.
- [ ] Operator-verified closure post-release per AUDIT-35.

### Task 2 (Refs [#426](https://github.com/audiocontrol-org/deskwork/issues/426)): `implement-hook` aborts when `audit-log.md` doesn't exist yet

First barrage of every new feature hits this. The barrage fires cleanly, run-dir is written, then `audit-barrage-lift` fails with `audit-log not found` and `implement-hook.ts:492` writes `implement-hook: audit-barrage-lift failed; aborting.` and exits. Re-runs skip on the no-new-diff guard, so the first task's audit coverage is silently lost.

- [ ] Step 0: working-code invariant — existing-`audit-log.md` case unchanged; lift continues to append to the log normally.
- [ ] Step 1: bug-repro test at `plugins/dw-lifecycle/src/__tests__/subcommands/audit-barrage-lift.first-barrage.test.ts` — feature-dir with no `audit-log.md`; assert `runAuditBarrageLift` initializes the file from the bundled template and proceeds (exit 0; entries land).
- [ ] Step 2: regression-lock — existing `audit-barrage-lift-cli.test.ts` happy-path scenarios stay green.
- [ ] Step 3: implementation — light fix per #426: `audit-barrage-lift` auto-initializes an empty `audit-log.md` from the bundled header template (referenced via `plugins/dw-lifecycle/templates/scope-discovery/audit-log.md`) when the feature dir exists but the log is absent, then proceeds. Same pattern applies to `tooling-feedback.md` for symmetry (file the symmetric init under the same task). Document the auto-init in both `audit-barrage-lift.ts` and `implement-hook.ts` header comments.
- [ ] Step 4: full plugin suite green; live-verify by creating a fresh feature dir without `audit-log.md` and running `dw-lifecycle implement-hook --feature <slug>` against a synthetic diff — confirm the file is created and the lift proceeds. Commit with `Refs #426` trailer.

**Acceptance Criteria:**

- [ ] Bug-repro test fails on the no-`audit-log.md` case pre-fix.
- [ ] After fix: missing-`audit-log.md` triggers auto-init from template; lift completes with entries appended.
- [ ] `implement-hook` no longer prints `aborting` on the first-barrage path.
- [ ] `tooling-feedback.md` symmetric auto-init covered by sibling test.
- [ ] Operator-verified closure post-release per AUDIT-35.

### Task 3 (Refs [#420](https://github.com/audiocontrol-org/deskwork/issues/420)): `promote-findings --auto` task-ID collision

Auto-positioner derives the next task number from a local/recent slice (or the stale `workplan-archive-ledger`) rather than scanning ALL existing `### Task <phase>.<n>` headings (including archived + prior-session impl tasks). Two collisions in one cont. 5 session: 39.15 collided with an earlier promote, then 39.17 collided with that batch's own AUDIT-03. The functional gates still work (keyed on AUDIT-ID), but workplan integrity degrades.

- [ ] Step 0: working-code invariant — fresh-phase numbering (no existing tasks under the phase) still starts at `.1`; ledger's `next-fix-task-id` remains the floor.
- [ ] Step 1: bug-repro test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/auto-position.collision.test.ts` — fixture workplan with existing `### Task 39.17` heading + a `promote-findings --auto` call into Phase 39 → assert the next assigned ID is `39.18+` (no collision). Sibling test: workplan with an existing impl-task `### Task 39.5` that's NOT in `archived-fix-tasks` → ledger's `next-fix-task-id` is `39.4`, but the scan must promote to `39.6+`, not `39.4`.
- [ ] Step 2: regression-lock — existing Phase 26 auto-position tests (cross-phase merge, archive-ledger fallback) stay green.
- [ ] Step 3: implementation — auto-positioner scans EVERY `### Task <phase>.<n>` heading in the live workplan AND the archived ledger's `archived-fix-tasks` ranges, takes the per-phase max across both, and assigns max+1. Document the contract in `auto-position.ts`. The behavior generalizes per the AUDIT-94 note (the integer namespace is shared across impl-tasks + fix-finding tasks).
- [ ] Step 4: full plugin suite green; live-verify by replaying the cont. 5 collision sequence against a fixture workplan — confirm the new IDs are collision-free. Commit with `Refs #420` trailer.

**Acceptance Criteria:**

- [ ] Bug-repro tests from #420's two named collision sequences emit collision-free IDs.
- [ ] Regression-lock covers Phase 26's existing auto-position contracts.
- [ ] `auto-position.ts` header comment names the new "scan-all-headings + ledger" contract.
- [ ] Operator-verified closure post-release per AUDIT-35.

### Task 4 (Refs [#425](https://github.com/audiocontrol-org/deskwork/issues/425)): `close-shipped` SKILL.md leftover `/tmp/release-notes.md`

Sibling of #412 (which fixed the bundles/verdicts paths in PR #414 but didn't touch the release-notes generation code path). `plugins/dw-lifecycle/skills/close-shipped/SKILL.md:261-262` uses bare `/tmp/release-notes.md`, violating `.claude/rules/file-handling.md`. Two concurrent `/release` invocations in different worktrees would clobber.

- [ ] Step 0: working-code invariant — the documented workflow shape (`close-shipped --release-notes-body > <path>` → `gh release edit --notes-file <path>`) doesn't change; only the path scheme.
- [ ] Step 1: SKILL.md regression test — `plugins/dw-lifecycle/src/__tests__/skills/close-shipped-skill-paths.test.ts` (new) reads `close-shipped/SKILL.md` and asserts NO `/tmp/<name>` paths appear outside of comments. Matches the file-handling rule's discoverable surface.
- [ ] Step 2: regression-lock — existing tests for the `--release-notes-body` codepath (in `close-shipped.test.ts` if present, otherwise a smoke equivalent) stay green.
- [ ] Step 3: implementation — replace SKILL.md lines 261-262 with the in-tree pattern matching the Phase A precedent: `.dw-lifecycle/close-shipped/runs/<timestamp>/release-notes.md`. Update the immediately-following block too (stdin pattern via process-substitution stays as the documented alternative). Document the path scheme in SKILL.md Step prose.
- [ ] Step 4: full plugin suite green; commit with `Refs #425` trailer.

**Acceptance Criteria:**

- [ ] No `/tmp/release-notes.md` paths remain in `close-shipped/SKILL.md`.
- [ ] New regression test enforces "no bare /tmp/<name> in SKILL.md."
- [ ] SKILL.md prose names the runs-dir path scheme.
- [ ] Operator-verified closure post-release per AUDIT-35.

### Phase acceptance

- [ ] All 4 tasks shipped with `Refs #N` trailers (NOT `Closes` — operator-owned closure per AUDIT-35).
- [ ] Plugin test suite green after each task commit (no regressions).
- [ ] Phase folded into the next release's release notes alongside any other shipped phases.
- [ ] Operator-verified closure of #420/#425/#426/#427 happens post-release per the closure rule.
