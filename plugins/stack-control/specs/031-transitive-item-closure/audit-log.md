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

## 2026-06-23 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260623-03 — `phase:closed` with `derive: release-tagged` causes predicate-chain regression — items with a release tag but non-`shipped` roadmap status now derive to `closed` instead of `shipped`

Finding-ID: AUDIT-20260623-03 (claude-01 + codex-02; cross-model)
Status:     fixed-b3befd97
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high); FIXED 2026-06-23 (b3befd97) — added a `never` derive kind; phase:closed now `derive: never` so it is reachable ONLY by the recorded-status by-name rule, never the artifact loop (shipped still derives from its convergence record). RED test closed-not-predicate-derived.
Surface:    `templates/WORKFLOW.md:107` + `src/workflow/phase-derivation.ts:84-111`

The diff adds `phase:closed` with `derive: release-tagged` (`templates/WORKFLOW.md`). The existing `phase:shipped` also carries `derive: release-tagged`. The revised `derivePhase` loop in `phase-derivation.ts` iterates `doc.phases` from last to first, so `closed` is now checked before `shipped` in the predicate scan.

**The by-name rule** (new in this commit) handles `status === 'shipped'` correctly: it matches `phase:shipped` (work-less), returns `shipped` without touching the predicate loop. That bug is fixed. But the predicate loop still runs for any item whose roadmap status does not name a work-less phase — e.g. an item recorded `in-flight` whose release tag has been applied (the operator tagged a release manually without advancing the workflow status). Before this commit, the predicate loop found `shipped` first (the old last phase) and returned it. After this commit it finds `closed` first (the new last phase) and returns `closed` — a phase whose whole contract is that it requires an explicit operator-confirmed transitive cascade.

Concrete regression path:
1. Item has roadmap `status: in-flight` but `releaseTagged: true`.
2. by-name check: no phase named `in-flight` → skip.
3. Predicate loop, `i = length-1`: `closed` has `derive: release-tagged` + `releaseTagged: true` → `evaluatePredicate` returns true → **returns `closed` phase**.
4. `workflow status` and the compass now report the item in `phase:closed`, implying the cascade ran and all contained ids are closed — neither is true.

The `phase:closed` definition also has no in-scope test that exercises `releaseTagged: true` with a non-work-less roadmap status against the updated WORKFLOW.md. The `phase-derivation-by-name.test.ts` suite passes `base()` which defaults `releaseTagged: false` everywhere.

**Blast radius.** `derivePhase` feeds `workflow status`, `workflow compass`, `workflow next`, and session-start reports. An agent or operator reading `workflow status` on a release-tagged but not-yet-explicitly-closed item would see `phase: closed` and `no legitimate next move (terminal phase 'closed')`, suppressing the "don't forget to close" surface entirely and implying the cascade completed when it did not.

**Likely fix.** `phase:closed` should not carry `derive: release-tagged`. A release tag is evidence an item *shipped*, not that it was *closed* — the closure requires a separate explicit action. Remove the derive from `closed` (or replace with `derive: (none)` / a new closed-specific derive kind), leaving `shipped` as the sole `release-tagged` target in the predicate chain.

---

### AUDIT-20260623-04 — Auto-back-link failures leave backlog items closed but unlinked

Finding-ID: AUDIT-20260623-04
Status:     fixed-b9eb7629
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high); FIXED 2026-06-23 (b9eb7629) — backlog done/promote now preflight the auto-back-link (resolve + validate the parent node, no write) BEFORE the backlog mutation; a bad ref fails before close/promote, so no Done-but-unlinked. RED test: bad-ref done leaves the task un-closed.
Surface:    src/subcommands/backlog.ts:180-190, src/subcommands/backlog.ts:373-382, src/backlog/auto-backlink.ts:75-85

`backlog done --apply` closes the task first, then calls `emitAutoBackLink`; `promote --apply` similarly runs `promote(...)` before writing/validating the parent-node back-link. If the stored `**Node:**` ref is stale or misspelled, `emitAutoBackLink` exits 1 after the backlog mutation has already happened. That leaves a task in `Done` or promoted state without the promised `closes:` entry, even though the command reports failure.

