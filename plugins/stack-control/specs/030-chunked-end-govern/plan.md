# Implementation Plan: Chunked whole-feature end-govern

**Branch**: `feature/stack-control` (long-lived program branch; spec dir `030-chunked-end-govern`) | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/030-chunked-end-govern/spec.md`

**Design record**: [`docs/superpowers/specs/2026-06-21-govern-whole-feature-chunked-payload-design.md`](../../docs/superpowers/specs/2026-06-21-govern-whole-feature-chunked-payload-design.md) (operator-approved; architecture is settled there)

## Summary

Make `stackctl govern` audit a feature **at end, over committed work**, as the single govern path — a clean break that deletes the entire per-phase apparatus. The whole committed feature diff (`governedSha`..HEAD) is partitioned by code coupling into envelope-sized **chunks** (each ≤ the active fleet envelope), so the run **never FATALs on `boundary-too-large`** regardless of feature size; chunks are audited in parallel, findings are fixed by worktree-isolated parallel fix-subagents, only fix-touched chunks are re-audited (bounded loop), a final interface-level **seam pass** backstops cross-chunk contract breaks, and the run **reconciles exactly once** into a single whole-feature convergence record that is the sole graduation criterion.

**US9 (added 2026-06-21, dogfood gap):** the above pipeline (`end-govern-pipeline.runEndGovern`) was authored but **never wired** — the implement-mode CLI shipped a per-chunk `runProtocol` stand-in, so the parallel-audit / fix-fanout / reconcile-once behavior was dead code and the CLI audited a single over-envelope payload. US9 wires `runEndGovern` as the CLI's single path (mapping `auditOne`→barrage, `runFix`→fix-fanout, `canMerge`→merge-serialize), unifies the gate onto the pipeline's `WholeFeatureConvergenceRecord` (one schema, one lift, one dampener run), and fixes the reused path's defects discovered by the dogfood: **rendered-byte** chunk sizing (not raw), coverage-preserving trim (no dropped files, no dangling markers), implement-scoped checkpoint rejection, standard untracked-fold diff, and seam-pass arity. This also lands the still-open clean-break deletions (per-phase modules; `payload-implement.ts`) and the ≤500-line decomposition.

## Technical Context

**Language/Version**: TypeScript (strict mode — no `any`, no `as Type`, no `@ts-ignore`), run via `tsx`; Node ESM with the package's established import conventions.

**Primary Dependencies**: The existing `stackctl govern` engine modules — `fleet-negotiation.ts`, `protocol.ts`, `payload-implement.ts`, `phase-boundary-sizing.ts`, `audit-barrage` fire/render, `audit-barrage-lift.ts` / `loop-hygiene.ts`, `convergence-record.ts`, `check-barrage-dampener.ts`, the workflow `gate-eval.ts`. **No new runtime dependency is introduced** — coupling-graph construction, bin-packing, worktree dispatch, and the seam pass are built from `git` (already shelled) + in-tree TypeScript. (If a graph/packing helper proves load-bearing, it is justified at research-time, not assumed here.)

**Storage**: Installation-anchored JSON / markdown artifacts under `.stack-control/` (the FR-010 installation-anchor invariant; same anchoring as `convergence-record.ts:35`). New artifacts: chunk set, `split-cluster` markers, touched-set rounds, seam result, the whole-feature convergence record (the convergence record path scheme already exists; the rest are new and get a doctor/schema surface per FR-021).

**Testing**: vitest. Test-first per Principle I — every FR gets a RED test that is watched to fail for the expected reason before any implementation. Fixtures are on-disk fixture feature trees (per `.claude/rules/testing.md` — never mock the filesystem); coupling/chunking/seam/touched-set are pure functions tested directly; the end-govern pipeline is exercised against fixture diffs.

**Target Platform**: Node CLI (`stackctl`). Fix-fanout dispatch targets a Claude Code / Codex host that can spawn fix-subagents (the capability port — Principle IX); the engine runs to completion when only one backend kind is available.

**Project Type**: CLI engine (single project — `src/` + co-located `__tests__/`).

**Performance Goals**: A whole-feature audit completes under the fleet envelope (every chunk ≤ `Math.min(...negotiatedLanes.maxPromptBytes)`) with **bounded** re-audit rounds (a hard round cap backstops a coupling cycle — FR-013). Audit parallelism is chunks × lanes under a concurrency cap; fix parallelism is worktree-isolated under a configurable cap (OQ-2). No unbounded fan-out (worktree exhaustion queues).

**Constraints**: Every touched source file ≤ 500 lines (Principle VI) — including the decomposed `payload-implement.ts` successors AND every new chunking module. No fallbacks / fail-loud (Principle V) — oversized cluster after sub-split, unresolvable merge, fix-subagent failure, and round-cap-hit all surface explicitly, never silently degrade. Capability-not-vendor (Principles III / IX) — fix-fanout and audit lanes branch on declared capability, never a vendor identity. Language-neutral coupling baseline (no hard-block on a non-TS adopter — directory + diff cross-reference is universal; TS import-graph is a precision layer only).

**Scale/Scope**: Roadmap-sized features — tens of files, tens of KB of committed diff, a multi-lane fleet. Coupling graph computed over the `governedSha`..HEAD file set (not the whole repo).

### Unknowns / NEEDS CLARIFICATION

Most design forks are resolved by the approved design record. The two genuine residuals are the captured open questions (carried, not cut):

- **OQ-1 (NEEDS CLARIFICATION — precision, not direction)**: how coarse the directory-only coupling signal is on a large flat directory for a non-TS adopter, and whether a per-adopter coupling-resolver seam ships now or as a follow-on. *Direction is settled* (universal baseline ships; precision layer is additive); only the seam-now-vs-later call is open.
- **OQ-2 (NEEDS CLARIFICATION — tuning)**: the exact default worktree-fix concurrency cap and whether it is adopter-configurable. Recommendation: a small default (≈4), audit concurrency bounded by fleet negotiation, fix cap configurable.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

All 9 principles evaluated. **Verdict: PASS (no deviations).**

| # | Principle | Verdict | How this feature satisfies it |
|---|-----------|---------|-------------------------------|
| I | Test-First (NON-NEGOTIABLE) | PASS | Every FR (FR-001..FR-023) gets a RED test first, watched to fail for the expected reason. Coupling-graph / bin-pack / chunk-id / touched-set / seam-detector are pure functions tested in isolation; clean-break deletions (FR-017..FR-020) are asserted by tests that the surfaces are *absent* (invoking `--phase` errors; grep-for-symbol yields zero). No spike kept as "for now" code. |
| II | Integration-First, No Speculative Building | PASS | The chunking port is derived from the **two concrete instances** already in hand — the real committed diff of an actual feature and the live fleet envelope — not an imagined provider. No scope cuts inserted; the spec's open questions stay marked (OQ-1/OQ-2), never silently dropped (capture-over-YAGNI). The seam-pass and oversized-cluster handling are built because the design record's forks demand them, not speculatively. |
| III | Branch on Capabilities, Never Provider Identity | PASS | The audit lanes are selected by fleet negotiation (capability snapshot), never by which model authored the work. The coupling baseline degrades by *declared capability* (TS import-graph present ⇒ use it; absent ⇒ directory+diff baseline) — never by vendor name. |
| IV | Division of Labor | PASS | End-govern reads the committed provider diff and writes only stack-control-owned governance state (chunk set, markers, touched-set, seam result, convergence record) under the installation anchor. It never writes governance state back into a provider artifact; projection stays one-way (diff → chunk payloads). Fix commits land on the feature branch as *substrate/progress*, the authorized stack-control role. |
| V | No Fallbacks, No Mock Data Outside Tests | PASS | Oversized cluster after trim + sub-split that *still* cannot fit → fail loud (no silent reduced-fidelity default). Unresolvable merge → surface to operator, no fabricated resolution (FR-010). Fix-subagent failure → isolate + surface at reconcile (FR-011). Round-cap hit → STOP + surface for override, never auto-graduate unresolved churn (FR-013). A genuinely-missing coupling target is not fabricated. |
| VI | Strict Typing & Composition | PASS | New modules are composition-first with interface-typed boundaries and DI; no `any`/`as`/`@ts-ignore`. **`payload-implement.ts` (801 lines, over cap) is decomposed** as part of building `cluster-payload` (FR-022), and every new chunking module is authored ≤ 500 lines with a one-line responsibility (see Project Structure). SC-007 asserts no touched file > 500 lines. |
| VII | Commit & Push Early and Often | PASS | One logical change per commit, pushed at each task boundary; no AI attribution. The feature's own fix-fanout commits are atomic per chunk. |
| VIII | Faithful Tool Adoption | PASS | This plan is authored at the `plan` step of the Spec Kit chain (constitution → specify → clarify → plan → checklist → tasks → analyze → implement) with no step skipped. The clean-break deletions do not remove a Spec Kit step. |
| IX | Execution-Backend Pluggability (capability, not vendor) | PASS | **Fix-fanout dispatches via a capability port** — in-session sub-agent OR batch CLI shell-out — and runs to completion when only one kind is available; it never hard-depends on a specific vendor's headless CLI and never branches on vendor identity. When no available backend declares the dispatch capability, it fails loud (Principle V). The audit barrage already selects lanes by capability; this feature preserves that. |

No entry in Complexity Tracking — there are no justified deviations.

## Project Structure

### Documentation (this feature)

```text
specs/030-chunked-end-govern/
├── plan.md              # This file
├── research.md          # Phase 0 output — technical-unknown resolutions
├── data-model.md        # Phase 1 output — entities, relationships, lifecycle
├── quickstart.md        # Phase 1 output — runnable validation scenarios
├── contracts/           # Phase 1 output — observable-interface contracts
│   ├── govern-cli.md
│   ├── cluster-payload.md
│   ├── fix-fanout.md
│   └── graduate-gate.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root: `plugins/stack-control/`)

