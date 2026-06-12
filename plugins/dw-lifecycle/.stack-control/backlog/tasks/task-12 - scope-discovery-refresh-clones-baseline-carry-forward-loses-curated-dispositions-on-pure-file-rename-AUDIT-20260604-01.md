---
id: TASK-12
title: >-
  scope-discovery: refresh-clones-baseline carry-forward loses curated
  dispositions on pure file rename (AUDIT-20260604-01)
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
  - enhancement
dependencies: []
references:
  - gh-409
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem

`refresh-clones-baseline`'s carry-forward step keys on the clone-group **id** (a content-derived hash). When a pure file rename shifts a clone group's member paths, the recomputed id changes — and the carry-forward fails to match the pre-rename twin. Operator-curated dispositions (`keep-with-reason`, `ignore-with-justification`, `refactor`) silently reset to `pending` / `null`.

This surfaced concretely during Phase 25 Task 4 (commit `49f8a4d6`): the `editor* → module*` source rename invalidated three operator-curated `keep-with-reason` clone-groups. AUDIT-20260604-01 caught the failure (cross-model: claude-01 + codex-03). The audit-finding's exact path: `9e85fb0f675e → a381419e0f31`, `d47a3cfe0d81 → 0654d2d673cf`, `afeee722255a → fa93705e149f`.

The immediate failure mode is concrete: `check-disposition-survivor` exists exactly to refuse non-pending → pending transitions, but it slipped through because the rename minted new ids the survivor diff can't pair with the old ones. The next `check-clones --gate-mode` then surfaces those groups as undispositioned NEW, forcing the operator to re-litigate curation they already settled.

## Proposed fix

The carry-forward step should match on member **shape** (line-span + normalized content), not exact id. Algorithm sketch:

1. Build a content-fingerprint per group (e.g. normalized source bytes of each member's range, content-hashed).
2. For each pre-existing dispositioned group in the prior baseline, compute the fingerprint of its members against the *prior* repo state (use `git show <prior-sha>:<path>` to retrieve).
3. For each NEW (post-refresh) group with content-fingerprint match to a prior dispositioned group, carry forward the disposition + reason.
4. Optionally annotate the carried-forward record with the prior id (`carried_from: <prior-id>`) for audit-trail.

The line-span / normalized-content key tolerates pure renames (the member content is identical; only the path changed). A genuine refactor (line-span shifts AND content shifts) correctly fails the match and surfaces as a new `pending` group requiring fresh disposition.

## Workaround (already applied)

The three lost dispositions were re-applied manually via `batch-dispose --as keep-with-reason` (commit landing alongside AUDIT-20260604-01 disposition). Pattern documented at scope-discovery DEVELOPMENT-NOTES entry for 2026-06-03 cont. 6.

## Acceptance criteria

- Pure file rename (no member-content change) preserves all `keep-with-reason` / `ignore-with-justification` / `refactor` dispositions through `refresh-clones-baseline`.
- Refactor (member-content change at the line-span) correctly surfaces a fresh `pending` group requiring re-disposition.
- `check-disposition-survivor` continues to catch the genuine non-pending → pending transition.
- Regression test: fixture where a member path changes but content is byte-for-byte; assert post-refresh disposition + reason are preserved.

## Refs

- AUDIT-20260604-01 (cross-model)
- Phase 25 commit `49f8a4d6` (where the bug manifested)
- Phase 25 clones.yaml refresh `8ecca590` (the silent-reset commit)
- Prior precedent: Phase 24/26 `67fdfbc7` (same workaround pattern post-demolitions)
<!-- SECTION:DESCRIPTION:END -->
