---
id: TASK-26
title: >-
  dw-lifecycle session-start/session-end: helper-subcommand availability check +
  actionable error (canary #349 §3b)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-351
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`/dw-lifecycle:session-end` and `/dw-lifecycle:session-start` reference helper subcommands (`session-end-hygiene` and `session-start-recommendation`) that aren't always present in the installed `dw-lifecycle` CLI. When the gap exists, the skill fails with a generic `Unknown subcommand` error — leaving the operator to manually run `/reload-plugins` without a clear pointer to the root cause.

Surfaced in #349 § 3b — Polish-level friction item.

## Failure shape

1. Operator invokes `/dw-lifecycle:session-end`.
2. The skill dispatches to `dw-lifecycle session-end-hygiene ...`.
3. CLI: `Unknown subcommand: session-end-hygiene`.
4. Operator pieces together that their plugin cache is out-of-sync with the version expected by the skill.
5. Operator runs `/reload-plugins`. Skill works.

This is a UX failure, not a functional one. The skill IS calling the right subcommand; the installed CLI is just stale. But the error message gives the operator no signal about what to do.

Same shape observed at `/dw-lifecycle:session-start`'s call to `session-start-recommendation`.

## Spec for the fix

### Light: skill checks for helper availability + surfaces actionable error

Before dispatching to the helper subcommand, the skill runs `dw-lifecycle --help` (or `dw-lifecycle <helper> --help` and checks exit code). On absence:

```
/dw-lifecycle:session-end requires `dw-lifecycle session-end-hygiene`,
but your installed CLI doesn't have that subcommand.

Your dw-lifecycle plugin cache is likely out of sync. Run:
  /reload-plugins

Then re-invoke /dw-lifecycle:session-end.
```

Tiny change in each skill's SKILL.md helper script. Closes the UX gap without touching the CLI.

### Medium: dw-lifecycle CLI grows a version-introspection subcommand

`dw-lifecycle version` (or `dw-lifecycle --version`) reports the installed plugin manifest version. Skills then probe + compare expected vs. installed, surfacing the actionable error with the diff. Generalizes beyond just "subcommand missing" — covers "subcommand present but contract-changed."

### Heavy: version-pinning in skill metadata

Each skill declares a `min_dw_lifecycle_version` in its SKILL.md frontmatter. The skill dispatcher (the part of Claude Code that loads SKILL.md and invokes Bash) reads the metadata + warns when the installed version is below the minimum. Out of scope for the plugin itself — depends on Claude Code's plugin loader.

Canary's recommendation: **Light**. The fix lives in the affected skills; it doesn't require new CLI surface; the actionable error is the user-facing improvement.

## Impact

- Polish-level friction; ~1 minute per occurrence
- Affects session-end + session-start across every project using the hygiene skill family
- Surfaces specifically after plugin upgrades (the install path doesn't auto-reload the cache for already-running Claude Code sessions)

## Acceptance criteria

- [ ] `/dw-lifecycle:session-end` checks for `session-end-hygiene` availability before dispatch
- [ ] `/dw-lifecycle:session-start` checks for `session-start-recommendation` availability before dispatch
- [ ] On absence: surface the actionable error with the `/reload-plugins` recommendation
- [ ] Tests via fixture project tree with deliberately-stale CLI

## Cross-references

- Dogfood source: #349 § 3b
- Related: hygiene feature (the helper subcommands are landing as part of the hygiene Phase 6 lifecycle-integration work)
<!-- SECTION:DESCRIPTION:END -->