**New / changed modules** (each responsibility one-line-statable; all ≤ 500 lines):

```text
src/govern/
├── cluster-payload/                  # NEW — coupling graph → clusters → envelope chunks (deterministic)
│   ├── coupling-graph.ts             #   build coupling edges (dir-adjacency + diff cross-ref; TS import-graph layer)
│   ├── clustering.ts                 #   group coupled files into clusters from the coupling graph
│   ├── envelope-binpack.ts           #   bin-pack clusters into chunks ≤ envelope; oversized-cluster sub-split
│   ├── non-audit-trim.ts             #   cheap pre-pass: drop lockfiles/generated/vendored/whitespace/fixtures bytes
│   └── chunk-id.ts                   #   deterministic stable chunk-id pinned to governedSha..HEAD
├── chunk-manifest.ts                 # NEW — per-chunk manifest of the OTHER chunks' file lists
├── touched-set.ts                    # NEW — derive fix-touched chunks from fix commits (coupling-correct)
├── seam-pass.ts                      # NEW — interface-level cross-chunk/split-cluster audit; substantive-break gate
├── fix-fanout/                       # NEW — worktree-isolated parallel fix dispatch + merge/serialize
│   ├── worktree-dispatch.ts          #   per-chunk fix-subagent dispatch via the capability port (Principle IX)
│   └── merge-serialize.ts            #   merge fix worktrees; serialize a conflicting pair; surface unresolvable
├── end-govern-pipeline.ts            # NEW — CLUSTER→AUDIT→FIX→RE-AUDIT→SEAM→RECONCILE orchestration
├── payload-chunk.ts                  # NEW (payload-implement.ts successor) — render ONE chunk's audit payload
├── payload-diff-scope.ts             # NEW (payload-implement.ts successor) — committed-diff + untracked-fold scoping
├── chunk-artifacts.ts                # NEW — read/write/schema the chunk-set, split-cluster, touched-set, seam artifacts
├── protocol.ts                       # CHANGED — drive per-chunk barrage; remove the boundary-too-large FATAL terminal
├── convergence-record.ts            # CHANGED — single whole-feature reconcile; close-in-loop-fixed-before-lift
└── audit-barrage-lift.ts/loop-hygiene.ts  # CHANGED — reconcile-once absorbs lift-auto-close (in-loop-fixed not lifted)

src/subcommands/
└── govern.ts                         # CHANGED — single end-govern path; DELETE the --phase arm + composition arm

src/workflow/
└── gate-eval.ts                      # CHANGED — graduate-impl collapses to the single record-converged-impl criterion

src/doctor/  (or the project's doctor-rule location)
└── chunked-govern-artifacts.ts       # NEW — doctor rule validating the new artifacts (FR-021)

src/**/__tests__/                     # NEW — RED-first tests per FR (co-located)
```

