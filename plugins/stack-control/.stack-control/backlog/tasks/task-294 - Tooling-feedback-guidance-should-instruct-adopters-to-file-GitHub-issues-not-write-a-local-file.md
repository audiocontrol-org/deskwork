---
id: TASK-294
title: >-
  Tooling-feedback guidance should instruct adopters to file GitHub issues, not
  write a local file
status: Done
assignee: []
created_date: '2026-06-19 05:05'
updated_date: '2026-06-21 03:14'
labels:
  - 'type:imported-issue'
  - documentation
  - enhancement
dependencies: []
references:
  - gh-488
ordinal: 294000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

The tooling-feedback convention, as it reaches adopters, tells them to **write friction into a local `tooling-feedback.md` file in their own repo**. That file lives in the adopter's project and is never seen by the stack-control / deskwork team, so adopter-discovered friction never reaches the maintainers. The guidance should instead instruct adopters to **file a GitHub issue against `audiocontrol-org/deskwork`** (optionally keeping a local pointer to the filed issue).

## Why this matters

- A local markdown file is invisible to upstream: the people who can fix the tooling never receive the signal.
- It silently turns "report this friction to the team" into "park it in a file in your repo," which reads as *filed* but isn't. (Concretely: in a recent `/stack-control:execute` session, real `customer-blocking` governance friction was captured only in a local `tooling-feedback.md` and would never have reached the team without the operator explicitly asking for a GitHub issue.)
- Adopters are exactly the population whose friction is most valuable (they exercise the public install path), and exactly the population a local file fails to surface.

## Current behavior

The practiced convention (e.g. as carried in session-end / lifecycle skills and reflected in adopter repos) appends friction to a project-local `tooling-feedback.md`. There is no instruction to open an upstream issue.

## Proposed change

- Update the tooling-feedback guidance (the relevant skill bodies / docs that tell an agent to "capture tooling friction") to instruct: **file a GitHub issue against `audiocontrol-org/deskwork`** with the diagnosis/repro/proposed-fix, using `gh issue create`.
- Optionally keep a lightweight local pointer (a line in `tooling-feedback.md` linking to the filed issue URL) so the adopter retains a local trail — but the issue, not the file, is the system of record.
- Consider labeling adopter-filed issues (`customer-blocking` already exists for adopter-path blockers).

## Acceptance

An adopter following the documented tooling-feedback flow ends up with a GitHub issue on `audiocontrol-org/deskwork`, not just a local file the team never sees.
<!-- SECTION:DESCRIPTION:END -->
