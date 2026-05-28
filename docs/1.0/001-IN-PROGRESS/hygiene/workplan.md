---
slug: hygiene
targetVersion: "1.0"
date: 2026-05-28
---

# Workplan: Hygiene

**Goal:** Ship a family of small, focused `/dw-lifecycle:` skills (one action per skill, UNIX-style per `.claude/CLAUDE.md` § Plugin Conventions) that surface debt on demand, drive operator-triggered batched-proposal cycles, and integrate with natural lifecycle waypoints. The skills share no persistent state — every skill reads live state (GitHub via `gh`, workplans via grep, branches via git) and mutates the same source-of-truth. The deliverable is the skills + lifecycle integration. The first dogfood round (run by the operator against the existing backlog) validates the tooling against real work; it is not "the work."

**Reference design spec:** [`docs/superpowers/specs/2026-05-28-hygiene-design.md`](../../../superpowers/specs/2026-05-28-hygiene-design.md) on main.

## Phase 0: Infrastructure teardown

**Deliverable:** Stalled placeholder branch removed; clean slate for the hygiene infrastructure.

### Task 1: Tear down `feature/deskwork-open-issue-tranche-cleanup`

- [x] Step 1: Verify the branch's single commit is already represented on main (content-identical alt-SHA confirmed).
- [x] Step 2: Remove the worktree (`git worktree remove`).
- [x] Step 3: Delete the local branch (`git branch -D`).
- [x] Step 4: Delete the remote branch (`git push origin --delete`).

