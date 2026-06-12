---
id: TASK-29
title: >-
  Process bug: stale-branch sessions silently re-implement shipped work
  (graphical-entries instance)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-347
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

The `feature/graphical-entries` worktree currently carries **uncommitted dw-lifecycle/scope-discovery changes that are byte-identical duplicates of work already shipped on main in v0.24.0** (commit `4da4660` — "check-deprecations port + detect-clones→check-clones rename"). An agent in the graphical-entries session re-implemented those changes from scratch without noticing they exist on main. This is a process bug, not a code bug — the failure mode is "stale-branch sessions silently re-derive shipped work."

## Diagnosis

The graphical-entries branch HEAD is `2cdde80` with a base of `e053e85` from 2026-05-25 — **pre-v0.24.0**. Main has shipped v0.24.0 → v0.24.1 → v0.24.2 → v0.25.0 since then (+ several non-release commits). The agent in the graphical-entries session is unaware that the dw-lifecycle work it's re-implementing already exists 4 days downstream on main.

## What was found in the graphical-entries worktree

### Set A — graphical-entries' own Phase 6 work (legitimate; stays)

- `packages/studio/src/pages/pipelines.ts` + sibling files in `pipelines/` subdir
- `packages/studio/test/pipelines/` (modified + 1 new test file)
- `plugins/deskwork-studio/public/css/pipelines-page.css`, `pipelines-stage-flow.css`
- `plugins/deskwork-studio/public/src/copy-builder.ts`, `lanes/lanes-page.ts`, `pipelines/pipelines-builders.ts` (NEW), `pipelines/pipelines-page.ts`
- `docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md` (their feature's audit-log)
- `docs/1.0/001-IN-PROGRESS/graphical-entries/scope-inventory/widen-runs/<3 dirs>` (runtime; gitignored on main)

### Set B — duplicate of v0.24.0 commit `4da4660` (already on main)

Every file in this set is **byte-identical** to its main counterpart (verified via `diff -q`):

| Status | File | On main since |
|---|---|---|
| NEW (graphical-entries) | `plugins/dw-lifecycle/src/scope-discovery/deprecation-scan.ts` | v0.24.0 |
| NEW (graphical-entries) | `plugins/dw-lifecycle/src/scope-discovery/deprecation-report.ts` | v0.24.0 |
| NEW (graphical-entries) | `plugins/dw-lifecycle/src/scope-discovery/schema/deprecation-queue.yaml.schema.json` | v0.24.0 |
| NEW (graphical-entries) | `plugins/dw-lifecycle/src/subcommands/check-clones.ts` | v0.24.0 |
| NEW (graphical-entries) | `plugins/dw-lifecycle/src/__tests__/scope-discovery/check-clones.gate-mode.test.ts` | v0.24.0 |
| NEW (graphical-entries) | `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/check-deprecations-harness.ts` | v0.24.0 |
| MODIFIED (graphical-entries) | `plugins/dw-lifecycle/src/cli.ts` — adds `check-clones` import + back-compat alias for `detect-clones` | v0.24.0 |
| MODIFIED (graphical-entries) | `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/detector-harness.ts` — comment update for the rename | v0.24.0 |
| DELETED (graphical-entries) | `plugins/dw-lifecycle/src/__tests__/scope-discovery/detect-clones.gate-mode.test.ts` (renamed to `check-clones.gate-mode.test.ts`) | v0.24.0 |

### Misplaced runtime artifact

- `plugins/dw-lifecycle/.dw-lifecycle/scope-discovery/deprecation-queue.md` — runtime output written inside the plugin shell instead of at the project root. Probably the agent ran `check-deprecations --write` with cwd inside the plugin dir, so the cwd-relative default path resolved to the wrong location.

## Recommended cleanup for the graphical-entries worktree

```bash
cd /Users/orion/work/deskwork-work/graphical-entries

# 1. Discard the duplicate dw-lifecycle changes (Set B)
git restore plugins/dw-lifecycle/src/cli.ts
git restore plugins/dw-lifecycle/src/__tests__/scope-discovery/util/detector-harness.ts
git restore plugins/dw-lifecycle/src/__tests__/scope-discovery/detect-clones.gate-mode.test.ts  # un-delete
rm plugins/dw-lifecycle/src/scope-discovery/deprecation-scan.ts
rm plugins/dw-lifecycle/src/scope-discovery/deprecation-report.ts
rm plugins/dw-lifecycle/src/scope-discovery/schema/deprecation-queue.yaml.schema.json
rm plugins/dw-lifecycle/src/subcommands/check-clones.ts
rm plugins/dw-lifecycle/src/__tests__/scope-discovery/check-clones.gate-mode.test.ts
rm plugins/dw-lifecycle/src/__tests__/scope-discovery/util/check-deprecations-harness.ts

# 2. Delete the misplaced runtime artifact
rm -rf plugins/dw-lifecycle/.dw-lifecycle

# 3. Commit graphical-entries' own Phase 6 work (Set A)
git add packages/studio/ plugins/deskwork-studio/ docs/1.0/001-IN-PROGRESS/graphical-entries/audit-log.md
git commit -m "feat(graphical-entries): Phase 6 work-in-progress"

# 4. Bring the branch up to current main
git fetch origin
git rebase origin/main   # or: git merge origin/main
```

After the rebase, Set B's files arrive automatically from main. No work lost; the agent in the graphical-entries session can move forward against the current dw-lifecycle plugin surface (v0.25.0 — orchestrator-turn, wrap-prompt, validate-return, #318 clustering all available).

## Deeper pattern this surfaces

This is the third recent instance of agents in stale-branch sessions independently producing work that already exists or partially exists elsewhere:

1. **The Phase 12 / hygiene duplicate** (closed earlier today by `0221332` revert + hygiene workplan absorption) — I added a Phase 12 extension to scope-discovery duplicating the hygiene feature's `close-shipped` design.
2. **This graphical-entries instance** — agent in graphical-entries re-implementing v0.24.0's deprecation-scan + check-clones rename.
3. **Pattern across the project** — sessions running on long-lived branches with bases far behind main accumulate independent re-derivations of shipped work.

**Root cause:** sessions have no feedback signal that "this file already exists on main with different content." The agent reads the working tree, decides the file is missing or outdated, and writes the version it thinks should exist — usually correctly, but redundantly.

**Possible mitigations** (not in scope here; surface for discussion):

- **Session-start drift check**: `/dw-lifecycle:session-start` warns when the branch is N+ commits behind main, AND lists files on main since the branch's base that touch the same plugin/feature the session is working on.
- **Pre-write file-existence check on main**: when an agent is about to write a new file, a hook checks whether main already has that file. If yes, surface the existing version as a delta-vs-the-planned-write.
- **Branch-staleness gate in `/dw-lifecycle:implement`**: refuse to start implementation work if the branch is >N commits behind main without an explicit `--allow-stale` override + reason.
- The hygiene feature's `/dw-lifecycle:debt-report` already catches the **parked-branches** category — this case is the same shape but for in-progress (not parked) branches; the debt-report's parked-branch scanner could grow an in-progress-but-far-behind category.

The mitigations are independent improvements; filing this issue captures the failure mode so the discussion has a stable anchor.

## Verification

- `diff -q` between graphical-entries' new files and their main counterparts: silent (= byte-identical) on all 6 NEW files in Set B.
- `git ls-tree -r main --name-only | grep` confirms every Set B file is present on main.
- The graphical-entries branch HEAD `2cdde80` walks back to base `e053e85` (2026-05-25), which predates v0.24.0 (released 2026-05-26).
<!-- SECTION:DESCRIPTION:END -->
