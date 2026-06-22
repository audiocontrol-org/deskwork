---
id: TASK-16
title: >-
  stack-control: adopt + document the tooling-friction routing policy —
  upstream-tool defects go to GitHub issues, never the local backlog
status: Done
assignee: []
created_date: '2026-06-10 18:33'
updated_date: '2026-06-22 21:07'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-444
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recovered from #444 (closed NOT_PLANNED during the GitHub->backlog migration, which dropped the body). Detail below is the original issue body; provenance ref gh-444 is in frontmatter.

Policy proposal for stack-control's adopter-facing documentation, from an operator decision made while adopting the regime on the design-control feature (2026-06-10).

## The policy

**Tooling friction — defects in tools a project consumes (stackctl itself, Spec Kit, any upstream) — is filed as a GitHub issue on the tool's repo. The installation-local backlog is reserved for work the installation can actually fix.**

Operator's rationale, verbatim: tooling friction issues should go to GitHub issues, "which is reliably cross-project."

The full intake routing this implies (two tracks, split by who can fix it):

1. **This project's bugs, gaps, and slushed audit findings → the local backlog first** (capture ≠ scope; the operator selects work out of the pile). This half is already documented (README § Backlog slush pile).
2. **Tooling friction → a GitHub issue on the tool's repo.** If the friction was already captured locally before being recognized as upstream, the local item is marked Done with a `filed-upstream` label + the issue URL in its notes — the record survives, the selection queue stays honest.

## Why the backlog is the wrong home for upstream defects

The backlog is documented as "the single burn-down queue" for the installation. An upstream defect is not burnable there: no amount of project work closes it, so each one pollutes the selection queue with unactionable items. Discovered concretely when three stackctl defects (#440, #441, #442) were captured into a consuming project's backlog and had to be re-dispositioned upstream.

This also generalizes where the current docs' intake story does not: `backlog import-github` snapshots the project's OWN issues inward, but nothing in the documented model routes found work that belongs to a DIFFERENT project outward. The dw-lifecycle ancestor handled this with per-feature `tooling-feedback.md` logs + a `tooling-feedback-import` promotion verb — same insight (friction surfaces in the consuming project but is fixed in the tool), resolved monorepo-locally. GitHub issues are the cross-repo generalization.

## Suggested change

Document the routing rule in README § "Backlog slush pile — intake" (it is a fourth intake decision, really an ANTI-intake: what does NOT belong in the pile) and in the `/stack-control:backlog` skill's discipline list — e.g. as discipline 6: "Found a defect in a tool this project consumes? That is not backlog material — file it on the tool's repo and keep moving. The pile only holds work this installation can burn down." Optionally: a `filed-upstream` label convention for re-dispositioned items.

## Provenance

Operator decision during the design-control adoption session; applied precedent in that installation's backlog (TASK-3/4/5 → #441/#440/#442) and codified in its project rules. Companion docs issue: #443.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Fixed 2026-06-22 (commit a53a7bae): tooling-friction routing documented in README backlog-intake + /stack-control:backlog discipline 7 (anti-intake + filed-upstream convention).
<!-- SECTION:NOTES:END -->
