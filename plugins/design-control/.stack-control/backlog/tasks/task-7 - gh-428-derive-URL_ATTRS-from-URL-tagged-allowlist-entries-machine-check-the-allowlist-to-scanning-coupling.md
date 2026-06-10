---
id: TASK-7
title: >-
  gh-428: derive URL_ATTRS from URL-tagged allowlist entries (machine-check the
  allowlist-to-scanning coupling)
status: Done
assignee: []
created_date: '2026-06-10 18:09'
updated_date: '2026-06-10 18:38'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed in 74b824cc (with TASK-1): kind-tagged GLOBAL_ATTR_SPECS/TAG_ATTR_SPECS as SSOT; TAG_ATTRS/GLOBAL_ATTRS/URL_ATTRS/URL_ATTR_PAIRS derived. gh-428's enhancement landed.
<!-- SECTION:NOTES:END -->
