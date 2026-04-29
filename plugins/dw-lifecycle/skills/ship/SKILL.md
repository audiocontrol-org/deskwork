---
name: dw-lifecycle:ship
description: "Verify acceptance criteria; open PR; stop at PR creation (operator owns merge)"
user_invocable: true
---

# /dw-lifecycle:ship

Final pre-merge gate. Verify acceptance criteria, run tests, open the PR. **Stops at PR creation.** The operator owns the merge gate per agent-discipline.

## Steps

1. Read the workplan's acceptance criteria from `Phase: Acceptance` (or equivalent).
2. Invoke `superpowers:verification-before-completion`: run the verification commands listed in the workplan and confirm output. Evidence before assertions.
3. Invoke `superpowers:finishing-a-development-branch` to handle the PR creation flow.
4. Open the PR via `gh pr create`. Title format: `feat(<slug>): <one-line summary>`. Body references the parent issue.
5. **Stop.** Report PR URL. Do NOT merge. The operator decides when to merge.

## Error handling

- **Verification fails.** Stop. Surface the failing verification step. Iterate until verification passes; do not push to PR with known failures.
- **Tests fail.** Same — stop and iterate. Tests passing is non-negotiable for ship.
