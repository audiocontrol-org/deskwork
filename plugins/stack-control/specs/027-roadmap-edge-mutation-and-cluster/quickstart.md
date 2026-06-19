# Quickstart — validate roadmap edge-mutation and cluster

Runnable scenarios that prove the feature end-to-end. Run against a fixture roadmap (a temp `ROADMAP.md` with a few nodes) so the project's real roadmap is untouched. `SC` = `plugins/stack-control/bin/stackctl`.

## Prerequisites

- A fixture installation with a `ROADMAP.md` containing ≥3 nodes, two of them un-grouped (no `part-of`).
- The feature built (parser library adopted; `roadmap` migrated; `cluster` implemented).

## Scenario 1 — self-documenting help (US1)

```bash
$SC roadmap --help            # expect: every subaction listed + summaries; exit 0
$SC roadmap                   # expect: COMPLETE subaction list in usage; exit 2
$SC roadmap cluster --help    # expect: --children/--chain/--summary/--apply + usage; exit 0
$SC roadmap advance --help    # expect: the status vocabulary enumerated; exit 0
```
Pass: each prints the real surface to stdout/stderr without erroring on `--help`, and the flags shown match what the verb accepts (non-drift).

## Scenario 2 — cluster create-new parent + chain (US2)

All ids are grammar-shaped `<phase>:<kind>/<slug>` and must name EXISTING roadmap
units (the children); the parent is created-or-reused. Substitute ids present in
your fixture roadmap.

```bash
$SC roadmap cluster multi:feature/epic-x --children impl:feature/a,impl:feature/b,impl:feature/c --chain        # dry-run
$SC roadmap cluster multi:feature/epic-x --children impl:feature/a,impl:feature/b,impl:feature/c --chain --apply
$SC roadmap order                                                                                               # revalidates clean
```
Pass: dry-run writes nothing; `--apply` creates `multi:feature/epic-x` (planned), each child gains `part-of: multi:feature/epic-x`, the `depends-on` chain `a→b→c` is wired, and `roadmap order` exits 0 (acyclic).

## Scenario 3 — cluster reuse existing parent + multi-parent child

```bash
# multi:feature/epic-x already exists; impl:feature/d is already part-of multi:feature/epic-y
$SC roadmap cluster multi:feature/epic-x --children impl:feature/d --apply
```
Pass: `multi:feature/epic-x` reused (not duplicated); `impl:feature/d` now carries BOTH `part-of: multi:feature/epic-y` and `part-of: multi:feature/epic-x`.

## Scenario 4 — refusals are atomic (FR-012/013/014/015)

```bash
cp ROADMAP.md ROADMAP.bak
$SC roadmap cluster multi:feature/epic-z --children impl:feature/a,impl:feature/nonexistent --apply ; echo "exit=$?"   # missing child
$SC roadmap cluster multi:feature/epic-z --children impl:feature/a,impl:feature/b --chain --apply    ; echo "exit=$?"   # b has conflicting depends-on
diff ROADMAP.md ROADMAP.bak && echo "byte-for-byte unchanged"
```
Pass: each refusal exits 2 and `diff` reports no change (zero-write-on-failure).

## Scenario 5 — honest header (US3)

```bash
head -25 ROADMAP.md
```
Pass: the header names the mutation verbs, shows a worked `cluster` example, and states the hand-edit-then-`roadmap order` fallback (not a bare "do not hand-edit").

## Scenario 6 — non-regression (FR-006)

```bash
$SC roadmap next ; $SC roadmap add impl:gap/x --status planned ; $SC roadmap order
```
Pass: pre-existing sub-actions behave exactly as before the parser migration.
