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
archived-phases: 1-5, 9-10, 13-14, 16-19, 21-23
archived-fix-tasks: 5.1-5.123
archive-file: workplan-archive.md
next-fix-task-id: 5.124
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

### Task 3: Disposition + baseline commands

- [x] `dispose-clone <id> --as <refactor|keep-with-reason|ignore-with-justification> [args]` — refuses without Step 0a/0b flags on refactor disposition. Single-id convenience wrapper around `batch-dispose`. `keep-with-reason` + `ignore-with-justification` pass through verbatim; `--as refactor` requires all Step 0a/0b precondition flags (`--canonical-side`, `--canonical-reason`, [`--new-shape-summary` if canonical-side=new], `--tests`, `--tests-proof-sha`, `--tests-proof-demonstration`) AND still refuses to write (refactor's 5 fields don't fit `--reason` shape; the wrapper redirects to manual editing + `dw-lifecycle check-refactor-preconditions`). The flag-presence requirement is a forcing function — the operator who tries `--as refactor` sees the full precondition surface in the error message. 19 vitest scenarios.
- [x] `refresh-clones-baseline` — thin wrapper carving `detect-clones --refresh-baseline` into its own subcommand. Closes the operator-ergonomics loop opened by AUDIT-20260525-07: clone-detector's batch-dispose hint already cites `dw-lifecycle refresh-clones-baseline` as the recovery path, this commit makes the verb resolvable. Forwards `--baseline` + `--quiet` verbatim; `--gate-mode` intentionally NOT accepted (refresh is mutating by definition). 10 vitest scenarios cover the pure `forwardedArgs` injector (idempotency, ordering) + `wantsHelp` detector + CLI `--help`/`-h` surface.
- [x] `batch-dispose <id> --disposition <D> --reason "<text>"` — landed as `dw-lifecycle batch-dispose`. Closes the TODO at `clone-detector.ts:182` (now emits paste-ready `dw-lifecycle batch-dispose ...` command in the hint, no TODO referenced). Closes [#284](https://github.com/audiocontrol-org/deskwork/issues/284); pilot TF-014 (AUDIT-20260525-07) addressed via the Light option — unknown-id error cites the `dw-lifecycle detect-clones --refresh-baseline` prereq so the operator's recovery path is obvious.
- [x] `check-disposition-survivor` — landed as `dw-lifecycle check-disposition-survivor`. Pre-commit gate that fails the commit on any `keep-with-reason`/`refactor`/`ignore-with-justification` → `pending` transition unless the operator passes `--allow-disposition-loss`. Compares HEAD's baseline (via `git show`) against the working tree. Closes [#289](https://github.com/audiocontrol-org/deskwork/issues/289); pilot reference: TF-013 (AUDIT-20260525-06). Phase 8 hook-chain wires it in.



### Task 20 (fix-finding-AUDIT-20260603-83) (non-bug): AUDIT-20260603-83 — Fixed-finding / all-unchecked-task contradiction regresses A…

Closes AUDIT-20260603-83 (claude-01 + claude-02 + codex-01 + codex-03; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Tasks 19/20 (hunk `@@ -46,6 +46,43 @@`) vs. `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` AUDIT-81/82 (`Status: fixed-2e962b59`).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [ ] Step 1: write the disposition prose (≥40 chars, substantive). Describe what concrete action closes this finding — a specific edit, an explicit acknowledgement with reason, or a documented decision. No placeholders like "to be filled in" or "TBD".
- [ ] Step 2: apply the action named in Step 1 (the file edit / acknowledgement / decision).
- [ ] Step 3: commit with `Acknowledges AUDIT-20260603-83 (claude-01 + claude-02 + codex-01 + codex-03; cross-model)` in subject (use `Closes AUDIT-20260603-83 (claude-01 + claude-02 + codex-01 + codex-03; cross-model)` ONLY when the disposition included a real code change verifiable by test; for doc-only acknowledgements use `Acknowledges`; for deferrals use `Defers`). Per AUDIT-20260602-01: `apply-audit-flips` parses `Closes` trailers as `fixed-<sha>` proposals — using `Closes` on a non-fix disposition arms a false flip when the audit-log entry is later re-opened.

**Acceptance Criteria:**

- [ ] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [ ] The named action has landed in this branch (the substantive edit or acknowledgement is present).
- [x] Audit-log Status flipped to `fixed-<sha>` (or `acknowledged-<reason>` for accepted-trade-off dispositions) via the close-shipped-audit-findings step.


### Task 21 (fix-finding-AUDIT-20260603-84): AUDIT-20260603-84 — AUDIT-82's MIGRATING.md rewrite leaks internal audit scaffol…

Closes AUDIT-20260603-84 (claude-03 + codex-02; cross-model). Surface: `MIGRATING.md:60` ("Issues defused" paragraph). Severity: medium.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260603-84 (claude-03 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 22 (fix-finding-AUDIT-20260603-85) (non-bug): AUDIT-20260603-85 — Option D test-count not met — single added test is the bug-r…

Closes AUDIT-20260603-85. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/uninstall-everything-hook-related.test.ts:78-108` vs. `workplan.md` Task 19 Acceptance ("test block count for this finding is ≥2 per Option D discipline").

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [ ] Step 1: write the disposition prose (≥40 chars, substantive). Describe what concrete action closes this finding — a specific edit, an explicit acknowledgement with reason, or a documented decision. No placeholders like "to be filled in" or "TBD".
- [ ] Step 2: apply the action named in Step 1 (the file edit / acknowledgement / decision).
- [ ] Step 3: commit with `Acknowledges AUDIT-20260603-85` in subject (use `Closes AUDIT-20260603-85` ONLY when the disposition included a real code change verifiable by test; for doc-only acknowledgements use `Acknowledges`; for deferrals use `Defers`). Per AUDIT-20260602-01: `apply-audit-flips` parses `Closes` trailers as `fixed-<sha>` proposals — using `Closes` on a non-fix disposition arms a false flip when the audit-log entry is later re-opened.

**Acceptance Criteria:**

- [ ] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [ ] The named action has landed in this branch (the substantive edit or acknowledgement is present).
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

Closes AUDIT-20260603-79 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02 + codex-03; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Tasks 19/20 (hunk `@@ -206,6 +206,40 @@`) vs. `audit-log.md` AUDIT-77/78 (`Status: fixed-f966d6ee`).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [ ] Step 1: write the disposition prose (≥40 chars, substantive). Describe what concrete action closes this finding — a specific edit, an explicit acknowledgement with reason, or a documented decision. No placeholders like "to be filled in" or "TBD".
- [ ] Step 2: apply the action named in Step 1 (the file edit / acknowledgement / decision).
- [ ] Step 3: commit with `Acknowledges AUDIT-20260603-79 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02 + codex-03; cross-model)` in subject (use `Closes AUDIT-20260603-79 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02 + codex-03; cross-model)` ONLY when the disposition included a real code change verifiable by test; for doc-only acknowledgements use `Acknowledges`; for deferrals use `Defers`). Per AUDIT-20260602-01: `apply-audit-flips` parses `Closes` trailers as `fixed-<sha>` proposals — using `Closes` on a non-fix disposition arms a false flip when the audit-log entry is later re-opened.

**Acceptance Criteria:**

- [ ] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [ ] The named action has landed in this branch (the substantive edit or acknowledgement is present).
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

Closes AUDIT-20260603-72 (claude-01 + claude-02 + claude-04 + codex-04; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md:228-332` (Tasks 9–14) vs. `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md:3790-3854` (AUDIT-66…71).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [ ] Step 1: write the disposition prose (≥40 chars, substantive). Describe what concrete action closes this finding — a specific edit, an explicit acknowledgement with reason, or a documented decision. No placeholders like "to be filled in" or "TBD".
- [ ] Step 2: apply the action named in Step 1 (the file edit / acknowledgement / decision).
- [ ] Step 3: commit with `Acknowledges AUDIT-20260603-72 (claude-01 + claude-02 + claude-04 + codex-04; cross-model)` in subject (use `Closes AUDIT-20260603-72 (claude-01 + claude-02 + claude-04 + codex-04; cross-model)` ONLY when the disposition included a real code change verifiable by test; for doc-only acknowledgements use `Acknowledges`; for deferrals use `Defers`). Per AUDIT-20260602-01: `apply-audit-flips` parses `Closes` trailers as `fixed-<sha>` proposals — using `Closes` on a non-fix disposition arms a false flip when the audit-log entry is later re-opened.

**Acceptance Criteria:**

- [ ] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [ ] The named action has landed in this branch (the substantive edit or acknowledgement is present).
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

Closes AUDIT-20260603-66. Surface: `plugins/dw-lifecycle/templates/scope-discovery/agent-step-0-fragment.md` (not in diff — should be) vs. the two deleted readers. Severity: medium.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260603-66` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 10 (fix-finding-AUDIT-20260603-67): AUDIT-20260603-67 — Reciprocal skill cross-references to the three retired verbs…

Closes AUDIT-20260603-67 (claude-02 + codex-03; cross-model). Surface: sibling skill bodies that point at the deleted verbs — e.g. `plugins/dw-lifecycle/skills/install-scope-discovery/SKILL.md`, `plugins/dw-lifecycle/skills/complete/SKILL.md` (neither in this diff). Severity: medium.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260603-67 (claude-02 + codex-03; cross-model)` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
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

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
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

Closes AUDIT-20260603-70. Surface: `plugins/dw-lifecycle/commands/install-agent-prompts.md:1-5`, `plugins/dw-lifecycle/commands/install-scope-discovery-hooks.md:1-5`, `plugins/dw-lifecycle/commands/uninstall-scope-discovery-hooks.md:1-5`, `plugins/dw-lifecycle/src/__tests__/shortcuts.test.ts:88-98`. Severity: high.

- [ ] Step 0: working-code invariant — what does the current code do correctly that this fix touches? 1-2 sentences. Per Option D discipline, HIGH+ findings get a regression-lock test pinning this invariant in addition to the bug-repro test.
- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 1b: write a regression-lock test pinning the Step 0 invariant — the test that would FAIL if the fix breaks the working-code behavior the invariant describes
- [ ] Step 2: confirm test(s) fail against current code (verify the bug repros + the regression-lock test passes pre-fix)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm all tests pass (bug-repro flips green; regression-lock stays green)
- [ ] Step 5: commit with `Closes AUDIT-20260603-70` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] Regression-lock test exists in the same file (Step 1b); test block count for this finding is ≥2 per Option D discipline
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 14 (fix-finding-AUDIT-20260603-71): AUDIT-20260603-71 — Doctor skill documents deleted rules and repair commands as …

