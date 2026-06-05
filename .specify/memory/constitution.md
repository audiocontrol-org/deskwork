<!--
Sync Impact Report
- Version change: 1.1.0 → 1.1.1 (PATCH — version-line constraint reversed: stack-control shares the
  repo's single lockstep version, no longer "its own version line"; operator decision 2026-06-05)
- Version change: 1.0.0 → 1.1.0 (MINOR — new principle IX + reframe to the stack-control program)
- Ratification: initial adoption 2026-06-04; amended 2026-06-04, 2026-06-05
- Amendment 1.1.0 (2026-06-04): reframed preamble + title around the stack-control program
  (successor to dw-lifecycle); added Principle IX (Execution-Backend Pluggability); qualified the
  Additional Constraints (manifest port DEFERRED to substrate; plan source is Spec Kit tasks.md;
  isolation invariant). Rationale: capture this session's architectural decisions so every spec
  inherits them.
- Principles defined (9):
  I. Test-First (NON-NEGOTIABLE)
  II. Integration-First, No Speculative Building
  III. Branch on Capabilities, Never Provider Identity
  IV. Division of Labor (provider intent / stack-control substrate + governance)
  V. No Fallbacks, No Mock Data Outside Tests
  VI. Strict Typing & Composition
  VII. Commit & Push Early and Often
  VIII. Faithful Tool Adoption
  IX. Execution-Backend Pluggability (capability, not vendor)
- Added sections: Additional Constraints; Development Workflow & Quality Gates; Governance
- Removed sections: none
- Template alignment:
  ✅ .specify/templates/plan-template.md — generic Constitution Check slot still compatible (no change)
  ✅ .specify/templates/spec-template.md — no mandatory-section conflict (no change)
  ✅ .specify/templates/tasks-template.md — principle-driven task types compatible (no change)
- Follow-up TODOs: none
-->

# stack-control Constitution (pluggable-lifecycle-providers program)

This constitution governs the development of the `pluggable-lifecycle-providers` program — realized as
the **`stack-control`** plugin (CLI `stackctl`), built as the **successor to `dw-lifecycle`** (a new
in-monorepo plugin sharing the repository's single lockstep version with every other plugin;
absorb-then-retire; `dw-lifecycle` stays undisturbed until parity). It derives from deskwork's existing conventions (`.claude/CLAUDE.md`, `.claude/rules/`,
including `.claude/rules/stack-control-succession.md`), the program roadmap
(`docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-roadmap.md`), and the operator
directives set during the integration-first dogfood of GitHub Spec Kit. Where this constitution and
deskwork's repo-level rules overlap, they are intended to agree; deskwork's rules remain authoritative
for the wider repo. (The earlier `design.md` is superseded-as-spine — it now describes the deferred
substrate feature, not the current path.)

## Core Principles

### I. Test-First (NON-NEGOTIABLE)

TDD is mandatory: write a failing test, watch it fail for the expected reason, then write the
minimal code to pass. Red-Green-Refactor is strictly enforced. Exploration spikes are permitted to
discover shape, but a spike MUST be thrown away and rebuilt test-first — a spike is NEVER kept as
"for now" production code. Rationale: tests written after implementation pass immediately and prove
nothing; only a test seen failing first proves it tests the right thing.

### II. Integration-First, No Speculative Building

Abstractions MUST be derived from real, concrete instances — never designed from a single imagined
provider. A port or schema is only trusted once two concrete instances have flowed through it.
Specs capture everything known or knowably implied; scoping is a SEPARATE, explicit, operator-driven
pass. The agent MUST NOT insert unrequested scope cuts ("YAGNI", "deferred", "not in v1",
scope-advisory tables). Rationale: designing the abstraction before a real instance is the standard
way to build the wrong shape; capture-then-scope keeps the operator in control of scope.

### III. Branch on Capabilities, Never Provider Identity

The differentiated back half (audit-barrage, the finding state machine, scope/clone/debt governance)
MUST contain zero branches on which provider authored a plan. It branches only on a declared
capability snapshot. Rationale: this is the load-bearing rule that makes a future provider cheap —
a provider implementing the minimum contract works because deskwork fills the rest from capabilities,
not from special-casing a provider name.

### IV. Division of Labor

