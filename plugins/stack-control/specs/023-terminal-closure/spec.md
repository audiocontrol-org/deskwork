# Feature Specification: Mechanical terminal closure of resolved backlog items

**Codename**: `impl/terminal-closure` (part-of `multi:feature/lifecycle-industrialization`)

**Feature Branch**: `feature/stack-control` (session-pinned)

**Created**: 2026-06-16

**Status**: Draft

## Context

When a roadmap item reaches a terminal state (`shipped` / `cancelled` / `retired`),
the backlog items that item *resolved* should be closed — mechanically, in one
move, with no agent discretion. Today that closure is manual: the operator (or the
agent) hand-closes items one at a time, which is exactly the surface for the
failure modes this feature kills — closing the wrong item, claiming closure that
didn't happen (fabrication), forgetting an item, or asking a flurry of "should I /
how should I" questions instead of just doing it.

The mechanism does **not** fire automatically (it is an explicit operator move),
but once fired it is **deterministic**: the set of items to close is a *recorded
fact* on the roadmap node, never inferred from titles, greps, or agent judgment.

## Ratified design decisions (2026-06-16, settled — do not relitigate)

1. **Explicit links only.** The items a feature resolves are recorded in a `closes:`
   field on the roadmap node (a comma-list of backlog ids) plus the node's
   originating `ref:`. Closure operates on **exactly** that set. It never
   title-matches, greps, or infers "related." If an id is not in `closes:`/`ref:`,
   it is not touched.
2. **Resolves ≠ found-during.** Bugs/gaps *discovered* while building a feature are
   NOT auto-added to `closes:` — they are unfinished work and stay open by
   construction. Only the items the feature actually delivered go in `closes:`.
3. **Terminal-gated.** `close-related` refuses loud unless the item's roadmap status
   is one of the grammar's terminal statuses (`shipped`/`cancelled`/`retired`).
4. **Dry-run first.** Default lists exactly what would close + the recorded links it
   read; `--apply` closes them. Idempotent — re-running closes nothing new.
5. **No fabrication.** Closure shells the configured backlog backend; an unknown id
   or a backend error fails loud. The verb never reports a close it didn't perform.

## User Scenarios & Testing

### User Story 1 - One mechanical move closes a terminal item's resolved backlog (P1) 🎯 MVP

The operator runs `stackctl roadmap close-related <item>` on a terminal item and the
backlog items that item resolved (its `closes:` list + `ref:`) are closed in one
deterministic move.

**Acceptance Scenarios**:

1. **Given** a `shipped` node with `closes: TASK-A, TASK-B` and `ref: TASK-C`, **When**
   `close-related <item> --apply` runs, **Then** TASK-A/B/C are set to `Done` and the
   verb reports each closed id; re-running closes nothing new (idempotent).
2. **Given** the same node, **When** `close-related <item>` runs without `--apply`,
   **Then** it lists exactly TASK-A/B/C as *would-close* and writes nothing.
3. **Given** a non-terminal node (`planned`/`in-flight`), **When** `close-related` runs,
   **Then** it refuses loud (the item has not reached a terminal state).
4. **Given** a `closes:` id the backend does not know, **When** `--apply` runs, **Then**
   it fails loud naming the id (never a silent skip, never a fabricated success).
5. **Given** a node with no `closes:`/`ref:`, **When** `close-related` runs, **Then** it
   reports "no recorded resolved items" and closes nothing.

## Requirements

- **FR-001**: A roadmap node MUST support a `closes:` field — a list of backlog ids the
  feature resolves on terminal closure — read by the node reader alongside `ref:`.
- **FR-002**: `roadmap close-related <item>` MUST refuse loud unless `<item>`'s status is
  a grammar-declared terminal status (`shipped`/`cancelled`/`retired`).
- **FR-003**: It MUST close EXACTLY the union of the node's `closes:` ids and `ref:` id —
  never an id derived from title-matching, greps, or judgment.
- **FR-004**: It MUST default to a dry-run (writing nothing) and apply only under `--apply`.
- **FR-005**: It MUST be idempotent — closing an already-`Done` item is a no-op reported as
  already-closed, not an error.
- **FR-006**: Closure MUST go through the configured backlog backend (set status `Done`); an
  unknown id or backend error MUST fail loud — the verb never reports an unperformed close.
- **FR-007**: The backlog backend MUST expose a `close(id)` operation that sets an item's
  status to the terminal `Done` via the real binary, failing loud on a non-zero exit.

## Success Criteria

- **SC-001**: For a terminal node with N recorded resolved ids, `--apply` closes exactly
  those N (no more, no fewer) and a dry-run names exactly those N — 100% of fixture cases.
- **SC-002**: A non-terminal node is refused 100% of the time; an unknown id fails loud 100%
  of the time; no fixture path reports a close that did not occur.
- **SC-003**: Re-running `--apply` on an already-closed set is a clean no-op (idempotent).

## Assumptions

- The backlog backend (`backlog.md`) supports status transition via `task edit <id> -s Done`.
- The `closes:` set is recorded as part of the feature's work (reviewable in the roadmap
  diff), not synthesized at close time — that recording is what makes the close safe.
