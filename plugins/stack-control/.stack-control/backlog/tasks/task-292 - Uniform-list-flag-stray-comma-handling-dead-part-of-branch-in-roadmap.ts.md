---
id: TASK-292
title: Uniform list-flag stray-comma handling + dead --part-of branch in roadmap.ts
status: To Do
assignee: []
created_date: '2026-06-19 04:26'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 292000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Flag-parsing consistency surfaced by 027 phase-6 govern: --children and --part-of now fail loud on empty/stray-comma ids, but --depends-on (add) and --into (decompose) handle it asymmetrically (--depends-on fails via referential-integrity validation with a less-clear message; --into silently filters). Unify them to the explicit empty-id guard. Also remove the dead partOf.length===0 branch in addInputFrom (split never yields a 0-length array; the some-empty check covers the single-empty case). Low-stakes hygiene; deferred to avoid re-triggering the TASK-289 shared-file staleness cascade mid-feature.
<!-- SECTION:DESCRIPTION:END -->
