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

### Task 2: Check-* gate commands

- [x] `check-clones [--gate-mode]` — subcommand originally registered as `detect-clones` in Phase 1; renamed to `check-clones` in the Phase 6 verb-naming pass with `detect-clones` preserved as a forever-back-compat alias (both names dispatch to the same handler, so adopter pre-commit hooks installed by pre-rename versions of `install-scope-discovery-hooks` continue to work without modification). Library API renamed `detectClones` → `checkClones`; new hook chains emit `check-clones --gate-mode`; deprecation-hint surfaced in CLI `--help` listing. `--gate-mode` flag landed as a no-op-for-symmetry (check-clones already exits 1 on NEW groups by default — the hook contract). New skill at `plugins/dw-lifecycle/skills/check-clones/SKILL.md` is the canonical procedure; `plugins/dw-lifecycle/skills/detect-clones/SKILL.md` is a thin redirector pointing at the canonical skill. 3 new vitest scenarios — 2 gate-mode-flag-no-op + 1 alias-symmetry (both names produce identical exit codes on the same fixture).
- [x] `check-anti-patterns [--gate-mode]` — subcommand registered in Phase 2; `--gate-mode` flag landed. Default is informational (findings → exit 0, full report on stdout); `--gate-mode` flips to hook-friendly exit 1 on findings. **Schema follow-up:** add optional `negative_match_classes:` array per pilot TF-015 (AUDIT-20260525-08); validator auto-generates negative-test scenarios. Pairs with #285 pattern-type dispatcher work.
- [x] `check-deprecations [--write]` — subcommand SHELL → full scanner port landed. Walks the scan root for file-level `@deprecated` JSDoc tags + `// DEPRECATED:` line comments within the first 20 lines; resolves importers via `@/` alias + basename-relative path forms; classifies as blocked (importers > 0) or safe-to-delete (importers === 0). `--write` emits markdown to `.dw-lifecycle/scope-discovery/deprecation-queue.md`. `--json` emits structured output (`{ total, deprecation_count, filesVisited, blocked: [...], safeToDelete: [...] }`). `--module-root` accepts the `@/` alias root (default `src`; pilot's audiocontrol layout uses `modules/<editor>/src`). Closes [#287](https://github.com/audiocontrol-org/deskwork/issues/287). 23 vitest scenarios including gutted-stub teeth. Regime-holdout-detector now uses the real scanner; `meta.deprecation_count` populates from real importers.
- [x] `check-adopters [--gate-mode]` — subcommand registered in Phase 2; `--gate-mode` flag landed (default informational; flag flips to hook-friendly exit 1 on holdouts).
- [x] `check-editor-symmetry [--write]` — landed in Phase 4 with `--write` flag honored; default writes to `docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/editor-symmetry.md`.
- [x] `check-refactor-preconditions [--gate-mode]` — subcommand registered in Phase 2; `--gate-mode` flag landed (default informational; flag flips to hook-friendly exit 1 on precondition failures).

### Task 3: Disposition + baseline commands

- [x] `dispose-clone <id> --as <refactor|keep-with-reason|ignore-with-justification> [args]` — refuses without Step 0a/0b flags on refactor disposition. Single-id convenience wrapper around `batch-dispose`. `keep-with-reason` + `ignore-with-justification` pass through verbatim; `--as refactor` requires all Step 0a/0b precondition flags (`--canonical-side`, `--canonical-reason`, [`--new-shape-summary` if canonical-side=new], `--tests`, `--tests-proof-sha`, `--tests-proof-demonstration`) AND still refuses to write (refactor's 5 fields don't fit `--reason` shape; the wrapper redirects to manual editing + `dw-lifecycle check-refactor-preconditions`). The flag-presence requirement is a forcing function — the operator who tries `--as refactor` sees the full precondition surface in the error message. 19 vitest scenarios.
- [x] `refresh-clones-baseline` — thin wrapper carving `detect-clones --refresh-baseline` into its own subcommand. Closes the operator-ergonomics loop opened by AUDIT-20260525-07: clone-detector's batch-dispose hint already cites `dw-lifecycle refresh-clones-baseline` as the recovery path, this commit makes the verb resolvable. Forwards `--baseline` + `--quiet` verbatim; `--gate-mode` intentionally NOT accepted (refresh is mutating by definition). 10 vitest scenarios cover the pure `forwardedArgs` injector (idempotency, ordering) + `wantsHelp` detector + CLI `--help`/`-h` surface.
- [x] `batch-dispose <id> --disposition <D> --reason "<text>"` — landed as `dw-lifecycle batch-dispose`. Closes the TODO at `clone-detector.ts:182` (now emits paste-ready `dw-lifecycle batch-dispose ...` command in the hint, no TODO referenced). Closes [#284](https://github.com/audiocontrol-org/deskwork/issues/284); pilot TF-014 (AUDIT-20260525-07) addressed via the Light option — unknown-id error cites the `dw-lifecycle detect-clones --refresh-baseline` prereq so the operator's recovery path is obvious.
- [x] `check-disposition-survivor` — landed as `dw-lifecycle check-disposition-survivor`. Pre-commit gate that fails the commit on any `keep-with-reason`/`refactor`/`ignore-with-justification` → `pending` transition unless the operator passes `--allow-disposition-loss`. Compares HEAD's baseline (via `git show`) against the working tree. Closes [#289](https://github.com/audiocontrol-org/deskwork/issues/289); pilot reference: TF-013 (AUDIT-20260525-06). Phase 8 hook-chain wires it in.

### Task 4: Install / migrate / uninstall commands

- [x] `install-scope-discovery` — landed Phase 8 Task 1 (commit `2737132`). Idempotent bootstrap of `.dw-lifecycle/scope-discovery/`; copies 4 templates + seeds 3 empty registries. 15 vitest scenarios.
- [x] `install-scope-discovery-hooks` — landed Phase 8 Task 2 (commit `6cda930`). Auto-detects Husky vs `.githooks` vs greenfield; writes non-short-circuiting gate chain; manifest at `hooks-installed.json`. 30 vitest scenarios.
- [x] `install-agent-prompts` — landed Phase 8 Task 3 (commit `48fdfdb`). Appends Step 0 fragment to `.claude/agents/code-reviewer.md` + `codebase-auditor.md`; refuses to auto-create agent files. 19 vitest scenarios.
- [x] `migrate-from-pilot` (audiocontrol-specific in NAME ONLY — works for any project mirroring the canonical pilot layout) — landed for [#291](https://github.com/audiocontrol-org/deskwork/issues/291). Verb reads the pilot's `tools/scope-discovery/` + `docs/scope-discovery/`; copies CONFIG verbatim into `.dw-lifecycle/scope-discovery/`; diffs CODE per-file against the plugin defaults and categorizes each as identical / pilot-ahead (contribute-back) / pilot-behind (sync from plugin) / diverges (customize-override). Default dry-run; `--apply` materializes CONFIG copies; `--force` overwrites divergent targets; `--report-out <path>` writes markdown report to disk. 38 vitest scenarios.
- [x] `uninstall-scope-discovery-hooks` — landed Phase 8 Task 5 (commit `b71fb8b`). Drift-checks each managed file via sha256; refuses on drift unless `--force-uninstall`; strips managed block from merged installs. 20 vitest scenarios.


### Task 6 (fix-finding-AUDIT-20260603-37) (non-bug): AUDIT-20260603-37 — Phase 26's "refuse partial-complete phases" contract contrad…

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

Closes AUDIT-20260603-38. Surface: `DEVELOPMENT-NOTES.md` 2026-06-03 (cont. 2) entry — "Accomplished" ("AUDIT-finding triage (10 findings). Reviewed AUDIT-20260603-22..36") and "Quantitative" ("Audit findings dispositioned at source: 10 (AUDIT-20260603-24/26/27/28/29/30/31/32/33/34/35/36 — addressed; AUDIT-22/23 partially; AUDIT-25 filed as deskwork issue)").

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

- [x] Step 1 (disposition): re-derive finding counts from the audit-log entries actually committed in this session and state one reconciled number. The journal's three contradictory counts ("10 findings" / 12 IDs listed / 15 IDs in cited range) all referred to the same range AUDIT-20260603-22..36. Correct decomposition: 12 fully addressed at source (24, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36) + 2 partial (22, 23) + 1 filed as deskwork issue (25) = 15 total. Also reframed "16 completed phases" → "16 phases (13 completed + 3 vestigial-not-completed)" since Phases 17/22/23 are vestigial under Phase 24's retirement, not completed.
- [x] Step 2: applied — both the "Accomplished" AUDIT-finding-triage bullet and the "Quantitative" finding-counts line in DEVELOPMENT-NOTES.md updated; the manual-workplan-archive bullet also reframed to distinguish completed-vs-vestigial; the CLI-tooling-discoverability bullet's "all 10 closures" updated to "all 12 fully-addressed closures".
- [x] Step 3: committing with `Acknowledges AUDIT-20260603-38` in subject (doc-only correction to journal entry).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content.
- [x] The named action has landed in this branch (3 DEVELOPMENT-NOTES.md edits + this workplan annotation).
- [x] Audit-log Status flipped to `acknowledged-journal-counts-reconciled-2026-06-03`.

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

### Task 2: Retire `/dw-lifecycle:review` + `/dw-lifecycle:audit` ([#387](https://github.com/audiocontrol-org/deskwork/issues/387))

GH #387 captures an architectural decision: the audit-barrage hook (Phase 16/17) has subsumed the three-track review protocol. The operator's verbatim framing: *"the review skill is no longer hooked into the iterate cycle — superseded by the audit barrage hook. Review is no longer operationally enforced, so we shouldn't put anything in there. In fact, we should consider retiring review and audit in favor of audit barrage."*

This is multi-skill architectural work that touches scope-discovery's review surface (audit-barrage is one of three audit surfaces per `agent-discipline.md`; retiring review reduces it to two: in-band self-audit + audit-barrage). The scope-discovery feature owns the audit-log lifecycle that review/audit currently drives; that ownership transfers fully to audit-barrage's lift step.

**Severity: medium** (no current operational impact; review skill is dead-but-listed).

- [ ] Step 1: surface inventory (per #387 body) — confirm every caller of `/dw-lifecycle:review`, `/dw-lifecycle:audit`, and their CLI surfaces.
- [ ] Step 2: confirm audit-barrage's lift step owns the full audit-log lifecycle (creation + status flips + closure triad) — if not, identify the gap.
- [ ] Step 3: decide whether to delete the two skills outright, alias them to audit-barrage, or split (review → delete; audit → audit-barrage alias).
- [ ] Step 4: remove the skills + rehome every cross-reference (including `agent-discipline.md` "three audit surfaces" framing).
- [ ] Step 5: commit with `Closes #387` in subject.

**Acceptance Criteria:**
- [ ] Zero dangling references to `/dw-lifecycle:review` or `/dw-lifecycle:audit` in skills, CLAUDE.md, agent-discipline.md, or other docs.
- [ ] `agent-discipline.md` "three audit surfaces" framing updated to two surfaces (or whatever the final count is).
- [ ] GH #387 closed after verification.

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

**Partial — file-level demolition shipped in `81bba0f2` (operator-authorized ahead-of-relocation per the bookkeeping pathology). CLI subcommand source retirement pending.**

- [x] Step 1: Delete `.husky/commit-msg` entirely. *(81bba0f2)*
- [x] Step 2: Gut the audit-gate block from `.husky/pre-push`; the file becomes a no-op stub. *(81bba0f2 — chose stub over delete to preserve husky hook-presence; documented relocation pointer in the stub)*
- [ ] Step 3: Retire `check-implement-hook-ran` (subcommand + source + tests + skill + skill folder).
- [ ] Step 4: Retire `check-implement-hook-coverage` (subcommand + source + tests + skill + skill folder).
- [ ] Step 5: Retire `--upstream-base-ref` flag + plumbing (Phase 21 vestigial).
- [ ] Step 6: Retire per-SHA `hook-run-log.jsonl` write logic + helpers + tests (Phase 23 vestigial).
- [ ] Step 7: Retire `last-hook-run.json` marker logic + boot-case guards + tests (Phase 22 vestigial).
- [ ] Step 8: Delete `.dw-lifecycle/scope-discovery/hook-run-log.jsonl` + `last-hook-run.json` files from the working tree.
- [ ] Step 9: Commit with `Closes` trailers for Phases 21/22/23 (mark retired) and `Refs #401 #402 #403`. *(file-level demolition already in 81bba0f2; this commit-step is for the CLI-side retirement)*

**Acceptance:** No source under `plugins/dw-lifecycle/src/scope-discovery/promote-findings/` references hook-run-log or last-hook-run. `npm test` passes. `.husky/commit-msg` does not exist. Grep for `check-implement-hook` yields zero hits in `src/`.

### Task 3 — Demolition: install machinery

**Partial — `.husky/pre-commit` structural-chain block removed in `81bba0f2`. CLI subcommand source retirement pending.**

- [ ] Step 1: Retire `install-scope-discovery-hooks` (subcommand + source + tests + skill + skill folder + helper).
- [ ] Step 2: Retire `uninstall-scope-discovery-hooks` (subcommand + source + tests + skill + skill folder + helper).
- [ ] Step 3: Retire `hooks-installed.json` machinery + reader logic.
- [ ] Step 4: Audit `install-agent-prompts` against the new architecture; retire if redundant once Step 0 discipline lives in `/dw-lifecycle:review` skill body, otherwise reshape.
- [x] Step 5: Gut the structural-chain block from `.husky/pre-commit`; structural chain moves entirely into skills (Task 4–7). *(81bba0f2 — chose stub over delete; documented relocation pointer)*
- [ ] Step 6: Commit with `Closes` trailers for [#293](https://github.com/audiocontrol-org/deskwork/issues/293), [#294](https://github.com/audiocontrol-org/deskwork/issues/294), [#295](https://github.com/audiocontrol-org/deskwork/issues/295). *(file-level demolition already in 81bba0f2; this commit-step is for the CLI-side retirement)*

**Acceptance:** No skill at `plugins/dw-lifecycle/skills/install-scope-discovery-hooks/`. No subcommand registration for the install/uninstall verbs. Audit-trail commit names the four issues retired.

### Task 4 — Relocate: structural chain into `/dw-lifecycle:session-start`

**Complete — SKILL.md updated. Empirical verification deferred to Phase 24 Task 10 (live dogfood).**

- [x] Step 1: Write failing test — N/A per `testing.md` ("What NOT to Test: The model's response to a SKILL.md prompt (non-deterministic)"). Skill-prose relocations are not unit-testable; the deliverable is the SKILL.md edit; empirical verification happens in Phase 24 Task 10's live dogfood.
- [x] Step 2: Extended `/dw-lifecycle:session-start` SKILL.md with a new Step 7 — `check-clones`, `check-anti-patterns`, `check-adopters`, `check-editor-symmetry` as a read-only snapshot step.
- [x] Step 3: Referenced existing CLI invocations directly; the stderr count lines are surfaced via `2>&1 | tail -3` per verb, composed into a single `Structural snapshot:` block in the bootstrap report.
- [x] Step 4: Decision: **advisory**. The skill instructs the agent to surface counts but NOT to refuse session-start on non-zero. Enforcement lives at end-of-implement-task per Task 5.
- [x] Step 5: Confirm tests pass — N/A per Step 1.
- [x] Step 6: Commit.

**Acceptance:** A session-start invocation surfaces structural-chain counts as a snapshot. The agent driving the session sees the numbers without needing a separate command.

### Task 5 — Relocate: end-of-task gate into `/dw-lifecycle:implement`

**Complete — SKILL.md Step 6 rewritten as Steps 6a–6e composing the full end-of-task chain. Empirical verification deferred to Phase 24 Task 10 (live dogfood).**

- [x] Step 1: Write failing tests — N/A for skill-prose relocations per `testing.md`. The underlying CLI verbs (`check-clones`, `check-anti-patterns`, `check-adopters`, `check-editor-symmetry`, `implement-hook`, `check-open-findings`, `apply-audit-flips`, `check-fix-task-tdd`) all have existing test coverage; relocating their firing location from `.husky/` to the skill body doesn't change the verb-level test coverage.
- [x] Step 2: Updated `/dw-lifecycle:implement` SKILL.md Step 6 to compose the FULL end-of-task chain — Step 6a (structural chain in `--gate-mode`), Step 6b (`implement-hook` audit-barrage chain), Step 6c (`check-open-findings` refuse-to-advance gate), Step 6d (`apply-audit-flips --apply` close already-fixed), Step 6e (`check-fix-task-tdd` advisory). The lift/promote/check-open-findings chain is preserved unchanged inside `implement-hook`.
- [x] Step 3: `check-fix-task-tdd` documented as Step 6e advisory (in-skill discipline, not a hook). The CLI verb itself is preserved; only the firing location moves.
- [x] Step 4: `apply-audit-flips --apply` folded as Step 6d (no separate manual call). Step 6c (`check-open-findings`) covers the open-finding gate semantic that `check-implement-hook-ran` previously enforced from `.husky/commit-msg`.
- [x] Step 5: Confirm tests pass — N/A per Step 1.
- [x] Step 6: Commit.

**Acceptance:** A simulated end-of-task in a fixture project produces: structural-chain output, barrage findings (if any), fix-task discipline check. No separate hooks are invoked. The skill body is the gate.

### Task 6 — Relocate: closing checks into `/dw-lifecycle:session-end`

- Step 1: Write failing tests for the new session-end discipline:
  - `check-disposition-survivor` is invoked and refuses session-end on regressed dispositions;
  - no-bare-TBDs discipline refuses session-end on bare TBD markers;
  - no-open-findings-without-disposition discipline refuses session-end on findings still in `Status: open` without operator-driven scoping into the workplan.
- Step 2: Update `/dw-lifecycle:session-end` SKILL.md.
- Step 3: Confirm tests pass.
- Step 4: Commit.

**Acceptance:** Session-end surfaces all three classes of issue when they exist; passes cleanly otherwise.

### Task 7 — Relocate: Step 0 + structural chain into `/dw-lifecycle:review`

- Step 1: Write failing tests for new review-skill discipline:
  - Step 0 `check-refactor-preconditions` invoked on review trigger;
  - structural chain run as PR-readiness gate;
  - `check-editor-symmetry` invoked as fleet snapshot.
- Step 2: Update `/dw-lifecycle:review` SKILL.md to compose the above.
- Step 3: REVERSE the Phase 20 Task 2 retirement decision for `/dw-lifecycle:review`: this skill becomes the *primary* enforcement surface, not deprecated.
- Step 4: Confirm tests pass.
- Step 5: Commit.

**Acceptance:** Review skill invocation runs Step 0 + structural chain + fleet symmetry. The skill is documented as the primary enforcement surface.

### Task 8 — Workplan + phase reconciliation

- Step 1: Update workplan.md headers for Phases 15, 17 (partially), 21, 22, 23 to mark retirement explicitly with a note: *"Code retired in Phase 24; the phase's original deliverables are vestigial under the new no-git-hook-enforcement contract."*
- Step 2: Update README phase status table to reflect retirement annotations alongside the original "Shipped" status (history preserved; new state surfaced).
- Step 3: Close GitHub issues per the disposition list: [#293](https://github.com/audiocontrol-org/deskwork/issues/293) / [#294](https://github.com/audiocontrol-org/deskwork/issues/294) / [#295](https://github.com/audiocontrol-org/deskwork/issues/295) (install-hook friction — won't-fix), [#352](https://github.com/audiocontrol-org/deskwork/issues/352) (skip docs-only — won't-fix), [#373](https://github.com/audiocontrol-org/deskwork/issues/373) / [#374](https://github.com/audiocontrol-org/deskwork/issues/374) (Phase 15 redesigns — won't-fix or rescope).
- Step 4: Reframe Phase 20 Task 2 in workplan.md: instead of "retire `/dw-lifecycle:review`", read "elevate `/dw-lifecycle:review` to primary enforcement surface (Phase 24)."
- Step 5: Commit.

**Acceptance:** Phases retired by Phase 24 are annotated in both workplan and README. No GitHub issue remains open whose root cause is the now-deleted machinery.

### Task 9 — Adopter migration

- Step 1: Decide migration path: ship a one-shot `dw-lifecycle uninstall-everything-hook-related` verb that removes managed blocks from `.husky/`, deletes `hooks-installed.json`, and surfaces a report — OR document a manual sweep. (Lean: ship the verb; the migration is mechanical and one-shot.)
- Step 2: If verb: implement, test, ship as part of Phase 24's release.
- Step 3: Write release-notes entry naming this as a breaking change; cite the relocation map; cite the principle.
- Step 4: Update plugin README and `MIGRATING.md` (or create one) capturing the upgrade path.
- Step 5: Commit.

**Acceptance:** An adopter who installed `install-scope-discovery-hooks` in v0.35.0 has a documented path to remove the installed hooks and pick up the new skill-body discipline on the version bump.

### Task 10 — Live dogfood verification

- Step 1: Pick a real implementation task on a feature branch (this branch's own Phase 24 tasks count) and run it end-to-end using the new shape with NO `.husky/` enforcement active.
- Step 2: Measure: bookkeeping touches per finding (target: <2:1 ratio, down from ~3:1); count of `--no-verify` invocations needed (target: zero); count of `git reset` invocations needed (target: zero).
- Step 3: Confirm the structural chain (running via skill bodies, not hooks) still catches the regressions it caught when wired as a hook. Run a deliberate regression (e.g., introduce a clone group) and verify `/dw-lifecycle:implement` end-of-task gates surface it.
- Step 4: Confirm `/dw-lifecycle:implement` end-of-task audit-barrage discipline produces equivalent finding coverage to the retired `check-implement-hook-ran` gate.
- Step 5: Write a journal entry documenting the measurements.
- Step 6: Commit.

**Acceptance:** Dogfood entry in `DEVELOPMENT-NOTES.md` records the measurements + cite the issues defused ([#401](https://github.com/audiocontrol-org/deskwork/issues/401), [#402](https://github.com/audiocontrol-org/deskwork/issues/402), [#403](https://github.com/audiocontrol-org/deskwork/issues/403)).

**Acceptance Criteria (Phase 24):**

- [ ] ADR + rule files committed and cross-referenced.
- [ ] All git-hook enforcement removed from this repo (`.husky/commit-msg` gone; structural + audit-gate blocks removed from pre-commit + pre-push).
- [ ] Retired subcommands/skills/tests/source enumerated in commit messages (audit-trail in git log).
- [ ] Each relocation has a passing test exercising the new skill-body behavior.
- [ ] Live dogfood verification documents the bookkeeping ratio reduction.
- [ ] Workplan + README reflect Phase 15/17/21/22/23 retirements consistently.
- [ ] Release notes capture the breaking change.
- [ ] No GitHub issue remains open whose root cause is now-deleted machinery.
- [ ] Adopter migration path is documented (verb or doc-only per operator decision).

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

- Step 1: Grep every reference to `editor`, `editors`, `Editor`, `EDITOR`, `editor_symmetry`, `editorSymmetry`, `editorsTargetedByGlob`, `discoverEditors`, `editorForPath`, `editor-symmetry-*` across plugin source, schema, skills, tests, docs, rule files.
- Step 2: Categorize each hit: schema field (breaking) / source identifier (mechanical) / file name / CLI verb name / skill prose / test fixture / doc reference / etymology paragraph (preserve as historical comment).
- Step 3: Capture the inventory in a working scratch document at `docs/1.0/001-IN-PROGRESS/scope-discovery/phase-25-rename-inventory.md`.

**Acceptance:** Inventory categorized; total hit count + per-category counts surfaced.

### Task 2 — Breaking-change strategy decision

- Step 1: Decide: single-rename + doctor-rule migration, OR dual-name period with deprecation warning, OR dual-name forever.
- Step 2: Document the decision in the Phase 25 ADR / decision-record fragment.
- Step 3: If single-rename: confirm doctor rule is the chosen migration vehicle; if dual-name: confirm whether old name retires in a future phase or stays indefinitely.

**Acceptance:** Decision recorded with rationale.

### Task 3 — Schema rename + Zod types

- Step 1: Write failing tests reading/writing the new field name `module_symmetry`.
- Step 2: Rename `editor_symmetry:` → `module_symmetry:` in the adopter-manifests YAML schema + Zod types.
- Step 3: Rename `regime_holdouts.editor_symmetry` → `regime_holdouts.module_symmetry`.
- Step 4: Update `RegimeHoldoutSource` type + every consumer.
- Step 5: Confirm tests pass; `tsc` clean.

**Acceptance:** Schema reads `module_symmetry` end-to-end. Old name reads only via the migration codepath (if alias retained) or not at all (if hard-renamed).

### Task 4 — Source identifier rename

- Step 1: Rename source files: `editor-symmetry-matrix.ts` → `module-symmetry-matrix.ts`, `editor-symmetry-report.ts` → `module-symmetry-report.ts`, `check-editor-symmetry.ts` → `check-module-symmetry.ts`, `util/editors.ts` → `util/modules.ts`.
- Step 2: Rename function + type identifiers: `discoverEditors` → `discoverModules`, `editorsTargetedByGlob` → `modulesTargetedByGlob`, `editorForPath` → `moduleForPath`, `SymmetryMatrix.editors` → `SymmetryMatrix.modules`, etc.
- Step 3: Update every import.
- Step 4: Preserve the etymology paragraph as a historical comment in `util/modules.ts` (operator decides at scope time whether to keep or erase).
- Step 5: Confirm tests pass; `tsc` clean.

**Acceptance:** Grep for `editor` outside the etymology comment in `util/modules.ts` yields zero hits in scope-discovery source.

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

- Step 1: Write a tests-first spec for the ledger annotation: comment-block format, field names (`archived-phases`, `archived-fix-tasks`, `archive-file`, `next-fix-task-id`, `note`), range compaction rule (contiguous IDs collapse to `start-end`, non-contiguous comma-separated).
- Step 2: Add fixture markdown examples covering: empty archive, single-phase, multi-range, no-fix-tasks (`archived-fix-tasks: none`).
- Step 3: Author parser + serializer pure-fns at `plugins/dw-lifecycle/src/scope-discovery/workplan-archive/ledger.ts`. Round-trip parse → serialize → parse-equality test.

**Acceptance:** Parser handles every fixture; serializer produces stable output; round-trip test passes.

### Task 2 — `dw-lifecycle archive-phases` CLI verb

- Step 1: Write failing tests: (a) invoking against a fixture workplan with Phase X-Y all-checked moves those sections to a sibling archive file; (b) invoking against an incomplete phase WITHOUT `--allow-vestigial` refuses and surfaces the offending unchecked tasks; (c) invoking against an incomplete phase WITH `--allow-vestigial "reason ≥40 chars"` archives the phase and records the reason in the ledger entry.
- Step 2: Implement `plugins/dw-lifecycle/src/subcommands/archive-phases.ts`. Flags: `--feature <slug>` (required), `--phases <range>`, `--fix-tasks <range>`, `--dry-run` (default), `--apply`, `--allow-vestigial <reason>` (escape hatch with substantive-reason requirement).
- Step 3: Section identification: walk workplan by `## Phase N:` headers; collect line ranges per phase.
- Step 4: Move semantics: cut from workplan.md, append to archive file (create with frontmatter if missing), preserve content verbatim.
- Step 5: Ledger update: merge new archived phases + fix-task IDs into existing ledger; recompute `next-fix-task-id` as max(union) + 1. When `--allow-vestigial <reason>` is supplied, record the reason next to the phase entry in the ledger (e.g., `archived-phases-vestigial: 17 (Phase 24 retired the hook-coverage gate), 22 (Phase 24 retired marker boot-case guard)`) so future readers see WHY an incomplete phase was archived.
- Step 6: Refuse archiving a phase with ANY unchecked task UNLESS `--allow-vestigial <reason>` is passed AND the reason is ≥40 chars of substantive prose (mirroring the `check-fix-task-tdd` substantive-reason validator). Without the flag, surface the offending tasks and exit non-zero. With the flag, archive the phase and surface the operator's reason in the report.
- Step 7: Confirm tests pass.

**Acceptance:** Dry-run prints planned moves without writing. `--apply` does the moves + ledger update atomically. Refuses partial-complete phases by default; `--allow-vestigial <reason>` is the explicit escape for retired-or-vestigial phases (the case the manual 2026-06-03 archive operation needed for Phases 17/22/23 — vestigial under Phase 24's retirement decision). Per AUDIT-20260603-37: this preserves the partial-complete-as-default-refusal that catches accidental over-archive, while mechanizing the vestigial-allowed path the workplan-archive header already sanctions ("once their tasks were complete OR once they became vestigial per a later phase's retirement decision").

### Task 3 — `dw-lifecycle unarchive-phases` sibling verb

- Step 1: Write failing tests: invoking against an archive file with Phase X moves the section back to active workplan + removes Phase X from the ledger range.
- Step 2: Implement `plugins/dw-lifecycle/src/subcommands/unarchive-phases.ts`. Flags symmetric to archive-phases.
- Step 3: Reinsert at correct workplan position (numeric phase order; insert before the next-higher live phase).
- Step 4: Ledger update: remove unarchived phases from `archived-phases` range; do NOT decrement `next-fix-task-id` (IDs are forever-allocated even after unarchive).
- Step 5: Confirm tests pass.

**Acceptance:** Symmetric to archive-phases. Reversibility verified by round-trip test (archive → unarchive → diff against original).

### Task 4 — Auto-positioner ledger awareness in `promote-findings`

- Step 1: Write failing test: `promote-findings --apply` against a workplan with `next-fix-task-id: 5.124` in the ledger produces a new fix-task block numbered `Task 5.124`, not `Task 5.1`.
- Step 2: Update `promote-findings`'s computeAutoPosition (or wherever the next-ID is computed) to read the ledger annotation FIRST; max(ledger.next-fix-task-id, scan-of-workplan-max + 1) wins.
- Step 3: Failure-safety: if ledger annotation is missing or malformed, fall back to scan-of-workplan-max + 1 (current behavior).
- Step 4: Update ledger's `next-fix-task-id` after a successful promote.
- Step 5: Confirm tests pass.

**Acceptance:** Auto-positioner reads ledger when present; falls back gracefully when absent; updates ledger after each promote.

### Task 5 — Skill prose + doctor rule

- Step 1: Write `/dw-lifecycle:archive-phases` and `/dw-lifecycle:unarchive-phases` SKILL.md files.
- Step 2: Update `/dw-lifecycle:complete` SKILL.md to optionally run `archive-phases --all` when moving a feature dir to `003-COMPLETE/` (every phase is complete at feature-complete time).
- Step 3: Add doctor rule `workplan-archive-ledger-coherence` that validates the ledger matches the archive file's actual content.
- Step 4: Confirm doctor rule tests pass.

**Acceptance:** Skills + doctor rule shipped. Doctor catches ledger drift.

### Task 6 — Live dogfood verification

- Step 1: Run `dw-lifecycle archive-phases --feature scope-discovery --phases <any future complete phase> --apply` after Phase 24 ships and its tasks are marked complete. Verify the auto-positioner picks up the ledger update on the next promote-findings run.
- Step 2: Run `dw-lifecycle archive-phases --feature scope-discovery --phases <vestigial-retired phase> --allow-vestigial "<≥40-char substantive reason>" --apply` to exercise the vestigial-allowed escape against a real retired phase (e.g., one of Phases 17/22/23 if it hasn't already been manually archived; otherwise a future-retired phase). Verify the ledger records the reason alongside the phase entry.
- Step 3: Roundtrip test on a live phase: archive, unarchive, archive again. Confirm no content drift. Roundtrip the vestigial-allowed case too: archive with `--allow-vestigial`, unarchive, archive again with the same reason — confirm ledger reason is preserved.
- Step 4: Journal entry recording the dogfood result, including both the all-checked path and the vestigial-allowed path.

**Acceptance:** Verb works against this feature's live workplan for both all-checked and vestigial-allowed phases. Round-trip preserves content for both paths.

**Acceptance Criteria (Phase 26):**

- [ ] Ledger format spec + parser + serializer + round-trip tests.
- [ ] `dw-lifecycle archive-phases` CLI verb shipped; refuses partial-complete phases by default; `--allow-vestigial <reason>` escape (with ≥40-char substantive-reason requirement) is the explicit path for retired-vestigial phases per AUDIT-20260603-37 + the workplan-archive header's "completed OR vestigial" framing.
- [ ] `dw-lifecycle unarchive-phases` sibling verb shipped.
- [ ] `promote-findings` auto-positioner reads ledger; falls back gracefully when absent.
- [ ] `/dw-lifecycle:archive-phases` + `/dw-lifecycle:unarchive-phases` SKILL.md files.
- [ ] `/dw-lifecycle:complete` optionally archives all phases as part of feature completion.
- [ ] Doctor rule `workplan-archive-ledger-coherence`.
- [ ] Live dogfood verification on this branch's own workplan.

**Open decisions (operator drives at scoping time):**

1. **Archive scope unit: per-phase OR per-task?** Lean per-phase (matches the manual operation). Per-task granularity adds complexity without clear value.
2. **Archive file lifecycle.** Append-only? Editable for status corrections? Lean append-only matching audit-log preservation rule.
3. **Migration for adopters with no ledger.** Lean: the absent-ledger fallback (Task 4 Step 3) IS the migration; existing adopters get the verb without forced-upgrade.

### Phase 26 — Out of Scope

- **Cross-feature archive consolidation.** Each feature owns its own archive.
- **Archive file format beyond markdown.** YAML/JSON archive representations are a separate phase if they ever become useful.
- **UI for browsing the archive.** The archive is read-by-grep; no UI needed.
