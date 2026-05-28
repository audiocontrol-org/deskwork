---
slug: hygiene
targetVersion: "1.0"
date: 2026-05-28
---

# Workplan: Hygiene

**Goal:** Ship a family of small, focused `/dw-lifecycle:` skills (one action per skill, UNIX-style per `.claude/CLAUDE.md` § Plugin Conventions) that surface debt on demand, drive operator-triggered batched-proposal cycles, and integrate with natural lifecycle waypoints. The skills share no persistent state — every skill reads live state (GitHub via `gh`, workplans via grep, branches via git) and mutates the same source-of-truth. The deliverable is the skills + lifecycle integration. The first dogfood round (run by the operator against the existing backlog) validates the tooling against real work; it is not "the work."

## Phase 1: [Phase 1 name]

**Deliverable:** [What works at the end of this phase.]

### Task 1: Initial implementation slice

- [ ] Step 1: **P0 — Infrastructure teardown.** Remove the stalled `feature/deskwork-open-issue-tranche-cleanup` branch + worktree (DONE during this feature's setup).
- [ ] Step 2: **P1 — Read-only baseline.** Ship `/dw-lifecycle:debt-report`. No mutations; lowest blast radius; produces the JSON downstream skills can consume.
- [ ] Step 3: **P2 — GitHub-issue triage.** Ship `/dw-lifecycle:triage-issues`. Multi-bucket support (`stale-30d`, `unlabeled`, `bug-no-comment-7d` at minimum). Implements the batched-proposal infrastructure subsequent skills reuse.
- [ ] Step 4: **P3 — Workplan-deferral promotion.** Ship `/dw-lifecycle:promote-deferrals`. Reuses P2's batched-proposal pattern. Substantive-reason validator for inline wontfix.
- [ ] Step 5: **P4 — Branch archive.** Ship `/dw-lifecycle:archive-branch`. Annotated tag + delete; refuses on dirty worktree or pre-existing tag.
- [ ] Step 6: **P5 — Release-time issue closure.** Ship `/dw-lifecycle:close-shipped`. Wire into `/release` as an optional post-publish step.
- [ ] Step 7: **P6 — Lifecycle integration.** Modify `/dw-lifecycle:session-end` (recommendation-writing), `/dw-lifecycle:session-start` (recommendation-displaying), `/dw-lifecycle:complete` (pre-merge TBD gate).
- [ ] Step 8: **P7 — Documentation.** README section + per-skill SKILL.md prose + the operational-pattern narrative.
- [ ] Step 9: **P8 — Tests + smoke.** Vitest unit + integration + local smoke script.
- [ ] Step 10: **P9 — Dogfood round.** Run `/dw-lifecycle:triage-issues` + `/dw-lifecycle:promote-deferrals` against the existing backlog at least once. Validates the workflow against real items.

**Acceptance Criteria:**
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
