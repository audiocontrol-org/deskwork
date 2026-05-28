---
slug: hygiene
title: Hygiene
targetVersion: "1.0"
date: 2026-05-28
parentIssue:
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

## Out of Scope

- A persistent debt-registry file (`.dw-lifecycle/debt-registry.json` etc.). Source-of-truth stays in GitHub + workplan markdown + git refs. A new layer would introduce its own drift surface; rejected during brainstorm in favor of the no-shared-state principle.
- A doctor-rule-centric model where every debt category becomes a doctor finding. Rejected in favor of skill-centric UNIX composability — operator picks the tool for the job, no monolithic "what's wrong" surface.
- A "session-start hygiene injection." Operator's correction during brainstorm: session-start must stay lightweight (re-entry, not ceremony). Session-end is the right capture point because it has the just-completed work's context to inform the next session's recommendation.
- Code-vs-rule drift detection (rules in `.claude/rules/` that have no mechanical enforcement). Distinct concern; potential follow-up.
- Doctor / scope-discovery findings burndown as a distinct skill. Those flows already exist in their respective subsystems; hygiene doesn't subsume them.
- Pixel-diff visual-regression burndown. Out of scope; sibling concern to the in-flight `visual-verification-gate` feature.
- Pushing the existing studio-bridge branch through `:archive-branch`. The operator's earlier decision was to leave studio-bridge parked until a security gap closes. This feature ships the tool; the operator decides when to apply it.

## Technical Approach

**Skill-centric, UNIX-style.** Each skill does ONE action against ONE debt source. They share no persistent state of their own; source-of-truth stays where it lives now. Skills mutate via existing tools (`gh`, Edit, git). Composition is the operator's job ("`:debt-report`, then `:triage-issues --bucket stale-30d`"). **Batched-proposal pattern (worked example: `:triage-issues`):** 1. Operator invokes: `/dw-lifecycle:triage-issues --bucket stale-30d --limit 10` 2. Skill fetches state via `gh`. Pure read. 3. Agent (in the calling conversation) proposes a disposition per item with one-paragraph reasoning. Uniform format (markdown table or numbered list). 4. Operator reviews the full batch. Approves (`y` / `1,3,5` for partial / `n` to abort). Per-item rejection loops back to step 3. 5. Skill applies approved decisions via `gh` calls — one per item. Partial success is fine; failures don't roll back the rest. 6. Skill reports: "Applied X, Y failures with reasons, Z deferred to the next pass." The same shape applies across skills — fetch live state, propose, gate, apply. The "batched proposal" pattern lives in the calling conversation, not a separate UI surface. **Lifecycle integration philosophy.** Session-start stays cheap (just display the recommendation written last session). Session-end captures hygiene observations + drafts a recommendation. Complete enforces the no-bare-TBDs gate at the natural pre-merge waypoint. Release closes shipped issues into pending-verification (closure waits for verification per project rule). **Error handling.** Three failure shapes per skill: fetch-time (abort before any mutation), per-item proposal (skip with note), per-item apply (record failure, continue with batch). No rollback; partial success is visible and acceptable. **Testing.** Per `.claude/rules/testing.md`: vitest unit + integration against fixture projects + mocked `gh`; local smoke script. No CI bloat.
