---
id: TASK-57
title: >-
  stackctl govern: audited diff includes .stack-control/audit-runs/** — payload
  compounds recursively each round
status: To Do
assignee: []
created_date: '2026-06-12 06:26'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-459
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What

The diff `stackctl govern` audits includes the installation's own `.stack-control/audit-runs/**` artifacts (committed in-range or untracked-and-folded). Each governance round therefore appends its predecessor's full `PROMPT.md` — which itself embeds the round before it — so the payload **compounds recursively** every round.

Observed in the design-control nested installation: run `20260611T062812148Z`'s payload contained run `20260611T062218157Z`'s PROMPT.md (~3757 lines), which embedded run `20260611T055621128Z`'s full PROMPT.md (~859 lines), which embedded the original feature diff — three levels of self-quotation.

## Why it matters

- Payload growth is monotonic per round; model lanes hit timeouts / zero-byte failures at the next size doubling regardless of `timeout_seconds` (the claude 300s→900s bump treats the symptom; the recursion is the generator).
- Auditor attention is diluted across thousands of lines of self-quotation about prior audits instead of work product.
- Cross-model fleet degradation from oversized payloads is the same failure mode as deskwork issue 447.

## Suggested fix

Exclude `.stack-control/audit-runs/` (and governance bookkeeping generally) from the governed diff via pathspec — the audited diff should be scoped to work product, not meta-artifacts about the audit.

Provenance: design-control feature audit-log AUDIT-20260611-13, run-dir `plugins/design-control/.stack-control/audit-runs/20260611T062812148Z-design-control-after_clarify`.
<!-- SECTION:DESCRIPTION:END -->
