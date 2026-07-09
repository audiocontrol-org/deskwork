# Feature Specification: Model-tier task annotation at the tasks-authoring seam

**Feature Branch**: `feature/model-tier-task-annotation`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "Surface the model-tier annotation requirement during the tasks-authoring phase so every generated tasks.md is born tier-complete."

**Design record**: `docs/superpowers/specs/2026-07-08-model-tier-task-annotation-design.md` (operator-approved 2026-07-08). **Roadmap item**: `impl:feature/model-tier-task-annotation`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - tasks.md is born tier-complete (Priority: P1)

An operator authors a spec through `/stack-control:define`. When the tasks-authoring step runs, the generated `tasks.md` already carries a resolvable `[tier:<label>]` on **every** task. The operator hands the spec straight to `/stack-control:execute`, which resolves each task's tier and dispatches at the right model — with **no** hand-backfilling of tiers.

**Why this priority**: This is the whole point of the feature. Today the producing side (`/speckit-tasks`) is tier-blind, so every generated `tasks.md` is untagged and every task trips execute's fail-loud `no-tier` gate, forcing the operator to backfill tiers by hand at execute time. Removing that friction — born-complete tasks — is the P1 outcome; without it the feature delivers nothing.

**Independent Test**: Author a spec through `/stack-control:define` on an installation with a configured `tier_map`, let the tasks step run, then run `stackctl resolve-tiers --spec <dir>` — it exits 0 with a model resolved for every task, with no manual edits between generation and resolution.

**Acceptance Scenarios**:

1. **Given** an installation with a configured `tier_map` (e.g. `fast/balanced/powerful`), **When** the `/stack-control:define` tasks step generates `tasks.md`, **Then** every task line carries a `[tier:<label>]` whose label is a key of that `tier_map`.
2. **Given** a `tasks.md` generated this way, **When** `stackctl resolve-tiers --spec <dir>` runs, **Then** it exits 0 and resolves a model for every task (no `no-tier` error).
3. **Given** the same `tasks.md`, **When** `/stack-control:execute` runs, **Then** it dispatches each task at its resolved model without the operator having added any tier annotation.

---

### User Story 2 - proposed tiers use the installation's own vocabulary (Priority: P2)

The tier the generator proposes for each task is drawn **only** from the enclosing installation's actual `tier_map` labels — never a hardcoded `fast/balanced/powerful` set. An operator whose `tier_map` uses different labels (e.g. `cheap/mid/frontier`) gets tasks tagged with *their* labels, which resolve cleanly.

**Why this priority**: A generator that emits labels absent from the project's `tier_map` merely trades a `no-tier` failure for an `unknown-tier` failure — the friction is not removed, just relocated. Vocabulary-awareness is what makes the born-complete guarantee real across installations. It is P2 (not P1) because on the dogfood installation the default labels happen to match; the correctness gap only appears on a differently-configured installation.

**Independent Test**: On an installation whose `tier_map` uses non-default labels, author a spec through `/stack-control:define`; confirm the generated `[tier:]` labels are all members of that installation's `tier_map` and that `resolve-tiers` reports no `unknown-tier` error.

**Acceptance Scenarios**:

1. **Given** an installation whose `tier_map` keys are `{cheap, mid, frontier}`, **When** the tasks step generates `tasks.md`, **Then** every `[tier:<label>]` label is one of `{cheap, mid, frontier}` and none is `fast/balanced/powerful`.
2. **Given** a generated `tasks.md`, **When** `resolve-tiers` runs, **Then** it reports zero `unknown-tier` errors.

---

### User Story 3 - operator override survives generation (Priority: P3)

The generator's proposed tiers are a starting point, not a verdict. The operator can review and change any proposed `[tier:]` during the `/stack-control:define` tasks review (before execute), and their edits are what `execute` dispatches on.

**Why this priority**: Assignment authority stays with the operator (operator owns scope). It is P3 because the born-complete proposal already delivers value on its own; override is the refinement that keeps the human in the loop. It layers on top of US1 without changing its mechanism.

**Independent Test**: After generation, edit one task's `[tier:]` to a different valid label, run `resolve-tiers`, and confirm the resolved model reflects the edited label (the edit is honored, not overwritten).

**Acceptance Scenarios**:

