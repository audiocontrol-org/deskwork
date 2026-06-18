---
id: TASK-164
title: >-
  026 capability mediation: verify CLAUDE_CODE_SESSION_ID equals the PreToolUse
  hook payload session_id (marker linchpin spike)
status: To Do
assignee: []
created_date: '2026-06-18 03:32'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 164000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The front-door marker is session-keyed. The skills write it with --session $CLAUDE_CODE_SESSION_ID (the agent shell env var); the interceptor reads payload.session_id from the PreToolUse hook stdin. If these two strings are NOT identical, enter writes one key and the interceptor reads another → the skill's own sanctioned backend call is REFUSED. The empty-session guard (front-door + mediate-check reject empty --session) is in; the EQUALITY is unverified. The T002 spike (which would have captured a live payload to compare) was harness-blocked. Note CLAUDE_CODE_CHILD_SESSION=1 in sub-agent sessions — the child's env var may differ from the parent payload session_id. Spike: in a live installed session, log payload.session_id (from a probe hook) AND $CLAUDE_CODE_SESSION_ID and assert equality, in both a top-level and a sub-agent session. This is the T018/T015 live acceptance gate; until it passes, skill-surface mediation via the marker is docs-derived not proven. Found: 026 Phase-3 govern, AUDIT-BARRAGE-claude-03/codex-02.
<!-- SECTION:DESCRIPTION:END -->
