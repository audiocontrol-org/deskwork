---
id: TASK-129
title: >-
  Whole-feature composition: carrying a phase that names a DIRECTORY hides
  unowned cross-cutting changes under it
status: To Do
assignee: []
created_date: '2026-06-15 01:09'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 129000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
021 after_implement audit, codex-gpt5 HIGH. carriedExclusivelyCurrentFiles correctly refuses to carry a directory shared with a non-current phase (prefix-overlap fix), but when a CURRENT phase owns a directory (e.g. 'src/') with NO overlapping non-current phase, the whole 'src/' is carried (excluded). That also excludes CROSS-CUTTING files under src/ that belong to no phase — so genuinely unaudited cross-cutting changes are hidden from the whole-feature pass. Directory-granular phase ownership + exclusion-based composition is fundamentally in tension: carrying a dir hides unowned files under it; not carrying it re-audits owned-current work. Needs a design decision: expand phase dir-scopes to their actual files before composing, or compute cross-cutting as (changed files) minus (every phase's owned files) and audit that set explicitly rather than via directory exclusion. Relates to TASK-122 (AuditUnit scope contract).
<!-- SECTION:DESCRIPTION:END -->
