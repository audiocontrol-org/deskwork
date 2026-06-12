# Implementation Plan: Audit-Protocol Reliability — Silent-Failure Hardening

**Branch**: `feature/stack-control` (one-long-lived-branch convention) | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-audit-protocol-reliability/spec.md`

## Summary

Eight verified silent-failure defects across the audit/governance protocol, fixed RED-first as eight independently-shippable stories: loud fleet-degradation reporting with a govern-strict floor (US1), legacy-config detection (US2), mechanism-aware finding clustering (US3), single-source-of-truth slush migration (US4), self-reference-free govern payloads (US5), auto-seeded scope-widen state (US6), layout-aware scope-discovery/doctor (US7), and per-file fault isolation in the backlog backend (US8). Every fix is additive on exit-code contracts and follows the no-silent-fallbacks rule: degradation is announced, errors are loud.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node 22, run via tsx — all changes inside `plugins/stack-control/`

**Primary Dependencies**: yaml (parse), node:child_process (git + model CLI spawns), existing in-tree modules (no new dependencies)

**Storage**: file-based — audit-log.md (governed markdown), clones.yaml, BarrageRun JSON run-dirs, backlog task files (backlog.md format)

**Testing**: vitest (`src/__tests__/**/*.test.ts` + `tests/**/*.test.ts` per vitest.config.ts:8); tmp-dir fixtures on real fs, never fs mocks (.claude/rules/testing.md)

**Target Platform**: macOS/Linux dev machines + unattended loops (the unattended case is the point)

**Project Type**: CLI plugin (stackctl verbs) — single project

**Performance Goals**: N/A (correctness/observability feature; no hot paths touched)

**Constraints**: exit-code contracts frozen (additive only — FR-014); no `.husky` enforcement (enforcement-lives-in-skills); files ≤300–500 lines; no `any`/`as`/`@ts-ignore`

**Scale/Scope**: 8 stories, ~10 source files touched, ~8 new test files; suite baseline 173 files / 1150 tests stays green

## Constitution Check

*GATE: evaluated pre-Phase-0 and re-checked post-design — PASS (no violations, no Complexity Tracking entries).*

- **I. Test-First**: every story starts with a RED test reproducing the recorded failure (the originating runs/audit entries give exact reproductions). Enforced in tasks.md shape (013 precedent).
- **II. Integration-First**: no new abstractions; every change lands inside an existing concrete verb. The only new seam (fleet-floor option) is derived from two concrete callers (manual CLI, govern protocol).
- **III. Capability not provider**: model fleet logic keys on emitted-output capability, never vendor identity.
- **IV. Division of labor**: all changes are stack-control substrate/governance; no provider-intent surface touched.
- **V. No fallbacks / fail loud**: the entire feature is an enforcement pass of this principle (FR-013).
- **VI. Strict typing & composition**: new logic is pure functions threaded into existing composition (renderSummaryLine, clusterFindings, assembleImplementPayload); no inheritance, no type bypasses.
- **VII. Commit & push early**: per-story commits, pushed at each task boundary.
- **VIII. Faithful tool adoption**: backlog.md's own format/CLI stays authoritative (US8 isolates faults, does not re-own the format); git remains the diff engine (US5 scopes pathspecs, does not reimplement diffing).
- **IX. Execution-backend pluggability**: untouched.

## Project Structure

### Documentation (this feature)

```text
specs/014-audit-protocol-reliability/
├── spec.md              # clarified spec (3 decisions encoded 2026-06-11)
├── plan.md              # this file
├── research.md          # Phase 0 — per-defect verified ground truth + decisions
├── data-model.md        # Phase 1 — entities/invariants
├── quickstart.md        # Phase 1 — per-story validation runbook
├── contracts/
│   └── cli-contracts.md # Phase 1 — additive CLI/observability contract deltas
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 (/speckit-tasks — not created by plan)
```

### Source Code (repository root)

```text
plugins/stack-control/src/
├── subcommands/
│   ├── audit-barrage.ts            # US1: renderSummaryLine (304–314), deriveBarrageExitCode (284–287)
│   ├── slush-findings.ts           # US4: dry-run ids (156) vs apply re-walk (171–172)
│   ├── backlog.ts                  # US8: error dispatcher (299–309)
│   ├── scope-inventory-cli.ts      # US7: legacy default paths (122, 125)
│   ├── scope-widen-cli.ts          # US7: legacy default paths (118, 123)
│   └── scope-export.ts             # US7: default manifest path (42)
├── scope-discovery/
│   ├── audit-barrage/
│   │   ├── config-loader.ts        # US2: CONFIG_OVERRIDE_PATH (43), load (94–113)
│   │   └── types.ts                # US1: ModelRunResult.timedOut/stdoutBytes (150–159)
│   ├── promote-findings/
│   │   └── extract-barrage-findings.ts  # US3: clusterFindings (205–244), merge key (231)
│   ├── discovery-agents/
│   │   └── clone-detector-reader.ts     # US6: ENOENT hard-fail (139–145)
│   ├── scope-inventory.ts          # US7: run-dir construction (68, 81)
│   ├── scope-widen.ts              # US6 orchestration (182–200) + US7 makeRunDir (78–91)
│   └── util/feature-root.ts        # US7: the layout-aware resolver consumers route through (013)
├── govern/
│   └── payload-implement.ts        # US5: assembleImplementPayload (115–183), untracked fold (131–172)
├── backlog/
│   ├── backend.ts                  # US8: projectTask parseYaml no-guard (121), listItems (155–164)
│   └── slush-migrate.ts            # US4: canonical() (36–39), findFindingsByStatus (79)
└── doctor-rules/
    └── provenance-orphaned-entries.ts   # US7: IN_PROGRESS_BUCKET (79)

