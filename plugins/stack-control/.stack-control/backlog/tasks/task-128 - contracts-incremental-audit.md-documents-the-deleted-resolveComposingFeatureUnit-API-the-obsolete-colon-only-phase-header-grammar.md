---
id: TASK-128
title: >-
  contracts/incremental-audit.md documents the deleted
  resolveComposingFeatureUnit API + the obsolete colon-only phase-header grammar
status: To Do
assignee: []
created_date: '2026-06-15 00:47'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 128000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
021 phase-6 audit, codex-gpt5 MEDIUM. The incremental-audit contract doc still describes resolveComposingFeatureUnit (removed in the 021 phase-2 audit) and the old '## Phase N:' colon-only grammar (replaced by the digit-led colon/dash/em-dash/bare grammar, T022). Doc-drift introduced by the 021 changes. Update the contract to: (a) describe exclusion-based whole-feature composition in govern.ts (not the deleted inclusion primitive), and (b) the current phase-header grammar. Batch with the other 021 residual fixes (TASK-117,122-127).
<!-- SECTION:DESCRIPTION:END -->
