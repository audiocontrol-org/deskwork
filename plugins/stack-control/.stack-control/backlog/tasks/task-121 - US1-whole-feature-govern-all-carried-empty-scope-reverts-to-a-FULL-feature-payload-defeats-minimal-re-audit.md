---
id: TASK-121
title: >-
  US1 whole-feature govern: all-carried empty scope reverts to a FULL feature
  payload (defeats minimal re-audit)
status: To Do
assignee: []
created_date: '2026-06-14 20:24'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
021 phase-3 audit, codex-gpt5 HIGH (AUDIT-BARRAGE-codex-02). govern.ts:695-700: when resolveComposingFeatureUnit returns an empty diffScope.files (every phase carried), the CLI sets payloadPathScope = normalizedFiles.length>0 ? normalizedFiles : undefined. In buildImplementVars, undefined == whole-feature pre-015 behavior, NOT 'audit nothing'. So the all-carried case (T010 locks files===[] as the minimal case) silently reverts to a full-feature barrage — the opposite of the composition contract. The explicit safety-net comment ('must never collapse to a no-op') chose this deliberately. Fix depends on the (a)/(b) fork above: if (b), preserve an explicit empty/cross-cutting-only scope end-to-end and teach the protocol what a zero-file after_implement unit means.
<!-- SECTION:DESCRIPTION:END -->
