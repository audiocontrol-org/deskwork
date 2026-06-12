---
id: TASK-7
title: >-
  scope-discovery: session-start branch-staleness detector (pre-merge early
  warning; cf. #413)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
  - enhancement
dependencies: []
references:
  - gh-422
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Operator-reported friction

> "shouldn't it go in session-start so it's not a tax on every iteration of the implement loop?"
> — operator, 2026-06-04

The 2026-06-04 cont. 5 session opened on a `feature/scope-discovery` branch that was **24 commits behind `origin/main`**. The hygiene helper's mechanical first-unchecked-task pick pointed at Task 40 (`#411`); the agent shipped 290 lines of substantive fix + 2 audit-barrage cascade-burndown commits before discovering main had ALREADY shipped both `#411` and `#412` via PR `#414`. All three commits were reset out. Net cost: ~30 minutes of agent attention, 5 audit findings filed-then-reverted, operator distraction for the merge-vs-reset decision.

The failure mode is `branch is N commits behind main at session boot, agent picks up a task whose substance is already on main`. Detection is cheap (one `git fetch` + one `git log` count); the fix is one nudge line in the session-start bootstrap report.

## What this is NOT

This is **not** the post-merge bookkeeping portfolio at #413 (per-file merge drivers for `clones.yaml` / `audit-log.md` / `workplan.md` ledger). That portfolio addresses the cost of *executing* the merge once the operator has decided to do it. This issue addresses the *signal* that prompts the decision — pre-merge early warning so the merge happens before drift accumulates and the per-merge cost becomes large.

The two cures compose: this issue's nudge gets the operator to merge sooner; #413's portfolio makes each merge cheaper. Independently shippable.

## Proposed shape

### New helper verb: `dw-lifecycle branch-staleness-check`

Parallels existing `dw-lifecycle session-start-recommendation --slug <slug>`.

- Runs `git fetch <upstream-remote> <upstream-branch>` (silent; configurable; defaults `origin main`).
- Counts `git log <currentBranch>..<upstream-remote>/<upstream-branch> --oneline | wc -l` → `behind`.
- Threshold default `5`; override via `config.session.start.branchStalenessThreshold: number` in `.dw-lifecycle/config.json`.
- Stdout (human): `Branch staleness: N commits behind origin/main` + (when `N > threshold`) one-line nudge — *"Consider `git merge origin/main` before picking up tasks (cf. #413 for the post-merge portfolio + #<this-issue> for context)."*
- Stdout (`--json`): `{"branch": "...", "remote": "origin/main", "behind": N, "threshold": 5, "nudgeRequired": true|false}`.
- Exit 0 always (advisory; never refuses to start the session).
- `--no-fetch` flag skips the fetch round-trip (offline + test path).
- `--threshold N` flag overrides the config value (operator pinning + test path).

### Session-start SKILL.md change

Insert Step 7.5 between current Step 7 (structural snapshot) and Step 8 (`gh issue list`):

```
7.5. Read branch-staleness signal:
     dw-lifecycle branch-staleness-check
```

Render output as a single line in the bootstrap report alongside the structural snapshot — same "advisory only" framing.

### Config schema extension

`config.session.start.branchStalenessThreshold: number` (default `5`). Optional; absent = use the verb default.

## Why session-start, not implement-loop

Operator framing: *"shouldn't it go in session-start so it's not a tax on every iteration of the implement loop?"* The implement-loop iterates many times per session (cont. 5: 6 task attempts in one session); each iteration paying a `git fetch + git log` round-trip is waste because the answer rarely changes inside a single session. Session-start fires once at session boot and catches the actual failure mode (*"I'm starting work on a stale branch I haven't synced"*).

The implement skill can reference the session-start signal as a precondition reminder but does NOT re-fetch.

## Open design surface (operator picks at implementation)

1. **Default upstream remote/branch.** `origin/main` is the default for this repo; some adopters use `upstream/main` or `origin/master`. Read from `config.branches.upstream: string` (capture: not yet in schema; add or default-and-document).
2. **Threshold default.** `5` per the cont. 5 / journal-entry observation; operator can override per project.
3. **Hard gate or advisory?** Advisory — matches Step 7's existing framing (the structural snapshot is also advisory; the enforcing variant fires at task-completion time). Operator may override.
4. **Cross-reference in nudge text.** Should the nudge link to this issue + #413? Yes — both provide context for why the operator cares about the signal.
5. **Should the implement skill re-check?** No (operator framing above). But the implement skill SKILL.md should reference this signal as a precondition reminder.
6. **What about other long-running diverged branches?** Detect-only is fine for v1; a multi-branch sweep could be a separate verb (`dw-lifecycle worktree-staleness-report`?) — out of scope for v1, capture-only.

## Why now

Branch-lifespan friction grows with feature-branch age. `feature/scope-discovery` is ~10 days old with multiple main resyncs; cont. 5's 24-commits-behind state is the second instance of this failure mode (the first was cont. 4's pre-merge state). The cheap fix lands now; the heavier #413 portfolio ships when scoped.

## Test plan (TDD-first)

- Bug-repro: simulate a feature branch N commits behind a fixture upstream; helper returns `behind: N` and `nudgeRequired: true` when `N > threshold`.
- Regression-lock: `N = 0` → no nudge; `N <= threshold` → no nudge.
- `--no-fetch` path: doesn't touch the network; uses the local ref state.
- `--json` output shape verified.
- Threshold override (CLI flag + config-loaded path) verified.

## Provenance

Surfaced 2026-06-04 in `/dw-lifecycle:session-start` after the cont. 5 incident (3 commits reset out from stale-branch re-implementation). Captured per `Capture mode vs scope mode` agent-discipline rule; scoping happens in this workplan as Phase 28.
<!-- SECTION:DESCRIPTION:END -->
