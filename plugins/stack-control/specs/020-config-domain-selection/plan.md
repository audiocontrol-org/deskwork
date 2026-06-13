# Implementation Plan: Config-domain discovery and sticky selection

**Branch**: `020-config-domain-selection` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-config-domain-selection/spec.md`

## Summary

Teach the shared installation resolver to do one more thing when its normal
upward walk fails: inspect the enclosing git repo for descendant installation
domains, honor any stored session/branch preference, and either resolve the
chosen domain or fail loudly with an explicit candidate list.

The change stays inside stack-control's existing installation model. Inside an
installation, nearest-enclosing upward-walk still wins. The new behavior only
applies when no enclosing installation exists.

## Technical Context

**Language/Version**: TypeScript under Node 22.x

**Primary Dependencies**: existing installation resolver, git-root helpers,
stackctl CLI dispatcher, vitest

**Storage**: repo-local preference state under git-local metadata; no committed
product files

**Testing**: vitest resolver + CLI tests using synthetic git repos with one and
many plugin-local installations

**Target Platform**: stack-control adopters in Codex and Claude working inside
multi-installation repos

**Project Type**: CLI/runtime resolver behavior

**Constraints**:
- preserve nearest-enclosing semantics inside an installation
- fail loud on ambiguity and invalid sticky state
- keep discovery bounded to the enclosing git repo
- avoid per-verb special casing; the shared resolver owns the behavior

**Scale/Scope**: `src/config/installation.ts`, a new preference/discovery seam,
CLI wiring for explicit selection, and focused tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I — Test-First**: Pass if resolver and selector behavior land
  under RED-first tests before implementation.
- **Principle II — Integration-First, No Speculative Building**: Pass. The
  feature targets a real dogfood failure already recorded in tooling feedback.
- **Principle V — No Fallbacks, No Mock Data Outside Tests**: Pass. Ambiguous
  or stale preference state fails loudly; the resolver never guesses.

No constitutional violations recorded.

## Project Structure

### Documentation (this feature)

```text
specs/020-config-domain-selection/
├── plan.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
plugins/stack-control/
├── src/config/
│   ├── installation.ts
│   ├── errors.ts
│   └── [new discovery/preference seam]
├── src/subcommands/
│   └── [new selector verb]
└── tests/ or src/__tests__/
```

## Phase 1: Resolver design

- Define the candidate-discovery boundary and the sticky-preference precedence.
- Keep invalid/ambiguous cases fail-loud with descriptive errors.

## Phase 2: RED tests

- Single discovered domain from repo root.
- Multiple candidates with no preference fail loudly and list choices.
- Session preference overrides branch preference.
- Invalid stored preference fails loudly.

## Phase 3: Implementation

- Add shared discovery/preference logic under `src/config/`.
- Wire the selector verb into `src/cli.ts`.
- Thread the new behavior through the shared resolver only.

## Phase 4: Verification

- Run targeted vitest suites and shell-level checks from the repo root and a
  selected plugin root.
