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

## Implementation anchors (T001 — inventory of the primitives this feature wires)

Recorded during implementation (2026-06-16). Exact extension points the feature
attaches to; no behavior change in this task.

### Per-phase checkpoint primitives (021) — `src/govern/checkpoint-state.ts`

- `checkpointPath(installationRoot, featureSlug, phaseId)` → `.stack-control/govern/phase-checkpoints/<feature>/phase-<id>.json`.
- `readPhaseCheckpoint(root, slug, phaseId): PhaseCheckpointRecord | null` — fail-loud on corrupt/torn JSON.
- `writePhaseCheckpoint(root, record)` — atomic temp+rename; symlink-escape guarded.
- `listCheckpointPhaseIds(root, slug)` — recorded checkpoint phase ids.
- `isCheckpointFresh(record, {version, checkpoint, auditLogSection, scopeFingerprint})` — the currency predicate.
- `isCheckpointStale(root, slug, phaseId)` — `.stale` re-design sidecar.
- `computeScopeFingerprint(root, paths)` — SHA-256 over the governed file set + content; **throws on an empty scope** (no meaningless fingerprint).
- `PhaseCheckpointRecord` carries `checkpoint`, `auditLogSection` (both `phase-<id>`), `scopeFingerprint`, `governedPaths`, optional `auditedFiles`.

### Per-phase status + governed-path resolution — `src/subcommands/govern.ts` (TO EXTRACT)

- `interface PhaseCheckpointStatus { phaseId; files; auditedFiles; scopeFingerprint; state: 'current'|'missing'|'stale' }` (symbol in `govern.ts`).
- `normalizeGovernedPaths(installationRoot, paths)` — installation-relative normalization.
- `resolvePhaseCheckpointStatuses(installationRoot, slug, tasksPath)` — parses phases, **fails loud naming the phase on an empty governed file list (FR-004)**, computes fingerprint, reads checkpoint, derives `current|missing|stale`. **This is the exact per-phase currency logic the US1 gate needs.** (Line numbers intentionally omitted — they rot on the first extraction; key off the symbol names, claude-03/04.)
  - **Anchor decision**: extract `PhaseCheckpointStatus` + `normalizeGovernedPaths` + `resolvePhaseCheckpointStatuses` into a shared `src/govern/phase-checkpoint-status.ts`; `govern.ts` re-imports them (pure move, no behavior change); the new US1 compose-convergence reader imports the same resolver (no clone — project anti-clone discipline). Verified no test couples to these internal names or the empty-list message string.

### tasks.md phase enumeration — `src/govern/incremental-audit.ts`

- `parsePhases(tasksText): {phaseId, files}[]` — `## Phase <id>` header grammar (`PHASE_HEADER_RE`), backtick-span file extraction (`extractScopedPaths`). Returns `files: []` for a phase with no path spans (does NOT fail loud, does NOT guard zero-phases).
- **Anchor decision (T004; refined per AUDIT codex-02/claude-01)**: `src/workflow/phase-enumeration.ts` wraps `parsePhases` as the SINGLE enumeration substrate. The FR-004 **empty-file-list FATAL** (a phase that exists but names no files — the masquerade) is policed here for ALL callers (one guard, no clone). **Zero-phases** behaviour is caller-selected: the execute/govern path (US2) gets the default **FATAL** (an agent actively governing must not proceed on a non-phased tasks.md); the read-only US1 gate reaches it via `resolvePhaseCheckpointStatuses({allowZeroPhases:true})` and reports zero phases as a **named unmet verdict, not a crash** (the compass evaluates that gate). Pure over tasks text.

### Gate-eval criterion machinery (022) — `src/workflow/gate-eval.ts` + `workflow-types.ts`

