# Data Model: Backlog → Feature-Rigor Promotion Seam

Entities and state for the promotion seam. No new store; this augments the existing backlog.md task-file model.

## Entity: Backlog item (existing, augmented)

A `backlog.md` task file under `.stack-control/backlog/tasks/`. Existing shape (unchanged by this feature except as noted):

| Field | Source | Notes |
|---|---|---|
| `id` | frontmatter `id` | `TASK-<n>` (assigned by backlog.md) |
| `title` | frontmatter `title` | |
| `status` | frontmatter `status` | `To Do` / `In Progress` / `Done` (native — **not** used for promotion) |
| `labels` | frontmatter `labels` | `agent-found`, `type:<bug\|gap>`, optional `gh-<n>`, **+ `promoted` (new)** |
| `references` | frontmatter `references` | existing backlink refs (e.g. `gh-<n>`) — preserved |
| body | markdown body | gains a **`- **Promoted-to:** <target-ref>`** bullet on promotion |

**Augmentation on promote** (record-only): add the `promoted` label + the `Promoted-to:` body bullet. All pre-existing fields preserved (FR-013).

## Entity: Graduation target (referenced, not created)

A typed reference string identifying where the item graduates. Three kinds (FR-002):

| Kind | Ref form | Created by (separate step) |
|---|---|---|
| New feature spec | `spec:specs/NNN-slug` | `/stack-control:define` → `/speckit-specify` |
| Task in existing feature | `tasks:specs/NNN-slug` | the feature's `tasks.md` (edited when the task is added) |
| Roadmap node | `roadmap:<phase>:<kind>/<slug>` | `stackctl roadmap add` |

The ref is shape-validated (correct prefix, well-formed path/id) but the target need not exist on disk at promote time (D4).

## Entity: Promotion linkage

The recorded relationship. Backlog-side (written by promote, now):
- `- **Promoted-to:** <target-ref>` body bullet (canonical, greppable).
- `promoted` label.

Target-side (written when the target is created, by convention — D2):
- `spec:` → origin noted in the new spec's Context.
- `tasks:` → the added task line references the originating `TASK-<n>`.
- `roadmap:` → the node body carries the `TASK-<n>` ref.

## State transitions (backlog item, promotion axis)

```text
            promote --apply
 (no promoted label) ───────────────▶ (promoted label + Promoted-to: bullet)
        │                                         │
        │  re-promote                             │  re-promote
        ▼                                         ▼
   allowed (writes)                          REFUSED (FR-006): already promoted,
                                             exit non-zero, zero write
```

- The promotion axis is **orthogonal** to the native `To Do/In Progress/Done` progress axis (D3): an item can be `In Progress` and `promoted`.
- Terminal guard (FR-006): a `promoted` item is terminal **on the promotion axis** — re-promote is refused (no duplicate/conflicting linkage). Mirrors the inbox terminal-state guard.

## Validation rules

- Item must exist (`backlog.md` task with the given id) → else fail loud (FR-009).
- Backlog store must be well-formed → a malformed task file fails loud via the existing `BacklogError` path (FR-009).
- `<target-ref>` must be a well-formed ref of a known kind → else usage error, exit 2 (D4).
- Item must not already carry the `promoted` label → else refused (FR-006).
- Batch (`tasks:` only): every item-id resolved + non-promoted **before** any write (all-or-nothing, SC-002) (D5).
