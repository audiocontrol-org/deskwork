---
name: dw-lifecycle:issues
description: "Create parent + per-phase GitHub issues from workplan; back-fill issue links"
user_invocable: true
---

# /dw-lifecycle:issues

Create the GitHub tracking issues for a feature: one parent issue + one issue per phase from the workplan.

## Steps

1. Confirm slug. Default repo is detected from `git remote get-url origin`; override with `--repo owner/repo` if needed.
2. Read `workplan.md` to extract phase headings (`## Phase N — <name>`).
3. Shell out:

```
dw-lifecycle issues <slug> [--target <version>] [--repo owner/repo]
```

The helper creates the parent issue, then one issue per phase (referencing the parent in the phase issue body), then back-fills the parent issue number into the README's `<parentIssue>` placeholder.

4. Report: parent issue URL/number, list of phase issue URLs/numbers.

## Error handling

- **`gh` CLI not authenticated.** Surface the gh error verbatim. Operator runs `gh auth login` and retries.
- **Workplan missing.** Stop with `Run /dw-lifecycle:setup first.`
- **Repo not detectable from origin.** Surface the parsed URL and ask operator to pass `--repo` explicitly.
