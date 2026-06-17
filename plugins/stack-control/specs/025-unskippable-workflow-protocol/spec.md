# Feature Specification: Un-skippable workflow protocol — close the agent-offroading holes

**Codename**: `multi/unskippable-workflow-protocol` (part-of `multi:feature/lifecycle-industrialization`)

**Feature Branch**: `feature/stack-control` (session-pinned; not a per-spec branch)

**Created**: 2026-06-16

**Status**: Draft

**Input**: Author the spec from the approved design record at
`plugins/stack-control/docs/superpowers/specs/2026-06-16-unskippable-workflow-protocol-design.md`
(operator-approved 2026-06-16; read it for the full reasoning, the weighed
alternatives A/B/C/D, and the demonstrated-live evidence). This spec captures that
design into Spec Kit form. Scope decision (operator): **one feature, one spec** —
all four offroading holes plus the speckit wrapper land together as one cohesive
mechanism.

## Context

024 (lifecycle-compass) made the **macro** lifecycle un-skippable: an agent
following the skills cannot author a spec before designing, or ship before
governing. But four offroading holes remain **inside** the `implementing` phase,
each held shut today **only by operator vigilance** — which the thesis says must
be made mechanical or it does not exist (*"you don't fix agents by yelling… you
fix them with environmental design that makes the failure state mechanically
impossible"*). All four were demonstrated live in the originating session:

1. **Per-phase governance is not gated.** `govern --phase` exists (021, with
   per-phase checkpoints + scope fingerprints), but nothing *requires* it per
   `tasks.md` phase. The only `governing → shipped` gate checks a single
   whole-feature record, so an agent implements all phases and governs once at the
   end — a whole-feature payload that exceeds the model fleet envelope
   (`boundary-too-large`: 167,657 bytes vs 98,304 envelope, observed).
2. **Agents offer the operator shortcuts / skip spec steps.** The operator *never*
   wants a shortcut; they want the protocol applied consistently. An agent
   presenting "defer/skip/shortcut this step?" is itself the offroad (a "defer
   governance; wrap the session" option was offered).
3. **Agents bypass `stack-control:execute` to run the backend `/speckit-implement`
   directly.** Reaching *behind* the stack-control surface evades the gates, the
   per-phase cadence, and the `after_implement` governance the execute skill drives.
4. **Commit-and-push is not automatic.** A "push early and often" rule exists and is
   ignored — the operator must remind every session.

The unifying defect: the protocol's enforcement stops at the macro-lifecycle.
Everything inside `implementing` — governance cadence, no-shortcuts, the execute
boundary, commit/push — still depends on the agent *choosing* to comply. This
feature extends the 024 compass-enforcement pattern (021 checkpoints + scope
fingerprints; 022 gate-eval + governed `WORKFLOW.md`; 024 compass) one layer down,
so the failure state becomes mechanically impossible for an agent following the
skills.

**Enforcement home (non-negotiable).** All enforcement lives in the governed
`WORKFLOW.md` gates + skill bodies + CLI verbs, which travel with `claude plugin
install` (per `.claude/rules/enforcement-lives-in-skills.md`), **never** in
`.husky/` or `.git/hooks/`. A discipline that only fires from a git hook does not
exist for an adopter who installs the plugin and follows the README.

**Originating context.** Operator session 2026-06-16, immediately after shipping
024, while the agent demonstrated the holes live. The stopgap rules in
`.claude/rules/agent-discipline.md` § "No offroading the stack-control workflow
protocol" record decisions 4–6 as discipline until this mechanization lands; this
feature is the mechanism that *replaces* the rules (the "yelling").

## Clarifications

### Session 2026-06-16

- Q: How should the new per-phase-checkpoint requirement relate to the existing
  whole-feature `record-converged impl` graduate gate? → A: **Compose** — the
  whole-feature converged-impl signal is *derived from* the union of current
  per-phase checkpoints (one source of truth, per-phase). There is no separate
  whole-feature govern run; the graduate gate reads the composed signal. This kills
  the boundary-too-large path while keeping a single graduate signal (aligns with
  021's compose-from-checkpoints contract).
- Q: Which backend skills should the speckit wrapper intercept? → A: **All backend
  speckit skills** (specify / plan / tasks / implement). Every stack-control front
  door is the only sanctioned path to its backend: specify/plan/tasks route through
  `/stack-control:define` or `/stack-control:extend`; implement routes through
  `/stack-control:execute`.
- Q (resolved 2026-06-16, during implementation): The original US4 mechanism —
  "inject a precondition block into each vendored `.claude/skills/speckit-*/SKILL.md`"
  — was found **invalid**: the backend speckit skills are the **adopter's own Spec Kit
  install** (NOT shipped/controlled by this plugin — GitHub #480), and `.claude/skills/`
  is **Claude-only** while the plugin is cross-vendor (Claude + Codex; specs/017-portability
  Decision 1: `stackctl` is authoritative, hosts are thin adapters). → A (operator
  decision): **Start with US4 as a portable `stackctl` refusal verb + the cross-vendor
  `commands/*.md` adapters, with the US1 per-phase graduate gate (pure `stackctl`) as the
  real defense-in-depth teeth** (a raw backend-speckit path cannot graduate without
  per-phase checkpoints, on any host). A deeper cross-vendor **point-of-invocation**
  interception (shadowing adapters that refuse a raw backend invocation before any work
  runs) is a **filed follow-on** roadmap item
  (`design:gap/speckit-bypass-point-of-invocation-refusal`), not 025's scope. No injection
  into the adopter's `.claude/skills/`; no Claude-only path.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Per-phase governance is a gated boundary (Priority: P1) 🎯 MVP

A feature cannot graduate to `shipped` (nor advance `implementing → governing`)
unless **every** `tasks.md` phase has a **current** per-phase govern checkpoint. A
single whole-feature governance record no longer satisfies the gate, so the
batch-everything-then-govern-once path (which blows the fleet envelope) is
mechanically impossible.

**Why this priority**: This is the lead hole and the keystone. It makes batching
impossible AND makes the raw-speckit bypass (US4) unable to graduate. Without it,
the other mechanisms have no teeth at the graduation gate.

**Independent Test**: On a fixture feature with N `tasks.md` phases, attempt to
graduate with 0 / some / all phase checkpoints present and current; confirm the
gate refuses until all N are current, and that editing a phase after its checkpoint
reopens the gate.

**Acceptance Scenarios**:

1. **Given** a feature with 3 `tasks.md` phases and checkpoints for only phases 1–2,
   **When** the `governing → shipped` gate is evaluated, **Then** it is unmet and
   names the missing phase-3 checkpoint.
2. **Given** the same feature with all 3 checkpoints current, **When** the gate is
   evaluated, **Then** it is met.
3. **Given** all 3 checkpoints current, **When** phase 2's content changes (a task
   edited) after its checkpoint, **Then** the gate reopens (phase-2 checkpoint is
   now stale) and names phase 2.
4. **Given** a `tasks.md` whose phase headers exist but a phase has no authoritative
   file list, **When** the gate derives the phase set, **Then** it **fails loud**
   naming the phase — it does NOT scope a partial or empty payload (depends on
   TASK-70).
5. **Given** a single whole-feature governance record and no per-phase checkpoints,
   **When** graduation is attempted, **Then** it is refused (the whole-feature
   record does not satisfy the per-phase gate).

---

### User Story 2 - `execute` fires per-phase govern at each phase boundary (Priority: P1)

`/stack-control:execute` runs `govern --phase <id>` as each `tasks.md` phase
completes — a skill-body post-condition, not an agent choice — and refuses to start
phase N+1 until phase N has a current checkpoint. Per-phase scoping keeps payloads inside
the fleet envelope for right-sized phases, so `boundary-too-large` becomes a non-event on
the sanctioned path (an oversized single phase fails loud — FR-008).

**Why this priority**: This is what makes US1's gate satisfiable *without agent
discretion*. The gate (US1) is the lock; this is the mechanism that turns the key at
every boundary so checkpoints exist by the time graduation is attempted.

**Independent Test**: Drive `execute` over a multi-phase fixture; confirm a govern
checkpoint is written as each phase completes and that execute refuses to begin the
next phase while the prior phase's checkpoint is missing/stale.

**Acceptance Scenarios**:

1. **Given** a 3-phase feature, **When** `execute` completes phase 1, **Then** it
   fires `govern --phase 1` and a current phase-1 checkpoint exists before phase 2
   begins.
2. **Given** phase 1's checkpoint is missing, **When** `execute` attempts phase 2,
   **Then** it refuses (per-phase ordering), consistent with 021's existing
   govern-time enforcement.
3. **Given** a single phase whose payload still exceeds the fleet envelope after
   per-phase scoping, **When** `execute` governs it, **Then** it **fails loud** with
   `boundary-too-large` pointing at right-sizing guidance (TASK-75) — it does NOT
   auto-split the phase.

---

### User Story 3 - Commit-and-push is mechanical at each phase boundary (Priority: P1)

The `execute` loop commits (landing locally first, so work is safe) and then pushes
at each phase boundary. "Push early and often" becomes a mechanism, not a reminder.
A push failure fails loud and is surfaced; the local commit always survives.

**Why this priority**: This removes the recurring operator vigilance ("I have to
remind agents every session to commit and push"). It is independently testable and
delivers value on its own even before US4/US5.

**Independent Test**: Drive `execute` over a multi-phase fixture; confirm a commit
and a push occur at each phase boundary, and that a simulated push failure is
surfaced loud while the local commit remains intact.

**Acceptance Scenarios**:

1. **Given** `execute` completes a phase, **When** the boundary post-condition runs,
   **Then** a commit lands locally and a push to the branch's remote follows.
2. **Given** the push fails (offline / auth / pre-push hook failure), **When** the
   boundary post-condition runs, **Then** the failure is surfaced loud, the local
   commit is intact, and the path never silently continues nor uses `--no-verify`.
3. **Given** a pre-commit/pre-push hook refuses, **When** the boundary runs, **Then**
   the underlying issue is surfaced for fixing — the hook is never bypassed.

---

### User Story 4 - No bypassing the front doors (speckit wrapper) (Priority: P2)

stack-control provides a portable `stackctl` refusal/redirect for any wrapped backend
speckit skill (`/speckit-specify`, `/speckit-plan`, `/speckit-tasks`,
`/speckit-implement`) — mapping each to its sanctioned front door (define/extend for
authoring; execute for implement) — exposed through the plugin's own cross-vendor
command/skill adapters that travel with the install (Claude + Codex). The per-phase
graduation gate (US1, pure `stackctl`) is the real defense-in-depth: a raw backend-speckit
path cannot graduate without per-phase checkpoints, on any host.

**Corrected mechanism (operator decision 2026-06-16)**: 025 does NOT inject a precondition
block into the adopter's `.claude/skills/speckit-*` (those are the adopter's own Spec Kit,
not plugin-controlled, and `.claude/skills/` is Claude-only — both violate the
adopter-environment + cross-vendor principles). A cross-vendor **point-of-invocation**
interception of a *raw* backend call (refuse before any work runs, on every host) is the
filed follow-on `design:gap/speckit-bypass-point-of-invocation-refusal`. 025's US4 ships the
portable verb + adapters + the US1 gate as the teeth.

**Why this priority**: P2 because US1 already denies a bypassed path the ability to *ship*;
US4 adds the front-door refusal/redirect across the whole backend chain at the surfaces the
plugin actually controls.

**Independent Test**: Invoke each wrapped backend skill directly; confirm each refuses
and names its front door. Separately confirm a hypothetically-evaded raw implement
path still cannot graduate (US1 gate).

**Acceptance Scenarios**:

1. **Given** an agent invokes `/speckit-implement` directly, **When** the wrapper
   intercepts, **Then** it refuses loud and redirects to `/stack-control:execute`.
2. **Given** an agent invokes `/speckit-specify` / `/speckit-plan` / `/speckit-tasks`
   directly, **When** the wrapper intercepts, **Then** it refuses loud and redirects to
   `/stack-control:define` or `/stack-control:extend`.
3. **Given** the wrapper is somehow evaded and a feature is implemented raw, **When**
   graduation is attempted, **Then** it is refused (no per-phase checkpoints — US1).
4. **Given** the refusal logic, **When** an adopter installs the plugin, **Then** the
   refusal travels with the install (skill body / CLI verb), with no git hook required.

---

### User Story 5 - No agent-offered shortcuts (Priority: P2)

stack-control skills never present an option to skip / defer / shortcut a protocol
step. The only operator-facing branches are genuine *scope* decisions the operator
initiates; any protocol override is an explicit, recorded operator override, never a
menu item the agent offers.

**Why this priority**: Removes the "agent offers the offroad" failure mode. P2
because it is a skill-body discipline rather than a gate; it is enforced by review of
the skill bodies and by the absence of bypass affordances.

**Independent Test**: Audit every stack-control skill body for skip/defer/shortcut
affordances; confirm none exist. Confirm any override path is documented as an
explicit operator-initiated, recorded override.

**Acceptance Scenarios**:

1. **Given** any stack-control skill at a heavy/optional-feeling step, **When** the
   skill runs, **Then** it does the step — it does NOT offer to skip/defer it.
2. **Given** the operator wants to deviate, **When** they initiate an override,
   **Then** it is recorded as an explicit operator override, not selected from an
   agent-presented menu.

---

### Edge Cases

- **Phase with no authoritative file list** → the gate and `execute` fail loud naming
  the phase (FR-004); never scope a partial/empty payload (depends on TASK-70).
- **Single oversized phase** (exceeds the fleet envelope even when scoped alone) →
  fail loud with `boundary-too-large` pointing at TASK-75 right-sizing; no auto-split.
- **Push fails while offline / auth-expired / hook-refuses** → local commit intact,
  failure surfaced loud, no silent continue, no `--no-verify`.
- **Wrapper evaded via raw `git`/`gh`/`speckit`** → cannot graduate (US1 defense-in-
  depth); the spec does not claim to stop a deliberate human bypass (honest boundary).
- **`tasks.md` with zero phase headers** → the gate fails loud (no derivable phase
  set), rather than treating the feature as trivially gate-met.
- **Re-running `execute` after all phases are checkpointed** → idempotent; existing
  current checkpoints are not re-governed, the gate stays met.

## Requirements *(mandatory)*

### Functional Requirements

**Per-phase governance gate (US1)**

- **FR-001**: The `governing → shipped` gate MUST require a *current* per-phase govern
  checkpoint for **every** `tasks.md` phase; a single standalone whole-feature record
  MUST NOT satisfy it.
- **FR-001a** (compose, per Clarifications 2026-06-16): The whole-feature
  `record-converged impl` graduate signal MUST be **derived from** the union of the
  current per-phase checkpoints — a composed signal, not a separately-run whole-feature
  govern. There MUST be no whole-feature govern pass (that is the `boundary-too-large`
  path this feature exists to remove); the per-phase checkpoints are the single source
  of truth and the graduate gate reads the composed result.
- **FR-002**: The `implementing → governing` gate MUST likewise require a current
  per-phase checkpoint for **all `tasks.md` phases** (which are complete at this
  transition, since it fires at tasks-complete), consistent with the per-phase cadence.
  See FR-006a for how the checkpoints come to exist before this transition.
- **FR-003**: A checkpoint MUST be treated as *current* only when its 021 scope
  fingerprint matches the phase's current content; a phase edited after its checkpoint
  MUST reopen the gate (staleness detection).
- **FR-004**: The gate MUST derive the phase set from `tasks.md` phase headers and MUST
  **fail loud**, naming the phase, when a phase's authoritative file list is missing or
  incomplete — it MUST NOT scope a partial or empty payload. (Hard dependency on
  TASK-70: per-phase govern scoping is unsound without authoritative file lists.)
- **FR-005**: The per-phase gate criterion MUST be published in the governed
  `WORKFLOW.md` so an adopter's graduate gate inherits it via `claude plugin install`.

**`execute` per-phase cadence (US2)**

- **FR-006**: `/stack-control:execute` MUST run `govern --phase <id>` as each `tasks.md`
  phase completes, as a skill-body post-condition — not as an agent choice.
- **FR-006a** (phase-vs-transition timing, resolved 2026-06-16): The per-phase govern in
  FR-006 occurs **during the `implementing` phase** (at each task-phase boundary), so the
  per-phase checkpoints already exist when `implementing → governing` fires. Consequently
  the `governing` phase performs **no new whole-feature govern run** — its role is to
  **compose** the `record-converged impl` signal from the per-phase checkpoint union
  (FR-001a) and verify all checkpoints are current (the graduate gate, FR-001). This
  reconciles the WORKFLOW.md `governing` phase with the per-phase cadence: govern *work*
  happens per-phase during implementing; `governing` is compose-and-verify.
- **FR-007**: `execute` MUST refuse to start phase N+1 until phase N has a current
  checkpoint (per-phase ordering; 021 already enforces this at govern time — the gap
  closed here is `execute` *firing* the per-phase govern so the checkpoint is written
  without agent discretion).
- **FR-008**: Scoping govern per phase (rather than whole-feature) keeps payloads within
  the fleet envelope **provided phases are right-sized**, so `boundary-too-large` does not
  occur on the sanctioned per-phase path for a right-sized phase. When a single phase
  still exceeds the envelope, `execute` MUST fail loud with `boundary-too-large` pointing
  at right-sizing guidance — it MUST NOT auto-split a phase and MUST NOT silently scope it
  down. (Companion dependency: TASK-75.)

**Mechanical commit-and-push (US3)**

- **FR-009**: `execute` MUST commit at each phase boundary, landing the commit locally
  first so completed work is never lost.
- **FR-010**: `execute` MUST push the branch to its remote after the boundary commit.
- **FR-011**: A push failure (offline / auth / hook failure) MUST fail loud and be
  surfaced; the local commit MUST remain intact; the path MUST NOT continue silently
  and MUST NOT bypass hooks (`--no-verify` is never used — hook failures are fixed).

**No bypassing `execute` (US4)**

- **FR-012**: stack-control MUST provide a refusal/redirect for a direct invocation of
  **any** backend speckit skill the front doors wrap — `/speckit-specify`, `/speckit-plan`,
  `/speckit-tasks`, `/speckit-implement` (per Clarifications 2026-06-16) — mapping each to
  its sanctioned front door: specify/plan/tasks → `/stack-control:define` or
  `/stack-control:extend`; implement → `/stack-control:execute`. The refusal/redirect logic
  MUST live in a portable `stackctl` verb (the authoritative cross-vendor surface) that the
  plugin's own cross-vendor command/skill adapters call. (Corrected 2026-06-16: the original
  "inject into the adopter's `.claude/skills/speckit-*`" mechanism is invalid — those skills
  are the adopter's Spec Kit, not plugin-controlled, and `.claude/skills/` is Claude-only.)
  A cross-vendor **point-of-invocation** interception of a *raw* backend call (before any
  work runs) is the filed follow-on `design:gap/speckit-bypass-point-of-invocation-refusal`,
  not 025's scope.
- **FR-013**: The refusal MUST live in `stackctl` + the plugin's cross-vendor command/skill
  adapters that travel with `claude plugin install` (and surface identically under Codex) —
  never a git hook, never a Claude-only `.claude/skills/` patch of files the plugin does not
  ship. Every CLI invocation in a shipped prompt surface uses bare `stackctl` (on PATH),
  never the source-repo `plugins/stack-control/bin/stackctl` form (GitHub #480).
- **FR-014**: The per-phase graduation gate (FR-001) MUST be retained as
  defense-in-depth, so even an evaded wrapper cannot graduate a feature without
  per-phase checkpoints.

**No agent-offered shortcuts (US5)**

- **FR-015**: stack-control skills MUST NOT present any option to skip / defer /
  shortcut a protocol step.
- **FR-016**: The only operator-facing branches MUST be genuine scope decisions the
  operator initiates; any protocol override MUST be an explicit, recorded operator
  override — never an agent-presented menu item.

**Honest boundary + enforcement home (cross-cutting)**

- **FR-017**: The mechanism binds an agent following the skills. The spec MUST NOT claim
  total prevention of a deliberate human bypass via raw `git`/`gh`/`speckit`; FR-014
  narrows the worst hole (no graduation without checkpoints). (Mirrors 024 FR-014, the
  honest boundary.)
- **FR-018**: All enforcement added by this feature MUST travel with `claude plugin
  install` (governed `WORKFLOW.md` + skill bodies + CLI verbs) and MUST NOT be wired into
  `.husky/` or `.git/hooks/`.

### Key Entities

- **Per-phase govern checkpoint** — the 021 artifact (`phase-checkpoints/<feature>/
  phase-<id>.json`) recording convergence + a scope fingerprint for one `tasks.md`
  phase. The unit the US1 gate counts and the US2 cadence writes.
- **Per-phase graduate gate criterion** — the computable `WORKFLOW.md` gate (022
  gate-eval) requiring all per-phase checkpoints current before `governing → shipped`.
  The whole-feature `record-converged impl` signal is **composed** from the union of
  these checkpoints (FR-001a), not produced by a separate whole-feature govern run.
- **Speckit wrapper** — a portable `stackctl` refusal/redirect verb (skill-identity →
  front-door map, never vendor identity) that the plugin's cross-vendor command/skill
  adapters call to redirect a direct backend-speckit invocation to its sanctioned front
  door (define/extend for authoring; execute for implement). It does NOT patch the
  adopter's own backend speckit skills (those aren't plugin-controlled) and does NOT use a
  Claude-only `.claude/skills/` path. The deeper cross-vendor point-of-invocation
  interception of a *raw* backend call is a filed follow-on, not 025's scope; the US1
  per-phase graduate gate is 025's real defense-in-depth (FR-014).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a feature with N `tasks.md` phases, graduation to `shipped` is refused
  unless all N phases have current checkpoints — 100% of fixture cases; no
  whole-feature single-record path graduates.
- **SC-002**: Editing a phase after its checkpoint reopens the gate 100% of the time
  (staleness detection), naming the stale phase.
- **SC-003**: Driving `execute` over a multi-phase feature produces a govern checkpoint
  AND a commit+push at each phase boundary, with zero operator reminders required.
- **SC-004**: A direct invocation of any wrapped backend speckit skill (specify / plan /
  tasks / implement) is refused and redirected to its sanctioned front door 100% of the
  time.
- **SC-005**: An audit of stack-control skill bodies finds zero skip/defer/shortcut
  affordances.
- **SC-006**: `boundary-too-large` does not occur on the sanctioned per-phase path for
  any phase within the fleet envelope; an oversized single phase fails loud pointing at
  right-sizing guidance (it is never silently downgraded or auto-split).
- **SC-007**: A push failure is surfaced (never silent) 100% of the time, and the local
  boundary commit always survives the failure.

## Assumptions

- The 021 per-phase checkpoint primitives (`phase-checkpoints/*.json`, scope
  fingerprints, govern-time per-phase ordering) and the 022 gate-eval + governed
  `WORKFLOW.md` are present and are the substrate this feature builds on.
- `TASK-70` (per-phase govern scoping soundness — authoritative file lists) is a
  **precondition** for FR-004's soundness; the gate fails loud rather than guessing when
  TASK-70's file lists are absent.
- `TASK-75` (phase right-sizing) is the **companion** for FR-008's oversized-phase
  guidance; this feature fails loud and points at it rather than auto-splitting.
- Auto-commit/push (US3) runs inside the `execute` loop, which executes in the
  **implementation session** (feature worktree) per the two-session rule; the
  orchestrator session never runs `execute`, so the cadence does not cross that boundary.
- This program runs on one long-lived branch (`feature/stack-control`) with numbered
  spec dirs; the active spec dir is resolved via the `CLAUDE.md` SPECKIT marker, not the
  git branch name (TF-09).
