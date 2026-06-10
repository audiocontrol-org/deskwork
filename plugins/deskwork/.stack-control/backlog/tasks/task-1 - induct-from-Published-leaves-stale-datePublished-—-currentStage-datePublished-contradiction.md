---
id: TASK-1
title: >-
  induct from Published leaves stale datePublished — currentStage /
  datePublished contradiction
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-406
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/406

## Summary

`/deskwork:induct` from `Published` to a non-terminal stage leaves the entry's `datePublished` field intact, producing a sidecar that asserts `currentStage: Final` (or `Drafting`, etc.) AND a populated `datePublished` simultaneously. Per `DESKWORK-STATE-MACHINE.md`, `datePublished` is the publish-event stamp; an entry whose `currentStage` is not `Published` should not carry it.

## Repro

1. Entry exists at `currentStage: Published` with `datePublished: 2026-05-26T00:00:00.000Z`.
2. Run `deskwork induct <uuid> --to Drafting --reason "..."` (intent: revoke Final/Published to revise).
3. Sidecar transitions: `currentStage: Published` → `currentStage: Drafting`. `datePublished` unchanged.
4. Approve back to Final: `currentStage: Drafting` → `currentStage: Final`. `datePublished` unchanged.
5. Result: `currentStage: Final` + `datePublished: 2026-05-26T...`. The entry asserts both "not yet published (at Final)" and "published on 2026-05-26" simultaneously.

## Surface

- Sidecar: `.deskwork/entries/<uuid>.json`
- Code path: deskwork induct codepath that handles `fromStage === 'Published'`

## Expected

When inducting away from `Published`, the codepath clears `datePublished` (move it to `priorDatePublished` for audit trail, or drop it; operator design call). An entry whose `currentStage` is not `Published` should not carry `datePublished` as a current-state field.

## Actual

`datePublished` retained verbatim across induct-from-Published transitions. Approve back to Final does not re-stamp it. The contradictory state survives indefinitely.

## Surfaced by

Cross-model audit-barrage finding AUDIT-20260603-25 against the scope-discovery feature's PRD entry (`4e4d6912-3edf-4aeb-b6ed-ba455f362f14`), which was inducted `Published → Drafting → Final` this session.

## Suggested fix shape

In the induct codepath: when `fromStage === 'Published'` and `toStage !== 'Published'`, clear `datePublished` (or rename to `priorDatePublished` to preserve audit trail). The corresponding approve codepath at the Final → Published transition would re-stamp it.
<!-- SECTION:DESCRIPTION:END -->
