# Quickstart: Model-tier task annotation

Runnable validation that a `tasks.md` authored through `/stack-control:define` is **born
tier-complete**, that the vocabulary comes from the enclosing installation's own `tier_map`, that
the no-`tier_map` path emits `[tier:UNSET]` + a loud advisory without blocking generation, and that
the deterministic `resolve-tiers` floor is preserved. Prerequisites: the stack-control installation
(`plugins/stack-control`), `npm install` done, source engine `./bin/stackctl` (per
`.claude/rules/source-engine-for-stack-control-dev.md`, govern/engine-behavior verbs use the source
bin while developing).

See [contracts/tier-vocab-verb.md](./contracts/tier-vocab-verb.md) and
[contracts/render-tier-requirement.md](./contracts/render-tier-requirement.md) for the behavioral
contracts and [data-model.md](./data-model.md) for the types + ranking worked examples. This file
does not inline implementation.

## Scenario 1 — `tier-vocab` reports the installation vocabulary + bucket bindings (US2, FR-003/FR-004a)

1. On an installation whose `.stack-control/config.yaml` has
   `tier_map: { fast: haiku, balanced: sonnet, powerful: opus }`, run:
   `./bin/stackctl tier-vocab --json`.
2. **Expected**: exit 0; stdout is a `TierVocab` with `configured:true`, three `labels` (each
   `model` = `tier_map[label]`), and `buckets = { cheapest: fast, mid: balanced, mostCapable:
   powerful }` (data-model Example A).
3. On an installation with `tier_map: { cheap: haiku, frontier: opus }` (two labels), the same
   command emits `buckets = { cheapest: cheap, mid: cheap, mostCapable: frontier }` — the two-label
   collapse (data-model Example B). *Unit proof (faster):* `tier-requirement.test.ts` asserts
   `bucketBindings` for the 2/3/4-label, tie, and fable-present cases.

## Scenario 2 — a spec authored through define is born tier-complete (US1, SC-001/SC-003)

1. On the `tier_map`-configured installation, author a spec through `/stack-control:define`; let the
   tasks-authoring step run (the seam runs `stackctl tier-vocab --json` and injects
   `renderTierRequirement(vocab)` into the `/speckit-tasks` drive, bracketed by the front-door
   marker — skills/define/SKILL.md).
2. **Expected**: the generated `tasks.md` carries a `[tier:<label>]` on **every** task, each label a
   key of that installation's `tier_map` (one of `fast`/`balanced`/`powerful`), each tag placed
   alongside any `[P]`/`[US n]` siblings.
3. Run `./bin/stackctl resolve-tiers --spec <dir>` — **exit 0**, a model resolved for every task,
   **zero** manual tier edits between generation and resolution (SC-001). `/stack-control:execute`
   then dispatches each task at its resolved model with no hand-backfilling (SC-003).

## Scenario 3 — vocabulary is the installation's own, never hardcoded (US2, SC-002)

1. On an installation whose `tier_map` keys are `{ cheap, mid, frontier }`, author a spec through
   `/stack-control:define` and let the tasks step run.
2. **Expected**: every generated `[tier:<label>]` label ∈ `{ cheap, mid, frontier }`; **none** is
   `fast`/`balanced`/`powerful`. `resolve-tiers` reports **zero** `unknown-tier` errors (SC-002).
   This is the correctness gap US2 names: the injected block's concrete-binding section (c) is
   rendered from *this* installation's `tier-vocab` output, not a hardcoded set.

## Scenario 4 — no `tier_map` → `[tier:UNSET]` + advisory, generation not blocked, floor refuses (FR-009, US4)

1. On an installation with **no** `tier_map` configured, run `./bin/stackctl tier-vocab --json`.
2. **Expected**: exit **0**; stdout `{configured:false, configPath}`; stderr a loud advisory naming
   the missing `tier_map` and the config path.
3. Author a spec through `/stack-control:define`; the tasks step (rendering the absent branch of
   `renderTierRequirement`) emits every task tagged `[tier:UNSET]` and reproduces the advisory.
   Generation is **not** blocked.
4. Run `./bin/stackctl resolve-tiers --spec <dir>` — **exit non-zero**; every `UNSET`-tagged task is
   a `no-map` error (the unchanged floor rejects it). `/stack-control:execute` dispatches nothing.
   The gap surfaced at the tasks phase (advisory) and again fail-loud at execute — no invented
   label, no silent default.

## Scenario 5 — the deterministic floor is preserved unchanged (US4, SC-004)

1. Take a born-complete `tasks.md` from Scenario 2. Remove one task's `[tier:]` tag.
2. Run `resolve-tiers` — **exit non-zero** with a `no-tier` error **naming that task**; `execute`
   dispatches nothing (SC-004). Replace the tag with an unknown label `[tier:nonsuch]` and re-run —
   **exit non-zero** with `unknown-tier`. The floor (033, untouched by this feature) is intact.

## Scenario 6 — operator override survives generation (US3, SC-005)

1. In a born-complete `tasks.md`, change one task from `[tier:balanced]` to `[tier:powerful]` during
   the define tasks review.
2. Run `resolve-tiers` — that task resolves to the `powerful`-mapped model (the edit is honored, not
   overwritten). Not re-running the tasks step does not clobber the reviewed file (SC-005).

## Scenario 7 — template exemplification + drift guard (FR-011/FR-012)

1. Inspect `.specify/templates/tasks-template.md`: its `## Format:` line lists `[tier:<label>]`
   among the per-task tags, its tier documentation carries the canonical format + heuristic clauses,
   and at least one sample task line carries a `[tier:<label>]` tag (FR-011).
2. Run the drift test: `npx vitest run tasks-template-drift`. **Expected**: green — the template's
   tier section contains `TIER_TAG_FORMAT_CLAUSE` and `TIER_HEURISTIC_CLAUSE` exported from
   `src/workflow/tier-requirement.ts`, a sample line carries a parser-shaped `[tier:]` tag, and the
   Format line documents the tag. Edit the canonical constant in TS without updating the template →
   the test goes RED (FR-012 single-sourcing enforced for the static template).

## What proves the feature

- All new/extended unit + contract tests pass RED-first then green (the deterministic floor):
  `accepted-models.test.ts` (MODEL_CAPABILITY_RANK set-equality + order), `tier-requirement.test.ts`
  (ranking 2/3/4-label + tie + fable; render contains syntax/heuristic/correct concrete labels;
  UNSET branch), `tier-vocab.test.ts` (configured/absent/malformed/no-installation), and
  `tasks-template-drift.test.ts` (FR-012).
- `define-tier-seam.test.ts` asserts `skills/define/SKILL.md` wires the injection (the seam
  references running `tier-vocab` and injecting `renderTierRequirement` — a behavioral wiring check
  where feasible, grep-style otherwise; see plan § Tests / D6).
- `npx vitest` green; `tsc --noEmit` clean; `stackctl check-front-door` exit 0 (the new verb's three
  registrations keep parity + help green).
- Scenarios 2–4 observed on a live `/stack-control:define` run against a `tier_map`-configured, a
  differently-labelled, and a `tier_map`-absent installation.
