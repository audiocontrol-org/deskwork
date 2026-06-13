# Port Ledger — Migrate scope-discovery into stack-control (010, FR-004)

Per-component record of how each migrated module landed: **verbatim** (copied, only
header-path comment + `dw-lifecycle <verb>`→`stackctl <verb>` + `.dw-lifecycle/…`→
`.stack-control/…` string generalization), **generalized** (behavior-preserving change
to a seam — per-codebase boundary, config home), **split** (to honor the ≤500-line cap),
**rebuilt/new** (authored for stack-control), or **severed** (an out-of-scope coupling removed).

The audit-finding orchestration loop (controller / orchestrator-loop / mediation /
escalation / recovery / llm + the remainder of promote-findings) and the
workplan-archive / tooling-feedback-import tooling were **NOT migrated** (different
feature; spec § "Migration boundary — explicitly out of scope").

## Foundational

| Component | Disposition |
|---|---|
| `codebase-boundary.ts` | **new** — the per-codebase boundary resolver (the one novel behavior on top of the port; reuses 009 `resolveInstallation` walk-up; nested-child exclusion; fail-loud, no cwd fallback). R1. |
| `baseline-path.ts` | **new** — shared per-codebase baseline/registry path resolver (DRY across detector + dispose verbs). |
| `jscpd-runner.ts` | **generalized** — parameterized by an explicit scan root + ignore list (no repo-root/`.jscpd.json` assumption); flag-driven invocation; resolves the LOCAL pinned jscpd bin (walk-up) instead of `npx jscpd` (which from a scan cwd outside the repo fetched a flag-incompatible jscpd). `parseJscpdReport`/collapse logic verbatim. |
| `clones-yaml.ts`, `.id.ts`, `.parse.ts`, `.refactor.ts` | **verbatim** (content-hashed ids, refactor Step 0a/0b preconditions). |
| `schema/*.schema.json` + `schema/manifest-validator.ts` | **verbatim** (ajv 2020 + ajv-formats). In-scope schema subset only. |
| `util/{registry-yaml,glob,modules,git-ancestry,audit-log-parser,catalog-status}.ts` | **verbatim** (leaf helpers; depend only on already-present `typeguards`). |

## US1 — Per-codebase clone detection

