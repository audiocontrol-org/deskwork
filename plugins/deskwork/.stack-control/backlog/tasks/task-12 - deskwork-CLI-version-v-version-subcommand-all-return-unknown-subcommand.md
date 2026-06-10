---
id: TASK-12
title: >-
  deskwork CLI: --version / -v / version subcommand all return 'unknown
  subcommand'
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-256
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/256

## Symptom

`deskwork --version` exits with:

```
unknown subcommand: --version
Available: add, approve, customize, distribute, doctor, ingest, install, iterate, publish, repair-install, shortform-start
```

The argument parser treats `--version` as a subcommand name and fails. There's no idiomatic way for an operator to ask "which version of @deskwork/cli am I running?" without inspecting `~/.claude/plugins/cache/deskwork/deskwork/<version>/node_modules/@deskwork/cli/package.json` by hand.

## Why this matters

When triaging a friction (like the v0.19.0 calendar regen bug in #247), the first question is always "what version is this?". The bin shim *does* print a one-line install-time banner like `deskwork: installed @deskwork/cli@0.17.1 differs from plugin manifest 0.19.0; reinstalling...` — but that only fires on version-mismatch first-runs. Steady-state invocations are silent about version. An operator filing an issue against deskwork has no quick way to attach the running version.

## Repro

```bash
~/.claude/plugins/marketplaces/deskwork/plugins/deskwork/bin/deskwork --version
# → exit code N; "unknown subcommand: --version"
```

Same on `-v`, `version`, etc.

## Expected

`deskwork --version` (and idiomatic synonyms `-v`, `version`) prints the running `@deskwork/cli` version (and ideally also `@deskwork/core`, `@deskwork/studio` if reachable through the shim's dispatch logic):

```
@deskwork/cli  0.19.0
@deskwork/core 0.19.0
```

Exit 0.

## Fix options

1. **Add a top-level `--version` / `-v` flag** to the CLI dispatcher that reads its own `package.json` and prints version, then exits 0 before the subcommand parser kicks in.
2. **Add a `version` subcommand** that does the same (matches the existing subcommand-list style).
3. **Both.** `--version` flag for `--version`-reflex parity with the rest of the CLI ecosystem; `version` subcommand for completeness.

Option 3 is the right shape; both forms cost almost nothing. Same change applies to `deskwork-studio` and `dw-lifecycle` bin shims for consistency across the suite.

## Surfacing context

Hit during this session's dogfood of the deskwork lifecycle. Tried `deskwork --version` to confirm which @deskwork/cli version was running before filing #247; got "unknown subcommand" and had to walk to `node_modules/@deskwork/cli/package.json` to get the answer.
<!-- SECTION:DESCRIPTION:END -->
