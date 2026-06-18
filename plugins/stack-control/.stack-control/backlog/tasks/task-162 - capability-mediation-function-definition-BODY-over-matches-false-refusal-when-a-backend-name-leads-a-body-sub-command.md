---
id: TASK-162
title: >-
  capability mediation: function-definition BODY over-matches (false refusal)
  when a backend name leads a body sub-command
status: To Do
assignee: []
created_date: '2026-06-18 02:28'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/capability/identity.ts: a function DEFINITION whose body names a backend after a ; — e.g. 'foo() { :; backlog list; }' — splits on ; into segments, and the body segment ['backlog','list'] resolves argv0='backlog' → matchCapability returns the capability → false refusal. Defining a function is not invoking the backend. The def NAME forms ('function backlog {…}', 'backlog() {…}') ARE handled (round 4). The remaining gap is a backend named INSIDE the body. Fixing needs function-body brace-tracking: on a function opener (NAME() or 'function NAME') skip tokens until the matching '}'. Deferred at the round-6 plateau (spec-audit-diminishing-returns) — it is a MEDIUM, rare false-refusal (no US3 backstop, but low frequency: defining a shell function whose body's first post-; command is a fronted backend). Documented in the identity.ts header limitation block. Found: 026 Phase-2 govern round 6, AUDIT-BARRAGE-codex-02. Anchor-unification / parser-hardening follow-on.
<!-- SECTION:DESCRIPTION:END -->
