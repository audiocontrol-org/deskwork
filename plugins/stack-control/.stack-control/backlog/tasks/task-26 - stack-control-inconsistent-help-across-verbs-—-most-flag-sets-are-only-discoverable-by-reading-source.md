---
id: TASK-26
title: >-
  stack-control: inconsistent --help across verbs — most flag sets are only
  discoverable by reading source
status: To Do
assignee: []
created_date: '2026-06-11 00:41'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-450
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
stack-control tooling friction, accumulated across a full adoption session (2026-06-10).

## Symptom

`--help` support is inconsistent across the verb surface:

- `stackctl audit-barrage --help` → rich, accurate flag documentation (exit 0)
- `stackctl roadmap add --help` → `roadmap: unknown flag --help` (exit 2)
- `stackctl backlog capture --help` → `backlog: unknown flag --help` (exit 2)
- `stackctl spec-check --help` → `spec-check: unexpected argument '--help'` (exit ≠0; usage line only by accident of the error)

## Why it matters

For every verb without `--help`, the flag set had to be learned by reading the TypeScript source (`SUBACTION_SPECS` tables in `src/subcommands/*.ts`) — fine for an agent with repo access, a wall for the CLI-first adopter the README promises ("runnable by any agent or human in a plain shell"). Bare-invocation usage errors do print partial grammars, but only one missing piece at a time (`add requires an <identifier> positional` → fix → next error), which makes discovering a full flag set an iterative-failure exercise.

## Suggested fix

Uniform `--help` on every verb and subaction (the audit-barrage implementation is the in-house pattern to replicate), or at minimum have each usage-error print the verb's complete grammar rather than the first unmet requirement.

## Provenance

Hit while learning roadmap add, backlog capture/import-slush, spec-check, and scope-widen interfaces during the design-control port. Filed per the tooling-friction-to-GitHub-issues policy.
<!-- SECTION:DESCRIPTION:END -->
