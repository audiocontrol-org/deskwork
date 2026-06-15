---
id: TASK-134
title: >-
  Mechanize the post-release+install resolution cycle — verify a newly-installed
  release and close its resolved open items
status: To Do
assignee: []
created_date: '2026-06-15 20:45'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - >-
    motivated by the 2026-06-15 manual cycle: hand-verified + closed
    TASK-131/132 against installed v0.47.0
ordinal: 134000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make post-release verification and status closure a mechanical ceremony instead of a stamina/discipline-dependent hand process. Motivating moment (2026-06-15): after v0.47.0 installed, we manually (a) diffed v0.46.0..v0.47.0 to find which fix/feat commits referenced which TASK-ids, (b) verified each against the FORMALLY-INSTALLED release (released binary reconcile -> 0 orphans, released protocol.ts carries the fix, full suite passes CLI-less), (c) hand-edited each task file to Done with a Resolution block citing the fixing commit + post-release evidence, (d) advanced roadmap statuses, (e) split residual tooling gaps to new items. Every step was hand-driven and only happened because we remembered to. Desired capability (stack-control-native verb, e.g. stackctl resolve-release / a post-install ceremony): given an installed release version, (1) map the release delta to candidate items — parse fix/feat/close commit subjects for TASK-/issue refs, cross-reference audit-log fixed-<sha> entries, and detect spec dirs whose tasks.md just reached complete; (2) VERIFY each candidate against the installed artifact, not the worktree (run the released binary, roadmap reconcile, run released tests where deps allow, confirm the fix is present in the installed cache) — distinguishing verified-fixed from re-surfacing/did-not-actually-fix; (3) PROPOSE closure (operator owns the transition per the issue-closure discipline), writing the Resolution block + post-release evidence automatically; (4) reconcile + advance roadmap nodes whose specs shipped in the release; (5) report loose ends that did NOT verify, and items with no release backing that must stay open. Composes/relates to existing surfaces rather than duplicating: dw-lifecycle re-audit-fixed-findings (post-release re-audit), close-shipped (pending-verification labeling), complete (pre-merge gate), and stack-control roadmap reconcile + session-end. Honors the project rule: the agent posts evidence; the operator decides closure. Likely a feature-rigor-tier candidate (promote when it earns the full spec-driven treatment).
<!-- SECTION:DESCRIPTION:END -->
