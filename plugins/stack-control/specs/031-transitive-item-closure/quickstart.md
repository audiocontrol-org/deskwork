# Quickstart / Validation: Transitive item closure + the post-ship terminal stage

Runnable validation scenarios proving the feature end-to-end. Each maps to user
stories (US1–US4) and success criteria (SC-001–SC-007). Run from the installation
(`plugins/stack-control/`); use the source engine `./bin/stackctl` while developing
(per `.claude/rules/source-engine-for-stack-control-dev.md`).

**Prerequisites**: a fixture installation with a roadmap containing a terminal parent
node, `part-of` children, and a backlog store with the referenced ids. Fixtures live
on disk (never mocked).

## Scenario A — Transitive close in one move (US1 / SC-001, SC-007)

1. Fixture: parent `shipped` with `closes: TASK-1, TASK-2`; child (`part-of` parent)
   `shipped` with `closes: TASK-3`; all three ids `To-Do` in the backlog.
2. `./bin/stackctl roadmap close-related <parent> --cascade`
   → **Expect** dry-run lists nodes {parent, child} and `closeIds {TASK-1,2,3}`,
   writes nothing.
3. `./bin/stackctl roadmap close-related <parent> --cascade --apply`
   → **Expect** TASK-1/2/3 are `Done` with a cascade reason.
4. Re-run step 3 → **Expect** all three reported `alreadyClosed`, exit 0 (idempotent).

## Scenario B — Multi-parent dedup (US1 / SC-007)

1. Fixture: node `N` (`closes: TASK-9`) is `part-of` two parents both reachable from
   the cascade root.
2. Cascade from the root → **Expect** `N` and `TASK-9` appear exactly once in the
   plan; apply closes `TASK-9` once.

## Scenario C — Skip-and-report a non-terminal child; parent still closes (US3 / FR-007a)

1. Fixture: parent `shipped`; child-A `shipped` (`closes: TASK-4`); child-B
   `in-flight` (`closes: TASK-5`).
2. `./bin/stackctl roadmap advance <parent> --to closed`
   → **Expect** dry-run closes `TASK-4`, lists child-B as **skipped (in-flight)**,
   does NOT include `TASK-5`.
3. `--apply` → **Expect** `TASK-4` `Done`, `TASK-5` untouched, parent status `closed`.

## Scenario D — Uniform terminal handling of cancelled/retired members (US1 / FR-007)

1. Fixture: parent `shipped`; child `cancelled` with `closes: TASK-6`.
2. Cascade → **Expect** `TASK-6` is closed with a reason reflecting the `cancelled`
   status; the walk descends into the cancelled child's own children.

## Scenario E — Populate `closes:` without hand-editing (US2 / SC-002)

1. `./bin/stackctl roadmap resolves <node> --add TASK-7 TASK-8`
   → dry-run shows `closes: (none) → TASK-7, TASK-8`; `--apply` writes it.
2. `./bin/stackctl roadmap resolves <node> --remove TASK-7 --apply`
   → **Expect** `closes: TASK-8`.
3. Confirm `add-edge <node> closes …` still **refuses** (prose field, not a unit edge).

## Scenario F — Auto-back-link on `backlog done` (US2 / SC-002)

1. Fixture: `TASK-10` carries a parent-node ref to node `N` (set via
   `backlog promote … --node N` or `capture --node N`).
2. `./bin/stackctl backlog done TASK-10 --reason "fixed"`
   → **Expect** `TASK-10` `Done` AND node `N`'s `closes:` now contains `TASK-10`.
3. Fixture: `TASK-11` with no parent-node ref → `backlog done TASK-11 --reason x`
   → **Expect** closed, no back-link, no error (no-op).

## Scenario G — Terminal stage surfaces the pending close (US3 / SC-003, SC-004)

1. Fixture: item `M` at status `shipped`.
2. `./bin/stackctl session-start` (or `workflow status M`) → **Expect** `M` reported
   as not-yet-closed, with `closed` the legitimate next move (shipped not terminal).
3. `./bin/stackctl workflow compass M --intent <close>` → **Expect** `shipped→closed`
   on-course; `compass` for `closed` from a non-`shipped` item → refused.
4. `advance M --to closed` (no `--apply`) → **Expect** dry-run only, no status change
   (no automatic closure — SC-004).

## Scenario H — Install-agnostic close (US3 / SC-005) + deadlock cannot recur (US4 / SC-006)

1. Fixture: an installation with NO release/install step; item `P` at `shipped` with
   a contained subtree.
2. `advance P --to closed --apply` → **Expect** closure proceeds with NO validation
   criterion blocking it; `P` reaches `closed`.
3. Inspect any feature's `tasks.md` + phase criteria → **Expect** NO
   post-install/publish-dependent task or entrance criterion exists for governance to
   block on (the deadlock is structurally absent).

## Coverage map

| Scenario | User stories | Success criteria |
|---|---|---|
| A | US1 | SC-001, SC-007 |
| B | US1 | SC-007 |
| C | US3 | SC-003 (FR-007a) |
| D | US1 | SC-001 (FR-007) |
| E | US2 | SC-002 |
| F | US2 | SC-002 |
| G | US3 | SC-003, SC-004 |
| H | US3, US4 | SC-005, SC-006 |
