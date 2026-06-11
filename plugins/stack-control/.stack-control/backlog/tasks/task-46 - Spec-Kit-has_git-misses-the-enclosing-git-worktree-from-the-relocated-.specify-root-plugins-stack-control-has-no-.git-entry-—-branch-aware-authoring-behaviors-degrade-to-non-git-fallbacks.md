---
id: TASK-46
title: >-
  Spec Kit has_git() misses the enclosing git worktree from the relocated
  .specify root (plugins/stack-control has no .git entry) — branch-aware
  authoring behaviors degrade to non-git fallbacks
status: To Do
assignee: []
created_date: '2026-06-11 07:06'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during specs/installation-isolation T017/T020: after relocating .specify into the installation, setup-plan.sh reports HAS_GIT=false (has_git checks for .git at the .specify root, but the installation is a subdir of the worktree). feature.json-driven resolution is unaffected; branch validation and git-based feature numbering silently take their non-git fallbacks. Affected: .specify/scripts/bash/common.sh has_git()/get_repo_root consumers.
<!-- SECTION:DESCRIPTION:END -->
