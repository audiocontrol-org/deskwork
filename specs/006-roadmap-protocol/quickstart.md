# Quickstart: Roadmap protocol — validation scenarios

Runnable scenarios that prove the feature works end-to-end. Details live in [contracts/](./contracts) and [data-model.md](./data-model.md); this is the run/validate guide. All RED-first (Constitution I): each scenario has a failing test before implementation.

## Prerequisites

- `npm install` at repo root.
- Run from `plugins/stack-control/` workspace; verb invoked via `plugins/stack-control/bin/stackctl roadmap …` (or the dev `tsx` entry).
- Fixtures: heading-keyed roadmap documents under `plugins/stack-control/tests/roadmap/fixtures/` (on disk; never mocked — `.claude/rules/testing.md`).

## Scenario 1 — Fresh-agent orientation (US1 / SC-001/SC-006)

1. Fixture roadmap: `B depends-on A`, `A: shipped`, `C depends-on A` with `A: planned`.
2. `stackctl roadmap next` ⇒ lists `B`, not `C`.
3. `stackctl roadmap blocked` ⇒ `C` blocked by `A (planned)`.
- **Pass**: ready/blocked match the declared edges + statuses; no item with an unshipped dep appears in `next`.

## Scenario 2 — Graph integrity is fail-loud (SC-002 / FR-005/006/007)

1. Fixture with a `depends-on` to a non-existent identifier ⇒ load/`curate`/`roadmap *` exit `2`, message names the missing target. Document unchanged.
2. Fixture with a `depends-on` cycle ⇒ exit `2`, message names the cycle.
3. Duplicate `## <identifier>` ⇒ exit `2` (identifier uniqueness).
- **Pass**: each fails loud with a located message; zero writes.

## Scenario 3 — Emergent-work capture in one move (US2 / SC-003)

1. `stackctl roadmap add impl:fix/escaped-pipe --part-of impl:feature/x --depends-on impl:feature/x --scope "found mid-build" --apply`.
2. Re-load ⇒ the `fix` item is present as a peer with both edges; graph re-validates.
3. Attempt an `add` referencing a missing target ⇒ exit `2`, nothing written.
- **Pass**: one command captures kind+grouping+dependency; invalid capture is refused atomically.

## Scenario 4 — Mutations re-validate, zero-write on failure (US3 / FR-009/FR-010)

1. `roadmap decompose impl:feature/x --into impl:feature/x1,impl:feature/x2 --apply` ⇒ former dependents resolved; graph valid.
2. A `decompose`/`reclassify` that would create a cycle ⇒ exit `2`; document byte-for-byte unchanged (hash equality before/after).
3. `roadmap reclassify impl:gap/y --to impl:feature/y --apply` ⇒ identifier renamed, referencing edges rewritten; graph valid.
- **Pass**: valid mutations apply; invalid ones leave the document unchanged.

## Scenario 5 — Reconciliation is report-only (US5 / SC-004 / FR-016/017)

1. Fixture item `in-flight` with `spec: specs/<dir>` whose artifacts indicate completion (tasks checked + graduation record).
2. `stackctl roadmap reconcile` ⇒ proposes advancing to `shipped`; lists orphan spec dirs; lists unresolved correspondences.
3. Assert document hash identical before/after.
- **Pass**: discrepancies proposed; **zero** status mutations; no git/gh dependency exercised.

## Scenario 6 — `curate`/`archive` still work on the new heading-keyed roadmap (regression)

1. `stackctl curate --doc <heading-keyed roadmap>` ⇒ well-formed/ordered/archived checks pass; reorder respects the phase relation.
2. Mark an item `shipped`; `stackctl curate --doc … --apply` (or `roadmap archive --apply`) ⇒ the terminal item moves to the archive + ledger entry.
- **Pass**: the primitives operate unchanged through the new grammar.

## Scenario 7 — Migration of the prose roadmap (US6 / SC-005)

1. Author the heading-keyed canonical `ROADMAP.md` from the prose roadmap's content with explicit `depends-on` edges.
2. Presence test: every real feature from `docs/1.0/.../stack-control-roadmap.md` exists as an item; graph validates green.
3. Prose roadmap replaced by a pointer to the canonical one.
- **Pass**: lossless port; one canonical roadmap; bugs found en route captured as `fix`/`gap` items.

## Suite

`npm --workspace @stack-control/<pkg> test` (Vitest) runs the document-primitives + roadmap suites; `tsc` strict clean is a prerequisite, not a substitute (per testing rules). `after_implement` governance (cross-model barrage) fires per the Spec Kit extension.
