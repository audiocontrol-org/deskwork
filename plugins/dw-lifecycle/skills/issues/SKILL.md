---

> **RETIRED.** `dw-lifecycle` has been superseded by `stack-control`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

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

## Composed discipline: orchestrator → implementation handoff

This is the last orchestrator-session step. After filing issues, the closing report names the feature worktree path and states that implementation happens in a **separate session** opened against that worktree (`/dw-lifecycle:implement`) — NOT this orchestrator session. The two-session split keeps orchestration context out of implementation. Operator's framing: *"you are the orchestrator, not the implementer."* (Composed from `.claude/rules/agent-discipline.md`, feature `decompose-agent-discipline`.)

## Error handling

- **`gh` CLI not authenticated.** Surface the gh error verbatim. Operator runs `gh auth login` and retries.
- **Workplan missing.** Stop with `Run /dw-lifecycle:setup first.`
- **Repo not detectable from origin.** Surface the parsed URL and ask operator to pass `--repo` explicitly.
