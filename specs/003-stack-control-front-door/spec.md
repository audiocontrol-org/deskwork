# Feature Specification: stack-control front door — plugin + native Spec Kit execution

**Feature Branch**: `feature/pluggable-lifecycle-providers` (spec dir `specs/003-stack-control-front-door`)

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "stack-control front door — the self-hosting bootstrap, and the FIRST feature of the stack-control plugin. Stand up the plugin (minimal scaffolding folded in), rehome the founding governance extension, and ship a thin control plane (`stackctl` CLI + a minimal frontend with two touch points) that can curate a Spec Kit spec and execute it via the native Spec Kit mechanism (`/speckit-implement`), governance firing on after_implement. Native Spec Kit execution is the literal first feature — once it exists we use it to build everything after. Out of scope: the parallel multi-backend engine, the fuller frontend, the dw-lifecycle migrations."

> **Program context** (see [`../../docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md`](../../docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md)): `stack-control` (CLI `stackctl`) is a new plugin, the successor to `dw-lifecycle`, built integration-first against Spec Kit. **This is Feature 1 — the self-hosting front door.** It is defined by a *capability* (stack-control can curate a spec and run it via native Spec Kit execution), with the minimal plugin scaffolding folded in (operator decision 2026-06-04, option b — no separate infra feature). The founding governance feature (slice 001, `specs/001-speckit-backhalf-slice/`) rehomes into stack-control as part of this feature.

> **Self-hosting goal.** The reason this is first: once the front door exists, every later feature (the parallel multi-backend engine = Feature 2, the dw-lifecycle migrations, the fuller frontend) is specced and built *through* it. Success is not just "it runs a spec" — it is "we can drive the next feature's build through it."

> **Explicitly OUT OF SCOPE (later features):** the parallel multi-backend execution engine (this front door uses ONLY native Spec Kit execution — the single-agent grinder); the fuller control-plane frontend (spec→implementation negotiation, scope-discovery + audit-barrage surfaces); the dw-lifecycle migrations of scope-discovery / audit-barrage / session skills.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Execute a spec via native Spec Kit, governance firing (Priority: P1) 🎯 MVP

An operator points the stack-control front door at a Spec Kit spec and runs it. stack-control drives the **native Spec Kit execution mechanism** (`/speckit-implement`) over that spec, and when execution completes, the rehomed governance extension fires automatically (`after_implement`, cross-model audit-barrage) over the produced work — exactly as the founding feature demonstrated, now from inside stack-control.

**Why this priority**: This is the bootstrap capability and the entire reason this feature is first — the moment stack-control can run a spec via native execution with governance, it can be used to build everything else. Without it there is no self-hosting front door.

**Independent Test**: From a clean install of the stack-control plugin, point the front door at a small Spec Kit spec and trigger execution; observe native Spec Kit execution run over it and governance fire automatically afterward, with findings recorded.

**Acceptance Scenarios**:

