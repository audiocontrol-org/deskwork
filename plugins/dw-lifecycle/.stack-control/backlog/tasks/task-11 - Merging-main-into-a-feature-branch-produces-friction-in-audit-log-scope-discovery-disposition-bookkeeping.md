---
id: TASK-11
title: >-
  Merging main into a feature branch produces friction in audit-log /
  scope-discovery / disposition bookkeeping
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
  - enhancement
dependencies: []
references:
  - gh-413
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Operator-reported friction

> "There's a lot of friction when merging main into a branch around the bookkeeping of audit issues."
> — operator, 2026-06-04

When a long-running feature branch (e.g. `feature/scope-discovery`) periodically resyncs from `main`, the merge surfaces bookkeeping conflicts in the scope-discovery / audit-finding state files that are out of proportion to the actual code changes. Recent examples on `feature/scope-discovery`:

- Merge `3898f684` (origin/main → feature/scope-discovery) — conflict in `.dw-lifecycle/scope-discovery/clones.yaml`.
- Merge `be395cfe` (origin/main → feature/graphical-entries, 240 commits sync) — 12 explicit conflicts + 4 semantic merge issues; named conflict surfaces included `clones.yaml`, `DEVELOPMENT-NOTES.md`, calendar files, doctor-rule registries.

Each sync requires operator-side manual reconciliation that is mechanical-but-error-prone, and the conflicts cluster on a known set of files — they're predictable enough to be tooled.

## Known friction surfaces (captured exhaustively per capture-mode rule)

The list below is what's known or knowably-implied; the specific cure for each may be different (some are doctor-rule additions, some are merge-driver shims, some are workflow changes). Scoping is a later, explicit pass.

1. **`.dw-lifecycle/scope-discovery/clones.yaml`** — both sides curate dispositions concurrently. Pure-text merge can't reconcile per-clone-group `disposition` + `reason` fields when both sides edited the same group. (Phase 25's rename-driven specific case is filed at #409; this issue is the general case.)
2. **`audit-log.md`** per-feature — both sides append `AUDIT-YYYYMMDD-NN` entries. Same-date entries on both sides may have the same ID (clash on `AUDIT-20260604-01` if both sides happened to assign it). The merged audit-log is a plain concatenation that loses chronological order.
3. **`workplan.md` archive ledger** — the `<!-- workplan-archive-ledger\narchived-fix-tasks: 5.1-5.123\nnext-fix-task-id: 5.124\n-->` block at the top of `workplan.md` carries integer ranges that both sides may have advanced. Merging keeps both halves but the resulting range may be inconsistent (e.g. `5.1-5.110` on one side, `5.1-5.123` on the other, no clean union).
4. **`workplan.md` task numbering** — both sides may add `### Task N` headings with overlapping integer numbers (the auto-positioner picks `max(visible) + 1` per phase). A merge produces duplicate-task-number violations that the Phase 26 doctor rule catches but doesn't fix.
5. **`fixed-pending-sha` → `fixed-<sha>` resolution sequence** — the two-commit dance (fix commit + audit-log Status flip) means a merge from main brings in `fixed-<sha>` entries whose SHA isn't on the feature branch yet (until the merge); reachability checks downstream can flip-flop until the feature itself merges back.
6. **DEVELOPMENT-NOTES.md (journal)** — both sides append session entries on different dates; the merge is a literal concatenation that the operator manually re-sorts.
7. **`.dw-lifecycle/scope-discovery/audit-runs/`** — per-run directories accumulate on both sides; the merge resolves to the union (no conflict because the directory names are timestamped). Not a bug, but bloats the working tree.
8. **`.dw-lifecycle/scope-discovery/anti-patterns.yaml` / `adopter-manifests.yaml`** — same shape as clones.yaml; both sides curate entries with reason text.
9. **README phase-status table cells** — both sides edit Phase N rows independently; the textual merge breaks the table grammar.
10. **Disposition propagation across main-merge** — when a finding was `fixed-<sha-on-main>` on main and `acknowledged-slush-pile-<date>` on the branch (or vice versa), the merge keeps one side's status arbitrarily.

(Likely more — the list above is what surfaces in the recent merge commit set; a systematic enumeration is the proposed investigation step.)

## Proposed shape (operator decides during workplan scoping)

The fix is almost certainly a portfolio rather than a single change:

- **Per-file merge drivers** for the high-conflict surfaces (`clones.yaml`, `audit-log.md`, `workplan.md` ledger) — small Node scripts wired via `.gitattributes` + `git config merge.<driver>.driver`. Each driver produces a deterministic merge that's correct-by-construction for that file's specific schema.
- **Doctor-rule additions** that catch the post-merge inconsistency (duplicate AUDIT-IDs, duplicate task numbers, stale `fixed-pending-sha`, etc.) — many of these already exist for the steady-state case; the merge-driver path is the post-merge equivalent.
- **A merge-time hygiene helper** (`dw-lifecycle merge-from-main --apply`) that runs a known set of repairs after the merge resolves.
- **Workflow change**: shorter feature-branch lifespans, so the cumulative drift stays small. This is a workflow lever, not a code change, but it's the cheapest mitigation.
- **TDD-first approach**: a fixture that simulates a main-merge (two branches with parallel audit-log + clones.yaml + workplan edits) is the structural test surface for each fix.

## Workaround today

Manual reconciliation, one file at a time, per merge. The current operator pattern (visible in `be395cfe`'s commit body) is: take main's canonical state for the big shared files (clones.yaml, package-lock.json, doctor registries) + keep the feature branch's audit-log + manually re-sort journal entries.

## Why this is a v0.37.0 candidate

The friction grows with feature-branch lifespan. `feature/scope-discovery` has now lived ~10 days with multiple main resyncs; each one costs operator attention proportional to the size of the diff. The earlier this gets a structural fix, the smaller the per-merge cost.

## Provenance

Surfaced 2026-06-04 dogfood pass against v0.36.0 — operator named the friction in workplan-scoping conversation following the `/dw-lifecycle:close-shipped` run. Captured exhaustively per the agent-discipline rule "Capture mode vs scope mode"; scoping happens in workplan.md as a follow-up.
<!-- SECTION:DESCRIPTION:END -->
