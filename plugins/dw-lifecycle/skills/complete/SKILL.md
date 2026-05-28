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

4. **Phase-parent closure gate (recommended, not blocking).** Walk the closing feature's GitHub issue tree and propose closure for parent issues whose children are all closed. Two verbs (mirrors the triage-issues batched-proposal pattern):

```
dw-lifecycle complete-parent-closure propose --slug <slug>
# operator reads the markdown table, fills in disposition + closure_comment per row, sets approval
dw-lifecycle complete-parent-closure apply --from-file <path-from-propose-stdout>
```

   The propose step walks three sources (gh title-search, parent timeline, workplan-anchored phase-issue enumeration), unions + dedupes, classifies each candidate parent, drafts a closure comment for the close-* classifications, and writes a JSON proposal file. The apply step reads the filled-in proposal and dispatches one `gh issue close` per approved row.

   The gate is RECOMMENDED, not blocking — if the operator skips it (does not run apply), the skill continues to the doc-move step. Run before the doc-move so the closure trail lands alongside the feature-complete commit.

5. Shell out to the helper to move docs:

```
dw-lifecycle transition <slug> --from inProgress --to complete --target <version>
```

6. Update `docs/<version>/ROADMAP.md` (if present) — append a row for this feature in the COMPLETE section.
7. Close any parent + phase GitHub issues NOT already closed by step 4's batched-proposal cycle:

```
gh issue close <number> --comment "Completed in feature/<slug>; see <feature-dir>/README.md for the implementation summary."
```

8. Commit the doc-tree move, ROADMAP update, and (if the override fired) the journal-override entry.
9. Report: new docs path, issues closed (including the phase-parent closures from step 4), commit hash, override reason (if any).

## Error handling

- **Bare TBDs found, no override.** complete-gate exits 2; doc move + ROADMAP + gh close steps DO NOT run. Operator promotes the deferrals via `/dw-lifecycle:promote-deferrals` and re-runs.
- **Override reason rejected by validator.** complete-gate exits 2 with the validator's rejection message. Operator supplies a substantive reason and re-runs.
- **Feature not in inProgress.** Helper's transition errors out. Surface and stop.
- **gh close fails.** Surface and stop; doc moves stay (idempotent transition handles re-run).
