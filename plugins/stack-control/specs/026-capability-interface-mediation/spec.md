# Feature Specification: Capability-interface mediation — the stack-control agent-facing API

**Feature Branch**: `feature/stack-control` (program long-lived branch; numbered spec dir, not a per-feature branch — TF-09)

**Created**: 2026-06-17

**Status**: Draft

**Roadmap node**: `design:feature/capability-interface-mediation`, part-of `multi:feature/lifecycle-industrialization`

**Design record**: `docs/superpowers/specs/2026-06-17-capability-interface-mediation-design.md` (design-approved 2026-06-17)

**Predecessor**: 025 US4 (`speckit-guard`) — this feature is its defense-in-depth generalization.

**Input**: User description: capability-interface mediation — stack-control as the agent-facing API whose capability interfaces completely mediate between an adopting agent and the swappable backends that implement them, with point-of-invocation interception (Approach B primary) + make-bypass-harmless gate (Approach C backstop) as the enforcement that makes mediation complete.

## Problem & Conceptual Model *(context)*

stack-control fronts several backend systems — the adopter's own Spec Kit (`/speckit-*` skills), the `backlog` CLI, and (on the roadmap) swappable execution backends. Each front-door skill applies real mediation **when it drives the backend**: per-phase governance (`execute`), capture-over-YAGNI + the design gate (`define`), dedup + `deskwork.*` namespacing + routing (`backlog`). **None of that mediation fires when an agent reaches *around* the front door and invokes the backend directly.** 025 US4 shipped `speckit-guard`, but it is a verb that must be *called* by the front-door adapter — a raw `/speckit-implement` or a raw `backlog …` in Bash never calls it, so nothing intercepts the reach-around at the point it happens.

The governing model is **not** "guard that wraps backends." It is: **stack-control *is* an agent-facing API.** It exposes **capability interfaces** — backlog-like operations, spec-definition operations, spec-execution operations — each carrying its mediation **policies**, and those interfaces are the *only* surface an agent may touch. The backend is an implementation detail behind the interface: swappable, never an address the agent reaches directly.

- A **capability** = an agent-facing interface + mediation policies + a backend-adapter port + a backend identity set.
- **Complete-mediation invariant**: for every capability, the agent's only sanctioned path to a backend is through the interface.
- **Point-of-invocation interception** is the enforcement that makes mediation complete — the teeth that stop an agent reaching past the API to the implementation.

## Clarifications

### Session 2026-06-17

- Q: How should the front-door marker propagate so the interceptor observes it across the front-door-skill → backend-skill boundary on both Claude and Codex? → A: **Marker file on disk** — vendor-portable, survives the cross-process invocation boundary; lifecycle must handle stale markers and nesting (FR-014).
- Q: Which capabilities are under the complete-mediation invariant at v1? → A: **The three clear ones** — backlog, spec-definition, spec-execution; scope-discovery / audit-barrage / roadmap are operator tools outside the invariant for v1, addable later as registry entries (FR-017).
- Q: How should the interceptor identify a fronted CLI invocation in Bash precisely? → A: **Normalized argv[0] identity resolution** (basename + PATH/alias resolution) matched against the registry's backend identity set; name occurrences in paths/args/comments do not trigger refusal (FR-005).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reach-around is refused at the point of invocation; sanctioned front-door calls pass (Priority: P1)

An adopting agent (or a stack-control maintainer dogfooding) attempts to invoke a fronted backend **directly** — a raw `/speckit-implement` skill in-session, or a raw `backlog …` in Bash — without going through the stack-control capability interface. The invocation is **blocked at the moment it happens**, with a message naming the capability interface to use instead. The *same* backend call, when issued by the sanctioned front-door skill (which sets the front-door marker), passes through unblocked. This is the complete-mediation teeth: raw reach-around refused **and** legitimate mediated calls permitted — together they make the interface the only path.

**Why this priority**: This is the headline value and the node's defining requirement — point-of-invocation refusal of *raw* fronted-backend calls, which 025 US4 explicitly filed as the open gap. Refusal without permit-the-sanctioned would block the front door's own backend calls, so the two halves ship as one coherent slice.

**Independent Test**: With the plugin installed, (a) issue a raw `/speckit-implement` and a raw `backlog add …` with no front-door marker present → both are refused with a redirect message; (b) drive the same operations through `/stack-control:execute` and `/stack-control:backlog` (which set the marker) → both complete. Verifiable end-to-end with no other story implemented.

