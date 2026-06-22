---
id: TASK-443
title: >-
  govern has no first-class 'audit an arbitrary/non-spec diff' front door —
  barraging a non-spec session diff needs hand-assembled payload
status: To Do
assignee: []
created_date: '2026-06-22 21:07'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 442000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
govern --mode implement is structurally coupled to a spec feature (resolveFeatureSlug/resolveFeatureFromItem require a spec dir + write to that feature's audit-log.md). A point-fix/bookkeeping session diff spans multiple subsystems with no spec and no spec: pointer on its umbrella roadmap node, so govern cannot run on it. To realize 'govern the session diff' (2026-06-22 bookkeeping-hardening session) the operator had to hand-assemble the audit-barrage payload: git diff base..HEAD -> vars.json (7 EXPECTED_VARS keys) -> audit-barrage-render -> audit-barrage --prompt-file. Suggested: a first-class 'govern/barrage an arbitrary diff' entry (e.g. govern --diff-only --diff-base <ref> --feature <label>, or an audit-barrage --diff-base convenience that assembles the payload) so non-spec diffs get the same cross-model audit without manual payload assembly.
<!-- SECTION:DESCRIPTION:END -->
