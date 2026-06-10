---
id: TASK-7
title: >-
  gh-428: derive URL_ATTRS from URL-tagged allowlist entries (machine-check the
  allowlist-to-scanning coupling)
status: To Do
assignee: []
created_date: '2026-06-10 18:09'
updated_date: '2026-06-10 18:09'
labels:
  - agent-found
  - 'type:gap'
  - imported-issue
dependencies: []
references:
  - 'gh-428 (https://github.com/audiocontrol-org/deskwork/issues/428)'
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Enhancement imported 2026-06-10 from GH. Machine-check the non-resource direction of the URL_ATTRS invariant by deriving URL_ATTRS from URL-tagged allowlist entries, so an allowlisted URL-bearing attr cannot silently skip value scanning. Companion of TASK-1 (AUDIT-20260606-07), which covers the test-direction gap; this is the structural fix.
<!-- SECTION:DESCRIPTION:END -->
