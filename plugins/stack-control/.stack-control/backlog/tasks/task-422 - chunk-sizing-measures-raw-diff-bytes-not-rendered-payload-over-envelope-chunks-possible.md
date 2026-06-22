---
id: TASK-422
title: >-
  chunk sizing measures raw diff bytes, not rendered payload (over-envelope
  chunks possible)
status: To Do
assignee: []
created_date: '2026-06-22 00:17'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - dogfood-030-2026-06-21-rendered-bytes
ordinal: 422000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
030 dogfood: partitionDiff/binpack measure raw fileDiffs bytes, but the rendered chunk adds preamble/trailer (~14KB) + per-file framing + FR-021 folded out-of-window deps (~20 files/chunk). A chunk ≤envelope by raw measure can render over-envelope. Root cause = TASK-413: the coverage/rendered-aware end-govern-pipeline is unwired; the CLI reuses the raw-byte path. Fix as part of the replatform.
<!-- SECTION:DESCRIPTION:END -->
