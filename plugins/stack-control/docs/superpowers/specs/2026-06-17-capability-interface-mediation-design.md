# Capability-interface mediation — the stack-control agent-facing API

**Roadmap node:** `design:gap/speckit-bypass-point-of-invocation-refusal` → to be
reclassified `design:feature/capability-interface-mediation` (operator decision
2026-06-17). **Phase:** designing. **Status:** design complete, pending operator
approval marker + roadmap-edge dry-run.

This is the defense-in-depth follow-on to 025 US4 (`speckit-guard`), reframed by the
operator from a per-backend *guard* into a single architectural surface: stack-control
as the **agent-facing API** whose capability interfaces *completely mediate* between an
adopting agent and the backend systems that implement them.

## Problem domain

stack-control fronts several backend systems — the adopter's own Spec Kit
(`/speckit-*` skills), the `backlog.md` CLI, and, on the roadmap, swappable execution
backends. Each front-door skill applies real mediation when it drives the backend:
per-phase governance (execute), capture-over-YAGNI + the design gate (define), dedup +
`deskwork.*` namespacing + routing (backlog). **None of that mediation fires when an
agent reaches *around* the front door and invokes the backend directly.**

025 US4 shipped `speckit-guard`, but it is a verb that must be *called*: the 025
command/skill adapter calls it. A raw `/speckit-implement` or a raw `backlog …` in Bash
never calls it, so nothing intercepts the reach-around at the point it happens. 025's
own scope note files exactly this gap as the present node: "a cross-vendor
point-of-invocation interception of a *raw* call is the filed follow-on." 025's
remaining defense is the US1 per-phase graduate gate (the bypassed work can't graduate),
which is a backstop, not interception.

The deeper problem the operator named is conceptual, not mechanical. The right model is
**not** "guard that wraps backends." It is: stack-control *is* an API for adopting
agents. It exposes **capability interfaces** — backlog-like operations, spec-definition
operations, spec-execution operations — each carrying its mediation **policies**, and
those interfaces are the *only* surface an agent may touch. The backend is an
implementation detail behind the interface, swappable, never an address the agent reaches
directly. Point-of-invocation interception is then not a bolt-on; it is the *enforcement
that makes the mediation complete* — the teeth that stop an agent reaching past the API
to the implementation.

Constraints that bound any solution:

- **Cross-vendor.** Reach-around surfaces appear under both Claude and Codex. The
  decision logic must live in `stackctl` (the vendor-neutral core, specs/017 Decision 1)
  and branch on capability/identity, never vendor identity (Principle III). No hardcoded
  Claude-only `.claude/skills` path (GitHub #480).
- **Adopter owns the backend.** The backend skills/CLIs are the adopter's own Spec Kit
  and tooling — not plugin-controlled. The mediation layer cannot assume it owns or may
  edit the backend's files.
- **Enforcement travels with `claude plugin install`.** Per
  `.claude/rules/enforcement-lives-in-skills.md` + the no-git-hook ADR, a discipline that
  only fires from a hand-rolled git hook does not exist for an adopter who follows the
  README. The valid surfaces are ones the adopter has *after install*.
- **stack-control dogfoods this on itself** — the program is its own most demanding
  adopter.

## Solution space

Each alternative shares one core: the existing `stackctl` guard logic (identity →
refuse-unless-front-door-marker). They differ in the **trigger** — what makes a *raw*
backend call actually invoke the guard — and in conceptual framing. Fronted backends come
in two shapes that a trigger must both cover: **skills** (`/speckit-*`, invoked
in-session) and **CLIs** (`backlog …`, invoked via Bash).

- **Approach A — Shadow adapters (rejected as the primary; retained as possible
  fallback).** Ship plugin files that shadow each backend surface: same-named
  command/skill files for `/speckit-*` that each call the guard, plus a PATH-shim binary
  named `backlog`. *Rejected as primary* because it relies on a plugin command/skill
  taking precedence over the adopter's same-named skill (shadow-precedence is unproven and
  likely vendor-specific) and on a CLI PATH-shim whose effect depends on PATH ordering in
  the adopter's shell, which stack-control does not control — fragile and invasive, with N
  per-surface adapters to maintain. Retained only as a possible fallback for any surface
  the interceptor cannot observe (open question 4).
- **Approach B — Cross-cutting mediation interceptor (selected, primary).** One
  plugin-shipped Claude Code `PreToolUse` hook (a thin vendor adapter), mirrored for
  Codex, that inspects every tool/skill/Bash invocation and calls the `stackctl` guard: a
  raw `/speckit-*` skill or a Bash command matching a fronted CLI, with the front-door
  marker absent, is blocked with a message naming the capability interface to use. *Chosen*
  because one interceptor covers skills and CLIs uniformly (directly implementing the
  "all fronted-backend calls" rule), it travels with `claude plugin install` (satisfying
  the ADR's actual test), it relies on neither shadow-precedence nor PATH ordering, and a
  new backend is just a new identity in the `stackctl` registry — no new adapter.
- **Approach C — Make-the-bypass-harmless (selected, layered backstop only; not
  standalone).** Do not intercept; ensure work that skipped the front door cannot graduate
  / has no durable effect — the 025 US1 per-phase gate generalized to every capability,
  plus a reconciler that flags un-governed backend state. *Rejected as a standalone answer*
  because it is explicitly **not** point-of-invocation refusal, which the node requires;
  *retained as a layered backstop* because it already exists for `speckit-implement` and
  catches an interception that is evaded.
- **Approach D — Generalize the call-site guard only (rejected).** Keep `speckit-guard`'s
  shape — a verb the front-door adapters call — and just extend its identity map to more
  backends. *Rejected* because it does nothing about the *raw* reach-around: it still only
  fires when something chooses to call it, which is the exact gap this node exists to
  close.

**Selected:** B as the primary interception mechanism, with C layered as the backstop.

## Decisions

1. **Refusal scope: all fronted-backend calls.** The front door is the *only* sanctioned
   path; every direct invocation of a fronted backend (reads included) without the
   front-door marker is refused. Simplest rule, hardest to offroad — matches the thesis
   ("make failure states mechanically impossible"). Chosen over a mutating-only or
   allowlist-precision variant.
2. **Mechanism: B (interceptor) primary + C (harmless-bypass gate) backstop.** A is a
   possible fallback for un-observable surfaces only; D is rejected outright.
3. **Conceptual model: capability interfaces that completely mediate.** stack-control is
   the agent-facing API. A capability = an agent-facing interface + mediation policies + a
   backend-adapter port + a backend identity set. The complete-mediation invariant: for
   every capability, the agent's only sanctioned path to a backend is through the
   interface.
4. **Node boundary: umbrella capability-API node.** Reclassify/rename
   `design:gap/speckit-bypass-point-of-invocation-refusal` →
   `design:feature/capability-interface-mediation`. It defines the capability-interface
   contract + complete-mediation invariant + point-of-invocation enforcement.
   `design:feature/backlog-backend-port` and `impl:feature/execution-engine` re-relate as
   concrete capability adapters that conform to (and depend-on / are part-of) this node.
   025 US4 `speckit-guard` becomes the first enforcement instance under the umbrella. The
   exact roadmap edges are proposed as a `stackctl roadmap` dry-run for operator approval —
   not auto-applied.
5. **Enforcement-rule ruling: a plugin-shipped Claude Code hook is a permitted
   enforcement surface.** The no-git-hook ADR's test is "surfaces an adopter has after
   `claude plugin install`." A plugin-shipped `PreToolUse` hook (declared in the plugin
   manifest / `hooks/`) travels with install — unlike a `.husky`/`.git/hooks` script — so
   it satisfies the principle's goal and is **not** the forbidden git-hook surface. The
   bookkeeping-spiral pathology (#401–403) was high-volume audit-finding gates, not a
   low-volume refusal interceptor. This ruling + rationale is to be recorded as an
   amendment to `.claude/rules/enforcement-lives-in-skills.md` + the ADR in the
   implementing phase.

### Architecture & components (informing the spec)

- **Capability registry** (in `stackctl`, vendor-neutral core) — the single declarative
  source listing each capability's interface, backend identity set, mediation policies,
  and redirect target. One source, multiple consumers (interceptor, redirect messages,
  agent-facing discovery), mirroring the existing `house-rules.ts` → gate-criteria
  single-source pattern. This registry *is* the agent-readable "API spec."
- **Mediation interceptor** (enforcement teeth, Approach B) — plugin-shipped Claude Code
  `PreToolUse` hook + Codex equivalent, thin adapters that call the `stackctl` guard verb;
  cover `/speckit-*` skills and Bash-invoked CLIs uniformly via precise *identity* matching
  (not loose substring), to avoid false positives on unrelated commands.
- **Front-door marker** (`STACKCTL_FRONT_DOOR`) — set by capability-interface skills when
  they legitimately drive a backend, so sanctioned mediated calls pass; absent on a raw
  reach-around → refused.
- **Harmless-bypass backstop** (Approach C) — the 025 US1 per-phase graduate gate
  generalized + a reconciler flagging un-governed backend state.
- **Backend adapters** — `backlog-backend-port` and `execution-engine` conform to the
  contract on the backend side.

Data flow — sanctioned: agent → capability interface skill (sets marker, applies policy)
→ backend adapter → backend; interceptor sees marker → permits. Reach-around: agent → raw
backend identity → interceptor consults registry via `stackctl` → marker absent + identity
matches → block, naming the capability interface to use. Exit-code contract inherited from
the guard verb (1 refused / 0 permitted / 2 usage).

## Open questions

These are captured as genuine unknowns to resolve in the spec/define and implementing
phases — not deferrals of scope.

1. **Marker propagation.** Does a `PreToolUse` hook reliably observe
   `STACKCTL_FRONT_DOOR` across the front-door-skill → backend-skill invocation boundary,
   on both Claude and Codex? This is the core feasibility risk; the spec must pin the
   propagation mechanism (process env vs. a marker file the hook reads).
2. **Codex interceptor mechanism.** The concrete equivalent of Claude Code `PreToolUse`
   for Codex needs research; the portable expression (one `stackctl` verb, two thin
   adapters) depends on what Codex exposes.
3. **Capability inventory at v1.** backlog, spec-definition, spec-execution are clear.
   Are scope-discovery, audit-barrage, and roadmap *agent-mediated capabilities* under the
   invariant, or operator tools outside it? The registry's completeness is an operator
   capture pass.
4. **Approach A fallback.** Keep shadow-adapters for any surface the interceptor cannot
   observe — and is there such a surface?
5. **Provider / plan-source port.** Deferred per the succession rule. Does the umbrella
   capability-API framing change that deferral, or does the provider port simply become
   another capability adapter when it is un-deferred?
6. **False-positive boundary.** Precise identity matching for Bash-invoked CLIs (e.g.
   distinguishing the fronted `backlog` from an unrelated token) — the matching grammar
   needs definition.

## Provenance

- **Origin node:** `design:gap/speckit-bypass-point-of-invocation-refusal` (ROADMAP),
  part-of `multi:feature/lifecycle-industrialization`; filed as the 025 US4 follow-on
  (operator decision 2026-06-16).
- **This design session:** 2026-06-17, driven via `/stack-control:design` →
  `superpowers:brainstorming` with the stack-control house rules injected
  (capture-over-YAGNI; ≥2 alternatives; handoff to `/stack-control:define`;
  installation-anchored record).
- **Operator decisions captured this session (2026-06-17):** generalize beyond speckit to
  all backends; refuse all fronted-backend calls; mechanism B + C backstop; the
  capability-interface / complete-mediation reframe ("act like a stack-control API for
  adopting agents"); umbrella capability-API node boundary with the port nodes re-related
  as adapters.
- **Predecessors:** 025 US4 `speckit-guard` (`src/subcommands/speckit-guard.ts`,
  `src/speckit-wrapper/refusal.ts`); the no-git-hook ADR
  (`docs/superpowers/specs/2026-06-03-no-git-hook-enforcement.md`); the related port nodes
  `design:feature/backlog-backend-port` (specs not yet authored) and
  `impl:feature/execution-engine` (specs/002).
- **Constraints sourced from:** `.claude/rules/stack-control-succession.md` (two
  pluggability axes; capability-not-vendor), `.claude/rules/enforcement-lives-in-skills.md`
  + the ADR, `.claude/rules/agent-discipline.md` (no-offroading; capture-over-YAGNI).
