# Phase 1 Data Model: Lifecycle Compass

All entities are plain data (Constitution Principle VI: behavior lives in focused engine
modules). New types extend `src/workflow/workflow-types.ts`; the compass composes the
existing 022 records (`WorkflowDoc`, `Phase`, `DerivedPhase`, `GovernConvergenceRecord`)
rather than introducing parallel state.

## Entity: Verdict

The classification of an intended action against an item's live phase. Spec Key Entity
"Compass verdict".

| Field | Type | Notes |
|---|---|---|
| `outcome` | `'on-course' \| 'ahead' \| 'behind' \| 'off-rail'` | FR-002 |
| `currentPhase` | `DerivedPhase` | the item's derived phase (reused from 022) |
| `intentPhase` | `PhaseId \| null` | the phase the intent maps to; null only for `off-rail` with no intent |
| `legitimateNext` | `PhaseId \| null` | the single legitimate next phase (null at terminal `shipped`) |
| `skippedStep` | `PhaseId \| null` | non-null ONLY when `ahead`; the first jumped phase (FR-002, SC-001) |
| `reason` | `string` | actionable message naming the violated invariant (for the skill refusal) |
| `exitCode` | `number` | 0 = proceed; non-zero = refuse (FR-003) |

**Verdict → exit code mapping** (FR-003):
- `on-course` → `0`
- `behind` → `0` (allow-with-note: re-entry/redundant)
- `ahead` → non-zero (distinct code: "skipped a step")
- `off-rail` → non-zero (distinct code: "no node / terminal side-state")

**Validation / invariants**:
- `skippedStep !== null` ⇔ `outcome === 'ahead'`.
- `off-rail` ⇒ either no roadmap node OR a terminal side-state; `currentPhase` reports
  the side-state when one applies (edge case: blocked/cancelled/retired).
- Re-run with no on-disk change yields an identical Verdict (FR-005 determinism).

## Entity: Intent

The action an agent declares it is about to take, mapped to the lifecycle phase that
action belongs to. Spec Key Entity "Intent".

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | a lifecycle skill/verb name (the `--intent` value) |
| `phase` | `PhaseId` | the phase the action belongs to |

**The vocabulary** is a fixed `Map<string, PhaseId>` (FR-004) built by inverting each
governed phase's `work:` skill (`Phase.work → Phase.id`) plus a small fixed set of
transition aliases. It is single-sourced from `WORKFLOW.md` (FR-007), not a second table.

**Validation**:
- An `--intent` value not present in the vocabulary throws `WorkflowError` → non-zero exit
  (FR-004; never silently `on-course`, never heuristically mapped).
- The vocabulary is total over the governed phases: every phase with a `work:` skill has an
  intent name; a phase whose `work` skill is missing from the map is a load-time error.

## Entity: Canonical Feature Identity

The single key the roadmap node, spec dir, govern, convergence record, and `close-related`
all resolve a feature through (FR-013, US6). Spec Key Entity "Canonical feature identity".

| Field | Type | Notes |
|---|---|---|
| `nodeId` | `string` | the roadmap node id (`<phase>:<codename>`) — THE canonical key |
| `specPointer` | `string \| null` | the node's `spec:` pointer (installation-relative spec dir) |
| `specDir` | `string \| null` | absolute, install-anchored spec dir (resolved from `specPointer`) |

**Resolution rule** (R7): identity is the **node id**, not `basename(specPointer)`. The
convergence record is keyed by `nodeId` (replacing today's `basename(item.spec)` key in
`workflow-context.ts` / `convergence-record.ts`) — eliminating the basename-collision class
(TASK-139). govern resolves "the feature" from the item's `specPointer` (FR-011), so the
compass, govern, the convergence record, and `close-related` agree (SC-005).

**Validation**:
- Two distinct items whose `specPointer` dirs share a basename MUST resolve to distinct
  `nodeId`s and distinct convergence records (SC-005).
- An item with a node but no `specPointer` is resolvable for compass orientation but not
  govern-runnable (the back-half gate is unsatisfiable until a spec is linked).

## Entity: Orphan Spec Dir (error condition)

A spec dir with no roadmap node — a hard error, not a passive reconcile note (FR-009, US3).

| Field | Type | Notes |
|---|---|---|
| `specDir` | `string` | the spec dir found with no referencing node |

**Behavior**: the compass returns `off-rail` naming the missing node; every spec-resolving
verb raises a hard error (FR-009). Through the supported authoring path, an orphan is
*unreachable* — capture-fusion creates the node in the same operation (FR-008, SC-003).

## Entity: Lifecycle Skill Precondition (the embedded gate)

The compass consultation that gates a skill's execution (FR-006). Spec Key Entity
"Lifecycle skill precondition". Not persisted — a runtime contract realized in
`src/lifecycle-precondition.ts` + each SKILL.md opening step.

| Field | Type | Notes |
|---|---|---|
| `item` | `string` | the roadmap item the skill operates on |
| `intent` | `string` | the skill's own name, passed as `--intent` |
| `verdict` | `Verdict` | the compass result; non-zero `exitCode` ⇒ hard refusal |

**Behavior**: a non-zero verdict ⇒ the skill performs **none** of its work and refuses loud,
naming the violated invariant + the skipped step (FR-006, SC-002). An `on-course`/`behind`
verdict ⇒ the skill proceeds (the gate is transparent on the happy path).

## Reused 022 entities (no schema change)

- `WorkflowDoc` / `Phase` / `Transition` / `Criterion` / `DerivePredicate` —
  `src/workflow/workflow-types.ts`. The compass reads `doc.phases` (ordered) for ordinal
  comparison and `phase.work` for the intent vocabulary.
- `DerivedPhase` — the compass's `currentPhase`, from `derivePhase` (no reimplementation).
- `GovernConvergenceRecord` — re-keyed by canonical identity (FR-013); shape unchanged
  except the key it is stored/looked-up under moves from spec-dir basename to `nodeId`.

## State transitions touched (FR-010 phased retirement)

The compass itself is read-only and stateless. The enforcement it adds:

- **Entry gate** (`captured`/no-node → authoring): orphan is a hard error; capture-fusion
  makes the node→spec creation atomic (US3). Enforced as a refusal now.
- **`governing → shipped`**: the transition refuses on an unmet exit gate rather than only
  reporting it (US5). Enforced as a refusal now (depends on govern being runnable — FR-011/12).
- **Mid-pipeline transitions**: remain advisory in the engine's `advance` path during
  migration; ORDER is still enforced by the compass embedded in the skills (FR-006/FR-010).