**DELETIONS (clean break — FR-017..FR-020; deleted, not deprecated):**

- The `--phase` invocation arm of `govern.ts` (the block at `govern.ts:810–845`) and the exclusion-based whole-feature composition arm (`govern.ts:846–891`).
- The per-phase checkpoint writer + `phase-checkpoints/*.json` artifact + its doctor/schema rule.
- `GOVERN_CHECKPOINT` / `--checkpoint` env+flag handling (TASK-125).
- `allPhaseCheckpointsCurrent` + the `all-phase-checkpoints-current` criterion (`gate-eval.ts:162–177`) + all callers; the either-of arm of `graduate-impl` (`gate-eval.ts:179–199`) collapses to `ctx.implRecordConverged`.
- The per-phase arms of the compass/workflow transitions (TASK-152 / TASK-155).
- `resolvePhaseCheckpointStatuses`, `assertPriorPhaseCheckpointsCurrent`, `featureCheckpointKey`, `carriedFilesForComposition`, `compositionExcludePaths` and the `phaseUnit` exclusion plumbing — once no caller remains.
- The `boundary-too-large` FATAL terminal (`protocol.ts:393–404`) — there is no whole-feature size at which govern refuses; `BoundaryTooLargeError` is removed once `phase-boundary-sizing.ts`'s sole consumer (the chunk bin-packer) no longer throws it (the bin-packer *avoids* the condition rather than asserting against it).
- TASK-153 (migration) → WONTFIX; no grandfather / backfill code is written.

