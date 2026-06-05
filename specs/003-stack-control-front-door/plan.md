# Implementation Plan: stack-control front door — plugin + native Spec Kit execution

**Branch**: `feature/pluggable-lifecycle-providers` (spec dir `specs/003-stack-control-front-door`) | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-stack-control-front-door/spec.md`

## Summary

Stand up **`stack-control`** as its own in-monorepo Claude Code plugin (CLI `stackctl`, sharing the repo's single lockstep version — see Technical Context / research R4), **rehome** the founding governance Spec Kit extension into it (still firing on `after_implement`, still provider-neutral), and ship a **thin front door**: two in-session Claude Code skills — **curate** (full edit/iterate/review of a Spec Kit spec) and **execute** (drive native `/speckit-implement`, governance firing afterward) — layered over a small `stackctl` CLI. The whole thing must not change `dw-lifecycle`'s behavior (isolation invariant) and must be sufficient to curate-and-run the *next* feature's spec through it (the self-hosting proof). The structure mirrors `dw-lifecycle`'s real shape: a fat plugin shipping TypeScript in-tree via `tsx`, NOT a thin shell over a `packages/` workspace.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict mode), Node ≥20, ES modules (`"type": "module"`). Bash for the `bin/stackctl` shim and the Spec Kit extension's `govern.sh`.

**Primary Dependencies**: `tsx` (runtime TS executor — logic ships in-tree, no precompiled dist), `zod` (validation), `yaml`; GitHub Spec Kit (the `.specify/` framework — the integration substrate, used concretely, no provider abstraction); the Claude Code plugin host (skills + `commands/*.md` slash commands). The rehomed governance script shells to the `dw-lifecycle` CLI for `audit-barrage*` (cross-plugin seam — audit-barrage migration is a later feature).

**Storage**: Filesystem only — `specs/<feature>/`, `.specify/`, the `docs/1.0/001-IN-PROGRESS/<slug>/` tree, `audit-log.md`. No database.

**Testing**: Vitest (unit + integration against tmp fixture trees, per `.claude/rules/testing.md`) + bash smoke scripts (`scripts/smoke-*.sh`) run locally pre-PR/pre-tag. No CI test additions (project rule: CI stays fast; new smokes are local-only).

**Target Platform**: Claude Code session (darwin/linux dev); `stackctl` runs on Node ≥20.

**Project Type**: Claude Code plugin — **skills-over-CLI** architecture, single in-monorepo plugin package. Mirrors `dw-lifecycle`'s in-tree fat-plugin layout (`plugins/dw-lifecycle/{src,bin,commands,skills,spec-kit}`), NOT the thin-shell-over-`packages/` layout of `deskwork`/`deskwork-studio`.

**Performance Goals**: N/A — interactive developer tooling. End-to-end latency is dominated by the in-session agent and native Spec Kit execution, not by `stackctl`.

**Constraints**:
- **Isolation invariant** — zero `dw-lifecycle` behavior change (FR-002, SC-003).
- **No headless dependency** for execution — the execute skill runs in-session and drives native `/speckit-implement` via the in-session agent; it MUST NOT require a headless/batch CLI to invoke the agent (FR-006).
- **Fail-loud** — no fallbacks, no mock data, no faked runs outside tests; missing mechanism/spec/governance raises a descriptive error naming what is absent (FR-008, Principle V).
- TypeScript discipline: no `any`, no `as Type`, no `@ts-ignore`; files 300–500 lines; composition over inheritance. Mirror `dw-lifecycle`'s established module/import conventions (relative ESM `./x.js` imports) for parity.

**Scale/Scope**: One plugin standup + one governance-extension rehome (physical move, not fork) + two front-door skills (curate, execute) + a thin `stackctl` verb surface. **MVP = User Story 1** (execute a spec via native Spec Kit, governance firing).

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0. Must pass before Phase 0; re-checked after Phase 1.*

| # | Principle | Verdict | How this plan complies |
|---|-----------|---------|------------------------|
| I | Test-First (NON-NEGOTIABLE) | **PASS (committed)** | Every code task is RED-first: the governance-rehome smoke (`scripts/smoke-governance-after-implement.sh`, repointed) and `stackctl` verb tests are written failing, watched fail for the right reason, then made green. Spikes (if any) are thrown away and rebuilt test-first. |
| II | Integration-First, No Speculative Building | **PASS** | Built concretely against Spec Kit; the provider/plan-source port stays DEFERRED (the spec's Assumptions say so). No agent-inserted scope cuts — the spec captured everything; this plan only sequences it. |
| III | Branch on Capabilities, Never Provider Identity | **PASS** | The rehomed `govern.sh` keeps its zero-provider-branching invariant (FR-004, SC-004); the neutrality grep gate moves with it. The front door triggers execution by capability ("spec is runnable"), never by who authored the spec. |
| IV | Division of Labor | **PASS** | Governance is one-way (provider artifact → findings in `audit-log.md`); it never writes governance state back into a Spec Kit spec. Curation edits the spec the operator owns — authoring, not governance write-back. |
| V | No Fallbacks, No Mock Data Outside Tests | **PASS** | FR-008: native-exec-unavailable / spec-not-runnable / governance-absent all fail loud with a descriptive error. `govern.sh` already fails loud when `dw-lifecycle` is off PATH. |
| VI | Strict Typing & Composition | **PASS (committed)** | TS strict, no `any`/`as`/`@ts-ignore`, files 300–500 lines, composition + DI. Mirrors `dw-lifecycle`'s module shape. |
| VII | Commit & Push Early and Often | **PASS (committed)** | One logical change per commit, pushed frequently, no AI attribution. |
| VIII | Faithful Tool Adoption | **PASS** | Following Spec Kit order: constitution → specify → clarify → **plan (here)** → tasks → implement. No step skipped. |
| IX | Execution-Backend Pluggability | **N/A this feature (rationale)** | IX governs the *execution engine* (Feature 2 — the parallel multi-backend engine, explicitly OUT OF SCOPE here). Feature 1 builds **no backend-selection logic**: the execute skill uses native Spec Kit execution only, via the in-session agent. There is nothing to branch, so IX is not violated — it is satisfied vacuously and realized fully in Feature 2. The forward-compat hook: the execute skill's "in-session agent" path is one backend *kind* IX will later select among, so this feature does not foreclose the port. |

**Gate result: PASS.** No unjustified violations. The single deferral (IX) is an explicit, spec-captured scope boundary, not a complexity workaround — recorded in Complexity Tracking for traceability.

## Project Structure

### Documentation (this feature)

```text
specs/003-stack-control-front-door/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output — design decisions resolved
├── data-model.md        # Phase 1 output — entities + state
├── quickstart.md        # Phase 1 output — runnable validation guide
├── contracts/           # Phase 1 output — CLI verb + skill + extension contracts
│   ├── stackctl-cli.md
│   ├── front-door-skills.md
│   └── governance-extension.md
├── checklists/          # pre-existing (requirements checklist)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

New plugin, mirroring `plugins/dw-lifecycle/`'s in-tree fat-plugin layout:

```text
plugins/stack-control/
├── .claude-plugin/
│   └── plugin.json              # name "stack-control", repo lockstep version (== marketplace.json)
├── package.json                 # @deskwork/plugin-stack-control (private workspace pkg)
├── tsconfig.json
├── vitest.config.ts
├── bin/
│   └── stackctl                 # bash shim → tsx src/cli.ts (mirrors bin/dw-lifecycle)
├── src/
│   ├── cli.ts                   # stackctl dispatcher
│   ├── subcommands/             # deterministic verbs (curate-check, execute-check, …)
│   └── __tests__/               # vitest unit/integration
├── commands/
│   ├── curate.md                # /stack-control:curate  (US2)
│   └── execute.md               # /stack-control:execute (US1)
├── skills/
│   ├── curate/SKILL.md
│   └── execute/SKILL.md
├── spec-kit/
│   └── deskwork-governance/     # REHOMED from plugins/dw-lifecycle/spec-kit/ (git mv)
│       ├── extension.yml
│       ├── README.md
│       ├── commands/speckit.deskwork-governance.govern.md
│       └── scripts/bash/govern.sh
└── README.md

# Cross-tree edits (small, surgical):
.claude-plugin/marketplace.json  # register the stack-control plugin entry at the repo lockstep version
scripts/bump-version.ts          # ensure stack-control's plugin.json + package.json are in the lockstep sweep (R4)
scripts/smoke-governance-after-implement.sh  # repoint GOVERN path → plugins/stack-control/...
.specify/extensions/deskwork-governance/      # re-installed from the new source path
package.json (root)              # workspaces already globs plugins/* — verify stack-control is picked up
```

**Structure Decision**: **Fat plugin, in-tree TS** under `plugins/stack-control/`, mirroring `plugins/dw-lifecycle/`. Rejected the thin-shell-over-`packages/` pattern (used by `deskwork`/`deskwork-studio`) because (a) the front-door logic is plugin-specific and small enough to ship in-tree like `dw-lifecycle` does, (b) `dw-lifecycle` is the closest sibling — same skills-over-CLI lifecycle shape — so parity minimizes surprise during the absorb-then-retire migration, and (c) it avoids publishing a separate npm package before the surface has stabilized. The governance extension is a **physical move** (`git mv`) out of `dw-lifecycle`, not a fork (succession rule: "code migrating out of dw-lifecycle moves; it is not forked").

## Complexity Tracking

| Violation / Deviation | Why Needed | Simpler Alternative Rejected Because |
|-----------------------|------------|--------------------------------------|
| Principle IX not realized in this feature | IX (execution-backend port, ≥2 backend kinds) is the *differentiator* and belongs to Feature 2 (parallel engine), explicitly OUT OF SCOPE here. Feature 1 is the self-hosting bootstrap and must stay thin. | Building the capability port now would be speculative (violates Principle II — no abstraction before a 2nd concrete backend exists). Native-execution-only is the minimum that bootstraps; the in-session-agent path is the first backend kind IX will later select among, so nothing is foreclosed. |
