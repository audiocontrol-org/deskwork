<!--
Sync Impact Report
- Version change: (uninitialized template) → 1.0.0
- Ratification: initial adoption 2026-06-04
- Principles defined (8):
  I. Test-First (NON-NEGOTIABLE)
  II. Integration-First, No Speculative Building
  III. Branch on Capabilities, Never Provider Identity
  IV. Division of Labor (provider intent / deskwork substrate + governance)
  V. No Fallbacks, No Mock Data Outside Tests
  VI. Strict Typing & Composition
  VII. Commit & Push Early and Often
  VIII. Faithful Tool Adoption
- Added sections: Additional Constraints; Development Workflow & Quality Gates; Governance
- Removed sections: none (template placeholders replaced)
- Template alignment:
  ✅ .specify/templates/plan-template.md — reviewed; generic Constitution Check slot is compatible
  ✅ .specify/templates/spec-template.md — reviewed; no mandatory-section conflict
  ✅ .specify/templates/tasks-template.md — reviewed; principle-driven task types (test-first) compatible
- Follow-up TODOs: none
-->

# deskwork pluggable-lifecycle-providers Constitution

This constitution governs the development of the `pluggable-lifecycle-providers` feature within the
deskwork monorepo. It derives from deskwork's existing conventions (`.claude/CLAUDE.md`,
`.claude/rules/`), the feature's `design.md`, and the operator directives set during the
integration-first dogfood of GitHub Spec Kit. Where this constitution and deskwork's repo-level
rules overlap, they are intended to agree; deskwork's rules remain authoritative for the wider repo.

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

## Additional Constraints

- The `lifecycle-manifest` is the port between authoring and governance. Its task spine is a flat,
  top-level collection; phases (when present) are a thin overlay referencing tasks by id.
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

**Version**: 1.0.0 | **Ratified**: 2026-06-04 | **Last Amended**: 2026-06-04