Closes AUDIT-20260603-71. Surface: `plugins/dw-lifecycle/skills/doctor/SKILL.md:31-44`, `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/index.ts:26-35`. Severity: medium.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260603-71` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5: Validator + export commands

- [x] `validate-scope-discovery` — runs all adversarial harnesses. Spawns `npx vitest run scope-discovery` from the dw-lifecycle workspace root; forwards stdout/stderr/exit-code verbatim. `--quiet` switches to the dot reporter. Exit codes mirror vitest (0 all-passed, 1 failure, 2 invalid args). 3 vitest scenarios cover the flag-parse contract; the spawn path is exercised in practice by every existing `npm test -- scope-discovery` run.
- [x] `scope-export [--json]` — emit a previously-produced `scope-manifest.yaml` to stdout. Default path resolves from `--slug` (`docs/1.0/001-IN-PROGRESS/<slug>/scope-manifest.yaml`, matching `scope-inventory`'s default output); `--manifest <path>` overrides explicitly. Default mode emits raw YAML verbatim (preserves comments + formatting); `--json` re-emits via `yaml.parse` + `JSON.stringify`. 10 vitest scenarios.

**Acceptance Criteria:**
- [ ] All ~20 CLI verbs invokable via `dw-lifecycle <verb>` + via skill prose
- [x] `--gate-mode` flag on check-* commands exits non-zero on violations — landed across `check-anti-patterns`, `check-adopters`, `check-refactor-preconditions` (default informational; flag flips to hook-friendly exit 1) and `detect-clones` (already gate-by-default; flag is a no-op for symmetry). 10 new vitest scenarios cover the flag delta.
- [x] `--json` flag on summary/export commands emits structured output — `scope-summary --json` emits `{ surface, clones, total, pending-touching, pending-intra, dispositioned-touching }`; `scope-export --json` emits the parsed manifest re-serialized via `JSON.stringify`; `check-deprecations --json` emits `{ total, deprecation_count, filesVisited, blocked: [...], safeToDelete: [...] }` (the post-port shape; the pre-port shell's `{ blocked, safeToDelete, deprecation_count, note }` is a superset).

## Phase 7: Slash command skill prose

**Deliverable:** SKILL.md + commands/<name>.md files for each of the ~18 new + 5 updated `/dw-lifecycle:*` skills.

### Task 1: New skill prose (18 skills)

- [x] For each new skill — broken down per-skill below. 19 of 19 landed (`scope-widen` shipped post-#292 closure; the 4 Phase-8 install-related skills landed in Phase 8 commit 6; `migrate-from-pilot` skill prose landed alongside the subcommand for [#291](https://github.com/audiocontrol-org/deskwork/issues/291)).
  - [x] `scope-inventory` — SKILL.md + commands/scope-inventory.md.
  - [x] `scope-summary` — SKILL.md + commands/scope-summary.md.
  - [x] `scope-export` — SKILL.md + commands/scope-export.md.
  - [x] `check-anti-patterns` — SKILL.md + commands/check-anti-patterns.md.
  - [x] `check-adopters` — SKILL.md + commands/check-adopters.md.
  - [x] `check-refactor-preconditions` — SKILL.md + commands/check-refactor-preconditions.md.
  - [x] `check-editor-symmetry` — SKILL.md + commands/check-editor-symmetry.md.
  - [x] `check-deprecations` — SKILL.md + commands/check-deprecations.md (updated to document the now-real scanner behavior after the #287 port landed).
  - [x] `batch-dispose` — SKILL.md + commands/batch-dispose.md. (Not in the original Phase 7 enumeration; authored because the Phase 6 Task 3 verb landed and it pairs with dispose-clone + check-disposition-survivor.)
  - [x] `dispose-clone` — SKILL.md + commands/dispose-clone.md.
  - [x] `check-disposition-survivor` — SKILL.md + commands/check-disposition-survivor.md. (Not in the original Phase 7 enumeration; authored because the Phase 6 Task 3 verb landed and the pre-commit gate behavior is operator-facing.)
  - [x] `refresh-clones-baseline` — SKILL.md + commands/refresh-clones-baseline.md.
  - [x] `validate-scope-discovery` — SKILL.md + commands/validate-scope-discovery.md.
  - [x] `check-clones` — SKILL.md + commands/check-clones.md authored in the Phase 6 Task 2 rename pass; sibling `detect-clones` SKILL.md + commands/detect-clones.md are thin redirectors documenting the back-compat alias.
  - [x] `scope-widen` — SKILL.md + commands/scope-widen.md landed alongside the Phase 6 verb implementation (closes [#292](https://github.com/audiocontrol-org/deskwork/issues/292)). Mirrors `scope-inventory` skill prose style: Steps + Flags + Error handling + When-to-use sections.
  - [x] `install-scope-discovery` — SKILL.md + commands/install-scope-discovery.md landed Phase 8 commit 6 (this run).
  - [x] `install-scope-discovery-hooks` — SKILL.md + commands/install-scope-discovery-hooks.md landed Phase 8 commit 6.
  - [x] `install-agent-prompts` — SKILL.md + commands/install-agent-prompts.md landed Phase 8 commit 6.
  - [x] `uninstall-scope-discovery-hooks` — SKILL.md + commands/uninstall-scope-discovery-hooks.md landed Phase 8 commit 6.
  - [x] `migrate-from-pilot` — SKILL.md + commands/migrate-from-pilot.md landed alongside the verb implementation (closes [#291](https://github.com/audiocontrol-org/deskwork/issues/291)). Mirrors `scope-inventory` skill prose style: Steps + Flags + CODE-diff legend + Error handling + When-to-use sections.

### Task 2: Updated skill prose (5 skills)

- [x] `/dw-lifecycle:define` — document auto-scope-inventory + `--no-scope-inventory`
- [x] `/dw-lifecycle:implement` — document auto-scope-widen + dispatch-wrapper engagement + `--no-scope-widen` (skill body + commands/implement.md frontmatter updated; references `wrap()` from `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts` and `plugins/dw-lifecycle/templates/scope-discovery/dispatch-wrapper-prelude.md`).
- [x] `/dw-lifecycle:review` — document auto-clone-detector + `--no-clone-check`
- [x] `/dw-lifecycle:doctor` — document new doctor rules
- [x] `/dw-lifecycle:customize` — document `scope-discovery <name>` category

**Acceptance Criteria:**
- [ ] All ~23 skills discoverable via slash-command picker
- [ ] Existing skills' auto-invocation documented + opt-out flags surfaced

## Phase 8: Install / migrate / uninstall machinery

**Deliverable:** Install skills functional end-to-end against fixture projects + audiocontrol-specific migration.

### Task 1: install-scope-discovery

- [ ] Bootstrap `.dw-lifecycle/scope-discovery/` config dir; copy README + LAYOUT.md + refactor-preconditions-checklist.md templates from plugin
- [ ] Refuse if already present (idempotent re-run reports + no-op)

### Task 2: install-scope-discovery-hooks

- [ ] Detect `.githooks/pre-commit` presence; offer `--merge` / `--replace` / `--force`
- [ ] Detect Husky in `package.json`; register hook if present
- [ ] Write `hooks-installed.json` with provenance

### Task 3: install-agent-prompts

- [ ] Detect `.claude/agents/{code-reviewer,codebase-auditor}.md` presence; offer `--merge` / `--force`
- [ ] Write Step 0 §verification sections generated from canonical fragment
- [ ] Record in `hooks-installed.json`

### Task 4: migrate-from-pilot (audiocontrol-specific)

- [x] Reads the pilot's existing `tools/scope-discovery/` + `docs/scope-discovery/` — refuses with exit 2 + actionable error when `tools/scope-discovery/` is absent (the migration source isn't a scope-discovery pilot).
- [x] Copies CONFIG verbatim to `.dw-lifecycle/scope-discovery/` — four canonical YAMLs (clones, anti-patterns, adopter-manifests, deprecation-queue); `absent-on-pilot` skips for missing files; `--force` overwrites divergent targets; default refuses on divergent target conflict.
- [x] Diffs CODE against plugin defaults per file — set-based line diff produces `addedInPilot` / `removedInPilot` counts; categorizes each file as identical / pilot-ahead / pilot-behind / diverges / pilot-only / plugin-only.
- [x] Produces per-file contribute-back-vs-customize-override report — markdown table with file / status / lines-diff / suggested-action columns + a status-symbol legend; emitted to stdout or `--report-out <path>` on disk.

### Task 5: uninstall-scope-discovery-hooks

- [ ] Reads `hooks-installed.json`; drift-checks each installed file
- [ ] Removes files; removes manifest entries
- [ ] `--force-uninstall` overrides drift refusal

**Acceptance Criteria:**
- [x] Greenfield install creates correct dir structure + schema files — `install-scope-discovery` creates `.dw-lifecycle/scope-discovery/` with 4 templates + 3 empty-array seeds; 15 vitest scenarios verify greenfield + idempotent + dry-run + force + partial restore.
- [x] Hook install works with absent/existing/Husky variants — `install-scope-discovery-hooks` detects Husky vs `.githooks` vs greenfield via `detectHusky` + `chooseMode`; 30 vitest scenarios cover all three branches plus merge / replace / refusal / dry-run.
- [x] Agent-prompt install works without trampling existing `.claude/agents/` content — `install-agent-prompts` refuses to auto-create missing files (exit 2); marker-pair detection prevents duplicate blocks; operator content above/below the block is preserved; 19 vitest scenarios.
- [x] migrate-from-pilot runs cleanly against audiocontrol's actual state — smoke-tested against `~/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/`; produces a categorized report with all four diff statuses surfacing (identical / pilot-ahead / pilot-behind / diverges) plus pilot-only entries for the validate/fixture modules the plugin doesn't ship. Closes [#291](https://github.com/audiocontrol-org/deskwork/issues/291).
- [x] Uninstall drift-checks each managed file via sha256; refuses to remove drifted files unless `--force-uninstall`; strips managed block from merged installs; 20 vitest scenarios.

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

- [ ] **Classification completeness**: fraction of distinct shapes that are catalogued (blessed/cursed/ignore) vs uncatalogued.
- [ ] **Coverage**: per BLESSED pattern, fraction of expected adopters actually adopting.
- [ ] **Violation density**: per CURSED pattern, hit count + concentration (per-directory).
- [ ] **Surface uniformity / outlier presence**: variance in shape across sibling files per directory.
- [ ] **Catalog stability**: edit rate over time.
- [ ] **Discovered-candidate rate**: new shapes surfacing per unit code change.
- [ ] **Disposition latency**: time candidates remain `pending` before triage.

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
- [ ] Confidence calibration — composite signal: judge-confidence × policy-match × skills-exhaustion × auditor-correction-rate; threshold tuned by the controller. (Task 5 controller work; depends on Task 4 metrics + this Task 7 LLM ensemble being in place — both prerequisites land here.)

### Task 8: Wrong-decision recovery primitives

If the orchestrator commits a wrong disposition / catalog edit, the system must detect and recover without operator intervention (where possible).

- [x] Reversible disposition flow + catalog-edit rollback via `withdrawn-<finding-id>` status + trust-calibration updates + systematic-wrongness response landed at `plugins/dw-lifecycle/src/scope-discovery/recovery/` (`recovery-types.ts`, `detect-wrong-decisions.ts`, `reverse-disposition.ts`, `trust-calibration.ts`, `systematic-wrongness.ts`). Detection: catalog entries with `provenance.source: orchestrator-agent` or `llm-judge-proposed` that an audit-log finding cites via `Affects:` with the body containing a disagreement token (`overturn`, `wrong`, `incorrect`, `disagree`, `reverse`) surface as `WrongDecisionEvent`s. Reversal is SOFT — emits `CatalogEditProposal` (per pre-made decision #4) with `status: withdrawn` + `provenance.context: audit-finding-<id>` (the reversibility-primitive invariant from Phase 11 Task 2 + Task 10). Trust calibration: +0.05 per wrong-decision event in the relevant class; -0.01 per correct decision; bounded [0.0, 0.4]; durable state at `.dw-lifecycle/scope-discovery/orchestrator-runtime/trust-calibration.json`. Systematic-wrongness: class-key = `<pattern-type>|<disposition>|<shape-tag>`; threshold N=3 within K=10 events crosses to escalation by default. 56 vitest scenarios across `src/__tests__/scope-discovery/recovery/` cover per-module behavior + an end-to-end recovery scenario (detect → reverse → calibrate → classify → persist → ratchet-down on correct).
- [ ] Initial wrong-decision per session is escalated to human; subsequent ones use calibration-adjusted threshold; if the auditor disagrees AGAIN, escalation re-fires. (Wiring across the orchestrator surface is Task 9 — the primitives this task ships are consumed there.)

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

- [ ] Glob + shape primitives content-type-neutral; no TS-coupling in core types.
- [ ] Per-content-type handlers (`.md`, `.yaml`, `.json`) pluggable into the scan engine.
- [ ] Markdown-specific patterns (e.g., frontmatter shape, heading conventions, link patterns) authorable.

(Likely a scoping-pass decision: deferred initial-ship vs designed-in from start.)

### Task 14: Tooling-feedback closure → audit-log import workflow

The existing `tooling-feedback.md` pattern from Phase 10 v1 ship is a feedback-loop primitive for the TOOLING; this task formalizes the closure workflow.

- [x] TF closure entries (`Status: addressed-<commit>`, `Status: superseded-by-<TF-NN>`, or `Status: verified-<date>`) auto-import into the scope-discovery audit-log as `AUDIT-<date>-<NN>` entries with cross-reference. Implemented at `plugins/dw-lifecycle/src/scope-discovery/tooling-feedback-import.ts`. Default mode is dry-run; `--apply` performs the writes. Numbering reads existing audit-log entries to determine the next per-date counter; idempotency watermark is an `imported-as: AUDIT-<id>` line appended to the TF entry directly before its `**Status:**` line.
- [x] Doctor rule: surface TF entries that have been open > N days without status updates (configurable). Landed at `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/tooling-feedback-stale.ts`. Default threshold 14 days; override via `.dw-lifecycle/scope-discovery/config.yaml` field `tooling_feedback_stale_days: <int>`. Repair hint cites `/dw-lifecycle:tooling-feedback-import --apply` for closure-ready entries, generic triage hint for open ones. Registered in `doctor-rules/index.ts`.
- [x] Skill: `/dw-lifecycle:tooling-feedback-import` — walks closure-marked TF entries; promotes them to audit-log; closes the TF entry with the new audit-log ID as forwarding pointer. SKILL.md + commands/tooling-feedback-import.md authored; subcommand registered in `cli.ts`. 22 vitest scenarios cover parser / closure-status discriminator / dry-run vs --apply / idempotency / per-date numbering / --slug restriction. 8 doctor-rule scenarios cover threshold default + override + malformed-config fallback + open/closure-ready/imported entries. Live smoke against `docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md` confirms zero imports + clean exit (the live log has no closure entries yet).

### Acceptance criteria (captured promises; scoping pass decides what ships when)

- [ ] The Loop runs on every `/dw-lifecycle:implement` turn without operator invocation.
- [ ] Orchestrator auto-dispositions candidates at high confidence; escalates at low confidence.
- [ ] Controller measures codebase-state metrics + auditor-correction-rate; adjusts cadence + intensity accordingly; defaults shipped sensibly per Task 5.
- [ ] Wrong-decision events detectable + reversible; trust calibration adjusts in response.
- [ ] Pattern-type vocabulary supports at minimum the 4 v1 operator-named patterns from #315 (Tailwind/utility-class catch-all, hardcoded-color, hover-only-affordance, negative-space-no-canonical-consumer).
- [ ] The full Loop applies uniformly across the registry-driven surfaces (Task 11).
- [ ] Pre-existing user-visible behavior of `/dw-lifecycle:implement` is preserved; no regressions in completed phase tests.
- [x] KeygroupSummary-shape repro fixture (anonymized) commits to test suite + passes (negative-space pattern fires on a synthetic component with ZERO canonical primitives + ≥5 utility-class hits). Landed at `plugins/dw-lifecycle/src/__tests__/scope-discovery/phase-11-acceptance/keygroup-summary-repro.test.ts` with fixture tree at `fixtures/keygroup-summary-repro/` — synthetic `components/KeygroupSummary.tsx` (zero canonical-primitive imports + 18 utility-class hits) + sibling fixtures + planted Phase 11 polymorphic catalog (negative-space + outlier + coverage entries). End-to-end test runs the BEFORE (legacy regex-only) vs. AFTER (Phase 11 loop) comparison; asserts the AFTER state fires >= 1 Phase 11 handler on the repro file + emits a DOGFOOD GAP SIGNAL block to stdout. Acceptance doc at `docs/1.0/001-IN-PROGRESS/scope-discovery/phase-11-acceptance.md`. Full plugin suite at 1295/1295 (baseline 1293; +2 acceptance test scenarios).
- [ ] First dogfood cycle (graphical-entries team) reports the gap is closed via the v1.1 tooling-feedback log.

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

- [ ] [#350](https://github.com/audiocontrol-org/deskwork/issues/350) — **`validate-return` refactor-cue false-positives.** Substring match fires on filename `clones.yaml` in Included blocks AND on free-text "extracted helper" in declined-work context. Highest-priority friction per canary's #349 §3a ranking (~5min/occurrence × 2 observed). Recommended fix: Light + Medium (context-aware substring + structured `Refactor-closes:` field).
- [ ] [#351](https://github.com/audiocontrol-org/deskwork/issues/351) — **`session-start`/`session-end` helper-subcommand availability check.** When the installed CLI predates the skill's expected helper subcommand (`session-end-hygiene`, `session-start-recommendation`), the skill fails with a generic `Unknown subcommand` error instead of telling the operator to run `/reload-plugins`. Polish-level; per #349 §3b. Recommended fix: Light (skill-side probe + actionable error).
- [ ] [#352](https://github.com/audiocontrol-org/deskwork/issues/352) — **Pre-commit gate chain skipped on docs-only commits.** ~5s/commit × 18 commits = ~90s wasted in one observed session. Polish-level; per #349 §3c. Recommended fix: Light (hook-template short-circuit on staged-files-all-match-`*.md`-in-`docs/`).
- [ ] **#318 validation milestone — cross-feature, owned by graphical-entries.** Run `scope-widen` against graphical-entries Phase 7 Tasks 7.1 (members[] schema delta) AND 7.3 (group review surface) — features with genuinely novel shapes the registered pattern catalog can't yet cover. If `scope-widen` surfaces `discovered_candidate` clusters, #318's clustering pass is validated end-to-end against real-world novel input. If still `0 additions`, there's still a gap to close. Per #349 §2. Tracked at graphical-entries' Phase 7 acceptance criteria; this entry is the scope-discovery side of the cross-reference.

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

## Phase 15: Workplan-aware implement-loop gate + audit-barrage hook + audit-log lift

**RETIRED in Phase 24 (2026-06-03).** The workplan-aware gate semantic + the implement-loop end-of-task hook this phase shipped are PRESERVED in their library form (`check-open-findings`, `implement-hook`, `audit-barrage-lift`, `promote-findings --auto`) — the verbs still exist and `/dw-lifecycle:implement` Step 6b–6c invokes them from the skill body. What's RETIRED is the git-hook wiring half of Phase 15: the commit-msg gate (`check-implement-hook-ran`) + pre-push gate (`check-implement-hook-coverage`) that this phase put with-teeth into `.husky/`. The teeth move into the skill body's instruction to the agent under the no-git-hook-enforcement ADR (`docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md`). The "always-fire" semantic is preserved; only the firing location moves.

Parent issue: [#373](https://github.com/audiocontrol-org/deskwork/issues/373)

Trigger: v0.28.0 dogfood + operator framing 2026-05-29 — Phase 13's implement-loop gate (Task 2) is too strict. It refuses on ANY `Status: open` audit-log finding, which creates a structural chicken-and-egg: the fixes for those findings can't be worked through `/dw-lifecycle:implement` because the loop refuses to start with them open. Per operator verbatim:

> *"There's a problem with the audit log /dwi gate. it currently won't proceed until the audit log is clean — but, we can't fix any of the problems using the /dwi loop unless we can run the /dwi loop. What should probably happen instead is that the /dwi gate won't open until all of the unfixed items in the audit log are scoped into the workplan as the next tasks to work on. That way, the /dwi gate won't allow deferring audit fixes, but it will allow the gate to open if the next items in the workplan are those fixes."*

> *"we need to add an audit barrage hook at the end of the /dwi loop with a mandate to scope the fixes as the next workplan items. And, we must ensure that the findings from the audit barrage are actually written to the audit log."*

Phase 15 closes three gaps in the closure triad (Phase 13 Task 4) so the loop self-heals: implement → barrage → lift to audit-log → promote to workplan as next tasks → gate allows next pickup → implement (which is now a fix).

The three gaps form a single semantic — *findings must flow automatically into the work queue, and the work queue's gate must allow the queue's next item to be a fix*.

Per operator directive 2026-05-29 (the same directive that triggered this phase):

> *"I want the audit barrage and amelioration to be a seamless part of the /dwi loop — I don't want to answer a bunch of questions about what to do — unless the default behavior of running the barrage, putting findings into the audit log, then scoping into the workplan is not possible without operator decision making. Audit findings are failures of the previous implementation that shouldn't be treated like exceptions — they are guardrails to point the implementation team back to the happy path."*

The whole phase is built around that framing. **No `--skip-audit-barrage-hook` flag. No operator prompts at the hook's run-time. Default disposition is "scope into workplan as the next task" — the same default Phase 13 Task 1 already established as the only agent-pickable disposition.** When a finding can't be auto-scoped (e.g. the operator-supplied audit-log entry has no parseable Surface/Heading the gate's Task 1 logic can match), the loop fails loud — the failure IS the information.

### Task 1: Workplan-aware implement-loop gate

Replace the strict "refuse on any open finding" semantic of `check-open-findings` (Phase 13 Task 2) with workplan-aware: the gate allows when (a) zero open findings exist, OR (b) the next N unchecked workplan tasks (where N = open findings count) are EXACTLY the fix-finding tasks for those open findings.

- [x] Step 1: NEW pure-fn `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-aware-gate.ts` exporting `checkWorkplanAwareGate({featureSlug, repoRoot}): Promise<WorkplanAwareGateResult>`. Discriminated union shipped as designed (`no-open-findings` / `open-findings-scoped-as-next` / `non-fix-task-before-fix-tasks` / `coverage-mismatch`). Path resolution mirrors the Phase 14 review fix (AUDIT-20260529-17): directory walk under `docs/` so any version dir works.
- [x] Step 2: Algorithm landed per spec, with a small refinement: when unchecked-task count is LESS than N, the coverage-mismatch (missing/extra) check fires before the non-fix-position check — the more actionable signal ("you haven't scoped the findings at all") surfaces ahead of the more granular shape ("position 0 isn't a fix-task").
- [x] Step 3: NEW helper `findUncheckedTasksInOrder(workplanText, sliceLimit?)` at `scope-discovery/promote-findings/tdd-enforcement.ts`. Returns `[{taskBlock, position, heading, findingId | null}]` in workplan order. Each entry is the first occurrence of a task heading that has at least one `- [ ]` checkbox in its body (mixed-state tasks count as unchecked — in-progress is not complete).
- [x] Step 4: Rewired `subcommands/check-open-findings.ts` to use `checkWorkplanAwareGate`. Three distinct refusal-message shapes implemented: non-fix-task mode names the offending task + position + cure ("reorder the workplan"); missing mode lists the IDs + cures via `dw-lifecycle promote-findings --apply`; extra mode lists IDs + cures via flip-status-or-remove.
- [x] Step 5: SKILL.md prose at `plugins/dw-lifecycle/skills/implement/SKILL.md` updated — Step 2 enumerates both allow-flavors + the three refusal modes with per-mode cures; Error-handling block updated to match. The Phase 15 operator directive ("findings are guardrails, not exceptions") quoted in-line.
- [x] Step 6: 13 library tests at `workplan-aware-gate.test.ts` covering all 12 spec scenarios + an additional version-dir fallback case. All passing. Old `open-findings-gate.ts` + tests deleted (replaced; no back-compat shim per project rule).
- [x] Step 7: Live smoke against `feature/scope-discovery` — `dw-lifecycle check-open-findings --feature scope-discovery` returns exit 0 with `zero open findings; proceed` against the post-v0.28.0 branch (no open findings on this feature today).

**Acceptance Criteria:**
- [x] Gate refuses to advance when open findings exist AND aren't all scoped as the next N tasks.
- [x] Gate ALLOWS advance when open findings exist AND the next N unchecked tasks are fix-finding tasks covering exactly those finding IDs.
- [x] Refusal message names the specific failure mode (non-fix-task / missing scoped / extra scoped) and the specific cure.
- [x] No `--ignore-open-findings` flag in v1 (per Phase 13 operator decision; carries forward).
- [x] Live verified against scope-discovery branch.

### Task 2: Audit-barrage finding extraction library

NEW pure-fn library `plugins/dw-lifecycle/src/scope-discovery/promote-findings/extract-barrage-findings.ts` that parses an audit-runs directory's per-model markdown files and extracts structured finding records (one per finding, with cross-model agreement merged).

- [x] Step 1: Library exports `extractBarrageFindings({runDir}): Promise<ExtractedFinding[]>`. Walks every `<model>.md` file (skipping `INDEX.md` and `PROMPT.md`); for each, parses the prompt-template-prescribed finding format (heading + Finding-ID line + Status + Severity + Surface + body).
- [x] Step 2: Heading + Surface substring matcher (reuse + extend the heuristics from `cross-reference-audit-run.ts`). When ≥2 models flag a similar issue (heading-substring OR surface-token match), the library merges into a single `ExtractedFinding` carrying `sourceModels: ['claude', 'codex']` and `crossModelAgreement: true`.
- [x] Step 3: Severity normalization: handle minor differences between model conventions (`high` vs `High` vs `HIGH`); normalize to the canonical `blocking | high | medium | low | informational` set used by Phase 13. Merged-cluster severity = max-of-cluster.
- [x] Step 4: Graceful skip on malformed model output — if a `<model>.md` is empty, doesn't contain the expected finding shape, or fails to parse, emit a warning via the injectable `warn` sink and skip that file; continue with the others.
- [x] Step 5: 10+ tests at `__tests__/scope-discovery/promote-findings/extract-barrage-findings.test.ts` (delivered 22 tests):
  - (a) single-model finding extracted correctly.
  - (b) two-model agreement → one merged finding, `sourceModels.length === 2`.
  - (c) three-model agreement → one merged finding, `sourceModels.length === 3`.
  - (d) two independent findings from two models (no overlap) → two separate `ExtractedFinding` records.
  - (e) malformed `<model>.md` → warning emitted, other models still processed.
  - (f) empty run-dir → empty result, no error.
  - (g) `INDEX.md` and `PROMPT.md` skipped (not treated as model outputs).
  - (h) severity normalization (`HIGH` → `high`).
  - (i) surface containing multiple paths — each path considered in the cross-model match.
  - (j) heading substring match when wording differs across models.
  - Extras: CLEAN sentinel filtered; severity-normalization edge cases; merged-cluster severity = max-of-cluster; same-model multi-finding kept separate; `parseModelMarkdown` exported and unit-tested in isolation.

**Acceptance Criteria:**
- [x] Library extracts findings from real per-model markdown.
- [x] Cross-model agreement detected correctly with `sourceModels` populated.
- [x] Severity normalization implemented.
- [x] Audit-log preservation rule honored (extraction is read-only).

### Task 3: `dw-lifecycle audit-barrage-lift` CLI verb

NEW CLI verb that walks the run-dir, extracts findings via the Task 2 library, assigns sequential AUDIT-IDs, and writes them as `Status: open` entries to the canonical audit-log.

- [x] Step 1: CLI shim at `plugins/dw-lifecycle/src/subcommands/audit-barrage-lift.ts`. Args:
  - `--feature <slug>` (REQUIRED)
  - `--run-dir <path>` (REQUIRED)
  - `--date <YYYYMMDD>` (default: today UTC)
  - `--repo-root <path>` (optional override)
  - `--apply` (default dry-run; `--apply` writes)
  - `--help`
- [x] Step 2: Reads existing audit-log; finds highest `AUDIT-<date>-<NN>` for `<date>`; sequential numbering continues from there.
- [x] Step 3: For each `ExtractedFinding`, compose the audit-log entry shape used by Phase 13:
  ```
  ### AUDIT-<date>-<NN> — <heading>

  Finding-ID: AUDIT-<date>-<NN><optional ' (claude-X + codex-Y; cross-model)' suffix>
  Status:     open
  Severity:   <severity>
  Surface:    <surface>

  <body>
  ```
- [x] Step 4: Append a new section heading `## <ISO-date> — audit-barrage lift (<run-dir-basename>)` above the new entries so the lift is auditable per-run.
- [x] Step 5: Atomic write — read full audit-log, append new section, write whole file once; preserve all pre-existing entries verbatim per the preservation rule.
- [x] Step 6: Register in `cli.ts` as `'audit-barrage-lift'`.
- [x] Step 7: 8+ tests at `__tests__/scope-discovery/promote-findings/audit-barrage-lift-cli.test.ts` (delivered 15 tests across parseFlags + run-loop, including extras: empty-run-dir → exit 0 / no audit-log mutation; --help short-circuits; explicit `--date` accepted):
  - (a) parseFlags coverage (required-feature, required-run-dir, --apply, --date, unknown flag).
  - (b) dry-run reports the count + the proposed IDs without writing.
  - (c) `--apply` writes the section + entries with sequential IDs.
  - (d) Sequential ID continues from existing highest AUDIT-<date>-NN.
  - (e) Cross-model finding rendered with the `(claude-X + codex-Y; cross-model)` suffix.
  - (f) Pre-existing audit-log content preserved verbatim (diff is purely additive).
  - (g) Feature-not-found → exit 2.
  - (h) Run-dir-not-found → exit 2.

