# Implementation Plan: Migrate scope-discovery into stack-control

**Branch**: `feature/stack-control` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-migrate-scope-discovery/spec.md`

## Summary

Vendor the `dw-lifecycle` scope-discovery surface that is not yet in `stack-control` — the jscpd-backed clone detector + disposition lifecycle, `scope-inventory`/`scope-widen` discovery with the universal + config-activated agents and synthesis, the registry-driven checks (anti-patterns / adopters / module-symmetry / deprecations), the sub-agent dispatch wrapper + gutted-stub validators, and the install/customize/doctor/export machinery — into `plugins/stack-control/src/scope-discovery/`, natively (stackctl verbs, `/stack-control:*` skills, `.stack-control/` config). The full surface ships in one delivery (no phasing; operator decision). The one new behavior on top of the port is **per-codebase clone scoping by default**: the detector resolves its scan boundary from the nearest-enclosing 009 installation (excluding nested children) instead of `process.cwd()`/whole-repo. `dw-lifecycle` is untouched (vendor/copy; SC-010).

Technical approach: TDD port — for each component, write a RED test pinning the intended (generalized) behavior, then port-and-generalize the dw-lifecycle module to GREEN. The clone-boundary resolver reuses 009's installation walk-up (`config/resolve-paths.ts`); `jscpd`'s `path`/`--root` is set to the resolved installation root by default. Schema validation reuses the validation lib chosen in research. The audit-finding orchestration loop (controller / orchestrator-loop / mediation / escalation / recovery / llm + the remainder of promote-findings) is **out of scope** — it belongs to the audit-barrage/govern machinery (separate migration).

## Technical Context

**Language/Version**: TypeScript 5.6 (strict mode), Node ≥20, run in-tree via `tsx` (no build step; mirrors dw-lifecycle + the existing stack-control plugin shape).

**Primary Dependencies**: `jscpd` ^4 (clone detection — NEW to stack-control's `package.json`; already a dw-lifecycle dep), `yaml` ^2.8 (already present), and a schema-validation library for the registry/manifest schemas — `ajv` + `ajv-formats` and/or `zod` (dw-lifecycle uses both; selection resolved in research.md R2). No `ts-morph` / `ast-grep` runtime deps — the anti-pattern `ast-grep`/`ts-morph` pattern *types* are handled by in-tree `discovery-agents/pattern-handlers/*` (confirmed: not in dw-lifecycle deps); R2 confirms coverage.

**Storage**: project-local files under the installation's `.stack-control/scope-discovery/` — `clones.yaml` (dispositioned baseline), `anti-patterns.yaml`, `adopter-manifests.yaml`, `migration-map.yaml`, scope-discovery `config.yaml`, generated reports; per-feature scope manifests + run evidence under the feature docs dir. Created lazily-and-announced (009 FR-016 model), never pre-scaffolded by installation setup.

**Testing**: `vitest` — unit (parsers, validators, scanners, agents, the boundary resolver), integration against tmp project-tree fixtures (verb ↔ file boundary, per-codebase isolation), and the ported adversarial validator harnesses with gutted-stub self-checks. Plain-shell smokes prove CLI reachability. No CI additions (project rule: local `npm --workspace` is the gate).

**Target Platform**: Node CLI (`stackctl <verb>`) as the vendor-neutral core; `/stack-control:*` Claude Code skills are thin adapters over the CLI.

**Project Type**: CLI tool / Claude Code plugin (in-tree TypeScript).

**Performance Goals**: No hard numeric SLA (advisory). Discovery agents fan out in parallel; clone detection is bounded by `jscpd` over the (now smaller) per-codebase tree — per-codebase scoping is itself a performance win vs. whole-repo scans.

**Constraints**: per-codebase scoping is the DEFAULT (no path arg); `dw-lifecycle` untouched (isolation invariant); fail-loud on malformed baseline/registry (no false-clean); no network/secrets/interactive prompts; every source file ≤500 lines (Principle VI) — files that exceed it on port are split; no `any`/`as`/`@ts-ignore`; relative ESM imports matching the existing stack-control plugin.

**Scale/Scope**: Large — port ~80–100 TypeScript modules (clone + refactor-preconditions + scope-inventory/widen + synthesis + discovery-agents + registries/checks + dispatch-wrapper + install/doctor/export/summary + scope-discovery util) plus ~18 CLI verbs and their `/stack-control:*` skills. Explicitly excludes the already-migrated audit-barrage/promote-findings and the out-of-scope audit-orchestration loop.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Test-First (NON-NEGOTIABLE) | PASS | TDD port: each module gets a RED behavior/characterization test before the port lands GREEN. A verbatim copy without a preceding test is disallowed — the test pins the *generalized* contract. |
| II. Integration-First, capture-don't-cut | PASS | Full surface captured + built (no phasing/scope-cuts). Abstractions derive from the real, proven dw-lifecycle instances — not imagined. |
| III. Branch on capabilities, not provider | PASS | Clone/discovery/registry code has no provider-identity branches. |
| IV. Division of labor | PASS | Scope-discovery reads the source tree and writes only its own registries/baseline/config; never writes a provider/spec artifact. |
| V. No fallbacks / fail-loud | PASS | FR-035 (malformed → fail loud, no false-clean); per-codebase default never silently widens to whole-repo (FR-006). |
| VI. Strict typing & 500-line files | PASS (watch) | No `any`/`as`/`@ts-ignore`. **Watch:** some dw-lifecycle modules may exceed 500 lines; any such file is split during the port (recorded in research.md R4). No pre-known unavoidable violation → Complexity Tracking empty. |
| VII. Commit & push early/often | PASS | One logical port (RED→GREEN) per commit; push at task boundaries. |
| VIII. Faithful tool adoption | PASS | Following Spec Kit order (this is `/speckit-plan`); `/speckit-tasks` next. |
| IX. Execution-backend pluggability | N/A | No execution engine in this feature. |

**Additional constraints check:** Isolation invariant honored (vendor/copy, OQ-1). Enforcement lives in skill bodies + CLI verbs, never installed git hooks (OQ-6 dropped the hook-install machinery) — consistent with `.claude/rules/enforcement-lives-in-skills.md`.

**Gate result: PASS** (one watch item, no unjustified violations). Re-checked post-Phase-1 below.

## Project Structure

### Documentation (this feature)

```text
specs/010-migrate-scope-discovery/
├── plan.md              # This file
├── research.md          # Phase 0 — R1..R6 decisions
├── data-model.md        # Phase 1 — entities + validation rules
├── quickstart.md        # Phase 1 — runnable validation scenarios (-> SCs)
├── contracts/
│   └── cli-verbs.md     # Phase 1 — stackctl verb contracts (flags + exit codes)
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── package.json                      # + jscpd dep (+ schema-validation lib per R2)
├── src/
│   ├── cli.ts                        # register migrated verbs (dispatch switch)
│   ├── config/                       # 009 installation config + resolve-paths (REUSED for the codebase boundary)
│   ├── scope-discovery/              # <- migration target (mirrors dw-lifecycle layout)
│   │   ├── clone-detector.ts         # boundary default = resolved installation root (the new behavior)
│   │   ├── jscpd-runner.ts
│   │   ├── clones-yaml*.ts           # parse / id / refactor / serialize
│   │   ├── dispose-clone.ts · batch-dispose.ts · refresh-clones-baseline.ts
│   │   ├── check-refactor-preconditions*.ts · refactor-preconditions-prompt.ts
│   │   ├── check-disposition-survivor.ts
│   │   ├── scope-inventory*.ts · scope-widen*.ts
│   │   ├── synthesis*.ts · schema/manifest-validator.ts
│   │   ├── discovery-agents/         # universal + config-activated + pattern-handlers
│   │   ├── anti-patterns-*.ts · adopter-manifests-*.ts · check-*.ts
│   │   ├── module-symmetry-*.ts · deprecation-*.ts
│   │   ├── dispatch-wrapper*.ts · dispatch-grammar.ts
│   │   ├── install-scope-discovery.ts · scope-export.ts · summary.ts · validate-scope-discovery.ts
│   │   ├── doctor-rules/              # scope-discovery-relevant rules
│   │   ├── schema/                    # JSON schemas for the registries/manifest
│   │   └── util/                      # the not-yet-migrated helpers
│   ├── subcommands/                   # one runX per migrated CLI verb
│   │   └── check-clones.ts · scope-inventory.ts · dispose-clone.ts · … (~18)
│   └── __tests__/scope-discovery/     # unit + integration + validator harnesses
└── skills/
    └── check-clones/ · scope-inventory/ · scope-widen/ · …  # /stack-control:* adapters

<installation>/.stack-control/scope-discovery/   # project-owned config + registries + baseline (lazily created)
```

**Structure Decision**: Mirror dw-lifecycle's `src/scope-discovery/` layout inside `plugins/stack-control/` (the existing stack-control plugin already mirrors dw-lifecycle's cli.ts/subcommands shape), so the port is a near-1:1 module move with generalization, not a re-architecture. CLI verbs register in the existing `src/cli.ts` dispatch switch; skills are thin `/stack-control:*` adapters over the verbs. The codebase-boundary resolver REUSES 009's `config/resolve-paths.ts` rather than introducing a second resolution model.

## Complexity Tracking

> No Constitution violations require justification. The single watch item (some ported files may exceed the 500-line cap) is handled by splitting during the port, not by an exception — so this table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1 (data-model + contracts + quickstart): no new violations introduced. The entities (clone group, baseline, scope manifest, registries, dispatch return, config) are plain typed records validated fail-loud; the CLI contracts keep the vendor-neutral-core invariant (FR-034); the per-codebase boundary reuses one resolver. Gate remains **PASS**.
