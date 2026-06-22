# Implementation Plan: opencode support

**Branch**: `031-opencode-support` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/031-opencode-support/spec.md`

## Summary

Implement stack-control as an opencode plugin that delegates to the `stackctl` CLI for all operations. The plugin will be a single TypeScript file that exports an opencode plugin function, registers stack-control skills, and routes skill invocations to the CLI via opencode's shell API.

## Technical Context

**Language/Version**: TypeScript 5.4+

**Primary Dependencies**: `@types/node` (for shell API types)

**Storage**: N/A (plugin state is ephemeral, CLI handles persistence)

**Testing**: Jest (unit tests for CLI delegation, event routing)

**Target Platform**: Node.js runtime (opencode's plugin environment)

**Project Type**: opencode plugin (TypeScript module)

**Performance Goals**: Skill invocation latency under 2 seconds for local CLI

**Constraints**: Must work with opencode 1.0+, no external dependencies beyond opencode's runtime

**Scale/Scope**: Single plugin file (~500 lines), supporting unlimited opencode sessions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I: Test-First
✅ **PASS** - Tests are written before implementation (TDD). The plugin includes Jest test suite for CLI delegation and event routing.

### Principle II: Integration-First, No Speculative Building
✅ **PASS** - The plugin structure is derived from real opencode plugin patterns. No speculative abstractions; the plugin directly implements the opencode plugin API.

### Principle III: Branch on Capabilities, Never Provider Identity
✅ **PASS** - The plugin uses opencode's shell API capability, not provider-specific features. No branching on opencode version.

### Principle IV: Division of Labor
✅ **PASS** - The plugin (provider) owns authoring intent (skill mappings, event routing). stack-control substrate owns physical deployment (plugin file location, CLI delegation).

### Principle V: No Fallbacks, No Mock Data Outside Tests
✅ **PASS** - Missing `stackctl` CLI raises descriptive error. No mock data in plugin code.

### Principle VI: Strict Typing & Composition
✅ **PASS** - TypeScript strict mode, no `any`, composition over inheritance. Plugin file stays under 500 lines.

### Principle VII: Commit & Push Early and Often
✅ **PASS** - Plugin development follows atomic commits with descriptive messages.

### Principle VIII: Faithful Tool Adoption
✅ **PASS** - Plugin follows opencode's plugin API exactly as documented.

### Principle IX: Execution-Backend Pluggability
✅ **PASS** - The plugin uses opencode's shell API capability for CLI delegation. The execution backend is pluggable (opencode's shell API).

**GATE STATUS**: All principles pass. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/031-opencode-support/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── opencode-plugin.ts   # Main plugin file (opencode plugin entry point)
└── src/
    ├── cli.ts           # CLI delegation module
    ├── skills.ts        # Skill routing module
    ├── events.ts        # Event mapping module
    └── version.ts       # Version reporting module

tests/
├── opencode/
│   ├── cli-delegation.test.ts
│   ├── event-mapping.test.ts
│   ├── skill-invocation.test.ts
│   └── version-sync.test.ts
└── fixtures/
    └── sample-commands.ts

docs/
└── installation.md      # Installation guide
```

**Structure Decision**: Single project structure. The plugin is a TypeScript module with a single entry point (`opencode-plugin.ts`) and supporting modules in `src/`. Tests are co-located in `tests/opencode/` for clarity.

## Complexity Tracking

No violations. The implementation follows the stack-control principles without requiring architectural deviations.
