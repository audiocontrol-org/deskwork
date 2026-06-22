---
id: TASK-417
title: >-
  end-govern-pipeline writes WholeFeatureConvergenceRecord the graduate gate
  cannot read
status: To Do
assignee: []
created_date: '2026-06-22 00:06'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - dogfood-030-2026-06-21-record-schema
ordinal: 417000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
030 dogfood (chunk run 233622298Z): end-govern-pipeline.ts writes WholeFeatureConvergenceRecord (chunk-artifacts.ts) but the graduate gate reads GovernConvergenceRecord (via isModeConverged). The shipped CLI path uses runProtocol so the gate IS satisfiable today; this is a latent landmine for when the pipeline object is wired (TASK-413 reuse-vs-replatform seam).
<!-- SECTION:DESCRIPTION:END -->
