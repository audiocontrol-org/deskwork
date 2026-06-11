# Implementation Plan: Installation Isolation

**Branch**: `feature/stack-control` (one-long-lived-branch convention) | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/installation-isolation/spec.md` (promoted from backlog item *anchor unification* — TASK-45)

## Summary

Make the nearest-enclosing installation the single anchor for all stack-control-owned state. Six stories: the isolation invariant on every state-writing verb (US1), fail-loud refusal when no installation exists (US2), governance anchored at the installation with an explicit cross-tree feature fold (US3), cwd-independence (US4), loud legacy half-installation detection (US5), and the relocation of this repo's Spec Kit root into the installation (US6). `--repo-root` is retired on state-writing verbs (Clarification 2026-06-10); external anchors (git toplevel, Spec Kit root) are derived from their own markers, never parameterized.

## Technical Context

**Language/Version**: TypeScript (strict), Node 22, run via tsx — changes inside `plugins/stack-control/` (plus the US6 tree move + repo-root `CLAUDE.md` pointer)

**Primary Dependencies**: existing in-tree modules (009's `resolveInstallation` / `resolveCodebaseBoundary`); `node:child_process` git spawns; no new dependencies

**Storage**: file-based, all under `<installation>/.stack-control/` (audit-runs, scope-discovery state, barrage config, backlog store) + the resolved feature root as the designated feature anchor

**Testing**: vitest; tmp-dir nested-installation fixtures on real fs; the isolation probe is a table-driven suite member (research R5)

**Target Platform**: macOS/Linux dev machines + unattended loops

**Project Type**: CLI plugin (stackctl verbs) — single project

**Performance Goals**: N/A (placement/correctness feature)

**Constraints**: exit-code contracts frozen (the retired flag hits the existing unknown-flag exit 2); no `.husky` enforcement; files ≤300–500 lines; no `any`/`as`/`@ts-ignore`; no silent fallbacks

**Scale/Scope**: 6 stories; ~14 source files touched (research inventory rows 1–11) + the US6 tree move; suite baseline 185 files / 1220 tests stays green

## Constitution Check

*PASS — no violations, no Complexity Tracking entries.*

- **I. Test-First**: every story lands RED-first; the isolation probe is itself the RED for US1 (it fails today on rows 1, 5, 7 of the inventory).
- **II. Integration-First**: no new abstraction beyond threading the existing `Installation` record (R1) through verbs that already exist; the probe exercises real verbs on real fixtures.
- **III. Capability not provider**: untouched.
- **IV. Division of labor**: all changes are substrate/governance placement; no provider-intent surface.
- **V. No fallbacks / fail loud**: US2/US5 are this principle applied to placement; the retired flag errors loudly.
- **VI. Strict typing & composition**: the threaded `Installation` record replaces stringly `repoRoot` params; no inheritance.
- **VII. Commit & push early**: per-story commits, pushed at each boundary.
- **VIII. Faithful tool adoption**: git and Spec Kit are consumed through their own anchor mechanisms (`-C`/`--relative`; nearest-`.specify` walk-up); backlog.md untouched.
- **IX. Execution-backend pluggability**: untouched.

## Project Structure

### Documentation (this feature)

```text
specs/installation-isolation/
├── spec.md              # clarified spec (2 decisions encoded 2026-06-10)
├── plan.md              # this file
├── research.md          # Phase 0 — anchor inventory ground truth + decisions R1–R8
├── data-model.md        # Phase 1 — entities/invariants
├── quickstart.md        # Phase 1 — per-story validation runbook
├── contracts/
│   └── cli-contracts.md # Phase 1 — verb-by-verb contract deltas
├── checklists/
│   └── requirements.md  # spec quality checklist
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
plugins/stack-control/src/
├── scope-discovery/
│   ├── codebase-boundary.ts / (009 installation resolver — R1's single resolver; gains the
│   │                          legacy half-installation probe, R6)
│   ├── audit-barrage/
│   │   ├── orchestrate-barrage.ts   # US1: run-dirs → installation (inventory #1)
│   │   └── config-loader.ts         # US1: config resolution → installation (inventory #2)
│   ├── discovery-agents/clone-detector-reader.ts  # US1: baseline via the boundary resolver (#3 split-brain)
│   ├── scope-widen.ts               # US1: auto-seed at the installation (#5)
│   └── util/feature-root.ts         # US3/US6: feature anchor, installation-aware specs lookup
├── govern/
│   ├── payload-implement.ts         # US3: git -C installation --relative + cross-tree feature fold (R3)
│   └── protocol.ts                  # US3: installation threading
├── subcommands/
│   ├── govern.ts                    # US3/US4: --repo-root retired; --at; excludePaths from the
│   │                                #   installation (TASK-40); legacy notice call site
│   ├── audit-barrage.ts             # US1: --repo-root retired → --at
│   ├── scope-widen-cli.ts / scope-inventory-cli.ts / slush-findings.ts  # US1: flag retirement
│   └── (audit-barrage-lift.ts)      # US1: anchor threading
├── backlog/root.ts                  # US4: explicit start-point parameter (cwd only as default)
└── __tests__/installation-isolation-probe.test.ts  # US1/FR-008: the table-driven probe (R5)

US6 (tree move, this repo): .specify/ + specs/ → plugins/stack-control/; repo-root CLAUDE.md pointer;
resolveFeatureRoot installation-first specs lookup (numbered dirs grandfathered).
```

**Structure Decision**: single project; one new test file (the probe) plus per-story test files; no new modules — R1 threads the existing installation record through existing seams.

## Per-story design (what changes where)

- **US1**: every inventory-row writer resolves the `Installation` once at verb entry (R1) and derives all `.stack-control/*` paths from `installation.root`. The probe (R5) is the story's RED: nested fixture, snapshot outside the installation, table of verbs, zero-diff assertion.
- **US2**: the shared resolver's "no installation found" error becomes the uniform refusal on every state-writing verb (it already exists for 009-era verbs; the converted verbs inherit it). Message names the start dir + `stackctl setup`.
- **US3**: `payload-implement` takes the installation record; committed diff = `git -C <installation> diff --relative <base>`; untracked fold via cwd-relative `ls-files` at the installation; when `resolveFeatureRoot` lands outside the installation subtree, a labeled second diff arm scoped to the feature root folds in (R3) and the cross-tree anchor is announced (R4). `resolveGovernExcludePaths` resolves from the installation record, never cwd (TASK-40). `--repo-root`/`GOVERN_REPO_ROOT` retired on govern.
- **US4**: `backlogRoot()` (and any cwd-walk-up helper) gains an explicit start-point parameter; verbs pass the resolved anchor; cwd remains only the default start of the walk-up at verb entry. The probe's three-cwd invariance test (SC-003) pins it.
- **US5**: R6's probe in the shared resolver: installation ≠ git toplevel AND toplevel carries a marker-less `.stack-control/` → three-part notice (found/ignored, actually-used, safe migration advice — never a destructive command). This repo's own root state is the live fixture; migration execution is an operator step recorded in quickstart.
- **US6**: `git mv` the Spec Kit root into the installation (R7); update the repo-root `CLAUDE.md` SPECKIT pointer; `resolveFeatureRoot` looks for `<installation>/specs` first (exact-slug + grandfathered `NNN-` names), falling back to the legacy locations read-only; verify the full authoring chain + governance on the relocated tree; the US3 cross-tree fold then becomes a no-op on this repo (kept for adopters with split layouts).

## Complexity Tracking

No constitution violations — table intentionally empty.