| Component | Disposition |
|---|---|
| `clone-detector.ts` | **generalized + split** — `detectCodebaseClones()` is the boundary-scoped pure core (replaces dw-lifecycle's `const REPO_ROOT = process.cwd()` defect); `checkClones()` is the CLI wrapper. Batch-dispose hint → `stackctl`. |
| `check-clones` subcommand + skill | **new** (thin adapter). |

## US2 — Disposition lifecycle

| Component | Disposition |
|---|---|
| `dispose-clone.ts`, `check-refactor-preconditions.ts` (+ `.runtime.ts`), `refactor-preconditions-prompt.ts`, `check-disposition-survivor.ts` | **generalized** — default baseline resolves per-codebase via `baseline-path.ts` (no `.dw-lifecycle`/cwd default); `--baseline` override wins. |
| `refresh-clones-baseline.ts` | **verbatim** (forwards `--refresh-baseline` to the ported `checkClones`). |
| `batch-dispose.ts` | **split** 522 → `batch-dispose.ts` (298) + `batch-dispose-apply.ts` (272). |
| 5 subcommands + 5 skills | **new**. |

## US3 — Discovery + widening + synthesis

| Component | Disposition |
|---|---|
| `synthesis.ts` | **severed + generalized** — removed the out-of-scope `mediation` LLM path; `discovered_candidates` now folds the in-scope `pattern-matrix` `clusterUnmatchedShapes` output (`deriveDiscoveredCandidates`). FR-017 preserved deterministically. |
| `scope-inventory.ts` | **severed + generalized** — removed all `llm/inventory-integration` audit-loop calls; runs the deterministic agent fan-out + synthesis + manifest write with no audit loop; `--no-audit-*` flags retained-but-no-op; `PHASE4_GATE_FILES` → `.stack-control/…`. (468 lines — no split needed after the removal.) |
| `discovery-agents/pattern-handlers/semantic.ts` | **severed** — removed the wired LLM-judge path; kept the synchronous stub handler. |
| `discovery-agents/ui-route-enumerator.ts` | **generalized** — FR-018 seam: strategies overridable (bundled registry = default). |
| `discovery-agents/codebase-state-metrics.ts` | **split** 725 → 446 (+ `-input.ts` 171, `-late.ts` 167). |
| Other `synthesis*.ts`, `scope-widen*.ts`, `scope-inventory-cli.ts`, `discovery-agents/*`, `pattern-handlers/*` | **verbatim**. |
| `scope-inventory` + `scope-widen` subcommands + skills | **new** (scope-inventory skill captures the "inventory ≠ discovery / not-all-clear" FR-017 discipline). |

## US4 — Registry-driven checks

| Component | Disposition |
|---|---|
| `check-scope.ts` | **new** — shared per-codebase registry + scan-root resolver (`resolveCheckScope`). |
| `check-anti-patterns.ts`, `check-adopters.ts`, `check-module-symmetry.ts`, `check-deprecations.ts` | **generalized** — per-codebase scope; absent/empty DEFAULT registry → clean no-op (FR-019/SC-008); explicit `--registry` at a missing path still fails loud. `check-editor-symmetry` deprecation alias retained one cycle. |
| `anti-patterns-*`, `adopter-manifests-*`, `module-symmetry-*`, `deprecation-*` | **verbatim** (pure library/report siblings). |
| 5 subcommands + 4 skills | **new**. |

## US5 — Dispatch wrapper + gutted-stub validator

| Component | Disposition |
|---|---|
| `dispatch-grammar.ts`, `dispatch-wrapper.ts`, `dispatch-wrapper-overrides.ts`, `dispatch-wrapper-cli.ts` | **generalized** — override paths → `.stack-control/…`; command strings → `stackctl`. |
| `validate-scope-discovery.ts` | **generalized** — spawns the LOCAL vitest (walk-up) instead of `npx`/bare. |
| `wrap-prompt`, `validate-return`, `validate-scope-discovery` subcommands + skills | **new** (the dispatch surface is the `wrap-prompt` + `validate-return` verb pair, matching dw-lifecycle's two CLI entry points). |

## US6 — Install / customize / doctor / summary / export

| Component | Disposition |
|---|---|
| `sd-config.ts` | **new** — scope-discovery config loader (own `schemaVersion`, fail-loud/unknown-key, lazy ensure; mirrors the 009 config-loader idiom). |
| `install-scope-discovery.ts` | **generalized** — seeds empty-but-valid registries + schemas + `config.yaml` under `.stack-control/scope-discovery/` (idempotent, non-destructive); no hook machinery (OQ-6 — none existed to drop). |
| `customize.ts` | **new** — override resolver (project `.stack-control/scope-discovery/<name>.ts` > plugin default). |
| `scope-doctor.ts` | **new** — runner over the scope-discovery-relevant doctor-rules subset (9 rules; excluded fix-task-tdd-discipline, tooling-feedback-stale, workplan-archive-ledger-coherence). |
| `scope-export.ts`, `summary.ts` | **generalized** — per-codebase resolution. |
| `doctor-rules/*` (9 + types + subset index) | **verbatim** (scope-discovery-relevant subset). |
| 5 subcommands + 5 skills | **new**. |

## US7 — Governance implement-mode clone step

| Component | Disposition |
|---|---|
| `govern/clone-step.ts` | **new** — runs the per-codebase detector in `govern --mode implement`, surfaces NEW intra-codebase clones (advisory; does not override the gate). Replaced the prior "handled separately / TODO" deferral in `govern.ts` + `protocol.ts`. |

## US8 — Install-drift advisory

| Component | Disposition |
|---|---|
| `install-drift.ts` + subcommand + skill | **new** (R6) — compares local `.specify` extension copies to the plugin source (sha1, file-by-file); warns non-blocking on drift; in-sync is silent. |

## Polish reconciliation notes

**T078 — `design:gap/project-relative-doc-discovery` subsumption (CHK033).** The migration introduced **no second config-resolution model**: `codebase-boundary.ts` and `baseline-path.ts` reuse 009's `config/installation.ts` `resolveInstallation` walk-up + `config/resolve-paths.ts`, and the per-codebase registries/baseline resolve relative to the same resolved installation root. There is therefore **no overlap or duplication** with the project-relative doc-discovery surface to reconcile — the gap is confirmed subsumed by 009's installation resolution. Decision recorded here for `roadmap reconcile`; no further action in this feature.

**T079 — interim `clone-snapshot.sh` stopgap superseded.** While the detector was unmigrated, scope-discovery duplication snapshots came from the interim `.dw-lifecycle/scope-discovery/clone-snapshot.sh` (a `jscpd`-over-one-scope shell stopgap, invoked from the branch-local session-start). With the full per-codebase detector shipped, **stack-control no longer needs that snapshot path** — `stackctl check-clones` provides per-codebase detection with a dispositioned baseline + NEW-gating, which the snapshot lacked. `dw-lifecycle`'s copy of the script is **NOT deleted** (isolation invariant / SC-010); this note records that stack-control's own clone surface is now `check-clones`, not the snapshot.

## Future-expansion tracking (T077)

The spec's "Captured for future expansion" items are promoted to first-class tracked backlog entries (operator-tracking requirement — never left as intended-but-unbuilt spec prose): **TASK-6** (v2 enhancement-class discovery agents), **TASK-7** (cross-language scanner packs), **TASK-8** (studio/control-plane clones surface), **TASK-9** (cross-repo rollup), **TASK-10** (Agent-dispatch auto-wrap intercept).
