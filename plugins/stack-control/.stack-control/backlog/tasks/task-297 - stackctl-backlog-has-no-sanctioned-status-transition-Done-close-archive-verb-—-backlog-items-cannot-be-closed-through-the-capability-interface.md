---
id: TASK-297
title: >-
  stackctl backlog has no sanctioned status-transition (Done/close/archive) verb
  — backlog items cannot be closed through the capability interface
status: To Do
assignee: []
created_date: '2026-06-19 07:48'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 297000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
stackctl backlog exposes capture|list|import-github|import-slush|promote but NO verb to transition an item to Done/archive. The Backlog.md backend IS mediated (026 capability interface correctly refuses a direct backlog-CLI call), so there is no sanctioned path to close a completed backlog item at all — e.g. TASK-295 stayed 'To Do' after its roadmap node (impl:fix/govern-clone-step-language-agnostic) was advanced to shipped and validated live in 0.51.3. Either add a 'backlog done <id>' / 'backlog set-status' subaction to the mediated interface, or define the sanctioned closure path (roadmap-node-shipped auto-closes its ref: backlog item?). Surfaced 2026-06-19 closing out TASK-295.
<!-- SECTION:DESCRIPTION:END -->
