---
id: TASK-17
title: >-
  calendar.md regen inconsistency: ingest-side regen drops 'Updated' column;
  approve-side adds it; flip-flops across commits
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-223
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/223

## Symptom

The calendar regenerator at `.deskwork/calendar.md` produces different table shapes depending on which code path triggered the regen:

- **Approve-side regen** (after `deskwork approve` advances a stage): table includes an `Updated` column with ISO-8601 timestamps.
- **Ingest-side regen** (after `deskwork ingest --apply` adds a row): table OMITS the `Updated` column.

The result: `git diff .deskwork/calendar.md` after each ingest shows the column being deleted; after each approve the column is re-added. Flip-flop.

## Reproduction (today, 2026-05-06)

Observed twice during the open-issue-tranche-cleanup feature:

1. After `deskwork approve open-issue-tranche-cleanup/prd` advanced the PRD Drafting → Final, `git diff .deskwork/calendar.md` showed the `Updated` column being added to all lanes.
2. After the next ingest (`deskwork ingest 2026-05-05-prd-workplan-audit.md`), `git diff` showed the column being removed.
3. Approving the audit doc again: column re-added.

The committed `.deskwork/calendar.md` ends up reflecting whichever regen ran last, with stale-vs-fresh column state churning across commits.

## Why this is a bug

The calendar.md is a regenerated artifact derived from the sidecars at `.deskwork/entries/`. There should be ONE canonical regen output for a given input set; differences between code paths are bugs. The `Updated` column either belongs in the table (and every regen path should emit it) or doesn't (and the approve-side regen should drop it).

## Friction

The flip-flop generates churn in `git diff` reviews — each commit that lands an ingest or approve includes the column toggle as ambient noise, making it harder to see what actually changed. Especially noticeable on a branch like this one with many ingest + approve cycles.

## Fix direction

Find both regen call paths (likely `regenerateCalendar` in `@deskwork/core/calendar` + whichever helper the ingest CLI calls). Audit which one's output shape is canonical; align the other path. Add a regression test that asserts byte-equal output for two consecutive regens (one after approve, one after ingest, against a fixture with a known sidecar set).

## Disposition

In-scope for the open-issue-tranche-cleanup feature's Phase 10 evaluation pass. Not blocking; pure churn-reduction.
<!-- SECTION:DESCRIPTION:END -->
