---
slug: hygiene
title: Hygiene
targetVersion: "1.0"
date: 2026-05-28
parentIssue: "#323"
deskwork:
  id: aee9b719-7451-401e-be45-7dba8a8cd41a
---

# PRD: Hygiene

## Problem Statement

Three converging debt sources accumulate silently and compound across this project: 1. **Stale GitHub issues.** 180 open issues at this spec's writing (81 enhancement, 52 bug, 46 unlabeled). The oldest unlabeled issues have no clear disposition; nobody triages them; new contributors can't tell what's actionable. The backlog isn't a queue — it's a midden. 2. **Workplan deferrals as invisible IOUs.** 88 lines tagged `TBD`, `defer`, `follow-up`, or `out of scope` across in-progress workplans. Most aren't tracked in GitHub. The project's existing `Just for now is bullshit` rule names this exact pattern as the failure mode it exists to prevent — but mechanical enforcement doesn't exist. 3. **Parked branches with real work.** `feature/studio-bridge` carries 35 unmerged commits intentionally deferred until a security gap closes; `feature/deskwork-open-issue-tranche-cleanup` was a stalled placeholder (now removed as part of this feature's setup). Each represents either work to merge, work to archive, or noise to clear — no skill exists to decide. The operator's framing on shape: *"it might never end. we always need hygiene."* This reframes the goal from "burn N debts before Friday" to "ship the tooling and operational pattern that makes recurring burndown sustainable indefinitely." Any kickoff sprint is dogfooding against real work, not the deliverable.

## Solution

Ship a family of small, focused `/dw-lifecycle:` skills (one action per skill, UNIX-style per `.claude/CLAUDE.md` § Plugin Conventions) that surface debt on demand, drive operator-triggered batched-proposal cycles, and integrate with natural lifecycle waypoints. The skills share no persistent state — every skill reads live state (GitHub via `gh`, workplans via grep, branches via git) and mutates the same source-of-truth. The deliverable is the skills + lifecycle integration. The first dogfood round (run by the operator against the existing backlog) validates the tooling against real work; it is not "the work."

## Acceptance Criteria

- [ ] `/dw-lifecycle:debt-report` ships; emits markdown + JSON across the three categories.
- [ ] `/dw-lifecycle:triage-issues` ships; supports `stale-30d`, `unlabeled`, `bug-no-comment-7d` buckets; partial-approval works; partial-success surfaces failures with reasons.
- [ ] `/dw-lifecycle:close-shipped` ships; reads commit log between two tags; transitions matching issues to a pending-verification label (does NOT close).
- [ ] `/dw-lifecycle:promote-deferrals` ships; finds `TBD:` / `defer` / `follow-up:` / `out of scope` patterns in a target workplan; supports promote-to-issue and inline-wontfix dispositions; substantive-reason validator enforced for wontfix.
- [ ] `/dw-lifecycle:archive-branch` ships; creates `archived/<branch>-<date>` annotated tag; pushes; deletes the branch; refuses on dirty worktree or pre-existing tag.
- [ ] `/dw-lifecycle:session-end` carries the hygiene-observations + next-session-recommendation block; lands in `DEVELOPMENT-NOTES.md`.
- [ ] `/dw-lifecycle:session-start` displays the prior session's recommendation without re-scanning.
- [ ] `/dw-lifecycle:complete` carries the pre-merge TBD gate; supports `--skip-tbd-gate --reason "<substantive>"` override with logged reason.
- [ ] `/release` invokes `:close-shipped` post-publish (optional integration; landed if operator wants the auto-invoke).
- [ ] All v1 skills carry vitest unit + integration tests against fixture projects.
- [ ] Local smoke script exercises end-to-end wiring.
- [ ] Adopter-facing docs (README + per-skill SKILL.md) explain the skills + the operational pattern.
- [ ] Dogfood round against the existing backlog runs at least one full batched-proposal cycle for each of `:triage-issues` and `:promote-deferrals`.
- [ ] **npm Trusted Publisher workflow ships:** `.github/workflows/publish-npm.yml` triggers on `v*` tag push, authenticates to npm via OIDC (no token), publishes all three `@deskwork/*` packages in dep order, runs `assert-published` + marketplace smoke as in-CI gates. `make publish` stays as a documented manual fallback.
- [ ] **`/release` skill simplifies:** the Pause 3 ("publish step — run in your own terminal") collapses into "tag push fired Action `<run-url>`; waiting for `success`". The skill polls the workflow run, surfaces success/failure to the operator. The Pause 4 marketplace-smoke step is rolled into the CI workflow (the local smoke stays available but is no longer a hard gate of the `/release` skill).

### Phase 11 — Stale worktree discovery + dismantle

A fourth debt stream surfaces in parallel with the existing three (GitHub issues, workplan TBDs, parked branches): **stale worktrees**. The operator's worktree-base directory accumulates per-feature checkouts; each one carries its own `node_modules`, build artifacts, runtime cache, and IDE/session state. After a feature merges + releases, its worktree typically lingers indefinitely with no structural prompt to remove it. Symptoms: disk-space drift; orphan worktrees whose pinned branch was deleted from origin (`git worktree list` shows `prunable`); confusion in `dw-lifecycle:setup` when the operator re-uses a feature slug that has a leftover worktree; agent sessions opened against worktrees whose work has already shipped (the "stale-branch sessions silently re-implement shipped work" failure mode named in [#347](https://github.com/audiocontrol-org/deskwork/issues/347)).

Worktrees are NOT covered by `:archive-branch` (that verb addresses the underlying *branch*, not the on-disk checkout). The closure asymmetry the hygiene family closes — shipping has structural gates; closing does not — applies to worktrees too: every `/dw-lifecycle:setup` creates a worktree; nothing structurally walks the result back when the feature graduates.

**Detection surface — staleness signals captured (operator picks the v1 threshold during iteration):**

- Pinned branch is fully merged into `main` (no commits ahead).
- Pinned branch's PR is in state `merged` or `closed` (queried via `gh`).
- Feature documentation has graduated to `003-COMPLETE/<slug>/`.
- Pinned branch has had no commits in N days (default candidate: 30, mirrors parked-branches threshold).
- Pinned branch is gone from origin (`git ls-remote --heads origin <branch>` returns empty).
- Working tree is clean (no modified / untracked files).
- All commits are on origin (no local-only commits).
- `git worktree list --porcelain` marks the entry as `prunable` (git's own staleness signal).
- The worktree's path is orphaned — the directory exists on disk but `git worktree list` doesn't know about it.

**Dismantle pre-conditions — safety rails:**

- Refuse on the current worktree (cannot remove the one we're running from).
- Refuse on the main worktree / bare-repo worktree.
- Refuse on dirty working tree without `--allow-dirty --reason "<substantive>"` (substantive-reason validator parallels `:archive-branch` + `:complete --skip-tbd-gate --reason`).
- Refuse when local-only commits exist without `--force-discard --reason "<substantive>"`.
- Refuse when the worktree's pinned branch points at a tag/SHA other than what origin shows for that branch name (force-push detection) without `--accept-divergence`.
- Refuse on worktrees outside the project-convention path (`~/work/<project>-work/<slug>/`) without `--allow-external`.
- Refuse when multiple worktrees share the same pinned branch (corruption signal; operator triage required).

**Composition with `:archive-branch`:**

`:dismantle-worktrees` composes with the existing `:archive-branch` verb when `--archive-first` is passed: the branch gets an annotated `archived/<branch>-<date>` tag before the worktree is removed; the branch is also deleted from local (matching `:archive-branch`'s existing behavior). This preserves the branch's contents for recovery even after the worktree is gone. `--archive-first` is **opt-in** (default `false`) — the operator explicitly opts into the archive-then-dismantle composition when they want the branch preserved.

**Report fields per worktree:**

Path · pinned branch · ahead/behind main counts · last commit (SHA + ISO date) · working-tree state (`clean` / `dirty:N files`) · PR state (`open` / `merged` / `closed` / `no-pr`) · feature-doc location (`001-IN-PROGRESS/<slug>` / `003-COMPLETE/<slug>` / `none`) · per-criterion check results · staleness verdict · recommended disposition (`keep` / `dismantle` / `archive-then-dismantle` / `operator-triage`).

**Verb shape — UNIX-style mirror of Phase 1 + Phase 4 (operator-decided 2026-05-29):**

New `/dw-lifecycle:worktree-report` (pure read; sibling of `:debt-report`) + `/dw-lifecycle:dismantle-worktrees propose|apply` (batched mutation; sibling of `:triage-issues` and `:promote-deferrals`). Three skill files total — `worktree-report/SKILL.md`, `dismantle-worktrees/SKILL.md` (covers both propose + apply per the existing pattern), and an updated `debt-report/SKILL.md` cross-reference. The shape was chosen over (a) folding the read into `:debt-report` and (b) a single-target `:dismantle-worktree <path>` mirror of `:archive-branch` because it matches the family's strictest UNIX-style consistency — one verb per action, read-and-mutate split cleanly.

**Lifecycle integration — additional touchpoints beyond the verbs:**

- `:session-end-hygiene` extends the hygiene-observations block with a worktree-staleness count (matches the existing GH/workplan/branches structure; surfaces in `DEVELOPMENT-NOTES.md`).
- `:session-start` displays the prior session's worktree-staleness recommendation if present.
- `:complete` after feature merge → suggested next action is `:dismantle-worktrees propose` against this feature's worktree.
- `:close-shipped` — optional post-release recommendation when shipped issues had associated feature worktrees.
- Updates to `.claude/rules/agent-discipline.md` § "Closure is a structural step, not aspirational" — worktrees become the fourth structural-closure stream documented in that rule.

**Edge cases captured:**

- Orphan directories on disk in the worktree-base path that look like worktrees but aren't (`git worktree list` doesn't know them) — surface in report as `orphan-directory`; recommend disposition.
- Worktrees whose pinned branch was force-pushed on origin (local sha ≠ origin sha for the same name) — surface as `divergence`; refuse dismantle without `--accept-divergence`.
- Worktrees with submodules — refuse without `--prune-submodules`; substantive-reason required.
- Worktrees with their own `node_modules` / build artifacts — list disk-size footprint in report; dismantle removes them with the worktree (operator confirmation required for paths over a configurable threshold).
- Worktrees on shared/remote filesystems — surface in report as `remote-filesystem`; operator decides whether dismantle is safe.
- Worktrees outside the project-convention path — surface with `--allow-external` gate; default is to skip them.

**Configuration (operator-decided 2026-05-29):**

- `--days N` staleness threshold (**default: 30** — mirrors parked-branches).
- `--worktree-base <path>` override for non-standard project layouts. Default: **auto-detect from `git worktree list --porcelain` prefix** — the common parent directory of all registered worktrees. No hardcoded path; no project-config-file coupling.
- `--allow-external` to include worktrees outside the auto-detected base path.
- `--allow-dirty --reason "<text>"` substantive-reason gate.
- `--force-discard --reason "<text>"` substantive-reason gate for local-only commits.
- `--accept-divergence` for force-push detection.
- `--prune-submodules` for worktrees with submodules.
- `--archive-first` to compose with `:archive-branch`. **Default: opt-in** (`false`). Operator passes `--archive-first` when they want the branch contents preserved via annotated tag before worktree removal.
- `--threshold-count N` — minimum number of staleness criteria that must hold for an entry to flag as `stale`. **Default: 3** (must satisfy ≥3 criteria). Surfaces all signals individually in the report so operator sees the per-criterion check regardless of the verdict.

**Acceptance criteria:**

- [ ] `/dw-lifecycle:worktree-report` ships as a new pure-read sibling of `:debt-report`; emits markdown (default) and JSON (`--json`).
- [ ] `/dw-lifecycle:dismantle-worktrees propose|apply` ships under the batched-proposal pattern matching `:triage-issues` and `:promote-deferrals`. All-or-nothing apply on validation failure; partial success on per-worktree dismantle errors (records failures + continues with the rest). Substantive-reason validator on the `--allow-dirty` + `--force-discard` overrides.
- [ ] Safety rails enforced as captured above: current-worktree refuse; main-worktree refuse; dirty without reason refuse; local-only commits without reason refuse; force-push detection refuse; external path refuse without flag; multi-worktree-same-branch refuse.
- [ ] `--archive-first` (opt-in, default `false`) composes with `:archive-branch` to preserve branch contents (annotated tag) before worktree removal.
- [ ] Default staleness threshold is 30 days; default `--threshold-count` is 3.
- [ ] Worktree-base path auto-detected from `git worktree list --porcelain` prefix; `--worktree-base <path>` overrides.
- [ ] `:session-end-hygiene` surfaces worktree-staleness in its block; `:session-start` displays the next-session-recommendation if present; `:complete` suggests worktree dismantle on feature merge.
- [ ] Vitest unit + integration tests against fixture worktree layouts (tmp dirs with realistic git state).
- [ ] Local smoke script (`scripts/smoke-hygiene.sh`) exercises the worktree verbs end-to-end against a fixture project tree.
- [ ] Adopter-facing docs (README + per-skill SKILL.md) explain the worktree verbs + the operational pattern.
- [ ] `agent-discipline.md` § "Closure is a structural step" extended to name worktrees as the fourth closure stream.

## Out of Scope

- A persistent debt-registry file (`.dw-lifecycle/debt-registry.json` etc.). Source-of-truth stays in GitHub + workplan markdown + git refs. A new layer would introduce its own drift surface; rejected during brainstorm in favor of the no-shared-state principle.
- A doctor-rule-centric model where every debt category becomes a doctor finding. Rejected in favor of skill-centric UNIX composability — operator picks the tool for the job, no monolithic "what's wrong" surface.
- A "session-start hygiene injection." Operator's correction during brainstorm: session-start must stay lightweight (re-entry, not ceremony). Session-end is the right capture point because it has the just-completed work's context to inform the next session's recommendation.
- Code-vs-rule drift detection (rules in `.claude/rules/` that have no mechanical enforcement). Distinct concern; potential follow-up.
- Doctor / scope-discovery findings burndown as a distinct skill. Those flows already exist in their respective subsystems; hygiene doesn't subsume them.
- Pixel-diff visual-regression burndown. Out of scope; sibling concern to the in-flight `visual-verification-gate` feature.
- Pushing the existing studio-bridge branch through `:archive-branch`. The operator's earlier decision was to leave studio-bridge parked until a security gap closes. This feature ships the tool; the operator decides when to apply it.
- Cross-machine worktree cleanup. The Phase 11 worktree verbs operate against locally-registered worktrees only (`git worktree list`). Worktrees on a remote/synced filesystem reachable from this machine MAY be surfaced incidentally if `git worktree list` knows about them, but cross-machine cleanup (reaching out over SSH / a synced FS to enumerate or remove worktrees on another host) is explicitly out of purview. Operator's framing 2026-05-29: *"don't care about cross-machine cleanup. that's outside the purview of this tool."*
- A `:dismantle-all-shipped` shortcut. Considered during Phase 11 capture; operator rejected 2026-05-29 in favor of the batched-proposal pattern with operator review for every entry — bulk-dismantle would defeat the per-worktree disposition review the family is built around.

## Technical Approach

**Skill-centric, UNIX-style.** Each skill does ONE action against ONE debt source. They share no persistent state of their own; source-of-truth stays where it lives now. Skills mutate via existing tools (`gh`, Edit, git). Composition is the operator's job ("`:debt-report`, then `:triage-issues --bucket stale-30d`"). **Batched-proposal pattern (worked example: `:triage-issues`):** 1. Operator invokes: `/dw-lifecycle:triage-issues --bucket stale-30d --limit 10` 2. Skill fetches state via `gh`. Pure read. 3. Agent (in the calling conversation) proposes a disposition per item with one-paragraph reasoning. Uniform format (markdown table or numbered list). 4. Operator reviews the full batch. Approves (`y` / `1,3,5` for partial / `n` to abort). Per-item rejection loops back to step 3. 5. Skill applies approved decisions via `gh` calls — one per item. Partial success is fine; failures don't roll back the rest. 6. Skill reports: "Applied X, Y failures with reasons, Z deferred to the next pass." The same shape applies across skills — fetch live state, propose, gate, apply. The "batched proposal" pattern lives in the calling conversation, not a separate UI surface. **Lifecycle integration philosophy.** Session-start stays cheap (just display the recommendation written last session). Session-end captures hygiene observations + drafts a recommendation. Complete enforces the no-bare-TBDs gate at the natural pre-merge waypoint. Release closes shipped issues into pending-verification (closure waits for verification per project rule). **Error handling.** Three failure shapes per skill: fetch-time (abort before any mutation), per-item proposal (skip with note), per-item apply (record failure, continue with batch). No rollback; partial success is visible and acceptable. **Testing.** Per `.claude/rules/testing.md`: vitest unit + integration against fixture projects + mocked `gh`; local smoke script. No CI bloat.
