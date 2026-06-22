---
id: TASK-420
title: >-
  022 fence grammar: additive closeable field invisible to TS at non-updated
  call sites
status: To Do
assignee: []
created_date: '2026-06-22 00:06'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - dogfood-030-2026-06-21-fence-closeable
ordinal: 420000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
030 dogfood (chunk run 232422924Z): roadmap-model fenceDelimiter gained an additive 'closeable' field and scopeOf added '&& fence.closeable', but call sites not updated in this diff don't see it and there's no regression test pinning the new behavior. Adjacent to 022, surfaced by the chunk audit.
<!-- SECTION:DESCRIPTION:END -->
