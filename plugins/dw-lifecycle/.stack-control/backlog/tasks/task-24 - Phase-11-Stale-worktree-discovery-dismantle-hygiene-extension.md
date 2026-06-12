---
id: TASK-24
title: 'Phase 11: Stale worktree discovery + dismantle (hygiene extension)'
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-356
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of [#323](https://github.com/audiocontrol-org/deskwork/issues/323) (hygiene feature parent).

## Phase 11: Stale worktree discovery + dismantle

Adds a fourth structural-closure stream to the hygiene-skill family: **stale worktrees**. Parallel to GitHub issues, workplan TBDs, and parked branches. Operator-driven discovery + batched dismantle.

## Operator-decided shape (PRD iteration 2 — 2026-05-29)

- **Verb shape: Option A** — new `/dw-lifecycle:worktree-report` (pure read; sibling of `:debt-report`) + `/dw-lifecycle:dismantle-worktrees propose|apply` (batched mutation; sibling of `:triage-issues` and `:promote-deferrals`).
- **Staleness threshold:** 30 days (mirrors parked-branches).
- **`--threshold-count` default:** 3 of 9 staleness criteria.
- **`--archive-first` default:** opt-in (`false`).
- **Worktree-base path:** auto-detect from `git worktree list --porcelain` prefix; `--worktree-base <path>` overrides.
- **No `:dismantle-all-shipped` shortcut.** Rejected — defeats the per-worktree disposition review the family is built around.
- **No cross-machine cleanup.** Out of purview — locally-registered worktrees only.

## Documents

- **PRD § Phase 11:** [`docs/1.0/001-IN-PROGRESS/hygiene/prd.md`](https://github.com/audiocontrol-org/deskwork/blob/feature/hygiene/docs/1.0/001-IN-PROGRESS/hygiene/prd.md) — published 2026-05-29 after iteration v2 addressed all 7 operator marginalia.
- **Workplan § Phase 11:** [`docs/1.0/001-IN-PROGRESS/hygiene/workplan.md`](https://github.com/audiocontrol-org/deskwork/blob/feature/hygiene/docs/1.0/001-IN-PROGRESS/hygiene/workplan.md#phase-11)

## Tasks

| # | Task | Acceptance gate |
|---|---|---|
| 1 | Worktree-discovery surface — `/dw-lifecycle:worktree-report` | Markdown + JSON output; per-criterion check displayed regardless of verdict; safety rails enforced |
| 2 | Dismantle verb — `/dw-lifecycle:dismantle-worktrees propose\|apply` | Batched-proposal pattern matches `:triage-issues`; substantive-reason validators on `--allow-dirty` + `--force-discard`; partial-success behavior on per-worktree errors |
| 3 | Lifecycle integration | `:session-end-hygiene` block carries worktree-staleness count; `:session-start` displays recommendation; `:complete` suggests dismantle on feature merge; `agent-discipline.md` § "Closure is a structural step" extended |
| 4 | Documentation | `plugins/dw-lifecycle/README.md` hygiene-family section + per-skill SKILL.md + `docs/1.0/burndown/dw-lifecycle.md` updates |
| 5 | Tests + smoke | Vitest unit + integration against fixture worktree layouts; `scripts/smoke-hygiene.sh` extended; no CI bloat |
| 6 | Dogfood | One full batched-proposal cycle against the operator's real `~/work/deskwork-work/` worktrees; friction surfaces filed against `tooling-feedback.md` |

## Sibling tracker

[#347](https://github.com/audiocontrol-org/deskwork/issues/347) — the stale-branch-sessions failure mode that motivates this phase. Phase 11 ships the mechanism that prevents that failure mode at the source.

## Out of scope (decided 2026-05-29)

- `:dismantle-all-shipped` shortcut (would defeat per-worktree disposition review)
- Cross-machine cleanup (locally-registered worktrees only)

## Safety rails enforced

Current-worktree refuse · main-worktree refuse · dirty without `--allow-dirty --reason "<substantive>"` refuse · local-only commits without `--force-discard --reason "<substantive>"` refuse · force-push detection without `--accept-divergence` refuse · external path without `--allow-external` refuse · multi-worktree-same-branch refuse (corruption signal).
<!-- SECTION:DESCRIPTION:END -->