Providers own authoring intent: the source artifact is authoritative for INTENT and is never written
to by deskwork. deskwork owns physical substrate (docs tree, branch, worktree), execution status, and
governance, and is authoritative for PROGRESS. Projection is strictly one-way (provider artifact →
normalized manifest); deskwork NEVER writes governance state back into a provider artifact. Rationale:
the authority split — intent vs progress — is what dissolves the impedance mismatch; bidirectional
sync reintroduces it.

### V. No Fallbacks, No Mock Data Outside Tests

Outside test code, the system MUST NOT implement fallbacks or use mock data. Missing functionality or
data MUST raise a descriptive error naming what is absent. Rationale: fallbacks and mock data hide
unimplemented paths and become permanent bug factories; an error surfaces the gap immediately.

### VI. Strict Typing & Composition

Composition over inheritance; interface-first design across boundaries; dependency injection with
interface types. No `any`, no `as Type`, no `@ts-ignore`. Source files stay within 300–500 lines;
larger files MUST be refactored for modularity. Use the package's established import conventions.
Rationale: typing discipline and small modules keep the differentiated back half auditable as it
grows.

### VII. Commit & Push Early and Often

Work is committed and pushed frequently, one logical change per commit, with descriptive messages.
Commit messages and PR descriptions carry NO AI/Claude attribution. A wrong commit stays small and
cheap to revert when commits are atomic. Rationale: small, frequent, pushed commits minimize lost
work and keep the branch reviewable.

### VIII. Faithful Tool Adoption

When evaluating or living with an adopted tool's workflow (here, Spec Kit's
constitution → specify → clarify → plan → checklist → tasks → analyze → implement), follow its
prescribed steps IN ORDER. Do not skip steps or off-road, even when a step seems optional or
redundant. Rationale: the purpose of adoption is to learn the tool's intended lived experience;
off-roading produces knowledge of a workflow the tool does not actually prescribe.

### IX. Execution-Backend Pluggability (capability, not vendor)

The execution engine MUST talk to execution backends only through a capability port and MUST NOT
branch on a vendor/tool identity in backend selection or dispatch. It MUST support at least two
backend kinds — in-session sub-agent dispatch and batch CLI shell-out — and MUST run a plan to
completion when only one kind is available; it MUST NOT hard-depend on any vendor's batch/headless
CLI mode (which a vendor may sunset). When no available backend declares a needed capability, it
fails loudly (Principle V), never silently skipping. Rationale: this is Principle III applied to the
*execution* axis — capability-based selection is what makes the engine outlive any single vendor's
CLI surface. (Note the two distinct axes: the *provider/plan-source* port is DEFERRED — features are
built concretely against Spec Kit's `tasks.md` first; the *execution-backend* port is in scope now.)

## Additional Constraints

- **Plan source (current):** features are built **concretely against Spec Kit's `tasks.md`** (its
  `[P]` markers + Dependencies section). The normalized `lifecycle-manifest` as a provider port is
  **DEFERRED to the substrate feature** — derived once concrete integration proves the shape, not
  designed up front. (When that port is built, its task spine is a flat top-level collection; phases,
  when present, are a thin overlay referencing tasks by id.)
- **Isolation invariant:** `stack-control` is developed and published WITHOUT destabilizing
  `dw-lifecycle`, which is in active use doing real work.
- Enforcement discipline lives in skill bodies and CLI verbs, never in git hooks the adopter does not
  receive from installing the plugin.
- Provider/version pinning is treated as one unit; a version change is a recorded event, never a
  silent drift.

## Development Workflow & Quality Gates

- Pre-implementation: the relevant design/spec is read and the applicable principle is cited before
  code is written.
- Findings from audits are scoped into the plan (not deferred via code comments); a fix follows TDD
  (a test exercising the defect is written before the fix).
- Pre-commit hooks are never bypassed; issues are fixed rather than skipped.
- Closure requires verification in a formally-installed release; the agent posts evidence, the
  operator decides closure.

## Governance

This constitution supersedes ad-hoc practice for this feature's development. Amendments require: a
written rationale, a version bump per the policy below, and propagation to dependent Spec Kit
templates in the same change. Compliance is checked at planning (`/speckit-plan` Constitution Check)
and review; complexity that violates a principle MUST be justified in writing or removed.

Versioning policy (semantic):
- MAJOR: backward-incompatible governance/principle removal or redefinition.
- MINOR: a new principle/section added or materially expanded guidance.
- PATCH: clarifications, wording, non-semantic refinements.

**Version**: 1.1.1 | **Ratified**: 2026-06-04 | **Last Amended**: 2026-06-05