**Acceptance Scenarios**:

1. **Given** the plugin is installed and no front-door marker is set, **When** the agent invokes a raw `/speckit-implement` skill, **Then** the invocation is blocked before the backend runs and the agent is told which capability interface (`/stack-control:execute`) to use.
2. **Given** the plugin is installed and no front-door marker is set, **When** the agent runs a raw `backlog …` command in Bash whose identity matches a fronted CLI, **Then** the command is blocked before it runs and the agent is told which capability interface (`/stack-control:backlog`) to use.
3. **Given** the agent invokes the operation through the sanctioned stack-control front-door skill (which sets the front-door marker), **When** that skill drives the backend, **Then** the interceptor observes the marker and **permits** the backend call.
4. **Given** a Bash command that merely *contains* a fronted backend's name as an unrelated token (e.g. a path, a comment, a different program), **When** it is invoked, **Then** it is **not** blocked (precise identity matching, not loose substring).
5. **Given** a refusal, **When** the interceptor blocks, **Then** the exit-code contract inherited from the guard verb holds: 1 = refused, 0 = permitted, 2 = usage error.
6. **Given** the refusal scope decision (reads included), **When** the agent issues a *read-only* direct backend call without the marker, **Then** it is also refused — the front door is the only sanctioned path.

---

### User Story 2 - The capability registry is the single declarative source / the agent-readable API spec (Priority: P2)

A maintainer adds a new fronted backend, or an agent wants to discover what capabilities exist and which interface mediates each. A single declarative **capability registry** in `stackctl` lists, per capability: the agent-facing interface, the backend identity set, the mediation policies, and the redirect target. Every consumer — the interceptor's decision logic, the redirect messages, and agent-facing discovery — reads that one source. Adding a backend is a **registry entry**, not a new per-surface adapter.

**Why this priority**: The registry is what makes the mediation *complete and maintainable* rather than a pile of per-surface special cases; it is also the agent-readable "API spec." Valuable but depends on US1's interceptor existing to consume it.

**Independent Test**: Add a capability entry to the registry and confirm (a) the interceptor refuses raw calls to its backend identity set and (b) discovery surfaces the new capability and its redirect target — without editing the interceptor code.

**Acceptance Scenarios**:

1. **Given** a new capability is declared in the registry, **When** an agent issues a raw call matching its backend identity set without the marker, **Then** it is refused — with no change to the interceptor logic.
2. **Given** the registry, **When** discovery is requested, **Then** the agent can read each capability's interface, mediated backend identities, and redirect target from the single source.
3. **Given** the registry is the single source, **When** a redirect message is produced on refusal, **Then** its named interface is read from the registry (one source, multiple consumers — mirrors the existing `house-rules.ts` → gate-criteria pattern).

---

### User Story 3 - Harmless-bypass backstop: work that skipped the front door cannot graduate and is flagged (Priority: P3)

Even if interception is somehow evaded (an un-observable surface, a disabled hook), work performed against a backend without going through the capability interface **cannot graduate / has no durable sanctioned effect**, and a reconciler **flags** un-governed backend state so the operator sees it. This generalizes the 025 US1 per-phase graduate gate from `speckit-implement` to every capability.

**Why this priority**: This is the layered backstop (Approach C), not the primary interception — it catches an interception that is evaded rather than preventing the call. Already partially exists for `speckit-implement`; generalizing it hardens defense-in-depth.

**Independent Test**: Perform a backend mutation that bypassed the front door, then attempt to graduate the work → graduation is refused; run the reconciler → the un-governed state is reported.

**Acceptance Scenarios**:

1. **Given** backend work that did not pass through the capability interface, **When** the agent attempts to graduate it, **Then** the graduate gate refuses (generalized 025 US1 per-phase gate).
2. **Given** un-governed backend state on disk, **When** the reconciler runs, **Then** it flags the un-governed state for operator attention.

---

### User Story 4 - Cross-vendor parity: the same refusal under Claude and Codex (Priority: P3)

The interception behaves identically whether the agent runs under Claude Code or Codex. The decision logic lives once in `stackctl`; each vendor gets a thin adapter (a Claude Code `PreToolUse` hook; the Codex equivalent) that calls the same verb. No branch on vendor identity; no hardcoded Claude-only `.claude/skills` path.

**Why this priority**: Cross-vendor is a hard constraint, but the Codex interceptor mechanism needs research (open question 2), so it is sequenced after the Claude path proves the model. The portable core (one `stackctl` verb) is built from the start; the second adapter follows.

