# Quickstart / Validation: Model-Sized Dispatch

Runnable validation scenarios proving the feature works end-to-end. Each maps to a Success
Criterion. The differentiated surface (`stackctl resolve-tiers` + the `tier_map` config) is
directly exercisable on fixtures; the dispatch discipline is validated by reading the rewritten
`skills/execute/SKILL.md`. References to field shapes live in `data-model.md` and `contracts/`.

**Prerequisites**: a stack-control installation (`stackctl setup` has run); the source engine
`./bin/stackctl` (per the dev rule — use the source engine while developing this feature).

---

## Scenario 1 — Tiers resolve to the right model (SC-001, SC-003)

1. In `.stack-control/config.yaml`, add:
   ```yaml
   tier_map:
     fast: haiku
     powerful: opus
   ```
2. Create a fixture `tasks.md` with:
   ```text
   - [ ] T001 [P] [US1] [tier:fast] Mechanical single-file edit
   - [ ] T002 [US1] [tier:powerful] Architecture-level change
   ```
3. Run: `./bin/stackctl resolve-tiers --spec <fixture-spec-dir>`
4. **Expect** exit 0 and JSON: `T001 → haiku`, `T002 → opus`.
5. Change `T001` to `[tier:powerful]`; re-run. **Expect** `T001 → opus` with **no code change**
   (data-driven sizing — SC-003).

---

## Scenario 2 — Missing tier fails loud before any dispatch (SC-002, FR-004)

1. Fixture `tasks.md`:
   ```text
   - [ ] T001 [US1] [tier:fast] Has a tier
   - [ ] T002 [US1] No tier declared here
   ```
2. Run: `./bin/stackctl resolve-tiers --spec <fixture-spec-dir>`
3. **Expect** exit 1; stderr contains `task T002 has no model tier declared`; **no** resolution
   JSON on stdout (no partial — FR-006).

---

## Scenario 3 — Unknown tier fails loud, all errors together (SC-002, FR-005/006)

1. Tier map has only `fast`/`powerful`. Fixture `tasks.md`:
   ```text
   - [ ] T001 [US1] [tier:fast] ok
   - [ ] T002 [US1] [tier:turbo] unknown tier
   - [ ] T003 [US1] No tier
   ```
2. Run `resolve-tiers`. **Expect** exit 1; stderr lists **both** `task T002 declares unknown tier
   turbo` **and** `task T003 has no model tier declared` (complete set, not first-error abort);
   no resolution emitted.

---

## Scenario 4 — Absent / malformed tier map (FR-007/008, config validate)

1. Remove `tier_map` from config; fixture has a `[tier:fast]` task. Run `resolve-tiers`.
   **Expect** exit 1; stderr: `no tier_map configured; cannot resolve tier 'fast' for task T001`.
2. Set `tier_map: { fast: gpt-4 }` (a value outside the accepted-model set). Run any verb that
   loads config (e.g. `resolve-tiers`). **Expect** a loud config error naming the out-of-range
   value (`tier_map[fast] = 'gpt-4' is not an accepted model …`).

---

## Scenario 5 — Self-contained: works with superpowers absent (SC-006, FR-013)

1. Confirm the superpowers plugin is not required: `resolve-tiers` and the execute tier discipline
   reference no superpowers path. Grep the feature's source for any `superpowers` import/require —
   **expect none**.
2. Run Scenario 1 again; **expect** identical output regardless of whether superpowers is
   installed.

---

## Scenario 6 — Execute adopts the dispatch discipline (FR-009/010/011, SC-004/005)

Validated by reading the rewritten `skills/execute/SKILL.md` and the durable ledger:

1. Confirm the dispatch step: runs `resolve-tiers` first; on non-zero, STOPS (no dispatch);
   otherwise dispatches each task to a **fresh subagent** with an **isolated brief** and the
   **explicit model** from the resolution (never an inherited default).
2. Confirm the durable ledger records per-task `{id, tierLabel, model, commitRange, reviewClean}`
   (FR-011) — so the tier/model is observable after the run (SC-004).
3. Simulate resume: with a ledger marking `T001` complete, confirm the skill resumes at the first
   un-recorded task and does **not** re-dispatch `T001` (SC-005).

---

## Out of scope (do NOT validate here — specs/002)

Mechanical dependency-DAG scheduling, cycle detection, wave timing, per-task worktree isolation,
parallel shared-tree dispatch as an engine. Ordering/parallelism in this feature is the adopted
superpowers stance (controller judgment), not a mechanism to validate.
