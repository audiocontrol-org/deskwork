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
   dw-lifecycle check-editor-symmetry --feature <slug> 2>&1 | tail -3
   ```

   Render the snapshot as a single block in the bootstrap report: `Structural snapshot: clones=N anti-patterns=N holdouts=N symmetry-deltas=N`. **Advisory only** — do NOT refuse to start the session on non-zero counts. The enforcing variant fires at the end of each implement-task per `/dw-lifecycle:implement` Step 6.

   When `.dw-lifecycle/scope-discovery/` is absent, silently skip Step 7 (scope-discovery is opt-in per project).

8. Run `gh issue list --state open --search <slug>` to surface relevant issues.
9. Report context to the operator. Do NOT start work until they confirm the session goal.

## Error handling

- **Not on a feature branch.** Skill prompts: "Current branch is `main` (or other non-feature branch). Switch to a feature worktree before continuing."
- **`DEVELOPMENT-NOTES.md` missing.** Treated identically to "no prior recommendation"; surface the friendly message and proceed.
