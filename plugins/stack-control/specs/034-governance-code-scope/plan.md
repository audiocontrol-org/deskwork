# Implementation Plan: Governance Code Scope

**Branch**: `feature/governance-code-scope` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/034-governance-code-scope/spec.md`

**Design record**: [`docs/superpowers/specs/2026-07-04-governance-code-scope-design.md`](../../docs/superpowers/specs/2026-07-04-governance-code-scope-design.md) (operator-approved)

## Summary

Restrict implement-mode governance (the whole-feature `end-govern` chunked audit fired by `/stack-control:execute`) to **code** by excluding documentation from the diff payload before chunking. A new pure `applyCodeScope(scope, policy): DiffScope` filter composes at the single scope seam (`end-govern-runtime.ts` `scopeDiff`), so both the initial scope and the mid-fix re-scope are filtered identically. The include/exclude glob policy comes from a new `govern` block on the installation config (default ON; markdown excluded; runtime-defining markdown re-included). In code-only mode the implement lens omits its documentation-drift bullet, an emptied scope becomes a clean "nothing to govern" success, and the run surfaces a concise exclusion summary. The governing rule: **code defines the runtime environment; documentation is meta-information about it and is operator-reviewed.**

## Technical Context

**Language/Version**: TypeScript 5.6, Node ≥20, executed via `tsx` (in-tree, no build step for the plugin engine).

**Primary Dependencies**: existing — `yaml` (config parse), `commander` (CLI), `ajv`/`ajv-formats` (schema). New — a glob matcher for the include/exclude policy (see research.md; decision: add `picomatch` as a direct dependency).

**Storage**: files only. Config at `<installation>/.stack-control/config.yaml`; no database.

**Testing**: `vitest` (unit + integration), fixture trees on disk (never mock the filesystem), per the project testing rules.

**Target Platform**: local developer/operator machine running the stack-control plugin (Claude Code / Codex hosts).

**Project Type**: single project — CLI tool + library (`stackctl` engine under `plugins/stack-control/src`).

**Performance Goals**: reduce the implement-mode audit payload by the full byte size of excluded documentation (SC-002); the filter is O(files × globs), negligible relative to git diff assembly.

**Constraints**: strict typing (no `any`/`as`/`@ts-ignore`); no fallbacks/mock outside tests (throw on missing); source files 300–500 lines; `@/`-style import conventions of this package; state anchored inside the installation.

**Scale/Scope**: a feature diff of tens-to-low-hundreds of files; the roadmap is ~50 nodes; single long-lived per-feature branch.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First (NON-NEGOTIABLE)**: Every task is RED-first — the filter, config-loader defaults/override, lens variant, empty-scope success, and observability summary each get a failing test before implementation. PASS (enforced by task ordering in tasks.md).
- **II. Integration-First, No Speculative Building / No Scope Cuts**: The filter is derived from the concrete existing `filterDiffScope`/`DiffScope` seam, not an imagined abstraction. No YAGNI cuts; the config surface captures the operator-approved policy fully. PASS.
- **III. Branch on Capabilities, Never Provider Identity**: No provider branching introduced; the filter is vendor-neutral payload scoping. PASS (N/A axis).
- **IV. Division of Labor**: Authoring (this plan) is separate from execution; the config-resolution stays in the govern arm, the filter is a pure lib function. PASS.
- **V. No Fallbacks, No Mock Data**: Absent config → *documented defaults* (not a fallback masking missing data — the defaults ARE the specified behavior, FR-006). A malformed `govern` block MUST throw (not silently default). PASS with the explicit throw-on-malformed rule.
- **VI. Strict Typing & Composition; File Size**: New `GovernConfig`/`CodeScopePolicy` interfaces; composition (pure function threaded via DI into the runtime); `payload-diff-scope.ts` is ~323 lines, so the filter + glob helper land in a NEW module `src/govern/code-scope.ts` to stay under the cap. PASS.
- **VII. Commit & Push Early and Often**: Each task commits + pushes at its boundary. PASS (workflow discipline).
- **VIII. Faithful Tool Adoption**: Authored through the full Spec Kit chain (specify→clarify→plan→checklist→tasks→analyze) via the stack-control front door. PASS.
- **IX. Execution-Backend Pluggability**: Unaffected (no execution-backend change). N/A.

**Result: PASS — no violations.** Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/034-governance-code-scope/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (config schema + function/output contracts)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (installation: plugins/stack-control)

```text
plugins/stack-control/
├── src/
│   ├── govern/
│   │   ├── code-scope.ts            # NEW — CodeScopePolicy + applyCodeScope + glob helper + resolveCodeScopePolicy
│   │   ├── payload-diff-scope.ts    # unchanged logic (DiffScope/filterDiffScope remain the sibling shape)
│   │   ├── end-govern-runtime.ts    # MODIFIED — scopeDiff closure composes applyCodeScope; cfg gains codeScopePolicy
│   │   ├── govern-arms.ts           # MODIFIED — runImplementArm resolves policy + threads it + emits exclusion summary
│   │   ├── end-govern-pipeline.ts   # MODIFIED (minimal) — empty-scope path returns the "nothing to govern" success
│   │   ├── audit-constants.ts       # MODIFIED — code-only lens variant (omits doc-drift bullet)
│   │   └── govern-vars.ts           # MODIFIED — select the code-only lens by the code_only toggle
│   ├── config/
│   │   └── types.ts                 # MODIFIED — InstallationConfig gains govern?: GovernConfig
│   └── config/<loader>.ts           # MODIFIED — parse/translate the govern block (snake→camel), throw on malformed
└── src/__tests__/govern/
    ├── code-scope.test.ts           # NEW — applyCodeScope + policy resolution unit tests
    ├── code-scope-integration.test.ts  # NEW — through scopeDiff incl. mid-fix re-scope
    ├── code-scope-config.test.ts    # NEW — config defaults / override / malformed-throw
    ├── code-scope-lens.test.ts      # NEW — code-only lens omits the doc-drift bullet
    └── code-scope-empty.test.ts     # NEW — empty-code-scope success + observability summary
```

**Structure Decision**: Single-project CLI/library layout under `plugins/stack-control/src`. The new logic is isolated in `src/govern/code-scope.ts` (pure, testable, under the file-size cap) and threaded into the existing govern arm + runtime via dependency injection — the pipeline (`end-govern-pipeline.ts`) receives an already-filtered scope and is touched only for the empty-scope success path. This mirrors the existing `filterDiffScope`/`DiffScope` seam rather than inventing a new abstraction.

## Complexity Tracking

*No constitution violations — section intentionally empty.*
