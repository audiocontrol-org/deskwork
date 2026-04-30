---
name: review
description: "Delegate code review of recent changes; collate findings"
---

# /dw-lifecycle:review

Delegate review of recent changes to feature-dev's `code-reviewer` agent. Replaces in-house code-reviewer agents — canonical wins per the boundary contract.

## Steps

1. Determine review scope: defaults to commits since branching from `main`; operator may override with `--since <ref>`.
2. Invoke `superpowers:requesting-code-review` to frame the request. Include the workplan reference and any architectural decisions for context.
3. Dispatch `code-reviewer` (from `feature-dev`) with the scope. For substantial changes, dispatch 2–3 reviewers in parallel with different focuses (security, correctness, conventions) via `superpowers:dispatching-parallel-agents`.
4. Apply `superpowers:receiving-code-review` discipline when integrating findings: technical rigor, no performative agreement.
5. Report: findings grouped by severity; what was applied vs. deferred.

## Error handling

- **feature-dev not installed.** Skill exits with: `"/dw-lifecycle:review requires feature-dev. Install: /plugin install feature-dev@claude-plugins-official"`. (Treats feature-dev's reviewer as required for this skill specifically; the broader plugin's "recommended peer" posture has this carve-out.)

(Author's note: revisit this carve-out — if the user prefers a soft-fallback for review, change this skill to print a warning and skip the dispatch.)
