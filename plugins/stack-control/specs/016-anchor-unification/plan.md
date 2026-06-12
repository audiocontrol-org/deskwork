# Implementation Plan: Anchor Unification

**Branch**: `feature/stack-control` (long-lived program branch; spec dir `016-anchor-unification`) | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/016-anchor-unification/spec.md`

## Summary

Complete the installation-anchor invariant (constitution 1.3.0) under the operator's isolation decree (spec § Clarifications 2026-06-12): every stackctl invocation resolves exactly one **domain** (the directory containing `.stack-control/` plus all descendants; domains never overlap) and derives *all* stack-control-owned reads and writes from it. Technically this is: (a) one shared anchor-resolution seam threaded through govern's exclusion/slush sub-steps and the backlog dispatcher; (b) retirement of the transitional toplevel context-file consultation; (c) two-level config resolution (domain override → plugin default) with setup-time seeding; (d) a no-overlap detector used at setup and resolution; (e) one shared not-found→`FATAL — ` wording helper; (f) self-guarding isolation fixtures. Each defect lands TDD-first (RED test reproducing the captured finding, then the fix).

## Technical Context

**Language/Version**: TypeScript (strict), Node ≥ 20, run via `tsx` (no build step for the CLI; `bin/stackctl` dispatches to `src/`)

**Primary Dependencies**: Node stdlib (`fs`, `path`, `child_process`); `yaml` for config parsing; backlog.md (`backlog` binary) as the backlog store backend

**Storage**: Files only — `.stack-control/` per domain (config.yaml, backlog store, audit-runs/, audit logs under `specs/<feat>/`)

**Testing**: Vitest (`npm --workspace … test` / `npx vitest`), tmp-dir fixture trees on disk (never mocked FS), the isolation harness + probe (`src/__tests__/_isolation-harness.ts`, `installation-isolation-probe.test.ts`, `installation-isolation-cwd.test.ts`)

**Target Platform**: Developer workstations (macOS/Linux) + unattended governance loops (the Spec Kit `after_implement` hook)

**Project Type**: CLI plugin (in-monorepo, self-contained under `plugins/stack-control/`)

**Performance Goals**: N/A beyond "no extra barrage rounds burned" (SC-003); the overlap-detection walk-up adds at most one marker probe per ancestor directory — negligible

**Constraints**: Files ≤ 300–500 lines (Principle VI) — `src/subcommands/govern.ts` (629) and `src/govern/payload-implement.ts` (620) are ALREADY over cap and this feature touches both; extraction is part of the work, not optional. No fallbacks (Principle V). Frozen adopter contracts on existing exit codes/wording outside the not-found class.

**Scale/Scope**: 9 captured defects across ~12 source files + 3 test files; one constitution amendment (1.3.0 → 1.4.0)

### Current-state map (verified 2026-06-12)

| Surface | State |
|---|---|
| `src/config/installation.ts` (123 ln) | `resolveInstallation(startDir)` walk-up to filesystem root; error code `not-found`; no overlap detection |
| `src/subcommands/govern.ts` (629 ln) | `--at` exists; `--repo-root` already retired with loud FATAL (installation-isolation); `repoRoot = installation.root` internally. REMAINING: `resolveGovernExcludePaths` → `backlogRoot()` → `resolveInstallation(process.cwd())` (TASK-40/AUDIT-20260611-13); slush step non-fatal exit-1 from cwd (TASK-56); two-base CLAUDE.md search incl. git toplevel (~lines 225–233) feeding `resolveSpecPath`'s unanchored regex (TASK-50) |
| `src/backlog/root.ts` (44 ln) | `backlogRoot()` resolves from `process.cwd()`; `STACKCTL_BACKLOG_DIR` env override seam |
| `src/subcommands/backlog.ts` (314 ln) | dispatcher (capture, import-github, import-slush, promote, list); no `--at` (TASK-51); `import-slush` resolves audit log via `resolveFeatureRoot({ repoRoot: process.cwd() })` (TASK-53); `FATAL — ` gated on `not-found` here (~301–305) |
| `src/backlog/promote.ts` | pending-create advisory joins target path against cwd (~131–134) (TASK-22) |
| barrage config loader | installation override → plugin template default; no env/repo-root source (good); `stackctl setup` writes 5 managed files but does NOT seed the config (TASK-55 residue) |
| `FATAL — ` sites | gated: backlog.ts, install-scope-discovery.ts (~221–228); unconditional: scope-widen.ts (~281), scope-inventory.ts (~312), slush-findings.ts (~135), audit-barrage.ts (~365), audit-barrage-lift.ts (~403) (TASK-52) |
| isolation fixtures | `makeMarkerlessFixture`/`makeNestedFixture` assert "nothing above tmpdir" in a comment only (TASK-49) |
| over-cap files touched | govern.ts 629, payload-implement.ts 620 (+ scope-widen, scope-inventory, audit-barrage, audit-barrage-lift already over — only refactor the ones this feature edits) |

## Constitution Check

*GATE: evaluated pre-Phase-0; re-evaluated post-Phase-1 — PASS (with the noted amendment task).*

- **I. Test-First** — PASS. Every defect fix starts from a RED test reproducing the captured finding (the audit findings give exact reproductions); the in-repo committed-store seam test (FR-003) is itself a spec requirement.
- **II. Integration-First** — PASS. All changes land against concrete, existing verbs; no speculative ports. No scope cuts inserted; the spec captures all nine items.
- **III. Capabilities, not provider identity** — N/A (no backend dispatch touched).
- **IV. Division of Labor** — PASS (no provider artifacts written).
- **V. No Fallbacks** — PASS and load-bearing: the feature *removes* silent fallbacks (slush exit-1 skip, inert exclusion, plugin-default config surprise, toplevel context fallback). New code paths fail loud per FR-012.
- **VI. Strict Typing & Composition** — PASS WITH WORK: govern.ts and payload-implement.ts exceed the 300–500 cap and are edited here; the plan extracts the anchor/resolution concerns into new small modules (`src/config/anchor.ts`, `src/govern/resolve-spec-path.ts`) rather than growing the over-cap files. The four other over-cap files get only the shared-helper swap (net shrink); their full refactor stays with TASK-48's sibling concerns.
- **VII. Commit & Push Early and Often** — process; per-task commits + push.
- **VIII. Faithful Tool Adoption** — chain followed in order (specify → clarify → plan → checklist → tasks → analyze → implement).
- **IX. Execution-Backend Pluggability** — N/A.
- **Installation-anchor invariant (Additional Constraints)** — this feature implements it fully; the isolation decree STRENGTHENS it (no-overlap, domain-complete config, `--at` on backlog verbs closing the carve-out). **Consequence: constitution amendment 1.3.0 → 1.4.0** (MINOR — materially expanded guidance: domain definition + no-overlap invariant + domain-complete configuration) with written rationale, landed in the same change as the behavior per Governance. The amendment *removes* the implicit allowance for nested installations that `resolveInstallation`'s nearest-first walk-up created.

## Project Structure

### Documentation (this feature)

```text
specs/016-anchor-unification/
├── spec.md              # Done (specify + clarify)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── anchor-resolution.md
│   ├── cli-at-flag.md
│   └── resolver-error-wording.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (plugin root)

