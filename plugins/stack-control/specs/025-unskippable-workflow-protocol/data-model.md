# Phase 1 Data Model: Un-skippable workflow protocol

Entities are mostly existing 021/022 artifacts; this feature adds one criterion kind, a
composed-record derivation, and a wrapper refusal record. No new persisted store beyond
what 021 already writes.

## Entity: Per-phase govern checkpoint (existing — 021)

- **Path**: `.stack-control/govern/phase-checkpoints/<feature>/phase-<id>.json`
- **Fields** (021, unchanged): phase id; convergence outcome; **scope fingerprint** (hash
  of the phase's governed file set + content); timestamp; fleet/round metadata.
- **Currency rule**: a checkpoint is *current* iff its scope fingerprint matches the
  phase's present content. A phase edited after its checkpoint → fingerprint mismatch →
  stale → gate reopens (FR-003). Reuses 021 fingerprinting unchanged.
- **Validation**: per-phase ordering is enforced at write time (021 `govern --phase N`
  FATALs if an earlier required checkpoint is missing).

## Entity: Composed graduate signal (new derivation — US1 compose, FR-001a)

- **Derived from**: the union of all current per-phase checkpoints for the feature.
- **Represents**: the whole-feature `record-converged impl` signal, **composed** (not
  produced by a separate whole-feature govern run). Consumed by reconcile + reporting and
  any reader of `record-converged impl`.
- **Rule**: the signal is "converged" iff every `tasks.md` phase has a current checkpoint.
  No whole-feature payload is ever assembled or sent to the fleet.
- **Relationship to the gate (C1, resolved 2026-06-16)**: the `governing → shipped`
  **gate criterion is `all-phase-checkpoints-current`** (the criterion below) — that is
  what the gate evaluates. The composed `record-converged impl` signal is the **derived
  artifact** the criterion's success also writes (for reconcile/reporting), NOT a second,
  separately-run criterion: one evaluation (all checkpoints current) yields both the gate
  verdict and the composed record. The legacy standalone whole-feature `record-converged
  impl` *production* path (a separate govern run) is retired.

## Entity: Graduate gate criterion (new criterion kind — US1, FR-001/005)

- **Name**: `all-phase-checkpoints-current` (the finalized criterion-kind name; see
  contracts/graduate-gate.md).
- **Where**: published in `templates/WORKFLOW.md` on the `graduate` transition
  (`governing → shipped`) and on `start-governing` (`implementing → governing`, FR-002),
  so adopters inherit it via `claude plugin install`.
- **Evaluation** (022 gate-eval): enumerate phases from `tasks.md` headers (FR-004 — fail
  loud naming the phase if a phase has no authoritative file list); for each phase, assert
  a current checkpoint exists; met iff all are current.
- **Failure modes**: missing checkpoint → unmet, names the phase; stale checkpoint →
  unmet, names the phase; missing file list → FATAL (Principle V), names the phase; zero
  derivable phases → FATAL (not trivially-met).

## Entity: Execute cadence post-condition (new behavior — US2/US3)

- **Trigger**: completion of each `tasks.md` phase inside `/stack-control:execute`.
- **Actions (ordered)**: (1) `govern --phase <id>` → writes the phase checkpoint; (2)
  `git commit` (lands locally first — work safe); (3) `git push` (fail-loud on failure,
  commit intact, never `--no-verify`). Refuse to begin phase N+1 until phase N checkpoint
  is current.
- **Oversized-phase rule**: if a single phase's payload exceeds the fleet envelope, fail
  loud with `boundary-too-large` pointing at TASK-75 right-sizing — never auto-split.

## Entity: Speckit wrapper refusal (new — US4; CORRECTED 2026-06-16)

- **Subject**: a direct invocation of a wrapped backend skill (`/speckit-specify`,
  `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`).
- **Behavior**: a portable `stackctl` refusal verb maps the backend skill identity to its
  sanctioned front door and emits a loud redirect (specify/plan/tasks →
  `/stack-control:define`|`/stack-control:extend`; implement → `/stack-control:execute`).
  Branches on skill identity, never vendor identity (Principle III). Pure function over the
  skill name → no host/fs dependency.
- **Home**: `stackctl` (`src/speckit-wrapper/refusal.ts` — the redirect map) + the plugin's
  cross-vendor `commands/*.md` (and `skills/*/SKILL.md`) adapters that call it. Travels with
  `claude plugin install` and surfaces identically under Codex. **NOT** an injected block in
  the adopter's `.claude/skills/speckit-*` (corrected — those are the adopter's own Spec Kit,
  not plugin-controlled; `.claude/skills/` is Claude-only).
- **Defense-in-depth (the teeth)**: the per-phase graduate gate (US1, pure `stackctl`) — a raw
  backend-speckit path cannot graduate without per-phase checkpoints, on any host (FR-014).
- **Follow-on (filed)**: cross-vendor point-of-invocation interception of a *raw* backend
  call (`design:gap/speckit-bypass-point-of-invocation-refusal`) — out of 025 scope.

## Entity: Shortcut-affordance audit (new — US5)

- **Subject**: every stack-control `skills/*/SKILL.md` body.
- **Invariant**: zero skip/defer/shortcut affordances; operator-facing branches are
  operator-initiated scope decisions only.
- **Check**: a doctor-style audit (phrase grep) so a regression is caught; the audit is
  the enforceable surface (the prompt text itself cannot be runtime-gated).

## State transitions touched

```text
implementing --(start-governing: all-phase-checkpoints-current for completed phases)--> governing
governing    --(graduate: all-phase-checkpoints-current ∀ tasks.md phases; composed record)--> shipped
```

No new lifecycle phases (the eight-phase WORKFLOW vocabulary is unchanged); only two
existing transition exit-gates gain the per-phase criterion.
