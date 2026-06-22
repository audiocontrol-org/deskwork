---
id: TASK-423
title: >-
  non-audit trim drops files from chunk set; all-non-audit cluster yields
  dangling SplitClusterMarker
status: Done
assignee: []
created_date: '2026-06-22 00:17'
updated_date: '2026-06-22 17:24'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - dogfood-030-2026-06-21-trim-coverage
ordinal: 423000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
030 dogfood: binpackClusters' oversized-fits-after-trim path makes a chunk of only kept files (trimmed non-audit files vanish, violating data-model 'union of chunk files == changed set'); an all-non-audit oversized cluster yields empty subChunks + a dangling marker (data-model requires subChunkIds length >= 2). The render (payload-implement) does NOT trim, so coverage + size must be reconciled together. Root cause = TASK-413 seam; fix in the replatform (render honors the trim; partition keeps all files covered measuring kept bytes only).
<!-- SECTION:DESCRIPTION:END -->
