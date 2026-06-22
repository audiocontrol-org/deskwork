---
id: TASK-411
title: >-
  030 analyze F1 (MEDIUM): split-file vs split-cluster terminology — entity
  model has only SplitClusterMarker
status: Done
assignee: []
created_date: '2026-06-21 17:57'
updated_date: '2026-06-22 17:24'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - 'specs/030-chunked-end-govern/spec.md:166-219'
ordinal: 411000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
spec.md:166 and 171 name a split-file marker but Key Entities (spec.md:219), data-model (SplitClusterMarker only), every FR and every task define only SplitClusterMarker. The split-file concept has no model/code referent. Paired with C1 (TASK-408): either model split-file as a real entity or remove the wording and state how single-oversized-file is represented.

RESOLVED (operator decision 2026-06-21): removed the split-file wording — there is no split-file case (see TASK-408). SplitClusterMarker (multi-file cluster sub-split, file granularity) is the only oversized representation; a single-file-over-envelope fails loud. spec.md:166 corrected to drop the `split-file` marker; spec.md:171 (multi-file blob cluster) was already correct. Awaiting operator close.
<!-- SECTION:DESCRIPTION:END -->