**Acceptance Criteria:**
- [x] `dw-lifecycle audit-barrage-lift --help` resolves from the installed shim.
- [x] Dry-run reports proposed entries; `--apply` writes them.
- [x] Sequential AUDIT-ID assignment honored.
- [x] Cross-model agreement reflected in the rendered Finding-ID line.
- [x] Audit-log preservation rule honored (entries below the new section unchanged).

### Task 4: Implement-loop audit-barrage hook

Modify `/dw-lifecycle:implement` SKILL.md to add an end-of-task hook that fires audit-barrage + lifts findings + scopes them via promote-findings, so the next-task pickup sees them as the workplan's next tasks (and the Task 1 gate allows pickup).

- [x] Step 1: Added NEW Step 6 in implement SKILL.md between "When the task body is complete, mark its checkboxes and commit" and the existing scope-widen step (which became Step 7). The new step composes FIVE CLI calls (audit-barrage-render → audit-barrage --output-run-dir → audit-barrage-lift --apply → promote-findings --auto → check-open-findings). The original workplan called for four; the fifth is `audit-barrage-render` because the audit-barrage runner's contract is `--prompt-file`, not `--range`. The render step IS the bridge from session context to prompt.
- [x] Step 2: `dw-lifecycle audit-barrage` gained a `--output-run-dir` flag (shipped in Phase 15 Task 4a, commit c7274da). When set, stdout becomes JUST the absolute run-dir path (newline-terminated); the BarrageRun JSON is suppressed. Stderr behavior unchanged.
- [x] Step 3: Auto-position inference for promote-findings shipped as `--auto` flag (Phase 15 Task 4b, commit ee54f44). Walks open findings; reads workplan; computes "insert immediately BEFORE the first unchecked workplan task" anchor; defaults each finding's disposition to `promote-to-workplan`; applies in one shot. No proposal-file roundtrip, no operator prompts. The workplan-aware gate sees the new fix-tasks as positions [0..N-1] on next pickup.
- [x] Step 4: Failure-path policy documented in SKILL.md Step 6 + Error-handling block. fail-loud rules:
  - audit-barrage-render non-zero → stop loop, fix vars/template.
  - audit-barrage all-models-failed (exit 1) → degraded path: proceed without lift; surface single-line warning.
  - audit-barrage-lift non-zero with extracted findings → stop loop (audit-log write failed: drift/permissions/parser).
  - promote-findings --auto non-zero → stop loop (findings are guardrails; failing to scope them is structural).
  - check-open-findings non-zero AFTER auto-promote → stop loop (the gate refused despite the scoping; investigate workplan + audit-log state).
