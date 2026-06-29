# Implementation Plan: Model-Sized Dispatch — Declarative Per-Task Model Tiers

**Branch**: `033-model-sized-dispatch` | **Date**: 2026-06-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/033-model-sized-dispatch/spec.md` (revised
adopt-superpowers direction)

## Summary

Make `/stack-control:execute` dispatch each `tasks.md` task to a **fresh subagent**, adopting the
**superpowers subagent-driven-development discipline** (isolated per-task brief, test-first,
task-review loop, durable progress ledger, parallel-for-independent by controller judgment) —
applied *within* stack-control's own execute skill, with **no hard dependency** on the
superpowers plugin. On top of that adopted discipline, this feature adds the one mechanical,
testable thing it owns: a **declarative per-task model-tier layer**. Each task names a semantic
tier (`[tier:fast]`); an operator-configured **tier map** in `.stack-control/config.yaml`
resolves the tier to a concrete model; the dispatch specifies that model **explicitly**, and a
pre-dispatch **resolve step fails loud** on any missing/unknown tier or absent/malformed map,
reporting the complete error set before any subagent runs.

**Technical approach**: keep the build tiny and put the only differentiated logic — tier parsing
+ resolution + fail-loud validation — behind a unit-testable CLI boundary (the TDD floor); the
execute skill drives the adopted dispatch discipline and consults that verb.

- **CLI core** (`src/execute/`): parse per-task `[tier:]` tags from `tasks.md`; resolve each
  tier against the configured tier map; emit a per-task `{id, tierLabel, model}` resolution, or
  fail loud listing **all** tier errors. No DAG, no scheduler, no cycle detection (out of scope
  per FR-012 / spec direction).
- **Config** (`src/config/`): additive `tier_map` on the existing `InstallationConfig`, parsed
  by the existing fail-loud config-loader, with values validated against the dispatch surface's
  accepted model set.
- **One CLI verb** `stackctl resolve-tiers --spec <dir>`: the pre-dispatch gate (FR-004/005/006/008).
- **Skill** (`skills/execute/SKILL.md`): rewrite the dispatch step to adopt the subagent-per-task
  discipline — run `resolve-tiers` first; dispatch each task's subagent with its resolved model
  explicitly; maintain the durable ledger; let ordering/parallelism be controller judgment.

Everything dropped from the prior (mechanical-engine) draft — the dependency DAG, cycle
detector, ExecutionGraph/RunReport verbs, and the Workflow driver script — is **not built**
(adopt superpowers' stance as-is).

## Technical Context

**Language/Version**: TypeScript (strict), Node ESM (run via `tsx`). No harness Workflow script
is built (dispatch is the skill's adopted subagent discipline, not a generated script).

**Primary Dependencies**: existing in-repo only — `yaml` (config), the existing `src/config`
config-loader + installation resolver, the existing `src/cli.ts` dispatcher. **No** new npm
dependency and **no** runtime dependency on the superpowers plugin (FR-013).

**Storage**: `tasks.md` (read-only input; the per-task `[tier:]` tag is new on-disk metadata);
`.stack-control/config.yaml` (additive `tier_map`). A durable progress ledger for resume
(FR-010) — reuse/extend the project's existing session/ledger surface rather than invent a new
store (confirmed in research).

**Testing**: Vitest (`src/__tests__/`), TDD-first (Principle I). The tier parser + resolver +
config validation are fully unit-testable on `tasks.md`/config fixtures — this is the entire
differentiated surface, so test coverage is high by construction.

**Target Platform**: Claude Code and Codex interactive sessions (Principle IX targets). The
adopted discipline is host-agnostic; the explicit-model dispatch uses each host's subagent
mechanism.

**Project Type**: Single-project CLI plugin (`plugins/stack-control/`).

**Performance Goals**: N/A as a throughput target — this feature does not own scheduling
(FR-012). The cost/speed benefit comes from right-sized models per task (declarative), not from
a parallel engine.

**Constraints**: fully unattended tier resolution; fail-loud on any missing/unknown tier,
absent/malformed map, or out-of-range model value, **before** any dispatch (FR-004/005/006/008,
SC-002); no silent fallback to a default/session model (Principle V); self-contained — identical
behavior with superpowers absent (FR-013, SC-006).

**Scale/Scope**: `tasks.md` plans of ~10–80 tasks (the real on-disk range).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | How this plan complies |
|---|---|---|
| **I. Test-First (NON-NEGOTIABLE)** | ✅ PASS | The only differentiated logic (tier parse, tier resolution, config validation) lives in the CLI core where it is unit-testable; every FR/SC lands a RED test on a fixture before implementation. The dispatch discipline is the adopted superpowers practice (the subagents themselves work test-first). |
| **II. Integration-First, No Speculative Building** | ✅ PASS | Built as a thin layer over a **real, adopted, proven** discipline (superpowers SDD) and the **real** `tasks.md`/config instances — not an imagined engine. The mechanical-engine abstraction the prior draft proposed is explicitly **not** built (it would have been designing scheduling ahead of specs/002's concrete need). Scope cuts here are operator-authored decisions (2026-06-28), not agent-inserted. |
| **III. Branch on Capabilities, Never Provider Identity** | ✅ PASS | Tier resolution maps a declared label → model via operator config only; it never branches on vendor identity. Tier labels are operator data; model values are validated against the dispatch surface's accepted-model *capability* set, not a hardcoded vendor list. |
| **IV. Division of Labor** | ✅ PASS | `tasks.md` is read-only INTENT (the `[tier:]` tag is authored by whoever wrote the plan; the engine never writes it). stack-control owns PROGRESS (the ledger). One-way projection: tasks.md tier → resolved model → execution record. |
| **V. No Fallbacks, No Mock Data Outside Tests** | ✅ PASS | Missing tier, unknown tier, absent/malformed map, out-of-range model → named loud error and refusal to dispatch; full error set surfaced before any dispatch. **No** silent default/session-model fallback (a configured default tier is explicitly deferred as it would be a fallback). |
| **VI. Strict Typing & Composition** | ✅ PASS | New code: small composed pure functions over `readonly` shapes (no inheritance), `@/`-style relative `.js` ESM imports, no `any`/`as`/`!`/`@ts-ignore`, well under the 300–500-line cap (parser + resolver are tiny). |
| **VII. Commit & Push Early and Often** | ✅ PASS | One logical change per task, pushed at each boundary, no AI attribution. (The adopted discipline's per-task subagents commit their own work; the host serializes per the ledger.) |
| **VIII. Faithful Tool Adoption** | ✅ PASS — strengthened | This feature *is* a faithful adoption: rather than reinventing subagent execution, it adopts superpowers' proven discipline and contributes the missing declarative-tier piece. The spec→plan→tasks chain is itself followed in order via the stack-control front door (this is the `plan` step). |
| **IX. Execution-Backend Pluggability (capability, not vendor)** | ✅ PASS | The feature owns no backend selection mechanism (it adds none — FR-012). It selects a *model* by declared tier (capability label), never a vendor. The two-backend execution port remains specs/002's concern; nothing here couples to a vendor CLI. No deferral needed — the mechanical-engine scope that previously triggered the Principle IX note is no longer in this feature. |

**Gate result: PASS** — no violation, no justified-exception needed (the prior draft's Principle
IX deferral is moot now that no mechanical engine is built). Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/033-model-sized-dispatch/
├── plan.md              # This file
├── spec.md              # Revised spec (adopt-superpowers direction)
├── research.md          # Phase 0 — design decisions for the thin tier layer
├── data-model.md        # Phase 1 — tier entities + resolution rules
├── quickstart.md        # Phase 1 — runnable validation scenarios
├── contracts/
│   ├── resolve-tiers-verb.md   # the one CLI verb contract
│   └── tier-map-config.md      # the tier_map config contract
├── checklists/
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root: `plugins/stack-control/`)

```text
src/execute/                          # NEW — thin tier layer (TDD floor)
├── tasks-tier-parser.ts              # tasks.md → TieredTask[] { id, body, tierLabel? } (reads [tier:] tag)
└── tier-resolution.ts                # tier label + TierMap → ResolvedModel | TierError; collect all errors

