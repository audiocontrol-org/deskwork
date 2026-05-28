---
name: complete
description: "Move docs to <complete-dir>; update ROADMAP; close issues"
---

# /dw-lifecycle:complete

Mark a feature complete. Runs ON the feature branch BEFORE merge. Enforces the pre-merge TBD gate, moves docs to the complete-status directory, updates ROADMAP, closes related issues.

## Steps

1. Confirm slug and target version (read from feature's README/PRD frontmatter).
2. Read `<feature-dir>/README.md` to find the parent issue + phase issue numbers.
3. **Pre-merge TBD gate.** Scan the closing feature's `workplan.md` for bare TBD markers (TBD / defer / follow-up / out-of-scope) with no `[debt: #NNN]` back-link AND no inline `(wontfix: <reason>)` clause:

```
dw-lifecycle complete-gate --slug <slug> --workplan <feature-dir>/workplan.md
```

   On refusal (any bare TBD found), the helper prints the bare-TBD locations to stderr and exits 2. Suggested remediation: `dw-lifecycle promote-deferrals propose --workplan <feature-dir>/workplan.md` to promote each marker to a tracked issue, or annotate inline with `(wontfix: <substantive reason ≥40 chars>)`.

   **Override** (operator sign-off required). Add `--skip-tbd-gate --reason "<substantive text ≥40 chars>"`. The reason is validated through the substantive-reason validator (≥40 chars, no gaming phrases). When the override fires, also pass `--journal-override-file <path>` to emit the override entry markdown; append it via `dw-lifecycle journal-append --file <path>` so the override reason lives in `DEVELOPMENT-NOTES.md` under `### Hygiene override`.

4. Shell out to the helper to move docs:

```
dw-lifecycle transition <slug> --from inProgress --to complete --target <version>
```

5. Update `docs/<version>/ROADMAP.md` (if present) — append a row for this feature in the COMPLETE section.
6. Close the parent + phase GitHub issues:

```
gh issue close <number> --comment "Completed in feature/<slug>; see <feature-dir>/README.md for the implementation summary."
```

7. Commit the doc-tree move, ROADMAP update, and (if the override fired) the journal-override entry.
8. Report: new docs path, issues closed, commit hash, override reason (if any).

## Error handling

- **Bare TBDs found, no override.** complete-gate exits 2; doc move + ROADMAP + gh close steps DO NOT run. Operator promotes the deferrals via `/dw-lifecycle:promote-deferrals` and re-runs.
- **Override reason rejected by validator.** complete-gate exits 2 with the validator's rejection message. Operator supplies a substantive reason and re-runs.
- **Feature not in inProgress.** Helper's transition errors out. Surface and stop.
- **gh close fails.** Surface and stop; doc moves stay (idempotent transition handles re-run).