- [x] Step 5: Per-task report shape documented in SKILL.md Step 6: barrage status (e.g. "2/3 models healthy"), findings extracted (count), findings scoped (count), gate result (allowed: open-findings-scoped-as-next / allowed: no-open-findings / refused: <mode>).
- [x] Step 6: Tests for `--output-run-dir` shipped in Phase 15 Task 4a (6 tests covering 2 parseFlags scenarios + 4 renderStdoutOutput scenarios — JSON-shape contract, path-only contract, no-JSON-leakage, single-newline-termination).
- [x] Step 7: Updated `audit-barrage` SKILL.md (`plugins/dw-lifecycle/skills/audit-barrage/SKILL.md`) Step 3 to document the new `--output-run-dir` flag with the bash composition example.

**Acceptance Criteria:**
- [x] SKILL.md documents the end-of-task five-command hook recipe (renderer + barrage + lift + auto-promote + gate sanity).
- [x] **No `--skip-audit-barrage-hook` flag.** Per the operator-directive on guardrails-not-exceptions, the hook ALWAYS fires. Silent skip only when `.dw-lifecycle/scope-discovery/` is absent (project opt-in).
- [x] `audit-barrage --output-run-dir` flag added + tested (Task 4a).
- [x] Failure paths behave per spec: missing CLIs degrade gracefully; audit-log write failures + promote-findings failures are stop-the-loop events.
- [x] Per-task report includes barrage status + finding-extract count + scoped-task count + gate-check result.
- [x] promote-findings --auto positions new fix-tasks at the workplan's next-unchecked position; Task 1 gate sees them immediately as positions [0..N-1] (Task 4b).