**Acceptance Criteria:**
- [x] Stalled `feature/deskwork-open-issue-tranche-cleanup` branch + worktree are torn down. (DONE during this feature's setup, 2026-05-28.)

## Phase 1: Read-only baseline — `/dw-lifecycle:debt-report`

**Deliverable:** Cross-source debt snapshot available as a skill. Read-only — no mutations.

### Task 1: Implement debt-report

- [ ] Step 1: Helper script `plugins/dw-lifecycle/src/subcommands/debt-report.ts` — queries `gh issue list` with bucketing by label/age/stale-since-last-comment.
- [ ] Step 2: Workplan-TBD scan across `docs/<v>/001-IN-PROGRESS/*/workplan.md` — counts per-feature `TBD:` / `defer` / `follow-up:` / `out of scope` markers.
- [ ] Step 3: Parked-branch scan via `git for-each-ref` — list local + remote branches with ahead/behind status relative to `origin/main`.
- [ ] Step 4: Output formatters — markdown table (operator-readable) + JSON (downstream-consumable). Default = markdown; `--json` flag emits JSON.
- [ ] Step 5: `plugins/dw-lifecycle/skills/debt-report/SKILL.md` — adopter-facing prose.
- [ ] Step 6: Vitest unit + integration tests against fixture project trees + mocked `gh` stub.

**Acceptance Criteria:**
- [ ] `/dw-lifecycle:debt-report` ships; emits markdown + JSON across the three categories.

## Phase 2: GitHub-issue triage — `/dw-lifecycle:triage-issues`

**Deliverable:** Operator-triggered batched-proposal cycle for stale GitHub issues. Implements the batched-proposal infrastructure subsequent skills reuse.

### Task 1: Implement triage-issues

- [ ] Step 1: Helper script `plugins/dw-lifecycle/src/subcommands/triage-issues.ts`. Args: `--bucket <name>` (`stale-30d` / `unlabeled` / `bug-no-comment-7d`), `--limit N` (default ~10).
- [ ] Step 2: Bucket-query-builder — translates each bucket name to a `gh issue list --search` query string.
- [ ] Step 3: Batched-proposal protocol — uniform markdown-table output of N issues, one row per proposed disposition (close-wontfix + reason / label / mark duplicate / leave + comment). Designed for the calling-conversation agent to populate the proposal rationale.
- [ ] Step 4: Operator-approval parser — accept `y` (all) / `n` (none) / `1,3,5` (subset).
- [ ] Step 5: Apply-step — one `gh` mutation per approved disposition; partial-success surfaces with per-item reasons; no rollback.
- [ ] Step 6: `plugins/dw-lifecycle/skills/triage-issues/SKILL.md` — adopter-facing prose.
- [ ] Step 7: Vitest unit + integration tests; mocked `gh` stub.

**Acceptance Criteria:**
- [ ] `/dw-lifecycle:triage-issues` ships; supports `stale-30d`, `unlabeled`, `bug-no-comment-7d` buckets.
- [ ] Partial-approval works (operator picks subset of proposals).
- [ ] Partial-success surfaces failures with reasons; no rollback.

## Phase 3: Workplan-deferral promotion — `/dw-lifecycle:promote-deferrals`

**Deliverable:** Workplan-TBD scanner with promote-to-issue and inline-wontfix dispositions. Mechanically enforces the project's `Just for now is bullshit` rule.

### Task 1: Implement promote-deferrals

- [ ] Step 1: Helper script `plugins/dw-lifecycle/src/subcommands/promote-deferrals.ts`. Takes a target workplan path.
- [ ] Step 2: TBD-pattern parser — finds `TBD:` / `defer` / `follow-up:` / `out of scope` markers + their surrounding context (containing task name, parent phase heading).
- [ ] Step 3: Reuse Phase 2's batched-proposal protocol. Per item, propose (a) promote-to-issue with surrounding context as the issue body OR (b) inline-wontfix with substantive-reason.
- [ ] Step 4: Substantive-reason validator — ≥40 chars, no gaming phrases (`for now`, `next pass`, `TBD`, `will fix later`, etc.). Mirrors the in-flight `visual-verification-gate` feature's validator; share code if it's already in tree.
- [ ] Step 5: Apply-step — `gh issue create` for (a)-items; workplan-edit replaces bare TBD with `[debt: #NNN]` back-link. For (b)-items, workplan-edit replaces bare TBD with the substantive-reason text inline.
- [ ] Step 6: `plugins/dw-lifecycle/skills/promote-deferrals/SKILL.md`.
- [ ] Step 7: Vitest unit + integration tests.

**Acceptance Criteria:**
- [ ] `/dw-lifecycle:promote-deferrals` ships; finds `TBD:` / `defer` / `follow-up:` / `out of scope` patterns in a target workplan.
- [ ] Supports promote-to-issue and inline-wontfix dispositions.
- [ ] Substantive-reason validator enforced for wontfix; rejects gaming phrases.

## Phase 4: Branch archive — `/dw-lifecycle:archive-branch`

**Deliverable:** Preserve-work-then-delete pattern for parked branches.

### Task 1: Implement archive-branch

- [ ] Step 1: Helper script `plugins/dw-lifecycle/src/subcommands/archive-branch.ts`. Takes a branch name.
- [ ] Step 2: Pre-flight checks — refuse if a worktree is checked out for the branch; refuse if `archived/<branch>-<YYYY-MM-DD>` tag already exists.
- [ ] Step 3: Create annotated tag — message references the branch + the operator-supplied or default rationale.
- [ ] Step 4: Push the tag to origin.
- [ ] Step 5: Delete local branch (`git branch -D`); delete remote branch (`git push origin --delete`).
- [ ] Step 6: `plugins/dw-lifecycle/skills/archive-branch/SKILL.md`.
- [ ] Step 7: Vitest unit + integration tests against a fixture remote.

**Acceptance Criteria:**
- [ ] `/dw-lifecycle:archive-branch` ships.
- [ ] Creates `archived/<branch>-<date>` annotated tag; pushes; deletes the branch (local + remote).
- [ ] Refuses on dirty/checked-out worktree or pre-existing tag.

## Phase 5: Release-time issue closure — `/dw-lifecycle:close-shipped`

**Deliverable:** Release-time pending-verification labeling for shipped-in-this-version issues. Closure waits for verification per project rule.

### Task 1: Implement close-shipped

- [ ] Step 1: Helper script `plugins/dw-lifecycle/src/subcommands/close-shipped.ts`. Args: `--from-tag <vA>` `--to-tag <vB>` (defaults: previous release tag → current `HEAD`).
- [ ] Step 2: Commit-log scanner — reads `git log <vA>..<vB>` and extracts referenced issue numbers (`#NNN` / `Closes #NNN` / `Fixes #NNN` / `Resolves #NNN`).
- [ ] Step 3: Apply — for each issue, post a "fixed in v<B>, please verify against the install" comment + add a `pending-verification` label. Does NOT close — closure waits for operator verification per `.claude/rules/agent-discipline.md` § "Issue closure requires verification in a formally-installed release."
- [ ] Step 4: `plugins/dw-lifecycle/skills/close-shipped/SKILL.md`.
- [ ] Step 5: Vitest unit + integration tests.
- [ ] Step 6: Optional `/release` integration — invoke `:close-shipped` post-publish. Operator opts in.

**Acceptance Criteria:**
- [ ] `/dw-lifecycle:close-shipped` ships.
- [ ] Reads commit log between two tags; matches issue references.
- [ ] Transitions matching issues to a `pending-verification` label (does NOT close).
- [ ] `/release` invokes `:close-shipped` post-publish (optional integration; landed if operator wants the auto-invoke).

## Phase 6: Lifecycle integration

**Deliverable:** Hygiene auto-fires at natural waypoints — session-end captures the just-completed work's debts, session-start displays the prior session's recommendation, complete enforces the no-bare-TBDs gate before merge.

### Task 1: Modify session-end

- [ ] Step 1: Edit `plugins/dw-lifecycle/skills/session-end/SKILL.md` + the helper to capture hygiene observations from the session (commit messages mentioning TBD/defer, files touched matching workplan-TBD patterns, etc.).
- [ ] Step 2: Generate a next-session recommendation block. Operator-editable before commit.
- [ ] Step 3: Land the recommendation block in `DEVELOPMENT-NOTES.md` as part of the journal entry.

### Task 2: Modify session-start

- [ ] Step 1: Edit `plugins/dw-lifecycle/skills/session-start/SKILL.md` + helper to read the prior session's recommendation from `DEVELOPMENT-NOTES.md` and display it.
- [ ] Step 2: NO fresh scan — display-only. Re-entry stays cheap.

### Task 3: Modify complete

- [ ] Step 1: Edit `plugins/dw-lifecycle/skills/complete/SKILL.md` + helper to scan the closing feature's workplan for uncalled-out TBDs.
- [ ] Step 2: Refuse on any bare TBD (no `[debt: #NNN]` back-link, no inline "wontfix because ...").
- [ ] Step 3: Support `--skip-tbd-gate --reason "<substantive>"` override with substantive-reason validator; reason logged in the session journal.

**Acceptance Criteria:**
- [ ] `/dw-lifecycle:session-end` carries the hygiene-observations + next-session-recommendation block; lands in `DEVELOPMENT-NOTES.md`.
- [ ] `/dw-lifecycle:session-start` displays the prior session's recommendation without re-scanning.
- [ ] `/dw-lifecycle:complete` carries the pre-merge TBD gate; supports `--skip-tbd-gate --reason "<substantive>"` override with logged reason.

## Phase 7: Documentation

**Deliverable:** Adopter-facing prose explaining the skill family + the operational pattern.

### Task 1: Author docs

- [ ] Step 1: README section under `plugins/dw-lifecycle/README.md` introducing the hygiene skills + the operational-pattern narrative (operator-triggered + lifecycle-triggered).
- [ ] Step 2: Per-skill `SKILL.md` prose for each new skill (already covered in Phase 1–6 task lists; this phase verifies completeness + cross-references).
- [ ] Step 3: Cross-reference the design spec on main + the related `Just for now is bullshit` rule.

**Acceptance Criteria:**
- [ ] Adopter-facing docs (README + per-skill SKILL.md) explain the skills + the operational pattern.

## Phase 8: Tests + smoke

**Deliverable:** Vitest unit + integration coverage for every v1 skill + a local smoke script.

### Task 1: Test coverage audit

- [ ] Step 1: Verify each Phase 1–5 task has vitest unit + integration tests landed; backfill any gaps.
- [ ] Step 2: Local smoke script `scripts/smoke-hygiene.sh` exercises end-to-end wiring (each skill invoked against a throwaway `gh` fixture repo + fixture workplan tree). NOT added to CI.

**Acceptance Criteria:**
- [ ] All v1 skills carry vitest unit + integration tests against fixture projects.
- [ ] Local smoke script exercises end-to-end wiring.

## Phase 9: Dogfood round

**Deliverable:** First batched-proposal cycle run against the existing backlog. Validates the workflow against real items.

### Task 1: Dogfood the new skills

- [ ] Step 1: Run `/dw-lifecycle:debt-report` to baseline the current state.
- [ ] Step 2: Run `/dw-lifecycle:triage-issues --bucket stale-30d --limit 10` end-to-end (propose → approve → apply). At least one full cycle.
- [ ] Step 3: Run `/dw-lifecycle:promote-deferrals` against one in-progress feature's workplan end-to-end. At least one full cycle.
- [ ] Step 4: Capture friction in `DEVELOPMENT-NOTES.md` as a session-end entry; file follow-up issues for any sharp edges.

**Acceptance Criteria:**
- [ ] Dogfood round against the existing backlog runs at least one full batched-proposal cycle for each of `:triage-issues` and `:promote-deferrals`.
- [ ] Friction captured in `DEVELOPMENT-NOTES.md`; follow-up issues filed for sharp edges.
