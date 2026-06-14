# design-control Constitution

## Core Principles

### I. Process-Enforced Discipline

The project assumes agents are capable-but-unreliable. Quality is enforced by
processes, governed artifacts, and fail-loud tools rather than by advisory
reminders. Any workflow change MUST prefer mechanical enforcement in
stack-control verbs, skills, or deterministic checks over host-specific tribal
knowledge.

### II. Orchestrate Existing Engines

design-control MUST orchestrate existing engines rather than invent new visual
verification engines. `/frontend-design` is the engine for authoring concerns.
The referee MUST reuse the stack-control audit-barrage and existing pixel-diff
tools rather than shipping a bespoke runtime comparison engine.

### III. Spirit-Letter Separation

UX spirit and visual letter are separate artifacts and MUST stay separate. The
wireframe is the durable lo-fi UX artifact. The design-language spec is the
durable visual-language artifact. A wireframe MUST NOT become the source of
visual styling truth, and visual identity MUST NOT depend on disposable mockup
detail.

### IV. Scaffold-First, Engine-Optional Authoring

The `v1-scaffold` path MUST remain usable with zero referee dependency and zero
required engine presence. Wireframes and design-language specs MUST be
hand-authorable. Any engine-backed authoring step is an optional accelerator,
never a scaffold prerequisite. Engine absence MUST fail loudly only on
engine-execution paths, while manual authoring paths remain usable.

### V. Fail-Loud, Evidence-First Verification

No silent fallbacks, fabricated verdicts, or hidden state. Missing inputs,
malformed manifests, unresolvable selectors, absent engines, and invalid
capture contracts MUST fail with actionable errors. Verification claims MUST be
backed by concrete artifacts, adversarial evidence, or deterministic tests, not
by narrative assurance.

### VI. Stochastic Correctness and Registered Discoveries

Cross-model agreement is the design-review signal when the referee is in play.
New leakage classes, drift patterns, or adoption gaps discovered during work
MUST be codified into deterministic tests and the stack-control scope-discovery
catalogs rather than left in prose or memory.

## Additional Constraints

- TypeScript is strict; `any`, unchecked `as`, and `@ts-ignore` are forbidden.
- Files should stay within the repo's 300-500 line guidance unless a narrower
  split would reduce clarity.
- Enforcement lives in skills and CLI verbs, never git hooks.
- `v1-scaffold` and `v1-referee-preview` are separate deliverables; scaffold
  acceptance MUST NOT depend on referee-preview artifacts.
- The plugin-local stack-control installation under `plugins/design-control/`
  is the authority for roadmap, inbox, backlog, journal, tooling feedback, and
  feature audit logs.
- Codex and Claude are both first-class operator hosts for this installation.
  Host guidance may differ in wording, but governed behavior MUST resolve
  through the same stack-control and Spec Kit artifacts.

## Workflow and Quality Gates

- Session bootstrap and wrap-up use stack-control session workflows for this
  installation.
- Spec Kit chain order is preserved: specify, clarify, plan, checklist, tasks,
  analyze, implement.
- `/speckit-analyze` is read-only and MUST be treated as a real gate: critical
  issues are resolved before implementation proceeds.
- Implementation phases MUST be governed incrementally: once a `tasks.md`
  phase is completed, that phase's work MUST go through stack-control's
  per-phase audit-barrage path before later phases proceed. Whole-feature
  `after_implement` governance remains required, but it does not replace the
  per-phase governance requirement.
- Implementation is TDD-shaped: failing tests first, then minimal
  implementation, then refactor.
- Work surfaced mid-session is captured in the local stack-control backlog
  unless it is upstream tooling friction that belongs in a tool repo issue.
- Adopter-facing claims require direct evidence in this installation or in the
  shipped plugin artifacts; implied portability claims are not enough.

## Governance

This constitution governs the design-control stack-control installation and
supersedes conflicting local habits or stale template content. Amendments
require an explicit committed edit to this file plus corresponding updates to
any affected spec, plan, tasks, or workflow guidance. Analyze and implement
steps MUST treat constitution conflicts as defects in the governed artifacts,
not as optional interpretation.

**Version**: 1.0.0 | **Ratified**: 2026-06-13 | **Last Amended**: 2026-06-13
