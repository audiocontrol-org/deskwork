---
name: complete
description: "Move docs to <complete-dir>; update ROADMAP; close issues"
---

# /dw-lifecycle:complete

Mark a feature complete. Runs ON the feature branch BEFORE merge. Moves docs to the complete-status directory, updates ROADMAP, closes related issues.

## Steps

1. Confirm slug and target version (read from feature's README/PRD frontmatter).
2. Read `<feature-dir>/README.md` to find the parent issue + phase issue numbers.
3. Shell out to the helper to move docs:

```
dw-lifecycle transition <slug> --from inProgress --to complete --target <version>
```

4. Update `docs/<version>/ROADMAP.md` (if present) — append a row for this feature in the COMPLETE section.
5. Close the parent + phase GitHub issues:

```
gh issue close <number> --comment "Completed in feature/<slug>; see <feature-dir>/README.md for the implementation summary."
```

6. Commit the doc-tree move and ROADMAP update.
7. Report: new docs path, issues closed, commit hash.

## Error handling

- **Feature not in inProgress.** Helper's transition errors out. Surface and stop.
- **gh close fails.** Surface and stop; doc moves stay (idempotent transition handles re-run).