1. **Given** the stack-control plugin is installed and a Spec Kit spec exists, **When** the operator triggers execution through the front door, **Then** native Spec Kit execution (`/speckit-implement`) runs over that spec.
2. **Given** native execution completes, **When** the `after_implement` boundary is reached, **Then** the rehomed governance extension fires automatically (cross-model audit-barrage) and records findings — no separate manual invocation.
3. **Given** governance fires, **When** its selection logic is inspected, **Then** it contains zero branches on provider identity (the founding feature's neutrality invariant survives the rehome).

---

### User Story 2 - Curate a spec through the front door (Priority: P2)

An operator uses the front door's **spec-curation touch point** to create, **edit, iterate, and review** a Spec Kit spec — the full authoring loop — so the same surface that runs a spec is also where the spec is fully prepared.

**Why this priority**: Curation + execution are the two touch points that make the front door a usable control plane rather than a bare execution trigger. Execution (US1) is the bootstrap; the full curation loop makes the front door self-contained for authoring. P2 relative to execution, but both ship in this feature.

**Independent Test**: Through the front door, initiate a new Spec Kit spec and bring it to a state where US1 can execute it — without dropping out of the stack-control surface to do so.

**Acceptance Scenarios**:

1. **Given** the front door, **When** the operator initiates spec curation, **Then** a Spec Kit spec is created/advanced to a runnable state through the stack-control surface.
2. **Given** a curated spec, **When** the operator hands it to execution (US1), **Then** it runs without manual re-assembly.

---

### User Story 3 - stack-control ships as its own plugin without destabilizing dw-lifecycle (Priority: P2)

stack-control installs as its **own plugin** (the `stackctl` CLI is available; its own version line, separate from `dw-lifecycle`), the founding governance extension is **rehomed** into it and still fires, and `dw-lifecycle` continues to work exactly as before — undisturbed.

**Why this priority**: The isolation invariant is load-bearing: `dw-lifecycle` is in active use doing real work, so standing up stack-control must not regress it. This is the foundational scaffolding (folded into this feature), validated as its own observable outcome.

**Independent Test**: Install stack-control; confirm `stackctl` runs and the governance extension is registered + fires from the stack-control tree; then exercise `dw-lifecycle`'s existing surfaces and confirm no behavior change.

**Acceptance Scenarios**:

1. **Given** a fresh environment, **When** stack-control is installed, **Then** `stackctl` is available and the rehomed governance extension is registered.
2. **Given** stack-control is installed alongside `dw-lifecycle`, **When** `dw-lifecycle`'s existing surfaces are exercised, **Then** their behavior is unchanged (isolation invariant held).

---

### Edge Cases

- **Native Spec Kit execution cannot be invoked headlessly.** Slice 001 established that `/speckit-implement` is an agent-invoked Claude skill, not a script-callable binary. This is **resolved** by making the execution touch point an **in-session Claude Code skill** (FR-006): it runs inside the operator's session where `/speckit-implement` and the governance extension already live, so it drives native execution via the in-session agent — no headless shell-out needed. On a path where native execution still genuinely cannot run, the front door MUST fail loudly with a descriptive error — never silently no-op or fake a run (Principle V).
- **Governance dependency at rehome.** Governance fires deskwork's audit-barrage, which today lives in `dw-lifecycle`. The rehomed extension must continue to reach it (cross-plugin) until audit-barrage itself migrates (a later feature). A missing audit-barrage capability fails loud, not silent.
- **`dw-lifecycle` regression.** Any change required to stand up stack-control that would alter `dw-lifecycle` behavior is out of bounds — the isolation invariant takes precedence; surface the conflict rather than regress `dw-lifecycle`.
- **Spec not in a runnable state** when execution is triggered: surfaced as an actionable error, not a partial run.

## Requirements *(mandatory)*

### Functional Requirements

**Plugin standup (scaffolding, folded in)**

- **FR-001**: The system MUST stand up `stack-control` as its own plugin with its own version line separate from `dw-lifecycle` (a new workspace package + plugin shell, manifest, a `stackctl` CLI entry point), following the repository's existing plugin conventions.
- **FR-002**: Standing up `stack-control` MUST NOT change `dw-lifecycle`'s behavior (isolation invariant). `dw-lifecycle` continues to operate unchanged.

**Rehome the founding governance feature**

- **FR-003**: The founding governance extension (the Spec Kit `after_implement` extension that fires cross-model audit-barrage) MUST be rehomed into `stack-control` and remain registered and functional.
- **FR-004**: The rehomed governance extension MUST continue to fire automatically on `after_implement` with no manual invocation, and MUST preserve its zero-provider-identity-branching invariant.

**Front door — curation + execution touch points**

- **FR-005**: stack-control MUST expose a **spec-curation** touch point — a Claude Code skill (see FR-007) — providing a **full edit / iterate / review loop** over a Spec Kit spec. The operator can create a spec, edit it, iterate it, and review it by invoking the skill in-session, without leaving their Claude Code session. *(Operator decision 2026-06-04.)*
- **FR-006**: The **execution** touch point is a **Claude Code skill the operator invokes in-session** that runs a spec via the **native Spec Kit mechanism** (`/speckit-implement`), governance firing afterward. Because the skill runs inside the operator's Claude Code session, it drives native execution via the **in-session agent** (sub-agent dispatch available) and MUST NOT depend on a headless/batch CLI to invoke the agent — this is the mechanism that satisfies the durability constraint and avoids a context-switch out of the session. *(Operator decision 2026-06-04: front-door touch points are in-session skills.)*
- **FR-007**: The operator-facing front door is a set of **Claude Code skills** (invoked in-session as `/stack-control:…` slash commands) — NOT a standalone TUI or web app — layered over a **`stackctl` CLI** that performs the deterministic work (mirrors `dw-lifecycle`'s skills-over-CLI-verbs architecture). The skill is the touch point; `stackctl` is the primitive it calls; the in-session agent does the agent-work. *(Operator decision 2026-06-04 — supersedes the earlier TUI answer.)*
- **FR-008**: When native execution genuinely cannot run (mechanism unavailable, spec not runnable, governance capability absent), the front door MUST fail loudly with a descriptive error naming what is missing — no silent no-op, no faked run, no mock (Principle V).

**Self-hosting**

- **FR-009**: The front door MUST be sufficient to **curate and run the next feature's spec** through it (the self-hosting proof) — i.e. it is usable to drive subsequent stack-control development, not merely to run a toy spec.

### Key Entities *(include if feature involves data)*

- **stack-control plugin**: the new plugin shell + package, own version line, hosting the front door and the rehomed governance extension.
- **`stackctl`**: the CLI entry point to the front door.
- **Front door**: the operator-facing touch points — **Claude Code skills** (`/stack-control:…`) invoked in-session — layered over the `stackctl` CLI primitive.
- **Spec-curation touch point**: the surface that brings a Spec Kit spec to a runnable state.
- **Execution touch point**: the surface that runs a spec via native Spec Kit execution.
- **Governance extension (rehomed)**: the founding feature's `after_implement` audit-barrage extension, now living in stack-control.
- **Spec Kit spec**: the unit being curated and run (concretely, a `specs/<feature>/` produced by the native Spec Kit flow).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a clean install, `stackctl` is available and the rehomed governance extension is registered — in **0** manual wiring steps beyond the documented install.
- **SC-002**: An operator can run a Spec Kit spec via the front door and observe native execution complete **and** governance fire automatically afterward — in a single front-door action, **0** manual barrage invocations.
- **SC-003**: Exercising `dw-lifecycle`'s existing surfaces after stack-control is installed shows **0** behavior changes (isolation invariant).
- **SC-004**: The rehomed governance selection path contains **0** branches on provider identity (neutrality survives the rehome).
- **SC-005**: The next feature's spec (Feature 2 or a migration) is **curated and run through the front door** — the self-hosting proof — rather than via ad-hoc invocation.
- **SC-006**: On any path where native execution cannot run, the front door produces a descriptive error naming the missing piece — **0** silent no-ops or faked runs.

## Assumptions

Reasonable defaults where the description did not fix a detail — starting positions to confirm in `/speckit-clarify`, not scope cuts (Constitution Principle II):

- **Plan/spec source is Spec Kit, concretely** (provider abstraction deferred — Principle II). The front door curates and runs Spec Kit specs specifically.
- **Governance reaches audit-barrage cross-plugin** for now (audit-barrage still lives in `dw-lifecycle`; its migration is a later feature). The seam is one-way and survives audit-barrage moving in-house later.
- **Minimal scaffolding** means just enough plugin shell to host the capability — not the fuller frontend or extra surfaces.
- **Installation follows the repo's plugin conventions** (bin shim first-run-installs the published package; workspace-symlink dispatch in the monorepo).
- The three open questions (frontend shape, curation scope, native-execution mechanism) are the scope-determining forks; other details default to the simplest thing that satisfies the self-hosting goal.
