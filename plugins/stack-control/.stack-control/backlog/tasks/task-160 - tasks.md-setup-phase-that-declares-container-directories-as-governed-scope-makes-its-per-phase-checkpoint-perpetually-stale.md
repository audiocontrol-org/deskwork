---
id: TASK-160
title: >-
  tasks.md setup-phase that declares container directories as governed scope
  makes its per-phase checkpoint perpetually stale
status: Done
assignee: []
created_date: '2026-06-18 01:24'
updated_date: '2026-06-22 16:11'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 160000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
extractScopedPaths (incremental-audit.ts) pulls any tasks.md backtick span containing a slash as a governed path, then strips the trailing slash — so a setup-phase task that names a DIRECTORY (e.g. src/capability/, src/__tests__/capability/) records that directory in the phase checkpoint's governedPaths and fingerprints the directory's CONTENTS. Every later phase that adds a file into that directory changes the fingerprint, so the setup phase's checkpoint goes 'stale' and the next phase's per-phase govern refuses with 'cannot advance until earlier required checkpoints are current'. Hit during 026: T001 declared src/capability/ + src/__tests__/capability/, phase-1 governed clean, then phase-2 added registry.ts/identity.ts into src/capability/ and phase-2 govern refused on stale phase-1. Two fixes wanted: (1) the /stack-control:define tasks-generation guidance (and a checklist/analyze rule) should scope a setup phase to CONCRETE FILES only, never container directories later phases fill; (2) govern's phase fingerprint could treat a directory token as 'the files this phase actually created' (auditedFiles, already recorded) rather than the live directory contents. Recovery used: reshape tasks.md T001 to drop the directory tokens (keep only the fixture file), re-govern phase 1, then phase 2. Related: TASK-87 (overlapping governed paths unstable), TASK-97.
<!-- SECTION:DESCRIPTION:END -->