The blast radius is high because this violates the feature’s core “near-zero-touch closure” path: an unattended consumer can believe the failed command made no state change, retry or inspect the roadmap, and still miss that the backlog item has already transitioned. A reasonable fix is to preflight the parent-node roadmap mutation before closing/promoting, or otherwise make the backlog state and roadmap back-link commit as one recoverable operation.

## 2026-06-23 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260623-05 — `closes:` removal deletes fenced examples

Finding-ID: AUDIT-20260623-05
Status:     fixed-fa4d1eb2
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained. FIXED 2026-06-23 (fa4d1eb2) — dropClosesLine is now fence-aware (shared fenceDelimiter model), removing only the real field bullet outside fences; a fenced closes-example is preserved. RED test in closes-mutation.test.ts.
Surface:    src/roadmap/closes-mutation.ts:96-110

`dropClosesLine()` removes every body line matching `- closes:` with a raw filter. Unlike the rewrite path, it is not fence-aware, so `roadmap resolves <node> --remove <last-id> --apply` will delete fenced code examples inside that node body if they contain a `- closes:` line. The test at `tests/roadmap/closes-mutation.test.ts:82-95` only covers the add/rewrite branch, so this deletion branch is untested.

Blast radius is high because this is silent content corruption in governed markdown: an adopter can lose prose examples while performing the intended `--remove` operation. The fix should make the drop path use the same fence-aware traversal as `rewriteEdgeLine`, removing only the real field bullet outside fences.

## 2026-06-23 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260623-06 — `close` intent breaks custom WORKFLOW.md overrides without `closed`

Finding-ID: AUDIT-20260623-06
Status:     fixed-88366e68
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high); FIXED 2026-06-23 (88366e68) — buildIntentVocabulary registers an alias only when its target phase exists in the doc; a custom WORKFLOW.md without phase:closed no longer throws (close just becomes an unavailable intent). RED test in intent-vocabulary.test.ts.
Surface:    src/workflow/intent-vocabulary.ts:27-35,64-67; src/workflow/workflow-grammar.ts:235-247

`ALIAS_TO_PHASE` now hardcodes `['close', 'closed']`, and `buildIntentVocabulary` throws if any alias target is absent from the governed `WORKFLOW.md`. But `loadWorkflowDoc` explicitly gives `<root>/.stack-control/WORKFLOW.md` precedence over the bundled template. Any existing or customized installation override that has not added `phase:closed` now makes intent vocabulary construction fail, not just make `close` unavailable.

Blast radius is high for adopter/custom installs: `resolveIntent` and `knownIntents` both call `buildIntentVocabulary`, so a missing `closed` phase can break compass intent handling broadly. A safer shape is to derive transition aliases like `close` from declared `transition:*` units, or only register the hardcoded alias when the target phase exists, with a loud diagnostic specifically for using `close` against a lifecycle that lacks that transition.

### AUDIT-20260623-07 — `advance --to closed --apply` can close backlog IDs before the roadmap status write succeeds

Finding-ID: AUDIT-20260623-07
Status:     fixed-7f26be4e
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high); FIXED 2026-06-23 (7f26be4e) — advance --to closed now writes the roadmap status FIRST (local, validated, atomic temp+rename), then closes the backlog ids; a failed status write leaves the backlog untouched (no ids-closed-but-item-shipped split). RED test: unwritable roadmap dir leaves the id un-closed.
Surface:    src/subcommands/roadmap-advance-closed.ts:84-98

The apply path runs `applyCascade(plan, backend)` first, mutating every backlog item to `Done`, then calls `advance(docPath, id, 'closed', opts, true)` to validate and write the roadmap status. If the roadmap write fails after the cascade succeeds, for example due to a concurrent edit, missing status line, filesystem permission error, or candidate validation/write failure, the installation is left with contained backlog IDs closed while the root roadmap item is still `shipped`.

Blast radius is high because this is the feature’s central operator-confirmed action and it spans two durable stores. The code already preflights unknown backlog IDs, but it does not preflight or stage the roadmap mutation before closing external backlog items. A reasonable fix would validate the roadmap status candidate before mutating backlog and structure the apply path so failures produce a recoverable, explicitly reported state instead of silently splitting “ids closed” from “item closed.”
