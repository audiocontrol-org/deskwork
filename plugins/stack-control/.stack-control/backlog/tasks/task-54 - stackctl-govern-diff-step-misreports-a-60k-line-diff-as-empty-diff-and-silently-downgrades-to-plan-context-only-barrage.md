---
id: TASK-54
title: >-
  stackctl govern: diff step misreports a 60k-line diff as 'empty diff' and
  silently downgrades to plan-context-only barrage
status: Done
assignee: []
created_date: '2026-06-12 06:26'
updated_date: '2026-06-22 17:24'
labels:
  - 'type:imported-issue'
  - bug
  - promoted
dependencies: []
references:
  - gh-463
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`stackctl govern --mode implement` printed `govern: empty diff against 0391a0c0 — running barrage over the plan context only (edge case; no defects expected)` while the actual diff was **43 files / 60,935 insertions** (`git diff 0391a0c0..HEAD --stat`). The barrage lanes nonetheless audited the full diff (the claude lane's report opens with "I walked the full diff against 0391a0c0…"), so the run produced real findings — but the diff-step message is wrong, and whatever the diff step handed downstream did not match what it claimed.

## Repro

Observed on the design-control plugin installation, 2026-06-11, run `20260611T141406686Z-design-control-after_clarify` (committed under `plugins/design-control/.stack-control/audit-runs/`):

```
cd <deskwork repo root>
plugins/stack-control/bin/stackctl govern --mode implement \
  --repo-root plugins/design-control --feature design-control --diff-base 0391a0c0
```

stderr line 2: `govern: empty diff against 0391a0c0 — running barrage over the plan context only (edge case; no defects expected)`

Meanwhile `git diff 0391a0c0..HEAD --stat | tail -1` → `43 files changed, 60935 insertions(+), 7 deletions(-)`.

Earlier rounds the same day with the SAME flags (runs `20260611T123117674Z`, `20260611T131139811Z`, `20260611T134728627Z`) did NOT print the empty-diff line. The variable that grew between runs is the committed diff size (the later rounds' diffs include committed audit-run dirs, ~40k+ inserted lines in commit 8fad5abe), suggesting the diff step hits a payload cap / buffer limit and misreports overflow as "empty".

## Why it matters

1. The message is the operator's only visibility into what the barrage judged. "Empty diff" on a 60k-line diff is a false statement about the audit's scope — if the lanes had NOT recovered by diffing themselves, the gate would have judged the wrong payload while claiming convergence.
2. Likely interacts with the already-filed payload-compounding issue (committed run dirs re-enter the next round's diff; see AUDIT-20260611-13).

## Suggested fix

- Make the diff step fail loud (or report "diff truncated at N bytes") instead of reporting empty when a subprocess buffer/limit overflows.
- Consider excluding the configured audit-runs dir from the governed diff payload (the run artifacts are the protocol's own output, not the work under audit).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/021-audit-protocol-friction-burndown
<!-- SECTION:NOTES:END -->
