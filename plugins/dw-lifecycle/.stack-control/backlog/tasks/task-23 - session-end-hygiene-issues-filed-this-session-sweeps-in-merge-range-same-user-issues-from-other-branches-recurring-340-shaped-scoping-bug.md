---
id: TASK-23
title: >-
  session-end-hygiene 'issues filed this session' sweeps in merge-range /
  same-user issues from other branches (recurring #340-shaped scoping bug)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-361
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`dw-lifecycle session-end-hygiene`'s **"issues filed this session"** block reports issues that were NOT filed by the current session — it sweeps in issues authored from other branches/sessions by the same GitHub user within a loose time/commit window. The operator (or agent) then has to hand-correct the journal's hygiene block every session-end. This is a recurring **#340-shaped scoping bug** — it has now bitten at least two consecutive deskwork-plugin sessions.

## Repro

```
dw-lifecycle session-end-hygiene --slug deskwork-plugin --session-start-sha <session-start-sha>
```

On the 2026-05-29 Phase 38 burndown session, the block listed:

- `#357`, `#358` — **actually filed this session** (the #232-review residuals), and
- `#355`, `#356`, `#359`, `#360` — **NOT this session's work**: #355/#356 are scope-discovery / Phase-11 / Phase-13 issues and #359/#360 are graphical-entries perf issues, all authored from other branches by the same GitHub user.

The "Next session recommendation (hygiene)" then carries all six into its Triage line, and the "Resume:" line surfaced a stale recommendation unrelated to the session's actual next step.

## Recurrence

The prior deskwork-plugin session's journal (2026-05-29 "Merge sync + Phase 38 bootstrap") already flagged this:

> *"The helper's 'issues filed this session' list is merge-range noise — scope-discovery/hygiene issues from other branches pulled in by the origin/main merge; the #340-shaped calendar-date scoping bug."*

So the workaround (hand-correct the journal block) has been applied twice. The cost is small per-session but compounds: a session-end hygiene block is only trustworthy if its "filed this session" list is actually scoped to the session.

## Root cause (hypothesis)

The detector keys on **(GitHub user + a time/commit window)** rather than on issues the session actually touched. With a long-lived branch + merges from `origin/main`, that window catches issues filed from sibling branches/worktrees by the same user.

## Suggested fix

- **Light:** scope "issues filed this session" to issues whose creation timestamp falls strictly between the session-start SHA's commit time and now **AND** that are referenced (`#NNN`) by a commit in the session range (`<session-start-sha>..HEAD`). Drop the bare same-user-time-window sweep.
- **Medium:** derive the list purely from `#NNN` references in the session's own commit messages (`git log <session-start-sha>..HEAD`), or accept an explicit `--issue NNN` allowlist. The commit range is the authoritative record of what the session touched.

The "Address TBD markers" section has a related but separate noise problem (it lists all pre-existing workplan deferral prose, not markers introduced this session) — worth scoping the same way (markers added in the session diff, not the whole-file scan), but that can be a follow-up.

## Provenance

Surfaced via the deskwork-plugin dogfood tooling-feedback log: `docs/1.0/001-IN-PROGRESS/deskwork-plugin/tooling-feedback.md` TF-001. Promoted to an issue because it's a recurring cross-session pattern (the rule's "promote when it needs explicit triage" trigger).
<!-- SECTION:DESCRIPTION:END -->
