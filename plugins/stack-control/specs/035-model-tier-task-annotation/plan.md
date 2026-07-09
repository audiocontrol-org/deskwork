# Implementation Plan: Model-tier task annotation at the tasks-authoring seam

**Branch**: `feature/model-tier-task-annotation` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/035-model-tier-task-annotation/spec.md` (clarified 2026-07-08); design record `docs/superpowers/specs/2026-07-08-model-tier-task-annotation-design.md` (operator-approved 2026-07-08)

## Summary

Make every `tasks.md` authored through `/stack-control:define` **born tier-complete**: every task
line carries a resolvable `[tier:<label>]` at generation time, so the operator hands the spec
straight to `/stack-control:execute` with **no** hand-backfilling of tiers.

The gap is on the *producing* side. The consuming side — `parseTieredTasks`
(`src/execute/tasks-tier-parser.ts`), `resolveTier`/`resolveTasks`
(`src/execute/tier-resolution.ts`), `stackctl resolve-tiers`
(`src/subcommands/resolve-tiers.ts`), the `tier_map` config surface
(`src/config/config-loader.ts`), and the accepted-model capability set
(`src/execute/accepted-models.ts`) — already exists, is strict, and is **unchanged** by this
feature (spec Assumptions; design record Problem domain). What is missing is that `/speckit-tasks`,
the vendored backend that generates `tasks.md`, is tier-blind.

**Technical approach** — the chosen design (Alternative D in the design record): *inject the tier
requirement at the `/stack-control:define` tasks seam* (capability, not vendor — never edit the
vendored backend), keyed off the **enclosing installation's actual `tier_map` vocabulary**, with the
existing `resolve-tiers` gate remaining the deterministic completeness floor. Concretely this plan
adds two small new surfaces plus three thin edits, all single-sourced so the seam and the template
cannot drift:

- **D1 — a new read verb `stackctl tier-vocab [--json]`** (`src/subcommands/tier-vocab.ts`). Resolves
  the enclosing installation, loads its config, and emits the installation's tier labels, each
  label's resolved model, and the derived `{cheapest, mid, mostCapable}` bucket bindings. When
  `tier_map` is absent/empty it emits `{configured:false}` + a loud advisory naming the missing
  `tier_map` and the config path, **exit 0** (generation is not blocked — FR-009). It fails loud
  (non-zero) only on a malformed config or no enclosing installation. Read-only; mutates nothing.
- **D2 — a new single-source render module `src/workflow/tier-requirement.ts`** exporting
  `renderTierRequirement(vocab)` — parallel to `src/workflow/house-rules.ts`'s `renderHouseRules()`.
  It renders the markdown instruction block the define seam injects into the `/speckit-tasks` drive:
  the required `[tier:<label>]` per-task syntax (coexisting with `[P]`/`[US n]` siblings — FR-008),
  the per-task heuristic (FR-004), the **concrete bucket→label binding for this installation's
  vocab** (FR-004a), and the FR-009 no-`tier_map` instruction (emit `[tier:UNSET]` + advisory). It
  exports the shared canonical-string constants (FR-012) that both the seam injection and the
  template drift test consume.
- **D3 — an explicit capability ranking** on `src/execute/accepted-models.ts`
  (`MODEL_CAPABILITY_RANK`), plus a pure ranking function that maps a `TierMap` to the
  `{cheapest, mid, mostCapable}` bucket bindings deterministically for any label count/naming.
- **D4 — the `/stack-control:define` tasks-authoring seam wiring** (`skills/define/SKILL.md`): before
  driving `/speckit-tasks`, run `stackctl tier-vocab --json` and inject `renderTierRequirement(vocab)`
  into the backend conversation — mirroring `skills/design/SKILL.md` step 2's `renderHouseRules`
  injection, bracketed by the existing front-door `enter`/`exit` marker.
- **D5 — template exemplification + drift guard** (`.specify/templates/tasks-template.md`): add
  `[tier:<label>]` to sample task lines + the Format line + the tier documentation (FR-011). Because
  a static template cannot call the TS render function, single-sourcing (FR-012) is realized by a
  **drift test** asserting the template's tier section contains the canonical format + heuristic
  strings exported from `tier-requirement.ts`.

The stochastic generator *proposes* a real tier per task; the deterministic `resolve-tiers` floor
*guarantees* completeness at execute — no silent default, ever (Principle V; FR-006; US4).

## Technical Context

**Language/Version**: TypeScript (strict), Node ESM, run via `tsx`. No `any`/`as`/`@ts-ignore`
(Principle VI). Relative `.js` ESM imports, matching the existing `src/` convention.

**Primary Dependencies**: existing in-repo only — the `src/config` config-loader + installation
resolver (`findInstallation`, `loadInstallationConfig`, `StackControlConfig.tierMap`), the
`src/execute/accepted-models.ts` capability constant, the `src/cli.ts` flat dispatcher +
`src/cli-help/` descriptor surface. **No** new npm dependency; **no** runtime dependency on the
superpowers plugin; **no** edit to the vendored `/speckit-tasks` backend files.

**Storage**: read-only. `tasks-vocab` reads `.stack-control/config.yaml` (`tier_map`) through the
existing loader; the render module is pure (no I/O); the template is a static file. This feature
writes no installation state.

**Testing**: Vitest (`src/__tests__/`), TDD-first (Principle I). The entire differentiated surface
— the ranking function, the render block, the verb, and the template drift guard — is
deterministically unit-testable on config/`tasks.md`/template fixtures. Every FR/SC lands a RED test
on a fixture before implementation (see § Tests / D6).

**Target Platform**: Claude Code and Codex interactive sessions (Principle IX targets). The seam
injection is host-agnostic — the define skill drives whatever backend authors `tasks.md` without
branching on which one (Principle III).

**Project Type**: Single-project CLI plugin (`plugins/stack-control/`).

**Performance Goals**: N/A. `tier-vocab` is an O(labels) resolution over a handful of tier labels;
the render is O(labels). No throughput target.

**Constraints**: born-complete is the common-case *generation* outcome, never a dispatch-time
default; the `resolve-tiers` fail-loud floor is preserved **unchanged** (FR-006); proposed labels
are drawn **only** from the enclosing installation's actual `tier_map` (FR-003); the no-`tier_map`
path emits `[tier:UNSET]` + advisory and does **not** block generation (FR-009); the seam injection
and the template exemplification derive from **one** single source (FR-012).

**Scale/Scope**: `tier_map`s of 1–5 labels (the real on-disk range; the dogfood config uses three:
`fast`/`balanced`/`powerful`). `tasks.md` plans of ~10–80 tasks.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | How this plan complies |
|---|---|---|
| **I. Test-First (NON-NEGOTIABLE)** | PASS | Every differentiated unit — the ranking function, `renderTierRequirement`, the `tier-vocab` verb, and the template drift guard — lands a RED test on a fixture before implementation (§ Tests / D6). The verb's four states (configured / absent / malformed / no-installation), the render block's required content, and the ranking's edge cases (2/3/4-label, ties, fable-present) are each a failing test first. |
| **II. Integration-First, No Speculative Building** | PASS | Built over the **real** consuming machinery (033, shipped) and the **real** `tier_map`/`tasks.md` instances — the seam injection mirrors the already-proven `renderHouseRules` pattern (022). No imagined abstraction: the ranking function and verb exist because FR-003/FR-004a/FR-009 need them concretely. Capture-over-YAGNI is honored — every locked decision (D1–D6) and edge case is carried, none cut. |
| **III. Branch on Capabilities, Never Provider Identity** | PASS | The seam injection does **not** branch on which backend authors `tasks.md` (D4). Proposed tiers are drawn from operator `tier_map` labels resolved through the **accepted-model capability set** (`MODEL_CAPABILITY_RANK` lives beside `ACCEPTED_MODELS` — the single model-vocabulary source), never a hardcoded/vendor label list (FR-003). `fable`'s rank is a *declared deterministic ordering*, explicitly not an absolute-capability claim. |
| **IV. Division of Labor** | PASS | `tasks.md` remains INTENT authored by the generator + operator; this feature never writes tiers back after review (operator override survives — FR-007/US3). The verb + render module are read-only producers of guidance; the deterministic gate (progress-side) is unchanged. |
| **V. No Fallbacks, No Mock Data Outside Tests** | PASS | Born-complete is achieved by *proposing a real tier*, never by defaulting an unresolved task at dispatch (design record Decision 2). The no-`tier_map` path emits an explicit `[tier:UNSET]` sentinel + loud advisory — **not** an invented label or silent default — and the `resolve-tiers` floor rejects `UNSET` fail-loud at execute (FR-009). `tier-vocab` fails loud on malformed config / no installation. 033's deferred *configurable default tier* stays deferred. |
| **VI. Strict Typing & Composition** | PASS | New code is small composed pure functions over `readonly` shapes: the ranking function is pure; `renderTierRequirement` is a pure string builder; `tier-vocab.ts` mirrors `resolve-tiers.ts`'s strict-arg-parse + fail-loud style. No inheritance, no `any`/`as`/`@ts-ignore`. Every new file is well under the 300–500-line cap (§ Complexity Tracking notes the one file to watch). |
| **VII. Commit & Push Early and Often** | PASS | One logical change per task (RED test → impl), pushed at each boundary, no AI attribution. |
| **VIII. Faithful Tool Adoption** | PASS | The feature *strengthens* faithful adoption: it injects opinion at the seam rather than forking the vendored `/speckit-tasks` backend, and the define seam continues to drive Spec Kit's chain in order (`specify → clarify → plan → checklist → tasks → analyze`). This plan is itself the in-order `plan` step. |
| **IX. Execution-Backend Pluggability (capability, not vendor)** | PASS | The `[tier:]` annotation this feature makes born-complete is exactly what capability-based *execution-backend* selection consumes downstream (`impl:feature/execution-engine`); the feature introduces no backend-selection branch and no vendor coupling. Ranking is by declared model-capability order, not vendor identity. |

**Gate result: PASS** — no violation, no justified-exception needed. The two new surfaces (the verb
+ the render module) are justified by FR-002/FR-003/FR-012 (see § Complexity Tracking). Proceed to
Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/035-model-tier-task-annotation/
├── plan.md                          # This file (/speckit-plan output)
├── spec.md                          # Clarified spec (FR-001..FR-012, FR-004a)
├── research.md                      # Phase 0 — decisions for the seam + verb + ranking
├── data-model.md                    # Phase 1 — TierVocab, ranking algorithm, render I/O, shared constants
├── quickstart.md                    # Phase 1 — runnable end-to-end validation scenarios
├── contracts/
│   ├── tier-vocab-verb.md           # the new `stackctl tier-vocab` verb contract (D1)
│   └── render-tier-requirement.md   # the injected render-block contract + shared constants + drift invariants (D2/D5)
├── checklists/
└── tasks.md                         # Phase 2 (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root: `plugins/stack-control/`)

```text
src/workflow/tier-requirement.ts            # NEW — single source (D2/FR-012): renderTierRequirement(vocab)
                                            #   + the shared canonical-string constants; parallels house-rules.ts
                                            # (ranking function placement: see Structure Decision below)