**Independent Test**: Run the same raw **Bash-surfaced** reach-around (e.g. `backlog …`) under each vendor's adapter → both refuse via the same `stackctl` verb with the same exit-code contract. (Skill-surfaced reach-arounds are observable only under Claude; on Codex they are covered by the backstop, not interception.)

**Acceptance Scenarios**:

1. **Given** the `stackctl` decision verb, **When** invoked from the Claude Code adapter and from the Codex adapter on the same raw **Bash-surfaced** call both adapters observe, **Then** both produce the same refuse/permit verdict and exit code.
2. **Given** the decision logic, **When** inspected, **Then** it branches on capability/identity only — never on vendor identity (Principle III) — and contains no hardcoded `.claude/skills` path (GitHub #480).

---

### Edge Cases

- **Marker absent vs. marker present across an invocation boundary**: a front-door skill sets the marker, then invokes the backend skill — does the interceptor observe the marker at the backend-skill boundary? (See Open Question 1 — core feasibility risk.)
- **Identity collision**: a Bash command containing a fronted backend's name as an unrelated token (path segment, comment, a different binary of the same name) must not be refused (precise identity matching).
- **Un-observable surface**: a fronted-backend invocation the interceptor cannot see — does any such surface exist, and is the Approach A shadow-adapter fallback needed for it? (Open Question 4.)
- **Disabled / missing hook**: if the PreToolUse hook is absent or disabled, the Approach C backstop (US3) is the remaining defense; the system must degrade to "cannot graduate / flagged," not to "silently sanctioned."
- **New backend with no registry entry**: a backend not yet in the registry is not mediated — the registry's completeness is itself a tracked concern (Open Question 3).
- **Self-dogfooding**: stack-control's own maintainers hit the same refusal when they reach around their own front door (the program is its own most demanding adopter).

## Requirements *(mandatory)*

### Functional Requirements

**Interception (Approach B — primary):**

- **FR-001**: The system MUST intercept fronted-backend invocations at the point of invocation and refuse any direct call lacking the front-door marker, covering both in-session skill invocations (`/speckit-*`) and Bash-invoked CLIs (`backlog …`) uniformly.
- **FR-002**: The refusal scope MUST be **all** fronted-backend calls — reads included — not a mutating-only or allowlist-precision subset. The front door is the only sanctioned path.
- **FR-003**: A refusal MUST emit a message that names the capability interface the agent should use instead (read from the registry).
- **FR-004**: A backend call carrying the front-door marker (`STACKCTL_FRONT_DOOR`), set by a capability-interface skill legitimately driving the backend, MUST be permitted.
- **FR-005**: Identity matching for Bash-invoked CLIs MUST be **precise** (identity-based), not loose substring matching, to avoid refusing unrelated commands that merely contain a backend's name. The interceptor MUST resolve the command's `argv[0]` to a normalized executable identity (basename + PATH/alias resolution) and match that against the registry's backend identity set; occurrences of a backend's name in paths, arguments, or comments MUST NOT trigger refusal.
- **FR-006**: The interception decision logic MUST live in `stackctl` (the vendor-neutral core) and branch on capability/identity, never on vendor identity; it MUST NOT hardcode a Claude-only `.claude/skills` path.
- **FR-007**: The interceptor's exit-code contract MUST be: 1 = refused, 0 = permitted, 2 = usage error (inherited from the 025 guard verb).
- **FR-008**: The interceptor MUST be delivered as plugin-shipped surfaces that travel with `claude plugin install` — a Claude Code `PreToolUse` hook declared in the plugin manifest/`hooks/`, and a Codex equivalent — NOT a hand-rolled `.husky`/`.git/hooks` script.

**Capability registry (single source):**

- **FR-009**: The system MUST provide a single declarative capability registry in `stackctl` that lists, per capability: the agent-facing interface, the backend identity set, the mediation policies, and the redirect target.
- **FR-010**: The interceptor, the redirect messages, and agent-facing capability discovery MUST all read from that single registry (one source, multiple consumers).
- **FR-011**: Adding a new fronted backend MUST be expressible as a new registry entry (a new backend identity in the registry) without a new per-surface adapter.
- **FR-012**: The registry MUST be readable by an agent as the "API spec" — discovery of available capabilities and their mediated backends.

**Front-door marker:**

- **FR-013**: Capability-interface skills MUST set the front-door marker when they legitimately drive a backend, and the marker MUST be absent on a raw reach-around.
- **FR-014**: The front-door marker MUST propagate via a **marker file on disk**: a capability-interface skill writes a sentinel file under the installation before driving the backend and removes it after; the interceptor reads that file to decide permit/refuse. This mechanism is vendor-portable (a hook reading a file behaves identically on Claude and Codex) and survives the cross-process front-door-skill → backend-skill invocation boundary.
- **FR-014a**: The marker file's lifecycle MUST be robust: a stale marker left by a crashed/aborted front-door skill MUST NOT silently sanction a later raw call (e.g. staleness bounded by pid/timestamp or cleared on next front-door entry), and concurrent or nested front-door invocations MUST NOT have one's teardown clear another's live marker.

**Harmless-bypass backstop (Approach C — layered):**

- **FR-015**: Work performed against a backend that did NOT pass through the capability interface MUST NOT be able to graduate (the 025 US1 per-phase graduate gate generalized to every capability).
- **FR-016**: The system MUST provide a reconciler that flags un-governed backend state (state produced by a bypassed front door) for operator attention.

**Capability inventory:**

- **FR-017**: The v1 registry MUST cover exactly three capabilities — backlog, spec-definition, and spec-execution. scope-discovery, audit-barrage, and roadmap are treated as operator tools OUTSIDE the complete-mediation invariant for v1; they MAY be added later as registry entries without interceptor code change (FR-011), but the v1 interceptor MUST NOT refuse their raw invocations.

**Adopter-boundary constraints:**

- **FR-018**: The mediation layer MUST NOT assume it owns or may edit the backend's files — the backend skills/CLIs are the adopter's own Spec Kit and tooling.
- **FR-019**: The system MUST apply to stack-control itself (self-dogfooding): a stack-control maintainer reaching around the front door hits the same refusal.

### Key Entities

- **Capability**: an agent-facing interface + mediation policies + a backend-adapter port + a backend identity set. The unit the complete-mediation invariant quantifies over.
- **Capability registry**: the single declarative source listing every capability and its four attributes; the agent-readable API spec; consumed by interceptor, redirect messages, and discovery.
- **Mediation interceptor**: the enforcement teeth — a plugin-shipped vendor adapter (Claude `PreToolUse` hook / Codex equivalent) that calls the `stackctl` guard verb on every tool/skill/Bash invocation.
- **Front-door marker (`STACKCTL_FRONT_DOOR`)**: the signal a capability-interface skill sets to mark a sanctioned mediated backend call; its absence on a raw call triggers refusal.
- **Backend identity set**: the precise identities (skill names, CLI argv identities) that, when invoked raw, the interceptor refuses for a given capability.
- **Backend adapter**: the backend-side conformance to a capability's port (`backlog-backend-port`, `execution-engine`).
- **Harmless-bypass backstop**: the generalized graduate gate + the un-governed-state reconciler.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of raw fronted-backend invocations issued without the front-door marker (across the v1 capability set, reads and writes, in-session skills and Bash CLIs) are refused at the point of invocation.
- **SC-002**: 100% of the same backend operations, when issued through the sanctioned stack-control front-door skill, complete (zero false-positive refusals of sanctioned calls).
- **SC-003**: Zero false-positive refusals of unrelated commands that merely contain a fronted backend's name as an incidental token (precise identity matching holds across a representative collision set).
- **SC-004**: Adding a new fronted backend to the registry produces correct refusal of its raw invocations with no edit to the interceptor logic (registry-entry-only extensibility verified).
- **SC-005**: For surfaces both vendors can observe (Bash-invoked CLIs), the refusal verdict and exit code are identical across the Claude and Codex adapters for the same raw call (cross-vendor parity). Skill-surface parity is NOT claimed for Codex — its PreToolUse is Bash-only (research D8); Codex covers skill-surfaced capabilities via the Approach C backstop, not via interception.
- **SC-006**: Backend work that bypassed the front door cannot graduate, and the reconciler reports it — verified on at least one capability beyond `speckit-implement`.
- **SC-007**: stack-control dogfoods the mediation on itself — a maintainer's raw reach-around in this repo is refused by the same installed surfaces an adopter would have.

## Open Questions *(capture — resolve in clarify/plan; NOT scope cuts)*

Per the project's capture-over-scope rule, all six design-record open questions are recorded here. Three were resolved in the `/speckit-clarify` session (2026-06-17) — see Clarifications; three remain for the plan/research phase.

1. **Marker propagation** — **RESOLVED** (Clarifications / FR-014): marker file on disk, vendor-portable, lifecycle-hardened (FR-014a).
2. **Codex interceptor mechanism** — **OPEN (plan/research)**: the concrete equivalent of Claude Code `PreToolUse` for Codex needs research; the portable expression (one `stackctl` verb, two thin adapters) depends on what Codex exposes. Sequenced after the Claude path proves the model (US4).
3. **Capability inventory at v1** — **RESOLVED** (Clarifications / FR-017): exactly backlog, spec-definition, spec-execution; scope-discovery / audit-barrage / roadmap are operator tools outside the v1 invariant, addable later as registry entries.
4. **Approach A fallback** — **OPEN (plan/research)**: keep shadow-adapters for any surface the interceptor cannot observe — and is there such a surface? Resolvable only once the marker-file interceptor is built and observed surfaces are enumerated.
5. **Provider / plan-source port** — **OPEN (defer)**: deferred per the succession rule. Does the umbrella capability-API framing change that deferral, or does the provider port simply become another capability adapter when un-deferred?
6. **False-positive boundary** — **RESOLVED** (Clarifications / FR-005): normalized `argv[0]` identity resolution matched against the registry's backend identity set.

## Decisions *(settled in the design record — recorded, not open)*

1. **Refusal scope: all fronted-backend calls** (reads included). The front door is the only sanctioned path. Chosen over mutating-only / allowlist-precision variants — simplest rule, hardest to offroad.
2. **Mechanism: Approach B (cross-cutting mediation interceptor) primary + Approach C (make-the-bypass-harmless gate) backstop.** Approach A (shadow adapters) retained only as a possible fallback for un-observable surfaces; Approach D (generalize the call-site guard only) rejected outright (it still only fires when something chooses to call it — the exact gap this node closes).
3. **Conceptual model: capability interfaces that completely mediate.** stack-control is the agent-facing API; the complete-mediation invariant governs.
4. **Node boundary: umbrella capability-API node.** `design:feature/backlog-backend-port` and `impl:feature/execution-engine` re-relate as concrete capability adapters (part-of / depends-on this node); 025 US4 `speckit-guard` becomes the first enforcement instance under the umbrella. *The exact roadmap edges are a separate `stackctl roadmap` dry-run for operator approval — NOT in this spec's scope.*
5. **Enforcement-rule ruling: a plugin-shipped Claude Code hook is a permitted enforcement surface.** A `PreToolUse` hook declared in the plugin manifest/`hooks/` travels with `claude plugin install` — unlike a `.husky`/`.git/hooks` script — so it satisfies the no-git-hook ADR's test (surfaces an adopter has after install) and is NOT the forbidden git-hook surface. *To be recorded as an amendment to `.claude/rules/enforcement-lives-in-skills.md` + the ADR in the implementing phase.*

## Assumptions

- The adopter has installed the plugin via `claude plugin install` (or the Codex equivalent); the interceptor surfaces exist post-install. Enforcement that requires hand-wiring a git hook is out of bounds by the no-git-hook ADR.
- The backend skills/CLIs are the adopter's own (their Spec Kit, their `backlog` CLI); stack-control does not own or edit them.
- The existing 025 `speckit-guard` logic (`src/subcommands/speckit-guard.ts`, `src/speckit-wrapper/refusal.ts`) is the reusable decision core; this feature generalizes its trigger from "called by the adapter" to "intercepted at the point of invocation."
- The single-source registry pattern follows the existing `house-rules.ts` → gate-criteria precedent in the codebase.
- The Claude Code path is built first to prove the model; the Codex adapter follows once its interception mechanism is researched (Open Question 2) — both consuming one `stackctl` verb.

## Dependencies

- **Predecessor**: 025 US4 `speckit-guard` (reused decision core) and the 025 US1 per-phase graduate gate (generalized by US3).
- **Re-related nodes**: `design:feature/backlog-backend-port` and `impl:feature/execution-engine` (specs/002) become capability adapters under this umbrella (edge changes are a separate roadmap dry-run, pending the TASK-137 reparent verb).
- **Constraint sources**: `.claude/rules/stack-control-succession.md` (capability-not-vendor; two pluggability axes), `.claude/rules/enforcement-lives-in-skills.md` + the no-git-hook ADR (`docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md`), `.claude/rules/agent-discipline.md` (no-offroading; capture-over-YAGNI).
