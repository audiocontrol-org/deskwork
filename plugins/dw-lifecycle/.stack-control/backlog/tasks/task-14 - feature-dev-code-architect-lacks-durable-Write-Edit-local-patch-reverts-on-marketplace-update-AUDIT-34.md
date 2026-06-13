---
id: TASK-14
title: >-
  feature-dev:code-architect lacks durable Write/Edit; local patch reverts on
  marketplace update (AUDIT-34)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-400
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

The `feature-dev:code-architect` subagent ships without `Write`/`Edit` in its tool allowlist, so it cannot persist the blueprint its own description promises. Last session (2026-06-03, Phase 39) it was hand-patched locally to add those tools — but the patch lives only in the local plugin cache + marketplace copy, and **a marketplace update reverts it**. This is a known-degraded state that was recorded as a journal "open thread … when convenient" with no tracking issue, which `agent-discipline.md` ("'Just for now' is bullshit … no will-fix-later deferrals") explicitly forbids. This issue is the disposition that replaces that IOU. Raised by audit-barrage finding AUDIT-20260603-34.

## Why it matters

- A third-party plugin agent silently loses a capability its description advertises whenever the marketplace updates.
- The current fix is invisible and non-durable; the next marketplace refresh re-breaks blueprint persistence with no signal.

## Durable options to evaluate

1. **Project-owned agent** — define a deskwork-owned `code-architect` (or equivalent) under `.claude/agents/` with the correct tool allowlist, so it survives marketplace updates and fresh clones.
2. **agent-discipline rule** — document the limitation + the required tool set so any session re-applies the patch knowingly until (1) lands.
3. Some combination of the above.

## Acceptance criteria

- The architect agent used for deskwork feature blueprints can `Write`/`Edit` to disk durably (survives a marketplace update and a fresh clone).
- The journal/audit "when convenient" deferral is replaced by this issue link.

Source finding: `docs/1.0/001-IN-PROGRESS/deskwork-plugin/audit-log.md` → AUDIT-20260603-34.
<!-- SECTION:DESCRIPTION:END -->
