---
name: session-start
description: "Bootstrap session: read workplan + journal + open issues; report context"
---

# /dw-lifecycle:session-start

Bootstrap a session. Reads the active feature's workplan, last journal entry, prior hygiene recommendation, and open issues; reports context.

## Steps

1. Identify the active feature from worktree name + branch.
2. Read `config.session.start.preamble` from `.dw-lifecycle/config.json` (project-specific bootstrap text — e.g., "check the Grafana dashboard before coding"). Display it.
3. Read the feature's `README.md` (status table, current phase) and `workplan.md` (next unchecked task).
4. Determine the journal-entry template path:
   - use `.dw-lifecycle/templates/journal-entry.md` if the project customized it
   - otherwise use the bundled default copied by `/dw-lifecycle:customize templates journal-entry`
5. Read the latest entry from `DEVELOPMENT-NOTES.md` referencing this slug. Summarize it according to the sections that actually exist in the project's journal template; do not assume deskwork's detailed taxonomy if the project uses a different shape.
6. Display the prior session's hygiene recommendation verbatim — NO fresh scan, display only. Re-entry stays cheap.

```
dw-lifecycle session-start-recommendation --slug <feature-slug>
```

   When no prior recommendation exists (first session, or session-end was skipped), the helper surfaces: `No prior hygiene recommendation (first session or session-end skipped).`

7. **Structural-chain snapshot (advisory).** Per `.claude/rules/enforcement-lives-in-skills.md` + the no-git-hook-enforcement ADR (`docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md`), run the structural chain as a read-only snapshot at session boot. This replaces the retired `.husky/pre-commit` block — the discipline now travels with the skill body the adopter installs.

   When `.dw-lifecycle/scope-discovery/` is present in the project, invoke each verb sequentially and surface the count line from stderr in the session-start report:

   ```
   dw-lifecycle check-clones --feature <slug> 2>&1 | tail -3
   dw-lifecycle check-anti-patterns --feature <slug> 2>&1 | tail -3
   dw-lifecycle check-adopters --feature <slug> 2>&1 | tail -3
   dw-lifecycle check-module-symmetry --feature <slug> 2>&1 | tail -3
   ```

   Render the snapshot as a single block in the bootstrap report: `Structural snapshot: clones=N anti-patterns=N holdouts=N symmetry-deltas=N`. **Advisory only** — do NOT refuse to start the session on non-zero counts. The enforcing variant fires at the end of each implement-task per `/dw-lifecycle:implement` Step 6.

   When `.dw-lifecycle/scope-discovery/` is absent, silently skip Step 7 (scope-discovery is opt-in per project).

8. **Branch-staleness signal (advisory).** Per [#422](https://github.com/audiocontrol-org/deskwork/issues/422), invoke the staleness verb so a long-stale feature branch is surfaced before the operator picks up tasks. Cheap, fires once per session — NOT per implement-loop iteration. Distinct cure-shape from the post-merge bookkeeping portfolio at [#413](https://github.com/audiocontrol-org/deskwork/issues/413): #413 makes each merge cheaper; this signal prompts the merge to happen sooner.

   ```
   dw-lifecycle branch-staleness-check
   ```

   Threshold defaults to `5`; override via `config.session.start.branchStalenessThreshold` in `.dw-lifecycle/config.json`. Default upstream ref is `origin/main`; override per invocation with `--remote <remote>/<branch>`. The verb fetches first by default; pass `--no-fetch` for offline sessions.

   Render the verb's output line in the bootstrap report. When the verb prints the `Consider git merge…` nudge, surface it too — that's the signal that the branch is past the staleness threshold and the operator should consider syncing before picking up tasks. **Advisory only** — never refuse to start the session.

   When the installed binary doesn't recognize `branch-staleness-check` (older release), silently skip Step 8; the verb is opt-in per plugin version.

9. Run `gh issue list --state open --search <slug>` to surface relevant issues.
10. Report context to the operator. Do NOT start work until they confirm the session goal.

## Error handling

- **Not on a feature branch.** Skill prompts: "Current branch is `main` (or other non-feature branch). Switch to a feature worktree before continuing."
- **`DEVELOPMENT-NOTES.md` missing.** Treated identically to "no prior recommendation"; surface the friendly message and proceed.
- **`branch-staleness-check` rejects the invocation** (older plugin binary, git error, detached HEAD). The verb itself prints a one-line `skipped (...)` message and exits 0; surface that line in the bootstrap report. Never refuse to start the session on staleness-detection failure — it's advisory only.
