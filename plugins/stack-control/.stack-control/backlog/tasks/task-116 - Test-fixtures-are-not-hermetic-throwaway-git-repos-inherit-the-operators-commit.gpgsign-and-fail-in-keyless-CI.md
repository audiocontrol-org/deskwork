---
id: TASK-116
title: >-
  Test fixtures are not hermetic: throwaway git repos inherit the operator's
  commit.gpgsign and fail in keyless CI
status: To Do
assignee: []
created_date: '2026-06-14 19:39'
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
