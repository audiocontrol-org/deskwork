# Phase 0 Research: Un-skippable workflow protocol

How the existing primitives compose into the five enforcement surfaces. This feature
invents no new machinery; it wires 021 + 022 + 024 together and removes agent
discretion. Each decision below is grounded in an in-tree primitive.

## Decision 1 — Graduate gate composes from per-phase checkpoints (US1, FR-001/001a)

- **Decision**: The `governing → shipped` gate criterion requires every `tasks.md`
  phase to have a *current* 021 checkpoint, and the whole-feature `record-converged
  impl` signal is **derived** from the union of those checkpoints — there is no
  separate whole-feature govern run.
- **Rationale**: 021 already writes `phase-checkpoints/<feature>/phase-<id>.json` with a
  scope fingerprint, and already has a compose-from-checkpoints contract (referenced by
  TASK-120/124). Composing the graduate signal from checkpoints keeps one source of
  truth (per-phase), removes the whole-feature payload that produced `boundary-too-large`
  (167,657 vs 98,304 bytes), and reuses the 022 `record-converged`/`node-marker`
  criterion machinery rather than adding a parallel signal.
- **Alternatives considered**: (a) *augment* — require per-phase AND a separate
  whole-feature record: reintroduces the oversized whole-feature govern run this feature
  exists to kill (rejected by operator at clarify). (b) *replace* — per-phase only,
  retire `record-converged impl`: discards the existing graduate-signal plumbing and
  leaves non-phase-decomposed features without a path (rejected by operator).
- **Open implementation detail (→ data-model/contracts)**: the new criterion kind
  (`all-phase-checkpoints-current`) and how the composed-record reader keys phases off
  `tasks.md` headers. Staleness reuses 021 fingerprints unchanged.

## Decision 2 — Phase set derives from `tasks.md` headers; fail loud on missing file lists (US1, FR-004)

- **Decision**: The gate enumerates phases from `tasks.md` phase headers and **fails
  loud** naming the phase when a phase has no authoritative file list — never scopes a
  partial/empty payload.
- **Rationale**: TASK-70 documents that per-phase govern scoping is unsound without
  authoritative file lists; silently scoping an empty payload would let an empty/partial
  phase masquerade as governed (the AUDIT-class "empty phase approved" failure, cf.
  TASK-106/108). Fail-loud is Principle V.
- **Dependency**: TASK-70 is a precondition; this feature's gate fails loud rather than
  guessing when TASK-70's file lists are absent. (Captured as a spec dependency, not
  silently worked around.)
- **Alternatives considered**: infer files from git diff of the phase's commits —
  rejected: non-deterministic, and an un-checkpointed phase has no commit boundary yet.

## Decision 3 — `execute` fires `govern --phase` + commit/push as per-boundary post-conditions (US2/US3)

- **Decision**: The `execute` skill body runs `govern --phase <id>` then commit + push at
  each `tasks.md` phase boundary, as non-discretionary post-conditions; it refuses to
  start phase N+1 until phase N has a current checkpoint.
- **Rationale**: 021's `govern --phase` ALREADY FATALs when an earlier required
  checkpoint is missing (govern-time ordering enforcement is built). The remaining gap is
  purely *who fires it*: today the agent chooses; this feature makes `execute` fire it.
  Per-phase payloads are within the fleet envelope by construction, so `boundary-too-large`
  cannot occur on the sanctioned path. Commit/push mechanizes Principle VII.
- **Alternatives considered**: a git hook firing govern/commit/push — rejected
  (enforcement-lives-in-skills.md; does not travel with install; CI here is slow). A
  background daemon (TASK-26/audit-barrage-daemon) — out of scope; the cadence is
  synchronous in the execute loop.
- **Open implementation detail (→ contracts)**: where in `execute-check.ts` / the execute
  skill body the post-condition attaches; the oversized-single-phase fail-loud path
  (FR-008) points at TASK-75 right-sizing (no auto-split).

## Decision 4 — Speckit wrapper refuses direct backend invocations across the whole chain (US4)

- **Decision**: A stack-control-owned shim intercepts a direct invocation of any wrapped
  backend speckit skill (`/speckit-specify`, `/speckit-plan`, `/speckit-tasks`,
  `/speckit-implement`) and refuses loud, redirecting to the sanctioned front door
  (define/extend for authoring; execute for implement).
- **Rationale**: operator chose the broad scope at clarify — every front door is the only
  sanctioned path to its backend. Mirrors the 024 compass-precondition pattern: a refusal
  in the skill body / CLI verb that travels with `claude plugin install`. The per-phase
  graduate gate (Decision 1) is retained as defense-in-depth (FR-014).
- **Interception mechanism — two candidates (resolved at plan as: precondition block,
  with shadowing as fallback)**:
  - **(chosen) Injected precondition block** at the top of each vendored
    `.claude/skills/speckit-*/SKILL.md` (the same shape as the 024 compass precondition):
    a check that refuses unless invoked via its front door. Survives `speckit` re-vendor
    by being re-applied at vendor time (a documented vendoring step).
  - **(fallback) Shadowing skill** of the same name that intercepts and redirects.
    Heavier (name collisions, discovery) and harder to keep in sync.
  - The exact mechanism is finalized in `contracts/speckit-wrapper.md`; both are
    capability/skill-identity based, never vendor-identity (Principle III).
- **Honest boundary (FR-017)**: binds an agent following the skills; a human running the
  raw vendored script bypasses — not claimed otherwise. Decision 1 narrows the worst hole.

## Decision 5 — No agent-offered shortcuts is a skill-body invariant (US5)

- **Decision**: Every stack-control skill body is audited to contain zero skip/defer/
  shortcut affordances; the only operator-facing branches are operator-initiated scope
  decisions. Any override is a recorded operator override, never an agent-presented menu.
- **Rationale**: the demonstrated hole was the agent *offering* a "defer governance"
  option. This is enforced by (a) removing such affordances from skill bodies and (b) a
  doctor-style audit (grep for offer-to-skip phrasings) so a regression is caught.
- **Alternatives considered**: a runtime refusal when an agent emits a shortcut prompt —
  not mechanizable (the prompt is free text); the skill-body audit + review is the
  enforceable surface.

## Cross-cutting

- **Enforcement home**: all of the above live in `templates/WORKFLOW.md` (gate criterion),
  skill bodies (`execute`, the wrapped speckit skills, all stack-control skills), and CLI
  verbs (`govern`, the composed-record reader). None in `.husky/`/`.git/hooks/`.
- **Test substrate**: vitest fixtures with tmp installations (no mocked fs). Gate-eval and
  compass already have fixture suites to extend.

**Output**: all NEEDS CLARIFICATION resolved (there were none after clarify); design
ready for data-model + contracts.
