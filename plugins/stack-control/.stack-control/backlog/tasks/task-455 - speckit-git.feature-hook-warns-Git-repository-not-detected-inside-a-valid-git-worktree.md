---
id: TASK-455
title: >-
  speckit git.feature hook warns 'Git repository not detected' inside a valid
  git worktree
status: To Do
assignee: []
created_date: '2026-07-17 01:43'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - .specify/extensions/git/scripts/bash/create-new-feature.sh
ordinal: 454000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repro: from plugins/stack-control (inside the git worktree at /Users/orion/work/deskwork-work/fleet-control-plane), run the git-extension script: create-new-feature.sh --json --allow-existing-branch --short-name x 'desc'. It prints '[specify] Warning: Git repository not detected; skipped branch creation' and skips branch creation -- while 'git rev-parse --is-inside-work-tree' returns true in that same directory. Surfaced during /stack-control:define for design:feature/fleet-control-plane (specs/036-fleet-control-plane), driving the mandatory before_specify hook. Impact LOW in that instance: we were already on the intended branch, so the skipped creation was a harmless no-op. The defect is that the hook's git detection is silently wrong inside a worktree, so its branch-creation contract is unreliable for any caller that actually depends on it -- it fails open with a warning rather than creating the branch. Suspected cause: the script's detection differs from rev-parse, possibly testing for a .git DIRECTORY, which is a FILE in a linked worktree. Upstream component: github-spec-kit git extension (vendored under .specify/extensions/git/).
<!-- SECTION:DESCRIPTION:END -->
