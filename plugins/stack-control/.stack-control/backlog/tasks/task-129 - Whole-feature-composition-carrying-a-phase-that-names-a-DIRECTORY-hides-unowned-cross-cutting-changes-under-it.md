---
id: TASK-129
title: >-
  Whole-feature composition: carrying a phase that names a DIRECTORY hides
  unowned cross-cutting changes under it
status: Done
assignee: []
created_date: '2026-06-15 01:09'
updated_date: '2026-06-15 16:30'
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

## Resolution

<!-- SECTION:RESOLUTION:BEGIN -->
Fixed in `08c0e4b8`. Root cause: the checkpoint recorded only the tasks.md-DECLARED
scope (`governedPaths`, possibly a directory), never the files the phase's audit
actually covered — so at compose time there was no signal to tell "audited under
this directory" from "cross-cutting under this directory" (no pure-compose-time fix
exists). The design decision (operator, git-as-record): record what was actually
audited. Each phase checkpoint now stores `auditedFiles = git diff --name-only
<phaseBase> -- <declaredScope>`, and whole-feature composition carries those EXACT
files via the new `carriedFilesForComposition` — a cross-cutting file under a
current phase's declared directory is not in any `auditedFiles` set, so it is not
carried and is re-audited. The 021 phase-7 shared-ownership protection (drop files
shared with a non-current phase) is preserved; pre-TASK-129 checkpoints lacking
`auditedFiles` carry nothing (conservative re-audit, self-healing on next run).
RED→GREEN unit tests added; full umbrella green (233 files / 1544 tests).
<!-- SECTION:RESOLUTION:END -->

