---
id: TASK-12
title: >-
  stack-control: audit-barrage-lift merges distinct-mechanism findings under one
  ID, documents only one (systematic)
status: To Do
assignee: []
created_date: '2026-06-10 18:33'
updated_date: '2026-06-10 21:20'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-440
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recovered from #440 (closed NOT_PLANNED during the GitHub->backlog migration, which dropped the body). Detail below is the original issue body; provenance ref gh-440 is in frontmatter.

stack-control tooling friction, surfaced while dogfooding the stack-control regime on the design-control feature (2026-06-10).

## Symptom

`stackctl audit-barrage-lift` (inherited from dw-lifecycle's verb) merges DISTINCT findings under one audit-log ID but documents only one of them. Observed twice in a row (systematic, not a one-off):

- Run `20260605T181608913Z-design-control`: 9 structured findings (claude-01..06, codex-01..03) collapsed to 4 audit-log entries. AUDIT-20260605-01's Finding-ID line reads `(claude-01 + claude-03 + claude-04 + codex-01 + codex-03; cross-model)` — five distinct findings (EngineMethod single-sourcing, preflight remedy hardcoding, duplicated confidence check, method/envelope type-binding, deferral language) merged into one entry whose body describes ONLY the EngineMethod issue.
- Run `20260606T060403205Z-design-control`: again five distinct findings under one ID; body describes only the data-uri over-rejection. The other four are distinct mechanisms at the same surface: precedence/mislabel, scheme-regex boundary, mixed-rel `<link>` bypass (real MED), control-char scheme obfuscation (real MED).

## Why it matters

A fixer reading only the merged entry's body fixes one of five real defects and marks the entry `fixed`, silently dropping the other four. The cross-model agreement signal is being used as a merge key when the findings agree on SURFACE but differ on MECHANISM.

## Workaround used

Read the raw per-model `claude.md`/`codex.md` from the run-dir, fix all underlying findings, split the merged entry into independently-closeable IDs by hand.

## Suggested fix

Do not fold distinct-mechanism findings even when cross-model at the same surface; merge only same-root-cause findings. (The Medium fix from the TF entry.)

## Provenance

Logged as TF-002 in https://github.com/audiocontrol-org/deskwork/blob/feature/design-control/plugins/design-control/specs/001-design-control/tooling-feedback.md — filed per the new policy: tooling friction goes to GitHub issues (reliably cross-project). Local backlog ref: design-control installation TASK-4.
<!-- SECTION:DESCRIPTION:END -->
