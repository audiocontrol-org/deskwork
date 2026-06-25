---
id: TASK-450
title: >-
  govern convergence-record: headSha stored as symbolic 'HEAD' + rounds:1
  contradicts multi-round range — and the record is self-audited every round
status: Done
assignee: []
created_date: '2026-06-25 19:02'
updated_date: '2026-06-25 20:24'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-502
ordinal: 449000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

The cross-model audit-barrage, run via `stackctl govern --mode implement`, audits the **committed
working tree** of the feature — which includes `stackctl`'s OWN governance convergence record
(`.stack-control/govern/convergence/<item>.json`). Two structural defects in how that record is
written cause the barrage to flag the record **every round**, so a govern loop driven purely by
fixing the *feature* can never converge to clean — the audit keeps finding the same two issues in
the harness's own artifact.

## The two defects (both cross-model agreement, HIGH)

1. **`"headSha": "HEAD"` — a symbolic ref, not a resolved SHA.**
   The record pins the base concretely (`"governedShaBase": "1a93fd1"`) but stores the head as the
   literal string `"HEAD"`. The moment another commit lands, `HEAD` no longer resolves to the commit
   the run actually covered. A committed audit artifact whose job is "what range was governed?" is
   non-reproducible. Fix: resolve and store the abbreviated/40-char SHA of HEAD at govern time,
   symmetric with `governedShaBase`.

2. **`"rounds": 1` contradicts the governed commit range.**
   With `--ceiling 1`, each `govern` invocation records `"rounds": 1`, but a multi-invocation
   fix→re-govern loop produces a commit range spanning several rounds (e.g. `…resolve govern
   findings`, `…resolve round-2 govern findings`). A downstream consumer (`re-audit-fixed-findings`,
   a release gate) reading `rounds: 1` + open `liftedFindings` would conclude earlier rounds never
   ran. The record reflects only the latest invocation, not the cumulative converged state.

## Why it matters

The barrage including the harness's own freshly-written record means these two findings re-surface
on every re-govern regardless of feature changes — a structural non-convergence. They are not
defects in the audited *feature*; they are defects in the governance record format/writer.

## Suggested fixes

- Resolve `headSha` to a concrete commit SHA at write time.
- Either make `rounds` cumulative across invocations for the same governed item, or document that it
  is per-invocation and have consumers treat the record as the latest-state snapshot.
- Consider excluding `.stack-control/govern/**` (the harness's own outputs) from the audited payload,
  so the barrage audits the feature, not its own bookkeeping.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Fixed on feature/stack-control-hygiene (commit eddcfdb4): resolveHeadSha pins the record's headSha to a concrete SHA (base..final-HEAD); .stack-control/govern excluded from the audited diff (root fix for self-audit non-convergence); rounds documented per-invocation. RED-first payload-diff-scope.test.ts; full suite 415/2641 green. gh-502 open pending release verification.
<!-- SECTION:NOTES:END -->
