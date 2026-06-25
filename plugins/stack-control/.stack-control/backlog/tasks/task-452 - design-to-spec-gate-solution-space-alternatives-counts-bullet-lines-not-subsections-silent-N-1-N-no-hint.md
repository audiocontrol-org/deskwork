---
id: TASK-452
title: >-
  design-to-spec gate: solution-space-alternatives counts bullet lines, not ###
  subsections (silent N-1/N, no hint)
status: To Do
assignee: []
created_date: '2026-06-25 19:02'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-500
ordinal: 451000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

The `design-to-spec` exit gate's `count-gte solution-space-alternatives 2` criterion counts **bullet lines** (`- ` / `* `) inside the `## Solution space` section of a design record — it does **not** count `### Chosen …` / `### Rejected …` subsection headings. A design record that lists its alternatives as `###` subsections (a natural, readable structure) scores **0** alternatives and the `designing` exit gate sits at N−1/N with the unhelpful line:

```
[ ] count-gte solution-space-alternatives 2
```

There is no hint that the counter wants bullets, so the author has to read `plugins/stack-control/src/workflow/gate-eval.ts` (`countSolutionSpaceAlternatives`) to discover the rule.

## Reproduction

1. `/stack-control:design <item>`; write a design record whose `## Solution space` section presents alternatives only as `### Chosen — (A) …` / `### Rejected — (B) …` subsections with prose (no top-level bullets).
2. Record `design-approved`.
3. `stackctl workflow status <item>` → `designing` shows `6 of 7` (or N−1/N) with `[ ] count-gte solution-space-alternatives 2`, despite the record clearly listing ≥2 alternatives.

`countSolutionSpaceAlternatives` (gate-eval.ts) scans from the `solution-space` heading to the next same-or-higher heading and counts only lines matching `^\s*[-*]\s+\S` — so `###` subsections contribute nothing.

## Impact

A correctly-structured design record fails the gate for a purely cosmetic reason; the failure message gives no clue about the fix. Cost is a code-spelunking detour per author who hits it.

## Possible directions

- Also count `###` subsections within the `solution-space` section as alternatives (or `### Chosen`/`### Rejected` headings specifically).
- Or make the failing-criterion message say what it counts (e.g. "needs ≥2 bullet items under `## Solution space`").
- Or document the bullet-counting convention in the `/stack-control:design` skill body.

## Environment

- stack-control 0.53.0 (deskwork plugin cache), `plugins/stack-control/src/workflow/gate-eval.ts`.
- Surfaced authoring the `design:feature/capture-fidelity` record in `~/work/offing`, 2026-06-23.
<!-- SECTION:DESCRIPTION:END -->