**Structure Decision**: Single-project CLI engine. All work lands under `plugins/stack-control/src/`, decomposing the over-cap `payload-implement.ts` into `payload-chunk.ts` + `payload-diff-scope.ts` + the `cluster-payload/` directory, and adding the `fix-fanout/`, `chunk-manifest`, `touched-set`, `seam-pass`, `chunk-artifacts`, and `end-govern-pipeline` modules. The chunked path is inclusion-based (FR-023), replacing the deleted exclusion-based composition arm.

## Phase 0: Research

See [research.md](./research.md). Resolves: coupling-graph construction (universal baseline vs TS precision layer — OQ-1); envelope bin-packing + oversized-cluster sub-split + non-audit trim pre-pass; deterministic stable chunk-id pinned to `governedSha`..HEAD; worktree-isolated parallel fix dispatch via the capability port + merge/serialize; touched-set computation + round-cap backstop; bounded re-audit termination argument; seam-pass substantive-break detector; reconcile-once absorbing lift-auto-close; concurrency-cap defaults (OQ-2); the clean-break deletion inventory + single graduate criterion. Each decision traces to the design record / spec FRs / clarifications. Tensions between design and spec (if any) are recorded under a "Tensions surfaced" heading.

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md) (entities, relationships, validation, lifecycle, which are persisted artifacts needing a doctor/schema surface), [contracts/](./contracts/) (observable interfaces — `govern-cli`, `cluster-payload`, `fix-fanout`, `graduate-gate`), and [quickstart.md](./quickstart.md) (runnable validation scenarios mapped to SC-001..SC-007 and US1..US8). Re-run the Constitution Check after design: no new violations expected (the module list above is authored to the ≤500-line cap and the capability-port shape up front).
