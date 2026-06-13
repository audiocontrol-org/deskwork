# Implementation Plan: Portable stack-control workflow across Claude Code and Codex

**Branch**: `feature/portability` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-portability/spec.md`

## Summary

Make `stack-control` genuinely portable across Claude Code and Codex by moving
workflow authority into `stackctl`, keeping host adapters thin, hiding the
backlog backend behind a stable abstraction, and rehosting release/update
orchestration without breaking the monorepo's lockstep release behavior. The
same migration retires the old repo-wide feature workflow as an active path so
`stack-control` becomes canonical.

This feature is not a cosmetic doc pass. It changes the ownership boundary of
workflow behavior: front-door actions, backlog interactions, and release/update
semantics must become host-neutral shared-core capabilities with explicit,
host-native adapters on top. Claude marketplace remains a distribution channel,
not the source of truth for behavior or versioning.

## Technical Context

**Language/Version**: TypeScript ESM on Node 22.x via `tsx`

**Primary Dependencies**: `tsx`, `vitest`, existing Spec Kit scripts under
`.specify/`, existing stack-control CLI/runtime under `plugins/stack-control/`

**Storage**: Markdown files plus YAML-frontmatter-backed backlog storage behind
the current backlog backend seam; git history and release tags for release
state; `.specify/feature.json` for active spec resolution

**Testing**: `vitest` for unit/integration tests in `plugins/stack-control/src/__tests__/`;
shell-script and command-contract verification for release and installer flows

**Target Platform**: Local CLI environments used by Claude Code and Codex on
macOS/Linux-like shells

**Project Type**: Monorepo plugin + CLI workflow tooling

**Performance Goals**: No material regression in front-door or backlog command
latency; release verification remains bounded by existing local smoke and npm
assert timings

**Constraints**:
- Constitution Principle I: RED-first, no post-hoc tests
- Constitution Principle III: branch on capabilities, never provider/host identity
- Constitution Principle V: no silent fallbacks or fabricated success
- Claude Code and Codex must both feel first-class
- Monorepo release remains lockstep across shipped plugins/packages
- Backlog backend must not leak into the stable workflow contract
- Old repo-wide feature workflow must be decommissioned without leaving feature
  workflow authority ambiguous

**Scale/Scope**: `plugins/stack-control/` skill bodies, CLI subcommands,
backlog seam, docs, release orchestration, and associated tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I — Test-First**: Pass, provided every portability behavior change
  lands with failing tests first across CLI/shared-core and thin adapter
  coverage.
- **Principle II — Integration-First, No Speculative Building**: Pass. The
  portability target is derived from two concrete hosts (`claude`, `codex`) and
  one concrete backlog seam already present in-tree. No universal host registry
  is designed up front.
- **Principle III — Branch on Capabilities, Never Provider Identity**: Pass
  with caution. Host adapters may branch on explicit host capabilities, but
  workflow semantics must not fork by host identity.
- **Principle V — No Fallbacks, No Mock Data Outside Tests**: Pass only if host
  limitations and missing backend capabilities fail loudly.
- **Principle VIII — Faithful Tool Adoption**: Pass. The front door continues to
  drive Spec Kit rather than reimplementing spec authoring.

No constitutional violations require justification.

## Project Structure

### Documentation (this feature)

```text
specs/016-portability/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── host-adapter-contract.md
│   ├── backlog-port-contract.md
│   └── release-portability-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
plugins/stack-control/
├── README.md
├── skills/
│   ├── backlog/SKILL.md
│   ├── define/SKILL.md
│   ├── extend/SKILL.md
│   └── execute/SKILL.md
├── src/
│   ├── backlog/
│   ├── subcommands/
│   └── __tests__/
└── [portable release surface under stack-control or shared helper location]

.claude/skills/release/
.agents/skills/release/
scripts/
```

**Structure Decision**: Keep the implementation centered in
`plugins/stack-control/` because portability is a `stack-control` capability,
but treat the existing Claude-owned release helper tree as migration input.
Release logic may be rehomed or wrapped, but the authoritative behavior must
end up behind a host-neutral surface.

## Phase 0: Research

See [research.md](./research.md) for settled decisions on:
- shared-core vs adapter behavior ownership
- backlog backend invisibility
- release/update portability under lockstep monorepo semantics
- Codex consumption/update shape
- decommissioning the old repo-wide feature workflow in favor of stack-control

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](./data-model.md) for the core portability entities:
- portable workflow contract
- host adapter
- backlog port/backend split
- release unit and distribution channel
- parity verdict

### Contracts

- [host-adapter-contract.md](./contracts/host-adapter-contract.md)
- [backlog-port-contract.md](./contracts/backlog-port-contract.md)
- [release-portability-contract.md](./contracts/release-portability-contract.md)

### Quickstart

See [quickstart.md](./quickstart.md) for the runnable validation path across
Claude Code, Codex, backlog abstraction, and lockstep release portability.

## Complexity Tracking

No constitutional violations recorded.
