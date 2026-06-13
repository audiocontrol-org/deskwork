# Implementation Plan: Public Codex distribution for adopters

**Branch**: `019-codex-adopter-distribution` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-codex-adopter-distribution/spec.md`

## Summary

Add a first-class Codex adopter distribution path for `stack-control` that
consumes the same released version line as Claude, without requiring adopters
to clone the deskwork repo or invent a local marketplace entry.

The work centers on public distribution metadata, release wiring, and docs. It
does not change stack-control workflow behavior; it changes how released plugin
artifacts are discovered and installed by Codex adopters.

## Technical Context

**Language/Version**: JSON metadata, Markdown docs, TypeScript tests and release
checks under Node 22.x

**Primary Dependencies**: existing lockstep version sweep in
`scripts/bump-version.ts`, stack-control release portability checks, Codex
plugin manifest conventions

**Storage**: released plugin manifests, marketplace/catalog metadata, README and
test fixtures

**Testing**: `vitest` assertions for docs/distribution metadata plus release
contract checks

**Target Platform**: Codex adopter environments plus existing Claude release
line

**Project Type**: plugin distribution and release metadata

**Constraints**:
- no repo-local-only adopter story
- same release line across Claude and Codex
- fail loud on distribution drift

**Scale/Scope**: `plugins/stack-control/README.md`, Codex marketplace/catalog
metadata, release/version checks, associated tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I — Test-First**: Pass if distribution metadata checks and doc
  assertions land RED-first.
- **Principle II — Integration-First, No Speculative Building**: Pass. The
  feature targets one concrete missing distribution path.
- **Principle V — No Fallbacks, No Mock Data Outside Tests**: Pass. Missing or
  stale distribution metadata must fail loudly.

No constitutional violations recorded.

## Project Structure

### Documentation (this feature)

```text
specs/019-codex-adopter-distribution/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── codex-distribution-contract.md
│   ├── release-alignment-contract.md
│   └── docs-separation-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
plugins/stack-control/
├── README.md
├── .codex-plugin/
└── src/__tests__/

scripts/
.claude-plugin/
[Codex marketplace/catalog metadata if repo-managed]
```

## Phase 0: Research

See [research.md](./research.md) for decisions on:
- what counts as an adopter-ready Codex distribution mechanism
- how Codex distribution metadata aligns to the released version line
- how docs separate adopter distribution from local development flow

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](./data-model.md) for the core entities:
- codex distribution channel
- released plugin artifact
- distribution metadata
- development install flow

### Contracts

- [codex-distribution-contract.md](./contracts/codex-distribution-contract.md)
- [release-alignment-contract.md](./contracts/release-alignment-contract.md)
- [docs-separation-contract.md](./contracts/docs-separation-contract.md)

### Quickstart

See [quickstart.md](./quickstart.md) for adopter install/update verification.

## Complexity Tracking

No constitutional violations recorded.
