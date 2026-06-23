# Data Model: ship-stage (Phase 1)

The "data" is the governed lifecycle vocabulary + the recorded markers/records the engine reads. No new persistent store; this extends 022/024/031 surfaces.

## Phases (governed `WORKFLOW.md`)

| Phase | Kind | Derive predicate | Work | Entrance | Exit | Next |
|---|---|---|---|---|---|---|
| `governing` | phase | `tasks-complete` (unchanged) | execute | tasks-complete spec | graduate-impl impl | `merging` |
| **`merging`** (NEW) | phase | `record-converged impl` AND status ≠ shipped | **`stack-control:ship`** | record-converged impl | merged (skill-driven) | `shipped` |
| `shipped` | phase | recorded **status == shipped** (was `record-converged impl`) | (none) | graduate-impl impl (+ merged) | (none) | `validating` |
| **`validating`** (NEW) | phase | recorded **status == shipped AND `validated` absent** | adopter-defined (default: operator-confirm) | status == shipped | `approval-marker validated` | `closed` |
| `closed` | phase | `never` (by-name terminal) | (none) | `approval-marker validated` | (none) | (none) |

**Ordering invariant (derive walk, most-advanced-wins):** `shipped` precedes `validating` in the ordered phase list so that, while status == shipped, the walk returns `validating` until the `validated` marker is recorded, then falls back to `shipped` (ready-to-close). All post-merge derivation keys on recorded status + the `validated` marker — the same sources the close gate reads (FR-007/FR-008).

## Transitions (governed `WORKFLOW.md`)

| Transition | From → To | Exit-gate | Effects (commit last) | Driver |
|---|---|---|---|---|
| `start-merging` (NEW) | governing → merging | `graduate-impl impl` | `journal-append; commit` | execute end / compass |
| `graduate` (REWIRED) | merging → shipped | `graduate-impl impl` (+ merged, established by the skill having merged) | `roadmap-advance to=shipped; roadmap-reconcile; journal-append; commit` | **`/stack-control:ship`** at merge |
| `validate` (NEW) | shipped → validating | (none) | `journal-append; commit` | derived on entry to validating |
| `close` (REWIRED) | validating → closed | `approval-marker validated` | `roadmap-advance to=closed; journal-append; commit` | `/stack-control:close` |
| `redesign` (unchanged) | * → designing | (none) | … | — |

> Note: the exact split between a distinct `start-merging`/`validate` transition vs. deriving those boundaries is pinned RED-first; the load-bearing contract is the gate + effect set above. `graduate`'s effect ORDER is unchanged (commit last — the atomic boundary, transition-engine.ts).

## Vocabulary additions (`workflow-types.ts`)

- **DERIVE_KINDS** += a recorded-status predicate (e.g. `status-is <status>`) so `shipped`/`validating` derive from the recorded `status:` rather than `record-converged`. (Plus `validating` ANDs the `validated`-marker absence — encoding pinned RED-first; candidate: a marker-absent derive variant or a composite evaluated in `phase-derivation.ts`.)
- **CRITERION_KINDS**: reuse the existing generic **`approval-marker`** with target `validated` for the `validating → closed` gate (no new kind needed for the marker). The backstop is NOT a criterion kind (see below).

## The `validated` marker

- A node approval-marker (`validated:`) on the roadmap node, recorded by the operator (or the adopter's validation process). Same shape/mechanism as `design-approved:` / `analyze-clean:` (read by `gate-eval.ts` approval-marker; present-and-truthy semantics).
- **Default semantics**: operator-confirm (matches 031). **Adopter-defined meaning** via the WORKFLOW.md override of `validating`'s exit criteria.

## Merge signal (NEW — `src/workflow/merge-signal.ts`)

- **Input**: an item id + installation root + roadmap.
- **Computation**: resolve the item's `impl` convergence record path (`.stack-control/govern/convergence/impl__<safe-item-id>.json`); find the commit that added/last-touched it; resolve the default branch base (`resolveBase()` in `git.ts`); return `merged = git merge-base --is-ancestor <record-commit> <base>`.
- **Output**: `MergedButInFlight = { itemId, recordCommit, reachableFromBase: true } | null`, where the dangling condition is `reachableFromBase && status !== shipped && status !== closed`.
- **Portability**: git-only (needs the base ref fetched); no gh-API. The on-rail weld (recording shipped) does NOT call this (FR-013).

## Backstop invariant (compass)

- **`computeVerdict` input** (NEW): `danglingMergedItem?: string` — the id of any merged-but-status-in-flight item found over the roadmap (by `compass-resolve.ts` calling `merge-signal.ts`).
- **Verdict**: non-empty → refusing verdict (`off-rail`-class, non-zero exit) with `reason` naming the dangling item + the reconcile command. EXEMPTION: the reconcile transition (advance the dangling item to shipped) is allowed.
- **Surfacing (non-blocking)**: `OrientationReport` (session-start) and `SessionEndReport` (session-end) gain an advisory field (e.g. `mergedNotShippedItems: string[]`) — surfaced, NEVER a refusal (`session-skills-never-block`).

## State transition (item lifecycle, recorded status vs derived phase)

```
in-flight + tasks-complete            → phase governing
in-flight + record-converged impl     → phase merging        (run /stack-control:ship)
  [ship: PR → operator confirms CI green → merge → graduate]
status:shipped + validated absent     → phase validating     (record `validated`)
status:shipped + validated present    → phase shipped         (ready to close → /stack-control:close)
status:closed                         → phase closed
--- off-rail residual ---
record reachable from origin/main + status:in-flight → BACKSTOP refuses forward motion (reconcile exempt)
```
