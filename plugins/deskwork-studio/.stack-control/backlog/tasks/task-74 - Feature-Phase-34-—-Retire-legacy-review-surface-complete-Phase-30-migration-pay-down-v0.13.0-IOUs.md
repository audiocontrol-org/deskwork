---
id: TASK-74
title: >-
  Feature: Phase 34 — Retire legacy review surface; complete Phase-30 migration;
  pay down v0.13.0 IOUs
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-170
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

Phase 34 of the `deskwork-plugin` feature. Five sub-phases organized around the discovery that the studio's longform editorial review surface is currently structurally broken (see 34a). 34a is blocking — until it ships, the studio review loop is unusable end-to-end and no other sub-phase has a working dogfood path.

## Documents

- **PRD extension:** [`docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md`](https://github.com/audiocontrol-org/deskwork/blob/feature/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md) — section "Extension: Phase 34 — Retire the legacy review surface; complete the Phase-30 migration; pay down v0.13.0 IOUs (post-v0.13.0)"
- **Workplan:** [`docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md`](https://github.com/audiocontrol-org/deskwork/blob/feature/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md) — section "Phase 34"

## Sub-phases

| Phase | Scope | Tracking |
|---|---|---|
| **34a** | Retire `pages/review.ts` entirely; port press-check chrome to entry-review surface; delete legacy routes; update every link emitter; audit corrupted post-Phase-30 reviews | Filed as a separate dedicated issue (link in workplan) |
| **34b** | Pay down F1–F6 IOUs — composer regression + image dimensions + secret continuity + edit-toolbar discoverability | Existing issues: #166, #163, #164, plus one new issue for edit-toolbar discoverability filed at 34b kickoff |
| **34c** | Studio dev mode + interaction bugs | Existing issues: #165, #156, #157 |
| **34d** | Studio data + content bugs (#152 folded into 34a) | Existing issues: #151, #153, #158 (with explicit "split-the-umbrella" task) |
| **34e** | v0.13.0 verification + issue closures | Existing issues: #154, #155, #159, #160, #161 (closure verification post-release of 34a's surface fix) |

## Dispatch order

34a → 34b → 34c → 34d → 34e. None of the others can start until 34a ships, because every other sub-phase's verification depends on a working studio review surface.

## Why this phase exists

Triggered by a live audit during Phase 34's own PRD review: the dashboard's per-row link routes to a legacy `pages/review.ts` surface that reads from pre-Phase-30 workflow records. `iterateEntry` (the entry-centric writer) updates only sidecars + the history journal. Result: the studio shows frozen pre-2026-05-01 content for any entry iterated since the Phase 30 pivot. Press-check chrome looks right; data is silently stale. Every post-Phase-30 longform editorial review that used the dashboard's link is suspect.

The Phase 34 PRD review itself happened via `git diff` because the studio is unusable. 34a's structural-fix acceptance criterion includes: *"the Phase 34 PRD review can be completed end-to-end via the studio UI alone."* Until 34a ships, that criterion has not been met.

## Process bypass note

This issue (and 34a's dedicated issue) was filed under a one-time explicit operator bypass of the `/feature-extend` skill's *"PRD must be applied via studio review"* gate. The studio review surface that the gate runs through is itself broken — the chicken-and-egg the gate depends on. The bypass is rule-compliant per `agent-discipline.md` (*"explicit operator decision to defer with documented acceptance criteria"*); the documented criterion is "34a fixes the gate so this bypass is never needed again."

## Related

- New rule: `.claude/rules/agent-discipline.md` "No 'just for now' shortcuts" (commit `42eb837`). Phase 34 is its first proof-of-work.
- v0.13.0 release notes (the trigger): https://github.com/audiocontrol-org/deskwork/releases/tag/v0.13.0
<!-- SECTION:DESCRIPTION:END -->
