---
description: "Task list for front-door-completeness implementation"
---

# Tasks: Front-Door Completeness

**Input**: Design documents from `specs/028-front-door-completeness/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Test-First is NON-NEGOTIABLE (Constitution Principle I). Every implementation task is immediately preceded by a RED test task that fails first; the implementation task makes it GREEN. Test paths are cited verbatim under `src/__tests__/`.

**Organization**: Grouped by user story (the plan's four workstreams), kept as distinct phases so per-phase governance fires on each boundary. Operator mandate: the WHOLE front door ships — no scope cuts, no phase collapse.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependency)
- **[Story]**: US1 / US2 / US3 / US4 (Setup / Foundational / Polish carry no story label)
- Every task names an exact file path and maps to its FR id(s)

## Path Conventions

Single-project CLI. Source under `plugins/stack-control/src/`; tests under `plugins/stack-control/src/__tests__/`; skills under `plugins/stack-control/skills/`; scripts under `plugins/stack-control/scripts/`. All paths below are relative to `plugins/stack-control/` (the installation root, the working dir for this feature).

## Constraints baked into every task

- TypeScript strict — no `any`, no `as Type`, no `@ts-ignore`. Commander's `any`-typed options stay sealed behind `src/cli-help/command-adapter.ts` (`rawOpts` + scalar readers), the proven 027 pattern.
- `@/`-style intra-plugin imports follow the in-tree relative-ESM convention (`.js` extension on relative imports) the existing `src/` uses.
- Files under 300–500 lines — split a module into multiple tasks if it would exceed the cap. The pre-existing `govern.ts` 958-line debt is **TASK-151 and OUT of scope here**; do not touch it.
- No fallbacks / no mock data outside test code — throw on missing skill/verb/help/marker; `check-front-door` exits non-zero naming the gap.
- Enforcement lives in skill bodies + CLI verbs, **never** a git hook. `check-front-door` gates fire from `session-start` (advisory) + `implement`/`review` (gate) skill bodies; the interceptor is a plugin-shipped `hooks/hooks.json` (travels with the install, permitted per the 026 amendment).
- No test infrastructure in CI — gates are local pre-PR smokes (`scripts/smoke-*.sh`) + skill-body gates.

---

## Phase 1: Setup (Shared Scaffolding)

**Purpose**: Stand up the command-surface descriptor module skeleton and its test harness so Phase 2 generalization has a typed home and a RED target.

- [x] T001 Create the `CommandDescriptor` / `SubActionDescriptor` / `FlagDescriptor` / `MediationClass` type skeleton (types only, no walker yet) in `src/cli-help/command-surface.ts` per data-model §1 (FR-003).
- [x] T002 [P] Create the command-surface test harness skeleton (shared fixtures: the live verb set, a helper that runs `stackctl <verb> [sub] --help` and captures exit + stdout) in `src/__tests__/cli-help/command-surface-harness.ts` (FR-001/002).
- [x] T003 [P] ~~Add a `scripts/smoke-front-door.sh` skeleton~~ — **superseded by T118 per 028 Phase 1 govern (AUDIT-BARRAGE-codex-01).** A skeleton smoke *gate* is inherently misleading: exit 0 is a false green, exit 1 is a false red, and the checks it must invoke (`check-front-door` T107, `smoke-interceptor-loaded.sh` T117) do not exist until US4. The structural fix is to NOT ship a non-functional gate in Setup; `scripts/smoke-front-door.sh` is **created born-wired in T118** (no scope cut — it still ships in US4) (FR-034).

**Checkpoint**: The descriptor types compile; the help-probe harness is importable. (The smoke script is created born-wired in T118, not as a Setup skeleton — see T003 note.)

---

## Phase 2: Foundational (BLOCKING — generalize the command surface)

**Purpose**: Generalize `src/cli-help/command-adapter.ts` + `roadmap-help.ts` into `src/cli-help/command-surface.ts` — the single command-tree descriptor that `--help`, the verb reference, the descriptor artifact, AND the fronted-operations registry all derive from. **US1 and US4 both build on this; no story work begins until it is GREEN.**

**⚠️ CRITICAL**: No user-story phase may begin until Phase 2 is complete.

- [x] T004 RED: assert `buildCommandSurface()` walks the live commander tree and returns one `CommandDescriptor` per registered verb (starting with the already-mounted `roadmap`), with sub-actions/flags/positionals matching `SUBACTION_SPECS` — failing until the walker exists, in `src/__tests__/cli-help/command-surface.test.ts` (FR-003).
- [x] T005 Implement `buildCommandSurface()` (the commander-tree walker) + the `CommandDescriptor` projection in `src/cli-help/command-surface.ts`, generalizing the `roadmap-help.ts` render-from-grammar pattern (derive flags from each `Command`'s options, not a hand-written string) (FR-003) — makes T004 GREEN.
- [x] T006 RED: assert a registered verb/sub-action whose descriptor lacks a `description` fails loud (the `roadmap-help.ts` completeness guard, generalized), in `src/__tests__/cli-help/command-surface.test.ts` (FR-003).
- [x] T007 Implement the completeness guard in `src/cli-help/command-surface.ts` (a registered node with no description/summary throws — non-drift) (FR-003) — makes T006 GREEN.
- [x] T008 RED: assert the descriptor carries a declared `mediationClass` (`'mutating' | 'read-only'`) per node and that an unclassified node fails loud (declared, not inferred from `--apply`), in `src/__tests__/cli-help/command-surface.test.ts` (FR-050; Decision 4).
- [x] T009 Implement the `mediationClass` field + the unclassified-node fail-loud in `src/cli-help/command-surface.ts` (FR-050) — makes T008 GREEN.
- [x] T010 RED: assert a generic `renderVerbHelp(descriptor)` / `renderSubActionHelp(descriptor, sub)` produces a non-empty usage body (description + sub-actions + flags + usage line) for any descriptor, in `src/__tests__/cli-help/command-surface.test.ts` (FR-001/002).
- [x] T011 Extract the generic help renderer from `roadmap-help.ts` into `src/cli-help/command-surface.ts` (or a sibling `src/cli-help/render-help.ts` if the file nears the cap) so any verb renders from its descriptor; keep `roadmap-help.ts` re-exporting the roadmap-specific vocabulary surfacing (FR-001/002/003) — makes T010 GREEN.

**Checkpoint**: A single typed descriptor exists; help renders generically from it; mediation class is declared and guarded. US1/US2/US3/US4 can now build.

---

## Phase 3: User Story 1 — Discover any operation without reading source (Priority: P1) 🎯 spine

**Goal**: All 46 verbs + every sub-action emit `--help` (exit 0 with usage); an auto-generated verb reference + a round-tripped descriptor artifact; SKILL.md accuracy sweep; discovery-output fixes; adopter-doc coverage.

**Independent Test**: Run `--help` against every verb + sub-action; assert exit 0 + non-empty usage. Cross-check each skill's documented verbs against the command tree.

### Migrate the 46 verbs onto the command surface (family-by-family)

Each family below: RED help-probe test first (asserts `<verb> [sub] --help` exit 0 + usage body), then mount the family's verbs onto the descriptor/commander surface so help renders from the descriptor. Families touch distinct files → `[P]` where independent.

- [ ] T012 [US1] RED: help-probe for the **roadmap + govern** family (already self-documenting) — assert exit 0 + usage for `roadmap`, every roadmap sub-action, and `govern`; this is the verify/skip baseline, in `src/__tests__/cli-help/help-roadmap-govern.test.ts` (FR-001/002).
- [ ] T013 [US1] Verify `roadmap` (`src/subcommands/roadmap-command.ts`) + `govern` (`src/subcommands/govern.ts`) already render from the surface; adapt only if T012 surfaces a gap (no behavior change) (FR-001/003) — makes T012 GREEN.
- [x] T014 [P] [US1] RED: help-probe for the **backlog** family (`backlog` + `capture`/`list`/`import-github`/`import-slush`/`promote`) in `src/__tests__/cli-help/help-backlog.test.ts` (FR-001/002).
- [x] T015 [US1] Mount `backlog` (`src/subcommands/backlog.ts`) on the command surface so `backlog --help` + each sub-action `--help` render from the descriptor (exit 0) (FR-001/002/003) — makes T014 GREEN.
- [x] T016 [P] [US1] RED: help-probe for the **inbox** family in `src/__tests__/cli-help/help-inbox.test.ts` (FR-001/002).
- [x] T017 [US1] Mount `inbox` (`src/subcommands/inbox.ts`) sub-actions on the command surface (FR-001/002/003) — makes T016 GREEN.
- [ ] T018 [P] [US1] RED: help-probe for the **workflow** family in `src/__tests__/cli-help/help-workflow.test.ts` (FR-001/002).
- [ ] T019 [US1] Mount `workflow` (`src/subcommands/workflow.ts`) sub-actions on the command surface (FR-001/002/003) — makes T018 GREEN.
- [ ] T020 [P] [US1] RED: help-probe for the **document-primitives** family (`archive`, `unarchive`, `curate`) in `src/__tests__/cli-help/help-document-primitives.test.ts` (FR-001/002).
- [ ] T021 [US1] Mount `archive`/`unarchive`/`curate` (`src/subcommands/{archive,unarchive,curate}.ts`) on the command surface (FR-001/002/003) — makes T020 GREEN.
- [ ] T022 [P] [US1] RED: help-probe for the **capability/front-door/mediation** family (`capability`, `mediate-check`, `front-door`, `intercept`, `speckit-guard`) in `src/__tests__/cli-help/help-capability.test.ts` (FR-001/002).
- [ ] T023 [US1] Mount `capability`/`mediate-check`/`front-door`/`intercept`/`speckit-guard` (`src/subcommands/{capability,mediate-check,front-door,intercept,speckit-guard}.ts`) on the command surface; `speckit-guard` renders its deprecation note (`deprecatedAliasOf`) (FR-001/002/003) — makes T022 GREEN.
- [ ] T024 [P] [US1] RED: help-probe for the **scope-discovery clones** family (`check-clones`, `dispose-clone`, `batch-dispose`, `refresh-clones-baseline`, `check-disposition-survivor`, `check-refactor-preconditions`) in `src/__tests__/cli-help/help-scope-clones.test.ts` (FR-001/002).
- [ ] T025 [US1] Mount the scope-discovery clones family (`src/subcommands/{check-clones,dispose-clone,batch-dispose,refresh-clones-baseline,check-disposition-survivor,check-refactor-preconditions}.ts`) on the command surface (FR-001/002/003) — makes T024 GREEN.
- [ ] T026 [P] [US1] RED: help-probe for the **scope-discovery checks** family (`check-anti-patterns`, `check-adopters`, `check-module-symmetry`, `check-editor-symmetry`, `check-deprecations`) in `src/__tests__/cli-help/help-scope-checks.test.ts` (FR-001/002).
- [ ] T027 [US1] Mount the scope-discovery checks family (`src/subcommands/{check-anti-patterns,check-adopters,check-module-symmetry,check-editor-symmetry,check-deprecations}.ts`) on the command surface; `check-editor-symmetry` renders its `deprecatedAliasOf: check-module-symmetry` note (FR-001/002/003) — makes T026 GREEN.
- [ ] T028 [P] [US1] RED: help-probe for the **scope-discovery surface** family (`install-scope-discovery`, `customize`, `scope-doctor`, `scope-summary`, `scope-export`, `scope-inventory`, `scope-widen`, `validate-scope-discovery`, `install-drift`, `wrap-prompt`, `validate-return`) in `src/__tests__/cli-help/help-scope-surface.test.ts` (FR-001/002).
- [ ] T029 [US1] Mount the scope-discovery surface family (`src/subcommands/{install-scope-discovery,customize,scope-doctor,scope-summary,scope-export,scope-inventory,scope-widen,validate-scope-discovery,install-drift,wrap-prompt,validate-return}.ts`) on the command surface (FR-001/002/003) — makes T028 GREEN.
- [ ] T030 [P] [US1] RED: help-probe for the **audit-barrage** family (`audit-barrage`, `audit-barrage-render`, `audit-barrage-lift`) in `src/__tests__/cli-help/help-audit-barrage.test.ts` (FR-001/002).
- [ ] T031 [US1] Mount the audit-barrage family (`src/subcommands/{audit-barrage,audit-barrage-render,audit-barrage-lift}.ts`) on the command surface (FR-001/002/003) — makes T030 GREEN.
- [ ] T032 [P] [US1] RED: help-probe for the **session + setup + config + release** family (`session-start`, `session-end`, `setup`, `config-domain`, `release-check`, `release-helper`, `version`) in `src/__tests__/cli-help/help-session-setup.test.ts` (FR-001/002).
- [ ] T033 [US1] Mount the session/setup/config/release family (`src/subcommands/{session-start,session-end,setup,config-domain,release-check,release-helper,version}.ts`) on the command surface (FR-001/002/003) — makes T032 GREEN.
- [ ] T034 [P] [US1] RED: help-probe for the **spec/governance + misc** family (`spec-check`, `spec-governance-gate`, `slush-findings`, `execute-check`, `no-shortcuts-audit`) in `src/__tests__/cli-help/help-spec-misc.test.ts` (FR-001/002).
- [ ] T035 [US1] Mount the spec/governance + misc family (`src/subcommands/{spec-check,spec-governance-gate,slush-findings,execute-check,no-shortcuts-audit}.ts`) on the command surface (FR-001/002/003) — makes T034 GREEN.
- [ ] T036 [US1] RED: full-surface help-probe — enumerate the live `SUBCOMMANDS` keys and assert EVERY verb + every sub-action emits `--help` exit 0 with a non-empty usage body (the SC-001 100% bar; today only roadmap/govern pass), in `src/__tests__/cli-help/help-full-surface.test.ts` (FR-001/002/003; SC-001).
- [ ] T037 [US1] Wire `cli.ts` so a `--help`/`-h` token on any verb routes to the descriptor renderer (intercept before dispatch, mirroring `roadmap-command.ts`); close any residual gap T036 reports in `src/cli.ts` + the family modules (FR-001/002/003; SC-001) — makes T036 GREEN.

### Verb reference + descriptor artifact (FR-004/052)

- [ ] T038 [US1] RED: assert an auto-generated verb reference lists all 46 verbs + sub-actions + flags by walking the command tree (no hand-maintained list), in `src/__tests__/cli-help/verb-reference.test.ts` (FR-004).
- [ ] T039 [US1] Implement the verb reference generator in `src/cli-help/verb-reference.ts` (walks `buildCommandSurface()`) and surface it as a reference verb / build emitter (FR-004) — makes T038 GREEN.
- [ ] T040 [US1] RED: round-trip test asserting `emitDescriptorArtifact()` produces an oclif-manifest-style JSON containing EXACTLY the verbs/sub-actions/flags the live tree exposes (no missing, no extra), in `src/__tests__/cli-help/descriptor-artifact-roundtrip.test.ts` (FR-052; contract C5).
- [ ] T041 [US1] Implement `emitDescriptorArtifact()` (oclif-manifest shape per contract C4) in `src/cli-help/verb-reference.ts`, derived from the command tree (never authored, FR-041) (FR-052) — makes T040 GREEN.

### SKILL.md accuracy sweep + discovery-output fixes + adopter docs (FR-005/006/007)

- [ ] T042 [P] [US1] RED: assert `skills/roadmap/SKILL.md` documents the `cluster`/`group` sub-actions (the known lag) and that every verb it names exists in the command tree, in `src/__tests__/cli-help/skill-roadmap-accuracy.test.ts` (FR-005).
- [ ] T043 [US1] Update `skills/roadmap/SKILL.md` to document `cluster`/`group` (FR-005) — makes T042 GREEN.
- [ ] T044 [P] [US1] RED: assert `skills/backlog/SKILL.md` documents the empty-session guard + token handling residue accurately against the command tree, in `src/__tests__/cli-help/skill-backlog-accuracy.test.ts` (FR-005).
- [ ] T045 [US1] Update `skills/backlog/SKILL.md` for the empty-session guard + token handling (FR-005) — makes T044 GREEN.
- [ ] T046 [P] [US1] RED: assert `skills/execute/SKILL.md` and `skills/extend/SKILL.md` carry no stale editing residue and document only verbs/steps the surface exposes, in `src/__tests__/cli-help/skill-execute-extend-accuracy.test.ts` (FR-005).
- [ ] T047 [US1] Update `skills/execute/SKILL.md` + `skills/extend/SKILL.md` to remove the editing residue (FR-005) — makes T046 GREEN.
- [ ] T048 [US1] RED: assert `inferChainPosition` does NOT nominate a fully-implemented spec (tasks present + no remaining `/speckit-*` work) as "active" with a bogus next step, in `src/__tests__/session-active-spec-completeness.test.ts` (FR-006).
- [ ] T049 [US1] Fix the active-spec inference in `src/session/chain-position.ts` so a complete spec is not reported as active-with-next-step (FR-006) — makes T048 GREEN.
- [ ] T050 [US1] RED: assert `session-start` discovery output quotes no source-repo-only path that would 404 in a host install (every quoted path resolves through the resolved installation), in `src/__tests__/session-discovery-path-portability.test.ts` (FR-006).
- [ ] T051 [US1] Fix the discovery path rendering in `src/session/report.ts` (and `src/session/orient.ts` if the path originates there) so quoted paths are installation-resolved, not source-repo-absolute (FR-006) — makes T050 GREEN.
- [ ] T052 [P] [US1] RED: assert every `/stack-control:*` SKILL.md declares a capability id that matches `CAPABILITY_REGISTRY` (a mismatch cannot silently kill skill invocation), in `src/__tests__/capability/skill-capability-id-coverage.test.ts` (FR-007).
- [ ] T053 [US1] Reconcile any SKILL.md capability-id mismatch the T052 test surfaces (edit the offending `skills/<name>/SKILL.md`) (FR-007) — makes T052 GREEN.
- [ ] T054 [P] [US1] Add the Codex install path + route tooling-feedback guidance to GitHub issues (not an invisible local file) in the plugin `README.md` (FR-007).

**Checkpoint**: SC-001 holds — 100% of verbs + sub-actions emit `--help` exit 0; the verb reference + descriptor artifact round-trip; SKILLs accurate; discovery output correct.

---

## Phase 4: User Story 2 — Complete an item's full lifecycle through the front door (Priority: P2)

**Goal**: Backlog `done`/`archive`/`unpromote` + `capture` slug/truncate/dedupe + `close-related` re-point; roadmap `add-edge`/`remove-edge`/`move-edge`/`rename`/`remove-node` + `reconcile --unorphan` + `approve-design` marker writer + edge-aware archival. Each new sub-action is born on the Phase-3 surface (discoverable from creation). RED test before each verb.

**Independent Test**: Drive capture → list → promote → unpromote → done → archive via verbs; reparent a node via `move-edge` and confirm `roadmap order` clean; write a design-approval marker via a verb (no file edit).

### Backlog lifecycle verbs (FR-010/011/012/013/018)

- [ ] T055 [US2] RED: `backlog done <id> --reason <r>` dry-run prints the would-close line and `--apply` routes through `backend.close` setting status `Done`; missing `--reason` → exit 2, unknown id → exit 1, in `src/__tests__/subcommands/backlog-done.test.ts` (FR-010; contract B1).
- [ ] T056 [US2] Implement `backlog done` (register the sub-action on the surface + handler routing to `backend.close`) in `src/subcommands/backlog.ts`, `mediationClass: 'mutating'` (FR-010) — makes T055 GREEN.
- [ ] T057 [US2] RED: `backlog archive <id>` moves a `Done` item out of the live store while keeping it readable (preserve-not-delete); non-terminal archive → exit 2; the archived record is still readable after archive, in `src/__tests__/subcommands/backlog-archive.test.ts` (FR-011; contract B2).
- [ ] T058 [US2] Implement `backlog archive` in `src/subcommands/backlog.ts` + the preserve-not-delete move in `src/backlog/backend.ts` (a new `archive(id)` backend op that relocates, never deletes), `mediationClass: 'mutating'` (FR-011) — makes T057 GREEN.
- [ ] T059 [US2] RED: `backlog unpromote <id>` removes the promotion linkage `promote` recorded; item with no linkage → exit 2; dry-run vs `--apply`, in `src/__tests__/subcommands/backlog-unpromote.test.ts` (FR-012; contract B3).
- [ ] T060 [US2] Implement `backlog unpromote` (the inverse of `promote`) in `src/subcommands/backlog.ts` + `src/backlog/promote.ts` (a `unpromote` that removes the linkage), `mediationClass: 'mutating'` (FR-012) — makes T059 GREEN.
- [ ] T061 [US2] RED: `backlog capture` with a title past the OS filename limit captures cleanly (no `ENAMETOOLONG`) via slugify+truncate, AND a repeat `--ref` dedupes (reports the existing id, no duplicate), in `src/__tests__/subcommands/backlog-capture-hardening.test.ts` (FR-013; contract B4).
- [ ] T062 [US2] Implement capture filename slug+truncate + dedupe-by-`--ref` (`backend.exists(ref)`) in `src/subcommands/backlog.ts` + `src/backlog/backend.ts` (FR-013) — makes T061 GREEN.
- [ ] T063 [US2] RED: `roadmap close-related` routes through the SAME closure path as `backlog done` (one mechanism, not two) — assert both call the shared closure, in `src/__tests__/terminal-closure/close-related-shared-mechanism.test.ts` (FR-018; contract B5).
- [ ] T064 [US2] Re-point `roadmap close-related` (`src/subcommands/roadmap.ts`) to call the shared backlog-closure used by `backlog done` (FR-018) — makes T063 GREEN.

### Roadmap edge-mutation + reconcile + marker verbs (FR-014/015/016/017)

- [ ] T065 [US2] RED: `addEdge` / `removeEdge` mutate the typed edge fields, re-validate the graph (no cycle/dangling/duplicate), and zero-write on violation, in `src/__tests__/roadmap/edge-mutations.test.ts` (FR-014; contract RM1).
- [ ] T066 [US2] Implement `addEdge`/`removeEdge` in `src/roadmap/mutations.ts` (candidate→validate→write; dry-run unless apply) (FR-014) — makes T065 GREEN.
- [ ] T067 [US2] RED: `moveEdge` (reparent) = remove(fromParent)+add(toParent) in one validated move; a `--from` that does not hold the edge → exit 2; `roadmap order` stays clean after, in `src/__tests__/roadmap/move-edge.test.ts` (FR-014; contract RM1 + US2 scenario 3).
- [ ] T068 [US2] Implement `moveEdge` in `src/roadmap/mutations.ts` (FR-014) — makes T067 GREEN.
- [ ] T069 [US2] RED: `renameNode` repoints dependents and re-validates; `removeNode` is edge-aware (a node still targeted by `depends-on`/`part-of` re-points/clears or refuses loud — never dangles), in `src/__tests__/roadmap/rename-remove-node.test.ts` (FR-014/017; contract RM1).
- [ ] T070 [US2] Implement `renameNode` + edge-aware `removeNode` in `src/roadmap/mutations.ts` (FR-014/017) — makes T069 GREEN.
- [ ] T071 [US2] RED: the five edge sub-actions (`add-edge`/`remove-edge`/`move-edge`/`rename`/`remove-node`) dispatch from `roadmap` with `--apply` semantics + descriptor `mediationClass: 'mutating'` + working `--help`, in `src/__tests__/roadmap/edge-subactions-cli.test.ts` (FR-014; contract RM1).
- [ ] T072 [US2] Wire the five edge sub-actions into `src/subcommands/roadmap.ts` + `src/subcommands/roadmap-command.ts` (`SUBACTION_SPECS` grammar + commander mount + summaries in `src/cli-help/roadmap-help.ts`) (FR-014) — makes T071 GREEN.
- [ ] T073 [US2] RED: `roadmap reconcile --unorphan <spec>` resolves a reported orphan into a node + `spec:` edge (no ROADMAP.md hand-edit); a non-orphan `<spec>` → exit 2; bare `reconcile` stays report-only, in `src/__tests__/roadmap/reconcile-unorphan.test.ts` (FR-015; contract RM2).
- [ ] T074 [US2] Implement `reconcile --unorphan` in `src/roadmap/reconcile.ts` (+ the `--unorphan` grammar in `src/subcommands/roadmap.ts`), reusing the node/edge mutations; `--unorphan` is `mutating`, bare `reconcile` is `read-only` (FR-015) — makes T073 GREEN.
- [ ] T075 [US2] RED: `roadmap approve-design <id>` writes the `design-approved` marker (and `--analyze-clean` the symmetric `analyze-clean`; `--clear` negates) so `WorkItem.designApproved`/`analyzeClean` read true; unknown node → exit 2; graph re-validated (zero-write on failure), in `src/__tests__/roadmap/approve-design-marker.test.ts` (FR-016; contract RM3).
- [ ] T076 [US2] Implement `setMarker(docPath, id, marker, value, opts, apply)` in `src/roadmap/mutations.ts` + the `approve-design` sub-action wiring in `src/subcommands/roadmap.ts` / `roadmap-command.ts`, `mediationClass: 'mutating'` (FR-016) — makes T075 GREEN.
- [ ] T077 [US2] RED: edge-aware archival — `curate`/archive refuses (or re-points) a terminal node still a `depends-on`/`part-of` target rather than dangling the edge, in `src/__tests__/roadmap/edge-aware-archival.test.ts` (FR-017; contract RM4).
- [ ] T078 [US2] Implement edge-aware archival in `src/subcommands/curate.ts` (consult `src/roadmap/roadmap-model.ts` typed edges before removing; refuse loud on a dangling target) (FR-017) — makes T077 GREEN.

**Checkpoint**: SC-002/SC-003 hold — the full lifecycle drives capture→…→archive + reparent + reconcile + approve-design through verbs, 0 forbidden hand-edits.

---

## Phase 5: User Story 3 — Never get wedged or wrongly refused by the teeth (Priority: P3)

**Goal**: Installation-scoped short-circuit-to-permit; read-only exemption; `front-door mediate-list`/`mediate-recover`(alias `reset`) backed by `listMarker`/`clearMarker`; session+install-keyed marker binding; `speckit-guard` file-marker reconcile; fail-open-observable + staleness + cold-start; marker-example fix. RED test before each.

**Independent Test**: In a no-installation dir, invoke a backend call → no refusal. Corrupt a marker → a sanctioned verb clears it and unblocks the session.

- [ ] T079 [US3] RED: in a no-installation context (`findInstallation` → null), `mediateCheck` PERMITS (exit 0) an adopter backend identity (short-circuit BEFORE `decideMediation`), in `src/__tests__/subcommands/mediate-check-no-installation-permit.test.ts` (FR-020; contract T1; SC-004).
- [ ] T080 [US3] Implement the no-installation short-circuit-to-permit in `src/subcommands/mediate-check.ts` (a null installation permits before `decideMediation`) + mirror in `src/capability/intercept.ts`'s resolver path (FR-020) — makes T079 GREEN.
- [ ] T081 [US3] RED: a `read-only` fronted op is never refused even inside an installation with no marker (mediation gates only `mutating`), in `src/__tests__/capability/read-only-exemption.test.ts` (FR-050; contract T2).
- [ ] T082 [US3] Implement the read-only exemption in `src/capability/mediate.ts` (consult the descriptor's `mediationClass`; a `read-only` op permits) (FR-050) — makes T081 GREEN.
- [ ] T083 [US3] RED: `listMarker(installRoot, session)` returns each active entry with a `fresh` flag and reports `corrupt: true` (tolerant — does not throw) for an unparseable file; `clearMarker(installRoot, session)` deletes the file by path WITHOUT parsing (recovers a corrupt file), in `src/__tests__/capability/marker-recovery-primitives.test.ts` (FR-021/022/023; data-model §3).
- [ ] T084 [US3] Implement `listMarker` (tolerant read) + `clearMarker` (delete-by-path, no parse) in `src/capability/marker.ts`, both honoring `assertSafeSession` (FR-021/022/023) — makes T083 GREEN.
- [ ] T085 [US3] RED: `front-door mediate-list --session <id>` prints active entries (or `(no marker)`/`corrupt (unparseable)`) read-only exit 0; `front-door mediate-recover --session <id>` (alias `front-door reset`) clears the session marker exit 0; missing/unsafe `--session` → exit 2, in `src/__tests__/subcommands/front-door-recovery.test.ts` (FR-021/022; contract T3; SC-005).
- [ ] T086 [US3] Implement `mediate-list` + `mediate-recover`/`reset` sub-actions in `src/subcommands/front-door.ts` (backed by `listMarker`/`clearMarker`); register them on the command surface (`mediate-list` read-only, `mediate-recover` mutating) (FR-021/022) — makes T085 GREEN.
- [ ] T087 [US3] RED: a sanctioned drive immediately after a successful `enter` is permitted when cwd drifts WITHIN the installation (marker keyed by resolved installation-root + session, not raw cwd); a cwd that left the installation → permit via T1, never silent refuse, in `src/__tests__/capability/cwd-linchpin-reconcile.test.ts` (FR-023; contract T4).
- [ ] T088 [US3] Reconcile the cwd/session linchpin in `src/subcommands/mediate-check.ts` + `src/capability/intercept.ts` so both resolve the marker via `findInstallation(...).root` (FR-023) — makes T087 GREEN.
- [ ] T089 [US3] RED: `speckit-guard` reads the 026 file marker (via `activeCapabilities`), NOT the legacy `STACKCTL_FRONT_DOOR` env var — a context established via `front-door enter` is seen (permit), matching the interceptor; the widened refusal set is asserted/justified, in `src/__tests__/speckit-wrapper/speckit-guard-file-marker.test.ts` (FR-024; contract T5).
- [ ] T090 [US3] Reconcile `src/subcommands/speckit-guard.ts` (+ `src/speckit-wrapper/refusal.ts`) to read the file marker instead of the env var (FR-024) — makes T089 GREEN.
- [ ] T091 [US3] RED: when the interceptor cannot reach `stackctl` (spawn failure), `bin/intercept`/`interceptDecision` permits but emits a VISIBLE skip notice (never a silent permit), in `src/__tests__/capability/intercept-fail-open-signal.test.ts` (FR-025; contract T6).
- [ ] T092 [US3] Implement the observable fail-open in `src/capability/intercept.ts` (a skip-signal on the permit) + `bin/intercept` adapter (FR-025) — makes T091 GREEN.
- [ ] T093 [US3] RED: an `enter`-bracketed drive within `STALE_AGE_MS` is never pruned mid-drive (staleness does not drop an active entry), in `src/__tests__/capability/staleness-active-drive.test.ts` (FR-025; contract T6).
- [ ] T094 [US3] Verify/harden the `isFresh` bound in `src/capability/marker.ts` so an active bracketed drive survives (no mechanism change unless T093 fails) (FR-025) — makes T093 GREEN.
- [ ] T095 [US3] RED: a non-backend call resolves with ZERO marker reads (cold-start pre-filter holds; no per-invocation `stackctl` spawn for the common case), in `src/__tests__/capability/intercept-cold-start-zero-io.test.ts` (FR-025; contract T6).
- [ ] T096 [US3] Verify/harden the identity-first pre-filter in `src/capability/intercept.ts` (a non-backend permits without marker I/O) (FR-025) — makes T095 GREEN.
- [ ] T097 [US3] RED: the marker example in a shipped SKILL.md block actually authorizes the wrapped backend call it illustrates (feed the documented marker to the decision core → permit), in `src/__tests__/capability/skill-marker-example-authorizes.test.ts` (FR-026; contract T6).
- [ ] T098 [US3] Fix the marker example in the offending `skills/<name>/SKILL.md` block so it authorizes the illustrated call (FR-026) — makes T097 GREEN.

**Checkpoint**: SC-004/SC-005 hold — 0 false refusals with no installation; a corrupt marker recovers in one sanctioned verb invocation.

---

## Phase 6: User Story 4 — The front door cannot silently regress (Priority: P4)

**Goal**: The fronted-operations registry derived from the command surface + `CAPABILITY_REGISTRY` (carrying mediation class); the `check-front-door` four-assertion verb + doctor rule + skill; RED tests for the three regression cases; wire into session-start (advisory) + implement/review (gate); interceptor-loaded smoke. Last because it checks the surface the other stories complete.

**Independent Test**: With the surface complete, `check-front-door` exits 0; delete a skill / break a `--help` / add an unfronted verb → exit non-zero naming the gap; the interceptor smoke passes.

- [ ] T099 [US4] RED: `buildFrontedOperationsRegistry()` derives one `command-tree` entry per verb/sub-action (mediation class copied from the descriptor) AND one `skill-declaration` entry per `CAPABILITY_REGISTRY` capability interface (e.g. `spec-definition`, `spec-execution`); mutating the command tree changes the built registry with no manifest edit, in `src/__tests__/capability/fronted-operations-registry.test.ts` (FR-030/051; contract R1/R2).
- [ ] T100 [US4] Implement `src/capability/fronted-operations.ts` (`FrontedOperation` + `buildFrontedOperationsRegistry` composing `command-surface` + `CAPABILITY_REGISTRY`; built never stored) (FR-030/051) — makes T099 GREEN.
- [ ] T101 [US4] RED: each registry entry records its `mediationClass`; a `read-only` entry is conformant without a mediation registration, only `mutating` entries are subject to the registration assertion, in `src/__tests__/capability/fronted-operations-mediation-class.test.ts` (FR-050; contract R3).
- [ ] T102 [US4] Ensure `buildFrontedOperationsRegistry` copies `mediationClass` onto each entry (read-only entries exempt) in `src/capability/fronted-operations.ts` (FR-050) — makes T101 GREEN.
- [ ] T103 [US4] RED: `check-front-door` asserts C2a (skill exists) for every registered op — a deleted `skills/<name>/SKILL.md` a registered op requires → exit non-zero naming the missing skill, in `src/__tests__/subcommands/check-front-door-skill-exists.test.ts` (FR-031; contract C2a; SC-006).
- [ ] T104 [US4] RED: `check-front-door` asserts C2b (working `--help`) — a verb whose `--help` exits non-zero / emits no usage → exit non-zero naming the verb, in `src/__tests__/subcommands/check-front-door-help.test.ts` (FR-031; contract C2b).
- [ ] T105 [US4] RED: `check-front-door` asserts C2c (mutating ops mediation-registered) — a new `mutating` verb with no mediation registration → exit non-zero; a `read-only` verb is conformant without one, in `src/__tests__/subcommands/check-front-door-mediation.test.ts` (FR-031/050; contract C2c).
- [ ] T106 [US4] RED: `check-front-door` asserts C2d (skill↔verb parity both directions) — a skill documenting a verb the tree lacks, OR a verb no skill documents → exit non-zero naming the gap; a deprecated alias is not a gap, in `src/__tests__/subcommands/check-front-door-parity.test.ts` (FR-031; contract C2d).
- [ ] T107 [US4] Implement `stackctl check-front-door [--json]` (the four assertions over the fronted-operations registry; exit non-zero naming each gap; deprecated aliases via `deprecatedAliasOf` not flagged) in `src/subcommands/check-front-door.ts` + register it in `src/cli.ts` `SUBCOMMANDS` and on the command surface (FR-031) — makes T103/T104/T105/T106 GREEN.
- [ ] T108 [US4] RED: the three FR-033 regression cases each go RED through `check-front-door` end-to-end (deleted skill, broken `--help`, unfronted mutating verb) against a fixture surface, in `src/__tests__/subcommands/check-front-door-regression-cases.test.ts` (FR-033; contract C3; SC-006).
- [ ] T109 [US4] Verify the three regression cases fail as specified (fixture injection helpers) in `src/__tests__/subcommands/check-front-door-regression-cases.test.ts`; close any assertion gap in `src/subcommands/check-front-door.ts` (FR-033) — makes T108 GREEN.
- [ ] T110 [US4] RED: a doctor rule wrapping `check-front-door` reports the gaps as findings, in `src/__tests__/scope-discovery/doctor-rules/front-door-completeness.test.ts` (FR-032).
- [ ] T111 [US4] Implement the doctor rule in `src/scope-discovery/doctor-rules/front-door-completeness.ts` + register it in `src/scope-discovery/doctor-rules/index.ts` (FR-032) — makes T110 GREEN.
- [ ] T112 [US4] Create the `/stack-control:check-front-door` skill (frontmatter `name: check-front-door`, wraps the verb) in `skills/check-front-door/SKILL.md` (FR-032).
- [ ] T113 [US4] Wire `check-front-door` as a non-blocking advisory snapshot (gap count, never refuses) into `skills/session-start/SKILL.md` body (FR-034 — skill body, never a git hook).
- [ ] T114 [P] [US4] Wire `check-front-door` as a gate (refuse to proceed when RED) into `skills/execute/SKILL.md` (the implement surface) body (FR-034 — skill body, never a git hook).
- [ ] T115 [P] [US4] Wire `check-front-door` as a gate into the review surface skill body (`skills/define/SKILL.md` review/precondition section, or the dedicated review skill body if present) (FR-034 — skill body, never a git hook).
- [ ] T116 [US4] RED: interceptor-loaded smoke assertions — `hooks/hooks.json` declares the `PreToolUse` `Bash`+`Skill` matchers → `${CLAUDE_PLUGIN_ROOT}/bin/intercept` and is auto-discovered via the plugin manifest; feeding `bin/intercept` a fronted-no-marker payload emits `deny`, a non-backend payload permits, in `src/__tests__/capability/interceptor-loaded.test.ts` (FR-035; contract T7; SC-007).
- [ ] T117 [US4] Implement `scripts/smoke-interceptor-loaded.sh` (registration + firing assertions per contract T7) and confirm `.claude-plugin/plugin.json` auto-discovers `hooks/hooks.json` (FR-035) — makes T116 GREEN.
- [ ] T118 [US4] **Create AND wire** `scripts/smoke-front-door.sh` (creation moved here from T003 per 028 Phase 1 govern AUDIT-BARRAGE-codex-01 — born wired, never a non-functional skeleton) to invoke `stackctl check-front-door` + `scripts/smoke-interceptor-loaded.sh`, non-zero on any gap; documented as local pre-PR, not CI (FR-034/035).

**Checkpoint**: SC-006/SC-007 hold — `check-front-door` exits 0 on the complete surface, RED on each injected gap; the interceptor is provably loaded and firing.

---

## Phase 7: Polish & Cross-Cutting

**Purpose**: Run the quickstart validation scenarios as a local smoke; enforce the file-size cap; full suite green.

- [ ] T119 Run the quickstart SC-001..SC-007 scenarios end-to-end as a local smoke (`specs/028-front-door-completeness/quickstart.md`); record results; capture any gap as a finding (do not paper over) — drive via `scripts/smoke-front-door.sh` + manual lifecycle walk.
- [ ] T120 [P] Verify no new file exceeds the 300–500 line cap (`src/cli-help/command-surface.ts`, `src/cli-help/verb-reference.ts`, `src/capability/fronted-operations.ts`, `src/subcommands/check-front-door.ts`); split any offender into a sibling module + task before commit (govern.ts debt is TASK-151, untouched here).
- [ ] T121 [P] Audit the diff for `any`/`as Type`/`@ts-ignore` and for `for now`/`TODO`/`stub`/`placeholder` residue; remove or file (no IOUs).
- [ ] T122 Full `vitest` suite green (`npm --workspace plugins/stack-control test`); `claude plugin validate plugins/stack-control` passes; the marketplace smoke is unaffected.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories** (US1 + US4 both derive from `command-surface.ts`; US2 sub-actions are born on it; US3's read-only exemption reads its mediation class).
- **US1 (Phase 3)**: the discoverability spine — first after Foundational. US4 derives from the completed surface, so US1's 46-verb migration must precede US4's registry/guard.
- **US2 (Phase 4)**: depends on Foundational; each new sub-action lands on the Phase-3 surface (born discoverable), so US2 follows US1 in practice though its verbs are largely independent of US1's per-family migration.
- **US3 (Phase 5)**: depends on Foundational (reads the descriptor's mediation class); otherwise independent of US1/US2 — can run in parallel with US2 after the spine.
- **US4 (Phase 6)**: **last** — it quantifies over the registry derived from the completed command surface (US1) + the capabilities, and gates the surfaces US2/US3 complete. `check-front-door` can only go fully green once US1–US3 land.
- **Polish (Phase 7)**: depends on all of US1–US4.

### Story Completion Order

1. Setup → 2. Foundational (blocking spine) → 3. **US1** (foundational discoverability spine) → 4. **US2** / 5. **US3** (largely independent after the spine; may interleave) → 6. **US4** (checks the completed surface) → 7. Polish.

### Within Each Story

- The RED test task is written and FAILS before its paired implementation task.
- Roadmap/backlog engine mutations (`src/roadmap/mutations.ts`, `src/backlog/backend.ts`) before their CLI sub-action wiring.
- Registry/marker primitives before the verbs that consume them (`listMarker`/`clearMarker` before `mediate-list`/`mediate-recover`; `fronted-operations.ts` before `check-front-door`).

### Parallel Opportunities

- Setup T002/T003 run in parallel ([P]).
- The US1 family help-probe RED tests (T014/T016/T018/T020/T022/T024/T026/T028/T030/T032/T034) are all `[P]` — distinct test files, no shared incomplete dependency. Each family's mount task follows its own RED test.
- US1 SKILL.md sweeps (T042/T044/T046/T052/T054) are `[P]` — distinct skill files.
- US2 and US3 can be worked in parallel after Phase 2/Phase 3 spine.
- US4 gate-wiring T114/T115 are `[P]` — distinct skill files.
- Polish T120/T121 are `[P]`.

---

## Parallel Example: User Story 1 family migration

```bash
# Launch the family help-probe RED tests together (distinct files):
Task: "RED help-probe backlog in src/__tests__/cli-help/help-backlog.test.ts"
Task: "RED help-probe inbox in src/__tests__/cli-help/help-inbox.test.ts"
Task: "RED help-probe workflow in src/__tests__/cli-help/help-workflow.test.ts"
Task: "RED help-probe scope-checks in src/__tests__/cli-help/help-scope-checks.test.ts"

