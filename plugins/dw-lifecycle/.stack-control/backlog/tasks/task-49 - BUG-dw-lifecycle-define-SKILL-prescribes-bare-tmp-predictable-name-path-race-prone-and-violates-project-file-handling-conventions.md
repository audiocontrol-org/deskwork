---
id: TASK-49
title: >-
  BUG: dw-lifecycle:define SKILL prescribes bare /tmp/<predictable-name> path;
  race-prone and violates project file-handling conventions
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-127
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`/dw-lifecycle:define` SKILL.md (`plugins/dw-lifecycle/skills/define/SKILL.md`) Step 4 prescribes:

> 4. Write `/tmp/feature-definition-<slug>.md` from the brainstorming output.

This is a bare `/tmp/<predictable-name>` path. Two problems:

## Problem 1 — race-prone

Two concurrent agent sessions, parallel worktrees, or even rapid sequential invocations on the same slug all collide on the same path. Symptoms: one session's definition silently clobbered by another's, then `/dw-lifecycle:setup` reads the wrong content.

## Problem 2 — violates the deskwork project's own file-handling rule

`.claude/rules/file-handling.md` in this repo explicitly forbids bare `/tmp/<name>` paths and prescribes `mktemp` or in-tree namespaced paths instead:

> Do not write to or read from un-namespaced paths like `/tmp/commit-msg.txt`, `/tmp/check.py`, `/tmp/body.md`. These are shared-namespace and race-prone... The bug pattern is the bare `/tmp/<filename>`. Anything that puts the session ID, PID, or a `mktemp`-generated suffix in the path is fine.

Dogfooding `/dw-lifecycle:define` on this project surfaced the contradiction immediately — the skill prescribes a path the project's rules forbid.

## Suggested fix

Change Step 4 prose to:

> 4. Write a feature-definition file at a unique path (use `mktemp -t feature-definition-<slug>.XXXXXX.md` or write to an in-tree namespaced path like `.dw-lifecycle/.tmp/<slug>.md`). Do NOT use bare `/tmp/<name>` — concurrent sessions or sub-agents will collide.

Then propagate the unique path through `/dw-lifecycle:setup --definition <path>`.

Surfaced during the customize-hooks dogfood (2026-04-30). Workaround used: invoked `mktemp -t feature-definition-customize-hooks.XXXXXX.md` and passed that to `/dw-lifecycle:setup`.
<!-- SECTION:DESCRIPTION:END -->