- `CRITERION_KINDS` (in `workflow-types.ts`) — add `all-phase-checkpoints-current`.
- `Criterion {kind, target, param?}`; `evaluateCriterion(c, ctx)` switch (in `gate-eval.ts`) — add the case; `GateContext` carries `installationRoot`, `item`, `specDirPath` (enough to resolve tasks.md + checkpoints — featureSlug = `basename(specDirPath)`, matching govern's marker-resolved slug). Fail-loud = throw `WorkflowError` (matches the existing malformed-criterion pattern).

### Composed convergence record (022/TASK-19) — `src/govern/convergence-record.ts`

- `isModeConverged(root, 'impl', item)` is today's `record-converged impl` gate signal; `recordGovernConvergence(...)` writes it.
- **Anchor decision (T009)**: `src/govern/compose-convergence.ts` derives the `impl` converged signal from the per-phase checkpoint union (all phases current) — no separate whole-feature govern run (FR-001a). The gate criterion (`all-phase-checkpoints-current`) is the gate's read; composing/writing the derived record is a reconcile/reporting concern (the gate itself stays a pure read per graduate-gate.md).

### Governed WORKFLOW.md (US1, FR-005) — `templates/WORKFLOW.md`

- `transition:graduate` exit-gate `record-converged impl` → `all-phase-checkpoints-current impl`.
- `transition:start-governing` exit-gate `tasks-complete spec` → add `all-phase-checkpoints-current impl` (FR-002). Grammar parsed by `src/workflow/workflow-grammar.ts`.

### Execute cadence surface (US2/US3) — `src/subcommands/execute-check.ts` + `skills/execute/SKILL.md`

- `execute-check.ts` is today a read-only runnability gate (tasks.md present). The per-phase cadence post-condition (govern→commit→push, refuse N+1 until N current, oversized→`boundary-too-large` fail-loud) attaches here as injectable-runner functions (DI for hermetic tests); the skill body drives them as non-discretionary post-conditions.
- govern-time per-phase ordering already enforced by `assertPriorPhaseCheckpointsCurrent` (symbol in `govern.ts`) — the cadence reuses it; the gap is *who fires* govern, which `execute` closes.

### Speckit wrapper (US4) — NEW `src/speckit-wrapper/refusal.ts` + cross-vendor command adapters (CORRECTED, operator decision 2026-06-16)

- **Adopter + cross-vendor reality (verified during implementation; GitHub #480 + specs/017-portability Decision 1):**
  - The backend speckit skills (`speckit-specify/plan/tasks/implement`) are **NOT shipped by this plugin** — they are the adopter's own Spec Kit install. The repo-root `.claude/skills/speckit-*` in THIS tree is dev/dogfood only, not part of the plugin payload.
  - `.claude/skills/` is **Claude-only**; Codex is a first-class host that surfaces the same commands through the thin `commands/*.md` adapter layer, with behavior living in `stackctl` (specs/017 Decision 1: stackctl authoritative, hosts thin adapters).
  - Therefore the original spec assumption (inject a precondition block into each vendored `.claude/skills/speckit-*/SKILL.md`) is **invalid on two counts** — it patches files the plugin does not control, and it is a Claude-only path.
- **Corrected mechanism (operator decision 2026-06-16 — start with this; option 3 below is a filed follow-on):**
  - Refusal logic lives in `stackctl` (a portable CLI verb / front-door-marker check) — the authoritative surface that ships with the plugin and runs identically under Claude and Codex. `src/speckit-wrapper/refusal.ts` holds the skill-identity → front-door redirect map (never vendor identity, Principle III).
  - The cross-vendor `commands/*.md` adapters (surfaced by both hosts) are the interception touch points that call the verb. No injection into the adopter's `.claude/skills/`.
  - **The US1 per-phase graduate gate (pure `stackctl`) is the real teeth (FR-014 defense-in-depth):** a raw backend-speckit path cannot graduate without per-phase checkpoints, regardless of host. The honest boundary (FR-017) already concedes a deliberate raw bypass is not prevented at the point of invocation across all hosts.
  - **Follow-on (filed):** roadmap item `design:gap/speckit-bypass-point-of-invocation-refusal` re-specs cross-vendor point-of-invocation shadowing adapters as the deeper defense-in-depth, via `/stack-control:design`.
- **Path convention (GitHub #480):** every skill-body / command-adapter invocation of the CLI uses **bare `stackctl`** (on PATH in a host install), never the source-repo `plugins/stack-control/bin/stackctl` form (which 404s in an adopter install; pre-existing bug across 14 skill bodies).

### No-shortcuts audit (US5) — NEW `src/subcommands/no-shortcuts-audit.ts`

- No audit today. Phrase scan over the **stack-control-owned** prompt surfaces that ship with the plugin: `skills/*/SKILL.md` AND the cross-vendor `commands/*.md` adapters (codex-02: the audit's input set must include every shipped prompt surface, not skills/ alone). It does NOT scan the adopter's backend speckit skills (not plugin-controlled; corrected US4). Enumerate prohibited skip/defer/shortcut phrasings.
