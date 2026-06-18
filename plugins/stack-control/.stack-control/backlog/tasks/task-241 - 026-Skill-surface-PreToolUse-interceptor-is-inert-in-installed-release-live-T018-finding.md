---
id: TASK-241
title: >-
  026 Skill-surface PreToolUse interceptor is inert in installed release (live
  T018 finding)
status: To Do
assignee: []
created_date: '2026-06-18 07:07'
updated_date: '2026-06-18 07:14'
labels:
  - agent-found
  - 'type:bug'
  - promoted
dependencies: []
references:
  - specs/026-capability-interface-mediation/quickstart.md Scenario F step 3
ordinal: 241000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Live T018 validation in installed release 0.51.0 (session e5974019). Bash-surface mediation VERIFIED: raw 'backlog' denied with registry redirect; front-door enter then permit then exit then refuse round-trip works; session-id bridge confirmed (marker keyed by CLAUDE_CODE_SESSION_ID is found by the live hook so payload session_id equals CLAUDE_CODE_SESSION_ID); SC-003 no-false-positive confirmed (front-door enter with backlog as an arg permitted). FINDING: invoking a raw speckit-implement via the Skill tool was NOT denied — the skill launched. claude-code-guide confirms via docs that Claude Code does not fire PreToolUse for skill/slash-command invocations (they expand before the tool layer), so the hooks.json 'Skill' matcher is dead config. Confound ruled out: live marker active was empty and the shipped stackctl intercept fed the exact Skill payload returns deny, so the decision logic is correct but bin/intercept is never invoked for skills. Per the spec's own Scenario F step 3 contingency, the Skill-surface guarantee falls to Scenario G (US3 graduate-gate backstop), which IS operational (capability reconcile flags un-governed spec-execution work). Cleanup needed: hooks.json 'Skill' matcher is inert and the PR body overclaims a fixed inert-Skill-matcher; the real gating path for skill invocations needs its own spike (claude-code-guide suggested UserPromptExpansion but hedged on the exact event name). Operator disposition needed: accept the US3-covered limit plus document and remove dead config, OR require the real prompt-expansion gate before close.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** roadmap:design:gap/skill-surface-mediation
<!-- SECTION:NOTES:END -->
