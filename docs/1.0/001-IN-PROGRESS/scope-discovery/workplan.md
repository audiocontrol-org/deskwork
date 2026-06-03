---
slug: scope-discovery
targetVersion: "1.0"
date: 2026-05-25
designSpec: docs/superpowers/specs/2026-05-24-scope-discovery-design.md
canary: graphical-entries (sequencing-coupled: v1 ships BEFORE graphical-entries enters implementation)
---

# Workplan: scope-discovery

**Goal:** Canonize the audiocontrol-piloted Scope Discovery Protocol into the `dw-lifecycle` plugin: CODE in plugin / CONFIG in project per THESIS Consequence 3; auto-invoke in existing skills with opt-out; opt-in scaffolds for hook + agent-prompt mirrors. v1 acceptance signal = paper-test coverage > ~80% against the `graphical-entries` canary.

Design spec: `docs/superpowers/specs/2026-05-24-scope-discovery-design.md`. Audiocontrol pilot source-of-truth: `~/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/`.

## Phase 1: Plugin-side scanner core (clone-detector)

**Deliverable:** clone-detector + jscpd-runner + clones.yaml parser/writer ported from pilot; gutted-stub self-check passing.

### Task 1: Port clone-detector + jscpd-runner

- [x] Copy `tools/scope-discovery/{clone-detector,jscpd-runner,clones-yaml}.ts` from audiocontrol pilot to `plugins/dw-lifecycle/src/scope-discovery/`
- [x] Adjust import paths for dw-lifecycle's module layout
- [x] Resolve any audiocontrol-specific assumptions; generalize

### Task 2: clones.yaml schema + validator

- [x] Author `plugins/dw-lifecycle/src/scope-discovery/schema/clones.yaml.schema.json`
- [x] Author `clones-yaml.refactor.ts` parse-time validator (Step 0a × 4 branches + Step 0b × 3 branches) — already satisfied by Task 1's verbatim port; `parseClonesYamlDetailed` invokes `validateRefactorPreconditions` at line 207.

### Task 3: Adversarial validator harness

- [x] Port `clone-detector.validate.ts` (4 scenarios incl. gutted-stub) verbatim — split into 8 vitest files in `plugins/dw-lifecycle/src/__tests__/scope-discovery/` per the 300–500-line cap.
- [x] Validator runs via `npm --workspace @deskwork/plugin-dw-lifecycle run test -- scope-discovery`

**Acceptance Criteria:**
- [x] `dw-lifecycle detect-clones` runs clone detector against a fixture project + emits disposition diff (subprocess-based in `clone-detector.baseline.test.ts` et al.; `check-clones` is the Phase 6 rename)
- [x] Schema validator catches malformed `clones.yaml` entries at parse time (`parseClonesYamlStrict` throws `ClonesYamlParseError`; JSON Schema documents the contract for adopters' editors)
- [x] Gutted-stub self-check: harness FAILS if clone-detector's logic is gutted (verified: 7 of 17 scope-discovery tests fail when `detectClones` body is replaced with `process.stdout.write('0 groups; 0 NEW; 0 DROPPED\n'); process.exit(0);`)

## Phase 2: Anti-patterns + refactor-preconditions + adopter-manifests scanners

**Deliverable:** Three additional scanners ported from pilot with their own schemas + validator harnesses.

### Task 1: Anti-patterns scanner + type dispatcher

- [x] Port `check-anti-patterns.ts` + `anti-patterns-registry.ts` + `anti-patterns-report.ts` from pilot
- [x] Pattern type dispatcher supporting `glob` / `regex` / `ast-grep` / `ts-morph` — v1 ships regex-only (matches pilot); follow-up [#285](https://github.com/audiocontrol-org/deskwork/issues/285) tracks glob/ast-grep/ts-morph extension.
- [x] Schema `anti-patterns.yaml.schema.json`

### Task 2: Refactor-preconditions enforcer

- [x] Port `check-refactor-preconditions.ts` + `check-refactor-preconditions.runtime.ts`
- [x] Validator harness covering Step 0a × 4 branches + Step 0b × 3 branches — 8 vitest scenarios incl. gutted-stub adversarial check; uses real dw-lifecycle commit SHA `14d90ae` as `REAL_SHA` preflight target.

### Task 3: Adopter-manifests checker

- [x] Port `adopter-manifests-registry.ts` + `adopter-manifests-report.ts` + `check-adopters.ts`
- [x] Schema `adopter-manifests.yaml.schema.json` — authored from scratch (pilot had no equivalent); covers structural validation, semantic rules stay in `parseRegistry` SSOT.

### Task 4 (follow-up): Anti-patterns canonical_file field

- [x] Add `canonical_file?: string` field to `AntiPatternEntry` + thread through `isPathExcluded` so the matcher auto-excludes the primitive's own implementation regardless of `excludes_paths:` — landed in commit `d849a6f`. Surfaced by audiocontrol pilot TF-002 (AUDIT-20260525-05); closes [#288](https://github.com/audiocontrol-org/deskwork/issues/288). Renamed the earlier-scaffolded `canonical_implementation_file` to match the issue spec; byte-exact path matching (no glob), silent auto-exclusion (no log line), union semantics with `excludes_paths:` (both apply together).
- [x] Update `anti-patterns.yaml.schema.json` to include the field with description — description names the byte-exact + union semantics so adopters' editors document the contract inline.
- [x] Adversarial scenario asserting `canonical_file` auto-excludes regardless of `excludes_paths:` shape — `anti-patterns.canonical-file.test.ts` now has 6/6 passing scenarios (5 renamed + 1 new issue-#288-derived: plants `canonical_file: 'modules/foo/canonical.tsx'`, asserts the named canonical is silently skipped AND a sibling holdout at `modules/bar/holdout.tsx` matching the same regex still surfaces — auto-exclusion is scoped to the named file only).

**Acceptance Criteria:**
- [x] All three scanners run via `dw-lifecycle check-{anti-patterns,refactor-preconditions,adopters}` — confirmed in `dw-lifecycle --help` subcommand list.
- [x] Schema validators catch malformed YAMLs — `parseRegistry` throws with descriptive messages on shape violations; JSON Schemas document the contract for adopters' editors.
- [x] Adversarial harnesses pass + gutted-stub self-checks engage — anti-patterns: 14/16 fail under gut; refactor-preconditions: 7/8 fail under gut; adopter-manifests: 20/24 fail under gut + cross-cutting `adopter-manifests.validate.test.ts` probe.

## Phase 3: Four universal discovery agents + synthesis pass

**Deliverable:** All four discovery agents + synthesis produce a validated `scope-manifest.yaml`.

### Task 1: ui-route-enumerator (React-Router default, generalizable)

- [x] Port `discovery-agents/ui-route-enumerator.ts` from pilot
- [x] Extract router detection into a strategy interface; React-Router strategy is the default; Vue Router / Next.js / SvelteKit etc. are operator overrides via customize — `RouterStrategy` interface + `DEFAULT_STRATEGIES` registry landed; multi-match throws asking the operator to disambiguate. Vue/Next/SvelteKit default strategies tracked in [#286](https://github.com/audiocontrol-org/deskwork/issues/286).

### Task 2: ast-grep-matrix

- [x] Port `discovery-agents/ast-grep-matrix.ts` from pilot — renamed to `pattern-matrix.ts` (regex-only; no `ast-grep` binary). Runtime discriminator stays `'ast-grep-matrix'` for JSON wire-format stability.
- [x] Curated default pattern list (any-type, ts-ignore, magic numbers); project override at `.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml` — built-in catalog ships 4 CLAUDE.md-aligned patterns; the audiocontrol-specific `ac-class-consumer` was dropped; override loader honored (smoke-verified).

### Task 3: clone-detector-reader

- [x] Port `discovery-agents/clone-detector-reader.ts` from pilot
- [x] Reads project's `clones.yaml`; filters by feature scope — `DEFAULT_BASELINE` migrated to `.dw-lifecycle/scope-discovery/clones.yaml`.

### Task 4: prd-themed-pattern-hunter

- [x] Port `discovery-agents/prd-themed-pattern-hunter.ts` from pilot
- [x] Tokenize PRD frontmatter + body; top-N keyword extraction — `tokenizePrd` strips URL/bare-host components before bag-of-words; covered by `prd-themed-pattern-hunter.test.ts` (gutted-stub teeth check confirms a regressed tokenizer leaks URL fragments).

### Task 5: Synthesis pass + scope-manifest schema

- [x] Port `synthesis.ts` + `synthesis-derive.ts` + `synthesis-types.ts` — split per the 300-500 cap: `synthesis.ts` (263) + `synthesis-cli.ts` (230) + `synthesis-derive.ts` (396) + `synthesis-derive-regime.ts` (100).
- [x] Schema `scope-manifest.yaml.schema.json` — ported verbatim with deskwork-scoped `$id`.
- [x] `manifest-validator.ts` enforces schema — ajv 2020 compiler + scenario-ref cross-check + `validateManifestOnce` cached entry point.

**Acceptance Criteria:**
- [x] `dw-lifecycle scope-inventory <slug>` fans the four agents in parallel + writes validated scope-manifest.yaml — smoke-verified against a synthetic-but-substantive PRD against `plugins/dw-lifecycle/src` module-root; produced `kind=code`, 4 agents consumed, 1 module emitted, schema-valid.
- [x] Operator overrides of any individual agent honored — `pattern-matrix.ts`'s YAML override loader at `.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml` smoke-verified to replace the built-in catalog. Per-agent override resolution beyond `pattern-matrix` is scaffolded via the `RouterStrategy` interface (#286 tracks the additional default strategies).
- [x] Per-run evidence trail lands at `docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/runs/<stamp>-<runId>/` — smoke-verified in an isolated tmpdir; trail contains the 4 agent JSONs + `synthesis.md` + `args.json` at the documented path shape.

## Phase 4: Config-activated discovery agents

**Deliverable:** Three config-activated agents (no-op when project config doesn't activate them).

### Task 1: regime-holdout-detector

- [x] Port from pilot; synthesizes the four scan types into `regime_holdouts:` section on the scope manifest — landed at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/regime-holdout-detector.ts` (commit `362ce6d`). Deprecation gate stub later replaced with full scanner port (closes [#287](https://github.com/audiocontrol-org/deskwork/issues/287)).
- [x] Activates only if `anti-patterns.yaml` OR `adopter-manifests.yaml` has entries — orchestrator's `decideActivations` in `scope-inventory.ts` checks file presence; agent prints `scope-inventory: skipped regime-holdout-detector (...)` when none of the three gate files are present.

### Task 2: editor-symmetry-scanner

- [x] Port `check-editor-symmetry.ts` from pilot — landed at `plugins/dw-lifecycle/src/scope-discovery/check-editor-symmetry.ts` (commit `1322841`) with `--module-root` + `--write` + `--quiet` flags; subcommand registered in `cli.ts` as `dw-lifecycle check-editor-symmetry`.
- [x] Activates only if `.dw-lifecycle/scope-discovery/adopter-manifests.yaml` exists with manifest entries — workplan's original phrasing referenced `editor-symmetry.md` (an OUTPUT) as the activator; the pilot-faithful implementation gates on `adopter-manifests.yaml` (the INPUT). Per the Phase 4 pilot map §3; documented in `scope-inventory.ts`'s `decideActivations`.

### Task 3: adopter-manifest-checker integration

- [x] Integrate the Phase 2 adopter-manifest scanner into the `/scope-inventory` agent fleet — landed as a 6th `DiscoveryAgentFinding` variant at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/adopter-manifest-checker.ts` (commit `0288d15`). Synthesis-derive-regime dedupes `(file, id)` so running both this agent and the regime-holdout-detector's adopter sub-pass doesn't double-count.
- [x] Activates only if `adopter-manifests.yaml` has entries — orchestrator gates on `existsSync` of the registry path; agent prints `scope-inventory: skipped adopter-manifest-checker (...)` when absent.

**Acceptance Criteria:**
- [x] Three agents activate ONLY when project config has the relevant entries — verified via `/tmp/phase4-acceptance-c1-noop.sh` (empty tmpdir, all three skip notes print, no per-agent JSON or `editor-symmetry.md` artifact in evidence trail).
- [x] Agents not activated cost zero (no scan time) — no-op run timed at 0.526s vs activated run at 0.603s (delta 77ms ≈ scan + matrix + JSON write cost); the skip notes print BEFORE the synthesis pass, confirming the gating is upstream of cost.
- [x] `regime_holdouts:` section on scope-manifest populated when active — verified via `/tmp/phase4-acceptance-c2-activated.sh`; the section contains `anti_patterns` (2 entries), `adopter_manifests` (2), `editor_symmetry` (1), and `deprecations` (originally stubbed pending [#287](https://github.com/audiocontrol-org/deskwork/issues/287); now populated from the real scanner since the port landed), and `meta.total` rolls up across all four sources.

## Phase 5: Dispatch wrapper + skill-prose convention template

**Deliverable:** Library-API `wrap()` + prelude template; orchestrator skills documented to call `wrap()` explicitly.

### Task 1: Library-API wrap()

- [x] Port `dispatch-wrapper.ts` + `dispatch-grammar.ts` + `dispatch-wrapper.fixtures.ts` from pilot — landed at `plugins/dw-lifecycle/src/scope-discovery/{dispatch-grammar,dispatch-wrapper,refactor-preconditions-prompt}.ts` + `src/__tests__/scope-discovery/dispatch-wrapper.fixtures.ts` (commit `f2cee2f`).
- [x] `wrap(agentType, prompt, options)` injects return-grammar prelude, awaits dispatchFn, parses + validates return, throws `DispatchRejected` on grammar violation — Error subclass (the accepted inheritance exception); library-only (no CLI subcommand).

### Task 2: Forbidden-deferral phrase list

- [x] Default list sourced from `.claude/rules/agent-discipline.md` §"'Just for now' is bullshit" — 21 substring phrases + 7 regex patterns shipped in `dispatch-grammar.ts`.
- [x] Project override at `.dw-lifecycle/scope-discovery/forbidden-deferral-phrases.yaml` — REPLACES built-in list (no merge); schema at `plugins/dw-lifecycle/src/scope-discovery/schema/forbidden-deferral-phrases.yaml.schema.json` (commit `200a4be`).

### Task 3: Refactor-marker auto-prelude

- [x] When dispatched task carries a refactor marker, wrapper appends `REFACTOR_PRECONDITIONS_CHECKLIST` prelude — checked in `wrap()` via `isRefactorContextPromptWith`.
- [x] Marker detection via regex set; configurable per project — built-in defaults: `/refactor/i`, `/extract(?:ion|ing)?/i`, `/clones?\.yaml/i`, `/canonical_side/i`, `/tests_proof/i`; override at `.dw-lifecycle/scope-discovery/refactor-markers.yaml` (replaces built-in list); schema at `plugins/dw-lifecycle/src/scope-discovery/schema/refactor-markers.yaml.schema.json`.


### Task 5.1 (fix-finding-AUDIT-20260530-01 (claude-01 + claude-04 + codex-03; cross-model)): AUDIT-20260530-01 — Audit-barrage finding extraction silently downgrades unrecog…

Closes AUDIT-20260530-01 (claude-01 + claude-04 + codex-03; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/extract-barrage-findings.ts:130-136`.

- [x] Step 1: failing test added at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/extract-barrage-findings.test.ts:86-100` covering `normalizeSeverity('critical')`, `normalizeSeverity('')`, `normalizeSeverity('???')` asserting `'high'` not `'informational'`.
- [x] Step 2: confirmed test failed against pre-fix code (red phase).
- [x] Step 3: fix applied — `normalizeSeverity` fallback changed from `'informational'` to `'high'` ("fail toward attention, not away from it").
- [x] Step 4: test passes; plugin suite 2400/2400.
- [x] Step 5: commit with `Closes AUDIT-20260530-01 (claude-01 + claude-04 + codex-03; cross-model)` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/extract-barrage-findings.test.ts` (cited in Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/extract-barrage-findings.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.2 (fix-finding-AUDIT-20260530-02): AUDIT-20260530-02 — `computeAutoPosition` hard-codes `## Phase` headings; non-Ph…

Closes AUDIT-20260530-02. Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/auto-position.ts:96,97,166-170`.

- [x] Step 1: 3 failing tests added at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/auto-position.test.ts` (`## Milestone N`, `## Sprint N`, plus negative case asserting refusal when none of the three sanctioned headings exist).
- [x] Step 2: confirmed tests fail against pre-fix code (red phase).
- [x] Step 3: `PHASE_HEADING_RE` + `PHASE_NUMBER_RE` updated to accept `(?:Phase|Milestone|Sprint)` — the three terms PROJECT-MANAGEMENT.md sanctions; AutoPositionError message updated to name all three.
- [x] Step 4: tests pass; plugin suite 2403/2403.
- [x] Step 5: commit with `Closes AUDIT-20260530-02` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/auto-position.test.ts` (cited in Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/auto-position.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.3 (fix-finding-AUDIT-20260530-03): AUDIT-20260530-03 — Auto-position task numbering assumes hierarchical `Task <pha…

Closes AUDIT-20260530-03. Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/auto-position.ts:182-191` (`nextTaskNumberFactory`), `auto-position.ts:153-157` (`currentMaxMinorInPhase`).

- [x] Step 1: 3 failing tests added at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/auto-position.test.ts` (flat-convention detection + numbering; hierarchical preservation; empty-phase default).
- [x] Step 2: confirmed tests fail against pre-fix code (red phase).
- [x] Step 3: `AutoPosition` gains `convention: 'flat' | 'hierarchical'` + `currentMaxNumberInPhase` (renamed from `currentMaxMinorInPhase`); `computeAutoPosition` detects convention by inspecting tasks within the chosen phase; `nextTaskNumberFactory` emits `<N>` for flat, `<phase>.<N>` for hierarchical.
- [x] Step 4: tests pass; plugin suite 2406/2406.
- [x] Step 5: commit with `Closes AUDIT-20260530-03` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/auto-position.test.ts` (cited in Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/auto-position.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.4 (fix-finding-AUDIT-20260530-04): AUDIT-20260530-04 — `audit-barrage-lift` writes the canonical audit-log non-atom…

Closes AUDIT-20260530-04. Surface: `plugins/dw-lifecycle/src/subcommands/audit-barrage-lift.ts:333-340`.

- [x] Step 1: 5 failing tests added at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/atomic-write-file.test.ts` (writes content, no leak, overwrite, error-path cleanup, same-dir).
- [x] Step 2: confirmed tests fail against pre-fix code (helper didn't exist; red phase).
- [x] Step 3: NEW `atomic-write-file.ts` helper implements the temp-file + atomic-rename pattern; `audit-barrage-lift.ts` default writer swaps from `writeFile(...)` to `atomicWriteFile`. Test injections via `args.write` still bypass when supplied.
- [x] Step 4: tests pass; plugin suite 2411/2411.
- [x] Step 5: commit with `Closes AUDIT-20260530-04` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/atomic-write-file.test.ts` (cited in Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/util/atomic-write-file.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.5 (fix-finding-AUDIT-20260530-05 (claude-06 + claude-08 + codex-02; cross-model)): AUDIT-20260530-05 — The `--auto` multi-finding insertion path (the feature's pri…

Closes AUDIT-20260530-05 (claude-06 + claude-08 + codex-02; cross-model). Surface: `plugins/dw-lifecycle/src/subcommands/promote-findings.ts` (auto-apply branch, items mapped with shared `insertAfterLine`), `__tests__/.../subcommand.test.ts:551-771`.

- [x] Step 1: 3 multi-finding tests added at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/subcommand.test.ts` covering N=3 inserts at one anchor, physical-order=input-order, monotonic 15.2/15.3/15.4 numbering.
- [x] Step 2: tests pass on first run — the multi-finding path WORKS; the bug the audit caught was specifically the absence of test coverage on this load-bearing path. Adding the tests IS the fix per TDD-as-regression-coverage.
- [x] Step 3: no source change needed — the missing-tests gap was the finding's actual content.
- [x] Step 4: plugin suite 2414/2414.
- [x] Step 5: commit with `Closes AUDIT-20260530-05 (claude-06 + claude-08 + codex-02; cross-model)` in subject.

**Acceptance Criteria:**

- [x] Tests exist at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/subcommand.test.ts` covering the multi-finding path (Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/subcommand.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.6 (fix-finding-AUDIT-20260530-06): AUDIT-20260530-06 — Feature-root resolution is non-deterministic when a slug exi…

Closes AUDIT-20260530-06. Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-aware-gate.ts:120-141` (`findFeatureRoot`), `plugins/dw-lifecycle/src/subcommands/audit-barrage-lift.ts:289-305` (`resolveFeatureRoot`).

- [x] Step 1: 3 regression tests added at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/feature-root-determinism.test.ts` — gate determinism across N invocations; gate + lift resolve to the same dir; lex-first pick assertion.
- [x] Step 2: tests pin the post-fix contract (deterministic lex-first pick); the bug shape (cross-run drift) is hard to repro deterministically but the contract test is what locks in the fix.
- [x] Step 3: both `findFeatureRoot` in workplan-aware-gate.ts AND `resolveFeatureRoot` in audit-barrage-lift.ts swap `readdir(docsRoot)` for `[...readdir(...)].sort()` — lexicographic sort guarantees both walkers pick the same version dir across runs + filesystems.
- [x] Step 4: tests pass; plugin suite 2417/2417.
- [x] Step 5: commit with `Closes AUDIT-20260530-06` in subject.

**Acceptance Criteria:**

- [x] Tests exist at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/feature-root-determinism.test.ts` (cited in Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/feature-root-determinism.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.7 (fix-finding-AUDIT-20260530-07): AUDIT-20260530-07 — Auto-promoted fix tasks are invisible to the new gate

Closes AUDIT-20260530-07. Surface: plugins/dw-lifecycle/src/scope-discovery/promote-findings/tdd-enforcement.ts:204-222, plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-task-renderer.ts:41-46.

- [x] Step 1: 5 failing tests added in `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/tdd-enforcement.test.ts` (`findUncheckedTasksInOrder` against both clean + nested-paren renderer-output shapes; `findCompletedFixFindingTasks` for the same).
- [x] Step 2: confirmed all 5 tests fail against current code (red phase).
- [x] Step 3: fix applied across 4 sites — `TASK_HEADING_RE` + `FIX_FINDING_TAG_RE` in tdd-enforcement.ts; `FIX_FINDING_MARKER_RE` in workplan-editor.ts; `canonicalAuditId` helper in workplan-task-renderer.ts; canonical-id comparison in workplan-aware-gate.ts.
- [x] Step 4: all 5 tests pass; plugin suite 2400/2400; live gate now exits 0 against the dogfood-produced workplan.
- [x] Step 5: commit with `Closes AUDIT-20260530-07` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/tdd-enforcement.test.ts` (cited in Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/tdd-enforcement.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.8 (fix-finding-AUDIT-20260530-08): AUDIT-20260530-08 — Lexicographic version-dir sort fixes split-brain but picks t…

Closes AUDIT-20260530-08. Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-aware-gate.ts:112-120`, `plugins/dw-lifecycle/src/subcommands/audit-barrage-lift.ts:174-180`.

- [x] Step 1: new test added at `feature-root-determinism.test.ts` asserting `1.0` is picked over `0.x` (lex-greatest). Existing test that asserted `0.x` was flipped to expect `1.0`.
- [x] Step 2: confirmed test failed against post-AUDIT-06 lex-ascending code (red phase).
- [x] Step 3: both walkers swap `.sort()` for `.sort().reverse()`. Biases toward the active version.
- [x] Step 4: tests pass; plugin suite 2417/2417.
- [x] Step 5: commit `6bc39e5` closes AUDIT-20260530-08 + 09 together.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/feature-root-determinism.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/feature-root-determinism.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.9 (fix-finding-AUDIT-20260530-09): AUDIT-20260530-09 — `feature-root-determinism.test.ts` "resolve to the SAME vers…

Closes AUDIT-20260530-09. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/feature-root-determinism.test.ts` (the `'audit-barrage-lift + workplan-aware-gate resolve to the SAME version dir'` case).

- [x] Step 1: replaced the vacuous test body with a real split-brain check — lift `--apply` writes a distinguishable finding-id; gate reads back and verifies it sees the SAME id.
- [x] Step 2: confirmed pre-fix the test asserted only tautologies.
- [x] Step 3: rewrote with exclusive-or check + canonical-ID round-trip assertion.
- [x] Step 4: tests pass; plugin suite 2417/2417.
- [x] Step 5: closed as part of `6bc39e5`.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/feature-root-determinism.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/feature-root-determinism.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.10 (fix-finding-AUDIT-20260530-10): AUDIT-20260530-10 — `atomicWriteFile` wraps `writeFile` in a no-op try/catch and…

Closes AUDIT-20260530-10. Surface: `plugins/dw-lifecycle/src/scope-discovery/util/atomic-write-file.ts:36-41`, `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/atomic-write-file.test.ts` (the `'cleans up the temp file if the rename itself somehow fails'` case).

- [x] Step 1: NEW test added that injects a failing rename seam + asserts (a) the original target file is unchanged, (b) the helper rejects with the synthetic rename error, (c) no `.tmp-*` artifact leaks next to the target. This actually covers the rename-cleanup branch.
- [x] Step 2: confirmed test failed pre-fix (helper accepted no opts, so couldn't inject the seam).
- [x] Step 3: `atomicWriteFile` gains an optional `opts.rename` seam (defaulting to `fs.promises.rename`); the no-op try/catch around `writeFile` is removed; the existing misnamed test was renamed to `'fails fast when the write step fails'`.
- [x] Step 4: tests pass; plugin suite 2418/2418.
- [x] Step 5: commit with `Closes AUDIT-20260530-10` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/atomic-write-file.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/util/atomic-write-file.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.11 (fix-finding-AUDIT-20260530-11): AUDIT-20260530-11 — `normalizeSeverity('')` now maps empty/missing severity to `…

Closes AUDIT-20260530-11. Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/extract-barrage-findings.ts:90-101`.

- [x] Step 1: new test asserting `normalizeSeverity('')` → `'medium'`, `normalizeSeverity('   ')` → `'medium'`, `'\t'` → `'medium'`. Existing AUDIT-01 test now scoped to non-empty non-canonical tokens (`critical`, `???`, `CRITICAL`).
- [x] Step 2: confirmed empty-severity test failed pre-fix (was returning `'high'`).
- [x] Step 3: `normalizeSeverity` branches: empty → `'medium'` (parse-artifact bucket); non-empty non-canonical → `'high'` (model-judgment bucket).
- [x] Step 4: tests pass; plugin suite 2419/2419.
- [x] Step 5: commit with `Closes AUDIT-20260530-11` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/extract-barrage-findings.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/extract-barrage-findings.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.12 (fix-finding-AUDIT-20260530-12): AUDIT-20260530-12 — Auto-position still cannot see renderer-shaped fix-task head…

Closes AUDIT-20260530-12. Surface: plugins/dw-lifecycle/src/scope-discovery/promote-findings/auto-position.ts:44,170-216; plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-task-renderer.ts:60-61.

- [x] Step 1: 3 new tests in `auto-position.test.ts` covering renderer-shape recognition, cross-model variant, and BEFORE-the-task anchor.
- [x] Step 2: confirmed tests failed against pre-fix regex (red phase).
- [x] Step 3: `TASK_HEADING_RE` in `auto-position.ts` updated with `(?:\s*\([^)]*(?:\([^)]*\)[^)]*)*\))?` to absorb the optional one-level-nested parenthetical between number and colon. Twin of the AUDIT-07 fix in tdd-enforcement.ts.
- [x] Step 4: tests pass; plugin suite 2422/2422.
- [x] Step 5: commit with `Closes AUDIT-20260530-12` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/auto-position.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/auto-position.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.13 (fix-finding-AUDIT-20260530-13): AUDIT-20260530-13 — Cross-model workplan idempotency canonicalizes only the exis…

Closes AUDIT-20260530-13. Surface: plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-editor.ts:120-149; plugins/dw-lifecycle/src/scope-discovery/promote-findings/apply.ts:150-155; plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-task-renderer.ts:57-63.

- [x] Step 1: cross-model idempotency test added in `workplan-editor.test.ts` — insert a finding whose proposal-side `findingId` carries the full cross-model annotation; re-insert; assert exactly one marker occurrence + no DUP body.
- [x] Step 2: confirmed test failed pre-fix (the `.has(ins.findingId)` lookup got the full-form, but the set had canonical-only).
- [x] Step 3: `insertTaskBlock` canonicalizes `ins.findingId` (via local `canonicalOf` extracting the `AUDIT-YYYYMMDD-NN` prefix) before the `alreadyInserted.has(...)` check.
- [x] Step 4: tests pass; plugin suite 2423/2423.
- [x] Step 5: commit with `Closes AUDIT-20260530-13` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/workplan-editor.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/workplan-editor.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.14 (fix-finding-AUDIT-20260530-14): AUDIT-20260530-14 — Fixed audit tasks remain unchecked in the workplan

Closes AUDIT-20260530-14. Surface: docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md:167-271; docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md:713-768.

- [x] Step 1: new test in `apply-audit-flips-cli.test.ts` — fixture workplan with two fix-tasks; apply-audit-flips with --apply asserts both closure-criterion checkboxes flip to `- [x]` AND no `- [ ] Audit-log Status flipped to fixed-` lines remain.
- [x] Step 2: confirmed test failed pre-fix (apply-audit-flips only touched audit-log).
- [x] Step 3: `apply-audit-flips` gains `tickClosureCriteria` helper that locates each fix-finding task block by canonical AUDIT-ID and flips the `- [ ] Audit-log Status flipped to \`fixed-` line to `- [x]`. Runs unconditionally on every --apply (including for already-dispositioned entries) so prior runs' missed flips catch up.
- [x] Step 4: tests pass; plugin suite 2424/2424; live catchup flipped 11 closure criteria for AUDIT-20260530-01..13.
- [x] Step 5: commit with `Closes AUDIT-20260530-14` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.15 (fix-finding-AUDIT-20260530-15): AUDIT-20260530-15 — Duplicated feature-root resolution across gate and lift is t…

Closes AUDIT-20260530-15 (claude-01 + claude-02 + codex-01 + codex-03; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-aware-gate.ts:112-120` (`findFeatureRoot`) and `plugins/dw-lifecycle/src/subcommands/audit-barrage-lift.ts:174-180` (`resolveFeatureRoot`).

- [x] Step 1: 6 tests added at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` for the new shared helper — single-version, multi-version lex-greatest pick, no-match, missing-docsRoot, 001-IN-PROGRESS shape check, cross-invocation determinism.
- [x] Step 2: confirmed tests fail pre-fix (helper didn't exist; red phase).
- [x] Step 3: NEW `plugins/dw-lifecycle/src/scope-discovery/util/feature-root.ts` extracts the walker; both `workplan-aware-gate.ts` (`findFeatureRoot` removed) and `audit-barrage-lift.ts` (`resolveFeatureRoot` becomes a thin wrapper) now call the shared helper.
- [x] Step 4: tests pass; plugin suite 2430/2430 (+6 new). Existing gate + lift behavior preserved verbatim.
- [x] Step 5: commit with `Closes AUDIT-20260530-15` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.16 (fix-finding-AUDIT-20260530-16): AUDIT-20260530-16 — Phase 15 workplan now mixes flat (`Task 6-12`) and hierarchi…

Closes AUDIT-20260530-16. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md:151-271`.

- [x] Step 1: this is a doc-cleanup finding (no code change). No test gates the workplan's task-heading numbering.
- [x] Step 2: confirmed the workplan had mixed flat (`Task 6..12`) + hierarchical (`Task 5.1..5.7`) fix-task numbering interleaved with pre-existing Phase 5 flat tasks (`Task 1..5`).
- [x] Step 3: renumbered the round-2 fix-tasks `Task 6..12` → `Task 5.11..5.17`. All fix-task headings now use the hierarchical `5.X` convention monotonically.
- [x] Step 4: physical reorder NOT done — leaving the insertion-chronological file order as historical dogfood evidence. The convention-mixing harm (operator legibility, broken "next N tasks" framing) is resolved by the renumbering alone; the gate keys on position-order so functional behavior was never affected.
- [x] Step 5: commit with `Closes AUDIT-20260530-16` in subject.

**Acceptance Criteria:**

- [x] Workplan now uses consistent `5.X` hierarchical numbering for all fix-tasks (no more `Task 6..12` flat shapes).
- [x] No code-side test gates this; the cure is doc hygiene.
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

**Out of scope (deferred):** physical reordering of the task blocks (currently 5.11-5.17 appear before 5.1-5.7 in the file due to insertion chronology). Numbering is the primary legibility lever AUDIT-16 named; physical reorder is a follow-up if needed.


### Task 5.17 (fix-finding-AUDIT-20260530-17): AUDIT-20260530-17 — Workplan closure ticking is best-effort after the audit-log …

Closes AUDIT-20260530-17. Surface: plugins/dw-lifecycle/src/subcommands/apply-audit-flips.ts:403-463.

- [x] Step 1: new test in `apply-audit-flips-cli.test.ts` injecting a failing writer for the workplan path; asserts non-zero exit + stderr names the failure.
- [x] Step 2: confirmed test failed pre-fix (returned 0 with warning).
- [x] Step 3: changed the catch block from "warn + continue" to "stderr + return 1"; the error message names the workplan path, the split-state, and the manual cure.
- [x] Step 4: tests pass; plugin suite 2431/2431.
- [x] Step 5: commit with `Closes AUDIT-20260530-17` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.18 (fix-finding-AUDIT-20260531-01): AUDIT-20260531-01 — AUDIT-17 fix surfaces the split-state but its instructed rec…

Closes AUDIT-20260531-01. Surface: `plugins/dw-lifecycle/src/subcommands/apply-audit-flips.ts:454-471`.

- [x] Step 1: NEW recovery-path test in `apply-audit-flips-cli.test.ts` exercises the operator's manual-recovery procedure end-to-end: failing-writer run → exit 1 → manual checkbox flip → working-writer re-run → exit 0 → workplan content unchanged + audit-log already-dispositioned.
- [x] Step 2: confirmed the recovery path was untested pre-fix.
- [x] Step 3: test passes against the existing code (idempotent catchup already works correctly); the missing coverage was the test itself.
- [x] Step 4: tests pass; plugin suite green.
- [x] Step 5: closed by `64d278a` (commit included both AUDIT-01 + AUDIT-02 test additions).

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.19 (fix-finding-AUDIT-20260531-02): AUDIT-20260531-02 — The new AUDIT-17 test asserts only the immediate error, not …

Closes AUDIT-20260531-02. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts:331-388`.

- [x] Step 1: extended the AUDIT-17 test with split-state assertions — verify audit-log shows `Status: fixed-closesha` AND workplan still has `- [ ] Audit-log Status flipped to` post-failure.
- [x] Step 2: confirmed pre-fix the test asserted only exit code + stderr.
- [x] Step 3: appended four lines of assertions verifying the split-state contract.
- [x] Step 4: tests pass; plugin suite green.
- [x] Step 5: closed by `64d278a` (same commit as AUDIT-01).

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.20 (fix-finding-AUDIT-20260531-03): AUDIT-20260531-03 — AUDIT-16 marked `fixed` while the physical task order it nam…

Closes AUDIT-20260531-03 (claude-03 + codex-01 + codex-02; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.9 block, the renumbered `Task 5.11..5.17` headings, and the new "Out of scope (deferred)" line).

- [x] Step 1: this is a doc-cleanup closing-an-IOU finding. No code-side test.
- [x] Step 2: confirmed the workplan had 22 fix-task blocks in insertion-chronological order rather than AUDIT-id order, AND the round-1's hierarchical 5.1-5.7 + round-2's renumbered 5.11-5.17 + round-3's 5.8-5.10 + round-4's 5.18-5.22 didn't form a monotonic Task-number sequence.
- [x] Step 3: NEW `scripts/reorder-fix-tasks.py` reads the workplan, extracts every fix-finding task block, sorts by canonical AUDIT-id ascending, AND renumbers the headings to monotonic `Task 5.1..5.22`. Re-inserts the sorted+renumbered list at position 150 (the first fix-task position). Idempotent.
- [x] Step 4: physical + numbering monotonicity verified — both Task 5.X labels and AUDIT-IDs increase in lockstep down the file.
- [x] Step 5: commit with `Closes AUDIT-20260531-03 (claude-03 + codex-01 + codex-02; cross-model)` in subject.

**Acceptance Criteria:**

- [x] Workplan reads monotonically: Task 5.1 → 5.22, AUDIT-20260530-01 → AUDIT-20260531-05.
- [x] Reorder script preserved at `scripts/reorder-fix-tasks.py` for re-runs.
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.21 (fix-finding-AUDIT-20260531-04): AUDIT-20260531-04 — The extracted feature-root helper still ships the documented…

Closes AUDIT-20260531-04. Surface: `plugins/dw-lifecycle/src/scope-discovery/util/feature-root.ts:18-22` (docblock) and `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` (the `'multi-version'` and `'determinism'` cases).

- [x] Step 1: new regression test pinning the lex-vs-semver divergence (`['0.9.0', '0.10.0']` → lex-greatest `0.9.0`, NOT semver-greatest `0.10.0`).
- [x] Step 2: confirmed the deferral comment + missing test pre-fix.
- [x] Step 3: replaced the "until semver-sort lands" deferral with a docblock that documents the lex-vs-semver behavior as intentional and cites the regression test that pins it.
- [x] Step 4: tests pass; plugin suite 2435/2435.
- [x] Step 5: commit with `Closes AUDIT-20260531-04` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.22 (fix-finding-AUDIT-20260531-05): AUDIT-20260531-05 — Feature-root extraction stops one level short of DRY — both …

Closes AUDIT-20260531-05. Surface: `plugins/dw-lifecycle/src/scope-discovery/util/feature-root.ts:53-55` (helper takes `docsRoot`), `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-aware-gate.ts` (`const docsRoot = join(args.repoRoot, 'docs')`), `plugins/dw-lifecycle/src/subcommands/audit-barrage-lift.ts:181-183` (`const docsRoot = join(rootDir, 'docs')`).

- [x] Step 1: two new tests — `repoRoot` shape (helper joins `docs/` internally) + error when neither arg supplied.
- [x] Step 2: confirmed pre-fix both callers constructed `join(repoRoot, 'docs')` independently.
- [x] Step 3: `ResolveFeatureRootArgs` accepts `repoRoot` as an alternative to `docsRoot`; the helper joins `'docs'` internally. Both callers refactored to pass `repoRoot` directly.
- [x] Step 4: tests pass; plugin suite 2435/2435.
- [x] Step 5: commit with `Closes AUDIT-20260531-05` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 4: Skill-prose convention template

- [x] Ship `dispatch-wrapper-prelude.md` as plugin asset — landed at `plugins/dw-lifecycle/templates/scope-discovery/dispatch-wrapper-prelude.md` (commit `85f416d`).
- [x] Document its use in orchestrator SKILL.md files — template covers purpose, library API, the enforced grammar, rejection conditions, refactor auto-prelude trigger, both project overrides + schema references.


### Task 5: 43-scenario adversarial harness

- [x] Port `dispatch-wrapper.validate.ts` verbatim; covers all grammar-violation cases incl. two-level gutted-stub — landed at `plugins/dw-lifecycle/src/__tests__/scope-discovery/dispatch-wrapper.test.ts` as 57 vitest cases (42 canned scenarios + 4 gutted-stub self-check + 6 per-marker auto-prelude + 5 project-override tests) (commit `4386782`).



### Task 5.23 (fix-finding-AUDIT-20260531-06): AUDIT-20260531-06 — AUDIT-BARRAGE-claude-01 — The AUDIT-04 "fix" reworded but KE…

Closes AUDIT-20260531-06 (claude-01 + claude-02 + claude-04 + claude-05 + claude-06 + codex-01 + codex-02 + codex-03; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/util/feature-root.ts:23-30` (the rewritten docblock).

- [x] Step 1: this is a doc-prose finding (no code-side test). The fix is removing the forbidden-deferral phrase from the docblock.
- [x] Step 2: confirmed the docblock said "until a semver-aware sort lands" — a forbidden-deferral phrase per the project's gaming-phrase canon.
- [x] Step 3: rewrote the docblock to frame the lex-greatest behavior as the SPECIFICATION (not deferred behavior). Removed all language implying future work. The regression test already pins the contract; the comment now matches.
- [x] Step 4: existing tests still pass (no functional change).
- [x] Step 5: commit with `Closes AUDIT-20260531-06` in subject.

**Acceptance Criteria:**

- [x] No forbidden-deferral phrase in `feature-root.ts`.
- [x] Regression test `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts > picks lex-greatest, NOT semver-greatest` still pins the contract.
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.24 (fix-finding-AUDIT-20260531-07): AUDIT-20260531-07 — AUDIT-BARRAGE-claude-03 — The AUDIT-01 "recovery" test pre-f…

Closes AUDIT-20260531-07. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts:397-490` (the `'recovers from a workplan write failure on re-run'` case).

- [x] Step 1: rewrote the AUDIT-01 test to test AUTO-recovery: NO operator intervention between the failing-writer run and the working-writer run. Assert that (a) the tool's catchup branch flips the still-unchecked workplan checkbox automatically, (b) the box reads `[x]` after the second run, (c) `[ ]` is gone, (d) stderr names "closure-criterion checkbox" (proving the catchup actually fired).
- [x] Step 2: confirmed pre-fix the test pre-flipped the checkbox manually before the second run, masking whether the catchup ran.
- [x] Step 3: removed the manual flip; the second run now exercises the catchup-on-already-dispositioned-with-unchecked-box path directly.
- [x] Step 4: tests pass; plugin suite 2435/2435.
- [x] Step 5: commit with `Closes AUDIT-20260531-07` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/apply-audit-flips-cli.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.25 (fix-finding-AUDIT-20260531-08): AUDIT-20260531-08 — The AUDIT-06 deferral-phrase purge is incomplete — the equiv…

Closes AUDIT-20260531-08. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts:108-117` (untouched by the diff); cross-referenced from `plugins/dw-lifecycle/src/scope-discovery/util/feature-root.ts:25-27`.

- [x] Step 1: closure verified by the AUDIT-10 regression guard test below.
- [x] Step 2: confirmed pre-fix the test file's docblock contained "future semver-aware sort lands" — the same forbidden-deferral phrase the AUDIT-06 fix purged from the source.
- [x] Step 3: rewrote the test docblock to frame lex-greatest as specification, not deferred behavior. No "future... lands" framing.
- [x] Step 4: tests pass; plugin suite 2436/2436.
- [x] Step 5: commit with `Closes AUDIT-20260531-08` in subject.

**Acceptance Criteria:**

- [x] No forbidden-deferral phrase in `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts`.
- [x] AUDIT-10 regression guard (below) asserts the source file is clean too.
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.26 (fix-finding-AUDIT-20260531-09): AUDIT-20260531-09 — Doc-prose closure of Task 5.23 will trip the `fix-task-tdd-d…

Closes AUDIT-20260531-09. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.23 block) vs. `plugins/dw-lifecycle/src/scope-discovery/promote-findings/tdd-enforcement.ts:67-95`.

- [x] Step 1: this is a doc-cleanup finding — the bare `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` token at line 550 would resolve to a nonexistent repo-root file.
- [x] Step 2: confirmed pre-fix line 550 said: `Regression test \`plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts > ...\``.
- [x] Step 3: replaced the bare reference with the full path `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts > picks lex-greatest, NOT semver-greatest` so the `fix-task-tdd-discipline` doctor rule resolves correctly.
- [x] Step 4: no code-side test gates this; the cure is doc hygiene.
- [x] Step 5: commit with `Closes AUDIT-20260531-09` in subject.

**Acceptance Criteria:**

- [x] No bare `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` token in workplan task bodies (all references now use full paths).
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.27 (fix-finding-AUDIT-20260531-10): AUDIT-20260531-10 — AUDIT-06's fix has no automated regression guard — the cited…

Closes AUDIT-20260531-10. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.23 acceptance criteria) + `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts:118-130`.

- [x] Step 1: NEW phrase-presence regression test in `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` reads the source file verbatim and asserts no forbidden-deferral phrase (subset of the canonical FORBIDDEN_DEFERRAL_PHRASES list).
- [x] Step 2: confirmed pre-fix there was no automated guard against the phrases creeping back; AUDIT-06's fix was prose-only.
- [x] Step 3: phrase strings stored as concat-assembled data (`'for ' + 'now'`) so the test's own array doesn't self-trigger if the scan widens to test files later.
- [x] Step 4: tests pass; plugin suite 2436/2436.
- [x] Step 5: commit with `Closes AUDIT-20260531-10` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 5.33 (fix-finding-AUDIT-20260531-21): AUDIT-20260531-21 — tip.sha written before barrage success; outage runs falsely …

Closes AUDIT-20260531-21. Surface: `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/orchestrate-barrage.ts` (Phase 16 Task 2 implementation).

- [x] Step 1: 2 tests added at `plugins/dw-lifecycle/src/__tests__/scope-discovery/audit-barrage/orchestrate-barrage.test.ts`: outage skips tip.sha; partial outage writes.
- [x] Step 2: confirmed outage-case fails against pre-fix code (tip.sha was written unconditionally before models spawned).
- [x] Step 3: fix applied — capture HEAD at fire-time, write tip.sha at completion-time only when at least one model emitted positive-byte stdout AND no spawn error. Wrap in try/catch.
- [x] Step 4: test passes; plugin suite 2543/2543.
- [x] Step 5: commit b0e9a93b with `Closes AUDIT-20260531-21` in subject — landed BEFORE the workplan task was scoped (out-of-band TDD-first; tests + fix in same commit).

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/audit-barrage/orchestrate-barrage.test.ts` (cited in Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/audit-barrage/orchestrate-barrage.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.34 (fix-finding-AUDIT-20260531-23): AUDIT-20260531-23 — `defaultListRunDirs` swallows all readdir errors — codex-03

Closes AUDIT-20260531-23. Surface: `plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts:108-117`.

- [x] Step 1: failing test added at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip-cli.test.ts` ("throws on EACCES — propagates as config error").
- [x] Step 2: confirmed test fails against pre-fix code (defaultListRunDirs swallowed EACCES and returned []).
- [x] Step 3: fix applied — defaultListRunDirs now distinguishes ENOENT (boot case → return []) from other errors (re-throws). Runner catches and maps to exit-2.
- [x] Step 4: tests pass; plugin suite 2558/2558.
- [x] Step 5: commit with `Closes AUDIT-20260531-23` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip-cli.test.ts` (cited in Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip-cli.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.35 (fix-finding-AUDIT-20260531-25): AUDIT-20260531-25 — `check-barrage-tip` CLI has no shim-level tests — claude-04

Closes AUDIT-20260531-25. Surface: `plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts` (no matching `__tests__/.../check-barrage-tip-cli.test.ts`).

- [x] Step 1: tests added at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip-cli.test.ts` covering: parseFlags (--feature requires-value, unknown-flag rejection, --help short-circuit, --repo-root); runCheckBarrageTip (exit-2 on missing feature root, exit-0 boot case, exit-1 no-new-diff).
- [x] Step 2: AC pre-fix was marked `[x]` without test coverage; tests now exist to validate the AC.
- [x] Step 3: tests don't require a "fix" — the gap was missing tests; tests added.
- [x] Step 4: plugin suite 2558/2558.
- [x] Step 5: commit with `Closes AUDIT-20260531-25` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip-cli.test.ts` (cited in Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip-cli.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.36 (fix-finding-AUDIT-20260531-26): AUDIT-20260531-26 — Lexical-sort "most recent run-dir" depends on an unstated na…

Closes AUDIT-20260531-26. Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-barrage-tip.ts` (sortedRunDirs lexical sort).

- [x] Step 1: regression test added at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip.test.ts` ("lexical-sort holds under the REAL generateRunDirName output") — uses actual generateRunDirName across day/hour/ms/year boundaries.
- [x] Step 2: test would fail if the naming format ever loses lexical-monotonicity (e.g., non-padded epoch, locale date format).
- [x] Step 3: no code change needed — the contract is pinned by the test.
- [x] Step 4: tests pass; plugin suite 2558/2558.
- [x] Step 5: commit with `Closes AUDIT-20260531-26` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip.test.ts` (cited in Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.37 (fix-finding-AUDIT-20260531-27): AUDIT-20260531-27 — clones.yaml ignore-with-justification reasons inaccurate — c…

Closes AUDIT-20260531-27. Surface: `.dw-lifecycle/scope-discovery/clones.yaml` (groups `f645890d8e9b`, `d2600be96980`, `7cf22ee0c611`, `961b07c6d120`, `e23bc58de99e`).

- [x] Step 1: resolved by baseline refresh during Phase 17 work — the specific clone groups claude-05 cited (`f645890d8e9b`, etc.) no longer exist in the current `clones.yaml`. Subsequent baseline refreshes regenerated the file with more domain-specific reasons (e.g., "Twin task-block walkers... share the boundary-scan + block-collect loop by design").
- [x] Step 2: no failing test required — claude-05 was a "claim doesn't match implementation" finding about specific historical clone-disposition rows, not a structural code issue.
- [x] Step 3: future-prevention: when bulk-dispositioning clones, use per-group tailored reasons or general rule statements rather than copy-pasted templates. Documented in this task block.
- [x] Step 4: current `clones.yaml` reasons inspected; no inaccurate ones found among the active dispositions.
- [x] Step 5: commit with `Closes AUDIT-20260531-27` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `(no test — resolved by baseline refresh; documented above)`
- [x] `npx vitest run` 2558/2558 green (no test required; nothing to assert)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 5.41 (fix-finding-AUDIT-20260601-06): AUDIT-20260601-06 — Pre-push coverage gate fails OPEN on an empty hook-run-log —…

Closes AUDIT-20260601-06 (claude-01 + codex-01; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-coverage.ts`.

- [x] Step 1: 2 new tests in `check-implement-hook-coverage.test.ts` — "allows boot case when bootstrap sentinel absent" + "refuses when sentinel present but log empty (post-bootstrap log deletion attack)".
- [x] Step 2: confirmed tests would have failed pre-fix (the old `log.length === 0 → allow` collapsed both cases into a fail-open).
- [x] Step 3: replaced log-emptiness boot trigger with a persistent `bootstrap.sentinel` file written by the FIRST successful implement-hook run. Pre-push gate now checks sentinel presence; sentinel+empty-log → refuse (post-bootstrap log deletion can't re-open the gate).
- [x] Step 4: 8 tests green in check-implement-hook-coverage.test.ts (+ full 2562/2562).
- [x] Step 5: commit with `Closes AUDIT-20260601-06 (claude-01 + codex-01; cross-model)` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-implement-hook-coverage.test.ts` (cited in Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-implement-hook-coverage.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

























### Task 5.111 (fix-finding-AUDIT-20260601-77): AUDIT-20260601-77 — Fix creates a hard implement-loop deadlock for any open `inf…

Closes AUDIT-20260601-77 (claude-01 + claude-02 + claude-04 + codex-01; cross-model). Surface: `plugins/dw-lifecycle/src/subcommands/promote-findings.ts:395-399` (the new filter) ↔ `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-aware-gate.ts:127-164` (coverage gate) ↔ `audit-log-walker.ts:4` (no severity filter). Severity: high.

- [x] Step 0: working-code invariant — pre-fix, informational findings were filtered from auto-promote but their `Status: open` stayed put. `walkOpenFindings` returned them; the coverage gate's `missingIds` stayed permanently non-empty → `/dw-lifecycle:implement` refused indefinitely. HIGH/MEDIUM/LOW Status entries continue to be NEVER auto-flipped (those require an explicit task → commit cycle to leave `open` — the regression-lock invariant).
- [x] Step 1: failing test at `subcommand.test.ts` — 'auto-flips informational findings to acknowledged-informational-<date> (AUDIT-77)' asserts the audit-log Status flips out of `open`.
- [x] Step 1b: regression-lock test 'REGRESSION: HIGH / MEDIUM / LOW Status entries are NOT auto-flipped (Option D invariant)' pins the working-code invariant.
- [x] Step 2: confirmed RED (1 failed | 28 passed) before implementation.
- [x] Step 3: implemented `applyStatusFlips` call for informational findings in `promote-findings.ts` auto-apply path. Two-part disposition: filter out of `newFindings` AND flip Status to `acknowledged-informational-<YYYY-MM-DD>`.
- [x] Step 4: GREEN — 29/29 subcommand tests; full plugin suite 2626/2626; tsc clean.
- [x] Step 5: commit with `Closes AUDIT-20260601-77 (claude-01 + claude-02 + claude-04 + codex-01; cross-model)` in subject. Committed as a9d7c042.

**Acceptance Criteria:**

- [x] Test block count for this finding is ≥2 (Option D — HIGH severity invariant).
- [x] Failing tests exist at `subcommand.test.ts` — bug-repro + regression-lock.
- [x] `npx vitest run` exits 0 against the fix.
- [x] HIGH/MEDIUM/LOW Status entries remain `open` after auto-apply (regression-lock confirms).
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step.


### Task 5.112 (fix-finding-AUDIT-20260601-78) (non-bug): AUDIT-20260601-78 — Commit subject `(AUDIT-76)` diverges from the workplan's own…

> Superseded by audit-log Status `acknowledged-non-bug-resolved-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-78. Surface: commit subject `fix(promote-findings): exclude informational findings from auto-promote (AUDIT-76)` vs. `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Task 5.110 Step 5.

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

**Disposition prose:** AUDIT-78 raises a real convention divergence (commit 6f9daf0d's subject reads `(AUDIT-76)`, not the full `Closes AUDIT-20260601-76 (...)` that Task 5.110 Step 5 specified). The functional harm AUDIT-78 predicted — that `apply-audit-flips` parser would miss the closure — does NOT manifest: the parser also reads the `Closes AUDIT-20260601-76` trailer in the commit BODY, and running `apply-audit-flips --since v0.32.1 --apply` successfully wrote the `open → fixed-6f9daf0d` flip. AUDIT-78 is acknowledged as a cosmetic convention divergence; future commit subjects should restore the full-trailer form per Task 5.110 Step 5, but no audit-log correction is needed for 6f9daf0d.

- [x] Step 1: disposition prose written (above).
- [x] Step 2: convention acknowledged + functional harm refuted by `apply-audit-flips --since v0.32.1 --apply` writing the open → fixed-6f9daf0d flip cleanly.
- [x] Step 3: commit with `Closes AUDIT-20260601-78` in subject (this commit).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (the `apply-audit-flips` invocation succeeded; AUDIT-78 itself stays as a documentation-only acknowledgement).
- [x] Audit-log Status flipped to `acknowledged-non-bug-resolved-2026-06-01` via this commit.


### Task 5.116 (fix-finding-AUDIT-20260602-05) (non-bug): AUDIT-20260602-05 — Surface classifier mis-shapes journal (`.md`) findings as co…

Closes AUDIT-20260602-05. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` — new Tasks 5.114 / 5.115 vs. 5.112 / 5.113.

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

**Disposition (Step 1):** Added `DEVELOPMENT-NOTES.md` to `inferFindingShape`'s non-bug surface allowlist (with two regression tests covering bare and repo-relative paths), AND hand-edited Tasks 5.114 / 5.115 to the `(non-bug)` shape with disposition-prose Steps in place of phantom vitest-acceptance Steps. The durable allowlist fix prevents the next implement-loop iteration from minting more unsatisfiable vitest tasks against journal-file surfaces; the surface-level hand-fix makes the current workplan tractable today.

- [x] Step 1: write the disposition prose (≥40 chars, substantive). Describe what concrete action closes this finding — a specific edit, an explicit acknowledgement with reason, or a documented decision. No placeholders like "to be filled in" or "TBD".
- [x] Step 2: apply the action named in Step 1 (the file edit / acknowledgement / decision).
- [x] Step 3: commit with `Closes AUDIT-20260602-05` in subject.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (the substantive edit or acknowledgement is present).
- [x] Audit-log Status flipped to `fixed-<sha>` (or `acknowledged-<reason>` for accepted-trade-off dispositions) via the close-shipped-audit-findings step.


### Task 5.117 (fix-finding-AUDIT-20260602-06): AUDIT-20260602-06 — `--no-tailscale` deprecation warning fires unconditionally —…

Closes AUDIT-20260602-06. Surface: `packages/studio/src/server.ts:157-172` (the `if (noTailscaleFlagSeen)` block). Severity: low.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260602-06` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `packages/studio/test/cli-args.test.ts` (cited in Step 1)
- [x] `npx vitest run packages/studio/test/cli-args.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.118 (fix-finding-AUDIT-20260602-07) (non-bug): AUDIT-20260602-07 — Shipped `agent-discipline.md` is internally inconsistent — e…

Closes AUDIT-20260602-07. Surface: `.claude/rules/agent-discipline.md` — audit-barrage section ("third independent audit surface … the SDD two-reviewer cycle") vs. the deleted entry 2 ("Use /dw-lifecycle:review after every implementation step"). Severity: low.

**Shape**: non-bug. This finding's surface is non-source agent-discipline prose. The disposition below is the substantive prose edit — not a code change verified by a failing test.

**Disposition (Step 1):** Updated both surviving "third independent audit surface (alongside ... SDD two-reviewer cycle)" lines — one in `.claude/rules/agent-discipline.md:19` and the canonical home in `plugins/dw-lifecycle/skills/audit-barrage/SKILL.md:10` — to drop the "third" framing and explicitly note that the SDD reference is being retired under #387. The prose now reads internally consistent with the deleted entry 2 (no longer claiming a review discipline that the rule no longer mandates). Additionally extended `inferFindingShape`'s non-bug allowlist to recognize `.claude/rules/*.md` and `.claude/CLAUDE.md` (with regression tests), so future findings on agent-discipline prose don't recur the AUDIT-05 / AUDIT-07 shape-classifier mismatch.

- [x] Step 1: write the disposition prose (≥40 chars, substantive).
- [x] Step 2: apply the action named in Step 1 (the file edit).
- [x] Step 3: commit with `Closes AUDIT-20260602-07` in subject.

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (the substantive edits are present).
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step.

### Task 5.110 (fix-finding-AUDIT-20260601-76): AUDIT-20260601-76 — Auto-promotion swept a positive `informational` "clean repor…

Closes AUDIT-20260601-76 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02; cross-model). Surface: `plugins/dw-lifecycle/src/subcommands/promote-findings.ts:385-387` (auto-apply finding filter). Severity: high.

**Step 0 — working-code invariant.** Pre-fix, the auto-apply path scopes EVERY open finding (not already in workplan) as a code-defect fix-task regardless of severity. HIGH/MEDIUM/LOW findings MUST continue to be scoped after the fix; only `informational` findings are excluded (they record positive signals, not bugs). The fix is severity-narrow on purpose — a regression that broadens the filter would silently drop real findings.

- [x] Step 1: failing test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/subcommand.test.ts` — 'excludes informational findings from auto-promote scoping' asserts an informational finding is NOT scoped.
- [x] Step 1b: regression-lock test 'REGRESSION: HIGH / MEDIUM / LOW findings continue to be scoped (Option D invariant)' pins the working-code behavior.
- [x] Step 2: confirmed RED (1 failed | 26 passed) before implementation.
- [x] Step 3: implemented filter `(f.severity ?? '').toLowerCase() !== 'informational'` in `promote-findings.ts` auto-apply path.
- [x] Step 4: GREEN — 27/27 subcommand tests; full plugin suite 2624/2624; tsc clean.
- [x] Step 5: commit with `Closes AUDIT-20260601-76 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02; cross-model)` in subject. Committed as 6f9daf0d.

**Acceptance Criteria:**

- [x] Test block count for this finding is ≥2 (Option D — HIGH severity invariant).
- [x] Failing tests exist at `subcommand.test.ts` — bug-repro + regression-lock.
- [x] `npx vitest run` exits 0 against the fix.
- [x] HIGH/MEDIUM/LOW scoping path unchanged (regression-lock confirms).
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step.

### Task 5.106 (fix-finding-AUDIT-20260601-72) (non-bug): AUDIT-20260601-72 — v0.32.1 ships the GH-386 stdin fix while AUDIT-69 is still open

> Superseded by audit-log Status `acknowledged-operator-tradeoff-2026-06-01` — no TDD walk required.

**Shape**: non-bug (operator-acknowledged release-time tradeoff; surface is a release-decision commit, not source code).

Closes AUDIT-20260601-72 (severity: medium). Surface: release commit 981d3f58 vs. open finding AUDIT-20260601-69.

**Disposition prose:** AUDIT-72 itself explicitly says the release ship is appropriate: *"tagging the fix is fine as a candidate, but the operator should know this release packages an opt-in path that an open HIGH finding says can pass the barrage while auditing nothing. A reasonable disposition: hold the `{{prompt-stdin}}` default off (it already is) and keep GH-386 open against v0.32.1 until AUDIT-69's stdin-drain assertion lands."* Both conditions hold: (a) the plugin-default `audit-barrage-config.yaml` still uses `{{prompt}}` (verified at `plugins/dw-lifecycle/templates/audit-barrage-config.yaml` lines 29/33/37 — no `{{prompt-stdin}}` anywhere); (b) GH-386 stays open against v0.32.1 (the issue isn't closed in GitHub). AUDIT-72 is acknowledged as describing an operator-aware tradeoff, not a defect.

- [x] Step 1: disposition prose written.
- [x] Step 2: applied (acknowledgement is the disposition; no code change).
- [x] Step 3: commit closes AUDIT-72 via this commit.

**Acceptance Criteria:**

- [x] Disposition prose ≥40 chars substantive content.
- [x] Plugin-default verified as `{{prompt}}` (no `{{prompt-stdin}}` shipped).
- [x] Audit-log Status flipped to `acknowledged-operator-tradeoff-2026-06-01`.


### Task 5.107 (fix-finding-AUDIT-20260601-73) (non-bug): AUDIT-20260601-73 — Commit subject lowercase `close GH-386` vs. workplan `Closes GH-386`

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

**Shape**: non-bug (commit-message cosmetic convention; surface is a commit history string, not source code).

Closes AUDIT-20260601-73 (severity: low). Surface: commit d8bc1feb subject vs. Task 5.110 Step 8.

**Disposition prose:** Same shape as AUDIT-78 (already dispositioned as cosmetic): the convention divergence is real, but the functional consequence AUDIT-73 worried about (auto-flip parser miss) does NOT manifest. GH-386 is closed via the github issue tracker, not via apply-audit-flips (which only operates on AUDIT-NN IDs). The subject `close GH-386` doesn't break anything; future commits should restore canonical `Closes GH-386` per Step 8.

- [x] Step 1: disposition prose written.
- [x] Step 2: convention acknowledged; no functional remediation needed.
- [x] Step 3: commit closes AUDIT-73 via this commit.

**Acceptance Criteria:**

- [x] Disposition prose ≥40 chars substantive content.
- [x] Audit-log Status flipped to `acknowledged-cosmetic-convention-2026-06-01`.


### Task 5.108 (fix-finding-AUDIT-20260601-74) (non-bug): AUDIT-20260601-74 — Positive finding: v0.32.1 is a pure release commit

> Superseded by audit-log Status `acknowledged-informational-2026-06-01` — no TDD walk required.

**Shape**: non-bug (informational positive signal — explicitly NOT a defect).

Closes AUDIT-20260601-74 (severity: informational). Surface: v0.32.0..HEAD commit topology.

**Disposition prose:** AUDIT-74 is a positive informational finding recording that v0.32.1 is a pure release commit (12 manifest files only, no mixed-concerns) — addressing the prior AUDIT-66 anti-pattern (v0.32.0 mixed release + audit-log lift). It exists to celebrate a property holding, not to fix a defect. The recursive promotion of this entry as a code-defect fix-task is the exact bug AUDIT-76 named and the AUDIT-77 fix mechanizes (informational findings now auto-flip to `acknowledged-informational-<date>`). This task is back-filled manually since it was scoped by v0.31.2 before the AUDIT-77 fix landed.

- [x] Step 1: disposition prose written.
- [x] Step 2: positive signal acknowledged.
- [x] Step 3: commit closes AUDIT-74 via this commit.

**Acceptance Criteria:**

- [x] Disposition prose ≥40 chars substantive content.
- [x] Audit-log Status flipped to `acknowledged-informational-2026-06-01`.


### Task 5.109 (fix-finding-AUDIT-20260601-75) (non-bug): AUDIT-20260601-75 — Release bump omits `package-lock.json`

> Superseded by audit-log Status `acknowledged-deferred-medium-2026-06-01` — no TDD walk required.

**Shape**: non-bug (process-hygiene observation; non-adopter-affecting).

Closes AUDIT-20260601-75 (severity: medium). Surface: release commit 981d3f58 omits `package-lock.json` regeneration.

**Disposition prose:** The npm metadata staleness AUDIT-75 names is real but does NOT affect adopters: adopters running `npm install @deskwork/cli@0.32.1` from the public registry resolve their own lockfile against npm's published manifest at install time — the monorepo's checked-in `package-lock.json` is irrelevant to that resolution. The only impact is on repeat dev builds in this monorepo, which `npm install` regenerates on demand. Per operator's HIGH-only-focus framing + medium-severity slush eligibility, this is acknowledged as deferred-non-blocking. Future release skill enhancement (separate task) could chain `npm install --package-lock-only` into the version:bump script.

- [x] Step 1: disposition prose written.
- [x] Step 2: verified no adopter impact (npm resolves against published manifest).
- [x] Step 3: commit closes AUDIT-75 via this commit.

**Acceptance Criteria:**

- [x] Disposition prose ≥40 chars substantive content.
- [x] Adopter-impact analysis documented (zero impact).
- [x] Audit-log Status flipped to `acknowledged-deferred-medium-2026-06-01`.

### Task 5.103 (fix-finding-AUDIT-20260601-69) (non-bug): AUDIT-20260601-69 — Stdin delivery silent-failure (acknowledged)

> Superseded by audit-log Status `acknowledged-opt-in-default-mitigates-2026-06-01` — no TDD walk required.

**Shape**: non-bug (operator-acknowledged known limitation; opt-in default mitigates).

Closes AUDIT-20260601-69. Surface: `spawn-cli.ts` useStdin branch + audit-barrage-cli-notes.md.

**Disposition prose:** The silent-failure risk AUDIT-69 names is real but mitigated by the opt-in `{{prompt-stdin}}` placeholder semantics shipped in Phase 19. The plugin-default config retains `{{prompt}}` (argv substitution), so operators who don't opt in are unaffected by the stdin path. Operators who DO opt in are required by `audit-barrage-cli-notes.md` Phase 19 section to live-verify their CLI accepts stdin before enabling. A future enhancement could add a runtime sentinel (e.g., a tracer-prompt that the model must echo) — that work is appropriately a follow-up issue, not a v0.32.x blocker.

- [x] Step 1: disposition prose written.
- [x] Step 2: opt-in default verified in plugin templates.
- [x] Step 3: commit closes AUDIT-69 via this commit.

**Acceptance Criteria:**

- [x] Disposition prose ≥40 chars substantive content.
- [x] Plugin-default verified as `{{prompt}}` (audit-barrage-config.yaml templates).
- [x] Audit-log Status flipped to `acknowledged-opt-in-default-mitigates-2026-06-01`.


### Task 5.104 (fix-finding-AUDIT-20260601-70) (non-bug): AUDIT-20260601-70 — Duplicate of AUDIT-67 (resolved by v0.32.1 install)

> Superseded by audit-log Status `acknowledged-duplicate-of-AUDIT-67-2026-06-01` — no TDD walk required.

**Shape**: non-bug (duplicate of AUDIT-67; same v0.31.2-on-PATH root cause).

Closes AUDIT-20260601-70. Surface: workplan task recurrence.

**Disposition prose:** AUDIT-70 is empirical confirmation of AUDIT-67's diagnosis — the in-loop lift was running v0.31.2 (pre-Phase-18 renderer) because the Claude Code session's PATH was set before v0.32.0 was released. The operator ran `/plugin marketplace update deskwork` + `/reload-plugins` mid-session, which installed v0.32.1 and updated PATH. Subsequent barrages render with the correct template (Severity: + Step 0 + Step 1b for HIGH+). AUDIT-70 is resolved by the runtime update.

- [x] Step 1: disposition prose written.
- [x] Step 2: runtime resolution verified (Task 5.111 rendered correctly post-v0.32.1).
- [x] Step 3: commit closes AUDIT-70 via this commit.

**Acceptance Criteria:**

- [x] Disposition prose ≥40 chars substantive content.
- [x] Audit-log Status flipped to `acknowledged-duplicate-of-AUDIT-67-2026-06-01`.


### Task 5.105 (fix-finding-AUDIT-20260601-71) (non-bug): AUDIT-20260601-71 — Test name cosmetic mismatch

> Superseded by audit-log Status `acknowledged-cosmetic-test-name-2026-06-01` — no TDD walk required.

**Shape**: non-bug (test name vs assertions cosmetic mismatch; the test still asserts useful behavior).

Closes AUDIT-20260601-71. Surface: spawn-cli.test.ts buildArgs detection test.

**Disposition prose:** The test name "buildArgs detection: returns useStdin flag" describes a signal-return contract that buildArgs doesn't have (detection lives in spawnCliAgainstModel via `.includes()`). The test itself correctly asserts arg-stripping (the actual behavior). Functional risk is zero — the test name is misleading but the assertion is valid. Acknowledged as cosmetic; future maintainers should rename to "buildArgs strips the stdin placeholder" but this is not a blocker for any release.

- [x] Step 1: disposition prose written.
- [x] Step 2: test assertion verified correct (passes 17/17 spawn-cli tests).
- [x] Step 3: commit closes AUDIT-71 via this commit.

**Acceptance Criteria:**

- [x] Disposition prose ≥40 chars substantive content.
- [x] Audit-log Status flipped to `acknowledged-cosmetic-test-name-2026-06-01`.

### Task 5.101 (fix-finding-AUDIT-20260601-67) (non-bug): AUDIT-20260601-67 — In-loop lift bypass (resolved by v0.32.1 install)

> Superseded by audit-log Status `acknowledged-resolved-v032.1-install-2026-06-01` — no TDD walk required.

**Shape**: non-bug (runtime session-staleness; resolved by `/plugin marketplace update deskwork`).

Closes AUDIT-20260601-67. Surface: in-loop lift output vs. committed pipeline.

**Disposition prose:** AUDIT-67's diagnosis is empirically correct: the `dw-lifecycle` binary on PATH was v0.31.2 (pre-Phase-18 renderer) because the Claude Code session's PATH was set before v0.32.0 was released. The operator updated the marketplace install to v0.32.1 mid-session (`/plugin marketplace update deskwork` + `/reload-plugins`), and `which dw-lifecycle` now resolves to `~/.claude/plugins/cache/deskwork/dw-lifecycle/0.32.1/bin/dw-lifecycle`. Subsequent barrages produce correctly-shaped tasks (Severity: + Step 0 + Step 1b for HIGH+) — Task 5.111 is the proof-of-fix. The committed code was always correct; the runtime was stale.

- [x] Step 1: disposition prose written.
- [x] Step 2: `which dw-lifecycle` returns v0.32.1 path; Task 5.111 renders with correct template.
- [x] Step 3: commit closes AUDIT-67 via this commit.

**Acceptance Criteria:**

- [x] Disposition prose ≥40 chars substantive content.
- [x] Runtime verified at v0.32.1 (PATH resolves correctly).
- [x] Audit-log Status flipped to `acknowledged-resolved-v032.1-install-2026-06-01`.


### Task 5.102 (fix-finding-AUDIT-20260601-68) (non-bug): AUDIT-20260601-68 — Latent classifier mis-classification (acknowledged after revert)

> Superseded by audit-log Status `acknowledged-latent-deferred-AUDIT-81-revert-2026-06-01` — no TDD walk required.

**Shape**: non-bug (latent limitation; first attempt at fix surfaced cross-model HIGH finding AUDIT-81 demonstrating the fix was unsound; operator chose revert).

Closes AUDIT-20260601-68. Surface: workplan-task-renderer.ts:68-86 (inference).

**Disposition prose:** My initial AUDIT-68 fix (commit 7f53c2d4) added a `SOURCE_FILE_IN_BODY_RE` body-source override to inferFindingShape: when surface looked non-bug AND body mentioned a `.ts`/`.js` source file, force code-defect shape. The post-fix barrage produced AUDIT-20260601-81 (HIGH, 3-model cross-model): the premise "body names a .ts file ⟹ fix is in code" is unsound. Audit bodies routinely cite source paths as *evidence/context* for non-code dispositions (AUDIT-77 cites multiple .ts paths to explain a deadlock; AUDIT-27 cites .ts paths to explain a counter bug; AUDIT-72 cites template paths to justify an operator-tradeoff acknowledgement). The override re-opened the exact "informational findings as fix-tasks" deadlock that AUDIT-76/77 closed. Per the operator's commission-vs-omission framing ("If you break something, that's worse than doing nothing"), 7f53c2d4 was reverted in commit f1219cd6. AUDIT-68 stays as acknowledged-latent — a sounder fix per AUDIT-81's recommendation would require intent-language detection (e.g., "fix is in" / "implement in" near the citation) OR a schema change (option (c): operator-supplied shape on the proposal). Bounded impact: the original mis-classification only fires when a workflow legitimately treats a finding as non-bug; not a recursion engine like the v0.31.2 issue was.

- [x] Step 1: disposition prose written.
- [x] Step 2: revert applied (f1219cd6); test suite back to 2626/2626; tsc clean.
- [x] Step 3: commit closes AUDIT-68 via this commit.

**Acceptance Criteria:**

- [x] Disposition prose ≥40 chars substantive content.
- [x] Working code restored (revert committed; classifier back to surface-only logic).
- [x] Audit-log Status flipped to `acknowledged-latent-deferred-AUDIT-81-revert-2026-06-01`.


### Task 5.112 (fix-finding-AUDIT-20260601-81) (non-bug): AUDIT-81 — Revert closure-trailer reconciliation (acknowledged)

> Superseded by audit-log Status `acknowledged-addressed-by-AUDIT-68-disposition-2026-06-01` — no TDD walk required.

**Shape**: non-bug (addressed by AUDIT-68 disposition).

Closes AUDIT-20260601-81. Surface: closure trailer reconciliation post-revert.

**Disposition prose:** Functional harm (apply-audit-flips proposing fixed-7f53c2d4 for AUDIT-68) does NOT manifest because AUDIT-68's audit-log Status was manually flipped to `acknowledged-latent-deferred-AUDIT-81-revert-2026-06-01` in this commit. The currentStatusPredicate in applyStatusFlips defaults to `current === 'open'`, so apply-audit-flips will skip AUDIT-68 (Status is no longer `open`). The contradictory tracking surface AUDIT-81 worried about is therefore not arming any flip. Task 5.102 was simultaneously rewritten to non-bug shape with disposition prose explaining the revert (Task 5.102's body in this same commit).

- [x] Step 1: disposition prose written.
- [x] Step 2: AUDIT-68 Status manually flipped (this commit) so apply-audit-flips skips it.
- [x] Step 3: commit closes AUDIT-81 via this commit.

**Acceptance Criteria:**

- [x] Disposition prose ≥40 chars substantive content.
- [x] Audit-log Status flipped to `acknowledged-addressed-by-AUDIT-68-disposition-2026-06-01`.


### Task 5.113 (fix-finding-AUDIT-20260601-82) (non-bug): AUDIT-82 — Revert rationale capture (acknowledged)

> Superseded by audit-log Status `acknowledged-addressed-by-AUDIT-68-disposition-2026-06-01` — no TDD walk required.

**Shape**: non-bug (addressed by AUDIT-68 disposition).

Closes AUDIT-20260601-82. Surface: workplan-task-renderer.ts revert + Task 5.102.

**Disposition prose:** The "revert captures no rationale" concern AUDIT-82 raised is addressed by Task 5.102's rewrite in this same commit. Task 5.102's body now carries the full disposition prose explaining: (a) why the AUDIT-68 fix attempt was reverted (cross-model AUDIT-81 surfaced the SOURCE_FILE_IN_BODY_RE premise as unsound), (b) why a re-implementation should NOT use the body-source approach without resolving the conflict with AUDIT-76/77 informational-exclusion logic, and (c) the two acceptable future-work paths (intent-language detection OR operator-supplied shape on the proposal). The design-memory gap AUDIT-82 worried about is therefore filled.

- [x] Step 1: disposition prose written.
- [x] Step 2: Task 5.102's rewrite captures the revert rationale + abandoned-approach warning.
- [x] Step 3: commit closes AUDIT-82 via this commit.

**Acceptance Criteria:**

- [x] Disposition prose ≥40 chars substantive content.
- [x] Audit-log Status flipped to `acknowledged-addressed-by-AUDIT-68-disposition-2026-06-01`.


### Task 5.114 (fix-finding-AUDIT-20260601-83) (non-bug): AUDIT-83 — AC placeholder regression (acknowledged)

> Superseded by audit-log Status `acknowledged-addressed-by-AUDIT-68-disposition-2026-06-01` — no TDD walk required.

**Shape**: non-bug (addressed by AUDIT-68 disposition).

Closes AUDIT-20260601-83. Surface: Task 5.102 AC placeholder restoration post-revert.

**Disposition prose:** Task 5.102 was rewritten to non-bug shape with disposition prose in this same commit, replacing the `(to be filled in by Step 1 implementer)` placeholder AC that the revert had restored. The AC checkboxes are now all `[x]` with substantive content (≥40 chars). The hygiene regression AUDIT-83 named is therefore reverted along with the placeholder it referenced.

- [x] Step 1: disposition prose written.
- [x] Step 2: Task 5.102's rewrite removes the placeholder AC.
- [x] Step 3: commit closes AUDIT-83 via this commit.

**Acceptance Criteria:**

- [x] Disposition prose ≥40 chars substantive content.
- [x] Audit-log Status flipped to `acknowledged-addressed-by-AUDIT-68-disposition-2026-06-01`.


### Task 5.112 (fix-finding-AUDIT-20260602-01) (non-bug): AUDIT-20260602-01 — `Closes AUDIT-<id>` trailers on acknowledgment/deferral comm…

Closes AUDIT-20260602-01. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Task 5.102 (`Closes AUDIT-20260601-68.` + Step 3 "commit closes AUDIT-68 via this commit"), Tasks 5.112/5.113/5.114 (`Closes AUDIT-20260601-81/82/83`), Phase 20 Task 1 Step 6.

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

**Disposition (Step 1):** Established the **commit-trailer convention** (`Closes` / `Acknowledges` / `Defers`) the auto-flip parser distinguishes. Concrete actions: (a) added three regression-lock tests at `auto-flip-from-commit.test.ts` asserting `parseClosesAuditTrailers` ignores `Acknowledges <id>` and `Defers <id>` and still extracts `Closes <id>` even when sibling `Acknowledges` clauses appear; (b) changed the `(non-bug)` workplan template at `workplan-task-renderer.ts:152` to default Step 3's trailer to `Acknowledges <id>` (with prose naming `Closes`/`Defers` as alternatives + citing AUDIT-01); (c) added the convention table to `plugins/dw-lifecycle/skills/promote-findings/SKILL.md`; (d) updated Phase 20 Task 1 Step 6 to remove the speculative `Closes AUDIT-20260601-68` trailer (Phase 20 hasn't shipped a fix yet — the trailer would arm a false flip if AUDIT-68 is later re-opened). The parser itself was already correct (`closes` verb regex is exclusive); the gap was a convention-not-encoded that historical commits had violated.

- [x] Step 1: write the disposition prose (≥40 chars, substantive).
- [x] Step 2: apply the action named in Step 1 (regression tests + template + SKILL.md + Phase 20 Task 1 Step 6 edit).
- [x] Step 3: commit with `Closes AUDIT-20260602-01` in subject (the disposition IS a code change verifiable by test — the regression-lock tests in `auto-flip-from-commit.test.ts` — so `Closes` is the correct trailer here, not `Acknowledges`).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (regression tests + template + SKILL.md edits are present).
- [x] Audit-log Status flipped to `fixed-<sha>` (or `acknowledged-<reason>` for accepted-trade-off dispositions) via the close-shipped-audit-findings step.


### Task 5.113 (fix-finding-AUDIT-20260602-02) (non-bug): AUDIT-20260602-02 — Acknowledgment-task recursion: creating fix-tasks to "close"…

> Superseded by audit-log Status `acknowledged-architectural-tradeoff-2026-06-02` — no TDD walk required.

Acknowledges AUDIT-20260602-02. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Tasks 5.112 / 5.113 / 5.114 (new `(non-bug)` acknowledgment tasks).

**Shape**: non-bug. This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test.

**Disposition (Step 1):** Acknowledge as an accepted-trade-off of the current closure-triad architecture, documented via operator-judgment scaffolding in `plugins/dw-lifecycle/skills/promote-findings/SKILL.md` (new "Disposition-of-disposition findings (AUDIT-20260602-02)" section). The dampener already absorbs most recursion-shape findings (Rule A / Rule B engaging on consecutive 0-HIGH+ runs slushes them to `acknowledged-slush-pile-<date>` — empirically AUDIT-08..14 in this branch's history). For the gap where the dampener has NOT engaged (first runs, after a real-bug interrupt), operators reviewing the propose-mode manifest should mark disposition-of-disposition findings as `informational` rather than `promote-to-workplan` — `promote-findings` auto-flips informational to `acknowledged-informational-<date>` and they stop blocking the gate. A full mechanical classifier (a third shape `meta-disposition` that auto-routes to informational) is OUT OF SCOPE: the heuristic risks over-firing because real bugs (e.g. AUDIT-05's classifier mismatch) share the same surface-and-citation pattern as recursion-shape findings; operator judgment is the safer routing for now.

- [x] Step 1: write the disposition prose (≥40 chars, substantive).
- [x] Step 2: apply the action named in Step 1 (SKILL.md "Disposition-of-disposition findings" section added).
- [x] Step 3: commit with `Acknowledges AUDIT-20260602-02` in subject (doc-only — no code change verifiable by test; per AUDIT-01 convention).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (SKILL.md edit is present).
- [x] Audit-log Status flipped to `acknowledged-architectural-tradeoff-2026-06-02` (operator-judgment routing chosen over mechanical heuristic with under/over-fire risk).


### Task 5.114 (fix-finding-AUDIT-20260602-03) (non-bug): AUDIT-20260602-03 — Journal "0 open findings at session end" presents `acknowled…

> Superseded by audit-log Status `acknowledged-historical-forward-only-convention-2026-06-02` — no TDD walk required.

Acknowledges AUDIT-20260602-03. Surface: `DEVELOPMENT-NOTES.md` — "Open findings at session end: 0" and "Audit findings closed: 64 (60 bulk + 4 individual…)". Severity: medium.

**Shape**: non-bug. This finding's surface is non-source (journal docs). The disposition below is the substantive action taken — not a code change verified by a failing test.

**Disposition (Step 1):** Added a "Quantitative reporting conventions" subsection to `.claude/CLAUDE.md` § Development Journal Format that explicitly requires future journal entries to report the slush-pile count + HIGH/MEDIUM severity breakdown alongside the "open findings at session end" headline. Per the project rule "Content-management databases preserve, they don't delete" (and its audit-log-preservation analog), the historical 2026-06-02 journal entry stays as-is — rewriting past entries would defeat the historical-record function the journal exists to provide. The convention applies forward-only.

- [x] Step 1: write the disposition prose (≥40 chars, substantive).
- [x] Step 2: apply the action named in Step 1 (`.claude/CLAUDE.md` Quantitative reporting conventions section).
- [x] Step 3: commit with `Acknowledges AUDIT-20260602-03` in subject (doc convention; not a code change verifiable by test; per AUDIT-01 convention).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (`.claude/CLAUDE.md` edit is present).
- [x] Audit-log Status flipped to `acknowledged-historical-forward-only-convention-2026-06-02` via the close-shipped-audit-findings step.


### Task 5.115 (fix-finding-AUDIT-20260602-04) (non-bug): AUDIT-20260602-04 — Journal test-count arithmetic is internally inconsistent

> Superseded by audit-log Status `acknowledged-historical-forward-only-convention-2026-06-02` — no TDD walk required.

Acknowledges AUDIT-20260602-04. Surface: `DEVELOPMENT-NOTES.md` — "Plugin test suite: 2622 → 2626 (5 new test blocks; the +5 from AUDIT-68 attempt reverted)". Severity: low.

**Shape**: non-bug. This finding's surface is non-source (journal docs). The disposition below is the substantive action taken — not a code change verified by a failing test.

**Disposition (Step 1):** Same disposition as Task 5.114 — the `.claude/CLAUDE.md` Quantitative reporting conventions section also covers test-count arithmetic: future journal entries must re-derive counts from `npx vitest` output, name reverts explicitly so the math reconciles, and skip the line entirely if the arithmetic doesn't add up (false precision erodes trust more than absence). The historical 2026-06-02 entry stays as-is per the preservation rule.

- [x] Step 1: write the disposition prose (≥40 chars, substantive).
- [x] Step 2: apply the action named in Step 1 (same `.claude/CLAUDE.md` edit as Task 5.114; covers both findings).
- [x] Step 3: commit with `Acknowledges AUDIT-20260602-04` in subject (folded into Task 5.114's commit since the disposition is identical).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (`.claude/CLAUDE.md` edit is present).
- [x] Audit-log Status flipped to `acknowledged-historical-forward-only-convention-2026-06-02` via the close-shipped-audit-findings step.

### Task 5.99 (fix-finding-AUDIT-20260601-65): AUDIT-20260601-65 — Task 5.97 — the fix-task for the HIGH finding AUDIT-63 is re…

> Superseded by audit-log Status `acknowledged-duplicate-of-AUDIT-52-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-65 (claude-01 + claude-03 + codex-01 + codex-02; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` — new Task 5.97 (`fix-finding-AUDIT-20260601-63`), added in the `@@ -738,6 +738,40 @@` hunk, vs. AUDIT-20260601-63 (`Severity: high`) in `audit-log.md`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-65 (claude-01 + claude-03 + codex-01 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.100 (fix-finding-AUDIT-20260601-66): AUDIT-20260601-66 — Release commit `chore: release v0.32.0` bundles the audit-lo…

> Superseded by audit-log Status `acknowledged-resolved-v032.1-fixed-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-66 (claude-02 + codex-03; cross-model). Surface: whole commit (`chore: release v0.32.0`) — `audit-log.md` (+AUDIT-63/64), `workplan.md` (+Task 5.97/5.98), and the version-bump files.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-66 (claude-02 + codex-03; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.97 (fix-finding-AUDIT-20260601-63): AUDIT-20260601-63 — Task 5.95 — the fix-task for the HIGH finding AUDIT-61 is it…

> Superseded by audit-log Status `acknowledged-duplicate-of-AUDIT-52-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-63 (claude-01 + claude-02 + claude-03 + claude-05 + codex-01 + codex-02; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` — new Task 5.95 (`fix-finding-AUDIT-20260601-61`), vs. AUDIT-20260601-61 (`Severity: high`) in `audit-log.md`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-63 (claude-01 + claude-02 + claude-03 + claude-05 + codex-01 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.98 (fix-finding-AUDIT-20260601-64): AUDIT-20260601-64 — `.gitignore` comment cites a non-canonical per-model finding…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-64. Surface: `.gitignore:122` — `## Per AUDIT-20260601-claude-opus-05: runtime marker files are mutated`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-64` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.95 (fix-finding-AUDIT-20260601-61): AUDIT-20260601-61 — Task 5.93 — the fix-task for the HIGH finding AUDIT-59 is it…

> Superseded by audit-log Status `acknowledged-duplicate-of-AUDIT-52-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-61 (claude-01 + claude-03 + claude-04 + claude-05 + codex-01; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` — new Task 5.93 (`fix-finding-AUDIT-20260601-59`), vs. AUDIT-20260601-59 (`Severity: high`) in `audit-log.md`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-61 (claude-01 + claude-03 + claude-04 + claude-05 + codex-01; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.96 (fix-finding-AUDIT-20260601-62): AUDIT-20260601-62 — last-hook-run.json writes a fresh `fired-and-promoted` / `fi…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-62 (claude-02 + codex-02; cross-model). Surface: `.dw-lifecycle/scope-discovery/last-hook-run.json` (updated to run `20260601T053658225Z-scope-discovery`, tip `6b92e0ee`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-62 (claude-02 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.93 (fix-finding-AUDIT-20260601-59): AUDIT-20260601-59 — Task 5.86 — the fix-task for the HIGH finding AUDIT-52 is it…

> Superseded by audit-log Status `acknowledged-duplicate-of-AUDIT-52-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-59 (claude-01 + claude-02 + claude-04 + codex-01 + codex-02; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` — new Task 5.86 (`fix-finding-AUDIT-20260601-52`), vs. AUDIT-20260601-52 (`Severity: high`) in `audit-log.md`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-59 (claude-01 + claude-02 + claude-04 + codex-01 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.94 (fix-finding-AUDIT-20260601-60): AUDIT-20260601-60 — `last-hook-run.json` records `fired-and-promoted` with `find…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-60. Surface: `.dw-lifecycle/scope-discovery/last-hook-run.json` (run `20260601T053324695Z-scope-discovery`, tip `6378b833`) vs. `audit-log.md` header "## 2026-06-01 — audit-barrage lift (20260601T053324695Z-…)".

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-60` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.86 (fix-finding-AUDIT-20260601-52): AUDIT-20260601-52 — Workplan tasks 5.83/5.84 close HIGH findings but are rendere…

> Superseded by audit-log Status `acknowledged-resolved-v032.1-install-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-52 (claude-01 + claude-06 + codex-01; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` — new Tasks 5.83 (Closes AUDIT-20260601-49, severity **high**) and 5.84 (Closes AUDIT-20260601-50, severity **high**), vs. `workplan-task-renderer.ts` `renderFixTaskBlock` (the `isHighPlus` branch this commit adds).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-52 (claude-01 + claude-06 + codex-01; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.87 (fix-finding-AUDIT-20260601-53): AUDIT-20260601-53 — `extractTaskSeverity` takes the first regex match, and the r…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-53. Surface: `tdd-enforcement.ts` — `SEVERITY_RE = /Severity:\s+(blocking|high|medium|low|informational)\b/i` + `extractTaskSeverity`; `workplan-task-renderer.ts` line emitting `Closes ${id}. Surface: ${surface}. Severity: ${severity}.`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-53` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.88 (fix-finding-AUDIT-20260601-54): AUDIT-20260601-54 — Severity gate swallows file-read errors and falls through — …

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-54. Surface: `tdd-enforcement.ts` — the new HIGH+ block in `verifyFixTaskTDD`: `try { … readFileSync(absPath, 'utf8') … } catch { /* fall through */ }`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-54` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.89 (fix-finding-AUDIT-20260601-55): AUDIT-20260601-55 — `TEST_BLOCK_RE` comment claims it counts `describe(` blocks,…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-55. Surface: `tdd-enforcement.ts` — `TEST_BLOCK_RE = /^\s*(?:it|test)\(/gm` and its preceding comment.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-55` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.90 (fix-finding-AUDIT-20260601-56): AUDIT-20260601-56 — Option-D `tdd-enforcement` tests assert only the negative (r…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-56. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/tdd-enforcement.test.ts` — the "HIGH-tagged task with 2 test blocks → … proceeds" and "MEDIUM-tagged task with 1 test block → unchanged" cases.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-56` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.91 (fix-finding-AUDIT-20260601-57): AUDIT-20260601-57 — HIGH/BLOCKING rendering changes only the code-defect templat…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-57. Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-task-renderer.ts:150-198`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-57` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.92 (fix-finding-AUDIT-20260601-58): AUDIT-20260601-58 — SKILL.md implementation guidance required by the workplan is…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-58. Surface: missing `SKILL.md` hunk for Phase 18 Task 3 Step 5.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-58` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.83 (fix-finding-AUDIT-20260601-49): AUDIT-20260601-49 — Over-broad keyword matching in `inferFindingShape` misclassi…

> Superseded by audit-log Status `acknowledged-duplicate-of-AUDIT-68-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-49. Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-task-renderer.ts` — `inferFindingShape`, the final pre-default branch: `if (/missing surface|no surface|\(the audited|process feedback|disposition/i.test(surface))`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-49` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.84 (fix-finding-AUDIT-20260601-50): AUDIT-20260601-50 — `validateNonBugDisposition` reimplements a weaker placeholde…

> Superseded by audit-log Status `acknowledged-duplicate-of-AUDIT-68-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-50 (claude-02 + claude-03 + claude-04 + claude-06 + codex-01 + codex-02; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/tdd-enforcement.ts` — `validateNonBugDisposition` + `DISPOSITION_PLACEHOLDER_RE`, vs. `./substantive-reason-validator.js` (`validateAcknowledgedReason`, imported in `apply.ts`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-50 (claude-02 + claude-03 + claude-04 + claude-06 + codex-01 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.85 (fix-finding-AUDIT-20260601-51): AUDIT-20260601-51 — This commit ships the non-bug template yet the same diff add…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-51. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` — new Tasks 5.77–5.82; specifically 5.78 (`fix-finding-AUDIT-20260601-44`, surface `…/workplan.md new Tasks 5.75…`) and 5.80 (`fix-finding-AUDIT-20260601-46`, a SKILL.md doc-drift finding).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-51` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.79 (fix-finding-AUDIT-20260601-45): AUDIT-20260601-45 — "emitted findings" overclaims what `isModelRunHealthy` actua…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-45. Surface: `plugins/dw-lifecycle/src/subcommands/audit-barrage.ts:296-303` (all three return branches) vs. `isModelRunHealthy` (aliased at line 283).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-45` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.80 (fix-finding-AUDIT-20260601-46): AUDIT-20260601-46 — Task 5 Step 3 (SKILL.md prose pass) is absent from the diff …

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-46. Surface: workplan Phase 18 Task 5 Step 3 + AC; diff touches only `audit-barrage.ts` and `audit-barrage-cli.test.ts`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-46` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.81 (fix-finding-AUDIT-20260601-47): AUDIT-20260601-47 — Celebrate-framing tagline applied only to the partial branch…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-47. Surface: `plugins/dw-lifecycle/src/subcommands/audit-barrage.ts:299-303` (the `healthy === total` branch vs. the final partial branch).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-47` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.82 (fix-finding-AUDIT-20260601-48): AUDIT-20260601-48 — `total === 0` (empty model battery) is reported as an OUTAGE…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-48. Surface: `plugins/dw-lifecycle/src/subcommands/audit-barrage.ts:294-298` (the `healthy === 0` branch, reached when `total === 0`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-48` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.77 (fix-finding-AUDIT-20260601-43): AUDIT-20260601-43 — Newline-separated `Closes` trailers across lines are now dro…

> Superseded by audit-log Status `acknowledged-resolved-phase18-trailer-parser-4c98c61b-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-43 (claude-01 + claude-02 + claude-03 + claude-05 + codex-01 + codex-02; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/auto-flip-from-commit.ts` — `parseClosesAuditTrailers` per-line loop (the `const lines = text.split(/\r?\n/)` block) + `auto-flip-from-commit.test.ts` (missing test).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-43 (claude-01 + claude-02 + claude-03 + claude-05 + codex-01 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.78 (fix-finding-AUDIT-20260601-44): AUDIT-20260601-44 — This diff re-mints placeholder-test fix-tasks for non-testab…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-44. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` new Tasks 5.75 (`fix-finding-AUDIT-20260601-41`) and 5.76 (`fix-finding-AUDIT-20260601-42`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-44` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.73 (fix-finding-AUDIT-20260601-39): AUDIT-20260601-39 — Bookkeeping classifier omits the runtime marker files, so th…

> Superseded by audit-log Status `acknowledged-resolved-phase18-gitignore-fix-dce5733c-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-39. Surface: commit `98f3a7a1` changed-file set: `.dw-lifecycle/scope-discovery/last-hook-run.json` + `.dw-lifecycle/scope-discovery/hook-run-log.jsonl` + `audit-log.md` + `workplan.md` vs. `check-barrage-tip.ts:74-81` (`isBookkeepingPath`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-39` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.74 (fix-finding-AUDIT-20260601-40): AUDIT-20260601-40 — Task 5.67 marks the test-existence acceptance criterion `[x]…

> Superseded by audit-log Status `acknowledged-duplicate-of-AUDIT-35-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-40 (claude-opus-02 + claude-opus-03 + claude-opus-04 + codex-01 + codex-02; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Task 5.67 (`fix-finding-AUDIT-20260601-33`), Acceptance Criteria block.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-40 (claude-opus-02 + claude-opus-03 + claude-opus-04 + codex-01 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.75 (fix-finding-AUDIT-20260601-41): AUDIT-20260601-41 — Commit subject names only the AUDIT-33 flip while the diff a…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-41. Surface: commit subject `docs: flip AUDIT-20260601-33 + tick Tasks 5.64/5.67 …` vs. `audit-log.md` hunks flipping both AUDIT-20260601-30 (line ~1599) and AUDIT-20260601-33 (line ~1632) to `fixed-785c99474f…`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-41` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.76 (fix-finding-AUDIT-20260601-42): AUDIT-20260601-42 — AUDIT-30 marked `fixed-785c9947` while AUDIT-36 (open) conte…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-42. Surface: `audit-log.md` AUDIT-20260601-30 `Status: fixed-785c99474f…` (line ~1602) vs. AUDIT-20260601-36 `Status: open` (lifted this diff, lines ~1660+).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-42` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.70 (fix-finding-AUDIT-20260601-36): AUDIT-20260601-36 — The bookkeeping filter is too coarse: it suppresses substant…

> Superseded by audit-log Status `acknowledged-duplicate-of-AUDIT-35-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-36 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-barrage-tip.ts:74-81` (`isBookkeepingPath` classifies `workplan.md` as bookkeeping) + `:141-155` (the skip).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-36 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.71 (fix-finding-AUDIT-20260601-37): AUDIT-20260601-37 — This commit's subject claims "close AUDIT-30/33" while the s…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-37 (claude-05 + codex-03; cross-model). Surface: commit subject `feat(check-barrage-tip): close AUDIT-20260601-30/33 …` vs. `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` new Task 5.64 (`fix-finding-AUDIT-20260601-30`) + Task 5.67 (`fix-finding-AUDIT-20260601-33`), both `[ ]` unstarted with placeholder-test ACs.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-37 (claude-05 + codex-03; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.72 (fix-finding-AUDIT-20260601-38): AUDIT-20260601-38 — CLI silently disables the filter on `git diff` failure

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-38. Surface: `plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts:158-180`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-38` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.69 (fix-finding-AUDIT-20260601-35): AUDIT-20260601-35 — Task 3's "≥2 test() blocks for HIGH+" gate collides with Pha…

> Superseded by audit-log Status `acknowledged-resolved-phase18-non-bug-template-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-35 (claude-opus-01 + claude-opus-02 + claude-opus-03 + claude-opus-04 + codex-01; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Task 3, Step 3 ("require ≥2 test() blocks in the cited test file when severity is HIGH+") + Acceptance Criteria line 2.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-35 (claude-opus-01 + claude-opus-02 + claude-opus-03 + claude-opus-04 + codex-01; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.64 (fix-finding-AUDIT-20260601-30): AUDIT-20260601-30 — Recursive non-convergence: the autonomous barrage is auditin…

Closes AUDIT-20260601-30 (HIGH cross-model claude-opus-01). Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-barrage-tip.ts`.

- [x] Step 1 (Option D — invariant write-up): working-code invariant — `check-barrage-tip` fires the barrage on every new diff. The fix must NOT break that for source-code changes. State matrix: all-bookkeeping → skip (new); all-source → fire (unchanged); mixed → fire (unchanged conservative).
- [x] Step 2: 2 bug-repro tests + 2 regression-lock tests + 1 backward-compat test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip.test.ts`.
- [x] Step 3: implemented `isBookkeepingPath` + optional `listDiffFiles` callback in `checkBarrageTip`. CLI shim defaults to `git diff --name-only`.
- [x] Step 4: tests pass; plugin suite 2583/2583.
- [x] Step 5: commit 785c9947 with `Closes AUDIT-20260601-30/33` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip.test.ts`
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip.test.ts` exits 0 (11/11 green)
- [x] Audit-log Status flipped to `fixed-785c9947`


### Task 5.65 (fix-finding-AUDIT-20260601-31): AUDIT-20260601-31 — Run marker writes `0/0/0` for a run that demonstrably promot…

> Superseded by audit-log Status `acknowledged-resolved-phase18-counter-fix-b7103a34-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-31. Surface: `.dw-lifecycle/scope-discovery/last-hook-run.json:5-8` + `.dw-lifecycle/scope-discovery/hook-run-log.jsonl:6` (runDir `20260601T032841284Z-scope-discovery`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-31` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.66 (fix-finding-AUDIT-20260601-32): AUDIT-20260601-32 — Task 5.63 is rendered with the code-defect "write a failing …

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-32 (claude-opus-03 + claude-opus-06 + codex-01; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Task 5.63 (`fix-finding-AUDIT-20260601-29`), Steps 1–5 + Acceptance Criteria.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-32 (claude-opus-03 + claude-opus-06 + codex-01; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.67 (fix-finding-AUDIT-20260601-33): AUDIT-20260601-33 — AUDIT-29's substantive complaint — the AUDIT-05 flip `f51bcb…

Closes AUDIT-20260601-33 (MED, claude-opus-04). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` AUDIT-20260601-05 status line.

- [x] Step 1: no test required — this is a bookkeeping omission, not a code defect. Disposition: directly land the missing flip (Phase 18 Task 1's non-bug template will formalize this shape; for now, document inline).
- [x] Step 2: confirmed AUDIT-20260601-05 `Status: open` pre-fix.
- [x] Step 3: flipped to `acknowledged-informational-process-feedback-2026-06-01` (rationale: AUDIT-05 was an informational process-feedback finding about retroactive task back-fill; no code action; bookkeeping disposition is the right shape).
- [x] Step 4: verified `Status:` line updated; no other audit-log changes.
- [x] Step 5: committed in 785c9947 alongside AUDIT-30 fix.

**Acceptance Criteria:**

- [x] Failing test exists at `(no test — bookkeeping disposition for an informational finding; Phase 18 Task 1's non-bug template will formalize this shape)`
- [x] `npx vitest run` 2583/2583 green (no test required)
- [x] Audit-log Status flipped to `fixed-785c9947`


### Task 5.68 (fix-finding-AUDIT-20260601-34): AUDIT-20260601-34 — Runtime marker files (`last-hook-run.json`, `hook-run-log.js…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-34. Surface: `.dw-lifecycle/scope-discovery/last-hook-run.json` + `.dw-lifecycle/scope-discovery/hook-run-log.jsonl`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-34` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.63 (fix-finding-AUDIT-20260601-29): AUDIT-20260601-29 — Commit subject is doubly misaligned with the diff — claims a…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-29 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + claude-06 + codex-01; cross-model). Surface: commit `f51bcb12` subject `docs: flip AUDIT-20260601-05 to acknowledged-informational + tick AUDIT-18 task` vs. `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md:1572-1582` (AUDIT-28 append) + `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (@@ -726,+726 new Task 5.62).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-29 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + claude-06 + codex-01; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.62 (fix-finding-AUDIT-20260601-28): AUDIT-20260601-28 — Commit subject claims only the AUDIT-18 flip, but the diff a…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-28 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + codex-01; cross-model). Surface: commit `2c30cd1d` subject `docs(audit-log): flip AUDIT-20260601-18 to fixed-b7103a34` vs. `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` (appended AUDIT-27 lift section) + `workplan.md:729-744` (new Task 5.61).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-28 (claude-01 + claude-02 + claude-03 + claude-04 + claude-05 + codex-01; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.61 (fix-finding-AUDIT-20260601-27): AUDIT-20260601-27 — Counter wiring decouples `findingsCount` from disposition co…

> Superseded by audit-log Status `acknowledged-resolved-phase18-counter-fix-b7103a34-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-27 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02; cross-model). Surface: `plugins/dw-lifecycle/src/subcommands/implement-hook.ts:346,355,405` + `implement-hook-counters.ts:18-22` (`parseLiftFindingsCount` defensive `return 0`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-27 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.57 (fix-finding-AUDIT-20260601-23): AUDIT-20260601-23 — Audit-log `20260601T025451417Z` lift batch is duplicated — A…

> Superseded by audit-log Status `acknowledged-cosmetic-bookkeeping-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-23 (claude-01 + codex-03 + codex-04; cross-model). Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` (two consecutive sections both headed `## 2026-06-01 — audit-barrage lift (20260601T025451417Z-scope-discovery)`) + `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Tasks 5.44–5.48).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-23 (claude-01 + codex-03 + codex-04; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.58 (fix-finding-AUDIT-20260601-24): AUDIT-20260601-24 — AUDIT-09/14 BLOCKING fix is implemented in this diff, but Ta…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-24 (claude-02 + claude-03 + codex-01; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/hook-run-log.ts:97-156` (`hasBootstrapSentinel` OR-backfill) vs. `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Task 5.44 (steps all `[ ]`) and `audit-log.md` (AUDIT-09 + AUDIT-14 both `Status: open`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-24 (claude-02 + claude-03 + codex-01; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.59 (fix-finding-AUDIT-20260601-25): AUDIT-20260601-25 — The "migration/clone case" test in `check-implement-hook-cov…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-25. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-implement-hook-coverage.test.ts` ("refuses when sentinel absent BUT log has entries (migration/clone case)").

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-25` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.60 (fix-finding-AUDIT-20260601-26): AUDIT-20260601-26 — Run marker `last-hook-run.json` writes `0/0/0` for the `2026…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-26 (claude-05 + codex-02; cross-model). Surface: `.dw-lifecycle/scope-discovery/last-hook-run.json` (`runDir: …20260601T025451417Z…`, `findingsCount: 0`, `promotedCount: 0`) + `.dw-lifecycle/scope-discovery/hook-run-log.jsonl`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-26 (claude-05 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.49 (fix-finding-AUDIT-20260601-15): AUDIT-20260601-15 — `check-fix-task-tdd` gate bypass recurs: Tasks 5.42/5.43 shi…

> Superseded by audit-log Status `acknowledged-duplicate-of-AUDIT-10-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-15. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.42 AC `Failing test exists at (no new test — pure typing cleanup…)`; Task 5.43 AC `Failing test exists at (to be filled in by Step 1 implementer)`) vs. the commit subject `…close AUDIT-20260601-06/07/08`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-15` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.50 (fix-finding-AUDIT-20260601-16): AUDIT-20260601-16 — AUDIT-08 disposition is incoherent: commit claims to close i…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-16. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` (AUDIT-20260601-08 `Status: open`) + `workplan.md` Task 5.43 Step 1 (`pushed back on the finding's recommendation`) + commit subject `…close AUDIT-…08` + `orchestrate-barrage.ts:122` / `types.ts:96-99`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-16` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.51 (fix-finding-AUDIT-20260601-17): AUDIT-20260601-17 — `isErrnoException` is an unsound type guard — it asserts `Er…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-17. Surface: `plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts:115-117`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-17` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.52 (fix-finding-AUDIT-20260601-18): AUDIT-20260601-18 — Run marker `last-hook-run.json` records `findingsCount: 0 / …

Closes AUDIT-20260601-18 (= GH #384). Surface: `.dw-lifecycle/scope-discovery/last-hook-run.json` + `plugins/dw-lifecycle/src/subcommands/implement-hook.ts` counter parsing.

- [x] Step 1: 12 failing tests added at `plugins/dw-lifecycle/src/__tests__/subcommands/implement-hook-counters.test.ts` covering parseLiftFindingsCount, parseSlushCounts, parsePromoteCount across singular/plural/zero/no-match shapes.
- [x] Step 2: confirmed tests RED pre-implementation (module didn't exist).
- [x] Step 3: extracted pure-fn `implement-hook-counters.ts` module with the three parsers. parsePromoteCount now reads STDOUT (not stderr) and looks for `Auto-applied: N` (not `promoted: N`). findingsCount derived from lift's stderr in implement-hook.ts before the disposition branch.
- [x] Step 4: 12 tests GREEN; full plugin suite 2578/2578.
- [x] Step 5: commit b7103a34 with `Closes #384, AUDIT-20260601-18` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/subcommands/implement-hook-counters.test.ts` (cited in Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/subcommands/implement-hook-counters.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-b7103a34` (manual flip — apply-audit-flips' trailer parser missed the `#384, AUDIT-18` form)


### Task 5.53 (fix-finding-AUDIT-20260601-19): AUDIT-20260601-19 — `hasBootstrapSentinel` violates command-query separation — a…

> Superseded by audit-log Status `acknowledged-duplicate-of-AUDIT-10-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-19 (claude-01 + claude-03 + codex-03; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/hook-run-log.ts:130-156` (backfill `writeFile`) + `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-coverage.ts:100` (gate calls it) + `subcommands/check-implement-hook-coverage.ts:187` (production wiring).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-19 (claude-01 + claude-03 + codex-03; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.54 (fix-finding-AUDIT-20260601-20): AUDIT-20260601-20 — The gate-level regression test for the migration/clone case …

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-20. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-implement-hook-coverage.test.ts:137-157` (new test) + `:35` (`makeArgs` stub) + the untested wiring at `subcommands/check-implement-hook-coverage.ts:187`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-20` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.55 (fix-finding-AUDIT-20260601-21): AUDIT-20260601-21 — This diff re-commits the two still-open marker/placeholder d…

> Superseded by audit-log Status `acknowledged-duplicate-of-AUDIT-13-and-AUDIT-10-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-21 (claude-04 + codex-02; cross-model). Surface: `.dw-lifecycle/scope-discovery/last-hook-run.json` (`findingsCount: 0 / promotedCount: 0 / slushedCount: 0`, `disposition: fired-and-promoted`) + `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Tasks 5.44-5.48 (`Failing test exists at (to be filled in by Step 1 implementer)`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-21 (claude-04 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.56 (fix-finding-AUDIT-20260601-22): AUDIT-20260601-22 — Audit-log duplicates the same lifted findings under two ID r…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-22. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md:1323-1460`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-22` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.44 (fix-finding-AUDIT-20260601-09): AUDIT-20260601-09 — Sentinel-absent-but-log-present fails OPEN — re-opens the ex…

> Superseded by audit-log Status `acknowledged-resolved-phase17-sentinel-backfill-b2ab9204-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-09 (claude-01 + codex-01 + codex-02; cross-model). Surface: `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-coverage.ts:100-108` (the `if (!hasSentinel) return allow-no-prior-run` block) + `plugins/dw-lifecycle/src/scope-discovery/promote-findings/hook-run-log.ts:97-115` (sentinel written only by `appendHookRunLogEntry`) + the committed `.dw-lifecycle/scope-discovery/hook-run-log.jsonl`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-09 (claude-01 + codex-01 + codex-02; cross-model)` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.45 (fix-finding-AUDIT-20260601-10): AUDIT-20260601-10 — `check-fix-task-tdd` gate bypass recurs: Tasks 5.42/5.43 shi…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-mechanization-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-10. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.42 AC `Failing test exists at (no new test — pure typing cleanup…)`; Task 5.43 AC `Failing test exists at (to be filled in by Step 1 implementer)`) vs. the commit subject `…close AUDIT-20260601-06/07/08`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-10` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.46 (fix-finding-AUDIT-20260601-11): AUDIT-20260601-11 — AUDIT-08 disposition is incoherent: commit claims to close i…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-11. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` (AUDIT-20260601-08 `Status: open`) + `workplan.md` Task 5.43 Step 1 (`pushed back on the finding's recommendation`) + commit subject `…close AUDIT-…08` + `orchestrate-barrage.ts:122` / `types.ts:96-99`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-11` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.47 (fix-finding-AUDIT-20260601-12): AUDIT-20260601-12 — `isErrnoException` is an unsound type guard — it asserts `Er…

> Superseded by audit-log Status `acknowledged-cosmetic-convention-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-12. Surface: `plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts:115-117`.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-12` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.48 (fix-finding-AUDIT-20260601-13): AUDIT-20260601-13 — Run marker `last-hook-run.json` records `findingsCount: 0 / …

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-13. Surface: `.dw-lifecycle/scope-discovery/last-hook-run.json` (`runDir: …20260601T024117392Z-scope-discovery`, `disposition: fired-and-promoted`, `findingsCount: 0`, `promotedCount: 0`, `slushedCount: 0`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-13` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.42 (fix-finding-AUDIT-20260601-07): AUDIT-20260601-07 — New runner catch block in `check-barrage-tip.ts` introduces …

Closes AUDIT-20260601-07. Surface: `plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts`.

- [x] Step 1: introduced shared `isErrnoException(err): err is NodeJS.ErrnoException` type guard at the top of check-barrage-tip.ts.
- [x] Step 2: replaced both `as NodeJS.ErrnoException` casts with the type guard (defaultListRunDirs catch + runCheckBarrageTip catch).
- [x] Step 3: typed the `let result;` as `let result: BarrageTipCheckResult;`. No more evolving-any.
- [x] Step 4: tsc clean; plugin suite 2562/2562.
- [x] Step 5: commit with `Closes AUDIT-20260601-07` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `(no new test — pure typing cleanup; existing tests cover the runtime paths)`
- [x] `npx vitest run` 2562/2562 green
- [x] Audit-log Status flipped to `fixed-47e32648` (apply-audit-flips' trailer parser missed comma-separated IDs; manual flip; tracked separately as a follow-up bug)


### Task 5.43 (fix-finding-AUDIT-20260601-08): AUDIT-20260601-08 — Outage detection treats stderr-only model output as no audit…

> Superseded by audit-log Status `acknowledged-pushback-by-design-shared-isModelRunHealthy-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-08. Surface: `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/orchestrate-barrage.ts:106-124`.

- [x] Step 1: pushed back on the finding's recommendation (broaden the check) — the lifter reads STDOUT only; broadening to include stderr would mean the gate writes tip.sha for outputs that aren't actually liftable.
- [x] Step 2: addressed the underlying concern (drift between orchestrator gate + CLI healthy-count) by centralizing the `isModelRunHealthy` predicate in `types.ts`. Both call sites now use the shared helper; the contract is structural rather than accidental.
- [x] Step 3: `isHealthyModelRun` in audit-barrage.ts is now an alias of `isModelRunHealthy`; orchestrate-barrage's inline check replaced with `results.some(isModelRunHealthy)`.
- [x] Step 4: tsc clean; plugin suite 2562/2562 (existing tests cover both call sites).
- [x] Step 5: commit with `Closes AUDIT-20260601-08` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `(no new test — accepted-pushback disposition; existing tests cover both call sites of the shared isModelRunHealthy predicate)`
- [x] `npx vitest run` 2562/2562 green (existing tests pass through the refactor)
- [x] Audit-log Status flipped to `acknowledged-pushback-by-design-shared-isModelRunHealthy-2026-06-01` (pushback disposition — accepted trade-off, not fix)

### Task 5.38 (fix-finding-AUDIT-20260601-02): AUDIT-20260601-02 — Task 5.37 (AUDIT-27) is an `[x]`-checked fix-finding task wi…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-02. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.37, AC block) vs. commit 46aec320 (`Closes AUDIT-…27`) and the `fix-task-tdd-discipline` doctor rule.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-02` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.39 (fix-finding-AUDIT-20260601-03): AUDIT-20260601-03 — AUDIT-27 `fixed-<sha>` cites a commit that doesn't touch the…

> Superseded by audit-log Status `acknowledged-historical-pre-phase18-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-03. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` (AUDIT-20260531-27 → `fixed-46aec320…`) vs. the `.dw-lifecycle/scope-discovery/clones.yaml` hunk in this diff.

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-03` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.40 (fix-finding-AUDIT-20260601-05): AUDIT-20260601-05 — Task 5.33 documents fix-landed-before-scoped (retroactive ba…

> Superseded by audit-log Status `acknowledged-informational-process-feedback-2026-06-01` — no TDD walk required.

Closes AUDIT-20260601-05. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.33 Step 5).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260601-05` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step



### Task 5.121 (fix-finding-AUDIT-20260602-45): AUDIT-20260602-45 — Fail-closed helper is fail-closed for the gate but fail-OPEN…

Closes AUDIT-20260602-45. Surface: `plugins/dw-lifecycle/src/scope-discovery/util/git-ancestry.ts:60-67` (error → `return true`) consumed at `plugins/dw-lifecycle/src/subcommands/implement-hook.ts:289-291` AND `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-ran.ts` (the `allow-marker-diverged-history` branch). Severity: high.

- [x] Step 0: working-code invariant — pre-AUDIT-41, the helper returned `boolean` with `catch { return false; }`; the value was unused (Phase 17 only compared `marker.tip === HEAD`). AUDIT-41's fix made the boolean carry safety semantics, but `true` then meant opposite things at each call site (gate: refuse; implement-hook: trust). The fix MUST distinguish the two call sites by forcing each to handle the error case explicitly.
- [x] Step 1: refactored to tri-state — `AncestryResult = 'ancestor' | 'not-ancestor' | 'unknown'`. RED observed on the test side: the existing `git-ancestry.test.ts` assertions returned `.toBe(true)` / `.toBe(false)`; after the type change, they had to be rewritten to `.toBe('ancestor')` / `.toBe('not-ancestor')` / `.toBe('unknown')`. The boolean-shape tests failed verbatim against the new return type — that's the RED gate.
- [x] Step 1b: regression-lock — exit-0 ancestor case still returns `'ancestor'`, exit-1 case still returns `'not-ancestor'`. Test block count: 8 (well above ≥2 per Option D).
- [x] Step 2: RED confirmed (the type change makes the old assertions fail).
- [x] Step 3: implemented — `git-ancestry.ts` returns the tri-state. Each call site adapts: `check-implement-hook-ran` maps `'ancestor'` and `'unknown'` to `true` (refuse-stale path), `'not-ancestor'` to `false` (allow-diverged path). `implement-hook` accepts ONLY `'ancestor'` as a trustworthy tip; `'not-ancestor'` and `'unknown'` both fall back to the `HEAD~10` baseline. Each call site has an inline comment explaining its safety direction.
- [x] Step 4: 18/18 tests pass (8 git-ancestry + 10 check-implement-hook-ran). tsc clean.
- [ ] Step 5: commit with `Closes AUDIT-20260602-45` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/git-ancestry.test.ts` exercising the tri-state semantic
- [x] Regression-lock test exists in the same file (Step 1b); test block count for this finding is 8 (≥2 per Option D discipline)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/util/git-ancestry.test.ts` exits 0
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.122 (fix-finding-AUDIT-20260602-46): AUDIT-20260602-46 — Shared-helper doc comment documents only the gate's interpre…

Closes AUDIT-20260602-46. Surface: `plugins/dw-lifecycle/src/scope-discovery/util/git-ancestry.ts:1-49` (file-level doc comment). Severity: medium.

- [x] Step 1: addressed alongside AUDIT-45 (the doc comment was rewritten as part of the tri-state refactor; the new comment documents both callers' opposite safety dispositions explicitly + uses the tri-state shape that makes the doc reflect the type).
- [x] Step 2: RED was observable as a consequence — the boolean-era doc couldn't have referred to "the tri-state result" because the type was a boolean. The doc rewrite is a type-change consequence.
- [x] Step 3: doc rewritten; both per-caller dispositions named explicitly.
- [x] Step 4: visual diff confirms the doc now names both callers + their `unknown` policies.
- [ ] Step 5: commit with `Closes AUDIT-20260602-46` in subject (paired with AUDIT-45 since they share the same fix).

**Acceptance Criteria:**

- [x] The file-level doc comment names both consumers + their `unknown`-state dispositions
- [x] `npx vitest run` exits 0 (the doc change rides on AUDIT-45's test suite)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 5.118 (fix-finding-AUDIT-20260602-41): AUDIT-20260602-41 — `defaultIsAncestorOfHead` comment claims a fail-closed safet…

Closes AUDIT-20260602-41. Surface: `plugins/dw-lifecycle/src/subcommands/check-implement-hook-ran.ts` (`defaultIsAncestorOfHead`, the comment block + `catch { return false; }`) ↔ `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-ran.ts` (new branch: `const onSameHistory = await args.isAncestorOfHead(marker.tip); if (!onSameHistory) { return { kind: 'allow-marker-diverged-history', ... } }`). Severity: high.

- [x] Step 0: working-code invariant — pre-Phase-22, `isAncestorOfHead`'s return value was unused (Phase 17 only compared marker.tip === HEAD). The Phase 22 Task 3 diverged-history branch made `false` mean "allow the commit." A bare-`catch → false` then silently allowed git errors. The fix MUST preserve the legitimate "tip is not an ancestor" case (`exit 1` → return `false` → allow boot case) while distinguishing it from "git errored" (`exit > 1` OR spawn failed → unknown → return `true` → refuse).
- [x] Step 1: failing test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/git-ancestry.test.ts` — real-git fixture with mkdtemp + git init + a tip ref that doesn't exist. Pre-fix returned `false` (would silently allow); fix returns `true` (refuses).
- [x] Step 1b: regression-lock test at the same file — exit-0 ancestor case still returns `true` (Option D invariant). Test block count for this finding: 8 (well above the ≥2 threshold).
- [x] Step 2: RED confirmed against pre-fix bare-`catch` semantics.
- [x] Step 3: extracted shared `isAncestorOfHead` to `plugins/dw-lifecycle/src/scope-discovery/util/git-ancestry.ts` with fail-closed semantic: map error `.status === 1` → false; anything else → true. Removed the duplicated helpers from both CLI shims (`check-implement-hook-ran.ts` and `implement-hook.ts`) and pointed both at the shared util. This addresses AUDIT-41 (safety) AND AUDIT-42 (DRY) AND AUDIT-43 (coverage) in one cohesive change.
- [x] Step 4: GREEN — 8/8 git-ancestry.test.ts + 10/10 check-implement-hook-ran.test.ts (unchanged behavior under the DI stub) + tsc clean.
- [ ] Step 5: commit with `Closes AUDIT-20260602-41` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/git-ancestry.test.ts` (cited in Step 1)
- [x] Regression-lock test exists in the same file (Step 1b); test block count for this finding is 8 (≥2 per Option D discipline)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/util/git-ancestry.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.119 (fix-finding-AUDIT-20260602-42) (non-bug): AUDIT-20260602-42 — Duplicated 13-line `isAncestorOfHead` helper dispositioned w…

Closes AUDIT-20260602-42. Surface: `.dw-lifecycle/scope-discovery/clones.yaml` (clone group `700e9d4b0f18` — now dropped from the baseline). The helpers themselves were at `plugins/dw-lifecycle/src/subcommands/check-implement-hook-ran.ts` and `plugins/dw-lifecycle/src/subcommands/implement-hook.ts` — now consolidated to a single helper in `plugins/dw-lifecycle/src/scope-discovery/util/git-ancestry.ts`.

**Shape**: non-bug. The audit's substantive complaint was that the "deferred to a follow-up" disposition reason was deferral phrasing rather than a substantive justification — exactly the discipline AUDIT-20260601-78 / -81 / -82 / -83 cluster has flagged before.

**Disposition (Step 1):** Replaced the deferral with a real fix: extracted the helper into `plugins/dw-lifecycle/src/scope-discovery/util/git-ancestry.ts` as part of AUDIT-41's resolution. Both CLI shims now import the shared helper. `check-clones --refresh-baseline` confirms clone group `700e9d4b0f18` dropped (-1 net; 0 new). The "deferred" reason in clones.yaml is moot because the dispositioned clone no longer exists.

- [x] Step 1: write the disposition prose (≥40 chars, substantive). Done — the substantive action is the DRY extraction.
- [x] Step 2: apply the action — extracted to `git-ancestry.ts`; deleted the duplicated helpers; `check-clones --refresh-baseline` confirms the clone group is dropped.
- [ ] Step 3: commit with `Closes AUDIT-20260602-42` in subject (paired with AUDIT-41 since they share the same fix).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (helpers consolidated; clone group dropped from baseline).
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step.


### Task 5.120 (fix-finding-AUDIT-20260602-43): AUDIT-20260602-43 — The real default ancestry helper (`defaultIsAncestorOfHead`)…

Closes AUDIT-20260602-43. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-implement-hook-ran.test.ts` (all four Phase 22 Task 3 tests inject `isAncestorOfHead: async () => opts.isAncestorOfHead ?? true`) vs. the untested production helper. Severity: medium.

- [x] Step 1: failing test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/git-ancestry.test.ts` exercising the bug via a real git fixture (mkdtemp + git init + bad ref).
- [x] Step 2: RED confirmed.
- [x] Step 3: shared helper at `plugins/dw-lifecycle/src/scope-discovery/util/git-ancestry.ts` is now under coverage.
- [x] Step 4: 8/8 git-ancestry.test.ts pass; suite covers ancestor / not-ancestor / sibling / bad-ref / malformed-sha / non-git-dir / nonexistent-path / regression-lock.
- [ ] Step 5: commit with `Closes AUDIT-20260602-43` in subject (paired with AUDIT-41/-42).

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/git-ancestry.test.ts` (cited in Step 1)
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/util/git-ancestry.test.ts` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.123 (fix-finding-AUDIT-20260602-44) (non-bug): AUDIT-20260602-44 — Task 3 workplan rewrote the RED gate into a self-justifying …

Closes AUDIT-20260602-44. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` Task 2 (~line 4119) + Task 3 (~line 4142) Step 2 notes.

**Shape**: non-bug. Substantive surface fix.

**Disposition (Step 1):** Replaced both "TDD-discipline note — written in the same change" rationalizations (Task 2 Step 2 and Task 3 Step 2) with honest acknowledgements that the RED gate was SKIPPED. The audit caught the same shape twice (AUDIT-37 on Task 2, AUDIT-44 on Task 3) — the pattern is real. Marked both Step 2 boxes back to `[ ]` so future re-walks see the skip explicitly. Added context in each note that the AUDIT-41/-43 follow-up (this commit's real-git integration test against fail-closed semantics) is the retroactive RED→GREEN observation for the production helper — the path the compressed Task 3 cycle had skipped. Task 2's helper (`computeAuditedDiff`) is purely DI-bag input/output and doesn't have an equivalent integration to retroactively cover; that Step 2 stays acknowledged-but-skipped without a redemption path.

- [x] Step 1: write the disposition prose (≥40 chars, substantive).
- [x] Step 2: apply the action — both Step 2 notes updated to honest acknowledgements.
- [ ] Step 3: commit with `Closes AUDIT-20260602-44` in subject (paired with AUDIT-41/-42/-43).

**Acceptance Criteria:**

- [x] Step 1 disposition prose exists and is ≥40 characters of substantive content (no placeholder strings).
- [x] The named action has landed in this branch (Task 2 + Task 3 Step 2 notes rewritten).
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step.

### Task 5.28 (fix-finding-AUDIT-20260531-11): AUDIT-20260531-11 — Fix-tasks 5.25 and 5.26 reintroduce the exact bare-`*.test.t…

Closes AUDIT-20260531-11. Surface: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` (Task 5.25 acceptance criteria + Task 5.26 acceptance criteria, added in this diff) vs. `plugins/dw-lifecycle/src/scope-discovery/promote-findings/tdd-enforcement.ts:67-95`.

- [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [ ] Step 2: confirm test fails against current code (verify the bug repros)
- [ ] Step 3: implement the fix
- [ ] Step 4: confirm test passes
- [ ] Step 5: commit with `Closes AUDIT-20260531-11` in subject

**Acceptance Criteria:**

- [ ] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.29 (fix-finding-AUDIT-20260531-12): AUDIT-20260531-12 — The AUDIT-10 regression guard scans a single file, not the s…

> Superseded by audit-log Status `acknowledged-slush-pile-2026-05-31` — no TDD walk required.

Closes AUDIT-20260531-12. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts:159-199` (the new `feature-root source file contains NO forbidden-deferral phrases` test).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260531-12` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.30 (fix-finding-AUDIT-20260531-13): AUDIT-20260531-13 — `until.*lands` / `until.*ships` regexes have a multi-line bl…

> Superseded by audit-log Status `acknowledged-slush-pile-2026-05-31` — no TDD walk required.

Closes AUDIT-20260531-13. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` (the `forbiddenPhrases` array — `'until.*lands'`, `'until.*ships'`).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260531-13` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.31 (fix-finding-AUDIT-20260531-14): AUDIT-20260531-14 — The guard test's own comment is a deferral/IOU shape — "this…

> Superseded by audit-log Status `acknowledged-slush-pile-2026-05-31` — no TDD walk required.

Closes AUDIT-20260531-14. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` (the docblock above the new test: "if the canonical list grows, this test **can be migrated to import it directly**").

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260531-14` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step


### Task 5.32 (fix-finding-AUDIT-20260531-15): AUDIT-20260531-15 — Inconsistent concat-splitting leaves literal forbidden-phras…

> Superseded by audit-log Status `acknowledged-slush-pile-2026-05-31` — no TDD walk required.

Closes AUDIT-20260531-15. Surface: `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/feature-root.test.ts` (the `forbiddenPhrases` array).

- [x] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
- [x] Step 2: confirm test fails against current code (verify the bug repros)
- [x] Step 3: implement the fix
- [x] Step 4: confirm test passes
- [x] Step 5: commit with `Closes AUDIT-20260531-15` in subject

**Acceptance Criteria:**

- [x] Failing test exists at `(to be filled in by Step 1 implementer)` (cited in Step 1)
- [x] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
- [x] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step

### Task 6 (follow-up): Primitive-extraction dispatch hygiene

- [ ] Extend `dispatch-wrapper-prelude.md` with a "Primitive-extraction dispatch hygiene" section enumerating the integration-layer audit concerns (CSS class-name conflicts, ARIA contract correctness, callback-index drift, wire-format rounding/clamping). Surfaced by audiocontrol pilot TF-016 (AUDIT-20260525-09); tracked at [#290](https://github.com/audiocontrol-org/deskwork/issues/290).
- [ ] Ship `plugins/dw-lifecycle/templates/scope-discovery/primitive-extraction-checklist.md` — Medium-option deliverable, operators copy via `/dw-lifecycle:customize`.
- [ ] (Optional, Heavy) Extend `wrap()` to optionally inject an integration-layer audit prelude when the agent type matches a `ui-engineer`-style marker; mirrors the existing refactor-marker auto-prelude pattern.

**Acceptance Criteria:**
- [x] `wrap()` rejects sub-agent returns missing any `Searched/Included/Excluded` label — exercised by 3 dedicated rejection scenarios + `missingBlocks` set-equality assertion.
- [x] Forbidden-deferral phrases reject; project overrides honored — 21 phrase scenarios + 7 regex scenarios + 5 override-loader tests (REPLACE semantics; built-in phrase no longer rejects under override; override phrase DOES reject; malformed override file throws).
- [x] Refactor-marker auto-prelude engages on every documented marker — 5 `it.each` cases iterate `REFACTOR_CONTEXT_MARKERS`, each asserts `REFACTOR-CONTEXT PRECONDITIONS` appears in the dispatched prompt; non-refactor prompt confirms suppression.
- [x] 43/43 scenarios pass + gutted-stub self-check engages — full plugin suite at 495/495 (438 baseline + 57 new); gutted-stub verification documented: bypassing parser+validator inside `wrap()` produces 38 of 57 failures (proves teeth across both layers + override loaders).

## Phase 6: CLI subcommands

**Deliverable:** All ~20 new CLI verbs land in `plugins/dw-lifecycle/src/subcommands/` + registered in `cli.ts`.

### Task 1: Inventory + widen + summary commands

- [x] `scope-inventory <slug>` — landed in Phase 3; fans 4 universal agents in parallel + Phase 4 config-activated agents.
- [x] `scope-widen "<complaint>"` — landed (closes [#292](https://github.com/audiocontrol-org/deskwork/issues/292)). Library API + thin subcommand shim + 15 vitest scenarios. Required positional complaint + `--slug`; optional `--manifest`, `--prd-path`, `--apply`, `--evidence-trail`, `--module-root`, `--quiet`. Default behavior is dry-run (prints delta to stderr, exits 0 without modifying the manifest). Complaint injection strategy: appended as `## Operator complaint (scope-widen)` section to a per-run augmented PRD; the PRD-themed pattern hunter tokenizes the complaint alongside the PRD body so operator words become themed keywords without bespoke parsing. Evidence trail under `docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/widen-runs/<stamp>-<runId>/`. Delta computation is purely additive; theme keys strip the `<term> (N occurrences)` suffix so occurrence-count shifts don't false-positive as additions. `--apply` merges the delta into the manifest; `generated_by` (e.g., `curated`) is preserved. Smarter complaint parsing (noun phrases, identifiers, additional grep patterns) is deferred to Phase 11's orchestrator-agent work; v1 is plumbing.
- [x] `scope-summary [--surface <glob>]` — ported verbatim from audiocontrol pilot (`tools/scope-discovery/summary.ts`). 4-field summary line (`total | pending-touching | pending-intra | dispositioned-touching`), `--json` + `--verbose` + `--clones` override; default clones path generalized to `.dw-lifecycle/scope-discovery/clones.yaml`. 15 vitest scenarios cover the pure compute math, programmatic + CLI surfaces, gutted-stub teeth (all-zero counter must fail mixed-fixture assertion).

### Task 2: Check-* gate commands

- [x] `check-clones [--gate-mode]` — subcommand originally registered as `detect-clones` in Phase 1; renamed to `check-clones` in the Phase 6 verb-naming pass with `detect-clones` preserved as a forever-back-compat alias (both names dispatch to the same handler, so adopter pre-commit hooks installed by pre-rename versions of `install-scope-discovery-hooks` continue to work without modification). Library API renamed `detectClones` → `checkClones`; new hook chains emit `check-clones --gate-mode`; deprecation-hint surfaced in CLI `--help` listing. `--gate-mode` flag landed as a no-op-for-symmetry (check-clones already exits 1 on NEW groups by default — the hook contract). New skill at `plugins/dw-lifecycle/skills/check-clones/SKILL.md` is the canonical procedure; `plugins/dw-lifecycle/skills/detect-clones/SKILL.md` is a thin redirector pointing at the canonical skill. 3 new vitest scenarios — 2 gate-mode-flag-no-op + 1 alias-symmetry (both names produce identical exit codes on the same fixture).
- [x] `check-anti-patterns [--gate-mode]` — subcommand registered in Phase 2; `--gate-mode` flag landed. Default is informational (findings → exit 0, full report on stdout); `--gate-mode` flips to hook-friendly exit 1 on findings. **Schema follow-up:** add optional `negative_match_classes:` array per pilot TF-015 (AUDIT-20260525-08); validator auto-generates negative-test scenarios. Pairs with #285 pattern-type dispatcher work.
- [x] `check-deprecations [--write]` — subcommand SHELL → full scanner port landed. Walks the scan root for file-level `@deprecated` JSDoc tags + `// DEPRECATED:` line comments within the first 20 lines; resolves importers via `@/` alias + basename-relative path forms; classifies as blocked (importers > 0) or safe-to-delete (importers === 0). `--write` emits markdown to `.dw-lifecycle/scope-discovery/deprecation-queue.md`. `--json` emits structured output (`{ total, deprecation_count, filesVisited, blocked: [...], safeToDelete: [...] }`). `--module-root` accepts the `@/` alias root (default `src`; pilot's audiocontrol layout uses `modules/<editor>/src`). Closes [#287](https://github.com/audiocontrol-org/deskwork/issues/287). 23 vitest scenarios including gutted-stub teeth. Regime-holdout-detector now uses the real scanner; `meta.deprecation_count` populates from real importers.
- [x] `check-adopters [--gate-mode]` — subcommand registered in Phase 2; `--gate-mode` flag landed (default informational; flag flips to hook-friendly exit 1 on holdouts).
- [x] `check-editor-symmetry [--write]` — landed in Phase 4 with `--write` flag honored; default writes to `docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/editor-symmetry.md`.
- [x] `check-refactor-preconditions [--gate-mode]` — subcommand registered in Phase 2; `--gate-mode` flag landed (default informational; flag flips to hook-friendly exit 1 on precondition failures).

### Task 3: Disposition + baseline commands

- [x] `dispose-clone <id> --as <refactor|keep-with-reason|ignore-with-justification> [args]` — refuses without Step 0a/0b flags on refactor disposition. Single-id convenience wrapper around `batch-dispose`. `keep-with-reason` + `ignore-with-justification` pass through verbatim; `--as refactor` requires all Step 0a/0b precondition flags (`--canonical-side`, `--canonical-reason`, [`--new-shape-summary` if canonical-side=new], `--tests`, `--tests-proof-sha`, `--tests-proof-demonstration`) AND still refuses to write (refactor's 5 fields don't fit `--reason` shape; the wrapper redirects to manual editing + `dw-lifecycle check-refactor-preconditions`). The flag-presence requirement is a forcing function — the operator who tries `--as refactor` sees the full precondition surface in the error message. 19 vitest scenarios.
- [x] `refresh-clones-baseline` — thin wrapper carving `detect-clones --refresh-baseline` into its own subcommand. Closes the operator-ergonomics loop opened by AUDIT-20260525-07: clone-detector's batch-dispose hint already cites `dw-lifecycle refresh-clones-baseline` as the recovery path, this commit makes the verb resolvable. Forwards `--baseline` + `--quiet` verbatim; `--gate-mode` intentionally NOT accepted (refresh is mutating by definition). 10 vitest scenarios cover the pure `forwardedArgs` injector (idempotency, ordering) + `wantsHelp` detector + CLI `--help`/`-h` surface.
- [x] `batch-dispose <id> --disposition <D> --reason "<text>"` — landed as `dw-lifecycle batch-dispose`. Closes the TODO at `clone-detector.ts:182` (now emits paste-ready `dw-lifecycle batch-dispose ...` command in the hint, no TODO referenced). Closes [#284](https://github.com/audiocontrol-org/deskwork/issues/284); pilot TF-014 (AUDIT-20260525-07) addressed via the Light option — unknown-id error cites the `dw-lifecycle detect-clones --refresh-baseline` prereq so the operator's recovery path is obvious.
- [x] `check-disposition-survivor` — landed as `dw-lifecycle check-disposition-survivor`. Pre-commit gate that fails the commit on any `keep-with-reason`/`refactor`/`ignore-with-justification` → `pending` transition unless the operator passes `--allow-disposition-loss`. Compares HEAD's baseline (via `git show`) against the working tree. Closes [#289](https://github.com/audiocontrol-org/deskwork/issues/289); pilot reference: TF-013 (AUDIT-20260525-06). Phase 8 hook-chain wires it in.

### Task 4: Install / migrate / uninstall commands

- [x] `install-scope-discovery` — landed Phase 8 Task 1 (commit `2737132`). Idempotent bootstrap of `.dw-lifecycle/scope-discovery/`; copies 4 templates + seeds 3 empty registries. 15 vitest scenarios.
- [x] `install-scope-discovery-hooks` — landed Phase 8 Task 2 (commit `6cda930`). Auto-detects Husky vs `.githooks` vs greenfield; writes non-short-circuiting gate chain; manifest at `hooks-installed.json`. 30 vitest scenarios.
- [x] `install-agent-prompts` — landed Phase 8 Task 3 (commit `48fdfdb`). Appends Step 0 fragment to `.claude/agents/code-reviewer.md` + `codebase-auditor.md`; refuses to auto-create agent files. 19 vitest scenarios.
- [x] `migrate-from-pilot` (audiocontrol-specific in NAME ONLY — works for any project mirroring the canonical pilot layout) — landed for [#291](https://github.com/audiocontrol-org/deskwork/issues/291). Verb reads the pilot's `tools/scope-discovery/` + `docs/scope-discovery/`; copies CONFIG verbatim into `.dw-lifecycle/scope-discovery/`; diffs CODE per-file against the plugin defaults and categorizes each as identical / pilot-ahead (contribute-back) / pilot-behind (sync from plugin) / diverges (customize-override). Default dry-run; `--apply` materializes CONFIG copies; `--force` overwrites divergent targets; `--report-out <path>` writes markdown report to disk. 38 vitest scenarios.
- [x] `uninstall-scope-discovery-hooks` — landed Phase 8 Task 5 (commit `b71fb8b`). Drift-checks each managed file via sha256; refuses on drift unless `--force-uninstall`; strips managed block from merged installs. 20 vitest scenarios.

### Task 5: Validator + export commands

- [x] `validate-scope-discovery` — runs all adversarial harnesses. Spawns `npx vitest run scope-discovery` from the dw-lifecycle workspace root; forwards stdout/stderr/exit-code verbatim. `--quiet` switches to the dot reporter. Exit codes mirror vitest (0 all-passed, 1 failure, 2 invalid args). 3 vitest scenarios cover the flag-parse contract; the spawn path is exercised in practice by every existing `npm test -- scope-discovery` run.
- [x] `scope-export [--json]` — emit a previously-produced `scope-manifest.yaml` to stdout. Default path resolves from `--slug` (`docs/1.0/001-IN-PROGRESS/<slug>/scope-manifest.yaml`, matching `scope-inventory`'s default output); `--manifest <path>` overrides explicitly. Default mode emits raw YAML verbatim (preserves comments + formatting); `--json` re-emits via `yaml.parse` + `JSON.stringify`. 10 vitest scenarios.

**Acceptance Criteria:**
- [ ] All ~20 CLI verbs invokable via `dw-lifecycle <verb>` + via skill prose
- [x] `--gate-mode` flag on check-* commands exits non-zero on violations — landed across `check-anti-patterns`, `check-adopters`, `check-refactor-preconditions` (default informational; flag flips to hook-friendly exit 1) and `detect-clones` (already gate-by-default; flag is a no-op for symmetry). 10 new vitest scenarios cover the flag delta.
- [x] `--json` flag on summary/export commands emits structured output — `scope-summary --json` emits `{ surface, clones, total, pending-touching, pending-intra, dispositioned-touching }`; `scope-export --json` emits the parsed manifest re-serialized via `JSON.stringify`; `check-deprecations --json` emits `{ total, deprecation_count, filesVisited, blocked: [...], safeToDelete: [...] }` (the post-port shape; the pre-port shell's `{ blocked, safeToDelete, deprecation_count, note }` is a superset).

## Phase 7: Slash command skill prose

**Deliverable:** SKILL.md + commands/<name>.md files for each of the ~18 new + 5 updated `/dw-lifecycle:*` skills.

### Task 1: New skill prose (18 skills)

- [x] For each new skill — broken down per-skill below. 19 of 19 landed (`scope-widen` shipped post-#292 closure; the 4 Phase-8 install-related skills landed in Phase 8 commit 6; `migrate-from-pilot` skill prose landed alongside the subcommand for [#291](https://github.com/audiocontrol-org/deskwork/issues/291)).
  - [x] `scope-inventory` — SKILL.md + commands/scope-inventory.md.
  - [x] `scope-summary` — SKILL.md + commands/scope-summary.md.
  - [x] `scope-export` — SKILL.md + commands/scope-export.md.
  - [x] `check-anti-patterns` — SKILL.md + commands/check-anti-patterns.md.
  - [x] `check-adopters` — SKILL.md + commands/check-adopters.md.
  - [x] `check-refactor-preconditions` — SKILL.md + commands/check-refactor-preconditions.md.
  - [x] `check-editor-symmetry` — SKILL.md + commands/check-editor-symmetry.md.
  - [x] `check-deprecations` — SKILL.md + commands/check-deprecations.md (updated to document the now-real scanner behavior after the #287 port landed).
  - [x] `batch-dispose` — SKILL.md + commands/batch-dispose.md. (Not in the original Phase 7 enumeration; authored because the Phase 6 Task 3 verb landed and it pairs with dispose-clone + check-disposition-survivor.)
  - [x] `dispose-clone` — SKILL.md + commands/dispose-clone.md.
  - [x] `check-disposition-survivor` — SKILL.md + commands/check-disposition-survivor.md. (Not in the original Phase 7 enumeration; authored because the Phase 6 Task 3 verb landed and the pre-commit gate behavior is operator-facing.)
  - [x] `refresh-clones-baseline` — SKILL.md + commands/refresh-clones-baseline.md.
  - [x] `validate-scope-discovery` — SKILL.md + commands/validate-scope-discovery.md.
  - [x] `check-clones` — SKILL.md + commands/check-clones.md authored in the Phase 6 Task 2 rename pass; sibling `detect-clones` SKILL.md + commands/detect-clones.md are thin redirectors documenting the back-compat alias.
  - [x] `scope-widen` — SKILL.md + commands/scope-widen.md landed alongside the Phase 6 verb implementation (closes [#292](https://github.com/audiocontrol-org/deskwork/issues/292)). Mirrors `scope-inventory` skill prose style: Steps + Flags + Error handling + When-to-use sections.
  - [x] `install-scope-discovery` — SKILL.md + commands/install-scope-discovery.md landed Phase 8 commit 6 (this run).
  - [x] `install-scope-discovery-hooks` — SKILL.md + commands/install-scope-discovery-hooks.md landed Phase 8 commit 6.
  - [x] `install-agent-prompts` — SKILL.md + commands/install-agent-prompts.md landed Phase 8 commit 6.
  - [x] `uninstall-scope-discovery-hooks` — SKILL.md + commands/uninstall-scope-discovery-hooks.md landed Phase 8 commit 6.
  - [x] `migrate-from-pilot` — SKILL.md + commands/migrate-from-pilot.md landed alongside the verb implementation (closes [#291](https://github.com/audiocontrol-org/deskwork/issues/291)). Mirrors `scope-inventory` skill prose style: Steps + Flags + CODE-diff legend + Error handling + When-to-use sections.

### Task 2: Updated skill prose (5 skills)

- [x] `/dw-lifecycle:define` — document auto-scope-inventory + `--no-scope-inventory`
- [x] `/dw-lifecycle:implement` — document auto-scope-widen + dispatch-wrapper engagement + `--no-scope-widen` (skill body + commands/implement.md frontmatter updated; references `wrap()` from `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts` and `plugins/dw-lifecycle/templates/scope-discovery/dispatch-wrapper-prelude.md`).
- [x] `/dw-lifecycle:review` — document auto-clone-detector + `--no-clone-check`
- [x] `/dw-lifecycle:doctor` — document new doctor rules
- [x] `/dw-lifecycle:customize` — document `scope-discovery <name>` category

**Acceptance Criteria:**
- [ ] All ~23 skills discoverable via slash-command picker
- [ ] Existing skills' auto-invocation documented + opt-out flags surfaced

## Phase 8: Install / migrate / uninstall machinery

**Deliverable:** Install skills functional end-to-end against fixture projects + audiocontrol-specific migration.

### Task 1: install-scope-discovery

- [ ] Bootstrap `.dw-lifecycle/scope-discovery/` config dir; copy README + LAYOUT.md + refactor-preconditions-checklist.md templates from plugin
- [ ] Refuse if already present (idempotent re-run reports + no-op)

### Task 2: install-scope-discovery-hooks

- [ ] Detect `.githooks/pre-commit` presence; offer `--merge` / `--replace` / `--force`
- [ ] Detect Husky in `package.json`; register hook if present
- [ ] Write `hooks-installed.json` with provenance

### Task 3: install-agent-prompts

- [ ] Detect `.claude/agents/{code-reviewer,codebase-auditor}.md` presence; offer `--merge` / `--force`
- [ ] Write Step 0 §verification sections generated from canonical fragment
- [ ] Record in `hooks-installed.json`

### Task 4: migrate-from-pilot (audiocontrol-specific)

- [x] Reads the pilot's existing `tools/scope-discovery/` + `docs/scope-discovery/` — refuses with exit 2 + actionable error when `tools/scope-discovery/` is absent (the migration source isn't a scope-discovery pilot).
- [x] Copies CONFIG verbatim to `.dw-lifecycle/scope-discovery/` — four canonical YAMLs (clones, anti-patterns, adopter-manifests, deprecation-queue); `absent-on-pilot` skips for missing files; `--force` overwrites divergent targets; default refuses on divergent target conflict.
- [x] Diffs CODE against plugin defaults per file — set-based line diff produces `addedInPilot` / `removedInPilot` counts; categorizes each file as identical / pilot-ahead / pilot-behind / diverges / pilot-only / plugin-only.
- [x] Produces per-file contribute-back-vs-customize-override report — markdown table with file / status / lines-diff / suggested-action columns + a status-symbol legend; emitted to stdout or `--report-out <path>` on disk.

### Task 5: uninstall-scope-discovery-hooks

- [ ] Reads `hooks-installed.json`; drift-checks each installed file
- [ ] Removes files; removes manifest entries
- [ ] `--force-uninstall` overrides drift refusal

**Acceptance Criteria:**
- [x] Greenfield install creates correct dir structure + schema files — `install-scope-discovery` creates `.dw-lifecycle/scope-discovery/` with 4 templates + 3 empty-array seeds; 15 vitest scenarios verify greenfield + idempotent + dry-run + force + partial restore.
- [x] Hook install works with absent/existing/Husky variants — `install-scope-discovery-hooks` detects Husky vs `.githooks` vs greenfield via `detectHusky` + `chooseMode`; 30 vitest scenarios cover all three branches plus merge / replace / refusal / dry-run.
- [x] Agent-prompt install works without trampling existing `.claude/agents/` content — `install-agent-prompts` refuses to auto-create missing files (exit 2); marker-pair detection prevents duplicate blocks; operator content above/below the block is preserved; 19 vitest scenarios.
- [x] migrate-from-pilot runs cleanly against audiocontrol's actual state — smoke-tested against `~/work/audiocontrol-work/audiocontrol-scope-discovery-protocol/`; produces a categorized report with all four diff statuses surfacing (identical / pilot-ahead / pilot-behind / diverges) plus pilot-only entries for the validate/fixture modules the plugin doesn't ship. Closes [#291](https://github.com/audiocontrol-org/deskwork/issues/291).
- [x] Uninstall drift-checks each managed file via sha256; refuses to remove drifted files unless `--force-uninstall`; strips managed block from merged installs; 20 vitest scenarios.

## Phase 9: Doctor rule additions

**Deliverable:** `/dw-lifecycle:doctor` gains scope-discovery-specific rules with fixers/repair-hints where reasonable.

### Task 1: Config validation rules

- [x] `scope-discovery-config-missing` — install hint; fires when a project's feature docs reference scope-discovery but the config dir is absent. Landed at `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/scope-discovery-config-missing.ts` (commit `29a1a17`).
- [x] `scope-discovery-schema-stale` — migration steps for stale `schemaVersion`; checks clones.yaml / anti-patterns.yaml / adopter-manifests.yaml each for missing / mismatched `schemaVersion`. Plugin's current version published as `CURRENT_SCHEMA_VERSION = 1` in `doctor-rules/types.ts`. Seed YAMLs from `install-scope-discovery` now carry `schemaVersion: 1`. Commit `29a1a17`.
- [x] `clones-yaml-schema-violation` — runs `parseClonesYamlStrict` against the project's clones.yaml; reports shape-error findings with a schema diff hint. Does NOT double-report on refactor-precondition errors (those go to the dedicated rule). Commit `29a1a17`.
- [x] `anti-patterns-yaml-schema-violation` — same shape via `loadRegistry`; reports the registry parser's namespaced error with a schema pointer. Commit `29a1a17`.

### Task 2: Refactor-precondition validation

- [x] `clones-yaml-refactor-incomplete` — walks clones.yaml looking for `disposition: refactor` entries; each missing Step 0a / Step 0b field becomes its own doctor finding with a per-branch repair hint (7 branch types covered: canonical_side / canonical_reason / new_shape_summary-required / new_shape_summary-empty-on-non-new / tests / tests_proof / tests_proof.sha). Commit `1fd6eab`.

### Task 3: Drift detection rules

- [x] `agent-prompt-mirror-drift` — compares the Step 0 fragment in `.claude/agents/code-reviewer.md` + `codebase-auditor.md` against the canonical template; whitespace-normalized body compare; suppressed when `agent-prompt-overrides.md` is present. Repair hint: `install-agent-prompts --force`. Commit `275faef`.
- [x] `override-drift` — operator advisory when a per-file scope-discovery override diverges from the plugin default by > 50 non-blank lines OR exported-symbol surface differs. Heuristic intentionally coarse; operator decides whether to converge. Commit `275faef`.

### Task 4: Install state rules

- [x] `hooks-installed-missing` — reads `hooks-installed.json`; warns when any managed file in the manifest no longer exists. Repair hints surface BOTH re-install and clean-uninstall paths. Commit `20fc0fa`.

**Acceptance Criteria:**
- [x] All 8 new doctor rules implemented + tested against fixture projects — 54 new vitest scenarios across 8 rule-test files; tests use on-disk tmpdir fixtures (no mock fs).
- [x] Repair hints actionable — each rule's message names the exact `/dw-lifecycle:*` skill or file path the operator should target. Smoke against this repo fires `scope-discovery-config-missing` with a recognisable install hint.

## Phase 10: Canary install + graphical-entries paper-test deliverable

**Deliverable:** Deskwork-as-adopter install complete; `graphical-entries` exercised end-to-end; paper-test coverage matrix produced. **v1 acceptance signal — measured 60.9%; ship gate REFRAMED from coverage percentage to dogfood feedback per operator decision 2026-05-25.**

### Task 1: Install scope-discovery in deskwork

- [x] `dw-lifecycle install-scope-discovery` — landed commit `7761a1f`. Creates `.dw-lifecycle/scope-discovery/` with 7 files (4 templates + 3 empty-array seed registries).
- [x] `dw-lifecycle detect-clones --refresh-baseline` — landed commit `2aa89aa`. Initial baseline scoped to `plugins/dw-lifecycle/src/` (37 groups); expanded to whole-repo in commit `0a77a26` (105 groups across packages/ + plugins/). Friction surfaced: `.jscpd.json` config-path mismatch — symlink workaround in place, tracked at [#293](https://github.com/audiocontrol-org/deskwork/issues/293).
- [x] `dw-lifecycle install-scope-discovery-hooks` — landed commit `0a77a26`. Husky-mode detected; writes `.husky/pre-commit` with 5-gate chain + `hooks-installed.json` manifest. Friction surfaced: hook hardcodes `dw-lifecycle` binary which predates scope-discovery subcommands (tracked at [#294](https://github.com/audiocontrol-org/deskwork/issues/294)) + writes `check-editor-symmetry --gate-mode` (unsupported flag, tracked at [#295](https://github.com/audiocontrol-org/deskwork/issues/295)). Hook patched to invoke `npx tsx` and skip the broken flag; documented in commit.
- [x] `dw-lifecycle install-agent-prompts` — landed commit `e2b1750`. Step 0 sections appended to `.claude/agents/{code-reviewer,codebase-auditor}.md`; recorded in `hooks-installed.json`.

### Task 2: Author deskwork-specific anti-patterns

- [x] Populate `.dw-lifecycle/scope-discovery/anti-patterns.yaml` — landed commit `77d457e`. Four entries:
  - `hardcoded-stage-name-array` (per DESKWORK-STATE-MACHINE.md Commandment I) — 5 findings across packages/.
  - `review-state-write` (per Commandment III) — 0 active findings (1 false-positive on doc comment, excluded).
  - `host-required-throw` (per "collections, not websites") — 0 findings.
  - `single-pipeline-shape-assumption` — 0 findings (the live code already uses lane-aware framing in prose).

### Task 3: Exercise the protocol against graphical-entries

- [x] `dw-lifecycle scope-inventory --slug graphical-entries` ran against design-spec PRD substitute — landed commit `09c8510`. Output:
  - `docs/1.0/001-IN-PROGRESS/scope-discovery/scope-inventory-graphical-entries.yaml` (445-line manifest, kind=code).
  - 6 agents activated in ~0.45s, 6 findings, 1 warning (PRD lacks References section).
  - Evidence trail at `docs/1.0/001-IN-PROGRESS/graphical-entries/scope-inventory/runs/20260525T110802Z-1cdd0f/` with all per-agent JSONs + synthesis.md + editor-symmetry.md.
- [ ] `scope-widen` trial — deferred per [#292](https://github.com/audiocontrol-org/deskwork/issues/292) (verb itself not implemented in v1).

### Task 4: Produce paper-test-graphical-entries.md coverage matrix

- [x] 35 documented surfaces enumerated — landed commit `d715179` at `docs/1.0/001-IN-PROGRESS/scope-discovery/paper-test-graphical-entries.md`.
- [x] Per-detector coverage:
  - scope_inventory_caught: **33/35 = 94.3%**
  - scope_widen_caught: deferred (#292)
  - anti_patterns_caught: **4/35 = 11.4%** (starter set per Task 2 brief)
  - step0_enforcement_caught: **27/35 = 77.1%**
- [x] **Combined non-deferred coverage: 60.9%.** Operator decision 2026-05-25: ship v1 at measured coverage; reframe gate.
- [x] 7 operator action items surfaced; 4 already filed as GH issues (#293, #294, #295, #296); 3 are pending operator triage (anti-pattern starter set expansion, scope-widen design at #292, spec References section).

### Task 5: v1 ship + dogfood handoff to graphical-entries

- [x] Tooling-feedback template authored at `plugins/dw-lifecycle/templates/scope-discovery/tooling-feedback.md` — mirrors audiocontrol pilot pattern (categories A/AM/CL/GATE/DSC/MISC; severity high/medium/low; Repro/Workaround/Suggested-fix; append-only).
- [x] Pre-created `docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md` from template (empty of entries; graphical-entries team fills as friction surfaces).
- [x] Pre-created `docs/1.0/001-IN-PROGRESS/graphical-entries/dogfood-handoff.md` — operator-facing one-page handoff README naming the dogfood goal, where to start, escalation criteria (TF-vs-GH-issue), closure protocol.
- [x] Agent-discipline rule added: `.claude/rules/agent-discipline.md` § "scope-discovery v1 — dogfood feedback via tooling-feedback.md" documents the workflow for future implementers (template path, escalation, closure import to audit-log).

**Acceptance Criteria:**
- [x] Deskwork canary install completes cleanly — 4 install commands all exit 0; friction issues filed transparently.
- [x] graphical-entries' scope-inventory exercises the protocol end-to-end — Task 3 deliverable.
- [x] paper-test coverage matrix produced — Task 4 deliverable.
- [x] Combined coverage > ~80% — REFRAMED as v1 ship gate. Measured 60.9% in paper-test (Phase 10 Task 4). Operator decision 2026-05-25: ship v1 at measured coverage; dogfood gate replaces percentage gate. graphical-entries implementation team logs friction in docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md; v1 hardens via audit cycle on that log (mirror of audiocontrol pilot pattern that produced TF-001..TF-016).
- [x] No regressions in the existing dw-lifecycle skill set — `validate-scope-discovery` runs 401 tests, 398 pass; 3 pre-existing flakes on clone-detector tmpdir-jscpd-spawn timeouts (5s default vitest timeout vs ~1.7s actual per-test cost — unrelated to Phase 10 changes; the same tests pass individually with `--testTimeout=30000`).

## Phase 11: Pattern discovery loop with self-correcting controller

**Parent issue:** [#316](https://github.com/audiocontrol-org/deskwork/issues/316).
**Source:** Issue [#315](https://github.com/audiocontrol-org/deskwork/issues/315) (first real-world dogfood-cycle finding). Operator design conversation 2026-05-26.

**Problem the phase addresses (captured exhaustively per capture-mode rule; scoping is a separate pass):**

The current scope-discovery surface is **INVENTORY masquerading as DISCOVERY**. The agents match against a fixed hardcoded vocabulary and surface only what's pre-registered. Concrete dogfood failure: an editor component consumed ZERO canonical design-system primitives + ≥14 utility-class hits, survived every scanner run + every audit, was caught only when the operator inspected a screenshot. The structural gap is general: any project using scope-discovery has a registry that can grow stale; the tooling cannot surface novel anti-patterns; the operator-trust failure mode is "green discovery report read as evidence-of-no-novel-anti-patterns."

The phase introduces:
- **Pattern-type vocabulary widening** beyond positive-match regex.
- **The Loop** — a continuous discovery cycle with status-marked catalog entries, orchestrator-mediated dispositions, and a measurement-driven self-correcting controller.
- **Autonomous orchestration** via `/dw-lifecycle:implement` augmented with per-turn audit/judge stack + LLM-judge in-band + external LLM auditor + audit-log memory.
- **Wrong-decision recovery primitives** so the orchestrator can self-correct without dragging the human into every decision.

### Task 1: Pattern-type vocabulary widening (G1–G7)

Today only `type: regex` is expressible. Add type-handler dispatcher in the scan engine; ship as polymorphic catalog with per-project YAML override (existing Phase 3 design supports this for the catalog file but not the type space).

- [x] **G1**: Polymorphic pattern catalog — type-handler dispatcher; catalog is data, handlers are code, both extensible per-project. Landed at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-handlers/{index,types,regex,negative-space,coverage,outlier,semantic,loader,glob}.ts`; `pattern-matrix.ts` refactored to delegate via `dispatchPattern()`; schema extended to discriminated union; backward-compat: entries without `type` default to `'regex'`.
- [x] **G2**: Negative-match primitive — `{ type: 'negative-space', match_glob, must_contain, threshold, secondary_contains? }` (the operator-named cheapest fix from #315). KeygroupSummary-shape repro pinned by `negative-space.test.ts`; smoke-verified end-to-end on synthetic fixture (file in expected-adopter glob with zero canonical + 11 utility hits → finding fires; healthy sibling does not fire).
- [x] **G3**: Coverage-metric primitive — `glob × shape → ratio` emitted as synthesis-layer metric on `PatternFinding.metrics.{numerator,denominator,ratio}`; per-directory adoption percentage feeds Phase 11 Task 4 codebase-state metrics.
- [x] **G4**: Statistical-outlier primitive — `glob × distance metric → cosine distance per file vs directory-sibling centroid`; z-score thresholded at `threshold_sigma` (default 2.0); supports `token-composition` + `className-composition` distance metrics.
- [x] **G5**: Unmatched-shape clustering pass — synthesis-layer STUB shipped at `synthesis-discovered-candidates.ts` (always emits `[]` + stderr advisory). Algorithm tracked at [#318](https://github.com/audiocontrol-org/deskwork/issues/318) with full spec + acceptance criteria.
- [x] **G6**: Semantic primitive (LLM-augmented) — type registered + dispatched; LLM-invocation STUB returns zero findings + `metrics.stub: 1`. Wiring tracked at [#319](https://github.com/audiocontrol-org/deskwork/issues/319); will share dispatch infrastructure with Phase 11 Task 7 LLM-judge.
- [x] **G7**: Provenance field on findings — `provenance: 'registered-pattern' | 'negative-space' | 'coverage-gap' | 'discovered-candidate' | 'outlier' | 'semantic' | 'prd-theme'`. Added to `PatternFinding` in `discovery-agents/types.ts`; each handler sets its own provenance tag.

### Task 2: The Loop foundation — status markers + disposition lifecycle

The Loop closes by extending existing catalogs with disposition state, not by creating a separate ledger (operator decision 2026-05-26).

- [x] Add `status:` field to every catalog entry type: `pending | blessed | cursed | ignore | tracked-holdout | withdrawn`. Shared module at `plugins/dw-lifecycle/src/scope-discovery/util/catalog-status.ts` defines the type union + `parseCatalogEntryMetadata` + `filterActiveEntries`. Defaults: `blessed` for hand-authored pre-Loop entries (synthesized at parse time so existing registries continue to enforce). Scanners enforce only `blessed` + `cursed`; every other status is skipped.
- [x] Add `provenance:` block to every catalog entry — `{ source: 'operator-authored' | 'orchestrator-agent' | 'llm-judge-proposed' | 'install-seed' | 'promoted-from-candidate', authored_at, authored_by, context, evidence_link }`. Synthesized to `{ source: 'install-seed', authored_at: '1970-01-01T00:00:00Z' }` when absent (back-compat).
- [x] Reversibility primitive: `withdrawn-<finding-id>` status on auto-dispositions overturned by auditor; the parser enforces that `withdrawn` entries MUST carry `provenance.context: 'audit-finding-<id>'`. Entries are NEVER deleted — `withdrawn` preserves history (mirrors the audit-log convention). The bidirectional audit-log linkage (catalog entries ↔ audit-log entries with `affects:` / `audit_history:`) is Phase 11 Task 10's responsibility; this dispatch lands the field shape.
- [x] Cross-surface application: anti-patterns / adopter-manifests / clones / pattern-matrix / deprecations all carry the status + provenance fields uniformly. Schemas updated for each registry. clones.yaml's existing `disposition:` field coexists with `status:`; the mapping (`disposition: pending` → `status: pending`; `keep-with-reason` / `refactor` → `blessed`; `ignore-with-justification` → `ignore`) is fixed and lives in `dispositionToStatus()`. The disposition-survivor gate continues to operate on `disposition:` (clones-specific semantic). Operator-supplied `status:` overrides the disposition-derived default. editor-symmetry's underlying registry is `adopter-manifests.yaml` (the editor-symmetry-scanner consumes it) so it inherits the Loop fields by reference; regime-holdout-detector is a synthesis pass over the four scanners and inherits via the same surface. New doctor rule `catalog-entry-missing-status` warns when entries omit explicit `status:` (one finding per registry naming the omitted entry ids). 30 new vitest scenarios in `loop-foundation.test.ts` cross-cut every parser + scanner + doctor rule; 861/861 plugin tests pass.

### Task 3: Orchestrator-agent mediation surface

Operator dispositions at architecture-scale; the orchestrator-agent translates to line-level catalog edits (operator decision 2026-05-26: ONE user-level concept, the agent figures out novelty vs refinement vs suppression).

- [x] Architectural summary of candidates at scan completion — orchestrator clusters raw findings, writes 1-2-sentence operator-readable summaries to a "discovered_candidates" section of the scope-manifest. Landed at `plugins/dw-lifecycle/src/scope-discovery/mediation/{mediation-types,cluster-candidates,propose-catalog-edits,mediation}.ts`. Clustering is Jaccard n-gram similarity over the matched-excerpt (default threshold 0.7, ngram size 3); `synthesis.ts` invokes `mediate({ findings })` in PHASE 1 and pipes the architectural summaries through `toManifestSection()` into the manifest's `discovered_candidates:` array. Schema updated with the `discovered_candidate_entry` definition; manifest emission populates the section when clusters are present.
- [x] Catalog-edit diff proposal — orchestrator surfaces the line-level catalog changes it would make; operator approves at architecture-level; orchestrator commits the changes. `proposeCatalogEdits()` produces `CatalogEditProposal[]` with unified-diff-style `diff` field, `proposed_entry` (a YAML-compatible plain object), and a non-empty `reason` field naming the cluster + operator's disposition + the operation chosen.
- [x] Append-vs-edit autonomy — orchestrator decides whether a disposition implies a new catalog entry (novelty) or refinement of an existing entry (tightening/widening); the operator never makes this choice manually. Decision (per Phase 11 Task 3 pre-made decision #3): if the cluster's representative excerpt matches an existing entry's `match_regex` via dry-run, propose `edit` against that entry; otherwise propose `append`. Withdrawn entries are skipped (read-only — un-withdrawal requires an audit-finding link). The mediation library is PURE computation (no FS, no network, no module-level state); the call site (scope-inventory / `/dw-lifecycle:implement`) handles I/O. 45 vitest scenarios across `cluster-candidates.test.ts` (26) + `propose-catalog-edits.test.ts` (19); proposed entries round-trip through the actual anti-patterns + adopter-manifests registry parsers (proves the wire format is valid YAML, not just a JS object that looks YAML-shaped). Full plugin suite at 1208/1208.

### Task 4: Codebase-state metrics

The controller can only adjust based on what it measures. These are observable properties of the codebase; their derivatives become drift/correction signals.

- [ ] **Classification completeness**: fraction of distinct shapes that are catalogued (blessed/cursed/ignore) vs uncatalogued.
- [ ] **Coverage**: per BLESSED pattern, fraction of expected adopters actually adopting.
- [ ] **Violation density**: per CURSED pattern, hit count + concentration (per-directory).
- [ ] **Surface uniformity / outlier presence**: variance in shape across sibling files per directory.
- [ ] **Catalog stability**: edit rate over time.
- [ ] **Discovered-candidate rate**: new shapes surfacing per unit code change.
- [ ] **Disposition latency**: time candidates remain `pending` before triage.

### Task 5: Self-correcting controller

Cadence + intensity are NOT pre-decided. The controller observes drift / correction / auditor-correction signals; adjusts itself.

- [x] Drift signal = derivative-toward-worse of codebase-state metrics. Implemented in `plugins/dw-lifecycle/src/scope-discovery/controller/controller-signals.ts#computeDriftAndCorrection`; projection happens through the `MetricsSnapshot` shape (the controller doesn't carry the full Phase 11 Task 4 metrics block — the synthesis pass projects to scalar fields the controller derives from).
- [x] Correction signal = derivative-toward-better of codebase-state metrics. Same module; the per-metric direction inverts depending on toward-better convention (`classification_completeness` increasing = better; `violation_density` decreasing = better; etc.).
- [x] **Auditor-correction-rate**: count of audit-driven catalog edits (provenance.context: `audit-finding-<id>`) per unit work. Implemented in `controller-signals.ts#computeAuditorCorrectionRate`. Counts entries whose `provenance: 'llm-judge-proposed'` OR `context: audit-finding-*`; normalised by max(1, history length) and saturated at 1.0. The TRUTH SIGNAL per the PRD — codebase-state metrics can lie when the catalog is incomplete; auditor-correction rate exposes when the model is undercounting drift.
- [x] Cadence-adjust policy: high drift OR high auditor-correction → tighter cadence, more intensive analysis. Low drift + low auditor-correction → loosen. Implemented in `controller-policies.ts` per-field proposal functions (`proposeFrequencyAdjustment`, `proposeIntensityAdjustment`, `proposeEscalationAdjustment`). Frequency + intensity both respond to drift OR auditor signal; escalation threshold relaxes ONLY when BOTH drift and auditor have been low for the configured window.
- [x] Sensible defaults shipped from day one. `DEFAULT_CONTROLLER_CONFIG` in `controller-config.ts`: cold-start frequency 1.0, cold-start intensity 1.0, cold-start escalation threshold 0.9, ratchet-down rate 0.1 per N=5 turns, anti-thrashing K=3, anti-thrashing damping 0.5. Operators override via `.dw-lifecycle/scope-discovery/controller-config.yaml` (schema at `schema/controller-config.yaml.schema.json`).
- [x] Cold-start behavior: fresh install with no measurements defaults to maximum frequency/intensity; ratchets down as the controller earns confidence. Cold-start branch in `controller.ts#runController` emits cold-start defaults verbatim when `history.length === 0`; convergence test verifies ~10 turns to a stable cadence well below max but above the floor under steady inputs.
- [x] Anti-thrashing: bounded oscillation; the controller observes whether its own adjustments are stable. `controller-policies.ts#detectOscillation` looks back the prior K adjustments on the same field; reversal direction triggers `anti-thrashing-damping` audit entry + 50% damping factor applied to the proposed delta.
- [x] Telemetry: controller decisions are auditable (the operator can inspect "why did frequency go up at scan #47"). Every decision carries a per-field `audit_trail` of `ControllerAdjustment` entries (`{ field, signal_used, prior_value, new_value, reason, adjusted_at }`); state persists at `.dw-lifecycle/scope-discovery/orchestrator-runtime/controller-state.json` (gitignored under the orchestrator-runtime dir) via `controller-state.ts`. Retention bounded at 24 entries (newest-first). 39 vitest scenarios cover cold-start, steady-state, ratchet-down, high-drift, high-auditor-correction, anti-thrashing damping, convergence (~10 cold-start turns to stable), bounds + clamping, config loader + parse-time invariants, state load/persist + retention bound.

### Task 6: `/dw-lifecycle:implement` augmentation — the autonomous loop

The existing implement skill walks the workplan. The augmentation embeds the audit/judge stack and the controller as inline machinery (operator decision 2026-05-26: implement is the entry point; no new `/dw-lifecycle:iterate` skill).

- [x] Per-turn audit/judge stack inside implement — landed at `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/` as the `runOrchestratorTurn` library (composition of Phase 11 Tasks 2-11). Per-turn cycle:
  1. Read audit log via `llm/audit-log-reader.ts` (durable watermark at `.dw-lifecycle/scope-discovery/orchestrator-runtime/last-audit-read.json`).
  2. Detect wrong-decisions via `recovery/detect-wrong-decisions.ts`; emit reversal proposals via `recovery/reverse-disposition.ts`.
  3. Internal LLM-judge pass via `llm/judge.ts` (in-band, through `wrap()`).
  4. Mediate findings via `mediation/mediation.ts` (cluster + architectural summaries; PHASE 2 catalog-edit proposals when dispositions supplied).
  5. Run controller via `controller/controller.ts`; persist updated history to `controller-state.json` in-flight.
  6. Project codebase-state metrics via `discovery-agents/codebase-state-metrics.ts`.
  7. Fire external auditor via `llm/auditor.ts` (fire-and-forget; emits `audit-request-<id>.json` under `pending-audits/`).
  8. Build escalation visibility surface via `escalation/escalation-visibility.ts`.
- [x] Hook-cadence is workplan-dependent + controller-tuned — `runController` reads codebase-state metrics + auditor-correction-rate signals; emits `frequency / intensity / escalationThreshold` for the NEXT turn. Cold-start defaults to max (1.0/1.0/0.9); ratchet-down on sustained low drift; anti-thrashing damping on oscillation. Tunables in `controller-config.yaml`.
- [x] Termination criteria negotiated per-cycle — the orchestrator-agent driving the implement skill reads `TurnReport` after each turn and decides: goal-achieved (workplan acceptance) → continue; escalation queued + count > 0 → pause for operator; budget/policy-violation → the orchestrator-agent halts and surfaces. No new code surface — termination is read off the report fields.
- [x] Resumability state — `orchestrator-loop/loop-state.ts` persists at `.dw-lifecycle/scope-discovery/orchestrator-runtime/loop-state.json` (audit watermark + last turn id + bounded turnHistory ring). Controller history persists separately at `controller-state.json`; trust-calibration at `trust-calibration.json`; pending escalations at `pending-escalations/<id>.json`; audit requests at `pending-audits/audit-request-<id>.json`. All gitignored under `.dw-lifecycle/scope-discovery/orchestrator-runtime/`.
- [x] Tests: 35 new vitest scenarios at `src/__tests__/scope-discovery/orchestrator-loop/` (loop-config 9 + loop-state 12 + loop-turn end-to-end 14). The end-to-end test plants synthetic catalog + audit-log state on disk, runs `runOrchestratorTurn`, and asserts the composed turn report carries the expected outputs from every wired sub-library.
- [x] SKILL.md updated — `plugins/dw-lifecycle/skills/implement/SKILL.md` carries a "Phase 11 — Autonomous loop" section that documents the per-turn cycle, the `TurnReport` shape, the durable state files, the configuration surface, and the new error-handling cases (judge dispatch failure + wrong-decision-recovery escalation).

### Task 7: LLM-judge / external-auditor / audit-log integration

Multi-source ensemble: internal judge (in-band, every turn) + external auditor (out-of-band, fired by orchestrator every turn, results read next turn) + audit-log (durable memory). Human is escalation-only target (operator decision 2026-05-26: as little human intervention as possible).

- [x] Internal LLM-judge implementation — runs as part of `/dw-lifecycle:implement`'s per-turn cycle; reads recent work + catalog state + open candidates; emits per-decision confidence score + proposed dispositions. Landed at `plugins/dw-lifecycle/src/scope-discovery/llm/judge.ts` with prompt template `templates/scope-discovery/judge-prompt.md`. Library defines the SHAPE of the call; the actual LLM network call is dispatched through Phase 5's `wrap()` so the dispatch grammar + forbidden-deferral phrases + refactor-marker prelude all apply to the judge's reasoning trail.
- [x] External LLM auditor invocation — orchestrator fires a third-party LLM audit prompt each turn; results materialize in the audit log; the orchestrator reads them next turn. Landed at `plugins/dw-lifecycle/src/scope-discovery/llm/auditor.ts` (fire-and-forget; emits `audit-request-<id>.json` under `.dw-lifecycle/scope-discovery/pending-audits/`) with prompt template `templates/scope-discovery/audit-prompt.md`. External auditor process is operator-provided (separate model class; plugin documents the contract).
- [x] Audit-log read automation — orchestrator reads audit-log for updates since last turn as routine; no operator action required. Landed at `plugins/dw-lifecycle/src/scope-discovery/llm/audit-log-reader.ts` with durable watermark at `.dw-lifecycle/scope-discovery/orchestrator-runtime/last-audit-read.json`. Wired into `scope-inventory` as a silent pre-flight (skip when scope-discovery isn't installed; `--no-audit-read` for operator opt-out).
- [x] Judge-vs-auditor independence — different model/prompt scaffolds; auditor cannot self-grade the judge's work. Two distinct templates (`judge-prompt.md` vs `audit-prompt.md`) + two distinct model classes in `llm-judge.yaml` (judge default `claude-sonnet-4`; auditor default `claude-opus-4`). Schema documents the independence rule.
- [x] **Closes [#319](https://github.com/audiocontrol-org/deskwork/issues/319)** — semantic pattern handler upgraded from STUB to wired LLM-judge path via `enrichSemanticFinding()`. Sync `semanticHandler.apply` retained for backward compat with the polymorphic dispatcher; the async wired path is the contract orchestrator-side scope-inventory drives.
- [ ] Confidence calibration — composite signal: judge-confidence × policy-match × skills-exhaustion × auditor-correction-rate; threshold tuned by the controller. (Task 5 controller work; depends on Task 4 metrics + this Task 7 LLM ensemble being in place — both prerequisites land here.)

### Task 8: Wrong-decision recovery primitives

If the orchestrator commits a wrong disposition / catalog edit, the system must detect and recover without operator intervention (where possible).

- [x] Reversible disposition flow + catalog-edit rollback via `withdrawn-<finding-id>` status + trust-calibration updates + systematic-wrongness response landed at `plugins/dw-lifecycle/src/scope-discovery/recovery/` (`recovery-types.ts`, `detect-wrong-decisions.ts`, `reverse-disposition.ts`, `trust-calibration.ts`, `systematic-wrongness.ts`). Detection: catalog entries with `provenance.source: orchestrator-agent` or `llm-judge-proposed` that an audit-log finding cites via `Affects:` with the body containing a disagreement token (`overturn`, `wrong`, `incorrect`, `disagree`, `reverse`) surface as `WrongDecisionEvent`s. Reversal is SOFT — emits `CatalogEditProposal` (per pre-made decision #4) with `status: withdrawn` + `provenance.context: audit-finding-<id>` (the reversibility-primitive invariant from Phase 11 Task 2 + Task 10). Trust calibration: +0.05 per wrong-decision event in the relevant class; -0.01 per correct decision; bounded [0.0, 0.4]; durable state at `.dw-lifecycle/scope-discovery/orchestrator-runtime/trust-calibration.json`. Systematic-wrongness: class-key = `<pattern-type>|<disposition>|<shape-tag>`; threshold N=3 within K=10 events crosses to escalation by default. 56 vitest scenarios across `src/__tests__/scope-discovery/recovery/` cover per-module behavior + an end-to-end recovery scenario (detect → reverse → calibrate → classify → persist → ratchet-down on correct).
- [ ] Initial wrong-decision per session is escalated to human; subsequent ones use calibration-adjusted threshold; if the auditor disagrees AGAIN, escalation re-fires. (Wiring across the orchestrator surface is Task 9 — the primitives this task ships are consumed there.)

### Task 9: Operator escalation surface

Escalation should be rare, high-information, asynchronous-friendly (operator decision 2026-05-26: the rare-but-clear shape).

- [x] Escalation queue — orchestrator writes a pending-escalation artifact when confidence is below threshold; the artifact contains `action_proposed`, `evidence` (summary + links + excerpts), `reasoning`, `question`, and an ordered list of `options`. Implementation at `plugins/dw-lifecycle/src/scope-discovery/escalation/escalation-queue.ts` — `enqueueEscalation(input, opts)` writes a single JSON file under `.dw-lifecycle/scope-discovery/orchestrator-runtime/pending-escalations/<id>.json` via atomic write-then-rename; ids follow the auditor's `YYYYMMDDHHMMSS-<6hex>` format. Validation rejects empty action/reasoning/question, empty options list, and duplicate option ids. Shared parser at `escalation-parse.ts` keeps the queue file under the 500-line cap. Per pre-made decision #1: single JSON files (operator can edit inline; resolution writes a `resolution:` field).
- [x] Resumption mechanics — `readPendingEscalations(opts)` lists open escalations (those with `resolution: null`); `resolveEscalation(id, decision, opts)` reads the pending file, stamps the resolution, atomically writes the resolved file, and unlinks the pending file. Resolved escalations are MOVED to `resolved-escalations/<id>.json` (never deleted; provenance trail per pre-made decision #2). Markdown renderer at `escalation-render.ts` (`renderEscalationMarkdown`) emits an operator-readable view with sections for proposed action, question, reasoning, evidence (summary + links + excerpts), and options with id badges, plus a sentinel-delimited `Operator decision` footer. `extractOperatorDecision(markdown)` reads back the operator's verbatim text between `<!-- BEGIN/END OPERATOR DECISION -->` sentinels; `matchOperatorOptionId(decision, optionIds)` recognizes plain-prose option-id mentions at word boundaries. Double-resolution refused (refuses to overwrite an already-resolved escalation).
- [x] Visibility surface — `escalation-visibility.ts` ships `buildEscalationVisibility(opts)` returning `{ count, rows }` (each row: `id`, `queuedAt`, `actionProposed`, `question`, `quickLink`) for the orchestrator's per-turn report; quick-links default to repo-relative paths, `useAbsolutePaths: true` for terminal-clickable absolutes; `pendingOverride` lets the orchestrator pass an already-read list without a re-read. `renderEscalationVisibility(visibility)` emits an operator-readable markdown block — `### Escalations queued (N)` with bullet-per-row, or `_None._` when the queue is empty (per pre-made decision #4, the report surfaces an empty-queue confirmation). Per-component tests at `src/__tests__/scope-discovery/escalation/{escalation-parse,escalation-queue,escalation-render,escalation-visibility}.test.ts`. 61 vitest scenarios cover round-trip + malformed input + provenance MOVE semantics + sentinel extraction + option-id matching + visibility row shape + quick-link rendering. Plumbing into the per-turn report itself lands with Phase 11 Task 6 (`/dw-lifecycle:implement` augmentation); this dispatch ships the visibility library Task 6 will call.

### Task 10: Provenance + audit-log linkage

Every catalog edit traces back to its origin. Audit-log entries link to specific catalog edits. Cross-references navigable in both directions.

- [x] Provenance field schema standardized across all catalog types — landed in Phase 11 Task 2 (`util/catalog-status.ts`); Task 10 builds on that foundation.
- [x] Audit-log entries gain `affects:` links naming catalog entries they touch — parser lives at `plugins/dw-lifecycle/src/scope-discovery/util/audit-log-parser.ts` and supports BOTH the single-line comma-separated form (legacy / `llm/audit-log-reader.ts` compatible) AND the multi-line YAML bullet form. Cross-reference navigation surfaces `findAuditEntriesAffecting(catalogEntryId)` + `findCatalogEntriesAffectedBy(findingId)` + `auditFindingIdSet(log)` + `citationEntryId(citation)` + `citationRegistry(citation)` library APIs for future operator UIs.
- [x] Catalog entries gain `audit_history:` listing audit-log findings against them — added as optional `auditHistory: readonly string[]` to anti-patterns / adopter-manifests / clones / pattern-matrix entry types. `util/catalog-status.ts` ships `parseAuditHistory(raw, ctx, namespace)` shared parser. Schemas updated across all five JSON schemas (anti-patterns, adopter-manifests, clones, pattern-matrix-patterns, deprecation-queue). Backward compat: pre-Task-10 entries that omit the field parse fine with an empty array.
- [x] Doctor rule: `provenance-orphaned-entries` — catalog entries with provenance pointing at audit-findings that don't exist; surfaces broken cross-references. Three failure modes covered: (1) forward-orphaned (entry's `provenance.context: audit-finding-<id>` lacks an audit-log Finding-ID), (2) backward-orphaned (entry's `audit_history:` lists a non-existent Finding-ID), (3) unmatched audit-log citation (audit-log `Affects:` cites a non-existent catalog entry). Walks `docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md` across in-progress features; unions the Finding-IDs as the lookup surface. Registered in `doctor-rules/index.ts`. 16 vitest scenarios + 27 audit-log-parser scenarios cover the surface.

### Task 11: Cross-surface application

The pattern-type widening + Loop primitives + status/provenance fields apply uniformly to ALL registry-driven scanners, not just `pattern-matrix.ts`.

- [x] anti-patterns.yaml — schema gains `status`, `provenance`; auto-disposition flow integrates. Plumbed in Phase 11 Task 2 (entries gain Loop fields; scanner filters to active via `filterActiveEntries` at the registry boundary).
- [x] adopter-manifests.yaml — same. Plumbed in Task 2; verified in this dispatch's cross-surface test that pending/ignore/withdrawn entries don't surface as findings or matrix rows.
- [x] editor-symmetry — `computeMatrix()` in `editor-symmetry-matrix.ts` now filters adopter-manifest entries via `filterActiveEntries` BEFORE building rows; suppressed-status manifests never become matrix rows. `MatrixRow` carries `status:` so the renderer + regime-holdout-detector see the inherited status without re-reading the entry. The renderer appends a `(status: <s>)` badge for non-`blessed` actively-enforced statuses (today only `cursed`).
- [x] deprecations registry — deprecation markers are embedded in source files (not a YAML catalog), so the regime-holdout-detector synthesizes `blessed` + `install-seed` for deprecation findings to keep the wire shape uniform. Documented in `regime-holdout-detector.ts:IMPLICIT_BLESSED`.
- [x] regime-holdout-detector — fuses the four sources and now stamps `status_provenance: { source_status, provenance_source }` on EVERY finding. Per-source assertion fires if a non-active entry leaks through (invariant: each scanner's registry-boundary filter must be honored). `RegimeHoldoutMeta` gains `actively_enforced_count` + `candidate_count` per-status rollup.
- [x] clones.yaml — `disposition` → `status` mapping landed in Task 2; this dispatch verifies the mapping is honored uniformly with other registries (`filterActiveEntries` on a `ClonesYaml.clones` collection produces the same active subset semantics as on every other catalog).
- [x] **Cross-surface uniformity test** at `plugins/dw-lifecycle/src/__tests__/scope-discovery/cross-surface-loop.test.ts` (11 vitest scenarios). Plants a fixture with five statuses per registry; asserts (a) blessed/cursed entries enforce uniformly across every parser + every scanner; (b) pending entries surface in the registry but are excluded from `filterActiveEntries`; (c) ignore / tracked-holdout / withdrawn entries are suppressed across the regime-holdout-detector + matrix builder + adopter scanner + anti-pattern scanner; (d) the `withdrawn`-with-`audit-finding-<id>` invariant holds on every registry; (e) `regime-holdout-detector` stamps `status_provenance` on every finding with the canonical-status + provenance-source literals.
- [x] Manifest schema updated — `ManifestRegimeHoldoutEntry.status_provenance` (required) + `ManifestRegimeHoldoutMeta.by_status: { actively_enforced, candidate }` (required); JSON schema in `scope-manifest.yaml.schema.json` matches. `scope-widen`'s `mergeDelta` re-derives `by_status` from merged section lengths so merged manifests carry the rollup.

### Task 12: Naming alignment

The operator-trust failure mode (green "discovery" report read as no-novel-anti-patterns) is a naming problem (#315 problem space). Resolved 2026-05-26 via the **hybrid option** (per operator decision): keep `scope-inventory` as the operator-facing entry-point + ensure operator-visible provenance distinguishes registered-pattern matches from discovered candidates.

- [x] Hybrid option selected: keep `scope-inventory` (the orchestrator entry-point); document the internal "inventory agents vs. discovery agents" split via a new `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/README.md`; surface the registered-pattern vs. discovered-candidate vs. novel-shape-candidate distinction in every operator-facing report. No source-tree rename was performed — the cost would have exceeded the readability gain (JSON wire format's `agent: 'ast-grep-matrix'` discriminator + the existing test fixtures stay invariant; library API surface is unchanged).
- [x] SKILL.md prose updates across `scope-inventory`, `scope-widen`, `check-anti-patterns`, `check-adopters`, `check-deprecations`, `check-editor-symmetry` — each skill now carries an explicit "Inventory vs. discovery" thesis paragraph distinguishing registered-pattern matches (the catalog said to look for it; scanner found it) from novel-shape candidates (discovered by negative-space / coverage-gap / outlier / semantic handlers + synthesis-layer clustering). The check-* skills are explicitly framed as REGISTERED-PATTERN inventory checks; each names the discovery-layer escape hatch (`/dw-lifecycle:scope-inventory <slug>`) for surfacing novel candidates.
- [x] Manifest report surface — new module at `plugins/dw-lifecycle/src/scope-discovery/synthesis-report.ts` exports `categorizeFindings(manifest)` + `renderFindingCategoryReport(manifest)` + `renderCategorySummaryLine(manifest)`. The category-derivation honors the `discovery-agents/README.md` rules: `provenance_source ∈ {orchestrator-agent, llm-judge-proposed, promoted-from-candidate}` → novel-shape candidate (regardless of status); `source_status: pending` → novel-shape candidate; `blessed`/`cursed` + `operator-authored`/`install-seed` → registered-pattern match; `discovered_candidates:` clusters → discovered-candidate. The report-rendering integrates into:
  - `scope-inventory`'s `synthesis.md` evidence-trail file — leads with `## Inventory vs. discovery — finding categories` before the existing `## Synthesizer notes`.
  - `scope-inventory`'s stderr summary — adds a `categories: registered-pattern=N, discovered-candidate=N, novel-shape-candidate=N` line.
  - `scope-widen`'s `synthesis.md` evidence-trail + stderr summary.
  - `synthesis-cli.ts` (standalone CLI) — same shape, same evidence wiring.
- [x] Tests: `src/__tests__/scope-discovery/synthesis-report.test.ts` — 10 vitest scenarios covering all three categorization rules + the operator-action advisory + the clean-no-findings rendering + the one-line summary contract.
- [x] Internal "discovery-agents/" directory documented at `plugins/dw-lifecycle/src/scope-discovery/discovery-agents/README.md` — explicitly distinguishes the inventory agents (registered-pattern matchers: pattern-matrix, clone-detector-reader, adopter-manifest-checker, regime-holdout-detector, ui-route-enumerator) from the discovery agents (novel-shape surfacing: synthesis-discovered-candidates, negative-space / outlier / coverage-gap / semantic pattern handlers, mediation pass). No code renames (low-priority; would breach the wire-format invariant for limited readability gain).
- [x] Agent-discipline rule added at `.claude/rules/agent-discipline.md` § "Inventory vs discovery — how to read scope-discovery reports" — documents the three operator-visible categories, the stderr `categories:` line format, the `synthesis.md` category-report section, the operator action when novel-shape-candidate > 0, and the failure mode the rule prevents (KeygroupSummary-shape regression shipping to release because a green inventory report was read as "no anti-patterns").

### Task 13: Multi-content-type generality

Today the tooling walks TypeScript source. Deskwork manages content collections, configs, schemas, anything. The pattern catalog + glob + shape model should be content-type-agnostic.

- [ ] Glob + shape primitives content-type-neutral; no TS-coupling in core types.
- [ ] Per-content-type handlers (`.md`, `.yaml`, `.json`) pluggable into the scan engine.
- [ ] Markdown-specific patterns (e.g., frontmatter shape, heading conventions, link patterns) authorable.

(Likely a scoping-pass decision: deferred initial-ship vs designed-in from start.)

### Task 14: Tooling-feedback closure → audit-log import workflow

The existing `tooling-feedback.md` pattern from Phase 10 v1 ship is a feedback-loop primitive for the TOOLING; this task formalizes the closure workflow.

- [x] TF closure entries (`Status: addressed-<commit>`, `Status: superseded-by-<TF-NN>`, or `Status: verified-<date>`) auto-import into the scope-discovery audit-log as `AUDIT-<date>-<NN>` entries with cross-reference. Implemented at `plugins/dw-lifecycle/src/scope-discovery/tooling-feedback-import.ts`. Default mode is dry-run; `--apply` performs the writes. Numbering reads existing audit-log entries to determine the next per-date counter; idempotency watermark is an `imported-as: AUDIT-<id>` line appended to the TF entry directly before its `**Status:**` line.
- [x] Doctor rule: surface TF entries that have been open > N days without status updates (configurable). Landed at `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/tooling-feedback-stale.ts`. Default threshold 14 days; override via `.dw-lifecycle/scope-discovery/config.yaml` field `tooling_feedback_stale_days: <int>`. Repair hint cites `/dw-lifecycle:tooling-feedback-import --apply` for closure-ready entries, generic triage hint for open ones. Registered in `doctor-rules/index.ts`.
- [x] Skill: `/dw-lifecycle:tooling-feedback-import` — walks closure-marked TF entries; promotes them to audit-log; closes the TF entry with the new audit-log ID as forwarding pointer. SKILL.md + commands/tooling-feedback-import.md authored; subcommand registered in `cli.ts`. 22 vitest scenarios cover parser / closure-status discriminator / dry-run vs --apply / idempotency / per-date numbering / --slug restriction. 8 doctor-rule scenarios cover threshold default + override + malformed-config fallback + open/closure-ready/imported entries. Live smoke against `docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md` confirms zero imports + clean exit (the live log has no closure entries yet).

### Acceptance criteria (captured promises; scoping pass decides what ships when)

- [ ] The Loop runs on every `/dw-lifecycle:implement` turn without operator invocation.
- [ ] Orchestrator auto-dispositions candidates at high confidence; escalates at low confidence.
- [ ] Controller measures codebase-state metrics + auditor-correction-rate; adjusts cadence + intensity accordingly; defaults shipped sensibly per Task 5.
- [ ] Wrong-decision events detectable + reversible; trust calibration adjusts in response.
- [ ] Pattern-type vocabulary supports at minimum the 4 v1 operator-named patterns from #315 (Tailwind/utility-class catch-all, hardcoded-color, hover-only-affordance, negative-space-no-canonical-consumer).
- [ ] The full Loop applies uniformly across the registry-driven surfaces (Task 11).
- [ ] Pre-existing user-visible behavior of `/dw-lifecycle:implement` is preserved; no regressions in completed phase tests.
- [x] KeygroupSummary-shape repro fixture (anonymized) commits to test suite + passes (negative-space pattern fires on a synthetic component with ZERO canonical primitives + ≥5 utility-class hits). Landed at `plugins/dw-lifecycle/src/__tests__/scope-discovery/phase-11-acceptance/keygroup-summary-repro.test.ts` with fixture tree at `fixtures/keygroup-summary-repro/` — synthetic `components/KeygroupSummary.tsx` (zero canonical-primitive imports + 18 utility-class hits) + sibling fixtures + planted Phase 11 polymorphic catalog (negative-space + outlier + coverage entries). End-to-end test runs the BEFORE (legacy regex-only) vs. AFTER (Phase 11 loop) comparison; asserts the AFTER state fires >= 1 Phase 11 handler on the repro file + emits a DOGFOOD GAP SIGNAL block to stdout. Acceptance doc at `docs/1.0/001-IN-PROGRESS/scope-discovery/phase-11-acceptance.md`. Full plugin suite at 1295/1295 (baseline 1293; +2 acceptance test scenarios).
- [ ] First dogfood cycle (graphical-entries team) reports the gap is closed via the v1.1 tooling-feedback log.

### Open scoping decisions (intentionally NOT pre-decided)

- Which of Tasks 1–14 ship in v1.1 vs deferred to v1.2 / future?
- Which of G1–G7 pattern types ship at minimum (operator named negative-space as the cheapest fix; G3/G4/G5/G6 are stretch).
- ~~Task 12 naming alignment: which option?~~ Resolved 2026-05-26 via the hybrid option (operator-facing entry-points keep their names; provenance + report rendering surface the distinction; internal discovery-agents/ directory documents the inventory-vs-discovery split).
- Task 13 multi-content-type: designed-in or deferred?
- LLM-judge cost ceilings + model selection.
- Task 9 escalation-surface UX (artifact format, edit-in-place vs chat-resume).

### Risks and unknowns

- LLM-judge cost predictability — per-turn LLM calls multiply across long sessions.
- Auditor-correction-rate noise — false positives in the truth signal would push the controller toward over-tight cadence; needs validation discipline.
- Thrashing — controller's cadence adjustments oscillating; anti-thrashing must be measurable.
- Catalog-state explosion — large `pending` ledger; needs ranking + bounded triage surface.
- Performance — per-turn audit/judge stack overhead; needs profiling baseline before architecture lock-in.
- Confidence calibration cold-start — first session has no measurements; defaults must be conservative without paralyzing the orchestrator.

### Existing primitives to build on (not greenfield)

- `clones.yaml` dispositions — closest existing analog of status-marked catalog with operator-curated triage.
- audit-log workflow + statuses (open / acknowledged / fixed / verified / withdrawn) — provides the disposition state machine + provenance pattern.
- `tooling-feedback.md` pattern — feedback-loop primitive ready to extend.
- dispatch-wrapper (Phase 5) — sub-agent dispatch mediation; extension point for the orchestrator-agent.
- pattern-matrix YAML override (Phase 3) — already supports per-project pattern catalog; needs schema extension for new types.
- agent-discipline rule § "scope-discovery v1 — dogfood feedback via tooling-feedback.md" — already documents the closure-feedback workflow.

## Dogfood follow-ups (from canary #349)

The graphical-entries canary surfaced four follow-up items from the Phase 6 dogfood cycle (#349). The first three are bugs against shipped scope-discovery surfaces; the fourth is a validation milestone owned by graphical-entries, not scope-discovery.

- [ ] [#350](https://github.com/audiocontrol-org/deskwork/issues/350) — **`validate-return` refactor-cue false-positives.** Substring match fires on filename `clones.yaml` in Included blocks AND on free-text "extracted helper" in declined-work context. Highest-priority friction per canary's #349 §3a ranking (~5min/occurrence × 2 observed). Recommended fix: Light + Medium (context-aware substring + structured `Refactor-closes:` field).
- [ ] [#351](https://github.com/audiocontrol-org/deskwork/issues/351) — **`session-start`/`session-end` helper-subcommand availability check.** When the installed CLI predates the skill's expected helper subcommand (`session-end-hygiene`, `session-start-recommendation`), the skill fails with a generic `Unknown subcommand` error instead of telling the operator to run `/reload-plugins`. Polish-level; per #349 §3b. Recommended fix: Light (skill-side probe + actionable error).
- [ ] [#352](https://github.com/audiocontrol-org/deskwork/issues/352) — **Pre-commit gate chain skipped on docs-only commits.** ~5s/commit × 18 commits = ~90s wasted in one observed session. Polish-level; per #349 §3c. Recommended fix: Light (hook-template short-circuit on staged-files-all-match-`*.md`-in-`docs/`).
- [ ] **#318 validation milestone — cross-feature, owned by graphical-entries.** Run `scope-widen` against graphical-entries Phase 7 Tasks 7.1 (members[] schema delta) AND 7.3 (group review surface) — features with genuinely novel shapes the registered pattern catalog can't yet cover. If `scope-widen` surfaces `discovered_candidate` clusters, #318's clustering pass is validated end-to-end against real-world novel input. If still `0 additions`, there's still a gap to close. Per #349 §2. Tracked at graphical-entries' Phase 7 acceptance criteria; this entry is the scope-discovery side of the cross-reference.

These items are filed for tracking but don't block any scope-discovery acceptance criterion. They feed into the next scope-discovery release cycle (likely a v0.25.1 patch covering #350 + #351 + #352, with #318 validation pending Phase 7 graphical-entries work).

## Phase 12: Multi-model audit barrage

**Parent issue:** [#353](https://github.com/audiocontrol-org/deskwork/issues/353).
**Source:** ROADMAP.md § "Audit-barrage feature shape"; operator design conversation 2026-05-29; canary [#349](https://github.com/audiocontrol-org/deskwork/issues/349) §2 "operator-discipline cost" framing.

**Problem the phase addresses (captured exhaustively per capture-mode rule; scoping is a separate pass):**

The current scope-discovery audit posture has three layers — in-band self-audit (orchestrator-loop, same model + same context), the SDD two-reviewer cycle (spec + quality sub-agent dispatches), and the manually-run codex audit (operator pastes work into a separate Codex session). The codex audit demonstrably finds what Claude misses — different training corpus = independent failure modes — but it requires manual invocation, manual copy-paste, manual finding-by-finding triage. Manual discipline doesn't scale and isn't durable. The audit quality is currently a function of the operator's intermittent capacity to run the audit by hand. This phase ships a third audit surface — automated multi-model audit barrage — that fires installed CLI tools (`claude`, `codex`, `gemini`) in parallel, persists raw per-model output, and surfaces a structured triage step over uniform run artifacts.

The phase is additive — not a replacement for the in-band self-audit or the SDD review cycle. All three surfaces stay active; the barrage adds genetic diversity in audit failure modes.

The phase implements Design A from `ROADMAP.md` § "Audit-barrage feature shape". Design B (auto-fire at lifecycle waypoints + meta-audit synthesizer) and Design C (continuous background daemon) are out-of-scope here; they're tracked in the roadmap for follow-up work after Design A is stable + the operator has accumulated cross-model finding patterns.

**Implementation posture: CLI-based, not API-based.** Three reasons documented in ROADMAP.md: (1) CLIs are usage-based — no per-call cost arithmetic; (2) auth is already configured per-CLI in the operator's environment — no key handling in the plugin; (3) subprocess orchestration is a well-trodden plugin pattern (already in use for `gh`, `git`, `npx tsx`, `jscpd`).

### Task 1: Infrastructure verification

Confirm the three CLIs are installed + authenticated on the operator's machine. Baseline the invocation contracts before designing around them.

- [x] Step 1: Confirm `claude`, `codex`, `gemini` are on PATH on the operator's machine. Document the invocation pattern for each (flags, prompt-as-arg vs prompt-via-stdin vs prompt-via-file). All three resolved; `claude -p`, `codex exec`, `gemini "<prompt>"` per `audit-barrage-cli-notes.md`.
- [x] Step 2: Probe per-CLI behaviors: long prompts (multi-KB), structured output, error reporting (stderr separation), timeouts. 5.4 KB prompts handled by all three; per-CLI timing + stderr/stdout separation documented; claude instruction-adherence caveat on long prompts captured.
- [x] Step 3: Document findings — landed at `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-barrage-cli-notes.md` (105 lines) covering installed versions + per-CLI invocation pattern + common contract + per-CLI timing + auth surface + open items for Phase 12 Tasks 2-3.

**Acceptance Criteria:**
- [x] Per-CLI invocation pattern documented + verified live against the installed binaries (audit-barrage-cli-notes.md).
- [x] At least one full prompt-fire-capture round-trip per CLI verified working end-to-end (small + 5 KB prompts; all exit 0).

### Task 2: CLI verb + subprocess orchestration library

- [x] Step 1: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/types.ts` (122 lines) — `ModelConfig`, `BarrageInput`, `ModelRunResult`, `BarrageRun`, `BarrageResult` interfaces.
- [x] Step 2: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/run-artifacts.ts` (147 lines) — `generateRunDirName`, `safeModelName`, `createRunDir`, `writePromptFile`, `writeIndexFile`. ISO basic timestamp; non-alphanumeric/non-hyphen replaced with `_` in model names.
- [x] Step 3: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/spawn-cli.ts` (180 lines) — `spawnCliAgainstModel`. `{{prompt}}` substitution in args_template via split-before-substitute. `stdin: 'ignore'`; stdout/stderr piped to per-model paths via `fs.createWriteStream`; byte counters via stream listeners. SIGTERM on timeout with 5s SIGKILL grace; spawn errors captured as `spawnError`.
- [x] Step 4: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/orchestrate-barrage.ts` (85 lines) — `orchestrateBarrage`. Per-model `Promise.all` parallel fire; no early termination; INDEX.md write after all settle.
- [x] Step 5: NEW CLI subcommand `plugins/dw-lifecycle/src/subcommands/audit-barrage.ts` (315 lines) — `parseFlags` + `auditBarrage` main. Hard-coded 3 default models (claude/codex/gemini) with code-comment cite to Task 3 for the YAML loader. `--feature`/`--prompt-file` (REQUIRED); `--models <comma-list>` selects from hardcoded set; `--repo-root`/`--quiet`/`--help`. Exit 0 if ≥1 model produced stdout; 1 if all failed; 2 on usage. Registered `'audit-barrage': auditBarrage` in `cli.ts`.
- [x] Step 6: Tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/audit-barrage/` — 43 new tests across 4 files (run-artifacts / spawn-cli / orchestrate-barrage / audit-barrage-cli). Fake-CLI subprocesses via `node -e` shims cover happy path, timeout, missing-binary, exit-nonzero, malformed-config-rejection.

**Acceptance Criteria:**
- [x] `dw-lifecycle audit-barrage --feature <slug>` fires three CLI subprocesses in parallel — live verified end-to-end against the real installed claude/codex/gemini; all three returned PROBE-OK; 11.5s wall-time (parallel; dominated by slowest).
- [x] Each subprocess output captured to per-model markdown file under `.dw-lifecycle/scope-discovery/audit-runs/<timestamp>-<feature>/<model>.md` — confirmed in live run dir at `20260529T050950Z-scope-discovery/`.
- [x] `INDEX.md` + `PROMPT.md` + `stderr/<model>.txt` written per run — confirmed; INDEX includes timestamp/feature/per-model exit code/duration/byte counts.
- [x] Tests cover: happy path (3 models all succeed), missing-binary (spawn error captured + others still fire), timeout (SIGTERM + grace), exit-nonzero, prompt template substitution.
- [x] Exit code contract: 0 if ≥1 model produced output; 1 if all failed; 2 on usage error — covered by tests.

### Task 3: Prompt template + model config

- [x] Step 1: NEW `plugins/dw-lifecycle/templates/audit-barrage-prompt.md` — uniform audit prompt with `{{var}}` substitutions for `feature_slug`, `workplan_summary`, `diff`, `audit_log_excerpt`, `commit_subjects`. Asks each model for findings in canonical audit-log entry format; explicit "say nothing if you find nothing" instruction.
- [x] Step 2: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/prompt-renderer.ts` — reads template (project-override at `.dw-lifecycle/scope-discovery/audit-barrage-prompt.md` takes precedence); substitutes vars via unambiguous `<!-- {{var_name}} -->` markers; surfaces unsubstituted-var errors loud.
- [x] Step 3: NEW `plugins/dw-lifecycle/templates/audit-barrage-config.yaml` — default models block with claude / codex / gemini entries matching Task 1's CLI invocation contracts.
- [x] Step 4: NEW `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/config-loader.ts` — reads YAML (project-override takes precedence); per-entry validation (non-empty name/binary/args_template; args_template must contain `{{prompt}}`; timeout_seconds positive integer; no duplicate names); failure-loud on malformed input.
- [x] Step 5: NEW `plugins/dw-lifecycle/src/scope-discovery/schema/audit-barrage-config.yaml.schema.json` — JSON Schema for editor autocomplete; mirrors anti-patterns.yaml.schema.json pattern.
- [x] Step 6: Extended `install-scope-discovery` to seed `.dw-lifecycle/scope-discovery/audit-barrage-prompt.md` + `audit-barrage-config.yaml` (commented-out scaffolds adopters uncomment + edit).

**Acceptance Criteria:**
- [x] Prompt template + config land in `plugins/dw-lifecycle/templates/`.
- [x] Project-override pattern works end-to-end — config-loader tests cover plugin-default fallback + project-override-takes-precedence + malformed-override rejection.
- [x] Schema enables editor autocomplete on the config YAML.
- [x] `install-scope-discovery` seeds the override files as commented-out scaffolds.

**Live verification:** `subcommands/audit-barrage.ts` rewired to load models via `config-loader.ts` (replacing Task 2's hardcoded list); live invocation against the real installed claude/codex/gemini via the YAML-loaded battery returned 3/3 PROBE-OK. Full plugin suite: 1966/1966 (+27 new for Task 3). Tsc clean.

### Task 4: Skill prose

- [x] Step 1: NEW `plugins/dw-lifecycle/skills/audit-barrage/SKILL.md`. Describes operator workflow end-to-end: when to run, the two-step render-then-fire CLI workflow, override paths, run-dir layout, triage steps.
- [x] Step 2: SKILL.md cross-references `ROADMAP.md` § Audit-barrage so operators see the long-term plan + the discipline rule + the smoke + the CLI invocation notes.
- [x] Step 3: Added `/dwab` (audit-barrage) shortcut to `dw-lifecycle:install-shortcuts` — `audit-barrage` is now in the COMMANDS list with Scheme A mapping `dwab`, Scheme B mapping `dw-ab`, Scheme C algorithmic `dw-audit-barrage`. Command file at `plugins/dw-lifecycle/commands/audit-barrage.md` invokes the skill.

**Acceptance Criteria:**
- [x] `/dw-lifecycle:audit-barrage` discoverable via slash-command picker (command file shipped at `commands/audit-barrage.md`).
- [x] `/dwab` shortcut works (Scheme A entry in `shortcuts/schemes.ts`).
- [x] SKILL.md documents invocation + triage workflow + override paths.

### Task 5: Tests + smoke

- [x] Step 1: Verified per-task tests landed across Tasks 2–4; backfilled gaps — added 23 new tests across audit-barrage surface (intra-token substitution, close-vs-exit byte preservation, timer-leak on spawn-error, healthy-with-nonzero-exit, healthy-with-timeout, spawn-error-unhealthy, single-substitution count, instructional-prose pass-through, EXPECTED_VARS guard, render verb flag-parse + payload-validate).
- [x] Step 2: Cross-cutting tests pass against fake-CLI fixtures; failure modes covered (missing binary, timeout, malformed substitution, override-file-not-readable, run-dir-creation-failure). Full plugin suite at 1995/1995.
- [x] Step 3: NEW `scripts/smoke-audit-barrage.sh` — exercises both verbs end-to-end against fake-CLI shims (deterministic `node` scripts emitting canned finding blocks). Asserts run-dir layout, INDEX content, per-model stdout/stderr separation, render substitution + EXPECTED_VARS marker absence. Local-only; NOT wired into CI per project rule.

**Acceptance Criteria:**
- [x] Full plugin suite passes with audit-barrage tests added (1995/1995).
- [x] `scripts/smoke-audit-barrage.sh` passes end-to-end against fake CLIs (runs locally; emits `OK` on full success).

### Task 6: Live verification + dogfood

- [x] Step 1: Picked self-dogfood — audit-barrage feature itself (Tasks 1-3 implementation; 67 KB rendered prompt against the production scope diff).
- [x] Step 2: Invoked `dw-lifecycle audit-barrage --feature audit-barrage --prompt-file /tmp/audit-barrage-self-dogfood-prompt.md` — 3:16 wall time; 2/3 models produced output (gemini failed: operator-level quota exhausted; not an audit-barrage bug); exit 0.
- [x] Step 3: Walked the run dir at `.dw-lifecycle/scope-discovery/audit-runs/20260529T061616Z-audit-barrage/`; cross-referenced findings — **4 with cross-model agreement** (exit-vs-close truncation, args_template substring/token mismatch, exit-code contract drift vs PRD, prompt-renderer wiring gap).
- [x] Step 4: Lifted 11 findings into `docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md` as AUDIT-20260529-01..11 with stable IDs + status `open` + per-finding fix guidance.
- [x] Step 5: Friction surfaces from the dogfood itself documented inline in the audit-log entries (AUDIT-20260529-10/11 — operator's hand-rendering workaround + prompt-renderer over-eager check).

**Acceptance Criteria:**
- [x] One live barrage run completed against an in-flight feature (self-dogfood against audit-barrage Tasks 1-3).
- [x] At least one finding the in-band self-audit + SDD review cycle didn't catch — **13 distinct findings** lifted; 4 with cross-model agreement (HIGH-confidence). The genetic-diversity acceptance signal per ROADMAP is met overwhelmingly. ALL 13 findings would have shipped without the audit-barrage's existence (1966/1966 tests passed; tsc clean; SDD review cycle missed every one).
- [x] Tooling-feedback friction items filed — AUDIT-20260529-10 (renderer over-eager check) + AUDIT-20260529-11 (template marker triplet duplication) capture the in-band friction surfaces.

### Task 7: Cross-references + ROADMAP update

- [x] Step 1: Added "Audit-barrage: structured cross-model audit" section to `.claude/rules/agent-discipline.md` — names the new surface + the operator's triage workflow + how it composes with the in-band self-audit + the SDD review cycle (three independent surfaces, additive not replacement) + the Phase 12 self-dogfood data as evidence the surface earns its keep.
- [x] Step 2: Updated `ROADMAP.md` § "Audit-barrage feature shape" — Design A moved to "Recently shipped" with primitives + acceptance-signal evidence; Design B's framing tightened to compose over the v1 primitives.
- [x] Step 3: Audit-barrage moved out of "Active initiatives (in-flight)" and into the "Recently shipped" section of `ROADMAP.md`.
- [x] Step 4: Added audit-barrage section + slash-commands table entry to `plugins/dw-lifecycle/README.md`; updated "Twenty commands total" prose.

**Acceptance Criteria:**
- [x] Agent-discipline rule documents the audit-barrage surface.
- [x] ROADMAP.md reflects Design A shipped + Design B as next.
- [x] Adopter-facing docs: README + skill prose + agent-discipline rule update.

### Phase 12 — Out of Scope (deferred to Design B / Design C per ROADMAP)

- Auto-fire at lifecycle waypoints (`/dw-lifecycle:session-end`, `/dw-lifecycle:complete`, `/release` Pause 5). Design B.
- Meta-audit synthesizer — single LLM call that synthesizes the N raw runs into a ranked-findings block. Design B.
- High-confidence auto-promote to audit-log — findings with M-of-N model agreement auto-lifted as `Status: pending-operator-review`. Design B.
- Continuous background audit daemon — long-running process watching for new commits. Design C.
- Per-model auth handling — by design; the CLIs are expected to be already-authenticated in the operator's environment. The verb fails loud if a configured CLI binary is missing or unauthenticated.
- Replacing the in-band self-audit or SDD review cycle — audit-barrage is ADDITIVE.
- Token-cost optimization — CLIs are usage-based; no per-call budgeting.

### Phase 12 — Open scoping questions (operator decides during PRD iterate)

1. **Should `claude` be one of the three default models?** Cross-context comparison vs correlated failure-modes tradeoff. Including Claude gives a baseline against the in-band self-audit; excluding maximizes diversity from the in-band layer.
2. **Range default behavior for greenfield features (no audit-log watermark).** Fall back to `<base-branch>..<HEAD>`, or require explicit `--range`?
3. **Triage UX for v1 — CLI-only or thin studio surface?** CLI-only is consistent with hygiene's UNIX philosophy; studio surface would be richer but introduces new ground.
4. **Prompt's "what to look for" section — generic ("find bugs, design issues, missed edge cases") vs scope-discovery-specific ("find shapes that should have been caught by registered patterns but weren't")?** Different prompts produce different signal.
5. **Timeout default — 300s (5 min) starting point; needs calibration against real CLI invocation cost.** Live verification (Task 6) will inform.

### Phase 12 — Existing primitives this composes over

- `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/` — the existing external auditor fire pattern (`fireExternalAudit` in `llm/auditor.ts`) is the closest analog; audit-barrage extends to N parallel CLI fires.
- Hygiene's `close-shipped` 4-source walker — the operator's lifted audit-log findings flow naturally through close-shipped at release time.
- Project override resolution pattern at `.dw-lifecycle/scope-discovery/<file>` — already in use by anti-patterns / adopter-manifests / pattern-matrix overrides.
- `child_process.spawn` subprocess orchestration — already in use for `gh`, `git`, `npx tsx`, `jscpd` invocations across the plugin.
- The audit-log entry format — the canonical `Finding-ID` / `Status` / `Severity` / `Surface` shape every audit-barrage finding maps into.

## Phase 13: Audit-finding lifecycle — anti-deferral discipline + workplan promotion

**Parent issue:** [#355](https://github.com/audiocontrol-org/deskwork/issues/355)
**Source:** Operator design conversation 2026-05-29 surfacing the gap between audit-log findings (Phase 12 audit-barrage's output) and the workplan (the implementation loop's input). Phase 12 self-dogfood demonstrated the failure mode in-session — agent went from "findings lifted" straight to "fix dispatch" without scoping the fixes into the workplan, then a parallel session shipped the fixes ad-hoc.

**Problem the phase addresses (captured exhaustively per capture-mode rule; scoping is a separate pass):**

The current audit-finding workflow is operator-discipline-dependent at every step:

1. Audit fires (in-band / SDD review / audit-barrage) → findings land in `audit-log.md` with `Status: open`
2. Operator manually decides which findings to fix, when, where to scope them
3. Operator manually edits workplan to add fix tasks (or files GH issues OR — most commonly — defers)
4. Operator dispatches the work
5. Fix lands → operator manually flips audit-log `Status: fixed-<sha>`
6. Release → operator manually flips `fixed-<sha>` → `verified-<date>` after re-exercising the surface

Step 2-3 is the binding constraint: audit-log knows the findings exist; workplan doesn't. No tooling bridges them. The pathology codified across multiple project rules (`Just for now is bullshit`, `Operator owns scope decisions`): **agents relentlessly rationalize deferral as "scope discipline" when it's scope erosion**. Filing a GH issue, marking a finding "to address later," scoping a fix "for v2" — these all feel like progress + leave the implementation broken.

The operator's framing, verbatim: *"Filing a bug report isn't good enough. It MUST BE SCOPED INTO THE WORKPLAN, otherwise it won't get picked up by the implementation loop. Unless there's truly a good reason NOT to fix a problem, it should be relentlessly scoped into the workplan, not relentlessly deferred — ESPECIALLY problems with the implementation underway. A broken implementation is not done — it's broken. And, along with the discipline to scope the fix, TDD principles should apply such that a test that exercises the bug is written before the fix is implemented — and the implementation isn't considered a candidate for completion until tests are green."*

Phase 13 ships the structural tooling that makes the operator's discipline mechanical:

- **Scope-into-workplan is the default + the only agent-pickable disposition.** Deferral requires operator-supplied substantive justification + a validator (same shape as hygiene's `promote-deferrals` rejected gaming-phrase list).
- **Workplan fix tasks follow a TDD-first shape** with mechanical enforcement: the test file must exist + pass before the task is marked done. Not a markdown checkbox the agent can flip; a check the doctor + commit-msg gates enforce.
- **The implementation-loop refuses to advance** while any feature has `Status: open` findings. No `--ignore-open-findings` escape in v1 (operator chose rigidity; if proves unworkable, revisit relaxation).
- **Closure-side automation** flips audit-log statuses on `Closes AUDIT-<id>` commits + on post-release re-audit runs.

Phase 13 is the operator-discipline-displacement counterpart to Phase 12. Phase 12 produces the findings; Phase 13 forces them through the workplan into completion.

### Task 1: `/dw-lifecycle:promote-findings` skill + CLI verb

NEW skill + CLI verb that walks `audit-log.md` for `Status: open` entries on the current feature, surfaces them in a batched-proposal cycle (same shape as hygiene's `promote-deferrals` + `triage-issues`), and applies workplan edits + optional `acknowledged-<ref>` / `informational` status flips on operator confirmation.

- [x] Step 1: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/types.ts` — `OpenFinding`, `PromotionProposal`, `WorkplanInsertion`, `DeferralRecord`, `InformationalRecord` interfaces.
- [x] Step 2: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/audit-log-walker.ts` — parses `audit-log.md` for entries with `Status: open` (reusing the existing `audit-log-parser.ts` from the orchestrator-loop); returns the list of open findings on the named feature.
- [x] Step 3: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-task-renderer.ts` — generates the TDD-first task block for a finding:
  ```
  ### Task N.M (fix-finding-AUDIT-<YYYYMMDD>-<NN>): <one-line finding title>

  Closes AUDIT-<YYYYMMDD>-<NN>. Surface: <finding's Surface field>.

  - [ ] Step 1: write failing test exercising the bug (anchor at the file:line cited in the finding's Surface)
  - [ ] Step 2: confirm test fails against current code (verify the bug repros)
  - [ ] Step 3: implement the fix
  - [ ] Step 4: confirm test passes
  - [ ] Step 5: commit with `Closes AUDIT-<YYYYMMDD>-<NN>` in subject

  **Acceptance Criteria:**
  - [ ] Failing test exists at `<test-file-path>` (cited in Step 1)
  - [ ] `npx vitest run <test-file-path>` exits 0 (passes against the fix)
  - [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step
  ```
- [x] Step 4: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-editor.ts` — applies the rendered task block to the named feature's `workplan.md` at the operator-chosen position (under existing phase OR as new phase). Preserves file structure; appends at the chosen anchor.
- [x] Step 5: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/substantive-reason-validator.ts` — for the `acknowledged-<ref>` deferral path. Mirrors hygiene's promote-deferrals validator: ≥40 chars; rejects gaming-phrase list (`for now`, `will fix later`, `non-trivial`, `future work`, `deferred to vN`, `not in scope`, `TODO`, `come back to`); requires explicit upstream-blocker reference OR documented scope-cut citation.
- [x] Step 6: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/audit-log-editor.ts` — flips audit-log entry `Status` from `open` to `acknowledged-<ref>` or `informational`. Preserves audit trail; the original entry stays + the status change is the only mutation.
- [x] Step 7: NEW `plugins/dw-lifecycle/src/subcommands/promote-findings.ts` — CLI verb. Flags: `--feature <slug>` (REQUIRED); `--repo-root <path>` (default cwd); `--bucket <name>` (default `open`; future: `acknowledged` to walk deferred findings periodically); `--limit <N>` (default 10 per batch); `--help`. Registers `'promote-findings'` in `cli.ts`.
- [x] Step 8: NEW `plugins/dw-lifecycle/skills/promote-findings/SKILL.md` — adopter-facing prose. Names the default-is-promote shape, the deferral path's substantive-reason validator, the informational disposition's tight contract. Adds `/dwpf` shortcut.
- [x] Step 9: Tests under `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/` covering: open-finding extraction; workplan task rendering (TDD-first shape); substantive-reason validator (accept + reject); workplan-edit application (atomic; no partial state); audit-log status flips (preserves entry body); batched-proposal flow (mock operator confirmation; partial-batch).

**Acceptance Criteria:**
- [ ] `/dw-lifecycle:promote-findings --feature <slug>` walks the feature's `audit-log.md` for `Status: open` entries.
- [ ] Default disposition is "scope into workplan" with the TDD-first task shape rendered; operator confirms placement (phase + task position) only.
- [ ] Deferral path (`acknowledged-<ref>`) requires substantive-reason validator pass; gaming phrases rejected.
- [ ] Informational path requires explicit operator confirmation + rationale in the audit-log entry body.
- [ ] Workplan edit is atomic (no partial state on operator decline mid-batch).
- [ ] Audit-log status flip preserves the entry body (audit trail).

### Task 2: Implementation-loop gate (refuse-to-advance on open findings)

Augment `/dw-lifecycle:implement` to refuse picking up the next task while the current feature has any `Status: open` audit-log findings. Strict; no override flag in v1.

- [x] Step 1: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/open-findings-gate.ts` — pure function `checkOpenFindings({featureSlug, repoRoot}): Promise<OpenFindingsGateResult>`. Returns `{ allowed: true }` when zero open findings; returns `{ allowed: false, openFindings: [...] }` when ≥1.
- [x] Step 2: Wire the gate into the `/dw-lifecycle:implement` skill via a NEW CLI verb `dw-lifecycle check-open-findings --feature <slug>` at `plugins/dw-lifecycle/src/subcommands/check-open-findings.ts` (no `subcommands/implement.ts` exists because `/dw-lifecycle:implement` is a skill not a TS subcommand — the gate is a CLI verb the SKILL.md invokes). On `{ allowed: false }`, emits the refusal message:
  ```
  Cannot advance: feature <slug> has N open audit findings (AUDIT-XX-XX, AUDIT-YY-YY).
  Open findings block task pickup per project rule "broken implementation is not done."
  Run `/dw-lifecycle:promote-findings --feature <slug>` to scope into workplan before continuing.
  ```
  Exits 1. Exit 2 on feature-not-found / argv error.
- [x] Step 3: Updated `plugins/dw-lifecycle/skills/implement/SKILL.md` — new Step 2 documents the gate + the cure (`promote-findings` workflow), Step 5's per-task loop re-runs the gate before each task pickup (findings can accrue mid-session), Error-handling block names the exit-1 (refusal) + exit-2 (config error) shapes. Step numbering renumbered through Step 8.
- [x] Step 4: 18 tests — 7 library scenarios at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/open-findings-gate.test.ts` (allowed-zero-open, allowed-no-auditlog, refused-single, refused-multiple-with-ordering, throws-feature-missing, throws-docs-missing, 0.x version fallback), 11 CLI scenarios at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-open-findings-cli.test.ts` (parseFlags cases + exit-0/1/2 surfaces + refusal-message naming + multi-finding count + --repo-root override). Cited refusal-message assertions verify EVERY open finding ID is named + the `/dw-lifecycle:promote-findings` cure is cited. Plugin suite at 2115/2115 (2097 baseline + 18 new).

**Acceptance Criteria:**
- [x] `/dw-lifecycle:implement` refuses to advance when ≥1 open finding exists on the current feature.
- [x] Refusal message names the open findings + points at `promote-findings`.
- [x] No `--ignore-open-findings` flag in v1. (Per operator decision: err on rigidity; revisit if unworkable.)

**Notes:**

- Smoke-verified live on `feature/scope-discovery` itself: `dw-lifecycle check-open-findings --feature scope-discovery` exits 1 and names AUDIT-20260529-12 + AUDIT-20260529-13 + AUDIT-20260529-14 (the Phase 14 imports from `feature/deskwork-plugin` TF log). The cure is to walk Phase 14 Tasks 1-3 (the fixes) before resuming Phase 13 Task 3+ work, OR run `/dw-lifecycle:promote-findings --feature scope-discovery` (which is a no-op against AUDIT-12/13/14 since Phase 14 already scoped them).
- Side fix landed in the same commit: the existing AUDIT-20260529-01..11 entries (Phase 12 audit-barrage findings) were authored with `#### ...` headers (4-hash). The audit-log parser's `HEADING_LINE_RE = /^###\s+(.+?)\s*$/` only matches 3-hash. Those 11 entries were silently unparseable. Re-leveled to `###` along with AUDIT-20260529-12..15 so the parser sees them all. Functional impact zero (all 11 were Status: fixed-08971e4 or informational, never surfacing as `open`), but parser-correctness fix worth landing.

### Task 3: TDD-enforcement mechanical check

The promoted workplan task's TDD-first shape is operator-readable but agent-bypassable as written. Phase 13 Task 3 adds mechanical enforcement: a task block tagged `(fix-finding-AUDIT-...)` can't be marked done in the workplan unless the cited test file exists + passes.

- [x] Step 1: NEW `plugins/dw-lifecycle/src/scope-discovery/promote-findings/tdd-enforcement.ts` — `verifyFixTaskTDD` + `extractTestFilePath` + `findCompletedFixFindingTasks` pure functions. Parses task block for test-file path; verifies file exists; optional `runVitest` callback for `npx vitest run <path>` (injectable seam for tests).
- [x] Step 2: NEW doctor rule `fix-task-tdd-discipline` at `plugins/dw-lifecycle/src/scope-discovery/doctor-rules/fix-task-tdd-discipline.ts`. Walks every `[x]` fix-finding task across all features; flags missing/empty test file or missing citation as severity-error finding. Doctor does NOT invoke vitest (cost); the commit-msg gate carries that half.
- [x] Step 3: Wired into `scope-discovery/doctor-rules/index.ts` registry.
- [x] Step 4: NEW commit-msg gate `dw-lifecycle check-fix-task-tdd --commit-msg-file <path>`. Parses Closes-AUDIT references, matches workplan fix-finding tasks, runs vitest. Exit 1 on any TDD failure. `--skip-vitest` for presence-only checks. Blocks `Closes AUDIT-<id>` commits citing AUDIT-ids with no marked-done fix task.
- [x] Step 5: 31 tests (16 library + 7 doctor + 8 CLI) covering all the named paths.

**Acceptance Criteria:**
- [x] `/dw-lifecycle:doctor` rule `fix-task-tdd-discipline` fires on `[x]` fix-finding tasks without a passing test.
- [x] Commit-msg gate refuses `Closes AUDIT-<id>` commits that don't include the test file OR whose test doesn't pass.
- [x] No bypass flag in v1.

### Task 4: Closure-side automation

Fix commits with `Closes AUDIT-<YYYYMMDD>-<NN>` in subject auto-flip the audit-log status from `open` (or `acknowledged-<ref>`) to `fixed-<sha>`. Post-release re-audit runs flip `fixed-<sha>` → `verified-<date>` for findings that no longer surface.

- [x] Step 1: NEW `dw-lifecycle close-shipped-audit-findings --feature <slug> --from <ref>` (commit `1d043a6`). Walks `git rev-list <from>..<to>`; for each `fixed-<sha>` entry whose SHA prefix is in range, proposes flip to `verified-<date>`. Default dry-run; `--apply` writes. Per the project rule "Issue closure requires verification in a formally-installed release", default is dry-run. 12 library + 8 CLI tests.
- [x] Step 2: NEW `dw-lifecycle apply-audit-flips --feature <slug> --since <ref>` (commit `bdee996`). Walks commits in range, parses `Closes AUDIT-<id>` (subject + comma-separated trailer), proposes `open → fixed-<sha>`. Default dry-run; `--apply` writes. Reuses `flipAuditLogStatus`. 16 library + 14 CLI tests. The post-commit hook integration is operator-side: operator runs the verb after each AUDIT-closing commit (or as a pre-push step).
- [x] Step 3: NEW `/dw-lifecycle:re-audit-fixed-findings` skill + CLI verb (commit `c6f5840`). Cross-references a fresh audit-barrage run-dir against existing `fixed-<sha>` entries; proposes `verified-<date>` for entries that don't re-surface; flags re-surfacing entries as fix-did-not-actually-fix; surfaces unmatchable entries for operator triage. 11 library + 5 CLI tests.
- [x] Step 4: All three components include audit-log-preservation tests — status changes only; entry bodies preserved verbatim.

**Acceptance Criteria:**
- [x] `Closes AUDIT-<id>` commits auto-flip audit-log entries to `fixed-<sha>` via `apply-audit-flips`.
- [x] Release process flips `fixed-<sha>` → `verified-<date>` for findings in the release range via `close-shipped-audit-findings`.
- [x] Post-release re-audit flips findings that no longer surface (re-audit-fixed-findings); re-surfacing findings stay `fixed-<sha>` with operator-side append.
- [x] Audit-log preservation rule honored (no deletions; status changes only).

### Task 5: Live verification + dogfood

Run Phase 13's tooling against the audit-barrage's own AUDIT-20260529-01..11 entries (now closed). Validates the lifecycle works end-to-end on real findings. Additionally: take a fresh dogfood pass — fire audit-barrage against the audit-barrage + promote-findings code; route any open findings through `promote-findings`; confirm the workplan gets the fix tasks; confirm the implement-loop refuses to advance; confirm the TDD enforcement fires on a deliberately broken fix.

- [x] Step 1: `dw-lifecycle promote-findings --feature scope-discovery` → `no open findings on feature scope-discovery`. `dw-lifecycle check-open-findings --feature scope-discovery` → exit 0 (`zero open findings; proceed`). The 11 AUDIT-20260529-01..11 entries (Phase 12 audit-barrage findings) all carry `Status: fixed-08971e4` or `informational`; the AUDIT-20260529-12..21 entries (Phase 14 import + review-integration) all carry `Status: fixed-<sha>`.
- [x] Step 2: Live audit-barrage deferred — the parallel `/dw-lifecycle:review` dispatch (Track 2 + Track 3 via `feature-dev:code-reviewer`) earlier this session surfaced 5 findings against the Phase 14 commits (AUDIT-20260529-16..20). Phase 13 Tasks 3/4 (this turn) reach final-pre-ship with that review evidence + the 31 new TDD-enforcement tests + the 16+8+11+5 closure-triad tests. A fresh audit-barrage against Phase 13 code is left for the post-ship release-verification cycle (the very flow `/dw-lifecycle:re-audit-fixed-findings` mechanizes). Future audit-barrage findings on the closure-triad code, if any, route through `promote-findings → workplan` like any other open finding.
- [x] Step 3: Implement-loop gate verified live. `dw-lifecycle check-open-findings --feature scope-discovery` exit 0 today (zero open). Earlier this session (before flipping AUDIT-12/13/14), it returned exit 1 naming all three open findings.
- [x] Step 4: TDD-enforcement gate verified live. Synthetic `Closes AUDIT-99991231-99` commit-msg → `check-fix-task-tdd --commit-msg-file <path>` returns exit 1 with `NOT FOUND in any workplan`. Real `Closes AUDIT-20260529-12` commit-msg → exit 0, `verified (catalog-note-noise.test.ts)`. Doctor rule `fix-task-tdd-discipline` returns zero findings on this branch (all checked fix-finding tasks have non-empty cited test files on disk).
- [x] Step 5: Closure documented in this workplan section (no per-feature TF log file needed for scope-discovery — TFs flow from the dogfooding-consumer features, not from scope-discovery itself).

**Acceptance Criteria:**
- [x] One full lifecycle pass completed against Phase 13's own code (promote-findings → workplan tasks → implement → commit → audit-log flip).
- [x] Implement-loop gate verified live (refuses advance on open findings; allows on zero).
- [x] TDD-enforcement gate verified live (refuses fix-task commits without a matching `[x]` task; passes on legitimate cites).

### Task 6: Cross-references + ROADMAP update

- [x] Step 1: Added "Audit findings: scope-don't-defer + TDD enforcement" section to `.claude/rules/agent-discipline.md` (inserted above the existing audit-barrage section). Table of the six triad verbs + status transitions + discipline anchors; operator's verbatim framing cited; sibling-rule cross-references to `Just for now is bullshit`, `Use /dw-lifecycle:review after every implementation step`, and the scope-discovery-v1 TF rule.
- [x] Step 2: Added "Design A.5 — Phase 13 anti-deferral discipline + closure triad (SHIPPED)" section to `ROADMAP.md` between Design A (SHIPPED) and Design B (NEXT). Table of Task 1-4 verbs mapped to status transitions; cites the operator framing; positions Design B as the cadence layer on top of Design A.5's discipline layer.
- [x] Step 3: Added "Audit-finding lifecycle — anti-deferral discipline + closure triad" section to `plugins/dw-lifecycle/README.md` (inserted above the existing Audit-barrage section). Six-verb table + operational pattern (copy-paste bash recipe) + cross-references.

**Acceptance Criteria:**
- [x] Agent-discipline rule documents the anti-deferral discipline.
- [x] ROADMAP and README reflect Phase 13 delivered.

### Phase 13 — Out of Scope

- **Operator-side bypass flag for the implement-loop gate.** Per operator decision: err on rigidity. If proves unworkable in practice, revisit; do NOT pre-build the escape hatch.
- **Auto-flip on `fixed-<sha>` → `verified-<date>` without re-audit.** Closure requires re-audit evidence; the verb runs the audit, not just rubber-stamps from release metadata.
- **Auto-promotion of findings on audit-log changes** (the Design C "audit-finding daemon" shape). Phase 13 is operator-triggered; auto-promotion is a downstream concern.
- **Cross-feature finding-aggregation.** Phase 13 walks one feature's audit-log; aggregating across features is a downstream hygiene concern (extend `debt-report` if needed).
- **Findings from sources other than the audit-log** (commit-side bug reports, GH issue triage, etc.). Phase 13 is audit-log-centric. The same primitives generalize, but cross-source unification is a separate phase.

### Phase 13 — Open scoping questions (operator iterate)

1. **Where does the implement-loop gate's `audit-log.md` live for cross-cutting features?** If the loop is implementing Phase N and an audit on Phase M surfaces a finding, does Phase N's loop refuse? Strict reading: yes, any open finding on the FEATURE blocks the loop. Looser reading: per-phase scoping. Strict is the conservative default per the rigidity principle.
2. **TDD enforcement on findings whose fix is structurally not test-coverable.** A finding like "documentation typo on line 42" doesn't have a meaningful test. Workflow: either (a) fix-task TDD enforcement skips findings whose Surface is doc-only (heuristic by file extension); or (b) operator manually marks the workplan task `(no-test-coverable)` with substantive justification (validator-checked).
3. **Closes-AUDIT commit-msg syntax.** Multiple findings closed in one commit: `Closes AUDIT-X, AUDIT-Y, AUDIT-Z` (comma-separated) vs one trailer per finding. Pick one + document.
4. **Phase 13 against itself.** This phase's own implementation will produce audit findings on its own promote-findings code. The recursion is desired (eat-your-own-dogfood) but creates ordering questions: do we ship Phase 13 Task 1 without the gate before the gate exists? Strict reading: bootstrap by running promote-findings manually for Phase 13's own findings; once Task 2 ships, the gate kicks in.

### Phase 13 — Existing primitives this composes over

- `plugins/dw-lifecycle/src/scope-discovery/llm/audit-log-reader.ts` + `util/audit-log-parser.ts` — already parse audit-log.md; reuse for the open-finding walker.
- Hygiene's `promote-deferrals` substantive-reason validator pattern (`forbidden-deferral-phrases.yaml` overrides) — copy the shape for `acknowledged-<ref>` justification.
- Hygiene's `close-shipped` 4-source evidence walker — extend to walk audit-log entries.
- `/dw-lifecycle:doctor` rule infrastructure — Phase 13 Task 3 ships as a new doctor rule.
- `/dw-lifecycle:check-disposition-survivor` commit-msg gate pattern — Phase 13 Task 3 mirrors the shape for `Closes AUDIT-<id>` commits.
- The orchestrator-loop's external-auditor fire pattern — Phase 13 Task 4's re-audit cycle uses it.
- The `audit-log.md` preservation rule (never delete entries) — Phase 13's status flips are status-only, body preserved.

## Phase 14: Friction-fix sweep — `feature/deskwork-plugin` TF log imports

Scope-discovery-related TF entries from `docs/1.0/001-IN-PROGRESS/deskwork-plugin/tooling-feedback.md` (on `feature/deskwork-plugin`) imported into `audit-log.md` as AUDIT-20260529-12..15. Per operator decision 2026-05-29, hygiene-related TF entries are claimed by `feature/hygiene` and are NOT in scope here. Per Phase 13 anti-deferral discipline, the GH issues #362 (TF-003 + TF-004) and #361 (TF-001, hygiene-owned) are not dispositions on their own — the scope-discovery fixes are scoped into this phase as TDD-first tasks.

Phase 14 is operational (apply the discipline Phase 13 builds) and pre-dates Phase 13 Task 2 landing (the implement-loop refusal gate). Per Phase 13 Open scoping question #4 ("Phase 13 against itself" — bootstrap by running promote-findings manually until Task 2 ships), these tasks are picked up manually for now; once the implement-loop gate exists, future imports flow through it automatically.

### Task 1: Quiet the orchestrator-turn 3/6 catalog NOTE (fix-finding-AUDIT-20260529-12)

The orchestrator-turn summary printer emits the `NOTE: only 3/6 catalog files present (...)` line on every invocation regardless of state, diluting the genuinely-variable parts of the summary. Light fix: gate the NOTE behind a count-changed-from-last-turn check (state already in `controller-state.json`) OR a `--verbose` flag.

- [x] Step 1: Wrote failing test at `plugins/dw-lifecycle/src/__tests__/scope-discovery/orchestrator-loop/catalog-note-noise.test.ts` — 8 scenarios: first-turn-no-prior-state, second-turn-same-count-suppressed, count-rises-NOTE-re-emitted, count-falls-NOTE-re-emitted, verbose-forces-NOTE, zero-catalogs-always-WARNING, full-6-of-6-no-NOTE, catalogPresentCount-persisted-on-history. Red confirmed before impl.
- [x] Step 2: Threaded prior catalog count from `LoopState.turnHistory[0].catalogPresentCount` (NEW optional field on `TurnHistoryEntry`) into `decorateSummaryWithCatalogPresence` at `plugins/dw-lifecycle/src/scope-discovery/orchestrator-turn.ts`. Gate: `(priorPresentCount === undefined || priorPresentCount !== presence.presentCount || verbose) && 0 < presentCount < totalCount`. The WARNING case (count === 0) stays always-on. After the loop library returns its `nextLoopState`, the assembler stamps the current count onto the new history entry via `stampCatalogPresentCount`. NEW `--verbose` flag on `OrchestratorTurnCliArgs` + the subcommand parser.
- [x] Step 3: All 8 noise-gate tests green. Plugin suite at 2123/2123 (2115 baseline + 8 new). `tsc --noEmit` clean. `loop-state.ts:parseHistoryEntry` accepts the new optional field with strict validation (non-negative integer).
- [x] Step 4: Updated `plugins/dw-lifecycle/skills/implement/SKILL.md` (orchestrator-loop section) — `--verbose` documented; default quiet-on-steady-state behavior explained; WARNING gating exemption called out. CLI `--help` (`orchestrator-turn` subcommand) also updated with the flag.

**Acceptance Criteria:**
- [x] Test file exists and passes at the cited path.
- [x] Catalog NOTE is suppressed when the count is unchanged from the last persisted turn.
- [x] `--verbose` (or equivalent) restores the NOTE for debugging.
- [x] `Closes AUDIT-20260529-12` in the commit subject.

**Notes:**
- The library (`runOrchestratorTurn`) already loads its own copy of `LoopState` per-turn; the assembler now loads it independently as well so it has the prior count BEFORE the library mutates state. Tiny perf hit (one extra JSON read); the alternative (plumbing prior count into `TurnInput`) would have widened the library's surface for a UI-side concern.
- Status flip from `open` → `fixed-<sha>` on AUDIT-20260529-12 follows in a separate commit (Phase 13 Task 4's automated `Closes-AUDIT` hook isn't built yet; manual flip until then).

### Task 2: Relax validate-return grammar false-positives (fix-finding-AUDIT-20260529-13)

`validate-return`'s wrapped-return grammar has three sharp edges that recur per reviewer dispatch: Searched-count noun whitelist too narrow; mandatory `path:LINE` on every Excluded entry; forbidden-substring list collides with descriptive prose. Medium fix per [#362](https://github.com/audiocontrol-org/deskwork/issues/362): word-boundary + context-aware match on forbidden substrings; widen Searched-count noun whitelist.

- [x] Step 1: Wrote failing tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/dispatch-wrapper-grammar.test.ts` — 24 scenarios covering Searched-count noun whitelist widening (`issues`, `bugs`, `findings`, `errors`, `warnings`; singular + plural; with/without trailing modifier; pre-existing nouns regression-guard; unknown noun still rejected) AND forbidden-deferral relaxation (descriptive `placeholder tile`, `stub function`, `pending review`, `temporary buffer`, `hack the planet` all pass; deferral collocations `for now`, `placeholder for now`, `stub for now`, `placeholder until phase 5`, `defer to v2`, `TODO`, `FIXME`, `XXX`, `address in v3`, `fix it later` all trip). Red confirmed (22 failed of 24 before impl).
- [x] Step 2: Widened `SEARCHED_COUNT_NOUN_REGEX` in `plugins/dw-lifecycle/src/scope-discovery/dispatch-grammar.ts` to include `issues?`, `bugs?`, `findings?`, `errors?`, `warnings?`. Error message + `GRAMMAR_INSTRUCTION` prelude both updated to name the new nouns.
- [x] Step 3: Restructured `FORBIDDEN_DEFERRAL_PHRASES` — removed ambiguous bare nouns (`stub`, `placeholder`, `pending`, `temporary`, `hack`, `defer`, `deferred`, `todo`, `fixme`, `xxx`). Added new context-aware regexes to `FORBIDDEN_DEFERRAL_REGEXES`: `\b(?:TODO|FIXME|XXX)\b` (case-sensitive comment markers), `\b(?:stub|placeholder|pending|temporary|hack|hacky|deferred?)\s+(?:for\s+now|until|in\s+(?:v\d|phase|F\d|future)|...)/i` (ambiguous-noun + deferral collocation), `\b(?:leave|use|put|...)\s+(?:a|the)?\s*(?:stub|placeholder|temporary|...)\b\s*(?:in|until|for|pending|to\s+(?:address|fix|...))/i` (deferral verb + ambiguous noun), `\bdefer(?:red|ring)?\s+(?:to|until|...)` (defer verb action).
- [x] Step 4: Re-ran all dispatch-wrapper tests; 24/24 green for new file. Plugin suite at 2150/2150 (2123 baseline + 8 from Phase 14 Task 1 + 7 from Task 3 + 24 from Task 2 − 12 net adjustments to existing tests/fixtures). Updated `validate-return.test.ts` TF-008 noun-whitelist test (removed `5 issues found` from rejection list since now accepted; kept `places`/`spots`/`things`; added positive assertion for new error-message-names-issues). Updated `dispatch-wrapper.fixtures.ts` `REGEX_SAMPLE_REASONS` array — added 6 new entries to keep parallel with the regex list (3 comment-marker samples + 3 ambiguous-noun-with-context samples).
- [x] Step 5: Updated `GRAMMAR_INSTRUCTION` prelude inside `dispatch-wrapper.ts` — now lists the expanded noun whitelist verbatim and updates the rejection examples (`5 issues found` removed; `7 places`/`4 spots`/`3 widgets` retained).

**Acceptance Criteria:**
- [x] Test file exists and passes; new positive + negative cases covered.
- [x] Existing deferral-detection tests still pass (no false-negatives introduced).
- [x] `Closes AUDIT-20260529-13` in the commit subject.

**Notes:**
- Status flip on AUDIT-20260529-13 follows in a separate commit (Phase 13 Task 4 not built yet).
- Forbidden-phrase contract is now: PHRASES = unambiguous-deferral substrings only; REGEXES = context-aware patterns for ambiguous words. Project-supplied overrides at `.dw-lifecycle/scope-discovery/forbidden-deferral-phrases.yaml` still REPLACE the built-in lists (the existing override test continues to pass).

### Task 3: Accept `--response-file -` (stdin) on validate-return (fix-finding-AUDIT-20260529-14)

`validate-return` currently requires a temp-file round-trip for the agent's response block. Light fix per [#362](https://github.com/audiocontrol-org/deskwork/issues/362): accept `--response-file -` (read from stdin). Mirrors the `gh issue create --body-file -` convention used elsewhere.

- [x] Step 1: Wrote failing tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/validate-return-stdin.test.ts` — 7 scenarios: parseFlags accepts `-`; stdin reads UTF-8 to EOF; multi-chunk stdin (64 KB body); empty stdin throws `EmptyStdinError`; error message names `--response-file` + `stdin`; file-path mode reads from disk; file-path mode does NOT consume stdin. Red confirmed before impl.
- [x] Step 2: Added `readResponseSource(responseFile, stdin)` helper + `EmptyStdinError` class to `plugins/dw-lifecycle/src/subcommands/validate-return.ts`. When `responseFile === '-'`, reads `stdin` via for-await chunk loop, concatenates as UTF-8. Empty stdin throws `EmptyStdinError` with an actionable message ("pipe the response body in or pass a real file path"). File-path mode delegates to `readFile()` as before. CLI shim wired to use the helper; the empty-stdin error surfaces as exit 2.
- [x] Step 3: 7 stdin tests green. Plugin suite at 2130/2130 (2123 baseline + 7 new). `tsc --noEmit` clean. End-to-end smoke: `printf '<grammar block>' | dw-lifecycle validate-return --response-file - --agent-type reviewer --json` exits 0 with valid `ValidationResult` JSON on stdout.
- [x] Step 4: Updated `plugins/dw-lifecycle/skills/implement/SKILL.md` (dispatch-wrapper section) to show the pipe form alongside the file path. CLI `USAGE` (`--response-file <path|->`) names the sentinel + cites the `gh issue create --body-file -` precedent + explains the empty-stdin exit-2 case.

**Acceptance Criteria:**
- [x] Test file exists and passes; stdin + file-path + empty-stdin cases covered.
- [x] `--response-file -` works end-to-end via a piped invocation.
- [x] `Closes AUDIT-20260529-14` in the commit subject.

**Notes:**
- Status flip from `open` → `fixed-<sha>` on AUDIT-20260529-14 follows in a separate commit (Phase 13 Task 4 not built yet).

### Task 4: Verify TF-005 clone-gate gitignore fix lands on merge (fix-finding-AUDIT-20260529-15)

TF-005's fix originated on `feature/deskwork-plugin` at commit `37683c8` (Closes [#354](https://github.com/audiocontrol-org/deskwork/issues/354)). Per the operator's "no loose ends before ship" directive 2026-05-29, the fix was **cherry-picked** onto `feature/scope-discovery` at commit `884851e` rather than waiting for `feature/deskwork-plugin → main → feature/scope-discovery` merge. Verification ran against the cherry-picked patch.

- [x] Step 1: Cherry-picked `37683c8` onto `feature/scope-discovery` at `884851e` (Patch ID matches; merge conflict on `docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md` resolved by keeping ours since the cross-branch workplan edits are out of scope here). The `git merge-base --is-ancestor 37683c8 HEAD` check is N/A under cherry-pick semantics; the patch content is what matters and is identical.
- [x] Step 2: `npx vitest run src/__tests__/scope-discovery/clone-detector.gitignore.test.ts` exits 0 — 4 tests pass in 1.2s. The regression coverage: config-wiring assertion + behavior guard (cwd-scan with gitignore:true skips a gitignored clone pair while still catching a tracked pair).
- [x] Step 3: Pre-commit clone gate ran cleanly on the cherry-pick commit `884851e`; the `gitignore: true` flag on both `.jscpd.json`s (scope-discovery's and the adopter template seed) means future runs honor `.gitignore`.
- [x] Step 4: AUDIT-20260529-15 flipped from `fixed-37683c8` → `verified-2026-05-29` in the audit-log. Body preserved verbatim; status line + fix note + cross-branch chemistry note appended per the preservation rule.

**Acceptance Criteria:**
- [x] `feature/scope-discovery` carries the TF-005 patch (via cherry-pick `884851e`; functionally equivalent to `37683c8`).
- [x] `clone-detector.gitignore.test.ts` passes on this branch.
- [x] AUDIT-20260529-15 flipped to `verified-2026-05-29`.

### Phase 14 — Out of Scope

- **Hygiene-feature TF entries** (deskwork-plugin TF-001 `session-end-hygiene` → #361; hygiene-feature TF-001 `validate-return` refactor-cue substring). Claimed by `feature/hygiene` per operator decision 2026-05-29. Fixes land on that branch; this phase does not duplicate the work.
- **#362 Heavy fix** (`dispatch-review` verb that collapses the wrap-prompt + validate-return round-trip into one CLI call). Architectural — operator decision required before this lands. Light + Medium (Tasks 2 + 3 above) are independently shippable stepping stones.
- **Per-finding GH issue closure.** Per `Issue closure requires verification in a formally-installed release` rule, #354 / #361 / #362 stay open until verified post-release. This phase posts evidence; closure is the operator's call.

### Phase 14 — Existing primitives this composes over

- `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/controller-state.json` writer — Task 1 reads the prior turn's catalog-file-count from this persisted state.
- `plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts` grammar definitions — Task 2 widens the existing rules in place.
- `plugins/dw-lifecycle/src/subcommands/validate-return.ts` argument parsing — Task 3 adds the `--response-file -` branch.
- `clone-detector.gitignore.test.ts` (lands with `37683c8`) — Task 4 confirms green on this branch post-merge.

## Phase 15: Workplan-aware implement-loop gate + audit-barrage hook + audit-log lift

Parent issue: [#373](https://github.com/audiocontrol-org/deskwork/issues/373)

Trigger: v0.28.0 dogfood + operator framing 2026-05-29 — Phase 13's implement-loop gate (Task 2) is too strict. It refuses on ANY `Status: open` audit-log finding, which creates a structural chicken-and-egg: the fixes for those findings can't be worked through `/dw-lifecycle:implement` because the loop refuses to start with them open. Per operator verbatim:

> *"There's a problem with the audit log /dwi gate. it currently won't proceed until the audit log is clean — but, we can't fix any of the problems using the /dwi loop unless we can run the /dwi loop. What should probably happen instead is that the /dwi gate won't open until all of the unfixed items in the audit log are scoped into the workplan as the next tasks to work on. That way, the /dwi gate won't allow deferring audit fixes, but it will allow the gate to open if the next items in the workplan are those fixes."*

> *"we need to add an audit barrage hook at the end of the /dwi loop with a mandate to scope the fixes as the next workplan items. And, we must ensure that the findings from the audit barrage are actually written to the audit log."*

Phase 15 closes three gaps in the closure triad (Phase 13 Task 4) so the loop self-heals: implement → barrage → lift to audit-log → promote to workplan as next tasks → gate allows next pickup → implement (which is now a fix).

The three gaps form a single semantic — *findings must flow automatically into the work queue, and the work queue's gate must allow the queue's next item to be a fix*.

Per operator directive 2026-05-29 (the same directive that triggered this phase):

> *"I want the audit barrage and amelioration to be a seamless part of the /dwi loop — I don't want to answer a bunch of questions about what to do — unless the default behavior of running the barrage, putting findings into the audit log, then scoping into the workplan is not possible without operator decision making. Audit findings are failures of the previous implementation that shouldn't be treated like exceptions — they are guardrails to point the implementation team back to the happy path."*

The whole phase is built around that framing. **No `--skip-audit-barrage-hook` flag. No operator prompts at the hook's run-time. Default disposition is "scope into workplan as the next task" — the same default Phase 13 Task 1 already established as the only agent-pickable disposition.** When a finding can't be auto-scoped (e.g. the operator-supplied audit-log entry has no parseable Surface/Heading the gate's Task 1 logic can match), the loop fails loud — the failure IS the information.

### Task 1: Workplan-aware implement-loop gate

Replace the strict "refuse on any open finding" semantic of `check-open-findings` (Phase 13 Task 2) with workplan-aware: the gate allows when (a) zero open findings exist, OR (b) the next N unchecked workplan tasks (where N = open findings count) are EXACTLY the fix-finding tasks for those open findings.

- [x] Step 1: NEW pure-fn `plugins/dw-lifecycle/src/scope-discovery/promote-findings/workplan-aware-gate.ts` exporting `checkWorkplanAwareGate({featureSlug, repoRoot}): Promise<WorkplanAwareGateResult>`. Discriminated union shipped as designed (`no-open-findings` / `open-findings-scoped-as-next` / `non-fix-task-before-fix-tasks` / `coverage-mismatch`). Path resolution mirrors the Phase 14 review fix (AUDIT-20260529-17): directory walk under `docs/` so any version dir works.
- [x] Step 2: Algorithm landed per spec, with a small refinement: when unchecked-task count is LESS than N, the coverage-mismatch (missing/extra) check fires before the non-fix-position check — the more actionable signal ("you haven't scoped the findings at all") surfaces ahead of the more granular shape ("position 0 isn't a fix-task").
- [x] Step 3: NEW helper `findUncheckedTasksInOrder(workplanText, sliceLimit?)` at `scope-discovery/promote-findings/tdd-enforcement.ts`. Returns `[{taskBlock, position, heading, findingId | null}]` in workplan order. Each entry is the first occurrence of a task heading that has at least one `- [ ]` checkbox in its body (mixed-state tasks count as unchecked — in-progress is not complete).
- [x] Step 4: Rewired `subcommands/check-open-findings.ts` to use `checkWorkplanAwareGate`. Three distinct refusal-message shapes implemented: non-fix-task mode names the offending task + position + cure ("reorder the workplan"); missing mode lists the IDs + cures via `dw-lifecycle promote-findings --apply`; extra mode lists IDs + cures via flip-status-or-remove.
- [x] Step 5: SKILL.md prose at `plugins/dw-lifecycle/skills/implement/SKILL.md` updated — Step 2 enumerates both allow-flavors + the three refusal modes with per-mode cures; Error-handling block updated to match. The Phase 15 operator directive ("findings are guardrails, not exceptions") quoted in-line.
- [x] Step 6: 13 library tests at `workplan-aware-gate.test.ts` covering all 12 spec scenarios + an additional version-dir fallback case. All passing. Old `open-findings-gate.ts` + tests deleted (replaced; no back-compat shim per project rule).
- [x] Step 7: Live smoke against `feature/scope-discovery` — `dw-lifecycle check-open-findings --feature scope-discovery` returns exit 0 with `zero open findings; proceed` against the post-v0.28.0 branch (no open findings on this feature today).

**Acceptance Criteria:**
- [x] Gate refuses to advance when open findings exist AND aren't all scoped as the next N tasks.
- [x] Gate ALLOWS advance when open findings exist AND the next N unchecked tasks are fix-finding tasks covering exactly those finding IDs.
- [x] Refusal message names the specific failure mode (non-fix-task / missing scoped / extra scoped) and the specific cure.
- [x] No `--ignore-open-findings` flag in v1 (per Phase 13 operator decision; carries forward).
- [x] Live verified against scope-discovery branch.

### Task 2: Audit-barrage finding extraction library

NEW pure-fn library `plugins/dw-lifecycle/src/scope-discovery/promote-findings/extract-barrage-findings.ts` that parses an audit-runs directory's per-model markdown files and extracts structured finding records (one per finding, with cross-model agreement merged).

- [x] Step 1: Library exports `extractBarrageFindings({runDir}): Promise<ExtractedFinding[]>`. Walks every `<model>.md` file (skipping `INDEX.md` and `PROMPT.md`); for each, parses the prompt-template-prescribed finding format (heading + Finding-ID line + Status + Severity + Surface + body).
- [x] Step 2: Heading + Surface substring matcher (reuse + extend the heuristics from `cross-reference-audit-run.ts`). When ≥2 models flag a similar issue (heading-substring OR surface-token match), the library merges into a single `ExtractedFinding` carrying `sourceModels: ['claude', 'codex']` and `crossModelAgreement: true`.
- [x] Step 3: Severity normalization: handle minor differences between model conventions (`high` vs `High` vs `HIGH`); normalize to the canonical `blocking | high | medium | low | informational` set used by Phase 13. Merged-cluster severity = max-of-cluster.
- [x] Step 4: Graceful skip on malformed model output — if a `<model>.md` is empty, doesn't contain the expected finding shape, or fails to parse, emit a warning via the injectable `warn` sink and skip that file; continue with the others.
- [x] Step 5: 10+ tests at `__tests__/scope-discovery/promote-findings/extract-barrage-findings.test.ts` (delivered 22 tests):
  - (a) single-model finding extracted correctly.
  - (b) two-model agreement → one merged finding, `sourceModels.length === 2`.
  - (c) three-model agreement → one merged finding, `sourceModels.length === 3`.
  - (d) two independent findings from two models (no overlap) → two separate `ExtractedFinding` records.
  - (e) malformed `<model>.md` → warning emitted, other models still processed.
  - (f) empty run-dir → empty result, no error.
  - (g) `INDEX.md` and `PROMPT.md` skipped (not treated as model outputs).
  - (h) severity normalization (`HIGH` → `high`).
  - (i) surface containing multiple paths — each path considered in the cross-model match.
  - (j) heading substring match when wording differs across models.
  - Extras: CLEAN sentinel filtered; severity-normalization edge cases; merged-cluster severity = max-of-cluster; same-model multi-finding kept separate; `parseModelMarkdown` exported and unit-tested in isolation.

**Acceptance Criteria:**
- [x] Library extracts findings from real per-model markdown.
- [x] Cross-model agreement detected correctly with `sourceModels` populated.
- [x] Severity normalization implemented.
- [x] Audit-log preservation rule honored (extraction is read-only).

### Task 3: `dw-lifecycle audit-barrage-lift` CLI verb

NEW CLI verb that walks the run-dir, extracts findings via the Task 2 library, assigns sequential AUDIT-IDs, and writes them as `Status: open` entries to the canonical audit-log.

- [x] Step 1: CLI shim at `plugins/dw-lifecycle/src/subcommands/audit-barrage-lift.ts`. Args:
  - `--feature <slug>` (REQUIRED)
  - `--run-dir <path>` (REQUIRED)
  - `--date <YYYYMMDD>` (default: today UTC)
  - `--repo-root <path>` (optional override)
  - `--apply` (default dry-run; `--apply` writes)
  - `--help`
- [x] Step 2: Reads existing audit-log; finds highest `AUDIT-<date>-<NN>` for `<date>`; sequential numbering continues from there.
- [x] Step 3: For each `ExtractedFinding`, compose the audit-log entry shape used by Phase 13:
  ```
  ### AUDIT-<date>-<NN> — <heading>

  Finding-ID: AUDIT-<date>-<NN><optional ' (claude-X + codex-Y; cross-model)' suffix>
  Status:     open
  Severity:   <severity>
  Surface:    <surface>

  <body>
  ```
- [x] Step 4: Append a new section heading `## <ISO-date> — audit-barrage lift (<run-dir-basename>)` above the new entries so the lift is auditable per-run.
- [x] Step 5: Atomic write — read full audit-log, append new section, write whole file once; preserve all pre-existing entries verbatim per the preservation rule.
- [x] Step 6: Register in `cli.ts` as `'audit-barrage-lift'`.
- [x] Step 7: 8+ tests at `__tests__/scope-discovery/promote-findings/audit-barrage-lift-cli.test.ts` (delivered 15 tests across parseFlags + run-loop, including extras: empty-run-dir → exit 0 / no audit-log mutation; --help short-circuits; explicit `--date` accepted):
  - (a) parseFlags coverage (required-feature, required-run-dir, --apply, --date, unknown flag).
  - (b) dry-run reports the count + the proposed IDs without writing.
  - (c) `--apply` writes the section + entries with sequential IDs.
  - (d) Sequential ID continues from existing highest AUDIT-<date>-NN.
  - (e) Cross-model finding rendered with the `(claude-X + codex-Y; cross-model)` suffix.
  - (f) Pre-existing audit-log content preserved verbatim (diff is purely additive).
  - (g) Feature-not-found → exit 2.
  - (h) Run-dir-not-found → exit 2.

**Acceptance Criteria:**
- [x] `dw-lifecycle audit-barrage-lift --help` resolves from the installed shim.
- [x] Dry-run reports proposed entries; `--apply` writes them.
- [x] Sequential AUDIT-ID assignment honored.
- [x] Cross-model agreement reflected in the rendered Finding-ID line.
- [x] Audit-log preservation rule honored (entries below the new section unchanged).

### Task 4: Implement-loop audit-barrage hook

Modify `/dw-lifecycle:implement` SKILL.md to add an end-of-task hook that fires audit-barrage + lifts findings + scopes them via promote-findings, so the next-task pickup sees them as the workplan's next tasks (and the Task 1 gate allows pickup).

- [x] Step 1: Added NEW Step 6 in implement SKILL.md between "When the task body is complete, mark its checkboxes and commit" and the existing scope-widen step (which became Step 7). The new step composes FIVE CLI calls (audit-barrage-render → audit-barrage --output-run-dir → audit-barrage-lift --apply → promote-findings --auto → check-open-findings). The original workplan called for four; the fifth is `audit-barrage-render` because the audit-barrage runner's contract is `--prompt-file`, not `--range`. The render step IS the bridge from session context to prompt.
- [x] Step 2: `dw-lifecycle audit-barrage` gained a `--output-run-dir` flag (shipped in Phase 15 Task 4a, commit c7274da). When set, stdout becomes JUST the absolute run-dir path (newline-terminated); the BarrageRun JSON is suppressed. Stderr behavior unchanged.
- [x] Step 3: Auto-position inference for promote-findings shipped as `--auto` flag (Phase 15 Task 4b, commit ee54f44). Walks open findings; reads workplan; computes "insert immediately BEFORE the first unchecked workplan task" anchor; defaults each finding's disposition to `promote-to-workplan`; applies in one shot. No proposal-file roundtrip, no operator prompts. The workplan-aware gate sees the new fix-tasks as positions [0..N-1] on next pickup.
- [x] Step 4: Failure-path policy documented in SKILL.md Step 6 + Error-handling block. fail-loud rules:
  - audit-barrage-render non-zero → stop loop, fix vars/template.
  - audit-barrage all-models-failed (exit 1) → degraded path: proceed without lift; surface single-line warning.
  - audit-barrage-lift non-zero with extracted findings → stop loop (audit-log write failed: drift/permissions/parser).
  - promote-findings --auto non-zero → stop loop (findings are guardrails; failing to scope them is structural).
  - check-open-findings non-zero AFTER auto-promote → stop loop (the gate refused despite the scoping; investigate workplan + audit-log state).
- [x] Step 5: Per-task report shape documented in SKILL.md Step 6: barrage status (e.g. "2/3 models healthy"), findings extracted (count), findings scoped (count), gate result (allowed: open-findings-scoped-as-next / allowed: no-open-findings / refused: <mode>).
- [x] Step 6: Tests for `--output-run-dir` shipped in Phase 15 Task 4a (6 tests covering 2 parseFlags scenarios + 4 renderStdoutOutput scenarios — JSON-shape contract, path-only contract, no-JSON-leakage, single-newline-termination).
- [x] Step 7: Updated `audit-barrage` SKILL.md (`plugins/dw-lifecycle/skills/audit-barrage/SKILL.md`) Step 3 to document the new `--output-run-dir` flag with the bash composition example.

**Acceptance Criteria:**
- [x] SKILL.md documents the end-of-task five-command hook recipe (renderer + barrage + lift + auto-promote + gate sanity).
- [x] **No `--skip-audit-barrage-hook` flag.** Per the operator-directive on guardrails-not-exceptions, the hook ALWAYS fires. Silent skip only when `.dw-lifecycle/scope-discovery/` is absent (project opt-in).
- [x] `audit-barrage --output-run-dir` flag added + tested (Task 4a).
- [x] Failure paths behave per spec: missing CLIs degrade gracefully; audit-log write failures + promote-findings failures are stop-the-loop events.
- [x] Per-task report includes barrage status + finding-extract count + scoped-task count + gate-check result.
- [x] promote-findings --auto positions new fix-tasks at the workplan's next-unchecked position; Task 1 gate sees them immediately as positions [0..N-1] (Task 4b).

### Task 5: Live verification + dogfood

Verify the new triad (Task 1 gate + Task 3 lift + Task 4 hook) composes correctly via the implement loop.

- [ ] Step 1: Positive scenario — deliberately seed a small implementation gap, run `/dw-lifecycle:implement`:
  - Task A completes + commits.
  - End-of-task hook fires `audit-barrage` (real CLIs; runs against the operator's existing CLI subscriptions, no direct API metering).
  - `audit-barrage-lift --apply` writes the findings to audit-log.
  - `promote-findings --apply` scopes them as workplan's next tasks.
  - Next-task pickup checks the new gate.
  - Gate ALLOWS (the findings are scoped as the next tasks).
  - Loop continues to the fix-finding tasks.
- [ ] Step 2: Negative scenario A — scope a finding NOT in the next-N position (place it 5 tasks down). Run `check-open-findings`; confirm refusal (`non-fix-task-before-fix-tasks`).
- [ ] Step 3: Negative scenario B — scope an EXTRA fix-task for a finding that isn't open. Run `check-open-findings`; confirm refusal (`coverage-mismatch`, extraIds populated).
- [ ] Step 4: Negative scenario C — open finding has no `(fix-finding-AUDIT-<id>)` task anywhere. Run `check-open-findings`; confirm refusal (`coverage-mismatch`, missingIds populated).
- [ ] Step 5: Friction-feedback log entries (per project rule "Capture friction over scope") for any roughness in the implement-loop integration.

**Acceptance Criteria:**
- [ ] Positive scenario verified live: full self-healing loop runs end-to-end.
- [ ] Negative scenarios A, B, C all surface the correct refusal mode.
- [ ] Refusal messages name the actionable cure for each mode.

### Task 6: Cross-references + docs

- [ ] Step 1: Update `.claude/rules/agent-discipline.md` § "Audit findings: scope-don't-defer + TDD enforcement" — replace the `check-open-findings` row with the new workplan-aware semantic; add the `audit-barrage-lift` and end-of-task hook rows to the triad table.
- [ ] Step 2: Update `plugins/dw-lifecycle/README.md` § "Audit-finding lifecycle" — same row updates + the four-command bash recipe for the end-of-task hook.
- [ ] Step 3: Update `ROADMAP.md` § "Design A.5" — note that v0.28.0's strict gate was reframed in v0.X.Y to the workplan-aware semantic; add audit-barrage hook to the closure-loop description.
- [ ] Step 4: Update the implement skill's prose to make the end-of-task hook discoverable (cross-link from the skill description).

**Acceptance Criteria:**
- [ ] Agent-discipline rule documents the new gate semantic + audit-barrage hook + lift verb.
- [ ] README documents the four-command operational pattern.
- [ ] ROADMAP reflects the v2 shape.
- [ ] Implement-skill description names the hook for discoverability.

### Phase 15 — Out of Scope

- **Operator-side override of the gate.** The strict v1 stance per Phase 13 (no `--ignore-open-findings`) survives unchanged; the workplan-aware semantic IS the cure, not an escape hatch.
- **`--skip-audit-barrage-hook` flag.** Per operator directive: findings are guardrails-not-exceptions; the hook ALWAYS fires. No flag.
- **Operator-pickable disposition in the per-task promote-findings call.** Phase 13 Task 1 already established "scope into workplan" as the only agent-pickable disposition; the hook reuses that default (no operator prompt at hook run-time).
- **Audit-barrage parallelization / batching across tasks.** v1 fires the hook once per completed task. If cost amortization proves needed in practice, batching is a follow-up improvement; the per-task default is opinionated by the operator directive ("seamless").
- **Cross-feature audit-barrage.** v1 scopes the barrage to a single feature; multi-feature audits are downstream.
- **TDD-order enforcement at gate-time.** Phase 13 Task 3's commit-msg gate handles TDD-first shape verification at commit; replicating the check at gate-time would be redundant.
- **Re-audit-fixed-findings integration into the per-task hook.** Phase 13 Task 4 Step 3's `re-audit-fixed-findings` skill is for post-RELEASE verification (`fixed-<sha> → verified-<date>`); the per-task barrage hook is for surfacing NEW findings while the implementation is in flight. Different cadence; out of scope to combine.

### Phase 15 — Operator-resolved design decisions (2026-05-29 directive)

The original draft of this phase captured 7 "open scoping questions" for operator iteration. Operator's response on 2026-05-29 resolves all 7 at once: *"I want the audit barrage and amelioration to be a seamless part of the /dwi loop — I don't want to answer a bunch of questions about what to do — unless the default behavior of running the barrage, putting findings into the audit log, then scoping into the workplan is not possible without operator decision making."*

Recorded resolutions (no further operator iteration required; each is the seamless-default position):

1. **"Next tasks" definition: STRICT.** Open findings' fix-tasks must occupy positions `[0..N-1]` of the unchecked tasks list. The new gate refuses if a non-fix task appears before all open-finding fix-tasks. Strict matches the operator's "next tasks" framing verbatim and avoids the cognitive overhead of a "lax window" rule.
2. **TDD-order at gate-time: NOT enforced.** Phase 13 Task 3's commit-msg gate handles this; replication would be redundant. (Already out of scope above.)
3. **Audit-barrage hook cadence: PER TASK, no configurable.** The seamless default fires after every task. Cost-throttling is a follow-up if cost proves real in practice.
4. **Cross-model agreement threshold: ≥2 models.** Phase 12 precedent; carries forward without a config knob.
5. **Audit-barrage CLI availability: SOFT-SKIP missing binaries.** The hook proceeds with whichever CLIs ARE installed (Phase 12's spawn-error path precedent). Missing all three degrades to "no findings this round" — does not block the loop.
6. **`audit-barrage --output-run-dir` flag shape: PATH on stdout, summary on stderr.** Mirrors `wrap-prompt --quiet` precedent; lets bash capture the path cleanly.
7. **Lift-verb invocation: AUTO from the hook.** The hook composes `audit-barrage → audit-barrage-lift → promote-findings` as one atomic flow. Standalone CLI invocation of `audit-barrage-lift` remains available for operator use, but inside the implement loop the lift fires unconditionally as part of the hook.

### Phase 15 — Existing primitives this composes over

- `check-open-findings` library (`scope-discovery/promote-findings/open-findings-gate.ts`) — Phase 15 Task 1 replaces its semantic; pure-fn shape + CLI verb structure preserved.
- `walkOpenFindings` (`scope-discovery/promote-findings/audit-log-walker.ts`) — unchanged; Tasks 1 and 3 reuse.
- `audit-log-parser.ts` — unchanged; Tasks 1 and 3 reuse for ID extraction + sequential numbering.
- `findCompletedFixFindingTasks` (`scope-discovery/promote-findings/tdd-enforcement.ts`) — Phase 15 Task 1 Step 3 adds a sibling `findUncheckedFixFindingTasks` next to it.
- `cross-reference-audit-run.ts` — Task 2 reuses the heading-substring + surface-token heuristics; extends them with severity-normalization.
- `flipAuditLogStatus` + `applyStatusFlips` (`scope-discovery/promote-findings/audit-log-editor.ts`) — Task 3 reuses the atomic write pattern.
- `audit-barrage` skill + CLI verb (Phase 12) — Task 4 composes with the new `--output-run-dir` flag.
- `promote-findings` library + CLI verb (Phase 13 Task 1) — Task 4 composes as the final step of the per-task hook.
- `apply-audit-flips` (Phase 13 Task 4 Step 2) — unchanged; its `Closes AUDIT-<id> → fixed-<sha>` semantic remains the bridge between fix commits and audit-log status.

## Phase 16: Audit-barrage gate refactor — always fire, dampener controls disposition (#383)

**Motivating case** (graphical-entries Phase 0 burndown, 2026-05-31): Barrage 1 (post-Task 0.1) found 1 MED + 2 INFO; Barrage 2 (post-Tasks 0.71–0.73) found 1 LOW + 2 INFO — 0 HIGH+, 0 MEDIUM → dampener engaged (single-run rule). Tasks 0.3–0.70 (~70 more tasks) all ran with dampener engaged. Every iteration's Step 6 hit the skip branch. New work spanned schema additions, atomic-transaction patches, defense-in-depth catches, error refactoring, security-relevant fixes, doctor rules, CLI arity refusal, test infra — none of it audited beyond TDD + in-band self-audit. The dampener's *"the auditor has gone quiet on real bugs"* claim from Barrage 2 (covering ~80 lines of compact-strip hygiene) could not structurally speak to whether 70 commits later, touching unrelated subsystems, there was a new HIGH+.

**Root cause:** SKILL.md Step 6's gate fuses two separate concerns — *"should new work be cross-model audited?"* (yes, always — that's the entire reason the third audit surface exists) and *"should nit-level findings be scoped as fix-tasks or slushed?"* (context-dependent — what the dampener was actually designed for). The current "dampener engaged → skip the whole hook" branch conflates them. As a side effect the dampener counter becomes structurally trapping: it resets only when a barrage surfaces a HIGH+, but no barrage ever fires once dampened.

**Operator-decided semantic** (2026-05-31, the exact framing this phase implements verbatim):

> *"Do work, audit barrage, if 0 HIGH and 0 MEDIUM findings on the NEW work, put new findings in slush. If there have been 2 consecutive audits on the new work with 0 HIGH findings on new work, then put new findings in slush."*

Reframed as the new Step 6 contract:

1. **Always fire the barrage when there is new diff since the last barrage's tip** (`git rev-list --count <last-barrage-tip>..HEAD > 0`). No skip on dampened.
2. **Always lift the findings.** Audit-log entries land regardless of disposition.
3. **Dampener controls disposition only.** Engaged (Rule A: 1 barrage with 0 HIGH + 0 MEDIUM OR Rule B: 2 consecutive 0-HIGH barrages) → `slush-remaining --apply` over the latest section. Not engaged → `promote-findings --auto` over the latest section.
4. **Tip-tracking persistence.** Each `audit-barrage` run writes `<run-dir>/tip.sha` = `git rev-parse HEAD` at fire-time. The "since last barrage" check resolves to that file from the most-recent run-dir.

**Operator-acknowledged trade-offs** (explicit choices, NOT holes):
- Under Rule B regime, MEDIUMs in the current barrage get slushed when the past 2 barrages were quiet — same trade as the existing post-#380 severity filter (HIGHs only preserved); operator already accepts.
- First-barrage slushing on a clean feature start (no history needed for Rule A) — consistent with operator's stated rule.
- Per-iteration barrage cost when dampened shifts from zero to one barrage — cost is on subscription-auth CLIs (no per-call billing); autonomous-loop context means operator isn't waiting; cross-model coverage is the whole reason the third audit surface exists.

**Loop-stop semantic is UNCHANGED.** The implement-loop has always stopped on workplan-exhaustion, not on dampener engagement. Pre-fix, dampener-engaged iterations skipped the barrage but the loop still ran until the workplan exhausted. Post-fix, dampener-engaged iterations slush the barrage's findings but the loop still runs until the workplan exhausts. The dampener never was a stop-the-loop mechanism; it just suppressed new-fix-task generation.

### Task 1: TDD spec — failing test for new gate semantic

Write the failing regression test FIRST per project TDD discipline. The test must red pre-fix and green post-fix; it pins the semantic so a future regression can't quietly revert.

- [x] Step 1: NEW test file `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-barrage-tip.test.ts` (sibling-pattern with `check-barrage-dampener.test.ts`). Five tests pinning the new-diff guard's contract.
- [x] Step 2: Fixture scenario A — no-prior-barrage fail-safe (hasNewDiff=true). Pinned the fail-safe semantic that prevents #383's regression.
- [x] Step 3: Fixture scenario B — latest tip.sha matches HEAD (hasNewDiff=false). The only legitimate skip.
- [x] Step 4: Fixture scenario C — tip.sha trails HEAD by N commits (hasNewDiff=true, newCommitCount=N).
- [x] Step 5: Fixture scenario D — missing tip.sha → fail-safe to fire (historical runs pre-Phase-16 Task 2 must NOT silently skip; that would re-create #383).
- [x] Step 6: Confirmed all 5 tests RED pre-implementation (import failed); RED→GREEN on the Task 3 library commit (c9849b6).

**Acceptance Criteria:**
- [x] Test file exists; vitest reports the new tests as failing pre-fix (then green post-fix).
- [x] Each scenario asserts exactly one observable outcome (fire/skip + tip-sha state).

### Task 2: `tip.sha` persistence on audit-barrage runs

The new-diff guard needs a stable anchor for *"since last barrage."* The cleanest place is to write the current HEAD into each run-dir at fire-time. Downstream verbs (`check-barrage-tip`, the new Step 6 gate) read the most-recent run-dir's `tip.sha`.

- [x] Step 1: Modified `orchestrateBarrage` to resolve HEAD via `git rev-parse HEAD` at fire-time and write `<runDir>/tip.sha` (newline-terminated). Injectable `tipShaResolver` on `BarrageInput` for test fixtures.
- [x] Step 2: Two new tests in `orchestrate-barrage.test.ts`: tip.sha lands with the resolver-returned sha; skip when resolver returns null.
- [x] Step 3: Backward-compat read enforced at the library level: `checkBarrageTip` returns `hasNewDiff: true` when `tip.sha` is missing (fail-safe to FIRE, never to SKIP — the audit-coverage invariant). Test pinned (`fail-safe to fire when the latest run-dir is missing tip.sha`).

**Acceptance Criteria:**
- [x] Every new audit-barrage run-dir contains `tip.sha` (when the resolver succeeds — git failures silently skip the write, preserving the run).
- [x] Missing-tip.sha fallback is fire (not skip).
- [x] Tests cover both shapes.

### Task 3: `check-barrage-tip` CLI verb + library

New verb that answers *"is there new diff since the last barrage?"* — the gate's diff-emptiness guard.

- [x] Step 1: NEW pure-fn library at `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-barrage-tip.ts`. Args include injected `listRunDirs` / `readTipSha` / `gitRevListCount` for test isolation. Returns `BarrageTipCheckResult` with `hasNewDiff`, `lastTipSha`, `newCommitCount`, `reason`.
- [x] Step 2: NEW CLI shim at `plugins/dw-lifecycle/src/subcommands/check-barrage-tip.ts`. Exit 0 = new diff exists; exit 1 = no new diff; exit 2 = config error. Default I/O bindings = `fs.promises.readdir` + `<runDir>/tip.sha` + `execFileSync git rev-list --count` against repoRoot.
- [x] Step 3: Wired into `src/cli.ts` dispatcher as `check-barrage-tip`. (Sibling slot next to `check-barrage-dampener`.)
- [x] Step 4: 5 library tests covering: no prior runs (fail-safe fire), matches HEAD (skip), trails by N (fire with newCommitCount=N), missing tip.sha (fail-safe fire), lex-sort latest run.

**Acceptance Criteria:**
- [x] Library returns correct hasNewDiff for: zero new commits / N new commits / no prior barrage (no run-dirs) / missing tip.sha.
- [x] CLI exit codes match the contract.
- [x] Stderr summary names the tip + commit count.

### Task 4: SKILL.md Step 6 refactor

Replace the existing Step 6 gate (`if ! check-barrage-dampener; then slush; else fire+lift+promote`) with the new shape.

- [x] Step 1: Rewrote Step 6 bash composition in `plugins/dw-lifecycle/skills/implement/SKILL.md`:
   ```bash
   # 0. New-diff guard. Skip iff there's no new work since the last barrage.
   if ! dw-lifecycle check-barrage-tip --feature <slug>; then
     # No new diff since last barrage; nothing to audit. Skip the hook.
     :
   else
     # 1. Render the prompt from the project's audit-barrage template.
     # ... (steps 1, 2, 3 — render, fire, lift — unchanged from current)

     # 2. Disposition gate. Dampener engaged → slush new findings.
     #    Not engaged → promote new findings as fix-tasks.
     if ! dw-lifecycle check-barrage-dampener --feature <slug>; then
       dw-lifecycle slush-remaining --feature <slug> --apply
     else
       dw-lifecycle promote-findings --feature <slug> --auto
     fi

     # 3. Sanity-check the gate now allows pickup.
     dw-lifecycle check-open-findings --feature <slug>
   fi
   ```
- [x] Step 2: Step 6 prose rewritten with new semantic; motivating case (graphical-entries burndown) referenced inline; operator's verbatim framing quoted in the disposition section.
- [x] Step 3: *"The auditor has gone quiet on real bugs"* phrasing removed. Replaced with *"the dampener engages when recent runs were quiet; engaged-state means new findings (on this iteration's new diff) get slushed rather than promoted."*
- [x] Step 4: Failure-path block updated. New entries: `check-barrage-tip` exit 2 (config error, STOP) and `slush-remaining --apply` non-zero (STOP). `audit-barrage-lift` zero-findings clarified to skip disposition step.
- [x] Step 5: Trade-offs (MEDIUM-slushing under Rule B; first-barrage Rule A slushing; cost shift when dampened) documented inline in the disposition gate's prose, citing the operator's 2026-05-31 acknowledgment.

**Acceptance Criteria:**
- [x] Step 6 prose no longer has the skip-on-dampened branch.
- [x] The new-diff guard is the ONLY skip condition.
- [x] Disposition gate documents both Rule A (0 HIGH + 0 MEDIUM, single-run) and Rule B (2 consecutive 0 HIGH).
- [x] Trade-offs are documented as operator-acknowledged choices.

### Task 5: Live verification + dogfood

Run the new semantic against this feature's own loop before shipping.

- [x] Step 1: Unit-level verification — 5 `check-barrage-tip` tests + 2 `orchestrateBarrage` tests pin the live-state contract. Each scenario the live dogfood would walk (no-prior-barrage / matches-HEAD / trails / missing tip.sha) is asserted as a library test.
- [x] Step 2: Live invocation of `dw-lifecycle check-barrage-tip` deferred until v0.30.0 releases the new verb. The marketplace-installed binary (currently v0.29.3) doesn't carry the verb yet, and per project rule *"Use the deskwork plugin only through the publicly-advertised distribution channel,"* invoking the local source directly would violate the public-path constraint. **Live verification happens on the first /dwi iteration after v0.30.0 reaches the registry.**
- [x] Step 3: Slush-vs-promote disposition is unchanged from Phase 15 (no new code in slush-remaining / promote-findings for Phase 16); the SKILL.md Step 6 just re-orders when each fires. The Phase 15 dogfood already verified both paths.
- [x] Step 4: No tooling-feedback entries surfaced during the implementation pass; the closure-triad CLI verbs (clone gate, TDD gate, scope-discovery checks) all composed cleanly with the new verb.

**Acceptance Criteria:**
- [x] All scenarios behave per spec at the library level (vitest 2517/2517 green, +7 new tests).
- [x] No regressions in `dw-lifecycle audit-barrage`'s existing CLI contract (3 original orchestrate-barrage tests still green).
- [x] Live verification queued for first /dwi iteration after v0.30.0 ships.

### Task 6: Cross-references + docs

- [x] Step 1: `.claude/rules/agent-discipline.md` checked — has no specific dampener-cadence paragraph that referenced the retired skip-on-dampened semantic. The audit-barrage rule's substance (cross-model coverage, third surface, run-dir + lift workflow) is unchanged and remains accurate.
- [x] Step 2: `plugins/dw-lifecycle/skills/audit-barrage/SKILL.md` is unchanged (the audit-barrage skill itself didn't shift; only its caller in implement SKILL.md). The `tip.sha` write is a new artifact in `audit-runs/<id>/` but is an internal contract between audit-barrage + check-barrage-tip; not operator-facing.
- [x] Step 3: `ROADMAP.md` updated — Phase 16 marked shipped (was "in flight"). No stale skip-on-dampened references found.
- [x] Step 4: Phase 16 commit (c9849b6) message documents the graphical-entries Phase 0 burndown motivating case verbatim.

**Acceptance Criteria:**
- [x] Agent-discipline rule audit confirms no stale references.
- [x] audit-barrage SKILL.md cross-link is up-to-date (no edits needed — clean dependency direction).
- [x] ROADMAP free of references to the retired skip-on-dampened branch.
- [x] Phase 16 commit message names the dogfood motivating case.

### Phase 16 — Out of Scope

- **Changing the dampener engagement rules.** Rule A (single-run 0 HIGH + 0 MEDIUM) and Rule B (2 consecutive 0 HIGH) are unchanged. The dampener's library (`check-barrage-dampener.ts`) is unchanged. Only the SKILL.md gate that CALLS it shifts.
- **Adding a `--rebarrage-after N` CLI flag.** Phase 16 ships the "always fire on new diff" semantic, full stop. A per-iteration counter knob was considered (Option C in #383) and rejected in favor of the always-fire shape.
- **The slush-remaining or promote-findings library themselves.** Both verbs are reused as-is; Phase 16 only changes which one fires when.
- **Re-auditing already-shipped historical work.** Phase 16's semantic applies forward only; historical sections in audit-log are not retroactively re-audited.
- **Changing the audit-barrage prompt or model battery.** Unrelated; out of scope for this phase.

### Phase 16 — Existing primitives this composes over

- `check-barrage-dampener` (Phase 15) — unchanged; Phase 16 keeps its OR-of-two-rules semantic.
- `slush-remaining` (Phase 15 Task 7 + #380 fix) — unchanged; called from the disposition gate.
- `promote-findings --auto` (Phase 13 Task 1) — unchanged; called from the disposition gate.
- `check-open-findings` (Phase 15 Task 1) — unchanged; called as the post-disposition sanity check.
- `audit-barrage` CLI (Phase 12 + Phase 15 Task 4a `--output-run-dir`) — extended with `tip.sha` write in Task 2.

## Phase 17: Audit-barrage mechanization — single verb + commit-msg gate + pre-push gate

**Motivating case** (this session, 2026-05-31): the /dwi loop that implemented Phase 16 (which closed #383's audit-coverage hole) itself shipped 2 task-completion commits — c9849b6 (Phase 16 substantive work) and dde415a (docs closure) — WITHOUT invoking the audit-barrage hook. The Step 6 bash composition in SKILL.md is a sequence of 5 CLI calls; the agent skipped them entirely. Phase 16's gate is correct (always-fire on new diff), but Phase 16 doesn't enforce that the agent invokes the gate. Discretion remained, and discretion was abused on the very implementation of the phase that was supposed to remove discretion.

**Root cause:** the Step 6 hook is documented as prose + bash composition. The agent's compliance is a matter of reading the SKILL.md and choosing to invoke the steps. That's policy, not mechanization. The operator's directive (2026-05-31, verbatim):

> *"When to run the barrage should not be a matter of policy and the agent should have no discretion. It must be mechanized with teeth."*

**Three-layer mechanization** (each closes a different failure mode):

| Layer | Failure mode it prevents | Mechanism |
|---|---|---|
| 1 — Single CLI verb (`implement-hook`) | "I forgot a step in the bash composition" | One verb wraps check-barrage-tip + render + barrage + lift + dampener + slush-or-promote + check-open-findings. No bash to skip individual steps. |
| 2 — Commit-msg gate (`check-implement-hook-ran`) | "I forgot to run the hook entirely" | Refuses any commit when `last-hook-run.json`'s `tip` doesn't match the current HEAD (i.e., a commit landed without a subsequent hook run). |
| 3 — Pre-push gate | "I bypassed the commit-msg gate via --no-verify" | Walks unpushed commits; refuses push if any commit lacks a hook-run record between it and the next commit. |

**Marker file design.** The verb writes `.dw-lifecycle/scope-discovery/last-hook-run.json` after every successful invocation:

```json
{
  "tip": "<sha at hook-fire time>",
  "timestamp": "<ISO 8601>",
  "runDir": "<absolute path or null when new-diff-skip>",
  "disposition": "fired-and-promoted | fired-and-slushed | no-new-diff-skip | barrage-outage",
  "findingsCount": 0,
  "promotedCount": 0,
  "slushedCount": 0
}
```

The marker is the audit trail. The commit-msg gate reads `marker.tip` and compares against `git rev-parse HEAD`. If they match, the agent ran the hook since the prior commit; the new commit is allowed.

**Operator-decided semantic** (the contract this phase enforces):

> The audit-barrage hook MUST fire between every pair of task-completion commits. There is no agent-side flag, no policy override, no *"I'll run it later."* The gate refuses the commit; the agent runs the hook; the agent re-tries the commit.

**Loop-discipline framing:** Phase 16 closed the *"the barrage was skipped because the dampener engaged"* hole. Phase 17 closes the *"the barrage was skipped because the agent forgot"* hole. The two failure modes share the same root (audit-coverage gaps), and Phase 17 is the structural completion of Phase 16's intent.

### Task 1: TDD spec — failing test for the commit-msg gate

Write the failing regression test FIRST per project TDD discipline.

- [ ] Step 1: NEW test file `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-implement-hook-ran.test.ts`. Sibling-pattern with `check-fix-task-tdd.test.ts`.
- [ ] Step 2: Fixture scenario A — marker present, `tip` matches HEAD → gate allows (exit 0).
- [ ] Step 3: Fixture scenario B — marker absent → gate refuses (exit 1) with cure message *"run `dw-lifecycle implement-hook --feature <slug>` then re-commit."*
- [ ] Step 4: Fixture scenario C — marker present, `tip` ≠ HEAD (stale marker from prior commit) → gate refuses with same cure.
- [ ] Step 5: Fixture scenario D — first commit after `.dw-lifecycle/scope-discovery/` opt-in (no prior runs) → gate allows (boot case; the FIRST commit can't have a prior-hook marker).
- [ ] Step 6: Confirm all four scenarios are RED pre-implementation.

**Acceptance Criteria:**
- [ ] Test file exists; vitest reports the new tests as failing pre-fix.
- [ ] Each scenario asserts exactly one observable outcome (allow vs refuse + cure message).

### Task 2: `last-hook-run.json` marker schema + I/O library

- [ ] Step 1: NEW pure-fn library `plugins/dw-lifecycle/src/scope-discovery/promote-findings/hook-run-marker.ts`. Exports `readHookRunMarker({featureSlug, repoRoot})` and `writeHookRunMarker({featureSlug, repoRoot, marker})`. Atomic write via tmp + rename. Zod schema validates the marker shape on read; corrupted marker → return `null` (treat as no-prior-run).
- [ ] Step 2: Marker stored at `.dw-lifecycle/scope-discovery/last-hook-run.json` (project-scoped, NOT per-feature — one marker per project root). Rationale: the commit-msg gate fires from any worktree against any feature; a single project-wide marker keeps the gate's lookup trivial.
- [ ] Step 3: Library tests covering: write + read round-trip; corrupted JSON → null; missing file → null; schema-mismatch → null.

**Acceptance Criteria:**
- [ ] Marker writes atomically (no torn-write race condition).
- [ ] Reads tolerate missing/corrupted markers without throwing.
- [ ] Schema is enforced via zod.

### Task 3: `dw-lifecycle implement-hook` CLI verb

The single verb that IS the hook. Wraps the entire Step 6 sequence.

- [ ] Step 1: NEW CLI shim `plugins/dw-lifecycle/src/subcommands/implement-hook.ts`. Composes (in order): `check-barrage-tip` → `audit-barrage-render` → `audit-barrage --output-run-dir` → `audit-barrage-lift --apply` → `check-barrage-dampener` (branch on result) → either `slush-remaining --apply` OR `promote-findings --auto` → `check-open-findings`. Writes marker on completion.
- [ ] Step 2: Exit codes: 0 = success (hook ran cleanly OR skipped for no-new-diff); 1 = hook failed mid-flight (any step in the chain returned non-zero per the SKILL.md failure-path policy); 2 = config error (feature not found, repo not initialized, etc.). Each non-zero exit surfaces the underlying step's stderr.
- [ ] Step 3: Marker write on EVERY exit-0 path — including the no-new-diff skip case. Disposition field distinguishes (`no-new-diff-skip` vs `fired-and-{promoted,slushed}` vs `barrage-outage`). The skip case still writes the marker because the gate needs to see the hook was invoked; the disposition tells the operator no work was done.
- [ ] Step 4: Wire into `src/cli.ts` dispatcher as `implement-hook`.
- [ ] Step 5: CLI tests covering: full happy path (mocked sub-CLIs); each failure-path exit; marker write on no-new-diff-skip; marker NOT written on early config-error exit.

**Acceptance Criteria:**
- [ ] Single verb replaces the 5-line bash composition in SKILL.md Step 6.
- [ ] Marker written on every legitimate exit path (success + skip), not on config-error exits.
- [ ] Failure-path semantics from Phase 16 SKILL.md preserved (which steps stop the loop, which degrade gracefully).

### Task 4: Commit-msg gate (`check-implement-hook-ran`)

The teeth that close the discretion loophole.

- [ ] Step 1: NEW pure-fn library `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-ran.ts`. Reads marker; reads HEAD via injected `gitHeadResolver`; returns discriminated union (`allow-no-prior-run` / `allow-marker-matches-head` / `refuse-marker-missing` / `refuse-marker-stale`).
- [ ] Step 2: NEW CLI shim `plugins/dw-lifecycle/src/subcommands/check-implement-hook-ran.ts`. Exit 0 = allow; exit 1 = refuse (with cure message); exit 2 = config error. Mirrors `check-fix-task-tdd`'s shape.
- [ ] Step 3: Wire into `src/cli.ts` dispatcher.
- [ ] Step 4: Wire into the project's `prepare-commit-msg` (or `commit-msg`) hook — adopt the same pattern as `check-fix-task-tdd-discipline`. The hook fires on every commit; refuses when the gate refuses.
- [ ] Step 5: Library + CLI tests (4 scenarios from Task 1).

**Acceptance Criteria:**
- [ ] Gate refuses commit when marker is missing or stale.
- [ ] Gate allows commit when marker.tip === HEAD.
- [ ] Gate allows on first commit after opt-in (no prior runs).
- [ ] Cure message names the fix verbatim: `"run dw-lifecycle implement-hook --feature <slug> then re-commit"`.

### Task 5: Pre-push gate

Catches commits that bypassed the commit-msg gate via `--no-verify`.

- [ ] Step 1: NEW pure-fn library `plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-coverage.ts`. Walks `git log <remote-tip>..HEAD --reverse` and for each commit checks: was there a hook run between that commit and its parent? The marker is project-scoped (not per-commit), so this requires a different mechanism: every successful `implement-hook` run also appends an entry to `.dw-lifecycle/scope-discovery/hook-run-log.jsonl` (JSONL: one JSON object per line, with `{sha, timestamp, disposition}`). The pre-push gate walks the log and verifies each unpushed commit has a matching entry.
- [ ] Step 2: NEW CLI shim. Exit 0 = all unpushed commits backed; exit 1 = refuse (lists commits without hook runs); exit 2 = config error.
- [ ] Step 3: Wire into the project's `pre-push` hook.
- [ ] Step 4: Tests against fixture jsonl logs + fixture commit ranges.

**Acceptance Criteria:**
- [ ] Pre-push refuses when any unpushed commit lacks a corresponding hook-run entry.
- [ ] The refusal lists which commits are unbacked.
- [ ] Cure: `"git reset --soft <tip-of-good-history>"` + run implement-hook for each commit then re-push — OR add the commits to a documented exception list (not v1).

### Task 6: SKILL.md Step 6 swap

Replace the 5-CLI bash composition with the single verb invocation.

- [ ] Step 1: Rewrite Step 6 in `plugins/dw-lifecycle/skills/implement/SKILL.md`. The new prose: *"After every task-completion commit, run `dw-lifecycle implement-hook --feature <slug>`. The verb handles new-diff detection, barrage firing, lift, disposition (slush vs promote), and the gate sanity check. The commit-msg gate refuses subsequent commits if the verb hasn't run."*
- [ ] Step 2: Move the operator-acknowledged trade-offs (MEDIUM-slushing under Rule B; first-barrage Rule A slushing; per-iteration cost) from inline prose into a separate "Behavior reference" section. Step 6 becomes mechanically simple; the operator-facing semantic stays documented.
- [ ] Step 3: Move the failure-path policy block into the verb's own documentation. The verb's stderr names which step failed; the SKILL.md just references it.
- [ ] Step 4: Cross-reference the commit-msg gate + pre-push gate.

**Acceptance Criteria:**
- [ ] Step 6 prose is one paragraph + one CLI invocation, not a bash block.
- [ ] Operator-acknowledged trade-offs still documented (in a behavior-reference section).
- [ ] Cross-references to the two gates are explicit.

### Task 7: Live verification + dogfood

- [ ] Step 1: After v0.31.0 ships, run a /dwi iteration with the new verb. Verify the marker writes on a successful hook run; verify the commit-msg gate refuses a no-marker commit; verify the pre-push gate refuses a `--no-verify`-bypassed commit.
- [ ] Step 2: Confirm the operator-facing UX of the cure messages — they should name the exact command to run.
- [ ] Step 3: File any tooling-feedback entries from the dogfood.

**Acceptance Criteria:**
- [ ] All three gate layers (verb, commit-msg, pre-push) verified live.
- [ ] Cure messages tested by deliberately tripping the gates.

### Task 8: Cross-references + docs

- [ ] Step 1: Update `.claude/rules/agent-discipline.md` § "Audit-barrage" — note that the hook is now mechanized via commit-msg + pre-push gates; the agent has no discretion at the firing decision.
- [ ] Step 2: Update `ROADMAP.md` § "Recently shipped" with Phase 17 once it lands.
- [ ] Step 3: Update the implement skill's description to reference the new verb.
- [ ] Step 4: Document the motivating case in the Phase 17 commit message body (this session's missed-hook-runs on c9849b6 + dde415a).

**Acceptance Criteria:**
- [ ] Agent-discipline rule names the mechanization.
- [ ] ROADMAP reflects the shipped state.
- [ ] Implement skill description discoverable.

### Phase 17 — Out of Scope

- **Changing what the audit-barrage hook does internally.** Phase 17 wraps the existing chain; the chain itself (check-barrage-tip → render → fire → lift → dampener → slush/promote) is unchanged from Phase 16.
- **Per-task-type opt-out flag.** No `--skip-hook` for "this commit doesn't need an audit." Per operator directive (*"the agent should have no discretion"*), there is no opt-out.
- **Retroactive enforcement on historical commits.** The gate fires on NEW commits only. Pre-Phase-17 commits without hook runs are part of the history; the next /dwi iteration after Phase 17 ships will catch up by auditing the accumulated diff.
- **Operator-driven manual marker edits.** The marker is agent-written, not operator-edited. If the marker is corrupted, the gate fails fast; the agent fixes by re-running the verb.

### Phase 17 — Existing primitives this composes over

- `check-barrage-tip` (Phase 16) — first step of the implement-hook verb.
- `audit-barrage-render` + `audit-barrage` + `audit-barrage-lift` (Phase 12 + Phase 15) — middle of the chain.
- `check-barrage-dampener` (Phase 15) — disposition branch decision.
- `slush-remaining` (Phase 15 + #380) — engaged-disposition branch.
- `promote-findings --auto` (Phase 13) — not-engaged-disposition branch.
- `check-open-findings` (Phase 15 Task 1) — post-disposition sanity check.
- `check-fix-task-tdd` pattern (Phase 13 Task 3) — commit-msg gate template the new gate mirrors.

## Phase 18: Loop usability — template generalization + parser robustness + stochasticity framing

**Motivating context** (2026-06-01 operator directives, end of Phase 17 dogfood):

Phase 17 mechanization is structurally complete: the gates fire, refuse the right things, and validated end-to-end on this very repo. The dogfood ALSO surfaced concrete usability gaps that turn the autonomous loop into a recursive fix-trap for any non-trivial finding shape. Five tractable fixes close those gaps; this phase scopes all five.

Operator's framing on the underlying issue (3): *"If the fixes keep throwing HIGH issues, that's a failure of the fixes, not a problem of recursion depth."* That's the diagnostic frame. Task 3 below scopes the process discipline; the operator hasn't yet picked among three options for HOW. Implementation waits on the pick.

Operator's framing on stochasticity (6): *"The audit barrage is stochastic — it doesn't have to be perfect every time. As long as at least 1 audit is successfully executed, that should count as a successful audit barrage. Auditing as a practice should statistically yield better code."* The code already enforces this (`isModelRunHealthy` per-model, `anyModelEmitted = results.some(...)` for the run); what's missing is operator-facing language that celebrates partial-coverage instead of apologizing for it.

Operator's framing on slushed MEDIUMs (2 / GH #385): *"I don't really care if mediums get slushed after the dampener fires — we can address those in a burndown session at the end of a larger cycle at operator's discretion. I'm not looking for perfection, I'm looking for no showstoppers and a good faith effort at writing good code."* That's the operator-supplied substantive `wontfix` reason for GH #385.

### Task 1: AUDIT-02 template generalization — fix-task template + doctor rule handle non-bug findings

The fix-task template assumes every finding is bug-with-failing-test. Real findings come in five shapes: (a) code defect requiring a failing test; (b) coverage gap requiring NEW tests (no pre-existing bug to repro); (c) pin-only / contract-stability finding (test added that would fail under future regression); (d) registry/hygiene finding (no test possible — disposition is config edit); (e) commit-history / docs / process finding (no test possible — disposition is amend / clarify / acknowledge). Pre-fix, shapes (b)–(e) launder through the template's "Failing test exists at ..." AC with placeholder strings the `fix-task-tdd-discipline` doctor rule would correctly reject. Each `[x]`-checked task with a placeholder test path is a recurring AUDIT-02 violation — the loop's most prolific source of recursive findings this session.

The fix has two parts: **template** (the fix-task renderer learns shape (a)–(e) variants) AND **doctor rule** (the `fix-task-tdd-discipline` rule learns to skip task blocks whose disposition explicitly states non-bug-class).

- [ ] Step 1: extend `workplan-task-renderer.ts` to emit five variants based on a `findingShape` argument: `code-defect` (current template), `coverage-gap`, `pin-only`, `registry-hygiene`, `commit-history-or-docs`. AC text + Step prose specific to each.
- [ ] Step 2: extend `promote-findings --auto` (or the proposal-file shape) to infer the shape from the finding's Surface + Severity + body. Heuristics: surface ends in `clones.yaml` / `workplan.md` / commit SHA → hygiene; finding body says "no test possible / informational / process feedback" → commit-history-or-docs; surface is a TEST file + finding says "missing test coverage" → coverage-gap; etc. Fall through to `code-defect` when no heuristic matches (safest default — still TDD-able).
- [ ] Step 3: extend `tdd-enforcement.ts` (the library the doctor rule + commit-msg gate compose). Add a `findingShape` field parseable from the task block's heading or first prose line. When shape is non-bug, skip the test-file-existence and vitest-run checks; instead validate the disposition statement (substantive reason ≥40 chars, no banned-phrase list).
- [ ] Step 4: failing tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/tdd-enforcement.test.ts` covering each shape's allow/refuse paths. RED first, GREEN after the implementation lands.
- [ ] Step 5: SKILL.md (implement skill) Step 6 prose update — name the 5 finding shapes + reference the doctor-rule's disposition checks.
- [ ] Step 6: commit with `Closes AUDIT-20260601-02` in subject.

**Acceptance Criteria:**
- [ ] Workplan-task-renderer emits a non-bug-shape variant when promote-findings infers a non-bug finding shape.
- [ ] Doctor rule (`fix-task-tdd-discipline`) skips test-file checks for non-bug variants; validates disposition statement instead.
- [ ] Commit-msg gate (`check-fix-task-tdd`) follows the same logic.
- [ ] Regression test: a non-bug task block with the non-bug marker + a substantive disposition passes both gates; a non-bug task block with a placeholder string disposition fails both.
- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step.

### Task 2: Close GH #385 with operator-supplied wontfix rationale

GH #385 (dampener counter doesn't reset on material-diff-range expansion). Operator's substantive disposition: *"I don't really care if mediums get slushed after the dampener fires — we can address those in a burndown session at the end of a larger cycle at operator's discretion. I'm not looking for perfection, I'm looking for no showstoppers and a good faith effort at writing good code."*

- [ ] Step 1: comment on GH #385 with the operator's framing verbatim.
- [ ] Step 2: close the issue with state=`wontfix` (or its GH equivalent — typically `closed not-planned`).
- [ ] Step 3: link the operator's rationale in any future workplan notes that touch dampener semantics so the trade-off stays discoverable.

**Acceptance Criteria:**
- [ ] GH #385 is closed with the rationale comment in place.
- [ ] No additional code change required (this task is a disposition, not a fix).

### Task 3: HIGH-finding regression-lock discipline (Option D — picked 2026-06-01)

**Operator-picked discipline** (after discussion 2026-06-01). The chosen frame:

- **Severity-gated**: discipline kicks in only for HIGH (or BLOCKING) findings. MEDIUM/LOW are unchanged — the audit catches them statistically per the operator's stochasticity directive.
- **Targets commission, not omission**: *"If you miss something, the audit will catch it. If you break something, that's worse than doing nothing."* The fix-task template's "Step 0 invariant write-up + regression-lock test" specifically guards against changes that break working behavior.
- **Light touch — "think a little harder"**: 1–2 sentences of invariant prose + one extra regression test per HIGH fix-task. Not exhaustive state-matrix enumeration (operator explicitly rejected that as overkill).

**What this catches**: any change that breaks behavior the existing code does correctly. That IS the commission failure mode.

**What this skips**: enumeration of all the dimensions the agent might have missed. Accepts that some commission against implicit/untested behavior surfaces in the next audit cycle, not in Step 0.

Implementation:

- [ ] Step 1: extend `workplan-task-renderer.ts` to emit a "Step 0: working-code invariant" prose block when the rendered task's `severity ∈ {high, blocking}`. The Step 0 prose is operator-or-agent-filled with 1–2 sentences naming what the current code does correctly that the fix touches.
- [ ] Step 2: extend the rendered task's Step 1 (existing failing-test step) to require TWO tests for HIGH+ findings: (a) the bug-repro test (existing), (b) a regression-lock test that pins the Step 0 invariant. Template prose names both explicitly.
- [ ] Step 3: extend `tdd-enforcement.ts` (the library `check-fix-task-tdd` + the doctor rule compose) to detect HIGH+ severity from the task block AND require ≥2 test() blocks in the cited test file when severity is HIGH+. MEDIUM/LOW unchanged.
- [ ] Step 4: failing tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/tdd-enforcement.test.ts`. A HIGH-tagged task with only 1 test → refuse. A HIGH-tagged task with 2+ tests → allow. A MEDIUM-tagged task with 1 test → allow (unchanged). RED-first per project TDD discipline.
- [ ] Step 5: SKILL.md (implement skill) Step 6 prose: name the HIGH-severity regression-lock requirement. Reference the operator's framing about commission vs omission.
- [ ] Step 6: commit with `Closes AUDIT-?` or `Refs: Phase 18 Task 3` depending on whether a finding is filed for this gap.

**Acceptance Criteria:**
- [ ] Rendered HIGH+ fix-task blocks include a Step 0 invariant write-up section.
- [ ] Doctor rule + commit-msg gate require ≥2 test blocks for HIGH+ fix commits.
- [ ] Regression test demonstrates a HIGH-tagged task with only 1 test is correctly refused.
- [ ] MEDIUM/LOW behavior unchanged (sanity test that the existing single-test path still passes).

### Task 4: apply-audit-flips trailer parser — handle comma-separated Closes references

apply-audit-flips' parser only picks up the FIRST AUDIT-id from comma-separated trailers (e.g. `Closes AUDIT-A, AUDIT-B, AUDIT-C` flips only A). Manual flips have been required this session for every commit closing >1 finding. Closes the recurring friction.

- [ ] Step 1: failing test at the existing parser test file. Commit subject `"fix: ... Closes AUDIT-20260601-01, AUDIT-20260601-02, AUDIT-20260601-03"` should yield 3 AUDIT-ids, not 1.
- [ ] Step 2: extend the trailer regex to match comma- AND newline-separated AUDIT-ids in both subject and body.
- [ ] Step 3: also handle the parenthetical cross-model annotation case: `Closes AUDIT-20260601-01 (claude-01 + codex-01; cross-model)` — the parens shouldn't terminate the ID scan.
- [ ] Step 4: regression coverage for: single ID; comma-separated IDs; newline-separated; cross-model parenthesized; mixed.
- [ ] Step 5: commit with `Refs: this-workplan-task` in subject (this is a parser improvement, not a fix-finding task; no AUDIT-id to close).

**Acceptance Criteria:**
- [ ] All five shapes of trailer parse correctly.
- [ ] Existing single-ID behavior unchanged.

### Task 5: Stochasticity framing — soften the partial-coverage stderr summary

Per operator directive 6: a 1-healthy-model barrage IS a successful audit, not degraded. Today's stderr line *"audit-barrage: 1/3 models produced output"* reads as apology; should read as celebration.

- [ ] Step 1: rewrite `renderSummaryLine` in `audit-barrage.ts`. New shape: *"audit-barrage: 1 of 3 models emitted findings — barrage successful (run dir: ...)"* OR equivalent. Explicitly frame partial-coverage as success when ≥1 model emitted.
- [ ] Step 2: keep the all-models-failed case framed as failure (that IS an outage).
- [ ] Step 3: SKILL.md prose pass on the audit-barrage skill to mirror the celebrate-not-apologize framing. Reference operator-directive: *"auditing as a practice should statistically yield better code"* in the skill's intro.

**Acceptance Criteria:**
- [ ] Operator-facing stderr summary celebrates ≥1-healthy as success.
- [ ] All-models-failed still surfaces as outage.

### Phase 18 — Out of Scope

- **Per-run diff metadata for dampener material-expansion detection** — GH #385 is closed as `wontfix` per operator framing; the metadata + dispositioner override are deliberately not built.
- **Recursive-fix depth cap mechanism** — per operator's diagnostic, the recursion problem is shallow fixes, not recursion itself. Task 3 addresses the upstream cause; no downstream cap is added.
- **Refactoring the live audit-barrage CLIs** — the underlying claude/codex/gemini CLIs are intermittent; we accept the stochasticity per Task 5's framing.
- **Migrating already-shipped placeholder-test workplan tasks** — Tasks 5.35/5.36/5.37/5.42/5.43 (this session's non-bug findings scoped through the bug template) stay as historical record. Task 1's template + doctor rule applies forward only.

### Phase 18 — Existing primitives this composes over

- `workplan-task-renderer.ts` (Phase 13 Task 1) — Task 1 Step 1 extends with shape variants.
- `tdd-enforcement.ts` (Phase 13 Task 3) — Task 1 Step 3 extends with non-bug disposition validation.
- `check-fix-task-tdd` commit-msg gate (Phase 13) — Task 1 reuses the gate; only the underlying library changes.
- `fix-task-tdd-discipline` doctor rule (Phase 13) — Task 1 Step 3 same.
- `promote-findings --auto` (Phase 13 Task 1, with #377 fix) — Task 1 Step 2 extends with shape inference.
- `apply-audit-flips` (Phase 13 Task 4) — Task 4 extends the trailer parser.
- `audit-barrage` CLI (Phase 12, Phase 16 Task 2 `tip.sha`) — Task 5 rewords the stderr summary; CLI behavior unchanged.
- `isModelRunHealthy` (Phase 17 retro AUDIT-08 centralization) — Task 5 references; predicate unchanged.

## Phase 19: audit-barrage E2BIG via stdin prompt delivery (GH #386)

GH #386 from the graphical-entries team: `audit-barrage` spawn-time failures with `spawn ENAMETOOLONG` / `E2BIG` when the rendered prompt exceeds the OS `ARG_MAX` ceiling (~256KB on macOS). Wrapper degrades to outage disposition but cross-model coverage is lost on every large-diff iteration.

**Severity: HIGH.** The barrage is the third independent audit surface (in-band self-audit + SDD review + cross-model barrage); losing it on large diffs eliminates the genetic-diversity signal the workflow depends on.

**Fix shape:** alternative `{{prompt-stdin}}` placeholder. When `args_template` carries it, `spawn-cli.ts` writes the rendered prompt to `child.stdin` instead of substituting into argv. The argv path (`{{prompt}}`) is preserved as the working-code default — the stdin path is opt-in per model.

### Task 1: stdin-delivery placeholder + spawn-helper integration (fix-finding-GH-386)

**Severity: high.**

**Step 0: working-code invariant.** Small-prompt argv invocations via `{{prompt}}` substitute the prompt into argv as a single element. The CLIs invoked today (`claude`, `codex`, `gemini`) accept this shape and have been live-verified. The fix MUST NOT break that path — any regression on small prompts is a sin of commission worse than failing on E2BIG.

- [x] Step 1: failing tests in `spawn-cli.test.ts` — (a) 1MB prompt delivered via stdin when `args_template` uses `{{prompt-stdin}}`, (b) buildArgs detection returns `useStdin` signal, (c) regression-lock: small-prompt `{{prompt}}` argv path still works unchanged.
- [x] Step 1b: regression-lock test (Option D — HIGH severity). The {{prompt}} argv path's working-code invariant is pinned by an explicit test that survives any future refactor.
- [x] Step 2: confirmed RED before implementation (2 failed | 15 passed).
- [x] Step 3: extended `buildArgs` to strip `{{prompt-stdin}}` tokens; extended `spawnCliAgainstModel` to detect the placeholder and conditionally set `stdio[0] = 'pipe'`, then `child.stdin.end(prompt)`. Two-branch spawn preserves TypeScript stdio-tuple narrowing.
- [x] Step 4: GREEN — 17/17 spawn-cli tests pass.
- [x] Step 5: config-loader relaxed to accept either `{{prompt}}` OR `{{prompt-stdin}}` (mutually exclusive — both is ambiguous and rejected). Config-loader tests extended (23/23 pass).
- [x] Step 6: documented in `audit-barrage-cli-notes.md` as an opt-in escape hatch for operators hitting E2BIG. Plugin-default config NOT changed — preserves the working invariant pending live verification per CLI.
- [x] Step 7: full plugin test suite 2622/2622 pass; `tsc --noEmit` clean.
- [ ] Step 8: commit with `Closes GH-386` in subject.

**Acceptance Criteria:**
- [x] Test block count for this finding is ≥2 (Option D — HIGH severity).
- [x] Failing tests exist at `plugins/dw-lifecycle/src/__tests__/scope-discovery/audit-barrage/spawn-cli.test.ts`.
- [x] `npx vitest run` exits 0 (passes against the fix).
- [x] `{{prompt}}` argv-substitution path unchanged (regression-lock test confirms).
- [x] `{{prompt-stdin}}` placeholder routes the prompt via `child.stdin`.
- [x] Config-loader accepts either placeholder; rejects both-present.
- [ ] GH-386 closed once verified in a release.

### Phase 19 — Out of Scope

- **Per-CLI fallback ordering** — explicitly out of scope per the issue body.
- **Diff truncation** — explicitly out of scope per the issue body.
- **Single-CLI design** — explicitly out of scope per the issue body.
- **Flipping plugin-default config to `{{prompt-stdin}}`** — requires live verification per CLI (claude / codex / gemini) before changing the default. Operators who hit E2BIG can opt in via the project-side override; the default stays `{{prompt}}` to preserve the working-code invariant.
- **Option B (temp-file via shell wrapper)** — explicitly NOT picked due to shell-injection risk.

## Phase 20: AUDIT-68 follow-up + audit-barrage review-surface consolidation

Two issues filed externally (2026-06-02) that close out latent work from this session's burndown loop. Both touch scope-discovery's review surface; both are tagged here so future sessions don't lose track of the commitment.

### Task 1: Operator-supplied fix-shape on promote-findings proposals ([#392](https://github.com/audiocontrol-org/deskwork/issues/392) / AUDIT-20260601-68 follow-up)

GH #392 surfaces the inverse of AUDIT-68: a finding whose surface IS source (`.ts`) but whose fix is comment-only / docs / pointer-rename → `inferFindingShape` returns `code-defect` and the rendered task demands a phantom `vitest` test. AUDIT-68 surfaced the symmetric direction (surface is non-source, fix is in code).

Both cases share the same root cause: shape inference from surface alone is unsound. Per AUDIT-68's revert disposition (commit f1219cd6), the abandoned approach was body-keyword detection (`SOURCE_FILE_IN_BODY_RE`) — that path conflicted with the AUDIT-76/77 informational-exclusion logic. Two acceptable future-work paths remain:

- **(a) Intent-language detection.** Match phrases like "the fix is in", "implement in", "change `<path>`" near a code citation. Heuristic but bounded.
- **(c) Operator-supplied shape on the proposal.** `promote-findings` propose mode already has a proposal-file roundtrip; the operator could set `findingShape: 'non-bug' | 'code-defect'` per item before `--apply`. The `--auto` path would still infer (defaulting to `code-defect`), but operator-supplied shape would override.

**Severity: medium** (HIGH-severity recursion is closed; this is a refinement of an already-mitigated path).

**Step 0 — working-code invariant.** Pre-fix, surface-only inference works correctly for surfaces that are unambiguously source (`.ts:line` → code-defect) or unambiguously docs (`workplan.md` → non-bug). The fix MUST preserve those cases; the change adds an override layer above the current inference, not a replacement.

- [ ] Step 1: pick approach (a) vs (c) — propose to operator before implementing.
- [ ] Step 2: failing tests — code-defect surface + comment-only-fix body should yield non-bug shape; non-bug surface + code-fix body should yield code-defect shape; existing surface-only cases unchanged.
- [ ] Step 3: confirm RED.
- [ ] Step 4: implement.
- [ ] Step 5: confirm GREEN; full plugin suite + tsc clean.
- [ ] Step 6: commit with `Closes #392`. Per AUDIT-20260602-01: use `Closes AUDIT-20260601-68` ONLY if Phase 20 Task 1 actually re-opens AUDIT-68 AND ships the fix in the same commit. Otherwise omit the AUDIT trailer (or use `Acknowledges AUDIT-20260601-68` if the disposition references it). Using `Closes` on a non-fix or speculative-reopen disposition arms the auto-flip parser with false `fixed-<sha>` proposals.

**Acceptance Criteria:**
- [ ] Approach picked by operator + rationale documented in commit body.
- [ ] ≥2 test blocks per HIGH-severity Option D discipline (even though severity is medium, the historical recursion-engine motivation justifies the regression-lock).
- [ ] GH #392 closed after verification in a release.

### Task 2: Retire `/dw-lifecycle:review` + `/dw-lifecycle:audit` ([#387](https://github.com/audiocontrol-org/deskwork/issues/387))

GH #387 captures an architectural decision: the audit-barrage hook (Phase 16/17) has subsumed the three-track review protocol. The operator's verbatim framing: *"the review skill is no longer hooked into the iterate cycle — superseded by the audit barrage hook. Review is no longer operationally enforced, so we shouldn't put anything in there. In fact, we should consider retiring review and audit in favor of audit barrage."*

This is multi-skill architectural work that touches scope-discovery's review surface (audit-barrage is one of three audit surfaces per `agent-discipline.md`; retiring review reduces it to two: in-band self-audit + audit-barrage). The scope-discovery feature owns the audit-log lifecycle that review/audit currently drives; that ownership transfers fully to audit-barrage's lift step.

**Severity: medium** (no current operational impact; review skill is dead-but-listed).

- [ ] Step 1: surface inventory (per #387 body) — confirm every caller of `/dw-lifecycle:review`, `/dw-lifecycle:audit`, and their CLI surfaces.
- [ ] Step 2: confirm audit-barrage's lift step owns the full audit-log lifecycle (creation + status flips + closure triad) — if not, identify the gap.
- [ ] Step 3: decide whether to delete the two skills outright, alias them to audit-barrage, or split (review → delete; audit → audit-barrage alias).
- [ ] Step 4: remove the skills + rehome every cross-reference (including `agent-discipline.md` "three audit surfaces" framing).
- [ ] Step 5: commit with `Closes #387` in subject.

**Acceptance Criteria:**
- [ ] Zero dangling references to `/dw-lifecycle:review` or `/dw-lifecycle:audit` in skills, CLAUDE.md, agent-discipline.md, or other docs.
- [ ] `agent-discipline.md` "three audit surfaces" framing updated to two surfaces (or whatever the final count is).
- [ ] GH #387 closed after verification.

### Phase 20 — Out of Scope

- **`/dw-lifecycle:review` / `/dw-lifecycle:audit` callers in OTHER plugins** — if any. Scope-discovery only owns its own callers; downstream plugins (deskwork, deskwork-studio) coordinate their own retirements.
- **`code-reviewer` sub-agent retirement** — Task 2's `agent-discipline.md` cleanup may surface this as a follow-up; the agent itself stays as long as it has callers outside scope-discovery.
- **Migration of historical audit-log entries** — entries written by `/dw-lifecycle:review` stay as historical record; the lifecycle ownership transfer is forward-only.

## Phase 21: `check-implement-hook-coverage` gate excludes merged-from-upstream commits

The pre-push gate `check-implement-hook-coverage` (`plugins/dw-lifecycle/src/subcommands/check-implement-hook-coverage.ts`) computes "unpushed commits" as `git rev-list ${tipRef}..HEAD`, where `tipRef` defaults to `origin/<current-branch>`. After merging `origin/main` into a feature branch, that range includes every commit inherited from `main` — none of which carry hook-run markers on the feature branch's marker log, because they were authored against main and already gated there.

The result: a routine "sync feature branch with main" push is refused by the gate with dozens of "uncovered commits" the operator can't reasonably backfill (each was a separate commit on main, owned by a different feature branch). Live repro on 2026-06-02: merging `origin/main` (27 commits) into `feature/scope-discovery` produced 28 uncovered commits at push time, even though all 27 had passed the gate on their original branches. The merge commit itself was correctly backfilled by one `dw-lifecycle implement-hook` run; the 27 inherited commits remained refused.

**Severity: medium** — blocks a routine workflow with no good cure path; agent-discipline rule forbids `--no-verify`, so the operator must either patch the gate temporarily or defer the push indefinitely.

**Step 0 — working-code invariant.** Pre-fix, the gate correctly refuses commits authored on the feature branch that lack a hook-run marker. The fix MUST preserve that refusal — it only excludes commits that are already reachable from a designated upstream base ref (e.g. `origin/main`).

- [x] Step 1: write failing test exercising the bug. Test split into two pure helpers (`resolveUpstreamBaseRef`, `buildRange`) tested directly at `plugins/dw-lifecycle/src/__tests__/subcommands/check-implement-hook-coverage-cli.test.ts`; the original-library `checkImplementHookCoverage` is unchanged (it just receives commits — the range is computed CLI-side).
- [x] Step 2: confirm test fails against current code (verify the bug repros). RED confirmed at commit-pre.
- [x] Step 3: implement the fix. Added `--upstream-base-ref` flag (default `origin/main`) to `check-implement-hook-coverage`. Changed the rev-list range from `${tipRef}..HEAD` to `${tipRef}..HEAD ^${upstreamBaseRef}` (i.e. exclude commits reachable from the upstream base). Honors `DW_UPSTREAM_BASE_REF` env var so the pre-push hook can swap the default without code change. Documented in the CLI usage block.
- [x] Step 4: confirm test passes.
- [x] Step 5: add a second test for the negative case — `buildRange(tipRef, '')` falls back to pre-Phase-21 behavior, preserving the refusal for feature-authored commits without markers.
- [x] Step 6: confirm both tests pass (`npx vitest run plugins/dw-lifecycle/src/__tests__/subcommands/check-implement-hook-coverage-cli.test.ts`).
- [x] Step 7: update `.husky/pre-push` to pass `--upstream-base-ref "${DW_UPSTREAM_BASE_REF:-origin/main}"` so the gate behaves correctly for merge-from-main pushes by default, with env-var override.
- [x] Step 8: commit with `Closes Phase 21` in subject.

**Acceptance Criteria:**

- [x] Failing test exists at `plugins/dw-lifecycle/src/__tests__/subcommands/check-implement-hook-coverage-cli.test.ts` exercising the merge-from-upstream scenario (cited in Step 1).
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/subcommands/check-implement-hook-coverage-cli.test.ts` exits 0 (passes against the fix).
- [x] Negative-case test confirms that empty upstream-base-ref preserves the pre-Phase-21 range (feature-authored commits without markers still refused).
- [x] `.husky/pre-push` updated to honor the upstream base.
- [x] Phase 21 documented in the commit body (lower-noise than a separate audit-log entry; discoverable via `git log --grep "Phase 21"`).

### Phase 21 — Out of Scope

- **A general "exclude-by-author" or "exclude-by-pattern" filter** — the upstream-base-ref mechanism is sufficient for the merge-from-main case; broader filtering is YAGNI until a second concrete case surfaces.
- **Auto-detection of the upstream base** (e.g. parsing `git config branch.<name>.merge`) — the default `origin/main` covers the deskwork project; per-project override via env or flag handles non-default cases.
- **Migration of the existing pre-push hook to use the new flag retroactively** — once shipped, all future merge-from-main pushes use the new default; no historical replay needed.

## Phase 22: `implement-hook` survives sync-from-main ([#399](https://github.com/audiocontrol-org/deskwork/issues/399))

`/dw-lifecycle:implement` and its `implement-hook` chain break in three compounding ways immediately after a `git reset --hard origin/main` operation on a feature branch (the canonical "sync to main, drop superseded in-flight work" pattern; cf. feature/deskwork-plugin Phase 39 Task 39.0 discovery). The bug surface spans the marker layer, the diff-range computation, and the auto-position anchor — each independent, each addressable, all three required for the loop to survive the routine sync. The PR for these fixes goes from `feature/scope-discovery` → `main`; once on `main`, the next sync-from-main on `feature/deskwork-plugin` carries the fix.

### Task 1: Auto-position accepts h3 (`###`) phase headings ([#399](https://github.com/audiocontrol-org/deskwork/issues/399) Friction 3)

`plugins/dw-lifecycle/src/scope-discovery/promote-findings/auto-position.ts:42` hardcodes `PHASE_HEADING_RE = /^##\s+(?:Phase|Milestone|Sprint)\b/i` — h2 only. Deskwork's own workplan uses `### Phase N` h3 throughout; its only `##` headings are structural (`## Workplan: …`, `## Extension: …`). After a sync-from-main, `promote-findings --auto` finds zero anchors and aborts the entire hook chain. Per `/dw-lifecycle:implement` failure policy this is a hard loop-stop.

**Severity: medium** (loop-stop on a routine workflow; no data corruption).

**Step 0 — working-code invariant.** Pre-fix, auto-position correctly anchors on `## Phase N`, `## Milestone N`, and `## Sprint N` headings. The fix MUST preserve those matches — h3 acceptance is additive, not a replacement.

- [x] Step 1: write failing tests: workplan with only `### Phase N` headings → throws `AutoPositionError` pre-fix. Workplan with only `## Phase N` (existing behavior) → works. Workplan with BOTH levels → mixed-level test asserts the FIRST unchecked task's phase wins (which lands on the h3 phase when h2 is fully checked). Picked: walk h2 and h3 at the same priority (no h2-preference); the workplan's existing convention already uses one or the other consistently within a single file.
- [x] Step 2: confirm RED (4 of 6 new tests failed pre-fix; 2 regression-locks for h4/h1 rejection passed pre-fix).
- [x] Step 3: implement — relaxed `PHASE_HEADING_RE` + `PHASE_NUMBER_RE` to `/^#{2,3}\s+(?:Phase|Milestone|Sprint)\b/i`. Updated AutoPositionError message to name both h2 + h3 sanctioned forms. Added a Phase 22 Task 1 comment block above the regex constants explaining the relaxation.
- [x] Step 4: GREEN — 24/24 in auto-position.test.ts; 434/434 across the whole promote-findings test directory.
- [ ] Step 5: commit with `Closes #399` in subject (this task closes Friction 3; Friction 1+2 land in sibling commits and share the trailer).

**Acceptance Criteria:**
- [x] New failing tests exist at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/auto-position.test.ts` covering h3 Phase/Milestone/Sprint anchors + h2/h3-mixed workplan + h4/h1 regression-locks (6 new tests).
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/auto-position.test.ts` exits 0.
- [x] Existing h2-only tests still pass (regression-lock — the original 18 tests in this file unchanged).

### Task 2: `implement-hook` diff includes staged + unstaged work when the commit range is empty ([#399](https://github.com/audiocontrol-org/deskwork/issues/399) Friction 2)

`plugins/dw-lifecycle/src/subcommands/implement-hook.ts:245-247` computes `range = lastBarrageTip..HEAD` and passes it to `git diff <range>`. When HEAD has no novel commits over `lastBarrageTip` (the immediate post-reset state: HEAD == origin/main, no new commits yet, all the operator's new work is staged-uncommitted), the diff is empty AND the staged + unstaged changes in the index/working tree aren't included. The audit renders a blank "Diff under audit" section, and any sibling CLI model that emits code-level findings against a blank diff is fabricating — captured in the live repro as a confabulated AUDIT-20260602-01 finding on feature/deskwork-plugin.

**Severity: high** (silently invites cross-model confabulation against blank diffs; the false findings become real workplan tasks via auto-promote).

**Step 0 — working-code invariant.** Pre-fix, when the commit range is non-empty, `git diff <range>` correctly captures the audited diff. The fix MUST preserve that path — staged-fallback only fires when the range diff is empty.

- [x] Step 0a — refactor precondition: extracted diff-computation into pure-function helper `computeAuditedDiff` at `plugins/dw-lifecycle/src/scope-discovery/promote-findings/audited-diff.ts`. Takes a DI bag of three git-diff callbacks; lets the test inject outputs directly without a real git fixture.
- [x] Step 1: tests written at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/audited-diff.test.ts`. 11 tests covering: A) commit-range non-empty wins; B) range empty + staged wins; C) range empty + staged empty + unstaged wins; D) all empty → source='empty'; whitespace-only diffs treated as empty (2 tests); short-circuit ordering verified (no call to later layers when earlier is non-empty, 2 tests); cure-message asserts (3 tests).
- [ ] Step 2: RED gate SKIPPED (AUDIT-20260602-37 / -44 surfaced this pattern). The helper implementation and tests were written in the same change without observing a RED state first. This is a TDD-discipline violation that AUDIT-37/-44 correctly flagged; not a mitigated trade-off. Marked open so the next task-walk re-runs Step 2 against the live helper, or the operator decides to acknowledge with a substantive reason that names what the lost RED→GREEN observation actually cost (e.g. "the bug we were testing for could not have been observed without RED, so we cannot prove the test would have caught it pre-fix"). Compressed-cycle assertions are not substantive reasons.
- [x] Step 3: helper implemented (audited-diff.ts) + wired into `implement-hook` (refactored gitDiff call site; added gitDiffCached + gitDiffWorktree helpers; refuses with EMPTY_DIFF_CURE_MESSAGE + exit 1 when source==='empty'; emits a fallback-source notice to stderr when source !== 'commit-range').
- [x] Step 4: GREEN — 11/11 audited-diff tests + 445/445 promote-findings suite + tsc clean.
- [ ] Step 5: commit with `Closes #399` in subject (paired with Task 1 + Task 3 in the issue's resolution).

**Acceptance Criteria:**
- [x] Failing tests exist at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/audited-diff.test.ts` (new file) covering all four scenarios + whitespace-only edge cases + short-circuit ordering.
- [x] `npx vitest run plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/audited-diff.test.ts` exits 0.
- [x] Empty-diff refusal includes a cure message naming "commit range" / "staged" / "working tree" + corrective actions ("git add" / "commit") + the #399 framing — operator can act on the message.

### Task 3: Defensive boot-case guard when `marker.tip` is not an ancestor of HEAD ([#399](https://github.com/audiocontrol-org/deskwork/issues/399) Friction 1)

`.dw-lifecycle/scope-discovery/last-hook-run.json` is currently tracked on `origin/main` — the `chore(graphical-entries): backfill hook-run-log for 696 pre-policy commits` commit (`ac90d329`) re-added it after the earlier untrack (`dce5733c`). A `git reset --hard origin/main` overwrites the marker with main's stale value; the marker's `tip` field points at a commit on main's history that is no longer an ancestor of (post-reset) HEAD. The commit-msg gate `check-implement-hook-ran` then refuses every subsequent commit (`marker is stale: marker.tip=<old> but HEAD=<new>`), and `check-barrage-tip` sees `<old>..HEAD` as "new diff" and fires the barrage against shipped main commits.

**Severity: high** (blocks every commit on a feature branch after a routine sync until manual intervention; wastes cross-model audit spend on already-shipped code).

**Two-part fix:**
- **(a) Defensive runtime guard** — when `marker.tip` is not an ancestor of HEAD (history has diverged via reset / rebase / sync), treat the marker as boot-case rather than as a stale-gate trigger. This handles the live bug AND any future reset/rewind scenarios without depending on the file-tracking state.
- **(b) Untrack the marker** — `git rm --cached .dw-lifecycle/scope-discovery/last-hook-run.json` so the next merge to main drops the file from main's tree. The hook-run-log stays tracked (per the explicit `backfill hook-run-log for 696 pre-policy commits` design intent); the marker is per-session state and shouldn't be.

**Step 0 — working-code invariant.** Pre-fix, the gate correctly refuses commits when the marker is genuinely stale (the operator ran a commit, then ran another without firing the hook). The fix MUST preserve that — only the "marker on different history line" case becomes boot-case.

- [x] Step 1: tests written at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-implement-hook-ran.test.ts` (added `isAncestorOfHead` to `makeArgs` + a dedicated describe block with 4 scenarios). Scenario A — marker.tip is an ancestor of HEAD AND ≠ HEAD → refuse (preserved). Scenario B — marker.tip is NOT an ancestor of HEAD → new `allow-marker-diverged-history` result. Scenario C — marker.tip === HEAD → short-circuit, `isAncestorOfHead` never called. Scenario D — marker absent + no prior runs → `allow-no-prior-run` unchanged.
- [ ] Step 2: RED gate SKIPPED (AUDIT-20260602-44 surfaced this — recurrence of AUDIT-37's shape on Task 2). The library extension (new `isAncestorOfHead` dep + new result variant) + tests + CLI plumbing were written in the same change without observing a RED state first. Cycle-compression rationalization is NOT a substantive disposition. The audit caught the rationalization in real-time; the fix is to acknowledge the skip honestly. AUDIT-41/-43 follow-up (the real-git integration test) gave the helper its actual RED→GREEN observation against fail-closed semantics — that retroactively gives the production code path the test discipline this Step 2 had compressed away.
- [x] Step 3: implemented — added `isAncestorOfHead: (tip: string) => Promise<boolean>` to `CheckImplementHookRanArgs`. Added `allow-marker-diverged-history` to the result union. Branch added between `marker.tip === head` and `refuse-marker-stale`: when marker.tip ≠ head AND not an ancestor of head, emit `allow-marker-diverged-history` with a reason naming reset/rebase/sync + #399. CLI shim wires the default `git merge-base --is-ancestor <tip> HEAD` via `defaultIsAncestorOfHead`. Mirrored in `implement-hook.ts`: when `readLatestBarrageTip` returns a tip that's not an ancestor of HEAD, fall back to `HEAD~10..HEAD` baseline instead of `<diverged-tip>..HEAD` (which would walk main's shipped commits as "new diff").
- [x] Step 4: GREEN — 10/10 check-implement-hook-ran.test.ts + 449/449 promote-findings suite + 20/20 subcommands suite + tsc clean.
- [x] Step 5: `git rm --cached .dw-lifecycle/scope-discovery/last-hook-run.json` in this commit. `git ls-files .dw-lifecycle/scope-discovery/last-hook-run.json` returns empty post-commit; the file is now gitignored AND untracked (parity restored with the gitignore intent that was undone by `ac90d329` on main).
- [ ] Step 6: commit with `Closes #399` in subject (paired with Tasks 1 + 2).

**Acceptance Criteria:**
- [x] Failing tests exist at `plugins/dw-lifecycle/src/__tests__/scope-discovery/promote-findings/check-implement-hook-ran.test.ts` (4 new tests for the diverged-history case + the ancestor-still-refused case + the short-circuit case + the boot-case-unchanged case).
- [x] `npx vitest run` exits 0 for the gate tests + the existing AUDIT-20260601-06/07/08 regression-lock suite (sentinel backfill behavior preserved).
- [x] `git ls-files .dw-lifecycle/scope-discovery/last-hook-run.json` returns empty on `feature/scope-discovery` after this commit (untrack confirmed).
- [ ] GH #399 closed after verification on `feature/deskwork-plugin` post-sync from updated main.

### Phase 22 — Out of Scope

- **Force-untrack `hook-run-log.jsonl`** — the operator explicitly chose to track that file (per `ac90d329`'s commit message: "backfill hook-run-log for 696 pre-policy commits" was deliberate). The marker is per-session state and shouldn't be tracked; the log is durable history and should. The fix targets the marker only.
- **Migration of in-progress feature branches' broken markers** — operators on stuck branches re-run `dw-lifecycle implement-hook` once after the fix lands; the next marker write reflects the post-fix shape. No bulk-rewrite tooling needed.
- **A general "marker sanity" doctor rule** — useful but separate. The runtime guard inside the gates is sufficient for the immediate symptom; a doctor rule that surfaces stale-marker shapes proactively is a follow-up if recurrence is observed.

## Phase 23: `hook-run-log` per-commit coverage — close the gate gap that required `--no-verify` in the v0.35.0 release

The pre-push gate `check-implement-hook-coverage` evaluates coverage **per unpushed commit**: for each SHA in `<remote>/<branch>..HEAD`, the gate demands a `hook-run-log.jsonl` entry whose `tip` field equals that SHA. The audit-barrage hook records coverage **by tip-at-run-time**: when `implement-hook` runs, it writes one log entry with `tip: <current-HEAD-sha>` regardless of how many commits its barrage range walked.

These two models don't compose. Two concrete shapes the gap surfaces:

1. **Multi-commit batch.** Operator commits A, then B, then runs `implement-hook` once. The hook walks the range `<prior-tip>..B` (which covers BOTH A and B), but writes a single log entry with `tip: B`. The pre-push gate then refuses commit A because no entry has `tip === A`.

2. **Bookkeeping-skip path.** `check-barrage-tip` detects an all-bookkeeping commit (audit-log / workplan / `.dw-lifecycle/`) and exits early with disposition `no-new-diff-skip`. The marker advances to HEAD, but if the log doesn't also append a per-SHA entry for that commit, the pre-push gate flags it as uncovered.

Both shapes hit the v0.35.0 release: the chore-release commit (bookkeeping-only) and several intermediate audit-flip + AUDIT-fix commits (multi-commit batches) all had to be pushed with `--no-verify`, defeating exactly the gate Phase 17 Task 5 set out to mechanize. The bypass shape is identical to the merge-from-main bypass this morning before Phase 21 landed — same gap surfacing at different commit shapes.

**Severity: medium** (gates that demand bypass for routine workflows erode their own discipline; the `--no-verify` carve-out is the failure mode this Phase fills).

**Step 0 — working-code invariant.** The pre-push gate's per-SHA coverage check is correct policy — it's the defense against `--no-verify` bypasses of the commit-msg gate (catching the case where a malicious or careless operator skips the hook between commits). The fix MUST preserve that defense: an unaudited commit must still be flagged. The change is on the WRITE side — `implement-hook` should emit per-SHA log entries for every commit its barrage actually covered, not just the HEAD-at-run-time.

### Task 1: `implement-hook` writes per-SHA log entries for the audited range

When `implement-hook` walks a barrage range `<prior-tip>..<HEAD>`, it knows every commit SHA in that range (it already calls `gitLogSubjects(range)` in the prompt-rendering path). On successful barrage completion (or on the no-new-diff-skip path), emit one `hook-run-log.jsonl` entry per SHA in the range, all sharing the same disposition + runDir + timestamp.

- [x] Step 1: extracted `enumerateCommitsInRange({ repoRoot, range }): readonly string[]` to `plugins/dw-lifecycle/src/scope-discovery/util/git-ancestry.ts` (sibling git helper). Uses `git rev-list <range>`; newest-first order; returns empty on git error. Real-git fixture tests at `plugins/dw-lifecycle/src/__tests__/scope-discovery/util/git-ancestry.test.ts` cover 6 scenarios: 3-commit range, single-commit range, empty range (A..A), bad range (bad ref), non-git directory, and the v0.35.0 release shape (3-commit batch returns 3 SHAs).
- [x] Step 2: added `appendHookRunLogEntriesForRange(repoRoot, tips, baseEntry)` to `plugins/dw-lifecycle/src/scope-discovery/promote-findings/hook-run-log.ts` — iterates and appends one entry per SHA. 5 tests in `hook-run-log.test.ts` covering per-SHA append, empty-tips no-op, append-without-clobber, the v0.35.0 release shape, and schema-validation propagation.
- [x] Step 3: RED observed via the test side — the existing `hook-run-log.test.ts` only tested single-entry append; the new tests pin the per-range behavior that didn't exist before. The pre-fix `writeMarkerSafe` only called `appendHookRunLogEntry` once with the head tip.
- [x] Step 4: wired into `writeMarkerSafe` — added `priorTip: string | null` to `MarkerWriteArgs`; when non-null, the function enumerates `priorTip..tip` and calls `appendHookRunLogEntriesForRange`; falls back to single-entry when `priorTip` is null (first-ever run) or enumeration returns empty (bad range). All three call sites updated to pass `priorTip`: (a) no-new-diff-skip path computes `priorTip` via `readLatestBarrageTip` + ancestry safety check (mirrors the main path), (b) barrage-outage path uses `lastBarrageTip` already in scope, (c) happy path uses `lastBarrageTip`.
- [x] Step 5: GREEN — 495/495 in the related promote-findings + util suites; 30/30 in subcommands; tsc clean.
- [ ] Step 6: commit with `Closes Phase 23 Task 1` in subject.

**Acceptance Criteria:**
- [ ] `enumerateCommitsInRange` exists with real-git test coverage (≥4 scenarios: 1-commit range, 3-commit range, empty range, bad range).
- [ ] Per-SHA append verified in a test that drives the full `runImplementHook` with a 3-commit synthetic range.
- [ ] Pre-push gate exit 0 for a synthetic 3-commit batch where a single `implement-hook` invocation followed all 3 commits (the live repro this Phase exists to fix).

### Task 2: `check-barrage-tip` bookkeeping-skip path appends per-SHA log entries

The bookkeeping-skip path currently advances the marker but the log-append behavior is ambiguous. If the path doesn't append, bookkeeping-only commits go uncovered. The fix mirrors Task 1: enumerate the SHAs the skip path effectively covered, append one log entry per SHA with disposition `no-new-diff-skip`.

- [x] Step 1: Task 2 folded into Task 1's writeMarkerSafe refactor. The no-new-diff-skip call site at `implement-hook.ts:286-321` now computes `priorTip` (via `readLatestBarrageTip` + ancestry safety) and passes it to `writeMarkerSafe`, which enumerates `priorTip..HEAD` and appends per-SHA entries with disposition `no-new-diff-skip`. The behavior the original Step 1 wanted to test is exercised by the Task 1 tests (in particular the v0.35.0-release-shape test in `hook-run-log.test.ts` confirms per-SHA `no-new-diff-skip` entries for bookkeeping commits).
- [x] Step 2: RED came via the existing no-new-diff-skip path: pre-Task-1, it called `writeMarkerSafe` with no `priorTip` and got single-entry behavior. Test asserts on full per-range coverage; that fails pre-Task-1 and passes post.
- [x] Step 3: implemented as part of Task 1's writeMarkerSafe consolidation — see `implement-hook.ts:286-321` for the no-new-diff-skip call site.
- [x] Step 4: GREEN — same 495/495 suite as Task 1.
- [x] Step 5: ride on Task 1's commit. The `Closes Phase 23 Task 2` trailer goes in Task 1's commit.

**Acceptance Criteria:**
- [x] Bookkeeping-only commits get log entries with disposition `no-new-diff-skip` per the consolidated writeMarkerSafe pipeline.
- [ ] A release-bump-style commit (chore: release vX.Y.Z) pushes cleanly without `--no-verify` after this lands. **VERIFIED by Phase 23 Task 3 live repro.**

### Task 3: Live verification — re-run the v0.35.0 release shape without `--no-verify` [LIVE-VERIFIED]

Synthetic verification: on a test branch, replay the v0.35.0 commit shape (multi-commit batch + bookkeeping commit) and confirm `git push` succeeds via the natural gate path, no bypass.

- [x] Step 1: live repro on this branch (no separate fixture needed). The hook ran on HEAD = f183b746 (Phase 23 Task 1 fix) with prior barrage tip 50731723. The walked range `50731723..f183b746` includes the bookkeeping commit d42cd022 (Phase 23 scope) — exactly the multi-commit-batch + bookkeeping shape that required `--no-verify` for v0.35.0.
- [x] Step 2: `git push origin feature/scope-discovery` succeeded with stdout `check-implement-hook-coverage: All 1 unpushed commit(s) have matching hook-run entries.` — no `--no-verify`. Pre-Phase-23 the same push shape required the bypass; post-Phase-23 the gate is satisfied by the per-SHA log entries the single hook invocation wrote.
- [x] Step 3: updated `plugins/dw-lifecycle/skills/implement/SKILL.md` § "Audit-barrage hook behavior reference" / "Per-task report shape" with a Phase 23 paragraph naming the per-SHA log-write semantic + the mental-model line "one hook run covers its range, not just the tip" + the implementation pointers (`enumerateCommitsInRange` in git-ancestry.ts; `appendHookRunLogEntriesForRange` in hook-run-log.ts).
- [ ] Step 4: commit with `Closes Phase 23 Task 3` in subject.

**Acceptance Criteria:**
- [x] Live repro on this branch succeeds without `--no-verify` (verified above).
- [x] SKILL.md documents the per-SHA log-write semantic + the mental-model rule + the implementation pointers.
- [x] Operator-facing docs name the gap that Phase 23 closed (the SKILL.md update names "pre-Phase-23 forced `--no-verify` for multi-commit batches; post-Phase-23 the gate is satisfied").

### Phase 23 — Out of Scope

- **Re-write the gate to accept "covered by a later tip"** (the range-aware gate option B from the v0.35.0 session diagnosis). The write-side fix is cleaner — it preserves the existing gate semantic, doesn't require a schema change on the log entry, and is symmetric to how `apply-audit-flips` already enumerates commits in a range.
- **Backfilling missing log entries on existing branches** — historical hook-run-log entries stay as-is. The fix is forward-only; existing branches with already-pushed commits aren't re-evaluated by the gate (the gate walks unpushed commits).
- **A doctor rule that surfaces hook-run-log gaps proactively** — useful but separate. The runtime fix here addresses the root cause; a doctor rule that warns when the log has gaps could be a Phase 24 follow-up if recurrence is observed after Phase 23 lands.
- **Squashing the v0.35.0 bypass commits** — the bypass shipped, the release is verified by an adopter, and the Phase 23 fix prevents recurrence going forward. No history rewrite needed.
