---
id: TASK-2
title: 'doctor validate.ts exceeds 500-line file-size cap (644 lines after #394)'
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-395
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/395

## Summary

`packages/core/src/doctor/validate.ts` is **644 lines**, over the project's 300–500 line file-size guideline. It was at 529 (the cap boundary) before #394; the multi-site path-resolution fix (#394) pushed it over.

## Why not fixed in the #394 commit

Bundling a structural file-split refactor into a targeted bug-fix commit violates the project's one-fix-per-commit discipline. The #394 fix landed clean and verified; this split is its own task.

## Scope

Extract the artifact-path resolution helpers (`stageArtifactSuffix` / `contentBaseDirs` / `artifactCandidates` / `resolveExistingArtifact`) and/or the per-rule validators into a sibling module under `packages/core/src/doctor/`, keeping the shared `loadSidecars` / `fileExists` / `ValidationFailure` surface coherent. No behavior change; the 546-test core suite + the new `validate-multi-site-paths.test.ts` must stay green.

## Provenance

Surfaced by the #394 implementer dispatch during the 2026-06-02 `/dwi` run; recorded two-track (this issue + the deskwork-plugin workplan Sub-phase 38c).
<!-- SECTION:DESCRIPTION:END -->