1. **Given** a generated `tasks.md` with a task tagged `[tier:balanced]`, **When** the operator changes it to `[tier:powerful]` and runs `resolve-tiers`, **Then** that task resolves to the `powerful`-mapped model.
2. **Given** an operator-edited `tasks.md`, **When** the tasks step is not re-run, **Then** the operator's edits are preserved (generation does not clobber a reviewed `tasks.md`).

---

### User Story 4 - the deterministic completeness floor is preserved (Priority: P1)

The existing `resolve-tiers` fail-loud gate remains the deterministic backstop: any task that still lacks a resolvable tier (a generation miss, a hand-edit that removed a tag, an unknown label) causes `execute` to refuse and dispatch nothing — no silent default. Born-complete is the common case produced by the generator; the gate is the guarantee that an incomplete `tasks.md` never dispatches.

**Why this priority**: P1 because it is a hard invariant, not an enhancement — the feature must not weaken or bypass the no-silent-default floor that feature 033 deliberately established (Constitution Principle V). The stochastic generator proposes; the deterministic gate guarantees. Losing the gate would let a generation miss dispatch at an inherited default, re-opening the exact gap 033 closed.

**Independent Test**: Remove one task's `[tier:]` from a generated `tasks.md` and run `resolve-tiers` — it must exit non-zero with a `no-tier` error naming that task, and `execute` must dispatch nothing.

**Acceptance Scenarios**:

1. **Given** a `tasks.md` with one untagged task, **When** `resolve-tiers` runs, **Then** it exits non-zero and names the untagged task (`no-tier`).
2. **Given** a `tasks.md` with an unknown label `[tier:nonsuch]`, **When** `resolve-tiers` runs, **Then** it exits non-zero with an `unknown-tier` error and `execute` dispatches nothing.

---

### Edge Cases

- **`tier_map` absent or empty on the installation.** What does the tasks step do when there is no `tier_map` to draw labels from? It must not invent labels or silently default. [NEEDS CLARIFICATION: when the installation has no `tier_map` configured, should the tasks step (a) emit tasks with a placeholder/`[NEEDS TIER]` marker + a loud advisory to configure `tier_map`, (b) refuse the tasks step until a `tier_map` exists, or (c) fall through to the existing resolve-tiers `no-map` error at execute time?]
- **`tier_map` with other than three labels, or non-ordinal labels.** The heuristic names three semantic buckets (cheapest / mid / most-capable). [NEEDS CLARIFICATION: how does the cheapest/mid/most-capable heuristic bind to a `tier_map` with two labels, four+ labels, or labels with no obvious ordinal ranking? Candidate: rank labels by the ordered capability of the accepted model each resolves to, then bucket against that ranking.]
- **A task genuinely spanning tiers** (a large task that is part-mechanical, part-architectural). The generator proposes a single tier; the operator override (US3) is the escape hatch. No task may be left multi-tiered or untagged.
- **Operator re-runs the tasks step after editing tiers.** Regeneration must not silently clobber reviewed tiers without the operator knowing (see US3 scenario 2).
- **A task carrying sibling tags** (`[P]`, `[US<n>]`) alongside `[tier:]` — the tier tag must coexist with the sibling tags the parser already recognizes and strips.
- **Native/direct `/speckit-tasks` use** outside the `/stack-control:define` front door — such use bypasses the injected requirement and produces untagged tasks; the deterministic floor (US4) still catches it at execute. The optional template exemplification (FR-011) mitigates but does not guarantee this path.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST surface the model-tier annotation requirement during the tasks-authoring phase driven by `/stack-control:define`, such that generation produces a `[tier:<label>]` on every task in `tasks.md`.
- **FR-002**: The tier requirement MUST be **injected at the `/stack-control:define` tasks seam** — mirroring how `/stack-control:design` injects house-rules into its backend — rather than by editing the vendored `/speckit-tasks` backend files (capability, not vendor — Constitution Principle III).
- **FR-003**: The injected requirement MUST be keyed off the **enclosing installation's actual `tier_map` labels**, read at authoring time through a `stackctl` read surface; proposed labels MUST be members of that `tier_map`. The system MUST NOT propose from a hardcoded label set.
- **FR-004**: The injected requirement MUST carry a stated per-task tier **heuristic**: mechanical / RED-test / doc-only work → the cheapest tier; standard implementation → the mid tier; cross-cutting, architectural, ambiguous, or high-blast-radius work → the most-capable tier. The heuristic is guidance the generator applies, not a hard rule.
- **FR-005**: The generated `tasks.md` MUST be tier-complete — every task line carries a resolvable `[tier:<label>]` — as the common-case outcome of the tasks step.
- **FR-006**: The system MUST preserve the existing `resolve-tiers` fail-loud completeness gate **unchanged**: any task lacking a resolvable tier causes `execute` to refuse and dispatch nothing, with a named error (`no-tier` / `unknown-tier`), no silent default (Constitution Principle V).
- **FR-007**: The system MUST preserve operator override — proposed tiers are editable in the `/stack-control:define` tasks review before execute, and a reviewed/edited `tasks.md` is not clobbered by generation without the operator's action.
- **FR-008**: The injected `[tier:]` tag MUST be syntactically compatible with the existing parser (`- [ ] T### [P?] [US?] [tier:<label>] <description>`) so that `resolve-tiers` accepts generated tasks without parser changes.
- **FR-009**: The system MUST define behavior when the installation has **no configured `tier_map`** (see the Edge Cases clarification) — it MUST NOT invent labels or introduce a silent default.
- **FR-010**: The system MUST define how the heuristic binds to a `tier_map` whose label count/ordinality differs from the three-bucket default (see the Edge Cases clarification).
- **FR-011** *(optional secondary — scope TBD by operator)*: The system MAY exemplify `[tier:]` in the plugin's `tasks-template.md` sample task lines and Format section, so that **direct/native** `/speckit-tasks` use (outside the front door) also models the tag. This is a mitigation, not the load-bearing mechanism, and does not replace FR-002.
- **FR-012** *(open — scope TBD)*: The injected tier requirement SHOULD be single-sourced (one rendered block, e.g. a `renderTierRequirement()` à la `renderHouseRules()`) so the `define` seam and any secondary exemplification (FR-011) derive from one definition and cannot drift.

