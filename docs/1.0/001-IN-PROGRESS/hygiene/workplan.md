---
slug: hygiene
targetVersion: "1.0"
date: 2026-05-28
---

# Workplan: Hygiene

**Goal:** Ship a family of small, focused `/dw-lifecycle:` skills (one action per skill, UNIX-style per `.claude/CLAUDE.md` § Plugin Conventions) that surface debt on demand, drive operator-triggered batched-proposal cycles, and integrate with natural lifecycle waypoints. The skills share no persistent state — every skill reads live state (GitHub via `gh`, workplans via grep, branches via git) and mutates the same source-of-truth. The deliverable is the skills + lifecycle integration. The first dogfood round (run by the operator against the existing backlog) validates the tooling against real work; it is not "the work."

**Reference design spec:** [`docs/superpowers/specs/2026-05-28-hygiene-design.md`](../../../superpowers/specs/2026-05-28-hygiene-design.md) on main.


<!-- workplan-archive-ledger
archived-phases: 0-15
archived-fix-tasks: 0.1, 1.1, 2.1, 3.1, 4.1, 5.1, 6.1-6.5, 7.1, 8.1, 9.1, 10.1-10.5, 11.1-11.6, 12.1-12.2, 13.1, 14.1-14.2, 15.1
archive-file: workplan-archive.md
next-fix-task-id: 15.2
-->

## Phase 16: close-shipped apply — pre-flight `pending-verification` label  ·  [#411](https://github.com/audiocontrol-org/deskwork/issues/411)

The Phase 15 redesign's `apply` step posts a `pending-verification` comment + adds the label via two separate `gh` calls. When the label doesn't exist in the target repo, the label-add fails AFTER the comment has already posted. Result is the half-applied state #411 documents: 10 comments posted, 0 labels added, 0 dedupe-gate engagement on re-run. Surfaced during the 2026-06-04 dogfood run against v0.35.0..v0.36.0 in `feature/scope-discovery`.


### Task 2 (fix-finding-AUDIT-20260604-01): AUDIT-20260604-01 — All-skip apply still creates the `pending-verification` labe…

