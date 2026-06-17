# Implementation Plan: Un-skippable workflow protocol

**Branch**: `feature/stack-control` (session-pinned; one long-lived branch, TF-09) | **Date**: 2026-06-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/025-unskippable-workflow-protocol/spec.md`

## Summary

Extend the 024 compass-enforcement pattern one layer down — into the `implementing`
phase — so the four offroading holes that currently depend on operator vigilance
become mechanically impossible for an agent following the skills. The mechanism is
built entirely from existing primitives: 021 per-phase checkpoints + scope
fingerprints, 022 gate-eval + governed `WORKFLOW.md`, and the 024 compass-precondition
pattern. Five surfaces: (US1) a per-phase-checkpoint graduate gate whose whole-feature
`record-converged impl` signal is **composed** from the union of per-phase checkpoints
(no separate whole-feature govern run); (US2) `execute` firing `govern --phase` at each
`tasks.md` phase boundary as a non-discretionary post-condition; (US3) mechanical
commit-and-push at each boundary (commit-local-first, push fail-loud); (US4) a speckit
wrapper that refuses a direct invocation of any backend speckit skill
(specify/plan/tasks/implement) and redirects to its front door; (US5) removal of every
agent-offered skip/defer/shortcut affordance from stack-control skills. All enforcement
lives in the governed `WORKFLOW.md` + skill bodies + CLI verbs (travels with `claude
plugin install`), never git hooks.

## Technical Context

**Language/Version**: TypeScript (strict mode), executed via `tsx` (in-tree plugin code under `plugins/stack-control/src/`).

**Primary Dependencies**: existing stack-control internals — `src/workflow/` (gate-eval, phase-derivation, compass, house-rules, WORKFLOW.md grammar), `src/subcommands/` (govern, roadmap, workflow, execute-check, spec-check), the 021 per-phase checkpoint + scope-fingerprint code, the `templates/WORKFLOW.md` governed lifecycle. Vitest for tests.

**Storage**: files only — `.stack-control/govern/phase-checkpoints/<feature>/phase-<id>.json` (021), `.stack-control/govern/convergence/*.json` (composed signal), `templates/WORKFLOW.md` + installation override, `ROADMAP.md` node markers. No database.

**Testing**: Vitest (`src/__tests__/`), TDD mandatory (Constitution I). Fixture-based gate-eval + compass + execute-cadence tests; no mocked filesystem (testing rule — use tmp fixtures).

**Target Platform**: interactive coding-agent sessions (Claude Code, Codex) + a plain shell for the CLI verbs. No headless/batch CLI dependency (Principle IX).

**Project Type**: stack-control plugin — CLI (`stackctl`) + skills (`/stack-control:*`) + governed `WORKFLOW.md`.

**Performance Goals**: per-phase govern payload stays within the model fleet envelope (~98,304 bytes observed) by construction; `boundary-too-large` becomes a non-event on the sanctioned path.

**Constraints**: enforcement MUST travel with `claude plugin install` (WORKFLOW.md + skill bodies + CLI verbs), NEVER `.husky/`/`.git/hooks/` (enforcement-lives-in-skills.md); source files 300–500 lines (Principle VI); no `any`/`as`/`@ts-ignore`; honest boundary (no claim to stop a deliberate human bypass — FR-017).

**Scale/Scope**: the workflow/govern/skill surface of one plugin; ~5 enforcement surfaces; depends on TASK-70 (authoritative phase file lists) and companions TASK-75 (right-sizing).

*No NEEDS CLARIFICATION remain — the approved design record + the `/speckit-clarify` pass (compose graduate gate; wrap full backend chain) resolved every open decision.*

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First (NON-NEGOTIABLE)** — PASS (planned). Every surface lands RED→GREEN: gate-eval fixtures (US1), execute-cadence fixtures (US2/US3), wrapper-refusal tests (US4), skill-body audits (US5). No surface ships without a first-failing test.
- **II. Integration-First, No Speculative Building** — PASS. The mechanism is derived from concrete, in-use primitives (021/022/024), not an imagined abstraction. The spec captured everything; scoping was the operator's explicit pass (one-feature-one-spec; compose; full-chain wrapper). No agent-inserted YAGNI.
- **III. Branch on Capabilities, Never Provider Identity** — PASS. The wrapper and gate branch on skill/criterion identity within stack-control's own surface, not on any external provider's vendor identity.
- **IV. Division of Labor** — PASS. The gate + checkpoints + composed record are deskwork-owned PROGRESS state; no governance state is written back into a provider's source artifact. `tasks.md` (intent) is read, never written by the gate.
- **V. No Fallbacks, No Mock Data Outside Tests** — PASS. FR-004/FR-008 fail loud (missing file list; oversized phase) rather than scoping a partial/empty payload; FR-011 fails loud on push failure. No silent downgrade.
- **VI. Strict Typing & Composition** — PASS (planned). New code composes existing modules; files kept <500 lines (watch `payload-implement.ts` which is already at the cap — TASK-48; the execute-cadence work must not push it over).
- **VII. Commit & Push Early and Often** — PASS, and **this is partly the feature itself** (US3 mechanizes the principle). Implementation commits per task boundary.
- **VIII. Faithful Tool Adoption** — PASS, and **this is partly the feature itself** (US4/US5 make the prescribed order un-bypassable). This plan was produced by running the Spec Kit chain in order (specify → clarify → plan).
- **IX. Execution-Backend Pluggability** — PASS / N/A-leaning. The wrapper governs *which front-door skill* drives the backend, not which execution backend runs a plan; it adds no vendor branch. The fleet-envelope sizing (US2) is capability-derived, not vendor-derived.

**Result**: no violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/025-unskippable-workflow-protocol/
├── plan.md              # This file
├── research.md          # Phase 0 — how 021/022/024 primitives compose
├── data-model.md        # Phase 1 — checkpoint, composed record, gate criterion, wrapper
├── quickstart.md        # Phase 1 — runnable validation scenarios (SC-001..SC-007)
├── contracts/           # Phase 1 — gate criterion, execute cadence, wrapper refusal
│   ├── graduate-gate.md
│   ├── execute-cadence.md
│   └── speckit-wrapper.md
├── checklists/
│   └── requirements.md  # /speckit-specify quality checklist (passing)
└── tasks.md             # /speckit-tasks output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── src/
│   ├── workflow/                 # gate-eval, phase-derivation, WORKFLOW grammar, house-rules
│   │   ├── gate-eval.ts          # +criterion: all-phase-checkpoints-current (US1)
│   │   └── ...                   # composed-record reader (US1 compose)
│   ├── govern/                   # per-phase checkpoints + scope fingerprints (021); compose
│   ├── subcommands/
│   │   ├── execute-check.ts      # execute cadence post-conditions (US2/US3)
│   │   └── ...
│   └── speckit-wrapper/          # NEW — refusal shim over backend speckit skills (US4)
├── templates/
│   └── WORKFLOW.md               # +graduate gate criterion (US1); travels with install
├── skills/
│   ├── execute/SKILL.md          # per-phase govern + commit/push cadence (US2/US3)
│   ├── define/SKILL.md, extend/SKILL.md, ...  # remove shortcut affordances (US5)
│   └── (all)/SKILL.md            # US5 audit: no skip/defer affordances
└── .claude/skills/speckit-*/     # wrapped backend skills (US4 interception point)
```

**Structure Decision**: Single-project plugin layout (the established stack-control
shape). New code extends `src/workflow/` (gate criterion + composed-record reader),
`src/govern/` (compose-from-checkpoints), and `src/subcommands/execute-check.ts`
(cadence), plus a new `src/speckit-wrapper/` module for the backend-skill refusal. The
governed `templates/WORKFLOW.md` carries the new gate criterion so adopters inherit it.

## Complexity Tracking

> No Constitution Check violations — no entries required.

## Phase notes

> **Phase-vs-transition timing (U1, resolved 2026-06-16, see spec FR-006a)**: per-phase
> govern fires *during* `implementing` (each task-phase boundary). By the time
> `implementing → governing` fires, all per-phase checkpoints exist; the `governing` phase
> therefore performs **no new whole-feature govern run** — it composes the
> `record-converged impl` signal from the checkpoint union and verifies all checkpoints
> are current (the graduate gate). The graduate gate criterion is
> `all-phase-checkpoints-current`, NOT `record-converged impl` (C1).

- **Phase 0 (research.md)**: resolve how the 021 checkpoint/fingerprint, 022 gate-eval
  criterion kinds, and the existing whole-feature `record-converged` reader compose into
  a single graduate signal; how `execute` currently sequences phases (and where the
  cadence post-condition attaches); the interception mechanism options for the wrapper
  (shadowing skill vs. injected precondition block).
- **Phase 1 (data-model.md, contracts/, quickstart.md)**: model the checkpoint, the
  composed record, the new gate criterion, and the wrapper; specify the three contracts;
  write runnable validation scenarios mapped to SC-001..SC-007. Update the `CLAUDE.md`
  SPECKIT marker to point at this plan.
- **Phase 2 (tasks.md)**: produced by `/speckit-tasks` (not here). Tasks are organized so
  the per-phase boundaries are themselves right-sized for the fleet envelope (the feature
  dogfoods its own US2 cadence during implementation).
