# Phase 1 Data Model: Transitive item closure + the post-ship terminal stage

Entities are existing governed-markdown / backlog structures gaining fields; one new
in-memory artifact (the cascade plan). No new persisted artifact *kind*.

## WorkItem (roadmap node) — CHANGED

The unit parsed by `src/roadmap/roadmap-model.ts` from `ROADMAP.md`.

| Field | Type | Change | Notes |
|---|---|---|---|
| `id` | string | — | heading-keyed identifier |
| `status` | enum | **+`closed`** | vocabulary `[planned, in-flight, shipped, cancelled, retired, closed]`; terminal set `[shipped, cancelled, retired, closed]` (`grammars/roadmap.peg:6-7`) |
| `partOf` | string[] | — | multi-parent grouping; the cascade's traversal edge (reverse-walked via `childrenOf`) |
| `closes` | string[] | — | prose comma-list of backlog ids; the auditable recorded set the closer acts on (parse `roadmap-model.ts:141`) |
| `ref` | string \| null | — | single external ref; unioned with `closes` by the closer (unchanged from 023) |

**Validation / rules**:
- `closed` is terminal: no outgoing lifecycle transition; `close-related`/`advance`
  accept it as a valid closing context (status read is grammar-derived).
- `closes` stays canonical after mutation: trimmed, deduped, stable order.
- The closer touches ONLY ids in `closes` ∪ `ref` (023 FR-003 — never inferred).

**State transitions** (status): `planned → in-flight → shipped → closed`; side-states
`cancelled`/`retired` reachable per existing rules. `shipped → closed` is the new,
operator-confirmed transition (its effect: the transitive cascade). `closed` is
terminal.

## Phase (workflow) — CHANGED

Derived position from `templates/WORKFLOW.md` via `src/workflow/phase-derivation.ts`.

| Phase | Change | Notes |
|---|---|---|
| `…shipped` | no longer treated as terminal | derives from status `shipped` (by name) |
| `closed` | **NEW, terminal** | derives from status `closed`; no `next` |

**Rules**:
- Phase is mapped from status **by name** (the `status===shipped → last-phase`
  special-case is retired).
- Compass: `shipped → closed` legitimate; `closed` refused from any non-`shipped`
  phase; `closed` is a terminal phase.
- Lifecycle surfaces a `shipped` item as not-yet-closed (the pending `closed` is the
  reported next move) — the "don't forget" mechanism.

## BacklogTask — CHANGED

Backed by the backlog store (`src/backlog/backend.ts`, `BacklogItem`).

| Field | Type | Change | Notes |
|---|---|---|---|
| `id` | string (`TASK-n`) | — | |
| `status` | enum | — | `To-Do`/`In-Progress`/`Done`; closing sets `Done` + appends a reason (`backend.close`) |
| `notes` | string | — | implementation notes (read via `rawNotes`) |
| parent-node ref | string \| absent | **NEW (optional)** | stored as a notes linkage line `Node: <roadmap-id>` (reuses the promotion-linkage precedent); enables auto-back-link |

**Rules**:
- The parent-node ref is OPTIONAL. Absent ⇒ `done`/`promote` perform no back-link
  (no error — FR-011).
- Present ⇒ on `done`/`promote`, the task id is added to that node's `closes:` via
  the `closes-mutation` (auto-back-link).
- Closing is idempotent: an already-`Done` id is reported, not re-errored.

## CascadePlan — NEW (in-memory dry-run artifact)

Produced by `transitive-close.ts`; the dry-run output and the apply input.

| Field | Type | Notes |
|---|---|---|
| `root` | string | the node the cascade starts from |
| `nodes` | NodeClosure[] | terminal nodes in the subtree whose ids will close |
| `skipped` | SkippedChild[] | non-terminal children skipped (id + status), surfaced for transparency (FR-007a) |
| `closeIds` | string[] | the deduped union of backlog ids to close across `nodes` |
| `alreadyClosed` | string[] | ids already `Done` (reported, no-op) |
| `unknownIds` | string[] | recorded ids the backlog does not know (fail-loud in dry-run before apply) |

`NodeClosure`: `{ id, status, closes: string[], reason }` (reason reflects the node's
terminal status — e.g. `shipped`/`cancelled`). `SkippedChild`: `{ id, status }`.

**Rules**:
- Visited-`Set` over `nodes ∪ skipped` ⇒ each node appears once (diamond-safe).
- `unknownIds` non-empty ⇒ dry-run reports and apply refuses (no partial close).
- Apply closes `closeIds` (skipping `alreadyClosed`) and, for an `advance --to
  closed`, sets the root's status to `closed`.

## Reverse-edge relation — NEW helper

`childrenOf(model, parentId): WorkItem[]` = items whose `partOf` includes `parentId`
(`src/roadmap/graph.ts`, mirroring `blocks()`). The cascade's sole traversal
primitive; pure, tested directly.