```text
src/
├── config/
│   ├── installation.ts        # EDIT: overlap detection in the walk-up (FR-013)
│   └── anchor.ts              # NEW: the one shared anchor seam — resolveAnchor({at?, cwd})
│                              #      + classifyResolverError (not-found → wording class, FR-009)
├── backlog/
│   ├── root.ts                # EDIT: accept explicit startDir/anchor; keep env seam
│   └── promote.ts             # EDIT: advisory joins against domain root (FR-007)
├── subcommands/
│   ├── govern.ts              # EDIT: thread the run's anchor into exclude-paths + slush;
│   │                          #       slush divergence → loud FATAL (FR-002/003/012);
│   │                          #       extract spec-path resolution out (over-cap relief)
│   ├── backlog.ts             # EDIT: --at on dispatcher (FR-006); import-slush audit-log via
│   │                          #       anchor (FR-005); shared wording helper
│   ├── setup.ts               # EDIT: seed audit-barrage-config.yaml (FR-004);
│   │                          #       refuse setup inside an existing domain (FR-013)
│   ├── slush-findings.ts      # EDIT: shared wording helper (FR-009)
│   ├── audit-barrage.ts       # EDIT: shared wording helper (FR-009)
│   └── audit-barrage-lift.ts  # EDIT: shared wording helper (FR-009)
├── govern/
│   ├── payload-implement.ts   # EDIT: inert-exclusion impossible/loud (FR-003); shrink toward cap
│   └── resolve-spec-path.ts   # NEW: domain-internal, full-path-anchored, existence-validated
│                              #      marker resolution (FR-008); toplevel layer retired
├── scope-discovery/
│   ├── install-scope-discovery.ts  # EDIT: shared wording helper
│   ├── scope-widen.ts              # EDIT: shared wording helper
│   └── scope-inventory.ts          # EDIT: shared wording helper
└── __tests__/
    ├── _isolation-harness.ts                 # EDIT: fixture self-guard (FR-010)
    ├── installation-isolation-probe.test.ts  # EDIT: extend to unified contract (FR-011)
    ├── installation-isolation-cwd.test.ts    # EDIT: delete the no---at carve-out; add backlog rows
    └── govern-payload-self-reference.test.ts # EDIT: in-repo committed-store seam test (FR-003)
.specify/memory/constitution.md               # EDIT: amendment 1.3.0 → 1.4.0
templates/audit-barrage-config.yaml           # unchanged (remains the plugin default)
```

**Structure Decision**: Single-project CLI; all changes inside `plugins/stack-control/`. The two NEW modules exist to (a) make "one anchor per invocation" a *mechanical* property — every verb imports `resolveAnchor` from one seam instead of hand-rolling `process.cwd()` resolution (detection over instruction, per the thesis) — and (b) relieve the two over-cap files this feature edits.

## Complexity Tracking

No constitution violations to justify. The one governance-relevant act is the 1.3.0 → 1.4.0 amendment (strengthening, documented in the Constitution Check above).
