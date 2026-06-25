---
id: TASK-116
title: >-
  Test fixtures are not hermetic: throwaway git repos inherit the operator's
  commit.gpgsign and fail in keyless CI
status: Done
assignee: []
created_date: '2026-06-14 19:39'
updated_date: '2026-06-25 19:53'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
~20 test files (govern integration + session + scope-discovery) create throwaway tmpdir git repos with init+commit but do not disable signing. With a global commit.gpgsign=true (operator setup), these fixtures require an unlocked gpg key and fail in any keyless CI environment with 'gpg failed to sign the data'. Found during 021 burndown when the gpg-agent cache expired mid-session. Fixed the shared _isolation-harness.ts (commit.gpgsign=false + tag.gpgsign=false on fixture repos) but the inline git helpers in govern-orchestration, govern-loop-driver, govern-unresolvable-root, govern-payload-* , and tests/session/* still inherit signing. Add a shared hermetic-git test helper (init + no-sign config) and route all fixture repos through it.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Fixed on feature/stack-control-hygiene (commit 28c62033): vitest hermetic git harness (GIT_CONFIG_GLOBAL/SYSTEM -> checked-in hermetic.gitconfig, gpgsign off) makes every throwaway-repo fixture keyless-CI safe; RED-first hermetic-git-fixtures.test.ts; full suite 414 files/2626 tests green.
<!-- SECTION:NOTES:END -->
