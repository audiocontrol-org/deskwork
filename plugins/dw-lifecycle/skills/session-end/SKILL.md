---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

# /dw-lifecycle:session-end

Wrap up a session. Append a structured journal entry (with hygiene observations + a next-session recommendation), update feature docs, commit documentation changes.

## Steps

1. Identify active feature.
2. Update `<feature-dir>/README.md` status table (check off completed acceptance criteria, update phase status).
3. Update `<feature-dir>/workplan.md` (check off completed task steps).
4. Determine the journal-entry template path:
   - use `.dw-lifecycle/templates/journal-entry.md` if the project customized it
   - otherwise use the bundled default copied by `/dw-lifecycle:customize templates journal-entry`
5. Compose the journal entry body from that template.
6. Capture hygiene observations + the next-session recommendation:

```
dw-lifecycle session-end-hygiene --slug <feature-slug> [--target-version <vN.N>] [--session-start-sha <sha>]
```

   Captures (a) commit subjects in the session range mentioning TBD / defer / follow-up / wontfix / keep-with-reason / `[debt: #NNN]`, (b) bare TBD markers INTRODUCED BY THE SESSION DIFF in the feature workplan (`git diff --unified=0 <boundarySha>..HEAD -- <workplan>` — pre-existing prose stops re-firing every session), (c) issues actually touched by the session — derived from `#NNN` references in `git log <boundarySha>..HEAD` commit subjects + bodies, then `gh issue view <N>` per unique number, (d) stale worktrees flagged by the Phase 11 scan. The session-boundary SHA fallback is priority-ordered: `--session-start-sha` → merge-base with `origin/main` → `HEAD~10`. When no boundary is resolvable (greenfield repos / fixtures), the workplan-TBD step falls back to a whole-file scan and the issue step emits zero observations + a one-line stderr diagnostic naming which fallbacks were tried. Prints a two-section markdown block:

   - `### Hygiene observations` — what surfaced this session.
   - `### Next session recommendation (hygiene)` — Resume / Triage / Address TBD lines, operator-editable before commit.

   Append the captured block to the end of the journal entry body (after the operator reviews and optionally edits it).

7. Append the entry via the helper:

```
dw-lifecycle journal-append --file <entry.md>
```

8. Read `config.session.end.preamble` and display any project-specific wrap-up text.
9. **Closing discipline (refuse-to-end on regressions).** Per `.claude/rules/enforcement-lives-in-skills.md` + the no-git-hook-enforcement ADR (`docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md`), these checks used to live in `.husky/pre-commit` (or, for the open-findings part, run only mid-implement-loop); they now fire as part of session-end so a session cannot wrap with these regressions hidden. When `.dw-lifecycle/scope-discovery/` is present:

   ```bash
   dw-lifecycle check-disposition-survivor --feature <slug>
   ```

   STOP session-end on any `keep-with-reason` / `refactor` / `ignore-with-justification` → `pending` transition in `clones.yaml`. Surface the offending IDs verbatim. (The verb has a legacy `--allow-disposition-loss` flag from its .husky-era days, but the skill body does NOT use it at session-end — per `enforcement-lives-in-skills.md` § "a `--no-verify` push by the maintainer is evidence the hook chain is broken," the cure path is reconciling the dispositions, not bypassing the check.)

   Then scan the workplan's session-introduced diff for bare TBD / defer / follow-up / wontfix markers that didn't get scoped into an issue. The hygiene helper in Step 6 already enumerates these; re-surface as a STOP if any markers exist without a paired `#NNN` issue reference. The cure path: file the issue, paste the link inline, then re-run session-end.

   Finally, refuse session-end when audit-log entries remain with `Status: open` AND those entries are NOT scoped into the workplan as the next-N fix-tasks:

   ```bash
   dw-lifecycle check-open-findings --feature <slug>
   ```

   Exit 0 (zero open OR scoped-as-next) = continue. Exit 1 = STOP per Step 2's refusal-mode taxonomy in the implement skill.

   When `.dw-lifecycle/scope-discovery/` is absent, Step 9 silently skips (scope-discovery is opt-in).

10. Commit all documentation changes:

```
git add <feature-dir> DEVELOPMENT-NOTES.md
git commit -m "docs: session-end <YYYY-MM-DD> [<slug>]"
```

11. Report: commit hash, files changed, journal-entry summary.

## Error handling

- **Uncommitted code changes outside docs.** Skill warns: "There are non-doc changes uncommitted. Commit those separately first to keep the session-end commit doc-only."
- **No commits in session range / no workplan markers / no issues filed.** The hygiene block still emits; each section reports an empty result with a parenthetical note. The block is still appended so the next session-start sees an explicit "no prior recommendation" signal.
- **Closing-discipline refusal (Step 9).** Surface the verb's stderr verbatim; pause session-end until the operator addresses the regression. `check-disposition-survivor` has a legacy `--allow-disposition-loss` flag from its `.husky`-era days, but the skill body does NOT pass it at session-end (per `enforcement-lives-in-skills.md` § "a `--no-verify` push by the maintainer is evidence the hook chain is broken"). The cure path is fixing the underlying state, not bypassing the check. No `--no-verify`-style escape is wired into session-end.