src/execute/accepted-models.ts              # MODIFIED — add MODEL_CAPABILITY_RANK (D3/FR-004a);
                                            #   stays the single model-vocabulary source (Principle III/IX)

src/subcommands/tier-vocab.ts               # NEW — `stackctl tier-vocab [--json]` read verb (D1)

src/cli.ts                                  # MODIFIED — register `tier-vocab` in SUBCOMMANDS
src/cli-help/surfaces/spec-misc.ts          # MODIFIED — add the `tier-vocab` --help descriptor (parity)
src/capability/fronted-operations.ts        # MODIFIED — add `tier-vocab` to INTERNAL_VERBS (read-only,
                                            #   fronted by the define skill like resolve-tiers — no standalone skill)

skills/define/SKILL.md                      # MODIFIED — tasks-seam injection step (D4/FR-002): run
                                            #   `tier-vocab --json`, inject renderTierRequirement output into
                                            #   the /speckit-tasks drive, bracketed by the front-door marker

.specify/templates/tasks-template.md        # MODIFIED — exemplify [tier:] in sample lines + Format line
                                            #   + tier docs (D5/FR-011); asserted by the drift test

src/__tests__/execute/accepted-models.test.ts        # EXTENDED — MODEL_CAPABILITY_RANK assertions
src/__tests__/workflow/tier-requirement.test.ts      # NEW — render + ranking unit tests (D6)
src/__tests__/subcommands/tier-vocab.test.ts         # NEW — verb contract test (configured/absent/malformed/no-install)
src/__tests__/workflow/tasks-template-drift.test.ts  # NEW — template↔constants drift guard (D5/FR-012)
src/__tests__/skills/define-tier-seam.test.ts        # NEW — wiring assertion that SKILL.md references the injection
src/__tests__/execute/fixtures/                       # EXTENDED — config + template fixtures as needed
```

**Structure Decision**: Single-project CLI plugin. The differentiated logic is one new render module
(`src/workflow/tier-requirement.ts`, mirroring `house-rules.ts`) plus one new read verb
(`src/subcommands/tier-vocab.ts`, mirroring `resolve-tiers.ts`), plus the explicit capability-rank
constant added to the existing single model-vocabulary source (`accepted-models.ts`). **Ranking
function placement**: the pure ranking function (`TierMap → {cheapest, mid, mostCapable}`) lives in
`src/workflow/tier-requirement.ts` beside `renderTierRequirement` — the render block is its only
consumer, keeping the bucket-binding logic and the text that describes it in one module and one test
file (avoids a two-file dependency for a ~40-line pure function). It imports `MODEL_CAPABILITY_RANK`
from `accepted-models.ts` (the single model-vocabulary source stays authoritative; the ranking
function does not re-declare model names). The `tier-vocab` verb consumes the same ranking function
so the JSON it emits and the block the seam injects agree by construction. The seam wiring is prose
discipline in `skills/define/SKILL.md` (no generated script); the template edit is exemplification
guarded by a drift test — the template cannot call TS, so the shared string constants + the drift
test are the single-sourcing mechanism (FR-012).

## Testing Strategy (D6 — Test-First, Principle I)

Every differentiated unit lands a RED test on a fixture before implementation (RED → watch it fail
for the right reason → minimal green). All new files stay under the 300–500-line cap; the file to
watch is `src/workflow/tier-requirement.ts` (render text + shared constants + ranking function) —
see § Complexity Tracking for the planned split trigger.

| Test file | Cases (each RED-first) | Covers |
|---|---|---|
| `src/__tests__/execute/accepted-models.test.ts` (extended) | `MODEL_CAPABILITY_RANK` equals `['haiku','sonnet','opus','fable']` in order; its members set-equal `ACCEPTED_MODELS` (no drift); `rankOf` returns the right index; an unknown model fails loud. | D3/FR-004a |
| `src/__tests__/workflow/tier-requirement.test.ts` (new) | **Ranking**: `bucketBindings` for 3-label `fast/balanced/powerful` (Example A), 2-label collapse `mid=cheapest` (Example B), 4-label lower-middle (Example C), a tie broken by label-ascending (Example D), single-label (Example E), and a fable-present map. **Render**: the block contains the `[tier:<label>]` syntax clause, the heuristic clause, and the correct concrete bucket labels for a given vocab; the absent branch emits the `[tier:UNSET]` instruction + advisory and names no concrete labels. | D2/D3, FR-004/FR-004a/FR-008/FR-009 |
| `src/__tests__/subcommands/tier-vocab.test.ts` (new) | The four states on config fixtures: **configured** (exit 0, correct `TierVocab` JSON + buckets), **absent** (exit 0, `{configured:false}` + advisory on stderr), **malformed** (non-zero, loader's fail-loud message, no partial vocab), **no-installation** (exit 1, names `stackctl setup`). Strict-arg-parse: unknown flag / stray positional ⇒ exit 2. | D1, FR-003/FR-009 |
| `src/__tests__/workflow/tasks-template-drift.test.ts` (new) | The template's tier section contains `TIER_TAG_FORMAT_CLAUSE` and `TIER_HEURISTIC_CLAUSE` (exported from `tier-requirement.ts`); a sample task line carries a parser-shaped `[tier:]` tag; the `## Format:` line documents `[tier:<label>]`. Editing a constant without the template goes RED. | D5, FR-011/FR-012 |
| `src/__tests__/skills/define-tier-seam.test.ts` (new) | Wiring assertion that `skills/define/SKILL.md` references the injection — the tasks-seam step names running `stackctl tier-vocab` and injecting `renderTierRequirement`, bracketed by the front-door marker. **Note (D6):** a behavioral check is preferred where feasible; the seam is skill-body prose the agent executes (not a callable function), so this is a content/structural assertion over the SKILL.md — called out explicitly as grep-style rather than executing the seam. If a thin extractable helper emerges during implementation, prefer asserting on it. | D4, FR-002 |