# Then each family's mount task follows its own RED test (same file → sequential per family).
```

---

## Implementation Strategy

### Foundational spine first (US1 derives the rest)

1. Phase 1 Setup → 2. Phase 2 Foundational (`command-surface.ts` GREEN). The descriptor is the single source: `--help`, the verb reference, the descriptor artifact, the fronted-operations registry, and `check-front-door` all derive from it, so drift is structurally impossible.

### Family-by-family ratchet (the discoverability spine)

Migrate the 46 verbs onto the surface one family at a time, each behind its own RED help-probe. `check-front-door` (US4) goes green **incrementally** as families land — a family not yet migrated is a named gap, not a silent pass. Partial progress cannot regress because the ratchet (`check-front-door`) names every remaining gap. The final state is all 46 verbs + every sub-action emitting `--help` exit 0 (SC-001).

### Operation set + teeth in parallel, guard last

Once the spine is in place, US2 (operation set) and US3 (teeth recovery) proceed largely independently; each new US2 sub-action is born on the surface (discoverable from creation), and US3 reads the descriptor's declared mediation class. US4 lands last: it quantifies over the completed registry and gates the surfaces the other stories completed — `check-front-door` reaches exit-0 only when SC-001..SC-007 all hold.

### Done means SC-001..SC-007 all hold

The feature is not "done" at any single phase checkpoint; it is done when the quickstart scenarios (Phase 7) prove all seven success criteria. Per the issue-closure rule, "fixed" is claimed only after verification in a formally-installed release — not on a green local suite.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- [US#] label maps a task to its user story for traceability; Setup/Foundational/Polish carry no story label.
- Every implementation task is preceded by its RED test (Test-First, NON-NEGOTIABLE).
- Commit + push after each task or logical group (Constitution VII / "push early and often").
- Enforcement is wired into skill bodies + CLI verbs only — never `.husky/` or `.git/hooks/`.
- Gates run as local smokes (`scripts/smoke-*.sh`) + skill-body gates — never a CI job.