src/config/                           # EXTENDED
├── types.ts                          # + TierMap; InstallationConfig.tierMap?
└── config-loader.ts                  # + parse/validate tier_map (mirror parsePaths; fail-loud; model-set check)

src/subcommands/                      # NEW verb, registered in src/cli.ts
└── resolve-tiers.ts                  # `stackctl resolve-tiers --spec <dir>` → per-task {id,tier,model} JSON | fail-loud

skills/execute/SKILL.md               # EXTENDED — dispatch step adopts subagent discipline + explicit model from tier

src/cli.ts                            # EXTENDED — register resolve-tiers
src/__tests__/execute/                # NEW — fixtures + unit tests (parser, resolver, config validation)
```

**Structure Decision**: Single-project CLI plugin. The differentiated logic is two small
modules under `src/execute/` plus one CLI verb; the tier map extends the existing
`InstallationConfig` (no new store). The dispatch discipline lives in the rewritten
`skills/execute/SKILL.md` (prose discipline the skill applies) — there is **no** generated
harness script and **no** mechanical scheduler. The accepted-model set is a dispatch-surface
capability constant the tier-map validator consults (Principle III).

## Complexity Tracking

*No constitution violations to justify.* The feature deliberately removes complexity relative to
the prior mechanical-engine draft: the DAG scheduler, cycle detector, ExecutionGraph/RunReport
verbs, and Workflow driver are not built (operator decision 2026-06-28 — adopt superpowers'
stance; this feature is the thin declarative-tier layer only).
