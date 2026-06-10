---
id: TASK-13
title: >-
  core/approve: Final → Published transition refused; spec says approve is
  universal
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-246
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/246

## Summary

The `approveEntryStage` helper in `packages/core/src/entry/approve.ts` refuses Final → Published with the error message *"Final → Published uses `publish`, not `approve`"*. The skill prose at `plugins/deskwork/skills/approve/SKILL.md` and `DESKWORK-STATE-MACHINE.md` Commandment II both declare approve **universal** across every linear-pipeline transition including Final → Published. The dashboard's v0.20 row-affordance redesign surfaces the discrepancy more clearly: the Final-row inline chip is labeled `approve →` with title `advance this entry to Published` and clipboard-copies `/deskwork:approve <slug>`. When the operator pastes that into their Claude Code session, the agent dispatches `deskwork approve <uuid>` which throws.

The bug is pre-existing — the v0.19 dashboard also clipboard-copied `/deskwork:approve` for Final-stage rows (per `packages/studio/test/dashboard.test.ts` line 167: `expect(r.html).toMatch(/\/deskwork:approve[^"]*ready-to-publish/)`). v0.20's redesign didn't introduce the bug; it just made it more visible.

## Root cause

Two coupled gaps in `packages/core/src/schema/entry.ts` + `packages/core/src/entry/approve.ts`:

1. `nextStage('Final')` returns `null` per the Phase 0.2 inventory (marked with comment `publish, not approve`). It should return `'Published'` per Commandment II.
2. `approveEntryStage` explicitly refuses Final because of (1) and the historical separation of approve / publish.

Both gaps are coupled with the deferred **public-versioning implementation** from Phase 0.2 inventory: per Commandment IX, every Final → Published transition must assign a public version. Without version assignment, Final → Published is incomplete.

## Options

**Option A (per-spec, full fix)** — implement version assignment + change `nextStage('Final')` → `'Published'` + remove the Final-refusal branch in `approveEntryStage`. Couples with the deferred public-versioning work (default monotonic-int scheme per Phase 0.2 spec). This is the right fix per the spec but it's a feature, not a bug fix.

**Option B (workaround)** — change `packages/studio/src/pages/dashboard/affordances.ts` to clipboard-copy `/deskwork:publish <slug>` for Final-stage rows. Label stays `approve →` to preserve operator's mental model. The skill prose / spec still claim approve is universal but the dashboard routes around the core gap.

## Recommendation

Option A. The version-assignment work is already in the Phase 0.2 inventory; bundle this issue's fix into that work. Until then, document the friction in the affordances comment.

## Reproduction

```bash
# Set up a Final-stage entry
echo '{"uuid":"550e8400-e29b-41d4-a716-446655440099","slug":"ready","title":"Ready","keywords":[],"source":"manual","currentStage":"Final","iterationByStage":{}}' > /tmp/sidecar.json

# Try approve
cd /tmp && node_modules/.bin/deskwork approve <project> ready
# → Error: Final → Published uses publish, not approve.
```

## Surfaced by

- v0.20 row-affordance redesign (commit 4063cae, Task 1.8 of `feature/studio-mobile-first`)
- Architect-reviewer finding 2026-05-11
- See `docs/studio-design/ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/brief.md` for the design context

## Related

- Phase 0.2 inventory: `nextStage('Final')` returns null with comment "publish, not approve" (workplan line 67-69)
- Phase 0.2 inventory: public versioning implementation deferred (workplan around line 67)
- `plugins/deskwork/skills/approve/SKILL.md` — declares approve universal
- `DESKWORK-STATE-MACHINE.md` § Commandment II + IX
<!-- SECTION:DESCRIPTION:END -->
