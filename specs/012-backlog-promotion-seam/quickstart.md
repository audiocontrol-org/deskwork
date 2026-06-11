# Quickstart: Backlog → Feature-Rigor Promotion Seam

Runnable validation that the seam works end-to-end. Assumes a stack-control installation with a backlog store containing at least one item (e.g. stack-control's own `.stack-control/backlog`).

## Prerequisites

- A stack-control installation (`.stack-control/config.yaml`) with a populated backlog (`stackctl backlog list` shows items).
- `stackctl` on PATH (or invoke `plugins/stack-control/bin/stackctl`).

## Scenario 1 — dry-run a promotion (no writes)

```bash
stackctl backlog promote TASK-12 --to spec:specs/013-some-feature
```

**Expect**: a report of the linkage that would be written (label `promoted` + `Promoted-to: spec:specs/013-some-feature`), an advisory that the target does not yet exist, exit 0, and **no change** to the task file (`git diff` clean).

## Scenario 2 — apply a single-item promotion

```bash
stackctl backlog promote TASK-12 --to roadmap:design:feature/some-slug --apply
stackctl backlog list   # TASK-12 now shows the promoted marker
```

**Expect**: the TASK-12 file gains the `promoted` label + `- **Promoted-to:** roadmap:design:feature/some-slug` body bullet; existing labels/refs/body preserved; exit 0.

## Scenario 3 — re-promotion is refused (idempotency guard)

```bash
stackctl backlog promote TASK-12 --to spec:specs/099-other --apply ; echo "exit=$?"
```

**Expect**: refused — message names the existing promotion target, `exit=2`, zero write.

## Scenario 4 — batch into an existing feature's tasks.md

```bash
stackctl backlog promote TASK-13 TASK-14 --to tasks:specs/012-backlog-promotion-seam --apply
```

**Expect**: both items gain the linkage in one invocation. If one id is invalid or already promoted, the **whole batch is refused** with zero writes.

## Scenario 5 — fail-loud paths

```bash
stackctl backlog promote TASK-9999 --to spec:specs/013-x --apply ; echo "exit=$?"   # non-existent item → exit=1
stackctl backlog promote TASK-12 --apply ; echo "exit=$?"                            # missing --to → exit=2
stackctl backlog promote TASK-12 --to bogus:thing --apply ; echo "exit=$?"           # bad target ref → exit=2
stackctl backlog promote TASK-12 TASK-13 --to spec:specs/013-x --apply ; echo "exit=$?"  # multi-id non-tasks → exit=2
```

**Expect**: the exit codes shown; zero writes on every error path.

## Success criteria mapping

- SC-001 (single-command promote + navigable backlink) → Scenario 2.
- SC-002 (all-or-nothing) → Scenarios 4, 5.
- SC-005 (no second conflicting linkage) → Scenario 3.
- Bidirectional (SC-003) → after creating the target (separate step), confirm the target records the `TASK-<n>` origin (convention, D2).
