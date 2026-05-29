---
name: session-end
description: "Append journal entry; update feature docs; commit documentation changes"
---

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
9. Commit all documentation changes:

```
git add <feature-dir> DEVELOPMENT-NOTES.md
git commit -m "docs: session-end <YYYY-MM-DD> [<slug>]"
```

10. Report: commit hash, files changed, journal-entry summary.

## Error handling

- **Uncommitted code changes outside docs.** Skill warns: "There are non-doc changes uncommitted. Commit those separately first to keep the session-end commit doc-only."
- **No commits in session range / no workplan markers / no issues filed.** The hygiene block still emits; each section reports an empty result with a parenthetical note. The block is still appended so the next session-start sees an explicit "no prior recommendation" signal.
