---
id: TASK-9
title: >-
  doctor --check (validateCalendarSidecar) reads hardcoded
  .deskwork/calendar.md, ignores per-site calendarPath — false-clean for
  custom-calendarPath adopters
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-357
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/357

## Summary

After [#232](https://github.com/audiocontrol-org/deskwork/issues/232) made `regenerateCalendar` + `doctor` repair write the entry-centric calendar to the configured per-site `calendarPath`, the doctor's entry-centric consistency validator (`validateCalendarSidecar` in `packages/core/src/doctor/validate.ts`) still reads the hardcoded `.deskwork/calendar.md`. For an adopter whose `calendarPath` is NOT `.deskwork/calendar.md`, `doctor --check` now reads the wrong (often absent) file and returns **false-clean**, while `doctor --fix` correctly writes the configured path. The two doctor verbs disagree for exactly the adopter population #232 targets.

## Evidence

- Write side (post-#232): `packages/core/src/calendar/regenerate.ts` + `packages/core/src/doctor/repair.ts` → `resolveCalendarPath(projectRoot, readConfig(projectRoot))`.
- Read side (unchanged): `packages/core/src/doctor/validate.ts` `validateCalendarSidecar` → `join(projectRoot, '.deskwork', 'calendar.md')`. On read failure it catches and returns `[]` (no findings) — hence false-clean.

## Why it wasn't fixed in #232

Making `validateCalendarSidecar` read the per-site `calendarPath` **conflates two surfaces**:

- the entry-centric calendar (`.deskwork/calendar.md` by default) — sidecars are SSOT, the calendar is a derived view;
- the legacy per-site calendar (`calendarPath`) — row-primary, used by `ingest` / `calendar-uuid-missing`.

`packages/cli/test/doctor.test.ts` `--fix=calendar-uuid-missing` proves the collision: it configures `calendarPath: docs/calendar.md` with calendar ROWS but NO sidecars (a legacy calendar). If `validateCalendarSidecar` read that path, it would flag every row as an orphan (uuid in calendar, no sidecar) and the doctor would exit 1 — even though the scenario is a legitimate legacy-calendar repair, not a corruption.

So whether `.deskwork/calendar.md` (entry-centric) and per-site `calendarPath` (legacy) are ONE surface or TWO is the unresolved design question — entangled with [#234](https://github.com/audiocontrol-org/deskwork/issues/234) (ingest-vs-approve calendar divergence). This issue can't be cleanly fixed until that question is decided.

## Options

- (a) If `.deskwork/calendar.md` and per-site `calendarPath` are the SAME surface post-Phase-30: make `validateCalendarSidecar` read `resolveCalendarPath`, and update the `calendar-uuid-missing` doctor flow + its test fixture so the legacy-calendar scenario carries matching sidecars (or is validated under the legacy model, not the entry-centric one).
- (b) If they are DIFFERENT surfaces: keep `validateCalendarSidecar` on `.deskwork/calendar.md` and document that the entry-centric calendar always lives there regardless of `calendarPath` — which would contradict the #232 write-side decision (writes go to `calendarPath`). This needs reconciliation.

## Scope note

Tracked under Phase 38 in `docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md` (audit-log `AUDIT-20260529-04`). Surfaced by the `/dw-lifecycle:review` pass on #232 (commit 517159b). Resolve alongside #234.
<!-- SECTION:DESCRIPTION:END -->