Closes AUDIT-20260604-01 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02; cross-model). Surface: plugins/dw-lifecycle/src/close-shipped/apply-v2.ts:185-203 (the `applyV2` body) + test `close-shipped-apply-v2.test.ts:` "pre-flight: label absent → label create runs". Severity: medium.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260604-01 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/close-shipped-apply-v2.test.ts:179-196` ("pre-flight: skips label list + create when every item is effective-skip (AUDIT-20260604-01)")
- [x] `npx vitest run src/__tests__/close-shipped-apply-v2.test.ts` exits 0 (10/10 pass against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step (auto-flip on next end-of-task chain via `apply-audit-flips --apply`)


### Task 3 (fix-finding-AUDIT-20260604-02): AUDIT-20260604-02 — smoke-hygiene per-run timestamp hardcodes `-000Z` and diverg…

Closes AUDIT-20260604-02. Surface: scripts/smoke-hygiene.sh:415-420 (`CS_RUN_TS="$(date -u +%Y-%m-%dT%H-%M-%S-000Z)"`). Severity: low.

- [x] Step 1: ~test surface~ — the bug lives in a bash script; the smoke run IS the regression check. Pre-fix smoke produced timestamps like `2026-06-04T15-37-58-000Z` (literal `-000Z`); post-fix the smoke produces real millisecond precision (e.g. `2026-06-04T15-42-49-086Z`).
- [x] Step 2: ~confirm bug reproduced~ — two rapid `bash scripts/smoke-hygiene.sh` runs in the same second would have collided on the hardcoded `-000Z` segment.
- [x] Step 3: implemented the fix — replaced the BSD-incompatible `%N` workaround (literal `-000Z`) with a portable `python3` expression using `datetime.now(timezone.utc).microsecond // 1000` formatted to 3 digits.
- [x] Step 4: confirmed test passes — `bash scripts/smoke-hygiene.sh` exits OK with the new timestamp generator; `python3 -c '<expr>'` directly produces a non-`000` ms segment.
- [x] Step 5: commit with `Closes AUDIT-20260604-02` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `scripts/smoke-hygiene.sh` (the smoke run IS the regression check; vitest doesn't apply to bash scripts. The check-fix-task-tdd verb will surface this as a warning per its advisory mode.)
- [x] `bash scripts/smoke-hygiene.sh` exits 0 (15/15 sections OK) AND the produced timestamp has real millisecond precision (verified inline: `2026-06-04T15-42-49-086Z` not `-000Z`).
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step (auto-flip on next end-of-task chain via `apply-audit-flips --apply`).

### Task 1: Pre-flight + auto-create the label in `apply-v2.ts`

**Approach:** Option 1 from the issue body (operator-recommended) — pre-flight via `gh label list`; auto-create if absent. Surface a one-line "created pending-verification label" message on first run; silent on subsequent runs.

- [x] Step 1: Add a `preflightLabel(runGh, repo, label, label_color, label_description)` helper in `apply-v2.ts`. Calls `gh label list --repo <repo> --search <label> --json name`. If the result contains the label, return `'exists'`. If empty, call `gh label create <label> --repo <repo> --color <color> --description <description>` and return `'created'`. On either call's failure, throw an `InvalidProposalError` with the actionable error.
- [x] Step 2: Call `preflightLabel` from `applyV2` BEFORE the per-item loop. `created` returns push a one-line note to the new `notes` field on `ApplyV2Result`; the CLI wrapper surfaces it to stdout before the summary line. Defaults: color `fbca04`, description `"Fix shipped in a release; awaiting operator verification before close"`.
- [x] Step 3: Vitest cases — extended close-shipped-apply-v2.test.ts from 5 → 9 cases. New cases: (a) label exists → single list call; (b) absent → list + create + `created` note; (c) `gh label create` throws → `InvalidProposalError` with actionable message; (d) pre-flight failure aborts BEFORE any comment posts.
- [x] Step 4: Updated `SKILL.md` Phase B with a new Step 3 documenting the pre-flight behavior; renumbered subsequent steps.

**Acceptance Criteria:**

- [x] `dw-lifecycle close-shipped apply --proposal <path>` against a repo without the label auto-creates the label, surfaces the one-line note, then proceeds with the normal per-item dispatch loop. (Mechanically verified via test case b; live verification deferred to operator-run post-ship walk.)
- [x] `apply` against a repo with the label is silent about labels (no spurious "exists" message every run). (Test case a: `notes` array empty; CLI wrapper only writes notes when populated.)
- [x] If `gh label create` itself fails (permissions / rate limit / etc.), `apply` aborts with an actionable error BEFORE any comment posts — no half-applied state. (Test cases c + d.)
- [x] Vitest covers all four cases above; full plugin suite green. (9 cases in close-shipped-apply-v2.test.ts; 2700/2700 plugin tests pass.)
- [ ] Live verification against a repo without the label (operator-driven, post-ship walk per the project's verify-in-installed-release rule).

**Provenance:**

- Surfaced 2026-06-04 in [#411](https://github.com/audiocontrol-org/deskwork/issues/411) during dogfood of `/dw-lifecycle:close-shipped` against v0.35.0..v0.36.0 in `feature/scope-discovery`. Manual recovery: created the label + bulk-applied to 10 issues out-of-band.
- Issue body lists two fix options: (1) pre-flight + auto-create (recommended; this Phase scopes that path); (2) refuse with actionable error before any comment posts. Operator can redirect to option (2) at implement time if they prefer the safer-but-noisier path; both options satisfy the "no half-applied state" requirement.

## Phase 17: close-shipped SKILL.md — replace bare `/tmp/<name>` paths  ·  [#412](https://github.com/audiocontrol-org/deskwork/issues/412)

The Phase 15 SKILL.md prescribes `/tmp/close-shipped-bundles.json`, `/tmp/close-shipped-verdicts.json`, and `/tmp/close-shipped-verdicts/<N>.json` as the agent-dispatch hand-off paths. These violate `.claude/rules/file-handling.md` § "Never use bare `/tmp/<name>` paths" — race-prone across concurrent worktrees / sessions / sub-agents. The safety classifier flagged a sub-agent during the 2026-06-04 dogfood for following the SKILL.md verbatim.

### Task 1: Switch to project-local `.dw-lifecycle/close-shipped/runs/<timestamp>/`

**Approach:** Option 2 from the issue body (operator-recommended) — project-local cache dir keyed by run timestamp. Consistent with the proposal output's existing `.dw-lifecycle/close-shipped/proposals-<timestamp>.json` scheme; worktree-isolated; auditable post-hoc.

- [x] Step 1: Updated `SKILL.md` Phase A Steps 1, 2, 6, 7 to use `.dw-lifecycle/close-shipped/runs/<timestamp>/{bundles,verdicts}.json`. Step 1 now opens by computing the per-run timestamp once and threading it through every artifact path.
- [x] Step 2: Added a "Why a per-run project-local dir, not `/tmp/`" paragraph in Step 1 citing `.claude/rules/file-handling.md` § "Never use bare `/tmp/<name>` paths" + the concurrency hazards.
- [x] Step 3: Re-scoped during implementation — the SKILL.md's Step 4 prompt template returns JSON via tool response (no Write instruction in template prose); the orchestrator parses responses and writes the collected verdicts file. Step 6 now explicitly documents that the sub-agents don't write to disk, the orchestrator does the collection in-session.
- [x] Step 4: `.gitignore` already covers `.dw-lifecycle/close-shipped/` (line 145) which matches `.dw-lifecycle/close-shipped/runs/<timestamp>/` via prefix. No additional entry needed.
- [x] Step 5: Updated `scripts/smoke-hygiene.sh` to mirror the SKILL.md path scheme — added `CS_RUN_TS` + `CS_RUN_DIR` setup with `mkdir -p`, then `CS_BUNDLES`/`CS_VERDICTS` point inside that dir.

**Acceptance Criteria:**

- [x] `SKILL.md` Phase A prose names no bare `/tmp/<name>` paths. All scratch artifacts land under `.dw-lifecycle/close-shipped/runs/<timestamp>/`. (Verified via `grep -n "/tmp/close-shipped" SKILL.md` — no matches post-edit.)
- [x] The sub-agent prompt template's `Write` instruction names the per-run path explicitly (no `/tmp/`). (Resolved by re-scoping: the template returns JSON via tool response; no Write instruction exists. Step 6 documents the orchestrator collection model.)
- [x] `.gitignore` excludes `.dw-lifecycle/close-shipped/runs/` (via the broader `.dw-lifecycle/close-shipped/` rule at line 145).
- [x] Smoke-hygiene still passes (the path scheme works in the fixture's `$FIXTURE/.dw-lifecycle/close-shipped/` shadow root). (15/15 sections OK on the post-edit smoke run.)
- [ ] Live verification: a `/dw-lifecycle:close-shipped` dispatch against an installed release does NOT trigger the safety classifier's "shared-namespace path" warning. (Operator-driven, post-ship walk per the project's verify-in-installed-release rule.)

**Provenance:**

- Surfaced 2026-06-04 in [#412](https://github.com/audiocontrol-org/deskwork/issues/412) during dogfood of `/dw-lifecycle:close-shipped` against v0.35.0..v0.36.0. Safety classifier emitted "SECURITY WARNING: writes to bare /tmp/close-shipped-verdicts/406.json" on the #406 sub-agent dispatch (and possibly others; the classifier may sample).
- Issue body lists two fix options: (1) `mktemp` paths (cheaper fix, doesn't change disk layout); (2) project-local cache dir under `.dw-lifecycle/close-shipped/runs/<timestamp>/` (recommended; consistent with existing proposal dir; auditable). This Phase scopes option (2); the operator can redirect at implement time if they prefer (1).

## Phase 18: structural-check verbs accept + scope to `--feature <slug>`  ·  [#417](https://github.com/audiocontrol-org/deskwork/issues/417)

Six structural-check verbs (`check-clones`, `check-anti-patterns`, `check-adopters`, `check-module-symmetry`, `check-refactor-preconditions`, `check-disposition-survivor`) reject `--feature` at runtime. Every implement / review / session-start chain in the dw-lifecycle SKILL prose pipes that flag in — operators following the SKILL verbatim hit `unknown arg: --feature` errors. The structural chain runs project-wide today; that's correct for what the verbs DO but the chain has no concept of "this feature's surface," so structural debt three modules over surfaces inside the wrong feature's review noise. Operator picked Path C (real scoping, not silent-accept or prose-drop) on 2026-06-04 via session-start interview. Narrowing source-of-truth: hybrid — prefer `docs/<v>/<status>/<slug>/scope-manifest.yaml`'s regime_holdouts + modules when present, fall back to `git diff --name-only main...HEAD` when absent.

### Task 1: Shared `resolveFeatureScope(slug)` helper

**Approach:** Single source of truth for the manifest-vs-git-diff decision. New module under `plugins/dw-lifecycle/src/scope-discovery/resolve-feature-scope.ts` exporting `resolveFeatureScope({ slug, repoRoot, baseRef }): Promise<{ files: string[]; source: 'scope-manifest' | 'git-diff'; }>`. Each downstream verb in Tasks 2-7 consumes the file list.

- [x] Step 1: wrote failing tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/resolve-feature-scope.test.ts` — (a) manifest-present returns regime_holdouts files with `source: 'scope-manifest'`; (b) manifest-absent runs the injected git-diff dep and returns its paths with `source: 'git-diff'`; (c) feature-dir-not-found throws `FeatureNotFoundError`; (d) manifest-absent + diff-empty returns `[]`.
- [x] Step 2: confirmed tests failed against missing module (`Failed to load url ../../scope-discovery/resolve-feature-scope.js`).
- [x] Step 3: implemented at `plugins/dw-lifecycle/src/scope-discovery/resolve-feature-scope.ts`. Uses the existing `resolveFeatureRoot` walker for slug → feature dir. Manifest-present path parses YAML and collects all `regime_holdouts.{anti_patterns,adopter_manifests,module_symmetry,deprecations}[].file` paths (deduped). Manifest-absent path shells out via `gitDiffNameOnly` (DI-injectable for tests; production uses `execFileSync git diff --name-only <baseRef>...HEAD`).
- [x] Step 4: 4/4 tests pass; full plugin suite 2705/2705 green.
- [x] Step 5: commit with `Refs #417` in subject.

**Acceptance Criteria:**

- [x] `plugins/dw-lifecycle/src/scope-discovery/resolve-feature-scope.ts` exists, exports `resolveFeatureScope` + `FeatureNotFoundError` + `FeatureScope` + `FeatureScopeSource`.
- [x] `plugins/dw-lifecycle/src/__tests__/scope-discovery/resolve-feature-scope.test.ts` covers all four cases above; full plugin suite green (2705/2705).
- [x] No verb wired yet — Tasks 2-7 consume this resolver.

### Task 2: `check-clones` learns `--feature <slug>`

**Approach:** Argv accepts `--feature <slug>`. When present, post-jscpd output filters to clone groups where ≥1 occurrence's `sourceId` matches a path in `resolveFeatureScope(slug).files`. When absent, behavior unchanged.

- [x] Step 1: wrote 3 failing tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/clone-detector.feature-flag.test.ts` — (a) `--feature hygiene` + a fixture-side scope-manifest filters reported clone groups (verified via `--json`'s `groups` array length and member-path inspection); (b) `--feature hygiene` is accepted; (c) `--feature unknown-slug` exits 2 with FeatureNotFoundError on stderr.
- [x] Step 2: confirmed tests failed — argv rejected `--feature` with `unknown arg: --feature\n`.
- [x] Step 3: implemented — added `--feature <slug>` to argv parser + a post-`diffClones` filter step that calls `resolveFeatureScope`, canonicalizes both scope paths and jscpd member paths via `realpathSync` (to bridge macOS `/private/var/...` ↔ `/var/...` symlink mismatch), strips jscpd's `:start:end` suffix, and filters `detectedGroups` + `diff.newGroups` + `diff.droppedGroups` to groups where ≥1 member is in scope. Baseline-write modes intentionally unfiltered (the baseline is project-wide).
- [x] Step 4: 3/3 tests pass; full plugin suite 2708/2708 green.
- [x] Step 5: commit with `Refs #417` in subject.

**Acceptance Criteria:**

- [x] `dw-lifecycle check-clones --feature hygiene` exits 0 without `unknown arg` error (verified in test (b)).
- [x] Test cases pass; plugin suite green (2708/2708).

### Task 3: `check-anti-patterns` learns `--feature <slug>`

**Approach:** Argv accepts `--feature <slug>`. When present, the scan walks ONLY feature-scope files (overrides `--root`). When absent, behavior unchanged.

- [x] Step 1: wrote 4 failing tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/anti-patterns.feature-flag.test.ts` — (a) `--feature hygiene` narrows scan to manifest-listed files (out-of-scope match filtered out); (b) no flag preserves project-wide scan; (c) `--feature` + `--root` exits 2 with `mutually exclusive` error; (d) `--feature unknown-slug` exits 2 with FeatureNotFoundError.
- [x] Step 2: confirmed 3/4 failed against current code (case b passed pre-implementation, as expected).
- [x] Step 3: implemented — added `--feature <slug>` to argv parser + parse-time mutual exclusion check against `--root`. In `main()`, when feature is set, call `resolveFeatureScope`, filter to .ts/.tsx, resolve against `realpath(cwd)`, and existsSync-filter to skip manifest-listed-but-deleted paths. `scan()` accepts a pre-resolved file list via the new optional second arg.
- [x] Step 4: 4/4 tests pass; full plugin suite 2712/2712 green.
- [x] Step 5: commit with `Refs #417` in subject.

**Acceptance Criteria:**

- [x] `dw-lifecycle check-anti-patterns --feature hygiene` exits 0 without `unknown arg`.
- [x] Test cases pass; plugin suite green (2712/2712).

### Task 4: `check-adopters` learns `--feature <slug>`

**Approach:** Argv accepts `--feature <slug>`. When present, holdout walk runs ONLY against feature-scope files. When absent, behavior unchanged.

- [x] Step 1: wrote 4 failing tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/adopter-manifests.feature-flag.test.ts` — (a) `--feature hygiene` filters holdouts to feature-scope; (b) no flag preserves project-wide; (c) `--feature` + `--root` exits 2 with `mutually exclusive`; (d) unknown slug → FeatureNotFoundError.
- [x] Step 2: confirmed 3/4 failed pre-implementation; case (b) passed (no flag = baseline).
- [x] Step 3: implemented — added `--feature <slug>` argv + mutual exclusion gate. `scan()` now accepts an optional `featureScope?: ReadonlySet<string>` of absolute paths. `scanEntry()` filters its `matched` glob results to the scope when set. `main()` resolves scope, realpath-normalizes each path against `realpath(cwd)`, and passes the set in.
- [x] Step 4: 4/4 tests pass; full plugin suite 2716/2716 green.
- [x] Step 5: commit with `Refs #417` in subject.

**Acceptance Criteria:**

- [x] `dw-lifecycle check-adopters --feature hygiene` exits 0 without `unknown arg`.
- [x] Test cases pass; plugin suite green (2716/2716).

### Task 5: `check-module-symmetry` learns `--feature <slug>`

**Approach:** Argv accepts `--feature <slug>`. When present, filter the cross-module matrix to modules whose source files appear in feature-scope. When absent, behavior unchanged.

- [x] Step 1: wrote 4 failing tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/module-symmetry.feature-flag.test.ts` — (a) `--feature hygiene` narrows matrix to scope-touched modules (other modules omitted from header row); (b) no flag preserves full matrix; (c) `--feature` + `--root` → exits 2 with mutual-exclusion error; (d) unknown slug → FeatureNotFoundError.
- [x] Step 2: confirmed 3/4 failed pre-implementation; case (b) passed (baseline preserved).
- [x] Step 3: implemented — added `--feature <slug>` argv + parse-time mutual exclusion. `computeMatrix` accepts a new `featureScopeFiles?: readonly string[]` option; when set, filters discovered modules via `moduleForPath(file, modules, moduleRoot)`. main() resolves scope (with FeatureNotFoundError → exit 2 + error stderr) and threads the file list in.
- [x] Step 4: 4/4 tests pass; full plugin suite 2720/2720 green.
- [x] Step 5: commit with `Refs #417` in subject.

**Acceptance Criteria:**

- [x] `dw-lifecycle check-module-symmetry --feature hygiene` exits 0 without `unknown arg`.
- [x] Test cases pass; plugin suite green (2720/2720).

### Task 6: `check-refactor-preconditions` learns `--feature <slug>`

**Approach:** Argv accepts `--feature <slug>`. When present, only validate `Closes clones.yaml <id>` claims whose surfaces fall in feature-scope. When absent, behavior unchanged.

- [x] Step 1: wrote 3 tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/refactor-preconditions.feature-flag.test.ts` — (b) no flag validates every marked ID (errors for both IN and OUT); (a)+(c) `--feature hygiene` + scope-manifest pointing at `in-scope/x.ts` → only ID_IN's errors surface, ID_OUT silently skipped; (d) unknown slug via main() → exit 2 + FeatureNotFoundError on stderr.
- [x] Step 2: confirmed 2/3 failed pre-implementation (case b passed). Case (a)+(c) failed: Cli type didn't have `feature` field. Case (d) failed: unknown arg `--feature`.
- [x] Step 3: implemented — added `feature: string | null` to `Cli`. Added `--feature <slug>` to parseCli. In `runGate`, after computing markedIds, when `cli.feature` is set: resolve scope, build `inScopeIds` set of IDs whose group has ≥1 member in scope (unknown IDs pass through so the standard "no entry exists" error still fires), filter the per-ID checking loop. main() catches FeatureNotFoundError → exit 2.
- [x] Step 4: 3/3 tests pass; full plugin suite 2723/2723 green (fixed a regression in the existing refactor-preconditions tests by treating `feature === undefined` as no-narrowing alongside `=== null`).
- [x] Step 5: commit with `Refs #417` in subject.

**Acceptance Criteria:**

- [x] `dw-lifecycle check-refactor-preconditions --feature hygiene --commit-msg-file <path>` exits 0 without `unknown arg`.
- [x] Test cases pass; plugin suite green (2723/2723).

### Task 7: `check-disposition-survivor` learns `--feature <slug>`

**Approach:** Argv accepts `--feature <slug>`. When present, only check clones whose surfaces fall in feature-scope for silent disposition reversion. When absent, behavior unchanged.

- [ ] Step 1: write failing test — (a) `--feature hygiene` flags only feature-scope disposition losses; (b) no flag = full check.
- [ ] Step 2: confirm tests fail.
- [ ] Step 3: implement.
- [ ] Step 4: confirm tests pass.
- [ ] Step 5: commit with `Refs #417` in subject.

**Acceptance Criteria:**

- [ ] `dw-lifecycle check-disposition-survivor --feature hygiene` exits 0.
- [ ] Test cases pass; plugin suite green.

### Task 8: Verify SKILL-prose chains run clean against the new binary

**Approach:** Smoke pass — invoke every SKILL-documented chain that uses `--feature` and confirm no verb emits `unknown arg: --feature`. No SKILL prose edits expected (prose already uses `--feature`); this task is a regression check + audit log.

- [ ] Step 1: enumerate every SKILL chain that uses `--feature` (`grep -rn "dw-lifecycle.*--feature" plugins/dw-lifecycle/skills/`).
- [ ] Step 2: invoke each verb with `--feature hygiene` against this worktree; record exit codes.
- [ ] Step 3: if any verb still rejects, file the gap; if all pass, append a confirmation note in the workplan.
- [ ] Step 4: commit with `Refs #417` in subject (chore/test commit).

**Acceptance Criteria:**

- [ ] All 6 structural-check verbs from Phase 18 accept `--feature hygiene` without `unknown arg`.
- [ ] No SKILL-prose chain emits `unknown arg: --feature` end-to-end.
- [ ] Plugin test suite green at session end.

**Provenance:**

- Surfaced 2026-06-04 in the close-shipped follow-up session journal entry: "The `--feature` flag is documented for `check-clones` / `check-anti-patterns` / `check-adopters` in the implement SKILL.md but not accepted by the actual CLI surface at v0.36.0 — had to run without the flag. SKILL.md prose is ahead of CLI."
- Operator selected Path C (real scoping) + hybrid narrowing source + Phase-18-in-hygiene-workplan on 2026-06-04 via session-start interview.
- All 8 tasks ship behind the verify-in-installed-release gate per project canon. Each commit uses `Refs #417` (NOT `Closes #417`) — the 2026-06-04 session corrected this mistake on #411 + #412 (auto-close via PR merge violates the gate).