# Tests: one new file per story under src/__tests__/ (verb-level) or tests/ (spec-governance surface),
# following the existing split; fixtures via mkdtemp tmp dirs.
```

**Structure Decision**: single project; all changes land in existing files listed above (plus new test files). No new modules except a small shared `legacy-config-detect` helper if US2 lands in both config-loader and doctor (decided in research.md R2 — loader-side only, helper not needed).

## Per-story design (what changes where)

- **US1 (audit-barrage.ts)**: extend `renderSummaryLine`/run reporting to name every configured model with `stdoutBytes === 0` (timeout or otherwise) and append the consequence line when emitting-model count < 2. Add a minimum-emitting-models option to the barrage entry (flag + programmatic option); `deriveBarrageExitCode` gains the floor check. Govern's barrage invocation passes floor=2 by default with a flag override; manual CLI default = no floor. RED fixtures replay the recorded run shape (ModelRunResult with timedOut/0 bytes).
- **US2 (config-loader.ts)**: after resolving the active config, probe `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml`; if present, emit the loud stderr notice naming ignored path, read path, migration step — in all three presence combinations per spec scenario 3. Pure addition; load semantics unchanged.
- **US3 (extract-barrage-findings.ts)**: change the cluster key (line 231) from `headingsAgree() || surfacesAgree()` to mechanism-aware: heading agreement (the mechanism proxy) is required; surface agreement alone no longer unions. Cross-model annotation only on merged clusters. The recorded 5-into-1 collapse becomes the RED fixture; same-root-cause merge keeps a green fixture.
- **US4 (slush-findings.ts + slush-migrate.ts)**: carry the migration set from the dampener decision (`res.flips`) through to the apply write as the single source of truth — the apply path consumes the flips (with their status-line locations) instead of re-deriving via `findFindingsByStatus`. A flip that cannot be located at apply time fails the verb loudly naming the finding (exit ≠ 0).
- **US5 (payload-implement.ts)**: exclude the feature's audit-log + governance bookkeeping from BOTH the committed diff (git pathspec exclusion against the resolved feature root) and the untracked fold (skip-list during the walk); scope the untracked fold to the feature under audit. The threaded `audit_log_excerpt` context block (013/TASK-25) is unaffected.
- **US6 (scope-widen.ts + clone-detector-reader.ts call-site)**: on baseline ENOENT, auto-seed the missing scope-discovery state (announced on stderr) via the existing install-scope-discovery seeding primitives, then proceed; a post-seed genuinely-unsatisfiable clone request still fails loud with remediation.
- **US7 (six consumers)**: replace direct `docs/1.0/001-IN-PROGRESS/<slug>` constructions with `resolveFeatureRoot`-based resolution (manifest/prd defaults in the two CLIs, run-dir/evidence in scope-inventory/scope-widen/makeRunDir, manifest default in scope-export, bucket walk in the provenance doctor rule). Legacy behavior preserved by ported contract tests; evidence lands under the resolved root.
- **US8 (backend.ts + backlog.ts)**: wrap the per-file parse; read paths (list) warn on stderr naming the file and continue; `exists`/import idempotency paths throw `BacklogError` naming the file (existing exit-2 mapping at backlog.ts:304–306 already handles it).

## Complexity Tracking

No constitution violations — table intentionally empty.