### Key Entities *(include if feature involves data)*

- **Tier label**: an operator-defined semantic string (a `tier_map` key, e.g. `fast`/`balanced`/`powerful` or `cheap`/`mid`/`frontier`). Never a model identifier.
- **`tier_map`**: the installation-level mapping (in `.stack-control/config.yaml`) from tier label → accepted model. The authoritative source of the label vocabulary the generator may propose from.
- **Tiered task**: a `tasks.md` task line bearing a `[tier:<label>]` tag alongside its id and any sibling tags.
- **Tier heuristic**: the stated mapping from task nature (mechanical/standard/cross-cutting) to a semantic tier bucket, applied by the generator to propose a per-task tier.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A spec authored end-to-end through `/stack-control:define` on a `tier_map`-configured installation yields a `tasks.md` for which `resolve-tiers` exits 0 (every task resolved) with **zero** manual tier edits between generation and resolution.
- **SC-002**: For an installation whose `tier_map` uses non-default labels, 100% of generated `[tier:]` labels are members of that installation's `tier_map` (zero `unknown-tier` errors attributable to hardcoded vocabulary).
- **SC-003**: The manual tier-backfill step is eliminated from the define→execute path — an operator completes the path without hand-adding any `[tier:]` tag in the common case.
- **SC-004**: The no-silent-default invariant is provably intact — an intentionally-incomplete `tasks.md` (one tag removed) causes `execute` to refuse and dispatch nothing, verified by test.
- **SC-005**: An operator's tier edit made during the define review is the tier `execute` dispatches on (override honored), verified by test.

## Assumptions

- The consuming machinery (`stackctl resolve-tiers`, `src/execute/tasks-tier-parser.ts`, `src/execute/tier-resolution.ts`, `src/execute/accepted-models.ts`) exists, is correct, and is **unchanged** by this feature — this feature only affects the producing side and the seam.
- "The tasks phase" is the tasks-authoring step driven through the `/stack-control:define` front door (which sequences the native speckit authoring chain); that step is the injection seam.
- A `stackctl` read surface for the installation's `tier_map` vocabulary is available or will be added as part of this feature (see the design record open question — implementation-altitude, resolved at plan time).
- The tier-map label→model resolution and the `ACCEPTED_MODELS` set are owned by feature 033 and are out of scope here except as the resolution target the generated labels must satisfy.
- Feature 033's deliberately-deferred *configurable default tier* remains deferred; this feature does not introduce a default (born-complete is achieved by proposing a real tier, never by defaulting).
- The downstream `impl:feature/execution-engine` parallel engine consumes the same `[tier:]` annotation; born-complete tasks benefit it identically, with no coupling introduced here.