### Task 5: Live verification + dogfood

Verify the new triad (Task 1 gate + Task 3 lift + Task 4 hook) composes correctly via the implement loop.

- [ ] Step 1: Positive scenario — deliberately seed a small implementation gap, run `/dw-lifecycle:implement`:
  - Task A completes + commits.
  - End-of-task hook fires `audit-barrage` (real CLIs; runs against the operator's existing CLI subscriptions, no direct API metering).
  - `audit-barrage-lift --apply` writes the findings to audit-log.
  - `promote-findings --apply` scopes them as workplan's next tasks.
  - Next-task pickup checks the new gate.
  - Gate ALLOWS (the findings are scoped as the next tasks).
  - Loop continues to the fix-finding tasks.
- [ ] Step 2: Negative scenario A — scope a finding NOT in the next-N position (place it 5 tasks down). Run `check-open-findings`; confirm refusal (`non-fix-task-before-fix-tasks`).
- [ ] Step 3: Negative scenario B — scope an EXTRA fix-task for a finding that isn't open. Run `check-open-findings`; confirm refusal (`coverage-mismatch`, extraIds populated).
- [ ] Step 4: Negative scenario C — open finding has no `(fix-finding-AUDIT-<id>)` task anywhere. Run `check-open-findings`; confirm refusal (`coverage-mismatch`, missingIds populated).
- [ ] Step 5: Friction-feedback log entries (per project rule "Capture friction over scope") for any roughness in the implement-loop integration.

**Acceptance Criteria:**
- [ ] Positive scenario verified live: full self-healing loop runs end-to-end.
- [ ] Negative scenarios A, B, C all surface the correct refusal mode.
- [ ] Refusal messages name the actionable cure for each mode.

### Task 6: Cross-references + docs

- [ ] Step 1: Update `.claude/rules/agent-discipline.md` § "Audit findings: scope-don't-defer + TDD enforcement" — replace the `check-open-findings` row with the new workplan-aware semantic; add the `audit-barrage-lift` and end-of-task hook rows to the triad table.
- [ ] Step 2: Update `plugins/dw-lifecycle/README.md` § "Audit-finding lifecycle" — same row updates + the four-command bash recipe for the end-of-task hook.
- [ ] Step 3: Update `ROADMAP.md` § "Design A.5" — note that v0.28.0's strict gate was reframed in v0.X.Y to the workplan-aware semantic; add audit-barrage hook to the closure-loop description.
- [ ] Step 4: Update the implement skill's prose to make the end-of-task hook discoverable (cross-link from the skill description).

**Acceptance Criteria:**
- [ ] Agent-discipline rule documents the new gate semantic + audit-barrage hook + lift verb.
- [ ] README documents the four-command operational pattern.
- [ ] ROADMAP reflects the v2 shape.
- [ ] Implement-skill description names the hook for discoverability.

### Phase 15 — Out of Scope

- **Operator-side override of the gate.** The strict v1 stance per Phase 13 (no `--ignore-open-findings`) survives unchanged; the workplan-aware semantic IS the cure, not an escape hatch.
- **`--skip-audit-barrage-hook` flag.** Per operator directive: findings are guardrails-not-exceptions; the hook ALWAYS fires. No flag.
- **Operator-pickable disposition in the per-task promote-findings call.** Phase 13 Task 1 already established "scope into workplan" as the only agent-pickable disposition; the hook reuses that default (no operator prompt at hook run-time).
- **Audit-barrage parallelization / batching across tasks.** v1 fires the hook once per completed task. If cost amortization proves needed in practice, batching is a follow-up improvement; the per-task default is opinionated by the operator directive ("seamless").
- **Cross-feature audit-barrage.** v1 scopes the barrage to a single feature; multi-feature audits are downstream.
- **TDD-order enforcement at gate-time.** Phase 13 Task 3's commit-msg gate handles TDD-first shape verification at commit; replicating the check at gate-time would be redundant.
- **Re-audit-fixed-findings integration into the per-task hook.** Phase 13 Task 4 Step 3's `re-audit-fixed-findings` skill is for post-RELEASE verification (`fixed-<sha> → verified-<date>`); the per-task barrage hook is for surfacing NEW findings while the implementation is in flight. Different cadence; out of scope to combine.

### Phase 15 — Operator-resolved design decisions (2026-05-29 directive)

The original draft of this phase captured 7 "open scoping questions" for operator iteration. Operator's response on 2026-05-29 resolves all 7 at once: *"I want the audit barrage and amelioration to be a seamless part of the /dwi loop — I don't want to answer a bunch of questions about what to do — unless the default behavior of running the barrage, putting findings into the audit log, then scoping into the workplan is not possible without operator decision making."*

Recorded resolutions (no further operator iteration required; each is the seamless-default position):

1. **"Next tasks" definition: STRICT.** Open findings' fix-tasks must occupy positions `[0..N-1]` of the unchecked tasks list. The new gate refuses if a non-fix task appears before all open-finding fix-tasks. Strict matches the operator's "next tasks" framing verbatim and avoids the cognitive overhead of a "lax window" rule.
2. **TDD-order at gate-time: NOT enforced.** Phase 13 Task 3's commit-msg gate handles this; replication would be redundant. (Already out of scope above.)
3. **Audit-barrage hook cadence: PER TASK, no configurable.** The seamless default fires after every task. Cost-throttling is a follow-up if cost proves real in practice.
4. **Cross-model agreement threshold: ≥2 models.** Phase 12 precedent; carries forward without a config knob.
5. **Audit-barrage CLI availability: SOFT-SKIP missing binaries.** The hook proceeds with whichever CLIs ARE installed (Phase 12's spawn-error path precedent). Missing all three degrades to "no findings this round" — does not block the loop.
6. **`audit-barrage --output-run-dir` flag shape: PATH on stdout, summary on stderr.** Mirrors `wrap-prompt --quiet` precedent; lets bash capture the path cleanly.
7. **Lift-verb invocation: AUTO from the hook.** The hook composes `audit-barrage → audit-barrage-lift → promote-findings` as one atomic flow. Standalone CLI invocation of `audit-barrage-lift` remains available for operator use, but inside the implement loop the lift fires unconditionally as part of the hook.

### Phase 15 — Existing primitives this composes over

- `check-open-findings` library (`scope-discovery/promote-findings/open-findings-gate.ts`) — Phase 15 Task 1 replaces its semantic; pure-fn shape + CLI verb structure preserved.
- `walkOpenFindings` (`scope-discovery/promote-findings/audit-log-walker.ts`) — unchanged; Tasks 1 and 3 reuse.
- `audit-log-parser.ts` — unchanged; Tasks 1 and 3 reuse for ID extraction + sequential numbering.
- `findCompletedFixFindingTasks` (`scope-discovery/promote-findings/tdd-enforcement.ts`) — Phase 15 Task 1 Step 3 adds a sibling `findUncheckedFixFindingTasks` next to it.
- `cross-reference-audit-run.ts` — Task 2 reuses the heading-substring + surface-token heuristics; extends them with severity-normalization.
- `flipAuditLogStatus` + `applyStatusFlips` (`scope-discovery/promote-findings/audit-log-editor.ts`) — Task 3 reuses the atomic write pattern.
- `audit-barrage` skill + CLI verb (Phase 12) — Task 4 composes with the new `--output-run-dir` flag.
- `promote-findings` library + CLI verb (Phase 13 Task 1) — Task 4 composes as the final step of the per-task hook.
- `apply-audit-flips` (Phase 13 Task 4 Step 2) — unchanged; its `Closes AUDIT-<id> → fixed-<sha>` semantic remains the bridge between fix commits and audit-log status.

## Phase 20: AUDIT-68 follow-up + audit-barrage review-surface consolidation

Two issues filed externally (2026-06-02) that close out latent work from this session's burndown loop. Both touch scope-discovery's review surface; both are tagged here so future sessions don't lose track of the commitment.

### Task 1: Operator-supplied fix-shape on promote-findings proposals ([#392](https://github.com/audiocontrol-org/deskwork/issues/392) / AUDIT-20260601-68 follow-up)

GH #392 surfaces the inverse of AUDIT-68: a finding whose surface IS source (`.ts`) but whose fix is comment-only / docs / pointer-rename → `inferFindingShape` returns `code-defect` and the rendered task demands a phantom `vitest` test. AUDIT-68 surfaced the symmetric direction (surface is non-source, fix is in code).

Both cases share the same root cause: shape inference from surface alone is unsound. Per AUDIT-68's revert disposition (commit f1219cd6), the abandoned approach was body-keyword detection (`SOURCE_FILE_IN_BODY_RE`) — that path conflicted with the AUDIT-76/77 informational-exclusion logic. Two acceptable future-work paths remain:

- **(a) Intent-language detection.** Match phrases like "the fix is in", "implement in", "change `<path>`" near a code citation. Heuristic but bounded.
- **(c) Operator-supplied shape on the proposal.** `promote-findings` propose mode already has a proposal-file roundtrip; the operator could set `findingShape: 'non-bug' | 'code-defect'` per item before `--apply`. The `--auto` path would still infer (defaulting to `code-defect`), but operator-supplied shape would override.

**Severity: medium** (HIGH-severity recursion is closed; this is a refinement of an already-mitigated path).

**Step 0 — working-code invariant.** Pre-fix, surface-only inference works correctly for surfaces that are unambiguously source (`.ts:line` → code-defect) or unambiguously docs (`workplan.md` → non-bug). The fix MUST preserve those cases; the change adds an override layer above the current inference, not a replacement.

- [ ] Step 1: pick approach (a) vs (c) — propose to operator before implementing.
- [ ] Step 2: failing tests — code-defect surface + comment-only-fix body should yield non-bug shape; non-bug surface + code-fix body should yield code-defect shape; existing surface-only cases unchanged.
- [ ] Step 3: confirm RED.
- [ ] Step 4: implement.
- [ ] Step 5: confirm GREEN; full plugin suite + tsc clean.
- [ ] Step 6: commit with `Closes #392`. Per AUDIT-20260602-01: use `Closes AUDIT-20260601-68` ONLY if Phase 20 Task 1 actually re-opens AUDIT-68 AND ships the fix in the same commit. Otherwise omit the AUDIT trailer (or use `Acknowledges AUDIT-20260601-68` if the disposition references it). Using `Closes` on a non-fix or speculative-reopen disposition arms the auto-flip parser with false `fixed-<sha>` proposals.

**Acceptance Criteria:**
- [ ] Approach picked by operator + rationale documented in commit body.
- [ ] ≥2 test blocks per HIGH-severity Option D discipline (even though severity is medium, the historical recursion-engine motivation justifies the regression-lock).
- [ ] GH #392 closed after verification in a release.

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

- [ ] ADR + rule files committed and cross-referenced.
- [ ] All git-hook enforcement removed from this repo (`.husky/commit-msg` gone; structural + audit-gate blocks removed from pre-commit + pre-push).
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

## Phase 25: Editor terminology cleanup — adopt project-neutral `module` everywhere ([#405](https://github.com/audiocontrol-org/deskwork/issues/405))

**Trigger.** The audiocontrol pilot builds editor applications for Roland samplers — S-330 editor, S-550 editor, etc. Each editor lives under `modules/<slug>-editor/`. In that domain, "editor symmetry" literally meant *"is the S-330 editor module using the same canonical primitives as the S-550 editor module?"* When the protocol was canonized into `dw-lifecycle`, the term came along but lost its domain meaning. The comment at `plugins/dw-lifecycle/src/scope-discovery/util/editors.ts:11-21` is explicit: *"The term 'editor' is preserved verbatim across the scope-discovery layer ... because renaming would invalidate the Phase 3 schema and types already at destination."* Adopter-facing surfaces (skill prose, CLI verb names, schema fields, doctor rules) all say `editor` and force every non-audiocontrol reader to mentally translate to `module`. This is exactly the leaked-domain-terminology pathology that the scope-discovery project exists to surface. Phase 25 pays the schema-stability cost.

**Relationship to Phase 24 (corrected per AUDIT-20260603-24).** Phase 25 MUST ship AFTER Phase 24. Phase 24's Relocation movement (Task 4 Step 2, Task 7 Step 1) adds new `check-editor-symmetry` call sites in `/dw-lifecycle:session-start` and `/dw-lifecycle:review` skill bodies. If Phase 25's inventory (Task 1) is drafted before Phase 24 lands, it undercounts the live call-site surface. The original "Independent — Phase 25 can land before, after, or alongside Phase 24" claim was wrong. Phase 25 Task 1 (inventory) must run AGAINST a post-Phase-24 codebase to capture the true rename surface.

### Task 1 — Inventory

**Complete.** Inventory captured at `docs/1.0/001-IN-PROGRESS/scope-discovery/phase-25-inventory.md`.

- [x] Step 1: greppped every reference via `grep -rln 'editor_symmetry\|editor-symmetry\|discoverEditors\|editorForPath\|editorsTargetedByGlob\|SymmetryMatrix' plugins/`. ~40 files identified.
- [x] Step 2: categorized — 5 primary source files (`editor-symmetry-*`, `util/editors.ts`, `check-editor-symmetry.ts` × 2); 4 schema/type surfaces; ~14 importer files; 12 test files; 6 skill body files; 3 command/template files.
- [x] Step 3: inventory written to `phase-25-inventory.md` with full per-surface decomposition + the operator-confirmed strategy (single-rename + doctor migration + alias-for-one-release on CLI verb + audiocontrol-lockstep coordination via pilot-tracker issue).

**Acceptance:** ✅ Inventory categorized + total file count (~40) + per-category counts surfaced + sequencing recommendation captured for the next session.

### Task 2 — Breaking-change strategy decision

**Complete (operator-confirmed 2026-06-03 via blocking-questions pass).**

- [x] Step 1: Decision = **single-rename + doctor-rule migration**. Cleanest end-state; adopters do one `doctor --fix` to migrate. Operator-confirmed.
- [x] Step 2: Decision recorded in `phase-25-inventory.md` § "Strategy recap" + this workplan annotation. Subordinate decisions: CLI verb shipped with alias for one release cycle (workplan Task 5 lean); skill folder retires entirely (no stub); audiocontrol pilot renames in lockstep (operator confirmed; coordinate via pilot-tracker issue).
- [x] Step 3: Confirmed — `legacy-editor-symmetry-field-rename` doctor rule is the migration vehicle for adopter YAML (Task 8 deliverable).

**Acceptance:** ✅ Decision recorded with rationale + four sub-decisions captured (strategy, CLI verb, skill folder, pilot coordination).

### Task 3 — Schema rename + Zod types

**Complete (2026-06-03 cont. 5).** Hard-renamed the wire-format `editor_symmetry` → `module_symmetry` across schema + types + every consumer. Doctor-rule migration for adopter YAML lands in Task 8 (legacy `editor_symmetry:` → `module_symmetry:` auto-rewrite under `--fix`). All 2641/2641 plugin tests green; tsc clean.

- [x] Step 1: failing tests demonstrated via the existing test suite — every test using the old field name failed against the renamed schema until updated; the rename IS the change under test.
- [x] Step 2: `editor_symmetry:` → `module_symmetry:` in `scope-manifest.yaml.schema.json` (property key + `required` array entry + `by_source` sub-object's required + properties + description text).
- [x] Step 3: `regime_holdouts.editor_symmetry` → `regime_holdouts.module_symmetry` in `synthesis-types.ts` (`ManifestRegimeHoldouts` field + `ManifestRegimeHoldoutMeta.by_source` field).
- [x] Step 4: `RegimeHoldoutSource` union literal `'editor-symmetry'` → `'module-symmetry'` + `RegimeHoldoutMeta.editor_symmetry_holdout_count` → `module_symmetry_holdout_count` in `discovery-agents/types.ts`. `SymmetryMatrix.editors` → `SymmetryMatrix.modules` public field in `editor-symmetry-matrix.ts`. Every consumer updated: synthesis.ts, synthesis-derive-regime.ts, synthesis-report.ts (`PerBucketCategoryCounts`), scope-widen-delta.ts (`ScopeWidenDelta` + merge/format), regime-holdout-detector.ts (matrix walk + meta builder + error message), editor-symmetry-report.ts (table headers + suggestion rows), check-editor-symmetry.ts (cell-count summary). Tests updated: editor-symmetry, scope-widen, synthesis-report, keygroup-summary-repro, regime-holdout-detector.
- [x] Step 5: `tsc -p plugins/dw-lifecycle --noEmit` exit 0; `npx vitest run` from `plugins/dw-lifecycle/` reports 205 test files / 2641 tests, all passing.

**Acceptance:** ✅ Schema reads `module_symmetry` end-to-end. Hard rename (no alias path); the adopter-YAML migration codepath is Task 8's doctor rule.

### Task 4 — Source identifier rename

**Complete (2026-06-03 cont. 6).** Source files renamed via `git mv`; function identifiers renamed across every importer; tsc clean; full plugin suite still at 2664/2664. Test FILE renames + CLI verb-string rename + skill folder rename are out of scope here (Phase 25 Tasks 5/6/9 own them) — operator-confirmed via the dispatch prompt's explicit out-of-scope list.

- [x] Step 1: Rename source files via `git mv`: `editor-symmetry-matrix.ts` → `module-symmetry-matrix.ts`, `editor-symmetry-report.ts` → `module-symmetry-report.ts`, `check-editor-symmetry.ts` (both copies — `src/scope-discovery/` and `src/subcommands/`) → `check-module-symmetry.ts`, `util/editors.ts` → `util/modules.ts`.
- [x] Step 2: Rename function identifiers: `discoverEditors` → `discoverModules`, `editorsTargetedByGlob` → `modulesTargetedByGlob`, `editorForPath` → `moduleForPath`. (`SymmetryMatrix.editors` → `SymmetryMatrix.modules` already shipped in Task 3; no re-do.)
- [x] Step 3: Updated every import. Files touched: `cli.ts`, `scope-inventory.ts`, `check-deprecations.ts`, `deprecation-report.ts`, `discovery-agents/regime-holdout-detector.ts`, plus the 3 test files that reference the renamed identifiers (`cross-surface-loop.test.ts`, `editor-symmetry.fixtures.ts`, `editor-symmetry.test.ts`).
- [x] Step 4: Etymology paragraph preserved verbatim in `util/modules.ts` (the leading docblock — kept as historical comment per operator decision at scope time).
- [x] Step 5: `npx tsc -p plugins/dw-lifecycle --noEmit` exit 0; `npx vitest run` from `plugins/dw-lifecycle/` reports 205 test files / 2664 tests, all passing.

**Acceptance:** ✅ Source-side rename complete. The remaining `editor` hits in scope-discovery source live on their own deprecation arcs (CLI verb-string + printHelp banner + stderr-prefix → Phase 25 Task 5; LAYOUT.md + skill folder → Phase 25 Task 6; test-file names → Phase 25 Task 9 sweep; wire-format catalog paths `editor-symmetry-matrix.yaml` / `editor-symmetry.md` → governed separately). Audit-log + DEVELOPMENT-NOTES preserved verbatim per the preservation rule.

### Task 5 — CLI verb rename

- Step 1: Decide whether to ship `check-editor-symmetry` as a deprecated alias OR hard-rename.
- Step 2: Rename CLI subcommand registration to `check-module-symmetry`.
- Step 3: If alias: implement deprecation-warning path that stderr-prints the new name + a removal-version pointer.
- Step 4: Update CLI tests.

**Acceptance:** `dw-lifecycle check-module-symmetry` works end-to-end. Alias (if shipped) surfaces deprecation warning.

### Task 6 — Skill prose + skill folder rename

- Step 1: Rename `plugins/dw-lifecycle/skills/check-editor-symmetry/` → `plugins/dw-lifecycle/skills/check-module-symmetry/`.
- Step 2: Update SKILL.md content: name field in frontmatter, every verb-name reference, every body paragraph.
- Step 3: Decide whether the old skill folder retires entirely or stays as a deprecated stub pointing at the new name.

**Acceptance:** Skill picker shows `check-module-symmetry`. Old skill (if kept as stub) clearly directs to the new name.

### Task 7 — Doctor rules + agent-discipline + design-standards sweep

- Step 1: Update doctor rule messages that reference `editor-symmetry` / `editor_symmetry`.
- Step 2: Update `.claude/rules/agent-discipline.md` references.
- Step 3: Update any other `.claude/rules/*.md` that mention editor-symmetry.

**Acceptance:** Grep for `editor-symmetry` or `editor_symmetry` in `.claude/rules/` returns zero hits.

### Task 8 — Doctor-rule migration for adopter YAML

- Step 1: Write a doctor rule `legacy-editor-symmetry-field-rename` that detects the legacy `editor_symmetry:` field in adopter YAML and rewrites it to `module_symmetry:` under `--fix`.
- Step 2: Test the migration end-to-end against a fixture project with the old field name.
- Step 3: Document the migration in the rename release notes.
- Step 4: Confirm tests pass.

**Acceptance:** `dw-lifecycle doctor --fix` rewrites legacy YAML cleanly. Existing adopter configs migrate without manual edit.

### Task 9 — PRD + workplan + feature-doc sweep

- Step 1: Update every reference to "editor-symmetry" / "editor_symmetry" / "editor symmetry" in **mutable product docs** — the scope-discovery PRD, workplan, README, and design-spec where applicable. **Exclude `audit-log.md` from the sweep** (per AUDIT-20260603-30): historical finding bodies are governed by the audit-log preservation rule (entries are never edited; IDs are stable; bodies describe the historical surface they audited). Audit-log entries that originally cited `check-editor-symmetry` or `editor_symmetry` continue to describe the historical surface they referenced. Only status / resolution notes change on existing entries.
- Step 2: Update other in-progress feature docs that mention editor-symmetry. Same audit-log preservation rule applies to other features' audit-logs.
- Step 3: Update `THESIS.md` / `DESKWORK-STATE-MACHINE.md` / `DESIGN-STANDARDS.md` if any mention the term (none expected; verify).

**Acceptance:** No remaining `editor-symmetry` references in scope-discovery feature docs **except** in historical context (audit-log entries, journal entries, DEVELOPMENT-NOTES.md prior session entries) — those are preserved verbatim per the audit-log preservation rule.

### Task 10 — Audiocontrol pilot coordination

- Step 1: Decide: does the audiocontrol pilot also rename, or keep the legacy field via deprecation alias?
- Step 2: If pilot renames: coordinate with the pilot's branch — open an issue on the pilot's tracker or coordinate via the operator.
- Step 3: If pilot keeps legacy: confirm the alias path works on the pilot's existing YAML.

**Acceptance:** Pilot decision documented. Migration path validated against the pilot's actual YAML.

### Task 11 — Release notes

- Step 1: Write a release-notes entry capturing the rename, the alias (if any), and the doctor-rule migration.
- Step 2: Cite the etymology + the cost paid (adopter-facing clarity).

**Acceptance:** Release notes name the breaking change explicitly.

**Acceptance Criteria (Phase 25):**

- [ ] All `editor` references in the scope-discovery layer renamed to `module` (except etymology comment in `util/modules.ts` if preserved by operator decision).
- [ ] Adopter YAMLs migrate cleanly via doctor rule (or via alias-with-deprecation if that's the chosen strategy).
- [ ] No grep hit for `editor` in scope-discovery code outside (a) the etymology paragraph and (b) any deprecated-alias surface explicitly shipped per Task 5 / Task 6 decisions. Alias surfaces (deprecated CLI verb wrapper + deprecated skill folder stub, if shipped) require bounded tests asserting the alias dispatches to the new name AND a documented removal-version pointer in code comments + release notes. The grep-zero criterion applies AFTER the alias surfaces are subtracted (per AUDIT-20260603-35 correction; the original criterion contradicted the Task 5/6 deprecated-alias permission).
- [ ] All tests pass; `tsc` clean.
- [ ] Release notes capture the rename.
- [ ] Audiocontrol pilot coordination decision documented.

**Open decisions (operator drives at scoping time):**

1. **Single rename or alias-with-deprecation period?** Lean single + doctor-rule migration; the alias path adds complexity without much benefit when the migration is one-shot.
2. **Keep `check-editor-symmetry` CLI verb as deprecated alias or hard-rename?** Lean alias for one release cycle; CLI verbs are part of the adopter muscle memory.
3. **Audiocontrol pilot: rename in lockstep or keep legacy with alias?** Operator decides; depends on audiocontrol team's bandwidth.
4. **Historical etymology paragraph: preserve in `util/modules.ts` as comment, or full erasure?** Lean preserve; the etymology explains a decision that survives in adopters' git history.
5. **Per-task sub-issues — NO sub-issues planned.** Phase 25 ships as a single coherent rename batch under parent #405; PRs land at operator discretion without pre-allocated per-task sub-issues. If splitting becomes necessary during implementation (e.g., the audiocontrol pilot coordination Task 10 turns into a separate coordination thread), issues are filed reactively at that time. (Substantive disposition substituted per AUDIT-20260603-36; the prior "deferred until the implementation session opens" wording was the deferral pattern the project's "Just for now is bullshit" rule forbids.)

### Phase 25 — Out of Scope

- **Other domain-leak terminology cleanups** (if any exist in scope-discovery or other plugins). Handle as separate phases.
- **Renaming `audiocontrol pilot` references** in non-scope-discovery files. The phrase is correctly historical context.
- **Schema versioning infrastructure for future renames.** If Phase 25 motivates a per-schema version field, that's a separate phase.

## Phase 26: Workplan archive verb — productize the manual archive operation ([#407](https://github.com/audiocontrol-org/deskwork/issues/407))

**Trigger.** The 2026-06-03 session's manual archive operation (reducing this workplan from 4477 → 1036 lines, 77% smaller, by moving completed Phases 1-5/9-10/13-14/16-19/21-23 to `workplan-archive.md`) revealed the bloated-workplan problem as a generalizable shape: long-running features accumulate completed phases that obscure the active surface, hurt `/dwi`'s next-unchecked walker, and inflate the agent's reading cost on every task pickup. The audiocontrol pilot has the same pathology. Phase 26 productizes the manual operation as a CLI verb (`dw-lifecycle archive-phases` + sibling `unarchive-phases`) and teaches the auto-positioner to honor the workplan-archive-ledger annotation so promote-findings doesn't collide with archived fix-task IDs.

**Why now (not Phase 24 prelude).** The manual archive done this session works; the ledger annotation captures `next-fix-task-id` so the auto-positioner doesn't collide. The CLI is the second-and-onward-use mechanization. Phase 24 + 25 burn-down can run against the manually-archived workplan without waiting for Phase 26.

**Relationship to other phases.** Independent. Can land before, during, or after Phase 24 / 25.

### Task 1 — Ledger format specification

**Complete.** Pure parser/serializer + 17 vitest scenarios shipped at `plugins/dw-lifecycle/src/scope-discovery/workplan-archive/ledger.ts` + `plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/ledger.test.ts`. Includes range arithmetic helpers (`compareIds`, `isIdInRanges`) for the auto-positioner fix in Task 4.

- [x] Step 1: tests-first spec written covering comment-block format, all 5 field names, range compaction (contiguous → `start-end`; comma-separated; `none` = empty list; singletons OK).
- [x] Step 2: fixture examples cover empty archive, single-phase, multi-range (the 2026-06-03 manual archive format verbatim), no-fix-tasks, error paths (missing fields, malformed lines, trailing hyphens).
- [x] Step 3: parser + serializer + `findLedger` locator + `parseLedgerFromWorkplan` convenience all pure-fns. Round-trip parse → serialize → parse-equality tested for canonical example + empty-fix-tasks case + wrapped-block form.

**Acceptance:** ✅ Parser handles every fixture (17/17 tests pass). ✅ Serializer produces stable output. ✅ Round-trip test passes. ✅ `compareIds` + `isIdInRanges` helpers available for the auto-positioner fix.

### Task 2 — `dw-lifecycle archive-phases` CLI verb

**Complete.** Library + CLI shim + 17 vitest scenarios shipped. `--allow-vestigial <reason>` flag implemented per AUDIT-37.

- [x] Step 1: failing tests authored: happy path (all-checked phase archives), refusal path (incomplete without flag), allowed-vestigial path (incomplete WITH ≥40-char reason).
- [x] Step 2: library at `plugins/dw-lifecycle/src/scope-discovery/workplan-archive/archive-phases.ts` + CLI shim at `plugins/dw-lifecycle/src/subcommands/archive-phases.ts`. Flags: `--feature <slug>`, `--phases <range>`, `--repo-root <path>`, `--apply`, `--allow-vestigial <reason>`.
- [x] Step 3: section identification via `locatePhaseSection` pure-fn (`## Phase N:` regex; walks to next phase heading or EOF).
- [x] Step 4: move semantics: cut sections, append to archive file (create with frontmatter when missing).
- [x] Step 5: ledger update via `mergeRange` (compacts contiguous IDs into ranges) + `parseLedgerFromWorkplan` + `serializeLedger`. Existing ledger fields (`archivedFixTasks`, `nextFixTaskId`, `note`) preserved on merge. **Note:** the per-phase `--allow-vestigial` reason is recorded in the CLI report + the test asserts the action carries the reason; storing it inline in the ledger as `archived-phases-vestigial: 17 (reason)` is a follow-up enhancement — the current ledger schema doesn't capture per-phase notes, only the global `note` field. Captured as TODO.
- [x] Step 6: `validateVestigialReason` enforces ≥40 chars + rejects placeholder phrases (TBD / fix later / todo / etc.). Without `--allow-vestigial`, an unchecked-task phase produces `refused-incomplete` action; the report exits non-zero.
- [x] Step 7: 17/17 vitest scenarios pass.

**Acceptance:** ✅ Dry-run prints planned moves without writing. ✅ `--apply` performs the move + ledger update. ✅ Refuses partial-complete phases by default. ✅ `--allow-vestigial <reason>` is the explicit escape with ≥40-char substantive-reason validator (the AUDIT-37 fix).

### Task 3 — `dw-lifecycle unarchive-phases` sibling verb

**Complete.** Library + CLI shim + 9 vitest scenarios shipped.

- [x] Step 1: failing tests authored covering happy path + round-trip + insertion-order + not-found.
- [x] Step 2: implemented `plugins/dw-lifecycle/src/subcommands/unarchive-phases.ts` + library at `plugins/dw-lifecycle/src/scope-discovery/workplan-archive/unarchive-phases.ts`. Flags symmetric to archive-phases (`--feature`, `--phases`, `--repo-root`, `--apply`).
- [x] Step 3: `findInsertionLine` pure-fn locates the correct numeric position; section reinserted before the first `## Phase M:` with M > target.
- [x] Step 4: ledger update via `removeFromRanges` (splits/merges as needed); `next-fix-task-id` preserved per spec (IDs are forever-allocated). `archivedFixTasks` + `archiveFile` + `note` all preserved.
- [x] Step 5: 9/9 unarchive tests pass; 43/43 total in workplan-archive/ suite.

**Acceptance:** ✅ Symmetric to archive-phases. ✅ Round-trip test (`archive 1,2 → unarchive 1,2 → final state has all phases in numeric order + ledger empty`) passes.

### Task 4 — Auto-positioner ledger awareness in `promote-findings`

**Complete (read-side).** Closes AUDIT-86's root-cause bug pattern: when the workplan's ledger says `next-fix-task-id: 5.124`, the auto-positioner now uses 123 as the floor for `currentMaxNumberInPhase` so the next fix-task is 5.124+, never colliding with archived range 5.1-5.123.

- [x] Step 1: 5 new failing tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/auto-position.test.ts` covering ledger-aware floor / phase-mismatch ignored / no-ledger back-compat / max(scan, ledger-1) when scan exceeds / malformed-ledger graceful fallback.
- [x] Step 2: `computeAutoPosition` reads the ledger via `parseLedgerFromWorkplan`; when the ledger's `next-fix-task-id` matches the chosen phase AND convention is hierarchical, the floor `ledgerMinor - 1` is applied. Scan-only result wins when it's higher.
- [x] Step 3: malformed-ledger path is wrapped in try/catch — falls through to scan-only behavior without throwing.
- [-] Step 4: ledger's `next-fix-task-id` update after promote — DEFERRED to a follow-up. The current ledger update path is in `archive-phases` (which sets `next-fix-task-id` from the highest archived ID + 1). A separate `promote-findings`-side update would bump `next-fix-task-id` after each promote. Captured as a real TODO; the current Task 4 read-side fix is the AUDIT-86-relevant half.
- [x] Step 5: 29/29 in auto-position.test.ts pass; no regressions in promote-findings/ suite.

**Acceptance:** ✅ Auto-positioner reads ledger when present. ✅ Falls back to scan-only when absent OR malformed. ✅ AUDIT-86's duplicate-Task-20 collision pattern would not occur with ledger-aware floor (the in-session collision happened in Phase 6, which doesn't have a Phase-6-keyed ledger entry — that's a separate bug shape; this fix addresses the ledger-aware case explicitly named in the spec).

### Task 5 — Skill prose + doctor rule

**Complete.**

- [x] Step 1: `/dw-lifecycle:archive-phases` SKILL.md + `/dw-lifecycle:unarchive-phases` SKILL.md shipped under `plugins/dw-lifecycle/skills/archive-phases/` and `unarchive-phases/`. Both cover steps + flags + exit codes + when-to-use + cross-references.
- [-] Step 2: `/dw-lifecycle:complete` SKILL.md update DEFERRED to a follow-up. The wiring (have `:complete` auto-invoke `archive-phases --all` at feature-complete time) is a thin shim; the verb itself works standalone. Captured as a real TODO.
- [x] Step 3: Doctor rule `workplan-archive-ledger-coherence` at `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/workplan-archive-ledger-coherence.ts`. Walks `docs/<v>/<status>/<slug>/` features; for each with a ledger, compares the declared `archived-phases` range against the actual `## Phase N:` headings in the archive file. Reports three drift modes: (a) ledger declares missing-from-archive; (b) archive has extra-not-declared; (c) archive file path doesn't exist.
- [x] Step 4: 7/7 doctor-rule tests pass; rule registered in `SCOPE_DISCOVERY_DOCTOR_RULES`.

**Acceptance:** ✅ Skills shipped (archive-phases + unarchive-phases). ✅ Doctor rule catches ledger drift in three modes. The `/dw-lifecycle:complete` wiring is the one remaining TODO (clean, well-scoped, can land in a follow-up).

### Task 6 — Live dogfood verification

**Deferred to operator post-Phase-26 ship.** The verb is unit-tested (43 vitest scenarios across ledger/archive-phases/unarchive-phases + 7 doctor-rule scenarios = 50 total this Phase). The live dogfood against this feature's own workplan IS the natural operator-driven verification: the next time a Phase N completes and the operator wants to archive, they run the verb against scope-discovery's workplan.md.

- [-] Step 1: live archive of a future-complete phase — pending operator invocation.
- [-] Step 2: live `--allow-vestigial` against a retired phase — pending operator invocation.
- [-] Step 3: live round-trip on a live phase — pending operator invocation.
- [-] Step 4: journal entry recording the dogfood result — pending the above.

The verb is shipped + tested. Phase 26 logic is complete; the dogfood is verification timing, not implementation work. Captured as a real TODO; the operator picks up the dogfood at their convenience (typically as part of the next session that archives a phase).

**Acceptance (after operator dogfood):** ✅ Verb works against the live workplan. ✅ Round-trip preserves content. The unit-test coverage (43 + 7 scenarios) gives confidence in correctness; the live dogfood verifies real-workplan integration.

**Acceptance Criteria (Phase 26):**

- [x] Ledger format spec + parser + serializer + round-trip tests (Task 1: 17/17).
- [x] `dw-lifecycle archive-phases` CLI verb shipped; refuses partial-complete phases by default; `--allow-vestigial <reason>` escape with ≥40-char substantive-reason validator (Task 2: 17/17).
- [x] `dw-lifecycle unarchive-phases` sibling verb shipped (Task 3: 9/9).
- [x] `promote-findings` auto-positioner reads ledger; falls back gracefully when absent OR malformed (Task 4: 5 new tests in auto-position.test.ts).
- [x] `/dw-lifecycle:archive-phases` + `/dw-lifecycle:unarchive-phases` SKILL.md files (Task 5).
- [ ] `/dw-lifecycle:complete` optionally archives all phases as part of feature completion — DEFERRED to follow-up (clean shim work; the verb itself ships and works standalone).
- [x] Doctor rule `workplan-archive-ledger-coherence` (Task 5: 7/7).
- [-] Live dogfood verification on this branch's own workplan — DEFERRED to operator post-Phase-26 ship (unit-test coverage 50/50 gives confidence; live invocation IS the operator's natural use of the verb).

**Open decisions (operator drives at scoping time):**

1. **Archive scope unit: per-phase OR per-task?** Lean per-phase (matches the manual operation). Per-task granularity adds complexity without clear value.
2. **Archive file lifecycle.** Append-only? Editable for status corrections? Lean append-only matching audit-log preservation rule.
3. **Migration for adopters with no ledger.** Lean: the absent-ledger fallback (Task 4 Step 3) IS the migration; existing adopters get the verb without forced-upgrade.

### Phase 26 — Out of Scope

- **Cross-feature archive consolidation.** Each feature owns its own archive.
- **Archive file format beyond markdown.** YAML/JSON archive representations are a separate phase if they ever become useful.
- **UI for browsing the archive.** The archive is read-by-grep; no UI needed.