Existing untouched suites (`resolve-tiers.test.ts`, `tasks-tier-parser.test.ts`,
`tier-resolution.test.ts`) remain green — they are the deterministic floor this feature preserves
(US4); no change to them is expected, and their staying green is itself a regression check that the
producing-side work did not perturb the consuming side.

## Complexity Tracking

> Filled because the plan adds two new source surfaces; neither is an unjustified abstraction.

| New surface | Why needed | Simpler alternative rejected because |
|---|---|---|
| `stackctl tier-vocab` verb (D1) | FR-002/FR-003 require the seam to read the installation's *actual* `tier_map` vocabulary at authoring time through a `stackctl` read surface — the same shape as `resolve-tiers` reading it at execute time. A verb gives a testable, fail-loud, JSON boundary the skill body can call and the tests can pin. | Reading raw config inline in the skill body was rejected: it would put YAML parsing + installation resolution + bucket-binding into prose the skill improvises each run (unstable, untestable, and it would re-derive the bucket bindings the render block needs). The verb is the deterministic, unit-tested boundary — matching how `resolve-tiers` fronts the same config read for the execute skill. |
| `renderTierRequirement()` render module (D2) | FR-012 requires the seam injection (FR-002) and the template exemplification (FR-011) to derive from **one** single source so they cannot drift. `renderHouseRules()` (022) is the proven precedent for exactly this "one block, injected into a backend conversation" pattern. | A hand-written injection string in the skill body + a separately hand-edited template was rejected: two hand-maintained copies of the same requirement drift the moment one is edited — the exact failure FR-012 forbids. The shared exported constants + the drift test make drift a failing test, not a silent regression. |

*No constitution violations to justify.* Both surfaces are the minimum needed to satisfy
FR-002/FR-003/FR-012 concretely; each mirrors an existing, shipped in-repo pattern (`resolve-tiers`,
`renderHouseRules`). **File-size watch (Principle VI):** `src/workflow/tier-requirement.ts` carries
the render block text + the shared constants + the ranking function; if it approaches the 300–500
line cap the ranking function moves to a sibling `src/workflow/tier-ranking.ts` (the render module
imports it) — noted so the split is a planned move, not a surprise. `accepted-models.ts` gains only
the `MODEL_CAPABILITY_RANK` constant (a few lines) and stays well within the cap.
