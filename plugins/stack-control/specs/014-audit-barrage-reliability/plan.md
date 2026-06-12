# Implementation Plan: Audit-Barrage Reliability Hardening

**Branch**: `feature/audit-protocol` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-audit-barrage-reliability/spec.md`

## Summary

Make the barrage's model spawns reliable, observable, and mechanically read-only. Four threads, one module family: (1) every lane pins its model and derives its timeout from measured per-model calibration × payload size instead of a guess; (2) every spawn is mechanically prevented from mutating the repo via a required per-lane `readonly_enforcement` config field (claude: plan permission mode, spike-verified; codex: read-only sandbox, to be probe-verified); (3) every spawn settles into exactly one terminal state (`completed | timed-out | spawn-failed | killed-no-liveness`) that the lift verb and govern convergence loop consume, so a degraded fleet is loud; (4) an in-process watchdog (audiocontrol e2e heartbeat pattern, transport collapsed into the parent) kills no-sign-of-life spawns within a liveness window instead of waiting out the timeout. The claude lane moves to stream-json output for its liveness pulse; a stream-result extractor preserves the per-model markdown artifact contract for lift. All design decisions in [research.md](./research.md) (D1–D8).

## Technical Context

**Language/Version**: TypeScript (strict), Node ≥ 20, run via `tsx` (no build step; in-tree plugin convention)

**Primary Dependencies**: `node:child_process` (spawn), `node:fs` streams, `yaml` (config), existing barrage modules (`src/scope-discovery/audit-barrage/*`); no new external dependencies

**Storage**: filesystem run artifacts under `.stack-control/audit-runs/<stamp>-<feature>/` (INDEX.md, per-model `.md`, `stderr/`, new `events.ndjson`)

**Testing**: Vitest (`npm --workspace @deskwork/plugin-stack-control test`), tmp-dir fixture trees (never mocked fs), fake child processes for spawn/watchdog timing tests

**Target Platform**: macOS/Linux dev machines (same as current barrage)

**Project Type**: in-tree plugin CLI (`plugins/stack-control`, single-dispatcher `stackctl`)

**Performance Goals**: dead spawn detected within `liveness_window_seconds` (default 60 s — well under half any derived timeout, SC-004); zero added latency for healthy spawns

**Constraints**: dw-lifecycle barrage copy untouched (succession isolation); artifact contract for lift unchanged (FR-010); files ≤ 300–500 lines (split new modules rather than grow `spawn-cli.ts`)

**Scale/Scope**: 2 active lanes today (claude, codex), config supports N; payloads observed to 69 KB, derivation extrapolates linearly beyond

## Constitution Check

*GATE: evaluated pre-Phase-0 and re-checked post-Phase-1 — PASS (no violations, no Complexity Tracking entries).*

- **I. Test-First**: every behavior lands RED-first (failing Vitest seen failing for the expected reason). The 2026-06-10 spike scripts live in `/tmp` and are NOT kept; the enforcement mechanism they discovered is rebuilt test-first. Watchdog timing uses fake-timer/fake-child tests.
- **II. Integration-First**: capability fields are derived from two concrete lanes (claude, codex) that both flow through the same schema — not an imagined provider. No scope cuts beyond the operator-clarified decisions recorded in spec.md.
- **III / IX. Capability, not vendor**: the loader and spawn wrapper branch ONLY on declared config fields (`output_mode`, `readonly_enforcement`, `model`, derivation fields) — never on the binary name. A lane is "claude-shaped" because its config says stream-json + plan-mode fragment, not because `binary == claude`.
- **IV. Division of Labor**: untouched — this feature is entirely within stack-control's governance substrate.
- **V. No Fallbacks**: missing `model` / `readonly_enforcement` / derivation fields → fail-loud load refusal with remediation (FR-001/FR-011); a killed stream writes no fabricated `<model>.md`; unprobed enforcement is declared `none`, never assumed.
- **VI. Strict Typing & Composition**: new `terminalState` discriminated union; new modules (`watchdog.ts`, `stream-result-extractor.ts`, `timeout-derivation.ts`) keep `spawn-cli.ts` under the line cap; no `any`/`as`/`@ts-ignore`.
- **VII. Commit & Push Early and Often**: per-task commits, no attribution, pushed at each task boundary.
- **VIII. Faithful Tool Adoption**: plan → checklist/tasks → analyze → implement in Spec Kit order.

## Project Structure

### Documentation (this feature)

```text
specs/014-audit-barrage-reliability/
├── spec.md
├── checklists/requirements.md
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D8
├── data-model.md        # Phase 1 — entities & state machine
├── quickstart.md        # Phase 1 — SC-001..006 validation runbook
├── contracts/
│   ├── barrage-config-schema.md     # config grammar v2 (lane fields)
│   └── run-artifacts-contract.md    # INDEX/terminal-state/events artifact contract
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
plugins/stack-control/
├── src/scope-discovery/audit-barrage/
│   ├── types.ts                     # MODIFIED: terminalState union, enforcement/liveness fields,
│   │                                #   timeoutBasis; isModelRunConverged → terminalState==='completed'
│   ├── config-loader.ts             # MODIFIED: require model/{{model}}/readonly_enforcement/derivation
│   │                                #   fields; FR-011 migration refusal; output_mode validation
│   ├── spawn-cli.ts                 # MODIFIED: argv assembly (model pin + enforcement fragment),
│   │                                #   wire watchdog + extractor; keep single-settle finish()
│   ├── watchdog.ts                  # NEW: last-activity staleness timer → SIGTERM/SIGKILL,
│   │                                #   killed-no-liveness settle (audiocontrol pattern, in-process)
│   ├── stream-result-extractor.ts   # NEW: NDJSON line consumer → events.ndjson capture +
│   │                                #   result-event text → <model>.md at settle (FR-010)
│   ├── timeout-derivation.ts        # NEW: max(floor, secs_per_kb × payload_kb), basis record
│   ├── run-artifacts.ts             # MODIFIED: INDEX renders terminalState/enforcement/liveness/
│   │                                #   timeout basis + fleet degradation line
│   └── orchestrate-barrage.ts       # MODIFIED: thread payload size, terminal states, fleet report
├── src/subcommands/
│   ├── audit-barrage.ts             # MODIFIED: surface degraded-fleet + unenforced warnings at fire time
│   └── audit-barrage-lift.ts        # MODIFIED: consume terminalState; never lift a non-completed
│                                    #   lane as clean; fleet report in lift output (FR-007)
├── src/govern/                      # MODIFIED (convergence loop): fleet report + quorum-collapse
│                                    #   statement in loop status; dampener counters skip killed lanes
├── templates/audit-barrage-config.yaml   # MODIFIED: v2 grammar, opus pin, enforcement fragments,
│                                         #   derivation defaults (research.md D4/D5 table)
└── src/__tests__/scope-discovery/audit-barrage/   # NEW/MODIFIED: per-module RED-first suites

.stack-control/audit-barrage-config.yaml  # MODIFIED: project override migrated to v2
```

**Structure Decision**: everything stays inside the existing `plugins/stack-control` barrage module family; three new single-purpose modules keep changed files under the size cap. No dw-lifecycle path is touched (succession isolation). Consumers (lift verb, govern loop) change only where they read run results.

## Complexity Tracking

No constitution violations — table intentionally empty.
