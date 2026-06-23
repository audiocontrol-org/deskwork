---
slug: 031-transitive-item-closure
targetVersion: ""
---

# Audit log — 031-transitive-item-closure

## 2026-06-23 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260623-01 — Workflow close transition bypasses the cascade

Finding-ID: AUDIT-20260623-01
Status:     fixed-e3bf62d5
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high); FIXED 2026-06-23 (e3bf62d5) — `workflow advance` into the terminal `closed` phase now refuses + redirects to the cascade-running `roadmap advance --to closed` (RED test advance-no-silent-close); no second status-only close path remains.
Surface:    templates/WORKFLOW.md:157-164; src/workflow/effects.ts:129-134; src/subcommands/roadmap.ts:243-254

`templates/WORKFLOW.md` adds `transition:close` with `effects: roadmap-advance to=closed`, but the workflow effect engine implements `roadmap-advance` as a direct call to the generic `advance(...)` status rewrite. That path does not run the special `emitAdvanceClosed(...)` arm that builds/applies the transitive cascade and closes backlog ids. The cascade behavior only exists in the roadmap CLI dispatcher when `to === 'closed'`.

Blast radius: an operator using the lifecycle-native `stackctl workflow advance <id> --apply` from `shipped` will mark the roadmap item `closed`, append journal/commit effects, and leave all recorded backlog ids open. That directly violates the feature’s stated terminal move: close contained work and advance the item as one operator-confirmed action. A reasonable fix is to make the workflow `roadmap-advance to=closed` effect call the same close-cascade implementation as `stackctl roadmap advance --to closed`, or make `transition:close` use a distinct effect that cannot silently degrade to a status-only rewrite.

### AUDIT-20260623-02 — Closed dependencies still block the ready frontier

Finding-ID: AUDIT-20260623-02
Status:     fixed-ece9ad52
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained. FIXED 2026-06-23 (ece9ad52) — depends-on satisfaction now treats {shipped, closed} as satisfying (cancelled/retired still block); RED test graph-closed-satisfies.
Surface:    src/roadmap/graph.ts:1-13,31-47,62-70

`closed` is now a post-ship terminal status, but dependency satisfaction is still hardcoded to exactly `shipped`: `SATISFYING_STATUS = 'shipped'`, and `unmetDependencies` treats every dependency whose status is not `shipped` as a blocker. After this feature, a completed dependency naturally moves from `shipped` to `closed`, so downstream items that depend on it become blocked again.

Blast radius: closing a shipped item can regress unrelated roadmap planning surfaces (`ready`, `blocked`, session orientation) by making dependent work appear unready even though the dependency is farther along than `shipped`. The fix should make dependency satisfaction understand the new lifecycle, likely by treating `closed` as satisfying alongside `shipped` or by deriving satisfaction from the governed phase/status semantics, with a regression test where an item depending on a `closed` item is ready.
