---
id: TASK-16
title: >-
  deskwork iterate: add --auto-dispositions=<value> to skip the
  temp-dispositions-file dance
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - gh-226
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/226

## Friction

`/deskwork:iterate` requires the agent to write a temp `dispositions.json` mapping each unresolved comment ID to `{ "disposition": "addressed" | "deferred" | "wontfix" }`, then pass `--dispositions <path>` to the CLI. The agent has to:

1. Query the studio's `/api/dev/editorial-review/entry/:entryId/annotations` to enumerate unresolved comments.
2. Decide a disposition per comment.
3. Write a temp JSON to `.git-iterate-dispositions.tmp.json` (or similar).
4. Pass `--dispositions <path>`.
5. Delete the temp file.

Steps 1–5 happen on every iterate. The temp file's only purpose is shuttling commentId → disposition through `argv`. This is a real iterate-loop tax: ~5 extra tool calls per iteration cycle.

## Repetition pattern observed

This branch's dogfood arc had 8+ iterate calls (PRD v2/v3, audit doc v1/v2/v3, walk script v1, workplan v1) — each with the same dance. Cumulative friction: ~40 extra tool invocations + commit-trace noise from temp-file create/delete.

## Suggestion

Add a flag to `deskwork iterate` that auto-resolves dispositions from the studio's annotation API:

```
deskwork iterate --auto-dispositions=addressed <slug>
```

Behavior:

- Read all unresolved comments for the entry directly from the journal/sidecar (same source as the studio API).
- Apply the named disposition to all of them (`addressed` is the typical case; `deferred` and `wontfix` could also be supported).
- Skip the temp-file dance entirely.

Trade-off: agent loses per-comment disposition control with `--auto-dispositions=<single-value>`. For most iterate cycles the disposition IS uniform (everything the agent rewrote → `addressed`); for the rare mixed case the existing `--dispositions <path>` still works.

Could combine: `--auto-dispositions=addressed --dispositions <path>` — apply auto first, then override per-comment from the file. Or just keep them mutually exclusive for simplicity.

## Why filing

Per the capture-over-scope rule: this isn't a bug; it's UX friction observed during real dogfood. Filing for tracking even though it's an enhancement, not a defect.

## Disposition

Out-of-scope for the current open-issue-tranche-cleanup branch (Phase 10 is bug-focused, not enhancements). Tracked here for a future iterate-UX-polish pass.
<!-- SECTION:DESCRIPTION:END -->
